# Factotum (call it Facto)

> **Own your stack, operate it as one.**

Factotum is a control plane for your own computing. It gives you one place to see, decide and act across the tools you already run (Docker, Ollama, LiteLLM, Home Assistant, Grafana, n8n, Tailscale) on your laptop, at home and in the cloud, without replacing any of them.

**Status:** specification v0.2, pre-implementation. The next step is Phase 0, a spike that proves the node agent and control-plane link. The project name is not final; see [docs/naming.md](docs/naming.md).

## What Factotum builds itself

Only five things, because nothing in the existing stack provides them:

1. **Inventory:** one graph of nodes, services, models and devices.
2. **Identity and access:** one login and permission model, reachable only over the private network.
3. **Policy:** declarative placement, privacy and cost rules.
4. **Activity log:** one audit trail of every action, whoever or whatever caused it.
5. **Orchestration:** events and jobs that connect one tool to another.

Everything else is an adapter over an existing tool.

## Read in this order

| Doc | What it answers |
| --- | --- |
| [docs/prd.md](docs/prd.md) | Vision, scope, build vs integrate, MVP, success criteria |
| [docs/roadmap.md](docs/roadmap.md) | Eight phases, each with a testable exit gate |
| [docs/architecture/overview.md](docs/architecture/overview.md) | Layers, integration tiers, data model |
| [docs/architecture/core-ownership.md](docs/architecture/core-ownership.md) | Which core component owns what |
| [docs/architecture/node-agent.md](docs/architecture/node-agent.md) | Node agent, placement, failure states |
| [docs/architecture/adapter-contract.md](docs/architecture/adapter-contract.md) | How an adapter registers and acts |
| [docs/architecture/security.md](docs/architecture/security.md) | Action tiers, baseline controls, rules for agents |
| [docs/adr/](docs/adr/README.md) | Decisions made and decisions still open |
| [docs/backlog/](docs/backlog/README.md) | Work items per phase with acceptance criteria |
| [docs/open-questions.md](docs/open-questions.md) | What still needs an owner's answer |
| [docs/changelog.md](docs/changelog.md) | What changed from v0.1 to v0.2, and why |

The original v0.1 specification is kept unchanged in [docs/original/](docs/original/product-spec-v0.1.md).

## Planned repository layout

The repository is docs-only today. Code is added phase by phase.

```
apps/api            NestJS control plane (modular monolith)
apps/web            Next.js dashboard
apps/node-agent     Agent that runs on every node
adapters/<tool>     One adapter per integrated tool, each a separate process
packages/contracts  Shared types and generated clients
packages/adapter-sdk  Helpers for writing adapters
schemas/            JSON Schemas (adapter manifest)
infra/              Docker Compose, Ansible, Traefik config
docs/               Everything above
```

## Working on this with AI agents

Read [CLAUDE.md](CLAUDE.md) first. It tells an agent which documents are authoritative, which rules are never to be broken, and how to pick up work from the backlog. [AGENTS.md](AGENTS.md) points other agents to the same file.
