import { ClaudeSessionItemSchema, ClaudeUsageItemSchema, type ClaudeSessionItem, type ClaudeUsageItem, type InventoryItem } from '@facto/contracts';

const parse = <T,>(items: InventoryItem[], kind: string, schema: { safeParse(v: unknown): { success: boolean; data?: T } }): T[] =>
  items.flatMap((i) => {
    if (i.kind !== kind) return [];
    const p = schema.safeParse({ status: i.status, ...i.data, externalId: i.externalId, title: i.title });
    return p.success ? [p.data as T] : [];
  });

export const toClaudeSessions = (items: InventoryItem[]): ClaudeSessionItem[] =>
  parse<ClaudeSessionItem>(items, 'claude-session', ClaudeSessionItemSchema).sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
export const toClaudeUsage = (items: InventoryItem[]): ClaudeUsageItem[] => parse<ClaudeUsageItem>(items, 'claude-usage', ClaudeUsageItemSchema);

export const localDayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const totalTokens = (t: { input: number; output: number; cacheWrite: number; cacheRead: number }): number => t.input + t.output + t.cacheWrite + t.cacheRead;

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
}

export const formatUsd = (n: number): string => (n < 0.005 ? '$0' : `$${n.toFixed(n < 10 ? 2 : 0)}`);

export interface ClaudeSummary {
  /** sessions waiting on the owner, longest wait first */
  waiting: ClaudeSessionItem[];
  active: ClaudeSessionItem[];
  todayTokens: number;
  todayCostUsd: number;
  todayActiveSeconds: number;
  window5hTokens: number;
  window5hCostUsd: number;
}

export function summarizeClaude(sessions: ClaudeSessionItem[], usage: ClaudeUsageItem[], now: number): ClaudeSummary {
  const today = usage.find((u) => u.externalId === `day:${localDayKey(now)}`);
  const w5 = usage.find((u) => u.externalId === 'window:5h');
  return {
    waiting: sessions.filter((s) => s.status === 'waiting').sort((a, b) => (b.waitingSeconds ?? 0) - (a.waitingSeconds ?? 0)),
    active: sessions.filter((s) => s.status === 'active'),
    todayTokens: today ? totalTokens(today.tokens) : 0,
    todayCostUsd: today?.estimatedCostUsd ?? 0,
    todayActiveSeconds: today?.activeSeconds ?? 0,
    window5hTokens: w5 ? totalTokens(w5.tokens) : 0,
    window5hCostUsd: w5?.estimatedCostUsd ?? 0,
  };
}
