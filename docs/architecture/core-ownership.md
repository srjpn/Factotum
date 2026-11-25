# Core ownership rules

Every cross-cutting concern has exactly one owner in the core. Adapters and domains consume it instead of re-implementing it.

| Concern | Owner | Adapters and domains may |
| --- | --- | --- |
| Who someone is, and what they may do | Identity | Declare permissions; never handle passwords |
| What exists: nodes, services, models, devices | Inventory | Report what they find; keep only a private cache |
| Where a workload or AI request runs | Policy | Request placement; never pick a node themselves |
| Scheduling, retries, events | Orchestration | Enqueue jobs; publish and consume typed events |
| What happened, and who caused it | Activity log | Emit an entry for every action; cannot edit or delete entries |
| Credentials and API keys | Secrets | Receive short-lived, scoped secrets at call time |
| Alerts and notices | Notifications | Raise an alert with a severity; routing is not theirs |
| Time-series metrics and logs | Monitoring tools | Inventory holds only the current snapshot |

## Rules that hold the design together

1. **One owner per concern.** If two components need the same data, one owns it and the other asks.
2. **Tools hold state; Factotum holds intent.** Factotum stores desired configuration, references and cached snapshots. The tool remains the source of truth for its own runtime state.
3. **One door.** Adapters and agents reach the core only through its API, with a service token scoped to their permissions. There is no shared database access.
4. **Humans, automations and agents are all principals.** Each has an identity, a role and an audit trail. An agent never inherits the owner's full authority.
5. **Single owner now, household later.** Roles are owner, member and viewer from the start, so adding a second person later changes configuration, not design.
