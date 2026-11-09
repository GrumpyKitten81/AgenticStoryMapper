---
title: What changed since I looked
type: feature
created: 2026-10-15
version: 2
status: done
baseline_revision: 5a23ced0dcb8ddc108983324d9e22b9a0cdc33f7
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred: []
---

# Story 5.4: What changed since I looked

Reproducing statement: Execute bmad-build-auto for 5-4 using Epic5 preparation and Story5.3 continuity; implement and independently verify other-client changes without writing, staging or reverting orchestrator-owned sprint-status.yaml. Date:2026-10-15. Version:2. Changelog: fresh two-client operator browser acceptance after committed follow-up patches.

<intent-contract>

## Intent

**Problem:** Users cannot catch up on committed Activity from Agents, GitHub or other tabs, or explicitly acknowledge their changes.

**Approach:** Provide a Project/epoch sequence feed and browser-persisted seen state, a What changed drawer grouped by actor and affected Card, shared board cues and genuine Agent-session restore-point navigation.

## Boundaries & Constraints

**Always:** Contracts define schemas; repositories own DB reads; shared application descriptor validates human browser reads. Preserve existing Activity pagination, AD11 contentless SSE/canonical refetch and dirty/manual/drag/other-dialog holds. Filter actual originClientId, never all humans. Keep seen state outside domain versions. Use English shared strings, glyph+word actor/Changed cues, 420px keyboard drawer with Escape/focus return and no inert background. Keep preview markers distinct. Genuine restore navigation uses recorded applied ChangeSet execution.restorePoint and actual retained snapshot, including Agent proposal applied by human. Follow unchanged 2s live, 100ms interaction/300ms filter budgets; actual browser acceptance required.

**Never:** Write/stage/revert sprint-status.yaml or deferred-work.md; infer verification from bookkeeping; mutate user Projects, push, commit without explicit instruction, add polling, SSE payload content, new undo, SaaS/telemetry, fabricated snapshot associations or silent storage failures.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Origin/scope | Same-client human, other-tab human, Agent, GitHub; interleaved Projects | Only actual current-client excluded; Project-specific ordered events with real sequences; counts reflect actual displayed events | Invalid Project/query fails explicitly |
| Group ack | A20/B21/A22 displayed | Mark A acknowledges20/22; B21 and its markers survive reopening; cursor cannot jump over B | Persist before showing success; storage failure visible, prior state retained |
| All ack race | Display through20;21 commits during action | Only observed high-water20 acknowledged;21 remains unseen | No received-SSE/latest mutable watermark used |
| Paging | More than100 eligible events; concurrent append | Drain bounded pages at a fixed epoch/high-water; no partial prefix acknowledgement | Epoch transition restarts canonical read; failures remain visible |
| Epoch/Restore | Restore preserves old rows, marks undone, reuses sequence space | New epoch discards old acks, baseline at current epoch Restore boundary; only post-boundary changes eligible, including on fresh browser | No historical/undone false badges; stale response never changes new epoch state |
| Persistence | Project switch, reopen; invalid/unavailable storage | Independent Project state {epoch,throughSeq,acknowledgedSeqs}; honest error for read/validation/write failure | Do not silently reset corrupted storage or pretend saved |
| Live holds | Drawer open versus dirty editor, manual hold, drag, other dialog | Read-only drawer receives changes within2s; other holds preserve typed fields/focus and defer canonical marker update | Narrow drawer exemption only |
| Removed/changed Card | Renamed/deleted/archived Card or non-Card Activity | Group retains truthful affected identity/name from committed evidence; active Cards show Changed glyph+word until seen | Do not invent current Card or resurrect canonical data |
| Restore links | Applied Agent/session ChangeSet with retained execution snapshot | Navigate to real Restore points and exact filename; confirmation stays existing human flow | Missing snapshot has explicit unavailable state, no invented undo |
| Keyboard | Open drawer, Tab/Shift+Tab, Escape | Focus contained in drawer without inert background; close returns trigger; cues survive grayscale/reduced motion | No background shortcut leakage |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/domain.ts:activityEventSchema`, `schemas/audit.ts` and exports: optional originClientId and dedicated strict sequence query/response. Keep ActivityQuery cursor unchanged.
- `packages/db/src/repositories/row-mappers.ts:toActivityEvent`, `audit-repository.ts:listActivityPage`, `storymapper-repository.ts`: expose safe origin and add dedicated ascending feed. `db/live-events.ts:databaseLiveCursor` provides epoch. `restore-history.ts:prepareRestoredHistory` appends project.restored with result epoch after preserved history: derive current epoch global Restore floor from actual matching row (Restore resets all Projects), not timestamps; read only.
- `apps/server/src/application/customization/customization.use-cases.ts`, `application/descriptors.ts`, `capability-manifest.json`, `http/routes/customization-routes.ts`: add GET /api/activity/changes descriptor, validated Project scope. Supported browser-personal GET without MCP tool (capability-manifest.test.ts); do not expand MCP API for local seen state.
- New `packages/db/src/repositories/activity-card-evidence.ts`: immutable direct/bulk/child/deleted Card evidence; focused DB fixtures execute actual approved operations.
- `packages/db/src/repositories/changesets-repository.ts:applyChangeSet` and server changeset-executor record execution.restorePoint, proposedBy/session; reuse actual association. No universal session snapshot exists. Reuse listRestorePoints when resolving availability.
- `apps/web/src/app/live/live-client-id.ts:getLiveClientId`, `live-query-invalidation.ts:affectedLiveQueries`, `live-interaction-store.ts:liveUpdatesHeld`, `useLiveUpdates.ts`: integrate project changes query in canonical held invalidation, retain transport/applied cursor distinction.
- New `apps/web/src/features/what-changed/` model/storage/hook/provider/drawer and API helper; `app/routes/story-map-shell.tsx:StoryMapShellContent`: scope provider/header indicator across views. State is Project scoped, not map scoped; panel includes Project events, marker surfaces match Card IDs in current map.
- Existing `components/Dialog.tsx` provides focus patterns but makes background inert; new small dedicated nonmodal drawer must satisfy UX and narrowly opt out of live hold.
- `features/story-map/components/{CardTile,TreeGrid}.tsx`, `views/SlicesView.tsx`, `graph/{GraphCanvas,GraphTable}.tsx` plus Tracking's actual row surface: use shared Changed component/context, preserve preview semantics and canonical Card rendering. New shared actor badge uses person/bot/GitHub/gear plus label; no existing ActorBadge/ChangeMarker component found.
- `app/routes/audit.tsx`, `app/router.tsx`, `features/restore-points/RestorePointsPanel.tsx`: typed restore-point search and exact retained-row focus/navigation; preserve existing Restore confirmation/reload.
- `ui-strings/` and CSS: shared English copy, change pills/outline pulse and reduced-motion exclusion.
- Existing `app/live/live-updates.test.tsx`, Slices/Graph full-router tests and DB audit/restore tests supply relevant actual mount/UoW fixtures. Graph tools unavailable; source wins.
- Read-only: user storage, orchestration ledgers, completed5.1–5.3 semantics. Binding story-plan5.4 and epic5-preparation consumed; previous done5.3 Code Map/Design/tasks/changes consumed.

## Tasks & Acceptance

**Execution:**

- [x] Contracts/DB paths above — implement typed origin/sequence snapshot paging and safe committed identity/restore associations; cover Project interleaving, rollback, paging, genuine points, new-epoch floor and unchanged audit pagination.
- [x] Server descriptor/routes/manifest above — validated human read, central capability parity and focused real HTTP tests; no seen domain mutation.
- [x] New what-changed model/storage/API/hook plus live paths — fixed-cut page drainage, sparse group acknowledgements, persistence and canonical reset/races; meaningful model/storage/live tests for every matrix case.
- [x] Shell/drawer/shared cues/board surfaces/strings/styles above — real actor/Card grouping and counts, per-group/all seen, removed identity, focus/English/motion/preview/hold behavior.
- [x] Audit/router/Restore panel paths above — actual exact-point navigation without new undo; mounted tests for retained and unavailable Agent point.
- [x] Full configured checks, independent review and isolated two-client actual browser — all matrix cases, real Restore, same-client exclusion, concurrent seen, holds and measured2s delivery; record exact final source and evidence.

**Acceptance Criteria:**

- Given stored Project/epoch last-seen and committed events, when opening/refetching What changed, then real events after it group by actor and affected Card with honest per-actor counts.
- Given Agent, GitHub and other-tab commits, when canonical live refetch completes, then changes/markers appear within2s without polling and this-client commits are excluded.
- Given displayed events and concurrent arrival, when marking group/all seen, then only displayed observations are acknowledged, other groups/future commits survive and persisted reopening preserves markers.
- Given dirty fields or held updates, when commits arrive, then typed values/focus remain and canonical changes wait until release; the read-only drawer alone does not block updates.
- Given keyboard use, when opening/closing drawer or following actual Agent restore navigation, then English word/glyph cues, focus continuity and existing real Restore controls work.
- Given actual Restore, when new epoch is read, then old seen state/undone history cannot create false badges and subsequent other-client commits remain visible.

## Spec Change Log

## Review Triage Log

### 2026-10-15 — Review pass
- verdicts: 20 findings — high0, medium7, low3, false9, maybe-false1
- findings:
  - `[low]` `[reject]` Blind1: stale-tab acknowledgement can overwrite shared stored acknowledgement — mounted state is only read on mount/Retry, so a second simultaneously used tab can resurface acknowledged badges. Simultaneous acknowledgements in two tabs are uncommon; correct cross-tab serialization/epoch reconciliation requires more than a direct correction. No domain data is lost. Rejected under the low-complexity rule.
  - `[medium]` `[patch]` Blind2: focus/reconnect refetch bypasses holds — new query lacks the explicit flags already used by canonical API hooks; disable both and test held focus/reconnect. Shared repair with Edge1.
  - `[false]` `[reject]` Blind3: tool_call rows must be excluded — captured contract explicitly exposes committed Activity, including non-Card Activity, with actual event counts; tool audit rows are committed Activity and truthfully labelled. No domain-mutation-only eligibility restriction exists. Changing eligibility would invent a requirement.
  - `[medium]` `[patch]` Blind4: dependency evidence omits prerequisite endpoint — committed dependency snapshots include prerequisiteCardId, and its Required by display changes; project/test both actual endpoints.
  - `[false]` `[reject]` Blind5: human actor groups must be separated by originating tab — grouping is explicitly by actor/type/session, while originClientId determines eligibility. Two local tabs use the same human actor; the contract does not require per-origin actor groups.
  - `[low]` `[patch]` Blind6: page accumulation copies prior pages repeatedly — source confirms quadratic copying; directly accumulate once without changing public shape or cut semantics.
  - `[maybe-false]` `[reject]` Blind7: absent Project/seq index causes harmful latency — existing Project indexes narrow candidates and final real1000-Card gates pass. A representative retained-history query-plan/timing would establish harm; no measured bound fails here. The speculative local-read cost is low at established volume, while adding schema/migration machinery exceeds a direct correction.
  - `[low]` `[patch]` Blind8: repeated action rows omit available times — createdAt is returned but absent from rows; render its time element directly.
  - `[medium]` `[patch]` Blind9: live loading disables focused acknowledgement controls — query.isFetching propagates loading into disabled buttons even with complete cached data. Keep displayed-cut acknowledgement available during background fetching and test focus continuity; no partial prefix is exposed.
  - `[false]` `[reject]` Blind10: origin identity must survive reload — the required existing getLiveClientId is document-scoped; source plan explicitly says reuse it. A reload creates a new client and previous-document commits correctly become other-client history. Persisting a profile-wide origin would incorrectly merge separate clients.
  - `[medium]` `[patch]` Edge1: held focus/reconnect automatic query refresh — same demonstrated missing flags as Blind2; shared repair and regression.
  - `[false]` `[reject]` Edge2: shared browser acknowledgement must be independent per tab — contract deliberately stores seen state per Project/epoch in the browser, not per originating tab. A browser-wide explicit acknowledgement applies across that browser; requiring independent client-keyed acknowledgement changes the captured storage semantics. Within a client, sparse acknowledgements preserve every other actor group.
  - `[medium]` `[patch]` Gap1: persisted cursor/epoch request wiring lacks a regression — pre-verified mutation demonstration; add request-sensitive stale-cursor-after-Restore API coverage.
  - `[medium]` `[patch]` Gap2: drawer Restore link source branch lacks an automated router regression — actual browser traversed this link, but destination-only tests cannot catch removal of its search parameter. Add the actual drawer link traversal test.
  - `[medium]` `[patch]` Gap-other1: prerequisite-only graph table representation lacks Changed cue — incident suppresses standalone rows and second column has no marker; directly render/test prerequisite marker.
  - `[false]` `[reject]` Intent1: workflow execution is absent from source diff — descriptive limitation, not a defect; exact-once renderer, required steps, implementation handoff, actual commands and review execution are recorded in this run.
  - `[false]` `[reject]` Intent2: story-key product completeness is indeterminate from invocation alone — reviewer intentionally lacked planning narrative; parent consumed binding Story5.4 plan, epic preparation and immutable contract, then audited every matrix row.
  - `[false]` `[reject]` Intent3: component tests do not establish continuous browser experience — descriptive test limitation is bridged by actual isolated two-client production-build evidence including exact Restore, later commit, holds and race; not an unverified feature claim.
  - `[false]` `[reject]` Intent4: structural performance assertions do not establish runtime responsiveness — actual final203.9/236.6ms filter/reset and53.8/34.9ms drawer/actions are separately recorded with failed samples and event provenance.
  - `[false]` `[reject]` Intent5: tests/status-file absence alone do not prove verification — agreed limitation; actual1817-test pass, typecheck/lint/release checks provide evidence, and no ledger row was used as verification. Ledger files were never written/staged/reverted.

Eight repair groups: six medium, two low. All repaired and independently closed on final source with33web/8DBfocused tests. No intent gap, bad-spec loopback or deferral. Cached-cut acknowledgement closure specifically verifies that delayed event23 survives acknowledgement through22. No remaining unverified risk from these patches, so follow-up recommendation is false despite the initial medium patch count.


### 2026-10-15 — Review pass
- verdicts: 36 findings — high 0, medium 4, low 19, false 13, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind1: Discovery no-match filter shows the "no activities" message — message and hidden scroll wrapper behave as before the diff for a fully filtered board; the fix needs a new no-match branch.
  - `[false]` `[reject]` Blind2: originClientId widens the shared activity contract — the Code Map mandates optional originClientId on activityEventSchema; it is an opaque per-document UUID, not a secret.
  - `[low]` `[reject]` Blind3: missing index and per-row getChangeSet — page is capped at 100 rows on local SQLite; carried the Blind7 rationale, no measured bound fails.
  - `[low]` `[patch]` Blind4: redundant second Zod parse in the use case — route parseInput already validates; removed the duplicate parse and its unused import (the listProjects lookup matches sibling use cases).
  - `[low]` `[reject]` carried Blind1/Edge2: stale second tab overwrites shared acknowledgements; sparse ack growth is bounded by Project event count and compacts as the observed prefix closes.
  - `[false]` `[reject]` Blind6: first visit floods with history — contract requires a baseline at the current epoch Restore boundary including on a fresh browser.
  - `[false]` `[reject]` Blind7: button/marker coverage and no-op default context — the button renders in the shared header for every view kind and markers cover every surface in the Code Map; markers outside the provider render nothing.
  - `[low]` `[reject]` Blind8: drawer lacks aria-expanded and error indicator is a bare "!" — aria-modal=false, no inert and key containment are contract-mandated; error state is rare and the fix adds attributes and copy.
  - `[low]` `[reject]` Blind9: duplicated visibleCardIds checks and repeated findIndex in Discovery — no divergence named, measured filter budget passes.
  - `[false]` `[reject]` Blind10: evidence file keeps failed attempts without a verdict — the contract requires retaining failed samples and provenance.
  - `[low]` `[reject]` Blind11: DB test imports the server use case and server test is thin — test-only layering; real negative coverage is added by the patched rows below.
  - `[low]` `[reject]` Blind12: no ADR — decisions are feature-local and reversible within the browser-personal feed, with no cross-service contract or storage technology change.
  - `[low]` `[patch]` Blind13: inline English errors and unused strings.project — moved the three messages into whatChangedStrings and removed the unused key.
  - `[low]` `[reject]` Blind14: import order and JSX wrapper formatting — cosmetic, verify.mjs passes.
  - `[low]` `[reject]` carried Blind1: Edge1 stale tab overwrites newer stored cursor.
  - `[false]` `[reject]` Edge2: corrupt storage has no reset action — contract forbids silently resetting corrupted storage; Retry shows the honest error.
  - `[false]` `[reject]` Edge3: a malformed stored event fails the whole feed — every writer sets the evidence read here, and failing loudly is the fail-fast rule; no reachable malformed row shown.
  - `[false]` `[reject]` Edge4: changeSet.applied without affectedEntityId — changesets-repository always logs the ChangeSet id as the affected entity.
  - `[low]` `[reject]` Edge5: non-advancing nextAfterSeq loops forever — the server derives nextAfterSeq from the last returned row, which is greater than afterSeq; the guard covers an unreachable state.
  - `[low]` `[patch]` Edge6: drawer trigger focus uses document.activeElement — buttons are not focused on click in Safari; the button now passes event.currentTarget to open.
  - `[low]` `[reject]` Edge7: group heading can be a raw Card id for child-only evidence — the contract forbids inventing current Card names; the id is the truthful committed identity.
  - `[medium]` `[patch]` Edge8: standalone HTML export of a filtered Discovery view shows filtered Cards — confirmed by a failing clone test; the hidden rule is now also scoped to .discovery-matrix-scroll so the exported clone keeps it. Shares root cause with VG1.
  - `[false]` `[reject]` Edge9: other DOM scanners match hidden Cards — Dialog focus uses canFocus and the only export consumer is fixed by Edge8.
  - `[low]` `[reject]` carried Blind1: Edge10 stale tab across Restore re-persisting state.
  - `[medium]` `[patch]` VG1: hidden-rule cascade verified only by the jsdom default stylesheet — added a test that injects the real global.css, including an export clone outside .discovery-workspace; it fails without the selector fix.
  - `[medium]` `[patch]` VG2: invalid same-epoch snapshot and previous-epoch cursor branches untested — added DB cases for highWater above the sequence, afterSeq above highWater, highWater below the Restore floor and a previous-epoch cursor above the sequence.
  - `[medium]` `[patch]` VG3: no negative case for human-proposed, human-applied Restore links — added the "none" association to the Agent snapshot test.
  - `[low]` `[patch]` VG4: filtered Activity move controls untested — added a filtered-order move-control test.
  - `[false]` `[reject]` VG-other: malformed applied-operation evidence throws — same as Edge3.
  - `[false]` `[reject]` carried Intent3: jsdom tests are not the browser — actual two-client browser evidence is recorded; server HTTP and DB tests cover the real route and repository.
  - `[false]` `[reject]` Intent2: browser evidence is self-authored bookkeeping — it keeps failed samples and provenance, and no ledger row was used as verification.
  - `[false]` `[reject]` Intent3: Discovery rendering was restructured to hold the 300ms budget — the contract requires unchanged budgets and the lifecycle assertion changes are deliberate and documented.
  - `[low]` `[reject]` Intent4: Changed and preview markers share glyph and word — the contract fixes the Changed glyph and word; preview markers keep their own class and colour, and the only fix would alter the mandated cue.
  - `[low]` `[reject]` carried Blind1: Intent5 cross-tab seen state.
  - `[low]` `[patch]` Intent6: shared English strings — same patch as Blind13.
  - `[false]` `[reject]` Intent7: originClientId reaches the existing Activity response — same as Blind2.

Seven patch groups: three medium (CSS/export with its test, VG2, VG3) and four low (parse, strings, focus, VG4). All repaired and verified on the final source; no high finding, intent gap, bad-spec loopback or deferral.

## Design Notes

Persist per Project {epoch,throughSeq,acknowledgedSeqs}. A group action captures its exact displayed event sequences; sparse acks compact only across a completely observed eligible prefix, ignoring gaps belonging to filtered origin/foreign Projects. All-seen captures that render's fixed high-water. Keep transport and applied cursor keys independent. On epoch mismatch drop old acks and adopt actual Restore floor, retaining new post-Restore events. Feed first page fixes high-water; subsequent pages use it and reject/restart on epoch transition. Return minimal committed event metadata and affected Card label evidence, never full before/after in personal feed. Non-Card events remain honestly labelled, not assigned invented Cards. Group identity retains actor type/actor/session. Human-applied Agent changes use actual proposedBy/session association solely for Restore linkage, not invented actor attribution.

## Verification

- Node24 PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH; focused actual Vitest filenames, inspect case counts.
- corepack pnpm test; corepack pnpm typecheck; corepack pnpm lint; node scripts/verify.mjs, serially; git diff --check. Stage required new source before portable git-ls-files fixtures, never ledgers.
- Actual isolated Chrome on disposable synthetic Project, two clients: origin exclusion, Agent/GitHub committed proposals, actor/Card counts, group/all race, reopening/Project state, drawer keyboard/focus, actual point navigation, dirty/manual holds, actual Restore and2s timing. Retain failed samples and untrusted input provenance; no user storage/provider mutation.

### Implementation verification evidence

- Browser evidence: [synthetic two-client acceptance](evidence/story-5-4-browser.json). Failed initial drawer313.8ms and Discovery reset762/805.6ms samples remain alongside passing final53.8ms drawer,34.9ms mark-all,203.9ms filter and236.6ms reset. Final product source identity is recorded; only lifecycle test assertions changed afterward.
- Actual Agent delivery549ms, locally approved GitHub-actor delivery332ms, other-tab human delivery upper bound298ms. No remote GitHub provider was called. Sparse group ack preserved GitHub changes; a commit after the captured all-seen cut remained unseen. Dirty/manual holds, Project switch/reopen and exact snapshot navigation passed. Real Restore removed a previously visible transient Card and changed other-client count27→0; a later Agent update produced4events and its Card cue.
- Generic operation Card projection required a repair: immutable operation snapshots now provide all affected Cards, including bulk/child/deletion evidence, without querying current Card names. Discovery filter rendering retains canonical nodes, hides excluded lanes/controls and disables excluded drag/drop sources to meet the unchanged300ms budget. Four lifecycle tests now assert actual hidden/display:none/disabled behavior; archived Cards remain absent.

### Matrix test audit

| Intent row | Executed covering tests |
| --- | --- |
| Origin/scope | db/activity-changes: origin/Project gaps and rollback; server/application/activity-changes: strict real HTTP validation; actual writer/reader browser exclusion |
| Group ack | what-changed/model: sparse20/21/22 persistence; mounted Provider: sparse ack/storage failure/reopen and generic multi-Card single-event count |
| All ack race | model: observed cut retains23; actual browser timed later commit remains4unseen |
| Paging | api:201events fixed cut; epoch restart/failed partial drainage; DB concurrent fixed-cut feed |
| Epoch/Restore | DB global Restore boundary/fresh/stale reads; model new epoch; live reset cancellation tests; actual two-client Restore and later commit |
| Persistence | model invalid/inaccessible/write-failure and Project independence; Provider visible failed save; actual Project switch/reopen |
| Live holds | live-updates dedicated What changed test covers drawer/dirty/manual/drag/dialog; actual dirty/manual and open drawer delivery |
| Removed/changed Card | DB committed rename/deletion/non-Card/child/bulk evidence; mounted actual five view surfaces and multi-Card operation |
| Restore links | DB genuine proposal/execution associations and retention loss; mounted exact retained/pruned navigation; actual focused exact point and existing confirmation |
| Keyboard | Provider focus containment/recovery/Escape/no-inert tests; actual Shift+Tab/Tab wrapping and Escape trigger return; CSS reduced-motion exclusion |

Full configured1817tests, workspace typecheck and lint passed on final product source. Logs: `/tmp/story-5-4-final-configured-{test,typecheck,lint}.log`. Release verification/build also passed. Independent review and repaired-source closure passed; final repaired1823tests/typecheck/lint/release verification/build all passed on unchanged616-file source.

Review execution note: the platform refused a fourth child thread. Three reviewers run concurrently; two reuse earlier read-only investigation threads. The intent layer will run as a second batch before triage. Source-only diff keeps this spec narrative available only to the edge-case layer. Full unified implementation/bookkeeping diff is separately captured.

OpenWolf scanner reported a partial/changing scan and did not advance freshness. Its generated broad index rewrite was undone (only these task-generated index changes); no fresh-index claim is made. No orchestration ledger was involved.

## Auto Run Result

Status: done

Summary: Follow-up review pass on the completed Story 5.4 (What changed since I looked). Four independent reviewers ran on the source diff since baseline; seven patch groups were applied, none high.

Files changed in this pass:
- `apps/web/src/styles/global.css` — hidden rule also scoped to `.discovery-matrix-scroll` so standalone HTML export of a filtered Discovery view stays filtered.
- `apps/web/src/features/what-changed/WhatChangedProvider.tsx` — drawer trigger taken from the click target, not `document.activeElement`.
- `apps/web/src/features/what-changed/api.ts`, `model.ts`, `apps/web/src/ui-strings/what-changed.ts` — user-visible errors moved to shared strings; unused key removed.
- `apps/server/src/application/customization/customization.use-cases.ts` — redundant second query parse removed.
- `packages/db/src/activity-changes.test.ts` — snapshot-validation, previous-epoch cursor and human-applied no-link cases.
- `apps/web/src/features/story-map/views/DiscoveryView.test.tsx` — filtered move controls and real-stylesheet export clone cases.

Review findings: 36 reviewer findings — 7 patch groups applied (3 medium, 4 low), 0 deferred, 29 rejected with reasons in the Review Triage Log (13 false, 16 low).

Follow-up review recommendation: false. No high finding patched on this follow-up pass; patched counts: high 0, medium 4 entries across 3 groups, low 4 groups.

Verification: `corepack pnpm test` exit 0 (web 312, db 386, server 614+14, core 276, contracts 136, importers 7 and the remaining packages), `corepack pnpm typecheck` and `lint` passed, `node scripts/verify.mjs` exit 0 including build; `git diff --check` clean for source. The export-clone test was confirmed failing without the CSS fix. No browser re-run: the patches change no live-delivery, hold or budget path.

Residual risks: stale second-tab acknowledgements remain last-writer-wins (logged low, rejected); the Safari focus fix is covered by logic, not by a Safari run.

## Operator Browser Acceptance — 2026-10-15

Version: 2. Reproducing statement: Commit the successful Story5.3 acceptance, then execute actual Story5.4 browser acceptance while preserving orchestrator-owned files. Changelog: Story5.3 acceptance committed as004aee3; fresh Story5.4 results recorded on that HEAD with unchanged application source.

**Result: accepted.** Two actual Codex In-app Browser clients on an isolated backup of the existing synthetic fixture passed other-tab eligibility/same-writer exclusion, real Agent and approved local GitHub-actor delivery, sparse group acknowledgement/persistence, independent Project seen state, dirty/manual holds, later-event survival after all-seen,118-event paging and acknowledgement, all five Changed view surfaces, prerequisite-only Graph table cue,420px keyboard drawer/no-inert/Escape return and focus continuity during live background refetch. No remote GitHub provider was called.

Live delivery: other-tab174ms, Agent259ms, local GitHub-actor221ms and post-Restore Agent245ms, all below2s. With1,000 marked Cards, drawer28ms (later27.2ms with118 events), filter204.6ms, full reset224.7ms and mark-all44ms meet unchanged100/300ms budgets. Filter paste is an untrusted input event; reset and click gates are trusted. The filter retains1,000 canonical tiles with3 visible. Original and new raw measurements remain preserved; no5.2 acceptance exception transfers.

The actual drawer Agent link focused the exact retained pre-apply snapshot row. Existing confirmation performed a real Restore; initiator automatically displayed Restoration complete. The open reader lost the transient Card and old markers/count1->0 without reload;118 later events and2 ChangeSets remain historical undone records. A subsequent Agent commit produced4 events and its Card cue. After another live commit, native-focused Mark all seen stayed enabled and focused, and Escape returned to the actual trigger.

Fresh web production build and typecheck pass. No application edits or full-suite rerun. Existing mounted/historical coverage remains for exact arrival inside the ack handler, failed storage, pointer-drag holds and concurrent append during page drainage; no fresh native screen-reader/standalone Safari/platform claim. Known stale simultaneous second-tab acknowledgements remain unchanged. Evidence: `evidence/story-5-4-operator-browser.json` and `evidence/story-5-4-operator-final.png`. Historical evidence is unchanged. No Story5.4 commit/push in this acceptance pass; sprint-status.yaml and deferred-work.md were not written, staged or reverted.
