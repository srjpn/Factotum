import type { ActivityEntry } from '@facto/contracts';
import { formatDateTime } from '@/lib/format';
import { OutcomeBadge, RiskBadge } from './badges';

export function ActivityTable({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return <p className="muted">No activity yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Risk</th>
            <th>Target</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td data-label="Time">
                <time dateTime={e.occurredAt}>{formatDateTime(e.occurredAt)}</time>
              </td>
              <td data-label="Actor">
                {e.actorType}
                {e.actorId && e.actorId !== e.actorType ? <span className="muted"> · {e.actorId.length > 12 ? `${e.actorId.slice(0, 8)}…` : e.actorId}</span> : null}
              </td>
              <td data-label="Action">
                <code>{e.action}</code>
              </td>
              <td data-label="Risk">
                <RiskBadge risk={e.risk} />
              </td>
              <td data-label="Target">
                {e.targetType ? `${e.targetType}${e.targetId ? ` · ${e.targetId.length > 12 ? `${e.targetId.slice(0, 8)}…` : e.targetId}` : ''}` : <span className="muted">none</span>}
              </td>
              <td data-label="Outcome">
                <OutcomeBadge outcome={e.outcome} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
