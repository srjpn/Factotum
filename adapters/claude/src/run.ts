import { FactoAdapter, type AdapterOptions } from '@facto/adapter-sdk';
import type { AdapterHealthReport, AdapterManifest } from '@facto/contracts';
import type { ClaudeConfig } from './config.js';
import { loadPricing } from './pricing.js';
import { TranscriptCache } from './scan.js';
import { ClaudeSyncer } from './syncer.js';

export const MANIFEST: AdapterManifest = {
  name: 'claude',
  version: '0.1.0',
  domain: 'ai',
  tier: 'observe',
  reports: ['claude-session', 'claude-usage'],
  health: '/healthz', // required by the manifest schema; this adapter has no HTTP server, it pushes health
};

export interface ClaudeAdapterOverrides {
  log?: (m: string) => void;
  sdk?: Partial<AdapterOptions>;
  onFatal?: (err: Error) => void;
}

const redactingLogger = (secrets: string[]) => (m: string) => console.log(secrets.filter((s) => s.length >= 4).reduce((a, s) => a.split(s).join('***'), m));

/**
 * Wires the SDK, the transcript reader and the sync loop. Read-only: it reads Claude Code transcripts and
 * writes only its own state file. Privacy class is `client-data` because project names can reveal clients.
 */
export function createClaudeAdapter(config: ClaudeConfig, overrides: ClaudeAdapterOverrides = {}) {
  const log = overrides.log ?? redactingLogger([config.adminToken ?? '']);
  const stop = new AbortController();
  const pricing = loadPricing(config.pricingFile);
  const cache = new TranscriptCache();

  const adapter: FactoAdapter = new FactoAdapter({
    apiUrl: config.apiUrl,
    manifest: MANIFEST,
    stateFile: config.stateFile,
    adminToken: config.adminToken,
    privacyClass: 'client-data',
    log,
    onFatal: (err) => {
      stop.abort();
      overrides.onFatal?.(err);
    },
    healthCheck: (): AdapterHealthReport => syncer.healthCheck(),
    ...overrides.sdk,
  });

  const syncer: ClaudeSyncer = new ClaudeSyncer({
    refresh: (now) => cache.refresh(config.projectsDir, now),
    options: { activeWindowMs: config.activeWindowMs, hideProjectNames: config.hideProjectNames, pricing },
    pushSessions: (items) => adapter.syncInventory('claude-session', items),
    pushUsage: (items) => adapter.syncInventory('claude-usage', items),
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
    cache,
  };
}
