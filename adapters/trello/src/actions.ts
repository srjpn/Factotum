import { z } from 'zod';
import type { TrelloClient } from './trello.js';

const Id = z.string().regex(/^[A-Za-z0-9]{1,64}$/, 'not a Trello id');
export const MoveCardParams = z.object({ cardId: Id, listId: Id });

/**
 * `move-card` (LT-13, reversible: move it back). Refuses a card or list outside the configured boards, and a
 * list on a different board than the card, so a request can never reach a board the owner did not configure.
 */
export async function moveCard(
  trello: Pick<TrelloClient, 'card' | 'list' | 'moveCard'>,
  boardIds: string[],
  params: Record<string, unknown>,
): Promise<{ detail: string }> {
  const parsed = MoveCardParams.safeParse(params);
  if (!parsed.success) throw new Error(`invalid params: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  const { cardId, listId } = parsed.data;
  const card = await trello.card(cardId);
  const list = await trello.list(listId);
  if (!boardIds.includes(card.idBoard)) throw new Error('card is not on a configured board');
  if (list.idBoard !== card.idBoard) throw new Error('list is on a different board than the card');
  if (card.idList === listId) return { detail: `card ${cardId} already in list ${listId}` };
  await trello.moveCard(cardId, listId);
  return { detail: `moved card ${cardId} from list ${card.idList} to ${listId}` };
}
