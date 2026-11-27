import type { InventoryItem } from '@facto/contracts';
import { formatTokens, formatUsd, summarizeClaude, toClaudeSessions, toClaudeUsage, totalTokens } from '@/lib/claude';
import { formatRelativeTime } from '@/lib/format';
import { formatDuration } from '@/lib/overview';
import { Card, Pill } from './ui';

type Res<T> = { ok: true; data: T } | { ok: false; message: string };

/** Claude Code activity from the claude adapter. Costs are estimates. Adapter absent = empty state. */
export function ClaudeCard({ sessions, usage, now }: { sessions: Res<InventoryItem[]>; usage: Res<InventoryItem[]>; now: number }) {
  const error = !sessions.ok ? sessions.message : !usage.ok ? usage.message : undefined;
  const s = toClaudeSessions(sessions.ok ? sessions.data : []);
  const u = toClaudeUsage(usage.ok ? usage.data : []);
  const sum = summarizeClaude(s, u, now);
  const empty = s.length === 0 && u.length === 0;
  return (
    <Card id="claude" title="Claude Code" icon="robot" aside={empty ? undefined : (
      <>
        {sum.waiting.length > 0 ? <Pill tone="warn">{sum.waiting.length} waiting</Pill> : null}{' '}
        <Pill tone={sum.active.length ? 'ok' : 'ne'} dot={false}>{sum.active.length} active</Pill>
      </>
    )} error={error}>
      {empty ? (
        <p className="empty">No Claude Code data yet. It appears once the claude adapter is running and has synced.</p>
      ) : (
        <>
          <div className="row first"><span>Tokens today</span><span>{formatTokens(sum.todayTokens)} · est. {formatUsd(sum.todayCostUsd)}</span></div>
          <div className="row"><span>Session time today</span><span>{formatDuration(sum.todayActiveSeconds)}</span></div>
          <div className="row"><span>Last 5 hours</span><span>{formatTokens(sum.window5hTokens)} · est. {formatUsd(sum.window5hCostUsd)}</span></div>
          {[...sum.waiting, ...sum.active].slice(0, 5).map((x) => (
            <div className="row" key={x.externalId}>
              <span className="grow">
                <span className="clip">{x.title}{x.project ? <> <span className="f">[{x.project}]</span></> : null}</span>
                <span className="f">{[x.models[0], `${x.messageCount} msgs`, `${formatTokens(totalTokens(x.tokens))} tokens`, x.status === 'waiting' ? `waiting ${formatDuration(x.waitingSeconds ?? 0)}` : `active ${formatRelativeTime(x.lastActivityAt, now)}`].filter(Boolean).join(' · ')}</span>
              </span>
              {x.status === 'waiting' ? <Pill tone="warn">needs you</Pill> : null}
            </div>
          ))}
          <p className="f" style={{ marginTop: '0.5rem' }}>Costs are estimates from a price table you maintain.</p>
        </>
      )}
    </Card>
  );
}
