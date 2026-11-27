import type { InventoryItem } from '@facto/contracts';
import { formatRelativeTime } from '@/lib/format';
import { backupPill, toBackups } from '@/lib/local';
import { Card, Pill } from './ui';

type Res<T> = { ok: true; data: T } | { ok: false; message: string };

/** Time Machine state from the timemachine adapter. Read-only; absent adapter or unavailable status gets an explanation. */
export function BackupCard({ backups, now }: { backups: Res<InventoryItem[]>; now: number }) {
  const list = toBackups(backups.ok ? backups.data : []);
  const b = list[0];
  const pill = b ? backupPill(b.status) : undefined;
  return (
    <Card id="backup" title="Time Machine" icon="disk" aside={pill ? <Pill tone={pill.tone}>{pill.label}</Pill> : undefined} error={backups.ok ? undefined : backups.message}>
      {!b ? (
        <p className="empty">No backup data yet. It appears once the timemachine adapter is running and has synced (see docs/runbooks/timemachine-adapter.md).</p>
      ) : (
        <>
          <div className="row first"><span>Last backup</span><span>{b.lastBackupAt ? formatRelativeTime(b.lastBackupAt, now) : 'not known'}</span></div>
          <div className="row"><span>Destination</span><span>{b.destinationName ?? 'none'} · {b.destinationReachable ? 'reachable' : 'not reachable'}</span></div>
          <div className="row"><span>Backing up now</span><span>{b.running ? 'yes' : 'no'}</span></div>
          {b.status === 'unavailable' ? (
            <p className="f" style={{ marginTop: '0.5rem' }}>
              Unavailable means no backup destination is mounted, or the adapter could not read Time Machine. Connect the backup disk or network share. If it is connected, check Full Disk Access for the process that runs the adapter. Details: docs/runbooks/timemachine-adapter.md.
            </p>
          ) : null}
          {b.status === 'stale' ? <p className="f" style={{ marginTop: '0.5rem' }}>The last backup is older than the stale limit (default 48 hours).</p> : null}
        </>
      )}
    </Card>
  );
}
