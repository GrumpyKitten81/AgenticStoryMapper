---
epic: 6
story: 6
status: ready
date: 2026-10-17
version: 2
epic_preparation: epic-6-preparation.md
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Story Plan 6.6: The five core Views

Reproducing statement: Prepare Story 6.6 as part of the requested Epic 6 consistency, open-decision and current-codebase assessment, incorporating the accepted selections 1A/2C/3A/4A/5A/6B/7C/8A/9C. Define ordered implementation tasks and acceptance checks without implementing the story.

## Intent

Finish distinct Discovery, Tree, Planning, Backlog and Tracking projections while preserving the delivered Slices/Graph and Experimental Timeline.

## Cross-story constraints

- Accepted decision record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md), 2026-10-17.
- Apply the shared decisions and ownership table in [Epic 6 preparation](epic-6-preparation.md). This is a detail plan for dev step 02, not a runnable spec or implementation authorization.
- Preserve actor-aware use cases, root baseVersion checks, ChangeSet-first nonhuman writes, source provenance, live-update holds, Restore epochs and read-only preview behavior.
- All static interface text comes from the English string modules. Reuse existing Dialog/announcement/conflict components and query invalidation.

## Design decisions (this story)

- Consume 6.2 field definitions, 6.3 traversal/focus, 6.4 filtering and 6.5 eligibility/collapse. Accepted 2C retains Discovery Release/status/estimate/priority fields; 5A fixes Story-only summaries and open Release defaults in Planning/Tracking/list.
- Discovery shows hierarchy, role labels and assigned Personas; under 2C it retains Release lanes, Workflow Status, estimate and priority, while making these fields accessible and map-unit-aware.
- Planning reuses SwimlaneGrid and verifies central priority plus businessValue/effort edits. Backlog emphasizes status/unit-aware estimates, preview and link indicators.
- Tracking reuses ReleaseKanban and the existing shared Release summary; 6.9 enhances that same component/contract. No new local totals implementation.
- Complete grid rows/cells/header spans/counts/selection/names and state descriptions using 6.3 primitives. If the grid cannot meet a concrete tested requirement, document the failure and deliver the already allowed complete table alternative; no speculative second board.

## Task sequence

1. `views/DiscoveryView.tsx; DiscoveryMatrix.tsx; DiscoveryLanes.tsx; CardTile.tsx`: Apply 2C retained delivery fields and legal Note layout, Persona display and accessible primary-action names; remove tile headings and expose changed/blocked/conflict descriptions.
2. `DiscoveryMatrix.tsx; CardTile.tsx`: Finish row/column counts, two-row headers/spans, lane headers and aria-multiselectable, aligned with actual visible traversal/collapse/filter order.
3. `views/PlanningView.tsx; SwimlaneGrid.tsx; views/BacklogView.tsx; BacklogList.tsx; TreeGrid.tsx`: Verify/edit intended per-view fields, central priority options, estimate units, link states, hierarchy and collapse without duplicating mutations.
4. `views/TrackingView.tsx; features/releases/ReleaseKanban.tsx; ReleasePanel.tsx`: Embed a shared summary projection, maintain current canonical dependency cues and effective Workflow Status columns, and apply agreed released focus.
5. `view DOM/router tests; components/card-detail.test.ts`: Test direct URLs/reload, five projections over one snapshot, all named cues, 1,000-Card visibility, preview read-only and live holds. Regress Slices/Graph rather than rebuilding them.

## Preliminary code map

Concrete existing entry points (repository-relative); short filenames in the tasks refer to these paths:

- `apps/web/src/features/story-map/views/DiscoveryView.tsx`
- `apps/web/src/features/story-map/views/PlanningView.tsx`
- `apps/web/src/features/story-map/views/BacklogView.tsx`
- `apps/web/src/features/story-map/views/TrackingView.tsx`
- `apps/web/src/features/story-map/components/TreeGrid.tsx`
- `apps/web/src/features/story-map/components/CardTile.tsx`
- `apps/web/src/features/releases/ReleaseKanban.tsx`
- `apps/web/src/features/releases/ReleasePanel.tsx`

Dev refines this map against actual implementation and relevant tests before changes; graph coverage is stale. Proposed new contracts/components/tests are design targets, not existing files.

## Acceptance outline

- Given the same map, when opening each core View URL, then it renders its specified English content and mutations still affect the same canonical Cards.
- Given Discovery, when inspected by keyboard/accessibility APIs, then headers, roles, selection, complete names and described states agree with the actual layout and traversal.
- Given Tracking, when selecting a Release, then summary and Kanban use the same eligible scope, including unconfigured statuses without dropping Stories.
- Given previews or incoming changes, when interacting, then readonly projections and held updates retain existing guarantees.

## Out of scope

Timeline completion, Graph/Slices redesign, per-View user settings or a new report/keyboard subsystem.

## Risks and mitigations

Changing generic CardTile can affect three board projections and exports. Test each variant and preserve full provenance/dependency/change cues. Grid semantics need real browser/manual evidence later in 6.10.

## Open questions

None. The maintainer resolved all nine preparation questions on 2026-10-17. Apply the accepted decisions in the epic preparation and ADR 0007; readiness is planning readiness only.

## Changelog

- 2026-10-17 v1: Source-anchored detail plan; ownership, existing behavior, acceptance and open decisions reconciled with Epic 6 preparation.
- 2026-10-17 v2: Applied the maintainer's accepted decisions, resolved open planning questions and marked this detail plan ready. ETags/new Export navigation and binding Epic 6 timing gates remain outside scope.
