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

/** Kinds the core understands. An adapter may only push a kind listed in its manifest `reports`. */
export const INVENTORY_KINDS = { task: TaskItemSchema } as const;
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
