import { describe, expect, it } from 'vitest';
import { assistant, SECRET, SECRET_PATH, user } from './fixtures.js';
import { parseLine } from './parse.js';

describe('parseLine', () => {
  it('keeps only type, time, model, usage and sidechain flag', () => {
    const p = parseLine(assistant('2026-11-27T10:00:00Z', 'claude-opus-5-5', [1, 2, 3, 4], { isSidechain: true }))!;
    expect(p).toEqual({ type: 'assistant', ts: Date.parse('2026-11-27T10:00:00Z'), sidechain: true, model: 'claude-opus-5-5', usage: { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 } });
  });
  it('no content, prompt, tool input or path can reach the output', () => {
    for (const line of [assistant('2026-11-27T10:00:00Z', 'm', [1, 1, 1, 1]), user('2026-11-27T10:00:00Z')]) {
      const json = JSON.stringify(parseLine(line));
      expect(json).not.toContain(SECRET);
      expect(json).not.toContain(SECRET_PATH);
      expect(json).not.toContain('cwd');
      expect(Object.keys(parseLine(line)!).every((k) => ['type', 'ts', 'sidechain', 'model', 'usage'].includes(k))).toBe(true);
    }
  });
  it('ignores other types, bad json, missing timestamps and synthetic models', () => {
    expect(parseLine('{"type":"summary","timestamp":"2026-11-27T10:00:00Z"}')).toBeNull();
    expect(parseLine('not json')).toBeNull();
    expect(parseLine('{"type":"user"}')).toBeNull();
    expect(parseLine(assistant('2026-11-27T10:00:00Z', '<synthetic>', [0, 0, 0, 0]))!.model).toBeUndefined();
  });
  it('treats junk usage values as zero', () => {
    const l = JSON.stringify({ type: 'assistant', timestamp: '2026-11-27T10:00:00Z', message: { model: 'm', usage: { input_tokens: 'x', output_tokens: -5 } } });
    expect(parseLine(l)!.usage).toEqual({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
  });
});
