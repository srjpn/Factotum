import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { assistant, SECRET, SECRET_PATH, user } from './fixtures.js';
import { createClaudeAdapter } from './run.js';

const SERVICE = 'facto_adp_e2e-service-token';
const body = (req: IncomingMessage) => new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

describe('claude adapter end to end (fixture transcripts, mock Facto API)', () => {
  const servers: Server[] = [];
  afterEach(async () => {
    for (const s of servers.splice(0)) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
  });

  it('pushes sessions and usage as client-data, with no content, and stays up when the folder is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-adapter-'));
    const projects = join(dir, 'projects');
    mkdirSync(join(projects, '-Users-me-work-acme'), { recursive: true });
    const now = Date.now();
    const t = (min: number) => new Date(now - min * 60_000).toISOString();
    writeFileSync(join(projects, '-Users-me-work-acme', 'cafebabe-0000-0000-0000-000000000000.jsonl'), [user(t(5)), assistant(t(4), 'claude-sonnet-5-5', [10, 20, 30, 40])].join('\n') + '\n');

    const seen: { path: string; auth?: string; body: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const facto = createServer(async (req, res) => {
      const raw = await body(req);
      seen.push({ path: `${req.method} ${req.url}`, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/adapters/register') {
        return void res.writeHead(201).end(JSON.stringify({ id: 'i', name: 'claude', version: '0.1.0', domain: 'ai', tier: 'observe', scopes: [], status: 'unknown', statusDetail: null, lastSeenAt: null, registeredAt: new Date().toISOString(), token: SERVICE }));
      }
      if (req.url?.startsWith('/adapters/inventory/')) return void res.end('{"added":0,"updated":0,"removed":0,"unchanged":0}');
      res.end('{}');
    });
    await new Promise<void>((r) => facto.listen(0, '127.0.0.1', r)); servers.push(facto);
    const apiUrl = `http://127.0.0.1:${(facto.address() as { port: number }).port}`;

    const logs: string[] = [];
    const config = loadConfig({ FACTO_API_URL: apiUrl, CLAUDE_PROJECTS_DIR: projects, FACTO_ADMIN_TOKEN: 'owner-e2e-secret', FACTO_ADAPTER_STATE_FILE: join(dir, 'state.json') });
    const adapter = createClaudeAdapter(config, { log: (m) => logs.push(m), sdk: { healthIntervalMs: 20 } });
    await adapter.start();
    const puts = () => seen.filter((c) => c.path.startsWith('PUT'));
    for (let i = 0; i < 300 && puts().length < 2; i++) await new Promise((r) => setTimeout(r, 10));

    const [sessions, usage] = puts();
    expect(sessions!.path).toBe('PUT /adapters/inventory/claude-session');
    expect(usage!.path).toBe('PUT /adapters/inventory/claude-usage');
    expect(sessions!.auth).toBe(`Bearer ${SERVICE}`);
    expect(sessions!.body.privacyClass).toBe('client-data');
    expect(sessions!.body.items[0]).toMatchObject({ externalId: 'cafebabe', title: 'acme', status: 'active', tokens: { input: 10, output: 20, cacheWrite: 30, cacheRead: 40 } });
    expect(usage!.body.items.map((i: { externalId: string }) => i.externalId)).toContain('window:5h');
    const pushed = JSON.stringify(puts());
    for (const s of [SECRET, SECRET_PATH]) expect(pushed).not.toContain(s);
    expect(logs.join('\n')).not.toMatch(/owner-e2e-secret|facto_adp_e2e/);

    // Missing folder is an empty snapshot, not a crash.
    await adapter.syncer.runOnce();
    expect(adapter.syncer.healthCheck().status).toBe('up');
    await adapter.stop();
  });
});
