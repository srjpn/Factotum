import { Inject, Injectable } from '@nestjs/common';
import type { ActivityEntry, ActorType, Outcome, RiskLevel } from '@facto/contracts';
import { POOL, type Queryable } from '../db/db.js';

export type NewActivity = {
  actorType: ActorType;
  actorId: string;
  action: string;
  risk: RiskLevel;
  targetType?: string;
  targetId?: string;
  outcome: Outcome;
  details?: Record<string, unknown>;
};

type Row = {
  id: string;
  occurred_at: Date;
  actor_type: ActorType;
  actor_id: string;
  action: string;
  risk: RiskLevel;
  target_type: string | null;
  target_id: string | null;
  outcome: Outcome;
  details: Record<string, unknown>;
};

export type ActivityListener = (entry: NewActivity) => void | Promise<void>;

@Injectable()
export class ActivityService {
  private readonly listeners: ActivityListener[] = [];

  constructor(@Inject(POOL) private readonly pool: Queryable) {}

  // Subscribers (for example the Notifier) hear about each committed entry. They must not break the action.
  addListener(listener: ActivityListener): void {
    this.listeners.push(listener);
  }

  // Pass a transaction client as `db` so the entry commits or rolls back with the change it describes.
  async record(entry: NewActivity, db: Queryable = this.pool): Promise<void> {
    await db.query(
      `INSERT INTO activity_log (actor_type, actor_id, action, risk, target_type, target_id, outcome, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.actorType,
        entry.actorId,
        entry.action,
        entry.risk,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.outcome,
        JSON.stringify(entry.details ?? {}),
      ],
    );
    // Only entries written outside a transaction are announced, so listeners never act on rolled-back work.
    if (db === this.pool) {
      for (const listener of this.listeners) {
        try {
          Promise.resolve(listener(entry)).catch(() => undefined);
        } catch {
          // a listener failing must never affect the caller
        }
      }
    }
  }

  async list(limit = 100): Promise<ActivityEntry[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM activity_log ORDER BY id DESC LIMIT $1', [limit]);
    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at.toISOString(),
      actorType: r.actor_type,
      actorId: r.actor_id,
      action: r.action,
      risk: r.risk,
      targetType: r.target_type,
      targetId: r.target_id,
      outcome: r.outcome,
      details: r.details,
    }));
  }
}
