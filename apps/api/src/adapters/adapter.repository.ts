import { randomUUID } from 'node:crypto';
import type { AdapterManifest } from '@facto/contracts';
import type { Queryable } from '../db/db.js';

export type AdapterStatus = 'unknown' | 'up' | 'degraded' | 'down';

export interface AdapterRecord {
  id: string;
  name: string;
  version: string;
  manifest: AdapterManifest;
  scopes: string[];
  tokenHash: string;
  status: AdapterStatus;
  statusDetail: string | null;
  lastSeenAt: Date | null;
  registeredAt: Date;
}

export interface AdapterRepository {
  findByName(name: string): Promise<AdapterRecord | undefined>;
  findByTokenHash(hash: string): Promise<AdapterRecord | undefined>;
  list(): Promise<AdapterRecord[]>;
  // Pass a transaction client as `db` so the row commits with its activity-log entries.
  create(input: Pick<AdapterRecord, 'manifest' | 'scopes' | 'tokenHash'>, db?: Queryable): Promise<AdapterRecord>;
  updateManifest(id: string, manifest: AdapterManifest, scopes: string[]): Promise<AdapterRecord>;
  recordHealth(id: string, status: AdapterStatus, detail: string | null): Promise<AdapterRecord>;
  // Replaces the token hash and marks the adapter degraded until it reports again. Pass a transaction client as `db`.
  resetToken(id: string, tokenHash: string, detail: string, db?: Queryable): Promise<AdapterRecord>;
}

export const ADAPTER_REPOSITORY = Symbol('ADAPTER_REPOSITORY');

export class InMemoryAdapterRepository implements AdapterRepository {
  private readonly rows = new Map<string, AdapterRecord>();

  async findByName(name: string) {
    return [...this.rows.values()].find((r) => r.name === name);
  }
  async findByTokenHash(hash: string) {
    return [...this.rows.values()].find((r) => r.tokenHash === hash);
  }
  async list() {
    return [...this.rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  async create(input: Pick<AdapterRecord, 'manifest' | 'scopes' | 'tokenHash'>) {
    const row: AdapterRecord = {
      id: randomUUID(),
      name: input.manifest.name,
      version: input.manifest.version,
      manifest: input.manifest,
      scopes: input.scopes,
      tokenHash: input.tokenHash,
      status: 'unknown',
      statusDetail: null,
      lastSeenAt: null,
      registeredAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }
  async updateManifest(id: string, manifest: AdapterManifest, scopes: string[]) {
    const row = this.mustGet(id);
    Object.assign(row, { manifest, scopes, version: manifest.version });
    return row;
  }
  async recordHealth(id: string, status: AdapterStatus, detail: string | null) {
    const row = this.mustGet(id);
    Object.assign(row, { status, statusDetail: detail, lastSeenAt: new Date() });
    return row;
  }
  async resetToken(id: string, tokenHash: string, detail: string) {
    const row = this.mustGet(id);
    Object.assign(row, { tokenHash, status: 'degraded', statusDetail: detail });
    return row;
  }
  private mustGet(id: string): AdapterRecord {
    const row = this.rows.get(id);
    if (!row) throw new Error(`adapter ${id} not found`);
    return row;
  }
}
