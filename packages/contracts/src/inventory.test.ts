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

describe('run item', () => {
  const run = { externalId: 'j-1', title: 'T', status: 'partial', statusLabel: 'partial', source: 'pani' };
  it('accepts minimal and full items and knows the kind', () => {
    expect(isInventoryKind('run')).toBe(true);
    expect(INVENTORY_KINDS.run.safeParse(run).success).toBe(true);
    expect(
      INVENTORY_KINDS.run.safeParse({
        ...run,
        ticketKey: 'ABC-12',
        repo: 'web',
        chunksDone: 1,
        chunksTotal: 2,
        startedAt: '2026-11-27T10:00:00Z',
        finishedAt: '2026-11-27T10:05:00Z',
        durationSeconds: 300,
        error: 'x',
      }).success,
    ).toBe(true);
  });
  it('rejects unknown statuses, bad ticket keys and long errors, and drops unknown fields', () => {
    expect(INVENTORY_KINDS.run.safeParse({ ...run, status: 'cancelled' }).success).toBe(false);
    expect(INVENTORY_KINDS.run.safeParse({ ...run, ticketKey: 'abc-1' }).success).toBe(false);
    expect(INVENTORY_KINDS.run.safeParse({ ...run, error: 'x'.repeat(201) }).success).toBe(false);
    const parsed = INVENTORY_KINDS.run.parse({ ...run, diff: 'secret' });
    expect('diff' in parsed).toBe(false);
  });
});

describe('container item', () => {
  const c = { externalId: 'abc123', name: 'web', image: 'nginx:1', status: 'running', statusLabel: 'running', source: 'docker' };
  it('is a known kind and accepts minimal and full items', () => {
    expect(isInventoryKind('container')).toBe(true);
    expect(INVENTORY_KINDS.container.safeParse(c).success).toBe(true);
    const full = { ...c, health: 'healthy', composeProject: 'facto', startedAt: '2026-11-27T10:00:00Z', ports: ['127.0.0.1:3000->3000/tcp'] };
    expect(INVENTORY_KINDS.container.safeParse(full).success).toBe(true);
  });
  it('rejects a bad status and strips unknown fields such as env', () => {
    expect(INVENTORY_KINDS.container.safeParse({ ...c, status: 'paused' }).success).toBe(false);
    expect(INVENTORY_KINDS.container.parse({ ...c, env: ['A=1'] })).not.toHaveProperty('env');
  });
});

describe('backup and service items', () => {
  it('backup is a known kind and strips unknown fields', () => {
    const b = { externalId: 'timemachine', title: 'Time Machine', status: 'ok', statusLabel: 'fine', running: false, destinationReachable: true, source: 'tmutil' };
    expect(isInventoryKind('backup')).toBe(true);
    expect(INVENTORY_KINDS.backup.safeParse(b).success).toBe(true);
    expect(INVENTORY_KINDS.backup.safeParse({ ...b, status: 'bad' }).success).toBe(false);
    expect(INVENTORY_KINDS.backup.parse({ ...b, path: '/Volumes/x' })).not.toHaveProperty('path');
  });
  it('service is a known kind, bounds the port and strips args and env', () => {
    const s = { externalId: 'tcp:3000', title: 'node', status: 'listening', statusLabel: 'x', port: 3000, process: 'node', bind: 'localhost', source: 'lsof' };
    expect(isInventoryKind('service')).toBe(true);
    expect(INVENTORY_KINDS.service.safeParse(s).success).toBe(true);
    expect(INVENTORY_KINDS.service.safeParse({ ...s, port: 70000 }).success).toBe(false);
    const parsed = INVENTORY_KINDS.service.parse({ ...s, args: ['--token', 'x'], env: ['A=1'] });
    expect(parsed).not.toHaveProperty('args');
    expect(parsed).not.toHaveProperty('env');
  });
});
