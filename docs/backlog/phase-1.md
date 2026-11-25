# Phase 1: Foundation

Goal: a usable, private, backed-up control plane with a dashboard, login, node status and an activity log.

**Gate:** log in from a phone on mobile data via Tailscale and see node health; a backup restore test passes.

| ID | Task | Acceptance criteria |
| --- | --- | --- |
| P1-1 | Accept ADR-003 (identity) and ADR-004 (secrets) | Both ADRs Accepted |
| P1-2 | Identity | Login with roles owner, member and viewer; API rejects unauthenticated and unauthorised calls; service principals exist for adapters and agents |
| P1-3 | Secrets | Secrets are stored with the chosen mechanism, never appear in config files or logs, and are delivered to a test adapter at call time |
| P1-4 | Activity log | Append-only table; every API mutation writes who, what, where, when and outcome; entries cannot be edited or deleted through the API |
| P1-5 | Dashboard shell | Responsive Next.js app with login, overview, nodes and activity pages |
| P1-6 | Node status and metrics | Nodes page shows status, last heartbeat, CPU, memory and disk per node; a new node appears within 1 minute of install |
| P1-7 | Node install command | The dashboard generates a one-line command (or Ansible task) that installs and enrols the agent |
| P1-8 | Private access only | Dashboard and API are reachable only over Tailscale; a port scan of the home network finds no Factotum ports open |
| P1-9 | Backups | Nightly backup of Postgres and Factotum configuration with an off-site copy; a scheduled restore test runs and reports failure as an alert |
| P1-10 | Restore runbook | `docs/runbooks/restore-home-node.md` exists and a clean home node is restored from backup in under 2 hours |
| P1-11 | Gate test | Phone on mobile data opens the dashboard and shows node health; restore test passes; results recorded |
