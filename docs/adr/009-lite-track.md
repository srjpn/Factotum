# ADR-009: Lite track

- Status: Proposed
- Needed by: Lite track (see [../backlog/lite.md](../backlog/lite.md))

## Context

The owner wants a small working Facto on one MacBook to try ideas before the full roadmap, with Trello (personal tasks), Jira (freelance tasks), the Pani agent and node metrics in one dashboard.

## Decision

1. **Scope:** a separate sandbox track. It reuses Phase 0 and Phase 1 tasks in a smaller form and does not pass any roadmap gate.
2. **Datastore:** PostgreSQL in Docker, as in the planned stack. No exception to the stack is needed and no migration is needed later. Decided by the owner on 2026-11-27.
3. **Where it runs:** the control plane and the node agent run on the owner's MacBook. A second always-on machine is not required for the lite track.
4. **Users:** single owner. A second household member is out of scope (see open questions).
5. **Adapters:** Trello, Jira, Pani, then Pulse and Docker, all out-of-process under ADR-002. Task adapters start read-only. Pani exposes run state through an HTTP API.
6. **Privacy:** every task and run carries a privacy label from the start. Jira issues are `client data` and Trello cards are `personal`.

## Consequences

- A sleeping laptop makes the offline-detection test less meaningful until an always-on node exists. The Phase 0 gate still has to pass on the real setup.
- Docker Desktop must be running for the control plane to start.
- The control plane on the same machine as the node means "Facto is down, everything keeps running" is only partly testable.
- Items 3 and 4 are assumptions the owner has not yet confirmed explicitly, which is why this ADR stays Proposed.
