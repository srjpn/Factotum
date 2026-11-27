# Runbook: lite-track gate (LT-18)

The gate ([lite.md](../backlog/lite.md)): open the dashboard and see the MacBook's health, Pani's runs, and tasks from both Trello and Jira, with every adapter action in the activity log. This is the automated part plus a manual checklist for what a script cannot see. It does **not** pass the roadmap Phase 0 gate (heartbeat over Tailscale from a second machine).

## 1. Run the script

From the repo root, with the stack running:

```bash
set -a && . ./.env && set +a
./scripts/lite-gate.sh
```

Reads `FACTO_API_URL` (default `http://127.0.0.1:3000`), `FACTO_ADMIN_TOKEN` (required, never printed) and `FACTO_DASHBOARD_URL` (default `http://127.0.0.1:3001`). It prints `PASS`, `FAIL` or `SKIP` per check with a reason, and exits non-zero on any FAIL. It needs `curl` and `python3`.

Default mode only sends GET requests and unauthenticated 401 probes (plus PUT/PATCH/DELETE on `/activity`, which must return 404 or 405). To also check the privacy refusal and the policy tiers, run:

```bash
GATE_WRITE=1 ./scripts/lite-gate.sh
```

That section only appends activity-log entries: one refused `client-data` privacy check, one allowed `personal` check, one `read` and one `destructive` action request (the destructive one is denied again at once, leaving a denied approval). It touches no external system.

Expected SKIPs: no Trello tasks until the owner runs the live check; LT-19 portability when its runbook is not on the branch; the write section when `GATE_WRITE` is unset. Each adapter you do not run shows as a FAIL on `inventory-<kind>`; that is the point.

## 2. Manual checklist

Tick each on the real setup and record the result in the "LT-18 gate result" section of `docs/backlog/lite.md`.

- [ ] Log in to the dashboard (`http://localhost:3001`) with the owner password. A wrong password is refused.
- [ ] Overview shows the MacBook with CPU, memory, disk and battery, status online.
- [ ] Stop the node agent, wait under 2 minutes: the node shows offline and `node.offline` is in the Activity page. Start it: online again, `node.online` logged. (Destructive to the agent only; do it knowingly.)
- [ ] Tasks page lists Jira tasks tagged client-data and Trello tasks tagged personal; the source filter works.
- [ ] Pani runs appear with status and duration (Overview or the runs view).
- [ ] Approvals page: a pending destructive request can be approved and denied, and the approver is in the Activity page.
- [ ] Activity page shows adapter actions (inventory sync, register, action start and result) with a risk level each.
- [ ] Trello live check from [trello-adapter.md](trello-adapter.md): records the result in lite.md.
- [ ] If configured: ntfy push arrives when the node goes offline ([notifications.md](notifications.md)).
- [ ] Portability: follow `move-control-plane.md` (LT-19) once it is merged.
- [ ] Phase 0 gate on the real setup: the agent on a second machine heartbeats over Tailscale. Not part of the lite gate.
- [ ] The owner has accepted ADR-009, ADR-010 and the other Proposed ADRs.

## 3. Recording

Paste the result table (date, counts, check names with PASS/FAIL/SKIP, no titles or client content) into lite.md. Number every FAIL you cannot fix as an open issue.
