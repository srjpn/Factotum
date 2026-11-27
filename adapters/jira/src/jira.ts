export class JiraAuthError extends Error {
  constructor(status: number) {
    super(`Jira rejected the credentials (HTTP ${status})`);
    this.name = 'JiraAuthError';
  }
}
export class JiraRateLimitError extends Error {
  constructor() {
    super('Jira rate limit (HTTP 429) persisted after retries');
    this.name = 'JiraRateLimitError';
  }
}
export class JiraHttpError extends Error {
  constructor(readonly status: number) {
    super(`Jira returned HTTP ${status}`); // never includes the response body: it can contain client data
    this.name = 'JiraHttpError';
  }
}

export interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string } };
    assignee?: { displayName?: string } | null;
    updated?: string;
    project?: { key?: string };
  };
}

interface SearchPage {
  issues?: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

export interface JiraClientOptions {
  baseUrl: string;
  email: string;
  apiToken: string;
  pageSize?: number;
  fetch?: typeof fetch;
  /** Waits between 429 retries; injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const MAX_WAIT_MS = 60_000;
const MAX_PAGES = 500; // guard against a server that never says it is last
export const FIELDS = ['summary', 'status', 'assignee', 'updated', 'project'];

/** Read-only Jira Cloud client (REST v3 enhanced search). Credentials travel only in the Authorization header. */
export class JiraClient {
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly authHeader: string;

  constructor(private readonly opts: JiraClientOptions) {
    this.doFetch = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.authHeader = `Basic ${Buffer.from(`${opts.email}:${opts.apiToken}`).toString('base64')}`;
  }

  /** The header value, so callers can mask it in logs. */
  get secretHeaderValue(): string {
    return this.authHeader;
  }

  private async post(body: unknown): Promise<SearchPage> {
    const retries = this.opts.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const res = await this.doFetch(`${this.opts.baseUrl}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: { authorization: this.authHeader, accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401 || res.status === 403) throw new JiraAuthError(res.status);
      if (res.status === 429) {
        if (attempt >= retries) throw new JiraRateLimitError();
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
        await this.sleep(Math.min(wait, MAX_WAIT_MS));
        continue;
      }
      if (!res.ok) throw new JiraHttpError(res.status);
      return (await res.json()) as SearchPage;
    }
  }

  /** Runs a JQL search and follows nextPageToken until the last page. */
  async search(jql: string): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let token: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.post({
        jql,
        fields: FIELDS,
        maxResults: this.opts.pageSize ?? 100,
        ...(token ? { nextPageToken: token } : {}),
      });
      issues.push(...(res.issues ?? []));
      if (res.isLast || !res.nextPageToken) return issues;
      token = res.nextPageToken;
    }
    throw new Error('Jira search returned too many pages');
  }
}
