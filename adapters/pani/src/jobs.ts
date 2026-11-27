import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunItem } from '@facto/contracts';
import { z } from 'zod';

// Pani writes these files; we only read them. Unknown fields are ignored on purpose.
const JobFile = z.object({
  title: z.string().optional(),
  status: z.string(),
  note: z.string().optional(),
  created: z.string().optional(),
  started: z.string().optional(),
  finished: z.string().optional(),
  error: z.string().optional(),
});
const ResultFile = z.object({
  chunks_done: z.number().int().nonnegative().optional(),
  chunks_total: z.number().int().nonnegative().optional(),
  chunks: z.array(z.object({ repo: z.string().optional() }).loose()).optional(),
});

const JOB_ID = /^j-[A-Za-z0-9_-]{1,100}$/;
const TICKET_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;
const SAFE_REPO = /^[A-Za-z0-9._-]{1,100}$/;
const STATUS_MAP: Record<string, RunItem['status']> = {
  queued: 'queued',
  running: 'running',
  done: 'done',
  partial: 'partial',
  failed: 'failed',
};

export const mapStatus = (raw: string): RunItem['status'] => STATUS_MAP[raw.trim().toLowerCase()] ?? 'other';

export const extractTicketKey = (...texts: Array<string | undefined>): string | undefined => {
  for (const t of texts) {
    const m = t ? TICKET_KEY.exec(t) : null;
    if (m) return m[0];
  }
  return undefined;
};

/** Absolute, home-relative and dot-relative path-like tokens are replaced, then the text is cut to 200 characters. */
export const sanitizeError = (raw: string): string =>
  raw
    .replace(/(^|[\s"'(=:])(?:~|\.{1,2})?\/[^\s"')]*/g, '$1<path>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

const iso = (v: string | undefined): string | undefined => {
  if (!v) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

async function readJson<T>(file: string, schema: z.ZodType<T>): Promise<{ ok: true; value: T } | { ok: false; missing: boolean }> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    return { ok: false, missing: (err as NodeJS.ErrnoException).code === 'ENOENT' };
  }
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, missing: false };
  } catch {
    return { ok: false, missing: false }; // partially written
  }
}

export type JobRead =
  | { kind: 'ok'; item: RunItem; resultUnreadable: boolean }
  | { kind: 'unreadable' };

/** Builds one RunItem from a job directory. Never includes logs, chunk titles, commits, diffs or paths. */
export async function readJob(jobsDir: string, id: string): Promise<JobRead> {
  const dir = join(jobsDir, id);
  const job = await readJson(join(dir, 'job.json'), JobFile);
  if (!job.ok) return { kind: 'unreadable' };
  const j = job.value;

  const result = await readJson(join(dir, 'result.json'), ResultFile);
  // No result.json is normal for a job that has not finished; a broken one is counted as unreadable.
  const resultUnreadable = !result.ok && !result.missing;
  const r = result.ok ? result.value : undefined;

  const startedAt = iso(j.started);
  const finishedAt = iso(j.finished);
  const duration = startedAt && finishedAt ? (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000 : undefined;
  const repos = [...new Set((r?.chunks ?? []).map((c) => c.repo).filter((x): x is string => !!x && SAFE_REPO.test(x)))];
  const ticketKey = extractTicketKey(j.title, j.note);
  const error = j.error ? sanitizeError(j.error) : '';

  const item: RunItem = {
    externalId: id,
    title: (j.title?.trim() || id).slice(0, 500),
    status: mapStatus(j.status),
    statusLabel: j.status.trim().slice(0, 200),
    source: 'pani',
    ...(ticketKey ? { ticketKey } : {}),
    ...(repos.length ? { repo: repos.join(', ').slice(0, 200) } : {}),
    ...(r?.chunks_done !== undefined ? { chunksDone: r.chunks_done } : {}),
    ...(r?.chunks_total !== undefined ? { chunksTotal: r.chunks_total } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...(duration !== undefined && duration >= 0 ? { durationSeconds: Math.round(duration) } : {}),
    ...(error ? { error } : {}),
  };
  return { kind: 'ok', item, resultUnreadable };
}

export interface ScanResult {
  /** Newest first. */
  jobs: Array<{ id: string; read: JobRead }>;
  /** Job directories found beyond the PANI_MAX_JOBS limit (not read). */
  omitted: number;
}

/** Returns null when the jobs directory does not exist or cannot be listed. */
export async function scanJobs(stateDir: string, maxJobs: number): Promise<ScanResult | null> {
  const jobsDir = join(stateDir, 'jobs');
  let entries;
  try {
    entries = await readdir(jobsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  // Job ids embed their creation time (j-YYYYMMDD-HHMM-xxxx), so a reverse sort is newest first.
  const ids = entries.filter((e) => e.isDirectory() && JOB_ID.test(e.name)).map((e) => e.name).sort().reverse();
  const picked = ids.slice(0, maxJobs);
  const jobs = await Promise.all(picked.map(async (id) => ({ id, read: await readJob(jobsDir, id) })));
  return { jobs, omitted: ids.length - picked.length };
}
