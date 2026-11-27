import { TaskItemSchema, type InventoryItem, type PrivacyClass, type TaskItem } from '@facto/contracts';

export interface TaskRow {
  id: string;
  adapter: string;
  title: string;
  status: TaskItem['status'];
  statusLabel: string;
  source: string;
  project?: string;
  assignee?: string;
  url?: string;
  privacyClass: PrivacyClass;
}

/** Only http(s) links are rendered as links. */
const safeUrl = (u: string | null | undefined): string | undefined => (u && /^https?:\/\//i.test(u) ? u : undefined);

/** Turns generic inventory items into task rows. Items whose `data` is not a task are skipped. */
export function toTaskRows(items: InventoryItem[]): TaskRow[] {
  const rows: TaskRow[] = [];
  for (const item of items) {
    if (item.kind !== 'task') continue;
    const data = TaskItemSchema.safeParse({ status: item.status, ...item.data, externalId: item.externalId, title: item.title });
    if (!data.success) continue;
    const t = data.data;
    rows.push({
      id: item.id,
      adapter: item.adapter,
      title: t.title,
      status: t.status,
      statusLabel: t.statusLabel,
      source: t.source,
      project: t.project,
      assignee: t.assignee,
      url: safeUrl(t.url ?? item.url),
      privacyClass: item.privacyClass,
    });
  }
  return rows;
}

/** Distinct sources, sorted, for the filter. */
export const taskSources = (rows: TaskRow[]): string[] => [...new Set(rows.map((r) => r.source))].sort();

/** Accepts only a source that exists in the data; anything else means "all". */
export function parseSource(raw: string | string[] | undefined, sources: string[]): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && sources.includes(v) ? v : undefined;
}

export const filterTasks = (rows: TaskRow[], source?: string): TaskRow[] => (source ? rows.filter((r) => r.source === source) : rows);
