# Runbook: run the Docker adapter (read-only)

The adapter (`adapters/docker`, `@facto/adapter-docker`) is a separate host process. Each cycle it lists the containers of the local Docker Engine and pushes them to Factotum as `container` inventory with privacy class `personal`. Manifest: name `docker`, domain `hosting`, tier `observe`, reports `container`.

It is read-only: the only call it makes to Docker is `GET /containers/json?all=1`. Restart as a reversible action arrives with the policy layer (LT-11) and is not part of this adapter yet.

## What it reports

Per container: short id, name, image, status (`running`, `stopped`, `restarting`, `unhealthy`, `other`), Docker's state string, health (`healthy`, `unhealthy`, `starting`, `none`), compose project, and published ports such as `127.0.0.1:3000->3000/tcp`. It never reads or sends environment variables, labels other than the compose project, mounts, commands or logs. `startedAt` is in the contract but not filled in, because the list call does not return it.

## Security

- It runs as a **host process, not in a container**, so the Docker socket is never mounted into anything (CLAUDE.md security rule). Access to the socket is the same as root-equivalent access to the machine, so only run it as your own user.
- If it ever has to run in a container, put a socket proxy in front that allows only `GET /containers/json`, and point `DOCKER_HOST` at the proxy. Not built yet.
- Only unix sockets are supported. A `tcp://` `DOCKER_HOST` is rejected.

## Settings (environment only)

| Variable | Meaning | Default |
| --- | --- | --- |
| `FACTO_API_URL` | Base URL of the Factotum API | required, no default |
| `FACTO_ADMIN_TOKEN` | Owner token, first run only (registration) | none |
| `DOCKER_HOST` | `unix:///path/to/docker.sock` or an absolute path | first existing of `/var/run/docker.sock`, `~/.rd/docker.sock` (Rancher Desktop), `~/.docker/run/docker.sock` |
| `DOCKER_SYNC_INTERVAL_SECONDS` | Seconds between syncs (minimum 5) | 30 |
| `FACTO_ADAPTER_STATE_FILE` | Service token file (mode 0600, gitignored `*.state.json`) | `./docker-adapter.state.json` |

## Steps

1. Run the API and get its owner token, as in [adapter-sdk.md](adapter-sdk.md).
2. From the repository root after `pnpm install && pnpm build`:

   ```bash
   cd adapters/docker
   FACTO_API_URL=http://127.0.0.1:3000 FACTO_ADMIN_TOKEN=<owner token> pnpm start
   ```

   Expected: `registered; service token stored`. Later runs need only `FACTO_API_URL`.
3. As the owner, `GET /inventory?kind=container` lists the containers and `GET /adapters` shows `docker` as `up` with a detail like `6 containers (5 running)`. Health is reported on its own interval (30 seconds), so it reads `degraded: first sync pending` briefly after start.

## When Docker is down

If the daemon is unreachable (Docker not running, wrong socket), the adapter logs it, reports health `down` with the reason, and **skips the push**. Existing inventory is kept, never deleted because Docker is down. It resumes on the next cycle once Docker answers.

## Verification (2026-11-27)

Unit and end-to-end tests use a fake Docker API on a temporary unix socket (state and health mapping, port formatting, no leakage of env or labels, daemon down and back, only `GET /containers/json` ever issued). Live run against Rancher Desktop with the real API on a throwaway Postgres: registered, 7 containers synced (6 running, 1 stopped), health `up`. The API integration tests also pass against Postgres, including the new `container` kind.
