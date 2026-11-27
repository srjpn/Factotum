import { FactoAdapter, type AdapterOptions } from '@facto/adapter-sdk';
import type { AdapterHealthReport, AdapterManifest } from '@facto/contracts';
import type { TrelloConfig } from './config.js';
import { redactingLogger } from './redact.js';
import { buildStatusMap } from './status.js';
import { TrelloSyncer } from './syncer.js';
import { TrelloClient } from './trello.js';

export const MANIFEST: AdapterManifest = {
  name: 'trello',
  version: '0.1.0',
  domain: 'workflows',
  tier: 'observe',
  reports: ['task'],
  health: '/healthz', // required by the manifest schema; this adapter has no HTTP server, it pushes health
};

export interface TrelloAdapterOverrides {
  log?: (m: string) => void;
  sdk?: Partial<AdapterOptions>;
  onFatal?: (err: Error) => void;
}

/** Wires the SDK, the Trello client and the sync loop. Read-only: nothing is ever written to Trello. */
export function createTrelloAdapter(config: TrelloConfig, overrides: TrelloAdapterOverrides = {}) {
  const log = overrides.log ?? redactingLogger([config.apiKey, config.token, config.adminToken ?? ''].filter(Boolean));
  const trello = new TrelloClient({ base: config.trelloBase, apiKey: config.apiKey, token: config.token });
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

  const syncer: TrelloSyncer = new TrelloSyncer({
    trello,
    boardIds: config.boardIds,
    statusMap: buildStatusMap(config.listStatusMap),
    push: (items): Promise<unknown> => adapter.syncInventory('task', items),
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
