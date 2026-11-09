---
title: '6.2 Create and edit Cards'
type: feature
created: '2026-10-17'
status: done
baseline_revision: 8ff1a4ef433c8ba8e4bdb7062136994080d594d4
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-preparation.md'
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-6-2-create-and-edit-cards.md'
warnings: [oversized]
deferred:
  - summary: >-
      Detail-modal category choices remain visually color-only, unlike the new tile category chips.
    evidence: |-
      Pre-existing empty swatch buttons retain accessible labels and now selected-state semantics; central glyph/word additions apply to tile controls. Sighted users still rely on swatch colors/tooltips in detail.
    location: >-
      apps/web/src/features/story-map/components/CardDetailModal.tsx:334
    severity: low
  - summary: >-
      Planning business-value and effort inline edits still omit blanks and submit invalid fractions without local validation.
    evidence: |-
      Pre-existing CardTile planning handlers send undefined for blanks and Number(value) for other text; the non-nullable integer API rejects invalid numbers and omission retains saved numbers. Modal validation now explicitly refuses these drafts, but unchanged Planning handlers retain their earlier behavior.
    location: >-
      apps/web/src/features/story-map/components/CardTile.tsx:159
    severity: medium
  - summary: >-
      Roadmap progress still prints estimate totals in points instead of the story map estimation unit.
    evidence: |-
      panelStrings.roadmapProgress hard-codes pts and RoadmapPanel passes no unit; unverified whether a roadmap can span story maps with different units, which would settle the intended behavior.
    location: >-
      apps/web/src/ui-strings/index.ts:148
    severity: medium (unverified)
  - summary: >-
      Discovery Create buttons stay live while the board shows a ChangeSet preview snapshot.
    evidence: |-
      The story-map shell passes the preview snapshot into DiscoveryMatrix; the Create buttons and composer are not gated on preview. The earlier inline add controls were equally ungated, so this predates Story 6.2.
    location: >-
      apps/web/src/features/story-map/components/DiscoveryMatrix.tsx:225
    severity: medium
---

Reproducing statement: Implement dispatched Story 6.2 through bmad-build-auto, preserving orchestrator ownership of sprint-status.yaml. Date: 2026-10-17. Version: 1. Changelog: Initial source-investigated runnable spec.

<intent-contract>

## Intent

**Problem:** Everyday Card creation lacks legal Note/root paths, some created Cards are hidden, estimates hardcode points, and category/priority controls lack accessible current-value selection.

**Approach:** Complete all-role creation and field editing using existing versioned commands, retain legal Notes and Discovery delivery fields, and reuse central role/category/priority definitions with accessible controls and map units.

## Boundaries & Constraints

**Always:** Follow accepted Epic 6 preparation/6.2 detail plan. Centralize English UI strings. Create Activity at root, Step at root/Activity, Story at root/Step, Note at root/Activity/Step; preserve authoritative core validation. Opening composer and submitting count as at most two control actions per role/context, excluding form text/field entry. Persist title, parent, position and optional Release. Use actual user titles. Preserve actor attribution, root versions, ADR0002 history coalescing, owned-link versioning, provenance, live holds, Restore epochs, conflicts and read-only preview safety. Preserve arbitrary existing priority/color strings visibly. Estimate input/output uses snapshot.storyMap.estimationUnit, including zero. Reuse existing create/update/link APIs, Dialog and invalidation.

**Never:** Write, stage or revert sprint-status.yaml or orchestrator state; infer verification from bookkeeping; touch user Projects/data; bypass ChangeSet-first external/Agent mutation; add hidden create-then-update; require one history row per Save; implement future 6.3 movement/selection or 6.5 collapse work; introduce taxonomy/dependencies/new public commands. Numeric contracts remain optional non-nullable; clearing only where existing contracts allow. No new template-assisted creation requirement: preserve existing modal template application; any later creation template extension must be explicit and atomic.

</intent-contract>

## Code Map

- `apps/web/src/features/story-map/components/DiscoveryMatrix.tsx`: existing Activity/Step/Story AddControl paths; early no-Activity return hides root non-Activities; Activity/Step selectors omit child Notes. Keep Release lanes and retained hidden DOM behavior.
- `apps/web/src/features/story-map/components/DiscoveryLanes.tsx`: AddControl opens an input, Enter submits and immediately closes; reusable compositor must retain failed draft/show pending/errors and visible submit. NotAssignedLane already projects root non-Activities. Extend or replace locally, avoiding a second creation transaction.
- `apps/web/src/features/story-map/useStoryMapBoardState.ts:143,203`: createCard mutation/invalidation and addActivity; reuse authoritative create API. `components/TreeGrid.tsx:35` excludes Notes; include legal hierarchy Notes and use actual estimate/unit instead of hardcoded points/effort substitution.
- `apps/web/src/features/story-map/components/CardTile.tsx`: empty color trigger/popover, inaccessible priority popup, white-on-orange badge, priority clear undefined, suppressed Discovery Release. Preserve data-card-id/data-live-card-id, dependency/change/preview markers and title opening.
- `apps/web/src/features/story-map/card-visual-options.ts`, `card-taxonomy.ts`: single category/priority/role definitions. Extend existing categories with distinct glyphs. Do not narrow persisted values. `components/BoardToolbar.tsx`: replace free-hex bulk color, reuse priority options.
- `apps/web/src/features/story-map/components/CardDetailModal.tsx:194,319`: number blanks omitted, estimate label lacks unit, unknown priority lacks option. Existing description/assignee empty and release null can clear. Show validation for unsupported clearing of populated numeric fields; do not silently report save success with discarded draft. Priority may use empty string. Keep live/dirty conflict semantics.
- `apps/web/src/features/story-map/components/DescriptionEditor.tsx`: already serializes Markdown; preserve it and actual formatting save/reload coverage.
- `apps/web/src/features/releases/ReleaseKanban.tsx`: points output needs map unit from caller; identify and update applicable callers. Other estimate outputs in changed board surfaces must use configured unit.
- `apps/web/src/ui-strings/story-map.ts`, `panels.ts`, `apps/web/src/styles/global.css`: central copy and visual selection/contrast styles; preserve existing arbitrary visual values.
- `apps/web/src/features/story-map/views/DiscoveryView.test.tsx`: actual retained/filter view harness; extend real creation and Note visibility tests. `components/card-detail.test.ts`, `card-detail-test-fixture.ts`: actual routed modal integration, save/reload/dirty/Markdown/conflict tests.
- `packages/contracts/src/api/card-customization.ts:18,43`, `packages/contracts/src/schemas/domain.ts:79`: current create/update contracts; numbers are optional non-nullable, Release nullable. `packages/db/src/repositories/cards-repository.ts:37`: existing create atomic insertion. Read-only unless exact required behavior proves a change necessary.
- `packages/db/src/repositories/root-versions.test.ts:185,223`: owned link add/remove version increments and same-actor history coalescing already tested; preserve and extend focused scalar/zero roundtrip proof if missing.
- Graph MCP unavailable; CLI search/query used, reports stale index and empty coverage. Source wins. Global rules, matching Cursor rules and OpenWolf cerebrum apply. sprint-status.yaml/deferred-work.md/.bmad-loop state are read-only.

## Tasks & Acceptance

**Execution:**
- `DiscoveryMatrix.tsx`, `DiscoveryLanes.tsx`, `useStoryMapBoardState.ts`, optional dedicated composer component -- complete directly opened all-role/context composer, visible submit, authoritative hierarchy, pending/error/draft retention and single create. Expose missing legal root and Note placements; display created Notes/roots even without Activities. Keep existing contextual shortcuts and Release placement.
- `TreeGrid.tsx` -- display legal Notes in hierarchy and unit-aware actual estimates, including zero.
- `CardTile.tsx`, `card-visual-options.ts`, optional shared choice component, `BoardToolbar.tsx`, `global.css` -- category glyph plus non-Standard word, current-value accessible names, listbox/options/current selected, keyboard selection/Escape/focus return; equivalent priority names/listbox, central options, >=4.5:1 priority text contrast; replace bulk hex with category choices. Preview never mutates. Preserve custom values visibly, Discovery Release/status/estimate/priority and stable tile identity.
- `CardDetailModal.tsx`, `ReleaseKanban.tsx` and callers, English strings -- unit-aware fields/outputs, scalar saves and supported clears, explicit invalid numeric/unsupported-clear errors, unknown priority preservation; verify Markdown and template application through existing save, plus relationships.
- Existing focused view/modal tests and new choice tests as needed, `root-versions.test.ts` -- test actual controls and API roundtrips, legal roles/Notes/placement, zero/non-points, blank/invalid numbers, arbitrary values, read-only controls, conflict/version/history and relationship saves. No boilerplate mirrored tests.

**Acceptance Criteria:**
- Given each legal role/context, when opening composer, entering title/fields and submitting, then within two control actions the correct role, parent, position and optional Release persist and remain visible after reload; role text comes from the central definition.
- Given a failed create, when the server refuses it, then its reason is visible and the draft remains available for correction without a partial Card or hidden follow-up update.
- Given Card detail, when editing title, Markdown description, Workflow Status, priority, business value, effort, estimate, color, assignee, Release, Personas, Annotations or Source Links and reloading, then actual values persist and each accepted save advances the root version, preserving coalesced history. Supported clears persist; unsupported numeric clearing/invalid numbers are visible and cannot silently succeed.
- Given a non-points map and zero estimate, when editing or displaying board/Tree/Tracking estimates, then configured unit and zero survive without substituting effort for absent estimate.
- Given category/priority controls, when operated by keyboard, then current value is named (Color: Blocker. Change color / Priority 2. Change priority), expanded popup is a listbox with selected option, selection saves and Escape returns focus. Category has distinct glyph and non-Standard text; priority contrast is >=4.5:1. Unknown values stay visible, and preview controls never write.
- Given Discovery and the bulk toolbar, when rendering, then Release/status/estimate/priority remain available and bulk category choices replace free hex input.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass

- verdicts: 19 findings — high0, medium10, low2, false7, maybe-false0. Blind floor arithmetic is not a finding. Returned order: Blind10, Edge2, Gap1, Intent6. Agent capacity rejected concurrent launches; all four completed before triage.
- findings:
  - `[medium]` `[patch]` Blind 1: pending composer fields remain editable — Verified submitted request captures old fields and success closes; disable fields during pending create with delayed response regression.
  - `[medium]` `[patch]` Blind 2: inline listbox ref resets focused option — Callback identity changes on parent render; focus only on opening and assert focused option survives rerender.
  - `[medium]` `[patch]` Blind 3: all listbox options participate in Tab order — Native buttons default to tabindex0; remove from sequential order while preserving arrow/native activation.
  - `[medium]` `[patch]` Blind 4: non-JSON create errors lose transport status — New unconditional response.json can throw SyntaxError; preserve RequestError with narrow parse handling.
  - `[medium]` `[patch]` Blind 5: Activity Notes lose badges/provider metadata — New Activity Note projection omits existing externalRefs/dependencies/githubSyncState/workItemProvider props; pass canonical state through.
  - `[low]` `[patch]` Blind 6: Activity Note lacks tile Delete action — New projection omits onDelete while other Note positions have it; pass existing setDeleteTarget handler.
  - `[low]` `[defer]` Blind 7: detail-modal color swatches remain color-only — Real pre-existing sighted usability limitation; current story tile chip requirements are fixed, detail accessible names/pressed state remain. Record separately without redesign.
  - `[medium]` `[defer]` Blind 8: Planning numeric edits omit blank/invalid values — Both businessValue/effort onChange handlers predate this change unchanged; defer exact inline-surface problem, preserving current modal correction.
  - `[false]` `[reject]` Blind 9: mock creation tests do not establish durable insertion — Accurate scope limit of those UI tests, not an uncovered actual failure: parent actual HTTP acceptance independently executes all8creates, illegal-hierarchy no-write and actual server restart/readback. DB scalar reopen/version tests also run; no claim mocked POST proves SQLite.
  - `[false]` `[reject]` Blind 10: synthetic click cannot prove browser activation/contrast — No defect in native button activation demonstrated. Evidence explicitly states jsdom scope; computed changed CSS contrast is7.48:1. Safari changes outside task prevented safe native acceptance, recorded as unverified rather than claiming browser success.
  - `[medium]` `[patch]` Edge 1: non-JSON create failure — Same verified transport parser issue as Blind4; same narrow RequestError preservation.
  - `[medium]` `[patch]` Edge 2: pending composer edits discarded — Same demonstrated state as Blind1; same disabled-fields patch.
  - `[medium]` `[patch]` Gap 1: contextual composer defaults untested — Pre-verified regression gap: toolbar tests override placement and would miss removed initialReleaseId. Add contextual Story/Step defaults with title-only submission.
  - `[false]` `[reject]` Intent 1: durable creation versus mocked transport — Actual isolated HTTP routes and server-restart persistence now supplement UI tests; evidence distinguishes surfaces.
  - `[false]` `[reject]` Intent 2: modal/DB tests are separate layers — True evidence boundary, not a defect or a continuous browser claim. Actual HTTP scalar save/clear/restart also verifies server path; native UI boundary remains explicit.
  - `[false]` `[reject]` Intent 3: synthetic keyboard versus browser accessibility — Accurate documented boundary; no actual incorrect behavior demonstrated, no browser/WCAG pass claimed. CSS contrast calculated separately; native activation risk remains in result.
  - `[medium]` `[patch]` Intent 4: contextual shortcuts not exercised — Same specific regression gap as Gap1; contextual defaults tests cover it.
  - `[false]` `[reject]` Intent 5: preserved behavior relies on existing suites — Referenced Story6.2 and accepted plan were loaded directly. Existing Markdown, relationships, conflicts and root-history tests were read and freshly run in full web/DB gates; tests need not be new to count.
  - `[false]` `[reject]` Intent 6: bookkeeping versus independent evidence — No problematic outcome: protected sprint/run files absent from owned diff, no row used as proof; raw failed and passing command evidence retained.

Review repairs completed: all seven groups applied (six medium, one low; ten reported rows). Contextual defaults tests additionally detected and corrected sibling-position counting: Step counts its role, Story counts its role/Release, preserving prior contextual append semantics. Focused25 tests and final full376web/417DB gates pass. Native Enter/Space/default browser Tab behavior remains unverified because Safari changed outside this task.

### 2026-10-17 — Review pass (follow-up)
- verdicts: 56 findings — high 2, medium 3, low 32, false 15, maybe-false 4
- findings:
  - `[low]` `[patch]` Blind 1: composer Position stays stale when Release changes — Story append position depends on Release; Release onChange now recomputes it for stories, with a Story-composer regression test.
  - `[low]` `[reject]` Blind 2: cleared Position yields NaN state — `required` and number-input constraint validation block submission; only a React dev warning remains, and a guard adds branches for no user-visible harm.
  - `[low]` `[reject]` Blind 3: composer offers Root parents/Release on every role, parent rules inline — Root is legal for Step/Story and Release is an optional persisted field per the intent; core stays authoritative; no central legal-parent table exists to reuse.
  - `[high]` `[patch]` Blind 4: wrapper onBlur closes the popup when relatedTarget is null — Safari/Firefox on macOS do not focus buttons on click, so the pointer press blurs the focused option, the popup unmounts and the option click is lost; wrapper now prevents default on mousedown, with a regression test.
  - `[false]` `[reject]` Blind 5: removed stopPropagation lets color/priority clicks open the detail modal — CardChoice is a sibling of `.card-content-button` (the only onSelect source), and the article has no click handler, so nothing bubbles into selection.
  - `[low]` `[reject]` Blind 6: inconsistent clearing semantics, color cannot be cleared — Color has no clearing control and the contract keeps it non-nullable; priority clear and refused numeric clears are the intended, visible behavior.
  - `[low]` `[reject]` Blind 7: validateNumbers permissive and its error stale until next Save — Negative numbers are accepted by the existing contracts, and clearing a submit-time error on the next Save is normal form behavior.
  - `[maybe-false]` `[defer]` Blind 8: roadmapProgress still prints `pts` — RoadmapPanel is not a changed board surface and has no map unit in scope; whether a roadmap spans maps with different units is unverified (would be medium if true; unverified. Settling check: whether a roadmap can span story maps with different estimationUnit). Other sub-claims (duplicate estimateWithUnit, prop threading) are design preferences without named harm.
  - `[low]` `[patch]` Blind 9: dead code and CSS left after inline add removal — Verified unreferenced: EPIC_ADD_KEY/columnWidth branch, addActivity and title state in useStoryMapBoardState, prio1-5 strings, three CSS rules; deleted.
  - `[low]` `[reject]` Blind 10: repeated createCard.reset()+setComposer at eight call sites — Maintainability preference; no divergence demonstrated and a helper is more than a direct correction.
  - `[low]` `[reject]` Blind 11: duplicate Create Activity/Create Note labels and unsorted Activity Notes — Buttons sit inside their Activity/Step cells and the story/step add tiles carry contextual labels; Notes under steps are already rendered by the same projection.
  - `[low]` `[defer]` carried Blind 12: detail-modal color swatches stay color-only, unknown color shown as bare text — Already deferred as the first deferred item; swatch names and pressed state exist.
  - `[low]` `[reject]` Blind 13: bulk estimate placeholder-only label, emoji glyph rendering, hard-coded popover colors, no typeahead — Placeholder label predates the change, contrast was computed at 7.48:1, and the rest are polish with no demonstrated failure.
  - `[false]` `[reject]` Blind 14: undocumented display changes (Tree effort fallback dropped, Discovery Release name, Tree Notes) — All three are required by the spec (no effort substitution for absent estimate, Discovery Release retained, legal Notes in hierarchy).
  - `[low]` `[reject]` Blind 15: throwCardCreationFailure duplicates throwRequestFailure — Duplication of a short handler; no caller will diverge today and folding it changes every mutation's error text, which is out of this story.
  - `[false]` `[reject]` Blind 16: new DB test outside describe leaks fake timers — The file-level afterEach calls vi.useRealTimers() and the test's cleanup array is drained there.
  - `[low]` `[reject]` Blind 17: missing tests for NaN, Escape while pending, Home/End, Backlog/Swimlane/Tracking units — Specific units and bulk-toolbar gaps are covered by the verification-gap rows; the rest guard behavior with no demonstrated defect.
  - `[high]` `[patch]` carried Edge 1: popup closes before option click on browsers that do not focus buttons — Same defect as Blind 4; same mousedown fix.
  - `[low]` `[reject]` Edge 2: choosing the already-selected option writes again — Previous tile popovers also wrote on every click; no wrong data results.
  - `[false]` `[reject]` Edge 3: ArrowUp with no focused option jumps to second-to-last — Keydown handler is on the popup, so focus is inside an option and index is never -1 for a real event.
  - `[low]` `[patch]` carried Edge 4: stale Position after Release change — Same defect as Blind 1; same fix.
  - `[low]` `[reject]` Edge 5: Notes and Stories counted separately for append position — Preserves the prior contextual append semantics recorded in the first review pass; tie ordering is cosmetic.
  - `[low]` `[reject]` Edge 6: default Position stale if the snapshot changes while open — Field is visible and editable; narrow race with no data loss.
  - `[low]` `[reject]` carried Edge 7: NaN Position — Same as Blind 2.
  - `[medium]` `[patch]` Edge 8: modal Save writes priority "" on Cards that never had one — Verified updateCard stores "" and collectPriorityAllowedIds used `Number("") <= threshold`, so Cards with cleared/empty priority matched every priority filter; modal now sends priority only when changed and the filter treats empty priority as none.
  - `[low]` `[reject]` carried Edge 9: stale validation error — Same as Blind 7.
  - `[false]` `[reject]` Edge 10: negative numbers pass client validation — Existing contracts accept negatives; the spec requires only finite/whole-number validation.
  - `[low]` `[reject]` Edge 11: color clear omitted from request — Same as Blind 6; no clear-color control exists.
  - `[low]` `[patch]` carried Edge 12: dead add-control state and widths — Same as Blind 9.
  - `[low]` `[reject]` Edge 13: priority filter cannot isolate custom priorities — Previous hard-coded Prio 1-5 options had the same limit; not caused by this change.
  - `[maybe-false]` `[defer]` carried Edge 14: roadmap `pts` claim — Same as Blind 8.
  - `[low]` `[reject]` carried Edge 15: color-clear claim — Same as Blind 6.
  - `[medium]` `[patch]` Gap 1: bulk toolbar color/estimate/priority filter untested — Verified no test selected a bulk category or checked the unit placeholder; added a lifecycle test asserting the hex patch body and the Estimate (hours) placeholder.
  - `[low]` `[patch]` Gap 2: Backlog/Swimlane/Not-assigned units unasserted — Added a lifecycle test asserting `3 hours` on all three.
  - `[low]` `[reject]` Gap 3: planning-tile priority clear sends "" untested — Downstream harm fixed by the empty-priority filter patch; same clear path is covered by modal and DB tests.
  - `[maybe-false]` `[defer]` carried Gap other 1: roadmapProgress hard-codes pts — Same as Blind 8.
  - `[low]` `[patch]` Gap other 2: prio1-5 strings unused, filter label changed — Strings deleted with Blind 9; the P1-P5 label is the central priority option naming.
  - `[medium]` `[patch]` carried Gap other 3: modal sends priority on every Save — Same defect as Edge 8; same fix.
  - `[false]` `[reject]` Intent 1: backend untouched so persistence unproven — Core/DB already accept all legal roles; actual HTTP acceptance and restart readback were recorded in the first pass.
  - `[low]` `[reject]` Intent 2: parent eligibility hard-coded in composer — Same as Blind 3.
  - `[false]` `[reject]` Intent 3: Release offered for every role — Optional Release persisted per the intent; core validates.
  - `[false]` `[reject]` carried Intent 4: mocked-fetch creation tests — Evidence boundary was recorded in the first pass; HTTP acceptance supplements it.
  - `[low]` `[reject]` Intent 5: position test mirrors implementation filter — Contextual defaults test discriminates Release and level counts with seeded siblings.
  - `[false]` `[reject]` carried Intent 6: DB test covers update only — Create and restart persistence were verified through HTTP acceptance in the first pass.
  - `[false]` `[reject]` Intent 7: refusal simulated by canned 409 — Server errors use the {message} shape; the transport-status path has its own test.
  - `[low]` `[reject]` Intent 8: only tile controls have accessibility tests — Modal controls use native select/buttons with names asserted in existing modal tests.
  - `[maybe-false]` `[defer]` carried Intent 9: roadmap pts divergence — Same as Blind 8.
  - `[false]` `[reject]` Intent 10: Swimlane/Backlog/Tracking gain no creation entries — The intent names Discovery everyday creation; those views only needed the map unit.
  - `[false]` `[reject]` Intent 11: Release meaning differs for Notes under Activities — Optional Release persists; Discovery lane placement is unchanged behavior.
  - `[false]` `[reject]` Intent 12: Release name now on Discovery tiles — Required: Discovery delivery fields are retained by the intent.
  - `[false]` `[reject]` carried Intent 13: dropped click shielding — Same as Blind 5.
  - `[low]` `[reject]` Intent 14: Activity Notes are draggable tiles — Step Notes already use the same draggable tile; no 6.3 movement logic was added.
  - `[low]` `[reject]` carried Intent 15: priority filter lists only central options — Same as Edge 13.
  - `[low]` `[reject]` carried Intent 16: planning priority clear path untested — Same as Gap 3.
  - `[low]` `[reject]` Intent 17: glyph literals outside ui-strings — Glyphs are symbols, not English copy.
  - `[false]` `[reject]` Intent 18: bookkeeping files — Diff contains no sprint-status or orchestrator state.

Follow-up review repairs: four groups applied (one high, two medium, three low entries across the groups; see rows marked patch). Web 381 tests and typecheck pass; `node scripts/verify.mjs` completes.

### 2026-10-17 — Review pass (follow-up 2)
- verdicts: 45 findings — high 0, medium 6, low 26, false 13, maybe-false 0
- findings:
  - `[low]` `[reject]` carried Blind 1: CardChoice no longer stops click propagation — Same as earlier Blind 5; CardChoice is a sibling of the only onSelect source, so nothing bubbles to selection.
  - `[false]` `[reject]` carried Blind 2: Release select enabled for non-Story roles — Optional Release is persisted per the intent and core validates.
  - `[low]` `[reject]` carried Blind 3: NaN Position, default counts all snapshot cards — `required` blocks the empty submit; the field is visible and editable.
  - `[low]` `[reject]` carried Blind 4: stale validation error and Number() quirks — Existing contracts accept these; the error clears on the next Save.
  - `[low]` `[reject]` carried Blind 5: bulk estimate unvalidated, bulk color cannot clear — Placeholder label predates the change; no clear-color control exists by contract.
  - `[low]` `[reject]` carried Blind 6: priority filter labels lost threshold wording — Central priority option naming is the intended label.
  - `[false]` `[reject]` Blind 7: dead AddControl/openAddKey — AddControl and openAddKey are still used by the Release add control at DiscoveryMatrix.tsx:381; the unused CSS and strings were deleted earlier.
  - `[medium]` `[patch]` Blind 8: Roadmap progress still prints pts; estimateWithUnit duplicated in two string modules — Verified RoadmapPanel is rendered with one snapshot.storyMap, so the unit is known and `pts` is wrong for non-points maps; unit threaded into RoadmapPanel/roadmapProgress, ReleaseKanban uses the single storyMapStrings.estimateWithUnit, and RoadmapPanel.test.tsx asserts the unit.
  - `[medium]` `[defer]` Blind 9: Create buttons stay live while the board shows a ChangeSet preview — Verified the shell passes the preview snapshot into DiscoveryMatrix and the Create buttons are not gated; the prior inline AddControl was equally ungated, so pre-existing; gating is new branching across the matrix.
  - `[false]` `[reject]` carried Blind 10: creation only reachable from Discovery, one-field quick add replaced — Intent names Discovery everyday creation; other views only needed the unit.
  - `[low]` `[reject]` carried Blind 11: throwCardCreationFailure duplicates generic handling — Short handler; folding it changes every mutation's error text.
  - `[false]` `[reject]` carried Blind 12: DB test leaks fake timers — File-level afterEach restores real timers.
  - `[false]` `[reject]` carried Blind 13: unexplained display changes — All required by the spec.
  - `[low]` `[reject]` carried Edge 1: choosing the current option writes again — Previous popovers wrote on every click; no wrong data.
  - `[low]` `[reject]` Edge 2: disabled flips while the listbox is open — Needs a preview or read-only change while a popup is open; no data corruption.
  - `[low]` `[reject]` Edge 3: Shift+Tab to the trigger leaves the popup open — Next Tab or blur closes it; a keydown branch for a cosmetic state is not worth it.
  - `[false]` `[reject]` carried Edge 4: ArrowUp with no focused option — Handler is on the popup so focus is always inside an option.
  - `[low]` `[reject]` Edge 5: stale parent after the parent is removed while the dialog is open — Narrow race; the server refuses with a visible reason.
  - `[low]` `[reject]` carried Edge 6: stale default Position — Field is visible and editable.
  - `[low]` `[reject]` carried Edge 7: NaN Position — Same as Blind 3.
  - `[false]` `[reject]` carried Edge 8: Release for non-Story roles — Same as Blind 2.
  - `[low]` `[reject]` Edge 9: whitespace title reaches submit() via Enter — Server refuses the empty trimmed title and the reason is shown; the draft is retained.
  - `[low]` `[reject]` carried Edge 10: stale validation error — Same as Blind 4.
  - `[false]` `[reject]` carried Edge 11: negative and hex numbers pass — Existing contracts accept negatives.
  - `[low]` `[reject]` carried Edge 12: identical Create Note names — Buttons sit inside their Activity/Step cells.
  - `[low]` `[reject]` Edge 13: Note with an unmatched Release id is hidden — Stories with an unmatched Release behave the same before this change.
  - `[low]` `[reject]` carried Edge 14: priority labels — Same as Blind 6.
  - `[medium]` `[patch]` Edge 15: roadmap pts claim — Same defect as Blind 8; same fix.
  - `[medium]` `[patch]` Gap 1: Roadmap unit has no test — Same defect as Blind 8; RoadmapPanel.test.tsx renders the panel on an hours map.
  - `[medium]` `[patch]` Gap 2: empty-priority filter exclusion untested — Verified no test covered the earlier filter fix; lifecycle test fails when `card.priority &&` is reverted to `!== undefined`.
  - `[low]` `[reject]` carried Gap 3: planning-tile priority clear untested — Downstream harm fixed by the filter patch; clear path covered by modal and DB tests.
  - `[low]` `[reject]` carried Gap other 1: P-labels read as exact matches — Same as Blind 6.
  - `[false]` `[reject]` Gap other 2: wrapper mousedown preventDefault affects the trigger — Intended: it only stops the press from blurring the focused option; the trigger click still fires.
  - `[low]` `[reject]` carried Gap other 3: NaN Position — Same as Blind 3.
  - `[low]` `[reject]` Gap other 4: matrix hidden when filters hide every Card — Same as before the change: toolbar and create actions remain.
  - `[false]` `[reject]` carried Intent: creation only on Discovery — Same as Blind 10.
  - `[false]` `[reject]` carried Intent: mocked fetch versus real commands — Actual HTTP acceptance and restart readback were recorded in the first pass.
  - `[false]` `[reject]` carried Intent: Release offered for every role — Same as Blind 2.
  - `[low]` `[reject]` Intent: two-action budget not asserted — Tests click open then submit; the count is structural.
  - `[medium]` `[patch]` Intent: roadmap estimate surface keeps pts — Same defect as Blind 8; same fix.
  - `[low]` `[reject]` carried Intent: bulk and filter are native selects — Native selects expose their current value.
  - `[low]` `[reject]` carried Intent: planning priority clear untested — Same as Gap 3.
  - `[low]` `[reject]` carried Intent: filter labels changed — Same as Blind 6.
  - `[low]` `[reject]` Intent: AddControl gained a submit button, affecting Release creation — Visible submit is required by the spec for creation and is harmless for Releases.
  - `[false]` `[reject]` carried Intent: sprint-status.yaml modified in the tree — Not in this diff; owned by the orchestrator.

Follow-up review repairs: one group applied (Roadmap unit plus string dedupe, two regression tests). Web 383 tests, DB 417 tests, typecheck and `node scripts/verify.mjs` pass.

## Design Notes

Reuse existing mutation boundary rather than broad backend changes. Optional numeric fields are non-nullable; absent values can stay blank, but attempting to clear a populated value needs visible refusal. Creation templates are not required by this story's AC; preserve modal template save and do not expand create contracts speculatively. History coalescing changes row count, never the accepted root-version increment.

## Verification

Run with installed Node24.17.0 first on PATH. Store sanitized raw logs/evidence under `evidence/story-6-2/` beside this spec; no user data or tokens.

- `corepack pnpm --filter @storymapper/web test` -- nonzero tests, all pass.
- `corepack pnpm --filter @storymapper/db test` -- persistence/version/history regressions pass.
- `corepack pnpm --filter @storymapper/web typecheck` -- no errors.
- `node scripts/verify.mjs` -- full release verification/typecheck/build pass (serialize after tests).
- `git diff --check` -- no whitespace errors.

Actual isolated browser acceptance if available: operate all-role creation, Note placements, keyboard category/priority and edit/reload unit behavior. Record exact actual evidence and untested boundaries; jsdom does not prove browser contrast/layout or full accessibility. Never use live GitHub or user Projects. No binding Epic6 timing gate.

## Auto Run Result

Status: done

Summary: Story 6.2 follow-up review pass 2. Four layers reported 44 findings; nearly all repeated rows already triaged. One new verified defect (Roadmap progress still printed `pts` on non-points maps) and one coverage gap (empty-priority filter) were patched.

Files changed in this pass:
- `apps/web/src/features/roadmaps/RoadmapPanel.tsx`, `apps/web/src/app/routes/story-map.roadmaps.tsx`: map estimation unit passed into the Roadmap panel.
- `apps/web/src/ui-strings/index.ts`: `roadmapProgress` takes the unit; duplicate `estimateWithUnit` removed.
- `apps/web/src/features/releases/ReleaseKanban.tsx`: uses the single `storyMapStrings.estimateWithUnit`.
- `apps/web/src/features/roadmaps/RoadmapPanel.test.tsx`, `apps/web/src/features/story-map/components/lifecycle.test.tsx`: unit and empty-priority filter regressions.

Review findings: patches applied 4 findings in one group (medium 4: Blind 8, Edge 15, Gap 1, Intent roadmap; plus Gap 2 medium); deferred 1 (Create buttons live in preview, medium, pre-existing); all other rows rejected with reasons in the triage log.

Follow-up review recommended: false (no high patched this pass; patched counts: medium 5, high 0).

Verification: `corepack pnpm --filter @storymapper/web test` 383 passed; `corepack pnpm --filter @storymapper/db test` 417 passed; web typecheck clean; `node scripts/verify.mjs` completed; `git diff --check` clean. Priority-filter test confirmed to fail when the fix is reverted.

Residual risks: native browser keyboard/contrast behavior remains jsdom-only; preview-mode Create buttons are ungated (deferred).
