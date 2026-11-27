/**
 * The only place a transcript line is read. A line is parsed and then reduced to the fields below;
 * everything else (message text, prompts, tool inputs, file paths, cwd, ...) is dropped here and
 * can never reach the rest of the adapter.
 */
export interface Usage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface ParsedLine {
  type: 'user' | 'assistant';
  /** epoch ms */
  ts: number;
  sidechain: boolean;
  model?: string;
  usage?: Usage;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function parseLine(line: string): ParsedLine | null {
  if (line.length < 2 || line.length > 20_000_000) return null;
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const type = r.type;
  if (type !== 'user' && type !== 'assistant') return null;
  const ts = typeof r.timestamp === 'string' ? Date.parse(r.timestamp) : NaN;
  if (!Number.isFinite(ts)) return null;
  const out: ParsedLine = { type, ts, sidechain: r.isSidechain === true };
  if (type === 'assistant' && r.message && typeof r.message === 'object') {
    const m = r.message as Record<string, unknown>;
    if (typeof m.model === 'string' && m.model && m.model !== '<synthetic>') out.model = m.model.slice(0, 100);
    if (m.usage && typeof m.usage === 'object') {
      const u = m.usage as Record<string, unknown>;
      out.usage = {
        input: num(u.input_tokens),
        output: num(u.output_tokens),
        cacheWrite: num(u.cache_creation_input_tokens),
        cacheRead: num(u.cache_read_input_tokens),
      };
    }
  }
  return out;
}
