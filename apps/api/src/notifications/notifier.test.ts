import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityService, type NewActivity } from '../activity/activity.service.js';
import type { Config } from '../config.js';
import { COOLDOWN_MS, NotifierService } from './notifier.service.js';
import { notificationFor } from './rules.js';

const entry = (over: Partial<NewActivity> = {}): NewActivity => ({
  actorType: 'system',
  actorId: 'node-status-monitor',
  action: 'node.offline',
  risk: 'read',
  targetType: 'node',
  targetId: 'n1',
  outcome: 'success',
  details: { nodeName: 'macbook', metrics: 'secret-ish' },
  ...over,
});

type Seen = { method?: string; url?: string; headers: IncomingMessage['headers']; body: string };

describe('rule table', () => {
  it('maps node.offline, node.online and denied enrol', () => {
    const at = new Date('2026-11-27T10:05:00Z');
    expect(notificationFor(entry(), at)).toMatchObject({
      title: 'Node offline',
      message: 'macbook went offline at 10:05 UTC',
      priority: 'high',
      tags: ['warning'],
    });
    expect(notificationFor(entry({ action: 'node.online' }), at)).toMatchObject({ priority: 'default' });
    expect(notificationFor(entry({ action: 'node.enrol', outcome: 'denied', targetId: undefined }), at)).toMatchObject({
      priority: 'high',
      tags: ['rotating_light'],
    });
  });

  it('ignores other entries and never includes details beyond the node name', () => {
    expect(notificationFor(entry({ action: 'node.enrol', outcome: 'success' }))).toBeUndefined();
    expect(notificationFor(entry({ action: 'notification.send' }))).toBeUndefined();
    expect(JSON.stringify(notificationFor(entry()))).not.toContain('secret-ish');
  });
});

describe('NotifierService', () => {
  let server: Server;
  let seen: Seen[];
  let status: number;
  let url: string;
  let recorded: NewActivity[];
  const activity = { record: async (e: NewActivity) => void recorded.push(e), addListener: vi.fn() } as unknown as ActivityService;

  const make = (ntfy: Config['ntfy']) => new NotifierService({ ntfy } as Config, activity);

  beforeEach(async () => {
    seen = [];
    recorded = [];
    status = 200;
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body });
        res.statusCode = status;
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  it('does nothing when unconfigured', async () => {
    const n = make(undefined);
    n.onModuleInit();
    await n.handle(entry());
    expect(seen).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it('posts to {url}/{topic} with title, priority, tags, bearer and body, and logs without the body', async () => {
    await make({ url: `${url}/`, topic: 'facto', token: 'tk_secret' }).handle(entry());
    expect(seen).toHaveLength(1);
    const s = seen[0]!;
    expect(s.method).toBe('POST');
    expect(s.url).toBe('/facto');
    expect(s.headers['title']).toBe('Node offline');
    expect(s.headers['priority']).toBe('high');
    expect(s.headers['tags']).toBe('warning');
    expect(s.headers['authorization']).toBe('Bearer tk_secret');
    expect(s.body).toMatch(/^macbook went offline at \d\d:\d\d UTC$/);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ action: 'notification.send', risk: 'read', outcome: 'success' });
    expect(JSON.stringify(recorded)).not.toContain('macbook');
    expect(JSON.stringify(recorded)).not.toContain('tk_secret');
  });

  it('omits the bearer header without a token', async () => {
    await make({ url, topic: 'facto' }).handle(entry());
    expect(seen[0]!.headers['authorization']).toBeUndefined();
  });

  it('limits a flapping node to one notification per event type per 5 minutes', async () => {
    const n = make({ url, topic: 'facto' });
    const t0 = 1_000_000;
    await n.handle(entry(), t0);
    await n.handle(entry(), t0 + 1000);
    await n.handle(entry({ action: 'node.online' }), t0 + 2000);
    await n.handle(entry({ targetId: 'n2' }), t0 + 3000);
    expect(seen).toHaveLength(3);
    await n.handle(entry(), t0 + COOLDOWN_MS + 1);
    expect(seen).toHaveLength(4);
  });

  it('does not notify for its own notification.send entries', async () => {
    await make({ url, topic: 'facto' }).handle(entry({ action: 'notification.send' }));
    expect(seen).toEqual([]);
  });

  it('does not throw when ntfy answers with an error, and logs a failure', async () => {
    status = 500;
    await expect(make({ url, topic: 'facto', token: 'tk_secret' }).handle(entry())).resolves.toBeUndefined();
    expect(recorded[0]).toMatchObject({ action: 'notification.send', outcome: 'failure' });
    expect(JSON.stringify(recorded)).not.toContain('tk_secret');
  });

  it('does not throw when the server is unreachable', async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await expect(make({ url, topic: 'facto' }).handle(entry())).resolves.toBeUndefined();
    expect(recorded[0]).toMatchObject({ outcome: 'failure' });
    server = createServer();
  });
});
