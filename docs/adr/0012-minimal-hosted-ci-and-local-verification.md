# Minimal hosted CI and explicit local verification

- Status: accepted
- Date: 2026-11-08
- Version: 1
- Deciders: maintainer

Reproducing statement: Reduce hosted CI spending to one Linux product integration gate per pull request, retain exhaustive host-local product validation and separate BMAD development-tool tests, accepting unavailable-platform release coverage while preserving publication safeguards.

## Context and Problem Statement

The hosted three-OS full-suite matrix duplicates expensive local verification and provisions orchestration tooling for product changes. The maintainer explicitly accepts that releases cannot always be tested on unavailable platforms.

## Decision Drivers

- Reduce hosted minutes while retaining a real typed build and fixed integration smoke tests.
- Preserve exhaustive product tests, coverage floors and fail-fast behavior locally.
- Keep private-policy, exact-candidate, remote-tag and blocking audit publication controls.

## Considered Options

1. Retain the full three-OS hosted matrix and orchestration setup.
2. Use one bounded Linux hosted gate and explicit local product/platform/tooling verification.

## Decision Outcome

Chosen option: “one bounded Linux hosted gate”, as approved by the maintainer. Pull requests require one `CI` job with revision cancellation, a pnpm-store-only cache and informational audit only for lockfile changes. `check:ci` runs static gates, the normal typed build, contracts/core unit tests and fixed server/UI smoke paths. No hosted BMAD or model execution is required.

`check` remains the full local product gate. `test:bmad` explicitly runs orchestration tests and fails when their prerequisites are missing. The release quality job uses Linux `check:ci`; blocking audit, quality/audit dependencies and all publication safeguards remain intact. Operators run full product verification locally and targeted existing commands on available platforms, recording unexecuted coverage. Unavailable other OSes alone do not block release.

### Consequences

- Good: lower hosted spending and product checks independent of orchestration prerequisites.
- Bad: hosted CI no longer proves full-suite or multi-OS coverage; operators must preserve honest local verification records.
- Neutral: no release, publication-policy, safety-test or application behavior changes are authorized by this decision.

## Changelog

- 2026-11-08 v1: Record the approved CI/local verification policy and accepted platform limits.
