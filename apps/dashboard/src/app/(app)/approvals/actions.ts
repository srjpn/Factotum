'use server';

import { revalidatePath } from 'next/cache';
import { getEnv } from '@/lib/env';
import { decideApproval } from '@/lib/approvals';

// Runs on the server only: the owner token never reaches the browser. The session proxy guards this route.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState passes the previous state
export async function decide(id: string, decision: 'approve' | 'deny', _prev: string | null): Promise<string | null> {
  if (decision !== 'approve' && decision !== 'deny') return 'Unknown decision.';
  const env = getEnv();
  const result = await decideApproval({ baseUrl: env.FACTO_API_URL, token: env.FACTO_ADMIN_TOKEN }, id, decision);
  revalidatePath('/approvals');
  return result.ok ? null : result.message;
}
