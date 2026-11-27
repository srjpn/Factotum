import type { ReactNode } from 'react';
import type { Tone } from '@/lib/overview';
import { ApiError } from './badges';

export function Pill({ tone = 'ne', children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={`pill ${tone}${dot ? '' : ' no-dot'}`}>{children}</span>;
}

const paths = {
  laptop: 'M4 6h16v10H4zM2 19h20',
  robot: 'M5 8h14v10H5zM12 4v4M9 13h.01M15 13h.01M3 12v3M21 12v3',
  board: 'M4 4h16v16H4zM9 4v16M15 4v10',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

/** A card with a titled header. `error` replaces the body when its source failed. */
export function Card({ title, icon, aside, error, children, id }: { title: string; icon: keyof typeof paths; aside?: ReactNode; error?: string; children?: ReactNode; id: string }) {
  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <div className="h">
        <h2 id={`${id}-h`}>
          <Icon name={icon} />
          {title}
        </h2>
        {error ? null : aside}
      </div>
      {error ? <ApiError message={error} /> : children}
    </section>
  );
}

/** Labelled progress bar. The value is also printed, so colour is never the only signal. */
export function Meter({ label, value, display, tone }: { label: string; value: number; display: string; tone: 'ok' | 'warn' | 'bad' }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="meter">
      <div className="lab">
        <span id={`m-${label}`}>{label}</span>
        <b>{display}</b>
      </div>
      <div className={`bar ${tone}`} role="progressbar" aria-labelledby={`m-${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={display}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Tile({ label, value, sub, href }: { label: string; value: ReactNode; sub?: string; href?: string }) {
  const body = (
    <>
      <div className="f">{label}</div>
      <div className="v">{value}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </>
  );
  return href ? (
    <a className="tile" href={href}>
      {body}
    </a>
  ) : (
    <div className="tile">{body}</div>
  );
}
