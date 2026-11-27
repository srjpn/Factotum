import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeCli, startJob, stopJob } from './actions.js';
import { loadConfig } from './config.js';
import { MANIFEST } from './run.js';

// Fixtures and a fake CLI only: the real Pani is never started.
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pani-actions-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function job(id: string, status: string) {
  await mkdir(join(dir, 'jobs', id), { recursive: true });
  await writeFile(join(dir, 'jobs', id, 'job.json'), JSON.stringify({ title: 'T', status }));
}
const fakeCli = () => {
  const calls: string[][] = [];
  return { calls, cli: async (args: string[]) => (calls.push(args), '{}') };
};

describe('pani start-job and stop-job', () => {
  it('declares both actions as reversible with their own permissions', () => {
    expect(MANIFEST.actions?.map((a) => [a.name, a.risk, a.permission])).toEqual([
      ['start-job', 'reversible', 'pani.start'],
      ['stop-job', 'reversible', 'pani.stop'],
    ]);
  });

  it('kicks the runner only for a queued job', async () => {
    await job('j-1', 'queued');
    await job('j-2', 'running');
    await job('j-3', 'done');
    const { calls, cli } = fakeCli();
    const deps = { stateDir: dir, cli };
    expect((await startJob(deps, { jobId: 'j-1' })).detail).toContain('kicked');
    expect(calls).toEqual([['kick']]);
    expect((await startJob(deps, { jobId: 'j-2' })).detail).toContain('already running');
    await expect(startJob(deps, { jobId: 'j-3' })).rejects.toThrow(/is done/);
    await expect(startJob(deps, { jobId: 'j-9' })).rejects.toThrow(/not found/);
    expect(calls).toHaveLength(1);
  });

  it('cancels a queued job and asks a running one to stop; refuses a finished one', async () => {
    await job('j-1', 'queued');
    await job('j-2', 'running');
    await job('j-3', 'failed');
    const { calls, cli } = fakeCli();
    const deps = { stateDir: dir, cli };
    expect((await stopJob(deps, { jobId: 'j-1' })).detail).toContain('cancelled');
    expect((await stopJob(deps, { jobId: 'j-2' })).detail).toContain('next check');
    await expect(stopJob(deps, { jobId: 'j-3' })).rejects.toThrow(/nothing to stop/);
    expect(calls).toEqual([['cancel', 'j-1'], ['cancel', 'j-2']]);
  });

  it('rejects bad job ids (no path traversal) and works only when the CLI is configured', async () => {
    const { calls, cli } = fakeCli();
    await expect(stopJob({ stateDir: dir, cli }, { jobId: '../etc' })).rejects.toThrow(/invalid params/);
    await expect(startJob({ stateDir: dir, cli }, {})).rejects.toThrow(/invalid params/);
    await job('j-1', 'queued');
    await expect(startJob({ stateDir: dir }, { jobId: 'j-1' })).rejects.toThrow(/PANI_CLI/);
    expect(calls).toHaveLength(0);
  });

  it('nodeCli passes arguments without a shell and with a minimal environment', async () => {
    const script = join(dir, 'fake-pani.mjs');
    await writeFile(script, "import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2] === 'cancel' ? new URL('./out.json', import.meta.url) : new URL('./other.json', import.meta.url), JSON.stringify({argv: process.argv.slice(2), secret: process.env.FACTO_ADMIN_TOKEN ?? null})); console.log('ok');");
    process.env['FACTO_ADMIN_TOKEN'] = 'must-not-leak';
    try {
      expect((await nodeCli(script)(['cancel', 'j-1; rm -rf /'])).trim()).toBe('ok');
    } finally {
      delete process.env['FACTO_ADMIN_TOKEN'];
    }
    expect(JSON.parse(await readFile(join(dir, 'out.json'), 'utf8'))).toEqual({ argv: ['cancel', 'j-1; rm -rf /'], secret: null });
    await expect(nodeCli(join(dir, 'missing.mjs'))(['kick'])).rejects.toThrow(/pani CLI failed/);
  });

  it('reads PANI_CLI from the environment', () => {
    expect(loadConfig({ FACTO_API_URL: 'http://api', PANI_CLI: '/x/pani.mjs' }).cliPath).toBe('/x/pani.mjs');
    expect(loadConfig({ FACTO_API_URL: 'http://api' }).cliPath).toBeUndefined();
  });
});
