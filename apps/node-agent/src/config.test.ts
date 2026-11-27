import { describe, expect, it } from 'vitest';
import { defaultStateFile, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('reads the control plane URL and applies defaults', () => {
    const c = loadConfig({ FACTO_API_URL: 'http://facto.tailnet:3000/' });
    expect(c).toEqual({
      apiUrl: 'http://facto.tailnet:3000',
      enrolmentToken: undefined,
      stateFile: defaultStateFile(),
      heartbeatIntervalMs: 30_000,
    });
    expect(c.stateFile.endsWith('.config/facto/agent.json')).toBe(true);
  });

  it('has no default URL', () => {
    expect(() => loadConfig({})).toThrow();
  });

  it('reads token, state file and interval', () => {
    const c = loadConfig({
      FACTO_API_URL: 'http://x:1',
      FACTO_ENROLMENT_TOKEN: 'tok',
      FACTO_AGENT_STATE_FILE: '/tmp/a.json',
      FACTO_HEARTBEAT_INTERVAL_SECONDS: '5',
    });
    expect(c).toMatchObject({ enrolmentToken: 'tok', stateFile: '/tmp/a.json', heartbeatIntervalMs: 5000 });
  });

  it('treats empty values as unset and rejects a bad interval', () => {
    expect(loadConfig({ FACTO_API_URL: 'http://x:1', FACTO_ENROLMENT_TOKEN: '' }).enrolmentToken).toBeUndefined();
    expect(() => loadConfig({ FACTO_API_URL: 'http://x:1', FACTO_HEARTBEAT_INTERVAL_SECONDS: '0' })).toThrow();
  });
});
