# ADR-010: Approval policy for the lite track

- Status: Proposed
- Needed by: LT-11 (policy tiers and approval), LT-13 (write actions). Narrows [ADR-007](007-policy-language.md) to a fixed table.

## Context

Every action declares a risk level (CLAUDE.md rule 7). The lite track needs `destructive` and `privileged` actions to wait for the owner, and the decision and approver in the activity log, without a policy language.

## Decision

1. **Fixed tier table**, in `apps/api/src/policy/policy.ts`: `read` and `reversible` are allowed at once; `destructive` and `privileged` need owner approval. A new risk level fails to compile until it is given a tier. No policy language yet (ADR-007 stays Proposed).
2. **Ask first, act second.** A caller (an adapter with its service token, or the owner) sends `POST /actions/request`. The core answers `allowed`, or creates a pending approval and answers `pending`. The caller polls `GET /approvals/:id` and acts only on `approved`. The core never runs the action: it stays out of the data plane.
3. **Approvals expire** after 24 hours (`APPROVAL_TTL_SECONDS`). Expiry is applied lazily on every list, get and decision, and logged as `approval.expire` (actor `system`).
4. **Approver is the single owner** (`owner`, the owner credential). A decision is a conditional update, so concurrent decisions cannot both win. Request, approve, deny and expire each write an activity entry in the same transaction as the state change.
5. **Trusted risk declaration (known gap).** The caller states the action's risk, so a misbehaving adapter could understate it. This is acceptable while adapters are the owner's own code. Before third-party adapters, the manifest should list its actions with fixed risk levels and the core should check requests against it.
6. **Approval is not bound to parameters beyond what was stored.** Consuming an approval (single use, tied to the stored `params`) is for LT-13 to define when the first write action exists.

## Consequences

- Dashboard approval needs no extra auth beyond the owner login.
- A caller that never polls leaves a stale approval until it expires; nothing is executed on its behalf.
- Items 5 and 6 need an owner decision before LT-13 ships destructive actions.
