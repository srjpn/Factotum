# Runbook: notifications through ntfy (LT-16)

Facto sends short push notifications through a self-hosted [ntfy](https://docs.ntfy.sh/) server. The feature is optional and off until both `FACTO_NTFY_URL` and `FACTO_NTFY_TOPIC` are set.

## 1. Run ntfy

On the machine that runs the control plane (or any machine on your tailnet):

```bash
docker run -d --name ntfy --restart unless-stopped -p 127.0.0.1:2586:80 \
  -v ntfy-cache:/var/cache/ntfy binwiederhier/ntfy serve
```

Reach it privately with Tailscale: `tailscale serve --bg 2586` (HTTPS inside the tailnet), or bind to the Tailscale IP instead of 127.0.0.1. Do not expose it publicly. For access control, create a user and token (`ntfy user add`, `ntfy token add`) and set `auth-default-access: deny-all` in the ntfy config.

## 2. Subscribe on a phone

Install the ntfy app, set the default server to your tailnet URL (for example `https://mac.tailnet-name.ts.net`), join the Tailscale network on the phone, and subscribe to your topic. Pick a long random topic name; with a deny-all setup also log in with a user. iOS note: instant push on iOS relies on the ntfy upstream relay, which receives only a message ID, not the content; without it, delivery is delayed.

## 3. Configure Facto

| Variable | Meaning |
| --- | --- |
| `FACTO_NTFY_URL` | Base URL of your ntfy server (no default) |
| `FACTO_NTFY_TOPIC` | Topic to publish to |
| `FACTO_NTFY_TOKEN` | Optional ntfy access token, sent as `Authorization: Bearer`; never logged |

Set them in `.env` and restart the API. At startup the API logs once whether notifications are on or off.

## What triggers a notification

The activity log is the source of truth: after an entry is written, matching entries produce a notification. The rule table is in `apps/api/src/notifications/rules.ts`.

| Action | Outcome | Title | Priority | Tags |
| --- | --- | --- | --- | --- |
| `node.offline` | success | Node offline | high | warning |
| `node.online` | success | Node online | default | white_check_mark |
| `node.enrol` | denied | Node enrolment denied | high | rotating_light |

Add a row to the table to cover later events (Pani run finished or failed, battery low).

## What is and is not sent

Sent: a title, one short line with node name, event and time (UTC). Never sent: metrics, activity details, ticket titles, tokens or any client data.

## Behaviour

- Cooldown: at most one notification per event type per node (or per event for denied enrolments) every 5 minutes, so a flapping node cannot spam you. The cooldown is in memory and resets on restart.
- Each send has a 5 second timeout, no retries, and a failure never affects the action that caused it.
- Each send is recorded as `notification.send` (risk `read`, outcome success or failure) without the message text. It never triggers another notification.
- Entries written inside a database transaction are not announced (none of the rules need them today).
- Facto is a control plane: if ntfy is down, everything keeps running and you simply get no push.
