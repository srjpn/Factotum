# Privacy check (LT-12)

Implements the minimal form of ADR-007 for privacy: a hard allow-list of targets per privacy class. It is a guard, not a policy language.

## Model

- **Privacy class** comes from inventory items (`personal` or `client-data`, `packages/contracts/src/inventory.ts`).
- **Target** is an opaque name for where work would run (a node name, an adapter name, a model host). Exact, case-sensitive match.
- **Allowed list** is set by the owner in the API environment:
  - `FACTO_PRIVACY_CLIENT_DATA_TARGETS`: comma-separated. **Unset or empty means no target is allowed** (fail closed).
  - `FACTO_PRIVACY_PERSONAL_TARGETS`: comma-separated; `*` or unset means any target.
- A `*` inside a list with other names is ignored; only a lone `*` means any.

## Interface (for LT-13 and any caller)

`POST /privacy/check` (owner credential or adapter token), always HTTP 200:

```json
{ "privacyClass": "client-data", "target": "macbook", "action": "pani.run.start" }
```

Give either `privacyClass` or `itemId` (an inventory item id; the class is read from inventory, and an unknown item is denied). Response: `{ decision: "allow" | "deny", privacyClass, target, reason }`.

In process, `PrivacyService.check({ privacyClass | itemId, target, action?, actor })` (exported from `PrivacyModule`) does the same.

Rules for callers:

1. Call the check **before** acting, for any action on a task or run whose class is known, in addition to the risk-level policy path (`POST /actions/request`). Both must pass.
2. `deny` is final. Never retry with a different target on your own; there is no fallback across the boundary. Pick another target only if the owner or the placement policy does so, and check again.
3. Do not put titles or client content in `action`, `target` or any field.

## Logging

Every refusal writes `privacy.deny` (risk `read`, outcome `denied`, target type `privacy-target`) with class, reason, action name and item id. Allowed checks are not logged here; the action's own entry records that it ran.

`GET /privacy/policy` (owner) returns the configured lists.

## Not covered

Enforcement in the data path is out of scope (control plane only): the check only protects flows that ask. Placement by capability, cost and latency stays in ADR-007 for Phase 3.
