# Runbook: run the Time Machine adapter (read-only)

The adapter (`adapters/timemachine`, `@facto/adapter-timemachine`) is a separate host process. Each cycle it reads Time Machine state with `tmutil` and pushes one `backup` inventory item with privacy class `personal`. Manifest: name `timemachine`, domain `data`, tier `observe`, reports `backup`. Criteria: [LT-17 notes](../backlog/lite.md).

It is read-only: the only commands it runs are `tmutil status`, `tmutil destinationinfo` and `tmutil latestbackup`. It never starts, stops or changes a backup.

## What it reports

One item, `externalId` `timemachine`: status (`ok`, `running`, `stale`, `unavailable`), last backup time (from the latest backup's folder name, local time), whether a backup is running, whether a destination is mounted, and the destination's name. No paths, snapshot names or file lists. `stale` means older than `TIMEMACHINE_STALE_HOURS`.

## Full Disk Access

On recent macOS `tmutil latestbackup` and `destinationinfo` can need Full Disk Access for the process that runs them (the terminal app, or whatever launches the adapter). If `tmutil` is refused, the adapter does not crash: it logs the reason, reports health `degraded` with a detail naming Full Disk Access, and **skips the push** so existing inventory is kept. Grant access in System Settings, Privacy and Security, Full Disk Access, then restart the adapter. A destination that is simply not mounted is not an error: it is reported as `unavailable` with `destinationReachable: false`.

## Settings (environment only)

| Variable | Meaning | Default |
| --- | --- | --- |
| `FACTO_API_URL` | Base URL of the Factotum API | required, no default |
| `FACTO_ADMIN_TOKEN` | Owner token, first run only (registration) | none |
| `TIMEMACHINE_SYNC_INTERVAL_SECONDS` | Seconds between syncs (minimum 30) | 300 |
| `TIMEMACHINE_STALE_HOURS` | Age after which the last backup counts as stale | 48 |
| `FACTO_ADAPTER_STATE_FILE` | Service token file (mode 0600, gitignored `*.state.json`) | `./timemachine-adapter.state.json` |

## Steps

1. Run the API and get its owner token, as in [adapter-sdk.md](adapter-sdk.md).
2. After `pnpm install && pnpm build`:

   ```bash
   cd adapters/timemachine
   FACTO_API_URL=http://127.0.0.1:3000 FACTO_ADMIN_TOKEN=<owner token> pnpm start
   ```

   Expected: `registered; service token stored`. Later runs need only `FACTO_API_URL`.
3. `GET /inventory?kind=backup` shows the item; the Overview Adapters card shows `timemachine` with its health detail.
