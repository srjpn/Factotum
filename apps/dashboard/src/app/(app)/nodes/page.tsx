import type { Node } from '@facto/contracts';
import { AutoRefresh } from '@/components/auto-refresh';
import { ApiError, StatusBadge } from '@/components/badges';
import { formatPercent, formatRelativeTime, formatUsage } from '@/lib/format';
import { getNodes } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function NodesPage() {
  const result = await getNodes();
  return (
    <>
      <AutoRefresh />
      <h1>Nodes</h1>
      {!result.ok ? <ApiError message={result.message} /> : result.data.length === 0 ? <p className="muted">No nodes enrolled yet.</p> : <NodeTable nodes={result.data} />}
    </>
  );
}

function NodeTable({ nodes }: { nodes: Node[] }) {
  const now = Date.now();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Last heartbeat</th>
            <th>CPU</th>
            <th>Memory</th>
            <th>Disk</th>
            <th>Battery</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => {
            const m = n.lastMetrics;
            const dash = <span className="muted">–</span>;
            return (
              <tr key={n.id} className={n.status === 'revoked' ? 'dim' : undefined}>
                <td data-label="Name">{n.name}</td>
                <td data-label="Status">
                  <StatusBadge status={n.status} />
                  {n.revokedAt ? <span className="muted"> {formatRelativeTime(n.revokedAt, now)}</span> : null}
                </td>
                <td data-label="Last heartbeat">{formatRelativeTime(n.lastHeartbeatAt, now)}</td>
                <td data-label="CPU">{m ? formatPercent(m.cpuPercent) : dash}</td>
                <td data-label="Memory">{m ? formatUsage(m.memory.usedBytes, m.memory.totalBytes) : dash}</td>
                <td data-label="Disk">{m ? formatUsage(m.disk.usedBytes, m.disk.totalBytes) : dash}</td>
                <td data-label="Battery">{m?.battery ? `${formatPercent(m.battery.percent)}${m.battery.charging ? ' · charging' : ''}` : dash}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
