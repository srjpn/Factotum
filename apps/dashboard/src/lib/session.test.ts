import { describe, expect, it } from 'vitest';
import { cookieSecure, createSessionToken, isLocalHost, verifySessionToken } from './session';

const secret = 'x'.repeat(32);

describe('session token', () => {
  it('verifies a fresh token', () => {
    expect(verifySessionToken(createSessionToken(secret), secret)).toBe(true);
  });
  it('rejects a token signed with another secret', () => {
    expect(verifySessionToken(createSessionToken('y'.repeat(32)), secret)).toBe(false);
  });
  it('rejects a tampered payload', () => {
    const [, mac] = createSessionToken(secret).split('.');
    const forged = Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64url');
    expect(verifySessionToken(`${forged}.${mac}`, secret)).toBe(false);
  });
  it('rejects an expired token', () => {
    const t = createSessionToken(secret, 1_000_000, 60);
    expect(verifySessionToken(t, secret, 1_000_000 + 59_000)).toBe(true);
    expect(verifySessionToken(t, secret, 1_000_000 + 61_000)).toBe(false);
  });
  it('rejects malformed input', () => {
    for (const bad of [undefined, '', 'abc', 'a.b.c', '.']) expect(verifySessionToken(bad, secret)).toBe(false);
  });
});

describe('cookie security', () => {
  it('detects local hosts', () => {
    expect(isLocalHost('localhost:3001')).toBe(true);
    expect(isLocalHost('127.0.0.1:3001')).toBe(true);
    expect(isLocalHost('[::1]:3001')).toBe(true);
    expect(isLocalHost('facto.tailnet.ts.net')).toBe(false);
  });
  it('is secure off localhost unless overridden', () => {
    expect(cookieSecure('localhost:3001')).toBe(false);
    expect(cookieSecure('facto.example')).toBe(true);
    expect(cookieSecure('100.64.0.1:3001', 'false')).toBe(false);
    expect(cookieSecure('localhost', 'true')).toBe(true);
  });
});
