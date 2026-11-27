# Runbook: run the local dev servers adapter (read-only)

The adapter (`adapters/devservers`, `@facto/adapter-devservers`) is a separate host process. Each cycle it lists listening TCP ports on this machine and pushes them as `service` inventory with privacy class `personal`. Manifest: name `devservers`, domain `hosting`, tier `observe`, reports `service`. Criteria: [LT-17 notes](../backlog/lite.md).

It is read-only: it runs `lsof -nP +c 0 -iTCP -sTCP:LISTEN -Fpcn` and `lsof -nP -a -d cwd -Fpn -p <pids>`.

## What it reports

Per port: port, process name, working directory **name only** (last path segment, for example `web`, never the full path), and bind (`localhost` or `all`). Ports bound to a specific LAN or tailnet address are dropped. It never reads or sends command-line arguments or environment: lsof is asked for pid, command name and address only. If the working directory cannot be read, the item is still reported without it. IPv4 and IPv6 sockets of one server are merged into one item.

## Ignoring things

Ports below `DEVSERVERS_MIN_PORT` (default 1024) are dropped. A built-in list drops macOS helpers and container runtimes (`rapportd`, `ControlCenter`, `com.docker.backend`, `tailscaled`, ...). Add your own with `DEVSERVERS_IGNORE_PORTS` (for example `5432,6379`) and `DEVSERVERS_IGNORE_PROCESSES` (names, case-insensitive, added to the defaults).

## Settings (environment only)

| Variable | Meaning | Default |
| --- | --- | --- |
| `FACTO_API_URL` | Base URL of the Factotum API | required, no default |
| `FACTO_ADMIN_TOKEN` | Owner token, first run only (registration) | none |
| `DEVSERVERS_SYNC_INTERVAL_SECONDS` | Seconds between syncs (minimum 5) | 30 |
| `DEVSERVERS_IGNORE_PORTS` | Comma separated ports to hide | none |
| `DEVSERVERS_IGNORE_PROCESSES` | Comma separated process names to hide | built-in list |
| `DEVSERVERS_MIN_PORT` | Lowest port reported | 1024 |
| `FACTO_ADAPTER_STATE_FILE` | Service token file (mode 0600, gitignored `*.state.json`) | `./devservers-adapter.state.json` |

## Steps

```bash
cd adapters/devservers
FACTO_API_URL=http://127.0.0.1:3000 FACTO_ADMIN_TOKEN=<owner token> pnpm start
```

Expected: `registered; service token stored`. `GET /inventory?kind=service` lists the ports. If `lsof` fails, health is `degraded` with the reason and nothing is pushed, so inventory is kept.
