---
title: '6.1 Every function reachable and addressable'
type: feature
created: '2026-10-17'
status: done
baseline_revision: 1865742392b7940de20fb0930849b89b31b431b5
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-6-1-every-function-reachable-and-addressable.md'
warnings: [oversized]
deferred: []
---

Reproducing statement: Implement dispatched Story 6.1 using accepted Epic 6 preparation; never write or revert orchestrator-owned sprint-status.yaml. Date: 2026-10-17. Version: 2. Changelog: Resumed against the preserved implementation; repaired Connections scope heading focus and repeated verification.

<intent-contract>

## Intent

**Problem:** Existing user pages and Views are hidden by VITE_DEV_FEATURES; shell semantics and stale remembered scope prevent reliable accessible navigation.

**Approach:** Expose existing real routes, validate URL-derived scope, group navigation, and provide accessible route headings, focus and titles while preserving existing query-driven surfaces.

## Boundaries & Constraints

**Always:** Follow Epic 6 preparation and Story 6.1 plan. Centralize English strings. Preserve View order Discovery/Tree/Planning/Backlog/Tracking/Slices/Graph/Timeline/GitHub Sync. Keep /audit labelled Activity. Work contains Story Maps/Sources/Releases/Roadmaps; Setup Connections/Personas/Customize/AI-MCP; Trust Activity (retain Onboarding). Keep current Export actions reachable. Map-only links require an available map belonging to the URL Project; stale store state must not cross Projects. Preserve actor, live-update, dirty modal and read-only preview contracts.

**Never:** Write, stage or revert sprint-status.yaml; infer verification from its rows; change orchestrator state; add Export route/rail entry; complete Later features; redesign Project switcher; add backend commands or dependencies.

</intent-contract>

## Code Map

- `apps/web/src/app/routes/RootLayout.tsx`: current main wraps everything, unnamed rail, map-name h1, flag-gated links, stale store-derived scope. Keep title rename, live/status/zoom and Restore controls.
- `apps/web/src/app/routes/story-map-shell.tsx`: existing search.card/preview, actual View Links and exports; gates Planning/Backlog/Tracking/Timeline, unnamed Views nav. Validate snapshot belongs to URL Project before offering links/rendering map content.
- `apps/web/src/app/router.tsx`: real page routes exist; map search validates card/preview, Activity restorePoint; do not lose validators/default redirect search.
- `apps/web/src/app/stores/active-story-map-store.ts`: ephemeral current and remembered map; root must synchronize URL scope safely, preserve remembered navigation only after availability validation.
- `apps/web/src/app/api.ts:653`: useStoryMaps lists Project maps, useStoryMap returns snapshot; reuse existing queries for availability.
- `apps/web/src/app/routes/root-layout.test.ts`: mocked static render counts; extend/adapt for new hooks and add actual router/DOM coverage.
- `apps/web/src/ui-strings/app.ts`, `apps/web/src/vite-env.d.ts`, `apps/web/src/styles/global.css`: strings, obsolete env declaration, shell layout/skip-link styling.
- `apps/web/src/app/components/Announcements.tsx`: retain singleton mounted status/alert regions; no second announcement manager.
- `apps/web/src/app/routes/customize.tsx`: reads active map from store; ensure Project navigation clears stale cross-Project scope without broadening Story 6.8 selector work.
- Read-only: existing export components, query validators, backend, sprint-status.yaml, deferred-work.md. Graph MCP unavailable; direct source investigation used.

## Tasks & Acceptance

**Execution:**
- `RootLayout.tsx`, `story-map-shell.tsx`, `vite-env.d.ts` -- remove flag and expose validated scope links; group Main rail and label Experimental surfaces.
- `RootLayout.tsx`, `app.ts`, `global.css` -- add first-focusable skip link to workspace, banner, named Main/Views navigation, exactly one main/h1 per rendered page; meaningful route heading and route/map document title. Preserve layout and map rename controls. Keep Views available as a named landmark on map auxiliary pages; project-only pages may use an empty named Views landmark if no valid map exists.
- `router.tsx`, shell/store integration as needed -- URL scope wins on direct reload, Project change and history; unavailable/mismatched map never supplies navigation. Preserve card/preview/restorePoint and default map redirect search.
- `root-layout.test.ts` and focused router DOM tests -- run real Link/history/search/focus integration, including no map and cross-Project stale stores. Verify nav entries are real anchors, active state, route titles, heading count, skip target and Experimental text; preserve Export reachability.

**Acceptance Criteria:**
- Given the app without a development environment flag, when inspecting Main and Views navigation, then all existing scoped pages are real links with visible active state, ordered/grouped as specified, and Timeline/Roadmaps show Experimental.
- Given each View and auxiliary page URL, when loading directly and navigating back/forward, then the same route and valid search state render, with URL Project/map scope overriding stale state.
- Given unavailable/no map or another Project, when the rail renders, then map-only entries are absent and valid Project functions remain reachable.
- Given each page, when rendered, then it has a working keyboard skip link, banner, named Main/Views nav, one main and one h1, with route/map-aware document title.
- Given a pathname/scope change, when navigation completes, then page heading receives focus; given only Card/preview/Restore search changes, then route focus does not steal focus from existing surfaces or dirty editors.
- Given current View or Activity export controls, when navigating normally, then existing export actions remain reachable without a new Export route.

## Spec Change Log

- 2026-10-17: Resume baseline is `1865742392b7940de20fb0930849b89b31b431b5`, as required by Step 03. Original implementation `14161b0caa757b750e1182275d3e51c61a376254` and historical blocker record `0f0406b4a22d791e1d463ed9adf40ae6c5800002` are preserved ancestors. This run investigates existing implementation and verifies it freshly; its four-layer diff review covers the incremental focus repair and workflow records. Historical review/browser evidence remains separately identified below.

## Review Triage Log

### 2026-10-17 — Review pass

- verdicts: 18 reported findings/observations — high 0, medium 9, low 3, false 6, maybe-false 0. Arithmetic header is not a finding. Two additional parent patch checks: medium 2; total 20 recorded rows. Edge report arrived first, then blind, verification-gap and descriptive intent report. Fourth launch was capacity-rejected, then started at first free slot; no triage occurred before all four returned.
- findings:
  - `[medium]` `[patch]` Edge: Story Maps list lacks active entry after remembered-map navigation — verified original link targeted Discovery on list; fixed list-specific href, active/current assertions.
  - `[medium]` `[patch]` Blind 1: Onboarding changes active Project to first Project — URL-less scope ignored activeProjectId; now retains it, with second-Project regression.
  - `[medium]` `[patch]` Blind 2: Story Maps list active state — same defect as Edge; same list-specific repair and test.
  - `[low]` `[patch]` Blind 3: visually current map section lacks aria-current — explicit location semantics now accompany map-section active class; actual list retains page semantics.
  - `[low]` `[patch]` Blind 4: Project-page Views miss anchor styles — verified selectors required .view-tabs; moved equivalent styles to shared navigation selector, without duplicated declarations.
  - `[medium]` `[patch]` Blind 5: inventory pending looks like unavailable map — now derives loading from existing inventory/snapshot queries; delayed inventory with cached snapshot test passes.
  - `[medium]` `[patch]` Blind 6: inventory/snapshot errors silently look absent — real errors now render visibly; initial failure and background failure are distinct from missing scope.
  - `[medium]` `[patch]` Blind 7: Connections bookmark scope differs from shell — existing storyMapId search now wins remembered map and is availability/ownership checked; bookmark regression passes.
  - `[low]` `[patch]` Blind 8: skip target lacks route-heading context — main now directly references page heading through aria-labelledby; focus/layout retained.
  - `[medium]` `[patch]` Blind 9: mocked query surfaces alone do not verify real dirty modal — added actual routed title/rich-text draft preservation during both inventory and snapshot failures; existing 28 Card tests and actual Safari open/dirty-close/cancel/discard supplement router tests. Preview/Restore query validators and their existing suites remain covered; no claim of a new full browser Restore acceptance.
  - `[medium]` `[patch]` Gap 1: changed Customize consumer mocked away — real CustomizeRoute/CustomizationPanel tests now verify actual reads and submitted scope in same/other Project, plus delayed/error validation.
  - `[medium]` `[patch]` Gap 2: same-Project unavailable cached map untested — new test removes inventory membership while retaining successful snapshot and verifies no map content/links and cleared active scope.
  - `[false]` `[reject]` Intent observation 1: broader functionality versus shell coverage — dispatch identifies named Story 6.1; completing every feature is not its acceptance scope. Existing full suite and real browser destinations supplement shell tests; no claim that null mocks prove all functionality.
  - `[false]` `[reject]` Intent observation 2: mocked pages cannot prove complete heading counts — source search of all TSX finds only RootLayout main/h1; actual Safari pages render route heading and browser title. DOM evidence is described at its actual scope.
  - `[false]` `[reject]` Intent observation 3: query value checks do not prove dialog/editor behavior — true evidence boundary, not an unresolved defect: actual routed dirty Card tests and native Safari modal focus/dirty-close/cancel/draft retention now exercise it; preview/Restore remain covered by unchanged actual feature suites.
  - `[false]` `[reject]` Intent observation 4: mocked Export only proves presence — existing real View HTML/PNG/PDF buttons were visibly present in Safari; existing Activity export unchanged and inspected in source. No new export-operation claim is made.
  - `[false]` `[reject]` Intent observation 5: jsdom cannot prove browser keyboard/layout — native Safari evidence separately verifies route focus, visible active navigation, skip continuation, Experimental labels and final heading layout; no WCAG/screen-reader completeness claim.
  - `[false]` `[reject]` Intent observation 6: bookkeeping does not prove execution — independent parent commands reran full web suite and release verification; no sprint row is evidence and no sprint file was written, staged or reverted.
  - `[medium]` `[patch]` Parent 1: Customize enables Project-wide creation while remembered map validation is pending — panel now waits for validation/error; delayed test proves no premature customization reads/controls, then correct scoped creation becomes available.
  - `[medium]` `[patch]` Parent 2: background query error unmounts valid map and dirty draft — keep the existing valid same-scope content mounted and display error alongside it; actual title/rich-text editor identity and unsaved content survive both query errors.

### 2026-10-17 — Resumed review pass

- verdicts: 8 findings/observations — high 0, medium 0, low 1, false 7, maybe-false 0. Blind arithmetic header is not a finding. Edge returned `[]`; verification-gap returned no gaps. All four layers launched before triage; capacity rejected launches were retried after slots became available.
- findings:
  - `[false]` `[reject]` Blind 1: current baseline excludes original implementation from this diff — Step 03 explicitly requires current HEAD as resume baseline. Preserved implementation is in ancestor `14161b0caa757b750e1182275d3e51c61a376254`; the implementation agent inspected it and fresh full web/release verification ran. This pass reviews the incremental repair; it does not claim a fresh whole-original-diff review. A requested spec-only fix is rejected under workflow rules.
  - `[false]` `[reject]` Blind 2: removed Auto Run Result loses historical evidence — dispatch supplied the ready-for-dev spec without that previous result; historical record remains committed in `0f0406b4a22d791e1d463ed9adf40ae6c5800002` and evidence files remain present. Current finalization restores direct evidence links and distinguishes previous acceptance from fresh checks. No evidence artifact was deleted; a requested spec-only fix is rejected under workflow rules.
  - `[low]` `[patch]` Blind 3: same-path scope history lacks direct regression — existing history test changes pathnames, so it cannot distinguish query-dependent focus. Extended the new Connections regression to focus a control then exercise Back and Forward, asserting heading focus, exact query, validated scope and Views links after each transition.
  - `[false]` `[reject]` Blind 4: raw storyMapId dependency may cause unnecessary focus — unavailable/cross-Project explicit URL changes still represent requested scope navigation; availability validation remains exclusively in useWorkspaceScope. Async validation cannot change this dependency. Card/preview/Restore-only changes do not change storyMapId, and the existing focus-preservation tests pass. No harmful reachable transition was demonstrated; adding/removing an explicit scope request may legitimately focus the heading.
  - `[false]` `[reject]` Intent 1: full intent is broader than this delta — carried: original triage already identifies named Story 6.1 scope; the preserved implementation supplies navigation/grouping/title/validation/export behavior, verified by the fresh suite. This resume adds one remaining focus correction, not a claim that its three changed lines implement the whole story.
  - `[false]` `[reject]` Intent 2: jsdom/mocked Connections does not prove actual Connections controls/browser accessibility — correct evidence boundary, not a demonstrated defect. Changed behavior belongs to RootLayout/router and is directly exercised there; no new browser or Connections-operation acceptance is claimed. Historical actual-browser proof remains separately attributed.
  - `[false]` `[reject]` Intent 3: effect operates beyond tested valid Connections maps — same verified claim as Blind 4: explicit URL scope navigation may focus even if availability is refused, while validated map links and content remain guarded. No change to actor/live/dirty/preview code; existing focused and full suites pass.
  - `[false]` `[reject]` Intent 4: workflow records change despite orchestrator prohibition — record edits are required build workflow output. The reviewed file list contains no sprint-status.yaml or .bmad-loop state file; none was written, staged or reverted.

### 2026-10-17 — Review pass (follow-up on done spec)

- verdicts: 19 findings — high 0, medium 0, low 3, false 16, maybe-false 0. Blind (10), Edge (4), Intent (5 observations); verification-gap returned no gaps. Diff since baseline excluded sprint-status.yaml (orchestrator-owned). All four layers returned before triage.
- findings:
  - `[low]` `[reject]` Blind 1: `useSearch` cast hides the validated search type — cosmetic; value is only compared as a dependency, router validators own the type; a typed selector adds code for no reachable defect.
  - `[false]` `[reject]` Blind 2: focus fires on any storyMapId change — `carried` from resumed pass Blind 4/Intent 3; explicit URL scope change is a scope navigation, Card/preview/Restore tests still pass.
  - `[false]` `[reject]` Blind 3: shared `state.maps` not reset — `beforeEach` reassigns `state.maps` and `state.owner` (workspace-navigation.test.tsx:94).
  - `[false]` `[reject]` Blind 4: focus never asserted — `structure()` asserts `document.activeElement` is the h1 (line 72) after the control was focused, so removing the dependency fails the test.
  - `[false]` `[reject]` Blind 5: status/flags inconsistent — `in-review` is the workflow's transient status for this pass; `review_loop_iteration` counts only bad_spec loopbacks.
  - `[false]` `[reject]` Blind 6: Auto Run Result removed — `carried` from resumed pass Blind 2; this finalization writes a new Auto Run Result with direct evidence links.
  - `[false]` `[reject]` Blind 7: buglog timestamp/detail — OpenWolf-hook-owned bookkeeping, not product behavior; no end-user or developer harm named.
  - `[false]` `[reject]` Blind 8: empty session header in memory.md — hook-generated bookkeeping, not editable by workflow rules.
  - `[low]` `[reject]` Blind 9: evidence logs carry noise/absolute paths — raw command output kept verbatim as evidence; trimming it would reduce fidelity.
  - `[low]` `[reject]` Blind 10: no add/remove storyMapId test — unlikely everyday defect; adding/removing explicit scope may legitimately focus the heading (resumed Blind 4), extra test is not a direct correction.
  - `[false]` `[reject]` Edge 1: first `<button>` probe — a missing button would throw loudly on `.focus()`; the h1-focus assertion proves focus moved.
  - `[false]` `[reject]` Edge 2: dependency should be validated `urlStoryMapId` — `carried` from resumed pass Blind 4/Intent 3.
  - `[false]` `[reject]` Edge 3: Auto Run Result deletion — `carried` from resumed pass Blind 2.
  - `[false]` `[reject]` Edge 4: evidence-link claim unsupported — `carried` from resumed pass Blind 2; links restored in this pass's Auto Run Result.
  - `[false]` `[reject]` Intent 1: diff is a narrow slice of the story — `carried` from resumed pass Intent 1.
  - `[false]` `[reject]` Intent 2: focus trigger is raw URL not validated scope — `carried` from resumed pass Intent 3.
  - `[false]` `[reject]` Intent 3: query-driven surfaces untested in diff — existing focus-preservation tests (lines 136, 141) cover Card/Restore and pass.
  - `[false]` `[reject]` Intent 4: jsdom test surface — `carried` from resumed pass Intent 2; no browser acceptance is claimed.
  - `[false]` `[reject]` Intent 5: spec record changed (blocked to in-review, follow-up flag) — workflow-required record updates; flag recomputed per Finalize rules.

## Design Notes

Use route identity for focus, separate from asynchronous map-name/title updates and query state. Scope validation must not treat a stale successful snapshot from another Project as current. On nonmap pages omit the map title segment if no validated map is active. Changes are local shell integration, no architecture-level decision needed.

## Verification

**Commands:**
- Run with installed Node 24 (default PATH currently Node 22; locate installed Node 24 first).
- `corepack pnpm --filter @storymapper/web test` -- all web regressions and new integration tests pass with nonzero tests.
- `corepack pnpm --filter @storymapper/web typecheck` -- zero errors.
- `node scripts/verify.mjs` -- release checks/typecheck/build pass, without rewriting sprint status.
- `git diff --check` -- clean whitespace.

Actual browser acceptance: isolated fixture storage only; inspect navigation/keyboard skip/route focus and query modal behavior if browser tool available. Never claim browser acceptance from jsdom alone. No live GitHub mutation or user Project mutation.


## Auto Run Result

Status: done

**Summary:** Story 6.1 exposes existing scoped pages and Views without the development flag, with grouped/named navigation, skip link, one main/h1 per page, route/map-aware titles, URL-validated map scope and route-heading focus (including Connections `storyMapId` changes). This follow-up review pass changed no code.

**Files changed (since baseline `1865742392b7940de20fb0930849b89b31b431b5`):**
- `apps/web/src/app/routes/RootLayout.tsx` -- heading focus also reacts to `storyMapId` search changes.
- `apps/web/src/app/routes/workspace-navigation.test.tsx` -- Connections scope change plus Back/Forward focus regression.
- `_bmad-output/implementation-artifacts/evidence/story-6-1/resume-*.log|json` -- resume verification evidence; historical acceptance in `acceptance.json`, `tests.log`, `verify.log` (browser evidence is historical, attributed to `14161b0caa757b750e1182275d3e51c61a376254`).
- This spec and `.wolf/*` -- workflow records. `sprint-status.yaml` untouched by this run.

**Review findings:** 19 reported (high 0, medium 0, low 3, false 16). Patches applied: 0. Deferred: 0. Rejected: all 19, with reasons in the Review Triage Log (16 refuted or carried from earlier passes; 3 lows are cosmetic or unlikely and fixes would add code).

**Follow-up review recommended:** false. Follow-up pass patched no high.

**Verification (Node 24.17.0):** `corepack pnpm --filter @storymapper/web test` 52 files / 341 tests passed; `web typecheck` clean; `node scripts/verify.mjs` completed; `git diff --check` clean on `apps`. No fresh browser acceptance; historical Safari evidence only.

**Residual risks:** jsdom evidence only for the new focus behavior; heading focus may fire on explicit but unavailable `storyMapId` URL changes (accepted, scope navigation request).
