import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('reads settings from the environment', () => {
    const config = loadConfig({ FACTO_PORT: '4000', FACTO_DATABASE_URL: 'postgres://u:p@db:5432/facto' });
    expect(config).toEqual({ port: 4000, databaseUrl: 'postgres://u:p@db:5432/facto' });
  });

  it('defaults the port', () => {
    expect(loadConfig({ FACTO_DATABASE_URL: 'postgres://u:p@db:5432/facto' }).port).toBe(3000);
  });

  it('requires a database URL', () => {
    expect(() => loadConfig({})).toThrow();
  });
});
