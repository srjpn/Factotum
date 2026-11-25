# ADR-006: Deploy engine

- Status: Proposed
- Needed by: Phase 2

## Context

Phase 2 needs to list, restart and deploy services on the home node. Tools such as Dokploy and Coolify already handle builds, deploys and rollbacks; the Docker API alone handles lifecycle but not builds.

## Options

1. **Docker API directly** (through a socket proxy) and Compose files. Smallest dependency, full control, but Factotum owns more deploy logic.
2. **Dokploy or Coolify behind an adapter.** Reuses a mature deploy pipeline, but adds a large dependency and its own UI and state.
3. **Hybrid.** Docker API for observe and lifecycle in Phase 2; add a deploy-engine adapter later if build pipelines become a need.

## Leaning

Option 3. It satisfies the Phase 2 gate (restart and deploy tracking) with the least code and keeps the door open for a richer engine behind the same adapter contract.

## Decision

To be made during Phase 2, after deciding whether Oru is deployed through Factotum (see [open questions](../open-questions.md)).

## Consequences

Deploy history is recorded by Factotum regardless of engine, so switching engines does not lose the activity trail.
