---
title: Move Cards by mouse, keyboard or form
type: feature
created: 2026-10-17
status: done
baseline_revision: 55e01be31c9eb0852ef04ac2f6313bce0650e89e
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-6-3-move-cards-by-mouse-keyboard-or-form.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      Native browser pointer/form equivalence, Tab order and assistive presentation remain unverified.
    evidence: |-
      Safari selection returned cgWindowNotFound (-10005); iab creation returned Browser is not available: iab. Real jsdom pointer/form/focus tests and actual TCP persistence/reopen pass, but cannot establish native screen-reader or browser acceptance.
    location: >-
      DiscoveryMatrix, MoveAreaDialog, DeleteCardsDialog and other move surfaces
    severity: medium (unverified)
  - summary: >-
      Arbitrary mixed create/move/selected-delete ChangeSet conflict-list completeness has not been independently exercised.
    evidence: |-
      Single-command complete conflict sets, selected cleanup, aliases and deferred Apply are tested. The initial conflict collector computes effects from the persisted snapshot while resolution sees preceding operations. A composite changing existing affected roots would settle aggregate all-conflict completeness; atomic resolution refusal remains checked.
    location: >-
      packages/core/src/changesets/operation-conflicts.ts
    severity: medium (unverified)
  - summary: >-
      Composer, Release and update mutations carry no preview guard, now that preview also reaches Discovery.
    evidence: |-
      useStoryMapBoardState guards only moveCard and deleteCards with the read-only preview error; createCard, updateCard, createRelease and the other mutations never had one in any view. Whether the preview board hides those controls was not checked.
    location: >-
      apps/web/src/features/story-map/useStoryMapBoardState.ts
    severity: medium (unverified)
  - summary: >-
      Planning pointer-drag baseline forwarding and Backlog preview gating have no executed test.
    evidence: |-
      A real-pointer Backlog test now proves the drag-start baseline survives a snapshot advance, and Slices has the same. A Planning equivalent could not be driven in jsdom because the cell droppables need layout the mocks did not supply. SwimlaneGrid passes the same shared hook value.
    location: >-
      SwimlaneGrid.tsx, BacklogList.tsx
    severity: medium (unverified)
---

Reproducing statement: Implement Story 6.3 using bmad-build-auto, preserving orchestrator ownership of sprint-status.yaml. Date: 2026-10-17. Version: 1. Changelog: Initial source-investigated implementation plan.

<intent-contract>

## Intent

**Problem:** Pointer moves lack equivalent complete forms, and Discovery lacks its specified keyboard traversal and focus continuity. Delete on a selected tile needs a shared atomic selected-set command.

**Approach:** Route pointer and complete keyboard-accessible Move forms through the existing versioned move use case; implement the Discovery key table and stable focus. Supply atomic selected-set Delete with explicit child strategy and full version validation.

## Boundaries & Constraints

**Always:** Preserve legal hierarchy, provenance, actor attribution, transactional history/Activity/live publication, Restore epochs, dirty drafts, preview read-only behavior, own-write versions and ChangeSet-first nonhuman writes. Static UI copy comes from English string modules. Delete removes explicit targets only; existing child strategies rehome survivors. Normalize overlapping selections once, exclude selected recipients, and check all selected/affected root baselines before writes, including deferred ChangeSet Apply. Park/unpark remain separate lifecycle commands.

**Never:** Write, stage or revert sprint-status.yaml, deferred-work.md or orchestration state. Infer verification from sprint bookkeeping. Loop client HTTP deletes, silently refresh stale baselines, use global single-key shortcuts, add keyboard drag, cascade-delete unselected descendants, change hierarchy rules or implement later-story hidden-selection/filter/view redesign. No user Projects, live GitHub writes, new services, commits or pushes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Equivalent move | Legal reorder/reparent/Release change via pointer or keyboard/form | Same authoritative parent, sibling order, Release, root version and Activity; moved tile regains focus | Surface mutation errors |
| Illegal move | Story under Activity; Step under Step | No state/history mutation | Visible hierarchy reason |
| Stale move | Second client baseline predates accepted move | Preserve current server state and local intent | Visible 409 conflict; no automatic latest-version retry |
| Atomic Delete | Focused tile selected, or unselected | Confirm full selected set, or focused tile alone, with child strategy; each explicit target deleted once; survivors rehomed | Cancel performs no write |
| Delete conflict/rollback | Multiple stale targets or affected child/dependency/evidence roots; missing/foreign scope; injected persistence failure | No partial cards/history/Activity/live effects; report all version conflicts | Typed refusal, retained confirmation intent |
| Overlapping Delete | Ancestor/descendant and adjacent selected siblings | Original full selection normalized once; no selected child recipient; unselected descendants survive by chosen existing strategy | Invalid strategy refused atomically |
| Scoped keys | Primary tile versus nested editor/control | Only primary runs traversal/m/Space/Delete; nested controls type normally; Escape returns to active tile | No unintended writes |
| Focus changes | Move/park/delete/filter/collapse/refetch; hidden retained DOM | Same visible id, else next surviving prior-order sibling, else previous, else grid; one result announcement | Incoming focused-card changes held until focus leaves |

</intent-contract>

## Code Map

- `apps/web/src/features/story-map/components/DiscoveryMatrix.tsx`: Activity/Step/Release/Not assigned rows, retained hidden DOM, lifecycle dialogs and pointer targets; no active-id/key model. `DiscoveryLanes.tsx`: ReleaseSection/DraggableCardTile/DroppableCell/NotAssignedLane; collapsed cells hidden. Derive visible lane/column/stack order from these projections.
- `components/CardTile.tsx`: primary `data-card-id`, article `data-live-card-id`; secondary controls precede/follow primary and all tab. Add optional Discovery focus integration, explicit key/role/title name and state descriptions; preserve markers/choices/units.
- `components/MoveAreaDialog.tsx`: currently only Story areas, Unscheduled uses update rather than move. `useStoryMapBoardState.ts:154`: move mutation resolves latest snapshot at execution; support captured move-intent baseVersion without adopting later remote versions. `app/api.ts`: shared HTTP client.
- `components/BacklogList.tsx`, `SwimlaneGrid.tsx`, `views/SlicesView.tsx`, `components/StorySliceMove.tsx`: default DndContext sensors and incomplete/missing form moves. Explicit pointer-only sensors and complete shared form access, preserve previews/live drag.
- `components/LifecycleDialog.tsx`: existing child strategy/least-destructive confirmation. `components/Dialog.tsx`: restores opener/same tile/board in microtask; coordinate sibling repair. `app/live/live-interaction-store.ts`: already holds focused tiles/dialogs/popovers/drag. Reuse, avoid a second global manager.
- `packages/contracts/src/api/card-customization.ts`, `api/commands.ts`, `mcp/tool-inputs.ts`, `mcp/tools.ts`: authoritative typed command and response schemas.
- `apps/server/src/application/card/card.use-cases.ts`: actor-aware move/delete/bulk mutation; `http/routes/card-routes.ts`, `mcp/tools/register-card-tools.ts`: thin adapters. `application/changeset/changeset-command.ts`, `changeset-executor.ts`: existing atomic Apply/nonhuman proposal pipeline.
- `packages/core/src/changesets/card-command-resolution.ts`: resolveDeletion/rehomeChildren/deleteCardRows; `child-placement.ts`: existing pure child rules; `operation-conflicts.ts`: root conflicts, currently lacks affected-delete baselines; `operation-registry.ts`, `operation-dependencies.ts`: registry/ownership. Reuse delete operation where feasible; persisted proposal must retain affected baselines and full selection semantics.
- `packages/db/src/repositories/cards-repository.ts:218,278`: explicit-root deletion and child rehome; unassign flattens descendants, reassign direct children to adjacent visible same-level sibling. `card-dependencies-repository.ts`: incoming owners; evidence deletion can advance shared owners. Root version tracking deduplicates increments per transaction. All DB access remains repository-owned.
- Parity: `scripts/capability-operation-coverage.mjs`, `scripts/mcp-tool-metadata.json`; generated manifest, `packages/mcp/src/tool-definitions/capabilities.ts`, `docs/mcp-tools.md` via existing generator.
- Tests: `views/DiscoveryView.test.tsx`, `components/lifecycle.test.tsx`, Dialog/live tests; core hierarchy/resolution/dependency-effect parity; DB root-versions/unit-of-work; server base-version-conflicts and MCP agent approval/surface tests. Graph tools unavailable; source inspected by parent and two investigation agents. Prior 6.2 done spec preserves identities, units, categories and notes; its native browser limitation remains.

## Tasks & Acceptance

**Execution:**
- [x] DiscoveryMatrix/DiscoveryLanes/CardTile and dedicated local traversal helper if needed: one visible active primary, lane/column/stack model, name/state, secondary tabbing after primary, scoped keys and stable identity recovery. Keep header/add controls ordinary Tab stops.
- [x] MoveAreaDialog/useStoryMapBoardState/api: full legal parent/position/Release form for every role using moveCard; capture baseline at dialog opening/drag start and retain drafts/conflicts. Preserve separate Activity Park.
- [x] BacklogList/SwimlaneGrid/SlicesView/DiscoveryMatrix: pointer-only sensors, equivalent generalized form for exposed moves and existing read-only/live holds. Preserve query invalidation.
- [x] Contracts/core/application/repository/adapters/parity paths above: implement typed atomic selected-set Delete. Compute normalized effects from original full set before writes; never rely on a naive deepest-first loop (it can rehome grandchildren differently). Validate map ownership and complete affected-root coverage, collect all conflicts, preserve baselines through deferred nonhuman approval/Apply. Reuse existing transaction/resolver mechanisms.
- [x] LifecycleDialog/Discovery/CardTile/English strings: reusable full-set confirmation, explicit targets/count/affected children/strategy, selected-set only when focused tile belongs to selection; one result announcement and predictable focus after refetch/dialog cleanup.
- [x] Extend meaningful tests in mapped suites for every matrix row including actual controls, hidden/collapsed/remounted focus, all keys, own vs remote versions, overlapping children, selected-neighbor strategies, all-conflict refusal, new affected root, nonhuman deferred Apply and injected rollback.

**Acceptance Criteria:**
- Given Discovery primary focus, when Left/Right are pressed, then move to previous/next column in the lane; Up/Down traverse the stack then previous/next visible lane; Home/End choose row ends, Ctrl+Home/End grid ends, PageUp/Down adjacent lane, skipping hidden/collapsed Cards.
- Given a primary tile, when Enter/Space/m/Delete are pressed, then open Card/toggle selection/open Move/open the correct full-scope confirmation; modified unrelated keys and nested controls never invoke tile shortcuts.
- Given the active tile, when Tab/Escape are used, then only its secondary controls enter sequential tab order after its primary and Escape returns to that tile; other tile primaries/controls have no extra grid tab stops.
- Given any exposed pointer move, when the equivalent form is operated with keyboard and committed, then authoritative state/audit matches; illegal/stale commands remain visible refusals and never silently retry.
- Given confirmed full-set deletion, when any selected/affected root is stale or invalid, then all changes abort with all conflicts; otherwise each target is deleted once and surviving children follow the chosen strategy, with equivalent human/approved nonhuman safety.
- Given local operations or visibility changes, when the projection settles, then focus and one announcement follow the matrix; incoming updates continue to hold focused Cards.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass 1

- verdicts: 22 findings — high 0, medium 15, low 0, false 4, maybe-false 3.
- The first review artifact accidentally omitted staged-only paths. It was replaced with the complete baseline-to-working-tree diff; all three initial reviewers superseded their partial reports before final triage. Four complete review lenses reported. The intent lens launched when the three-agent concurrency limit freed a slot.
- findings, in final-report arrival order:
  - `[medium]` `[patch]` Gap: pointer baseline drift lacked execution coverage — real Discovery and Slices pointer gestures now advance the snapshot mid-drag and assert the original outbound version; Discovery also checks inactive dragged-Card focus.
  - `[medium]` `[patch]` Gap: successful selected-set left reassignment unverified — HTTP regression now skips selected neighbors and checks surviving descendants after successful left reassignment.
  - `[medium]` `[patch]` Blind: selected ancestor cleanup invalidates selected dependent/evidence-owner ancestry — cleanup skips soon-deleted selected owners while retaining survivor cleanup; actual selected Activity/Step/Story dependency and evidence regression passes.
  - `[medium]` `[patch]` Blind: selected-delete local references were not normalized — one pure normalization helper now resolves map/selected/affected aliases in resolver, dependency graph and conflict collector; allocator and create-aliased-Cards/deferred Apply regressions pass.
  - `[medium]` `[patch]` Blind: gridcells lacked rows — existing Activity/Step/Release/Not assigned projections supply row containment without changing CSS grid layout; DOM containment assertions pass.
  - `[medium]` `[patch]` Blind: focused selection had no accessible state — Discovery gridcells expose aria-selected and Space-driven assertions pass.
  - `[medium]` `[patch]` Blind: disabled preview primaries prevented traversal — Discovery preview primaries remain focusable with aria-disabled; traversal works, activation/editor opening/mutations remain blocked. Editable modal inspection was not enabled.
  - `[false]` `[reject]` Blind: focus must prefer a same-parent previous sibling over the next prior-grid tile — EXPERIENCE specifies prior grid order; the accepted implementation treats grid tiles as peers in that flattened order. Source and refetch/removal tests implement same visible id, next prior-order survivor, previous, grid; no stricter parent grouping was required.
  - `[medium]` `[patch]` Blind: Move discarded typed hierarchy reasons — move failure handling preserves server refusal text and existing typed 409 handling; actual form test displays the reason.
  - `[medium]` `[patch]` Blind: Delete hid individual conflicts — confirmation lists every captured conflict identity and base/current versions or supplied reason, retaining the original retry envelope; multi-root rendering assertions pass.
  - `[medium]` `[patch]` Blind: arbitrary persisted positions could allocate huge dropdowns — options are bounded by legal insertion count, with explicit unavailable captured-position rendering/refusal; large-position test passes.
  - `[medium]` `[patch]` Blind: successful Move restored secondary opener — shared post-refetch animation-frame focus targets the moved primary after dialog cleanup; secondary-opener regression passes.
  - `[medium]` `[patch]` Blind: success announcement dereferenced a changed snapshot — validated destination names are captured in mutation context before sending, while saved key/position come from the authoritative result; delayed-response/refetch regression passes.
  - `[medium]` `[patch]` Edge: inactive pointer drag retained old active identity — drag start activates its Card and shared committed-move focus restores that primary; same repair group as successful-form focus.
  - `[false]` `[reject]` Edge: focus repair must stay within original parent — same prior-grid-order interpretation and source/tests refute the claimed contract deviation.
  - `[medium]` `[patch]` Edge: local aliases fail selected deletion — same normalized-reference repair as Blind; deferred Apply and dependency parity verified.
  - `[medium]` `[patch]` Edge: repeated equal-count deletes do not update live text — submission clears the notice before publishing each success; consecutive equal-count operation regression passes.
  - `[maybe-false]` `[defer]` Intent: native pointer/form equivalence is not directly observed — actual command/HTTP persistence and real jsdom pointer/form tests pass; native browser comparison requires an available browser surface.
  - `[maybe-false]` `[defer]` Intent: native Tab/activation/screen-reader behavior exceeds DOM evidence — rows, states, synthetic/native DOM event plumbing and focus are tested; browser/assistive-technology execution would settle the remaining boundary.
  - `[false]` `[reject]` Intent: selected-set confirmation/backend evidence are separate surfaces — this is a descriptive boundary, not a demonstrated defect; DOM command-envelope tests, HTTP/MCP rollback/Apply and actual TCP persistence/reopen checks provide complementary executed evidence.
  - `[maybe-false]` `[defer]` Intent: native acceptance is missing — confirmed tool limitation: Safari cgWindowNotFound (-10005), iab unavailable. Record unverified native interaction rather than a pass.
  - `[false]` `[reject]` Intent: bookkeeping cannot establish verification — the diff contains no sprint-status change and this run uses executed checks independently; this observation identifies no defect.

Grouped result: 13 medium repair groups, one shared native-interaction verification boundary represented by three deferred rows, and four rejected findings. An additional direct parent correction makes Move Cancel use the same busy guard as Escape; its targeted pending-close regression passes. No bad-spec or intent-gap loopback was needed.


### 2026-10-17 — Review pass 2 (follow-up)

- verdicts: 54 findings — high 0, medium 11, low 25, false 12, maybe-false 6.
- Four lenses reported against the complete baseline-to-working-tree diff (Blind 18, Edge 17, Verification gap 9, Intent 10). No row from pass 1 matched, so none is carried.
- findings, in layer order:
  - `[medium]` `[patch]` Blind: Delete dialog re-implements core recipient rules — `DeleteCardsDialog` now calls the exported core `selectedDeletionPlacement` for reassign options and labels; dialog tests pass.
  - `[false]` `[reject]` Blind: selection schema duplicated — the operation schema takes local references and the API schema takes UUIDs; they validate different inputs.
  - `[low]` `[reject]` Blind: `affectedCards` carries the whole map — bounded by Story Map size; no failure shown.
  - `[low]` `[reject]` Blind: missing-baseline refusal names no ids — the refusal is typed and retains intent; ids are not needed to retry.
  - `[false]` `[reject]` Blind: cross-map dependents unreachable — `mutateCardDependency` refuses dependencies across Story Maps (`card-dependencies-repository.ts:20`).
  - `[low]` `[reject]` Blind: fake operation and flag arguments in core — the fix is a refactor with no demonstrated defect.
  - `[low]` `[reject]` Blind: Activity logging mode switch and gaps — `deleteCard` logs only `card.deleted` and `card.rehomed` and no link activity, so the selected path matches it.
  - `[false]` `[reject]` Blind: silent skip of `affectedCards` in `project-scopes.ts` — authorization comes from `cards`; affected ids only supply baselines, and an unresolved required id still hits the missing-baseline refusal.
  - `[low]` `[patch]` Blind: "Delete 1 Cards" grammar — title, question and result strings now singularize; tests updated. The quadratic child lookup is not worth changing.
  - `[low]` `[reject]` Blind: Dialog fails closed without retry — closing and reopening re-runs the capture; failing closed is the intended fail-fast behavior.
  - `[false]` `[reject]` Blind: heading navigation lost in `CardTile` — the title already sat inside a button, whose children are presentational; the other claims are pre-existing markup or cost.
  - `[maybe-false]` `[defer]` Blind: grid roles over `display: contents` rows — native browser and assistive-technology output would settle it; covered by the existing native-verification deferral.
  - `[low]` `[reject]` Blind: Activity move buttons lack a captured baseline — they are single clicks, not drags, so the click-time version is the displayed one.
  - `[medium]` `[patch]` Blind: Move errors shown in unclear places — the toolbar is mounted only on Discovery, so Slices, Planning and Backlog refusals were invisible; the alert now renders in the shell for every view, and the Move dialog clears the mutation error after copying it. Slices regression passes.
  - `[low]` `[reject]` Blind: unexplained preview and empty-filter changes — preview reaching Discovery is the point of the change and the empty board was already blank.
  - `[low]` `[patch]` Blind: stale strings — dead `moveCommitted` string deleted.
  - `[low]` `[patch]` Blind: weak server assertions — missing, foreign and duplicate refusals now assert exactly 400.
  - `[false]` `[reject]` Blind: ChangeSet review shows one Card — descriptions are built from resolution changes for every deleted Card; `DeleteCard` has the same missing `permission`.
  - `[maybe-false]` `[defer]` Edge: preview-enabled Discovery leaves composer and Release mutations unguarded — those hooks never had a preview guard in any view; whether controls are hidden is unverified.
  - `[medium]` `[patch]` Edge: focus yanked back after the user clicks away — `focused` was never cleared, so any re-render with focus on the body refocused a tile; primary blur with no related target now clears it. Mutation check fails without the fix.
  - `[medium]` `[patch]` Edge: stale Move banner persists after Cancel — same repair as the Blind Move-errors row.
  - `[low]` `[reject]` Edge: Move on a card removed mid-flight shows a raw TypeError — rare race; the fix is an extra guard and string.
  - `[medium]` `[patch]` Edge: deleting one tile discards unrelated bulk selection — success now removes only deleted ids; deleted ids are also pruned by the existing visibility effect.
  - `[low]` `[reject]` Edge: no retry after capture failure — same as the Blind row.
  - `[low]` `[reject]` Edge: child count overstates under reassign — copy says "may be rehomed"; the count is an upper bound.
  - `[false]` `[reject]` Edge: missing selected target gives no conflict — the generic collector also skips missing rows and resolution refuses them.
  - `[maybe-false]` `[defer]` Edge: only the first missing-baseline failure is thrown — stale baselines are collected first, then missing ones on retry; already recorded in `deferred` (mixed-conflict completeness).
  - `[low]` `[reject]` Edge: top-level `baseVersion` ignored for a selected delete — the selection baselines are authoritative and checked.
  - `[low]` `[reject]` Edge: no Activity for link and evidence removals — same parity as the Blind Activity row.
  - `[low]` `[reject]` Edge: ancestry cycle treated as no selected ancestor — hierarchy validation prevents cycles.
  - `[low]` `[patch]` Edge: orphaned `moveCommitted` — same deletion as the Blind row.
  - `[low]` `[reject]` Edge: empty-filter Discovery grid no longer hidden — the board was blank before and every group stays individually hidden.
  - `[medium]` `[patch]` Edge: Slices failures surface only in the toolbar — same repair as the Blind Move-errors row.
  - `[maybe-false]` `[defer]` Edge: claim that all conflicts are collected — same open question as the missing-baseline row.
  - `[maybe-false]` `[defer]` Edge: preview read-only guarantee does not cover composers and Release controls — same as the unguarded-mutation row.
  - `[medium]` `[patch]` Gap: Activity classification unasserted — the reassign regression now asserts `card.rehomed` for exactly the re-parented Cards.
  - `[medium]` `[patch]` Gap: Delete dialog strategy options and transmission untested — added tests for legal options, the sent `reassign-right` strategy and hiding a selected neighbor.
  - `[medium]` `[patch]` Gap: Planning and Backlog drag baselines and Backlog preview gating untested — added a Backlog real-pointer test asserting the drag-start baseline; the Planning attempt could not be driven in jsdom and is recorded as deferred.
  - `[medium]` `[patch]` Gap: Move failure alert and Reload untested — added a Slices test for the shell alert and Reload.
  - `[false]` `[reject]` Gap: external-reference binding ordering — with the new loop disabled, the deselection assertion still passes, so the demonstration does not hold.
  - `[medium]` `[patch]` Other: duplicate alerts from toolbar and dialog — same repair as the Move-errors row.
  - `[low]` `[patch]` Other: loose status assertions — same tightening as the Blind row.
  - `[low]` `[reject]` Other: keyboard drag no longer starts untested — pointer-only sensors are the stated requirement.
  - `[low]` `[reject]` Other: heading-to-strong structure untested — no behavior change.
  - `[false]` `[reject]` Intent: incoming focused-card changes not held — the existing live-interaction hold covers focus inside `[data-live-card-id]`; the diff does not change it.
  - `[false]` `[reject]` Intent: dirty drafts and Restore epochs untouched — unchanged behavior is not a defect.
  - `[low]` `[reject]` Intent: no direct focus assertion for park and filter — they use the same layout-effect recovery as the tested removal and collapse paths.
  - `[low]` `[reject]` Intent: Discovery empty-filter expectation flipped — same as the Edge empty-filter row.
  - `[false]` `[reject]` Intent: Delete affordances all migrated — consistent with the intent's shared selected-set command.
  - `[false]` `[reject]` Intent: Move entry points beyond Discovery — the intent covers every exposed pointer move.
  - `[low]` `[reject]` Intent: browser captures cross-map owners — the server validates that required baselines are covered.
  - `[low]` `[reject]` Intent: one literal in a thrown invariant error — developer-facing, not UI copy.
  - `[false]` `[reject]` Intent: Never-constraints not visible in the diff — the diff touches none of the forbidden files.
  - `[maybe-false]` `[defer]` Intent: pointer/form equivalence asserted by request shape, not end state — native comparison would settle it; already in `deferred`.

Grouped result: 6 patched entries (dialog placement reuse; shell-level Move failure alert with dialog reset and Slices test; focus-yank fix; bulk-selection fix; Activity regression assertion; Backlog drag-baseline test), each medium, plus low corrections to Delete copy, a dead string and two server assertions. Two new deferred rows, the rest rejected or already deferred. Verification after patches: all four package suites, `node scripts/verify.mjs` and `git diff --check` pass.

## Design Notes

Prior-order sibling means the next/previous surviving tile in the prior flattened grid order, across lane boundaries; hierarchy-parent grouping is not an additional focus rule.

Use the existing pure hierarchy and placement rules, stable ids, shared Dialog and live hold. Optional local helpers are appropriate; do not replace the board/view architecture. Selection normalization is an implementation detail preserving existing non-cascading Delete semantics. The complete original affected baseline set must be captured by confirmation and carried into proposals; current server versions must not be substituted on Apply. Agents may divide implementation into disjoint backend and frontend work, waiting for their results before validation.

## Verification

Use installed Node24.17.0 first on PATH. Serialize tests and release build. Record sanitized evidence beside this spec under `evidence/story-6-3/`.

- `corepack pnpm --filter @storymapper/web test` -- nonzero tests pass, actual UI controls/key/focus covered.
- `corepack pnpm --filter @storymapper/core test` -- hierarchy/normalized operation parity pass.
- `corepack pnpm --filter @storymapper/db test` -- versions/rollback/persistence pass.
- `corepack pnpm --filter @storymapper/server test` -- actual HTTP/MCP command, concurrency/approval tests pass.
- `node scripts/verify.mjs` -- hygiene/typecheck/parity/build pass.
- `git diff --check` -- clean.

Use isolated actual HTTP persistence/reopen acceptance and native browser move/key/focus/confirmation acceptance when available. Record exact untested boundaries; DOM tests do not prove native drag/screen-reader/WCAG behavior. No new timing gate or browser-runner dependency.

## Auto Run Result

Status: done

- Summary: Follow-up review of the complete Story 6.3 change (pointer/form Move parity, Discovery keyboard traversal and focus continuity, atomic selected-set Delete). Four lenses reported 54 findings; six medium groups were patched.
- Files changed this pass:
  - `apps/web/src/features/story-map/components/DeleteCardsDialog.tsx`, `packages/core/src/index.ts`: dialog options and labels now come from the exported core `selectedDeletionPlacement`.
  - `apps/web/src/app/routes/story-map-shell.tsx`, `BoardToolbar.tsx`, `MoveAreaDialog.tsx`: Move failure alert with Reload renders for every view; the dialog clears the mutation error after copying it.
  - `discovery-navigation.tsx`, `CardTile.tsx`: leaving a tile no longer lets a later render pull focus back.
  - `useStoryMapBoardState.ts`: Delete success removes only the deleted ids from the bulk selection.
  - `ui-strings/story-map.ts`: singular Delete copy; dead `moveCommitted` removed.
  - Tests: `lifecycle.test.tsx`, `discovery-navigation.test.tsx`, `SlicesView.test.tsx`, `card-creation.test.tsx`, `workspace-navigation.test.tsx` (mock gained `moveCard`), `apps/server/src/http/routes/delete-cards.test.ts`.
- Review findings: patches applied 6 groups (11 medium rows) plus 4 low rows; deferred 2 new items (preview mutation guards, Planning drag-baseline test) in addition to the 2 existing ones; every rejected finding and its reason is in the triage log.
- Follow-up review recommended: false. This pass patched no high finding, so the work has converged. Patched counts: high 0, medium 6 entries (11 rows), low 4.
- Verification: `corepack pnpm --filter @storymapper/{web,core,db,server} test` all pass (web 414, core 387, db 417, server 665 + 14); `node scripts/verify.mjs` completed; `git diff --check` clean. Mutation checks confirmed the focus and Backlog-drag tests fail without their fixes.
- Residual risks: native browser, screen-reader and Tab-order behavior still unverified; Planning pointer-drag baseline forwarding and Backlog preview gating have no executed test; mixed-conflict completeness for new affected roots remains deferred.
