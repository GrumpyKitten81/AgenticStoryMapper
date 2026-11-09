---
title: Search, filter and bulk actions
type: feature
created: 2026-10-17
status: done
baseline_revision: fc83dba806dcde4fed9b8552a7f939ba20060774
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-preparation.md'
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-6-4-search-filter-and-bulk-actions.md'
warnings: [oversized]
deferred:
  - summary: >-
      Final native layout/focus/accessibility and a native planned selected-GitHub flow remain unverified.
    evidence: |-
      Earlier Safari native AX and screenshot checks confirmed retained hidden selection, full-set Delete confirmation/Cancel, accessible filter names and excluded Notes with GitHub disabled. They exposed hidden-attribute CSS and toolbar clipping/focus defects, repaired with executed stylesheet/DOM/focus tests. Final pressKey and getApp both returned cgWindowNotFound (-10005), preventing final-build native recheck or owned-tab cleanup. A controlled final native check of keyboard/focus/layout and planned selected scope would settle this boundary; no full WCAG, screen-reader or live GitHub write acceptance is claimed.
    location: >-
      BoardToolbar, DeleteCardsDialog, GitHubSyncPanel and global.css
    severity: medium (unverified)
---

Reproducing statement: Implement Story 6.4 with bmad-build-auto and independent verification; never write or revert orchestrator-owned sprint-status.yaml or infer verification from its rows. Date: 2026-10-17. Version: 2. Changelog: Implemented, independently reviewed, repaired and verified; native final-build limits recorded.

<intent-contract>

## Intent

**Problem:** Cached-map filters omit color/current remote links, filtering loses selected Cards, and bulk controls lack complete accessible Delete and selected-set GitHub handoff.

**Approach:** Complete cached predicates and separate matches, context visibility and retained selection. Reuse atomic local commands and shared Delete confirmation; hand explicit selection to the existing GitHub Dry Run and separate human-confirmed push.

## Boundaries & Constraints

**Always:** Preserve hierarchy-context ancestors without counting/selecting them implicitly, current priority subtree semantics, arbitrary persisted category/status values, zero estimates, legal Notes, provenance, root versions, transactional history/Activity, live holds, Restore epochs, focus, preview read-only behavior and ChangeSet-first nonhuman writes. Prune deleted/inaccessible targets and reset selection on map change; filtering alone retains selection. Name controls from English strings. Validate all target versions before local writes and show every conflict.

**Never:** Write, stage or revert sprint-status.yaml, deferred-work.md or orchestrator state; infer verification from bookkeeping. No individual-delete loops, second Delete command, server search, automatic GitHub writes, new services or later-story redesign. No user Project data or real GitHub mutation. No commits or pushes. Do not claim native accessibility from DOM tests. Performance is diagnostic under accepted 9C, with no timing gate.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Search and conjunction | Title/description/chunk/note/GitHub Source Link/legacy GitHub/current remote URL or identity; combined Persona/status/Release/Annotation/color/estimate/priority/Sync State/source presence | True matches plus necessary context ancestors; accurate direct match count; zero estimated | Show empty results normally |
| Literal values | Persisted status all; IDs all/none/unscheduled; Release __none; custom color | Exact value selectable independently of reserved options; no remapping | No silent sentinel collision |
| Retained selection | Select multiple then hide some/all with filters | Accessible visible/hidden counts and full target count; patch/Archive/Delete and tile Delete target complete retained set | Explicit clear deselects |
| Scope lifecycle | Snapshot deletes/parks/archives or makes selected Card inaccessible; map changes; preview | Ineligible IDs cease to target; map change resets; preview cannot mutate | No stale or cross-map request |
| Local changes | Retained selected set with Release/status/Persona/Annotation/color updates or Archive | One atomic versioned command over explicit targets; Archive separate from Delete | Invalid numeric input visibly refused, no partial dispatch |
| Delete | Overlapping ancestor/child selected; unselected descendants | Shared confirmation names complete targets and affected subtree; explicit existing child strategy; cancel no write; accepted command normalizes once | Full typed conflicts, intent retained |
| Conflicts and failure | Two stale selected or affected roots, injected storage failure | Zero partial domain/history/Activity writes, every conflict listed | Visible actionable error; no silent rebase/retry |
| Selected GitHub | Hidden selection including Notes/non-Stories, zero eligible, more than eight eligible Stories | Complete explicit scope visible; Notes excluded; only eligible selected Stories planned; reviewed push plan and separate human action required | Never widen empty set to all; scope/connection/Release/plan-mode changes invalidate approval; no push from import plan |
| Accessibility | Search/filter/select/bulk controls and checkbox | Names on all inputs/selects/checkboxes; tile Select K-12, title; match and selection status; labelled bulk region before board | Pending guards prevent duplicate actions |

</intent-contract>

## Code Map

- `apps/web/src/features/story-map/useStoryMapBoardState.ts`: BoardFilters/defaults; sourceSearchTextByCardId already covers source kinds; filterStoryMap separates matchingCardIds/visibleCardIds. Add remoteWorkItemLinks/color, safe exact-value representation. selectedVisibleIds is only rendering intersection; pruning effect currently loses hidden selection, runBulkUpdate targets intersection. Expose full eligible selection, reset by map, guard preview and surface validation/conflicts. Reuse useLatestVersions and current mutations; preserve captured Delete versions.
- `apps/web/src/features/story-map/components/BoardToolbar.tsx`: unnamed filters/bulk selects, nonlive match span, bulk div Apply/Archive/Clear. Add labels/status/count/region/full-set Delete and explicit GitHub handoff. Central categories in `card-visual-options.ts`; strings `packages/ui-strings/src/story-map.ts` and panel strings.
- `components/CardTile.tsx`: selection checkbox has only key name. `DiscoveryMatrix.tsx:103`: keyboard Delete chooses selectedVisibleIds; use full retained target set. Other views use selectedVisibleIds for rendering; preserve their interface or update mocks coherently.
- `components/DeleteCardsDialog.tsx`: existing shared typed selected-set confirmation, captured baselines, external affected owners, all-conflict list; use it rather than LifecycleDialog/new backend. Require explicit child choice when children affected. `components/Dialog.tsx`: shared containment/restoration/live hold.
- `apps/web/src/features/github-sync/GitHubSyncPanel.tsx`: operationDraft.cardIds defaults empty/all; selectedCardIds converts empty to undefined; plan retained across scope changes; Push reads current draft and any plan enables it. Optional explicit selection prop in shared Dialog is a minimal handoff avoiding URL schema changes. Bind push to reviewed push scope; explicit empty cannot widen. Existing list/plan truncates to eight; complete selected scope must remain reviewable. Preserve connection/privacy/read-only checks and confirmation. `app/routes/story-map.github.tsx` currently forwards snapshot only.
- Backend reuse/read-only unless investigation proves a story defect: `packages/contracts/src/api/card-customization.ts`; `apps/server/src/application/card/card.use-cases.ts:95` and `application/base-versions.ts`; repositories in `packages/db`; public PATCH `/api/cards/bulk` and POST `/api/cards/delete-set` already exist. Archive is patch status archived. No public command/parity addition expected.
- Coverage: `components/lifecycle.test.tsx`, `views/DiscoveryView.test.tsx`, `features/github-sync/github-visibility.test.tsx`; new focused filter/selected-sync suites if needed to keep files below limits. Server `http/routes/base-version-conflicts.test.ts`, `http/routes/delete-cards.test.ts`; DB unit-of-work/root versions. Graph CLI search succeeded but spans are stale; parent and two agents verified source. Previous Story6.3 done spec preserves selected Delete/Move/focus contract; native browser limitations remain unverified.

## Tasks & Acceptance

**Execution:**
- [x] Hook/filter helper and BoardToolbar: implement complete combined predicates/color/current-link evidence and exact option values, retaining matches/context separation.
- [x] Hook/CardTile/DiscoveryMatrix/Toolbar: retain full selection through filters, prune/reset scopes, name controls/status/bulk region, target full set for patch/Archive and Delete; preserve preview safeguards and show all errors.
- [x] Toolbar/shared DeleteCardsDialog: wire complete retained-set confirmation with explicit child strategy and pending safeguards; reuse existing atomic command.
- [x] GitHubSyncPanel/Toolbar/Dialog/strings: explicit selected-set handoff, full scope review, immutable reviewed push scope and invalidation on changes; disable zero eligible selection, retain privacy and human confirmation.
- [x] Focused DOM/filter/GitHub/server/DB suites: cover every matrix row including all stale conflicts/no side effects, overlapping Delete, literal sentinels, hidden targets and empty scope. Use existing synthetic test fixture patterns, no real user data. Record all raw 1,000-Card search/filter input-to-result samples with fixture/environment/boundary/cold-warm context and diagnostic 300ms reference.

**Acceptance Criteria:**
- Given actual board controls, when required predicates are combined, then direct matches/count are correct and only matches plus necessary ancestors render.
- Given retained hidden selected Cards, when any bulk action or tile selected-set Delete runs, then the displayed full target set is used and inaccessible/deleted Cards are excluded.
- Given stale target baselines, when local bulk patch/Delete executes, then all conflicts display and no partial state/history/event commits.
- Given destructive or remote intent, when invoked, then explicit shared Delete confirmation or reviewed selected-set Dry Run followed by separate human push precedes effects.
- Given 1,000 fixture Cards, when search/filter controls run, then raw diagnostic samples are recorded without introducing timing acceptance gates.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass 1

- verdicts: 20 findings — high 2, medium 10, low 2, false 4, maybe-false 2
- findings:
  - `[high]` `[patch]` B1 duplicate reviewed Push — pushReviewedPlan only checks render-time busy; two same-turn clicks enter the same confirmed request. Server prepares initial links before awaiting auth/provider, so duplicate remote creation is possible. Group G1: synchronous submit guard and delayed-request test requested.
  - `[medium]` `[patch]` B2 Sync overlaps reviewed operations — busy excludes syncWorkItems.isPending while the Sync button uses busy; normal pending Sync therefore leaves Sync/Plan/Push callable. G2: include that existing pending state and exercise overlap.
  - `[medium]` `[patch]` B3 success clears unrelated newly selected IDs — Bulk onSuccess unconditionally clears the Set; Card checkboxes are outside disabled bulk fieldset. G3: remove only submitted IDs and test delayed completion.
  - `[medium]` `[patch]` B4 bulk success loses keyboard focus — Clearing the last selected IDs unmounts the Apply/Archive button; no recovery exists. G4: recover only if the submitted focused control disappears; test user-moved focus preservation.
  - `[medium]` `[patch]` B5 Windows timing output path — Timing test writes directly to /tmp, which need not exist on Windows. G5: node:os tmpdir plus path join; no new configuration.
  - `[low]` `[patch]` B6 selected Sync State is inert — Explicit mode omits healthLinks output but retains the selector that only filters it. G6: omit that control in explicit mode.
  - `[medium]` `[patch]` B7 stale bulk conflict display — Mutation error survives clear-selection and appears when an unrelated selection remounts the region. G7: clear or scope errors to submitted target set with a regression.
  - `[medium]` `[patch]` B8 toolbar-to-panel integration gap — Confirmed null panel mock in board-filter-selection; standalone panel tests supply IDs directly. G8: real toolbar/panel integration over selected visible/hidden/Note and unselected Story.
  - `[false]` `[reject]` B9 interim follow-up metadata — Spec is in-review; false/empty are template defaults before Finalize, not a completed result. Finalize will record the native limit. Workflow explicitly rejects findings whose fix is to edit this spec.
  - `[medium]` `[patch]` B10 selected dialog changes map defaults — Use as default remains active in explicit mode and calls updateStoryMap, an unrelated persistent effect from selected Dry Run. G6: conditionally omit in explicit mode, retain full-panel behavior.
  - `[high]` `[patch]` E1 same-turn Push dispatch — Same demonstrated root as B1; busy is render-time only and pushReviewedPlan has no synchronous guard. G1.
  - `[medium]` `[patch]` V1 actual handoff not protected — Pre-verified gap: removing selectedCardIds from Toolbar still passes null-panel and standalone tests, widening real flow to whole-map mode. G8 integration regression requested.
  - `[medium]` `[patch]` V2 unavailable captured Delete target not tested — Pre-verified gap: no test refreshes an open same-map dialog to make captured target ineligible. G9: archive/remove snapshot target, assert alert/disabled/no request.
  - `[false]` `[reject]` I1 board tests span different surfaces — Descriptive difference, not a demonstrated defect: lifecycle tests mount actual Discovery and Delete; native observed two hidden selected Cards and full confirmation. Direct-hook tests supplement those executed surfaces.
  - `[medium]` `[patch]` I2 diagnostic fixture excludes board rendering — Existing timing capture explicitly mounts only toolbar/hook, omitting rendered Card updates in the stated 1000-Card diagnostic. G10: add actual Discovery+Toolbar DOM capture; preserve old raw samples and no native paint or timing pass claim.
  - `[maybe-false]` `[defer]` I3 final native accessibility/layout limit — Final native pressKey and getApp both returned cgWindowNotFound. DOM/string/CSS/focus tests pass; actual final-build native layout/focus, zoom/forced colors/screen reader would settle remaining presentation risk. If true medium; unverified.
  - `[maybe-false]` `[defer]` I4 native planned GitHub write not exercised — Native run used GitHubOff; mocked API tests exercise reviewed scope without live remote writes. A controlled native planned-flow check with isolated provider would settle UI/provider interaction; no live-write pass claimed. Same unavailable-native evidence group as I3, medium if true.
  - `[false]` `[reject]` I5 complementary atomicity surfaces — No incorrect atomicity claim: actual TCP all-stale/overlap/persistence and server injected-failure history/Activity/live assertions establish backend effects; DOM verifies construction/errors. No full successful browser-to-DB transaction was claimed.
  - `[false]` `[reject]` I6 evidence cannot establish every workflow duty — Descriptive epistemic limit during in-review execution, no violated concrete duty identified. Workflow invocation/render/delegation/verification are observed tool actions; status rows were neither touched nor used as proof.
  - `[low]` `[patch]` P1 selected-flow hint describes absent picker — Parent source verification: explicit mode still says tick Cards above and leave empty for all, although picker omitted and explicit-empty cannot widen. G6: accurate selected-mode copy, full-panel copy preserved.

### 2026-10-17 — Review pass 2 (follow-up)

- verdicts: 44 findings — high 0, medium 7, low 28, false 8, maybe-false 1
- findings:
  - `[low]` `[reject]` BH push not bound to reviewed plan server-side — pre-existing server contract (baseline push also replayed cardIds); client scopeKey includes every Card version so local change invalidates review; fix needs a server contract change.
  - `[low]` `[patch]` BH shared guard omits Import and Pull all — verified: both buttons ran beside Plan/Push/Sync. Group P2: both pending states join busy; Import and Pull all disabled by busy.
  - `[low]` `[reject]` BH render-phase ref mutation and duplicated scope-key expression — idempotent under double render, expressions identical; refactor only.
  - `[false]` `[reject]` BH scope key over-invalidates import preview — re-previewing costs one click and the intent invalidates on Release/scope/plan-mode change.
  - `[medium]` `[patch]` BH non-selected panel always sends explicit Story ids — verified: baseline sent cardIds undefined (all non-Note visible Cards server-side, all links for Sync); panel now narrowed to visible Stories. Group P1: whole-map default restored when nothing is ticked and not explicit; ticked ids still sent exactly.
  - `[low]` `[reject]` BH unbounded pick/plan lists after removing slice(0, 8) — intent requires the complete scope and plan to be reviewable.
  - `[low]` `[reject]` BH filter selects named by their All option — a name exists on each control; fixing needs new per-field strings across the toolbar.
  - `[medium]` `[patch]` BH focus lost after failed bulk action — verified: bulk fieldset is disabled while pending, so a failed Apply/Archive leaves the control focus-less (G4 handled only unmount). Group P3.
  - `[false]` `[reject]` BH Apply/Archive on hidden Cards without confirmation — the intent requires patch/Archive to target the complete retained set with visible hidden count and target list.
  - `[false]` `[reject]` BH filter encoding inconsistent/fallback — filters always encode selected values; reserved words are compared before decode, and bulk selects carry no reserved collisions with generated ids.
  - `[low]` `[reject]` BH BoardToolbar overloaded — design preference with no concrete diverging caller.
  - `[low]` `[reject]` BH multiple role=status regions — intent requires match and selection status.
  - `[low]` `[reject]` BH Delete confirmation disabled without hint when strategy unchosen — explicit child radios are visible beside the disabled action.
  - `[low]` `[reject]` BH timing tests write tmpdir files and use cwd for stylesheet — diagnostic evidence by design; tmpdir already platform-safe.
  - `[maybe-false]` `[defer]` BH global CSS has no visual check — `carried` with the native layout deferral already recorded; a controlled native check settles it.
  - `[false]` `[reject]` BH bulk ids not checked against storyMapId — cards-repository.ts bulkUpdateCards already throws for Cards of another map.
  - `[low]` `[reject]` EH stale filter when option disappears — pre-existing select pattern, rare.
  - `[low]` `[reject]` EH filters/bulkPatch persist across maps — pre-existing; intent resets selection only.
  - `[low]` `[reject]` EH empty bulk patch silently ignored — pre-existing at baseline (Object.keys(patch) return).
  - `[low]` `[reject]` EH conflict does not refresh snapshot — pre-existing shared conflict handling.
  - `[low]` `[reject]` EH bulk baseline resolved at click time — pre-existing useLatestVersions mechanism the spec says to reuse.
  - `[low]` `[patch]` EH Import runs beside other operations and without connector gate — same root as P2; busy guard applied; connector gating is pre-existing and server-enforced.
  - `[low]` `[reject]` EH reviewed push replays client request — duplicate of the server-binding finding.
  - `[low]` `[reject]` EH discarded in-flight plan gives no message — invalidation is required; message is nicety.
  - `[medium]` `[patch]` EH Sync/Pull narrowed to visible Stories — same root as P1.
  - `[low]` `[reject]` EH tombstoned remote links counted for Has GitHub — Sync State filter must include them; linked semantics ambiguous.
  - `[medium]` `[patch]` EH focus lost after failed action and stale ref — same root as P3.
  - `[low]` `[reject]` EH 1,000-Story render — duplicate of unbounded list finding.
  - `[false]` `[reject]` EH bulk error hidden when selection changes mid-flight — deliberate G7 scoping to the submitted target set.
  - `[low]` `[reject]` EH mid-write rollback test covers only one injection point — the transaction wrapper is shared and unchanged.
  - `[medium]` `[patch]` VG tile Delete over hidden retained selection not pinned — verified test cleared filters before tile Delete. Group P4: new test keeps the filter active.
  - `[medium]` `[patch]` VG non-explicit panel payloads unasserted — group P1: test asserts undefined and ticked ids for Plan, Push and Sync.
  - `[low]` `[patch]` VG Import unguarded — group P2.
  - `[low]` `[patch]` VG disabled bulk fieldset untested — group P3: test simulates the focus drop and asserts restoration; mutation-checked.
  - `[low]` `[reject]` VG timing tests assert nothing about timing — acceptance gate is explicitly excluded by the intent.
  - `[false]` `[reject]` IA readings differ on server versus client surface — descriptive; atomicity expectations are exercised at server HTTP surface, UI at DOM.
  - `[false]` `[reject]` IA predicate lives in web, not core — descriptive; intent says cached-map filters.
  - `[false]` `[reject]` IA literal encoding is UI-level — descriptive; no collision demonstrated.
  - `[low]` `[reject]` IA parked case untested — parked Cards are excluded by visibleCards like archived ones.
  - `[low]` `[reject]` IA approval invalidation is client-only — duplicate of server-binding finding.
  - `[medium]` `[patch]` IA non-selected panel behavior changed — same root as P1.
  - `[low]` `[reject]` IA static accessible names — duplicate of All-option naming finding.
  - `[low]` `[reject]` IA role=status forced lifecycle test selector edits — duplicate of live-region finding.
  - `[low]` `[reject]` IA server tests only pin existing behavior — intended regression coverage; no server source defect shown.

## Design Notes

Full retained selection is distinct from its rendered intersection. Context ancestors never become automatic targets. Existing priority inheritance and non-cascading Delete are preserved. Use optional explicit selected IDs on the existing GitHub panel in a shared Dialog; freezing the handoff set makes hidden selection reviewable without global URL/store state. Implementation may delegate disjoint work and must wait for it before validation.

## Verification

Use Node24.17.0 first on PATH; serialize tests/build. Save sanitized evidence under `evidence/story-6-4/` beside this spec.

- `corepack pnpm --filter @storymapper/web test` — executed DOM/filter/selection/GitHub controls pass, nonzero tests.
- `corepack pnpm --filter @storymapper/server test` — real HTTP/MCP bulk/Delete all-conflict and rollback regressions pass.
- `corepack pnpm --filter @storymapper/db test` — atomic persistence/version regressions pass.
- `node scripts/verify.mjs` — hygiene/typecheck/parity/build pass.
- `git diff --check` — clean whitespace.

Run isolated actual HTTP selected patch/Archive/Delete conflicts and persistence/reopen checks. Attempt native browser controls/keyboard inspection if available, record exact limitations separately. Diagnostic DOM input-to-result measurements must be labelled jsdom if used; they do not prove native paint timing or WCAG/screen-reader behavior. No new browser-runner dependency.

## Patch Outcomes

All ten review groups were applied and passed the final parent suites:

- G1: shared synchronous Plan/Push/Sync guard and delayed double-Push test prevent duplicate confirmed requests.
- G2: Sync pending state participates in shared busy/guard; overlap test verifies no concurrent Plan/Push dispatch.
- G3: successful local bulk changes remove only submitted IDs, preserving newly added selections.
- G4: disappearing submitted controls restore Search only when focus fell to body; independently moved focus survives.
- G5: diagnostic files use the platform temporary directory and unique names.
- G6: explicit selected GitHub mode omits health selector/default-map mutation/broad operations and describes its actual scope.
- G7: old mutation/validation errors reset or remain scoped to submitted IDs.
- G8: real Router/hook/Toolbar/panel integration checks selected visible and hidden Stories, excluded Note, absent unselected Story, exact plan/map and Project-scoped queries.
- G9: same-map archive/remove while Delete is open produces unavailable alert, disabled confirmation and zero Delete requests.
- G10: legal1Activity+1Step+998Stories renders all1000tiles and records complete Discovery DOM diagnostics. Older proxy captures remain labelled and preserved.

## Pass 2 Patch Outcomes

- P1: non-selected GitHub panel again sends cardIds undefined when nothing is ticked (whole-map Plan, Push, Sync); ticked Stories still sent exactly; explicit selected mode unchanged and an explicit empty set still cannot widen.
- P2: Import and Pull all join the shared busy guard.
- P3: bulk Apply/Archive restore focus to the submitted control when pending settles and focus fell to the body.
- P4: tile Delete test retains a hidden selected Card behind an active filter.

## Auto Run Result

Status: done

Summary: Story 6.4 follow-up review pass. Cached-board filters, retained selection, bulk actions, shared Delete and selected-set GitHub handoff were re-reviewed by four independent layers; seven medium and four low findings were patched in four groups, the rest rejected with recorded reasons.

Files changed in this pass:
- `apps/web/src/features/github-sync/GitHubSyncPanel.tsx`: whole-map default restored, Import/Pull all guarded.
- `apps/web/src/features/story-map/components/BoardToolbar.tsx`: focus restoration after a settled bulk action.
- `apps/web/src/features/github-sync/github-selection.test.tsx`, `apps/web/src/features/story-map/board-filter-selection.test.tsx`, `apps/web/src/features/story-map/components/lifecycle.test.tsx`: regressions for the patches.

Review findings: 44 (high 0, medium 7, low 28, false 8, maybe-false 1). Patched medium 7 and low 4 across groups P1-P4; deferred 1 carried (native layout/focus, already in `deferred`); all other findings rejected as recorded in the triage log.

Follow-up review recommendation: false — no high finding was patched in this follow-up pass.

Verification: web tests 450 passed (60 files); web typecheck clean; `node scripts/verify.mjs` completed (hygiene, typecheck, build); focus patch mutation-checked (test fails without it). Server and DB suites unchanged by this pass and not re-run. Final native browser check remains unverified (see `deferred`).

Residual risks: native layout/focus/accessibility and a native planned selected-GitHub flow are unverified; server still re-plans from cardIds at push rather than binding to the reviewed plan (pre-existing).

Version control: changes remain uncommitted in the working tree; the intent contract forbids commits and the orchestrator owns commits and the orchestrator-dirty deferred-work.md and sprint-status.yaml, which were not touched.
