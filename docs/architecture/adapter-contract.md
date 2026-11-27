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

- The request body of `register` is the manifest. The API validates it against `schemas/adapter-manifest.schema.json`; an undeclared risk level, a missing risk level or a missing required field returns 400 with the list of errors. A duplicate name returns 409.
- The response carries a service token (`facto_adp_...`) **once**. Only its SHA-256 hash is stored, and it is never logged. The token is scoped to the adapter: one scope per declared action permission, plus `adapter.health.report`. It authenticates only that adapter's own calls.
- `POST /adapters/health` takes `{ "status": "up" | "degraded" | "down", "detail"?: string }`. Heartbeats are not written to the activity log (high frequency, no state change in intent); registration, token issue and rejected registrations are, with a declared risk level.
- Registration writes the adapter row and both activity entries in one transaction.
- Not yet built: token rotation, re-registration of an existing name, marking an adapter unavailable after missed heartbeats, and per-action scope enforcement (arrives with the action path in LT-11).

## Versioning

Manifests carry a version, and the core declares the contract versions it supports. An adapter built for an older contract keeps working until that version is retired.

## Rules for adapter authors

1. Never implement identity, secrets, placement, scheduling or audit; call the core.
2. Declare every action and its risk level. An undeclared action is rejected.
3. Never store credentials; request them at call time.
4. Keep tool-specific state in the tool.
