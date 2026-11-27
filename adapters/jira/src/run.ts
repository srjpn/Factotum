import { FactoAdapter, type AdapterOptions } from '@facto/adapter-sdk';
import type { AdapterHealthReport, AdapterManifest } from '@facto/contracts';
import type { JiraConfig } from './config.js';
import { redactingLogger } from './redact.js';
import { JiraSyncer } from './syncer.js';
import { JiraClient } from './jira.js';
import { transitionIssue } from './actions.js';

export const MANIFEST: AdapterManifest = {
  name: 'jira',
  version: '0.2.0',
  domain: 'workflows',
  tier: 'control',
  reports: ['task'],
  actions: [
    {
      name: 'transition-issue',
      description: 'Move an issue in a configured project to another workflow status through its transitions. Transition it back to undo.',
      permission: 'jira.transition',
      risk: 'reversible',
    },
  ],
  health: '/healthz', // required by the manifest schema; this adapter has no HTTP server, it pushes health
};

export interface JiraAdapterOverrides {
  log?: (m: string) => void;
  sdk?: Partial<AdapterOptions>;
  onFatal?: (err: Error) => void;
}

/** Wires the SDK, the Jira client and the sync loop. Writes to Jira only through the declared `transition-issue` action, when the core queues one (LT-13). */
export function createJiraAdapter(config: JiraConfig, overrides: JiraAdapterOverrides = {}) {
  const jira = new JiraClient({ baseUrl: config.baseUrl, email: config.email, apiToken: config.apiToken });
  const log =
    overrides.log ??
    redactingLogger([config.apiToken, config.email, jira.secretHeaderValue, config.adminToken ?? ''].filter(Boolean));
  const stop = new AbortController();

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

  const syncer: JiraSyncer = new JiraSyncer({
    jira,
    baseUrl: config.baseUrl,
    projectKeys: config.projectKeys,
    jqlExtra: config.jqlExtra,
    push: (items): Promise<unknown> => adapter.syncInventory('task', items),
    log,
  });

  adapter.onAction('transition-issue', (params) => transitionIssue(jira, config.projectKeys, params));

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
