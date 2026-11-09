---
epic: 6
story: 7
status: ready
date: 2026-10-17
version: 2
epic_preparation: epic-6-preparation.md
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Story Plan 6.7: Card detail as a deep-linkable modal

Reproducing statement: Prepare Story 6.7 as part of the requested Epic 6 consistency, open-decision and current-codebase assessment, incorporating the accepted selections 1A/2C/3A/4A/5A/6B/7C/8A/9C. Define ordered implementation tasks and acceptance checks without implementing the story.

## Intent

Preserve the working Card deep-link/history/Markdown behavior and finish editor accessibility and layered keyboard handling.

## Cross-story constraints

- Accepted decision record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md), 2026-10-17.
- Apply the shared decisions and ownership table in [Epic 6 preparation](epic-6-preparation.md). This is a detail plan for dev step 02, not a runnable spec or implementation authorization.
- Preserve actor-aware use cases, root baseVersion checks, ChangeSet-first nonhuman writes, source provenance, live-update holds, Restore epochs and read-only preview behavior.
- All static interface text comes from the English string modules. Reuse existing Dialog/announcement/conflict components and query invalidation.

## Design decisions (this story)

- The shared Dialog and real Card modal already exist. This is targeted completion, not a modal rewrite. Integrate 6.1 route focus and 6.3 tile fallback during the numbered wave.
- Preserve `?card` and any coexisting `preview` search state, dirty-close Save/Discard/Cancel, failed-save text and own/external live-update protections.
- Toolbar buttons use names Bold, Italic, Bullet list, Heading 2 with aria-pressed for formatting state; editor accessible name is Description and focus frame is visible.
- Shared Dialog currently handles Escape at document capture phase. Coordinate editor-first Escape at the owning layer so the first Escape leaves editing without triggering modal close; a later Escape follows the dirty-close flow. Do not rely solely on a bubbling editor handler.
- Continue tiptap-markdown serialization and existing GitHub canonical-body path; no HTML persistence or new editor library.

## Task sequence

1. `CardDetailModal.tsx; app/router.tsx; app/routes/story-map-shell.tsx`: Verify direct Card URLs on all Views, close/back/forward and preview coexistence; route changes must not bypass dirty-close or move focus behind a modal.
2. `DescriptionEditor.tsx; ui-strings/story-map.ts; styles/global.css`: Name editor/toggle controls, expose pressed states, retain focus visibility and implement the editor Escape handoff.
3. `components/Dialog.tsx; Dialog.test.ts`: Make only the focused coordination change needed for layered Escape; retain inert background, nested confirmations and opener/same-Card/board fallback.
4. `components/card-detail.test.ts; server/http/routes/card-markdown.test.ts`: Extend actual-router/editor tests where missing; verify Markdown fixture reaches Issue body generation without a live remote write, and retain failed-save/live draft regressions.

## Preliminary code map

Concrete existing entry points (repository-relative); short filenames in the tasks refer to these paths:

- `apps/web/src/features/story-map/components/CardDetailModal.tsx`
- `apps/web/src/features/story-map/components/DescriptionEditor.tsx`
- `apps/web/src/features/story-map/components/card-detail.test.ts`
- `apps/web/src/components/Dialog.tsx`
- `apps/web/src/components/Dialog.test.ts`
- `apps/server/src/http/routes/card-markdown.test.ts`
- `apps/web/src/app/router.tsx`

Dev refines this map against actual implementation and relevant tests before changes; graph coverage is stale. Proposed new contracts/components/tests are design targets, not existing files.

## Acceptance outline

- Given any supported View URL with a Card query, when reloading/back/forward, then modal state follows history and preserves unrelated search state.
- Given modal/dirty confirmation, when using Tab/Shift+Tab/Escape, then focus stays in the top layer and close restores opener, same Card or board fallback.
- Given focused description editing, when Escape is pressed, then focus leaves the editor first; subsequent Escape uses dirty-close handling.
- Given rich formatting saved then reloaded and projected to an Issue body fixture, then Markdown remains valid and toolbar/name states are accessible.

## Out of scope

Editor replacement, automatic-save behavior changes, new history schema or live GitHub mutation testing.

## Risks and mitigations

Capture-phase Escape is the main integration risk; existing 26 Card-detail and 12 Dialog tests pass. Preserve their guarantees and add actual editor-to-dialog assertions, not isolated key callback tests.

## Open questions

None. The maintainer resolved all nine preparation questions on 2026-10-17. Apply the accepted decisions in the epic preparation and ADR 0007; readiness is planning readiness only.

## Changelog

- 2026-10-17 v1: Source-anchored detail plan; ownership, existing behavior, acceptance and open decisions reconciled with Epic 6 preparation.
- 2026-10-17 v2: Applied the maintainer's accepted decisions, resolved open planning questions and marked this detail plan ready. ETags/new Export navigation and binding Epic 6 timing gates remain outside scope.
