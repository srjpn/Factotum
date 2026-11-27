import { execFile } from 'node:child_process';
import { cpus, freemem, totalmem } from 'node:os';
import { promisify } from 'node:util';
import type { Heartbeat } from '@facto/contracts';

const run = promisify(execFile);

export type CpuSample = { idle: number; total: number };

export function sampleCpu(list: ReturnType<typeof cpus> = cpus()): CpuSample {
  let idle = 0;
  let total = 0;
  for (const { times } of list) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

export function cpuPercent(prev: CpuSample, next: CpuSample): number {
  const total = next.total - prev.total;
  if (total <= 0) return 0;
  const busy = 1 - (next.idle - prev.idle) / total;
  return Math.min(100, Math.max(0, Math.round(busy * 1000) / 10));
}

// Parses `df -k /` (POSIX format). Uses the Size and Used columns, in KiB.
export function parseDf(output: string): { usedBytes: number; totalBytes: number } | null {
  const lines = output.trim().split('\n');
  const row = lines[lines.length - 1]?.trim().split(/\s+/);
  if (!row || row.length < 4) return null;
  const total = Number(row[1]);
  const used = Number(row[2]);
  if (!Number.isFinite(total) || !Number.isFinite(used) || total <= 0) return null;
  return { usedBytes: used * 1024, totalBytes: total * 1024 };
}

// Parses `pmset -g batt`. Returns null when there is no battery.
export function parsePmset(output: string): { percent: number; charging: boolean } | null {
  const match = /(\d{1,3})%;\s*([^;]+);/.exec(output);
  if (!match) return null;
  const percent = Number(match[1]);
  if (percent > 100) return null;
  const state = match[2]!.trim().toLowerCase();
  const charging = state === 'charging' || state === 'finishing charge' || state === 'charged';
  return { percent, charging };
}

// Extracts a small summary from `tailscale status --json`. Best effort.
export function parseTailscale(json: string): { backendState: string; online: boolean; peers: number } | null {
  try {
    const data = JSON.parse(json) as { BackendState?: string; Self?: { Online?: boolean }; Peer?: Record<string, unknown> };
    if (typeof data.BackendState !== 'string') return null;
    return {
      backendState: data.BackendState,
      online: data.Self?.Online ?? data.BackendState === 'Running',
      peers: Object.keys(data.Peer ?? {}).length,
    };
  } catch {
    return null;
  }
}

async function tryExec(cmd: string, args: string[]): Promise<string | null> {
  try {
    return (await run(cmd, args, { timeout: 5000 })).stdout;
  } catch {
    return null;
  }
}

export async function collectTailscale() {
  const out = await tryExec('tailscale', ['status', '--json']);
  return out ? parseTailscale(out) : null;
}

export type Collector = {
  collect(): Promise<Heartbeat>;
};

export function createCollector(): Collector {
  let prev = sampleCpu();
  return {
    async collect() {
      const next = sampleCpu();
      const cpu = cpuPercent(prev, next);
      prev = next;
      const total = totalmem();
      const dfOut = await tryExec('df', ['-k', '/']);
      const disk = (dfOut && parseDf(dfOut)) || { usedBytes: 0, totalBytes: 1 };
      const pmOut = await tryExec('pmset', ['-g', 'batt']);
      const battery = pmOut ? parsePmset(pmOut) : null;
      return {
        cpuPercent: cpu,
        memory: { usedBytes: total - freemem(), totalBytes: total },
        disk,
        ...(battery ? { battery } : {}),
      };
    },
  };
}
