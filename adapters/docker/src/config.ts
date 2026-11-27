import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  FACTO_API_URL: z.string().url(),
  DOCKER_HOST: z.string().min(1).optional(),
  DOCKER_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),
  FACTO_ADAPTER_STATE_FILE: z.string().min(1).default('./docker-adapter.state.json'),
  FACTO_ADMIN_TOKEN: z.string().optional(),
});

export interface DockerConfig {
  apiUrl: string;
  socketPath: string;
  syncIntervalMs: number;
  stateFile: string;
  adminToken?: string;
}

/** Candidate sockets when DOCKER_HOST is unset: the standard path, then Rancher Desktop, then Docker Desktop. */
export function defaultSocketPath(exists: (p: string) => boolean = existsSync, home: string = homedir()): string {
  const candidates = ['/var/run/docker.sock', join(home, '.rd', 'docker.sock'), join(home, '.docker', 'run', 'docker.sock')];
  return candidates.find(exists) ?? candidates[0]!;
}

/** Only unix sockets are supported: `unix:///path/to/docker.sock` or a bare absolute path. */
export function socketFromDockerHost(value: string): string {
  if (value.startsWith('unix://')) return value.slice('unix://'.length);
  if (value.startsWith('/')) return value;
  throw new Error('invalid configuration: DOCKER_HOST must be a unix socket (unix:///path/to/docker.sock); TCP hosts are not supported');
}

/** Reads settings from the environment only. */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  exists: (p: string) => boolean = existsSync,
): DockerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const e = parsed.data;
  return {
    apiUrl: e.FACTO_API_URL,
    socketPath: e.DOCKER_HOST ? socketFromDockerHost(e.DOCKER_HOST) : defaultSocketPath(exists),
    syncIntervalMs: e.DOCKER_SYNC_INTERVAL_SECONDS * 1000,
    stateFile: e.FACTO_ADAPTER_STATE_FILE,
    adminToken: e.FACTO_ADMIN_TOKEN,
  };
}
