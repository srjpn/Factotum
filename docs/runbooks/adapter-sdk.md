# Runbook: run an adapter built with the adapter SDK

Applies to every adapter that uses `@facto/adapter-sdk` (`packages/adapter-sdk`). The example adapter used below is `packages/adapter-sdk/examples/fake-adapter.mjs`, which registers a fake adapter and syncs two fake tasks.

## Prerequisites

- The Factotum API is running and reachable at a URL you know (`FACTO_API_URL`, no default). Its owner token is `FACTO_ADMIN_TOKEN` (interim, until LT-6).
- `pnpm install` and `pnpm build` have been run at the repository root.

## Steps

1. First run, from `packages/adapter-sdk`. The owner token is read from the environment for this run only:

   ```bash
   FACTO_API_URL=http://127.0.0.1:3000 FACTO_ADMIN_TOKEN=<owner token> \
   FACTO_ADAPTER_STATE_FILE=./fake-adapter.state.json node examples/fake-adapter.mjs
   ```

   It registers the adapter, stores the service token in the state file (mode 0600), reports health and pushes the snapshot. Expected output: `registered; service token stored` and `synced tasks: { added: 2, ... }`.
2. Later runs need no owner token. The adapter reads its own token from the state file:

   ```bash
   FACTO_API_URL=http://127.0.0.1:3000 FACTO_ADAPTER_STATE_FILE=./fake-adapter.state.json node examples/fake-adapter.mjs
   ```

   Expected: `using stored service token`, and `unchanged: 2` because nothing changed.
3. Check the result as the owner: `GET /adapters` shows the adapter with status `up`, `GET /inventory?kind=task` shows both tasks, and `GET /activity` shows `adapter.register`, `adapter.token.issue` and `inventory.sync` (counts only).

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `no stored token: set FACTO_ADMIN_TOKEN` | First run without the owner token. Provide it once. |
| `409 ... already registered` | The adapter is registered but the state file is lost. There is no token rotation yet (LT-5 gap); remove the adapter row in the database by hand, then register again. |
| `the core rejected the adapter service token (401)` | The adapter stops itself. The token is wrong or the adapter was removed. Delete the state file and register again. |
| `403 ... does not declare "task"` | Add the kind to `reports` in the manifest. |
| `400` on sync | An item failed validation; the message lists the item index and field. The whole snapshot was rejected and the previous data is unchanged. |

The state file holds a credential: never commit it (`*.state.json` is gitignored) and never log it.
