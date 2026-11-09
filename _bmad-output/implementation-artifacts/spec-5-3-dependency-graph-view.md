---
title: Dependency graph view
type: feature
created: 2026-10-15
version: 3
status: done
baseline_revision: 9505074e32397053876bb392c9320efeb8aa8a46
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred: []
---

# Story 5.3: Dependency graph view

Reproducing statement: Run bmad-build-auto for 5-3-dependency-graph-view using Epic 5 preparation and completed 5.2 continuity; implement and independently verify without writing, staging or reverting orchestrator-owned sprint-status.yaml or deferred-work.md. Date: 2026-10-15. Version: 3. Changelog: Repeated actual browser acceptance after follow-up patches on current HEAD; native trusted filters and deferred historical coverage distinguished.

<intent-contract>

## Intent

**Problem:** Users cannot inspect Card dependency relationships as a filtered graph or equivalent accessible table.

**Approach:** Add the map-scoped Graph route with local directed layout, shared canvas/table filters and selection, canonical named blockers, and focus-scoped keyboard and pointer navigation.

## Boundaries & Constraints

**Always:** Use contracts as schema source, pure core shared blocker/order rules, configured workflow done groups and canonical snapshot dependencies (dependent -> prerequisite). Cover every Card level; use active visibleCards hierarchy for nodes while retaining canonical hidden prerequisite identities in details/blockers. Reuse shell live/preview/dirty-modal behavior. English strings in shared ui-strings. No color-only information: Selected, Requires, Required by, named Blocked order and open prerequisites. Exact pinned layout package with primary-source version/maintenance/license evidence and an explicit MIT-compatible license check of the added runtime dependency closure using pnpm licenses list. Actual isolated browser acceptance measures selection/filter/pan <=100ms for 200 Cards after layout, with layout separately measured; no inherited timing exception.

**Never:** Write/stage/revert sprint-status.yaml or deferred-work.md or infer acceptance from their rows; mutate user data; push; introduce dependency editing, cloud layout, SaaS/telemetry or runtime outbound calls; change dependency ownership/history or immutable Plan-state semantics; fabricate browser/timing evidence. No commit is authorized by this invocation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Map scope/visibility | All Card levels, archived/parked hierarchy, another map | Only active current-map nodes; directed edges where both endpoints are visible | Canonical hidden prerequisites remain named in blocker/details, not dangling rendered edges |
| Filters | Activity ancestry including Activity itself, Slice including Unscheduled, status, assignee including Unassigned | AND intersection; exact matching node set shared by both representations; visible edge set has both endpoints in set; polite node/edge count | Empty result explicit, no stale selection/details when selected Card leaves dataset |
| Selection | Dependent with multiple prerequisites and dependents | Selected/Requires/Required by words; shared selection persists across representation toggle; canonical related keys/details and blockers available in both | Out-of-filter relationships identified as such; no hidden endpoint invented |
| Blockers/order | Configured custom done group; later/unscheduled or archived prerequisite | Every matching blocked Card names every open prerequisite; Blocked order distinct from open/completion and consistent with Slices | Missing canonical endpoint fails visibly, no swallowed error |
| Keyboard | Focus canvas/node versus filter/other control | Arrows pan, +/- zoom inside canvas only; Tab nodes in prerequisite-first topological order with title then ID tie-break; Enter selects | Shift+Tab reverses natural traversal; no trap at boundaries; focus remains visible during traversal |
| Pointer | Drag background, choose node | Pan changes viewport without selection; node click selects, explicit Open Card uses shared modal | Pointer cancellation ends drag; modal retains preview/dirty guards |
| Table | Toggle aria-pressed | Standard four-column Card/Depends on/Required by/Blocked order table; one row per displayed directed edge plus isolated Card rows; canonical related/blocker details and selection same as canvas | Hidden representation unmounted or inert and absent from tab order; filter changes retain valid focus |
| Canonical update | Live refetch, Restore, preview | Recompute edges/cues from supplied scoped snapshot, clear missing selection and stale relations | No Graph persistence or writes except explicit existing modal edits |

</intent-contract>

## Code Map

- `apps/web/src/app/router.tsx` — register Graph under storyMapShellRoute, matching slicesRoute; new `app/routes/story-map.graph.tsx` renders GraphView.
- `apps/web/src/app/routes/story-map-shell.tsx` — navigation after Slices, analysis divider; preserve URL search/preview. `getStoryMapViewKind` is export support, do not extend export feature for Graph.
- `apps/web/src/features/story-map/useStoryMapBoardState.ts` — useStoryMapBoardStateContext supplies scoped snapshot/live/preview state. Existing BoardFilters has no Activity/assignee and retains ancestors, unsuitable for exact graph filters.
- `packages/core/src/reports/slices.ts:dependencyCues` — extract pure reusable dependency analysis for all active Card levels in new `reports/dependency-cues.ts`; Slices continues choosing storyIds. Canonical endpoint lookup, Release position/ID ordering, null Infinity and configured done groups stay identical. Export through `packages/core/src/index.ts`.
- `packages/core/src/story-map/visibility.ts:visibleCards` — active hierarchy; canonical Card.assignee is optional. New web `features/story-map/graph/graph-model.ts` filters/orders graph nodes/edges and relationships; no duplicated contract schemas.
- New `features/story-map/views/GraphView.tsx`, `graph/GraphCanvas.tsx`, `graph/GraphTable.tsx`, `graph/graph-layout.ts` — shared state/model, directed local layout, pointer/keyboard viewport, node chips, named relationship/blocker information. Split cohesive components/helpers to stay within code size limits.
- `apps/web/src/ui-strings/story-map.ts`, new `styles/graph.css` — shared interface copy and existing design token styling, visible focus, level badges, arrows and words, accessible table/count/empty state.
- `apps/web/src/features/story-map/components/SliceDependencyCues.tsx` — existing cue conventions and grouping reuse where suitable.
- `apps/web/src/features/story-map/views/SlicesView.test.tsx`, `components/card-detail-test-fixture.ts` — existing full-router mount/fetch fixture patterns for new Graph tests; read actual tests before implementation.
- `apps/web/package.json`, `pnpm-lock.yaml` — pin @dagrejs/dagre 3.1.1 (bundled TypeScript, sole runtime dependency @dagrejs/graphlib 4.0.5). No graph MCP tools exposed in this session; source investigation used instead.
- Read-only: sprint/deferred ledgers, user local-projects, completed 5.1/5.2 semantics and timing evidence. Preparation and story-plan-5-3 constrain design; EXPERIENCE.md:201 requires edge rows; DESIGN.md:275 defines chips and words.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/package.json`, `pnpm-lock.yaml` — install exact layout dependency after verifying official sources/license closure; record commands/evidence here.
- [x] `packages/core/src/reports/dependency-cues.ts`, `reports/slices.ts`, `index.ts` and focused tests — share canonical cues without changing Slices Story filtering; test configured completion and ordering independently for every Card level.
- [x] Web graph model/layout/components/styles/strings above — implement shared filters/selection, canvas/table parity, named canonical relationships and blockers, focus/pointer/keyboard controls.
- [x] Router/shell/new route above — integrate map URL/navigation and existing shared modal via explicit Open Card action. Local graph selection must not use search.card, which opens the modal immediately.
- [x] New Graph model/mounted-route tests — execute every matrix row, including empty/hidden endpoints, multiple edges, keyboard boundaries/outside controls, pointer cancellation, refetch/preview, toggle shared state and modal opening.
- [x] Configured checks, matrix audit, independent review and actual isolated browser — verify final behavior and measured 200-Card budgets; record actual counts, logs and failed timing samples.

**Acceptance Criteria:**

- Given a map with dependencies across Card levels, when opening its /graph URL through navigation or directly, then nodes, directed edges and Activity/Slice/status/assignee filters work on the same table/canvas dataset.
- Given a selected Card or a blocked Card, when viewing either representation, then named prerequisites/dependents, selection words and all open prerequisite keys are available independently of color or filtering away an endpoint.
- Given keyboard-only use, when traversing nodes, selecting, panning/zooming and toggling table, then focus is visible, traversal is dependency then title order, hidden controls leave tab order and shortcuts remain scoped to canvas.
- Given 200 Cards and edges in the actual isolated browser after layout, when selecting/filtering/panning, then each measured response is <=100ms and layout duration is reported separately.
- Given the installed layout closure, when checking versions and licenses, then exact pinned version, current maintenance primary sources and MIT-compatible allowlist result are recorded.

## Spec Change Log

## Review Triage Log

### 2026-10-15 — Review pass
- verdicts: 19 findings — high 0, medium 7, low 3, false 9, maybe-false 0
- findings:
  - `[medium]` `[patch]` Edge: actual assignee named unassigned collides — Confirmed equal option/model values. Encoded real values as assigned:<literal>; model and mounted absent-versus-literal regressions pass.
  - `[false]` `[reject]` Edge: table traversal must follow dependency/title order — The requirement explicitly applies this traversal to the canvas; table remains a standard edge table with accessible selectable endpoints. No claim of canvas order for table controls is made.
  - `[medium]` `[patch]` Blind: unassigned sentinel collision — Same confirmed defect as Edge; same encoded option/model repair and tests.
  - `[medium]` `[patch]` Blind: replacement filtered layout retains offscreen viewport — Confirmed pan/zoom survives model replacement. Reset viewport/drag on layout change; mounted replacement regression passes.
  - `[medium]` `[patch]` Blind: keyboard zoom clips focused node — Origin scaling can move a distant focused chip beyond clipping. Reuse reveal after zoom; explicit geometry/focus regression passes.
  - `[false]` `[reject]` Blind: prerequisite-only table endpoint loses required-by/order information — Endpoints are selectable; common canonical relationships panel supplies all their required-by and order information in table mode. Cells describe the Card-column endpoint of each directed edge, and no information is lost from the accessible representation.
  - `[low]` `[reject]` Blind: touch-only zoom lacks controls — Keyboard zoom is explicitly required and available in this desktop UX. New touch/pointer zoom buttons add a public surface beyond a direct correction; no ordinary desktop blocker was demonstrated.
  - `[false]` `[reject]` Blind: native Tab/Enter/boundary acceptance absent — Actual Chrome pass verified prerequisite/title traversal, Enter selection and Tab exit; durable browser evidence was outside the code-only diff. Synthetic tests alone are not described as that proof.
  - `[medium]` `[patch]` Blind: branching dependency parity untested — Added two visible prerequisites plus two visible dependents; exact four edge rows, selection words, canonical directions and topo ordering pass.
  - `[low]` `[patch]` Blind: actual Restore while Graph open unverified — Executed real manual restore-point/HTTP Restore on disposable Project in final browser build. Graph7nodes/4edges became6/3, transient selected Card disappeared, selection cleared, original named relationships returned without reload.
  - `[false]` `[reject]` Intent: source diff alone cannot demonstrate skill execution — Rendered workflow, staged-source inspection, gate logs and actual browser evidence are independently recorded; code-only diff intentionally excludes claims. No inference from sprint rows.
  - `[false]` `[reject]` Intent: jsdom does not prove native browser interactions — Actual Chrome independently exercised Tab/Enter/exit, pointer and scoped shortcuts; jsdom remains supplemental.
  - `[false]` `[reject]` Intent: diff has no200-Card timing evidence — Evidence file records actual200/120 graph, separately timed layout and all select/filter/pan samples, with untrusted filter events explicitly labelled.
  - `[false]` `[reject]` Intent: canonical hidden edges have no table rows — Filters define one induced visible node/edge dataset for both representations; outside prerequisite names remain in the common accessible panel/blocker list. Rendering all canonical edges as visible would contradict filtering, not restore parity.
  - `[false]` `[reject]` Intent: shortcuts bubble from focused nodes — Node focus is inside the canvas; the intended keyboard canvas includes its node controls. Real outside-control check leaves viewport unchanged.
  - `[false]` `[reject]` Intent: pin has no maintenance/license proof — Official tagged metadata/license and current npm registry research are recorded in Design Notes; installed Dagre3.1.1/graphlib4.0.5 pass the explicit scoped MIT check. Claims are kept outside code-only reviewer diff.
  - `[low]` `[patch]` Intent: analysis divider/order wrong — Moved divider before Slices, Graph follows, optional Timeline next, divider before GitHub. Mounted tests cover both feature-gate values.
  - `[medium]` `[patch]` Verification: directed canvas arrow/endpoints unverified — Added marker-end plus dependent-right/prerequisite-left boundary assertions for known edge; executed mounted test passes.
  - `[medium]` `[patch]` Verification: offscreen focus reveal unexercised — Added explicit viewport/chip bounds and actual focus asserting translation, retained focus and visible bounds; executed mounted test passes.

Eight repair groups: six medium (collision, replacement viewport, zoom focus, branching coverage, directed-edge coverage, focus-reveal coverage) and two low (actual Restore acceptance and navigation). No deferred entries or intent/spec gap. Independent repaired-source verification reviewer confirms all requested code/test closures. No source re-derivation or ledger write occurred.

### 2026-10-15 — Review pass (follow-up)
- verdicts: 45 findings — high 0, medium 6, low 19, false 19, maybe-false 1
- findings:
  - `[low]` `[reject]` Blind: viewport resets on refetch — Layout identity changes only when the scoped snapshot or filters change, and resetting is the logged prior-pass repair against an offscreen stale viewport; a keyed-on-structure reset adds comparison logic for a rare case.
  - `[false]` `[reject]` Blind: drag re-renders whole canvas — Measured pointer pans 33.4-34.2ms at 200 Cards against the 100ms budget; no defect at this scope.
  - `[false]` `[reject]` Blind: cycle or dangling edge crashes route — The matrix requires a missing canonical endpoint to fail visibly with no swallowed error, and fail-fast is the project rule.
  - `[low]` `[patch]` Blind: two done definitions, changed message, blank line — Projection workflowStatuses are already map-scoped so done sets are equal and the message has no consumers; removed the stray double blank line in slices.ts.
  - `[low]` `[reject]` Blind: pan/zoom awkward for pointer, touch, wheel — Carried prior touch-zoom decision; keyboard and background-drag controls are what the intent specifies.
  - `[false]` `[reject]` Blind: layout direction vs reading order — The intent fixes edge direction as dependent to prerequisite and Tab order as prerequisite-first; spatial direction is unconstrained.
  - `[false]` `[reject]` Blind: selection not shown on canvas edges — Selected, Requires and Required by words on nodes plus the relationship panel meet the no-color-only rule.
  - `[medium]` `[patch]` Blind: filter and selection UX gaps (stale filter value) — Confirmed a filter whose option disappeared stays applied while the select shows All. Model now drops values without a matching option and the filters render from the effective values; model regression passes. Other listed gaps (clear action, URL state) are not in the intent.
  - `[low]` `[reject]` Blind: preview markers ignored — Marker display in Graph is not in the intent; the preview refusal of Open Card is tested.
  - `[low]` `[patch]` Blind: markup problems — Blockers div had aria-label without a role, so the name was not exposed; added role group. Color fallbacks follow the existing token pattern in slices.css and are not a demonstrated harm.
  - `[low]` `[reject]` Blind: table redundancy — Repeating cells per edge row is the specified one-row-per-edge table; per-render filters are within the measured budget.
  - `[false]` `[reject]` Blind: cues recomputed on filter change — Filter measurement of 14.6-21.1ms including layout is far below budget.
  - `[low]` `[reject]` Blind: wrong plural "1 Cards" — Cosmetic and the fix adds a branch to shared strings; existing counts are unpluralised elsewhere.
  - `[low]` `[reject]` Blind: type-unsafe glue and test hooks — Navigate cast and data-layout-duration serve the required layout measurement; no named harm.
  - `[low]` `[reject]` Blind: shell edits repetitive — The added conditions follow the existing chained pathname pattern; navigation order was settled by a prior patch.
  - `[false]` `[reject]` Blind: new dependency without decision — Exact pin is required by the intent and primary-source evidence is recorded in Design Notes.
  - `[low]` `[patch]` Blind: test gaps — Added table-driven canvas key, zoom bound and modifier tests, and Required by and Blocked order cell tests.
  - `[low]` `[reject]` Blind: evidence file noise — Evidence is the required browser deliverable; formatting of the JSON is not a behavior defect.
  - `[false]` `[reject]` Blind: naming inconsistency — Outside displayed dataset is accurate for hidden prerequisites and Depends on is the specified column name.
  - `[medium]` `[patch]` Edge: stale filter value after refetch — Same confirmed defect and repair as the Blind filter row.
  - `[medium]` `[patch]` Edge: Ctrl/Meta/Alt keys blocked in canvas — Confirmed preventDefault swallowed browser zoom (Cmd/Ctrl +/-) and Alt+Arrow when focus was on the canvas. Handler now returns on modifier keys; mounted regression passes.
  - `[low]` `[reject]` Edge: layout change resets viewport and focus — Same claim as the first Blind row; reset on layout change is the logged intended repair.
  - `[false]` `[reject]` Edge: reveal on pointer focus misses click — Reveal shifts a clipped node toward the visible area by the clipped amount, so the pointer stays inside the node and the click target is unchanged except within the 8px margin.
  - `[low]` `[reject]` Edge: no pan clamp or reset — Not required by the intent; arrow keys return the view and fixing adds a public control.
  - `[false]` `[reject]` Edge: error boundary for thrown model — Same as the cycle row; visible failure is the specified behavior.
  - `[false]` `[reject]` Edge: model throws for archived dependent with missing endpoint — A missing canonical endpoint must fail visibly regardless of the dependent's lifecycle.
  - `[maybe-false]` `[reject]` Edge: Card with releaseId outside the map misses Slice filters — Would need a Card referencing a Release of another map, which Project integrity should prevent; would be low if true.
  - `[false]` `[reject]` Edge: Depends on cell None with out-of-filter prerequisite — carried; the common relationship panel names outside prerequisites and filters define one induced dataset.
  - `[low]` `[reject]` Edge: related lists follow snapshot order — Order of the named list is stable per snapshot and not specified.
  - `[low]` `[reject]` Edge: focus lost when focused node leaves dataset — Filter changes keep focus on the select; removal while a node is focused requires an external refetch and the fix adds focus logic.
  - `[low]` `[reject]` Edge: Slices claim of identical error message — Message text has no remaining references; behavior is unchanged.
  - `[medium]` `[patch]` Verification: table Required by and Blocked order unasserted — Added a mounted test with two Releases and a dependent chain asserting both cells.
  - `[medium]` `[patch]` Verification: dependencyCues map scoping unpinned — Added core case with a foreign Release sorting first and a foreign-map prerequisite throwing.
  - `[low]` `[patch]` Verification: canvas keys beyond ArrowRight and + untested — Added all four arrows, minus, both zoom bounds and modifier no-op assertions.
  - `[medium]` `[patch]` Verification other: stale filter selection — Same confirmed defect and repair as the Blind filter row.
  - `[low]` `[reject]` Verification other: evidence logs in /tmp — Logs are transient run output; durable evidence is the committed browser JSON and gate results recorded here.
  - `[false]` `[reject]` Intent: jsdom does not prove browser behavior — carried; actual Chrome evidence covers Tab, Enter, exit, pointer and shortcuts.
  - `[false]` `[reject]` Intent: Restore covered only in evidence — carried; real Restore on a disposable Project is recorded in Post-review Verification.
  - `[false]` `[reject]` Intent: table versus canvas parity — carried; parity holds through the shared relationship and blocker panel.
  - `[false]` `[reject]` Intent: blockers asserted through model not rendered Graph — Mounted test asserts Open prerequisites for the selected Card and the new table cell test asserts Blocked order.
  - `[low]` `[reject]` Intent: no handling for focus when node leaves dataset — Same as the Edge focus row.
  - `[false]` `[reject]` Intent: dependency evidence not in diff — carried; version, maintenance and license results are in Design Notes and Implementation Verification.
  - `[false]` `[reject]` Intent: Slices behavior changed — Projection statuses and releases are already map-scoped, so scoping inside the shared function is equivalent; only an unreferenced message text changed.
  - `[false]` `[reject]` Intent: navigation reorder beyond intent — carried; moving the divider and ordering was a logged patch for the intent's analysis grouping.
  - `[false]` `[reject]` Intent: ledger and sprint files untouched — Confirms the constraint is met; no defect.

Three behavior repairs (stale filter values, modifier-key shortcuts, group role) and four test additions; no deferred entries, no intent or spec gap.

## Design Notes

Use Dagre for directed layout only, with SVG edges and real focusable node controls in a transformed viewport; accessible table uses the same model. Do not re-layout on selection/pan. Topological traversal orders prerequisites first with title/ID ties; natural Tab escapes at boundaries. Graph filters operate on exact Card fields, Activity ancestry includes the Activity itself. Both views retain a common canonical relationship/blocker panel so filtering a prerequisite cannot imply that a blocker disappeared. No architecture persistence decision is introduced.

Library research 2026-10-15: npm registry reports latest3.1.1 published2026-08-08, transitive graphlib4.0.5. Official tagged package metadata includes exports/types and MIT: https://raw.githubusercontent.com/dagrejs/dagre/v3.1.1/package.json ; official license: https://raw.githubusercontent.com/dagrejs/dagre/v3.1.1/LICENSE . Official repository https://github.com/dagrejs/dagre identifies the @dagrejs package as maintained. ELK considered, but its dual EPL/GPL license and larger layout scope are unnecessary here. Existing AD22 references an allowlist but no executable allowlist exists in scripts/package.json/.github; perform and record an explicit scoped MIT check of added Dagre/graphlib closure with pnpm licenses list rather than claiming nonexistent repository CI passed. MIT is the selected product license in PRD FR publication requirements.

## Verification

- Use PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH for Node24/pnpm9.15.4. Run focused core and web actual Vitest files, inspect executed counts.
- `corepack pnpm licenses list --json` — installed added closure contains only MIT licenses; record exact observed versions/result.
- `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint`, `node scripts/verify.mjs` — run serially and pass all configured tests, hygiene/build/parity. Stage required new sources before portable fixtures using git ls-files; never stage ledgers.
- `git diff --check` — clean whitespace.
- Actual isolated browser with disposable synthetic fixture: direct URL/navigation, all filters/empty state, mouse/pan/keyboard/scoped shortcuts, toggle/tab order, canonical hidden blocker names, preview and shared modal, final 200-Card selection/filter/pan and layout measurements. Record evidence under implementation-artifacts/evidence; no user Project mutation or login.

## Implementation Verification — 2026-10-15

All configured commands passed on unchanged application hashes: 1,777 tests (Scripts82, Contracts136, Importers7, Core275, Web274, DB376, Server613+14 performance), workspace typecheck/lint and full release verification/build with126-capability parity. Logs: /tmp/story-5-3-full-test-repaired.log, /tmp/story-5-3-{typecheck,lint,verify}.log. Original full test failed central-copy checks at8 JSX locations; repaired shared formatters then full rerun passed. Existing Vite bundle-size advisory remains.

Matrix audit: graph-model7 tests cover scope/visibility, all filter intersections/nulls/empty, canonical hidden identities, every-level done/order and missing endpoint/cycle; shared core cues4 plus existing Slices4 pass. Mounted Graph7 cover selection/toggle/edge rows, filters/empty/focus, scoped keys and DOM traversal order, pointer cancellation, canonical refetch/removal, explicit modal/dirty guard and projected preview refusal. Real browser supplies native Tab/Enter/exit behavior beyond synthetic key dispatch.

Actual Chrome functional and timing evidence is in evidence/story-5-3-browser.json.200 Cards/120 edges initial layout15.9/16.2ms; trusted selection28.2/30.4ms, key pan26.9ms and pointer pan33.9/34.2/32.7ms; filter14.6ms and full reset58.2ms include layout and pass100ms. Filter uses actual browser tool selectOption with untrusted change provenance recorded, not native-user event evidence. Native app access unavailable (cgWindowNotFound); extension browser remains operational. Functional checks include explicit real ChangeSet preview/refreshed review, all four filters, canonical outside endpoint names, table equality, real keyboard traversal, pointer and shared dirty modal. No timing failures observed. Actual Restore not performed; canonical refetch/removal is mounted coverage.

Dependency command: PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH corepack pnpm --filter @storymapper/web add --save-exact @dagrejs/dagre@3.1.1. pnpm licenses list --json plus explicit added-closure MIT assertion passes for Dagre3.1.1 and graphlib4.0.5; no repository-wide executable allowlist is claimed.

## Post-review Verification — 2026-10-15

Final full configured run passes1,786 tests (Scripts82, Contracts136, Importers7, Core275, Web283, DB376, Server613+14 performance), workspace typecheck/lint and release verification/build including126-capability parity. Whitespace clean. Logs: /tmp/story-5-3-post-review-{test,typecheck,lint,verify}.log.745 checked source files match the recorded final manifest throughout verification and browser repeat. New mounted Graph15/model8 cases pass; no excluded or relaxed tests. Existing bundle-size advisory remains.

Actual final-build Chrome repeated200-Card/120-edge acceptance after gates: selection24.7ms, filter21.1ms, full reset57.3ms, keyboard pan23.7ms, pointer pan33.4/33.9/34.2ms, each <=100ms. Initial layout22.4ms; later canonical refetch12.0ms and full-reset layout22.7ms recorded separately. Filter timing is actual browser tool selectOption rendering with untrusted change provenance, not a claim of native-user filter timing. Actual focus/zoom geometry stayed inside canvas; replacement filter resets viewport; Shift+Tab exits start boundary. Real Restore7/4 ->6/3 removed transient selected Card and edge, cleared selection and restored original blockers without reload. Literal unassigned assignee and missing-assignee filters independently render correct datasets. Evidence retains initial samples and final source identity.

Independent repaired-source reviewer found no remaining defects in requested repair scope. Follow-up review recommended:false: although six medium repair groups were patched, focused regressions, independent closure inspection and final browser repeat leave no specifically unverified patched behavior to name. No deferred findings. No native screen-reader/cross-platform or native-user filter timing claim.

## Auto Run Result

Status: done

Summary: Follow-up review pass over the Graph view. Repaired a stale filter value that stayed applied after its option disappeared, stopped canvas shortcuts from swallowing Ctrl/Meta/Alt browser shortcuts, gave the blockers group a role, and removed a stray blank line in slices.ts. Added regression tests.

Files changed this pass:
- `apps/web/src/features/story-map/graph/graph-model.ts` — filter options and effective filters derived in the model.
- `apps/web/src/features/story-map/graph/GraphFilters.tsx` — renders from model options and effective filters.
- `apps/web/src/features/story-map/graph/GraphCanvas.tsx` — ignores modifier-key shortcuts.
- `apps/web/src/features/story-map/graph/GraphRelationships.tsx` — role group on blockers.
- `apps/web/src/features/story-map/views/GraphView.tsx` — passes the model to the filters.
- `packages/core/src/reports/slices.ts` — removed stray blank line.
- Tests: `GraphView.test.tsx`, `graph-model.test.ts`, `dependency-cues.test.ts`.

Review breakdown: 45 findings (medium 6, low 19, false 19, maybe-false 1). Patched 6 medium rows (stale filter x3, modifier keys, two test gaps) and 4 low rows; deferred none; all other findings rejected with reasons in the Review Triage Log.

Follow-up review recommended: false. This was a follow-up pass and no high finding was patched. Patched counts: high 0, medium 6, low 4.

Verification: `corepack pnpm test` (core 276, web 286, contracts 136, importers 7, db 376, server 613+14), `typecheck`, `lint`, `node scripts/verify.mjs` and `git diff --check` all passed after the patches. The browser timing evidence predates these small changes; none touches layout or pan/select paths.

Residual risks: No commit was made because the intent contract states no commit is authorized, so the working tree remains uncommitted. sprint-status.yaml and deferred-work.md were not touched. No native screen-reader or native-user filter timing claim.

## Operator Browser Acceptance — 2026-10-15

Version: 3. Reproducing statement: Execute the operator request for actual Story5.3 browser acceptance on current HEAD without editing orchestrator-owned tracking files. Changelog: fresh browser results and evidence after the committed follow-up patches.

**Result: accepted, with unchanged100ms budget.** Tested HEAD20cdca5 (including Story5.3 implementation5a23ced and subsequent committed work) using a fresh production build and actual Codex In-app Browser on an isolated backup of the existing synthetic fixture. Chrome extension was unavailable; no Chrome result is invented. Graph/table parity, all four filters, empty-state selection cleanup, canonical hidden blockers, prerequisite-first native Tab/Enter/exit, scoped pan/zoom, focused-node visibility, viewport reset, shared dirty modal, actual read-only preview and live Restore all pass. The follow-up stale-assignee correction was specifically reproduced through a real modal Save: disappearing Ada option resets the filter to All. Literal unassigned and absent Unassigned independently produce1 and4 Cards.

On200 Cards/120 edges, native trusted selection32.6ms, Activity filter21.9ms, full reset36.7ms, key pan22.7ms and pointer pan34.7/33.5/33.4ms pass100ms. Initial layout12.9ms recorded separately. All12 samples are preserved, including supplementary interactions; later reset46.3ms also passes. No Story5.2 exception transfers. The passive observer is confined to a temporary copied web build; application source is unchanged.

An actual human HTTP Restore while Graph stays open removes the selected temporary note, changes7 nodes to6 and clears selection without reload;3 original edges remain. HTTP fixture setup and Restore are explicitly distinguished from actual UI assertions. No full-suite rerun, native screen-reader or cross-platform claim. Pointer cancellation and zoom-bound extremes retain existing mounted/historical coverage. Current fresh build passes; fresh typecheck result is recorded in the evidence JSON.

Evidence: `evidence/story-5-3-operator-browser.json` and `evidence/story-5-3-operator-graph.png`. Historical browser data is unchanged. No application fix, orchestration ledger write/stage/revert, user data mutation or commit/push in this acceptance pass.
