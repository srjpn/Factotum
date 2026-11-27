import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createJiraAdapter } from './run.js';

// Real Factotum API (built apps/api, run as its own process) + real Postgres + mock Jira. Needs `pnpm build` first.
//   docker run --rm -d --name facto-lt8-test -p 55440:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine
//   FACTO_TEST_DATABASE_URL=postgres://postgres:test@localhost:55440/postgres pnpm test
const dbUrl = process.env['FACTO_TEST_DATABASE_URL'];
const apiMain = resolve(import.meta.dirname, '../../../apps/api/dist/main.js');
const ADMIN = 'e2e-owner-token-with-enough-length';
const TOKEN = 'e2e-jira-api-token-secret';
const EMAIL = 'e2e-owner@example.com';

const listen = (s: Server) =>
  new Promise<string>((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(s.address() as { port: number }).port}`)));

describe.skipIf(!dbUrl || !existsSync(apiMain))('jira adapter end to end (mock Jira, real API and Postgres)', () => {
  let api: ChildProcess;
  let jira: Server;
  const apiPort = 39000 + Math.floor(Math.random() * 900);

  beforeAll(async () => {
    const schema = `jira_e2e_${randomBytes(5).toString('hex')}`;
    const admin = new pg.Client({ connectionString: dbUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    const u = new URL(dbUrl!);
    u.searchParams.set('options', `-c search_path=${schema}`);
    api = spawn('node', [apiMain], {
      env: { PATH: process.env['PATH'] ?? '', FACTO_PORT: String(apiPort), FACTO_DATABASE_URL: u.toString(), FACTO_ADMIN_TOKEN: ADMIN, FACTO_STATUS_CHECK_SECONDS: '0' },
      stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok) return; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('API did not start');
  }, 30_000);

  afterAll(async () => {
    api?.kill();
    jira?.closeAllConnections();
    await new Promise((r) => jira?.close(r));
  });

  it('registers, syncs two projects as client-data tasks, and drops a closed-out issue', async () => {
    const auth: (string | undefined)[] = [];
    const issues: Record<string, object[]> = {
      ACME: [{ key: 'ACME-1', fields: { summary: 'Build login', status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } }, assignee: { displayName: 'Ada' }, updated: '2026-11-27T10:00:00.000+0100', project: { key: 'ACME' } } }],
      BETA: [{ key: 'BETA-7', fields: { summary: 'Fix invoice', status: { name: 'To Do', statusCategory: { key: 'new' } }, project: { key: 'BETA' } } }],
    };
    jira = createServer((req, res) => {
      auth.push(req.headers.authorization);
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        const jql = JSON.parse(b).jql as string;
        const key = /project = "(\w+)"/.exec(jql)![1]!;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ issues: issues[key], isLast: true }));
      });
    });
    const jiraBase = await listen(jira);

    const logs: string[] = [];
    const config = loadConfig({
      FACTO_API_URL: `http://127.0.0.1:${apiPort}`, JIRA_BASE_URL: jiraBase, JIRA_EMAIL: EMAIL, JIRA_API_TOKEN: TOKEN,
      JIRA_PROJECT_KEYS: 'ACME,BETA', FACTO_ADMIN_TOKEN: ADMIN,
      FACTO_ADAPTER_STATE_FILE: join(mkdtempSync(join(tmpdir(), 'jira-')), 'state.json'),
    });
    const adapter = createJiraAdapter(config, { log: (m) => logs.push(m), sdk: { healthIntervalMs: 50 } });
    await adapter.start();
    await adapter.syncer.runOnce();

    const owner = (path: string) => fetch(`http://127.0.0.1:${apiPort}${path}`, { headers: { authorization: `Bearer ${ADMIN}` } }).then((r) => r.json()) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    let items = await owner('/inventory?kind=task&source=jira');
    for (let i = 0; i < 100 && items.length < 2; i++) { await new Promise((r) => setTimeout(r, 50)); items = await owner('/inventory?kind=task&source=jira'); }
    expect(items).toHaveLength(2);
    expect(items.map((x: any) => x.privacyClass)).toEqual(['client-data', 'client-data']); // eslint-disable-line @typescript-eslint/no-explicit-any
    const acme = items.find((x: any) => x.externalId === 'ACME-1'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(JSON.stringify(acme)).toContain('Build login');
    expect(JSON.stringify(acme)).toContain(`${jiraBase}/browse/ACME-1`);

    expect(auth.every((a) => a === `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')}`)).toBe(true);
    const statusOf = async () => (await owner('/adapters')).find((a: any) => a.name === 'jira')?.status; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < 100 && (await statusOf()) !== 'up'; i++) await new Promise((r) => setTimeout(r, 50));
    expect(await statusOf()).toBe('up');

    issues['BETA'] = [];
    await adapter.syncer.runOnce();
    expect((await owner('/inventory?kind=task&source=jira')).map((x: any) => x.externalId)).toEqual(['ACME-1']); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Titles, secrets and the owner token never reach the adapter's logs.
    const all = logs.join('\n');
    for (const secret of [TOKEN, EMAIL, ADMIN, 'Build login', 'Fix invoice']) expect(all).not.toContain(secret);
    await adapter.stop();
  }, 30_000);
});
