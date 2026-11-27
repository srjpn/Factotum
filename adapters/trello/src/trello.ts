export class TrelloAuthError extends Error {
  constructor(status: number) {
    super(`Trello rejected the credentials (HTTP ${status})`);
    this.name = 'TrelloAuthError';
  }
}
export class TrelloRateLimitError extends Error {
  constructor() {
    super('Trello rate limit (HTTP 429) persisted after retries');
    this.name = 'TrelloRateLimitError';
  }
}
export class TrelloHttpError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`Trello returned HTTP ${status} for ${path}`);
    this.name = 'TrelloHttpError';
  }
}

export interface TrelloList {
  id: string;
  name: string;
}
export interface TrelloCard {
  id: string;
  name: string;
  idList: string;
  url: string;
  dateLastActivity?: string;
  closed?: boolean;
}

export interface TrelloClientOptions {
  base: string;
  apiKey: string;
  token: string;
  fetch?: typeof fetch;
  /** Waits between 429 retries; injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const MAX_WAIT_MS = 60_000;

/** Trello client. Credentials travel in the Authorization header, never in the URL. Writes: `moveCard` only (LT-13). */
export class TrelloClient {
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: TrelloClientOptions) {
    this.doFetch = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async get<T>(path: string): Promise<T> {
    return this.call<T>('GET', path);
  }

  private async call<T>(method: 'GET' | 'PUT', path: string): Promise<T> {
    const retries = this.opts.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const res = await this.doFetch(`${this.opts.base}${path}`, {
        method,
        headers: {
          authorization: `OAuth oauth_consumer_key="${this.opts.apiKey}", oauth_token="${this.opts.token}"`,
          accept: 'application/json',
        },
      });
      if (res.status === 401 || res.status === 403) throw new TrelloAuthError(res.status);
      if (res.status === 429) {
        if (attempt >= retries) throw new TrelloRateLimitError();
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
        await this.sleep(Math.min(wait, MAX_WAIT_MS));
        continue;
      }
      if (!res.ok) throw new TrelloHttpError(res.status, path.split('?')[0]!);
      return (await res.json()) as T;
    }
  }

  async boardName(boardId: string): Promise<string> {
    return (await this.get<{ name: string }>(`/1/boards/${encodeURIComponent(boardId)}?fields=name`)).name;
  }
  lists(boardId: string): Promise<TrelloList[]> {
    return this.get(`/1/boards/${encodeURIComponent(boardId)}/lists?fields=name`);
  }
  cards(boardId: string): Promise<TrelloCard[]> {
    return this.get(
      `/1/boards/${encodeURIComponent(boardId)}/cards?fields=name,idList,url,dateLastActivity,closed,idMembers`,
    );
  }

  /** Where a card is now and which board it belongs to. */
  card(cardId: string): Promise<{ id: string; idBoard: string; idList: string }> {
    return this.get(`/1/cards/${encodeURIComponent(cardId)}?fields=idBoard,idList`);
  }
  list(listId: string): Promise<{ id: string; idBoard: string }> {
    return this.get(`/1/lists/${encodeURIComponent(listId)}?fields=idBoard`);
  }
  /** Moves a card to another list. Only `idList` is sent, so the card cannot change board through this call. */
  async moveCard(cardId: string, listId: string): Promise<void> {
    await this.call('PUT', `/1/cards/${encodeURIComponent(cardId)}?idList=${encodeURIComponent(listId)}`);
  }
}
