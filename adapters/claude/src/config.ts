import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  FACTO_API_URL: z.string().url(),
  CLAUDE_PROJECTS_DIR: z.string().min(1).optional(),
  CLAUDE_ACTIVE_WINDOW_MINUTES: z.coerce.number().min(1).max(1440).default(10),
  CLAUDE_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),
  CLAUDE_HIDE_PROJECT_NAMES: bool.default(false),
  CLAUDE_PRICING_FILE: z.string().min(1).optional(),
  FACTO_ADAPTER_STATE_FILE: z.string().min(1).default('./claude-adapter.state.json'),
  FACTO_ADMIN_TOKEN: z.string().optional(),
});

export interface ClaudeConfig {
  apiUrl: string;
  projectsDir: string;
  activeWindowMs: number;
  syncIntervalMs: number;
  hideProjectNames: boolean;
  pricingFile?: string;
  stateFile: string;
  adminToken?: string;
}

/** Reads settings from the environment only. */
export function loadConfig(env: Record<string, string | undefined> = process.env, home: string = homedir()): ClaudeConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const e = parsed.data;
  return {
    apiUrl: e.FACTO_API_URL,
    projectsDir: e.CLAUDE_PROJECTS_DIR ?? join(home, '.claude', 'projects'),
    activeWindowMs: e.CLAUDE_ACTIVE_WINDOW_MINUTES * 60_000,
    syncIntervalMs: e.CLAUDE_SYNC_INTERVAL_SECONDS * 1000,
    hideProjectNames: e.CLAUDE_HIDE_PROJECT_NAMES,
    pricingFile: e.CLAUDE_PRICING_FILE,
    stateFile: e.FACTO_ADAPTER_STATE_FILE,
    adminToken: e.FACTO_ADMIN_TOKEN,
  };
}
