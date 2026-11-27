# Runbook: write actions (Pani start and stop, Trello card move, Jira transition)

LT-13. These actions change real external systems. Each is declared `reversible` in its adapter manifest, so the policy path allows it at once; every step is in the activity log. The design is in [adapter-contract.md](../architecture/adapter-contract.md) ("Running actions").

| Adapter | Action | Params | What it does | Undo |
| --- | --- | --- | --- | --- |
| trello | `move-card` | `cardId`, `listId` | Moves a card to another list on the same board. Refuses boards not in `TRELLO_BOARD_IDS` and lists on another board | Move it back |
| jira | `transition-issue` | `issueKey` and one of `transitionId` or `to` | Resolves the transition from the issue's own available transitions (by id, transition name or target status name) and posts only its id. Refuses projects not in `JIRA_PROJECT_KEYS`, and unknown or ambiguous names. Writes no fields or comments | Transition back, if the workflow allows |
| pani | `start-job` | `jobId` | If the job is `queued`, runs `pani kick`. The runner then works through **every** queued job | Stop the job |
| pani | `stop-job` | `jobId` | `pani cancel <id>`: a queued job is cancelled at once; a running job gets Pani's CANCEL marker and stops at its next check | A cancelled job is not resumed; submit a follow-up |

## What Pani can and cannot do from outside

Pani jobs are created by its own pipeline after the owner approves a plan, so Factotum **cannot create a job**, only start one that is already queued. "Start" means starting Pani's runner (idempotent: it does nothing if a runner holds the lock). Stop is cooperative, not a kill, and discarding a running job's in-flight chunk is not undone. Both go through Pani's own CLI (`PANI_CLI`), never by writing its files. Pani's CLI reads its fixed default directory, so `PANI_STATE_DIR` must point at the same place. Start and stop are refused if `PANI_CLI` is unset. Whether a stop of a running job should count as `reversible` rather than `destructive` is the owner's call (see the LT-13 note in the backlog).

## One-time setup (adapters already registered)

An adapter registered before LT-13 has a manifest without actions, so the core rejects its actions. After upgrading the adapter, update its stored manifest (the token is kept; no restart of registration needed). Run from the adapter directory after `pnpm build`:

```bash
node --input-type=module -e "import('./dist/run.js').then(m => console.log(JSON.stringify(m.MANIFEST)))" > /tmp/manifest.json
curl -s -X PUT -H "authorization: Bearer $FACTO_ADMIN_TOKEN" -H 'content-type: application/json' --data @/tmp/manifest.json "$FACTO_API_URL/adapters/trello/manifest"
```

Use `/adapters/jira/manifest` and `/adapters/pani/manifest` for the others. New adapters register with the actions directly. Then restart the adapter; for Pani set `PANI_CLI=<path to pani>/scripts/pani.mjs` first.

## Use

Request an action (owner token; the response is the run):

```bash
curl -s -X POST -H "authorization: Bearer $FACTO_ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"adapter":"trello","action":"move-card","params":{"cardId":"<id>","listId":"<id>"},"targetType":"task","targetId":"<card id>"}' \
  "$FACTO_API_URL/actions/run"
curl -s -H "authorization: Bearer $FACTO_ADMIN_TOKEN" "$FACTO_API_URL/actions/runs?adapter=trello"
```

The adapter picks the run up within `actionPollMs` (5 s) and the run turns `succeeded` or `failed` with a short `detail`. Check the trail with `GET /activity`: `action.allow`, `action.queue`, `action.start`, `action.result`.

## Failure modes

| Symptom | Cause |
| --- | --- |
| 400 "does not declare action" | Adapter manifest has no such action; do the one-time setup above |
| Run stays `queued` | The adapter is not running or cannot reach the API; after 1 h the run fails as "not claimed" |
| Run `failed`: "no result reported" | The adapter died mid-action; check the external tool by hand, the core never retries |
| Run `failed` with a message | The adapter refused or the tool errored (for example a card outside the configured boards); nothing was changed unless the message says so |

## Live check status

Not run against real Trello, Jira or Pani. Everything is tested against mock servers, fixtures and a fake Pani CLI, plus the real API and Postgres. A live check is for the owner, on a throwaway card, issue and Pani job.
