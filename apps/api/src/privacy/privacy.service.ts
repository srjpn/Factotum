import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PrivacyCheckRequestSchema, type PrivacyCheckResult, type PrivacyClass } from '@facto/contracts';
import { ActivityService } from '../activity/activity.service.js';
import { CONFIG } from '../auth/admin.guard.js';
import type { Config } from '../config.js';
import { POOL } from '../db/db.js';
import { parseBody } from '../http.js';
import { ApprovalsService } from '../approvals/approvals.service.js';
import { checkTarget } from './privacy.js';

/**
 * Privacy guard (LT-12). The one place that decides whether work of a privacy class may run on a target.
 * Callers (the action path, LT-13) call `check` before they act; a `deny` is final. Every refusal is logged as
 * `privacy.deny` with outcome `denied`; the log holds the class, target and action name, never titles or content.
 * Allowed checks are not logged: the action's own entry already records that it ran.
 */
@Injectable()
export class PrivacyService {
  constructor(
    @Inject(POOL) private readonly pool: Pick<pg.Pool, 'query'>,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(ApprovalsService) private readonly approvals: ApprovalsService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** HTTP entry: owner credential or adapter token, then the same check as `check`. */
  async checkRequest(header: string | undefined, body: unknown): Promise<PrivacyCheckResult> {
    const who = await this.approvals.authenticateRequester(header);
    const req = parseBody(PrivacyCheckRequestSchema, body);
    return this.check({ ...req, actor: who });
  }

  async check(req: {
    privacyClass?: PrivacyClass | undefined;
    itemId?: string | undefined;
    target: string;
    action?: string | undefined;
    actor: { type: 'owner' | 'adapter' | 'system'; id: string };
  }): Promise<PrivacyCheckResult> {
    let cls: PrivacyClass | null = req.privacyClass ?? null;
    let result: PrivacyCheckResult;
    if (cls === null && req.itemId !== undefined) {
      const { rows } = await this.pool.query<{ privacy_class: PrivacyClass }>(
        'SELECT privacy_class FROM inventory_items WHERE id = $1',
        [req.itemId],
      );
      cls = rows[0]?.privacy_class ?? null;
    }
    if (cls === null) {
      // Unknown class: refuse rather than guess.
      result = { decision: 'deny', privacyClass: null, target: req.target, reason: 'privacy class unknown (item not found)' };
    } else {
      result = checkTarget(this.config.privacy, cls, req.target);
    }
    if (result.decision === 'deny') {
      await this.activity.record({
        actorType: req.actor.type,
        actorId: req.actor.id,
        action: 'privacy.deny',
        risk: 'read',
        targetType: 'privacy-target',
        targetId: req.target,
        outcome: 'denied',
        details: {
          privacyClass: result.privacyClass,
          reason: result.reason,
          ...(req.action ? { requestedAction: req.action } : {}),
          ...(req.itemId ? { itemId: req.itemId } : {}),
        },
      });
    }
    return result;
  }
}
