# ADR-003: Identity

- Status: Proposed
- Needed by: Phase 1

## Context

Factotum needs one login and one permission model, and should provide single sign-on into linked tools such as Grafana and n8n. v1 serves one owner; a household member may follow.

## Options

1. **Local login in Factotum** (password plus passkey or TOTP). Fastest to build; SSO into other tools would need extra work.
2. **An OIDC provider** (Authentik or Authelia) from day one, with Factotum as an OIDC client. More to run, but SSO into linked tools comes naturally and Factotum avoids handling passwords.
3. **Tailscale identity only.** Minimal, but ties authorisation to the network layer and gives no role model.

## Leaning

Start with option 1 behind an interface so that option 2 can replace it. Factotum owns roles (owner, member, viewer) and service principals either way. Revisit when the first tool needs SSO.

## Decision

To be made during Phase 1.

## Consequences

Roles and permissions belong to Factotum regardless of the login method. Adapters declare permissions in their manifests and never see passwords.
