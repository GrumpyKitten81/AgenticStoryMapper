---
epic: 8
story: 4
status: ready
date: 2026-10-19
version: 1
epic_preparation: epic-8-preparation.md
---

# Story Plan 8.4: Continuous integration on three operating systems

Reproducing statement: Plan pull-request checks on Windows, macOS and Linux with Node 24, the shared quality command, an informational advisory audit and documented required checks.

## Intent

Every PR gets the same reproducible quality verdict on all supported operating systems, while release-specific advisory enforcement remains distinct.

## Cross-story constraints

- Follow [Preparation](epic-8-preparation.md); consume 8.3's shared `pnpm check` and 8.1's committed migrations/assets.
- Root `engines` and `packageManager` are authoritative. CI uses an installed Node 24 and Corepack's pinned pnpm, never repo-local Node.
- 8.8 reuses the gate contracts; 8.6 records real platform quickstart evidence rather than inferring it from unit suites.

## Design decisions (this story)

Create `.github/workflows/ci.yml` with stable OS-specific job names, a three-platform matrix, frozen-lockfile install and the shared aggregate. Build native SQLite separately on each OS; cache package downloads only with OS/lockfile identity, not cross-platform native `node_modules`. Ensure Corepack is installed/available explicitly on Node 24 runners without replacing the root pnpm pin.

Run the vulnerability audit separately from blocking checks. A high advisory or registry/network failure is visible in the PR report, while the quality result still determines its own status. Do not put `continue-on-error` on installation/typecheck/tests/build/quality jobs or on a future release audit. Upload only sanitized summaries; scanner output must not expose secrets.

Use ordinary `pull_request` with read-only repository permissions, verified immutable Action SHAs and no provider credential secrets, privileged PR execution or automatic contributor messages. Document exact required job names and branch/ruleset setup. YAML cannot enforce repository settings; report settings as configured only after an authorized read/change supplies evidence.

## Task sequence

1. `.github/workflows/ci.yml`: create the OS/Node 24 matrix with root Corepack/pnpm, frozen install, native build and `corepack pnpm check`.
2. Add a separate informational audit job/step with explicit reporting of both advisories and scanner failures, independent of the blocking matrix.
3. Verify workflow permissions, event scopes, full-SHA Action references, cache isolation, exit behavior, Windows-compatible commands and no login/secret requirements.
4. `CONTRIBUTING.md` if created later, otherwise the existing runbook: record stable required-check names, setup instructions and distinction between workflow configuration and active branch protection. 8.5/8.6 carry this forward.
5. Validate workflow structure and local commands; when an authorized remote CI run exists, retain exact commit/job URLs and results for all three OSes. Do not create a PR/push solely to manufacture evidence without the applicable instruction.

## Preliminary code map

- New `.github/workflows/ci.yml`; existing `.github/ISSUE_TEMPLATE` is unrelated to job execution.
- Root `package.json`, `pnpm-lock.yaml`, `scripts/{setup,start,verify,runtime,processes}.mjs` and 8.3 check entrypoints.
- `scripts/{commands,failures,doctor}.test.mjs`, DB migration/Restore tests and existing serial performance/a11y suites.
- `docs/RUNBOOK.md`, future `CONTRIBUTING.md`; architecture AD-22.

## Acceptance outline

- **Given** a PR **When** matrix checks execute **Then** Windows/macOS/Linux each run typecheck, tests, build and every shared quality rule under Node 24.
- **Given** a quality failure **When** checks finish **Then** the OS job fails, and documented required-check configuration would block merging.
- **Given** a PR advisory or audit transport failure **When** audit reports **Then** its result is visible without weakening blocking quality jobs.
- **Given** the workflow **When** inspected **Then** Corepack respects the root pnpm pin, native modules stay OS-specific and PR code has no write-token/credential requirement.

## Out of scope

First remote push, changing branch settings without authorization, public release, real GitHub integration tests or claiming unexecuted platform/reader acceptance.

## Risks and mitigations

- Hosted runner differences can expose native permission/path failures: retain exact platform logs and repair the actual contract without broad skips.
- Corepack availability varies: explicitly provision it and verify the selected pnpm version.
- No remote CI execution yet: distinguish validated workflow source from executed three-platform evidence and keep outstanding evidence named.

## Open questions

None. Remote execution and branch protection are explicit operational prerequisites.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-19 | Three-platform checks, independent audit and permission/evidence boundaries |
