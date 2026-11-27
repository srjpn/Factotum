import { FactoAdapter, type AdapterOptions } from '@facto/adapter-sdk';
import type { AdapterHealthReport, AdapterManifest } from '@facto/contracts';
import type { PaniConfig } from './config.js';
import { redactingLogger } from './redact.js';
import { PaniSyncer } from './syncer.js';
import { nodeCli, startJob, stopJob, type PaniCli } from './actions.js';

export const MANIFEST: AdapterManifest = {
  name: 'pani',
  version: '0.2.0',
  domain: 'workflows',
  tier: 'control',
  reports: ['run'],
  actions: [
    {
      name: 'start-job',
      description: 'Start the Pani runner for an already queued job (runs every queued job). Stop the job to undo.',
      permission: 'pani.start',
      risk: 'reversible',
    },
    {
      name: 'stop-job',
      description: 'Cancel a queued job, or ask a running job to stop at its next check.',
      permission: 'pani.stop',
      risk: 'reversible',
    },
  ],
  health: '/healthz', // required by the manifest schema; this adapter has no HTTP server, it pushes health
};

export interface PaniAdapterOverrides {
  log?: (m: string) => void;
  sdk?: Partial<AdapterOptions>;
  onFatal?: (err: Error) => void;
  /** Replaces the Pani CLI runner (tests). */
  cli?: PaniCli;
}

/** Wires the SDK and the sync loop. Reads job files; the only writes are the declared `start-job` and `stop-job` actions, done through Pani's own CLI (LT-13). */
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

  const deps = { stateDir: config.stateDir, cli: overrides.cli ?? (config.cliPath ? nodeCli(config.cliPath) : undefined) };
  adapter.onAction('start-job', (params) => startJob(deps, params));
  adapter.onAction('stop-job', (params) => stopJob(deps, params));

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
