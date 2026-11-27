import { describe, expect, it } from 'vitest';
import { BACKOFF_CAP_MS, backoffDelay } from './backoff.js';

describe('backoffDelay', () => {
  it('doubles the ceiling per attempt without jitter at max', () => {
    expect([1, 2, 3, 4].map((a) => backoffDelay(a, () => 1))).toEqual([1000, 2000, 4000, 8000]);
  });
  it('caps at 60 seconds', () => {
    expect(backoffDelay(20, () => 1)).toBe(BACKOFF_CAP_MS);
  });
  it('jitters between half and full ceiling', () => {
    expect(backoffDelay(3, () => 0)).toBe(2000);
    expect(backoffDelay(3, () => 0.5)).toBe(3000);
  });
});
