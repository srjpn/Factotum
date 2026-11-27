# Runbook: run the Pani adapter (read, plus one write action)

The adapter (`adapters/pani`, `@facto/adapter-pani`) is a separate process. Each cycle it reads Pani's job files and pushes them to Factotum as `run` inventory with privacy class `client-data` (Pani works on client repositories). It never writes to Pani's directories, never starts jobs and never runs Pani's scripts. The only exception is the declared write action(s) of LT-13, which run only when you ask for them through the core: see [write-actions.md](write-actions.md).

## How Pani is read

Pani has a CLI (`scripts/pipeline.mjs`) and MCP tools but **no HTTP API**. Its state is plain files, which this adapter reads:

| File | Used for |
| --- | --- |
| `<state dir>/jobs/<jobId>/job.json` | `title`, `status`, `created`, `started`, `finished`, `note`, `error` |
| `<state dir>/jobs/<jobId>/result.json` | `chunks_done`, `chunks_total` and each chunk's `repo` name (only when present) |

The default state dir is `~/.config/openhands-orchestrator` (Pani's own location). Pani itself does not read `PANI_STATE_DIR`; the adapter does, so set it only if you moved the directory. If Pani's file format changes, `src/jobs.ts` is the one place to update.

## What is reported

One `run` item per job: id, title, status (`queued`, `running`, `done`, `partial`, `failed`, or `other` with the raw value in `statusLabel`, for example `cancelled`), `ticketKey` (first `ABC-123` pattern in the title, else the note), repo names, chunk counts, start and finish time, duration, and a short error (paths replaced, 200 characters).

Never reported: diffs, logs (`runner.log`), commit hashes or messages, file paths, chunk titles, branch names. The run's `ticketKey` is the link to a Jira task.

Jobs are listed newest first by id (ids contain the creation date) and capped at `PANI_MAX_JOBS`. Deleted jobs drop out of the next snapshot.

## Settings (environment)

| Variable | Default | Meaning |
| --- | --- | --- |
| `FACTO_API_URL` | none, required | Base URL of the Factotum API |
| `PANI_STATE_DIR` | `~/.config/openhands-orchestrator` | Directory that contains `jobs/` |
| `PANI_SYNC_INTERVAL_SECONDS` | 30 | Seconds between reads (minimum 5) |
| `PANI_MAX_JOBS` | 200 | Newest jobs to report |
| `FACTO_ADAPTER_STATE_FILE` | `./pani-adapter.state.json` | Holds the adapter's service token (mode 0600, gitignored) |
| `FACTO_ADMIN_TOKEN` | none | First run only, to register the adapter |

## Steps

1. From the repository root, after `pnpm install && pnpm build`:

   ```bash
   cd adapters/pani
   FACTO_API_URL=http://127.0.0.1:3000 FACTO_ADMIN_TOKEN=<owner token> pnpm start
   ```

   Expected: `registered; service token stored`. Later runs do not need the owner token.
2. Check as the owner (health may show "first sync pending" for up to 30 seconds):

   ```bash
   curl -s -H "authorization: Bearer $FACTO_ADMIN_TOKEN" "$FACTO_API_URL/inventory?kind=run&source=pani"
   curl -s -H "authorization: Bearer $FACTO_ADMIN_TOKEN" "$FACTO_API_URL/adapters"
   ```

## Health

| Status | Meaning |
| --- | --- |
| `up` | All job files read |
| `degraded` | Some `job.json` or `result.json` files were unreadable (for example half written). A job that was read before keeps its last good value for that cycle |
| `down` | The jobs directory is missing or unreadable. Nothing is pushed, so existing data is not wiped. Check `PANI_STATE_DIR` |

## Result of the live check (2026-11-27)

Against the owner's real Pani directory and a throwaway API: 32 jobs read and pushed (12 partial, 7 done, 7 failed, 6 cancelled shown as `other`), 17 with a ticket key, 31 with chunk counts, 1 with an error, all `client-data`, 0 unreadable. No path or log text appeared in the stored data.
