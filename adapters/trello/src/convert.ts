import type { TaskItem } from '@facto/contracts';
import { statusForList, type TaskStatus } from './status.js';
import type { TrelloCard, TrelloList } from './trello.js';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Converts one board's cards to tasks. Closed (archived) cards are skipped. */
export function cardsToTasks(
  boardName: string,
  lists: TrelloList[],
  cards: TrelloCard[],
  statusMap: Map<string, TaskStatus>,
): TaskItem[] {
  const listNames = new Map(lists.map((l) => [l.id, l.name]));
  const tasks: TaskItem[] = [];
  for (const card of cards) {
    if (card.closed) continue;
    const listName = listNames.get(card.idList);
    tasks.push({
      externalId: card.id,
      title: clip(card.name.trim() || '(untitled card)', 500),
      status: listName === undefined ? 'other' : statusForList(statusMap, listName),
      statusLabel: clip(listName ?? 'Unknown list', 200),
      url: card.url,
      source: 'trello',
      project: clip(boardName, 200),
      ...(card.dateLastActivity ? { updatedAt: card.dateLastActivity } : {}),
    });
  }
  return tasks;
}
