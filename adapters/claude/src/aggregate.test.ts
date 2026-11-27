import { describe, expect, it } from 'vitest';
import { ClaudeSessionItemSchema, ClaudeUsageItemSchema } from '@facto/contracts';
import { aggregate, MAX_SESSIONS, projectLabel } from './aggregate.js';
import { agentName, assistant, customTitle, TITLE, QUESTION, SECRET, SECRET_PATH, toolResult, toolUse, user } from './fixtures.js';
import { createPricing } from './pricing.js';
import { applyLine, newState, type FileState } from './scan.js';

const NOW = new Date(2026, 10, 27, 14, 0, 0).getTime(); // local time, so "today" is stable in any timezone
const at = (min: number) => new Date(NOW - min * 60_000).toISOString();
const pricing = createPricing({ m: { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 } });
const opts = { now: NOW, activeWindowMs: 10 * 60_000, hideProjectNames: false, pricing };

const file = (id: string, dir: string, lines: string[]): FileState => {
  const st = newState(id, dir);
  lines.forEach((l) => applyLine(st, l));
  st.mtimeMs = st.lastTs ?? 0;
  return st;
};

describe('projectLabel', () => {
  it('uses the last segment, labels the repo for worktrees, and can hash', () => {
    expect(projectLabel('-Users-me-work-acme', false)).toBe('acme');
    expect(projectLabel('-Users-me-work-acme--claude-worktrees-feat-x1', false)).toBe('acme');
    const h = projectLabel('-Users-me-work-acme', true);
    expect(h).toMatch(/^project-[0-9a-f]{8}$/);
    expect(h).toBe(projectLabel('-Users-me-work-acme', true));
    expect(h).not.toContain('acme');
  });
});

describe('aggregate', () => {
  const a = file('aaaaaaaa-1', '-Users-me-work-acme', [user(at(30)), assistant(at(29), 'm', [1_000_000, 0, 0, 0]), user(at(3)), assistant(at(2), 'm', [0, 1_000_000, 1_000_000, 1_000_000], { isSidechain: true })]);
  const b = file('bbbbbbbb-2', '-Users-me-work-beta', [assistant(at(60 * 30), 'other-model', [100, 100, 0, 0])]);
  const out = aggregate([a, b], opts);

  it('produces schema-valid items and never carries content', () => {
    out.sessions.forEach((s) => expect(ClaudeSessionItemSchema.safeParse(s).success).toBe(true));
    out.usage.forEach((u) => expect(ClaudeUsageItemSchema.safeParse(u).success).toBe(true));
    const json = JSON.stringify(out);
    for (const s of [SECRET, SECRET_PATH, 'Users']) expect(json).not.toContain(s);
  });

  it('classifies sessions active or idle by the window, newest first, with context size only when active', () => {
    expect(out.sessions.map((s) => [s.externalId, s.status])).toEqual([['aaaaaaaa', 'active'], ['bbbbbbbb', 'idle']]);
    expect(out.sessions[0]).toMatchObject({ title: 'aaaaaaaa', project: 'acme', messageCount: 4, sidechainMessages: 1, contextTokens: 2_000_000, durationSeconds: 28 * 60, activeSeconds: 120 });
    expect(out.sessions[1]!.contextTokens).toBeUndefined();
    // 1M input @1 + 1M output @2 + 1M cache write @3 + 1M cache read @4
    expect(out.sessions[0]!.estimatedCostUsd).toBe(10);
  });

  it('builds today, 5h and 7d usage with cost estimates, cache hit rate and extras', () => {
    const by = Object.fromEntries(out.usage.map((u) => [u.externalId, u]));
    expect(by['day:2026-11-27']).toMatchObject({ sessions: 1, messages: 2, estimatedCostUsd: 10, costIsEstimate: true, longestSessionSeconds: 28 * 60, activeSeconds: 120, sidechainMessages: 1 });
    expect(by['day:2026-11-27']!.sessionsByProject).toEqual([{ project: 'acme', sessions: 1 }]);
    expect(by['day:2026-11-27']!.cacheHitRate).toBeCloseTo(1_000_000 / 3_000_000, 3);
    expect(by['window:5h']).toMatchObject({ sessions: 1, tokens: { input: 1_000_000, output: 1_000_000, cacheWrite: 1_000_000, cacheRead: 1_000_000 } });
    expect(by['window:5h']!.tokensPerHourLastHour).toBe(3_000_000); // input + output + cache write, last hour
    expect(by['window:7d']!.sessions).toBe(2); // b is 30 hours old, still inside 7 days
  });

  it('keeps only today and old days that have data, and caps sessions', () => {
    const many = Array.from({ length: 150 }, (_, i) => file(`s${String(i).padStart(7, '0')}`, '-x-p', [assistant(at(i), 'm', [1, 1, 0, 0])]));
    const r = aggregate(many, opts);
    expect(r.sessions).toHaveLength(MAX_SESSIONS);
    expect(aggregate([], opts).usage.map((u) => u.externalId)).toEqual(['day:2026-11-27', 'window:5h', 'window:7d']);
  });
});

describe('waiting on the owner (best-effort heuristic)', () => {
  const run = (lines: string[]) => aggregate([file('cccccccc-3', '-x-proj', lines)], opts).sessions[0]!;
  it('is waiting when the last assistant line asks and nothing answers it', () => {
    const s = run([user(at(10)), assistant(at(9), 'm', [1, 1, 0, 0]), toolUse(at(5), 'AskUserQuestion', 'tu_1')]);
    expect(s).toMatchObject({ status: 'waiting', statusLabel: 'needs you', waitingTool: 'AskUserQuestion', waitingSeconds: 300 });
    expect(ClaudeSessionItemSchema.safeParse(s).success).toBe(true);
    const json = JSON.stringify(s);
    expect(json).not.toContain(QUESTION);
    expect(json).not.toContain(SECRET);
  });
  it('treats plan approval as waiting too', () => {
    expect(run([toolUse(at(2), 'ExitPlanMode', 'tu_9')]).waitingTool).toBe('ExitPlanMode');
  });
  it('is not waiting once answered, or once the session moved on', () => {
    expect(run([toolUse(at(5), 'AskUserQuestion', 'tu_1'), toolResult(at(4), 'tu_1')]).status).toBe('active');
    expect(run([toolUse(at(5), 'AskUserQuestion', 'tu_1'), user(at(4))]).status).toBe('active');
    expect(run([toolUse(at(5), 'AskUserQuestion', 'tu_1'), assistant(at(4), 'm', [1, 1, 0, 0])]).waitingTool).toBeUndefined();
  });
  it('ignores ordinary tool uses and abandoned questions', () => {
    expect(run([toolUse(at(2), 'Bash', 'tu_2')]).status).toBe('active');
    expect(run([toolUse(at(60 * 30), 'AskUserQuestion', 'tu_3')]).status).toBe('idle');
  });
});

describe('session titles', () => {
  const run = (lines: string[], o = opts) => aggregate([file('dddddddd-4', '-Users-me-work-acme', [assistant(at(2), 'm', [1, 1, 0, 0]), ...lines])], o).sessions[0]!;
  it('uses the latest custom title, with the project as a separate field', () => {
    const s = run([customTitle('Old title'), customTitle(TITLE)]);
    expect(s).toMatchObject({ title: TITLE, project: 'acme' });
    expect(ClaudeSessionItemSchema.safeParse(s).success).toBe(true);
  });
  it('falls back to the agent name, then the short id, and caps the length', () => {
    expect(run([agentName('agent-x')]).title).toBe('agent-x');
    expect(run([agentName('agent-x'), customTitle('Real')]).title).toBe('Real');
    expect(run([]).title).toBe('dddddddd');
    expect(run([customTitle('y'.repeat(300))]).title).toHaveLength(200);
  });
  it('hashes the project but keeps the title when names are hidden', () => {
    const s = run([customTitle(TITLE)], { ...opts, hideProjectNames: true });
    expect(s.title).toBe(TITLE);
    expect(s.project).toMatch(/^project-[0-9a-f]{8}$/);
  });
  it('does not count title lines as messages or move the clock', () => {
    const s = run([customTitle(TITLE)]);
    expect(s.messageCount).toBe(1);
    expect(s.durationSeconds).toBe(0);
  });
});
