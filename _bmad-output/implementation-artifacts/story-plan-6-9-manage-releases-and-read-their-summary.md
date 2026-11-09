---
epic: 6
story: 9
status: ready
date: 2026-10-17
version: 2
epic_preparation: epic-6-preparation.md
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Story Plan 6.9: Manage Releases and read their summary

Reproducing statement: Prepare Story 6.9 as part of the requested Epic 6 consistency, open-decision and current-codebase assessment, incorporating the accepted selections 1A/2C/3A/4A/5A/6B/7C/8A/9C. Define ordered implementation tasks and acceptance checks without implementing the story.

## Intent

Complete Release editing, consistent delivery summaries and released-item defaults across the relevant surfaces.

## Cross-story constraints

- Accepted decision record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md), 2026-10-17.
- Apply the shared decisions and ownership table in [Epic 6 preparation](epic-6-preparation.md). This is a detail plan for dev step 02, not a runnable spec or implementation authorization.
- Preserve actor-aware use cases, root baseVersion checks, ChangeSet-first nonhuman writes, source provenance, live-update holds, Restore epochs and read-only preview behavior.
- All static interface text comes from the English string modules. Reuse existing Dialog/announcement/conflict components and query invalidation.

## Design decisions (this story)

- Consume 6.3 moves, 6.4 bulk, 6.5 delivery eligibility and 6.6 Tracking summary slot. Apply accepted 5A: visible-Story-only metrics and default open Release scopes in list, Planning and Tracking, with show-all.
- Persist existing name/goal/startDate/releaseDate/released fields; status means the existing released:boolean. No new status enum or endDate column.
- Reuse core buildReleaseSummaryReport, existing report use case and ReleasePanel; extend one contracts schema for unestimated Story identities/keys/titles. Include estimate 0 correctly.
- Default hide-released behavior is a display scope, never deletion/unassignment. Keep explicit access to released items/history and Unscheduled. Apply on Release list, Planning and Tracking; Discovery retains its Release lanes. Do not unassign or delete data to implement this display rule.
- Reuse baseVersion-aware Release edits, Card versions on assignments and existing date/conflict patterns. All views invalidate the same reports after changes.

## Task sequence

1. `features/releases/ReleasePanel.tsx; ReleaseDateFields.tsx; app/api.ts`: Add complete create/edit controls for existing Release fields and mark-released action with accessible dates, pending/error/conflict handling.
2. `contracts report response; core/reports/reports.ts; server/application/report/report.use-cases.ts; db/repositories/releases-repository.ts`: Add unestimated Story list to canonical summary, expose status distribution and reuse approved eligibility. Do not recompute fallback totals with a different set of Cards.
3. `ReleasePanel.tsx; ReleaseKanban.tsx; views/TrackingView.tsx; PlanningView.tsx; BoardToolbar.tsx`: Share summary presentation and default open scope with an explicit show-all path, preserving assigned data and versioned moves/bulk behavior.
4. `release DOM tests; core/reports/reports.test.ts; DB release-report-data.test.ts`: Verify all fields/reopen, released default board/list behavior, zero estimates, Notes/parked/archived exclusion, status distribution and actual unestimated identities.

## Preliminary code map

Concrete existing entry points (repository-relative); short filenames in the tasks refer to these paths:

- `apps/web/src/features/releases/ReleasePanel.tsx`
- `apps/web/src/features/releases/ReleaseDateFields.tsx`
- `apps/web/src/features/releases/ReleaseKanban.tsx`
- `apps/web/src/features/releases/release-utils.ts`
- `packages/core/src/reports/reports.ts`
- `apps/server/src/application/report/report.use-cases.ts`
- `packages/db/src/repositories/release-report-data.test.ts`
- `packages/db/src/repositories/releases-repository.ts`
- `packages/contracts/src/schemas/domain.ts`

Dev refines this map against actual implementation and relevant tests before changes; graph coverage is stale. Proposed new contracts/components/tests are design targets, not existing files.

## Acceptance outline

- Given a Release, when creating/editing name/goal/start/end/released state, then current fields persist and stale edits show 409.
- Given assignment via drag/form/bulk, when committed, then Stories and Card versions change and both Release/Tracking summary refresh.
- Given mixed estimated/unestimated Stories and Notes, when reading the summary, then count/sum/status distribution/list use visible Stories only (5A), with zero estimated and all unestimated Stories listed.
- Given a released Release, when opening the default Release list, Planning and Tracking, then it is excluded but remains accessible through explicit historical/all scope.

## Out of scope

New Release lifecycle states, Focus Release/per-View settings from Later FR-12, new timeline design or GitHub milestone synchronization changes.

## Risks and mitigations

Current ReleasePanel contains local numeric fallbacks that can disagree with server eligibility. Remove ambiguity while preserving explicit pending/error states and existing release notes.

## Open questions

None. The maintainer resolved all nine preparation questions on 2026-10-17. Apply the accepted decisions in the epic preparation and ADR 0007; readiness is planning readiness only.

## Changelog

- 2026-10-17 v1: Source-anchored detail plan; ownership, existing behavior, acceptance and open decisions reconciled with Epic 6 preparation.
- 2026-10-17 v2: Applied the maintainer's accepted decisions, resolved open planning questions and marked this detail plan ready. ETags/new Export navigation and binding Epic 6 timing gates remain outside scope.
