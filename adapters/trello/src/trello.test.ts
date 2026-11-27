import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';
import { cardsToTasks } from './convert.js';
import { redactingLogger } from './redact.js';
import { buildStatusMap, statusForList } from './status.js';
import { TrelloSyncer } from './syncer.js';
import { TrelloAuthError, TrelloClient, TrelloRateLimitError } from './trello.js';

const KEY = 'key-secret-1234';
const TOKEN = 'token-secret-5678';
const map = buildStatusMap();

describe('status mapping', () => {
  it('maps default list names case-insensitively and falls back to other', () => {
    for (const n of ['Backlog', 'TO DO', 'todo']) expect(statusForList(map, n)).toBe('todo');
    for (const n of ['Doing', ' In Progress ']) expect(statusForList(map, n)).toBe('in-progress');
    for (const n of ['Done', 'Complete', 'SHIPPED']) expect(statusForList(map, n)).toBe('done');
    expect(statusForList(map, 'Waiting on client')).toBe('other');
  });
  it('lets the owner map override and extend the defaults', () => {
    const m = buildStatusMap({ 'Waiting on client': 'in-progress', Done: 'other' });
    expect(statusForList(m, 'waiting ON client')).toBe('in-progress');
    expect(statusForList(m, 'done')).toBe('other');
  });
});

describe('cardsToTasks', () => {
  const lists = [{ id: 'l1', name: 'Doing' }, { id: 'l2', name: 'Parked' }];
  const card = (o: object) => ({ id: 'c1', name: 'Fix it', idList: 'l1', url: 'https://trello.com/c/c1', dateLastActivity: '2026-11-27T10:00:00.000Z', ...o });

  it('converts a card and keeps the list name as the label', () => {
    expect(cardsToTasks('Home', lists, [card({})], map)).toEqual([
      { externalId: 'c1', title: 'Fix it', status: 'in-progress', statusLabel: 'Doing', url: 'https://trello.com/c/c1', source: 'trello', project: 'Home', updatedAt: '2026-11-27T10:00:00.000Z' },
    ]);
    const other = cardsToTasks('Home', lists, [card({ idList: 'l2' })], map)[0]!;
    expect([other.status, other.statusLabel]).toEqual(['other', 'Parked']);
  });
  it('skips closed cards and tolerates unknown lists and empty names', () => {
    const out = cardsToTasks('Home', lists, [card({ closed: true }), card({ id: 'c2', idList: 'gone', name: ' ' })], map);
    expect(out.map((t) => t.externalId)).toEqual(['c2']);
    expect(out[0]).toMatchObject({ status: 'other', statusLabel: 'Unknown list', title: '(untitled card)' });
  });
});

describe('TrelloClient', () => {
  const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

  it('sends credentials in the Authorization header, not the URL', async () => {
    const f = vi.fn(async () => res(200, []));
    await new TrelloClient({ base: 'https://t.test', apiKey: KEY, token: TOKEN, fetch: f as never }).cards('b1');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain(KEY);
    expect(url).not.toContain(TOKEN);
    expect((init.headers as Record<string, string>).authorization).toBe(`OAuth oauth_consumer_key="${KEY}", oauth_token="${TOKEN}"`);
    expect(url).toContain('fields=name,idList,url,dateLastActivity,closed,idMembers');
  });
  it('raises an auth error on 401', async () => {
    const c = new TrelloClient({ base: 'https://t.test', apiKey: KEY, token: TOKEN, fetch: (async () => res(401)) as never });
    await expect(c.lists('b1')).rejects.toBeInstanceOf(TrelloAuthError);
  });
  it('backs off on 429 using Retry-After, then succeeds', async () => {
    const sleeps: number[] = [];
    const answers = [res(429, {}, { 'retry-after': '3' }), res(429), res(200, [{ id: 'l', name: 'Doing' }])];
    const c = new TrelloClient({ base: 'https://t.test', apiKey: KEY, token: TOKEN, fetch: (async () => answers.shift()!) as never, sleep: async (ms) => void sleeps.push(ms) });
    expect(await c.lists('b1')).toHaveLength(1);
    expect(sleeps).toEqual([3000, 2000]);
  });
  it('gives up after repeated 429', async () => {
    const c = new TrelloClient({ base: 'https://t.test', apiKey: KEY, token: TOKEN, fetch: (async () => res(429)) as never, sleep: async () => undefined, maxRetries: 2 });
    await expect(c.cards('b1')).rejects.toBeInstanceOf(TrelloRateLimitError);
  });
});

describe('TrelloSyncer', () => {
  const setup = (failing: Set<string> = new Set(), auth = false) => {
    const pushed: unknown[][] = [];
    const logs: string[] = [];
    const trello = {
      boardName: async (id: string) => (auth ? Promise.reject(new TrelloAuthError(401)) : failing.has(id) ? Promise.reject(new Error('boom')) : `Board ${id}`),
      lists: async () => [{ id: 'l', name: 'To do' }],
      cards: async (id: string) => [{ id: `${id}-1`, name: `${id}-1`, idList: 'l', url: 'u' }],
    };
    const syncer = new TrelloSyncer({ trello, boardIds: ['a', 'b'], statusMap: map, push: async (i) => void pushed.push(i), log: (m) => logs.push(m) });
    return { syncer, pushed, logs };
  };

  it('combines all boards into one snapshot and reports up', async () => {
    const { syncer, pushed } = setup();
    await syncer.runOnce();
    expect(pushed).toHaveLength(1);
    expect((pushed[0] as { externalId: string }[]).map((t) => t.externalId)).toEqual(['a-1', 'b-1']);
    expect(syncer.healthCheck()).toMatchObject({ status: 'up' });
  });
  it('reuses cached cards for a board that later fails and reports degraded', async () => {
    const failing = new Set<string>();
    const { syncer, pushed } = setup(failing);
    await syncer.runOnce();
    failing.add('b');
    await syncer.runOnce();
    expect((pushed[1] as { externalId: string }[]).map((t) => t.externalId)).toEqual(['a-1', 'b-1']);
    expect(syncer.healthCheck()).toMatchObject({ status: 'degraded' });
  });
  it('skips the push when a board fails with nothing cached, so no cards are deleted', async () => {
    const { syncer, pushed } = setup(new Set(['b']));
    await syncer.runOnce();
    expect(pushed).toHaveLength(0);
    expect(syncer.healthCheck().status).toBe('degraded');
  });
  it('reports down on an auth failure without pushing or leaking credentials', async () => {
    const { syncer, pushed, logs } = setup(new Set(), true);
    await syncer.runOnce();
    expect(pushed).toHaveLength(0);
    expect(syncer.healthCheck()).toEqual({ status: 'down', detail: 'Trello rejected the credentials' });
    expect(logs.join(' ')).not.toMatch(/secret/);
  });
});

describe('secrets', () => {
  it('redacts credentials from logs', () => {
    const out: string[] = [];
    redactingLogger([KEY, TOKEN], (l) => out.push(l))(`failed with ${KEY} and ${TOKEN}`);
    expect(out[0]).toBe('failed with *** and ***');
  });
  it('never puts values in configuration errors', () => {
    const env = { FACTO_API_URL: 'http://x.test', TRELLO_API_KEY: KEY, TRELLO_TOKEN: TOKEN, TRELLO_BOARD_IDS: ' ', TRELLO_LIST_STATUS_MAP: `{"a":"${TOKEN}"}` };
    expect(() => loadConfig(env)).toThrow(/at least one board id/);
    try {
      loadConfig({ ...env, TRELLO_BOARD_IDS: 'b1' });
    } catch (e) {
      expect((e as Error).message).not.toContain(TOKEN);
    }
  });
  it('parses a valid configuration', () => {
    const c = loadConfig({ FACTO_API_URL: 'http://x.test', TRELLO_API_KEY: KEY, TRELLO_TOKEN: TOKEN, TRELLO_BOARD_IDS: 'b1, b2', TRELLO_LIST_STATUS_MAP: '{"Review":"in-progress"}' });
    expect(c).toMatchObject({ boardIds: ['b1', 'b2'], syncIntervalMs: 60_000, trelloBase: 'https://api.trello.com', listStatusMap: { Review: 'in-progress' } });
  });
});
