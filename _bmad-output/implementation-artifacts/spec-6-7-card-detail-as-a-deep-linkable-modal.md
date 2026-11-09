---
title: '6.7 Card detail as a deep-linkable modal'
type: feature
created: '2026-10-17'
version: 3
status: done
baseline_revision: 905cdd53b5e48e338b1206768ddc1d9490306225
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      Unsaved attachment Label/path/type fields are discarded when leaving an otherwise clean Card modal.
    evidence: |-
      Pre-existing attachmentDraft state is separate from the persisted Card draft and isDirty. The same reset/unmount behavior exists at baseline905cdd53b5e48e338b1206768ddc1d9490306225; this story protects accepted and pending Card writes but does not add attachment-draft persistence.
    location: >-
      apps/web/src/features/story-map/components/CardDetailModal.tsx:49
    severity: medium
  - summary: >-
      Rapid native browser gestures interleaved with corrective history.go events remain unverified.
    evidence: |-
      Resume review Blind7 identifies a possible event-ordering risk around the single ignoreNextPop flag, without a reproduced defect. Automated repeated traversal Cancel/Discard and subsequent cursor tests pass; final native rapid-gesture checks would settle whether a user event can precede the corrective pop event.
    location: >-
      patches/@tanstack__history@1.162.0.patch
    severity: medium (unverified)
  - summary: >-
      A restore go(delta) that targets a history index outside the browser's session range could leave ignoreNextPop set and swallow the next genuine traversal.
    evidence: |-
      Follow-up Edge9 claim: the patched onPushPopEvent sets ignoreNextPop before win.history.go(restoreDelta/resumeDelta) and clears it only on the matching pop. Both indices come from router-created entries of the same session, so an out-of-range delta was not shown reachable; a native run with truncated session history would settle it.
    location: >-
      patches/@tanstack__history@1.162.0.patch
    severity: medium (unverified)

---

Reproducing statement: Run bmad-build-auto for Story 6.7 using the accepted Epic 6 preparation/detail plan, preserve orchestrator-owned sprint-status.yaml without writing or reverting it, and independently verify code and behavior.

<intent-contract>

## Intent

**Problem:** Card deep links and a rich Markdown editor exist, but formatting controls lack accessible names/states and editor Escape currently reaches the modal's capture handler first. Dirty browser/router navigation can also discard a draft without the existing Save/Discard/Cancel guard.

**Approach:** Complete the existing shared Dialog/editor integration and protect navigation that would abandon the current draft, preserving URL/history, Markdown serialization and existing preview/live-update behavior.

## Boundaries & Constraints

**Always:** Reuse shared Dialog, router, existing conflict/announcement/live holds and tiptap-markdown. Keep initial heading focus, top-layer containment and opener/same-Card/board restoration. Preserve unrelated search state including preview; same-map/same-Card preview suspension must retain exact drafts and pending-write holds. Preserve actor/baseVersion, failed-save text, source provenance, Restore epochs and ChangeSet-first nonhuman writes. Use English string modules. Never write, stage or revert sprint-status.yaml or orchestrator run/deferred ledgers. Run Node 24 via its installed path. No commits or push without explicit user request; leave reviewed work staged.

**Never:** Replace the editor/modal framework; add autosave, HTML persistence, history schema changes, live GitHub writes or user Project mutations. Do not infer acceptance from bookkeeping. Do not broaden Epic 6 timing gates or claim DOM tests prove native accessibility.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Deep links/history | Fresh supported View URL with card, close then Back/Forward | Correct modal follows URL/history; unrelated search survives | Missing Card does not open an unrelated editor |
| Dirty navigation | Dirty Card; Back/Forward, remove/change card, leave map/page | Existing Save/Discard/Cancel protects abandoned draft; Cancel retains location/draft; successful Save or Discard reaches intended destination | Failed/conflicting save keeps draft and confirmation; pending writes cannot be abandoned |
| Preview coexistence | Same-map/same-Card preview enters/exits with dirty/pending editor | Canonical editor suspended; exact draft and holds retained; no canonical write in preview | Late Save-and-close cannot rewrite preview route |
| Layered keyboard | Focused Description, including formatted descendants | First Escape leaves editor for an in-modal focus target; later Escape closes clean modal or opens dirty confirmation | Nested confirmation Escape dismisses only its own layer |
| Accessible formatting | Description and Bold/Italic/Bullet list/Heading 2 controls | Named multiline editor, named buttons with accurate aria-pressed, visible focus frame | Inactive editor controls cannot perform writes |
| Markdown | Real rich-editor formatting, Save/reload and Issue body plan fixture | Markdown persists and canonical Issue body starts with valid Markdown, without HTML | Save failure preserves typed draft |

</intent-contract>

## Code Map

- `apps/web/src/features/story-map/components/CardDetailModal.tsx:30`: canonical modal; draft/baseline/version refs, preview suspended marker, pending mutation cache and dirty-close confirmation. Effect at184 resets on Card identity changes; close guard currently only handles explicit close. Integrate router blocking before abandoning dirty/pending state, without intercepting safe preview suspension. Shared hooks before conditional returns.
- `apps/web/src/features/story-map/components/DescriptionEditor.tsx:12`: actual useEditor/StarterKit/Markdown; toolbar currently B/I/List/H2 with no pressed state; contenteditable has no accessible name. Preserve controlled value protection while focused.
- `apps/web/src/components/Dialog.tsx:129`: document capture keydown precedes editor bubbling. Add narrowly scoped coordination so editor handles first Escape while topmost Dialog retains all other containment/stack behavior; use existing restoration logic.
- `apps/web/src/ui-strings/story-map.ts:265`; `apps/web/src/styles/global.css:1728`: formatting copy and editor frame styles. Reuse focus tokens; name controls Bold, Italic, Bullet list, Heading 2 and editor Description.
- `apps/web/src/app/router.tsx`; `app/routes/story-map-shell.tsx`; `app/routes/RootLayout.tsx`: route/search and heading focus integration; verify actual root focus with modal, not solely mocked RootLayout tests. Same Card across core views must retain draft if component remains mounted.
- `apps/web/src/features/story-map/components/card-detail.test.ts`; `card-detail-test-fixture.ts`: real router/modal/editor tests, RootLayout mocked to Outlet. Existing formatting/save/error/conflict/history/preview tests must stay. New focused test files may reuse fixture to respect750line limit.
- `apps/web/src/components/Dialog.test.ts`; `apps/web/src/features/changesets/shell.test.tsx`: top-layer focus and preview/pending ownership regressions. `apps/server/src/http/routes/card-markdown.test.ts`: existing persisted Markdown/legacy dry run and actual work-item plan fixture with no remote write.
- Local code-review-graph search used; source wins. Read-only areas: contracts/core/DB/history/GitHub canonical-body implementation unless a source-proven story defect requires a narrowly justified change. Prior6.6 Code Map/Design Notes retain preview suppression and suspended dirty/dependency holds.

## Tasks & Acceptance

**Execution:**
- [x] CardDetailModal/router/shell/RootLayout and actual-router tests: guard abandoning dirty/pending editor navigation, preserve deep links/history and safe preview transitions; keep root heading focus behind top Dialog.
- [x] DescriptionEditor/strings/styles: accessible names/pressed state/focus frame and first Escape handoff.
- [x] Dialog/Dialog.test.ts: coordinate editor Escape at the owning layer; retain nested confirmation, Tab and restoration guarantees.
- [x] Card-detail/editor/router tests and server Markdown fixture: cover every matrix row, run existing failed-save/conflict/live/preview suites and canonical Issue plan; no live remote mutation.

**Acceptance Criteria:**
- Given each supported View URL with a Card query, when loaded freshly and navigated with history, then its Card modal state matches the URL and unrelated query state survives.
- Given a dirty draft, when navigation would abandon it, then Save/Discard/Cancel protects it, including failed saves and pending writes.
- Given the open modal and dirty confirmation, when using Tab/Shift+Tab/Escape, then only the top layer operates and closing restores appropriate board focus.
- Given description editing, when formatting and pressing Escape, then names/states are accessible, first Escape leaves editing and the next follows dirty-close behavior.
- Given saved rich formatting, when reloading and building a fixture GitHub Issue plan, then stored Markdown and Issue body preserve formatting.

## Spec Change Log

- 2026-10-17: Real browser-history Forward cancellation exposed installed TanStack history1.162.0 restoring every blocked pop with go(1). Added minimal pnpm patch to source/ESM/CJS using inverse delta, lock hash and actual browser-history regression. No new dependency, public API or cross-story contract. Native label association required replacing the Description wrapper label and explicit button names. Preserve existing preview holds/Markdown.

## Review Triage Log

### 2026-10-17 — Review pass 1

- verdicts: 18 findings — high1, medium10, low1, false6, maybe-false0.
- findings, preserving each reviewer row before grouping:
  - `[medium]` `[patch]` Blind1, concurrent ancillary mutation observers expose only latest pending call — source permits repeat submissions; repair counts every Card-owned in-flight mutation and tests reverse completion.
  - `[medium]` `[patch]` Blind2, repeated navigation overwrites a resolver — installed useBlocker sets a fresh resolver per attempt; repair preserves one destination and settles/refuses repeated attempts, with actual-history regression.
  - `[high]` `[patch]` Blind3, stale ignoreNextBeforeUnload skips later reload guard — installed back/forward sets it and same-document pop did not clear it; repair clears the traversal skip and tests dirty Back/Cancel/unload.
  - `[medium]` `[patch]` Blind4, inverse-delta patch lacks multi-entry evidence — add actual go(-2)/go(2) Cancel/Discard browser/router/draft assertions.
  - `[false]` `[reject]` Blind5, spec completion conflicts with unfinished native evidence — spec was in-review, not terminal; follow-up flag was an uncomputed template default. Parent subsequently reproduced repaired cross-document Forward/Cancel and retained exact route/text. No completed acceptance claim was contradicted; changing this spec alone is not a product fix.
  - `[medium]` `[patch]` Blind6, unload callback untested — add direct clean/dirty/pending/settled beforeunload evidence; grouped with Blind3.
  - `[medium]` `[patch]` Blind7, pending-write preview blocker lacks integration coverage — prior shell tests preserve pending ownership but do not attempt new blocked departure; add combined suspension/failure navigation assertions.
  - `[low]` `[patch]` Blind8, pressed states omit selection transitions and Bullet list — add direct actual editor selection/on/off assertions for all four controls.
  - `[medium]` `[defer]` Blind9, attachment-form draft loss — confirmed pre-existing state outside Card draft at baseline, recorded once in the single deferred list. No attachment persistence feature added.
  - `[medium]` `[patch]` Blind10, focus after resumed blocked departure untested — add immediate actual RootLayout focus assertions after Save/Discard, including queued cleanup.
  - `[medium]` `[patch]` Edge1, lifecycle writes absent from pending protection — LifecycleDialog mutation was not part of writesPending and browser history remains usable during a modal; include its Card-owned mutation and test pending/refused departure.
  - `[medium]` `[patch]` Verification1, browser unload protection has no behavioral verification — accepted filed evidence; same repair group as Blind3/6.
  - `[medium]` `[patch]` Verification2, origin-link pending guard lacks coverage — accepted filed evidence; delayed create/delete refusals and disabled Discard coverage join Blind1's mutation ownership repair.
  - `[false]` `[reject]` Intent1, tests use jsdom rather than native browser — accurate surface description, not a defect claim; logs identify jsdom and separate native observations, without a universal accessibility claim.
  - `[false]` `[reject]` Intent2, native evidence has narrower coverage — evidence explicitly scopes untested native all-View/preview/screen-reader behavior; repaired reload/Forward boundary now observed separately. No false full-WCAG assertion exists.
  - `[false]` `[reject]` Intent3, Markdown relies on existing server fixture — parent independently executed actual persisted Markdown/canonical Issue-plan test successfully; unchanged working implementation needs no duplicate fixture.
  - `[false]` `[reject]` Intent4, a diff cannot establish full workflow/independence — descriptive epistemic limit, no demonstrated code defect; parent execution and review records supply process evidence.
  - `[false]` `[reject]` Intent5, no sprint diff cannot prove no transient write — descriptive limit, no write/revert was reported or performed; all staging excludes orchestrator state.

Repair groups:8, comprising1high/6medium/1low; one pre-existing medium deferral. Each row remains individually recorded above. All eight groups were repaired and119 focused tests passed on the implementation agent. Parent final547webtests and persisted Markdown fixture pass. The history patch now restores using current browser cursor and captured destination, supports repeated/non-adjacent gestures, and resets the same-document unload skip. Single pending app decision explicitly refuses subsequent attempts; public router load settles refused commit promises without canonical query refetch, verified by unchanged cache identity/read count during held preview. Card mutation cache keys/counts retain all pending writes and lifecycle ownership. Actual editor selection/off-state and destination focus tests cover the remaining gaps.

### 2026-10-17 — Independent repair check

- verdicts:1finding — high0, medium1, low0, false0, maybe-false0.
- findings:
  - `[medium]` `[patch]` Successful lifecycle completion could call close(ignoreBlocker) while a navigation resolver remained pending — exact source path confirmed before repair. completeLifecycle now settles/resumes the pending destination when clean and retains changes typed during the request. Success/refusal/subsequent-navigation tests pass; independent source recheck confirmed repair with no further concrete defect. This joins the existing lifecycle repair group.

Total19individual findings;8patchgroups(1high/6medium/1low),1pre-existing medium deferral,6rejected descriptive/refuted findings. Independent recheck was source/test inspection, not actual persistence/native acceptance.

### 2026-10-17 — Deterministic repair review

- verdicts:17findings — high0, medium2, low1, false13, maybe-false1. Four review lenses ran; edge-case returned no findings. Three concurrent reviewer slots required launching intent-alignment after the first reviewer returned; all lenses completed before triage.
- findings:
  - `[low]` `[patch]` Blind1, clean pending-write confirmation enables redundant Save — source confirmed a full update after settlement with no dirty draft; disable Save when clean, with no-update and Cancel/Discard regressions.
  - `[false]` `[reject]` Blind2, forced unmount leaves a pending resolver — no reachable application bypass was demonstrated. The sole ignoreBlocker caller is close(), reached after guarded decisions or successful completion; normal route/map changes are blocked and preview retains the component. Error-boundary failure is hypothetical rather than an admitted navigation path.
  - `[false]` `[reject]` Blind3, lifecycle completes while another owned write is pending — lifecycle admission is disabled during owned writes and the top Dialog contains input during the lifecycle request. No ordinary UI path admitting the asserted overlapping requests was demonstrated.
  - `[false]` `[reject]` Blind4, lifecycle completion overwrites unrelated search — validated shell search contains card/preview only. Preview suspension is checked through the current ref before close; same-Card view changes preserve that search, and pending departures resolve the captured destination instead of calling close.
  - `[false]` `[reject]` Blind5, successful Park/Delete need additional realistic snapshots — existing source shares the completion path, retainedCard preserves the removed Card, refused Park/Delete and successful lifecycle tests run, and server lifecycle tests verify actual actions. No distinct demonstrated failure was identified; this is a request for broader tests.
  - `[medium]` `[patch]` Blind6, repeated native traversal acceptance lacks coverage — add Discard after the second refusal and assert router/window agreement plus subsequent Forward/Back cursor behavior; grouped with Verification1.
  - `[maybe-false]` `[defer]` Blind7, corrective pop can consume a rapid user traversal — no reproduction establishes the browser event ordering. Record medium unverified; a final native rapid-gesture run around corrective history.go would settle it.
  - `[false]` `[reject]` Blind8, entries without numeric router indices break restoration — supported router-created entries carry indices and initial history creation assigns state. No supported Card-abandoning route through an externally injected malformed native entry was demonstrated; arbitrary third-party history mutation is not an admitted application caller.
  - `[false]` `[reject]` Blind9, missing final native combined acceptance — carried: prior Intent1/2 rows explicitly distinguish native evidence limits and reject interpreting DOM checks as universal acceptance. This repair makes no fresh native acceptance claim.
  - `[false]` `[reject]` Blind10, repeated logs should be consolidated — retained historical failures and command output are intentional verification evidence; no functional or named developer divergence is demonstrated. Deleting prior evidence is unnecessary to repair deterministic verification.
  - `[medium]` `[patch]` Verification1, nonzero resumeDelta acceptance branch has no regression — filed evidence accepted; Discard now starts after physical cursor restoration, checks the first destination in router/window, and walks Forward/Forward/Back/Back. Same group as Blind6.
  - `[false]` `[reject]` Intent1, document departure exceeds the three-way router guard — native beforeunload and same-document Save/Discard/Cancel are explicitly separate surfaces; no claim promises custom browser-close controls or prevents the browser's explicit leave choice.
  - `[false]` `[reject]` Intent2, history coverage is jsdom with earlier native evidence — carried: prior Intent1/2 rows preserve this exact limit; final native-history acceptance is not claimed.
  - `[false]` `[reject]` Intent3, accessibility coverage is DOM with limited native evidence — carried: prior Intent1/2 rows explicitly avoid full screen-reader/WCAG claims; no contradicted product assertion is shown.
  - `[false]` `[reject]` Intent4, preview coordination lacks complete native acceptance — carried: prior native-evidence rows already record this limit; passing integration tests are described as integration evidence.
  - `[false]` `[reject]` Intent5, native editor is not joined to persisted Issue-plan test — carried: prior Intent3 row records actual persisted Markdown/canonical Issue-plan verification separately from editor serialization. No claim that a single native end-to-end test executed is made.
  - `[false]` `[reject]` Intent6, preservation constraints are existing surfaces and logs cannot establish staging — source retains actor/baseVersion/provenance/Restore paths, current tests exercise them, and parent directly audits staging and protected-file hashes. These are evidence boundaries, not a demonstrated code defect.

Two patch groups:1medium verification group and1low direct Save-state correction. One medium unverified native ordering deferral;13rejections. The frozen intent contract is unchanged.

## Design Notes

Prepared6.7 tasks remain ordered and targeted. Source investigation identified missing dirty navigation protection as a required refinement of task1. Use installed TanStack Router APIs after inspecting local dependency source; no new router/editor dependency. Keep 6.6 same-card preview suspension and pending mutation protections. Native browser/screen-reader evidence must be distinguished from DOM evidence.

## Verification

Run serially with `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` prepended to PATH; save sanitized logs under `evidence/story-6-7/` next to this spec. Parent independently reruns all commands and audits matrix tests.

- `corepack pnpm --filter @storymapper/web test`: nonzero executed tests covering matrix plus all existing web regressions pass.
- `corepack pnpm --filter @storymapper/server exec vitest run src/http/routes/card-markdown.test.ts`: actual1+ persisted Markdown/Issue plan test passes.
- `node scripts/verify.mjs`: source hygiene/capability parity/workspace typecheck/build pass.
- `git diff --check` and `git diff --cached --check`: whitespace passes; no orchestrator staging.

Attempt disposable native browser keyboard/editor/history/preview checks if available; record exact limits if native UI or screen-reader checks cannot run. No user data or live GitHub writes.

## Changelog

- 2026-10-17 v1: Initial runnable spec from accepted6.7plan,6.6continuity and focused source/graph investigation.
- 2026-10-17 v3: Repair portable checkout patch inputs after deterministic failure; review adds clean-confirmation Save guard and repeated-traversal acceptance regression. Frozen intent unchanged.


## Deterministic verification repair — 2026-10-17

Resume the existing implementation without changing the frozen intent contract. Repair the failure recorded in `.bmad-loop/runs/20261017-113843-6eaa/feedback/6-7-card-detail-as-a-deep-linkable-modal-1.md`: root `corepack pnpm test` fails in the real setup command fixtures. Diagnose the fixture/dependency-patch boundary and make the minimal source-proven correction. Preserve all prior product changes and orchestrator-owned files. Run the exact root test command under Node24 in addition to the Verification commands above.

### 2026-10-17 — Follow-up review pass

- verdicts: 31 findings — high 0, medium 2, low 8, false 19, maybe-false 2
- findings:
  - `[false]` `[reject]` Blind1, blocked navigation hangs when the card disappears or the modal unmounts — carried: prior Blind2 row; retainedCard keeps the Card while its id is routed, the sole ignoreBlocker caller is close() after guarded decisions, and no admitted forced-unmount path was shown.
  - `[false]` `[reject]` Blind2, history patch lacks decision record and exit plan — pnpm patchedDependencies is keyed to the exact 1.162.0 version, so an upgrade fails loudly instead of silently dropping the patch; the Spec Change Log records why; a reversible one-package patch is not an ADR-level decision.
  - `[false]` `[reject]` Blind3, NaN delta silently skips restoration for index-less entries — carried: prior Blind8 row; router-created entries always carry indices.
  - `[low]` `[reject]` Blind4, pnpm-lock deprecated-URL churn and checkout allow-list coverage — pnpm regenerates the text on lock refresh and tool-owned churn harms nothing; the allow-list line is exercised by the passing root setup fixtures.
  - `[low]` `[reject]` Blind5, ["card-owned-write", card.id] repeated across mutations — style duplication with no present defect; extracting a helper across CardDetailModal and LifecycleDialog exceeds a direct correction.
  - `[false]` `[reject]` Blind6, heading Save gated on versionedPending but confirmation Save on writesPending — the heading Save writes only versioned Card fields and ancillary writes use independent rows; the confirmation also abandons the editor, so it waits for every owned write. No wrong outcome shown.
  - `[false]` `[reject]` Blind7, LifecycleDialog freezes onComplete with stale draft/search — carried: prior Blind4 row; completeLifecycle compares draftRef and baseline refs live, and shell search holds only card/preview.
  - `[medium]` `[patch]` Blind8, Save-and-close finishing during preview suspension leaves the Unsaved changes confirmation open — reproduced: after the save settled, an alertdialog remained rendered during preview (extended shell test failed on it). Fixed by always clearing closeConfirm on success; close() already no-ops while suspended. The Discard no-op sub-claim under suspension is low and rare (confirmation must already be open when preview arrives), so it is not patched. Same group as Verification1.
  - `[low]` `[reject]` Blind9, confirmation copy says Unsaved changes while only an ancillary write is pending — copy polish; Save and Discard are disabled and Cancel works, so no wrong outcome.
  - `[false]` `[reject]` Blind10, RootLayout aria-modal query and editor-escape data attribute are hacks and undiscoverable — design preference with no failing path; any open modal owns focus and restoration, and Dialog tests cover the layered Escape.
  - `[false]` `[reject]` Blind11, delayed-save history test lost its invalidation assertion — the replacement asserts not-yet-invalidated before completion and a second history request after it, which only an invalidate-and-refetch produces; the old scenario (navigation proceeds unguarded) no longer exists by design.
  - `[low]` `[reject]` Blind12, repeated toolbar markup without role=toolbar — a toolbar role and mapped config are nice-to-have; names and aria-pressed are present and tested.
  - `[false]` `[reject]` Blind13, navigation tests are long, repetitive and mutate router state — style; no named divergence or failure, and the router update is test-local.
  - `[false]` `[reject]` Edge1, blocked navigation hangs on unmount — carried: Blind1 row.
  - `[false]` `[reject]` Edge2, close() after lifecycle uses stale search — carried: prior Blind4 row.
  - `[low]` `[reject]` Edge3, lifecycle finishing while preview suspends leaves the modal open on a removed Card — needs preview to arrive in the milliseconds between lifecycle confirm and response; the user can still close it, and the fix adds deferral state.
  - `[false]` `[reject]` Edge4, Save offered after Delete with a draft typed in flight — carried: prior Blind3 row; the top lifecycle Dialog contains input while the request runs, so no typing path exists.
  - `[false]` `[reject]` Edge5, confirmation state while card is null — retainedCard keeps the Card for its routed id, and a different id is blocked while dirty.
  - `[low]` `[reject]` Edge6, Escape during IME composition moves focus to the heading — Dialog Escape handling already ignored composition at baseline for close; the fix is an extra guard for a rare input path.
  - `[low]` `[reject]` Edge7, RootLayout skips heading focus while any modal is open and never retries — opener/board restoration is Dialog's job on close; no failing path shown.
  - `[maybe-false]` `[defer]` Edge8, single ignoreNextPop boolean with queued pops — carried to the existing deferred row on rapid native gestures (medium, unverified); no new deferral added.
  - `[maybe-false]` `[defer]` Edge9, out-of-range go(delta) leaves ignoreNextPop set — recorded as a new medium unverified deferral; a native truncated-history run would settle it.
  - `[false]` `[reject]` Edge10, sameEditor admits other same-param routes outside the shell — every route under the story map is a child of the shell route that owns the modal, so none unmounts it.
  - `[false]` `[reject]` Edge11, stale search overwrites query during lifecycle close — carried: prior Blind4 row.
  - `[medium]` `[patch]` Verification1, no test pins the confirmation after Save-and-close settles during suspension — accepted filed evidence; shell test now asserts no alertdialog after the save settles and after preview exit. Same group as Blind8.
  - `[low]` `[reject]` Verification other, lockfile deprecated-URL churn — duplicate of Blind4.
  - `[false]` `[reject]` Verification other, LifecycleDialog completeIntent frozen — duplicate of Blind7.
  - `[false]` `[reject]` Intent1, Markdown persistence and Issue-plan row not touched by the diff — carried: prior Intent3 row; the unchanged server fixture ran and passes in this pass.
  - `[false]` `[reject]` Intent2, clean close then Back/Forward and missing-Card rows not isolated in the diff — those paths are unchanged by this diff; the intent asks only to preserve them.
  - `[false]` `[reject]` Intent3, expectations are browser-level while tests are jsdom — carried: prior Intent1/2 rows; no native-accessibility claim is made.
  - `[false]` `[reject]` Intent4, patched history library is an extra surface reached only via jsdom — carried: prior Intent2 row; documented in the Spec Change Log with the unverified native residual deferred.

One patch group (2 medium rows): clear closeConfirm on settled Save-and-close under preview suspension, with shell test assertions for no alertdialog. One new medium unverified deferral; 25 rejections (including carried rows). The frozen intent contract is unchanged.

## Auto Run Result

Status: done

- Summary: Card detail modal guards abandoning navigation (Save/Discard/Cancel) via useBlocker, gives the Description editor accessible names/pressed state with a first-Escape handoff, and carries a minimal @tanstack/history patch so cancelled Back/Forward restores the exact entry. This follow-up pass found one real defect and fixed it: a Save-and-close that settled during preview suspension left the Unsaved changes confirmation open.
- Files changed (follow-up pass): `apps/web/src/features/story-map/components/CardDetailModal.tsx` (clear closeConfirm on settled Save-and-close even when suspended), `apps/web/src/features/changesets/shell.test.tsx` (assert no alertdialog after the save settles and after preview exit). Earlier passes: Dialog/DescriptionEditor/LifecycleDialog/RootLayout, strings and styles, navigation and root-focus tests, history patch and lock/checkout fixture.
- Review findings: patches applied 1 group (2 medium rows); deferred 1 new (medium unverified, history go(delta) range) plus 1 carried; rejected 25, each with its reason in the triage log.
- Follow-up review recommended: false. This follow-up pass patched no high.
- Verification: `corepack pnpm --filter @storymapper/web test` 67 files / 550 tests pass; `corepack pnpm --filter @storymapper/server exec vitest run src/http/routes/card-markdown.test.ts` 1 test passes; `node scripts/verify.mjs` completed (typecheck and build); web typecheck passes; Node 24.17.0. The extended shell test failed before the fix and passes after.
- Residual risks: native browser, rapid-gesture and screen-reader behavior remain unobserved (jsdom evidence only); two medium unverified history-patch deferrals; Discard in a confirmation that was already open when preview arrived dismisses it without discarding the draft (low, not patched).
- Finalization: the spec's no-commit boundary and the orchestrator-owned dirty files (`sprint-status.yaml`, `deferred-work.md`) apply, so this pass stages its changes and does not commit; the working copy is not clean by design.
