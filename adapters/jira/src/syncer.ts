import type { AdapterHealthReport, TaskItem } from '@facto/contracts';
import { issueToTask } from './convert.js';
import { JiraAuthError, type JiraClient } from './jira.js';

export interface SyncDeps {
  jira: Pick<JiraClient, 'search'>;
  baseUrl: string;
  projectKeys: string[];
  jqlExtra?: string;
  push: (items: TaskItem[]) => Promise<unknown>;
  /** Logs counts and project keys only. Never issue titles. */
  log: (message: string) => void;
}

export function buildJql(projectKey: string, extra?: string): string {
  const base = `project = "${projectKey}" AND (statusCategory != Done OR updated >= -14d)`;
  return extra ? `${base} AND (${extra})` : base;
}

/**
 * One sync cycle across all projects. A project that fails never causes its tasks to be removed:
 * its last good tasks are reused, and if there are none the push is skipped for this cycle.
 */
export class JiraSyncer {
  private readonly lastGood = new Map<string, TaskItem[]>();
  private health: AdapterHealthReport = { status: 'degraded', detail: 'first sync pending' };

  constructor(private readonly deps: SyncDeps) {}

  healthCheck = (): AdapterHealthReport => this.health;

  async runOnce(): Promise<void> {
    const { jira, projectKeys } = this.deps;
    const failures: string[] = [];
    let authFailed = false;
    let blocked = false; // a failed project with nothing cached: pushing would delete its tasks

    for (const key of projectKeys) {
      try {
        const issues = await jira.search(buildJql(key, this.deps.jqlExtra));
        this.lastGood.set(key, issues.map((i) => issueToTask(i, this.deps.baseUrl, key)));
      } catch (err) {
        if (err instanceof JiraAuthError) {
          authFailed = true;
          this.deps.log(err.message);
          break;
        }
        failures.push(key);
        this.deps.log(`project ${key}: ${(err as Error).message}`);
        if (!this.lastGood.has(key)) blocked = true;
      }
    }

    if (authFailed) {
      this.health = { status: 'down', detail: 'Jira rejected the credentials' };
      return;
    }
    if (blocked) {
      this.health = { status: 'degraded', detail: `sync skipped, project(s) failed: ${failures.join(', ')}` };
      return;
    }

    const seen = new Set<string>();
    const items = projectKeys.flatMap((k) => this.lastGood.get(k) ?? []).filter((t) => !seen.has(t.externalId) && seen.add(t.externalId));
    await this.deps.push(items);
    this.health = failures.length
      ? { status: 'degraded', detail: `using cached issues for failed project(s): ${failures.join(', ')}` }
      : { status: 'up', detail: `${items.length} issues from ${projectKeys.length} project(s)` };
    this.deps.log(`synced ${items.length} issues from ${projectKeys.length} project(s)`);
  }
}
