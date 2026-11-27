import { Inject, Injectable } from '@nestjs/common';
import type { AdapterManifest } from '@facto/contracts';
import { POOL, type Queryable } from '../db/db.js';
import type { AdapterRecord, AdapterRepository, AdapterStatus } from './adapter.repository.js';


const COLUMNS = 'id, name, version, manifest, scopes, token_hash, status, status_detail, last_seen_at, registered_at';

function toRecord(r: Record<string, unknown>): AdapterRecord {
  return {
    id: r.id as string,
    name: r.name as string,
    version: r.version as string,
    manifest: r.manifest as AdapterManifest,
    scopes: r.scopes as string[],
    tokenHash: (r.token_hash as string).trim(),
    status: r.status as AdapterStatus,
    statusDetail: (r.status_detail as string | null) ?? null,
    lastSeenAt: (r.last_seen_at as Date | null) ?? null,
    registeredAt: r.registered_at as Date,
  };
}

/** Postgres implementation over migration 002_adapters.sql. */
@Injectable()
export class PgAdapterRepository implements AdapterRepository {
  constructor(@Inject(POOL) private readonly db: Queryable) {}

  private async one(sql: string, params: unknown[], db: Queryable = this.db): Promise<AdapterRecord | undefined> {
    const { rows } = await db.query(sql, params);
    return rows[0] ? toRecord(rows[0]) : undefined;
  }
  findByName(name: string) {
    return this.one(`SELECT ${COLUMNS} FROM adapters WHERE name = $1`, [name]);
  }
  findByTokenHash(hash: string) {
    return this.one(`SELECT ${COLUMNS} FROM adapters WHERE token_hash = $1`, [hash]);
  }
  async list() {
    const { rows } = await this.db.query(`SELECT ${COLUMNS} FROM adapters ORDER BY name`);
    return rows.map(toRecord);
  }
  async create(input: Pick<AdapterRecord, 'manifest' | 'scopes' | 'tokenHash'>, db: Queryable = this.db) {
    const row = await this.one(
      `INSERT INTO adapters (name, version, manifest, scopes, token_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [input.manifest.name, input.manifest.version, JSON.stringify(input.manifest), input.scopes, input.tokenHash],
      db,
    );
    return row!;
  }
  async updateManifest(id: string, manifest: AdapterManifest, scopes: string[]) {
    const row = await this.one(
      `UPDATE adapters SET version = $2, manifest = $3, scopes = $4, updated_at = now()
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, manifest.version, JSON.stringify(manifest), scopes],
    );
    if (!row) throw new Error(`adapter ${id} not found`);
    return row;
  }
  async recordHealth(id: string, status: AdapterStatus, detail: string | null) {
    const row = await this.one(
      `UPDATE adapters SET status = $2, status_detail = $3, last_seen_at = now(), updated_at = now()
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, status, detail],
    );
    if (!row) throw new Error(`adapter ${id} not found`);
    return row;
  }
  async resetToken(id: string, tokenHash: string, detail: string, db: Queryable = this.db) {
    const row = await this.one(
      `UPDATE adapters SET token_hash = $2, status = 'degraded', status_detail = $3, updated_at = now()
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, tokenHash, detail],
      db,
    );
    if (!row) throw new Error(`adapter ${id} not found`);
    return row;
  }
}
