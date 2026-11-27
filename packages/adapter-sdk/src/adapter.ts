import { z } from 'zod';
import {
  AdapterRegistrationSchema,
  InventorySyncResultSchema,
  validateManifest,
  type AdapterManifest,
  type AdapterHealthReport,
  type InventorySyncResult,
  type PrivacyClass,
} from '@facto/contracts';
import { backoffDelay, DEFAULT_BACKOFF, type BackoffOptions } from './backoff.js';
import { ApiError, AuthError } from './errors.js';
import { loadToken, saveToken } from './state.js';

export interface AdapterOptions {
  /** Base URL of the Factotum API. There is no default. */
  apiUrl: string;
  manifest: AdapterManifest;
  /** File that keeps the service token (mode 0600). */
  stateFile: string;
  /** Owner token, needed for first registration only. Defaults to FACTO_ADMIN_TOKEN. */
  adminToken?: string;
  /** Default privacy class for inventory snapshots (`personal` or `client-data`). */
  privacyClass?: PrivacyClass;
  /** Called on every health interval. A throw is reported as `down`. */
  healthCheck?: () => Promise<AdapterHealthReport> | AdapterHealthReport;
  healthIntervalMs?: number;
  backoff?: BackoffOptions;
  /** Attempts per sync before giving up (default 5). */
  maxAttempts?: number;
  /** Called once if the core rejects the token and the adapter stops itself. */
  onFatal?: (err: Error) => void;
  log?: (message: string) => void;
  fetch?: typeof fetch;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

/**
 * One adapter's connection to the core: registers once, reports health, pushes inventory.
 * Tokens are never logged.
 */
export class FactoAdapter {
  private token: string | undefined;
  private readonly abort = new AbortController();
  private loop: Promise<void> | undefined;
  private readonly doFetch: typeof fetch;
  private readonly backoff: BackoffOptions;
  private readonly log: (m: string) => void;

  constructor(private readonly opts: AdapterOptions) {
    const result = validateManifest(opts.manifest);
    if (!result.ok) throw new Error(`invalid adapter manifest: ${result.errors.join('; ')}`);
    this.doFetch = opts.fetch ?? fetch;
    this.backoff = opts.backoff ?? DEFAULT_BACKOFF;
    this.log = opts.log ?? ((m) => console.log(`[${opts.manifest.name}] ${m}`));
  }

  /** Registers if no token is stored, then starts reporting health in the background. */
  async start(): Promise<void> {
    this.token = await loadToken(this.opts.stateFile);
    if (this.token) {
      this.log('using stored service token');
    } else {
      const admin = this.opts.adminToken ?? process.env['FACTO_ADMIN_TOKEN'];
      if (!admin) throw new Error('no stored token: set FACTO_ADMIN_TOKEN (or adminToken) for first registration');
      const reg = await this.request('POST', '/adapters/register', this.opts.manifest, admin, AdapterRegistrationSchema);
      this.token = reg.token;
      await saveToken(this.opts.stateFile, reg.token);
      this.log('registered; service token stored');
    }
    this.loop = this.healthLoop();
  }

  /** Replaces the core's snapshot of `kind` for this adapter. Retries transient failures with backoff. */
  async syncInventory(kind: string, items: unknown[], opts: { privacyClass?: PrivacyClass } = {}): Promise<InventorySyncResult> {
    const privacyClass = opts.privacyClass ?? this.opts.privacyClass;
    if (!privacyClass) throw new Error('privacyClass is required (pass it here or in the adapter options)');
    return this.request('PUT', `/adapters/inventory/${encodeURIComponent(kind)}`, { privacyClass, items }, this.requireToken(), InventorySyncResultSchema, this.opts.maxAttempts ?? 5);
  }

  /** Stops the health loop and cancels waiting retries. */
  async stop(): Promise<void> {
    this.abort.abort();
    await this.loop;
  }

  private requireToken(): string {
    if (!this.token) throw new Error('adapter not started');
    return this.token;
  }

  private async healthLoop(): Promise<void> {
    const interval = this.opts.healthIntervalMs ?? 30_000;
    let failures = 0;
    while (!this.abort.signal.aborted) {
      try {
        let report: AdapterHealthReport = { status: 'up' };
        if (this.opts.healthCheck) {
          try {
            report = await this.opts.healthCheck();
          } catch (err) {
            report = { status: 'down', detail: (err as Error).message.slice(0, 500) };
          }
        }
        await this.request('POST', '/adapters/health', report, this.requireToken(), z.unknown(), 1);
        failures = 0;
      } catch (err) {
        if (err instanceof AuthError) {
          this.log(err.message);
          this.abort.abort();
          (this.opts.onFatal ?? (() => undefined))(err);
          return;
        }
        failures++;
        this.log(`health report failed: ${(err as Error).message}`);
      }
      await sleep(failures ? backoffDelay(failures, this.backoff) : interval, this.abort.signal);
    }
  }

  /** One HTTP call; retries network errors, 429 and 5xx up to `attempts` times. 401 stops at once. */
  private async request<S extends z.ZodTypeAny>(
    method: string,
    path: string,
    body: unknown,
    token: string,
    schema: S,
    attempts = 3,
  ): Promise<z.output<S>> {
    let lastError: Error = new Error('request failed');
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(backoffDelay(attempt, this.backoff), this.abort.signal);
      if (this.abort.signal.aborted && attempt > 0) break;
      let res: Response;
      try {
        res = await this.doFetch(new URL(path, this.opts.apiUrl), {
          method,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          signal: this.abort.signal,
        });
      } catch (err) {
        lastError = new Error(`${method} ${path}: ${(err as Error).message}`);
        continue;
      }
      if (res.status === 401) throw new AuthError();
      if (res.ok) return schema.parse(await res.json());
      const text = (await res.text().catch(() => '')).slice(0, 500);
      lastError = new ApiError(res.status, `${method} ${path} -> ${res.status} ${text}`);
      if (res.status !== 429 && res.status < 500) throw lastError;
    }
    throw lastError;
  }
}

/** Stops the adapter cleanly on SIGINT or SIGTERM, then exits. Returns a function that removes the handlers. */
export function stopOnSignals(adapter: FactoAdapter): () => void {
  const handler = () => void adapter.stop().finally(() => process.exit(0));
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);
  return () => {
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
  };
}
