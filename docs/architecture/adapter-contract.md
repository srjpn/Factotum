# Adapter contract

An adapter is a separate process that teaches Factotum about one tool. It registers with a manifest, reports state and exposes actions. Running adapters out of process means a crashing adapter cannot take down the control plane, adapters can run on any node, and the same contract later becomes the plugin ecosystem. Decisions are tracked in [ADR-002](../adr/002-adapter-contract.md).

The manifest format is defined by [`schemas/adapter-manifest.schema.json`](../../schemas/adapter-manifest.schema.json).

## Example manifest

```yaml
name: docker
version: 0.1.0
domain: hosting
tier: control            # link | observe | control
reports:                 # inventory kinds this adapter keeps up to date
  - container
  - image
actions:                 # everything Factotum may ask it to do
  - name: restart-container
    permission: hosting.restart
    risk: reversible     # read | reversible | destructive | privileged
  - name: remove-container
    permission: hosting.remove
    risk: destructive    # always needs explicit confirmation
events:
  publishes: [container.unhealthy, container.started]
  consumes: [deploy.requested]
secrets: [registry-token]
health: /healthz
config_schema: ./config.schema.json
ui:
  tile: { title: Containers, link: /containers }
  widgets: [container-health]
```

## What the contract guarantees

- **Registration.** The adapter posts its manifest, receives a service token scoped to the permissions it declared, and sends heartbeats. A missing heartbeat marks the adapter unavailable, not the tool.
- **Transport.** HTTP and JSON described by OpenAPI, plus typed events on the core event bus. Any language works.
- **Actions are declared.** The manifest lists every action with a risk level, so the policy layer can decide confirmation and approval before the adapter is ever called.
- **State flows one way.** Adapters report observed state; the core stores intent and cached snapshots.
- **UI is declarative first.** Adapters supply tiles, cards and links. A full custom page is allowed only by embedding the tool's own UI.

## Registration API (lite track, LT-5)

| Endpoint | Caller | Auth | Risk |
| --- | --- | --- | --- |
| `POST /adapters/register` | Owner or installer | Owner token (`FACTO_ADMIN_TOKEN`, `AdminGuard`) as `Authorization: Bearer` | privileged (issues a credential) |
| `POST /adapters/health` | The adapter | Its own service token | read |
| `GET /adapters` | Owner or dashboard | Owner token | read |
| `PUT /adapters/inventory/:kind` | The adapter | Its own service token | read (activity entry only when something changed) |
| `GET /inventory?kind=&source=&privacy=` | Owner or dashboard | Owner token | read |

- The request body of `register` is the manifest. The API validates it against `schemas/adapter-manifest.schema.json`; an undeclared risk level, a missing risk level or a missing required field returns 400 with the list of errors. A duplicate name returns 409.
- The response carries a service token (`facto_adp_...`) **once**. Only its SHA-256 hash is stored, and it is never logged. The token is scoped to the adapter: one scope per declared action permission, plus `adapter.health.report`. It authenticates only that adapter's own calls.
- `POST /adapters/health` takes `{ "status": "up" | "degraded" | "down", "detail"?: string }`. Heartbeats are not written to the activity log (high frequency, no state change in intent); registration, token issue and rejected registrations are, with a declared risk level.
- Registration writes the adapter row and both activity entries in one transaction.
- Not yet built: token rotation, re-registration of an existing name, marking an adapter unavailable after missed heartbeats, and per-action scope enforcement (arrives with the action path in LT-11).

## Inventory ingest (lite track, LT-5b)

Adapters push what they observe with `PUT /adapters/inventory/:kind`, authenticated with their service token. The kind must appear in the manifest's `reports` list, otherwise the call returns 403.

- **Full snapshot.** The body is `{ "privacyClass": "personal" | "client-data", "items": [...] }` and replaces everything the adapter reported for that kind. Items missing from the snapshot are deleted. Upserts and deletes happen in one transaction, so an invalid item (or a repeated `externalId`) rejects the whole call and leaves the old data in place.
- **Limits.** The body is capped at about 1 MB, a snapshot at 2000 items, and the kind-specific data at 8 KB per item.
- **Privacy.** The adapter declares the privacy class; the core stores and returns it and never infers it. Filtering by class is the basis for the privacy checks in LT-12.
- **Kinds.** Kinds the core understands are defined in `packages/contracts/src/inventory.ts`. The first is `task`: `externalId`, `title`, `status` (`todo`, `in-progress`, `done`, `other`), `statusLabel`, `source`, and optional `url`, `project`, `assignee`, `updatedAt`. New kinds are added there with their schema.
- **Storage.** Table `inventory_items`, unique on adapter, kind and external id. `observed_at` moves on every sync that still contains the item; `updated_at` moves only when its content changed.
- **Activity log.** A sync that added, updated or removed something writes one `inventory.sync` entry (risk `read`, actor the adapter) with counts only, never titles or data. A sync with no change writes nothing.

## Running actions (lite track, LT-13)

Write actions follow the one-door rule: the core never calls an adapter and adapters never talk to each other. The core keeps a queue; the adapter polls it with its own token.

1. The manifest declares each action (`name`, `permission`, `risk`). The core reads the risk **from the registered manifest**, so a caller cannot understate it (this closes the gap in [ADR-010](../adr/010-approval-policy-lite.md) item 5 for runs).
2. The owner calls `POST /actions/run` `{adapter, action, params, targetType?, targetId?, summary?}`. The core checks the action is declared, applies the tier table through the approvals service (`reversible` runs are `queued`; `destructive` and `privileged` become `awaiting_approval` with a pending approval) and stores the run. Only the owner can create runs; an adapter cannot queue work for another adapter. A marked LT-12 hook (`apps/api/src/actions/privacy-hook.ts`) runs before anything is queued.
3. The adapter calls `POST /adapters/actions/claim`. The core returns the oldest queued run for that adapter, once, as `running`, or `{run: null}`. A run is never handed out twice.
4. The adapter executes against its own tool and calls `POST /adapters/actions/:id/result` `{outcome: "success" | "failure", detail?}`. Only the claiming adapter can report, once.
5. The run row stores intent and outcome only (`detail` is a short text, no tool payloads or secrets).

Run states: `awaiting_approval` → `queued` → `running` → `succeeded` | `failed`; `cancelled` when the approval is denied or expires. Settling is lazy (on every list, get and claim): approved → queued, denied or expired → cancelled, a queued run not claimed within 1 h → `failed`, a running run with no result after 10 min → `failed` (never redelivered, since it may have half run).

Activity log, one entry each: `action.allow` or `approval.request` (request and decision), `approval.approve` / `approval.deny`, `action.queue` (actor `system`), `action.cancel`, `action.start` (actor the adapter), `action.result` (outcome `success` or `failure`). Every entry carries `runId` and `requestedAction` (`<adapter>.<action>`), never params.

| Endpoint | Auth |
| --- | --- |
| `POST /actions/run`, `GET /actions/runs?status=&adapter=`, `GET /actions/runs/:id` | Owner |
| `POST /adapters/actions/claim`, `POST /adapters/actions/:id/result` | Adapter service token |
| `PUT /adapters/:name/manifest` | Owner. Replaces a registered adapter's manifest and scopes, keeping its token (privileged, logged as `adapter.manifest.update`). Needed when an adapter gains actions |

The SDK wraps the adapter side: `adapter.onAction(name, handler)` before `start()`; it polls every 5 s (`actionPollMs`), runs the handler and reports. A thrown error becomes a `failure` with its message, so handlers must not put secrets in errors.

## Adapter SDK

`@facto/adapter-sdk` (`packages/adapter-sdk`) wraps registration, health reporting with exponential backoff and jitter (capped at about 60 s), and inventory sync, so adapters do not reimplement them. It stores the service token in a mode 0600 state file and stops itself on a 401. Usage and steps are in [the SDK runbook](../runbooks/adapter-sdk.md).

## Versioning

Manifests carry a version, and the core declares the contract versions it supports. An adapter built for an older contract keeps working until that version is retired.

## Rules for adapter authors

1. Never implement identity, secrets, placement, scheduling or audit; call the core.
2. Declare every action and its risk level. An undeclared action is rejected.
3. Never store credentials; request them at call time.
4. Keep tool-specific state in the tool.
