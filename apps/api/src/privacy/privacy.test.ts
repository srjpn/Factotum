import { describe, expect, it } from 'vitest';
import { checkTarget, parseTargets, type PrivacyPolicy } from './privacy.js';

const policy: PrivacyPolicy = { 'client-data': ['macbook'], personal: '*' };

describe('checkTarget', () => {
  it('allows a listed target for client-data', () => {
    expect(checkTarget(policy, 'client-data', 'macbook').decision).toBe('allow');
  });
  it('denies an unlisted target for client-data, with no substitute', () => {
    const r = checkTarget(policy, 'client-data', 'cloud-gpu');
    expect(r.decision).toBe('deny');
    expect(r.target).toBe('cloud-gpu');
  });
  it('is exact and case sensitive', () => {
    expect(checkTarget(policy, 'client-data', 'MacBook').decision).toBe('deny');
    expect(checkTarget(policy, 'client-data', 'mac').decision).toBe('deny');
  });
  it('denies everything when the list is empty', () => {
    expect(checkTarget({ ...policy, 'client-data': [] }, 'client-data', 'macbook').decision).toBe('deny');
  });
  it('allows any target for personal when set to *', () => {
    expect(checkTarget(policy, 'personal', 'anything').decision).toBe('allow');
  });
});

describe('parseTargets', () => {
  it('uses the fallback when unset, trims, and treats a lone * as any', () => {
    expect(parseTargets(undefined, [])).toEqual([]);
    expect(parseTargets(' a , b ,', [])).toEqual(['a', 'b']);
    expect(parseTargets('*', [])).toBe('*');
  });
  it('does not let * hide inside a list', () => {
    expect(parseTargets('a,*', [])).toEqual(['a']);
  });
});
