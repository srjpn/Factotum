import { describe, expect, it } from 'vitest';
import { agentName, assistant, customTitle, QUESTION, SECRET, SECRET_PATH, toolResult, toolUse, user } from './fixtures.js';
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

describe('owner-facing tool uses', () => {
  it('extracts only the tool name and id, never the question or options', () => {
    const p = parseLine(toolUse('2026-11-27T10:00:00Z', 'AskUserQuestion', 'tu_1'))!;
    expect(p.askTool).toEqual({ id: 'tu_1', name: 'AskUserQuestion' });
    expect(JSON.stringify(p)).not.toContain(QUESTION);
    expect(JSON.stringify(p)).not.toContain(SECRET);
    expect(parseLine(toolUse('2026-11-27T10:00:00Z', 'Bash', 'tu_2'))!.askTool).toBeUndefined();
  });
  it('extracts only the answered ids from a tool_result', () => {
    const p = parseLine(toolResult('2026-11-27T10:01:00Z', 'tu_1'))!;
    expect(p.resultIds).toEqual(['tu_1']);
    expect(JSON.stringify(p)).not.toContain(SECRET);
  });
});

describe('title records', () => {
  it('reads custom-title and agent-name lines (no timestamp needed), trimmed and capped', () => {
    expect(parseLine(customTitle('  My title '))).toEqual({ type: 'custom-title', title: 'My title' });
    expect(parseLine(agentName('agent-x'))).toEqual({ type: 'agent-name', title: 'agent-x' });
    expect(parseLine(customTitle('x'.repeat(500)) )).toMatchObject({ title: 'x'.repeat(200) });
    expect(parseLine(customTitle('  '))).toBeNull();
    expect(parseLine('{"type":"custom-title","sessionId":"s"}')).toBeNull();
  });
});
