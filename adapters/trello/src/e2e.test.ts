import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createTrelloAdapter } from './run.js';

const KEY = 'e2e-key-secret';
const TOKEN = 'e2e-token-secret';
const SERVICE = 'facto_adp_e2e-service-token';

const listen = (s: Server) =>
  new Promise<string>((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(s.address() as { port: number }).port}`)));
const body = (req: import('node:http').IncomingMessage) =>
  new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

describe('trello adapter end to end (mock Trello, mock Facto API)', () => {
  const servers: Server[] = [];
  afterEach(async () => {
    for (const s of servers.splice(0)) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
  });

  it('registers, syncs cards from two boards, then drops a removed card', async () => {
    // --- mock Trello ---
    const trelloAuth: (string | undefined)[] = [];
    let cardsB1 = [
      { id: 'c1', name: 'Write post', idList: 'l1', url: 'https://trello.com/c/c1', dateLastActivity: '2026-11-27T09:00:00.000Z', closed: false },
      { id: 'c2', name: 'Old', idList: 'l1', url: 'https://trello.com/c/c2', closed: true },
    ];
    const trello = createServer((req, res) => {
      trelloAuth.push(req.headers.authorization);
      const path = req.url!.split('?')[0]!;
      res.setHeader('content-type', 'application/json');
      if (path === '/1/boards/b1') return void res.end('{"name":"Blog"}');
      if (path === '/1/boards/b2') return void res.end('{"name":"House"}');
      if (path.endsWith('/lists')) return void res.end(JSON.stringify([{ id: 'l1', name: 'Doing' }, { id: 'l9', name: 'Done' }]));
      if (path === '/1/boards/b1/cards') return void res.end(JSON.stringify(cardsB1));
      if (path === '/1/boards/b2/cards') return void res.end(JSON.stringify([{ id: 'c3', name: 'Paint', idList: 'l9', url: 'https://trello.com/c/c3' }]));
      res.writeHead(404).end();
    });
    const trelloBase = await listen(trello); servers.push(trello);

    // --- mock Facto API ---
    const seen: { path: string; auth?: string; body: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const facto = createServer(async (req, res) => {
      const raw = await body(req);
      const call = { path: `${req.method} ${req.url}`, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined };
      seen.push(call);
      res.setHeader('content-type', 'application/json');
      if (req.url === '/adapters/register') {
        return void res.writeHead(201).end(JSON.stringify({ id: 'i', name: 'trello', version: '0.1.0', domain: 'workflows', tier: 'observe', scopes: [], status: 'unknown', statusDetail: null, lastSeenAt: null, registeredAt: new Date().toISOString(), token: SERVICE }));
      }
      if (req.url?.startsWith('/adapters/inventory/')) return void res.end('{"added":0,"updated":0,"removed":0,"unchanged":0}');
      res.end('{}');
    });
    const factoUrl = await listen(facto); servers.push(facto);

    const logs: string[] = [];
    const config = loadConfig({
      FACTO_API_URL: factoUrl, TRELLO_API_BASE: trelloBase, TRELLO_API_KEY: KEY, TRELLO_TOKEN: TOKEN,
      TRELLO_BOARD_IDS: 'b1,b2', TRELLO_SYNC_INTERVAL_SECONDS: '5', FACTO_ADMIN_TOKEN: 'owner-e2e-secret',
      FACTO_ADAPTER_STATE_FILE: join(mkdtempSync(join(tmpdir(), 'trello-')), 'state.json'),
    });
    const adapter = createTrelloAdapter(config, { log: (m) => logs.push(m), sdk: { healthIntervalMs: 20 } });
    await adapter.start();
    const puts = () => seen.filter((c) => c.path.startsWith('PUT'));
    for (let i = 0; i < 300 && puts().length < 1; i++) await new Promise((r) => setTimeout(r, 10));

    const first = puts()[0]!;
    expect(first.auth).toBe(`Bearer ${SERVICE}`);
    expect(first.path).toBe('PUT /adapters/inventory/task');
    expect(first.body.privacyClass).toBe('personal');
    expect(first.body.items.map((t: { externalId: string; project: string; status: string }) => [t.externalId, t.project, t.status])).toEqual([
      ['c1', 'Blog', 'in-progress'],
      ['c3', 'House', 'done'],
    ]);
    // Trello saw the header and nothing leaked into the logs.
    expect(trelloAuth.every((a) => a === `OAuth oauth_consumer_key="${KEY}", oauth_token="${TOKEN}"`)).toBe(true);
    expect(logs.join('\n')).not.toMatch(/e2e-key-secret|e2e-token-secret|owner-e2e-secret|facto_adp_e2e/);

    // Health is reported as up with the real state, then a removed card disappears on the next cycle.
    for (let i = 0; i < 300 && !seen.some((c) => c.path === 'POST /adapters/health' && c.body.status === 'up'); i++) await new Promise((r) => setTimeout(r, 10));
    expect(seen.some((c) => c.path === 'POST /adapters/health' && c.body.status === 'up')).toBe(true);

    cardsB1 = [];
    await adapter.syncer.runOnce();
    expect(puts()[1]!.body.items.map((t: { externalId: string }) => t.externalId)).toEqual(['c3']);
    await adapter.stop();
  });
});
