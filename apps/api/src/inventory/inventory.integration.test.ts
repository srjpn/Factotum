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
const manifest = (name: string, reports: string[]) => ({
  name,
  version: '0.1.0',
  domain: 'workflows',
  tier: 'observe',
  reports,
  health: '/healthz',
});
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  externalId: id,
  title: `Task ${id}`,
  status: 'todo',
  statusLabel: 'To do',
  source: 'trello',
  ...extra,
});

describe.skipIf(!url)('inventory ingest', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  let base: string;
  let trello: string;
  let jira: string;
  let noReports: string;

  const call = async (method: string, path: string, opts: { token?: string; body?: unknown; raw?: string } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    });
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
  };
  const register = async (name: string, reports: string[]) => {
    const r = await call('POST', '/adapters/register', { token: ADMIN, body: manifest(name, reports) });
    expect(r.status).toBe(201);
    return r.json.token as string;
  };
  const put = (token: string | undefined, items: unknown[], privacyClass = 'personal', kind = 'task') =>
    call('PUT', `/adapters/inventory/${kind}`, { token, body: { privacyClass, items } });
  const list = async (qs = '') => (await call('GET', `/inventory${qs}`, { token: ADMIN })).json as Array<{
    externalId: string;
    adapter: string;
    privacyClass: string;
    observedAt: string;
    updatedAt: string;
    title: string;
  }>;
  const logActions = async () =>
    (await call('GET', '/activity?limit=500', { token: ADMIN })).json.filter(
      (e: { action: string }) => e.action === 'inventory.sync',
    ) as Array<{ actorId: string; risk: string; details: Record<string, unknown> }>;

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
    trello = await register('trello', ['task']);
    jira = await register('jira', ['task']);
    noReports = await register('plain', []);
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  it('rejects a wrong or missing token, and a kind not in the manifest', async () => {
    expect((await put(undefined, [])).status).toBe(401);
    expect((await put('facto_adp_wrong', [])).status).toBe(401);
    expect((await put(ADMIN, [])).status).toBe(401);
    expect((await put(noReports, [task('1')])).status).toBe(403);
    expect((await put(trello, [], 'personal', 'container')).status).toBe(403);
    expect(await list()).toHaveLength(0);
  });

  it('stores a snapshot and replaces it: add, update, remove, unchanged', async () => {
    let r = await put(trello, [task('1'), task('2'), task('3')]);
    expect(r.json).toEqual({ added: 3, updated: 0, removed: 0, unchanged: 0 });
    const first = (await list('?kind=task')).find((i) => i.externalId === '1')!;

    await new Promise((res) => setTimeout(res, 20));
    r = await put(trello, [task('1'), task('2', { title: 'Renamed' }), task('4')]);
    expect(r.json).toEqual({ added: 1, updated: 1, removed: 1, unchanged: 1 });
    const items = await list('?kind=task');
    expect(items.filter((i) => i.adapter === 'trello').map((i) => i.externalId).sort()).toEqual(['1', '2', '4']);
    const again = items.find((i) => i.externalId === '1')!;
    expect(again.updatedAt).toBe(first.updatedAt); // content unchanged
    expect(Date.parse(again.observedAt)).toBeGreaterThan(Date.parse(first.observedAt)); // but seen again
    expect(items.find((i) => i.externalId === '2')!.title).toBe('Renamed');
  });

  it('replaces only the calling adapter\'s items', async () => {
    await put(jira, [task('J-1', { source: 'jira' })], 'client-data');
    await put(trello, []);
    const items = await list('?kind=task');
    expect(items.map((i) => `${i.adapter}:${i.externalId}`)).toEqual(['jira:J-1']);
    await put(trello, [task('1'), task('2')]);
  });

  it('filters by source and privacy class, owner only', async () => {
    expect((await list('?privacy=personal')).every((i) => i.privacyClass === 'personal')).toBe(true);
    expect((await list('?privacy=client-data')).map((i) => i.externalId)).toEqual(['J-1']);
    expect((await list('?source=jira')).map((i) => i.externalId)).toEqual(['J-1']);
    expect((await list('?source=trello')).length).toBe(2);
    expect((await call('GET', '/inventory?privacy=secret', { token: ADMIN })).status).toBe(400);
    expect((await call('GET', '/inventory')).status).toBe(401);
    expect((await call('GET', '/inventory', { token: trello })).status).toBe(401);
  });

  it('rejects the whole call when one item is invalid, or ids repeat', async () => {
    const before = await list('?source=trello');
    const bad = await put(trello, [task('9'), task('10', { status: 'blocked' })]);
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.json)).toContain('items.1.status');
    expect((await put(trello, [task('9'), task('9')])).status).toBe(400);
    expect((await call('PUT', '/adapters/inventory/task', { token: trello, body: { items: [] } })).status).toBe(400);
    expect(await list('?source=trello')).toEqual(before);
  });

  it('rejects oversize input: too many items, too much data, body over 1 MB', async () => {
    expect((await put(trello, Array.from({ length: 2001 }, (_, i) => task(String(i))))).status).toBe(400);
    expect((await put(trello, [task('big', { project: 'x'.repeat(201) })])).status).toBe(400);
    const huge = await call('PUT', '/adapters/inventory/task', {
      token: trello,
      raw: JSON.stringify({ privacyClass: 'personal', items: [task('1', { title: 'y'.repeat(1_100_000) })] }),
    });
    expect(huge.status).toBe(413);
    expect((await list('?source=trello')).length).toBe(2);
  });

  it('logs one inventory.sync entry per changing sync, with counts only', async () => {
    const before = (await logActions()).length;
    await put(trello, [task('1'), task('2')]); // no change
    expect((await logActions()).length).toBe(before);
    await put(trello, [task('1'), task('2'), task('secret-title-5', { title: 'Confidential merger plan' })]);
    const entries = await logActions();
    expect(entries.length).toBe(before + 1);
    expect(entries[0]).toMatchObject({ actorId: 'trello', risk: 'read', details: { added: 1, updated: 0, removed: 0 } });
    const raw = JSON.stringify((await call('GET', '/activity?limit=500', { token: ADMIN })).json);
    expect(raw).not.toContain('Confidential');
  });
});
