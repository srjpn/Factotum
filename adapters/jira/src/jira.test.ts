import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';
import { issueToTask } from './convert.js';
import { JiraAuthError, JiraClient, JiraRateLimitError, type JiraIssue } from './jira.js';
import { redactingLogger } from './redact.js';
import { statusForCategory } from './status.js';
import { buildJql, JiraSyncer } from './syncer.js';

const EMAIL = 'owner@example.com';
const TOKEN = 'api-token-secret-9876';
const BASE = 'https://team.atlassian.net';

const issue = (key: string, o: Partial<JiraIssue['fields']> = {}): JiraIssue => ({
  key,
  fields: {
    summary: `Secret client title ${key}`,
    status: { name: 'In Review', statusCategory: { key: 'indeterminate' } },
    assignee: { displayName: 'Ada Lovelace' },
    updated: '2026-11-27T10:00:00.000+0000',
    project: { key: key.split('-')[0]! },
    ...o,
  },
});

describe('status category mapping', () => {
  it('maps new, indeterminate, done and anything else', () => {
    expect(statusForCategory('new')).toBe('todo');
    expect(statusForCategory('indeterminate')).toBe('in-progress');
    expect(statusForCategory('done')).toBe('done');
    expect(statusForCategory('undefined')).toBe('other');
    expect(statusForCategory(undefined)).toBe('other');
  });
});

describe('issueToTask', () => {
  it('converts an issue and keeps the Jira status name as label', () => {
    expect(issueToTask(issue('ACME-1'), `${BASE}/`, 'ACME')).toEqual({
      externalId: 'ACME-1',
      title: 'Secret client title ACME-1',
      status: 'in-progress',
      statusLabel: 'In Review',
      url: `${BASE}/browse/ACME-1`,
      source: 'jira',
      project: 'ACME',
      assignee: 'Ada Lovelace',
      updatedAt: '2026-11-27T10:00:00.000Z',
    });
  });
  it('tolerates missing fields', () => {
    const t = issueToTask({ key: 'X-2', fields: { summary: ' ', assignee: null } }, BASE, 'X');
    expect(t).toMatchObject({ title: '(untitled issue)', status: 'other', statusLabel: 'Unknown', project: 'X' });
    expect(t).not.toHaveProperty('assignee');
    expect(t).not.toHaveProperty('updatedAt');
  });
});

describe('config', () => {
  const env = {
    FACTO_API_URL: 'http://api', JIRA_BASE_URL: `${BASE}/`, JIRA_EMAIL: EMAIL, JIRA_API_TOKEN: TOKEN, JIRA_PROJECT_KEYS: 'ACME, BETA ,',
  };
  it('parses keys and defaults', () => {
    const c = loadConfig(env);
    expect(c).toMatchObject({ baseUrl: BASE, projectKeys: ['ACME', 'BETA'], syncIntervalMs: 60000 });
  });
  it('rejects bad keys without echoing secrets', () => {
    expect(() => loadConfig({ ...env, JIRA_PROJECT_KEYS: 'A" OR 1=1' })).toThrow(/JIRA_PROJECT_KEYS/);
    try { loadConfig({ ...env, JIRA_BASE_URL: 'nope' }); } catch (e) { expect((e as Error).message).not.toContain(TOKEN); }
    expect(() => loadConfig({ ...env, JIRA_API_TOKEN: undefined })).toThrow(/JIRA_API_TOKEN/);
  });
});

describe('JiraClient', () => {
  const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
  const client = (f: unknown, extra = {}) => new JiraClient({ baseUrl: BASE, email: EMAIL, apiToken: TOKEN, fetch: f as never, sleep: async () => undefined, ...extra });

  it('posts to search/jql with Basic auth and follows nextPageToken', async () => {
    const answers = [res(200, { issues: [issue('A-1')], nextPageToken: 'p2' }), res(200, { issues: [issue('A-2')], isLast: true })];
    const f = vi.fn(async () => answers.shift()!);
    const out = await client(f).search('project = "A"');
    expect(out.map((i) => i.key)).toEqual(['A-1', 'A-2']);
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]![0]).toBe(`${BASE}/rest/api/3/search/jql`);
    expect(calls[0]![1].method).toBe('POST');
    expect((calls[0]![1].headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')}`);
    expect(JSON.parse(calls[0]![1].body as string)).toEqual({ jql: 'project = "A"', fields: ['summary', 'status', 'assignee', 'updated', 'project'], maxResults: 100 });
    expect(JSON.parse(calls[1]![1].body as string).nextPageToken).toBe('p2');
    expect(calls[0]![0]).not.toContain(TOKEN);
  });
  it('raises an auth error on 401', async () => {
    await expect(client(async () => res(401)).search('x')).rejects.toBeInstanceOf(JiraAuthError);
  });
  it('backs off on 429 using Retry-After, then succeeds', async () => {
    const sleeps: number[] = [];
    const answers = [res(429, {}, { 'retry-after': '3' }), res(429), res(200, { issues: [], isLast: true })];
    const c = client(async () => answers.shift()!, { sleep: async (ms: number) => void sleeps.push(ms) });
    expect(await c.search('x')).toEqual([]);
    expect(sleeps).toEqual([3000, 2000]);
  });
  it('gives up after repeated 429, and error text never holds the response body', async () => {
    await expect(client(async () => res(429), { maxRetries: 1 }).search('x')).rejects.toBeInstanceOf(JiraRateLimitError);
    await expect(client(async () => res(500, { errorMessages: ['Secret client title'] })).search('x')).rejects.toThrow(/^Jira returned HTTP 500$/);
  });
});

describe('buildJql', () => {
  it('limits to open or recently updated issues and adds the optional extra', () => {
    expect(buildJql('ACME')).toBe('project = "ACME" AND (statusCategory != Done OR updated >= -14d)');
    expect(buildJql('ACME', 'labels = x')).toContain('AND (labels = x)');
  });
});

describe('JiraSyncer', () => {
  const setup = (impl: (jql: string) => Promise<JiraIssue[]>) => {
    const pushed: { externalId: string }[][] = [];
    const logs: string[] = [];
    const syncer = new JiraSyncer({
      jira: { search: impl }, baseUrl: BASE, projectKeys: ['A', 'B'],
      push: async (items) => void pushed.push(items as never), log: (m) => logs.push(m),
    });
    return { syncer, pushed, logs };
  };
  const byProject = (failing: Set<string>) => async (jql: string) => {
    const k = /project = "(\w+)"/.exec(jql)![1]!;
    if (failing.has(k)) throw new Error('boom');
    return [issue(`${k}-1`)];
  };

  it('combines projects into one push and reports up', async () => {
    const { syncer, pushed, logs } = setup(byProject(new Set()));
    await syncer.runOnce();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.map((t) => t.externalId)).toEqual(['A-1', 'B-1']);
    expect(syncer.healthCheck().status).toBe('up');
    expect(logs.join('\n')).not.toContain('Secret client title');
  });
  it('reuses cached issues for a failed project and reports degraded', async () => {
    const failing = new Set<string>();
    const { syncer, pushed } = setup(byProject(failing));
    await syncer.runOnce();
    failing.add('B');
    await syncer.runOnce();
    expect(pushed[1]!.map((t) => t.externalId)).toEqual(['A-1', 'B-1']);
    expect(syncer.healthCheck().status).toBe('degraded');
  });
  it('skips the push when a project failed and nothing is cached', async () => {
    const { syncer, pushed } = setup(byProject(new Set(['B'])));
    await syncer.runOnce();
    expect(pushed).toEqual([]);
    expect(syncer.healthCheck()).toMatchObject({ status: 'degraded' });
  });
  it('reports down on rejected credentials and pushes nothing', async () => {
    const { syncer, pushed } = setup(async () => { throw new JiraAuthError(401); });
    await syncer.runOnce();
    expect(pushed).toEqual([]);
    expect(syncer.healthCheck().status).toBe('down');
  });
});

describe('redactingLogger', () => {
  it('masks secrets', () => {
    const out: string[] = [];
    redactingLogger([TOKEN, EMAIL], (l) => out.push(l))(`x ${TOKEN} y ${EMAIL}`);
    expect(out[0]).toBe('x *** y ***');
  });
});
