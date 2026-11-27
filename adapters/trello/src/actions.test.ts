import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { moveCard } from './actions.js';
import { MANIFEST } from './run.js';
import { TrelloClient } from './trello.js';

// Mock Trello only: these tests never reach the real service.
describe('trello move-card', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise((r) => server!.close(r));
    server = undefined;
  });

  const start = async () => {
    const calls: { method: string; url: string; auth?: string }[] = [];
    const cards: Record<string, { id: string; idBoard: string; idList: string }> = {
      c1: { id: 'c1', idBoard: 'b1', idList: 'l1' },
      cx: { id: 'cx', idBoard: 'other', idList: 'lx' },
    };
    const lists: Record<string, { id: string; idBoard: string }> = { l1: { id: 'l1', idBoard: 'b1' }, l2: { id: 'l2', idBoard: 'b1' }, lz: { id: 'lz', idBoard: 'b9' }, lx: { id: 'lx', idBoard: 'other' } };
    server = createServer((req, res) => {
      calls.push({ method: req.method!, url: req.url!, auth: req.headers.authorization });
      const url = new URL(req.url!, 'http://x');
      const [, , kind, id] = url.pathname.split('/');
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && kind === 'cards' && cards[id!]) return void res.end(JSON.stringify(cards[id!]));
      if (req.method === 'GET' && kind === 'lists' && lists[id!]) return void res.end(JSON.stringify(lists[id!]));
      if (req.method === 'PUT' && kind === 'cards' && cards[id!]) {
        cards[id!]!.idList = url.searchParams.get('idList')!;
        return void res.end('{}');
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    return { calls, cards, trello: new TrelloClient({ base, apiKey: 'k', token: 't' }) };
  };

  it('declares move-card as reversible with its own permission', () => {
    expect(MANIFEST.actions).toEqual([expect.objectContaining({ name: 'move-card', risk: 'reversible', permission: 'trello.move-card' })]);
  });

  it('moves a card between lists on a configured board, sending only idList', async () => {
    const { calls, cards, trello } = await start();
    const out = await moveCard(trello, ['b1'], { cardId: 'c1', listId: 'l2' });
    expect(out.detail).toContain('c1');
    expect(cards['c1']!.idList).toBe('l2');
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('/1/cards/c1?idList=l2');
    expect(put.auth).toBe('OAuth oauth_consumer_key="k", oauth_token="t"');
  });

  it('does nothing when the card is already in the list', async () => {
    const { calls, trello } = await start();
    await moveCard(trello, ['b1'], { cardId: 'c1', listId: 'l1' });
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('refuses a card outside the configured boards, a list on another board, and bad params', async () => {
    const { calls, trello } = await start();
    await expect(moveCard(trello, ['b1'], { cardId: 'cx', listId: 'lx' })).rejects.toThrow(/not on a configured board/);
    await expect(moveCard(trello, ['b1'], { cardId: 'c1', listId: 'lz' })).rejects.toThrow(/different board/);
    await expect(moveCard(trello, ['b1'], { cardId: 'c1/../x', listId: 'l2' })).rejects.toThrow(/invalid params/);
    await expect(moveCard(trello, ['b1'], {})).rejects.toThrow(/invalid params/);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });
});
