import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { CONFIG } from '../auth/admin.guard.js';
import { createPool, POOL } from '../db/db.js';
import { runMigrations } from '../db/migrate.js';
import { configureApp } from '../http.js';

// Runs against a real Postgres when FACTO_TEST_DATABASE_URL is set (see core.integration.test.ts).
const url = process.env['FACTO_TEST_DATABASE_URL'];
const ADMIN = 'test-admin-token-with-enough-length';

describe.skipIf(!url)('policy and approvals', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  let base: string;
  let docker: string;
  let other: string;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
  };
  const register = async (name: string) => {
    const r = await call('POST', '/adapters/register', {
      token: ADMIN,
      body: { name, version: '0.1.0', domain: 'hosting', tier: 'observe', reports: [], health: '/healthz' },
    });
    expect(r.status).toBe(201);
    return r.json.token as string;
  };
  const ask = (token: string | undefined, risk: string, extra: Record<string, unknown> = {}) =>
    call('POST', '/actions/request', {
      token,
      body: { action: 'docker.container.restart', risk, targetType: 'container', targetId: 'web', ...extra },
    });
  const log = async (prefix: string) =>
    (await call('GET', '/activity?limit=500', { token: ADMIN })).json.filter((e: { action: string }) =>
      e.action.startsWith(prefix),
    ) as Array<{ action: string; actorType: string; actorId: string; outcome: string; risk: string; details: Record<string, unknown> }>;

  beforeAll(async () => {
    const schema = `test_${randomBytes(6).toString('hex')}`;
    const admin = createPool(url!);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    pool = createPool(url!, schema);
    await runMigrations(pool);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue({ port: 0, databaseUrl: url!, adminToken: ADMIN })
      .overrideProvider(POOL)
      .useValue(pool)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.listen(0);
    base = await app.getUrl();
    docker = await register('docker');
    other = await register('other');
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  it('requires a credential and a valid request', async () => {
    expect((await ask(undefined, 'read')).status).toBe(401);
    expect((await ask('facto_adp_wrong', 'read')).status).toBe(401);
    expect((await ask(ADMIN, 'nonsense')).status).toBe(400);
    expect((await call('POST', '/actions/request', { token: ADMIN, body: { risk: 'read' } })).status).toBe(400);
    expect((await call('GET', '/approvals')).status).toBe(401);
    expect((await call('GET', '/approvals', { token: docker })).status).toBe(401);
  });

  it('allows read and reversible actions at once and logs them', async () => {
    for (const risk of ['read', 'reversible']) {
      const r = await ask(docker, risk);
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ decision: 'allowed', approval: null });
    }
    const entries = await log('action.allow');
    expect(entries.map((e) => e.risk).sort()).toEqual(['read', 'reversible']);
    expect(entries[0]).toMatchObject({ actorType: 'adapter', actorId: 'docker' });
    expect(entries[0]!.details['requestedAction']).toBe('docker.container.restart');
    expect((await call('GET', '/approvals?status=pending', { token: ADMIN })).json).toHaveLength(0);
  });

  it('holds destructive and privileged actions for the owner', async () => {
    for (const risk of ['destructive', 'privileged']) {
      const r = await ask(docker, risk, { summary: 'Restart web', params: { grace: 5 } });
      expect(r.json.decision).toBe('pending');
      expect(r.json.approval).toMatchObject({ status: 'pending', risk, requesterId: 'docker', params: { grace: 5 } });
    }
    const pending = (await call('GET', '/approvals?status=pending', { token: ADMIN })).json;
    expect(pending).toHaveLength(2);
    expect((await log('approval.request')).length).toBe(2);
  });

  it('approves once, records the approver, and rejects a second decision', async () => {
    const id = (await ask(docker, 'destructive')).json.approval.id as string;
    expect((await call('POST', `/approvals/${id}/approve`, { token: docker })).status).toBe(401);
    expect((await call('POST', `/approvals/${id}/approve`)).status).toBe(401);

    const ok = await call('POST', `/approvals/${id}/approve`, { token: ADMIN });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ status: 'approved', decidedBy: 'owner' });

    expect((await call('POST', `/approvals/${id}/approve`, { token: ADMIN })).status).toBe(409);
    expect((await call('POST', `/approvals/${id}/deny`, { token: ADMIN })).status).toBe(409);

    const entry = (await log('approval.approve')).find((e) => e.details['approvalId'] === id)!;
    expect(entry).toMatchObject({ actorType: 'owner', actorId: 'owner', outcome: 'success', risk: 'destructive' });
    expect(entry.details).toMatchObject({ approver: 'owner', requester: 'adapter:docker' });

    // the requester can see the outcome
    expect((await call('GET', `/approvals/${id}`, { token: docker })).json.status).toBe('approved');
  });

  it('denies and logs the decision', async () => {
    const id = (await ask(docker, 'privileged')).json.approval.id as string;
    const r = await call('POST', `/approvals/${id}/deny`, { token: ADMIN });
    expect(r.json).toMatchObject({ status: 'denied', decidedBy: 'owner' });
    const entry = (await log('approval.deny')).find((e) => e.details['approvalId'] === id)!;
    expect(entry).toMatchObject({ actorType: 'owner', outcome: 'denied', risk: 'privileged' });
  });

  it('expires overdue requests, logs it, and refuses to approve them', async () => {
    const id = (await ask(docker, 'destructive')).json.approval.id as string;
    await pool.query(`UPDATE approvals SET expires_at = now() - interval '1 second' WHERE id = $1`, [id]);
    const late = await call('POST', `/approvals/${id}/approve`, { token: ADMIN });
    expect(late.status).toBe(409);
    expect((await call('GET', `/approvals/${id}`, { token: ADMIN })).json.status).toBe('expired');
    const entries = (await log('approval.expire')).filter((e) => e.details['approvalId'] === id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorType: 'system', outcome: 'denied' });
  });

  it('shows an adapter only its own requests, and 404s unknown ids', async () => {
    const id = (await ask(docker, 'destructive')).json.approval.id as string;
    expect((await call('GET', `/approvals/${id}`, { token: other })).status).toBe(404);
    expect((await call('GET', `/approvals/${id}`, { token: docker })).status).toBe(200);
    expect((await call('GET', '/approvals/not-an-id', { token: ADMIN })).status).toBe(404);
    expect((await call('POST', '/approvals/00000000-0000-0000-0000-000000000000/approve', { token: ADMIN })).status).toBe(404);
  });

  it('lets only one of two concurrent decisions win', async () => {
    const id = (await ask(docker, 'destructive')).json.approval.id as string;
    const results = await Promise.all([
      call('POST', `/approvals/${id}/approve`, { token: ADMIN }),
      call('POST', `/approvals/${id}/deny`, { token: ADMIN }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const decisions = (await log('approval.')).filter(
      (e) => ['approval.approve', 'approval.deny'].includes(e.action) && e.details['approvalId'] === id,
    );
    expect(decisions).toHaveLength(1);
  });
});
