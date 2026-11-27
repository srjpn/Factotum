import { AutoRefresh } from '@/components/auto-refresh';
import { Clock } from '@/components/clock';
import { BackupCard } from '@/components/backup-card';
import { ClaudeCard } from '@/components/claude-card';
import { ContainersCard } from '@/components/containers-card';
import { ServicesCard } from '@/components/services-card';
import { ActivityCard, AdaptersCard, MacbookCard, RunsCard, TaskBoardCard } from '@/components/overview-cards';
import { Pill, Tile } from '@/components/ui';
import { adaptersPill, nodeSummary, pendingApprovals, runsToday, toRunRows } from '@/lib/overview';
import { getActivity, getAdapters, getApprovals, getBackups, getClaudeSessions, getClaudeUsage, getContainers, getNodes, getRuns, getServices, getTasks } from '@/lib/server-api';
import { parseSource, taskSources, toTaskRows } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

export default async function Overview({ searchParams }: { searchParams: Promise<{ source?: string | string[] }> }) {
  const raw = (await searchParams).source;
  const [nodes, runsRaw, tasksRaw, adapters, containers, approvals, activity, claudeSessions, claudeUsage, backups, services] = await Promise.all([
    getNodes(), getRuns(), getTasks(), getAdapters(), getContainers(), getApprovals(), getActivity(6), getClaudeSessions(), getClaudeUsage(), getBackups(), getServices(),
  ]);
  const now = Date.now();
  const runs = runsRaw.ok ? { ok: true as const, data: toRunRows(runsRaw.data) } : runsRaw;
  const tasks = tasksRaw.ok ? { ok: true as const, data: toTaskRows(tasksRaw.data) } : tasksRaw;
  const sources = tasks.ok ? taskSources(tasks.data) : [];
  const source = parseSource(raw, sources);
  const pill = adapters.ok ? adaptersPill(adapters.data) : { tone: 'bad' as const, label: 'Adapter status unavailable' };
  const node = nodes.ok ? nodeSummary(nodes.data) : undefined;
  const inProgress = tasks.ok ? tasks.data.filter((t) => t.status === 'in-progress').length : undefined;
  const pending = approvals.ok ? pendingApprovals(approvals.data, now).length : undefined;
  const todayRuns = runs.ok ? runsToday(runs.data, now) : undefined;
  const na = <span aria-label="unavailable">–</span>;

  return (
    <>
      <AutoRefresh />
      <div className="ov-head">
        <h1>
          Facto <span className="f">lite</span>
        </h1>
        <div className="right">
          <Pill tone={pill.tone}>{pill.label}</Pill>
          <Clock />
        </div>
      </div>

      <div className="tiles">
        <Tile label="Node status" value={node?.value ?? na} sub={node?.sub ?? 'unavailable'} href="/nodes" />
        <Tile label="Pani runs today" value={todayRuns ?? na} sub={runs.ok ? undefined : 'unavailable'} />
        <Tile label="Tasks in progress" value={inProgress ?? na} sub={tasks.ok ? undefined : 'unavailable'} href="/tasks" />
        <Tile label="Awaiting approval" value={pending ?? na} sub={approvals.ok ? undefined : 'unavailable'} href="/approvals" />
      </div>

      <div className="grid2">
        <MacbookCard nodes={nodes} now={now} />
        <RunsCard runs={runs} />
      </div>
      <div className="grid2">
        <TaskBoardCard tasks={tasks} sources={sources} source={source} />
        <AdaptersCard adapters={adapters} containers={containers} />
      </div>
      <div className="grid2">
        <ClaudeCard sessions={claudeSessions} usage={claudeUsage} now={now} />
        <BackupCard backups={backups} now={now} />
      </div>
      <div className="grid2">
        <ServicesCard services={services} />
        <ContainersCard containers={containers} />
      </div>
      <ActivityCard entries={activity} />
    </>
  );
}
