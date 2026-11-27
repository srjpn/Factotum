import type { InventoryItem } from '@facto/contracts';
import { containerPill, toContainers } from '@/lib/local';
import { Card, Pill } from './ui';

type Res<T> = { ok: true; data: T } | { ok: false; message: string };
const SHOWN = 8;

/** Docker containers: name and state, problems first. */
export function ContainersCard({ containers }: { containers: Res<InventoryItem[]> }) {
  const list = toContainers(containers.ok ? containers.data : []);
  const running = list.filter((c) => c.status === 'running').length;
  const rowOf = (c: (typeof list)[number], i: number) => {
    const p = containerPill(c);
    return (
      <div className={`row${i === 0 ? ' first' : ''}`} key={c.id}>
        <span className="grow">
          <span className="clip">{c.name}</span>
          {c.composeProject ? <span className="f">{c.composeProject}</span> : null}
        </span>
        <Pill tone={p.tone}>{p.label}</Pill>
      </div>
    );
  };
  return (
    <Card id="containers" title="Docker containers" icon="box" aside={list.length ? <Pill tone="ne" dot={false}>{running} of {list.length} running</Pill> : undefined} error={containers.ok ? undefined : containers.message}>
      {list.length === 0 ? (
        <p className="empty">No containers reported. They appear once the Docker adapter has synced.</p>
      ) : (
        <>
          {list.slice(0, SHOWN).map(rowOf)}
          {list.length > SHOWN ? (
            <details>
              <summary className="more">+{list.length - SHOWN} more</summary>
              {list.slice(SHOWN).map((c, i) => rowOf(c, i + SHOWN))}
            </details>
          ) : null}
        </>
      )}
    </Card>
  );
}
