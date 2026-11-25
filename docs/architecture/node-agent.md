# Node agent and hybrid placement

The node agent is the one component Factotum must write for every node. It is deliberately small: it reports what the node has and runs what the control plane allows. Design decisions are tracked in [ADR-001](../adr/001-node-agent.md).

## Node types

| Node | Examples | Responsibilities |
| --- | --- | --- |
| Personal | MacBook | Development, interactive work, temporary workloads |
| Home | Mini PC, home server, NAS, GPU workstation | Always-on services, local AI, background agents, databases, home integrations, storage |
| Cloud | VMs, containers, rented GPUs | Public apps, production workloads, high-performance inference |

## Agent design

- **Pull-based and outbound-only.** The agent connects to the control plane over the private network and asks for work. A laptop that sleeps or a cloud VM behind NAT needs no inbound ports.
- **Registers once, with a short-lived token.** Ansible or a one-line installer enrols the node; afterwards it holds its own scoped credential, which the owner can revoke.
- **Reports capabilities and health.** CPU, memory, disk, GPU if present, installed runtimes such as Docker and Ollama, and a heartbeat. Offline detection comes from missed heartbeats.
- **Runs an allowlist, not a shell.** Container operations, model pulls, backup runs and adapter-defined actions. Arbitrary command execution is off by default and, if enabled, is a separate Privileged policy tier.
- **Reports results back.** Every run returns status and logs and writes an entry to the activity log.

## How placement decides

Placement is a filter followed by a score, so privacy can never be traded away for cost.

1. **Hard constraints filter nodes out.** Privacy class (for example, private documents may only run on home or personal nodes), required capability such as GPU or a specific model, and node availability.
2. **Soft factors rank what remains.** Cost, latency, current load and the owner's stated preference.
3. **Manual override always wins,** except over a hard constraint. An override is recorded in the activity log.
4. **No automatic failover across a privacy boundary.** If the only eligible node is offline, the job waits or fails visibly.

| Workload | Default placement | Reason |
| --- | --- | --- |
| Public app in production | Cloud node | Availability and public reachability |
| Complex coding task | Cloud model | Capability |
| Routine summarisation | Local model | Cost, privacy |
| Private document processing | Local model, hard constraint | Data must not leave the home network |
| Model benchmarking | Home GPU or temporary cloud GPU | Needs hardware, tolerates delay |
| Background automation | Home node | Always on, no deadline |
| Interactive development | Personal node | Latency and direct access |

## Failure states

Four failures stay distinct because each needs a different response.

| Failure | Detected by | Typical response |
| --- | --- | --- |
| Node offline | Missed heartbeats | Mark unavailable, hold or re-place eligible jobs |
| Service unhealthy | Failed health check on a running node | Restart under policy, alert |
| Task failed | Job ran and returned an error | Retry with backoff, then surface the error |
| Provider unavailable | Cloud API or region down | Use another eligible placement, never across a privacy boundary |

Retries and alternative placements apply per failure type and always respect hard constraints.
