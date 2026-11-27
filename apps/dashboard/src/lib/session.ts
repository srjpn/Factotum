import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'facto_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');

/** A signed token: base64url(payload).base64url(HMAC-SHA256). The payload holds only the expiry. */
export function createSessionToken(secret: string, nowMs = Date.now(), ttlSeconds = SESSION_TTL_SECONDS): string {
  const body = b64(JSON.stringify({ exp: Math.floor(nowMs / 1000) + ttlSeconds }));
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string, nowMs = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [body, mac] = parts as [string, string];
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const payload: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const exp = (payload as { exp?: unknown }).exp;
    return typeof exp === 'number' && exp * 1000 > nowMs;
  } catch {
    return false;
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLocalHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0]!;
  return LOCAL_HOSTS.has(host.toLowerCase()) || host.toLowerCase().endsWith('.localhost');
}

/** Secure cookie unless on localhost, with an explicit override for plain-http private networks. */
export function cookieSecure(hostHeader: string | null | undefined, override?: 'true' | 'false'): boolean {
  if (override) return override === 'true';
  return !isLocalHost(hostHeader);
}
