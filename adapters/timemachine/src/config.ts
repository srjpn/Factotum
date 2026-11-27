import { z } from 'zod';

const EnvSchema = z.object({
  FACTO_API_URL: z.string().url(),
  TIMEMACHINE_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),
  TIMEMACHINE_STALE_HOURS: z.coerce.number().min(1).default(48),
  FACTO_ADAPTER_STATE_FILE: z.string().min(1).default('./timemachine-adapter.state.json'),
  FACTO_ADMIN_TOKEN: z.string().optional(),
});

export interface TimeMachineConfig {
  apiUrl: string;
  syncIntervalMs: number;
  staleAfterMs: number;
  stateFile: string;
  adminToken?: string;
}

/** Reads settings from the environment only. */
export function loadConfig(env: Record<string, string | undefined> = process.env): TimeMachineConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const e = parsed.data;
  return {
    apiUrl: e.FACTO_API_URL,
    syncIntervalMs: e.TIMEMACHINE_SYNC_INTERVAL_SECONDS * 1000,
    staleAfterMs: e.TIMEMACHINE_STALE_HOURS * 3_600_000,
    stateFile: e.FACTO_ADAPTER_STATE_FILE,
    adminToken: e.FACTO_ADMIN_TOKEN,
  };
}
