import { describe, expect, it } from 'vitest';
import { HeartbeatSchema } from '@facto/contracts';
import { cpuPercent, createCollector, parseDf, parsePmset, parseTailscale } from './metrics.js';

describe('parsers', () => {
  it('parses df -k output', () => {
    const out = `Filesystem   1024-blocks      Used Available Capacity iused ifree %iused  Mounted on
/dev/disk3s1s1   488245288  15000000 200000000    7%  400000 2000000000    0%   /`;
    expect(parseDf(out)).toEqual({ usedBytes: 15_000_000 * 1024, totalBytes: 488_245_288 * 1024 });
    expect(parseDf('garbage')).toBeNull();
  });

  it('parses pmset on battery', () => {
    const out = `Now drawing from 'Battery Power'
 -InternalBattery-0 (id=1234)\t87%; discharging; 5:12 remaining present: true`;
    expect(parsePmset(out)).toEqual({ percent: 87, charging: false });
  });

  it('parses pmset while charging and when charged', () => {
    expect(parsePmset(`Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t54%; charging; 1:10 remaining present: true`)).toEqual({ percent: 54, charging: true });
    expect(parsePmset(`-InternalBattery-0\t100%; charged; 0:00 remaining present: true`)).toEqual({ percent: 100, charging: true });
  });

  it('returns null when there is no battery', () => {
    expect(parsePmset(`Now drawing from 'AC Power'`)).toBeNull();
  });

  it('parses tailscale status', () => {
    expect(parseTailscale(JSON.stringify({ BackendState: 'Running', Self: { Online: true }, Peer: { a: {}, b: {} } }))).toEqual({ backendState: 'Running', online: true, peers: 2 });
    expect(parseTailscale('not json')).toBeNull();
  });

  it('computes cpu percent from samples', () => {
    expect(cpuPercent({ idle: 100, total: 200 }, { idle: 150, total: 300 })).toBe(50);
    expect(cpuPercent({ idle: 1, total: 1 }, { idle: 1, total: 1 })).toBe(0);
  });
});

describe('collector', () => {
  it('produces a valid heartbeat on this machine', async () => {
    const hb = await createCollector().collect();
    expect(HeartbeatSchema.safeParse(hb).success).toBe(true);
  });
});
