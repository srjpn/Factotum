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

describe.skipIf(!url)('privacy check', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  let base: string;
  let adapter: string;

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
  const check = (token: string | undefined, body: unknown) => call('POST', '/privacy/check', { token, body });
  const denials = async () =>
    (await call('GET', '/activity?limit=500', { token: ADMIN })).json.filter(
      (e: { action: string }) => e.action === 'privacy.deny',
    ) as Array<{ actorType: string; actorId: string; outcome: string; targetId: string; details: Record<string, unknown> }>;

  beforeAll(async () => {
    const schema = `test_${randomBytes(6).toString('hex')}`;
    const admin = createPool(url!);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    pool = createPool(url!, schema);
    await runMigrations(pool);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue({
        port: 0,
        databaseUrl: url!,
        adminToken: ADMIN,
        privacy: { 'client-data': ['macbook'], personal: '*' },
      })
      .overrideProvider(POOL)
      .useValue(pool)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.listen(0);
    base = await app.getUrl();
    const r = await call('POST', '/adapters/register', {
      token: ADMIN,
      body: { name: 'jira', version: '0.1.0', domain: 'workflows', tier: 'observe', reports: ['task'], health: '/healthz' },
    });
    adapter = r.json.token;
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  it('requires a credential and a valid body', async () => {
    expect((await check(undefined, { privacyClass: 'personal', target: 'x' })).status).toBe(401);
    expect((await check(ADMIN, { target: 'x' })).status).toBe(400);
    expect((await check(ADMIN, { privacyClass: 'secret', target: 'x' })).status).toBe(400);
    expect((await check(ADMIN, { privacyClass: 'personal', itemId: crypto.randomUUID(), target: 'x' })).status).toBe(400);
  });

  it('allows a listed target without logging', async () => {
    const r = await check(adapter, { privacyClass: 'client-data', target: 'macbook' });
    expect(r.status).toBe(200);
    expect(r.json.decision).toBe('allow');
    expect(await denials()).toHaveLength(0);
  });

  it('refuses client-data on an unlisted target and logs it without content', async () => {
    const r = await check(adapter, { privacyClass: 'client-data', target: 'cloud-gpu', action: 'pani.run.start' });
    expect(r.json).toMatchObject({ decision: 'deny', privacyClass: 'client-data', target: 'cloud-gpu' });
    const [entry] = await denials();
    expect(entry).toMatchObject({ actorType: 'adapter', actorId: 'jira', outcome: 'denied', targetId: 'cloud-gpu' });
    expect(entry!.details).toMatchObject({ privacyClass: 'client-data', requestedAction: 'pani.run.start' });
  });

  it('reads the class from an inventory item and refuses unknown items', async () => {
    const put = await call('PUT', '/adapters/inventory/task', {
      token: adapter,
      body: {
        privacyClass: 'client-data',
        items: [{ externalId: 'J-1', title: 'Secret client title', status: 'todo', statusLabel: 'To do', source: 'jira' }],
      },
    });
    expect(put.status).toBe(200);
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM inventory_items');
    const id = rows[0]!.id;
    expect((await check(ADMIN, { itemId: id, target: 'macbook' })).json.decision).toBe('allow');
    const denied = await check(ADMIN, { itemId: id, target: 'elsewhere' });
    expect(denied.json).toMatchObject({ decision: 'deny', privacyClass: 'client-data' });
    const unknown = await check(ADMIN, { itemId: crypto.randomUUID(), target: 'macbook' });
    expect(unknown.json).toMatchObject({ decision: 'deny', privacyClass: null });
    const all = await denials();
    expect(all.length).toBe(3);
    expect(JSON.stringify(all)).not.toContain('Secret client title');
  });

  it('lets personal work run anywhere and exposes the policy to the owner only', async () => {
    expect((await check(ADMIN, { privacyClass: 'personal', target: 'anywhere' })).json.decision).toBe('allow');
    expect((await call('GET', '/privacy/policy', { token: adapter })).status).toBe(401);
    expect((await call('GET', '/privacy/policy', { token: ADMIN })).json).toEqual({
      'client-data': ['macbook'],
      personal: '*',
    });
  });
});
