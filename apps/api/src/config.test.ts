import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  FACTO_DATABASE_URL: 'postgres://u:p@db:5432/facto',
  FACTO_ADMIN_TOKEN: 'a-long-enough-admin-token-for-tests',
};

describe('loadConfig', () => {
  it('reads settings from the environment', () => {
    expect(loadConfig({ ...base, FACTO_PORT: '4000' })).toEqual({
      port: 4000,
      databaseUrl: base.FACTO_DATABASE_URL,
      adminToken: base.FACTO_ADMIN_TOKEN,
      offlineAfterSeconds: 90,
      statusCheckSeconds: 15,
    });
  });

  it('keeps the offline window inside the 2 minute rule', () => {
    expect(() => loadConfig({ ...base, FACTO_OFFLINE_AFTER_SECONDS: '300' })).toThrow();
  });

  it('defaults the port', () => {
    expect(loadConfig(base).port).toBe(3000);
  });

  it('requires a database URL', () => {
    expect(() => loadConfig({ FACTO_ADMIN_TOKEN: base.FACTO_ADMIN_TOKEN })).toThrow();
  });

  it('requires a long admin token', () => {
    expect(() => loadConfig({ FACTO_DATABASE_URL: base.FACTO_DATABASE_URL })).toThrow();
    expect(() => loadConfig({ ...base, FACTO_ADMIN_TOKEN: 'short' })).toThrow();
  });
});
