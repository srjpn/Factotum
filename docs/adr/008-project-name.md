# ADR-008: Project name

- Status: Accepted
- Date: 2026-11-25
- Needed by: Phase 0

## Context

"Nexus" is too common to search for and collides with Sonatype Nexus and many other products. A name was needed that fits a trusted steward of a personal computing household and is rare in self-hosted and AI tooling. Details of the collision checks are in [naming.md](../naming.md).

## Options

1. Keep Nexus. No work, but permanently hard to find.
2. Seneschal, Castellan, Reeve, Binnacle, Majordomo, Muttam, Chatelaine: each had a collision, was hard to spell, or was crowded by butler-style products.
3. Factotum with the calling name Facto. Meaning is "does everything", which matches the control-plane role.

## Decision

The project is **Factotum**. **Facto** is the calling name. The CLI binary is `factotum`, with an optional `facto` alias. Owner chose this on 2026-11-25.

## Consequences

- The unscoped npm names `factotum` and `facto` are taken, so packages are published under a scope.
- GitHub organisation and domain availability still need a manual check before registering.
- Facto has a minor overlap with a Family Accounting Tool repository; accepted as a different category.
- The old name remains only in the verbatim original spec and in history.
