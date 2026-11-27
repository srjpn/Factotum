import { z } from 'zod';
import type { JiraClient } from './jira.js';

export const TransitionParams = z
  .object({
    issueKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'not a Jira issue key'),
    /** Id from the issue's transitions. */
    transitionId: z.string().regex(/^\d{1,10}$/).optional(),
    /** Name of the transition or of the status it leads to (case-insensitive), for example `In Progress`. */
    to: z.string().min(1).max(100).optional(),
  })
  .refine((p) => (p.transitionId === undefined) !== (p.to === undefined), { message: 'give exactly one of transitionId or to' });

/**
 * `transition-issue` (LT-13, reversible: transition it back if the workflow allows). Only issues in the configured
 * projects. The transition is resolved against the issue's own available transitions, so a name that matches none
 * (or more than one) is refused rather than guessed. No fields or comments are written.
 */
export async function transitionIssue(
  jira: Pick<JiraClient, 'transitions' | 'transition'>,
  projectKeys: string[],
  params: Record<string, unknown>,
): Promise<{ detail: string }> {
  const parsed = TransitionParams.safeParse(params);
  if (!parsed.success) throw new Error(`invalid params: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'params'} ${i.message}`).join('; ')}`);
  const { issueKey, transitionId, to } = parsed.data;
  const project = issueKey.slice(0, issueKey.lastIndexOf('-')).toUpperCase();
  if (!projectKeys.some((k) => k.toUpperCase() === project)) throw new Error(`issue ${issueKey} is not in a configured project`);

  const available = await jira.transitions(issueKey);
  const wanted = to?.trim().toLowerCase();
  const matches = available.filter((t) =>
    transitionId !== undefined ? t.id === transitionId : t.name.toLowerCase() === wanted || t.to?.name?.toLowerCase() === wanted,
  );
  if (matches.length === 0) {
    throw new Error(`no matching transition for ${issueKey}; available: ${available.map((t) => `${t.id}:${t.name}`).join(', ') || 'none'}`);
  }
  if (matches.length > 1) throw new Error(`more than one transition matches for ${issueKey}; use transitionId`);
  const chosen = matches[0]!;
  await jira.transition(issueKey, chosen.id);
  return { detail: `transitioned ${issueKey} with "${chosen.name}"${chosen.to?.name ? ` to ${chosen.to.name}` : ''}` };
}
