# ADR-001: Node agent

- Status: Proposed
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

To be made at the start of Phase 0.

## Consequences

To be filled in when accepted.
