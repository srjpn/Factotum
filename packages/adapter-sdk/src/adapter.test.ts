import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay } from './backoff.js';
import { AuthError } from './errors.js';
import { FactoAdapter, type AdapterOptions } from './adapter.js';

type Call = { method: string; path: string; auth: string | undefined; body: unknown };

const manifest = { name: 'fake', version: '0.1.0', domain: 'workflows', tier: 'observe', reports: ['task'], health: '/healthz' };
const SERVICE_TOKEN = 'facto_adp_service-secret';

let server: Server;
let calls: Call[];
let base: string;
// Per-test hook to override a response: return a status to short-circuit.
let override: (call: Call) => number | undefined;

beforeEach(async () => {
  calls = [];
  override = () => undefined;
  server = createServer((req: IncomingMessage, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const call: Call = { method: req.method!, path: req.url!, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined };
      calls.push(call);
      const status = override(call);
      if (status) return void res.writeHead(status).end('nope');
      res.setHeader('content-type', 'application/json');
      if (call.path === '/adapters/register') {
        return void res.writeHead(201).end(JSON.stringify({
          id: 'id1', name: 'fake', version: '0.1.0', domain: 'workflows', tier: 'observe', scopes: [],
          status: 'unknown', statusDetail: null, lastSeenAt: null, registeredAt: new Date().toISOString(), token: SERVICE_TOKEN,
        }));
      }
      if (call.path.startsWith('/adapters/inventory/')) return void res.writeHead(200).end(JSON.stringify({ added: 2, updated: 0, removed: 0, unchanged: 0 }));
      res.writeHead(200).end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

const make = (extra: Partial<AdapterOptions> = {}) => {
  const stateFile = join(mkdtempSync(join(tmpdir(), 'sdk-')), 'state.json');
  const logs: string[] = [];
  const adapter = new FactoAdapter({
    apiUrl: base, manifest, stateFile, adminToken: 'owner-secret', privacyClass: 'personal',
    healthIntervalMs: 20, backoff: { baseMs: 5, capMs: 20 }, log: (m) => logs.push(m), ...extra,
  });
  return { adapter, stateFile, logs };
};
const waitFor = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(cond()).toBe(true);
};

describe('FactoAdapter', () => {
  it('registers with the owner token, stores the service token privately and never logs it', async () => {
    const { adapter, stateFile, logs } = make();
    await adapter.start();
    await adapter.stop();
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/adapters/register', auth: 'Bearer owner-secret' });
    expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toEqual({ token: SERVICE_TOKEN });
    expect(statSync(stateFile).mode & 0o777).toBe(0o600);
    expect(logs.join('\n')).not.toContain(SERVICE_TOKEN);
    expect(logs.join('\n')).not.toContain('owner-secret');
  });

  it('reuses a stored token without registering or needing the owner token', async () => {
    const { adapter, stateFile } = make({ adminToken: undefined });
    writeFileSync(stateFile, JSON.stringify({ token: 'facto_adp_stored' }));
    await adapter.start();
    await waitFor(() => calls.some((c) => c.path === '/adapters/health'));
    await adapter.stop();
    expect(calls.some((c) => c.path === '/adapters/register')).toBe(false);
    expect(calls.find((c) => c.path === '/adapters/health')?.auth).toBe('Bearer facto_adp_stored');
  });

  it('needs the owner token for first registration', async () => {
    const saved = process.env['FACTO_ADMIN_TOKEN'];
    delete process.env['FACTO_ADMIN_TOKEN'];
    try {
      await expect(make({ adminToken: undefined }).adapter.start()).rejects.toThrow(/FACTO_ADMIN_TOKEN/);
    } finally {
      if (saved !== undefined) process.env['FACTO_ADMIN_TOKEN'] = saved;
    }
  });

  it('rejects an invalid manifest up front', () => {
    expect(() => make({ manifest: { ...manifest, tier: 'bogus' } as never })).toThrow(/invalid adapter manifest/);
  });

  it('reports health on an interval, using the health check and reporting a throw as down', async () => {
    let n = 0;
    const { adapter } = make({
      healthCheck: () => {
        if (++n === 2) throw new Error('tool unreachable');
        return { status: 'up' };
      },
    });
    await adapter.start();
    await waitFor(() => calls.filter((c) => c.path === '/adapters/health').length >= 3);
    await adapter.stop();
    const bodies = calls.filter((c) => c.path === '/adapters/health').map((c) => c.body);
    expect(bodies[0]).toEqual({ status: 'up' });
    expect(bodies[1]).toEqual({ status: 'down', detail: 'tool unreachable' });
    const after = calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(calls.length).toBe(after); // stopped
  });

  it('syncs inventory with the service token and the privacy class', async () => {
    const { adapter } = make();
    await adapter.start();
    const items = [{ externalId: '1' }, { externalId: '2' }];
    expect(await adapter.syncInventory('task', items)).toEqual({ added: 2, updated: 0, removed: 0, unchanged: 0 });
    await adapter.stop();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put).toMatchObject({ path: '/adapters/inventory/task', auth: `Bearer ${SERVICE_TOKEN}`, body: { privacyClass: 'personal', items } });
  });

  it('retries transient failures with backoff and does not retry client errors', async () => {
    const { adapter } = make({ healthIntervalMs: 10_000 });
    await adapter.start();
    let failures = 2;
    override = (c) => (c.method === 'PUT' && failures-- > 0 ? 503 : undefined);
    await expect(adapter.syncInventory('task', [])).resolves.toMatchObject({ added: 2 });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(3);

    calls.length = 0;
    override = (c) => (c.method === 'PUT' ? 400 : undefined);
    await expect(adapter.syncInventory('task', [])).rejects.toMatchObject({ status: 400 });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    await adapter.stop();
  });

  it('stops clearly on 401: health loop ends and onFatal fires', async () => {
    const onFatal = vi.fn();
    const { adapter, logs } = make({ onFatal });
    await adapter.start();
    override = (c) => (c.path === '/adapters/health' ? 401 : undefined);
    await waitFor(() => onFatal.mock.calls.length === 1);
    expect(onFatal.mock.calls[0]![0]).toBeInstanceOf(AuthError);
    expect(logs.join('\n')).toContain('401');
    const healthCalls = calls.filter((c) => c.path === '/adapters/health').length;
    await new Promise((r) => setTimeout(r, 60));
    expect(calls.filter((c) => c.path === '/adapters/health').length).toBe(healthCalls);
  });

  it('throws AuthError from syncInventory on 401', async () => {
    const { adapter } = make({ healthIntervalMs: 10_000 });
    await adapter.start();
    override = (c) => (c.method === 'PUT' ? 401 : undefined);
    await expect(adapter.syncInventory('task', [])).rejects.toBeInstanceOf(AuthError);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    await adapter.stop();
  });
});

describe('backoffDelay', () => {
  it('grows exponentially with jitter and is capped', () => {
    const opts = { baseMs: 1000, capMs: 60_000 };
    expect(backoffDelay(0, opts, () => 1)).toBe(1000);
    expect(backoffDelay(3, opts, () => 1)).toBe(8000);
    expect(backoffDelay(10, opts, () => 1)).toBe(60_000);
    expect(backoffDelay(10, opts, () => 0)).toBe(0);
    expect(backoffDelay(100, opts, () => 0.999)).toBeLessThan(60_000);
  });
});
