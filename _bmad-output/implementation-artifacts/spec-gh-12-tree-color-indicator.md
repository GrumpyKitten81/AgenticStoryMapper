---
title: 'Show Card color categories in the hierarchy tree'
type: 'feature'
created: '2026-11-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '87ed5aff71178b3e81629ad560bad5ff3d490ab8'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The hierarchy tree hides each Card's stored color category, so users must open the Card or switch to the board to identify it.

**Approach:** Put a compact color indicator before the title inside the existing tree title button for Cards with an explicit `color`. Resolve the label from the displayed map's category names, falling back to the existing default name. Include the label in the button's accessible name and tooltip, and show it visibly in forced-colors mode. Preserve hierarchy, planning type, focus, selection, keyboard behavior, and narrow-screen scrolling. Read the displayed snapshot so live changes and ChangeSet previews update without extra state or backend changes.

</frozen-after-approval>

## Implementation Notes

Tree rendering lives in `apps/web/src/features/story-map/components/TreeGrid.tsx`, with styles in `apps/web/src/styles/discovery-board.css`. Reuse `cardColors` from `apps/web/src/features/story-map/card-visual-options.ts` with `state.snapshot.storyMap.colorCategoryNames`; `state.snapshot` is already the projected map in previews. `card.color` is optional, while the board's implicit white default is not an assignment. Extend focused tree tests, run Web typecheck, and inspect desktop, narrow, and forced-colors layouts in the browser. Keep existing `.wolf` changes outside the work.

The tree resolves the displayed map's palette once per render and passes each Card's category name into its existing title button. A small bordered swatch remains visible for explicit white; the button's accessible name and tooltip contain the category, while forced-colors CSS reveals its text label. Focused Web tests cover explicit colors, no color, live query refresh, and projected preview names. Web typecheck and build passed. Browser inspection at 1280px and 390px confirmed placement and scrolling; forced-colors behavior is specified by the stylesheet but browser emulation was unavailable in the connected test browser.

The independent review found two missing test cases. Both now pass: the preview changes the Card's stored color as well as its map-specific name, and a live category rename refreshes the accessible name and tooltip. `scripts/check-size.mjs` reports existing limits in Issue #15 files; none concern the Issue #12 files.

## Review Triage Log

| Finding | Verdict | Evidence and route |
| --- | --- | --- |
| Preview test did not change Card color | medium | The projected snapshot originally retained the persisted orange color. Patched the test to project blue and assert the swatch while persisted state remains orange. |
| Live name-only update was untested | medium | Existing test changed only the Card color. Patched it to update `colorCategoryNames` through the active query and assert name and tooltip refresh. |
| Forced-colors visual path unverified | maybe-false | CSS reveals the text and uses `CanvasText`; the connected browser cannot emulate forced colors. Native high-contrast rendering with a long custom name would settle layout behavior. Deferred verification. |
