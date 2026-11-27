# ADR-001: Node agent

- Status: Accepted
- Needed by: Phase 0

## Context

Node registration, remote execution, health and workload placement all depend on a component running on each node. Nodes include a sleeping laptop, an always-on home server and cloud VMs behind NAT. The agent is the first thing to build and the hardest to change later.

## Questions to settle

1. **Transport.** Pull-based long-poll or WebSocket from the agent to the control plane, or control plane pushes to the agent.
2. **Enrolment.** How a new node gets its first credential.
3. **Token model.** Lifetime, scope and revocation of the agent's credential.
4. **Allowed actions.** An allowlist of named actions, or general command execution.
5. **Language and packaging.** TypeScript on Node, or Go as a single static binary.

## Options and leaning

| Question | Leaning | Reason |
| --- | --- | --- |
| Transport | Pull-based, outbound-only, over Tailscale | No inbound ports; works for sleeping and NAT'd nodes |
| Enrolment | One-time token from the dashboard, exchanged for a per-node credential | Simple; revocable; Ansible can automate it |
| Token model | Per-node scoped credential, rotated, revocable by the owner | Limits blast radius of a stolen node |
| Allowed actions | Allowlist of named actions; arbitrary shell off by default and a Privileged tier if enabled | Keeps the most privileged component small |
| Language | TypeScript on Node for Phase 0 | Shares types with the control plane and matches existing skills; revisit Go if footprint or distribution becomes a problem |

## Decision

Accepted by the owner on 2026-11-27, as leaned.

1. **Transport:** pull-based and outbound-only over Tailscale. The agent opens every connection; the control plane never connects to a node.
2. **Enrolment:** a one-time token generated in the dashboard is exchanged for a per-node credential.
3. **Token model:** the per-node credential is scoped to that node, rotated, and revocable by the owner.
4. **Allowed actions:** an allowlist of named actions. Arbitrary shell is off by default and, if ever enabled, is a Privileged action.
5. **Language:** TypeScript on Node. Revisit Go if footprint or distribution becomes a problem.

## Consequences

- Nodes need no inbound ports, and sleeping or NAT'd nodes work, but commands reach a node only on its next poll, so action latency is bounded by the poll interval.
- A stolen node credential exposes only that node's scope, and the owner can revoke it from the dashboard.
- Every new node action is added to the allowlist with a risk level, which keeps the agent small but means new capabilities need a code change.
- The agent shares types with the control plane through `packages/contracts`.
- A Node runtime is required on each node until a single-binary build exists.
