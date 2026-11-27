import { describe, expect, it } from 'vitest';
import type { NewActivity } from '../activity/activity.service.js';
import { InMemoryAdapterRepository } from './adapter.repository.js';
import { AdaptersController } from './adapters.controller.js';
import { AdaptersService } from './adapters.service.js';
import { hashToken } from './tokens.js';

const manifest = {
  name: 'docker',
  version: '0.1.0',
  domain: 'hosting',
  tier: 'control',
  actions: [{ name: 'restart-container', permission: 'hosting.restart', risk: 'reversible' }],
  health: '/healthz',
};

// Owner auth (AdminGuard) is covered by the integration test; these are service-level tests.
function setup() {
  const repo = new InMemoryAdapterRepository();
  const entries: NewActivity[] = [];
  const activity = { record: async (e: NewActivity) => void entries.push(e) };
  const pool = { connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }) } as never;
  const controller = new AdaptersController(new AdaptersService(repo, activity, pool));
  return { repo, entries, controller };
}

describe('adapter registration', () => {
  it('registers a valid manifest, returns the token once and stores only its hash', async () => {
    const { controller, repo, entries } = setup();
    const reg = await controller.register(manifest);
    expect(reg.token).toMatch(/^facto_adp_/);
    expect(reg.scopes).toEqual(['adapter.health.report', 'hosting.restart']);

    const stored = await repo.findByName('docker');
    expect(stored?.tokenHash).toBe(hashToken(reg.token));
    expect(JSON.stringify(stored)).not.toContain(reg.token);
    expect(JSON.stringify(await controller.list())).not.toContain(reg.token);

    expect(entries.map((e) => [e.action, e.risk, e.outcome])).toEqual([
      ['adapter.register', 'privileged', 'success'],
      ['adapter.token.issue', 'privileged', 'success'],
    ]);
    expect(JSON.stringify(entries)).not.toContain(reg.token);
  });

  it('rejects an undeclared risk level and logs the rejection', async () => {
    const { controller, entries } = setup();
    const bad = { ...manifest, actions: [{ ...manifest.actions[0], risk: 'harmless' }] };
    await expect(controller.register(bad)).rejects.toMatchObject({ status: 400 });
    expect(entries[0]).toMatchObject({ action: 'adapter.register', outcome: 'denied' });
  });

  it('rejects a manifest missing a required field', async () => {
    const { controller } = setup();
    const rest: Record<string, unknown> = { ...manifest };
    delete rest.version;
    await expect(controller.register(rest)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a duplicate name', async () => {
    const { controller } = setup();
    await controller.register(manifest);
    await expect(controller.register(manifest)).rejects.toMatchObject({ status: 409 });
  });
});

describe('adapter health', () => {
  it('accepts a report with the adapter token', async () => {
    const { controller } = setup();
    const reg = await controller.register(manifest);
    const out = await controller.health(`Bearer ${reg.token}`, { status: 'up', detail: 'ok' });
    expect(out).toMatchObject({ name: 'docker', status: 'up', statusDetail: 'ok' });
    expect(out.lastSeenAt).not.toBeNull();
  });

  it('rejects a wrong or missing service token', async () => {
    const { controller } = setup();
    await controller.register(manifest);
    await expect(controller.health(undefined, { status: 'up' })).rejects.toMatchObject({ status: 401 });
    await expect(controller.health('Bearer facto_adp_wrong', { status: 'up' })).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an invalid report body', async () => {
    const { controller } = setup();
    const reg = await controller.register(manifest);
    await expect(controller.health(`Bearer ${reg.token}`, { status: 'great' })).rejects.toMatchObject({ status: 400 });
  });
});
