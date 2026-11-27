import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const ConfigSchema = z.object({
  FACTO_API_URL: z.string().url(),
  FACTO_ENROLMENT_TOKEN: z.string().min(1).optional(),
  FACTO_AGENT_STATE_FILE: z.string().min(1).optional(),
  FACTO_HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().positive().default(30),
});

export type AgentConfig = {
  apiUrl: string;
  enrolmentToken?: string;
  stateFile: string;
  heartbeatIntervalMs: number;
};

export function defaultStateFile(home: string = homedir()): string {
  return join(home, '.config', 'facto', 'agent.json');
}

// The control plane address is always configured, never assumed to be localhost,
// so the control plane can move to another machine without a code change.
export function loadConfig(env: Record<string, string | undefined> = process.env): AgentConfig {
  // Treat empty strings (for example `FACTO_ENROLMENT_TOKEN=` in a .env file) as unset.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const parsed = ConfigSchema.parse(cleaned);
  return {
    apiUrl: parsed.FACTO_API_URL.replace(/\/+$/, ''),
    enrolmentToken: parsed.FACTO_ENROLMENT_TOKEN,
    stateFile: parsed.FACTO_AGENT_STATE_FILE ?? defaultStateFile(),
    heartbeatIntervalMs: Math.round(parsed.FACTO_HEARTBEAT_INTERVAL_SECONDS * 1000),
  };
}
