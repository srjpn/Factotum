import type { InventoryItem } from '@facto/contracts';
import { bindLabel, exposedCount, toServices } from '@/lib/local';
import { Card, Pill } from './ui';

type Res<T> = { ok: true; data: T } | { ok: false; message: string };
const SHOWN = 8;

/** Listening local ports from the devservers adapter. Plain text only: ports are never links. */
export function ServicesCard({ services }: { services: Res<InventoryItem[]> }) {
  const list = toServices(services.ok ? services.data : []);
  const exposed = exposedCount(list);
  const first = list.slice(0, SHOWN);
  const rest = list.slice(SHOWN);
  const rowOf = (s: (typeof list)[number], i: number) => (
    <div className={`row${i === 0 ? ' first' : ''}`} key={s.externalId}>
      <span className="grow">
        <span className="clip"><code>:{s.port}</code> {s.process}</span>
        {s.workingDir ? <span className="f">{s.workingDir}</span> : null}
      </span>
      {s.bind === 'all' ? <Pill tone="warn" dot={false}>⚠ {bindLabel(s.bind)}</Pill> : <span className="tag">{bindLabel(s.bind)}</span>}
    </div>
  );
  return (
    <Card id="services" title="Dev servers" icon="server" aside={list.length ? <Pill tone={exposed ? 'warn' : 'ne'} dot={false}>{list.length} listening{exposed ? ` · ${exposed} on all interfaces` : ''}</Pill> : undefined} error={services.ok ? undefined : services.message}>
      {list.length === 0 ? (
        <p className="empty">No listening ports reported. They appear once the devservers adapter is running and has synced.</p>
      ) : (
        <>
          {first.map(rowOf)}
          {rest.length > 0 ? (
            <details>
              <summary className="more">+{rest.length} more</summary>
              {rest.map((s, i) => rowOf(s, i + SHOWN))}
            </details>
          ) : null}
          {exposed ? <p className="f" style={{ marginTop: '0.5rem' }}>All interfaces means reachable from the network, not just this Mac.</p> : null}
        </>
      )}
    </Card>
  );
}
