import { describe, expect, it } from 'vitest';
import { bearerToken, generateSecret, hashSecret, secretsMatch } from './secrets.js';

describe('secrets', () => {
  it('generates distinct prefixed secrets', () => {
    const a = generateSecret('facto_node');
    expect(a.startsWith('facto_node_')).toBe(true);
    expect(a).not.toBe(generateSecret('facto_node'));
  });

  it('hashes deterministically without revealing the secret', () => {
    expect(hashSecret('x')).toBe(hashSecret('x'));
    expect(hashSecret('x')).not.toContain('x');
  });

  it('compares secrets', () => {
    expect(secretsMatch('same', 'same')).toBe(true);
    expect(secretsMatch('same', 'other')).toBe(false);
  });

  it('parses bearer headers', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});
