import { BackupItemSchema, ContainerItemSchema, ServiceItemSchema, type BackupItem, type ContainerItem, type InventoryItem, type ServiceItem } from '@facto/contracts';
import type { Tone } from './overview';

/** Parse the backup items (one per destination). Invalid items are skipped. */
export function toBackups(items: InventoryItem[]): BackupItem[] {
  const out: BackupItem[] = [];
  for (const item of items) {
    if (item.kind !== 'backup') continue;
    const p = BackupItemSchema.safeParse({ status: item.status, ...item.data, externalId: item.externalId, title: item.title });
    if (p.success) out.push(p.data);
  }
  return out;
}

export function backupPill(status: BackupItem['status']): { tone: Tone; label: string } {
  switch (status) {
    case 'ok': return { tone: 'ok', label: 'up to date' };
    case 'running': return { tone: 'info', label: 'running' };
    case 'stale': return { tone: 'warn', label: 'stale' };
    default: return { tone: 'ne', label: 'unavailable' };
  }
}

/** Parse listening ports, sorted by port. Invalid items are skipped. */
export function toServices(items: InventoryItem[]): ServiceItem[] {
  const out: ServiceItem[] = [];
  for (const item of items) {
    if (item.kind !== 'service') continue;
    const p = ServiceItemSchema.safeParse({ status: item.status, ...item.data, externalId: item.externalId, title: item.title });
    if (p.success) out.push(p.data);
  }
  return out.sort((a, b) => a.port - b.port || a.process.localeCompare(b.process));
}

export const bindLabel = (b: ServiceItem['bind']): string => (b === 'all' ? 'all interfaces' : 'localhost');
export const exposedCount = (s: ServiceItem[]): number => s.filter((x) => x.bind === 'all').length;

export interface Container { id: string; name: string; status: ContainerItem['status']; statusLabel: string; health?: ContainerItem['health']; composeProject?: string }

/** Parse containers: problem states first, then running, then by name. */
export function toContainers(items: InventoryItem[]): Container[] {
  const rank = (c: Container) => (c.status === 'unhealthy' || c.health === 'unhealthy' ? 0 : c.status === 'restarting' ? 1 : c.status === 'running' ? 3 : 2);
  const out: Container[] = [];
  for (const item of items) {
    if (item.kind !== 'container') continue;
    const p = ContainerItemSchema.safeParse({ status: item.status, ...item.data, externalId: item.externalId, name: item.title });
    if (p.success) out.push({ id: item.id, name: p.data.name, status: p.data.status, statusLabel: p.data.statusLabel, health: p.data.health, composeProject: p.data.composeProject });
  }
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function containerPill(c: Pick<Container, 'status' | 'health'>): { tone: Tone; label: string } {
  if (c.status === 'unhealthy' || c.health === 'unhealthy') return { tone: 'bad', label: 'unhealthy' };
  if (c.status === 'running') return { tone: 'ok', label: c.health === 'starting' ? 'starting' : 'running' };
  if (c.status === 'restarting') return { tone: 'warn', label: 'restarting' };
  if (c.status === 'stopped') return { tone: 'ne', label: 'stopped' };
  return { tone: 'ne', label: 'other' };
}
