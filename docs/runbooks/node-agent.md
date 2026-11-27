# Runbook: run the node agent on a MacBook

The agent (`apps/node-agent`) enrols once with a one-time token, then sends a heartbeat on an interval. It is outbound-only and has no default control plane address ([ADR-001](../adr/001-node-agent.md), [ADR-009](../adr/009-lite-track.md)).

## Settings (environment only)

| Variable | Meaning | Default |
| --- | --- | --- |
| `FACTO_API_URL` | Base URL of the control plane, for example `http://macbook.tailnet:3000` | required |
| `FACTO_ENROLMENT_TOKEN` | One-time token, needed only on first run | none |
| `FACTO_AGENT_STATE_FILE` | Where the node credential is stored (mode 0600) | `~/.config/facto/agent.json` |
| `FACTO_HEARTBEAT_INTERVAL_SECONDS` | Heartbeat interval | `30` |
| `FACTO_LOG_LEVEL` | `debug` also logs Tailscale status | info |

## First run

1. Create an enrolment token for the node through the API (`POST /nodes/enrolment-tokens`, LT-3).
2. Build and start:

```bash
pnpm install && pnpm --filter @facto/node-agent build
```

```bash
FACTO_API_URL=http://<control-plane-host>:3000 FACTO_ENROLMENT_TOKEN=<token> node apps/node-agent/dist/main.js
```

3. The credential is saved to the state file. Later runs need only `FACTO_API_URL`; the token is no longer needed and can be dropped.

## Behaviour

- Unreachable control plane or a 5xx: retries with exponential backoff and jitter, capped near 60 seconds, then returns to the normal interval.
- HTTP 401 on a heartbeat: the credential was revoked. The agent logs it and exits with code 1. Delete the state file and enrol again with a new token.
- SIGINT or SIGTERM: stops cleanly.
- Metrics: CPU from `os.cpus()` samples, memory from `os` (free memory on macOS excludes reclaimable cache, so "used" reads high), disk from `df -k /`, battery from `pmset -g batt` (omitted if absent), Tailscale from `tailscale status --json` (best effort, debug log only).

## Moving the control plane

Change `FACTO_API_URL` and restart. If the new control plane has a fresh database, delete the state file and enrol again.

## Verification against the real API (2026-11-27)

Run against the LT-3 API (`9d1ee38`) with a throwaway Postgres. Result: pass.

1. `docker run --rm -d --name facto-lt4-e2e -p 55435:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine`
2. Build, then in `apps/api` start the API: `FACTO_DATABASE_URL=postgres://postgres:test@localhost:55435/postgres FACTO_ADMIN_TOKEN=<24+ chars> FACTO_PORT=3788 node dist/main.js`
3. `POST /nodes/enrolment-tokens` with the owner bearer token and `{"nodeName":"mac-test"}` returns the token.
4. Run the agent with `FACTO_API_URL=http://localhost:3788`, `FACTO_ENROLMENT_TOKEN=<token>`, a temporary `FACTO_AGENT_STATE_FILE` and a 2 second interval. It enrolled, wrote the state file with mode 0600 and sent heartbeats. `GET /nodes` showed `lastHeartbeatAt` and `lastMetrics` (cpu, memory, disk, battery).
5. A second run without a token reused the stored credential and kept sending heartbeats; no second enrolment.
6. `POST /nodes/:id/revoke` returned 204. The next agent run got 401, logged that the credential was rejected and exited with code 1.
7. `GET /activity` showed the token creation, `node.enrol` and `node.revoke` entries; heartbeats are not logged individually.
8. Stopped the API and the container.

The real API agrees with the contract. Tailscale was not running on the test machine, so that path is unverified end to end.
