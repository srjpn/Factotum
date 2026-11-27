import type { ContainerItem } from '@facto/contracts';
import type { RawContainer } from './docker.js';

const COMPOSE_LABEL = 'com.docker.compose.project';

type Health = NonNullable<ContainerItem['health']>;

/** Docker's Status text carries the health: "Up 2 hours (healthy)", "(unhealthy)", "(health: starting)". */
export function healthFromStatus(status: string): Health {
  if (/\(unhealthy\)/i.test(status)) return 'unhealthy';
  if (/\(healthy\)/i.test(status)) return 'healthy';
  if (/\(health: starting\)/i.test(status)) return 'starting';
  return 'none';
}

export function mapStatus(state: string, health: Health): ContainerItem['status'] {
  switch (state) {
    case 'running':
      return health === 'unhealthy' ? 'unhealthy' : 'running';
    case 'restarting':
      return 'restarting';
    case 'exited':
    case 'created':
    case 'dead':
      return 'stopped';
    default:
      return 'other'; // paused, removing, anything new
  }
}

/** Published ports only, as `ip:public->private/proto`, deduplicated and sorted. */
export function formatPorts(ports: unknown): string[] {
  if (!Array.isArray(ports)) return [];
  const out = new Set<string>();
  for (const p of ports as Array<Record<string, unknown>>) {
    if (typeof p?.PublicPort !== 'number' || typeof p.PrivatePort !== 'number') continue;
    const ip = typeof p.IP === 'string' && p.IP ? `${p.IP}:` : '';
    out.add(`${ip}${p.PublicPort}->${p.PrivatePort}/${typeof p.Type === 'string' ? p.Type : 'tcp'}`);
  }
  return [...out].sort();
}

/** Copies only the allowed fields; labels are read for the compose project and then dropped. */
export function toContainerItem(raw: RawContainer): ContainerItem | null {
  if (typeof raw.Id !== 'string' || !raw.Id) return null;
  const id = raw.Id.slice(0, 12);
  const names = Array.isArray(raw.Names) ? (raw.Names as unknown[]) : [];
  const name = (typeof names[0] === 'string' ? names[0].replace(/^\//, '') : '') || id;
  const state = typeof raw.State === 'string' ? raw.State : 'unknown';
  const health = healthFromStatus(typeof raw.Status === 'string' ? raw.Status : '');
  const labels = raw.Labels && typeof raw.Labels === 'object' ? (raw.Labels as Record<string, unknown>) : {};
  const project = labels[COMPOSE_LABEL];
  const ports = formatPorts(raw.Ports);
  return {
    externalId: id,
    name: name.slice(0, 500),
    image: (typeof raw.Image === 'string' && raw.Image ? raw.Image : 'unknown').slice(0, 500),
    status: mapStatus(state, health),
    statusLabel: state.slice(0, 200),
    health,
    ...(typeof project === 'string' && project ? { composeProject: project.slice(0, 200) } : {}),
    source: 'docker',
    ...(ports.length ? { ports } : {}),
  };
}

export function toContainerItems(raw: RawContainer[]): ContainerItem[] {
  return raw.map(toContainerItem).filter((c): c is ContainerItem => c !== null);
}
