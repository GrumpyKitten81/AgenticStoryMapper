---
epic: 6
story: 5
status: ready
date: 2026-10-17
version: 2
epic_preparation: epic-6-preparation.md
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Story Plan 6.5: Collapse, Card Keys and Notes

Reproducing statement: Prepare Story 6.5 as part of the requested Epic 6 consistency, open-decision and current-codebase assessment, incorporating the accepted selections 1A/2C/3A/4A/5A/6B/7C/8A/9C. Define ordered implementation tasks and acceptance checks without implementing the story.

## Intent

Persist Activity/Step collapse per map, expose Card Key prefix editing and ensure Notes do not enter delivery outputs.

## Cross-story constraints

- Accepted decision record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md), 2026-10-17.
- Apply the shared decisions and ownership table in [Epic 6 preparation](epic-6-preparation.md). This is a detail plan for dev step 02, not a runnable spec or implementation authorization.
- Preserve actor-aware use cases, root baseVersion checks, ChangeSet-first nonhuman writes, source provenance, live-update holds, Restore epochs and read-only preview behavior.
- All static interface text comes from the English string modules. Reuse existing Dialog/announcement/conflict components and query invalidation.

## Design decisions (this story)

- Depend on 6.2 Note placement, 6.3 focus recovery and 6.4 filtering; apply 2C retained Discovery Release/delivery fields and 5A visible-Story-only delivery metrics.
- Reuse Tree collapse persistence. Discovery Release-lane collapse is a separate existing preference and does not satisfy Activity/Step collapse.
- Update cardKeyPrefix through existing versioned Story Map API. Keep the stored monotonic counter; never derive next number from remaining Cards or rewrite existing keys/source bindings.
- Implement Note delivery exclusion in canonical pure calculations and consume it in reports/views. Board visibility must still include Notes. Existing push planning excludes Notes; protect it with regression tests.

## Task sequence

1. `app/stores/tree-collapse-store.ts; discovery-lane-collapse-store.ts; DiscoveryMatrix.tsx; TreeGrid.tsx`: Implement legal Activity/Step collapsed rendering and map-scoped persistence using existing UI-state patterns; preserve lane collapse and ensure hidden controls/droppables are inactive.
2. `RootLayout.tsx or existing Story Map settings; app/api.ts; ui-strings`: Expose prefix editing with StoryMap baseVersion and visible conflicts; test new keys after changing prefix.
3. `packages/core/src/reports/reports.ts; associated report contracts/tests`: Apply 5A visible-Story-only eligibility consistently to count/estimate/status/unestimated outputs; no additional all-Card delivery metric is required.
4. `packages/db/src/repositories/cards-repository.ts; work-item-repository.ts; core report tests`: Verify highest-key delete then create, prefix change/reopen, mixed Notes/Stories and Note push exclusion with public plan generation; do not replace the existing allocator.

## Preliminary code map

Concrete existing entry points (repository-relative); short filenames in the tasks refer to these paths:

- `apps/web/src/app/stores/tree-collapse-store.ts`
- `apps/web/src/app/stores/discovery-lane-collapse-store.ts`
- `apps/web/src/features/story-map/components/TreeGrid.tsx`
- `apps/web/src/features/story-map/components/DiscoveryMatrix.tsx`
- `apps/server/src/application/story-map/story-map.use-cases.ts`
- `packages/db/src/repositories/cards-repository.ts`
- `packages/db/src/repositories/work-item-repository.ts`
- `packages/core/src/reports/reports.ts`

Dev refines this map against actual implementation and relevant tests before changes; graph coverage is stale. Proposed new contracts/components/tests are design targets, not existing files.

## Acceptance outline

- Given two maps, when collapsing Activities/Steps and reloading, then each map retains its own state and the active focus stays visible or recovers predictably.
- Given existing linked Cards, when the prefix changes and a new Card is created, then only the new key uses the prefix and no existing key/ref changes.
- Given the highest key is deleted, when another Card is created/reopened, then its number is greater and never reused.
- Given Notes with estimates/status/Release, when push or delivery summary runs, then Notes are excluded while remaining visible on the map.

## Out of scope

Key renumbering, new hierarchy levels, shared synchronized UI preferences or removing Notes from the map.

## Risks and mitigations

Discovery hierarchy collapse retains the 2C Release-lane layout; retained hidden DOM must be excluded from drag, keyboard and accessible surfaces. Report eligibility must retain archived/parked ancestor rules.

## Open questions

None. The maintainer resolved all nine preparation questions on 2026-10-17. Apply the accepted decisions in the epic preparation and ADR 0007; readiness is planning readiness only.

## Changelog

- 2026-10-17 v1: Source-anchored detail plan; ownership, existing behavior, acceptance and open decisions reconciled with Epic 6 preparation.
- 2026-10-17 v2: Applied the maintainer's accepted decisions, resolved open planning questions and marked this detail plan ready. ETags/new Export navigation and binding Epic 6 timing gates remain outside scope.
