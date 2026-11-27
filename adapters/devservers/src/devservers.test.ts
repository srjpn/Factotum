import { INVENTORY_KINDS } from '@facto/contracts';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import type { CmdResult, Runner } from './exec.js';
import { classifyBind, parseCwds, parseListeners, toServiceItems } from './parse.js';
import { DevServersSyncer } from './syncer.js';

const LISTEN = [
  'p100', 'cnode', 'f20', 'n127.0.0.1:3000',
  'p200', 'cvite', 'f21', 'n*:5173', 'f22', 'n[::1]:5173',
  'p300', 'crapportd', 'f9', 'n*:53220',
  'p400', 'cpython3', 'f5', 'n192.168.1.5:8000',
  'p500', 'cpostgres', 'f6', 'n127.0.0.1:5432',
  'p600', 'cnode', 'f7', 'n[::1]:80',
  'p700', 'cMy\\x20Server', 'f8', 'n[::]:4000',
].join('\n');
const CWD = ['p100', 'n/Users/me/work/client-secret-project/web', 'p200', 'n/Users/me/sites/blog', 'p500', 'n/', 'p700', 'n/Users/me/a\\x20b'].join('\n');
const cfg = () => loadConfig({ FACTO_API_URL: 'http://x:3000', DEVSERVERS_IGNORE_PORTS: '5432' });
const ok = (stdout: string): CmdResult => ({ ok: true, stdout, stderr: '' });

describe('parsers', () => {
  it('parses lsof field output', () => {
    const l = parseListeners(LISTEN);
    expect(l[0]).toEqual({ pid: 100, command: 'node', address: '127.0.0.1', port: 3000 });
    expect(l.find((x) => x.pid === 700)).toMatchObject({ command: 'My Server', address: '[::]', port: 4000 });
  });
  it('keeps only the last segment of the working directory', () => {
    const m = parseCwds(CWD);
    expect(m.get(100)).toBe('web');
    expect(m.get(200)).toBe('blog');
    expect(m.has(500)).toBe(false);
    expect(m.get(700)).toBe('a b');
  });
  it('classifies binds', () => {
    expect(classifyBind('*')).toBe('all');
    expect(classifyBind('[::]')).toBe('all');
    expect(classifyBind('127.0.0.1')).toBe('localhost');
    expect(classifyBind('[::1]')).toBe('localhost');
    expect(classifyBind('192.168.1.5')).toBeUndefined();
  });
});

describe('toServiceItems', () => {
  it('drops LAN binds, low ports, ignored ports and processes; merges v4 and v6; output is schema-valid', () => {
    const items = toServiceItems(parseListeners(LISTEN), parseCwds(CWD), cfg());
    expect(items.map((i) => [i.port, i.process, i.workingDir, i.bind])).toEqual([
      [3000, 'node', 'web', 'localhost'],
      [4000, 'My Server', 'a b', 'all'],
      [5173, 'vite', 'blog', 'all'],
    ]);
    for (const i of items) expect(INVENTORY_KINDS.service.safeParse(i).success).toBe(true);
    expect(JSON.stringify(items)).not.toContain('client-secret-project');
  });
  it('honours DEVSERVERS_IGNORE_PROCESSES case-insensitively', () => {
    const c = loadConfig({ FACTO_API_URL: 'http://x:3000', DEVSERVERS_IGNORE_PROCESSES: 'VITE' });
    expect(toServiceItems(parseListeners(LISTEN), parseCwds(CWD), c).map((i) => i.port)).not.toContain(5173);
  });
});

describe('syncer', () => {
  it('pushes services, calls lsof read-only without any argument-printing flags', async () => {
    const calls: string[][] = [];
    const runner: Runner = async (cmd, args) => { calls.push([cmd, ...args]); return ok(args.includes('cwd') ? CWD : LISTEN); };
    const pushed: unknown[][] = [];
    const s = new DevServersSyncer({ runner, push: async (i) => void pushed.push(i), log: () => {}, config: cfg() });
    await s.runOnce();
    expect(pushed[0]).toHaveLength(3);
    expect(s.healthCheck()).toEqual({ status: 'up', detail: '3 dev servers listening' });
    expect(calls.every((c) => c[0] === 'lsof')).toBe(true);
    expect(calls[0]).toContain('-Fpcn');
    expect(calls.flat()).not.toContain('-c'); // no command filter / no ps-style arguments
  });
  it('degrades and pushes nothing when lsof fails', async () => {
    const runner: Runner = async () => ({ ok: false, stdout: '', stderr: 'lsof: permission denied', spawnError: undefined });
    const pushed: unknown[] = [];
    const logs: string[] = [];
    const s = new DevServersSyncer({ runner, push: async (i) => void pushed.push(i), log: (m) => logs.push(m), config: cfg() });
    await s.runOnce();
    expect(pushed).toHaveLength(0);
    expect(s.healthCheck()).toMatchObject({ status: 'degraded', detail: expect.stringContaining('permission denied') });
  });
  it('still pushes without working directories when the cwd call fails', async () => {
    const runner: Runner = async (_c, args) => (args.includes('cwd') ? { ok: false, stdout: '', stderr: 'x' } : ok(LISTEN));
    const pushed: { workingDir?: string }[][] = [];
    const s = new DevServersSyncer({ runner, push: async (i) => void pushed.push(i as { workingDir?: string }[]), log: () => {}, config: cfg() });
    await s.runOnce();
    expect(pushed[0]).toHaveLength(3);
    expect(pushed[0]!.every((i) => i.workingDir === undefined)).toBe(true);
  });
});

describe('loadConfig', () => {
  it('requires the API URL, rejects bad ports', () => {
    expect(() => loadConfig({})).toThrow(/FACTO_API_URL/);
    expect(() => loadConfig({ FACTO_API_URL: 'http://x', DEVSERVERS_IGNORE_PORTS: 'abc' })).toThrow(/port numbers/);
  });
});
