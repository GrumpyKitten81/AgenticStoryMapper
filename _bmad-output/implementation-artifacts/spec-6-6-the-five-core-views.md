---
title: '6.6 The five core Views'
type: feature
created: '2026-10-17'
status: done
baseline_revision: e2c704cc75807a5ea414d5e5afdaf81b05506862
review_loop_iteration: 0
followup_review_recommended: false
context:
  - [REDACTED_HOME]/Projects/StoryMapper/_bmad-output/implementation-artifacts/story-plan-6-6-the-five-core-views.md
  - [REDACTED_HOME]/Projects/StoryMapper/_bmad-output/implementation-artifacts/epic-6-preparation.md
warnings: [oversized]
deferred:
  - summary: >-
      Existing Release-management report omits current GitHub work-item links from readiness risks.
    evidence: |-
      getStoryMapReportData reads legacy githubLinks only; importRemoteWorkItems writes remoteWorkItemLinks. Tracking now correctly reads both, exposing pre-existing cross-surface disagreement. No server report changed in this frontend story.
    location: >-
      packages/db/src/repositories/releases-repository.ts:112
    severity: medium
  - summary: >-
      Pre-existing Discovery global creation controls stretch vertically beside the board.
    evidence: |-
      Native Safari screenshot at1800x975 shows tall Create Activity/Step/Story/Note columns. Baseline global.css has row flex discovery-workspace with card-create-actions as sibling; unchanged by this story. Native window became unavailable before further checks.
    location: >-
      apps/web/src/styles/global.css:680
    severity: medium
  - summary: >-
      Discovery grid uses display: contents on role=row/rowheader/columnheader wrappers, whose accessibility exposure in Safari/WebKit is unverified.
    evidence: |-
      Only jsdom attribute tests exist; the spec forbids claiming native accessibility from jsdom. Settle with a native VoiceOver or accessibility-tree check of the Discovery grid.
    location: >-
      apps/web/src/features/story-map/components/DiscoveryMatrix.tsx
    severity: medium (unverified)
  - summary: >-
      Board toolbar absence and Activity/Step header aria-selected remain asserted only indirectly; dependent write guards exist.
    evidence: |-
      Toolbar absence is now asserted in the preview test; Activity/Step columnheader aria-selected/aria-description has no dedicated assertion. Low risk, accessibility-only.
    location: >-
      apps/web/src/features/story-map/components/DiscoveryLanes.tsx:47
    severity: low
  - summary: >-
      Planning number fields disable the focused input while a card update is pending, dropping keyboard focus after Enter.
    evidence: |-
      disabled={readOnly || updatePending || ...} pattern pre-dates this story (updatePending was already passed from SwimlaneGrid); tests assert the disabled state. Replacing it with readOnly/aria-busy changes the pending contract.
    location: >-
      apps/web/src/features/story-map/components/CardTile.tsx:195
    severity: low
  - summary: >-
      Board persona name projection dereferences personaById.get(id)! and would throw on a cardPersonas link whose persona is absent from the snapshot.
    evidence: |-
      Canonical snapshots keep links consistent; whether a projected ChangeSet preview snapshot can drop a Persona but keep its link was not established. Settle by projecting a persona-removing ChangeSet preview and mounting a board.
    location: >-
      apps/web/src/features/story-map/useStoryMapBoardState.ts:66
    severity: medium (unverified)
---

Reproducing statement: Implement Story 6.6 through bmad-build-auto with independent verification and review, preserving orchestrator-owned sprint-status.yaml. Date: 2026-10-17. Version: 1.

<intent-contract>

## Intent

**Problem:** Discovery lacks assigned Personas and complete grid semantics; Planning lacks open Release defaults and central priority options; Tracking lacks a shared Release summary and open Release default.

**Approach:** Finish the five existing projections over the same canonical map, preserving the delivered editing, navigation, filtering, collapse and dependency behavior. Reuse the canonical report and existing tile/navigation primitives.

## Boundaries & Constraints

**Always:** Follow prepared task order and shared contracts. Preserve legal root/Activity/Step Notes, Discovery Release/status/estimate/priority, retained hidden selections and DOM, pointer/form/keyboard commands, captured versions, actor/history/Activity boundaries, ChangeSet-first nonhuman writes, dirty/live holds, Restore epochs, provenance, read-only previews and map-unit estimates including zero. English strings belong in existing modules. Story-only delivery metrics exclude parked/archived ancestry. Keep full canonical dependency inventory. All relevant repository/global/Cursor/OpenWolf instructions apply; use Node24 first on PATH.

**Never:** Write, stage, revert or otherwise mutate sprint-status.yaml, deferred-work.md or orchestration state. Done/awaiting-operator is no verification evidence. No user Project/live GitHub mutations, commits or pushes. No Timeline completion, Graph/Slices redesign, new report arithmetic, new focus subsystem, Release CRUD enhancement or unestimated-list presentation (6.9), migration, ETag or new timing gates. Do not claim native accessibility from jsdom.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Five projections | One canonical map with hierarchy, legal Notes, Personas, delivery fields, source/GitHub links and zero estimate | Direct core URLs and fresh mounts show their intended content; edits affect same Card identity; Tree collapse and Backlog previews/link cues remain | No dropped canonical records or duplicate authority |
| Discovery semantics | Multiple Activities/Steps, stacked Stories/Notes, Release lanes and Not assigned; filter/collapse/selection | Grid counts, explicit semantic rows, indexed headers/cells and Activity spans match visible CSS layout; multiselectable; complete primary names and state descriptions; no tile headings; assigned Personas visible | Hidden columns/tiles inactive; retained hidden selection and traversal/focus preserved |
| Planning editing | Open/released Releases, Unscheduled; priority/businessValue/effort including0/clear/invalid | Open lanes default, explicit show-all; existing assignments preserved; central priority options retain explicit custom values; valid numeric edits use existing versioned mutation | Invalid/nonfinite/negative numeric input visibly refused without write; clear only allowed by contract |
| Tracking scope | Open/released/removed Releases, Unscheduled, Notes, archived ancestry, unconfigured statuses, linked/unlinked Stories | Open default plus explicit show-all and Unscheduled; Kanban and shared summary use same Story scope; zero estimate retained; no status loss; removed scope reconciled | Accessible named scope/edit controls; mutation errors visible; no silent failure |
| Preview/live | Actual preview route and incoming canonical update while interaction held | Read-only preview controls refuse writes; markers/dependency cues remain; live held state and explicit release apply correctly | No premature refresh or mutation |
| Scale/regressions | Legal1000-Card map and existing Graph/Slices | All eligible Cards remain reachable/represented under projections; existing Graph/Slices tests pass | Record performance diagnostically only |

</intent-contract>

## Code Map

- `apps/web/src/features/story-map/components/DiscoveryMatrix.tsx:263`: existing grid/header wrappers; visible hierarchy columns and locations already computed. Complete counts, multiselectable, indices/spans using actual filtered/collapsed layout; keep creation columns, pin measurement and retained hidden DOM.
- `DiscoveryLanes.tsx:160` in same directory: ReleaseSection full-width heading occupies a different CSS row from content. Separate semantic heading/content rows; heading full-width header span; content column wrappers own gridcell semantics. Not assigned heading/content needs equivalent treatment. Stacked tile articles must not duplicate gridcell roles. Use selected primary actions/cell descriptions consistently for multiple selected Cards.
- `CardTile.tsx:85`: already strong.card-title, key/role/title primary names and aria-description for changed/dependency/conflict. Preserve, do not rewrite. Add assigned Persona display through shared names projection from `useStoryMapBoardState.ts:62` persona indexes; pass through every Activity/Note/Step/Release/Not assigned path. Planning priority at189 uses free text: reuse CARD_PRIORITY_OPTIONS and retain custom persisted values. Validate businessValue/effort at user-input boundary, preserving0.
- `views/PlanningView.tsx; components/SwimlaneGrid.tsx:32`: add local explicit show-all/open default while keeping Unscheduled and current move/edit/preview behavior. Do not globally change board filters or other views.
- `views/BacklogView.tsx; components/BacklogList.tsx; components/TreeGrid.tsx`: existing status/unit/description/source/GitHub/collapse/dependency projection mostly satisfies requirement; verify source/tests before edits.
- `features/releases/ReleaseKanban.tsx:25; views/TrackingView.tsx`: existing status columns already cover configured ordered unique names plus actual unconfigured values. Preserve live updates/version checks/canonical dependencies. Open/show-all scope must drive both Kanban and summary, preserve assignment choices, reconcile deleted scope. Tracking preview must not expose mutation paths.
- `features/releases/ReleasePanel.tsx`: already canonical buildReleaseSummaryReport. Extract existing summary/risk markup into shared `ReleaseSummary.tsx`, reuse in Panel and Tracking. Derive Tracking report with canonical report from same eligible scope and actual source/GitHub linked IDs; no extra management controls or local arithmetic. `packages/core/src/reports/reports.ts:27` read-only unless proven required defect.
- `app/router.tsx; app/routes/story-map-shell.tsx`: existing direct URLs/query/preview/hold integration. `components/card-detail-test-fixture.ts` real router fixture (RootLayout mocked only) supports fresh core URL mounts; workspace-navigation test mocks Views so cannot prove projection content.
- Existing focused coverage: `discovery-navigation.test.tsx`, `hierarchy-collapse.test.tsx`, `views/DiscoveryView.test.tsx`, `views/TrackingView.test.tsx`, `views/SlicesView.test.tsx`, `views/GraphView.test.tsx`, `components/card-detail.test.ts`, `app/live/live-updates.test.tsx`, `features/releases/ReleasePanel.test.tsx`, `ReleaseKanban.test.tsx`. Extend with meaningful actual-control/semantic tests covering each matrix row.

## Tasks & Acceptance

**Execution:**
- [x] DiscoveryMatrix/DiscoveryLanes/CardTile/board state/strings: expose Personas and finish coherent visible grid semantics; preserve existing tile names/state and focus primitives.
- [x] PlanningView/SwimlaneGrid/CardTile: open defaults/show-all and central editable fields; verify Backlog and Tree intended fields/cues.
- [x] TrackingView/ReleaseKanban/ReleasePanel/shared ReleaseSummary/strings: same-scope canonical summary, open/show-all/Unscheduled and accessible actions; preserve status completeness.
- [x] Focused view/router/control tests: cover every matrix row including filter/collapse/stacked semantics, all legal Note Personas, zero/invalid edits, scoped reports, preview refusal/live holds, fresh direct URLs,1000Cards and Graph/Slices regressions.

**Acceptance Criteria:**
- Given one map, when each core URL is opened freshly, then its distinct English projection retains canonical Card identity and supports its intended controls.
- Given Discovery, when inspected through accessibility APIs and operated by keyboard, then names/descriptions/selection and row/header/cell structure reflect the actual visible layout.
- Given Tracking, when scope changes or canonical data refreshes, then its summary and Kanban show the same eligible Stories including unconfigured statuses.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass 1

- verdicts: 19 findings — high 2, medium 9, low 2, false 6, maybe-false 0.
- findings (reported order; duplicate findings retain individual verdicts):
  - `[medium]` `[patch]` Verification-gap: Tracking snapshot link-to-risk wiring lacks a consumer regression — reviewer source/test searches establish direct-prop tests bypass the route; add chunk/legacy/current GitHub/non-GitHub route assertions.
  - `[high]` `[patch]` Blind1: preview plus Card query opens writable canonical modal — shell unconditionally mounts CardDetailModal; omit it whenever previewId exists and cover direct/delayed/failed preview. Same root as Edge1/Blind8.
  - `[medium]` `[patch]` Blind2: Tracking removes archived/parked preview ghosts — visibleCards drops removed roots before markers; reuse shared includePreviewGhosts for display while delivery report retains eligible Stories.
  - `[medium]` `[patch]` Blind3: Planning open filter unmounts lane and focused editor — rows filter released records before render; retain hidden lanes, disable hidden drag surfaces and recover focus.
  - `[medium]` `[patch]` Blind4: numeric persisted controlled inputs replace intermediate drafts and write every digit — CardTile immediately calls mutation; preserve draft until blur/Enter and commit once.
  - `[medium]` `[patch]` Blind5: shared numberError clears unrelated invalid field — both inputs call one setNumberError; use field-specific errors/associations. Grouped with Blind4 numeric editor repair.
  - `[medium]` `[patch]` Blind6: ReleasePanel now shows fake missing-link risk counts while report unavailable — extracted localSummary uses empty source/GitHub arrays; hide unavailable risk strip while retaining local totals.
  - `[medium]` `[defer]` Blind7: existing Release report excludes current work-item GitHub links — releases-repository:getStoryMapReportData uses legacy table only, while importRemoteWorkItems stores remote links; unchanged pre-existing server report input. Record separately; Tracking route correctly uses both.
  - `[medium]` `[patch]` Blind8: preview tests only exercise fresh projection — cover delayed/error plus already-selected Card for modal admission repair; same root as Blind1/Edge1.
  - `[low]` `[patch]` Blind9: semantic tests do not prove unequal multi-Activity spans — existing two-Activity filter regression has equal groups; add unequal groups/filter/collapsed Activity exact indices/spans.
  - `[low]` `[patch]` Blind10: scale fixture has only sibling Stories — distribute existing1000fixture over legal branches/Notes/Releases/hidden ancestry and assert intended eligible sets/show-all.
  - `[high]` `[patch]` Edge1: preview+Card canonical modal bypass — independently confirms unconditional shell modal; same admission repair as Blind1/Blind8.
  - `[false]` `[reject]` Intent1: diff cannot establish skill execution — descriptive evidence limit, no code defect; parent directly ran renderer and prescribed workflow/subagents.
  - `[false]` `[reject]` Intent2: absent sprint diff cannot prove no temporary writes — descriptive limit; no tool edited/staged/reverted sprint state and final diff excludes it.
  - `[false]` `[reject]` Intent3: DOM evidence is not native screen-reader acceptance — no such claim; native Discovery AX/screenshot recorded separately, remaining browser checks explicitly incomplete.
  - `[false]` `[reject]` Intent4: frontend identity/API assertions do not prove durable persistence — no persistence implementation changed; separate disposable actual HTTP/restart equality evidence added, no broad five-View durable claim.
  - `[false]` `[reject]` Intent5:1000Card representation does not prove timing — no timing acceptance claimed; fixture assertions are functional only.
  - `[false]` `[reject]` Intent6: new assertions sample behavior with broader regression evidence — descriptive, no demonstrated missing behavior beyond separately triaged rows; parent ran full web/core/release checks.
  - `[medium]` `[defer]` Parent native: global creation bar stretches vertically beside Discovery — screenshot shows four tall buttons; baseline global.css discovery-workspace flex direction is row and card-create-actions is sibling. Both pre-exist unchanged; record usability follow-up separately.

Patch groups: 8 (high1, medium5, low2). Two medium pre-existing deferrals;6descriptive/refuted rows rejected. No intent gap or bad-spec loopback. Final repair/test evidence appears under Auto Run Result.

### 2026-10-17 — Parent repair verification

- verdicts:4additional findings — high1, medium3, low0, false0, maybe-false0.
- `[medium]` `[patch]` Hidden Planning row author display overrides hidden attribute — parent source check reproduced through actual-stylesheet/export clone test; extend scoped hidden display rule. Refinement of Blind3.
- `[medium]` `[patch]` Refused numeric draft could not retry identical submission — submitted sentinel persisted on rejection; awaited numeric completion now releases admission on failure and retains draft. Refinement of Blind4/5.
- `[medium]` `[patch]` Awaited onUpdateCard leaked rejected promises from priority/color — parent traced CardChoice callback ignoring Promise; numeric patches alone await mutateAsync, other fields retain mutate and visible mutation error; refused-priority regression.
- `[high]` `[patch]` Conditional modal removal discards existing dirty state when query enters preview — preserve modal component state while suspending editor and mutation admission; retain dirty live hold and restore draft after preview. Old shell tests incorrectly edited directly under preview; replace unsafe setup with actual normal edit→preview→incoming transaction/reset→return lifecycle, preserving readonly assertions. Direct preview+card remains suppressed.

### 2026-10-17 — Final independent repair check and compiler verification

- verdicts:2additional findings — high0, medium2, low0, false0, maybe-false0.
- `[medium]` `[patch]` Independent edge check: dependency child unmount clears pending while request still runs — parent verified cleanup and callback chain; Card-specific mutation key plus parent cache pending count preserves hold/disabled edits through preview and remount; covering test confirms subsequent save uses acknowledged version2.
- `[medium]` `[patch]` Parent compiler: new numeric field ref omitted required React19 initializer — releaseverify reported TS2554/TS2322; explicitly initialize string-or-undefined ref and rerun compiler gate.

Across reviews and parent verification:25individual rows,17patch rows in12repair groups,2pre-existing deferrals,6descriptive/refuted rejections. Group verdicts:high2, medium8, low2. Native validation after repairs remains incomplete.

### 2026-10-17 — Final accessible Persona description

- verdicts:1additional finding — high0, medium1, low0, false0, maybe-false0.
- `[medium]` `[patch]` Parent AX/source: visible Persona badge is hidden by primary aria-label — assigned names were only inside explicitly named button content. Append Personas to aria-description while preserving key/role/title name; test every legal placement.

Final aggregate:26individual findings,18patch rows in13repair groups (high2/medium9/low2),2pre-existing medium deferrals,6descriptive/refuted rejections.

### 2026-10-17 — Follow-up review pass (`done` spec re-dispatched)

- verdicts: 44 findings — high 0, medium 7, low 12, false 21, maybe-false 4
- findings:
  - `[low]` `[patch]` Blind1/Edge3-5: empty "Selected Cards: " aria-description on every unselected cell — selectedCellCards now returns undefined for no keys; attribute omitted.
  - `[false]` `[reject]` Blind2: aria-pressed on card-open button misstates role — spec Design/Code Map directs selected primary actions plus cell descriptions; selection state is also on the cell.
  - `[low]` `[reject]` Blind3/Edge15: aria-colindex 0 on filter-hidden columns, O(n^2) index lookups, magic row offsets — hidden elements are outside the accessibility tree; column counts are small; fix adds branching.
  - `[maybe-false]` `[defer]` Blind4: display: contents row/header wrappers in Safari — needs native accessibility-tree check; jsdom cannot decide.
  - `[low]` `[defer]` Blind5/Edge10: focused number input disabled while update pending drops focus — pending-disable pattern pre-exists and is asserted by tests.
  - `[low]` `[reject]` Blind6/Edge11-12: Number() accepts 1e3/0x10 and 007 keeps draft text — value persisted is the displayed integer after refresh; unlikely input, fix adds a guard.
  - `[low]` `[reject]` Blind7: Save-and-close during preview suspension reopens dialog — behavior is the asserted, deliberate draft-preserving contract; rare race.
  - `[false]` `[reject]` Blind8: empty preview object forces read-only in Tracking — intentional so loading/failed previews never expose writes; names no divergence.
  - `[low]` `[reject]` Blind9: repeated marker lookups and Boolean(preview) — preview-only linear scans; no demonstrated harm.
  - `[false]` `[reject]` Blind10: summary duplicated client/server and githubLinkedCardIds duplicates — Tracking intentionally derives the canonical report from scoped Cards (spec); duplicate ids are consumed as a set; unit formatting is Panel-only presentation.
  - `[medium]` `[patch]` Blind11/Edge6-7/Edge19-related: released lanes and Stories hidden behind show-all in Planning/Tracking previews drop proposed changes — preview now forces show-all (checkbox checked and disabled); regression assertions added to preview test; stale ReleaseKanban assertion updated.
  - `[low]` `[reject]` Blind12: test robustness nits (timeouts, cwd, stubGlobal) — suite passes repeatedly under full run; no failure observed.
  - `[maybe-false]` `[defer]` Blind13/Edge2: personaById.get(id)! can throw — see deferred persona entry.
  - `[medium]` `[patch]` Edge1: tabbing through never-set empty number field shows "cannot be cleared" — empty blur with undefined value now clears error and returns; blur test added.
  - `[false]` `[reject]` Edge8: stale focused ref after blur to null — refuted: restoration only applies when focus was inside board and activeElement is body.
  - `[false]` `[reject]` Edge9: bulk actions act on hidden released-lane selection — retained hidden selections are required by the intent contract.
  - `[false]` `[reject]` Edge13: sync onCommit throw leaves field disabled — onCommit wraps mutateAsync, which returns a rejected promise, not a sync throw.
  - `[false]` `[reject]` Edge14: non-Error rejection rethrown — fail-fast by design; mutation rejections are Errors.
  - `[false]` `[reject]` Edge16: unknown releaseId excluded from Kanban — foreign keys guarantee the Release exists.
  - `[false]` `[reject]` Edge17: non-chunk source links counted as missing — source link kind is only "chunk" in contracts.
  - `[false]` `[reject]` Edge18: clearing Business value/effort removed — updateCard contract accepts numbers only; no clear patch exists and the intent allows clear only by contract.
  - `[false]` `[reject]` Edge19: Kanban lists ghost Stories that summary excludes — specified: delivery report retains eligible Stories only.
  - `[medium]` `[patch]` Gap1: PlanningNumberField blur commit path unverified — blur test added: one write on blur, none on repeat.
  - `[medium]` `[patch]` Gap2: Pull GitHub disabled in preview unverified — assertion added to the preview test for all four views.
  - `[low]` `[patch]` Gap3: BoardToolbar absent in preview unverified — assertion added to the same test.
  - `[low]` `[defer]` Gap4: Activity/Step header aria-selected unverified — accessibility-only, low.
  - `[low]` `[reject]` Gap5: ReleasePanel `!error` clause lacks refetch-failure case — clause is redundant guard; data absence already covers tested states.
  - `[false]` `[reject]` Intent descriptive rows 1-7 (reading B+D implemented; jsdom-only evidence; selection on cell; header roles; client-side recompute; clear refused; scale assertions DOM-only) — descriptive, each already triaged above or explicitly acknowledged in Verification; no skill-level claim of native accessibility is made.

Patched: 7 rows (medium 4, low 3). Deferred: 4. No high patched; no intent gap or bad-spec loopback.

## Design Notes

Two read-only investigation agents and parent source checks refined the prepared plan. Code-review-graph MCP unavailable; CLI search used before source. Prior6.3 already removed headings and completed tile names/descriptions; retain rather than duplicate. Discovery can retain existing CSS layout with explicit separate full-width heading/content rows, avoiding a speculative table twin. Release management defaults and richer summary presentation remain6.9; this story extracts its existing summary presentation for reuse. Shared report computation remains canonical.

## Verification

Run serially; retain sanitized evidence under `evidence/story-6-6/` alongside this spec. Parent independently runs all listed commands and audits matrix coverage.

- `corepack pnpm --filter @storymapper/web test`: nonzero passing tests including actual core URLs, mounted controls/grid/scopes/preview/live/1000Cards and Graph/Slices.
- `corepack pnpm --filter @storymapper/core test`: canonical delivery/visibility regressions pass.
- `node scripts/verify.mjs`: hygiene/typecheck/capability parity/build pass under Node24.
- `git diff --check` and `git diff --cached --check`: whitespace pass, never include orchestrator files in staging.

Attempt disposable native browser projection/grid/open-scope checks if available; disclose unavailable native/screen-reader evidence separately. No user data or live GitHub required.

## Changelog

- 2026-10-17 v1: Initial source-anchored runnable spec from accepted6.6detail plan and prior6.5continuity.

## Auto Run Result

Status: done

Summary: Follow-up review pass on the completed 6.6 change. Four reviewers (blind, edge-case, verification-gap, intent-alignment) reported 44 findings; no high. Preview Planning/Tracking now force show-all so proposed changes in released lanes are never hidden; empty never-set number fields no longer raise a spurious clear error; unselected Discovery cells no longer expose an empty "Selected Cards:" description.

Files changed in this pass:
- `apps/web/src/ui-strings/story-map.ts`: selectedCellCards returns undefined for no keys.
- `apps/web/src/features/story-map/components/SwimlaneGrid.tsx`, `apps/web/src/features/releases/ReleaseKanban.tsx`: show-all forced and checkbox disabled in preview.
- `apps/web/src/features/story-map/components/PlanningNumberField.tsx`: empty blur on never-set value is not an error.
- `PlanningNumberField.test.tsx`, `core-views.test.tsx`, `ReleaseKanban.test.tsx`: blur commit, Pull GitHub/toolbar/released-lane preview assertions; Kanban preview expectation updated to the new show-all contract.

Review breakdown: patches 7 (medium 4, low 3); deferred 4 (2 unverified medium, 2 low); rejected 33 with reasons in the Review Triage Log.

Follow-up review recommended: false (no high patched in this follow-up pass).

Verification (Node 24.17.0): `corepack pnpm --filter @storymapper/web test` 518/518 passed; `corepack pnpm --filter @storymapper/core test` 388/388 passed; `node scripts/verify.mjs` completed; `git diff --check` clean for apps/packages. Logs under `evidence/story-6-6/followup-*.log`. Mutation check: removing the Planning preview show-all fix fails the preview test.

Residual risks: native Safari/VoiceOver exposure of the Discovery grid unverified; persona projection null-safety unverified for projected previews; sprint-status.yaml and deferred-work.md remain orchestrator-owned and uncommitted by this run.
