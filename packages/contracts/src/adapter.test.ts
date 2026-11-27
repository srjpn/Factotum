import { describe, expect, it } from 'vitest';
import { scopesForManifest, validateManifest, type AdapterManifest } from './adapter.js';

const valid = {
  name: 'docker',
  version: '0.1.0',
  domain: 'hosting',
  tier: 'control',
  actions: [
    { name: 'restart-container', permission: 'hosting.restart', risk: 'reversible' },
    { name: 'remove-container', permission: 'hosting.remove', risk: 'destructive' },
  ],
  health: '/healthz',
};

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest(valid).ok).toBe(true);
  });

  it('rejects an undeclared risk level', () => {
    const r = validateManifest({ ...valid, actions: [{ ...valid.actions[0], risk: 'harmless' }] });
    expect(r.ok).toBe(false);
  });

  it('rejects an action with no risk level', () => {
    expect(validateManifest({ ...valid, actions: [{ name: 'x', permission: 'a.b' }] }).ok).toBe(false);
  });

  it('rejects a missing required field', () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.health;
    const r = validateManifest(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('health');
  });

  it('derives scopes from declared permissions', () => {
    expect(scopesForManifest(valid as AdapterManifest)).toEqual([
      'adapter.health.report',
      'hosting.remove',
      'hosting.restart',
    ]);
  });
});
