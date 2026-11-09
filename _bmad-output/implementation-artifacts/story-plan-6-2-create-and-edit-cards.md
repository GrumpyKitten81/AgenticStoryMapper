---
epic: 6
story: 2
status: ready
date: 2026-10-17
version: 2
epic_preparation: epic-6-preparation.md
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Story Plan 6.2: Create and edit Cards

Reproducing statement: Prepare Story 6.2 as part of the requested Epic 6 consistency, open-decision and current-codebase assessment, incorporating the accepted selections 1A/2C/3A/4A/5A/6B/7C/8A/9C. Define ordered implementation tasks and acceptance checks without implementing the story.

## Intent

Finish fast creation of Activities, Steps, Stories and Notes, complete unit-aware fields and accessible tile category/priority controls.

## Cross-story constraints

- Accepted decision record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md), 2026-10-17.
- Apply the shared decisions and ownership table in [Epic 6 preparation](epic-6-preparation.md). This is a detail plan for dev step 02, not a runnable spec or implementation authorization.
- Preserve actor-aware use cases, root baseVersion checks, ChangeSet-first nonhuman writes, source provenance, live-update holds, Restore epochs and read-only preview behavior.
- All static interface text comes from the English string modules. Reuse existing Dialog/announcement/conflict components and query invalidation.

## Design decisions (this story)

- Depend on 6.1 shell; apply 1A open+submit counting and 2C retained Discovery Release/status/estimate/priority fields, with Notes at legal root/Activity/Step positions.
- Existing taxonomy and priority/category constants are the shared definitions. Preserve arbitrary stored colors/priority strings instead of silently coercing existing data.
- Use existing Card create/update and relationship APIs. Notes obey core hierarchy and remain identifiable as Notes. Template-assisted create may require an explicit create contract extension; do not emulate atomic creation with a hidden create-then-update sequence.
- Card root versions advance; same-actor explicit saves may coalesce history rows under ADR0002. Linking sources/Personas/Annotations must continue producing owned-root versions.
- Display snapshot.storyMap.estimationUnit wherever estimate entry or output appears; do not hardcode points. Category popovers expose listbox/options/current choice and distinct glyph/text.

## Task sequence

1. `features/story-map/components/DiscoveryMatrix.tsx; TreeGrid.tsx; useStoryMapBoardState.ts`: Implement the agreed all-role composer path, including legal Note parent/root placement, without synthesizing titles or weakening hierarchy validation.
2. `CardTile.tsx; card-taxonomy.ts; card-visual-options.ts; ui-strings/story-map.ts`: Complete category glyph/text/current-value names and listbox semantics; priority badge contrast and central options; retain Discovery delivery fields under 2C.
3. `CardDetailModal.tsx; DescriptionEditor.tsx; TreeGrid.tsx; features/releases/ReleaseKanban.tsx`: Verify every named field can save, clear where contracts allow, and reload; use map estimation unit in forms and applicable outputs.
4. `BoardToolbar.tsx`: Replace the bulk free-hex input with the existing category selector contract; 6.4 owns color filtering and the rest of bulk semantics.
5. `components/card-detail.test.ts; contracts/api/card-customization.ts; db/repositories/root-versions.test.ts`: Add focused role/field/unit/relationship regressions where missing; exercise version increases and coalesced history without requiring one row per Save.

## Preliminary code map

Concrete existing entry points (repository-relative); short filenames in the tasks refer to these paths:

- `apps/web/src/features/story-map/components/DiscoveryMatrix.tsx`
- `apps/web/src/features/story-map/components/CardTile.tsx`
- `apps/web/src/features/story-map/components/CardDetailModal.tsx`
- `apps/web/src/features/story-map/components/BoardToolbar.tsx`
- `apps/web/src/features/story-map/card-visual-options.ts`
- `apps/web/src/features/story-map/card-taxonomy.ts`
- `packages/contracts/src/api/card-customization.ts`
- `packages/db/src/repositories/root-versions.test.ts`

Dev refines this map against actual implementation and relevant tests before changes; graph coverage is stale. Proposed new contracts/components/tests are design targets, not existing files.

## Acceptance outline

- Given each legal Card role/context, when created using open, text entry and submit (1A), then its text role, parent, position and optional Release persist within two control actions, excluding text entry inside the form.
- Given each specified scalar or relationship, when saved then reloaded, then its actual value and Card version persist; history follows AD-7/ADR0002.
- Given a non-points map and zero estimate, when editing/rendering, then the configured unit and zero survive.
- Given category/priority controls, when operated by keyboard, then current state, names and selection are accessible and priority text meets 4.5:1.

## Out of scope

New category taxonomy, attachments redesign, per-View display settings, one-history-row-per-save changes or source import formats.

## Risks and mitigations

Clearing optional numeric fields and preserving unknown existing visual values need exact contract checks; test empty, 0 and non-points values. 6.7 owns editor Escape/toolbar details.

## Open questions

None. The maintainer resolved all nine preparation questions on 2026-10-17. Apply the accepted decisions in the epic preparation and ADR 0007; readiness is planning readiness only.

## Changelog

- 2026-10-17 v1: Source-anchored detail plan; ownership, existing behavior, acceptance and open decisions reconciled with Epic 6 preparation.
- 2026-10-17 v2: Applied the maintainer's accepted decisions, resolved open planning questions and marked this detail plan ready. ETags/new Export navigation and binding Epic 6 timing gates remain outside scope.
