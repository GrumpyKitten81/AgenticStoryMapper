---
title: 'Persist Discovery zoom per Story Map'
type: 'bugfix'
created: '2026-11-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Discovery zoom resets to 100% after a page reload, interrupting planning at a chosen scale.

**Approach:** Persist zoom in browser storage by Story Map ID. Restore the matching value on reload and map navigation, with the current bounds and 100% default. Reset saves 100% for the current map. Keep Graph zoom separate and leave server APIs unchanged.

</frozen-after-approval>

## Implementation Notes

- Stored Discovery zoom by Story Map ID with Zustand persistence and validated values during rehydration.
- Updated controls and matrix consumers to select the displayed map's value. Reset writes 100% for that map.
- Added store and view regression tests. Focused tests: 26 passed; web typecheck and build passed.
- Browser: 101% survived reload and map navigation; another map stayed at 100%. Reset survived reload. At 390 px, controls wrapped without document overflow.

## Review Triage Log

- low: A dedicated automated UI test for switching maps was suggested. Store isolation is covered by regression tests, and both map UI states were verified in the browser; no additional fixture was needed for this focused fix.
- low: A dedicated automated button test for Reset was suggested. Store persistence and the Reset button were verified separately, including a browser reload after Reset.
- low: The spec was still in progress during review. Completed notes and status now record the finished verification.
