import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { z } from 'zod';
import { readJob } from './jobs.js';

const JobParams = z.object({ jobId: z.string().regex(/^j-[A-Za-z0-9_-]{1,100}$/, 'not a Pani job id') });

/** Runs `node <pani.mjs> <args>` and returns stdout. Injectable so tests never start a real Pani. */
export type PaniCli = (args: string[]) => Promise<string>;

export function nodeCli(cliPath: string, timeoutMs = 15_000): PaniCli {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [cliPath, ...args],
        // No shell, a minimal environment, and a hard timeout. Output is never logged (it can name client paths).
        { timeout: timeoutMs, env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' }, maxBuffer: 256 * 1024 },
        (err, stdout) => (err ? reject(new Error(`pani CLI failed (${(err as NodeJS.ErrnoException).code ?? 'error'})`)) : resolve(stdout)),
      );
    });
}

export interface PaniActionDeps {
  stateDir: string;
  /** Undefined when PANI_CLI is not configured: the actions then fail with a clear message. */
  cli?: PaniCli;
}

async function statusOf(deps: PaniActionDeps, jobId: string): Promise<string> {
  const read = await readJob(join(deps.stateDir, 'jobs'), jobId);
  if (read.kind !== 'ok') throw new Error(`job ${jobId} was not found or is unreadable`);
  return read.item.statusLabel.toLowerCase();
}

function needCli(deps: PaniActionDeps): PaniCli {
  if (!deps.cli) throw new Error('write actions are disabled: set PANI_CLI to the path of Pani\'s scripts/pani.mjs');
  return deps.cli;
}

/**
 * `start-job` (LT-13, reversible: stop it). Pani jobs are created by its own pipeline after the human plan
 * approval, so Factotum can only start a job that is already `queued`: it runs `pani kick`, which starts the
 * runner if none is running. The runner then works through ALL queued jobs, not only this one. Idempotent.
 */
export async function startJob(deps: PaniActionDeps, params: Record<string, unknown>): Promise<{ detail: string }> {
  const cli = needCli(deps);
  const parsed = JobParams.safeParse(params);
  if (!parsed.success) throw new Error('invalid params: jobId is not a Pani job id');
  const { jobId } = parsed.data;
  const status = await statusOf(deps, jobId);
  if (status === 'running') return { detail: `job ${jobId} is already running` };
  if (status !== 'queued') throw new Error(`job ${jobId} is ${status}; only a queued job can be started`);
  await cli(['kick']);
  return { detail: `runner kicked for queued job ${jobId}` };
}

/**
 * `stop-job` (LT-13, reversible as far as Pani allows). Runs `pani cancel <id>`: a queued job becomes cancelled at
 * once; a running job gets Pani's CANCEL marker and stops at its next check, so it is cooperative, not a kill.
 * A cancelled job is not resumed; to redo the work submit a follow-up.
 */
export async function stopJob(deps: PaniActionDeps, params: Record<string, unknown>): Promise<{ detail: string }> {
  const cli = needCli(deps);
  const parsed = JobParams.safeParse(params);
  if (!parsed.success) throw new Error('invalid params: jobId is not a Pani job id');
  const { jobId } = parsed.data;
  const status = await statusOf(deps, jobId);
  if (status !== 'queued' && status !== 'running') throw new Error(`job ${jobId} is ${status}; nothing to stop`);
  await cli(['cancel', jobId]);
  return { detail: status === 'queued' ? `job ${jobId} cancelled` : `cancel requested for running job ${jobId}; it stops at its next check` };
}
