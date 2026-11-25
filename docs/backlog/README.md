# Backlog

Work is organised by roadmap phase. Phases 0 to 2 are broken down into tasks with acceptance criteria. Later phases are listed as epics and are broken down when the previous gate passes.

Each task has an ID (`P0-1`), a short description and acceptance criteria. A task is done when its criteria pass. A phase is done when its gate passes on the real setup.

| Phase | File | State |
| --- | --- | --- |
| 0. Spike | [phase-0.md](phase-0.md) | Ready |
| 1. Foundation | [phase-1.md](phase-1.md) | Ready |
| 2. Hosting (plus one AI provider) | [phase-2.md](phase-2.md) | Ready |
| 3 to 7 | Epics below | To be broken down |

## Later epics

**Phase 3. AI and agents**
- Ollama adapter: models per node, pull, health.
- LiteLLM adapter: providers, routing, usage and cost.
- Privacy classes on tasks and a hard-constraint placement rule (ADR-007).
- Task submission and run history; agent runtime adapter.
- Gate test: a private task never resolves to a cloud provider; the same task runs local and cloud.

**Phase 4. Orchestration**
- Event bus and typed events (ADR-005); jobs with retry.
- Notification routing through ntfy.
- n8n link and webhook triggers from Factotum events.
- Gate test: an unhealthy service restarts and notifies with no manual step.

**Phase 5. Home**
- Home Assistant adapter (observe, then control).
- Pulse adapter.
- Device inventory and device events into orchestration.
- Gate test: device state in the inventory; a home event starts an agent task.

**Phase 6. Distributed**
- Second node enrolment (cloud or laptop) and remote execution.
- Placement engine and cost view.
- Offline-node handling that respects privacy classes.
- Gate test: policy places a job on the cloud node; an offline node is handled safely.

**Phase 7. Ecosystem**
- Plugin installation and adapter marketplace format.
- Command centre on the same policy path.
- Gate test: a new adapter installs with no core change; a command passes through policy.
