import { describe, expect, it } from 'vitest';
import { HealthSchema } from './health.js';

describe('HealthSchema', () => {
  it('accepts a valid health response', () => {
    expect(HealthSchema.parse({ status: 'ok', service: 'api' })).toEqual({ status: 'ok', service: 'api' });
  });

  it('rejects an unknown status', () => {
    expect(HealthSchema.safeParse({ status: 'down', service: 'api' }).success).toBe(false);
  });
});
