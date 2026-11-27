import Link from 'next/link';
import type { ActivityEntry, AdapterSummary, InventoryItem, Node, RiskLevel } from '@facto/contracts';
import { formatBytes, formatPercent, formatRelativeTime } from '@/lib/format';
import {
  TASK_COLUMNS, adapterLabel, adapterTone, chunkProgress, clampPct, containerCounts, formatDuration, isDockerAdapter, meterTone, primaryNode, runPill, activeRuns,
  statusTone, taskBoard, type RunRow, type Tone,
} from '@/lib/overview';
import { filterTasks, type TaskRow } from '@/lib/tasks';
import { Card, Meter, Pill } from './ui';

type Res<T> = { ok: true; data: T } | { ok: false; message: string };
const err = <T,>(r: Res<T>) => (r.ok ? undefined : r.message);

export function MacbookCard({ nodes, now }: { nodes: Res<Node[]>; now: number }) {
  const node = nodes.ok ? primaryNode(nodes.data) : undefined;
  const m = node?.lastMetrics;
  const aside = node ? <Pill tone={statusTone(node.status)}>{node.status}</Pill> : undefined;
  return (
    <Card id="node" title={node?.name ?? 'Node'} icon="laptop" aside={aside} error={err(nodes)}>
      {!node ? (
        <p className="empty">No node enrolled yet. Enrol one with the node agent (see docs/runbooks).</p>
      ) : (
        <>
          {m ? (
            <>
              <Meter label="CPU" value={clampPct(m.cpuPercent)} display={formatPercent(m.cpuPercent)} tone={meterTone(m.cpuPercent)} />
              <Meter label="Memory" value={clampPct((m.memory.usedBytes / m.memory.totalBytes) * 100)} display={`${formatBytes(m.memory.usedBytes)} of ${formatBytes(m.memory.totalBytes)}`} tone={meterTone((m.memory.usedBytes / m.memory.totalBytes) * 100)} />
              <Meter label="Disk" value={clampPct((m.disk.usedBytes / m.disk.totalBytes) * 100)} display={`${formatBytes(m.disk.usedBytes)} of ${formatBytes(m.disk.totalBytes)}`} tone={meterTone((m.disk.usedBytes / m.disk.totalBytes) * 100)} />
            </>
          ) : (
            <p className="empty">No metrics yet. They appear after the first heartbeat.</p>
          )}
          <div style={{ marginTop: '0.6rem' }}>
            {m?.battery ? (
              <div className="row">
                <span>Battery</span>
                <span>{formatPercent(m.battery.percent)}, {m.battery.charging ? 'charging' : 'on battery'}</span>
              </div>
            ) : null}
            <div className="row">
              <span>Last heartbeat</span>
              <span>{formatRelativeTime(node.lastHeartbeatAt, now)}</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

export function RunsCard({ runs }: { runs: Res<RunRow[]> }) {
  const rows = runs.ok ? runs.data.slice(0, 5) : [];
  const active = runs.ok ? activeRuns(runs.data) : 0;
  return (
    <Card id="runs" title="Pani runs" icon="robot" aside={runs.ok && runs.data.length > 0 ? <Pill tone="ne" dot={false}>{active} active</Pill> : undefined} error={err(runs)}>
      {rows.length === 0 ? (
        <p className="empty">No Pani runs yet. Runs appear here once the Pani adapter is running and has synced.</p>
      ) : (
        rows.map((r, i) => {
          const pill = runPill(r.status);
          const bits = [chunkProgress(r), r.durationSeconds !== undefined ? formatDuration(r.durationSeconds) : r.startedAt ? `started ${formatRelativeTime(r.startedAt)}` : undefined].filter(Boolean);
          return (
            <div className={`row${i === 0 ? ' first' : ''}`} key={r.id}>
              <span className="grow">
                <span className="clip">{r.ticketKey ? `${r.ticketKey} ` : ''}{r.title}</span>
                <span className="f">{bits.length ? bits.join(' · ') : r.statusLabel}</span>
              </span>
              <Pill tone={pill.tone}>{pill.label}</Pill>
            </div>
          );
        })
      )}
    </Card>
  );
}

const privacyLabel = (p: TaskRow['privacyClass']) => (p === 'client-data' ? 'client' : 'personal');

export function TaskBoardCard({ tasks, sources, source }: { tasks: Res<TaskRow[]>; sources: string[]; source?: string }) {
  const all = tasks.ok ? tasks.data : [];
  const board = taskBoard(filterTasks(all, source));
  const chipHref = (s?: string) => (s ? `/?source=${encodeURIComponent(s)}` : '/');
  return (
    <Card id="board" title="Task board" icon="board" aside={<Link className="links" href="/tasks">All tasks</Link>} error={err(tasks)}>
      {all.length === 0 ? (
        <p className="empty">No tasks yet. They appear once the Trello or Jira adapter has synced.</p>
      ) : (
        <>
          <nav className="chips" aria-label="Task source">
            <Link className="chip" href={chipHref()} aria-current={source ? undefined : 'true'} scroll={false}>All</Link>
            {sources.map((s) => (
              <Link key={s} className="chip" href={chipHref(s)} aria-current={s === source ? 'true' : undefined} scroll={false}>
                {s}
              </Link>
            ))}
          </nav>
          <div className="cols3">
            {TASK_COLUMNS.map((c) => (
              <div className="col" key={c.key}>
                <div className="ch">{c.label} · {board[c.key].length}</div>
                {board[c.key].slice(0, 4).map((t) => (
                  <div className={`chipcard ${c.key}`} key={t.id} title={`${t.title} (${t.source}, ${privacyLabel(t.privacyClass)})`}>
                    <span className="t">{t.title}</span>
                    <span className="tag">{privacyLabel(t.privacyClass)}</span>
                  </div>
                ))}
                {board[c.key].length > 4 ? <p className="more">+{board[c.key].length - 4} more</p> : null}
              </div>
            ))}
          </div>
          {board.other > 0 ? <p className="more">{board.other} with another status, see Tasks.</p> : null}
        </>
      )}
    </Card>
  );
}

export function AdaptersCard({ adapters, containers }: { adapters: Res<AdapterSummary[]>; containers: Res<InventoryItem[]> }) {
  const list = adapters.ok ? adapters.data : [];
  const counts = containers.ok ? containerCounts(containers.data) : undefined;
  const hasDocker = list.some(isDockerAdapter);
  const dockerDetail = counts ? `${counts.total} container${counts.total === 1 ? '' : 's'}, ${counts.running} running` : undefined;
  return (
    <Card id="adapters" title="Adapters" icon="plug" error={err(adapters)}>
      {list.map((a, i) => (
        <div className={`row${i === 0 ? ' first' : ''}`} key={a.id}>
          <span className="grow">
            <span className="clip">{a.name}</span>
            <span className="f">{(a.statusDetail ?? (isDockerAdapter(a) ? dockerDetail : undefined)) || (a.lastSeenAt ? `seen ${formatRelativeTime(a.lastSeenAt)}` : 'not seen yet')}</span>
          </span>
          <Pill tone={adapterTone(a.status)}>{adapterLabel(a.status)}</Pill>
        </div>
      ))}
      {!hasDocker && counts ? (
        <div className={`row${list.length === 0 ? ' first' : ''}`}>
          <span className="grow"><span className="clip">Docker</span><span className="f">{dockerDetail}</span></span>
          <Pill tone="ok" dot={false}>{counts.total} containers</Pill>
        </div>
      ) : null}
      {adapters.ok && list.length === 0 && !counts ? <p className="empty">No adapters registered yet.</p> : null}
      <div className="row" aria-label="Pulse, not built yet">
        <span className="grow" style={{ opacity: 0.65 }}><span className="clip">Pulse</span></span>
        <Pill tone="ne" dot={false}>stub, in progress</Pill>
      </div>
    </Card>
  );
}

const riskTone = (r: RiskLevel): Tone => (r === 'privileged' ? 'warn' : r === 'destructive' ? 'bad' : r === 'reversible' ? 'info' : 'ne');
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export function ActivityCard({ entries }: { entries: Res<ActivityEntry[]> }) {
  const list = entries.ok ? entries.data : [];
  return (
    <Card id="activity" title="Activity log" icon="list" aside={<Link className="links" href="/activity">View all</Link>} error={err(entries)}>
      {list.length === 0 ? (
        <p className="empty">No activity yet.</p>
      ) : (
        list.map((e, i) => (
          <div className={`row${i === 0 ? ' first' : ''}`} key={e.id}>
            <time dateTime={e.occurredAt} title={e.occurredAt}>{hhmm(e.occurredAt)}</time>
            <span className="grow">
              <span className="clip"><code>{e.action}</code>{e.targetId ? <span className="f"> {e.targetType ?? ''} {e.targetId.length > 14 ? `${e.targetId.slice(0, 8)}…` : e.targetId}</span> : null}</span>
              <span className="f">{e.actorType}{e.outcome !== 'success' ? ` · ${e.outcome}` : ''}</span>
            </span>
            <Pill tone={riskTone(e.risk)} dot={false}>{e.risk}</Pill>
          </div>
        ))
      )}
    </Card>
  );
}
