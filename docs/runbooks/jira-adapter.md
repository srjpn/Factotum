# Runbook: run the Jira adapter (read, plus one write action)

The adapter (`adapters/jira`, `@facto/adapter-jira`) is a separate process. Each cycle it reads open and recently updated issues from your chosen Jira Cloud projects and pushes them to Factotum as `task` inventory with privacy class `client-data`. It never writes to Jira. The only exception is the declared write action(s) of LT-13, which run only when you ask for them through the core: see [write-actions.md](write-actions.md). Issue titles are client data: they are sent only to the Factotum API and are never logged (logs hold counts and project keys).

**Live check status: passed on 2026-11-27** against a real Jira Cloud site (395 issues synced, adapter `up`). It is also tested against a mock Jira server and the real Factotum API and Postgres. The result is recorded in `docs/backlog/lite.md` (LT-8).

## What you need

- A running Factotum API and its owner token (`FACTO_ADMIN_TOKEN`), needed for the first run only. See [adapter-sdk.md](adapter-sdk.md).
- Your Jira Cloud site URL (for example `https://yourteam.atlassian.net`), your Atlassian account email, an API token, and the project key of each client project.

## Steps

1. **Create an API token.** Sign in at <https://id.atlassian.com/manage-profile/security/api-tokens>, choose **Create API token**, name it (for example "Facto read-only") and copy it. The token has your permissions, so the adapter sees what you see. Keep it in your shell environment or a secrets manager, never in a file in this repository.
2. **Pick project keys.** The key is the prefix of issue ids (`ACME-123` has key `ACME`). List one per client project, comma separated.
3. **Run the adapter.** After `pnpm install && pnpm build`:

   ```bash
   cd adapters/jira
   FACTO_API_URL=http://127.0.0.1:3000 FACTO_ADMIN_TOKEN=<owner token> \
   JIRA_BASE_URL=https://yourteam.atlassian.net JIRA_EMAIL=<your email> JIRA_API_TOKEN=<token> \
   JIRA_PROJECT_KEYS=ACME,BETA FACTO_ADAPTER_STATE_FILE=./jira-adapter.state.json pnpm start
   ```

   Expected: `registered; service token stored`. Later runs do not need `FACTO_ADMIN_TOKEN`; the adapter reads its service token from the state file (mode 0600, gitignored).
4. **Check the result** as the owner:

   ```bash
   curl -s -H "authorization: Bearer $FACTO_ADMIN_TOKEN" "$FACTO_API_URL/inventory?kind=task&source=jira"
   ```

   You should see your issues with `status`, `statusLabel` (the Jira status name), `project` (the key), `assignee`, `url` and `privacyClass: client-data`.
5. **Check health and audit.** `GET /adapters` shows `jira` as `up`; `GET /activity` shows an `inventory.sync` entry with counts only.

## Settings (environment only)

| Variable | Required | Meaning |
| --- | --- | --- |
| `FACTO_API_URL` | yes | Base URL of the Factotum API. No default. |
| `JIRA_BASE_URL` | yes | Your Jira Cloud site URL. No default. Also used for issue links. |
| `JIRA_EMAIL`, `JIRA_API_TOKEN` | yes | HTTP Basic credentials, sent only in the `Authorization` header. Masked in logs. |
| `JIRA_PROJECT_KEYS` | yes | Comma-separated project keys (letters, digits, underscores). |
| `JIRA_JQL_EXTRA` | no | Extra JQL ANDed to each project query, for example `labels = facto`. |
| `JIRA_SYNC_INTERVAL_SECONDS` | no | Default 60, minimum 5. |
| `FACTO_ADAPTER_STATE_FILE` | no | Default `./jira-adapter.state.json`. |
| `FACTO_ADMIN_TOKEN` | first run | Owner token for first registration only. |

Default query per project: `project = "KEY" AND (statusCategory != Done OR updated >= -14d)`, so open issues and issues touched in the last 14 days. It uses the `POST /rest/api/3/search/jql` endpoint (the older `/rest/api/3/search` is being removed by Atlassian).

Status mapping uses the Jira status category: `new` to `todo`, `indeterminate` to `in-progress`, `done` to `done`, anything else to `other`. The Jira status name stays in `statusLabel`.

## Behaviour to know

- One snapshot covers all projects, so an issue that leaves the query (older than 14 days and done, moved or deleted) disappears from Factotum on the next cycle.
- A project that fails never causes its issues to be removed. If it worked before, its last good issues are kept and health is `degraded`. If it has never worked since start, the whole push is skipped and health is `degraded` with the project key.
- Rate limits (HTTP 429) are retried using `Retry-After`. Rejected credentials (401 or 403) report `down` and nothing is pushed.
- The first health report is sent before the first sync finishes, so `GET /adapters` can briefly show `degraded: first sync pending`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `invalid configuration: ...` | A setting is missing or malformed; the message names the setting, not its value. |
| Health `down`, "Jira rejected the credentials" | Check the email, token and site URL; the token may have been revoked. |
| Health `degraded`, project key listed | Check the key exists and your account can browse it. A wrong key makes Jira answer 400. |
| `the core rejected the adapter service token (401)` | See [adapter-sdk.md](adapter-sdk.md): delete the state file and register again. |
