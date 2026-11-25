# Naming

**Decision: Factotum, called Facto** (see [ADR-008](adr/008-project-name.md)). The project started as "Nexus", which is very common (Sonatype Nexus, many "Nexus" products across infrastructure and AI), so it is hard to search for and invites confusion. This page records the criteria, the collision checks and the shortlist that led to the choice.

## Criteria

- Short enough for a CLI binary and a Docker image name (8 letters or fewer is ideal).
- Easy to say and spell.
- Meaning fits: a trusted steward of a personal computing household, not a hub or a grid.
- No established project in self-hosted, infrastructure or AI tooling with the same name.
- GitHub organisation or repository, npm scope and a domain are available (not yet checked for any candidate).

## Collision checks (web search, 25 November 2026)

| Name | Finding | Verdict |
| --- | --- | --- |
| Hearth | A self-hosted home dashboard for services already exists (cailurus/Hearth) | Collides in the same space |
| Cairn | A self-hosted directory page for homelab users exists (MorganKryze/cairn) | Collides in the same space |
| Orrery | Several projects, including an MCP server that orchestrates AI coding agents and several solar-system simulators | Collides, including in AI tooling |
| Majordomo | Legacy mailing-list software (1992 to 2000, Perl) and a ZeroMQ protocol of the same name; no current self-hosted control-plane product found | Weak collision, history only |
| Muttam | Not searched yet | Needs a check |
| Seneschal | Not searched yet | Needs a check |

Rejected from general knowledge, not verified in this check: Keystone (OpenStack identity service), Halyard (Spinnaker tool), Plinth (FreedomBox web interface), Tether (cryptocurrency), Loom (video product), Steward (very common).

## Shortlist

| Name | Meaning | For | Against |
| --- | --- | --- | --- |
| Muttam | Malayalam for the open courtyard at the centre of a Kerala home that every room opens onto | Fits "one place everything opens onto"; short; distinctive in software; rooted in the owner's home | Pronunciation for non-Malayalam speakers; needs a collision check |
| Majordomo | The head of a household's staff | Strong metaphor for an agent that runs the house; memorable | Nine letters; old mailing-list software shares the name |
| Seneschal | Steward of a great household | Rare, precise metaphor | Hard to spell; long |
| Tharavad | Malayalam for an ancestral family home | Cultural fit | Longer; connotes lineage more than control |

## Calling name

"Factotum" comes from the Latin *fac totum*, "do everything". The short form **Facto** (FAK-toh) is used in conversation and UI copy ("ask Facto").

| Candidate | Finding | Verdict |
| --- | --- | --- |
| Totum | A low-code database platform you can self-host, plus compliance software | Collides |
| Fac | A Factorio mod manager, a git-conflict tool and a build system | Too crowded as a command |
| Facto | A Family Accounting Tool repository of the same name, a different category | Minor overlap, accepted |

## Availability checks (2026-11-25)

| Item | Result |
| --- | --- |
| npm `factotum` | Taken (a CLI package) |
| npm `facto` | Taken |
| GitHub organisation or user `factotum` and `facto` | Not checked: the API request was refused from the research environment |
| Domains | Not checked: unreachable from the research environment |

Consequence: publish under an npm scope, and check GitHub and domains by hand before registering anything.

## Decision

Factotum is the project name, Facto the calling name, `factotum` the binary with an optional `facto` alias.
