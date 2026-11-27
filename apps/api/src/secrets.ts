import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Credentials are random 256-bit values, so a plain SHA-256 hash is enough to store them.
export function generateSecret(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function secretsMatch(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(hashSecret(a), 'hex'), Buffer.from(hashSecret(b), 'hex'));
}

export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer (\S+)$/.exec(header ?? '');
  return match ? match[1]! : null;
}
