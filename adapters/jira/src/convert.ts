import type { TaskItem } from '@facto/contracts';
import type { JiraIssue } from './jira.js';
import { statusForCategory } from './status.js';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Converts one Jira issue to a task. Titles are client data: they are never logged, only pushed to Facto. */
export function issueToTask(issue: JiraIssue, baseUrl: string, fallbackProject: string): TaskItem {
  const f = issue.fields;
  return {
    externalId: issue.key,
    title: clip(f.summary?.trim() || '(untitled issue)', 500),
    status: statusForCategory(f.status?.statusCategory?.key),
    statusLabel: clip(f.status?.name ?? 'Unknown', 200),
    url: `${baseUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(issue.key)}`,
    source: 'jira',
    project: clip(f.project?.key ?? fallbackProject, 200),
    ...(f.assignee?.displayName ? { assignee: clip(f.assignee.displayName, 200) } : {}),
    ...(f.updated ? { updatedAt: toIso(f.updated) } : {}),
  };
}

// Jira sends "2026-11-27T10:00:00.000+0000"; Facto expects ISO 8601 with a valid offset.
function toIso(s: string): string {
  const d = new Date(s.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}
