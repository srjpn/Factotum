import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type pg from 'pg';
import { ActivityService } from '../activity/activity.service.js';
import { CONFIG } from '../auth/admin.guard.js';
import type { Config } from '../config.js';
import { POOL } from '../db/db.js';
import { computeStatus } from './status.js';

type Row = { id: string; name: string; reported_status: string; last_heartbeat_at: Date | null; revoked_at: Date | null };

// Detects status changes (online, offline) and logs each change once.
@Injectable()
export class NodeStatusMonitor implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  onModuleInit(): void {
    if (this.config.statusCheckSeconds <= 0) return;
    this.timer = setInterval(() => {
      this.check().catch((err: unknown) => console.error('node status check failed', err));
    }, this.config.statusCheckSeconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async check(now: Date = new Date()): Promise<void> {
    const { rows } = await this.pool.query<Row>(
      'SELECT id, name, reported_status, last_heartbeat_at, revoked_at FROM nodes WHERE revoked_at IS NULL',
    );
    for (const row of rows) {
      const status = computeStatus(
        { revokedAt: row.revoked_at, lastHeartbeatAt: row.last_heartbeat_at },
        now,
        this.config.offlineAfterSeconds,
      );
      if (status === row.reported_status) continue;
      // The conditional update makes sure only one process logs a given change.
      const changed = await this.pool.query(
        'UPDATE nodes SET reported_status = $2 WHERE id = $1 AND reported_status = $3',
        [row.id, status, row.reported_status],
      );
      if (!changed.rowCount) continue;
      await this.activity.record({
        actorType: 'system',
        actorId: 'node-status-monitor',
        action: `node.${status}`,
        risk: 'read',
        targetType: 'node',
        targetId: row.id,
        outcome: 'success',
        details: { nodeName: row.name, from: row.reported_status },
      });
    }
  }
}
