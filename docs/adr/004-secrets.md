# ADR-004: Secrets

- Status: Proposed
- Needed by: Phase 1

## Context

Adapters need API keys and tokens; nodes need credentials; backups need keys. Secrets must never sit in config files or logs, and must be delivered to adapters at call time, scoped and short-lived.

## Options

1. **SOPS with age.** Encrypted files in the repository or on disk, decrypted at deploy time. Simple, no server to run.
2. **A secrets server** (for example OpenBao or Infisical). Dynamic, short-lived secrets and an audit trail, but one more critical service.
3. **Encrypted columns in Postgres.** Convenient, but couples secrets to the database and its backups.

## Leaning

SOPS with age for Phase 1. The core exposes a Secrets interface that adapters call, so a secrets server can replace the backend later without changing adapters.

## Decision

To be made during Phase 1.

## Consequences

The age key is the root of trust and must be backed up separately from the data it protects. Secret references in the database hold names and scopes, never values.
