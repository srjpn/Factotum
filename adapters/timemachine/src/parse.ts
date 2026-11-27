import type { BackupItem } from '@facto/contracts';

/** `tmutil latestbackup` prints a path ending in `YYYY-MM-DD-HHMMSS` (optionally `.backup`). The stamp is local time. */
export function parseLatestBackup(stdout: string): string | undefined {
  const last = stdout.trim().split('\n').pop()?.trim() ?? '';
  const m = /(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(?:\.backup)?$/.exec(last);
  if (!m) return undefined;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi, s);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** `tmutil status` prints a plist-like block; only `Running` and `BackupPhase` are read. */
export function parseStatus(stdout: string): { running: boolean; phase?: string } {
  const running = /\bRunning\s*=\s*1\b/.test(stdout);
  const phase = /\bBackupPhase\s*=\s*"?([A-Za-z]+)"?\s*;/.exec(stdout)?.[1];
  return { running, ...(phase ? { phase } : {}) };
}

/** `tmutil destinationinfo`: a destination is reachable when it has a mount point. Only the name is kept. */
export function parseDestinations(stdout: string): { configured: boolean; reachable: boolean; name?: string } {
  const blocks = stdout.split(/^=+\s*$/m).filter((b) => /^\s*Name\s*:/m.test(b));
  if (blocks.length === 0) return { configured: false, reachable: false };
  let name: string | undefined;
  for (const b of blocks) {
    const n = /^\s*Name\s*:\s*(.+)$/m.exec(b)?.[1]?.trim();
    if (/^\s*Mount Point\s*:\s*\S/m.test(b)) return { configured: true, reachable: true, name: n };
    name ??= n;
  }
  return { configured: true, reachable: false, name };
}

/** Errors that mean "tmutil may not look" rather than "there is no backup". */
export const isPermissionError = (text: string): boolean => /full disk access|operation not permitted|not permitted|permission denied/i.test(text);

export interface Observation {
  lastBackupAt?: string;
  running: boolean;
  phase?: string;
  destination: { configured: boolean; reachable: boolean; name?: string };
}

export function toBackupItem(o: Observation, now: number, staleAfterMs: number): BackupItem {
  const last = o.lastBackupAt ? Date.parse(o.lastBackupAt) : undefined;
  let status: BackupItem['status'];
  let label: string;
  if (o.running) {
    status = 'running';
    label = o.phase ? `backup running (${o.phase})` : 'backup running';
  } else if (!o.destination.configured) {
    status = 'unavailable';
    label = 'no backup destination configured';
  } else if (last === undefined) {
    status = 'unavailable';
    label = o.destination.reachable ? 'no backup found' : 'destination not reachable';
  } else if (now - last > staleAfterMs) {
    status = 'stale';
    label = 'last backup is older than the stale limit';
  } else {
    status = 'ok';
    label = 'last backup within the stale limit';
  }
  return {
    externalId: 'timemachine',
    title: 'Time Machine',
    status,
    statusLabel: label,
    ...(o.lastBackupAt ? { lastBackupAt: o.lastBackupAt } : {}),
    running: o.running,
    destinationReachable: o.destination.reachable,
    ...(o.destination.name ? { destinationName: o.destination.name.slice(0, 200) } : {}),
    source: 'tmutil',
  };
}
