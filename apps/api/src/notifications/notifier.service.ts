import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ActivityService, type NewActivity } from '../activity/activity.service.js';
import { CONFIG } from '../auth/admin.guard.js';
import type { Config } from '../config.js';
import { notificationFor, type Notification } from './rules.js';

export const COOLDOWN_MS = 5 * 60 * 1000;
export const TIMEOUT_MS = 5000;

// Sends ntfy notifications for activity-log entries that match a rule. Optional: does nothing when unconfigured.
// A send never throws into the caller and is never retried.
@Injectable()
export class NotifierService implements OnModuleInit {
  private readonly log = new Logger('Notifier');
  private readonly lastSent = new Map<string, number>();

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(ActivityService) private readonly activity: ActivityService,
  ) {}

  get enabled(): boolean {
    return this.config.ntfy !== undefined;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.log.log('notifications are off (set FACTO_NTFY_URL and FACTO_NTFY_TOPIC to turn them on)');
      return;
    }
    this.activity.addListener((entry) => this.handle(entry));
  }

  async handle(entry: NewActivity, now: number = Date.now()): Promise<void> {
    const ntfy = this.config.ntfy;
    if (!ntfy) return;
    // The send's own log entry must never trigger another notification.
    if (entry.action === 'notification.send') return;
    const n = notificationFor(entry, new Date(now));
    if (!n) return;
    if (this.coolingDown(n, now)) return;
    await this.send(ntfy, n, entry);
  }

  private coolingDown(n: Notification, now: number): boolean {
    for (const [k, t] of this.lastSent) if (now - t >= COOLDOWN_MS) this.lastSent.delete(k);
    if (this.lastSent.has(n.key)) return true;
    this.lastSent.set(n.key, now);
    return false;
  }

  private async send(ntfy: NonNullable<Config['ntfy']>, n: Notification, entry: NewActivity): Promise<void> {
    let outcome: 'success' | 'failure' = 'success';
    let reason: string | undefined;
    try {
      const res = await fetch(`${ntfy.url.replace(/\/+$/, '')}/${encodeURIComponent(ntfy.topic)}`, {
        method: 'POST',
        headers: {
          Title: n.title,
          Priority: n.priority,
          Tags: n.tags.join(','),
          ...(ntfy.token ? { Authorization: `Bearer ${ntfy.token}` } : {}),
        },
        body: n.message,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`ntfy answered ${res.status}`);
    } catch (err) {
      outcome = 'failure';
      // Only the error name/message is kept; the token is in headers, never in these.
      reason = err instanceof Error ? err.name : 'error';
      this.log.warn(`notification for ${entry.action} failed: ${reason}`);
    }
    try {
      await this.activity.record({
        actorType: 'system',
        actorId: 'notifier',
        action: 'notification.send',
        risk: 'read',
        targetType: 'event',
        targetId: entry.action,
        outcome,
        details: reason ? { reason } : {},
      });
    } catch {
      this.log.warn('could not record notification.send');
    }
  }
}
