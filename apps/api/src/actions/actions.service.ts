import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type pg from 'pg';
import {
  ActionResultReportSchema,
  ActionRunRequestSchema,
  type ActionClaim,
  type ActionRun,
  type ActionRunStatus,
  type RiskLevel,
} from '@facto/contracts';
import { ActivityService } from '../activity/activity.service.js';
import { AdaptersService } from '../adapters/adapters.service.js';
import { ApprovalsService } from '../approvals/approvals.service.js';
import { POOL } from '../db/db.js';
import { parseBody } from '../http.js';
import { checkActionPrivacy } from './privacy-hook.js';

/** An allowed or approved run that no adapter claimed in this time is failed, so a stale write never runs later. */
export const RUN_QUEUE_TTL_SECONDS = 60 * 60;
/** A claimed run with no reported result in this time is failed. It is never handed out again (it may have half run). */
export const RUN_CLAIM_TIMEOUT_SECONDS = 10 * 60;

type Row = {
  id: string;
  adapter: string;
  action: string;
  risk: RiskLevel;
  params: Record<string, unknown>;
  target_type: string | null;
  target_id: string | null;
  summary: string | null;
  status: ActionRunStatus;
  approval_id: string | null;
  requested_by: string;
  requested_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  detail: string | null;
};

export const toRun = (r: Row): ActionRun => ({
  id: r.id,
  adapter: r.adapter,
  action: r.action,
  risk: r.risk,
  params: r.params,
  targetType: r.target_type,
  targetId: r.target_id,
  summary: r.summary,
  status: r.status,
  approvalId: r.approval_id,
  requestedBy: r.requested_by,
  requestedAt: r.requested_at.toISOString(),
  startedAt: r.started_at?.toISOString() ?? null,
  finishedAt: r.finished_at?.toISOString() ?? null,
  detail: r.detail,
});

const target = (r: Row) => ({ targetType: r.target_type ?? undefined, targetId: r.target_id ?? undefined });

/**
 * Write-action queue (LT-13). The owner asks for a declared adapter action; the core applies the policy tier
 * (via ApprovalsService), queues it, and the adapter polls with its own token, executes against its own tool and
 * reports back. The core never calls an adapter and never touches the external tool. Adapters never see each
 * other's runs. Request, decision, queue, start and result each write an activity entry.
 */
@Injectable()
export class ActionRunsService {
  constructor(
    @Inject(POOL) private readonly pool: Pick<pg.Pool, 'query' | 'connect'>,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(AdaptersService) private readonly adapters: AdaptersService,
    @Inject(ApprovalsService) private readonly approvals: ApprovalsService,
  ) {}

  /** Owner request. Risk comes from the adapter's registered manifest, so a caller cannot understate it. */
  async request(body: unknown): Promise<ActionRun> {
    const req = parseBody(ActionRunRequestSchema, body);
    const adapter = await this.adapters.find(req.adapter);
    if (!adapter) throw new NotFoundException(`adapter ${req.adapter} is not registered`);
    const declared = (adapter.manifest.actions ?? []).find((a) => a.name === req.action);
    if (!declared || !adapter.scopes.includes(declared.permission)) {
      throw new BadRequestException(`adapter ${req.adapter} does not declare action ${req.action}`);
    }
    if (declared.risk === 'read') throw new BadRequestException('read actions are not queued; read through inventory');
    const risk = declared.risk;

    // LT-12 HOOK: the privacy check runs before anything is queued.
    await checkActionPrivacy({
      adapter: req.adapter,
      action: req.action,
      risk,
      targetType: req.targetType,
      targetId: req.targetId,
      params: req.params,
    });

    const id = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const decision = await this.approvals.evaluate(
        { type: 'owner', id: 'owner' },
        {
          action: `${req.adapter}.${req.action}`,
          risk,
          targetType: req.targetType,
          targetId: req.targetId,
          summary: req.summary,
          params: req.params,
        },
        client,
      );
      const allowed = decision.decision === 'allowed';
      const { rows } = await client.query<Row>(
        `INSERT INTO action_runs (id, adapter, action, risk, params, target_type, target_id, summary, status, approval_id, requested_by, queued_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'owner', CASE WHEN $9 = 'queued' THEN now() END) RETURNING *`,
        [
          id,
          req.adapter,
          req.action,
          risk,
          JSON.stringify(req.params),
          req.targetType ?? null,
          req.targetId ?? null,
          req.summary ?? null,
          allowed ? 'queued' : 'awaiting_approval',
          decision.approval?.id ?? null,
        ],
      );
      const row = rows[0]!;
      if (allowed) await this.logQueued(row, client);
      await client.query('COMMIT');
      return toRun(row);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private logQueued(r: Row, db: pg.PoolClient) {
    return this.activity.record(
      {
        actorType: 'system',
        actorId: 'policy',
        action: 'action.queue',
        risk: r.risk,
        ...target(r),
        outcome: 'success',
        details: { runId: r.id, requestedAction: `${r.adapter}.${r.action}`, approvalId: r.approval_id },
      },
      db,
    );
  }

  /**
   * Moves runs whose approval was decided: approved -> queued, denied or expired -> cancelled; fails stale queued
   * and unreported running runs. Applied lazily before every read and claim, like approval expiry.
   */
  async settle(): Promise<void> {
    await this.approvals.expireOverdue();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const decided = await client.query<Row & { approval_status: string }>(
        `UPDATE action_runs r
           SET status = CASE a.status WHEN 'approved' THEN 'queued' ELSE 'cancelled' END,
               queued_at = CASE a.status WHEN 'approved' THEN now() END,
               finished_at = CASE a.status WHEN 'approved' THEN NULL ELSE now() END,
               detail = CASE a.status WHEN 'approved' THEN NULL ELSE 'approval ' || a.status END
         FROM approvals a
         WHERE r.approval_id = a.id AND r.status = 'awaiting_approval' AND a.status IN ('approved','denied','expired')
         RETURNING r.*, a.status AS approval_status`,
      );
      for (const r of decided.rows) {
        if (r.approval_status === 'approved') await this.logQueued(r, client);
        else {
          await this.activity.record(
            {
              actorType: 'system',
              actorId: 'policy',
              action: 'action.cancel',
              risk: r.risk,
              ...target(r),
              outcome: 'denied',
              details: { runId: r.id, requestedAction: `${r.adapter}.${r.action}`, approvalId: r.approval_id, reason: `approval ${r.approval_status}` },
            },
            client,
          );
        }
      }
      const stale = await client.query<Row>(
        `UPDATE action_runs SET status = 'failed', finished_at = now(),
           detail = CASE status WHEN 'queued' THEN 'not claimed by the adapter in time' ELSE 'no result reported by the adapter' END
         WHERE (status = 'queued' AND queued_at <= now() - make_interval(secs => $1))
            OR (status = 'running' AND started_at <= now() - make_interval(secs => $2))
         RETURNING *`,
        [RUN_QUEUE_TTL_SECONDS, RUN_CLAIM_TIMEOUT_SECONDS],
      );
      for (const r of stale.rows) {
        await this.activity.record(
          {
            actorType: 'system',
            actorId: 'policy',
            action: 'action.result',
            risk: r.risk,
            ...target(r),
            outcome: 'failure',
            details: { runId: r.id, requestedAction: `${r.adapter}.${r.action}`, detail: r.detail },
          },
          client,
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async list(filter: { status?: string; adapter?: string } = {}): Promise<ActionRun[]> {
    await this.settle();
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM action_runs WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR adapter = $2)
       ORDER BY requested_at DESC LIMIT 200`,
      [filter.status ?? null, filter.adapter ?? null],
    );
    return rows.map(toRun);
  }

  async get(id: string): Promise<ActionRun> {
    await this.settle();
    return toRun(await this.find(id));
  }

  private async find(id: string): Promise<Row> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException('run not found');
    const { rows } = await this.pool.query<Row>('SELECT * FROM action_runs WHERE id = $1', [id]);
    if (!rows[0]) throw new NotFoundException('run not found');
    return rows[0];
  }

  /** Adapter poll: hands out the oldest queued run for this adapter once, marking it running. */
  async claim(header: string | undefined): Promise<ActionClaim> {
    const adapter = await this.adapters.authenticate(header);
    await this.settle();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<Row>(
        `UPDATE action_runs SET status = 'running', started_at = now()
         WHERE id = (SELECT id FROM action_runs WHERE adapter = $1 AND status = 'queued'
                     ORDER BY queued_at, requested_at FOR UPDATE SKIP LOCKED LIMIT 1)
         RETURNING *`,
        [adapter.name],
      );
      const row = rows[0];
      if (row) {
        await this.activity.record(
          {
            actorType: 'adapter',
            actorId: adapter.name,
            action: 'action.start',
            risk: row.risk,
            ...target(row),
            outcome: 'success',
            details: { runId: row.id, requestedAction: `${row.adapter}.${row.action}` },
          },
          client,
        );
      }
      await client.query('COMMIT');
      return { run: row ? toRun(row) : null };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Adapter reports the outcome of a run it claimed. One report per run; only the claiming adapter may send it. */
  async report(header: string | undefined, id: string, body: unknown): Promise<ActionRun> {
    const adapter = await this.adapters.authenticate(header);
    const report = parseBody(ActionResultReportSchema, body);
    const existing = await this.find(id);
    if (existing.adapter !== adapter.name) throw new NotFoundException('run not found');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<Row>(
        `UPDATE action_runs SET status = $2, finished_at = now(), detail = $3
         WHERE id = $1 AND status = 'running' RETURNING *`,
        [id, report.outcome === 'success' ? 'succeeded' : 'failed', report.detail ?? null],
      );
      const row = rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        throw new ConflictException(`run is ${(await this.find(id)).status}, not running`);
      }
      await this.activity.record(
        {
          actorType: 'adapter',
          actorId: adapter.name,
          action: 'action.result',
          risk: row.risk,
          ...target(row),
          outcome: report.outcome,
          details: { runId: row.id, requestedAction: `${row.adapter}.${row.action}`, detail: report.detail ?? null },
        },
        client,
      );
      await client.query('COMMIT');
      return toRun(row);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

