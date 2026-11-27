import type { RiskLevel } from '@facto/contracts';

export interface ActionPrivacyContext {
  adapter: string;
  action: string;
  risk: RiskLevel;
  targetType?: string;
  targetId?: string;
  params: Record<string, unknown>;
}

/**
 * LT-12 HOOK. Called by ActionRunsService before a write action is queued. LT-12 (privacy class check) replaces
 * this body: it must throw a ForbiddenException, after logging the refusal, when the action's target is a
 * `client-data` task and the adapter is outside the allowed list. Until LT-12 is merged this allows everything.
 */
export async function checkActionPrivacy(ctx: ActionPrivacyContext): Promise<void> {
  void ctx; // intentionally empty until LT-12
}
