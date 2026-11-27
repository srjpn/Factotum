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

const manifest = (name: string, actions: Array<{ name: string; risk: string }>) => ({
  name,
  version: '0.1.0',
  domain: 'workflows',
  tier: 'control',
  reports: [],
  health: '/healthz',
  actions: actions.map((a) => ({ ...a, permission: `${name}.${a.name}` })),
});

describe.skipIf(!url)('write action runs', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  let base: string;
  let worker: string; // service token of adapter "worker"
  let rival: string;

  const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
  };
  const register = async (m: object) => {
    const r = await call('POST', '/adapters/register', { token: ADMIN, body: m });
    expect(r.status).toBe(201);
    return r.json.token as string;
  };
  const run = (action: string, extra: Record<string, unknown> = {}) =>
    call('POST', '/actions/run', { token: ADMIN, body: { adapter: 'worker', action, params: { x: 1 }, targetType: 'thing', targetId: 't1', ...extra } });
  const claim = (token: string) => call('POST', '/adapters/actions/claim', { token });
  const log = async (...prefixes: string[]) =>
    ((await call('GET', '/activity?limit=500', { token: ADMIN })).json as Array<{ action: string; actorType: string; actorId: string; outcome: string; details: Record<string, unknown> }>)
      .filter((e) => prefixes.some((p) => e.action === p))
      .reverse();

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
    worker = await register(manifest('worker', [{ name: 'safe', risk: 'reversible' }, { name: 'big', risk: 'destructive' }, { name: 'peek', risk: 'read' }]));
    rival = await register(manifest('rival', [{ name: 'safe', risk: 'reversible' }]));
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  it('is owner only and rejects undeclared actions, unknown adapters and read actions', async () => {
    expect((await call('POST', '/actions/run', { body: {} })).status).toBe(401);
    expect((await call('POST', '/actions/run', { token: worker, body: { adapter: 'worker', action: 'safe' } })).status).toBe(401);
    expect((await run('nope')).status).toBe(400);
    expect((await run('safe', { adapter: 'ghost' })).status).toBe(404);
    expect((await run('peek')).status).toBe(400);
    expect((await call('GET', '/actions/runs', { token: worker })).status).toBe(401);
    expect((await call('POST', '/adapters/actions/claim')).status).toBe(401);
  });

  it('queues a reversible action, hands it to its adapter once, and logs every step', async () => {
    const r = await run('safe');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: 'queued', risk: 'reversible', adapter: 'worker', approvalId: null, params: { x: 1 } });

    expect((await claim(rival)).json).toEqual({ run: null }); // adapters never see each other's runs
    const c = await claim(worker);
    expect(c.json.run).toMatchObject({ id: r.json.id, status: 'running', params: { x: 1 } });
    expect((await claim(worker)).json).toEqual({ run: null }); // handed out once

    expect((await call('POST', `/adapters/actions/${r.json.id}/result`, { token: rival, body: { outcome: 'success' } })).status).toBe(404);
    const done = await call('POST', `/adapters/actions/${r.json.id}/result`, { token: worker, body: { outcome: 'success', detail: 'moved' } });
    expect(done.json).toMatchObject({ status: 'succeeded', detail: 'moved' });
    expect((await call('POST', `/adapters/actions/${r.json.id}/result`, { token: worker, body: { outcome: 'success' } })).status).toBe(409);
    expect((await call('GET', `/actions/runs/${r.json.id}`, { token: ADMIN })).json.status).toBe('succeeded');

    const trail = (await log('action.allow', 'action.queue', 'action.start', 'action.result')).filter((e) => e.details['runId'] === r.json.id || e.details['requestedAction'] === 'worker.safe');
    expect(trail.map((e) => [e.action, e.actorType, e.outcome])).toEqual([
      ['action.allow', 'owner', 'success'],
      ['action.queue', 'system', 'success'],
      ['action.start', 'adapter', 'success'],
      ['action.result', 'adapter', 'success'],
    ]);
    expect(trail[3]!.details).toMatchObject({ runId: r.json.id, requestedAction: 'worker.safe', detail: 'moved' });
  });

  it('records a failure reported by the adapter', async () => {
    const r = await run('safe');
    await claim(worker);
    const done = await call('POST', `/adapters/actions/${r.json.id}/result`, { token: worker, body: { outcome: 'failure', detail: 'boom' } });
    expect(done.json).toMatchObject({ status: 'failed', detail: 'boom' });
    expect((await log('action.result')).at(-1)).toMatchObject({ outcome: 'failure', details: { detail: 'boom' } });
  });

  it('holds a destructive action for approval, then queues it only after the owner approves', async () => {
    const r = await run('big', { summary: 'Delete the thing' });
    expect(r.json).toMatchObject({ status: 'awaiting_approval', risk: 'destructive' });
    expect(r.json.approvalId).toBeTruthy();
    expect((await claim(worker)).json).toEqual({ run: null });

    expect((await call('POST', `/approvals/${r.json.approvalId}/approve`, { token: ADMIN })).status).toBe(200);
    expect((await call('GET', `/actions/runs/${r.json.id}`, { token: ADMIN })).json.status).toBe('queued');
    const c = await claim(worker);
    expect(c.json.run).toMatchObject({ id: r.json.id, action: 'big' });
    await call('POST', `/adapters/actions/${r.json.id}/result`, { token: worker, body: { outcome: 'success' } });

    const trail = (await log('approval.request', 'approval.approve', 'action.queue', 'action.start', 'action.result')).filter((e) => e.details['requestedAction'] === 'worker.big');
    expect(trail.map((e) => e.action)).toEqual(['approval.request', 'approval.approve', 'action.queue', 'action.start', 'action.result']);
  });

  it('cancels a run whose approval is denied and never hands it out', async () => {
    const r = await run('big');
    await call('POST', `/approvals/${r.json.approvalId}/deny`, { token: ADMIN });
    expect((await call('GET', `/actions/runs/${r.json.id}`, { token: ADMIN })).json).toMatchObject({ status: 'cancelled', detail: 'approval denied' });
    expect((await claim(worker)).json).toEqual({ run: null });
    expect((await log('action.cancel')).at(-1)).toMatchObject({ outcome: 'denied', details: { runId: r.json.id } });
  });

  it('fails an approved run that is never claimed, and a claimed run that never reports', async () => {
    const queued = await run('safe');
    const claimed = await run('safe');
    await claim(worker); // takes the oldest, which is `queued`
    await pool.query(`UPDATE action_runs SET queued_at = now() - interval '2 hours' WHERE id = $1`, [claimed.json.id]);
    await pool.query(`UPDATE action_runs SET started_at = now() - interval '1 hour' WHERE id = $1`, [queued.json.id]);
    const list = (await call('GET', '/actions/runs', { token: ADMIN })).json as Array<{ id: string; status: string; detail: string }>;
    expect(list.find((x) => x.id === queued.json.id)).toMatchObject({ status: 'failed', detail: 'no result reported by the adapter' });
    expect(list.find((x) => x.id === claimed.json.id)).toMatchObject({ status: 'failed', detail: 'not claimed by the adapter in time' });
    expect((await claim(worker)).json).toEqual({ run: null });
  });

  it('updates a manifest to add an action without changing the token, owner only', async () => {
    expect((await call('PUT', '/adapters/rival/manifest', { token: rival, body: {} })).status).toBe(401);
    expect((await run('late', { adapter: 'rival' })).status).toBe(400);
    const m = manifest('rival', [{ name: 'safe', risk: 'reversible' }, { name: 'late', risk: 'reversible' }]);
    expect((await call('PUT', '/adapters/rival/manifest', { token: ADMIN, body: { ...m, name: 'other' } })).status).toBe(400);
    expect((await call('PUT', '/adapters/ghost/manifest', { token: ADMIN, body: manifest('ghost', []) })).status).toBe(404);
    expect((await call('PUT', '/adapters/rival/manifest', { token: ADMIN, body: m })).status).toBe(200);
    expect((await run('late', { adapter: 'rival' })).json.status).toBe('queued');
    expect((await claim(rival)).json.run.action).toBe('late');
    expect((await log('adapter.manifest.update')).at(-1)).toMatchObject({ outcome: 'success' });
  });
});
