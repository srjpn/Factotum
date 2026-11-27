import type { AdapterHealthReport, RunItem } from '@facto/contracts';
import { scanJobs } from './jobs.js';

export interface SyncDeps {
  stateDir: string;
  maxJobs: number;
  /** Pushes the snapshot to the core (adapter.syncInventory('run', items)). */
  push: (items: RunItem[]) => Promise<unknown>;
  log: (message: string) => void;
}

/**
 * One sync cycle. Jobs that disappear from disk drop out of the snapshot. A job whose file is
 * unreadable (for example half written) keeps its last good item for this cycle, so it does not flap.
 * A missing state directory pushes nothing: it must not wipe the core's data.
 */
export class PaniSyncer {
  private readonly lastGood = new Map<string, RunItem>();
  private health: AdapterHealthReport = { status: 'degraded', detail: 'first sync pending' };

  constructor(private readonly deps: SyncDeps) {}

  healthCheck = (): AdapterHealthReport => this.health;

  async runOnce(): Promise<void> {
    const scan = await scanJobs(this.deps.stateDir, this.deps.maxJobs);
    if (!scan) {
      this.health = { status: 'down', detail: 'Pani jobs directory not found or not readable (check PANI_STATE_DIR)' };
      this.deps.log(this.health.detail ?? 'jobs directory missing');
      return;
    }

    const items: RunItem[] = [];
    const present = new Set<string>();
    let unreadable = 0;
    for (const { id, read } of scan.jobs) {
      present.add(id);
      if (read.kind === 'ok') {
        this.lastGood.set(id, read.item);
        items.push(read.item);
        if (read.resultUnreadable) unreadable++;
      } else {
        unreadable++;
        const cached = this.lastGood.get(id);
        if (cached) items.push(cached);
      }
    }
    for (const id of this.lastGood.keys()) if (!present.has(id)) this.lastGood.delete(id);

    await this.deps.push(items);
    const note = scan.omitted ? `; ${scan.omitted} older job(s) beyond PANI_MAX_JOBS not shown` : '';
    this.health = unreadable
      ? { status: 'degraded', detail: `${unreadable} of ${scan.jobs.length} job file(s) unreadable${note}` }
      : { status: 'up', detail: `${items.length} job(s)${note}` };
  }
}
