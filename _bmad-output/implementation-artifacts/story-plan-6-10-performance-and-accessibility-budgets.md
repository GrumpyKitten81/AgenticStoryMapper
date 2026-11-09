---
epic: 6
story: 10
status: ready
date: 2026-10-17
version: 2
epic_preparation: epic-6-preparation.md
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Story Plan 6.10: Performance and accessibility budgets

Reproducing statement: Prepare Story 6.10 as part of the requested Epic 6 consistency, open-decision and current-codebase assessment, incorporating the accepted selections 1A/2C/3A/4A/5A/6B/7C/8A/9C. Define ordered implementation tasks and acceptance checks without implementing the story.

## Intent

Record reproducible diagnostic performance, add the required Card indexes through the current schema mechanism, and enforce integrated accessibility checks. The canonical story title/key stays unchanged; ETags and binding Epic 6 timing gates are deferred.

## Cross-story constraints

- Accepted decision record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md), 2026-10-17.
- Apply the shared decisions and ownership table in [Epic 6 preparation](epic-6-preparation.md). This is a detail plan for dev step 02, not a runnable spec or implementation authorization.
- Preserve actor-aware use cases, root baseVersion checks, ChangeSet-first nonhuman writes, source provenance, live-update holds, Restore epochs and read-only preview behavior.
- All static interface text comes from the English string modules. Reuse existing Dialog/announcement/conflict components and query invalidation.

## Design decisions (this story)

- Consume 6.1–6.9 behavior and accepted 7C/8A/9C. Full snapshot reads and current Query/live invalidation remain; add no ETag, aggregate cache revision, If-None-Match or 304 path.
- Current pre-release schema ownership is `packages/db/src/connection.ts` plus Drizzle declarations under AD-9. Add required Card indexes consistently; versioned baseline migrations stay in Story 8.1. Verify populated fixtures, reopening and current-schema Restore/integrity; do not introduce legacy compatibility or another migration framework.
- Record raw 1,000-Card timings for map read, committed Card mutation, board input-to-render and search/filter input-to-result. References 150/30/100/300 ms are diagnostic only; do not add timing-based acceptance/CI failures, 2x tolerances, statistical passing rules or a required five-run protocol.
- Preserve existing earlier-story Apply/Restore gates, raw failures and accepted exceptions; they are not retrospectively waived or newly introduced by this story.
- jsdom exists. Add only actually used axe-core/Testing Library dependencies; a dedicated suite fails on zero tests, meaningful accessibility violations and failed behavior assertions.
- Desktop >=768 px with 1.4.10 Reflow excluded remains the accepted scope. Real rendering/screen-reader checks stay manual and separate from axe/DOM/token tests; missing platform checks are explicitly unexecuted, never invented passes.

## Task sequence

1. `packages/db/src/schema/tables.ts; packages/db/src/connection.ts`: add `cards.story_map_id` and `cards.parent_id` indexes consistently through the current pre-release schema path. Keep existing indexes, counters and integrity rules; no cache-revision column or migration-framework work.
2. `packages/db/src/restore-validation.ts` and relevant DB/Restore tests: verify required indexes in populated fixtures and after reopen/current-schema Restore; preserve data and root/history invariants. Baseline migrations remain Story 8.1.
3. Existing 1,000-Card fixture and focused server/DB/web measurement suites: record actual map read, durable mutation, board input-to-render and search/filter input-to-result samples, environment/build/fixture and cold/warm context. Emit diagnostic results without timing-based failure; functional failures still fail.
4. `apps/web/package.json` and dedicated accessibility/CI suites: add used axe/Testing Library tooling; check five core Views plus Slices and Graph/table, Card/dirty-close layer, confirm and Move. Fail zero tests and meaningful violations; preserve normal test/typecheck/build checks.
5. `apps/web/src/styles/global.css` and token/behavior tests: recompute required contrast pairs; exercise grid traversal, all keyboard move paths, focus containment/restore, status messages and held live updates using actual components.
6. `README.md` and Story 6.10 evidence: state desktop accessibility scope; record actual keyboard UJ-1/UJ-3, rendered contrast/targets/sticky focus, 200% zoom, forced colors/reduced motion and screen-reader checklist results. Unavailable NVDA+Firefox or VoiceOver+Safari checks stay explicitly unexecuted.
7. Run appropriate focused suites, typecheck/build and `node scripts/verify.mjs`; retain independent earlier-story gates. Measurements do not authorize a server search endpoint or speculative optimization.

## Preliminary code map

Concrete existing repository paths:

- `packages/db/src/schema/tables.ts`
- `packages/db/src/connection.ts`
- `packages/db/src/restore-validation.ts`
- `packages/db/src/unit-of-work.ts`
- `apps/server/src/http/routes/story-map-routes.ts` (measurement target only; no ETag change)
- `apps/web/package.json`
- `apps/web/src/styles/global.css`
- `apps/web/src/components/Dialog.test.ts`
- `apps/web/src/features/story-map/components/card-detail.test.ts`
- `scripts/verify.mjs`

Dev refines fixture/suite locations from existing tests. Proposed diagnostic/accessibility suites are implementation targets, not already delivered gates.

## Acceptance outline

- Given the pinned 1,000-Card fixture, when performance diagnostics run, then every raw sample, measured boundary, environment and cold/warm context is recorded against 150/30/100/300 ms references; exceeding them does not fail Epic 6 acceptance/CI (9C).
- Given populated/reopened/current-schema restored databases, when inspected, then both required Card indexes exist consistently and integrity/data/root-version invariants hold (8A).
- Given full snapshot reads and live updates, when feature regression tests run, then existing behavior remains; no conditional-read or 304 support is required (7C).
- Given all required UI surfaces, when axe/behavior/token checks run, then nonzero meaningful tests pass names/roles/contrast/focus/traversal/move/status/live-hold assertions; actual defects still fail.
- Given accessibility evidence, when reviewing scope and manual findings, then executed platform checks and unexecuted ones are distinguished accurately. Earlier timing evidence is retained independently.

## Out of scope

ETags, aggregate cache revisions, If-None-Match/304 client support; binding Epic 6 latency gates or a new statistical pass rule; migration framework/baseline work belonging to Story 8.1; mandatory browser-runner infrastructure, mobile-wide WCAG claims, broad dependency upgrades or speculative optimization.

## Risks and mitigations

Diagnostic results do not prove a latency guarantee. Do not label over-reference results passing budgets or copy earlier accepted exceptions into new evidence. jsdom does not prove browser layout/screen-reader behavior. Adding indexes affects the development schema/Restore fingerprint: verify the approved current-schema path without inventing compatibility for old development data.

## Open questions

None. The maintainer resolved all nine preparation questions on 2026-10-17. Apply the accepted decisions in the epic preparation and ADR 0007; readiness is planning readiness only.

## Changelog

- 2026-10-17 v1: Source-anchored detail plan; ownership, existing behavior, acceptance and open decisions reconciled with Epic 6 preparation.
- 2026-10-17 v2: Replaced proposed cache/migration/timing-gate work with accepted diagnostic performance and current pre-release index path; accessibility acceptance remains binding. All planning decisions resolved.
