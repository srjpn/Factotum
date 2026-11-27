import { describe, expect, it } from 'vitest';
import type { AdapterSummary, Approval, InventoryItem, Node } from '@facto/contracts';
import { adaptersPill, chunkProgress, clampPct, containerCounts, formatDuration, meterTone, nodeSummary, pendingApprovals, primaryNode, runPill, runsToday, taskBoard, toRunRows } from './overview';
import type { TaskRow } from './tasks';

const node = (over: Partial<Node>): Node => ({ id: 'n', name: 'mac', status: 'online', createdAt: 'x', lastHeartbeatAt: null, lastMetrics: null, revokedAt: null, ...over });
const adapter = (over: Partial<AdapterSummary>): AdapterSummary => ({ id: 'a', name: 'jira', version: '1', domain: 'tasks', tier: 'observe', scopes: [], status: 'up', statusDetail: null, lastSeenAt: null, registeredAt: 'x', ...over });
const run = (over: Partial<InventoryItem> & { data?: Record<string, unknown> }): InventoryItem => ({
  id: 'r1', adapter: 'pani', kind: 'run', externalId: 'j1', title: 'Fix login', status: 'done', privacyClass: 'client-data', url: null,
  data: { status: 'done', statusLabel: 'done', source: 'pani', ticketKey: 'ABC-1', chunksDone: 2, chunksTotal: 3, startedAt: '2026-11-27T10:00:00.000Z' },
  observedAt: '2026-11-27T10:00:00.000Z', updatedAt: '2026-11-27T10:00:00.000Z', ...over,
});
const task = (status: TaskRow['status']): TaskRow => ({ id: status + Math.random(), adapter: 'j', title: 't', status, statusLabel: '', source: 'jira', privacyClass: 'personal' });

describe('nodes', () => {
  it('prefers an online node and ignores revoked ones', () => {
    expect(primaryNode([node({ id: 'a', status: 'revoked' }), node({ id: 'b', status: 'offline' }), node({ id: 'c' })])?.id).toBe('c');
    expect(primaryNode([node({ id: 'a', status: 'revoked' }), node({ id: 'b', status: 'offline' })])?.id).toBe('b');
    expect(primaryNode([])).toBeUndefined();
  });
  it('summarises state', () => {
    expect(nodeSummary([node({})])).toMatchObject({ value: 'Online', tone: 'ok' });
    expect(nodeSummary([node({ status: 'offline' })])).toMatchObject({ value: 'Offline', tone: 'bad' });
    expect(nodeSummary([node({ status: 'revoked' })]).value).toBe('None');
  });
  it('picks meter tones and clamps', () => {
    expect([meterTone(10), meterTone(75), meterTone(95)]).toEqual(['ok', 'warn', 'bad']);
    expect([clampPct(120), clampPct(-5), clampPct(NaN)]).toEqual([100, 0, 0]);
  });
});

describe('runs', () => {
  it('maps, sorts newest first and skips non-runs and malformed data', () => {
    const rows = toRunRows([
      run({ id: 'old' }),
      run({ id: 'new', data: { status: 'running', statusLabel: 'r', source: 'pani', startedAt: '2026-11-27T12:00:00.000Z' } }),
      run({ id: 'bad', data: {} }),
      run({ id: 'task', kind: 'task' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
  });
  it('counts runs started today', () => {
    const rows = toRunRows([run({}), run({ id: 'y', data: { status: 'done', statusLabel: '', source: 'pani', startedAt: '2026-11-20T10:00:00.000Z' } })]);
    expect(runsToday(rows, Date.parse('2026-11-27T11:00:00.000Z'))).toBe(1);
  });
  it('labels status, progress and duration', () => {
    expect(runPill('partial')).toEqual({ tone: 'warn', label: 'partial' });
    expect(runPill('failed').tone).toBe('bad');
    expect(chunkProgress({ chunksDone: 2, chunksTotal: 3 })).toBe('2 of 3 chunks');
    expect(chunkProgress({})).toBeUndefined();
    expect([formatDuration(45), formatDuration(360), formatDuration(3900)]).toEqual(['45s', '6 min', '1 h 5 min']);
  });
});

describe('tasks and approvals', () => {
  it('groups tasks into columns and counts other', () => {
    const b = taskBoard([task('todo'), task('todo'), task('in-progress'), task('done'), task('other')]);
    expect([b.todo.length, b['in-progress'].length, b.done.length, b.other]).toEqual([2, 1, 1, 1]);
  });
  it('counts only unexpired pending approvals', () => {
    const a = (status: Approval['status'], expiresAt: string) => ({ status, expiresAt }) as Approval;
    const now = Date.parse('2026-11-27T10:00:00.000Z');
    expect(pendingApprovals([a('pending', '2026-11-28T00:00:00Z'), a('pending', '2026-11-26T00:00:00Z'), a('approved', '2026-11-28T00:00:00Z')], now)).toHaveLength(1);
  });
});

describe('adapters', () => {
  it('summarises reachability', () => {
    expect(adaptersPill([adapter({}), adapter({})])).toEqual({ tone: 'ok', label: 'All adapters reachable' });
    expect(adaptersPill([adapter({}), adapter({ status: 'down' }), adapter({ status: 'down' })])).toEqual({ tone: 'bad', label: '2 down' });
    expect(adaptersPill([adapter({ status: 'degraded' })]).tone).toBe('warn');
    expect(adaptersPill([]).tone).toBe('ne');
  });
  it('counts containers', () => {
    const c = (status: string): InventoryItem => run({ kind: 'container', title: 'web', status, data: { statusLabel: status, source: 'docker', image: 'nginx' } });
    expect(containerCounts([c('running'), c('running'), c('stopped'), run({})])).toEqual({ total: 3, running: 2 });
  });
});
