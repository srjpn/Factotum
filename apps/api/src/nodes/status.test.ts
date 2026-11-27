import { describe, expect, it } from 'vitest';
import { computeStatus } from './status.js';

const now = new Date('2026-11-27T12:00:00Z');
const ago = (s: number) => new Date(now.getTime() - s * 1000);

describe('computeStatus', () => {
  it('is pending before the first heartbeat', () => {
    expect(computeStatus({ revokedAt: null, lastHeartbeatAt: null }, now, 90)).toBe('pending');
  });

  it('is online within the window and offline after it', () => {
    expect(computeStatus({ revokedAt: null, lastHeartbeatAt: ago(30) }, now, 90)).toBe('online');
    expect(computeStatus({ revokedAt: null, lastHeartbeatAt: ago(90) }, now, 90)).toBe('online');
    expect(computeStatus({ revokedAt: null, lastHeartbeatAt: ago(91) }, now, 90)).toBe('offline');
  });

  it('is revoked whatever the heartbeat says', () => {
    expect(computeStatus({ revokedAt: ago(5), lastHeartbeatAt: ago(1) }, now, 90)).toBe('revoked');
  });
});
