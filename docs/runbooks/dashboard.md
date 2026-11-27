# Runbook: dashboard

The dashboard (`apps/dashboard`, Next.js) shows nodes and the activity log. It has one owner login. The browser talks only to the dashboard; the dashboard server calls the Facto API with `FACTO_ADMIN_TOKEN`, so the token never reaches the browser.

## Settings (environment only, no defaults)

| Variable | Meaning |
| --- | --- |
| `FACTO_API_URL` | Base URL of the API, for example `http://api:3000` in Compose. Required |
| `FACTO_ADMIN_TOKEN` | The API's owner token (24+ characters). Server side only |
| `FACTO_DASHBOARD_PASSWORD` | The owner's login password (8+ characters) |
| `FACTO_SESSION_SECRET` | Signs the session cookie (32+ random characters). Changing it logs everyone out |
| `FACTO_COOKIE_SECURE` | Optional. The cookie is `Secure` except on localhost. Set `false` to use plain http over a private network such as a Tailscale IP |

Missing or invalid values stop the server at start with a message naming the variable (never its value).

## Run with Compose

Set the variables above in `.env` (see `.env.example`), then `docker compose up --build`. The dashboard listens on `${FACTO_BIND_ADDR:-127.0.0.1}:${FACTO_DASHBOARD_PORT:-3001}`. Keep the bind address on localhost, or set it to a Tailscale IP. Moving to another machine needs only these settings (ADR-009).

## Run without Docker

```bash
pnpm install && pnpm build
cd apps/dashboard && node .next/standalone/apps/dashboard/server.js   # PORT=3001 by default in the image, 3000 otherwise
```

Static files need `.next/static` copied next to the standalone server, as the Dockerfile does. For development use `pnpm --filter @facto/dashboard dev`.

## What it shows

- **Overview:** counts of online, offline and pending nodes, and the last 5 activity entries.
- **Nodes:** name, live status from the API, last heartbeat, CPU, memory, disk, battery when reported. Revoked nodes are dimmed.
- **Activity:** newest first, with a selector for 25, 50, 100 or 200 entries.

- **Tasks:** every `task` item from the adapters (Jira, Trello), read server-side from `GET /inventory?kind=task`. Each row shows title (linked when the adapter gave a URL), source, status, a privacy tag (`client-data` or `personal`), project and assignee when present. The Source selector (`/tasks?source=jira`) filters by the item's `source`; the choices come from the data. The page is empty until a task adapter has synced.

Nodes, tasks and activity refresh every 10 seconds while the tab is visible. If the API is down or rejects the token, each page shows an error card instead of data.

## Login behaviour

A wrong password waits 1 second; five failures in 15 minutes lock logins for 60 seconds (in memory, resets on restart). Sessions last 7 days. Log out clears the cookie. Sessions are stateless signed cookies, so there is no server-side revocation other than changing `FACTO_SESSION_SECRET`.
