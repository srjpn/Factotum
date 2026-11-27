import Link from 'next/link';
import { ActivityTable } from '@/components/activity-table';
import { AutoRefresh } from '@/components/auto-refresh';
import { ApiError } from '@/components/badges';
import { getActivity, getNodes } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function Overview() {
  const [nodes, activity] = await Promise.all([getNodes(), getActivity(5)]);
  const count = (s: string) => (nodes.ok ? nodes.data.filter((n) => n.status === s).length : 0);
  return (
    <>
      <AutoRefresh />
      <h1>Overview</h1>
      <section aria-label="Node summary">
        {nodes.ok ? (
          <div className="stats">
            <Stat label="Online" value={count('online')} tone="online" />
            <Stat label="Offline" value={count('offline')} tone="offline" />
            <Stat label="Pending" value={count('pending')} tone="pending" />
          </div>
        ) : (
          <ApiError message={nodes.message} />
        )}
      </section>
      <section aria-label="Recent activity">
        <div className="section-head">
          <h2>Recent activity</h2>
          <Link href="/activity">View all</Link>
        </div>
        {activity.ok ? <ActivityTable entries={activity.data} /> : <ApiError message={activity.message} />}
      </section>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`card stat tone-${tone}`}>
      <div className="stat-value">{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}
