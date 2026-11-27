import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const good = {
  FACTO_API_URL: 'http://api.internal:3000',
  FACTO_ADMIN_TOKEN: 'a'.repeat(24),
  FACTO_DASHBOARD_PASSWORD: 'long-enough-password',
  FACTO_SESSION_SECRET: 's'.repeat(32),
};

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    expect(parseEnv(good).FACTO_API_URL).toBe('http://api.internal:3000');
  });
  it('requires every variable, with no defaults', () => {
    for (const key of Object.keys(good)) {
      const rest: Record<string, string> = { ...good };
      delete rest[key];
      expect(() => parseEnv(rest)).toThrow(key);
    }
  });
  it('rejects a short session secret without echoing it', () => {
    const bad = { ...good, FACTO_SESSION_SECRET: 'tooshort-secret' };
    expect(() => parseEnv(bad)).toThrow(/FACTO_SESSION_SECRET/);
    expect(() => parseEnv(bad)).not.toThrow(/tooshort-secret/);
  });
  it('treats an empty cookie override as unset', () => {
    expect(parseEnv({ ...good, FACTO_COOKIE_SECURE: '' }).FACTO_COOKIE_SECURE).toBeUndefined();
    expect(() => parseEnv({ ...good, FACTO_COOKIE_SECURE: 'maybe' })).toThrow(/FACTO_COOKIE_SECURE/);
  });
  it('rejects a non-http API URL', () => {
    expect(() => parseEnv({ ...good, FACTO_API_URL: 'ftp://x' })).toThrow(/FACTO_API_URL/);
  });
});
