import { RiskLevelSchema } from '@facto/contracts';
import { describe, expect, it } from 'vitest';
import { policyFor } from './policy.js';

describe('policyFor', () => {
  it('lets read and reversible run, and holds destructive and privileged for the owner', () => {
    expect(policyFor('read')).toBe('allow');
    expect(policyFor('reversible')).toBe('allow');
    expect(policyFor('destructive')).toBe('approval');
    expect(policyFor('privileged')).toBe('approval');
  });

  it('has a tier for every risk level', () => {
    for (const risk of RiskLevelSchema.options) expect(['allow', 'approval']).toContain(policyFor(risk));
  });
});
