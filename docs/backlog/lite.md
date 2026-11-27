# Lite track: a lightweight Facto to try things out

Goal: a small, working Facto on one MacBook that shows node health, agent runs and tasks from Trello (personal) and Jira (freelance) in one dashboard with one activity log. It is a sandbox track for learning, not a replacement for the roadmap.

**Gate:** open the dashboard and see the MacBook's health, Pani's runs, and tasks from both Trello and Jira, with every adapter action in the activity log.

## How this track relates to the roadmap

- It reuses Phase 0 and Phase 1 tasks (the `P0-*` and `P1-*` IDs in the last column) in a smaller form, and pulls in one adapter per tool from later phases.
- It must follow every rule in CLAUDE.md. In particular: adapters are separate processes, they reach the core only through its API, every action declares a risk level and writes an activity-log entry, and privacy classes are part of the data model from the start.
- The roadmap rule "do not start a phase before the previous gate passes" applies to the roadmap phases. The lite track is a separate, smaller scope. Finishing it does not pass any roadmap gate, and the Phase 0 gate (heartbeat over Tailscale from a second machine) still has to pass on the real setup.
- Anything the lite track simplifies (datastore, single user, one node) must be recorded as a deliberate exception in an ADR, not changed silently.

## Chunks

Pick any chunk whose dependencies are done. Each chunk is small enough for one branch or commit series.

| ID | Chunk | Depends on | Acceptance criteria | Maps to |
| --- | --- | --- | --- | --- |
| LT-1 | Decisions | none | ADR-001 and ADR-002 Accepted. A lite-track ADR ([ADR-009](../adr/009-lite-track.md)) records the datastore (Postgres in Docker), where the control plane runs (the MacBook for now) and that this is single-owner. Open questions on the Pani interface and Pulse state are answered in `docs/open-questions.md`. **Status: done except for the owner's confirmation of ADR-009 and the Pulse question** | P0-1 |
| LT-2 | Repository skeleton | LT-1 | pnpm workspace with `apps/api`, `apps/node-agent`, `packages/contracts`; lint, typecheck and test commands listed in CLAUDE.md; a Docker Compose file starts the API and Postgres with settings only from environment variables, and images build for arm64 and amd64 | P0-2 |
| LT-3 | Core: nodes and activity log | LT-2 | Node model; one-time enrolment token exchanged for a per-node credential; heartbeat endpoint rejects unknown credentials; append-only activity log written by every mutation | P0-4, P1-4 |
| | | | **Status: done.** Heartbeats are telemetry and are not logged one by one; enrolment, token creation, revocation and denied enrolment are logged. Owner routes use an interim `FACTO_ADMIN_TOKEN` until LT-6 | |
| LT-4 | MacBook node agent | LT-3 | Agent enrols, then sends CPU, memory, disk, battery and Tailscale status on an interval; retries with backoff; a node with no heartbeat is shown offline within 2 minutes and online again when they resume. **Status: agent side built (enrol, metrics, heartbeat, backoff, tests against a mock server). Offline detection is API work; Tailscale status is collected and logged at debug level but has no heartbeat field yet. Verified against the real API on 2026-11-27 (see runbook)** | P0-5, P0-6, P1-6 |
| LT-5 | Adapter registration | LT-3 | API validates manifests against `schemas/adapter-manifest.schema.json`; an undeclared risk level is rejected; adapters get a scoped service token and report health | P0-7 |
| LT-6 | Dashboard shell | LT-3 | Next.js app with local login, overview page, nodes page and activity log page, reachable only over localhost or Tailscale | P1-2, P1-5 |
| LT-7 | Trello adapter (read-only) | LT-5 | Reports boards and cards as tasks with status, tagged `personal`; credentials are kept as secrets and never appear in logs | none |
| LT-8 | Jira adapter (read-only) | LT-5 | Reports issues from chosen projects as tasks with status, tagged `client data`; one filter per project; credentials kept as secrets | none |
| LT-9 | Tasks panel | LT-6, and LT-7 or LT-8 | One panel lists tasks from every task adapter with a source filter and privacy tag | none |
| LT-10 | Pani adapter (read-only) | LT-5 | Reports runs with ticket, status, outcome and duration, and links each run to a task. The interface used to read Pani is written down in the adapter docs | none |
| LT-11 | Policy tiers and approval | LT-5, LT-6 | Every action has a risk level; `privileged` and `destructive` actions wait for owner approval in the dashboard; the decision and the approver are in the activity log | P2 (action tiers) |
| LT-12 | Privacy class check | LT-9, LT-10 | A run for a `client data` task is refused if its target is outside the allowed list; the refusal is logged. No fallback crosses the boundary | ADR-007 (minimal) |
| LT-13 | Write actions | LT-11, and the matching read adapter | Pani start and stop, Trello card move, Jira transition, each as a reversible action through the policy path with an activity-log entry | none |
| LT-14 | Pulse stub | LT-5 | Pulse registers as an adapter and reports up or down, version and last activity. Depth is added when Pulse is ready | none |
| LT-15 | Docker adapter | LT-5 | Lists local containers with health and supports restart as a reversible action | P2 (Docker adapter) |
| LT-16 | Notifications | LT-3 | Events such as run finished, run failed, node offline and battery low are sent through ntfy | P4 (ntfy) |
| LT-17 | Extras | LT-5 | Any of: open PRs and CI state, AI usage and cost, Time Machine status, local dev servers. Each is its own adapter with its own acceptance criteria written when picked | none |
| LT-19 | Move to a smaller machine | LT-3, LT-6 | `docs/runbooks/move-control-plane.md` exists; following it moves the control plane, Postgres and dashboard to a second machine and the MacBook agent reports to the new URL with no code change | P1-10 |
| LT-18 | Gate test and notes | the chunks above that were built | A checklist or script proves the gate; the result is recorded in this file | P0-8 |

## Suggested order

1. LT-1, LT-2, LT-3.
2. LT-4 and LT-5 in either order. After them LT-6 can start in parallel.
3. LT-7, LT-8, LT-10, then LT-9 once a task adapter exists.
4. LT-11, LT-12, then LT-13.
5. LT-14 to LT-17 in any order.
6. LT-18 last.

The smallest useful slice is LT-1 to LT-4 and LT-6: a dashboard that shows your MacBook's health and an activity log.

## Open items

- Which source does Pani pull tickets from: Jira only, or Trello too?
- Does Jira need one filter per client project?
- Pani exposes its state through an HTTP API (answered 2026-11-27). The endpoints still need to be written down in LT-10.
- Is Pulse's state readable yet, or is it a stub only?
