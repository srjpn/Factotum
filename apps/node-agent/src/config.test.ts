import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('reads the control plane URL', () => {
    expect(loadConfig({ FACTO_API_URL: 'http://facto.tailnet:3000' })).toEqual({ apiUrl: 'http://facto.tailnet:3000' });
  });

  it('has no default URL', () => {
    expect(() => loadConfig({})).toThrow();
  });
});
