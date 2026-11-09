---
epic: 6
story: 4
status: ready
date: 2026-10-17
version: 2
epic_preparation: epic-6-preparation.md
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Story Plan 6.4: Search, filter and bulk actions

Reproducing statement: Prepare Story 6.4 as part of the requested Epic 6 consistency, open-decision and current-codebase assessment, incorporating the accepted selections 1A/2C/3A/4A/5A/6B/7C/8A/9C. Define ordered implementation tasks and acceptance checks without implementing the story.

## Intent

Complete cached-map search/filter predicates and accessible, atomic actions over an explicit retained selection.

## Cross-story constraints

- Accepted decision record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md), 2026-10-17.
- Apply the shared decisions and ownership table in [Epic 6 preparation](epic-6-preparation.md). This is a detail plan for dev step 02, not a runnable spec or implementation authorization.
- Preserve actor-aware use cases, root baseVersion checks, ChangeSet-first nonhuman writes, source provenance, live-update holds, Restore epochs and read-only preview behavior.
- All static interface text comes from the English string modules. Reuse existing Dialog/announcement/conflict components and query invalidation.

## Design decisions (this story)

- Depend on 6.2 category controls and 6.3 focus/announcement contract. Accepted 3A defines retained hidden selection, separate Archive/Delete with explicit child-strategy choice and selected-set Dry Run handoff.
- Keep filtering client-side over the cached snapshot. Add color to BoardFilters; include current remoteWorkItemLinks alongside legacy githubLinks for search, link presence and Sync State.
- Separate matchingCardIds, visibleCardIds (including context ancestors) and selected IDs. Keep filtered-out selections, announce hidden selected count and show full target count before action. Prune deleted/inaccessible Cards and reset selection on map change.
- Retain existing atomic bulk patch and all-conflict 409 behavior. Reuse the shared typed atomic Delete command/confirmation delivered in 6.3; do not add another delete command or Promise.all over individual deletes. Preserve ChangeSet parity if a new public mutation is introduced.
- Push confirmation is the existing Dry Run flow scoped to selected Cards, never a direct network side effect from the bulk bar.

## Task sequence

1. `useStoryMapBoardState.ts; BoardToolbar.tsx`: Add color predicate/control, complete Source/GitHub/remote-link search and combined predicates; keep hierarchy context separate from matches.
2. `useStoryMapBoardState.ts; CardTile.tsx`: Replace filter-driven selection loss with explicit retained selection; wire accessible checkbox names, match/hidden-selection status and a labelled bulk region before the board.
3. `contracts/api/card-customization.ts; server/application/card/card.use-cases.ts; db repositories; core operation registry`: Consume the accepted 3A atomic Delete contract/confirmation delivered in 6.3 from the bulk toolbar, passing the complete retained target set. Verify all stale-target/ownership/child effects use that same command; do not introduce a second backend surface.
4. `BoardToolbar.tsx; features/github-sync/GitHubSyncPanel.tsx`: Add agreed selected-set actions and shared destructive confirmation; hand push selection to Dry Run/confirm without bypassing safety or Notes exclusion.
5. `web filter/bulk DOM tests; server bulk regressions; db rollback tests`: Cover combined predicates, literal filter sentinel values, hidden selected targets, overlapping parents/children, one stale target among many and all-conflict output; record raw input-to-result timings on 1,000 Cards diagnostically under 9C; do not fail acceptance/CI on timing.

## Preliminary code map

Concrete existing entry points (repository-relative); short filenames in the tasks refer to these paths:

- `apps/web/src/features/story-map/useStoryMapBoardState.ts`
- `apps/web/src/features/story-map/components/BoardToolbar.tsx`
- `apps/web/src/features/story-map/components/CardTile.tsx`
- `apps/web/src/features/github-sync/GitHubSyncPanel.tsx`
- `packages/contracts/src/api/card-customization.ts`
- `apps/server/src/application/card/card.use-cases.ts`
- `apps/server/src/application/base-versions.ts`
- `packages/db/src/repositories/cards-repository.ts`

Dev refines this map against actual implementation and relevant tests before changes; graph coverage is stale. Proposed new contracts/components/tests are design targets, not existing files.

## Acceptance outline

- Given title/description/chunk/note/GitHub/current remote links, when searched with combined filters, then only true matches plus necessary ancestors render, with an accurate match count.
- Given hidden selected Cards, when filtering then applying, then selection/count/targets include the complete retained selection under 3A and no silent deselection occurs.
- Given two or more stale selected Cards, when bulk patch/delete runs, then all conflicts are listed and no targeted change, history or event partially commits.
- Given destructive delete or push, when invoked, then explicit confirmation or reviewed Dry Run precedes the action.
- Given 1,000 Cards, when typing/filtering, then raw timings, fixture/environment and cold/warm context are recorded against the diagnostic 300 ms reference; no timing-based acceptance/CI gate applies (9C).

## Out of scope

New server search without separately scoped authorization, guided credential setup, sync algorithm replacement or automatic GitHub push.

## Risks and mitigations

Missing color and current-link predicates are real gaps; ancestor visibility and sentinel collisions can produce misleading results. Exercise exact IDs, unknown values and source-link kinds.

## Open questions

None. The maintainer resolved all nine preparation questions on 2026-10-17. Apply the accepted decisions in the epic preparation and ADR 0007; readiness is planning readiness only.

## Changelog

- 2026-10-17 v1: Source-anchored detail plan; ownership, existing behavior, acceptance and open decisions reconciled with Epic 6 preparation.
- 2026-10-17 v2: Applied the maintainer's accepted decisions, resolved open planning questions and marked this detail plan ready. ETags/new Export navigation and binding Epic 6 timing gates remain outside scope.
