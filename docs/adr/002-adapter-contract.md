# ADR-002: Adapter contract

- Status: Accepted
- Needed by: Phase 0

## Context

Adapters connect Factotum to existing tools. The contract decides whether adapters can be written in any language, how a crashing adapter is contained, and whether the same mechanism can later host third-party plugins.

## Options

1. **In-process modules** inside the NestJS monolith. Simple, but one bad adapter can crash the control plane, a rebuild is needed to add one, and it ties adapters to TypeScript.
2. **Out-of-process adapters** registered by manifest, speaking HTTP and typed events to the core. A bit more plumbing, but isolated, language-agnostic and placeable on any node.

## Leaning

Option 2. The manifest declares name, version, domain, tier, reported inventory kinds, actions with risk levels, events published and consumed, required secrets, a health endpoint, a configuration schema and declarative UI. The format is in `schemas/adapter-manifest.schema.json` and described in [../architecture/adapter-contract.md](../architecture/adapter-contract.md).

## Decision

Accepted by the owner on 2026-11-27, as leaned. Adapters are out-of-process (option 2), registered by the manifest in `schemas/adapter-manifest.schema.json`, and speak HTTP and typed events to the core through its API with a scoped service token.

## Consequences

Out-of-process adapters need a small SDK (`packages/adapter-sdk`) so writing one is easy. The core needs registration, scoped service tokens and heartbeats for adapters from the first slice.
