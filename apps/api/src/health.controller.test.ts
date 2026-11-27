import { describe, expect, it } from 'vitest';
import { HealthSchema } from '@facto/contracts';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns a response that matches the contract', () => {
    expect(HealthSchema.parse(new HealthController().get())).toEqual({ status: 'ok', service: 'api' });
  });
});
