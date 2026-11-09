---
title: '2.5 Park, archive and delete as separate actions'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_revision: '7516f5d4fc84341f47a01fdb16b70a8faa42d239'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '[REDACTED_HOME]/.claude/CLAUDE.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/AGENTS.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.wolf/OPENWOLF.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.wolf/cerebrum.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/code.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/comments.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/typescript.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/logging.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/testing.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/markdown.mdc'
warnings: [oversized]
deferred:
  - summary: >-
      AI/MCP Story picker and server selectedStoryCards still filter only status !== "archived", so Stories under archived or parked ancestors remain selectable for AI proposals.
    evidence: |-
      Edge-hunter and verification-gap reviewers cite apps/web/src/features/ai-mcp/AiMcpPanel.tsx:126 and apps/server/src/http/routes/index.ts selectedStoryCards; register-tools.ts proposeHappyPathSlice(snapshot.cards) has no filter at all. Pre-existing behavior at surfaces the intent does not name; fix is switching to visibleCards plus a route assertion.
    location: >-
      apps/web/src/features/ai-mcp/AiMcpPanel.tsx:126
    severity: medium
---

Date: 2026-10-04. Version: 3. Purpose: implement Epic 2 Story 2.5, FR-49 and UX-DR1 through separate lifecycle actions, hidden inventories and one accessible shared Dialog. Required workflow artifacts and meaningful verification tests are authorized by the skill invocation. The orchestrator owns sprint-status.yaml; never write, revert or stage it. No commit or push is authorized.

<intent-contract>

## Intent

**Problem:** Existing lifecycle routes are not consistently reachable or distinguishable in the UI. Parked Activities are conflated with Not assigned, archived Cards lack a restore list, reports count hidden content, and confirmations lack shared focus behavior.

**Approach:** Expose separate Park, Archive and Delete actions, Parked and Archived lists in the board toolbar, accurate visible-content reporting and one shared accessible Dialog for existing modal and confirmation flows.

## Boundaries & Constraints

**Always:** Park applies only to Activities. Ask for child handling with supported reassign-left, reassign-right and unassign strategies, radio choices and one Park button. Reassign keeps descendants under direct children; unassign retains all descendants as root Cards. Explain the selected strategy accurately; unavailable active neighbor choices must not suggest a nonexistent destination. Parked Activity leaves board and Not assigned and appears in Parked; Unpark appends after all visible Activities, including sparse positions. Archive keeps data and hides the Card and its retained subtree from board, reports, counts and Release summaries; parked content is also excluded. List explicitly archived Cards separately from Parked Activities using unfiltered snapshots. Restore Archived uses the existing status PATCH with a user-selected nonarchived workflow status; never silently invent a previous status. Keep listCards/snapshots complete for inventories, history, persistence and exports; apply visibility at presentation/report boundaries. Delete permanently removes the selected Card and its owned links, preserves/reassigns descendants according to supported strategy, retains durable history and writes an Activity Event. Its confirmation names the Card and these actual consequences. Keep mutations in attributed UoW with one increment/history per affected root and atomic rollback. Every action has pending, duplicate prevention and explicit error behavior; failed dialogs remain actionable.

Use one shared Dialog for CardDetailModal, unsaved-close confirmation, the two DiscoveryMatrix window.confirm flows and three handmade dialogs, plus new lifecycle/list dialogs. Contain Tab/Shift+Tab and programmatic focus; make background inert; only the topmost layer handles Escape/backdrop; preserve prior inert state. Name by title and describe consequences. Confirms use alertdialog and initial Cancel/least-destructive focus; normal Card modal focuses heading. Restore focus to connected opener, otherwise same-Card tile, otherwise focusable board. Preserve existing deep links and browser Back behavior and History focus. All controls use native keyboard semantics, visible focus and English shared strings; status/error regions announce outcomes including when a Card disappears. Park, Archive and Delete are individually reachable for eligible Cards.

**Never:** Modify, stage or revert sprint-status.yaml or infer verification from its row; commit/push; touch user local-projects/input/databases; add dependencies, network calls, cloud or telemetry; implement Project archive/restore, per-version restore, undo, migrations, roving-grid/Move redesign or unrelated accessibility features. Do not duplicate contract schemas or query the database outside db. Do not add an archive-status column or compatibility layer: explicit status choice uses the current model.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Park with children | Activity with nested children and active neighbors; each supported strategy | Dialog shows radios and one Park; selected API body rehomes children correctly; Activity appears only in Parked | Cancel writes nothing; failed/pending action stays usable and cannot duplicate |
| Unpark ordering | Parked Activity; sparse/mixed/hidden root positions | Unpark returns after every visible Activity and leaves Parked | Missing Card explicit 404; invalid non-Activity park rejects with only Activities message |
| Archive and restore | Cards at each level, assigned Release, owned descendants | Archive preserves records/history, removes effective hidden content from board/reports/counts/summaries; Archived list Restore selects nonarchived status and makes eligible content visible | Failure announced, no optimistic false removal; inventories unaffected by filters |
| Permanent delete | Story or container with owned links/children | Named confirmation explains selected Card/link removal and retained children; commit removes Card, keeps auditable actor/version snapshot/event | Cancel unchanged; event/history failure rolls back entire action |
| Shared Dialog layers | Main Card modal, dirty confirm, lifecycle and Release confirms, removed opener | Proper roles/name/description, least-destructive focus, inert background, contained focus, topmost Escape and opener/tile/board restoration | Existing deep-link Back and History behavior preserved |
| Report boundaries | Visible, archived, parked and descendants under archived parents with links/estimates/releases | All Card-derived report totals, health/coverage counts and Release/Roadmap summaries exclude effectively hidden Cards, while snapshots retain all | Zero-visible-content reports remain valid |

</intent-contract>

## Code Map

- `packages/contracts/src/api/http.ts:233` — three child strategy enums; existing status PATCH supports explicit archived restore. Card status is a string, no archived boolean.
- `packages/db/src/repositories/cards-repository.ts:191-295,380,414` — archive/delete/park/unpark and child rehoming; incorrect park message, count-based unpark ordering, hidden-neighbor selection. Existing Tx/version/history infrastructure is authoritative.
- `packages/db/src/unit-of-work.test.ts:62`, `repositories/root-versions.test.ts:94,309,404` — actor/session, rollback, child strategies and durable deletion regressions. Reuse actual SQLite fixtures.
- `apps/server/src/http/routes/index.ts:306-331` — existing attributed action routes; reject non-Activity park explicitly at public boundary. `routes/unit-of-work.test.ts:224` and `index.test.ts:215,383` cover attribution/reports.
- `packages/db/src/repositories/releases-repository.ts:107,143`, `roadmaps-repository.ts:200`, `changesets-repository.ts:164`, `sources-repository.ts:239,302,378`, `work-item-repository.ts:231` — timeline, summary, roadmap, backlog health, GitHub/work-item sync health and source coverage/count visibility gaps. Reuse one pure visibility rule in `packages/core`; no DB queries outside repositories.
- `apps/web/src/features/story-map/useStoryMapBoardState.ts:150-169,208` — existing mutations/invalidation/bulk archive and filtering; exclude hidden Cards before ancestor reconstruction. `app/api.ts:426` already provides actions.
- `components/BoardToolbar.tsx` — Parked/Archived buttons beside Filter/Clear per EXPERIENCE:65; inventories from full snapshot. `CardTile.tsx` — native tile button and optional controls; stable Card identifier for focus restoration. `story-map-shell.tsx:106` hosts Discovery toolbar.
- `components/DiscoveryMatrix.tsx:114,122,475,512,531,548` — two browser confirms, direct Not assigned delete and three custom dialogs. Release confirmation must count all actual affected snapshot Stories, not filtered ones. Parked must leave Not assigned.
- `components/CardDetailModal.tsx:156,203,211,320` — global Escape and nested modal/dirty confirm; migrate to shared primitive preserving deep links and History. Add separately named eligible lifecycle actions.
- New shared Dialog under `apps/web/src/components/` and focused lifecycle dialog/list components under story-map — portal layers, radio strategy/state, attributed mutation errors and focus lifecycle. Keep files <=750 lines/components <=400/functions <=50 lines.
- `apps/web/src/ui-strings/index.ts` and `styles/global.css` — central copy and shared focus/layout. Replace misleading parking and obsolete delete alternatives.
- `components/card-detail.test.ts` — real router/Tiptap/jsdom fixtures; portal assertions must use document scope. Add focused primitive and actual board/action/list integration tests (ResizeObserver fixture).
- Two read-only investigations verified implementation and tests. Graph tools unavailable. Cached Epic 2 context current; Story 2.4 continuity preserves lazy paged History and its existing native focus behavior.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/` visibility helper and web/db consumers above — consistently exclude effective hidden Card subtrees at board/report/count boundaries, preserving full snapshots.
- [x] `packages/db/src/repositories/cards-repository.ts`, `apps/server/src/http/routes/index.ts` — Activity-only rejection, append ordering and eligible neighbor strategy behavior; preserve atomic version/event semantics.
- [x] `apps/web/src/components/` shared Dialog and focused tests — accessible nested focus/inert/Escape/fallback primitive.
- [x] `CardDetailModal.tsx`, `DiscoveryMatrix.tsx`, `CardTile.tsx` and dedicated lifecycle components — separate actions and migrate all scoped confirmations/choice dialogs.
- [x] `BoardToolbar.tsx`, board state, strings and styles — distinct unfiltered Parked/Archived lists and explicit status Restore with errors/status/focus.
- [x] Focused db/server/web tests plus real production browser acceptance — cover every matrix row, original routed History behavior, keyboard/focus/inert and truthful filtered Release confirmation.

**Acceptance Criteria:**
- Given an Activity with children, when Park is selected and confirmed with a child strategy, then it leaves the board and appears in Parked; when Unpark is activated, then it returns at the end.
- Given a non-Activity, when Park is requested, then it is rejected with a message saying only Activities can be parked.
- Given a Card, when Archive commits, then it is hidden and excluded from reports/counts/Release summaries; when restored from Archived with chosen status, then it returns without losing its data.
- Given a Card, when Delete is confirmed, then exactly the stated removal occurs and attributed audit history remains; when cancelled, then nothing changes.
- Given any scoped dialog, when keyboard focus or Escape is used, then focus stays in the topmost layer, the background is inert, cancellation closes only that layer and focus returns through documented fallbacks.
- Given any lifecycle action, when it commits, then affected versions/history/activity are atomic and its distinct UI control is keyboard operable with English labels.

## Spec Change Log

## Review Triage Log

### 2026-10-04 — Review pass

- verdicts: 23 findings — high 4, medium 14, low 0, false 5, maybe-false 0
- findings:
  - `[high]` `[patch]` E1: Lifecycle completion discards a dirty Card draft — CardDetailModal called close directly from lifecycle completion. Controls now disable while dirty; routed edit/held-Save tests preserve draft and the existing dirty-close dialog.
  - `[high]` `[patch]` E2: Archive can race a pending Save — Save includes the old workflow status and actions were concurrently enabled. The same controls remain disabled until Save and GET refetch settle; held mutation/refetch regression verifies both intervals.
  - `[medium]` `[patch]` E3: Tied sibling ordering changes neighbor labels — Appending the target behind visible siblings changed stable position/createdAt ties versus repository snapshot order. Filtering the original array preserves order; tied-neighbor regression passes.
  - `[medium]` `[patch]` E4: Release-owned remote links disappear from toolbar counts — The new cardId-required filter removed valid milestone links retained by repository health. Preserve non-Card links and filter only hidden Card owners; routed toolbar count/hint and disabled-state regressions pass.
  - `[medium]` `[patch]` E5: Release deletion understates affected Cards — deleteRelease clears releaseId at every level while confirmation counted Stories. Count all assigned snapshot Cards; hidden non-Story regression covers the real consequence.
  - `[medium]` `[patch]` G1: Lifecycle tests bypass query invalidation — Pre-verified: mock fetch directly replaced React snapshot state. Fixtures now consume real useStoryMap GET/refetch; routed tile-to-modal Archive and inventory Restore tests fail without story-map invalidation.
  - `[medium]` `[patch]` G2: Tracking visibility lacks rendered regression — Pre-verified: no rendered Tracking/ReleaseKanban assertion protected the helper adoption. Real routed Tracking fixture now asserts exact visible titles and status counts for archived and parked ancestry.
  - `[high]` `[patch]` B1: Dirty edits are discarded by Park/Archive — Verified the same direct-close root cause as E1. Disable lifecycle controls for dirty drafts; routed regression preserves unsaved edits and existing confirmation semantics.
  - `[high]` `[patch]` B2: Pending Save can overwrite Archive — Verified the same concurrent-mutation root cause as E2. Guard controls through both Save and refetch, with separately held response assertions.
  - `[medium]` `[patch]` B3: Inventory success notices remain in inert background — LifecycleInventory stayed open while only the board status changed. A persistent status inside the active inventory now announces Unpark/Restore/Delete and forwards the notice to the board; active/non-inert assertions pass.
  - `[medium]` `[patch]` B4: Release confirmation counts only Stories — Verified the same incomplete affected-owner count as E5. Count all assigned snapshot Cards, including hidden containers, and cover cancellation without mutation.
  - `[medium]` `[patch]` B5: Toolbar drops Release/milestone links — Verified the same cardId-required filter as E4. Release links remain counted with unsynced hints while hidden Card links are excluded.
  - `[medium]` `[patch]` B6: Legacy GitHub link count includes hidden Cards — The complete snapshot links.length diverged from the new visible health boundary. Count visible Card-owned links while retaining Release links; routed count regression retains all persisted links.
  - `[medium]` `[patch]` B7: Status Save and bulk Archive leave report caches stale — Their invalidation omitted Release, Roadmap, work-item health and source-detail queries now dependent on visibility. A private shared prefix list covers existing mutation paths; observed-cache refetch and Save invalidation regressions pass.
  - `[medium]` `[patch]` B8: GitHub picker offers hidden descendants — Story-only explicit-status filtering allowed descendants now excluded by push planning. Use effective visibility for the picker alongside B6; routed test offers only the visible Story with no outbound operation.
  - `[medium]` `[patch]` B9: Removed neighbor strategy remains submittable — Refreshed snapshot can remove a selected neighbor radio while the retained selection still submits. Require a currently available strategy while children exist; do not replace intent silently. Neighbor-loss and parent-inspected childless refresh regressions cover both states.
  - `[medium]` `[patch]` B10: Hidden inventories cannot permanently delete Cards — Rows offered only Restore/Unpark despite eligible Card Delete being required as a reachable distinct action. Add the existing named Delete confirmation separately; parked/archived cancellation and completion assertions pass.
  - `[false]` `[reject]` B11: Pending confirmation loses focus to body — Production Chrome with an eight-second delayed Unpark request was inspected immediately after native Return: activeElement remained the disabled Unpark button inside alertdialog, body=false. The specific alleged body-focus outcome did not occur; no speculative Dialog guard was added.
  - `[medium]` `[patch]` I1: Component evidence lacks the continuous routed lifecycle path — The original fixture made selection a no-op and refreshed local state; same verification root cause as G1. Added routed tile-to-modal Archive/GET/inventory regression and retained independent production HTTP/UI acceptance.
  - `[false]` `[reject]` I2: Mock Unpark position is separate from persistence evidence — No incorrect persistence outcome is claimed: actual SQLite tests independently exercise sparse ordering, child strategies, versions and rollback. Production Unpark also used the real server; layer separation does not invalidate this evidence.
  - `[false]` `[reject]` I3: Successful API coverage is mostly repository-level — No route failure is identified. Existing attributed public routes remain exercised by server tests and parent production Park/Unpark/Archive/Restore/Delete acceptance with actual HTTP state/event checks; repository tests additionally cover atomic semantics.
  - `[false]` `[reject]` I4: Native accessibility claims are not independently proved by the diff — A diff cannot contain execution history. Parent actually operated native Chrome keyboard/focus/inert flows; jsdom assertions supply separate automated regressions. Unoperated Windows/Linux and actual screen-reader speech remain explicit evidence limits, not claims of passing checks.
  - `[false]` `[reject]` I5: No sprint-status diff cannot prove no transient writes — No ownership breach is identified. The execution used an explicit excluded path for staging/diff and never issued a write/revert for sprint-status; skill invocation and command execution are recorded independently of its row. No spec edit is used to repair this observation.

Shared root-cause entries: 12 patches (2 high, 10 medium), covering 18 individual findings. No intent gaps, bad-spec loopbacks or deferred defects. Parent inspection additionally corrected the childless refresh state within the stale-strategy patch. All four review layers completed before triage or patch handoff.


### 2026-10-04 — Review pass (follow-up)

- verdicts: 48 findings — high 0, medium 11, low 25, false 12, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind-1 core imports `visibleCards` from its own package alias — real cycle that forced a vitest alias; backlog-health and visibility test now import relatively and the alias is removed.
  - `[medium]` `[patch]` Blind-2 DiscoveryMatrix empty-board prompt deleted — real, unrelated to intent; block restored, covered by a new no-visible-Activity test.
  - `[low]` `[patch]` Blind-3 dead restore prop, strings and misleading keys — verified zero consumers; CardTile onRestore, ArrowUp and eleven strings removed.
  - `[false]` `[reject]` Blind-4 failed refetch flips committed action to error — invalidateQueries does not reject on refetch failure (throwOnError defaults false), so onSuccess still closes.
  - `[false]` `[reject]` Blind-5 Unpark/Restore descriptions are list-level — parkedListDescription and archivedListDescription state the Unpark append and Restore status consequences.
  - `[low]` `[patch]` Blind-6 inventory rows have identical button names — aria-labels now carry the Card title.
  - `[medium]` `[patch]` Blind-7 Dialog Tab wrap includes unchecked radios — Shift+Tab from the checked non-first radio exits the dialog; tabbable list now skips unchecked group members, regression added; render-time style, IME, scroll-lock and markup-fallback sub-claims are low, unlikely and need more than a direct fix, not patched.
  - `[low]` `[reject]` Blind-8 Park route double read, unpark guards, unmapped neighbor error — repository re-checks inside the transaction; unpark guard pre-existing; stale neighbor blocked by the UI.
  - `[false]` `[reject]` Blind-9 work-item conflicts without cardId vanish — listOpenSyncConflicts already excludes cardless rows upstream; the attempted edit changed no result and was reverted.
  - `[low]` `[reject]` Blind-10 visibleSourceLinks scans all links — local SQLite tool, no demonstrated bottleneck.
  - `[low]` `[reject]` Blind-11 "1 cards" pluralization — pre-existing cardCount/countCards copy, unrelated to this change.
  - `[low]` `[reject]` Blind-12 modal heading layout, duplicate error and unexplained disabled controls — cosmetic; dirty/pending disabling is the deliberate E1/E2 repair.
  - `[false]` `[reject]` Blind-13 spec artifact inconsistencies — fix is editing this build's spec.
  - `[low]` `[reject]` Blind-14 terse and never-cleared notices — consecutive identical notices cannot occur; wording works.
  - `[low]` `[patch]` Blind-15 restore statuses hardcoded — duplicated vocabulary can offer undefined statuses; options now come only from snapshot.workflowStatuses minus archived, fixtures seed real statuses.
  - `[low]` `[reject]` Blind-16 duplicated invalidation prefixes — developer-only, already shared by all consumers.
  - `[low]` `[reject]` Blind-17 DiscoveryLanes extraction size and indentation — extraction follows the file-size rule; cosmetic.
  - `[low]` `[reject]` Blind-18 MoveAreaDialog fieldset, shared pending and rootCount — dialog is modal so no competing mutation; ordering effect minor; missing test is patched under Verification-1.
  - `[false]` `[reject]` Blind-19 Restore snapshot lost by coalescing — a following same-actor save coalescing is the established design; archive transitions are protected and tested.
  - `[low]` `[patch]` Edge-1 same core self-import as Blind-1 — shared fix.
  - `[low]` `[reject]` Edge-2 neighbor-missing Error returns 500 — only reachable by stale API/MCP callers; fail-fast intended, UI blocks the selection (B9).
  - `[false]` `[reject]` Edge-3 conflicts without cardId dropped — duplicate of Blind-9, refuted upstream.
  - `[low]` `[reject]` Edge-4 re-parking a hidden Activity — no UI path; no demonstrated wrong state.
  - `[low]` `[reject]` Edge-5 level check outside transaction — repository repeats the check inside the transaction.
  - `[low]` `[reject]` Edge-6 unpark has no parked guard — pre-existing, no UI path.
  - `[low]` `[reject]` Edge-7 legacy parked non-Activity rows — baseline already rejected parking non-Activities; no reachable state shown.
  - `[false]` `[reject]` Edge-8 MoveAreaDialog busy can stick — inert modal prevents any competing mutate on the shared hooks.
  - `[low]` `[reject]` Edge-9 restore under hidden ancestor still hidden — documented in archivedListDescription; extra logic not warranted.
  - `[low]` `[reject]` Edge-10 pull scope differs from visible counts — pre-existing server pull semantics.
  - `[false]` `[reject]` Edge-11 stale bulk selection — useStoryMapBoardState.ts:171 prunes selection against visible ids.
  - `[medium]` `[defer]` Edge-12 AI/MCP picker and server selectedStoryCards use the archived-only filter — real but pre-existing and outside intent's named boundaries; recorded in deferred.
  - `[false]` `[reject]` Edge-13 Release count should count Stories — carried E5/B4 reasoning: deleteRelease clears releaseId at every level, so counting all assigned Cards is the truthful consequence.
  - `[low]` `[reject]` Edge-14 lifecycleNotice never cleared — same as Blind-14.
  - `[medium]` `[patch]` Edge-15 empty-state removed — same fix as Blind-2.
  - `[low]` `[patch]` Edge-16 dead strings — same fix as Blind-3.
  - `[medium]` `[patch]` Verification-1 Card modal Escape/backdrop untested through CardDetailModal — two routed tests added: dirty Escape/backdrop keeps the modal and `?card=`, clean Escape clears it.
  - `[medium]` `[patch]` Verification-2 MoveAreaDialog untested — tests cover default area, failure retry, Unscheduled and Not assigned bodies.
  - `[medium]` `[patch]` Verification-3 tile controls untested — test opens Park, Delete (Activity, Step, Story) and Move dialogs from tile controls with no writes until confirmed.
  - `[medium]` `[patch]` Verification-4 Releases/Roadmaps adoption untested — routed test asserts fallback totals and Roadmap reference labels; mutation check fails against `snapshot.cards`.
  - `[medium]` `[defer]` Verification-5 AI proposal selection ignores visibility — same root as Edge-12, deferred.
  - `[medium]` `[patch]` Verification-6 empty-state removal — same fix as Blind-2.
  - `[low]` `[reject]` Verification-7 unmapped neighbor error — same as Edge-2.
  - `[low]` `[patch]` Verification-8 orphaned onRestore — same fix as Blind-3.
  - `[medium]` `[defer]` Intent-1 AI/MCP and GitHub-route consumers not on the visibility rule — AI/MCP part is the Edge-12 deferral; GitHub panel already filters.
  - `[low]` `[patch]` Intent-2 restore options partly invented — same fix as Blind-15.
  - `[false]` `[reject]` Intent-3 confirmations static not computed — copy names the Card, owned links, strategy and history, which is the stated consequence.
  - `[false]` `[reject]` Intent-4 browser evidence only narrative — carried I4: spec evidence is not diff content.
  - `[false]` `[reject]` Intent-5 Archive reachable only via modal on tiles — intent requires individual reachability, met by modal and inventories.

Shared root-cause entries: 11 patches (0 high, 6 medium, 5 low) covering 28 findings; 1 deferral covering 4 findings. Full `corepack pnpm test` passes and serial `node scripts/verify.mjs` passes after the patches.

## Design Notes

Archived is a workflow status in the current schema, so Restore explicitly asks for a nonarchived status rather than pretending the previous status is stored. Visibility is derived from persisted Card hierarchy and flags; retained hidden descendants do not become phantom unassigned board rows. Lists sit in the board toolbar, distinct from Not assigned. Shared Dialog portals separate active layers from inert background while preserving nested modal behavior.

## Verification

Use installed Node 24: `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH`. Stage newly created sources explicitly before git-ls-files command fixtures, excluding sprint-status.yaml. Run tests/build serially.

- `corepack pnpm test` — all workspace tests pass without failures/skips, including every matrix row.
- `node scripts/verify.mjs` — Git/source hygiene, installed runtime, workspace typecheck and production build pass.
- Disposable production browser/server using owned temporary SQLite fixture — operate Park child radios, Unpark, Archive/Restore, Delete/Cancel, filtered Release confirmation, Card dirty nested Escape, native Tab/Shift+Tab, visible focus, inert background and disappearing-opener fallback. Do not open user data; clean only owned resources. Native Windows/Linux and screen-reader speech absent on this Mac are evidence limits, not sole blocking conditions.

## Changelog

- 2026-10-04 v1: source-grounded plan from Epic 2 context, Story 2.5 and two independent investigations.
- 2026-10-04 v2: completed implementation, four-lens triage, twelve shared repairs and independent final 455-test/release/production verification; retained orchestrator ownership, no-commit boundary and platform/speech evidence limits.
- 2026-10-04 v3: automation completion check confirmed no pending Story 2.5 processes or child agents and refreshed the terminal done result; final verification and orchestrator ownership remain unchanged.

## Implementation Verification Evidence

Parent read the staged baseline diff independently, including all scoped implementations and regression assertions. Initial workspace verification passed 439 tests; production acceptance found raw header counts and same-commit removed-opener focus. Both were repaired with rendered-header and real React DOM-commit regressions. Parent reread the repaired source/diff and repeated full validation: **442 tests pass**, zero failures/skips (61 scripts, 2 importers, 14 core, 50 web, 209 db, 106 server). Serial `node scripts/verify.mjs` passes Git/source hygiene, Node 24.17.0/pnpm, workspace typecheck and production build; existing bundle-size advisory only.

Production Chrome operated the actual built app with an owned temporary database using the shipped sample map. Native Tab/Shift+Tab and Enter/Space operated Park/unassign and Unpark; parked Activity left both board and Not assigned, inventories remained separate, and nested completion focused the list heading. Archive hid the saved Activity/Step/Story subtree; real HTTP showed all three persisted with Release report totals zero. Archived inventory remained complete under an absent search, Restore stayed disabled until an explicit active status and restored all descendants. Filtered/hidden Release confirmation truthfully named one affected Story despite zero visible Stories. Dirty title + Escape opened only the nested alertdialog, Cancel initially focused, another Escape retained the dirty main modal.

Native Delete cancellation left data unchanged; confirmation removed only the selected Activity, retained descendants as root Cards and real Activity API showed human/local-user card.deleted attribution. A production screenshot verified visible 2px green Cancel focus against white backing, radio choices, named consequences and inert background. After final repaired build/reload, native tile-triggered Park showed matching header/toolbar counts of two and **document.activeElement was the focusable board, not body**.

Every matrix row has passing executed coverage: actual SQLite strategies/neighbor rejection/atomic rollback/history and sparse ordering, public HTTP rejection/missing/attribution, report/link/coverage zero-visible/restoration fixtures, real routed History/dirty/deep-link tests, shared focus/inert/topmost/fallback tests, rendered action/inventory pending/error/cancel/restore/Release tests, and production native keyboard checks. Incidental sibling position compaction retains the established AD convention rather than adding root versions for compaction alone. Native Windows/Linux and actual screen-reader speech remain unoperated evidence limits.

Logs: `/tmp/storymapper-2-5-parent-tests-repaired.log`, `/tmp/storymapper-2-5-parent-verify-repaired.log`; baseline diff `/tmp/storymapper-2-5-implementation.diff`. Browser fixture/server is parent-owned and will be cleaned after review/final acceptance. No sprint-status writes/staging/reverts, commit, push or user-data access.

## Auto Run Result

Status: done

Summary: Follow-up review pass over the Story 2.5 diff since baseline 7516f5d4fc84341f47a01fdb16b70a8faa42d239 (sprint-status.yaml and .wolf excluded). Four layers reported 48 findings; 11 shared-root patches applied, one medium deferral recorded, the rest rejected with evidence in the triage log.

Files changed in this pass:
- `packages/core/src/coverage/backlog-health.ts`, `story-map/visibility.test.ts`, `vitest.config.ts` — relative import replaces the self-package import; alias removed.
- `apps/web/src/components/Dialog.tsx`, `Dialog.test.ts` — Tab containment skips unchecked radio-group members; regression added.
- `apps/web/src/features/story-map/components/DiscoveryMatrix.tsx` — empty-board add-Activity prompt restored.
- `CardTile.tsx`, `ui-strings/index.ts` — dead restore prop, ArrowUp import and eleven unused strings removed.
- `LifecycleInventory.tsx`, `LifecycleDialog.tsx` — Card-titled button names; restore statuses come only from workflow statuses.
- `lifecycle.test.tsx`, `card-detail.test.ts` — seeded workflow statuses; new tests for tile controls, Move dialog, empty board, Card modal Escape/backdrop and Releases/Roadmaps visibility.

Review findings: patches applied 11 entries (6 medium, 5 low); deferred 1 (medium, AI/MCP picker visibility); rejected 36 findings with reasons recorded per row (12 false, remainder low or carried).

Follow-up review recommended: false — no high-verdict entry was patched on this follow-up pass.

Verification: `corepack pnpm test` passes (core 14, web 70, db 209, server 106, importers 2); serial `node scripts/verify.mjs` passes Git/source hygiene, Node 24.17.0, typecheck and build (existing bundle-size advisory). One new Releases test was mutation-checked against `snapshot.cards` and fails as expected.

Residual risks: Shift+Tab radio containment is proven in jsdom only, not re-run in native Chrome; AI/MCP picker visibility remains deferred; no commit was made because the spec's intent contract forbids commit/push and sprint-status.yaml is orchestrator-owned, so the working tree stays dirty for the orchestrator.
