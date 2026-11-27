import { describe, expect, it } from 'vitest';
import { defaultSocketPath, loadConfig } from './config.js';

const base = { FACTO_API_URL: 'http://facto.tailnet:3000' };

describe('loadConfig', () => {
  it('requires the control plane URL (no default)', () => {
    expect(() => loadConfig({})).toThrow(/FACTO_API_URL/);
  });
  it('uses defaults', () => {
    const c = loadConfig(base, () => false);
    expect(c).toMatchObject({ apiUrl: base.FACTO_API_URL, socketPath: '/var/run/docker.sock', syncIntervalMs: 30_000, stateFile: './docker-adapter.state.json' });
  });
  it('accepts a unix DOCKER_HOST and a custom interval', () => {
    const c = loadConfig({ ...base, DOCKER_HOST: 'unix:///Users/me/.rd/docker.sock', DOCKER_SYNC_INTERVAL_SECONDS: '10' });
    expect(c.socketPath).toBe('/Users/me/.rd/docker.sock');
    expect(c.syncIntervalMs).toBe(10_000);
  });
  it('rejects TCP hosts', () => {
    expect(() => loadConfig({ ...base, DOCKER_HOST: 'tcp://1.2.3.4:2375' })).toThrow(/unix socket/);
  });
  it('falls back through candidate sockets', () => {
    expect(defaultSocketPath((p) => p.endsWith('.rd/docker.sock'), '/h')).toBe('/h/.rd/docker.sock');
  });
});
