import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  FACTO_API_URL: z.string().url(),
  PANI_STATE_DIR: z.string().min(1).optional(),
  PANI_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),
  PANI_MAX_JOBS: z.coerce.number().int().min(1).max(2000).default(200),
  FACTO_ADAPTER_STATE_FILE: z.string().min(1).default('./pani-adapter.state.json'),
  FACTO_ADMIN_TOKEN: z.string().optional(),
});

export interface PaniConfig {
  apiUrl: string;
  /** Directory that contains `jobs/`. Read only. */
  stateDir: string;
  syncIntervalMs: number;
  maxJobs: number;
  stateFile: string;
  adminToken?: string;
}

/** Same default location as Pani itself. Pani's own CLI does not read PANI_STATE_DIR; this adapter does. */
export const defaultStateDir = (): string => join(homedir(), '.config', 'openhands-orchestrator');

/** Reads settings from the environment only. Error messages name the setting, never its value. */
export function loadConfig(env: Record<string, string | undefined> = process.env): PaniConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const e = parsed.data;
  return {
    apiUrl: e.FACTO_API_URL,
    stateDir: e.PANI_STATE_DIR ?? defaultStateDir(),
    syncIntervalMs: e.PANI_SYNC_INTERVAL_SECONDS * 1000,
    maxJobs: e.PANI_MAX_JOBS,
    stateFile: e.FACTO_ADAPTER_STATE_FILE,
    adminToken: e.FACTO_ADMIN_TOKEN,
  };
}
