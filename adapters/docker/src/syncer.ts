import type { AdapterHealthReport, ContainerItem } from '@facto/contracts';
import { toContainerItems } from './convert.js';
import type { DockerClient } from './docker.js';

export interface SyncDeps {
  docker: Pick<DockerClient, 'listContainers'>;
  /** Pushes the snapshot to the core (adapter.syncInventory('container', items)). */
  push: (items: ContainerItem[]) => Promise<unknown>;
  log: (message: string) => void;
}

/** One sync cycle. If the daemon is unreachable the push is skipped, so inventory is never deleted because Docker is down. */
export class DockerSyncer {
  private health: AdapterHealthReport = { status: 'degraded', detail: 'first sync pending' };

  constructor(private readonly deps: SyncDeps) {}

  healthCheck = (): AdapterHealthReport => this.health;

  async runOnce(): Promise<void> {
    let items: ContainerItem[];
    try {
      items = toContainerItems(await this.deps.docker.listContainers());
    } catch (err) {
      const detail = (err as Error).message;
      this.deps.log(`docker unreachable, sync skipped: ${detail}`);
      this.health = { status: 'down', detail };
      return;
    }
    await this.deps.push(items);
    const running = items.filter((i) => i.status === 'running').length;
    this.health = { status: 'up', detail: `${items.length} containers (${running} running)` };
  }
}
