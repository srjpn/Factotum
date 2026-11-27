# Runbook: run the Trello adapter (read-only)

The adapter (`adapters/trello`, `@facto/adapter-trello`) is a separate process. Each cycle it reads the lists and open cards of your chosen boards from Trello and pushes them to Factotum as `task` inventory with privacy class `personal`. It never writes to Trello.

**Live check status: pending the owner.** The adapter is tested against a mock Trello server and a real Factotum API with a mock Trello, but has not been run against trello.com because no credentials were available. Steps 1 to 5 below are the live check; record the result in `docs/backlog/lite.md` (LT-7).

## What you need

- A running Factotum API and its owner token (`FACTO_ADMIN_TOKEN`), needed for the first run only. See [adapter-sdk.md](adapter-sdk.md).
- A Trello API key and token, and the ids of the boards to sync.

## Steps

1. **Create an API key.** Sign in to Trello, open <https://trello.com/power-ups/admin>, create a Power-Up (any name, for example "Facto"), and open its **API key** tab. Generate a key and copy it.
2. **Create a token.** On the same page, use the "Token" link (manual token) next to the key and authorise it with read access. Copy the token. Treat key and token as secrets: keep them in your shell environment or a secrets manager, never in a file in this repository.
3. **Find board ids.** Open a board in the browser and add `.json` to its URL: the `id` field at the top is the board id. A short id from the board URL (`trello.com/b/<shortId>/...`) also works.
4. **Run the adapter.** From the repository root after `pnpm install && pnpm build`:

   ```bash
   cd adapters/trello
   FACTO_API_URL=http://127.0.0.1:3000 FACTO_ADMIN_TOKEN=<owner token> \
   TRELLO_API_KEY=<key> TRELLO_TOKEN=<token> TRELLO_BOARD_IDS=<id1>,<id2> \
   FACTO_ADAPTER_STATE_FILE=./trello-adapter.state.json pnpm start
   ```

   Expected: `registered; service token stored`. Later runs do not need `FACTO_ADMIN_TOKEN`; the adapter reads its service token from the state file (mode 0600, gitignored).
5. **Check the result.** As the owner:

   ```bash
   curl -s -H "authorization: Bearer $FACTO_ADMIN_TOKEN" "$FACTO_API_URL/inventory?kind=task&source=trello"
   ```

   You should see your open cards with `status`, `statusLabel` (the Trello list name), `project` (the board name) and `privacyClass: personal`. `GET /adapters` shows the adapter as `up`, and `GET /activity` shows an `inventory.sync` entry with counts only.

## Settings (environment only)

| Variable | Required | Meaning |
| --- | --- | --- |
| `FACTO_API_URL` | yes | Base URL of the Factotum API. No default. |
| `TRELLO_API_KEY`, `TRELLO_TOKEN` | yes | Sent in the `Authorization: OAuth ...` header, never in a URL. Masked in logs. |
| `TRELLO_BOARD_IDS` | yes | Comma-separated board ids. |
| `TRELLO_LIST_STATUS_MAP` | no | JSON object mapping list names to `todo`, `in-progress`, `done` or `other` (case-insensitive). Overrides the defaults. |
| `TRELLO_SYNC_INTERVAL_SECONDS` | no | Default 60, minimum 5. |
| `FACTO_ADAPTER_STATE_FILE` | no | Default `./trello-adapter.state.json`. |
| `FACTO_ADMIN_TOKEN` | first run | Owner token for first registration only. |
| `TRELLO_API_BASE` | no | Default `https://api.trello.com`. For tests. |

Default list mapping: `backlog`, `to do`, `todo` map to `todo`; `doing`, `in progress` to `in-progress`; `done`, `complete`, `shipped` to `done`; any other list maps to `other` and the list name stays in `statusLabel`. Example override: `TRELLO_LIST_STATUS_MAP='{"Waiting on client":"in-progress","Review":"in-progress"}'`.

## Behaviour to know

- One snapshot covers all boards, so a card that is archived, deleted or moved off a synced board disappears from Factotum on the next cycle.
- A board that fails never causes its cards to be removed. If it worked before, its last good cards are kept and health is `degraded`. If it has never worked since start, the whole push is skipped and health is `degraded` with the board id.
- Trello rate limits (HTTP 429) are retried using `Retry-After`. Rejected credentials (401) report `down` and nothing is pushed.
- The first health report is sent before the first sync finishes, so `GET /adapters` can briefly show `degraded: first sync pending`; it updates at the next health interval (30 s).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `invalid configuration: ...` | A setting is missing or malformed; the message names the setting, not its value. |
| Health `down`, "Trello rejected the credentials" | Check the key and token and that the token has read access to the boards. |
| Health `degraded`, board id listed | Check the board id and that the token's member can see the board. |
| `the core rejected the adapter service token (401)` | See [adapter-sdk.md](adapter-sdk.md): delete the state file and register again. |
