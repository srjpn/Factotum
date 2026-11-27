import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assistant, user } from './fixtures.js';
import { TranscriptCache } from './scan.js';

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'claude-scan-'));
  mkdirSync(join(root, '-Users-me-work-acme'));
  return { root, file: join(root, '-Users-me-work-acme', '11111111-aaaa-bbbb-cccc-000000000000.jsonl') };
};
const NOW = Date.now();
const iso = (min: number) => new Date(NOW - min * 60_000).toISOString();

describe('TranscriptCache', () => {
  it('totals tokens, messages, duration and active time (gaps under 5 minutes)', async () => {
    const { root, file } = setup();
    writeFileSync(file, [user(iso(60)), assistant(iso(59), 'claude-opus-5-5', [10, 20, 30, 40]), user(iso(50)), assistant(iso(49), 'claude-opus-5-5', [1, 2, 3, 4], { isSidechain: true })].join('\n') + '\n');
    const [st] = await new TranscriptCache().refresh(root, NOW);
    expect(st!.messages).toBe(4);
    expect(st!.sidechain).toBe(1);
    expect(st!.tokens).toEqual({ input: 11, output: 22, cacheWrite: 33, cacheRead: 44 });
    expect(st!.lastTs! - st!.firstTs!).toBe(11 * 60_000);
    expect(st!.activeMs).toBe(2 * 60_000); // only the two 1-minute gaps; the 9-minute gap is idle
    expect(st!.latestContext).toBe(1 + 4 + 3);
  });

  it('re-reads only appended bytes and ignores a partial trailing line until completed', async () => {
    const { root, file } = setup();
    const cache = new TranscriptCache();
    const l1 = assistant(iso(10), 'm', [1, 1, 0, 0]);
    writeFileSync(file, l1 + '\n');
    let [st] = await cache.refresh(root, NOW);
    expect(st!.messages).toBe(1);
    const offset1 = st!.offset;
    const l2 = assistant(iso(9), 'm', [2, 2, 0, 0]);
    appendFileSync(file, l2.slice(0, 40)); // partial line, no newline
    [st] = await cache.refresh(root, NOW);
    expect(st!.messages).toBe(1);
    expect(st!.offset).toBe(offset1);
    appendFileSync(file, l2.slice(40) + '\n');
    [st] = await cache.refresh(root, NOW);
    expect(st!.messages).toBe(2);
    expect(st!.tokens.input).toBe(3);
    expect(st!.offset).toBe(Buffer.byteLength(l1 + '\n' + l2 + '\n'));
  });

  it('starts over when a file is truncated, forgets deleted files, skips old files and bad lines', async () => {
    const { root, file } = setup();
    const cache = new TranscriptCache();
    writeFileSync(file, assistant(iso(10), 'm', [5, 5, 0, 0]) + '\n{broken\n');
    expect((await cache.refresh(root, NOW))[0]!.messages).toBe(1);
    writeFileSync(file, assistant(iso(5), 'm', [1, 0, 0, 0]) + '\n');
    const [st] = await cache.refresh(root, NOW);
    expect(st!.tokens.input).toBe(1);
    expect(await cache.refresh(root, NOW + 40 * 24 * 3600_000)).toHaveLength(0); // older than 30 days by mtime
    expect(cache.files.size).toBe(0);
    expect(await new TranscriptCache().refresh(join(root, 'missing'), NOW)).toEqual([]);
  });
});
