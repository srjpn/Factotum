# Runbook: run the Claude Code adapter (read-only)

The adapter (`adapters/claude`, `@facto/adapter-claude`) is a separate host process. It reads Claude Code's local transcripts and pushes two inventory kinds to Factotum, both with privacy class `client-data`: `claude-session` and `claude-usage`. Manifest: name `claude`, domain `ai`, tier `observe`, reports `claude-session`, `claude-usage`. It writes nothing except its own state file.

## What it reads, and what it never keeps

Source: `~/.claude/projects/<project-dir>/<session-id>.jsonl` (override with `CLAUDE_PROJECTS_DIR`). Each line is parsed in one place (`src/parse.ts`) and reduced to: line type, timestamp, sidechain flag, model name and the four token counts. **Message text, prompts, tool inputs, file paths and the working directory are never read into any structure, stored, logged or sent.** Unit tests feed lines containing marker secrets and paths and assert that nothing reaches the output, and the contract schemas drop unknown fields.

Transcripts can be many megabytes. The adapter keeps per-file totals in memory and, on each cycle, streams only the bytes appended since last time (a half-written last line waits for the next cycle). Files untouched for 30 days are ignored. Sub-agent transcripts in nested folders are not read; sidechain messages inside a transcript are counted.

## What it reports

**Sessions** (`claude-session`, newest 100): title, short id (first 8 characters of the session id), project label, models used, started and last activity, state `active` (transcript modified in the last N minutes, default 10), `idle` or `waiting` (see below), message count, sidechain (sub-agent) messages, tokens in, out, cache write and cache read, wall-clock duration (first to last message), active time (sum of gaps under 5 minutes), estimated cost, and, for active sessions, the context size of the latest message (input plus cache tokens) as a context-pressure hint.

**Waiting on you.** A session is `waiting` (shown first, with a "needs you" pill and the wait time) when its last assistant line has a `tool_use` named `AskUserQuestion` or `ExitPlanMode` (plan approval) and no later user line (a `tool_result` for that id, or typed text) or assistant line follows. Only the boolean, the tool name and the wait time are kept: the question and options are never read into any structure. Questions older than 24 hours count as abandoned, not waiting.

**Limit: this is a best-effort heuristic from transcript tails.** Ordinary permission prompts (allow this command?) are not written to the transcript, so they cannot be detected, and a tool that is simply running looks the same as one that is blocked. I also looked at the file names under `~/.claude/sessions/` (`<pid>.json` and `<pid>.<hash>.key`): names carry no state, and the contents were not opened, so they are not used.

**Usage** (`claude-usage`, at most 30 day rows plus two windows): `day:YYYY-MM-DD` (local day), `window:5h` and `window:7d`. Each has tokens by model, an estimated cost, messages, sessions, cache hit rate (cache reads over input plus cache writes plus cache reads) and active time (days and the 7-day window). Today's row also has sessions per project and the longest session. `window:5h` also carries the burn rate: tokens per hour over the last hour (input, output and cache-write tokens; cache reads are excluded because they dominate the count).

## Cost is an estimate

Every cost is labelled an estimate. Prices live in one file, `src/pricing.ts`, in US dollars per million tokens for input, output, cache write and cache read. **The built-in numbers are placeholders, not Anthropic's price list; keep them current.** Unknown models use a clearly labelled fallback price. Subscription plans are not metered per token, so for them the number is a relative size, not a bill.

Override without rebuilding: set `CLAUDE_PRICING_FILE` to a JSON file:

```json
{
  "models": {
    "claude-opus-5-5": { "input": 15, "output": 75, "cacheWrite": 18.75, "cacheRead": 1.5 }
  },
  "fallback": { "input": 3, "output": 15, "cacheWrite": 3.75, "cacheRead": 0.3 }
}
```

Listed models replace the built-ins; others keep them. A dated id such as `claude-opus-5-5-20261001` matches the longest known prefix.

## Session titles

`title` is the session title: the latest `custom-title` record in the transcript (`customTitle`), else the latest `agent-name` record (`agentName`), else the short session id; capped at 200 characters. The project label is the separate `project` field, shown as a small tag. These are the only title record types seen in real transcripts (checked by record type and key names only; no `ai-title` exists). **Titles are written by you and may mention clients.** They stay `client-data`, are sent only in the pushed snapshot, and are never logged by the adapter (a test checks this).

## Privacy of project names

Directory names can reveal client names. By default the label is the last segment of the directory name only (Claude Code encodes the path with dashes, so a name that itself contains dashes shows its last part; worktree folders are labelled with their repository). Set `CLAUDE_HIDE_PROJECT_NAMES=true` to report `project-<8 hex>` instead, a stable hash that reveals nothing. Everything is tagged `client-data` regardless.

## Settings (environment only)

| Variable | Meaning | Default |
| --- | --- | --- |
| `FACTO_API_URL` | Base URL of the Factotum API | required, no default |
| `FACTO_ADMIN_TOKEN` | Owner token, first run only (registration) | none |
| `CLAUDE_PROJECTS_DIR` | Transcript root | `~/.claude/projects` |
| `CLAUDE_ACTIVE_WINDOW_MINUTES` | A session is active if modified within this many minutes | 10 |
| `CLAUDE_SYNC_INTERVAL_SECONDS` | Seconds between syncs (minimum 5) | 30 |
| `CLAUDE_HIDE_PROJECT_NAMES` | `true` to hash project labels | `false` |
| `CLAUDE_PRICING_FILE` | Optional price override JSON | none |
| `FACTO_ADAPTER_STATE_FILE` | Service token file (mode 0600, gitignored `*.state.json`) | `./claude-adapter.state.json` |

## Steps

1. Run the API **built from a version that knows the `claude-session` and `claude-usage` kinds** (an older API answers 400 `unsupported inventory kind`), and get its owner token as in [adapter-sdk.md](adapter-sdk.md).
2. From the repository root after `pnpm install && pnpm build`:

   ```bash
   cd adapters/claude
   FACTO_API_URL=http://127.0.0.1:3000 FACTO_ADMIN_TOKEN=<owner token> pnpm start
   ```

   Expected: `registered; service token stored`. Later runs need only `FACTO_API_URL`.
3. `GET /inventory?kind=claude-session` and `?kind=claude-usage` list the data; `GET /adapters` shows `claude` as `up` with a detail like `100 sessions (3 active)`. The dashboard Overview has a Claude Code card (active sessions, tokens and estimated cost today, session time today, last 5 hours); it shows an empty state when the adapter is absent.

If the transcript folder is missing the adapter pushes empty snapshots. If it cannot be read it reports `down` and skips the push, so inventory is not deleted.

## Known limits

- Token counts are summed per transcript line. If Claude Code writes one API response over several lines, usage may be counted more than once; treat totals as estimates.
- Active time and duration use message timestamps only; time spent reading is not visible.
- Day boundaries use the adapter host's local time.
