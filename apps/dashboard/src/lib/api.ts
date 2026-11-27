import { ActivityEntrySchema, AdapterSummarySchema, InventoryItemSchema, NodeSchema, type ActivityEntry, type AdapterSummary, type InventoryItem, type Node } from '@facto/contracts';
import { z } from 'zod';

export type ApiFailure = { ok: false; kind: 'unreachable' | 'unauthorized' | 'http' | 'invalid'; message: string };
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export interface ApiConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Server-side only: the token never reaches the browser. */
export async function apiGet<T>(config: ApiConfig, path: string, schema: z.ZodType<T>): Promise<ApiResult<T>> {
  const doFetch = config.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(new URL(path, config.baseUrl), {
      headers: { authorization: `Bearer ${config.token}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(config.timeoutMs ?? 5000),
    });
  } catch {
    return { ok: false, kind: 'unreachable', message: 'The Facto API is unreachable.' };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, kind: 'unauthorized', message: 'The API rejected the dashboard token (401). Check FACTO_ADMIN_TOKEN.' };
  }
  if (!res.ok) return { ok: false, kind: 'http', message: `The API returned an error (HTTP ${res.status}).` };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, kind: 'invalid', message: 'The API returned a response that is not JSON.' };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'invalid', message: 'The API response did not match the expected shape.' };
  return { ok: true, data: parsed.data };
}

export const listNodes = (c: ApiConfig): Promise<ApiResult<Node[]>> => apiGet(c, '/nodes', z.array(NodeSchema));

export const listActivity = (c: ApiConfig, limit: number): Promise<ApiResult<ActivityEntry[]>> =>
  apiGet(c, `/activity?limit=${limit}`, z.array(ActivityEntrySchema));

export const listTasks = (c: ApiConfig): Promise<ApiResult<InventoryItem[]>> =>
  apiGet(c, '/inventory?kind=task', z.array(InventoryItemSchema));

export const listInventory = (c: ApiConfig, kind: 'task' | 'run' | 'container' | 'claude-session' | 'claude-usage'): Promise<ApiResult<InventoryItem[]>> =>
  apiGet(c, `/inventory?kind=${kind}`, z.array(InventoryItemSchema));

export const listAdapters = (c: ApiConfig): Promise<ApiResult<AdapterSummary[]>> => apiGet(c, '/adapters', z.array(AdapterSummarySchema));
