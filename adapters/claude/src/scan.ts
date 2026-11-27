import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseLine, type Usage } from './parse.js';

export const BUCKET_MS = 5 * 60_000;
/** A gap between two messages shorter than this counts as active time. */
export const IDLE_GAP_MS = 5 * 60_000;
export const RETENTION_MS = 30 * 24 * 3600_000;

/** Running totals for one transcript. Only numbers, times and model names; no content. */
export interface FileState {
  sessionId: string;
  projectDir: string;
  size: number;
  mtimeMs: number;
  /** bytes consumed so far, always at the end of a complete line */
  offset: number;
  firstTs?: number;
  lastTs?: number;
  messages: number;
  sidechain: number;
  models: Set<string>;
  tokens: Usage;
  latestContext?: number;
  /** `${bucketStartMs}|${model}` -> usage, for rolling windows and per-day totals */
  buckets: Map<string, Usage & { messages: number }>;
  /** active time per local day (YYYY-MM-DD) */
  activeByDay: Map<string, number>;
  activeMs: number;
  costTokensByModel: Map<string, Usage>;
}

export const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const zero = (): Usage => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
export const addUsage = (a: Usage, b: Usage): Usage => {
  a.input += b.input; a.output += b.output; a.cacheWrite += b.cacheWrite; a.cacheRead += b.cacheRead;
  return a;
};

export const newState = (sessionId: string, projectDir: string): FileState => ({
  sessionId, projectDir, size: 0, mtimeMs: 0, offset: 0, messages: 0, sidechain: 0, models: new Set(), tokens: zero(),
  buckets: new Map(), activeByDay: new Map(), activeMs: 0, costTokensByModel: new Map(),
});

export function applyLine(st: FileState, line: string): void {
  const p = parseLine(line);
  if (!p) return;
  st.messages += 1;
  if (p.sidechain) st.sidechain += 1;
  if (st.firstTs === undefined || p.ts < st.firstTs) st.firstTs = p.ts;
  if (st.lastTs !== undefined && p.ts > st.lastTs) {
    const gap = p.ts - st.lastTs;
    if (gap < IDLE_GAP_MS) {
      st.activeMs += gap;
      const k = dayKey(p.ts);
      st.activeByDay.set(k, (st.activeByDay.get(k) ?? 0) + gap);
    }
  }
  if (st.lastTs === undefined || p.ts > st.lastTs) st.lastTs = p.ts;
  if (p.type !== 'assistant' || !p.usage) return;
  const model = p.model ?? 'unknown';
  st.models.add(model);
  addUsage(st.tokens, p.usage);
  addUsage(st.costTokensByModel.get(model) ?? st.costTokensByModel.set(model, zero()).get(model)!, p.usage);
  st.latestContext = p.usage.input + p.usage.cacheRead + p.usage.cacheWrite;
  const key = `${Math.floor(p.ts / BUCKET_MS) * BUCKET_MS}|${model}`;
  const b = st.buckets.get(key) ?? st.buckets.set(key, { ...zero(), messages: 0 }).get(key)!;
  addUsage(b, p.usage);
  b.messages += 1;
}

/** Streams only the bytes after `st.offset`, line by line. A trailing partial line is left for the next call. */
export async function readAppended(path: string, st: FileState, size: number): Promise<void> {
  if (size < st.offset) Object.assign(st, newState(st.sessionId, st.projectDir)); // truncated or replaced: start over
  if (size === st.offset) return;
  const stream = createReadStream(path, { start: st.offset, end: size - 1 });
  let consumed = st.offset;
  let carry = Buffer.alloc(0);
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    let buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    let nl: number;
    while ((nl = buf.indexOf(0x0a)) !== -1) {
      applyLine(st, buf.subarray(0, nl).toString('utf8'));
      consumed += nl + 1;
      buf = buf.subarray(nl + 1);
    }
    carry = Buffer.from(buf); // partial line; copied so the chunk can be released
    if (carry.length > 64 * 1024 * 1024) { consumed += carry.length; carry = Buffer.alloc(0); } // one absurd line: skip it
  }
  st.offset = consumed;
}

/** Drops buckets and day entries older than the retention window. */
export function prune(st: FileState, now: number): void {
  for (const k of st.buckets.keys()) if (Number(k.split('|')[0]) < now - RETENTION_MS) st.buckets.delete(k);
  const cutoff = dayKey(now - RETENTION_MS);
  for (const k of st.activeByDay.keys()) if (k < cutoff) st.activeByDay.delete(k);
}

export interface TranscriptFile { path: string; sessionId: string; projectDir: string; size: number; mtimeMs: number }

/** Lists `<projects>/<dir>/<session>.jsonl` (top level of each project only) modified within the retention window. */
export async function listTranscripts(root: string, now: number): Promise<TranscriptFile[]> {
  let dirs: string[];
  try {
    dirs = await readdir(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: TranscriptFile[] = [];
  for (const dir of dirs) {
    let names: string[];
    try { names = await readdir(join(root, dir)); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(root, dir, name);
      try {
        const s = await stat(path);
        if (!s.isFile() || s.mtimeMs < now - RETENTION_MS) continue;
        out.push({ path, sessionId: name.slice(0, -'.jsonl'.length), projectDir: dir, size: s.size, mtimeMs: s.mtimeMs });
      } catch { /* vanished */ }
    }
  }
  return out;
}

/** Keeps per-file state in memory and re-reads only appended bytes. Files that disappear or age out are forgotten. */
export class TranscriptCache {
  readonly files = new Map<string, FileState>();

  async refresh(root: string, now: number = Date.now()): Promise<FileState[]> {
    const listed = await listTranscripts(root, now);
    const seen = new Set<string>();
    for (const f of listed) {
      seen.add(f.path);
      let st = this.files.get(f.path);
      if (!st) this.files.set(f.path, (st = newState(f.sessionId, f.projectDir)));
      if (f.size === st.offset && f.mtimeMs === st.mtimeMs) continue;
      try {
        await readAppended(f.path, st, f.size);
      } catch { continue; } // vanished mid-read; try next cycle
      st.size = f.size;
      st.mtimeMs = f.mtimeMs;
      prune(st, now);
    }
    for (const k of [...this.files.keys()]) if (!seen.has(k)) this.files.delete(k);
    return [...this.files.values()];
  }
}
