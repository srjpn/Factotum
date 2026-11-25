# ADR-007: Policy language

- Status: Proposed
- Needed by: Phase 3

## Context

Policy decides placement (privacy, capability, cost, latency) and action approval (risk level by caller). Rules must be readable, testable and impossible to silently weaken. Privacy rules are hard constraints.

## Options

1. **Declarative YAML or JSON rules** evaluated by a small in-house engine. Easy to read and review; limited expressiveness.
2. **An embedded policy engine** such as OPA with Rego or Cedar. Expressive and well tested, but a new language to learn and a new dependency.
3. **Rules as code** in TypeScript. Flexible, but hard to review and easy to make unsafe.

## Leaning

Start with option 1 for placement and action approval, with unit-style tests that every rule file must pass (for example "a private-class task never resolves to a cloud node"). Revisit option 2 if rules outgrow the simple format.

## Decision

To be made at the start of Phase 3.

## Consequences

Policy files are versioned, reviewed and tested like code. Changing policy is a Privileged action and is recorded in the activity log.
