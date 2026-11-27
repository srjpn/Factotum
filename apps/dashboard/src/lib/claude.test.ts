import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '@facto/contracts';
import { formatTokens, formatUsd, localDayKey, summarizeClaude, toClaudeSessions, toClaudeUsage } from './claude';

const tokens = { input: 1000, output: 500, cacheWrite: 0, cacheRead: 2000 };
const item = (kind: string, externalId: string, title: string, status: string, data: Record<string, unknown>): InventoryItem => ({
  id: externalId, adapter: 'claude', kind, externalId, title, status, privacyClass: 'client-data', url: null, data, observedAt: '', updatedAt: '',
});
const NOW = new Date(2026, 10, 27, 12).getTime();

describe('claude card helpers', () => {
  const sessions = toClaudeSessions([
    item('claude-session', 'aaaa', 'acme', 'active', { statusLabel: 'active', models: ['m'], startedAt: '2026-11-27T10:00:00Z', lastActivityAt: '2026-11-27T11:00:00Z', messageCount: 3, sidechainMessages: 0, tokens, durationSeconds: 60, activeSeconds: 60, estimatedCostUsd: 1, source: 'claude' }),
    item('claude-session', 'bad', 'x', 'idle', { nonsense: true }),
  ]);
  const usage = toClaudeUsage([
    item('claude-usage', `day:${localDayKey(NOW)}`, 'today', 'day', { models: [], tokens, estimatedCostUsd: 2.5, costIsEstimate: true, messages: 3, sessions: 1, activeSeconds: 600, source: 'claude' }),
  ]);
  it('skips invalid items and summarises today', () => {
    expect(sessions).toHaveLength(1);
    expect(summarizeClaude(sessions, usage, NOW)).toMatchObject({ todayTokens: 3500, todayCostUsd: 2.5, todayActiveSeconds: 600, window5hTokens: 0 });
    expect(summarizeClaude(sessions, usage, NOW).active).toHaveLength(1);
  });
  it('lists waiting sessions first by wait time', () => {
    const base = { ...sessions[0]! };
    const w = (id: string, secs: number) => ({ ...base, externalId: id, status: 'waiting' as const, waitingTool: 'AskUserQuestion', waitingSeconds: secs });
    const sum = summarizeClaude([base, w('w1', 10), w('w2', 99)], [], NOW);
    expect(sum.waiting.map((s) => s.externalId)).toEqual(['w2', 'w1']);
    expect(sum.active).toHaveLength(1);
  });
  it('handles the adapter being absent', () => {
    expect(summarizeClaude([], [], NOW)).toMatchObject({ active: [], todayTokens: 0, todayCostUsd: 0 });
  });
  it('formats', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(12_345)).toBe('12k');
    expect(formatTokens(3_400_000)).toBe('3.40M');
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(2.5)).toBe('$2.50');
  });
});
