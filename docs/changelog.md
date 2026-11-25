# Changelog

## v0.3

Renamed the project from Nexus to Factotum, with the calling name Facto. See [ADR-008](adr/008-project-name.md). No change to scope or architecture.

## v0.2

v0.2 turns Nexus from a platform that hosts eight verticals into a thin control plane that adapts to existing tools, and closes the gaps found in review of v0.1.

| Topic | v0.1 | v0.2 |
| --- | --- | --- |
| Positioning | Platform with eight verticals | Control plane: five native capabilities plus adapters |
| Verticals | Built natively | Domains, each backed by an existing tool through an adapter |
| Ownership | Identity, secrets and resources appeared in both core and verticals | Core owns primitives; domains only consume them |
| Workflows | n8n, BullMQ and an Automation vertical overlapped | BullMQ runs Nexus's own jobs; n8n is an optional adapter for user workflows |
| Node agent | Not specified | Pull-based agent over the private network, designed first |
| Plugin contract | Manifest, but in-process NestJS implied | Out-of-process adapters registered by manifest |
| Events | Redis Streams plus BullMQ from the start | Postgres plus BullMQ first; Streams when a second consumer needs it |
| AI actions | Confirmation for destructive operations | Policy layer with action tiers, applied to humans, automations and agents alike |
| Roadmap | Verticals 05, 06 and 07 unscheduled | Thin slices with testable gates; backups in Phase 1 |
| Success criteria | Qualitative | Measurable, per phase |

## v0.1

Initial product definition. Archived in [original/product-spec-v0.1.md](original/product-spec-v0.1.md).
