import { ContainerItemSchema, RunItemSchema, type AdapterSummary, type Approval, type ContainerItem, type InventoryItem, type Node, type RunItem } from '@facto/contracts';
import type { TaskRow } from './tasks';

export type Tone = 'ok' | 'warn' | 'info' | 'bad' | 'ne';

// ---- nodes ----

/** The node the MacBook card shows: online first, then any not revoked, then anything. */
export function primaryNode(nodes: Node[]): Node | undefined {
  return nodes.find((n) => n.status === 'online') ?? nodes.find((n) => n.status !== 'revoked') ?? nodes[0];
}

export function nodeSummary(nodes: Node[]): { value: string; sub: string; tone: Tone } {
  const live = nodes.filter((n) => n.status !== 'revoked');
  if (live.length === 0) return { value: 'None', sub: 'no node enrolled', tone: 'ne' };
  const online = live.filter((n) => n.status === 'online').length;
  const offline = live.filter((n) => n.status === 'offline').length;
  const sub = `${online} online · ${offline} offline`;
  if (online > 0) return { value: 'Online', sub, tone: 'ok' };
  if (offline > 0) return { value: 'Offline', sub, tone: 'bad' };
  return { value: 'Pending', sub, tone: 'warn' };
}

export const statusTone = (s: string): Tone => (s === 'online' ? 'ok' : s === 'offline' ? 'bad' : s === 'pending' ? 'warn' : 'ne');

/** Meter colour: warns at 75 percent and above, alarms at 90. */
export const meterTone = (pct: number): 'ok' | 'warn' | 'bad' => (pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : 'ok');
export const clampPct = (n: number): number => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);

// ---- Pani runs ----

export interface RunRow {
  id: string;
  title: string;
  ticketKey?: string;
  status: RunItem['status'];
  statusLabel: string;
  chunksDone?: number;
  chunksTotal?: number;
  startedAt?: string;
  durationSeconds?: number;
  sortTime: number;
}

export function toRunRows(items: InventoryItem[]): RunRow[] {
  const rows: RunRow[] = [];
  for (const item of items) {
    if (item.kind !== 'run') continue;
    const p = RunItemSchema.safeParse({ status: item.status, ...item.data, externalId: item.externalId, title: item.title });
    if (!p.success) continue;
    const r = p.data;
    const started = r.startedAt ? Date.parse(r.startedAt) : NaN;
    const fallback = Date.parse(item.updatedAt);
    rows.push({
      id: item.id,
      title: r.title,
      ticketKey: r.ticketKey,
      status: r.status,
      statusLabel: r.statusLabel,
      chunksDone: r.chunksDone,
      chunksTotal: r.chunksTotal,
      startedAt: r.startedAt,
      durationSeconds: r.durationSeconds,
      sortTime: Number.isNaN(started) ? (Number.isNaN(fallback) ? 0 : fallback) : started,
    });
  }
  return rows.sort((a, b) => b.sortTime - a.sortTime);
}

const sameLocalDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
export const runsToday = (rows: RunRow[], now = Date.now()): number => rows.filter((r) => r.sortTime > 0 && sameLocalDay(r.sortTime, now)).length;
export const activeRuns = (rows: RunRow[]): number => rows.filter((r) => r.status === 'running' || r.status === 'queued').length;

export function runPill(status: RunItem['status']): { tone: Tone; label: string } {
  switch (status) {
    case 'running': return { tone: 'info', label: 'running' };
    case 'queued': return { tone: 'ne', label: 'queued' };
    case 'done': return { tone: 'ok', label: 'done' };
    case 'partial': return { tone: 'warn', label: 'partial' };
    case 'failed': return { tone: 'bad', label: 'failed' };
    default: return { tone: 'ne', label: 'other' };
  }
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
}

/** "3 of 5 chunks", or undefined when the run reports none. */
export function chunkProgress(r: Pick<RunRow, 'chunksDone' | 'chunksTotal'>): string | undefined {
  if (r.chunksTotal === undefined || r.chunksTotal === 0) return undefined;
  return `${r.chunksDone ?? 0} of ${r.chunksTotal} chunks`;
}

// ---- tasks ----

export type TaskColumn = 'todo' | 'in-progress' | 'done';
export const TASK_COLUMNS: { key: TaskColumn; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

export function taskBoard(rows: TaskRow[]): Record<TaskColumn, TaskRow[]> & { other: number } {
  const board = { todo: [] as TaskRow[], 'in-progress': [] as TaskRow[], done: [] as TaskRow[], other: 0 };
  for (const r of rows) {
    if (r.status === 'other') board.other++;
    else board[r.status as TaskColumn].push(r);
  }
  return board;
}

// ---- approvals ----

export const pendingApprovals = (approvals: Approval[], now = Date.now()): Approval[] =>
  approvals.filter((a) => a.status === 'pending' && Date.parse(a.expiresAt) > now);

// ---- adapters ----

export function adaptersPill(adapters: AdapterSummary[]): { tone: Tone; label: string } {
  if (adapters.length === 0) return { tone: 'ne', label: 'No adapters registered' };
  const down = adapters.filter((a) => a.status === 'down').length;
  if (down > 0) return { tone: 'bad', label: `${down} down` };
  const degraded = adapters.filter((a) => a.status === 'degraded').length;
  if (degraded > 0) return { tone: 'warn', label: `${degraded} degraded` };
  const unknown = adapters.filter((a) => a.status === 'unknown').length;
  if (unknown > 0) return { tone: 'ne', label: `${unknown} not reporting yet` };
  return { tone: 'ok', label: 'All adapters reachable' };
}

export const adapterTone = (s: AdapterSummary['status']): Tone => (s === 'up' ? 'ok' : s === 'down' ? 'bad' : s === 'degraded' ? 'warn' : 'ne');
export const adapterLabel = (s: AdapterSummary['status']): string => (s === 'up' ? 'up' : s === 'unknown' ? 'no report yet' : s);

export function containerCounts(items: InventoryItem[]): { total: number; running: number } {
  let total = 0;
  let running = 0;
  for (const item of items) {
    if (item.kind !== 'container') continue;
    const p = ContainerItemSchema.safeParse({ status: item.status, ...item.data, externalId: item.externalId, name: item.title });
    if (!p.success) continue;
    total++;
    if ((p.data as ContainerItem).status === 'running') running++;
  }
  return { total, running };
}

export const isDockerAdapter = (a: AdapterSummary): boolean => /docker/i.test(a.name);
