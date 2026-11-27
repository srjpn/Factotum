import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '@facto/contracts';
import { backupPill, bindLabel, containerPill, exposedCount, toBackups, toContainers, toServices } from './local';

const item = (kind: string, externalId: string, title: string, status: string, data: Record<string, unknown>): InventoryItem => ({
  id: externalId, adapter: 'a', kind, externalId, title, status, privacyClass: 'personal', url: null, data, observedAt: '', updatedAt: '',
});
const svc = (port: number, process: string, bind: string) => item('service', `tcp:${port}`, process, 'listening', { statusLabel: 'listening', port, process, bind, source: 'devservers' });

describe('local card helpers', () => {
  it('parses backups and skips invalid', () => {
    const b = toBackups([
      item('backup', 'timemachine', 'Time Machine', 'unavailable', { statusLabel: 'x', running: false, destinationReachable: false, source: 'timemachine' }),
      item('backup', 'bad', 'bad', 'ok', {}),
    ]);
    expect(b).toHaveLength(1);
    expect(b[0]?.status).toBe('unavailable');
    expect(backupPill('stale').tone).toBe('warn');
    expect(backupPill('unavailable').label).toBe('unavailable');
  });
  it('sorts services by port and counts exposed', () => {
    const s = toServices([svc(5173, 'node', 'all'), svc(3000, 'node', 'localhost'), item('service', 'x', 'bad', 'listening', {})]);
    expect(s.map((x) => x.port)).toEqual([3000, 5173]);
    expect(exposedCount(s)).toBe(1);
    expect(bindLabel('all')).toBe('all interfaces');
    expect(bindLabel('localhost')).toBe('localhost');
  });
  it('sorts containers with problems first', () => {
    const c = (n: string, status: string, extra: Record<string, unknown> = {}) => item('container', n, n, status, { image: 'i', statusLabel: status, source: 'docker', ...extra });
    const list = toContainers([c('b', 'running'), c('a', 'running'), c('z', 'stopped'), c('y', 'running', { health: 'unhealthy' })]);
    expect(list.map((x) => x.name)).toEqual(['y', 'z', 'a', 'b']);
    expect(containerPill(list[0]!).tone).toBe('bad');
    expect(containerPill({ status: 'running' }).label).toBe('running');
  });
});
