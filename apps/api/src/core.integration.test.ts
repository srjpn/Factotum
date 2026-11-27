import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { CONFIG } from './auth/admin.guard.js';
import { createPool, POOL } from './db/db.js';
import { runMigrations } from './db/migrate.js';
import { NodeStatusMonitor } from './nodes/node-status.monitor.js';

// Runs against a real Postgres. Set FACTO_TEST_DATABASE_URL to enable, for example:
//   docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine
//   FACTO_TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres pnpm test
const url = process.env['FACTO_TEST_DATABASE_URL'];
const ADMIN = 'test-admin-token-with-enough-length';
const heartbeat = {
  cpuPercent: 12.5,
  memory: { usedBytes: 4_000_000_000, totalBytes: 16_000_000_000 },
  disk: { usedBytes: 100_000_000_000, totalBytes: 500_000_000_000 },
};

describe.skipIf(!url)('core API (nodes, enrolment, activity log)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let base: string;

  const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    // Test helper: responses are checked field by field, so loose typing is fine here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
  };

  const enrolNode = async (nodeName: string) => {
    const created = await call('POST', '/nodes/enrolment-tokens', { token: ADMIN, body: { nodeName } });
    expect(created.status).toBe(201);
    const enrolled = await call('POST', '/nodes/enrol', { body: { token: created.json.token } });
    expect(enrolled.status).toBe(201);
    return { enrolmentToken: created.json.token as string, ...enrolled.json } as {
      enrolmentToken: string;
      nodeId: string;
      credential: string;
    };
  };

  beforeAll(async () => {
    const schema = `test_${randomBytes(6).toString('hex')}`;
    const admin = createPool(url!);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    pool = createPool(url!, schema);
    await runMigrations(pool);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue({ port: 0, databaseUrl: url!, adminToken: ADMIN, offlineAfterSeconds: 90, statusCheckSeconds: 0 })
      .overrideProvider(POOL)
      .useValue(pool)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  it('protects owner routes', async () => {
    expect((await call('GET', '/nodes')).status).toBe(401);
    expect((await call('GET', '/nodes', { token: 'wrong-token' })).status).toBe(401);
    expect((await call('GET', '/activity')).status).toBe(401);
    expect((await call('POST', '/nodes/enrolment-tokens', { body: { nodeName: 'x' } })).status).toBe(401);
  });

  it('exchanges a one-time token for a credential and accepts heartbeats', async () => {
    const node = await enrolNode('laptop-a');
    const beat = await call('POST', '/nodes/heartbeat', { token: node.credential, body: heartbeat });
    expect(beat.status).toBe(204);

    const list = await call('GET', '/nodes', { token: ADMIN });
    const found = list.json.find((n: { id: string }) => n.id === node.nodeId);
    expect(found.name).toBe('laptop-a');
    expect(found.lastMetrics.cpuPercent).toBe(12.5);
    expect(found.lastHeartbeatAt).not.toBeNull();
    expect(JSON.stringify(list.json)).not.toContain(node.credential);
  });

  it('does not accept an enrolment token twice', async () => {
    const node = await enrolNode('laptop-b');
    const again = await call('POST', '/nodes/enrol', { body: { token: node.enrolmentToken } });
    expect(again.status).toBe(401);
  });

  it('rejects an expired enrolment token', async () => {
    const created = await call('POST', '/nodes/enrolment-tokens', { token: ADMIN, body: { nodeName: 'laptop-c' } });
    await pool.query("UPDATE enrolment_tokens SET expires_at = now() - interval '1 minute' WHERE node_name = 'laptop-c'");
    const res = await call('POST', '/nodes/enrol', { body: { token: created.json.token } });
    expect(res.status).toBe(401);
  });

  it('rejects heartbeats with an unknown, missing or malformed credential', async () => {
    expect((await call('POST', '/nodes/heartbeat', { token: 'facto_node_unknown', body: heartbeat })).status).toBe(401);
    expect((await call('POST', '/nodes/heartbeat', { body: heartbeat })).status).toBe(401);
    const node = await enrolNode('laptop-d');
    expect((await call('POST', '/nodes/heartbeat', { token: node.credential, body: { cpuPercent: 500 } })).status).toBe(400);
  });

  it('rejects a second node with the same name and leaves the token unused', async () => {
    await enrolNode('laptop-e');
    const created = await call('POST', '/nodes/enrolment-tokens', { token: ADMIN, body: { nodeName: 'laptop-e' } });
    const res = await call('POST', '/nodes/enrol', { body: { token: created.json.token } });
    expect(res.status).toBe(409);
    const row = await pool.query("SELECT used_at FROM enrolment_tokens WHERE node_name = 'laptop-e' AND used_at IS NULL");
    expect(row.rowCount).toBe(1);
  });

  it('stops accepting a revoked node', async () => {
    const node = await enrolNode('laptop-f');
    expect((await call('POST', '/nodes/heartbeat', { token: node.credential, body: heartbeat })).status).toBe(204);
    expect((await call('POST', `/nodes/${node.nodeId}/revoke`, { token: ADMIN })).status).toBe(204);
    expect((await call('POST', '/nodes/heartbeat', { token: node.credential, body: heartbeat })).status).toBe(401);
  });

  it('writes the activity log for every mutation without leaking secrets', async () => {
    const node = await enrolNode('laptop-g');
    await call('POST', `/nodes/${node.nodeId}/revoke`, { token: ADMIN });
    await call('POST', '/nodes/enrol', { body: { token: 'facto_enrol_not-a-real-token' } });

    const log = await call('GET', '/activity?limit=500', { token: ADMIN });
    const actions = log.json.map((e: { action: string; outcome: string }) => `${e.action}:${e.outcome}`);
    expect(actions).toContain('node.enrolment-token.create:success');
    expect(actions).toContain('node.enrol:success');
    expect(actions).toContain('node.revoke:success');
    expect(actions).toContain('node.enrol:denied');
    for (const entry of log.json) {
      expect(['read', 'reversible', 'destructive', 'privileged']).toContain(entry.risk);
    }
    const text = JSON.stringify(log.json);
    expect(text).not.toContain(node.credential);
    expect(text).not.toContain(node.enrolmentToken);
  });

  it('marks a silent node offline and online again, logging each change once', async () => {
    const monitor = app.get(NodeStatusMonitor);
    const node = await enrolNode('laptop-s');
    const statusOf = async () =>
      (await call('GET', '/nodes', { token: ADMIN })).json.find((n: { id: string }) => n.id === node.nodeId).status;
    const changes = async () =>
      (await call('GET', '/activity?limit=500', { token: ADMIN })).json
        .filter((e: { targetId: string; actorId: string }) => e.targetId === node.nodeId && e.actorId === 'node-status-monitor')
        .map((e: { action: string }) => e.action)
        .reverse();

    expect(await statusOf()).toBe('pending');
    await call('POST', '/nodes/heartbeat', { token: node.credential, body: heartbeat });
    expect(await statusOf()).toBe('online');
    await monitor.check();

    await pool.query("UPDATE nodes SET last_heartbeat_at = now() - interval '3 minutes' WHERE id = $1", [node.nodeId]);
    expect(await statusOf()).toBe('offline');
    await monitor.check();
    await monitor.check();

    await call('POST', '/nodes/heartbeat', { token: node.credential, body: heartbeat });
    expect(await statusOf()).toBe('online');
    await monitor.check();

    expect(await changes()).toEqual(['node.online', 'node.offline', 'node.online']);
  });

  it('makes the activity log append-only', async () => {
    await enrolNode('laptop-h');
    await expect(pool.query("UPDATE activity_log SET action = 'tampered'")).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM activity_log')).rejects.toThrow(/append-only/);
    await expect(pool.query('TRUNCATE activity_log')).rejects.toThrow(/append-only/);
    expect((await call('DELETE', '/activity', { token: ADMIN })).status).toBe(404);
  });
});
