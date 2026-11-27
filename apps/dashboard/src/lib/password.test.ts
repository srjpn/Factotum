import { describe, expect, it } from 'vitest';
import { passwordMatches } from './password';
import { LoginThrottle } from './throttle';

describe('passwordMatches', () => {
  it('accepts the right password and rejects others', () => {
    expect(passwordMatches('correct horse', 'correct horse')).toBe(true);
    expect(passwordMatches('correct horsf', 'correct horse')).toBe(false);
    expect(passwordMatches('', 'correct horse')).toBe(false);
    expect(passwordMatches('correct horse extra', 'correct horse')).toBe(false);
  });
});

describe('LoginThrottle', () => {
  it('locks after repeated failures and resets on success', () => {
    let now = 0;
    const t = new LoginThrottle(() => now);
    for (let i = 0; i < 4; i++) t.recordFailure();
    expect(t.lockedForMs()).toBe(0);
    t.recordFailure();
    expect(t.lockedForMs()).toBe(60_000);
    now = 61_000;
    expect(t.lockedForMs()).toBe(0);
    t.recordSuccess();
    t.recordFailure();
    expect(t.lockedForMs()).toBe(0);
  });
});
