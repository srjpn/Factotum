import { execFile } from 'node:child_process';

export interface CmdResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Set when the command could not be started at all (missing binary, timeout). */
  spawnError?: string;
}

export type Runner = (cmd: string, args: string[]) => Promise<CmdResult>;

/** Runs one fixed read-only command. Arguments are never taken from outside the adapter. */
export const run: Runner = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15_000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve({ ok: true, stdout, stderr });
      const e = err as NodeJS.ErrnoException & { killed?: boolean };
      const spawnError = typeof e.code === 'string' || e.killed ? (e.killed ? 'timed out' : e.code) : undefined;
      resolve({ ok: false, stdout: stdout ?? '', stderr: stderr ?? '', spawnError });
    });
  });
