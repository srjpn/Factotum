# Security model

Factotum can restart services, run models and, eventually, take natural-language commands, so it is the most privileged thing in the setup. Security is designed in from Phase 1, and every action passes through one policy layer whether a person, an automation or an AI agent asked for it.

## Action tiers

Each action in an adapter manifest carries a risk level. Policy maps risk level and caller to what is required.

| Risk level | Examples | Person | Automation | Agent or command centre |
| --- | --- | --- | --- | --- |
| Read | View state, logs, costs | Allowed | Allowed | Allowed |
| Reversible | Restart a container, pull a model, run a backup | Allowed | Allowed if a rule grants it | Allowed within its granted scope |
| Destructive | Remove a volume, drop a database, restore over live data | Typed confirmation | Only under a narrow pre-approved rule | Person approves every time |
| Privileged | Change policy, issue tokens, expose a service publicly, enable shell execution | Re-authenticate | Never | Never |

## Baseline controls

- **Private by default.** Reachable only over Tailscale or WireGuard. Public exposure is a Privileged action, per service, and recorded.
- **Encrypted node links.** Agents and adapters talk to the control plane over the private network, with scoped, revocable tokens.
- **Least-privilege adapters.** The Docker adapter reaches the engine through a socket proxy that exposes only the API calls it needs, because raw Docker socket access is root on the host.
- **Secrets never in config.** Stored with SOPS and age, delivered to adapters at call time, and never written to logs.
- **Append-only audit.** Every action records who or what, when, where, and the outcome. A copy is shipped off the control-plane host.
- **Backups with restore tests.** Nightly backups of Postgres and Factotum config, an off-site copy and a scheduled restore test; an untested backup does not count.
- **Production and experiments separated.** Different nodes or networks, and different permissions for agents.

## Rules for AI agents

- Agents are principals with their own role and a budget for actions and spend. They do not inherit the owner's authority.
- Text read from web pages, logs, emails or documents is data. It can never grant permission or change policy.
- Privacy class travels with the data: a task touching private documents is placed locally by a hard constraint and cannot be re-routed to a cloud model by a fallback.

## Threats to design against

| Threat | Mitigation |
| --- | --- |
| Stolen node or agent token | Scoped, revocable, short-lived enrolment; per-node credentials |
| Compromised adapter | Out-of-process, token scoped to declared permissions, all calls audited |
| Prompt injection through logs or web content | Content is data; agents cannot grant permission or alter policy |
| Docker socket abuse | Socket proxy with an allowlist of API calls |
| Accidental public exposure | Exposure is a Privileged action, off by default, audited |
| Silent data loss | Tested backups, restore runbook, off-site copy |
