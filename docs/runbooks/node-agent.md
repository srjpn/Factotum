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
