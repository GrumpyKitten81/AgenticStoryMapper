---
epic: 8
story: 3
status: ready
date: 2026-10-19
version: 1
epic_preparation: epic-8-preparation.md
---

# Story Plan 8.3: Quality gate scripts

Reproducing statement: Plan one blocking local quality command using existing checks plus complete boundaries, size, coverage, hygiene, classification and MIT-compatible license checks.

## Intent

A contributor runs `corepack pnpm check` and receives actionable file/package diagnostics for every required local quality rule, with a nonzero result on failure.

## Cross-story constraints

- Follow [Preparation](epic-8-preparation.md); consume 8.1 migration infrastructure and 8.2's final dependency/test stack.
- Use MIT as the selected license independently of whether 8.5 has already written `LICENSE`.
- Keep the blocking quality command separate from the online advisory audit so 8.4 can report that audit without blocking PRs; 8.8 blocks releases on both.
- Epic 7 retrospective A6 feature-public-API violations are relevant gate failures; unrelated deferred domain behavior remains outside scope.

## Design decisions (this story)

Extend `scripts/check-hygiene.mjs`, `scripts/verify.mjs` and existing capability/classification checks rather than copying them. Use the existing TypeScript dependency to parse TS/TSX/JS imports and function spans; include re-exports, dynamic literal imports, `require`, workspace subpaths and feature index boundaries. Compare actual package usage/declarations, with a finite documented distinction for test/build tools. No broad dependency or feature exemptions.

Measure source bytes as UTF-8 (100,000 max), physical lines (750 max) and functions (50 max), including arrow/method/nested functions and components. Handle LF/CRLF consistently and report starting location plus measured span. Generated/vendor/build outputs are distinct from authored code; do not classify an oversized authored file as generated to pass. Fix only concrete violations required by these checks with behavior-preserving extraction.

Require at least 60% line coverage separately for every logic-bearing application/package; include untested intended source, not only imported files. A missing report, zero matching tests or absent instrumented source must fail for a logic package. Explicit no-logic classification needs evidence, not `--passWithNoTests`. Configure coverage against the upgraded Vitest version and preserve serial performance suites, a11y and capability verification.

Classify all declared and physical business tables exactly once. The 8.1 migration journal is separately named infrastructure, not a new business aggregate or a wildcard exemption. Retain Sync redaction and row-level provider-reference redaction checks.

Use tracked-file content scanning with safe category/path/line diagnostics; never echo matched secrets. Check user-data paths/extensions and English UI strings/seeds/templates. Full-history disposition remains 8.7. Resolve license expressions from actual dependency metadata; fail missing/unknown/disallowed licenses with package/version, and accept a dual expression only when an explicitly compatible option is available.

## Task sequence

1. Root `package.json`, proposed `scripts/check.mjs`: compose all required gates with existing `processes.mjs` exit/signal behavior; keep `verify.mjs` release checks authoritative or shared, not divergent.
2. Proposed `scripts/check-boundaries.mjs` plus focused fixtures: implement workspace declarations/usage, layer diagram, DB-only native/ORM access, pure core and web feature public entrypoint checks. Include actual existing modules and fix exposed violations minimally.
3. Proposed `scripts/check-size.mjs`: implement complete line/byte/function checks and exact diagnostics; consolidate the existing partial size gate without weakening its behavior.
4. `packages/db/src/schema/classification.ts`, `snapshot.test.ts`: integrate 8.1 journal classification and duplicate/missing table coverage, keeping physical and declared-schema checks.
5. Workspace test manifests/configs: add compatible coverage instrumentation and per-package floors with complete includes; report missing evidence explicitly. Add meaningful missing behavior coverage where required, not implementation-mirroring tests.
6. `scripts/check-hygiene.mjs`, existing tests, proposed license-check helper and explicit allowlist: add safe tracked secret/data checks and resolved-license expression validation.
7. Root aggregate: run typecheck, tests/coverage, build, capability parity, boundary/size/classification/hygiene/license and serial release checks. Inject failures for every rule, missing tool/report and child-process error; prove nonzero propagation and clean passing actual tree.

## Preliminary code map

- Existing `scripts/{check-hygiene,check-capabilities,verify,processes,runtime}.mjs` and their tests; `scripts/capability-scan.mjs` uses the TypeScript compiler already.
- `packages/db/src/{schema/classification.ts,snapshot.test.ts,unit-of-work.test.ts}`: existing classification/import/partial size coverage.
- Workspace manifests and existing `vitest.config.ts` files; server `test:audit-performance`, web `test:a11y`/`test:diagnostics`.
- `apps/web/src/features/*/index.ts` and concrete cross-feature imports; `apps/server/src/application/sync` dependency cycle assessment.
- Architecture spine AD-1, AD-17, AD-19 and AD-22; `.cursor/rules/code.mdc`.

## Acceptance outline

- **Given** each forbidden dependency/import/layer/feature relation **When** checked **Then** the gate names its source and fails, including undeclared and unused workspace dependencies.
- **Given** 751 lines, 100,001 bytes or a 51-line function **When** checked **Then** the exact location fails; legal boundary cases pass.
- **Given** a missing/duplicate aggregate assignment or new unknown business table **When** classification runs **Then** it names the table and fails; the exact migration journal remains infrastructure.
- **Given** a logic package below 60% or without a valid coverage report **When** checking **Then** failure cannot be hidden by an aggregate percentage or no-tests success.
- **Given** tracked secret/data/non-English seed or string violations **When** scanning **Then** the gate fails without printing secret values.
- **Given** missing or incompatible dependency license information **When** checked **Then** the offending package/version fails the MIT-compatible allowlist.
- **Given** any child check failure **When** `pnpm check` runs **Then** it exits nonzero; the actual passing tree executes every required check.

## Out of scope

SaaS scanning, changing performance thresholds, full-history rewrite, online audit blocking PRs, unrelated domain improvements or broad exception baselines.

## Risks and mitigations

- Required gates may expose substantial inherited violations: inventory them early and repair only the demonstrated gate scope; do not silently lower thresholds.
- Regex-only imports/functions miss real syntax: use parser fixtures with aliases, subpaths, re-exports and callbacks.
- Coverage and server tests both build web: sequence shared builds and serial benchmarks to avoid dist replacement races.

## Open questions

None. Exact helper decomposition and currently exposed violation counts belong to dev step 02.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-19 | Existing-check reuse, complete rule semantics and per-package coverage plan |
