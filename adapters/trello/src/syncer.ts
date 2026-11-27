import type { AdapterHealthReport, TaskItem } from '@facto/contracts';
import { cardsToTasks } from './convert.js';
import { TrelloAuthError, type TrelloClient } from './trello.js';
import type { TaskStatus } from './status.js';

export interface SyncDeps {
  trello: Pick<TrelloClient, 'boardName' | 'lists' | 'cards'>;
  boardIds: string[];
  statusMap: Map<string, TaskStatus>;
  /** Pushes the combined snapshot to the core (adapter.syncInventory('task', items)). */
  push: (items: TaskItem[]) => Promise<unknown>;
  log: (message: string) => void;
}

/**
 * One sync cycle across all boards. A board that fails never causes its cards to be removed:
 * its last good cards are reused, and if there are none the push is skipped for this cycle.
 */
export class TrelloSyncer {
  private readonly lastGood = new Map<string, TaskItem[]>();
  private health: AdapterHealthReport = { status: 'degraded', detail: 'first sync pending' };

  constructor(private readonly deps: SyncDeps) {}

  healthCheck = (): AdapterHealthReport => this.health;

  async runOnce(): Promise<void> {
    const { trello, boardIds } = this.deps;
    const failures: string[] = [];
    let authFailed = false;
    let blocked = false; // a failed board with nothing cached: pushing would delete its cards

    for (const id of boardIds) {
      try {
        const [name, lists, cards] = [await trello.boardName(id), await trello.lists(id), await trello.cards(id)];
        this.lastGood.set(id, cardsToTasks(name, lists, cards, this.deps.statusMap));
      } catch (err) {
        if (err instanceof TrelloAuthError) {
          authFailed = true;
          this.deps.log(err.message);
          break;
        }
        failures.push(id);
        this.deps.log(`board ${id}: ${(err as Error).message}`);
        if (!this.lastGood.has(id)) blocked = true;
      }
    }

    if (authFailed) {
      this.health = { status: 'down', detail: 'Trello rejected the credentials' };
      return;
    }
    if (blocked) {
      this.health = { status: 'degraded', detail: `sync skipped, board(s) failed: ${failures.join(', ')}` };
      return;
    }

    const items = boardIds.flatMap((id) => this.lastGood.get(id) ?? []);
    await this.deps.push(items);
    this.health = failures.length
      ? { status: 'degraded', detail: `using cached cards for failed board(s): ${failures.join(', ')}` }
      : { status: 'up', detail: `${items.length} cards from ${boardIds.length} board(s)` };
  }
}
