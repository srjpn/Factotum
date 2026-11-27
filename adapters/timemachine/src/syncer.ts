import type { AdapterHealthReport, BackupItem } from '@facto/contracts';
import type { Runner } from './exec.js';
import { isPermissionError, parseDestinations, parseLatestBackup, parseStatus, toBackupItem, type Observation } from './parse.js';

export interface SyncDeps {
  runner: Runner;
  push: (items: BackupItem[]) => Promise<unknown>;
  log: (message: string) => void;
  staleAfterMs: number;
  now?: () => number;
}

const PERMISSION_HINT = 'tmutil is not allowed to read backups; grant Full Disk Access to the terminal or process running this adapter';

/** One sync cycle. If tmutil cannot be read, nothing is pushed and health is `degraded`. Read-only subcommands only. */
export class TimeMachineSyncer {
  private health: AdapterHealthReport = { status: 'degraded', detail: 'first sync pending' };
  constructor(private readonly deps: SyncDeps) {}

  healthCheck = (): AdapterHealthReport => this.health;

  private degrade(detail: string): void {
    this.deps.log(`sync skipped: ${detail}`);
    this.health = { status: 'degraded', detail };
  }

  async runOnce(): Promise<void> {
    const { runner } = this.deps;
    const status = await runner('tmutil', ['status']);
    if (status.spawnError) return this.degrade(`tmutil could not run (${status.spawnError})`);
    const dest = await runner('tmutil', ['destinationinfo']);
    if (dest.spawnError) return this.degrade(`tmutil could not run (${dest.spawnError})`);
    const latest = await runner('tmutil', ['latestbackup']);
    if (latest.spawnError) return this.degrade(`tmutil could not run (${latest.spawnError})`);

    for (const r of [status, dest, latest]) {
      if (!r.ok && isPermissionError(`${r.stderr}\n${r.stdout}`)) return this.degrade(PERMISSION_HINT);
    }
    if (!status.ok) return this.degrade('tmutil status failed');
    if (!dest.ok) return this.degrade('tmutil destinationinfo failed');

    // latestbackup exits non-zero when the destination is unmounted or empty; that is data, not a fault.
    const obs: Observation = {
      ...parseStatus(status.stdout),
      destination: parseDestinations(dest.stdout),
      ...(latest.ok ? { lastBackupAt: parseLatestBackup(latest.stdout) } : {}),
    };
    const item = toBackupItem(obs, (this.deps.now ?? Date.now)(), this.deps.staleAfterMs);
    await this.deps.push([item]);
    this.health = {
      status: 'up',
      detail: item.lastBackupAt ? `${item.statusLabel}; last ${item.lastBackupAt}` : item.statusLabel,
    };
  }
}
