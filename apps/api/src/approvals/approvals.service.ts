import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type pg from 'pg';
import {
  ActionRequestSchema,
  type ActionDecision,
  type Approval,
  type ApprovalStatus,
  type RiskLevel,
} from '@facto/contracts';
import { ActivityService } from '../activity/activity.service.js';
import { AdaptersService } from '../adapters/adapters.service.js';
import { CONFIG } from '../auth/admin.guard.js';
import type { Config } from '../config.js';
import { POOL } from '../db/db.js';
import { parseBody } from '../http.js';
import { APPROVAL_TTL_SECONDS, policyFor } from '../policy/policy.js';
import { bearerToken, secretsMatch } from '../secrets.js';

type Row = {
  id: string;
  action: string;
  risk: RiskLevel;
  target_type: string | null;
  target_id: string | null;
  summary: string | null;
  params: Record<string, unknown>;
  requester_type: 'owner' | 'adapter';
  requester_id: string;
  status: ApprovalStatus;
  requested_at: Date;
  expires_at: Date;
  decided_at: Date | null;
  decided_by: string | null;
};

export const toApproval = (r: Row): Approval => ({
  id: r.id,
  action: r.action,
  risk: r.risk,
  targetType: r.target_type,
  targetId: r.target_id,
  summary: r.summary,
  params: r.params,
  requesterType: r.requester_type,
  requesterId: r.requester_id,
  status: r.status,
  requestedAt: r.requested_at.toISOString(),
  expiresAt: r.expires_at.toISOString(),
  decidedAt: r.decided_at?.toISOString() ?? null,
  decidedBy: r.decided_by,
});

type Requester = { type: 'owner' | 'adapter'; id: string };

/** The only approver in the lite track is the single owner, who signs in with the owner credential. */
const OWNER = 'owner';

/**
 * Policy path for actions (LT-11). A caller asks here before it acts. `read` and `reversible` actions are allowed
 * at once; `destructive` and `privileged` ones create a pending approval that only the owner can decide. Every
 * step (request, approve, deny, expire) writes an activity-log entry in the same transaction as the change.
 * The core never runs the action itself: the caller does, after it sees `allowed` or an `approved` status.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    @Inject(POOL) private readonly pool: Pick<pg.Pool, 'query' | 'connect'>,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(AdaptersService) private readonly adapters: AdaptersService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** The owner credential or an adapter service token. */
  async authenticateRequester(header: string | undefined): Promise<Requester> {
    const token = bearerToken(header);
    if (!token) throw new UnauthorizedException();
    if (secretsMatch(token, this.config.adminToken)) return { type: 'owner', id: OWNER };
    const adapter = await this.adapters.authenticate(header);
    return { type: 'adapter', id: adapter.name };
  }

  async request(header: string | undefined, body: unknown): Promise<ActionDecision> {
    const who = await this.authenticateRequester(header);
    const req = parseBody(ActionRequestSchema, body);
    const target = { targetType: req.targetType, targetId: req.targetId };
    const details = { summary: req.summary, params: req.params };

    if (policyFor(req.risk) === 'allow') {
      await this.activity.record({
        actorType: who.type,
        actorId: who.id,
        action: 'action.allow',
        risk: req.risk,
        ...target,
        outcome: 'success',
        details: { requestedAction: req.action, ...details },
      });
      return { decision: 'allowed', approval: null };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<Row>(
        `INSERT INTO approvals (action, risk, target_type, target_id, summary, params, requester_type, requester_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(secs => $9)) RETURNING *`,
        [
          req.action,
          req.risk,
          req.targetType ?? null,
          req.targetId ?? null,
          req.summary ?? null,
          JSON.stringify(req.params ?? {}),
          who.type,
          who.id,
          APPROVAL_TTL_SECONDS,
        ],
      );
      const row = rows[0]!;
      await this.activity.record(
        {
          actorType: who.type,
          actorId: who.id,
          action: 'approval.request',
          risk: req.risk,
          ...target,
          outcome: 'success',
          details: { approvalId: row.id, requestedAction: req.action, ...details },
        },
        client,
      );
      await client.query('COMMIT');
      return { decision: 'pending', approval: toApproval(row) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Marks overdue pending requests expired and logs each one. Runs before every read and decision. */
  async expireOverdue(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<Row>(
        `UPDATE approvals SET status = 'expired', decided_at = now()
         WHERE status = 'pending' AND expires_at <= now() RETURNING *`,
      );
      for (const r of rows) {
        await this.activity.record(
          {
            actorType: 'system',
            actorId: 'policy',
            action: 'approval.expire',
            risk: r.risk,
            targetType: r.target_type ?? undefined,
            targetId: r.target_id ?? undefined,
            outcome: 'denied',
            details: { approvalId: r.id, requestedAction: r.action },
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

  async list(status?: string): Promise<Approval[]> {
    await this.expireOverdue();
    const wanted = status && ['pending', 'approved', 'denied', 'expired'].includes(status) ? status : null;
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM approvals WHERE ($1::text IS NULL OR status = $1)
       ORDER BY (status = 'pending') DESC, requested_at DESC LIMIT 200`,
      [wanted],
    );
    return rows.map(toApproval);
  }

  /** Lets the requester (or the owner) poll for the outcome. An adapter sees only its own requests. */
  async get(header: string | undefined, id: string): Promise<Approval> {
    const who = await this.authenticateRequester(header);
    await this.expireOverdue();
    const row = await this.find(id);
    if (who.type === 'adapter' && (row.requester_type !== 'adapter' || row.requester_id !== who.id)) {
      throw new NotFoundException('approval not found');
    }
    return toApproval(row);
  }

  approve(id: string): Promise<Approval> {
    return this.decide(id, 'approved');
  }

  deny(id: string): Promise<Approval> {
    return this.decide(id, 'denied');
  }

  private async find(id: string): Promise<Row> {
    // A malformed id is simply not found.
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException('approval not found');
    const { rows } = await this.pool.query<Row>('SELECT * FROM approvals WHERE id = $1', [id]);
    if (!rows[0]) throw new NotFoundException('approval not found');
    return rows[0];
  }

  // Owner authorisation is the AdminGuard on the controller. Only a pending, unexpired request can be decided,
  // and the UPDATE is conditional so two decisions cannot both win.
  private async decide(id: string, status: 'approved' | 'denied'): Promise<Approval> {
    await this.find(id);
    await this.expireOverdue();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<Row>(
        `UPDATE approvals SET status = $2, decided_at = now(), decided_by = $3
         WHERE id = $1 AND status = 'pending' RETURNING *`,
        [id, status, OWNER],
      );
      const row = rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        const current = await this.find(id);
        throw new ConflictException(`approval is already ${current.status}`);
      }
      await this.activity.record(
        {
          actorType: 'owner',
          actorId: OWNER,
          action: status === 'approved' ? 'approval.approve' : 'approval.deny',
          risk: row.risk,
          targetType: row.target_type ?? undefined,
          targetId: row.target_id ?? undefined,
          outcome: status === 'approved' ? 'success' : 'denied',
          details: {
            approvalId: row.id,
            requestedAction: row.action,
            requester: `${row.requester_type}:${row.requester_id}`,
            approver: OWNER,
          },
        },
        client,
      );
      await client.query('COMMIT');
      return toApproval(row);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
