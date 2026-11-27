import type { ServiceItem } from '@facto/contracts';
import type { DevServersConfig } from './config.js';

export interface Listener {
  pid: number;
  command: string;
  address: string; // as lsof prints it, without the port
  port: number;
}

/** lsof escapes non-printable bytes as `\xNN`; turn the common ones back. */
const unescape = (s: string): string => s.replace(/\\x([0-9a-f]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));

/**
 * Parses `lsof -nP +c 0 -iTCP -sTCP:LISTEN -Fpcn` output: lines `p<pid>`, `c<command>`, `n<address:port>`.
 * Only those three fields are requested, so arguments and environment are never in the output.
 */
export function parseListeners(output: string): Listener[] {
  const out: Listener[] = [];
  let pid = 0;
  let command = '';
  for (const line of output.split('\n')) {
    const tag = line[0];
    const val = line.slice(1);
    if (tag === 'p') { pid = Number(val); command = ''; }
    else if (tag === 'c') command = unescape(val);
    else if (tag === 'n' && pid > 0 && command) {
      const m = /^(.*):(\d+)$/.exec(val);
      if (m) out.push({ pid, command, address: m[1]!, port: Number(m[2]) });
    }
  }
  return out;
}

/** Parses `lsof -a -d cwd -Fpn` output into pid -> last path segment. Full paths are dropped here. */
export function parseCwds(output: string): Map<number, string> {
  const map = new Map<number, string>();
  let pid = 0;
  for (const line of output.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n' && pid > 0) {
      const last = unescape(line.slice(1)).split('/').filter(Boolean).pop();
      if (last) map.set(pid, last.slice(0, 200));
    }
  }
  return map;
}

export function classifyBind(address: string): 'localhost' | 'all' | undefined {
  const a = address.replace(/^\[|\]$/g, '');
  if (a === '*' || a === '0.0.0.0' || a === '::') return 'all';
  if (a === '::1' || a === 'localhost' || /^127\./.test(a)) return 'localhost';
  return undefined; // bound to a specific LAN or tailnet address: not a local dev server
}

export function toServiceItems(listeners: Listener[], cwds: Map<number, string>, config: Pick<DevServersConfig, 'ignorePorts' | 'ignoreProcesses' | 'minPort'>): ServiceItem[] {
  const byPort = new Map<number, ServiceItem>();
  for (const l of listeners) {
    const bind = classifyBind(l.address);
    if (!bind) continue;
    if (l.port < config.minPort || config.ignorePorts.has(l.port)) continue;
    if (config.ignoreProcesses.has(l.command.toLowerCase())) continue;
    const prev = byPort.get(l.port);
    if (prev) {
      if (bind === 'all') prev.bind = 'all'; // IPv4 and IPv6 sockets of the same server
      continue;
    }
    const wd = cwds.get(l.pid);
    byPort.set(l.port, {
      externalId: `tcp:${l.port}`,
      title: l.command.slice(0, 500),
      status: 'listening',
      statusLabel: bind === 'all' ? 'listening on all interfaces' : 'listening on localhost',
      port: l.port,
      process: l.command.slice(0, 200),
      ...(wd ? { workingDir: wd } : {}),
      bind,
      source: 'lsof',
    });
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port);
}
