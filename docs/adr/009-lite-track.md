# ADR-009: Lite track

- Status: Proposed
- Needed by: Lite track (see [../backlog/lite.md](../backlog/lite.md))

## Context

The owner wants a small working Facto on one MacBook to try ideas before the full roadmap, with Trello (personal tasks), Jira (freelance tasks), the Pani agent and node metrics in one dashboard.

## Decision

1. **Scope:** a separate sandbox track. It reuses Phase 0 and Phase 1 tasks in a smaller form and does not pass any roadmap gate.
2. **Datastore:** PostgreSQL in Docker, as in the planned stack. No exception to the stack is needed and no migration is needed later. Decided by the owner on 2026-11-27.
3. **Where it runs:** the control plane, Postgres and dashboard run on the owner's MacBook for now, and the node agent runs there too. The control plane must be movable to a smaller always-on machine later with configuration changes only:
   - The agent and adapters reach the control plane through a configured base URL, even when it is on the same machine. No code assumes `localhost`.
   - The control plane, Postgres and dashboard ship as one Docker Compose setup with all settings in environment variables or a config file. Nothing is stored on the host outside Docker volumes.
   - The images must build for both arm64 and amd64.
   - Moving is documented as a runbook (backup Postgres, restore on the new machine, point agents at the new URL, re-enrol or re-issue credentials).
4. **Users:** single owner. A second household member is out of scope (see open questions).
5. **Adapters:** Trello, Jira, Pani, then Pulse and Docker, all out-of-process under ADR-002. Task adapters start read-only. Pani exposes run state through an HTTP API.
6. **Privacy:** every task and run carries a privacy label from the start. Jira issues are `client data` and Trello cards are `personal`.

## Consequences

- A sleeping laptop makes the offline-detection test less meaningful until an always-on node exists. The Phase 0 gate still has to pass on the real setup.
- Docker Desktop must be running for the control plane to start.
- Portability adds a small cost now (configurable URLs, Compose, multi-arch images) and removes a rewrite later.
- The control plane on the same machine as the node means "Facto is down, everything keeps running" is only partly testable.
- Items 3 and 4 are assumptions the owner has not yet confirmed explicitly, which is why this ADR stays Proposed.
