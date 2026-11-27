import { describe, expect, it, vi } from 'vitest';
import { decideApproval, listApprovals } from './approvals';

const cfg = (f: unknown) => ({ baseUrl: 'http://api.test:3000', token: 't'.repeat(24), fetchImpl: f as typeof fetch });
const approval = {
  id: '3f0c1a52-8a3e-4c1e-9d55-0d2a6f8d7b11',
  action: 'docker.container.restart',
  risk: 'destructive',
  targetType: null,
  targetId: null,
  summary: null,
  params: {},
  requesterType: 'adapter',
  requesterId: 'docker',
  status: 'pending',
  requestedAt: '2026-11-27T10:00:00.000Z',
  expiresAt: '2026-11-28T10:00:00.000Z',
  decidedAt: null,
  decidedBy: null,
};

describe('approvals client', () => {
  it('lists approvals', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([approval])));
    const r = await listApprovals(cfg(f));
    expect(r.ok && r.data[0]?.action).toBe('docker.container.restart');
  });

  it('posts a decision with the bearer token', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    expect(await decideApproval(cfg(f), approval.id, 'approve')).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe(`http://api.test:3000/approvals/${approval.id}/approve`);
    expect(init?.method).toBe('POST');
  });

  it('explains conflicts and failures', async () => {
    const r = await decideApproval(cfg(async () => new Response('', { status: 409 })), approval.id, 'deny');
    expect(r.ok === false && r.message).toMatch(/already decided/);
    const down = await decideApproval(cfg(async () => Promise.reject(new Error('x'))), approval.id, 'deny');
    expect(down.ok === false && down.message).toMatch(/unreachable/);
  });
});
