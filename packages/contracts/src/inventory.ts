import { z } from 'zod';

// Limits protect the core from a runaway adapter; the whole snapshot is also capped at ~1 MB by the API.
export const INVENTORY_MAX_ITEMS = 2000;
export const INVENTORY_MAX_DATA_BYTES = 8 * 1024;

export const PrivacyClassSchema = z.enum(['personal', 'client-data']);
export type PrivacyClass = z.infer<typeof PrivacyClassSchema>;

const slug = z.string().min(1).max(200);

/** First inventory kind: a unit of work in some tool (Trello card, Jira issue, ...). */
export const TaskItemSchema = z.object({
  externalId: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  status: z.enum(['todo', 'in-progress', 'done', 'other']),
  statusLabel: z.string().max(200),
  url: z.string().url().max(2000).optional(),
  source: slug,
  project: slug.optional(),
  assignee: slug.optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});
export type TaskItem = z.infer<typeof TaskItemSchema>;

/**
 * A Pani run (job). Never carries diffs, logs, commit messages, file paths or chunk titles.
 * Privacy class is `client-data` because Pani works on client repositories.
 */
export const RunItemSchema = z.object({
  externalId: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  status: z.enum(['queued', 'running', 'done', 'partial', 'failed', 'other']),
  statusLabel: z.string().max(200),
  ticketKey: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/).max(100).optional(),
  repo: z.string().max(200).optional(),
  chunksDone: z.number().int().nonnegative().optional(),
  chunksTotal: z.number().int().nonnegative().optional(),
  startedAt: z.string().datetime({ offset: true }).optional(),
  finishedAt: z.string().datetime({ offset: true }).optional(),
  durationSeconds: z.number().nonnegative().optional(),
  source: slug,
  error: z.string().max(200).optional(),
});
export type RunItem = z.infer<typeof RunItemSchema>;

/** A container on a Docker host. Never carries environment variables, labels (except the compose project), mounts, commands or logs. */
export const ContainerItemSchema = z.object({
  externalId: z.string().min(1).max(200), // short container id
  name: z.string().min(1).max(500),
  image: z.string().min(1).max(500),
  status: z.enum(['running', 'stopped', 'restarting', 'unhealthy', 'other']),
  statusLabel: z.string().max(200), // Docker's state string, for example "running" or "exited"
  health: z.enum(['healthy', 'unhealthy', 'starting', 'none']).optional(),
  composeProject: slug.optional(),
  startedAt: z.string().datetime({ offset: true }).optional(),
  source: slug,
  ports: z.array(z.string().max(200)).max(100).optional(), // published ports only, e.g. "127.0.0.1:3000->3000/tcp"
});
export type ContainerItem = z.infer<typeof ContainerItemSchema>;

// ---- Claude Code activity (LT-17c). Counts, times and model names only: never message content, prompts, tool inputs or file paths. ----

const nonNegInt = z.number().int().nonnegative();
const isoDateTime = z.string().datetime({ offset: true });

export const ClaudeTokensSchema = z.object({
  input: nonNegInt,
  output: nonNegInt,
  cacheWrite: nonNegInt,
  cacheRead: nonNegInt,
});
export type ClaudeTokens = z.infer<typeof ClaudeTokensSchema>;

/** One Claude Code session (one transcript). `title` is the project label (last path segment, or a hash). */
export const ClaudeSessionItemSchema = z.object({
  externalId: z.string().min(1).max(200), // short session id
  title: z.string().min(1).max(200),
  status: z.enum(['active', 'idle', 'waiting']),
  statusLabel: z.string().max(200),
  models: z.array(z.string().max(100)).max(10),
  startedAt: isoDateTime,
  lastActivityAt: isoDateTime,
  messageCount: nonNegInt,
  sidechainMessages: nonNegInt,
  tokens: ClaudeTokensSchema,
  /** Set when status is `waiting`: the tool that asked (for example AskUserQuestion) and how long ago. Never the question. */
  waitingTool: z.string().max(100).optional(),
  waitingSeconds: z.number().nonnegative().optional(),
  /** input + cache tokens of the latest assistant message: a context-pressure hint. */
  contextTokens: nonNegInt.optional(),
  durationSeconds: z.number().nonnegative(),
  activeSeconds: z.number().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  source: slug,
});
export type ClaudeSessionItem = z.infer<typeof ClaudeSessionItemSchema>;

export const ClaudeUsageModelSchema = z.object({
  model: z.string().min(1).max(100),
  tokens: ClaudeTokensSchema,
  estimatedCostUsd: z.number().nonnegative(),
});

/** Usage for one local day (`day:YYYY-MM-DD`) or a rolling window (`window:5h`, `window:7d`). Costs are estimates from a price table. */
export const ClaudeUsageItemSchema = z.object({
  externalId: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  status: z.enum(['day', 'window']),
  models: z.array(ClaudeUsageModelSchema).max(20),
  tokens: ClaudeTokensSchema,
  estimatedCostUsd: z.number().nonnegative(),
  costIsEstimate: z.literal(true),
  messages: nonNegInt,
  sessions: nonNegInt,
  activeSeconds: z.number().nonnegative().optional(),
  cacheHitRate: z.number().min(0).max(1).optional(),
  sidechainMessages: nonNegInt.optional(),
  tokensPerHourLastHour: z.number().nonnegative().optional(),
  longestSessionSeconds: z.number().nonnegative().optional(),
  sessionsByProject: z.array(z.object({ project: z.string().max(200), sessions: nonNegInt })).max(50).optional(),
  source: slug,
});
export type ClaudeUsageItem = z.infer<typeof ClaudeUsageItemSchema>;

/** Time Machine state on this Mac. One item per destination host; never carries paths or snapshot names. */
export const BackupItemSchema = z.object({
  externalId: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  status: z.enum(['ok', 'running', 'stale', 'unavailable']),
  statusLabel: z.string().max(200),
  lastBackupAt: z.string().datetime({ offset: true }).optional(),
  running: z.boolean(),
  destinationReachable: z.boolean(),
  destinationName: z.string().max(200).optional(),
  source: slug,
});
export type BackupItem = z.infer<typeof BackupItemSchema>;

/** A listening TCP port of a local process. Never carries command-line arguments, environment or full paths. */
export const ServiceItemSchema = z.object({
  externalId: z.string().min(1).max(200), // "tcp:3000"
  title: z.string().min(1).max(500), // process name
  status: z.enum(['listening']),
  statusLabel: z.string().max(200),
  port: z.number().int().min(1).max(65535),
  process: z.string().min(1).max(200),
  workingDir: z.string().max(200).optional(), // last path segment only
  bind: z.enum(['localhost', 'all']),
  source: slug,
});
export type ServiceItem = z.infer<typeof ServiceItemSchema>;

/** Kinds the core understands. An adapter may only push a kind listed in its manifest `reports`. */
export const INVENTORY_KINDS = {
  task: TaskItemSchema,
  run: RunItemSchema,
  container: ContainerItemSchema,
  backup: BackupItemSchema,
  service: ServiceItemSchema,
  'claude-session': ClaudeSessionItemSchema,
  'claude-usage': ClaudeUsageItemSchema,
} as const;
export type InventoryKind = keyof typeof INVENTORY_KINDS;
export const isInventoryKind = (kind: string): kind is InventoryKind => Object.hasOwn(INVENTORY_KINDS, kind);

/** Full snapshot of one kind for one adapter. Items are validated per kind by the API. */
export const InventorySnapshotSchema = z.object({
  privacyClass: PrivacyClassSchema,
  items: z.array(z.unknown()).max(INVENTORY_MAX_ITEMS),
});
export type InventorySnapshot<T = unknown> = { privacyClass: PrivacyClass; items: T[] };

export const InventorySyncResultSchema = z.object({
  added: z.number().int(),
  updated: z.number().int(),
  removed: z.number().int(),
  unchanged: z.number().int(),
});
export type InventorySyncResult = z.infer<typeof InventorySyncResultSchema>;

export const InventoryItemSchema = z.object({
  id: z.string(),
  adapter: z.string(),
  kind: z.string(),
  externalId: z.string(),
  title: z.string(),
  status: z.string(),
  privacyClass: PrivacyClassSchema,
  url: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  observedAt: z.string(),
  updatedAt: z.string(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
