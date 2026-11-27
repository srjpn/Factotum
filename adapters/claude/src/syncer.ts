import type { AdapterHealthReport, ClaudeSessionItem, ClaudeUsageItem } from '@facto/contracts';
import { aggregate, type AggregateOptions } from './aggregate.js';
import type { FileState } from './scan.js';

export interface SyncDeps {
  refresh: (now: number) => Promise<FileState[]>;
  options: Omit<AggregateOptions, 'now'>;
  pushSessions: (items: ClaudeSessionItem[]) => Promise<unknown>;
  pushUsage: (items: ClaudeUsageItem[]) => Promise<unknown>;
  log: (message: string) => void;
  now?: () => number;
}

/** One sync cycle. If the transcripts cannot be read the push is skipped, so inventory is never deleted because of a read error. */
export class ClaudeSyncer {
  private health: AdapterHealthReport = { status: 'degraded', detail: 'first sync pending' };

  constructor(private readonly deps: SyncDeps) {}

  healthCheck = (): AdapterHealthReport => this.health;

  async runOnce(): Promise<void> {
    const now = (this.deps.now ?? Date.now)();
    let result: ReturnType<typeof aggregate>;
    try {
      result = aggregate(await this.deps.refresh(now), { ...this.deps.options, now });
    } catch (err) {
      const detail = (err as Error).message;
      this.deps.log(`cannot read transcripts, sync skipped: ${detail}`);
      this.health = { status: 'down', detail };
      return;
    }
    await this.deps.pushSessions(result.sessions);
    await this.deps.pushUsage(result.usage);
    const active = result.sessions.filter((s) => s.status === 'active').length;
    this.health = { status: 'up', detail: `${result.sessions.length} sessions (${active} active)` };
  }
}
