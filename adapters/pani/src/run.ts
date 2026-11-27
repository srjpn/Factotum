import { FactoAdapter, type AdapterOptions } from '@facto/adapter-sdk';
import type { AdapterHealthReport, AdapterManifest } from '@facto/contracts';
import type { PaniConfig } from './config.js';
import { redactingLogger } from './redact.js';
import { PaniSyncer } from './syncer.js';

export const MANIFEST: AdapterManifest = {
  name: 'pani',
  version: '0.1.0',
  domain: 'workflows',
  tier: 'observe',
  reports: ['run'],
  health: '/healthz', // required by the manifest schema; this adapter has no HTTP server, it pushes health
};

export interface PaniAdapterOverrides {
  log?: (m: string) => void;
  sdk?: Partial<AdapterOptions>;
  onFatal?: (err: Error) => void;
}

/** Wires the SDK and the sync loop. Read-only: nothing is ever written to Pani's directories. */
export function createPaniAdapter(config: PaniConfig, overrides: PaniAdapterOverrides = {}) {
  const log = overrides.log ?? redactingLogger([config.adminToken ?? ''].filter(Boolean));
  const stop = new AbortController();

  const adapter: FactoAdapter = new FactoAdapter({
    apiUrl: config.apiUrl,
    manifest: MANIFEST,
    stateFile: config.stateFile,
    adminToken: config.adminToken,
    privacyClass: 'client-data', // Pani works on client repositories
    log,
    onFatal: (err) => {
      stop.abort();
      overrides.onFatal?.(err);
    },
    healthCheck: (): AdapterHealthReport => syncer.healthCheck(),
    ...overrides.sdk,
  });

  const syncer: PaniSyncer = new PaniSyncer({
    stateDir: config.stateDir,
    maxJobs: config.maxJobs,
    push: (items): Promise<unknown> => adapter.syncInventory('run', items),
    log,
  });

  let loop: Promise<void> | undefined;
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      stop.signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
    });

  return {
    async start(): Promise<void> {
      await adapter.start();
      loop = (async () => {
        while (!stop.signal.aborted) {
          try {
            await syncer.runOnce();
          } catch (err) {
            log(`sync failed: ${(err as Error).message}`);
          }
          await wait(config.syncIntervalMs);
        }
      })();
    },
    async stop(): Promise<void> {
      stop.abort();
      await adapter.stop();
      await loop;
    },
    adapter,
    syncer,
  };
}
