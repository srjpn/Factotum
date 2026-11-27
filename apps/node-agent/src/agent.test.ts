import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeartbeatSchema, type Heartbeat } from '@facto/contracts';
import { runAgent, type Logger } from './agent.js';
import type { AgentConfig } from './config.js';

const CREDENTIAL = 'cred-secret-123';
const TOKEN = 'enrol-token-abc';
const NODE_ID = '11111111-1111-4111-8111-111111111111';

type Mock = {
  server: Server;
  url: string;
  enrols: unknown[];
  beats: { auth?: string; body: unknown }[];
  mode: { heartbeat: 'ok' | 'down' | '401' };
};

async function readBody(req: IncomingMessage): Promise<unknown> {
  let s = '';
  for await (const chunk of req) s += chunk;
  return s ? JSON.parse(s) : undefined;
}

async function startMock(): Promise<Mock> {
  const mock = { enrols: [], beats: [], mode: { heartbeat: 'ok' } } as unknown as Mock;
  mock.server = createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.url === '/nodes/enrol') {
      mock.enrols.push(body);
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ nodeId: NODE_ID, nodeName: 'macbook', credential: CREDENTIAL }));
    } else if (req.url === '/nodes/heartbeat') {
      if (mock.mode.heartbeat === 'down') return void req.socket.destroy();
      mock.beats.push({ auth: req.headers.authorization, body });
      res.writeHead(mock.mode.heartbeat === '401' ? 401 : 204).end();
    } else res.writeHead(404).end();
  });
  await new Promise<void>((r) => mock.server.listen(0, '127.0.0.1', r));
  mock.url = `http://127.0.0.1:${(mock.server.address() as AddressInfo).port}`;
  return mock;
}

const heartbeat: Heartbeat = {
  cpuPercent: 12.5,
  memory: { usedBytes: 4, totalBytes: 8 },
  disk: { usedBytes: 100, totalBytes: 1000 },
  battery: { percent: 80, charging: false },
};

describe('agent end to end', () => {
  let mock: Mock;
  let dir: string;
  let config: AgentConfig;
  const logs: string[] = [];
  const log: Logger = {
    debug: (m) => logs.push(m),
    info: (m) => logs.push(m),
    warn: (m) => logs.push(m),
    error: (m) => logs.push(m),
  };
  const fastSleep = () => new Promise<void>((r) => setTimeout(r, 5));

  beforeEach(async () => {
    logs.length = 0;
    mock = await startMock();
    dir = await mkdtemp(join(tmpdir(), 'facto-agent-'));
    config = { apiUrl: mock.url, enrolmentToken: TOKEN, stateFile: join(dir, 'sub', 'agent.json'), heartbeatIntervalMs: 10 };
  });
  afterEach(async () => {
    mock.server.closeAllConnections();
    await new Promise((r) => mock.server.close(r));
  });

  it('enrols once, persists the credential 0600 and sends authenticated heartbeats', async () => {
    const abort = new AbortController();
    let n = 0;
    const collect = async () => {
      if (++n >= 3) abort.abort();
      return heartbeat;
    };
    expect(await runAgent({ config, log, collect, sleep: fastSleep }, abort.signal)).toBe('stopped');

    expect(mock.enrols).toEqual([{ token: TOKEN }]);
    const saved = JSON.parse(await readFile(config.stateFile, 'utf8'));
    expect(saved.credential).toBe(CREDENTIAL);
    expect((await stat(config.stateFile)).mode & 0o777).toBe(0o600);
    expect(mock.beats.length).toBeGreaterThanOrEqual(2);
    for (const b of mock.beats) {
      expect(b.auth).toBe(`Bearer ${CREDENTIAL}`);
      expect(HeartbeatSchema.safeParse(b.body).success).toBe(true);
    }
    expect(logs.join('\n')).not.toContain(CREDENTIAL);
    expect(logs.join('\n')).not.toContain(TOKEN);

    // Second run reuses the stored credential and does not enrol again, even without a token.
    const abort2 = new AbortController();
    const collect2 = async () => {
      abort2.abort();
      return heartbeat;
    };
    await runAgent({ config: { ...config, enrolmentToken: undefined }, log, collect: collect2, sleep: fastSleep }, abort2.signal);
    expect(mock.enrols).toHaveLength(1);
  });

  it('retries with backoff while the control plane is down, then recovers', async () => {
    mock.mode.heartbeat = 'down';
    const abort = new AbortController();
    const delays: number[] = [];
    const sleep = async (ms: number) => {
      delays.push(ms);
      if (delays.length === 3) mock.mode.heartbeat = 'ok';
      if (mock.beats.length >= 2) abort.abort();
      await new Promise((r) => setTimeout(r, 2));
    };
    await runAgent({ config, log, collect: async () => heartbeat, sleep, random: () => 1 }, abort.signal);
    expect(delays.slice(0, 3)).toEqual([1000, 2000, 4000]);
    expect(mock.beats.length).toBeGreaterThanOrEqual(2);
    // After success the normal interval resumes.
    expect(delays[delays.length - 1]).toBe(config.heartbeatIntervalMs);
  });

  it('stops on 401 and does not retry', async () => {
    mock.mode.heartbeat = '401';
    const abort = new AbortController();
    const result = await runAgent({ config, log, collect: async () => heartbeat, sleep: fastSleep }, abort.signal);
    expect(result).toBe('revoked');
    expect(mock.beats).toHaveLength(1);
    expect(logs.some((l) => l.includes('rejected the credential'))).toBe(true);
  });

  it('fails clearly with no credential and no token', async () => {
    await expect(
      runAgent({ config: { ...config, enrolmentToken: undefined }, log, collect: async () => heartbeat }, new AbortController().signal),
    ).rejects.toThrow(/FACTO_ENROLMENT_TOKEN/);
  });
});
