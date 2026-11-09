---
epic: 6
story: 3
status: ready
date: 2026-10-17
version: 2
epic_preparation: epic-6-preparation.md
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Story Plan 6.3: Move Cards by mouse, keyboard or form

Reproducing statement: Prepare Story 6.3 as part of the requested Epic 6 consistency, open-decision and current-codebase assessment, incorporating the accepted selections 1A/2C/3A/4A/5A/6B/7C/8A/9C. Define ordered implementation tasks and acceptance checks without implementing the story.

## Intent

Provide equivalent pointer, keyboard and form moves, plus Discovery traversal and predictable focus after changes.

## Cross-story constraints

- Accepted decision record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md), 2026-10-17.
- Apply the shared decisions and ownership table in [Epic 6 preparation](epic-6-preparation.md). This is a detail plan for dev step 02, not a runnable spec or implementation authorization.
- Preserve actor-aware use cases, root baseVersion checks, ChangeSet-first nonhuman writes, source provenance, live-update holds, Restore epochs and read-only preview behavior.
- All static interface text comes from the English string modules. Reuse existing Dialog/announcement/conflict components and query invalidation.

## Design decisions (this story)

- Depend on 6.2 stable tile identities; Accepted 2C retains Release lanes, status, estimate and priority; Notes remain in legal root/Activity/Step positions. 6.6 consumes these primitives rather than introducing another keyboard model.
- Extend MoveAreaDialog into parent/position/Release selection and use the existing api.moveCard/application move use case for all three move modalities. Park/unpark retain their separate lifecycle commands.
- Explicit pointer-only sensors must cover DiscoveryMatrix, SwimlaneGrid, BacklogList and SlicesView; DndContext defaults can otherwise still admit keyboard drag.
- Roving focus is on the tile primary action. Scope arrows/Home/End/Ctrl+Home/End/PageUp/PageDown/Enter/Space/m/Delete to event.target===event.currentTarget. Secondary controls of inactive tiles leave tab order; Escape returns to active tile.
- Preserve live holds and skip hidden/collapsed Cards; focus restoration uses stable id, next/previous prior-order sibling, then grid. This story implements the shared atomic selected-set Delete primitive and confirmation needed by its own keyboard contract. Story 6.4 reuses the primitive from the bulk toolbar and adds hidden-selection retention; no future-story dependency is required to close 6.3. Never emulate atomic Delete with individual HTTP requests.

## Task sequence

1. `DiscoveryMatrix.tsx; DiscoveryLanes.tsx; CardTile.tsx`: Define visible traversal order, stable active Card identity, focus-scoped keys and secondary-control tabbing from EXPERIENCE. Include row/header/add-cell controls without duplicate grid tab stops.
2. `MoveAreaDialog.tsx; useStoryMapBoardState.ts; app/api.ts`: Add full legal parent/position/Release form; normalize pointer/form targets into MoveCardRequest with current Card version and existing conflict rendering.
3. `DiscoveryMatrix.tsx; BacklogList.tsx; SwimlaneGrid.tsx; views/SlicesView.tsx`: Use pointer-only sensors; retain drag live holds and readonly behavior. Ensure equivalent form moves for every exposed reorder/reparent/assignment action.
4. `CardTile.tsx; LifecycleDialog.tsx; app/live/live-interaction-store.ts`: Implement operation focus continuity and one result announcement; Delete follows confirmed lifecycle intent and accepted 3A retained-selection semantics and separate Archive/Delete.
5. `packages/contracts/src/api/card-customization.ts; apps/server/src/application/card/card.use-cases.ts; packages/db/src/repositories/cards-repository.ts; core operation registry; app/api.ts`: implement the shared typed atomic selected-set Delete command and full-scope confirmation used by the Delete key. Validate all versions/ownership/affected child roots, normalize overlapping selected subtrees once and preserve HTTP/MCP/manifest parity. Keep Archive separate.
6. `packages/core/src/story-map/hierarchy.test.ts; apps/server/src/http/routes; web DOM tests`: Verify illegal moves, sibling order, Activity Event, same-card two-client conflict, all key traversal paths, no control-event shortcuts and focus after refetch/filter/collapse.

## Preliminary code map

Concrete existing entry points (repository-relative); short filenames in the tasks refer to these paths:

- `apps/web/src/features/story-map/components/DiscoveryMatrix.tsx`
- `apps/web/src/features/story-map/components/DiscoveryLanes.tsx`
- `apps/web/src/features/story-map/components/MoveAreaDialog.tsx`
- `apps/web/src/features/story-map/components/SwimlaneGrid.tsx`
- `apps/web/src/features/story-map/components/BacklogList.tsx`
- `apps/web/src/features/story-map/views/SlicesView.tsx`
- `apps/server/src/application/card/card.use-cases.ts`
- `packages/core/src/story-map/hierarchy.ts`
- `packages/contracts/src/api/card-customization.ts`
- `packages/db/src/repositories/cards-repository.ts`
- `apps/web/src/app/api.ts`

Dev refines this map against actual implementation and relevant tests before changes; graph coverage is stale. Proposed new contracts/components/tests are design targets, not existing files.

## Acceptance outline

- Given the same legal move by drag, keyboard or form, when committed, then parent/position/Release and audit result are equivalent.
- Given Story-under-Activity or Step-under-Step, when attempted, then a visible reason appears and nothing changes.
- Given a stale second client, when moving, then 409 is shown without silently using the latest server version.
- Given the focused tile is selected, when Delete is pressed and the full target/child strategy is confirmed, then the selected set uses the shared atomic command; otherwise Delete targets the focused tile only. A stale selected target aborts the action with all conflicts and no partial effects.
- Given a tile and its controls, when traversed/moved/removed, then focus and announcements follow EXPERIENCE; typing m/Delete in editors never moves/deletes Cards.

## Out of scope

Changing hierarchy rules, treating park as reparent, new global shortcuts or redesigning Graph keyboard behavior.

## Risks and mitigations

Focus recovery interacts with Dialog and live holds. Test actual refetch/remount and hidden retained DOM, not only direct callback invocation.

## Open questions

None. The maintainer resolved all nine preparation questions on 2026-10-17. Apply the accepted decisions in the epic preparation and ADR 0007; readiness is planning readiness only.

## Changelog

- 2026-10-17 v1: Source-anchored detail plan; ownership, existing behavior, acceptance and open decisions reconciled with Epic 6 preparation.
- 2026-10-17 v2: Applied the maintainer's accepted decisions, resolved open planning questions and marked this detail plan ready. ETags/new Export navigation and binding Epic 6 timing gates remain outside scope.
