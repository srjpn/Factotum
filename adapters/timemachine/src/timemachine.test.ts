import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import type { CmdResult, Runner } from './exec.js';
import { BackupItemSchemaCheck } from './schema.test-helper.js';
import { parseDestinations, parseLatestBackup, parseStatus, toBackupItem } from './parse.js';
import { TimeMachineSyncer } from './syncer.js';

const STATUS_IDLE = 'Backup session status:\n{\n    ClientID = "com.apple.backupd";\n    Running = 0;\n}\n';
const STATUS_RUNNING = 'Backup session status:\n{\n    BackupPhase = Copying;\n    ClientID = "com.apple.backupd";\n    Running = 1;\n}\n';
const DEST = '====================================================\nName          : Backup Disk\nKind          : Local\nMount Point   : /Volumes/Backup Disk\nID            : AAAA\n';
const DEST_UNMOUNTED = '====================================================\nName          : Backup Disk\nKind          : Local\nID            : AAAA\n';
const LATEST = '/Volumes/Backup Disk/Backups.backupdb/Mac/2026-11-27-101500\n';
const ok = (stdout: string): CmdResult => ({ ok: true, stdout, stderr: '' });
const fail = (stderr: string): CmdResult => ({ ok: false, stdout: '', stderr });
const NOW = new Date(2026, 10, 27, 12, 0, 0).getTime();

function make(results: Record<string, CmdResult>) {
  const calls: string[] = [];
  const pushed: unknown[][] = [];
  const logs: string[] = [];
  const runner: Runner = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    return results[args[0]!] ?? fail('unexpected');
  };
  const syncer = new TimeMachineSyncer({ runner, push: async (i) => void pushed.push(i), log: (m) => logs.push(m), staleAfterMs: 48 * 3_600_000, now: () => NOW });
  return { syncer, calls, pushed, logs };
}

describe('parsers', () => {
  it('reads the local-time stamp from latestbackup, also for .backup APFS names', () => {
    expect(parseLatestBackup(LATEST)).toBe(new Date(2026, 10, 27, 10, 15, 0).toISOString());
    expect(parseLatestBackup('/Volumes/.timemachine/X/2026-11-26-010203.backup')).toBe(new Date(2026, 10, 26, 1, 2, 3).toISOString());
    expect(parseLatestBackup('No machine directory found for host.')).toBeUndefined();
  });
  it('reads running state and phase', () => {
    expect(parseStatus(STATUS_IDLE)).toEqual({ running: false });
    expect(parseStatus(STATUS_RUNNING)).toEqual({ running: true, phase: 'Copying' });
  });
  it('reads destination reachability and keeps only the name', () => {
    expect(parseDestinations(DEST)).toEqual({ configured: true, reachable: true, name: 'Backup Disk' });
    expect(parseDestinations(DEST_UNMOUNTED)).toEqual({ configured: true, reachable: false, name: 'Backup Disk' });
    expect(parseDestinations('tmutil: No destinations configured.')).toEqual({ configured: false, reachable: false });
  });
});

describe('toBackupItem', () => {
  const base = { running: false, destination: { configured: true, reachable: true, name: 'D' } };
  it('maps ok, stale, running, unavailable and produces schema-valid items', () => {
    const recent = new Date(NOW - 3_600_000).toISOString();
    const old = new Date(NOW - 72 * 3_600_000).toISOString();
    const stale = 48 * 3_600_000;
    expect(toBackupItem({ ...base, lastBackupAt: recent }, NOW, stale).status).toBe('ok');
    expect(toBackupItem({ ...base, lastBackupAt: old }, NOW, stale).status).toBe('stale');
    expect(toBackupItem({ ...base, running: true, lastBackupAt: old }, NOW, stale).status).toBe('running');
    expect(toBackupItem({ ...base, destination: { configured: true, reachable: false } }, NOW, stale)).toMatchObject({ status: 'unavailable', destinationReachable: false });
    expect(toBackupItem({ running: false, destination: { configured: false, reachable: false } }, NOW, stale).status).toBe('unavailable');
    BackupItemSchemaCheck(toBackupItem({ ...base, lastBackupAt: recent }, NOW, stale));
  });
});

describe('syncer', () => {
  it('pushes one backup item and runs only read-only tmutil subcommands', async () => {
    const { syncer, calls, pushed } = make({ status: ok(STATUS_IDLE), destinationinfo: ok(DEST), latestbackup: ok(LATEST) });
    await syncer.runOnce();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]![0]).toMatchObject({ externalId: 'timemachine', status: 'ok', running: false, destinationReachable: true });
    expect(calls.sort()).toEqual(['tmutil destinationinfo', 'tmutil latestbackup', 'tmutil status']);
    expect(syncer.healthCheck().status).toBe('up');
  });
  it('degrades with a Full Disk Access hint and pushes nothing', async () => {
    const { syncer, pushed } = make({ status: ok(STATUS_IDLE), destinationinfo: ok(DEST), latestbackup: fail('tmutil: requires Full Disk Access privileges') });
    await syncer.runOnce();
    expect(pushed).toHaveLength(0);
    expect(syncer.healthCheck()).toMatchObject({ status: 'degraded', detail: expect.stringContaining('Full Disk Access') });
  });
  it('degrades when tmutil cannot run', async () => {
    const runner: Runner = async () => ({ ok: false, stdout: '', stderr: '', spawnError: 'ENOENT' });
    const pushed: unknown[] = [];
    const s = new TimeMachineSyncer({ runner, push: async (i) => void pushed.push(i), log: () => {}, staleAfterMs: 1 });
    await s.runOnce();
    expect(pushed).toHaveLength(0);
    expect(s.healthCheck()).toMatchObject({ status: 'degraded', detail: expect.stringContaining('ENOENT') });
  });
  it('treats a failing latestbackup as data (destination not mounted)', async () => {
    const { syncer, pushed } = make({ status: ok(STATUS_IDLE), destinationinfo: ok(DEST_UNMOUNTED), latestbackup: fail('No machine directory found for host.') });
    await syncer.runOnce();
    expect(pushed[0]![0]).toMatchObject({ status: 'unavailable', destinationReachable: false });
    expect(pushed[0]![0]).not.toHaveProperty('lastBackupAt');
  });
});

describe('loadConfig', () => {
  it('requires the API URL and applies defaults', () => {
    expect(() => loadConfig({})).toThrow(/FACTO_API_URL/);
    expect(loadConfig({ FACTO_API_URL: 'http://x:3000' })).toMatchObject({ syncIntervalMs: 300_000, staleAfterMs: 48 * 3_600_000 });
  });
});
