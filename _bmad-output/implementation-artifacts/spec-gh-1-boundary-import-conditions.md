---
title: Correct boundary scanner import conditions
type: bugfix
created: 2026-11-08
status: done
route: oneshot
baseline_commit: 9251840fb46d36006ff0ec8fc9c9d0c78d78c9e9
review_loop_iteration: 1
context: []
---

<frozen-after-approval>

## Intent

Correct the existing boundary scanner's conditional workspace-export checks. Preserve the loading mode of CommonJS import-equals and explicit type-only imports while allowing the appropriate types and loading-mode export branches. Respect ordered conditional resolution, unmatched nested conditions and explicit null denials. Keep runtime, mixed and side-effect dependencies subject to runtime export checks. Add positive and negative regressions through sourceImports and the real checkBoundaries consumer without changing application behavior, dependencies, package exports, thresholds or unrelated scanner policies. Follow the user's approved bounded release task; issue bookkeeping is separate and must distinguish completed work from remaining umbrella tasks.

</frozen-after-approval>

## Implementation Notes

- Investigation: sourceImports classifies import-equals as import and reduces explicit type imports to types without their loading mode. The original syntax test checks names/lines only. exportedValue conflates an unmatched nested condition with an explicit null denial.
- Reuse scripts/check-boundaries.mjs and boundaryFixture in scripts/quality-gates.test.mjs, plus dedicated static fixtures. Preserve layer/dependency/privacy checks and existing null/wildcard regressions.
- This small product change has no data migration or irreversible behavior. Authorized GitHub comments/closures occur only after verification; a release umbrella must not claim unfinished independent checks passed.
- Reference semantics: https://nodejs.org/api/packages.html#conditional-exports and https://www.typescriptlang.org/docs/handbook/modules/reference.html . This gate checks declared public access; it does not become a full compiler/module resolver.
- Implemented explicit `typeOnly` alongside import/require mode, including import-equals and resolution-mode attributes. Inline named type specifiers remain runtime imports because their declarations can retain side effects; mixed/empty/side-effect forms are regression controls. Type queries in .cts default to require, with explicit override retained.
- Conditional export traversal now distinguishes unmatched nested branches (continue) from explicit null denials (stop); array resolution preserves unmatched results and exact-subpath behavior remains under the existing contract.
- Verification: 29 quality-gate tests pass, including 17 dependency forms against 16 export maps with exact diagnostic lines. Actual repository boundary, size, hygiene and whitespace checks pass under Node24.17.0. No application/runtime/GUI changes, so no product-wide rebuild or browser run is required for this bounded script repair.

## Review Triage Log

- Medium, patched: entirely unmatched export arrays incorrectly became denials, blocking a later default. Confirmed with Node24.17.0 package self-reference: import resolves public.js and require resolves public.cjs. Array traversal now retains unmatched results, explicit denials and successful alternatives; four added cases cover unmatched, null in either position and empty arrays. Independent repair recheck found no further issues. No findings deferred.
- Final verification: all29 quality-gate tests pass, including272 form/export combinations; real repository boundary, size and hygiene checks pass. No unrelated gate thresholds, application code or package metadata changed.

- Delivery: fix6f598e11cc8485cca302fa49a7f571bb1bc12f54 is on origin/main. Issue4 completion comment and closure verified; issue1 scanner checkbox and completion comment verified, with the umbrella open for remaining tasks.
