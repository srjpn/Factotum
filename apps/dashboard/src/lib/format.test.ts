import { describe, expect, it } from 'vitest';
import { formatBytes, formatRelativeTime, formatUsage, parseLimit } from './format';

const now = Date.parse('2026-11-27T12:00:00Z');
describe('formatRelativeTime', () => {
  it('formats ranges', () => {
    expect(formatRelativeTime(null, now)).toBe('never');
    expect(formatRelativeTime('2026-11-27T11:59:58Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-11-27T11:59:30Z', now)).toBe('30s ago');
    expect(formatRelativeTime('2026-11-27T11:55:00Z', now)).toBe('5 min ago');
    expect(formatRelativeTime('2026-11-27T09:00:00Z', now)).toBe('3 h ago');
    expect(formatRelativeTime('2026-11-24T12:00:00Z', now)).toBe('3 d ago');
    expect(formatRelativeTime('garbage', now)).toBe('unknown');
  });
});
describe('bytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(16 * 1024 ** 3)).toBe('16.0 GB');
    expect(formatUsage(8 * 1024 ** 3, 16 * 1024 ** 3)).toBe('8.0 GB of 16.0 GB (50%)');
  });
});
describe('parseLimit', () => {
  it('allows only known limits', () => {
    expect(parseLimit('100')).toBe(100);
    expect(parseLimit('7')).toBe(50);
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit(['25', '50'])).toBe(25);
  });
});
