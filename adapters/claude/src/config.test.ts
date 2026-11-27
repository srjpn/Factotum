import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = { FACTO_API_URL: 'http://facto.tailnet:3000' };

describe('loadConfig', () => {
  it('requires the control plane URL (no default)', () => {
    expect(() => loadConfig({})).toThrow(/FACTO_API_URL/);
  });
  it('uses defaults', () => {
    expect(loadConfig(base, '/h')).toMatchObject({ projectsDir: '/h/.claude/projects', activeWindowMs: 600_000, syncIntervalMs: 30_000, hideProjectNames: false, stateFile: './claude-adapter.state.json' });
  });
  it('accepts overrides', () => {
    const c = loadConfig({ ...base, CLAUDE_PROJECTS_DIR: '/x', CLAUDE_ACTIVE_WINDOW_MINUTES: '3', CLAUDE_HIDE_PROJECT_NAMES: 'true', CLAUDE_PRICING_FILE: '/p.json' });
    expect(c).toMatchObject({ projectsDir: '/x', activeWindowMs: 180_000, hideProjectNames: true, pricingFile: '/p.json' });
  });
  it('rejects a bad boolean', () => {
    expect(() => loadConfig({ ...base, CLAUDE_HIDE_PROJECT_NAMES: 'maybe' })).toThrow(/CLAUDE_HIDE_PROJECT_NAMES/);
  });
});
