import { FactoAdapter, type AdapterOptions } from '@facto/adapter-sdk';
import type { AdapterHealthReport, AdapterManifest } from '@facto/contracts';
import type { TimeMachineConfig } from './config.js';
import { run } from './exec.js';
import { redactingLogger } from './redact.js';
import { TimeMachineSyncer } from './syncer.js';

export const MANIFEST: AdapterManifest = {
  name: 'timemachine',
  version: '0.1.0',
  domain: 'data',
  tier: 'observe',
  reports: ['backup'],
  health: '/healthz', // required by the manifest schema; this adapter has no HTTP server, it pushes health
};

export interface TimeMachineOverrides {
  log?: (m: string) => void;
  sdk?: Partial<AdapterOptions>;
  onFatal?: (err: Error) => void;
  runner?: typeof run;
}

/** Wires the SDK, tmutil and the sync loop. Read-only: only `tmutil status|destinationinfo|latestbackup` are ever run. */
export function createTimeMachineAdapter(config: TimeMachineConfig, overrides: TimeMachineOverrides = {}) {
  const log = overrides.log ?? redactingLogger([config.adminToken ?? ''].filter(Boolean));
  const stop = new AbortController();

  const adapter: FactoAdapter = new FactoAdapter({
    apiUrl: config.apiUrl,
    manifest: MANIFEST,
    stateFile: config.stateFile,
    adminToken: config.adminToken,
    privacyClass: 'personal',
    log,
    onFatal: (err) => {
      stop.abort();
      overrides.onFatal?.(err);
    },
    healthCheck: (): AdapterHealthReport => syncer.healthCheck(),
    ...overrides.sdk,
  });

  const syncer: TimeMachineSyncer = new TimeMachineSyncer({
    runner: overrides.runner ?? run,
    push: (items): Promise<unknown> => adapter.syncInventory('backup', items),
    log,
    staleAfterMs: config.staleAfterMs,
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
