# Architecture decision records

An ADR records one significant decision: the context, the options, the choice and its consequences. Copy [000-template.md](000-template.md) to add one. Status is one of Proposed, Accepted, Superseded.

Rule for agents and contributors: an Accepted ADR overrides every other document. Do not change an Accepted decision without writing a new ADR that supersedes it.

| ADR | Decision | Status | Needed by |
| --- | --- | --- | --- |
| [001](001-node-agent.md) | Node agent: transport, enrolment, token model, allowed actions, language | Accepted | Phase 0 |
| [002](002-adapter-contract.md) | Adapter contract: manifest schema, registration, event format | Accepted | Phase 0 |
| [003](003-identity.md) | Identity: local login first, or an OIDC provider from day one | Proposed | Phase 1 |
| [004](004-secrets.md) | Secrets: SOPS with age, or a secrets server | Proposed | Phase 1 |
| [005](005-event-bus.md) | Event bus: Postgres with BullMQ first, and the trigger for Redis Streams | Proposed | Phase 2 |
| [006](006-deploy-engine.md) | Deploy engine: Docker API directly, or Dokploy or Coolify behind an adapter | Proposed | Phase 2 |
| [007](007-policy-language.md) | Policy language: how placement and privacy rules are written and tested | Proposed | Phase 3 |
| [008](008-project-name.md) | Project name: Factotum, called Facto | Accepted | Phase 0 |
| [009](009-lite-track.md) | Lite track: scope, datastore, where it runs, single owner | Proposed | Lite track |
