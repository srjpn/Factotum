import { ApprovalSchema, type Approval } from '@facto/contracts';
import { z } from 'zod';
import { apiGet, type ApiConfig, type ApiResult } from './api';

export const listApprovals = (c: ApiConfig): Promise<ApiResult<Approval[]>> =>
  apiGet(c, '/approvals', z.array(ApprovalSchema));

/** Server-side only. Approves or denies one request; the API logs the decision and the approver. */
export async function decideApproval(
  c: ApiConfig,
  id: string,
  decision: 'approve' | 'deny',
): Promise<{ ok: true } | { ok: false; message: string }> {
  let res: Response;
  try {
    res = await (c.fetchImpl ?? fetch)(new URL(`/approvals/${encodeURIComponent(id)}/${decision}`, c.baseUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${c.token}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(c.timeoutMs ?? 5000),
    });
  } catch {
    return { ok: false, message: 'The Facto API is unreachable.' };
  }
  if (res.ok) return { ok: true };
  if (res.status === 409) return { ok: false, message: 'This request was already decided or has expired.' };
  if (res.status === 404) return { ok: false, message: 'This request no longer exists.' };
  if (res.status === 401) return { ok: false, message: 'The API rejected the dashboard token (401).' };
  return { ok: false, message: `The API returned an error (HTTP ${res.status}).` };
}
