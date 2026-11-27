import { describe, expect, it } from 'vitest';
import { INVENTORY_KINDS, isInventoryKind } from './inventory.js';

const ok = { externalId: '1', title: 'T', status: 'todo', statusLabel: 'To do', source: 'trello' };

describe('task item', () => {
  it('accepts a minimal and a full item', () => {
    expect(INVENTORY_KINDS.task.safeParse(ok).success).toBe(true);
    expect(
      INVENTORY_KINDS.task.safeParse({ ...ok, url: 'https://x.test/1', project: 'p', assignee: 'a', updatedAt: '2026-11-27T10:00:00Z' }).success,
    ).toBe(true);
  });
  it('rejects a bad status, a missing title and a bad url', () => {
    expect(INVENTORY_KINDS.task.safeParse({ ...ok, status: 'blocked' }).success).toBe(false);
    expect(INVENTORY_KINDS.task.safeParse({ ...ok, title: '' }).success).toBe(false);
    expect(INVENTORY_KINDS.task.safeParse({ ...ok, url: 'nope' }).success).toBe(false);
  });
  it('knows its kinds', () => {
    expect(isInventoryKind('task')).toBe(true);
    expect(isInventoryKind('toString')).toBe(false);
  });
});
