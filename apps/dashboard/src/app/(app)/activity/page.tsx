import Link from 'next/link';
import { ActivityTable } from '@/components/activity-table';
import { AutoRefresh } from '@/components/auto-refresh';
import { ApiError } from '@/components/badges';
import { ACTIVITY_LIMITS, parseLimit } from '@/lib/format';
import { getActivity } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ limit?: string | string[] }> }) {
  const limit = parseLimit((await searchParams).limit);
  const result = await getActivity(limit);
  return (
    <>
      <AutoRefresh />
      <div className="section-head">
        <h1>Activity</h1>
        <nav aria-label="Entries to show" className="segmented">
          <span className="muted">Show</span>
          {ACTIVITY_LIMITS.map((n) => (
            <Link key={n} href={`/activity?limit=${n}`} aria-current={n === limit ? 'true' : undefined}>
              {n}
            </Link>
          ))}
        </nav>
      </div>
      {result.ok ? <ActivityTable entries={result.data} /> : <ApiError message={result.message} />}
    </>
  );
}
