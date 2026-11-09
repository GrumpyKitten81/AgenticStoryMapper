---
title: Slices view
type: feature
created: 2026-10-15
version: 5
status: done
baseline_revision: 94059925329f8d90ff4f4d2709031feaf670ee7c
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: Optimize Slices Card opening on the unfiltered 1,000-Card map toward the nominal 100 ms target.
    evidence: >-
      Native trusted Chrome click measured 116.9 ms including expected DOM, visible geometry and two animation frames. Raw failure retained in evidence/story-5-2-operator-browser.json. Maintainer explicitly accepted this observation for successful Story5.2 completion on 2026-10-15; profile before optimizing.
    location: apps/web/src/features/story-map/components/CardDetailModal.tsx — observed Slices-to-modal interaction; root cause not profiled
    severity: medium
  - summary: Investigate and improve automatic Restore completion navigation in the initiating browser.
    evidence: >-
      Database Restore completed and the other client canceled its stale comparison correctly, but the initiating client remained on progress until explicit reload showed Restoration complete. Maintainer accepted this manual recovery for Story5.2 completion on 2026-10-15. Root cause unconfirmed; reproduce before repair.
    location: apps/web/src/features/restore-points/RestorePointsPanel.tsx and restore-result.ts — observed completion/navigation path
    severity: medium
---

# Story 5.2: Slices view

Reproducing statement: Run bmad-build-auto for 5-2-slices-view with Epic 5 preparation and completed 5.1 continuity; independently verify requirements and never write, stage or revert orchestrator-owned sprint-status.yaml. Date: 2026-10-15. Version: 5. Changelog: Maintainer accepted scoped browser exceptions, retained raw evidence and recorded later optimization work.

<intent-contract>

## Intent

**Problem:** Planning has Release swimlanes but no Slices analysis, dependency ordering checks, Activity progress or immutable recorded Plan comparison.

**Approach:** Add a map-scoped Slices route with Story-only summaries and canonical movement, pure core analysis and explicitly recorded immutable Before/After states. Display captured lanes and values rather than inferring history from current data.

## Boundaries & Constraints

**Always:** Contracts are the schema source, core calculations pure, SQL restricted to DB repositories. Capture canonical state in one human-attributed synchronous UoW with Activity; preserve domain root versions and sync baselines. Store schema-versioned immutable Project-owned records with map scope per proposed ADR0005; no accepted ADR status is claimed. Ordinary read capabilities obey Agent scope/privacy. Keep archived/parked hierarchy out of the active Story cut while retaining canonical prerequisite identities. Use configured workflow `done` groups, English shared strings, accessible numeric/text cues, existing preview/live/dirty-editor guards. Reuse human moveCard for drag, keyboard and explicit move form. Actual browser verification uses nominal 100/300ms interaction/filter targets on 1,000 Cards. On 2026-10-15 the maintainer explicitly accepted the observed Story5.2 Card opening of 116.9ms and manual reload after successful Restore for completion, with optimization later. The 300ms filter target remains met. These are scoped acceptance exceptions; 5.1 exceptions do not transfer and no global performance or recovery guarantee changes.

**Never:** write/stage/revert sprint-status.yaml or deferred-work.md; infer verification from their rows; mutate user Projects; push; invent history or browser evidence; expose Agent capture writes; restore a Plan through comparison; implement Graph/drift/change drawers or SaaS/network features.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Slice summary | Active Stories, parent estimates, configured statuses | Per Release plus Unscheduled Story count/estimate/status, open-prerequisite blockers and Activity progress | Unknown statuses remain named and not done |
| Order | Dependent Story scheduled earlier than prerequisite or prerequisite unscheduled | Named `Blocked order` cue in Planning and Slices; order independent of completion | Complete canonical adjacency, including non-Story prerequisites; null ranks after all Releases |
| Blockers | Any dependency whose prerequisite is not configured done | Named open prerequisite, distinct from ordering violation | Archived prerequisites retain captured identity/status; do not silently drop edges |
| Capture | Human selects Record plan state | UUID, UTC time, Project/map scope, immutable schema-v1 projection and one Activity event | Agent refuses before writes; capture/audit failure rolls back |
| Compare | Before A:R1 B:R1, After A:R2 C:null | A Moved R1->R2, B Removed, C Added exactly once; reversed endpoints/categories invert | Same-map supported states only |
| Equality | Same state, Release rename, within-lane reorder | No membership changes; null assignment transitions are moves | Compare IDs, not titles or positions |
| Durability | Edit/delete/archive Cards/Releases then reopen | Captured displayed values/lanes/IDs/time unchanged | Missing/unsupported/cross-map state fails visibly; no reconstructed history |
| Lifecycle | Archive export/import, Restore | Retained selected-Project records; Restore returns point-in-time state set | Validate payload version and scope; no historical Card/Release FKs |
| Movement | Mouse/keyboard/form move | Same human move use case, attributed edit and recomputed named flags | Preserve conflict/error UI, focus and dirty fields; preview read-only |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/domain.ts` — Card, Release, configured WorkflowStatus and StoryMapSnapshot; new `schemas/plan-states.ts` defines immutable projection, list/capture/compare and Slice report schemas/types, exported via index.
- `packages/core/src/reports/reports.ts` — report patterns only; existing summary counts parents and timeline hardcodes done, so neither is the Slices oracle. New `reports/slices.ts` owns projection, summaries, blockers/order/progress and ID comparison. Reuse `visibleCards` and existing dependency direction dependent->prerequisite.
- `packages/db/src/repositories/projects-repository.ts:getStoryMapSnapshot` — canonical full cards/releases/statuses/dependencies capture source; `operation-snapshot-repository.ts` is transient executor state, not history.
- `packages/db/src/schema/tables.ts`, `connection.ts`, `schema/classification.ts` — new immutable plan_states schema/DDL, Project ownership and retained archive classification.
- `packages/db/src/repositories/storymapper-repository.ts`, new `plan-states-repository.ts`, `unit-of-work.ts`, `audit-repository.ts:logActivity` — bind read/write methods through active transaction; capture plus Activity atomic, reads pure.
- `packages/db/src/snapshot.ts`, `restore-validation.ts` — project-scoped archive pruning and integrity/schema checks; validate captured payloads/scopes, Restore uses existing point-in-time database replacement.
- `apps/server/src/application/report/report.use-cases.ts`, new `plan-state.use-cases.ts`, `application/descriptors.ts`, modules — human-only capture and scoped read/list/get/compare/Slices report descriptors; retain actual actor validation and Agent access.
- `apps/server/src/http/routes/report-routes.ts`, MCP report registration/project scopes, `scripts/mcp-tool-metadata.json` and generated capability artifacts — thin adapters and complete surface parity.
- `apps/web/src/app/router.tsx`, `app/routes/story-map-shell.tsx`, new `app/routes/story-map.slices.tsx` — own navigation URL, shared canonical modal and projected board state; preserve hold-updates and dirty editor.
- `apps/web/src/features/story-map/useStoryMapBoardState.ts`, `views/PlanningView.tsx`, `components/SwimlaneGrid.tsx` — existing drag/keyboard move handler; share named violations and expose accessible move form through same handler.
- New Slices components and `apps/web/src/app/api.ts`, `ui-strings/story-map.ts` — DESIGN Slice lane, explicit capture, labelled state selectors and side-by-side captured lanes with + Added/- Removed/> Moved old/new names; query errors visible and queries invalidated on capture/live/Restore.
- Read-only: orchestrator sprint/deferred ledger; completed 5.1 semantics and exceptions; user storage; `docs/adr/0005-recorded-plan-states.md` records the implementation proposal without asserting acceptance.

## Tasks & Acceptance

**Execution:**

- [x] Contracts/core files above — implement shared schemas, projection and pure golden-tested calculations for every matrix row.
- [x] DB schema/repository/lifecycle files above — immutable audited capture/list/get with versioned parser; exercise rollback, reopen, archive/Restore and unchanged domain/sync versions.
- [x] Server descriptors/adapters/metadata files above — human-only capture; scoped report/state reads on HTTP/MCP; regenerate and verify capability parity.
- [x] Web route/Slices/Planning/API/string files above — lane summaries/progress, shared violations/movement and durable captured Before/After presentation, accessible errors and focus.
- [x] Relevant core/DB/server/web tests — exact semantic, actor/privacy, immutable capture, lifecycle and mounted-route behavior; no mirrored boilerplate tests.
- [x] Configured checks, independent workflow review and isolated actual browser — mouse/keyboard/form movement, capture/edit/delete/reopen/reverse/equal/error flows and measured 1,000-Card budgets on final code.

**Acceptance Criteria:**

- Given active Stories, Releases and configured workflow groups, when opening the Slices navigation URL, then each lane and explicit Unscheduled lane shows Story-only counts/estimates/statuses/blockers and progress per Activity across lanes.
- Given later or unscheduled prerequisite assignment, when Slices or Planning renders or movement commits, then both show or clear named non-color order cues; open blockers use configured completion independently.
- Given two recorded states, when selecting Before/After, then their IDs/times and captured Release lanes display with exact Added/Removed/Moved markers; reversing reverses differences and equal/rename/reorder-only states show none.
- Given capture followed by edits, deletion and Project reopen, when reselecting it, then captured identity, membership, hierarchy and displayed values remain unchanged without domain/sync writes; unavailable or incompatible states show scoped errors.
- Given movement via drag, keyboard or explicit form, when committed, then every path calls the shared human move use case, records the actor and recomputes flags while preserving dirty-editor and preview constraints.
- Given canonical capture and subsequent archive/Restore, when reopened, then supported captured values and point-in-time state membership remain coherent; malformed payloads and Agent capture are refused atomically.
- Given the 1,000-Card fixture in the actual browser, when interacting/filtering, then observed responses satisfy 100ms/300ms; capture/comparison timings are separately reported and failed samples preserved.

## Spec Change Log

## Review Triage Log

### 2026-10-15 — Review pass
- verdicts: 18 findings — high 0, medium 10, low 3, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind B1: cached comparison survives failed refetch — Suppress cached columns whenever comparison.error is present; mounted successful-read then Restore-style 404 regression passes.
  - `[medium]` `[patch]` Blind B2: selected target Release can disappear — Keep the unavailable selection visible with an explicit alert and refuse writes; mounted deletion-before-submit regression passes.
  - `[medium]` `[patch]` Blind B3: tied Release ranks diverge between lane and movement ordering — Use the same position/ID comparator for form and keyboard targets; tied-rank regression passes.
  - `[medium]` `[patch]` Blind B4: state list parses every full historical payload — Select and validate metadata only, retaining full payload validation on get/compare/Restore. Measured original list cost rose from 6.00ms for two 1,000-Card states to 138.24ms for fifty; repository regression verifies the metadata boundary.
  - `[low]` `[patch]` Blind B5: state reads lack pending feedback — Shared Loading status and aria-busy now cover list, comparison and capture.
  - `[medium]` `[patch]` Blind B6: lane header omits named order violations hidden by filtering — Render canonical named order summaries in live and captured lane headers, independent of visible tiles and prerequisite completion.
  - `[low]` `[patch]` Blind B7: status bar proportions distorted by flex basis and labels — Zero-basis segments use count weights; separate accessible numeric labels wrap without changing segment proportions.
  - `[medium]` `[patch]` Blind B8: actual archive lifecycle coverage missing — Added actual HTTP export/import, reopened database and application comparison coverage with immutable values and excluded-Project isolation.
  - `[false]` `[reject]` Blind B9: keyboard path requires keyboard drag implementation — The requirement is keyboard movement through the canonical human move use case. Enter-activated previous/next controls and the explicit form provide that path; actual browser acceptance exercised Enter and pointer drag.
  - `[low]` `[patch]` Blind B10: evidence hashes include self-referential bookkeeping — Restrict final source fingerprints to apps/packages/scripts; evidence and bookkeeping are excluded and hashes refreshed after repair.
  - `[medium]` `[patch]` Edge E1: deleted selected Release causes unsafe lookup — Same root cause and repair as B2; visible unavailable-target refusal and no-write regression cover the reachable live-update state.
  - `[medium]` `[patch]` Verification V1: real drag registration lacks executable regression — Pre-verified gap accepted: added pointer events through the mounted DndContext, asserting canonical movement, membership and cue recomputation.
  - `[medium]` `[patch]` Verification V2: Added/Removed column markers not asserted — Pre-verified gap accepted: mounted tests assert exactly one marker per category in the correct captured column and reversal.
  - `[false]` `[reject]` Intent I1: mounted keyboard simulation alone misses actual acceptance — Actual browser evidence independently records Enter and native pointer movement through the canonical use case; mounted events are supplemental, so the claimed missing acceptance surface is disproved.
  - `[false]` `[reject]` Intent I2: deletion durability requires browser permanent deletion — Physical deletion and reopen are exercised in the repository and disposable fixture, with deleted captured values rendered in the browser. The intent does not require initiating permanent deletion through the browser; no such action is claimed.
  - `[medium]` `[patch]` Intent I3: archive lifecycle exercised below required surface — Same root cause as B8; actual archive HTTP export/import plus reopened captured comparison now exercise the lifecycle surface.
  - `[false]` `[reject]` Intent I4: manual browser performance lacks automated performance gate — The stated gate is actual-browser measured response. Trusted-event measurements satisfy it, failed samples remain recorded and no timing waiver applies; no requirement mandates automating every measurement.
  - `[false]` `[reject]` Intent I5: diff alone cannot establish workflow execution — The recorded tool history establishes the renderer invocation, four independent review layers, configured checks and unchanged orchestrator ledgers. A diff cannot itself prove process, but this does not establish a process defect.

Survivors group into 11 patch entries: 8 medium and 3 low; B2/E1 and B8/I3 share root causes. No intent gap, bad spec or deferred entry.

### 2026-10-15 — Review pass (follow-up)
- verdicts: 35 findings — high 0, medium 4, low 18, false 13, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: readPlanData bypasses getJson and throws a raw SyntaxError on a non-JSON error body — apiBaseUrl is the constant "" so origins cannot diverge; non-JSON errors need a proxy in front of the loopback server and the fix adds a guard
  - `[false]` `[reject]` Blind: pre-change restore points/archives die with a raw "no such table" — validateRestoreDatabase compares databaseSchemaVersion DDL hash before validatePlanStateRows, so they fail with RestoreValidationError first
  - `[false]` `[reject]` Blind: dependencyCues throw crashes Planning/capture — unreachable: same-map edges are enforced and delete prunes incident edges in live and ChangeSet-preview projections (operation-dependencies.ts:357, card-command-resolution.ts:91); loud failure is correct
  - `[false]` `[reject]` Blind: captured states keep deleted content, no purge/cap — the Durability row requires captured values to survive physical deletion; purge or retention would be an unrequested feature
  - `[false]` `[reject]` Blind: compare returns two full payloads — the UI renders both captured columns from that payload as the intent requires
  - `[false]` `[reject]` Blind: ownership model/ADR inconsistent, FKs lack onDelete — Project-owned map-scoped matches the intent wording; deleteStoryMap is a soft delete so no FK violation arises; ADR stays proposed
  - `[medium]` `[patch]` Blind: comparison columns unmount on every background refetch — plan-state-comparison is invalidated by each map transaction, and columns required !isFetching, so any move while comparing blanked and remounted both captured boards; dropped the isFetching gate (error still hides stale data, reset covers Restore, IDs are immutable)
  - `[low]` `[reject]` Blind: Slice move duplication and stale target/open panel — target resets on open, submit is disabled only for the current Slice, no wrong output named; placement now pinned by the new move assertions
  - `[low]` `[reject]` Blind: arrow glyph direction and single-colour status bar — the control is shared with vertical Planning rows, aria-labels carry direction, the bar is aria-hidden and duplicated by labelled counts
  - `[false]` `[reject]` Blind: shell path hack, casts, readOnly source mismatch — search.preview and state.preview are equivalent because the shell sets boardPreview whenever previewId is present on /slices; the endsWith pattern already exists for tree/planning
  - `[low]` `[patch]` Blind: dead code and hard-coded text — removed unused comparePlanStatesQuerySchema, PlanStateResponse and the "plan-state" live key; hard-coded labels, label comparison and non-null assertion name no harm
  - `[low]` `[reject]` Blind: state selectors lack names/guidance — nice-to-have not in the intent
  - `[low]` `[reject]` Blind: evidence file weak — initialSourceHashes {} is documented as earlier trials without claimed fingerprints, /tmp logs are transient by nature, manual timing is what the intent requires; the fix edits evidence/spec
  - `[low]` `[reject]` Blind: test gaps — move placement and corrupt-payload gaps patched (see Verification rows); MCP-absence and invalid-UUID query tests name no reachable failure
  - `[low]` `[reject]` Edge: defaultConnectionId survives archive redaction inside the payload — only an opaque UUID remains, the validator accepts it, and the fix changes the captured projection contract; the Activity copy is removed by the next patch
  - `[low]` `[reject]` Edge: raw SyntaxError on non-JSON error body — same claim and disposition as the first Blind row
  - `[low]` `[patch]` Edge: plan-state queries lack retry:false — default 3 retries delayed the scoped error about 7s while Loading showed, unlike every other query in api.ts; added retry:false to list and comparison
  - `[low]` `[reject]` Edge: stale selected state ID after Restore — the 404 error alert is visible; guarding with an effect adds complexity for a cosmetic select mismatch
  - `[false]` `[reject]` Edge: dangling edge in preview snapshot crashes Planning — same disproof as the dependencyCues row; preview projections prune incident edges
  - `[false]` `[reject]` Edge: non-Story unscheduled prerequisite gives a Blocked order cue — the matrix mandates complete adjacency including non-Story prerequisites with their own releaseId and null ranking after all Releases
  - `[false]` `[reject]` Edge: done set keyed by status name — identical convention to release-notes.ts:34 and the entity-resolution status check
  - `[medium]` `[patch]` Edge: full payload duplicated into the Activity event — Activity DTO exposes `after`, so every capture put the whole board into the Activity feed, storage and MCP/HTTP activity reads outside plan-state read scoping; logActivity now receives the payload-free summary and the DB test asserts the story title is absent
  - `[low]` `[reject]` Edge: "Unscheduled"/"Unassigned" literals in core — equal to the shared strings, part of the report contract, no drift shown
  - `[low]` `[reject]` Edge: verification logs under /tmp not committed — same as the evidence row
  - `[medium]` `[patch]` Verification: Slice move parentId/position never asserted — the keyboard, form and drag tests now assert parentId and the position computed from the target Slice
  - `[medium]` `[patch]` Verification: validateProjection dependency/duplicate/status branches untested — table-driven DB test corrupts payloads (unknown endpoint, duplicate edge, cycle, duplicate Card, foreign workflow status) and asserts getPlanState and validateRestoreDatabase refuse each
  - `[low]` `[reject]` Verification: timing budgets only manually measured — the intent requires actual-browser measurement, recorded; jsdom timing gates would be brittle
  - `[low]` `[reject]` Verification other: readPlanData duplicates getJson — same as the first Blind row
  - `[low]` `[reject]` Verification other: evidence hashes/logs — same as the evidence row
  - `[false]` `[reject]` Intent: UI recomputes lanes while server serves its own Slices report — the UI derives lanes deterministically from the captured payload rather than current data, which satisfies "display captured lanes and values"; the endpoint serves HTTP/MCP parity
  - `[false]` `[reject]` Intent: dirty-editor guard not demonstrated — Slices reuses the shared shell and modal whose guards are unchanged; nothing in the diff bypasses them
  - `[low]` `[reject]` Intent: hard-coded Unscheduled in core — same as the Edge literals row
  - `[low]` `[reject]` Intent: Activity progress inside collapsed details — native accessible disclosure, content in the DOM and exercised in browser acceptance
  - `[false]` `[reject]` Intent: capture read-only tied to search.preview — equivalent to state.preview, see shell row
  - `[false]` `[reject]` Intent: Blocked order evidence only on a synthetic restored Story and manual timing — the intent forbids user data and requires disposable fixtures

Survivors group into 6 patch entries: 4 medium (comparison unmount, Activity payload, move placement coverage, validation coverage) and 2 low (dead code, query retry). No intent gap, bad spec or deferred entry.

## Design Notes

Manual Plan states are Project-owned unversioned immutable records, scoped to a map, distinct from external publication baselines. Human-only capture meets explicit-human-control requirements without inventing Agent operation support. UUID/time are generated inside capture; no arbitrary client-supplied projection is persisted. Payload captures active Stories and their hierarchy plus canonical dependencies/status context so both columns remain independent of today's mutable board. Unscheduled ranks after Releases; an unscheduled dependent has no later scheduled prerequisite, while scheduled dependents with unscheduled prerequisites violate order. Any-level prerequisite uses its own releaseId and configured status; archived canonical prerequisite remains named rather than disappearing. Unsupported schema is an explicit error, never a fallback.

## Verification

- Prepend `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` to PATH; run exact focused Vitest files in actual packages and inspect executed counts.
- Run `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint`, `node scripts/verify.mjs` serially with builds/portable fixtures. Stage required new sources if fixtures enumerate git ls-files; exclude orchestrator tracking.
- `git diff --check` and capability generation/parity pass. Review ADR remains proposed; no claim of maintainer acceptance.
- Actual isolated browser observes routes, keyboard/form/drag, captured columns and errors, reopen and performance; DOM/API tests are supplementary. No user data or live-provider access.

## Implementation Verification — 2026-10-15

Version 2 verification record: 1,751 configured tests pass across the final package scopes (Scripts82, Contracts136, Core271, DB374, Web255, Importers7, Server626). The first full command hit an existing omnibus capability timeout under a separately launched concurrent Hermes full test run; its complete original log is `/tmp/story-5-2-full-test.log`. The unchanged server command then passed612 functional and14 performance tests (`/tmp/story-5-2-server-test-alone.log`); a later external overlap means it is not described as fully isolated. No timeout/exclusion/test relaxation. Initial workspace typecheck/lint/release verification passed; subsequent web-only repair255 tests/typecheck/build passed. Final release recheck follows.

All intent matrix rows have executed passing coverage in core Slices4 golden cases, DB Plan states6 cases, server Plan states3 cases and mounted Slices5 cases, supplemented by actual browser evidence. Durable evidence: `evidence/story-5-2-browser.json`. Actual Chrome proved canonical form/Enter/pointer moves, named cues, explicit capture, reverse/equal comparison, edit/archive/reload immutability, Planning parity and unsupported-state error. Physical deletion durability is DB/seed evidence rendered in the browser, not a browser permanent-delete action.

Measured full-filter failure441.8ms, ineffective mounted-only433ms and diagnostic475.9ms remain recorded. Diagnostic DOM72.3ms versus geometry368.3ms justified native offscreen containment on measured collapsed Story sizes, together with stable mounted filter rows. Final trusted samples: Card opening91.2ms (100), filter25.1ms (300), full reset177.4ms (300). Capture155ms and comparison582.5ms are informational; an earlier comparison7961.3ms includes a tool/operator gap. Temporary probe removed from built assets after measurements.

Final configured verification: `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint`, `node scripts/verify.mjs` all exit0 on the repaired source. Full test command passes1,751 cases. Logs use `/tmp/story-5-2-final-{test,typecheck,lint,verify}.log`. Matrix audit complete; independent review now starts.

## Post-review Verification — 2026-10-15

All configured commands exited zero on the final application source: 1,758 tests (Scripts82, Contracts136, Core271, DB375, Web260, Importers7, Server627), workspace typecheck, lint and full release verification/build including126-capability parity. Logs: `/tmp/story-5-2-post-review-{test,typecheck,lint,verify}.log`. New executed coverage includes DB Plan states7, actual archive49, mounted Slices9 and comparison refetch1. Whitespace passes. Existing Vite bundle-size advisory remains.

Actual final-build Chrome repeat on the disposable1,000-Card fixture passed unchanged budgets: opening91.5ms/100ms, trusted filter28.6ms/300ms, full reset189.9ms/300ms. Semantic repeat proved canonical header warnings remain while the dependent tile is filtered out, exactly one Added/Removed/Moved marker in forward comparison, inverse categories/endpoints and equal-state no changes. Source fingerprints and all historical failed measurements remain in `evidence/story-5-2-browser.json`. Earlier functional browser checks remain valid for unchanged movement/capture/durability paths; post-review error races are additionally covered by mounted tests. Temporary build probes removed, owned browser tab closed and disposable server stopped.

## Follow-up Verification — 2026-10-15

After the follow-up patches: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test` and `node scripts/verify.mjs` exit zero. Tests: Contracts136, Importers7, Core271, Web260, DB376 (+1 new), Server613+14 performance. `git diff --check` is clean. Logs: `scratchpad/followup-{test,verify}.log`.

## Auto Run Result

Implemented the map-scoped Slices route with Story-only Release/Unscheduled summaries, Activity progress, independent named blockers and order warnings, canonical drag/keyboard/form moves, and immutable human-recorded Plan states with captured Before/After comparison. No Agent capture write or comparison restore operation was introduced. ADR0005 is proposed, not accepted.

Files changed (paths relative to repository root), original implementation and first-pass repairs:
- `packages/contracts/src/schemas/plan-states.ts`, `packages/contracts/src/index.ts`, `packages/contracts/src/mcp/tool-inputs.ts`, `packages/contracts/src/mcp/tools.ts` — captured-state schemas and MCP inputs.
- `packages/core/src/reports/slices.ts` (+test), `packages/core/src/index.ts` — pure Slice analysis, projection and comparison.
- `packages/db/src/schema/tables.ts`, `connection.ts`, `schema/classification.ts`, `plan-state-validation.ts`, `restore-validation.ts`, `repositories/plan-states-repository.ts` (+tests), `repositories/storymapper-repository.ts` — immutable storage, validation and lifecycle.
- `apps/server/src/application/report/plan-state.use-cases.ts` (+test), `application/descriptors.ts`, `application/capability-manifest.json`, `http/routes/report-routes.ts`, `mcp/tools/register-content-tools.ts`, `packages/mcp/src/tool-definitions/capabilities.ts`, `scripts/capability-operation-coverage.mjs`, `scripts/mcp-tool-metadata.json`, `docs/mcp-tools.md` — scoped reads, human-only capture, parity.
- `apps/web/src/app/{api.ts,plan-state-api.ts,router.tsx}`, `app/routes/{story-map-shell.tsx,story-map.slices.tsx}`, `app/live/live-query-invalidation.ts` (+test), `features/story-map/{views/SlicesView.tsx,components/*Slice*.tsx,components/PlanStateComparison.tsx,components/SwimlaneGrid.tsx}` (+tests), `styles/slices.css`, `ui-strings/story-map.ts` — route, lanes, movement and comparison.
- `docs/adr/0005-recorded-plan-states.md`, `_bmad-output/implementation-artifacts/evidence/story-5-2-browser.json` — proposed ADR and browser evidence.

Follow-up pass patches (this pass):
- `apps/web/src/features/story-map/components/PlanStateComparison.tsx` — keep captured columns mounted during background refetch.
- `apps/web/src/app/plan-state-api.ts` — `retry: false` for list and comparison queries.
- `apps/web/src/app/live/live-query-invalidation.ts`, `packages/contracts/src/schemas/plan-states.ts` — removed unused `plan-state` key, query schema and response type.
- `packages/db/src/repositories/plan-states-repository.ts` — Activity event carries the payload-free summary.
- `packages/db/src/repositories/plan-states.test.ts`, `apps/web/src/features/story-map/views/SlicesView.test.tsx` — Activity payload absence, corrupt-payload refusal and move placement assertions.

Review: this follow-up pass had 35 findings (high0, medium4, low18, false13). Patched six entries: medium4, low2; none deferred. Rejected findings are each recorded with reasons in the Review Triage Log; the first pass's 18 findings remain recorded there. Follow-up review recommended: **false** (no high patched on a follow-up pass).

Verification: see Follow-up Verification. No sprint-status.yaml or deferred-work.md write, stage or revert. Not pushed.

Residual risks: the real two-client browser timing of Restore invalidation with an in-flight comparison read and move form remains covered only by mounted failure regressions, not an actual multi-client browser run; the patches of this pass were verified by configured tests and release verification, not by a repeated Chrome acceptance run. Cross-platform graphical acceptance beyond the Mac Chrome session is not claimed. Existing Vite bundle-size advisory remains.

## Operator Browser Acceptance — 2026-10-15

Version: 4. Reproducing statement: Fulfil the operator request to commit existing Story5.2 work, then perform actual browser acceptance without changing orchestrator-owned tracking files. Changelog: recorded a fresh two-client acceptance against HEAD582f671, including a failed timing gate and Restore navigation observation; historical completion above remains historical.

Story5.2 implementation and follow-up were already committed in9505074 before this request. No pending application changes were found. Fresh web typecheck/build pass. Actual Chrome on an isolated synthetic backup passed Slice summaries, canonical keyboard movement, human capture, captured forward/reverse/equal comparisons, unavailable move-target refusal without a write, and cancellation of a delayed pre-Restore comparison. Valid-state selection recovers the comparison after Restore.

**Original acceptance result (superseded by maintainer acceptance below): not accepted.** With1,000 Cards, trusted filter27.5ms and reset91.5ms meet300ms; Card opening116.9ms exceeds the unchanged100ms limit. The initiating client also remained on Restore progress after database completion; explicit reload showed Restoration complete. Its automatic navigation is unverified and root cause is not diagnosed. No performance waiver or application fix is inferred. The combined simultaneous stale move-form/Restore race and fresh pointer drag are not claimed.

Evidence: `evidence/story-5-2-operator-browser.json` and `evidence/story-5-2-operator-performance.png`. No sprint-status.yaml or deferred-work.md write, stage or revert. Existing Story5.5/OpenWolf edits were preserved.

## Maintainer Acceptance and Successful Closure — 2026-10-15

Version: 5. Reproducing statement: Apply the maintainer instruction to relax acceptance constraints as previously, record optimization topics for later and close Story5.2 successfully. Changelog: supersedes the preceding operator decision of not accepted with explicit scoped acceptance; measurements and original observations remain unchanged.

**Final result: successfully completed, status done, with maintainer-approved exceptions.** The maintainer explicitly accepted the measured116.9ms Card opening against the nominal100ms target and manual reload to display successful Restore completion. Both are retained in this spec's deferred list for later profiling/investigation and repair. No invented new numerical limit, repeated passing measurement or diagnosed root cause is claimed. Filter27.5ms/reset91.5ms remain passes against300ms; functional checks and fresh typecheck/build evidence remain as recorded. Existing limitations for simultaneous stale-target/Restore timing, fresh pointer drag and platform coverage remain disclosed.

The earlier not-accepted outcome is historical evidence. The current acceptance decision in `evidence/story-5-2-operator-browser.json` references this explicit maintainer authorization and preserves raw failures. This decision is specific to Story5.2 and does not relax future stories, alter runtime safeguards or change ADR0005 from proposed. No application change or fresh browser/test run was necessary for this acceptance-only decision. The orchestrator alone controls sprint-status.yaml and deferred-work.md; neither file was written, staged or reverted.
