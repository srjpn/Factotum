import type { PrivacyClass, PrivacyCheckResult } from '@facto/contracts';

/** Allowed targets per privacy class. `'*'` means any target; an empty list means none (fail closed). */
export type PrivacyPolicy = Record<PrivacyClass, readonly string[] | '*'>;

/** Parses a comma-separated env value. Unset means `fallback`; `*` alone means any target. */
export function parseTargets(value: string | undefined, fallback: readonly string[] | '*'): readonly string[] | '*' {
  if (value === undefined) return fallback;
  const items = value.split(',').map((s) => s.trim()).filter(Boolean);
  return items.length === 1 && items[0] === '*' ? '*' : items.filter((s) => s !== '*');
}

/**
 * Pure check. Exact, case-sensitive match against the owner's list for the class. There is no fallback: a
 * denied target is never swapped for another one, the caller gets `deny` and must stop or ask for another target.
 */
export function checkTarget(policy: PrivacyPolicy, privacyClass: PrivacyClass, target: string): PrivacyCheckResult {
  const allowed = policy[privacyClass];
  if (allowed === '*' || allowed.includes(target)) {
    return { decision: 'allow', privacyClass, target, reason: `target is allowed for ${privacyClass}` };
  }
  return {
    decision: 'deny',
    privacyClass,
    target,
    reason: allowed.length === 0 ? `no target is allowed for ${privacyClass}` : `target is not on the ${privacyClass} allowed list`,
  };
}
