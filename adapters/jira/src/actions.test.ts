import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { transitionIssue } from './actions.js';
import { JiraClient } from './jira.js';
import { MANIFEST } from './run.js';

// Mock Jira only: these tests never reach a real Jira.
describe('jira transition-issue', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise((r) => server!.close(r));
    server = undefined;
  });

  const start = async (transitions: unknown[] = [
    { id: '11', name: 'Start progress', to: { name: 'In Progress' } },
    { id: '21', name: 'Finish', to: { name: 'Done' } },
    { id: '31', name: 'Reopen', to: { name: 'In Progress' } },
  ]) => {
    const calls: { method: string; url: string; body?: unknown; auth?: string }[] = [];
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        calls.push({ method: req.method!, url: req.url!, body: raw ? JSON.parse(raw) : undefined, auth: req.headers.authorization });
        if (req.url === '/rest/api/3/issue/ACME-1/transitions') {
          if (req.method === 'GET') return void res.setHeader('content-type', 'application/json').end(JSON.stringify({ transitions }));
          return void res.writeHead(204).end();
        }
        res.writeHead(404).end();
      });
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    return { calls, jira: new JiraClient({ baseUrl, email: 'o@example.com', apiToken: 'tok' }) };
  };

  it('declares transition-issue as reversible with its own permission', () => {
    expect(MANIFEST.actions).toEqual([expect.objectContaining({ name: 'transition-issue', risk: 'reversible', permission: 'jira.transition' })]);
  });

  it('resolves a transition by name and posts only its id', async () => {
    const { calls, jira } = await start();
    const out = await transitionIssue(jira, ['ACME'], { issueKey: 'ACME-1', to: 'finish' });
    expect(out.detail).toContain('Done');
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ transition: { id: '21' } });
    expect(post.auth).toMatch(/^Basic /);
  });

  it('accepts an explicit transition id', async () => {
    const { calls, jira } = await start();
    await transitionIssue(jira, ['ACME'], { issueKey: 'ACME-1', transitionId: '11' });
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ transition: { id: '11' } });
  });

  it('refuses ambiguous or unknown targets, other projects and bad params without writing', async () => {
    const { calls, jira } = await start();
    await expect(transitionIssue(jira, ['ACME'], { issueKey: 'ACME-1', to: 'In Progress' })).rejects.toThrow(/more than one/);
    await expect(transitionIssue(jira, ['ACME'], { issueKey: 'ACME-1', to: 'Nowhere' })).rejects.toThrow(/no matching transition.*11:Start progress/);
    await expect(transitionIssue(jira, ['ACME'], { issueKey: 'OTHER-5', to: 'Done' })).rejects.toThrow(/configured project/);
    await expect(transitionIssue(jira, ['ACME'], { issueKey: 'ACME-1' })).rejects.toThrow(/exactly one/);
    await expect(transitionIssue(jira, ['ACME'], { issueKey: '../x', to: 'Done' })).rejects.toThrow(/invalid params/);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});
