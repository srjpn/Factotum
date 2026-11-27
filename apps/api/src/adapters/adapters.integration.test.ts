import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { CONFIG } from '../auth/admin.guard.js';
import { createPool, POOL } from '../db/db.js';
import { runMigrations } from '../db/migrate.js';

// Runs against a real Postgres when FACTO_TEST_DATABASE_URL is set (see core.integration.test.ts).
const url = process.env['FACTO_TEST_DATABASE_URL'];
const ADMIN = 'test-admin-token-with-enough-length';
const manifest = {
  name: 'docker',
  version: '0.1.0',
  domain: 'hosting',
  tier: 'control',
  actions: [{ name: 'restart-container', permission: 'hosting.restart', risk: 'reversible' }],
  health: '/healthz',
};

describe.skipIf(!url)('adapter registration API', () => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
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
      .useValue({ port: 0, databaseUrl: url!, adminToken: ADMIN })
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

  it('requires the owner token to register or list', async () => {
    expect((await call('POST', '/adapters/register', { body: manifest })).status).toBe(401);
    expect((await call('POST', '/adapters/register', { token: 'wrong', body: manifest })).status).toBe(401);
    expect((await call('GET', '/adapters')).status).toBe(401);
  });

  it('registers, stores only a token hash, and logs register and token issue', async () => {
    const reg = await call('POST', '/adapters/register', { token: ADMIN, body: manifest });
    expect(reg.status).toBe(201);
    expect(reg.json.token).toMatch(/^facto_adp_/);

    const row = await pool.query('SELECT token_hash FROM adapters WHERE name = $1', ['docker']);
    expect(row.rows[0].token_hash).not.toBe(reg.json.token);
    expect(row.rows[0].token_hash).toHaveLength(64);

    const list = await call('GET', '/adapters', { token: ADMIN });
    expect(list.json.map((a: { name: string }) => a.name)).toContain('docker');
    expect(JSON.stringify(list.json)).not.toContain(reg.json.token);

    const log = await call('GET', '/activity?limit=500', { token: ADMIN });
    const actions = log.json.map((e: { action: string; risk: string; outcome: string }) => `${e.action}:${e.risk}:${e.outcome}`);
    expect(actions).toContain('adapter.register:privileged:success');
    expect(actions).toContain('adapter.token.issue:privileged:success');
    expect(JSON.stringify(log.json)).not.toContain(reg.json.token);
  });

  it('rejects an undeclared risk level, logging the denial, and a duplicate name', async () => {
    const bad = { ...manifest, name: 'bad', actions: [{ ...manifest.actions[0], risk: 'harmless' }] };
    expect((await call('POST', '/adapters/register', { token: ADMIN, body: bad })).status).toBe(400);
    expect((await pool.query("SELECT 1 FROM adapters WHERE name = 'bad'")).rowCount).toBe(0);
    const log = await call('GET', '/activity?limit=500', { token: ADMIN });
    expect(log.json.map((e: { action: string; outcome: string }) => `${e.action}:${e.outcome}`)).toContain('adapter.register:denied');
    expect((await call('POST', '/adapters/register', { token: ADMIN, body: manifest })).status).toBe(409);
  });

  it('accepts health reports only with the adapter token', async () => {
    const reg = await call('POST', '/adapters/register', { token: ADMIN, body: { ...manifest, name: 'second' } });
    const ok = await call('POST', '/adapters/health', { token: reg.json.token, body: { status: 'up' } });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe('up');
    expect((await call('POST', '/adapters/health', { body: { status: 'up' } })).status).toBe(401);
    expect((await call('POST', '/adapters/health', { token: 'facto_adp_wrong', body: { status: 'up' } })).status).toBe(401);
    expect((await call('POST', '/adapters/health', { token: ADMIN, body: { status: 'up' } })).status).toBe(401);
    const list = await call('GET', '/adapters', { token: ADMIN });
    expect(list.json.find((a: { name: string }) => a.name === 'second').status).toBe('up');
  });
});
