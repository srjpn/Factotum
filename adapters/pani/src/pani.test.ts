import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunItemSchema, type RunItem } from '@facto/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { extractTicketKey, mapStatus, sanitizeError, scanJobs } from './jobs.js';
import { PaniSyncer } from './syncer.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pani-fixture-'));
  await mkdir(join(dir, 'jobs'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function job(id: string, jobJson: object | string, resultJson?: object | string) {
  const d = join(dir, 'jobs', id);
  await mkdir(d, { recursive: true });
  const text = (v: object | string) => (typeof v === 'string' ? v : JSON.stringify(v));
  await writeFile(join(d, 'job.json'), text(jobJson));
  if (resultJson !== undefined) await writeFile(join(d, 'result.json'), text(resultJson));
  await writeFile(join(d, 'runner.log'), 'LOG-SECRET /Users/someone/code/app.ts');
}

const base = { id: 'x', title: 'Fix the widget', status: 'done', created: '2026-11-20T10:00:00.000Z', note: '', options: {} };
const result = (over: object = {}) => ({
  job_id: 'x',
  status: 'done',
  chunks_done: 2,
  chunks_total: 3,
  chunks: [
    { id: 'c1', title: 'SECRET CHUNK TITLE', repo: 'web', branch: 'b1', status: 'done', attempts: 1, commit: 'abc123', diff: 'DIFF-SECRET' },
    { id: 'c2', title: 'another chunk', repo: 'api', branch: 'b2', status: 'done', attempts: 1, commit: null },
    { id: 'c3', title: 'third', repo: 'web', branch: 'b3', status: 'pending', attempts: 0, commit: null },
  ],
  run_dir: '/Users/someone/.config/runs/x',
  summary: '/Users/someone/.config/runs/x/summary.md',
  note: 'long note',
  ...over,
});

describe('status and ticket key', () => {
  it('maps known statuses and everything else to other', () => {
    for (const s of ['queued', 'running', 'done', 'partial', 'failed']) expect(mapStatus(s)).toBe(s);
    expect(mapStatus('cancelled')).toBe('other');
    expect(mapStatus('')).toBe('other');
  });
  it('extracts a ticket key from the title, then the note', () => {
    expect(extractTicketKey('Implement ABC-123 search', 'XYZ-9')).toBe('ABC-123');
    expect(extractTicketKey('no key here', 'see PROJ2-45 for context')).toBe('PROJ2-45');
    expect(extractTicketKey('lowercase abc-1', undefined)).toBeUndefined();
    expect(extractTicketKey(undefined, '')).toBeUndefined();
  });
  it('scrubs path-like text from errors and truncates to 200 characters', () => {
    const e = sanitizeError('ENOENT: cannot open /Users/someone/code/app.ts and ~/x/y or ./rel/p');
    expect(e).not.toMatch(/Users|\/x\/y|rel\/p/);
    expect(sanitizeError('x'.repeat(500))).toHaveLength(200);
  });
});

describe('scanJobs', () => {
  it('builds valid run items, newest first, with durations and repos', async () => {
    await job('j-20261120-1000-aaaa', { ...base, title: 'Fix the widget for ABC-1', started: '2026-11-20T10:00:10.000Z', finished: '2026-11-20T10:05:10.000Z' }, result());
    await job('j-20261121-1000-bbbb', { ...base, status: 'cancelled' });
    await job('j-20261122-1000-cccc', { ...base, status: 'failed', error: 'boom at /Users/someone/x.ts' }, result({ chunks_done: 0 }));
    const scan = (await scanJobs(dir, 10))!;
    expect(scan.jobs.map((j) => j.id)).toEqual(['j-20261122-1000-cccc', 'j-20261121-1000-bbbb', 'j-20261120-1000-aaaa']);
    const items = scan.jobs.map((j) => (j.read.kind === 'ok' ? j.read.item : null)!);
    for (const i of items) expect(RunItemSchema.safeParse(i).success).toBe(true);
    const done = items[2]!;
    expect(done).toMatchObject({
      externalId: 'j-20261120-1000-aaaa',
      status: 'done',
      ticketKey: 'ABC-1',
      repo: 'web, api',
      chunksDone: 2,
      chunksTotal: 3,
      durationSeconds: 300,
      startedAt: '2026-11-20T10:00:10.000Z',
      source: 'pani',
    });
    expect(items[1]).toMatchObject({ status: 'other', statusLabel: 'cancelled' });
    expect(items[1]).not.toHaveProperty('chunksDone'); // no result.json yet
    expect(items[0]!.error).toBe('boom at <path>');
  });

  it('never leaks logs, paths, diffs, commits or chunk titles', async () => {
    await job('j-20261120-1000-aaaa', { ...base, error: 'see /Users/someone/.config/log.txt' }, result());
    const raw = JSON.stringify((await scanJobs(dir, 10))!.jobs);
    for (const secret of ['LOG-SECRET', '/Users/', 'DIFF-SECRET', 'abc123', 'SECRET CHUNK TITLE', 'summary.md', 'run_dir', 'another chunk']) {
      expect(raw).not.toContain(secret);
    }
  });

  it('keeps only plain repo names, so a path-like repo is dropped', async () => {
    await job('j-20261120-1000-aaaa', base, result({ chunks: [{ repo: '/Users/someone/proj' }, { repo: 'web' }] }));
    const r = (await scanJobs(dir, 10))!.jobs[0]!.read;
    expect(r.kind === 'ok' && r.item.repo).toBe('web');
  });

  it('counts broken, partial and invalid files instead of failing', async () => {
    await job('j-20261120-1000-aaaa', '{"id": "x", "title": "Half wri'); // truncated JSON
    await job('j-20261121-1000-bbbb', { title: 'no status' }); // fails validation
    await job('j-20261122-1000-cccc', base, '{"job_id": '); // good job, broken result
    await mkdir(join(dir, 'jobs', 'j-20261123-1000-dddd')); // no job.json
    await writeFile(join(dir, 'jobs', '.lock'), '123'); // not a job
    await mkdir(join(dir, 'jobs', 'not-a-job'));
    const scan = (await scanJobs(dir, 10))!;
    expect(scan.jobs).toHaveLength(4);
    expect(scan.jobs.filter((j) => j.read.kind === 'unreadable')).toHaveLength(3);
    const good = scan.jobs.find((j) => j.id === 'j-20261122-1000-cccc')!.read;
    expect(good.kind === 'ok' && good.resultUnreadable).toBe(true);
  });

  it('honours the newest-first limit', async () => {
    for (const d of ['20261101', '20261102', '20261103']) await job(`j-${d}-1000-aaaa`, base);
    const scan = (await scanJobs(dir, 2))!;
    expect(scan.jobs.map((j) => j.id)).toEqual(['j-20261103-1000-aaaa', 'j-20261102-1000-aaaa']);
    expect(scan.omitted).toBe(1);
  });

  it('returns null for a missing state directory', async () => {
    expect(await scanJobs(join(dir, 'nope'), 10)).toBeNull();
  });
});

describe('PaniSyncer', () => {
  const make = () => {
    const pushed: RunItem[][] = [];
    const logs: string[] = [];
    const syncer = new PaniSyncer({ stateDir: dir, maxJobs: 50, push: async (i) => void pushed.push(i), log: (m) => logs.push(m) });
    return { syncer, pushed, logs };
  };

  it('reports up and pushes items; deleted jobs drop out', async () => {
    await job('j-20261120-1000-aaaa', base, result());
    await job('j-20261121-1000-bbbb', base);
    const { syncer, pushed } = make();
    await syncer.runOnce();
    expect(pushed[0]!.map((i) => i.externalId)).toEqual(['j-20261121-1000-bbbb', 'j-20261120-1000-aaaa']);
    expect(syncer.healthCheck().status).toBe('up');
    await rm(join(dir, 'jobs', 'j-20261121-1000-bbbb'), { recursive: true });
    await syncer.runOnce();
    expect(pushed[1]!.map((i) => i.externalId)).toEqual(['j-20261120-1000-aaaa']);
  });

  it('reports degraded for unreadable files and reuses the last good item for a half-written job', async () => {
    await job('j-20261120-1000-aaaa', { ...base, title: 'Original title' });
    const { syncer, pushed } = make();
    await syncer.runOnce();
    await writeFile(join(dir, 'jobs', 'j-20261120-1000-aaaa', 'job.json'), '{"title": "Orig'); // being rewritten
    await syncer.runOnce();
    expect(pushed[1]).toHaveLength(1);
    expect(pushed[1]![0]!.title).toBe('Original title');
    expect(syncer.healthCheck()).toMatchObject({ status: 'degraded' });
    expect(syncer.healthCheck().detail).toContain('1 of 1');
  });

  it('reports down with a clear detail and pushes nothing when the state directory is missing', async () => {
    const pushed: RunItem[][] = [];
    const syncer = new PaniSyncer({ stateDir: join(dir, 'missing'), maxJobs: 5, push: async (i) => void pushed.push(i), log: () => {} });
    await syncer.runOnce();
    expect(pushed).toHaveLength(0);
    expect(syncer.healthCheck()).toMatchObject({ status: 'down' });
    expect(syncer.healthCheck().detail).toContain('PANI_STATE_DIR');
  });

  it('pushes an empty snapshot for an empty jobs directory', async () => {
    const { syncer, pushed } = make();
    await syncer.runOnce();
    expect(pushed).toEqual([[]]);
    expect(syncer.healthCheck().status).toBe('up');
  });
});

describe('loadConfig', () => {
  it('requires the API URL and applies defaults', () => {
    expect(() => loadConfig({})).toThrow(/FACTO_API_URL/);
    const c = loadConfig({ FACTO_API_URL: 'http://api:3000' });
    expect(c).toMatchObject({ syncIntervalMs: 30_000, maxJobs: 200 });
    expect(c.stateDir).toContain('openhands-orchestrator');
    expect(loadConfig({ FACTO_API_URL: 'http://a', PANI_STATE_DIR: '/x', PANI_MAX_JOBS: '5' })).toMatchObject({ stateDir: '/x', maxJobs: 5 });
  });
});
