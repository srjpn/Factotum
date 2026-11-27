import type { AdapterHealthReport, ServiceItem } from '@facto/contracts';
import type { DevServersConfig } from './config.js';
import type { Runner } from './exec.js';
import { parseCwds, parseListeners, toServiceItems } from './parse.js';

export interface SyncDeps {
  runner: Runner;
  push: (items: ServiceItem[]) => Promise<unknown>;
  log: (message: string) => void;
  config: Pick<DevServersConfig, 'ignorePorts' | 'ignoreProcesses' | 'minPort'>;
}

/** One sync cycle. If lsof fails the push is skipped, so inventory is not deleted because of a transient error. */
export class DevServersSyncer {
  private health: AdapterHealthReport = { status: 'degraded', detail: 'first sync pending' };
  constructor(private readonly deps: SyncDeps) {}

  healthCheck = (): AdapterHealthReport => this.health;

  async runOnce(): Promise<void> {
    const { runner, config } = this.deps;
    // Field output with only pid, command name and address: never arguments or environment.
    const res = await runner('lsof', ['-nP', '+c', '0', '-iTCP', '-sTCP:LISTEN', '-Fpcn']);
    if (res.spawnError || (!res.ok && !res.stdout)) {
      const detail = `lsof failed${res.spawnError ? ` (${res.spawnError})` : res.stderr ? `: ${res.stderr.trim().slice(0, 200)}` : ''}`;
      this.deps.log(`sync skipped: ${detail}`);
      this.health = { status: 'degraded', detail };
      return;
    }
    const listeners = parseListeners(res.stdout);
    const pids = [...new Set(listeners.map((l) => l.pid))];
    // Working directory is a best-effort second call; failure only means no workingDir.
    let cwds = new Map<number, string>();
    if (pids.length) {
      const cwd = await runner('lsof', ['-nP', '-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')]);
      if (cwd.stdout) cwds = parseCwds(cwd.stdout);
    }
    const items = toServiceItems(listeners, cwds, config);
    await this.deps.push(items);
    this.health = { status: 'up', detail: `${items.length} dev server${items.length === 1 ? '' : 's'} listening` };
  }
}
