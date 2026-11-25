# Factotum: Product Requirements (v0.2)

Status: specification, pre-implementation. Name: Factotum, called Facto (see [ADR-008](adr/008-project-name.md) and [naming.md](naming.md)).

## 1. Core vision

Factotum is the control plane for your own computing: one place to see, decide and act across the tools you already run, on your laptop, at home and in the cloud, without giving up any of them.

**North star.** *Own your stack, operate it as one.* Factotum does not replace Home Assistant, Docker, Ollama, Grafana or n8n. It connects them under a single inventory, a single identity, a single set of placement and privacy rules, and a single activity trail.

**The problem.** A capable personal setup is a pile of excellent but separate tools. Each has its own login, dashboard, alerting and notion of "a machine". Nothing answers questions that cross them: where should this job run, what did it cost, what changed last night, and who or what did it?

**What Factotum adds.** Five things no single tool in the stack provides, and the only things Factotum builds itself:

1. **Unified inventory.** One graph of nodes, services, models, devices and the links between them.
2. **Unified identity and access.** One login and one permission model in front of every integrated tool, reachable only over the private network.
3. **Policy-based placement.** Declarative rules (privacy, cost, latency, availability) decide where a workload or an AI request runs.
4. **Unified activity and audit.** One timeline of what happened across all tools, whether a person, an automation or an agent caused it.
5. **Cross-tool orchestration.** Events from one tool trigger actions in another.

### Design tenets

- **Integrate first, build last.** If a good open-source tool exists, Factotum adapts to it. Native features are allowed only for the five things above.
- **Control plane, never data plane.** Factotum issues commands and reads state. It is not in the request path of your apps, models or automations. If Factotum is down, everything it manages keeps running.
- **Local-first, cloud-optional.** Core infrastructure works with no internet. Cloud nodes and cloud AI are placements, not dependencies.
- **Policy over hard-coding.** Where things run is decided by rules you can read and override. Privacy rules can never be bypassed by failover.
- **Every action is attributable.** Humans, automations and AI agents act through the same authorised, audited path.
- **Thin slices that are useful on day one.** Each phase ends with something you use daily.

### What Factotum is not

Not an operating system, a cloud provider, a Kubernetes replacement, a Home Assistant replacement or an AI model company. Not a multi-tenant product: v1 serves one owner and, later, a small household.

## 2. Objectives and non-objectives

Objectives:

1. One management interface for personal computing infrastructure across local and cloud nodes.
2. A unified AI gateway with privacy-aware routing and cost tracking.
3. One inventory and one activity trail over hosted apps, models, devices and automations.
4. Automation across tools through events and jobs.
5. Safe execution: every action is authorised, audited and tiered by risk.
6. Backups and recovery that are tested, not assumed.
7. Extensibility through adapters, so new capabilities need no core changes.

Non-objectives: replacing underlying operating systems, building a workflow editor, building a metrics stack, training models, enterprise orchestration, commercial multi-tenant SaaS.

## 3. Build vs integrate

Defaults below are starting choices; each is replaceable behind its adapter. Tiers are defined in [architecture/overview.md](architecture/overview.md).

| Capability | Default tool | Tier | What Factotum adds on top |
| --- | --- | --- | --- |
| Containers and deploys | Docker, Compose | 3 Control | Inventory entry, deploy history, health into the activity log |
| Ingress and TLS | Traefik | 3 Control | Service-exposure policy: nothing goes public unless a rule says so |
| Local models | Ollama | 3 Control | Model inventory per node, benchmark runs, availability |
| AI gateway and routing | LiteLLM | 3 Control | Privacy-aware routing rules; usage and cost in the activity log |
| Agent runtimes | OpenHands, Claude Agent SDK | 3 Control | Task submission, placement, run history, cost |
| Home automation | Home Assistant, Pulse | 2 Observe, then 3 | Device events feed orchestration; one device inventory |
| Metrics, logs, dashboards | Prometheus, Loki, Grafana | 1 Link, 2 Observe | Single health summary on the overview; deep dives open Grafana |
| User workflows | n8n | 1 Link, plus triggers | Factotum events call n8n webhooks; no workflow editor is built |
| Databases | PostgreSQL, Redis | 3 Control | Provisioning, connection secrets, backup schedule |
| Backups | restic, pg_dump | 3 Control | Schedules, restore tests, off-site rule, failure alerts |
| Private network | Tailscale | 2 Observe | Node registration tied to tailnet devices; access rules from policy |
| Notifications | ntfy | 3 Control | Routing by severity; one channel for all sources |
| Node bootstrap | Ansible | 1 Link | Generates the command that installs the node agent |
| Identity | OIDC provider (Authentik or Authelia) | 2 Observe | Roles and permissions model; SSO into linked tools |
| Secrets | SOPS with age first | 3 Control | Scoped secret delivery to adapters and workloads |
| Internal jobs | BullMQ (library) | n/a | Scheduling and retries for Factotum's own work |

**Decision rule.** Before any native feature is proposed, write down which existing tool was evaluated and why it cannot do the job. If an adapter would be thinner than the feature, build the adapter.

## 4. User experience

A responsive web dashboard is the primary interface, reachable only over the private network.

- **Overview:** overall health, nodes, running services, active agents, pending jobs, CPU/memory/disk/GPU utilisation, recent activity, alerts.
- **Domain workspaces:** each domain (hosting, AI, home, monitoring, data) gets a tile and an overview page supplied by its adapter. Deep management of a tool opens the tool's own UI through single sign-on (tier 1).
- **Resource centre:** all nodes, their hardware, services, model endpoints, storage and cloud usage in one view.
- **Activity centre:** a chronological, filterable record of every action and event, with who or what caused it.
- **Command centre (Phase 7):** natural-language commands that run through the same authorisation, policy and audit path as the dashboard. Destructive actions always need explicit approval by a person.

## 5. MVP

The MVP is Phases 0 to 2 plus one AI provider pulled forward from Phase 3. It runs on one home node and proves the three riskiest ideas: the node agent, the adapter contract and the policy layer.

1. One Linux home node running Docker, reachable only over Tailscale.
2. Control plane API with authentication and roles (owner, member, viewer).
3. Responsive web dashboard: overview, nodes, services, activity.
4. Node agent with one-line enrolment and heartbeat-based status.
5. CPU, memory and disk monitoring per node.
6. Docker adapter and service registry: list, restart, deploy tracking, health.
7. Activity log recording every action and its caller.
8. Action tiers with typed confirmation for destructive actions.
9. Nightly backups of Postgres and Factotum configuration, with a scheduled restore test.
10. One AI provider through the gateway adapter, with usage and cost recorded.

Out of the MVP: multiple nodes, GPUs, agent orchestration, workload placement beyond manual choice, Home Assistant and Pulse integration, n8n, the command centre, a plugin marketplace and Kubernetes.

## 6. Success criteria

Factotum is judged on whether it is used daily, not on feature count. Targets are proposals to be confirmed in the Phase 1 backlog.

| Outcome | How it is measured | Phase |
| --- | --- | --- |
| Reach it from anywhere, privately | Dashboard opens from a phone on mobile data via Tailscale; a port scan of the home network finds no Factotum ports open | 1 |
| See every node | A new node appears within 1 minute of install; an offline node is flagged within 2 minutes | 1 |
| Recover from loss | A clean home node is restored from backup using the runbook in under 2 hours | 1 |
| Manage apps in one place | Restart or deploy a registered service in three clicks or fewer, with an activity entry | 2 |
| Run AI locally or in the cloud | The same task runs on either; latency and cost are recorded per run | 3 |
| Keep private data private | An automated test proves a private-class task never reaches a cloud provider | 3 |
| Automate without effort | One recurring job and one event-driven flow run unattended for a week | 4 |
| Extend without rewrites | A new adapter ships with zero changes to core code | 7 |
| Survive an internet outage | With the uplink cut, the dashboard, local models and backups keep working | 3 |

## 7. Glossary

| Term | Meaning |
| --- | --- |
| Control plane | The backend and dashboard that hold intent, policy and audit |
| Node | A machine that runs the node agent |
| Adapter | A separate process that connects the control plane to one existing tool |
| Domain | A capability area such as hosting or AI, backed by one or more adapters |
| Principal | Anyone or anything that can act: a person, an automation or an agent |
| Privacy class | A label on data or tasks that limits where they may run |
| Gate | The testable condition that ends a roadmap phase |

## 8. Documentation set

This PRD, the architecture documents, the ADRs, one specification and backlog per domain as domains are built, the adapter contract, the security guide and runbooks. Write each runbook the first time an operation is performed by hand.
