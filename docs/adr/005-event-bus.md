# ADR-005: Event bus

- Status: Proposed
- Needed by: Phase 2

## Context

Modules and adapters exchange typed events (for example container.unhealthy). v0.1 proposed Redis Streams plus BullMQ from the start. For one owner and a handful of adapters that is more infrastructure than needed.

## Options

1. **Postgres as the event store with BullMQ for delivery.** One fewer moving part; events are queryable and part of backups.
2. **Redis Streams** for ordered, replayable fan-out to several consumers.
3. **NATS or another broker.** Powerful, but a new dependency with no current need.

## Leaning

Option 1. Add Redis Streams only when a second consumer needs ordered replay, or event volume makes Postgres a bottleneck. Define events as versioned types in `packages/contracts` so the transport can change without changing producers or consumers.

## Decision

To be made during Phase 2.

## Consequences

Redis is still present for BullMQ. Event schemas are the contract; the transport is an implementation detail.
