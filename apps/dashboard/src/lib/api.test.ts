import { describe, expect, it, vi } from 'vitest';
import { listActivity, listNodes } from './api';

const node = {
  id: '3f0c1a52-8a3e-4c1e-9d55-0d2a6f8d7b11',
  name: 'macbook',
  status: 'online',
  createdAt: '2026-11-27T10:00:00.000Z',
  lastHeartbeatAt: '2026-11-27T10:05:00.000Z',
  lastMetrics: { cpuPercent: 12, memory: { usedBytes: 1, totalBytes: 2 }, disk: { usedBytes: 1, totalBytes: 2 } },
  revokedAt: null,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const cfg = (fetchImpl: typeof fetch) => ({ baseUrl: 'http://api.test:3000', token: 't'.repeat(24), fetchImpl });

describe('api client', () => {
  it('parses nodes and sends the bearer token', async () => {
    const f = vi.fn(async () => json([node]));
    const r = await listNodes(cfg(f as unknown as typeof fetch));
    expect(r.ok && r.data[0]?.name).toBe('macbook');
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://api.test:3000/nodes');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${'t'.repeat(24)}`);
  });
  it('passes the limit for activity', async () => {
    const f = vi.fn(async () => json([]));
    await listActivity(cfg(f as unknown as typeof fetch), 25);
    expect(String((f.mock.calls[0] as unknown as [URL])[0])).toBe('http://api.test:3000/activity?limit=25');
  });
  it('reports 401 as unauthorized', async () => {
    const r = await listNodes(cfg((async () => json({}, 401)) as typeof fetch));
    expect(r).toMatchObject({ ok: false, kind: 'unauthorized' });
  });
  it('reports a network failure as unreachable', async () => {
    const r = await listNodes(cfg((async () => { throw new TypeError('fetch failed'); }) as typeof fetch));
    expect(r).toMatchObject({ ok: false, kind: 'unreachable' });
  });
  it('reports other statuses and bad shapes', async () => {
    expect(await listNodes(cfg((async () => json({}, 500)) as typeof fetch))).toMatchObject({ kind: 'http' });
    expect(await listNodes(cfg((async () => json([{ nope: 1 }])) as typeof fetch))).toMatchObject({ kind: 'invalid' });
    expect(await listNodes(cfg((async () => new Response('<html>')) as typeof fetch))).toMatchObject({ kind: 'invalid' });
  });
});

describe('overview endpoints', () => {
  it('requests inventory by kind and parses adapters', async () => {
    const f = vi.fn(async () => json([]));
    const { listAdapters, listInventory } = await import('./api');
    await listInventory(cfg(f as unknown as typeof fetch), 'run');
    expect(String((f.mock.calls[0] as unknown as [URL])[0])).toBe('http://api.test:3000/inventory?kind=run');
    const a = { id: '1', name: 'jira', version: '1', domain: 'tasks', tier: 'observe', scopes: [], status: 'up', statusDetail: '395 issues from 1 project(s)', lastSeenAt: null, registeredAt: '2026-11-27T10:00:00.000Z' };
    const r = await listAdapters(cfg((async () => json([a])) as unknown as typeof fetch));
    expect(r.ok && r.data[0]?.statusDetail).toBe('395 issues from 1 project(s)');
  });
});
