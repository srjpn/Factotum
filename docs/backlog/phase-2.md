# Phase 2: Hosting (plus one AI provider)

Goal: manage selected home-hosted services from Factotum under policy and audit, and prove the adapter contract with the Docker adapter. One AI provider is pulled forward from Phase 3 to complete the MVP.

**Gate:** restart and deploy a staging app from Factotum; an unhealthy service alerts you.

| ID | Task | Acceptance criteria |
| --- | --- | --- |
| P2-1 | Accept ADR-005 (event bus) and ADR-006 (deploy engine) | Both ADRs Accepted |
| P2-2 | Adapter SDK | `packages/adapter-sdk` registers a manifest, sends heartbeats and exposes declared actions; the Docker adapter is built with it |
| P2-3 | Docker adapter, observe | Containers and images appear in the inventory with state and health; the Docker engine is reached only through a socket proxy |
| P2-4 | Docker adapter, control | Restart is a Reversible action; remove is Destructive; both are declared in the manifest and written to the activity log |
| P2-5 | Action tiers in policy | Destructive actions require typed confirmation in the dashboard; Privileged actions require re-authentication; automations and agents cannot bypass either |
| P2-6 | Service registry | Services can be registered with a name, node, health check and environment (staging or production) |
| P2-7 | Deploy tracking | A deploy to staging records version, time, caller and outcome and shows in the activity log |
| P2-8 | Health alerts | An unhealthy service raises an alert within 2 minutes through the notification channel (ntfy) |
| P2-9 | Services page | Dashboard lists services with status and offers restart, with a three-click limit for restart or deploy |
| P2-10 | One AI provider | The gateway adapter routes a test prompt to one provider; usage and cost are recorded per run |
| P2-11 | Gate test | Restart and deploy a staging app from Factotum, stop a service and receive an alert; results recorded |
