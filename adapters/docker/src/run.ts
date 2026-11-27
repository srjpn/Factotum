import { FactoAdapter, type AdapterOptions } from '@facto/adapter-sdk';
import type { AdapterHealthReport, AdapterManifest } from '@facto/contracts';
import type { DockerConfig } from './config.js';
import { DockerClient } from './docker.js';
import { redactingLogger } from './redact.js';
import { DockerSyncer } from './syncer.js';

export const MANIFEST: AdapterManifest = {
  name: 'docker',
  version: '0.1.0',
  domain: 'hosting',
  tier: 'observe',
  reports: ['container'],
  health: '/healthz', // required by the manifest schema; this adapter has no HTTP server, it pushes health
};

export interface DockerAdapterOverrides {
  log?: (m: string) => void;
  sdk?: Partial<AdapterOptions>;
  onFatal?: (err: Error) => void;
}

/**
 * Wires the SDK, the Docker client and the sync loop. Read-only: nothing is ever written to Docker.
 * Runs as a host process; the Docker socket is never mounted into a container (CLAUDE.md).
 */
export function createDockerAdapter(config: DockerConfig, overrides: DockerAdapterOverrides = {}) {
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

  const syncer: DockerSyncer = new DockerSyncer({
    docker: new DockerClient(config.socketPath),
    push: (items): Promise<unknown> => adapter.syncInventory('container', items),
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
