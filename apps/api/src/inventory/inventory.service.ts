import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import {
  INVENTORY_KINDS,
  INVENTORY_MAX_DATA_BYTES,
  InventorySnapshotSchema,
  PrivacyClassSchema,
  isInventoryKind,
  type InventoryItem,
  type InventoryKind,
  type InventorySyncResult,
  type PrivacyClass,
} from '@facto/contracts';
import { ActivityService } from '../activity/activity.service.js';
import { AdaptersService } from '../adapters/adapters.service.js';
import { POOL, type Queryable } from '../db/db.js';
import { parseBody } from '../http.js';

type Row = {
  id: string;
  adapter_name: string;
  kind: string;
  external_id: string;
  title: string;
  status: string;
  privacy_class: PrivacyClass;
  url: string | null;
  data: Record<string, unknown>;
  observed_at: Date;
  updated_at: Date;
};

/** An item flattened to table columns; everything kind-specific lives in `data`. */
type StoredItem = {
  externalId: string;
  title: string;
  status: string;
  url: string | null;
  data: Record<string, unknown>;
};

function flatten(item: { externalId: string; title: string; status: string; url?: string } & Record<string, unknown>): StoredItem {
  const { externalId, title, status, url, ...data } = item;
  return { externalId, title, status, url: url ?? null, data };
}

// Key order does not matter to jsonb, so compare canonically.
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );

@Injectable()
export class InventoryService {
  constructor(
    @Inject(AdaptersService) private readonly adapters: AdaptersService,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(POOL) private readonly pool: pg.Pool,
  ) {}

  /**
   * Replaces one adapter's snapshot of one kind. Risk: read (it changes only Factotum's cache,
   * never the tool). Everything happens in one transaction; an invalid item rejects the whole call.
   */
  async sync(authorization: string | undefined, kind: string, body: unknown): Promise<InventorySyncResult> {
    const adapter = await this.adapters.authenticate(authorization);
    if (!(adapter.manifest.reports ?? []).includes(kind)) {
      throw new ForbiddenException(`adapter ${adapter.name} does not declare "${kind}" in its manifest reports`);
    }
    if (!isInventoryKind(kind)) throw new BadRequestException(`unsupported inventory kind "${kind}"`);

    const snapshot = parseBody(InventorySnapshotSchema, body);
    const schema = INVENTORY_KINDS[kind as InventoryKind];
    const errors: string[] = [];
    const items: StoredItem[] = [];
    const seen = new Set<string>();
    snapshot.items.forEach((raw, i) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) errors.push(`items.${i}.${issue.path.join('.')}: ${issue.message}`);
        return;
      }
      const item = flatten(parsed.data);
      if (seen.has(item.externalId)) errors.push(`items.${i}.externalId: duplicate "${item.externalId}"`);
      seen.add(item.externalId);
      if (Buffer.byteLength(JSON.stringify(item.data)) > INVENTORY_MAX_DATA_BYTES) {
        errors.push(`items.${i}: data exceeds ${INVENTORY_MAX_DATA_BYTES} bytes`);
      }
      items.push(item);
    });
    if (errors.length) throw new BadRequestException(errors.slice(0, 20));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.replaceSnapshot(client, adapter.id, kind, snapshot.privacyClass, items);
      if (result.added || result.updated || result.removed) {
        await this.activity.record(
          {
            actorType: 'adapter',
            actorId: adapter.name,
            action: 'inventory.sync',
            risk: 'read',
            targetType: 'inventory',
            targetId: kind,
            outcome: 'success',
            // Counts only: never titles or item data.
            details: { added: result.added, updated: result.updated, removed: result.removed },
          },
          client,
        );
      }
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async replaceSnapshot(
    db: Queryable,
    adapterId: string,
    kind: string,
    privacy: PrivacyClass,
    items: StoredItem[],
  ): Promise<InventorySyncResult> {
    // Serialise concurrent syncs of the same adapter and kind.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`inventory:${adapterId}:${kind}`]);
    const existing = await db.query<{
      external_id: string;
      title: string;
      status: string;
      url: string | null;
      data: Record<string, unknown>;
      privacy_class: string;
    }>('SELECT external_id, title, status, url, data, privacy_class FROM inventory_items WHERE adapter_id = $1 AND kind = $2', [
      adapterId,
      kind,
    ]);
    const before = new Map(existing.rows.map((r) => [r.external_id, r]));

    let added = 0;
    let updated = 0;
    let unchanged = 0;
    for (const it of items) {
      const old = before.get(it.externalId);
      if (!old) added++;
      else if (
        old.title !== it.title ||
        old.status !== it.status ||
        old.url !== it.url ||
        old.privacy_class !== privacy ||
        canon(old.data) !== canon(it.data)
      )
        updated++;
      else unchanged++;
    }
    const keep = new Set(items.map((i) => i.externalId));
    const removed = existing.rows.filter((r) => !keep.has(r.external_id)).length;

    if (items.length) {
      await db.query(
        `INSERT INTO inventory_items (adapter_id, kind, external_id, title, status, privacy_class, url, data)
         SELECT $1, $2, x.external_id, x.title, x.status, $3, x.url, x.data
           FROM jsonb_to_recordset($4::jsonb) AS x(external_id text, title text, status text, url text, data jsonb)
         ON CONFLICT (adapter_id, kind, external_id) DO UPDATE SET
           updated_at = CASE WHEN (inventory_items.title, inventory_items.status, inventory_items.url,
                                   inventory_items.privacy_class, inventory_items.data)
                              IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.status, EXCLUDED.url,
                                                EXCLUDED.privacy_class, EXCLUDED.data)
                             THEN now() ELSE inventory_items.updated_at END,
           title = EXCLUDED.title, status = EXCLUDED.status, url = EXCLUDED.url,
           privacy_class = EXCLUDED.privacy_class, data = EXCLUDED.data, observed_at = now()`,
        [
          adapterId,
          kind,
          privacy,
          JSON.stringify(items.map((i) => ({ external_id: i.externalId, title: i.title, status: i.status, url: i.url, data: i.data }))),
        ],
      );
    }
    await db.query('DELETE FROM inventory_items WHERE adapter_id = $1 AND kind = $2 AND external_id <> ALL($3::text[])', [
      adapterId,
      kind,
      [...keep],
    ]);
    return { added, updated, removed, unchanged };
  }

  /** Owner read of cached inventory. Risk: read. */
  async list(filter: { kind?: string; source?: string; privacy?: string }): Promise<InventoryItem[]> {
    if (filter.kind !== undefined && !isInventoryKind(filter.kind)) throw new BadRequestException(`unsupported inventory kind "${filter.kind}"`);
    const privacy = filter.privacy === undefined ? undefined : parseBody(PrivacyClassSchema, filter.privacy);
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (filter.kind) add('i.kind = ?', filter.kind);
    if (filter.source) add("i.data->>'source' = ?", filter.source);
    if (privacy) add('i.privacy_class = ?', privacy);
    const { rows } = await this.pool.query<Row>(
      `SELECT i.*, a.name AS adapter_name FROM inventory_items i JOIN adapters a ON a.id = i.adapter_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.kind, a.name, i.title LIMIT 5000`,
      params,
    );
    return rows.map((r) => ({
      id: r.id,
      adapter: r.adapter_name,
      kind: r.kind,
      externalId: r.external_id,
      title: r.title,
      status: r.status,
      privacyClass: r.privacy_class,
      url: r.url,
      data: r.data,
      observedAt: r.observed_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  }
}
