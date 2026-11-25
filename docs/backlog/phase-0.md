# Phase 0: Spike

Goal: prove that a node agent and the control plane can talk over the private network, and settle the two decisions everything depends on.

**Gate:** a laptop agent heartbeats to the home server over Tailscale, and the control plane flags it offline when heartbeats stop.

| ID | Task | Acceptance criteria |
| --- | --- | --- |
| P0-1 | Accept ADR-001 (node agent) and ADR-002 (adapter contract) | Both ADRs have status Accepted with the Decision and Consequences sections filled in |
| P0-2 | Repository skeleton | pnpm workspace with `apps/api`, `apps/node-agent`, `packages/contracts`; lint, typecheck and test commands documented in CLAUDE.md |
| P0-3 | Home server baseline | Linux machine running Docker and Tailscale, reachable from the laptop over the tailnet, with no ports exposed to the public internet |
| P0-4 | Control plane: Node model, enrolment and heartbeat endpoints | Postgres migration for Node; a one-time enrolment token can be exchanged for a per-node credential; heartbeat endpoint rejects unknown credentials |
| P0-5 | Node agent | Enrols with a token, then sends a heartbeat with CPU, memory and disk figures at a fixed interval; retries with backoff when the control plane is unreachable |
| P0-6 | Offline detection | A node whose heartbeats stop is marked offline within 2 minutes and back online when they resume |
| P0-7 | Manifest validation | `schemas/adapter-manifest.schema.json` is used by the API to validate a registration request; a manifest with an undeclared risk level is rejected |
| P0-8 | Gate test | A script run from the laptop proves the node appears, goes offline when the agent is stopped and returns when restarted; result is recorded in the phase notes |
