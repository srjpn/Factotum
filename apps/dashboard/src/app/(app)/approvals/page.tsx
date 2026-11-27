import type { Approval } from '@facto/contracts';
import { AutoRefresh } from '@/components/auto-refresh';
import { ApiError, RiskBadge } from '@/components/badges';
import { getEnv } from '@/lib/env';
import { formatRelativeTime } from '@/lib/format';
import { listApprovals } from '@/lib/approvals';
import { DecisionButtons } from './decision-buttons';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const env = getEnv();
  const result = await listApprovals({ baseUrl: env.FACTO_API_URL, token: env.FACTO_ADMIN_TOKEN });
  return (
    <>
      <AutoRefresh />
      <h1>Approvals</h1>
      {!result.ok ? (
        <ApiError message={result.message} />
      ) : result.data.length === 0 ? (
        <p className="muted">No approval requests yet. Destructive and privileged actions will wait here for you.</p>
      ) : (
        <ApprovalTable approvals={result.data} />
      )}
    </>
  );
}

function ApprovalTable({ approvals }: { approvals: Approval[] }) {
  const now = Date.now();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Action</th>
            <th>Risk</th>
            <th>Requested by</th>
            <th>When</th>
            <th>Status</th>
            <th aria-label="Decision" />
          </tr>
        </thead>
        <tbody>
          {approvals.map((a) => (
            <tr key={a.id} className={a.status === 'pending' ? undefined : 'dim'}>
              <td data-label="Action">
                <strong>{a.action}</strong>
                {a.targetId ? <span className="muted"> on {a.targetType ? `${a.targetType} ` : ''}{a.targetId}</span> : null}
                {a.summary ? <div className="muted">{a.summary}</div> : null}
                {a.status === 'pending' && Object.keys(a.params).length > 0 ? (
                  <details>
                    <summary className="muted">Parameters</summary>
                    <pre>{JSON.stringify(a.params, null, 2)}</pre>
                  </details>
                ) : null}
              </td>
              <td data-label="Risk"><RiskBadge risk={a.risk} /></td>
              <td data-label="Requested by">{a.requesterType}: {a.requesterId}</td>
              <td data-label="When">{formatRelativeTime(a.requestedAt, now)}</td>
              <td data-label="Status">
                {a.status}
                {a.decidedBy ? <span className="muted"> by {a.decidedBy}</span> : null}
              </td>
              <td>{a.status === 'pending' ? <DecisionButtons id={a.id} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
