import { createHash } from 'node:crypto';
import type { ClaudeSessionItem, ClaudeUsageItem } from '@facto/contracts';
import type { Usage } from './parse.js';
import type { Pricing } from './pricing.js';
import { addUsage, dayKey, type FileState } from './scan.js';

export const MAX_SESSIONS = 100;
export const MAX_DAYS = 30;
const HOUR = 3600_000;
const SOURCE = 'claude';

export interface AggregateOptions {
  now: number;
  activeWindowMs: number;
  hideProjectNames: boolean;
  pricing: Pricing;
}

/**
 * Project label from the transcript directory name (Claude Code encodes the working directory with dashes).
 * Default: the last segment only. With `hide`, a short hash that is stable but reveals nothing.
 */
export function projectLabel(dirName: string, hide: boolean): string {
  if (hide) return `project-${createHash('sha256').update(dirName).digest('hex').slice(0, 8)}`;
  const base = dirName.split('--claude-worktrees-')[0]!; // worktree dirs: label the repository, not the worktree
  const last = base.split('-').filter(Boolean).pop();
  return (last ?? 'unknown').slice(0, 200);
}

const sec = (ms: number): number => Math.max(0, Math.round(ms / 1000));
const round = (n: number, digits = 4): number => Math.round(n * 10 ** digits) / 10 ** digits;
const zero = (): Usage => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
const hitRate = (u: Usage): number | undefined => {
  const denom = u.input + u.cacheWrite + u.cacheRead;
  return denom > 0 ? round(u.cacheRead / denom) : undefined;
};

function toSession(st: FileState, o: AggregateOptions): ClaudeSessionItem | null {
  if (st.firstTs === undefined || st.lastTs === undefined) return null;
  const costUsd = [...st.costTokensByModel].reduce((sum, [model, t]) => sum + o.pricing.cost(model, t), 0);
  const active = o.now - st.lastTs <= o.activeWindowMs || o.now - st.mtimeMs <= o.activeWindowMs;
  return {
    externalId: st.sessionId.slice(0, 8),
    title: projectLabel(st.projectDir, o.hideProjectNames),
    status: active ? 'active' : 'idle',
    statusLabel: active ? 'active' : 'idle',
    models: [...st.models].sort().slice(0, 10),
    startedAt: new Date(st.firstTs).toISOString(),
    lastActivityAt: new Date(st.lastTs).toISOString(),
    messageCount: st.messages,
    sidechainMessages: st.sidechain,
    tokens: { ...st.tokens },
    ...(st.latestContext !== undefined && active ? { contextTokens: st.latestContext } : {}),
    durationSeconds: sec(st.lastTs - st.firstTs),
    activeSeconds: sec(st.activeMs),
    estimatedCostUsd: round(costUsd),
    source: SOURCE,
  };
}

interface Acc {
  byModel: Map<string, Usage>;
  messages: number;
  files: Set<FileState>;
}

function toUsage(id: string, title: string, status: 'day' | 'window', acc: Acc, o: AggregateOptions, extra: Partial<ClaudeUsageItem>): ClaudeUsageItem {
  const total = zero();
  let cost = 0;
  const models = [...acc.byModel]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 20)
    .map(([model, tokens]) => {
      addUsage(total, tokens);
      const c = o.pricing.cost(model, tokens);
      cost += c;
      return { model, tokens, estimatedCostUsd: round(c) };
    });
  const rate = hitRate(total);
  return {
    externalId: id, title, status, models, tokens: total, estimatedCostUsd: round(cost), costIsEstimate: true,
    messages: acc.messages, sessions: acc.files.size, ...(rate !== undefined ? { cacheHitRate: rate } : {}), source: SOURCE, ...extra,
  };
}

/** Builds the two snapshots from per-file running totals. Pure: no I/O. */
export function aggregate(states: FileState[], o: AggregateOptions): { sessions: ClaudeSessionItem[]; usage: ClaudeUsageItem[] } {
  const live = states.filter((s) => s.lastTs !== undefined);
  const sessions = live
    .slice()
    .sort((a, b) => b.lastTs! - a.lastTs!)
    .slice(0, MAX_SESSIONS)
    .map((s) => toSession(s, o))
    .filter((s): s is ClaudeSessionItem => s !== null);

  const days = new Map<string, Acc>();
  const win5 = { acc: { byModel: new Map<string, Usage>(), messages: 0, files: new Set<FileState>() } as Acc, from: o.now - 5 * HOUR };
  const win7 = { acc: { byModel: new Map<string, Usage>(), messages: 0, files: new Set<FileState>() } as Acc, from: o.now - 7 * 24 * HOUR };
  const lastHour = zero();
  const into = (acc: Acc, f: FileState, model: string, u: Usage, n: number) => {
    addUsage(acc.byModel.get(model) ?? acc.byModel.set(model, zero()).get(model)!, u);
    acc.messages += n;
    acc.files.add(f);
  };
  for (const f of live) {
    for (const [key, b] of f.buckets) {
      const sep = key.indexOf('|');
      const start = Number(key.slice(0, sep));
      const model = key.slice(sep + 1);
      const dk = dayKey(start);
      into(days.get(dk) ?? days.set(dk, { byModel: new Map(), messages: 0, files: new Set() }).get(dk)!, f, model, b, b.messages);
      if (start + 5 * 60_000 > win5.from) into(win5.acc, f, model, b, b.messages);
      if (start + 5 * 60_000 > win7.from) into(win7.acc, f, model, b, b.messages);
      if (start + 5 * 60_000 > o.now - HOUR) {
        lastHour.input += b.input; lastHour.output += b.output; lastHour.cacheWrite += b.cacheWrite;
      }
    }
  }

  const activeForDay = (k: string) => live.reduce((n, f) => n + (f.activeByDay.get(k) ?? 0), 0);
  const today = dayKey(o.now);
  const dayKeys = [...days.keys()].sort().reverse().slice(0, MAX_DAYS);
  const usage: ClaudeUsageItem[] = [];

  // Today always exists (zeros when idle) so the dashboard can show "0" rather than "no data".
  if (!days.has(today)) days.set(today, { byModel: new Map(), messages: 0, files: new Set() });
  for (const k of new Set([today, ...dayKeys])) {
    const acc = days.get(k)!;
    const extra: Partial<ClaudeUsageItem> = { activeSeconds: sec(activeForDay(k)) };
    if (k === today) {
      const todays = [...acc.files];
      const byProject = new Map<string, number>();
      for (const f of todays) {
        const label = projectLabel(f.projectDir, o.hideProjectNames);
        byProject.set(label, (byProject.get(label) ?? 0) + 1);
      }
      extra.sessionsByProject = [...byProject].map(([project, sessions]) => ({ project, sessions })).sort((a, b) => b.sessions - a.sessions).slice(0, 50);
      extra.longestSessionSeconds = todays.reduce((m, f) => Math.max(m, sec((f.lastTs ?? 0) - (f.firstTs ?? 0))), 0);
      extra.sidechainMessages = todays.reduce((n, f) => n + (dayKey(f.lastTs ?? 0) === today ? f.sidechain : 0), 0);
    }
    usage.push(toUsage(`day:${k}`, k, 'day', acc, o, extra));
  }

  const burn = lastHour.input + lastHour.output + lastHour.cacheWrite;
  usage.push(toUsage('window:5h', 'Last 5 hours', 'window', win5.acc, o, { tokensPerHourLastHour: burn }));
  const cutoff7 = dayKey(o.now - 6 * 24 * HOUR);
  const active7 = live.reduce((n, f) => n + [...f.activeByDay].reduce((m, [k, v]) => (k >= cutoff7 ? m + v : m), 0), 0);
  usage.push(toUsage('window:7d', 'Last 7 days', 'window', win7.acc, o, { activeSeconds: sec(active7) }));
  return { sessions, usage };
}
