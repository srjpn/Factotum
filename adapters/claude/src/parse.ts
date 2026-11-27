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
  /** Names of owner-facing tool_use blocks in this assistant line (names only, from OWNER_TOOLS). */
  askTool?: { id: string; name: string };
  /** tool_use_ids answered by tool_result blocks in this user line. */
  resultIds?: string[];
}

/** Tools that stop and wait for the owner. Question text and options are never read. */
export const OWNER_TOOLS: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode']);

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/**
 * A session title record. Claude Code writes `custom-title` (`customTitle`, set by the owner) and
 * `agent-name` (`agentName`, a fallback); neither has a timestamp. Titles are user-written and
 * may mention clients: they are client-data and are never logged.
 */
export interface ParsedTitle {
  type: 'custom-title' | 'agent-name';
  title: string;
}

export function parseLine(line: string): ParsedLine | ParsedTitle | null {
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
  if (type === 'custom-title' || type === 'agent-name') {
    const t = type === 'custom-title' ? r.customTitle : r.agentName;
    const title = typeof t === 'string' ? t.trim().slice(0, 200) : '';
    return title ? { type, title } : null;
  }
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
  const content = r.message && typeof r.message === 'object' ? (r.message as Record<string, unknown>).content : undefined;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (type === 'assistant' && b.type === 'tool_use' && typeof b.name === 'string' && OWNER_TOOLS.has(b.name) && typeof b.id === 'string') {
        out.askTool = { id: b.id.slice(0, 200), name: b.name };
      } else if (type === 'user' && b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
        (out.resultIds ??= []).push(b.tool_use_id.slice(0, 200));
      }
    }
  }
  return out;
}
