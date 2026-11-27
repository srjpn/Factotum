import type { RiskLevel } from '@facto/contracts';

/** How long the owner has to decide before a pending request expires. */
export const APPROVAL_TTL_SECONDS = 24 * 60 * 60;

export type PolicyDecision = 'allow' | 'approval';

/**
 * The tier table (LT-11). `read` and `reversible` run without approval; `destructive` and `privileged` wait for
 * the owner. Written as a switch so a new risk level fails to compile until it is given a tier.
 */
export function policyFor(risk: RiskLevel): PolicyDecision {
  switch (risk) {
    case 'read':
    case 'reversible':
      return 'allow';
    case 'destructive':
    case 'privileged':
      return 'approval';
  }
}
