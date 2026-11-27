import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '@facto/contracts';
import { filterTasks, parseSource, taskSources, toTaskRows } from './tasks';

const item = (over: Partial<InventoryItem> & { data?: Record<string, unknown> }): InventoryItem => ({
  id: 'i1', adapter: 'jira', kind: 'task', externalId: 'ABC-1', title: 'Fix it', status: 'todo', privacyClass: 'client-data',
  url: 'https://x.test/ABC-1', observedAt: '2026-11-27T10:00:00.000Z', updatedAt: '2026-11-27T10:00:00.000Z',
  data: { status: 'todo', statusLabel: 'To Do', source: 'jira', project: 'ABC', assignee: 'sam' },
  ...over,
});

describe('tasks', () => {
  it('reads status from the item when data omits it (real API shape)', () => {
    const [r] = toTaskRows([item({ status: 'in-progress', data: { statusLabel: 'In Progress', source: 'jira' } })]);
    expect(r?.status).toBe('in-progress');
  });
  it('maps task items and keeps privacy class', () => {
    const [r] = toTaskRows([item({})]);
    expect(r).toMatchObject({ title: 'Fix it', source: 'jira', project: 'ABC', assignee: 'sam', privacyClass: 'client-data', url: 'https://x.test/ABC-1' });
  });
  it('skips other kinds and malformed data', () => {
    expect(toTaskRows([item({ kind: 'run' }), item({ id: 'i2', data: {} })])).toEqual([]);
  });
  it('drops non-http links', () => {
    const [r] = toTaskRows([item({ url: null, data: { status: 'todo', statusLabel: 'x', source: 'jira', url: 'https://ok.test/a' } })]);
    expect(r?.url).toBe('https://ok.test/a');
    expect(toTaskRows([item({ url: 'javascript:alert(1)', data: { status: 'todo', statusLabel: 'x', source: 'jira' } })])[0]?.url).toBeUndefined();
  });
  it('lists sources and filters', () => {
    const rows = toTaskRows([item({}), item({ id: 'i3', adapter: 'trello', privacyClass: 'personal', data: { status: 'done', statusLabel: 'Done', source: 'trello' } })]);
    expect(taskSources(rows)).toEqual(['jira', 'trello']);
    expect(filterTasks(rows, 'trello')).toHaveLength(1);
    expect(filterTasks(rows)).toHaveLength(2);
  });
  it('parses the source param safely', () => {
    expect(parseSource('jira', ['jira', 'trello'])).toBe('jira');
    expect(parseSource('evil', ['jira'])).toBeUndefined();
    expect(parseSource(undefined, ['jira'])).toBeUndefined();
  });
});
