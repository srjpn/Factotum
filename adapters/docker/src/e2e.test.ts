import { mkdtempSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createDockerAdapter } from './run.js';

const SERVICE = 'facto_adp_e2e-service-token';
const body = (req: IncomingMessage) => new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
const listen = (s: Server, where: string | number) =>
  new Promise<void>((r) => (typeof where === 'string' ? s.listen(where, r) : s.listen(where, '127.0.0.1', r)));

describe('docker adapter end to end (fake Docker on a unix socket, mock Facto API)', () => {
  const servers: Server[] = [];
  afterEach(async () => {
    for (const s of servers.splice(0)) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
  });

  it('syncs containers, keeps inventory when Docker is down, and only ever issues GET /containers/json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'docker-adapter-'));
    const sock = join(dir, 'd.sock');
    let dockerUp = true;
    const dockerCalls: string[] = [];
    const docker = createServer((req, res) => {
      dockerCalls.push(`${req.method} ${req.url}`);
      if (!dockerUp) return void res.writeHead(500).end('boom');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify([
        { Id: 'aaaaaaaaaaaa1111', Names: ['/web'], Image: 'nginx', State: 'running', Status: 'Up 1 minute (healthy)', Ports: [{ IP: '127.0.0.1', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }], Labels: { 'com.docker.compose.project': 'site', token: 'SECRET' }, Env: ['X=SECRET'] },
        { Id: 'bbbbbbbbbbbb2222', Names: ['/job'], Image: 'busybox', State: 'exited', Status: 'Exited (0) 1 hour ago', Ports: [], Labels: {} },
      ]));
    });
    await listen(docker, sock); servers.push(docker);

    const seen: { path: string; auth?: string; body: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const facto = createServer(async (req, res) => {
      const raw = await body(req);
      seen.push({ path: `${req.method} ${req.url}`, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/adapters/register') {
        return void res.writeHead(201).end(JSON.stringify({ id: 'i', name: 'docker', version: '0.1.0', domain: 'hosting', tier: 'observe', scopes: [], status: 'unknown', statusDetail: null, lastSeenAt: null, registeredAt: new Date().toISOString(), token: SERVICE }));
      }
      if (req.url?.startsWith('/adapters/inventory/')) return void res.end('{"added":0,"updated":0,"removed":0,"unchanged":0}');
      res.end('{}');
    });
    await listen(facto, 0); servers.push(facto);
    const factoUrl = `http://127.0.0.1:${(facto.address() as { port: number }).port}`;

    const logs: string[] = [];
    const config = loadConfig({
      FACTO_API_URL: factoUrl, DOCKER_HOST: `unix://${sock}`, DOCKER_SYNC_INTERVAL_SECONDS: '5',
      FACTO_ADMIN_TOKEN: 'owner-e2e-secret', FACTO_ADAPTER_STATE_FILE: join(dir, 'state.json'),
    });
    const adapter = createDockerAdapter(config, { log: (m) => logs.push(m), sdk: { healthIntervalMs: 20 } });
    await adapter.start();
    const puts = () => seen.filter((c) => c.path.startsWith('PUT'));
    for (let i = 0; i < 300 && puts().length < 1; i++) await new Promise((r) => setTimeout(r, 10));

    const first = puts()[0]!;
    expect(first.path).toBe('PUT /adapters/inventory/container');
    expect(first.auth).toBe(`Bearer ${SERVICE}`);
    expect(first.body.privacyClass).toBe('personal');
    expect(first.body.items.map((c: { name: string; status: string; composeProject?: string }) => [c.name, c.status, c.composeProject])).toEqual([
      ['web', 'running', 'site'],
      ['job', 'stopped', undefined],
    ]);
    expect(JSON.stringify(seen)).not.toContain('SECRET');

    // Daemon down: no push, health goes down with a clear detail, nothing is deleted.
    dockerUp = false;
    await adapter.syncer.runOnce();
    expect(puts()).toHaveLength(1);
    expect(adapter.syncer.healthCheck()).toMatchObject({ status: 'down', detail: expect.stringContaining('HTTP 500') });
    expect(logs.join('\n')).toContain('sync skipped');

    // Docker back: sync resumes and health is up.
    dockerUp = true;
    await adapter.syncer.runOnce();
    expect(puts()).toHaveLength(2);
    expect(adapter.syncer.healthCheck().status).toBe('up');

    expect(new Set(dockerCalls)).toEqual(new Set(['GET /containers/json?all=1']));
    expect(logs.join('\n')).not.toMatch(/owner-e2e-secret|facto_adp_e2e/);
    await adapter.stop();
  });

  it('reports down, not a crash, when the socket does not exist', async () => {
    const { DockerSyncer } = await import('./syncer.js');
    const { DockerClient } = await import('./docker.js');
    const pushes: unknown[] = [];
    const s = new DockerSyncer({ docker: new DockerClient('/nonexistent/docker.sock'), push: async (i) => pushes.push(i), log: () => {} });
    await s.runOnce();
    expect(pushes).toHaveLength(0);
    expect(s.healthCheck()).toMatchObject({ status: 'down', detail: expect.stringContaining('ENOENT') });
  });
});
