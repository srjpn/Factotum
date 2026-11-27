import { z } from 'zod';
import type { TaskStatus } from './status.js';

const StatusSchema = z.enum(['todo', 'in-progress', 'done', 'other']);

const EnvSchema = z.object({
  FACTO_API_URL: z.string().url(),
  TRELLO_API_KEY: z.string().min(1),
  TRELLO_TOKEN: z.string().min(1),
  TRELLO_BOARD_IDS: z
    .string()
    .transform((s) => s.split(',').map((b) => b.trim()).filter(Boolean))
    .pipe(z.array(z.string()).min(1, 'at least one board id is required')),
  TRELLO_LIST_STATUS_MAP: z.string().optional(),
  TRELLO_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(60),
  TRELLO_API_BASE: z.string().url().default('https://api.trello.com'),
  FACTO_ADAPTER_STATE_FILE: z.string().min(1).default('./trello-adapter.state.json'),
  FACTO_ADMIN_TOKEN: z.string().optional(),
});

export interface TrelloConfig {
  apiUrl: string;
  apiKey: string;
  token: string;
  boardIds: string[];
  listStatusMap: Record<string, TaskStatus>;
  syncIntervalMs: number;
  trelloBase: string;
  stateFile: string;
  adminToken?: string;
}

/** Reads settings from the environment only. Error messages name the setting, never its value. */
export function loadConfig(env: Record<string, string | undefined> = process.env): TrelloConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  const e = parsed.data;
  let listStatusMap: Record<string, TaskStatus> = {};
  if (e.TRELLO_LIST_STATUS_MAP) {
    let json: unknown;
    try {
      json = JSON.parse(e.TRELLO_LIST_STATUS_MAP);
    } catch {
      throw new Error('invalid configuration: TRELLO_LIST_STATUS_MAP is not valid JSON');
    }
    const map = z.record(z.string(), StatusSchema).safeParse(json);
    if (!map.success) {
      throw new Error('invalid configuration: TRELLO_LIST_STATUS_MAP must map list names to todo, in-progress, done or other');
    }
    listStatusMap = map.data;
  }
  return {
    apiUrl: e.FACTO_API_URL,
    apiKey: e.TRELLO_API_KEY,
    token: e.TRELLO_TOKEN,
    boardIds: e.TRELLO_BOARD_IDS,
    listStatusMap,
    syncIntervalMs: e.TRELLO_SYNC_INTERVAL_SECONDS * 1000,
    trelloBase: e.TRELLO_API_BASE.replace(/\/+$/, ''),
    stateFile: e.FACTO_ADAPTER_STATE_FILE,
    adminToken: e.FACTO_ADMIN_TOKEN,
  };
}
