import { FactoAdapter, type AdapterOptions } from '@facto/adapter-sdk';
import type { AdapterHealthReport, AdapterManifest } from '@facto/contracts';
import type { TrelloConfig } from './config.js';
import { redactingLogger } from './redact.js';
import { buildStatusMap } from './status.js';
import { TrelloSyncer } from './syncer.js';
import { TrelloClient } from './trello.js';
import { moveCard } from './actions.js';

export const MANIFEST: AdapterManifest = {
  name: 'trello',
  version: '0.2.0',
  domain: 'workflows',
  tier: 'control',
  reports: ['task'],
  actions: [
    {
      name: 'move-card',
      description: 'Move a card to another list on the same configured board. Move it back to undo.',
      permission: 'trello.move-card',
      risk: 'reversible',
    },
  ],
  health: '/healthz', // required by the manifest schema; this adapter has no HTTP server, it pushes health
};

export interface TrelloAdapterOverrides {
  log?: (m: string) => void;
  sdk?: Partial<AdapterOptions>;
  onFatal?: (err: Error) => void;
}

/** Wires the SDK, the Trello client and the sync loop. Writes to Trello only through the declared `move-card` action, when the core queues one (LT-13). */
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

  adapter.onAction('move-card', (params) => moveCard(trello, config.boardIds, params));

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
