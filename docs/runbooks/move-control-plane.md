# Runbook: move the control plane to another machine

Moves the API, Postgres and dashboard from one machine (today the MacBook, Compose project `factotum-lite`) to another (a smaller always-on box) by configuration only, as [ADR-009](../adr/009-lite-track.md) requires. No code change. The node agent and the host-process adapters stay where they are and only get a new `FACTO_API_URL`.

Read it through once before starting. Plan for about 15 minutes of downtime.

## What moves and what does not

| Item | Moves? | How |
| --- | --- | --- |
| Postgres data (nodes, adapters, inventory, approvals, action runs, activity log) | yes | `pg_dump` on the old machine, `psql` restore on the new one |
| `.env` (Postgres, owner token, dashboard password, session secret, ntfy, privacy lists) | yes | copy the file over a private channel, or write a new one |
| `FACTO_ADMIN_TOKEN` | carry over or regenerate | Only the dashboard server and your `curl` calls use it. Nodes and adapters do **not** use it after registration, so regenerating is safe |
| `FACTO_DASHBOARD_PASSWORD`, `FACTO_SESSION_SECRET` | carry over or regenerate | A new session secret only logs the browser out |
| Node credential (agent state file) | no, stays on the node | Stored hashed in `nodes.credential_hash`, so it survives the restore |
| Adapter service tokens (adapter state files) | no, stay with each adapter | Stored as SHA-256 in `adapters.token_hash`, so they survive the restore |
| Node agent, Trello, Jira, Pani, Docker adapters | no | Keep running on their machine; change `FACTO_API_URL` and restart |
| Pani, Jira and Trello secrets (adapter env) | no | They live in the adapters' own environment, not in the database |

Credentials need no re-enrolment. Verified on 2026-11-27 (see "What was proved" at the end).

## Before you start

On the **new** machine:

1. Install Docker (Compose v2) and Tailscale; join the same tailnet. Note its Tailscale IP: `tailscale ip -4`.
2. Clone the repository at the same commit as the old machine (`git rev-parse HEAD` on both).
3. Make sure the machine's CPU architecture builds the images. Both `linux/arm64` and `linux/amd64` are supported; `docker compose up --build` on the new machine builds natively. To check or to publish multi-arch images from another machine:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -f apps/api/Dockerfile .
```

```bash
docker buildx build --platform linux/amd64,linux/arm64 -f apps/dashboard/Dockerfile .
```

4. Postgres must be the same major version or newer (the image is pinned to `postgres:17-alpine` in `docker-compose.yml`).

Keep the old stack untouched until the verification at the end passes.

## 1. Prepare `.env` on the new machine

```bash
cp .env.example .env && chmod 600 .env
```

Fill in `POSTGRES_PASSWORD`, `FACTO_ADMIN_TOKEN`, `FACTO_DASHBOARD_PASSWORD`, `FACTO_SESSION_SECRET` (generate with `openssl rand -hex 24`; use 32+ hex characters for the session secret), and copy over any `FACTO_NTFY_*` and `FACTO_PRIVACY_*` values from the old `.env`. `POSTGRES_PASSWORD` need not match the old one: the dump carries no roles or passwords.

Binding and exposure:

- `FACTO_BIND_ADDR=<tailscale ip of the new machine>` so the API (port `FACTO_HOST_PORT`, 3000) and dashboard (`FACTO_DASHBOARD_PORT`, 3001) are reachable from the tailnet only. The default `127.0.0.1` is reachable from that machine alone.
- Never `0.0.0.0`, never a router port forward, never a public IP (design rule 9). Check with `docker compose ps`: every published port must show your Tailscale IP or `127.0.0.1`.
- Reaching the dashboard over `http://<tailscale ip>:3001` needs `FACTO_COOKIE_SECURE=false` (the cookie is otherwise `Secure` and the browser drops it on plain http). Do it only on a private network.
- Do not start the stack yet.

## 2. Cut over

Downtime starts at step 2a. Adapters and agents retry, so brief gaps are tolerated; nothing the control plane manages stops (control plane, not data plane).

**a. Stop the writers on the old machine** (stop, never `down -v`; never remove the volume):

```bash
docker compose stop api dashboard
```

**b. Dump the database** on the old machine (use the project name the old stack runs under, `factotum-lite` here). The dump holds the whole activity log and inventory, including client task titles: treat it as sensitive, keep it out of the repository and delete it at the end.

```bash
umask 077 && docker compose -p factotum-lite exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' > facto.sql
```

**c. Copy `facto.sql` to the new machine** over Tailscale (`scp`, `tailscale file cp`), not through a public service.

**d. Start only Postgres on the new machine**, then restore into the empty database. The API applies migrations when it starts, so it must not run before the restore or the restore hits existing tables.

```bash
docker compose up -d db
```

```bash
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < facto.sql
```

Sequences (activity log ids) come across with the dump, so new log entries continue the old numbering.

**e. Start the API and dashboard:**

```bash
docker compose up -d --build api dashboard
```

The API sees the migrations already applied (`schema_migrations` is in the dump) and starts. Check `curl -s http://<bind addr>:3000/nodes -H "authorization: Bearer $FACTO_ADMIN_TOKEN"`.

**f. Repoint each agent and adapter** (on the MacBook, or wherever they run): set `FACTO_API_URL=http://<new tailscale name or ip>:3000` and restart the process. Nothing else changes: the state files hold the credentials. The agent logs a warning that the stored credential "was issued for" the old URL and uses it anyway; that is expected. The adapters take the same variable (see the adapter runbooks). If you launch them with a wrapper script or launchd plist, edit the URL there.

```bash
FACTO_API_URL=http://<new-host>:3000 node apps/node-agent/dist/main.js
```

Downtime ends when the first heartbeat arrives. Nodes show `offline` until then (up to 90 seconds). If ntfy is on, expect `node.offline` and `node.online` pushes during the move.

## 3. Verify

1. **Nodes online:** `GET /nodes` (or the dashboard Nodes page) shows each node `online` with a fresh `lastHeartbeatAt` within a minute of the repoint.
2. **Adapters up:** `GET /adapters` shows each adapter `up` with a recent `lastSeenAt`; the dashboard Tasks page fills after the next sync.
3. **Activity log continuity:** `GET /activity` shows the old entries unchanged and, after them, new entries with the next ids. Compare the old newest id with the first new one.
4. **Row counts:** same counts on both sides for `nodes`, `adapters`, `activity_log`, `inventory_items`:

```bash
docker compose exec -T db sh -c 'psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from activity_log"'
```

5. **Dashboard:** log in at `http://<new-host>:3001`.
6. **Exposure:** from a machine **not** on the tailnet the ports must not answer.
7. Pending approvals and queued write actions moved with the data. Anything claimed by an adapter just before the cut may show as started with no result; check `GET /actions/runs`.

## 4. Roll back

Until you delete anything, the old stack still has all its data.

1. On the new machine: `docker compose stop api dashboard` (so no agent can write there).
2. Repoint the agents and adapters back to the old URL and restart them.
3. On the old machine: `docker compose start api dashboard`.

Anything written on the new machine (heartbeats, sync entries, decisions) is not on the old one. Heartbeats and syncs repair themselves; an approval decided on the new machine does not, so re-decide it. To keep that data instead, dump the new database and restore it into an empty old database the same way, then start the old API.

Retire the old stack only after a few days of clean running: `docker compose stop`, keep the volume. Removing the old volume is irreversible and is the owner's decision.

## 5. Clean up

Delete `facto.sql` from both machines, and any copy of the old `.env` you no longer need. If you regenerated `FACTO_ADMIN_TOKEN`, update any shell profile or script that uses it for `curl` or adapter registration.

## What was proved (2026-11-27, LT-19)

A second machine and Tailscale were not available. The move was rehearsed on one MacBook with a second Compose project (`factotum-move-test`, ports 3100 and 3101, fresh secrets, the live stack on 3000 and 3001 untouched):

- Dumped the live database through `pg_dump` (read-only), restored into the test project's empty Postgres before the API started, then started the API and dashboard with `--build`. Row counts matched on `nodes`, `adapters`, `activity_log` and `inventory_items`; migrations were not re-applied.
- The test project used a **different** `FACTO_ADMIN_TOKEN` and Postgres password from the live stack. The real node credential and the real Jira, Pani and Docker adapter service tokens still authenticated against the copy (HTTP 400 for a deliberately invalid body, which the API returns only after authentication; a bogus credential got 401). So node and adapter credentials survive a restore and do not depend on the owner token.
- The real node agent, started with `FACTO_API_URL` pointing at the copy and a copy of its state file, sent heartbeats and the copy listed the node `online`. No code change; only the URL.
- The dashboard on the copy served `/login` (200).
- Multi-arch image builds: see the result in `docs/backlog/lite.md` (LT-19 note).

Not proved: a physically separate machine, Tailscale reachability and `FACTO_BIND_ADDR` set to a Tailscale IP, the adapters (Jira, Pani, Docker) actually running against the new URL, and a real sleeping or rebooting target.
