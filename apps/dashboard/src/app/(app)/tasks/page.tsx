import Link from 'next/link';
import { AutoRefresh } from '@/components/auto-refresh';
import { ApiError, PrivacyBadge } from '@/components/badges';
import { getTasks } from '@/lib/server-api';
import { filterTasks, parseSource, taskSources, toTaskRows, type TaskRow } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ source?: string | string[] }> }) {
  const raw = (await searchParams).source;
  const result = await getTasks();
  if (!result.ok) {
    return (
      <>
        <h1>Tasks</h1>
        <ApiError message={result.message} />
      </>
    );
  }
  const all = toTaskRows(result.data);
  const sources = taskSources(all);
  const source = parseSource(raw, sources);
  const rows = filterTasks(all, source);
  return (
    <>
      <AutoRefresh />
      <div className="section-head">
        <h1>Tasks</h1>
        <nav aria-label="Source" className="segmented">
          <span className="muted">Source</span>
          <Link href="/tasks" aria-current={source ? undefined : 'true'}>all</Link>
          {sources.map((s) => (
            <Link key={s} href={`/tasks?source=${encodeURIComponent(s)}`} aria-current={s === source ? 'true' : undefined}>
              {s}
            </Link>
          ))}
        </nav>
      </div>
      {rows.length === 0 ? <p className="muted">No tasks yet. Tasks appear once a Jira or Trello adapter has synced.</p> : <TaskTable rows={rows} />}
    </>
  );
}

function TaskTable({ rows }: { rows: TaskRow[] }) {
  const dash = <span className="muted">–</span>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Source</th>
            <th>Status</th>
            <th>Privacy</th>
            <th>Project</th>
            <th>Assignee</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td data-label="Task">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>
                ) : (
                  r.title
                )}
              </td>
              <td data-label="Source">{r.source}</td>
              <td data-label="Status">{r.statusLabel}</td>
              <td data-label="Privacy"><PrivacyBadge privacy={r.privacyClass} /></td>
              <td data-label="Project">{r.project ?? dash}</td>
              <td data-label="Assignee">{r.assignee ?? dash}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
