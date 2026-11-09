---
title: Collapse, Card Keys and Notes
type: feature
created: 2026-10-17
status: done
baseline_revision: 4f2988d95c6565677919bca4ad5d96690fd00c6e
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-preparation.md'
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-6-5-collapse-card-keys-and-notes.md'
warnings: [oversized]
deferred:
  - summary: >-
      Tree zero-row removal can leave no focus recovery target.
    evidence: |-
      TreeGrid returns an empty-state div without treeRef when all roots disappear. This branch and absence of an empty-board focus target predate Story6.5; hierarchy collapse itself always retains a root. A focused final-root removal/empty transition remains a separate existing boundary.
    location: >-
      apps/web/src/features/story-map/components/TreeGrid.tsx
    severity: medium
  - summary: >-
      Native combined hierarchy/Release collapse and pinned-lane geometry is not exhaustively verified.
    evidence: |-
      Mounted tests execute neighboring-column traversal, both collapse dimensions, disabled hidden surfaces, retained selection and reconnected ResizeObserver measurements. Safari confirms Activity collapse/reload, shared Tree/Discovery Step collapse and prefix conflict/application. Native sticky overlap/alignment across combined states, zoom and scrolling still requires a controlled visual/keyboard pass; jsdom geometry assertions do not establish this.
    location: >-
      DiscoveryMatrix.tsx and DiscoveryLanes.tsx
    severity: medium (unverified)
---

Reproducing statement: Implement Story 6.5 using bmad-build-auto, subagents and independent verification. Preserve orchestrator ownership of sprint-status.yaml; never write/revert it or infer verification from its rows. Date: 2026-10-17. Version: 2. Changelog: Implemented, independently reviewed, repaired and verified; native limits and pre-existing Tree empty-state focus recorded.

<intent-contract>

## Intent

**Problem:** Discovery lacks persisted Activity/Step collapse, Card Key prefix cannot be edited through the UI, and delivery totals include non-Story Cards.

**Approach:** Reuse map-scoped hierarchy preferences, extend the existing versioned map update, and consistently calculate delivery metrics from visible Stories. Preserve the stored monotonic Card number allocator.

## Boundaries & Constraints

**Always:** Preserve independent Release-lane collapse, hierarchy/filter context, retained selection, legal Note positions, visible focus, read-only previews, live holds, root baselines, atomic history/Activity, source/GitHub bindings and ChangeSet-first nonhuman writes. Existing keys never change. Apply visibleCards before filtering levels so parked/archived ancestors still hide descendants. Zero is estimated. English controls come from existing string modules. Follow the detail-plan task order and existing shared API/domain/repository boundaries.

**Never:** Write, stage, revert or otherwise mutate sprint-status.yaml, deferred-work.md or orchestration state. No inference from done/awaiting-operator rows. No new allocator, renumbering, synchronized preferences, new services, user-data/live GitHub mutation, commits or pushes. No new report shape/unestimated-list UI (6.9 owns its presentation), Release defaults (6.6/6.9), or migration work. Native accessibility must not be claimed from jsdom.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Hierarchy collapse | Activity/Step containing Stories/Notes; two maps; persisted reload | Descendants hidden per map; collapsed parent remains operable; expand restores; lane preference independent | No hidden focus, keyboard targets, drag items, add controls or drop targets |
| Filtering/selection | Filtered context, hidden selected descendants, root/Activity/Step Notes; external collapse update | Filter matches/retained selection unaffected; correct hierarchy visibility; focused hidden tile recovers to visible target | No stale traversal or accidental mutation |
| Preview | Read-only preview while collapsed or prefix editor reachable | Collapse remains UI-only; no domain mutations from preview | Prefix edit disabled/absent for read-only preview |
| Prefix update | Existing linked Cards; edit nonblank prefix; concurrent map update | Explicit versioned save; future keys use new prefix and monotonically increasing number; existing keys/provenance/links unchanged | Invalid blank prefix refused; stale update visibly conflicts, preserves draft and requires explicit resolution |
| Prefix lifecycle | Highest-key delete; prefix change; database reopen/create | Next number exceeds all prior allocations, across prefixes and reopen | No counter reset or reuse |
| Delivery | Mixed Activity/Step/Note/Story, zero and missing estimates, parked/archived ancestors; all/release/unscheduled | Counts, estimates, status distribution and unestimated count use visible Stories only; panel agrees with canonical report; collapse is not delivery exclusion | No input mutation or Note leakage |
| Push plans | Visible Notes with estimates/status/Release plus eligible Story | Public work-item push plan and legacy issue dry run exclude Notes; map still contains them | Preserve current permissions and separate confirmed remote apply |

</intent-contract>

## Code Map

- `apps/web/src/app/stores/tree-collapse-store.ts`: existing persisted collapsedByMap/toggleNode/setCollapsed; reuse as hierarchy state. `discovery-lane-collapse-store.ts` stays independent.
- `apps/web/src/features/story-map/components/DiscoveryMatrix.tsx`: activityStepGroups/columns, filtered.visibleCardIds and navigation locations must share hierarchy visibility without changing filter/selection sets. Collapsed Activity needs one structural placeholder column retaining its header; Step header remains, descendants hide.
- `DiscoveryLanes.tsx` in the same directory: DraggableCardTile/DroppableCell already accept hidden and disable drag/drop. ReleaseSection/DiscoveryCell/NotAssignedLane need coherent descendant visibility and inactive creation controls. Keep structural placeholders aligned. `CardTile.tsx` supplies primary identity; add accessible expanded-state controls without intercepting editor shortcuts.
- `TreeGrid.tsx` already unmounts collapsed descendants using the Tree store; preserve current behavior and recover focus if shared store hides focused child. `discovery-navigation.tsx` exposes prepareFocusRecovery; use existing visible traversal/focus recovery. Tests: `discovery-navigation.test.tsx`, `views/DiscoveryView.test.tsx`, `card-detail-test-fixture.ts`. Reset Zustand state as well as localStorage in isolation tests; persistence proof must rehydrate actual serialized preference.
- `apps/web/src/app/routes/RootLayout.tsx`: existing title edit + versioned map mutation. Prefer small dedicated prefix editor with shared `components/Dialog.tsx`, `features/conflicts/ConflictAlert.tsx`, `app/conflicts.ts`, `app/api.ts:updateStoryMap`; capture baseline with draft and preserve it across incoming updates/map switches. Invalidate map/list queries. Check search.preview read-only context from actual routes. Strings live in `apps/web/src/ui-strings/` (package alias is @storymapper/ui-strings).
- `packages/contracts/src/api/http.ts:84`: updateStoryMapRequestSchema lacks prefix. Add validated nonblank trimmed prefix using shared schema; `schemas/operation-fields.ts:51` mapPatch must support same update while mapCreate retains existing scope. Inspect operation catalog/generated metadata and MCP parity after schema extension; no new capability.
- `packages/db/src/repositories/projects-repository.ts:updateStoryMap`: add prefix patch only. `apps/server/src/application/story-map/story-map.use-cases.ts:82` already checks baselines and proposes nonhuman writes; preserve it. `cards-repository.ts:45,367` allocates stored nextCardNumber; read-only unless defect proved. Tests: `operation-executor-persistence.test.ts`, root versions and public HTTP/MCP routes.
- `packages/core/src/reports/reports.ts:buildReleaseSummaryReport`: currently totalCards/status/estimate include non-Stories. Canonical calculation should use visible Stories before release scope. Existing unestimated/risks already Story-only; maintain shape. `apps/web/src/features/releases/ReleasePanel.tsx` local summary duplicates incorrect totals; consume canonical calculation for existing local presentation. Other timeline/roadmap/slices/release-notes calculations already Story-only, verify rather than redesign.
- `packages/db/src/repositories/work-item-repository.ts:createWorkItemPushPlan` excludes Notes; `sources-repository.ts:createGitHubIssueDryRun` is Story-only. Protect both through public planning regressions. `card-visibility.test.ts:101` old totalCards3/status expectation must become Story-only1, with visible Note coverage; do not weaken ancestor exclusion.

## Tasks & Acceptance

**Execution:**
- [x] Collapse stores/DiscoveryMatrix/DiscoveryLanes/TreeGrid/navigation: integrate persisted Activity/Step collapse and accessible controls, inactive hidden surfaces and focus recovery; retain lane/filter/selection behavior.
- [x] RootLayout/new dedicated prefix editor/strings/shared contracts/projects-repository: expose validated versioned prefix editing and visible conflicts, keeping existing keys/counter unchanged and ChangeSet application equivalent.
- [x] Core reports/ReleasePanel: unify Story-only delivery totals using canonical calculation and preserve current report shape.
- [x] Focused web/core/contracts/DB/server tests: execute every matrix row, including persistence rehydration, map independence, preview, conflicts, linked keys, delete/reopen nonreuse, scoped reports and both public Note-excluding push planners.

**Acceptance Criteria:**
- Given actual Tree/Discovery controls, when hierarchy collapse changes and the map reloads, then each map restores its hierarchy and every focusable/draggable surface follows visibility.
- Given the prefix UI and linked Cards, when a prefix save and subsequent Card creation succeed, then only future display keys change and allocation remains monotonic after deletion/reopen.
- Given Notes and non-delivery ancestors, when the map, delivery reports/panel and push previews are inspected, then Notes remain usable on the map and are absent from delivery outputs/plans.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass 1

- verdicts: 16 findings — high 0, medium 7, low 2, false 6, maybe-false 1.
- Review launch constraint: the four-thread host limit required two launch batches; all four layers completed before classification. Edge hunter returned no findings. Code-only review diff excludes this claims document, which the edge layer read separately.
- findings:
  - `[medium]` `[defer]` B1 Tree empty-state focus — source confirms the empty return unmounts treeRef, but that branch predates this change and collapse retains every root. Recorded separately; no unrelated empty-board redesign.
  - `[medium]` `[patch]` B2 Pinned lane observes removed cell — Activity collapse can remove the measured Unscheduled cell while effect dependencies remain unchanged. Added hierarchy/lane preference dependencies; executed two-Activity observer replacement and subsequent resize assertions.
  - `[false]` `[reject]` B3 Unmatched map conflict traps editor — updateStoryMap asserts exactly the addressed StoryMap baseline; assertBaseVersions emits its same map ID/currentVersion or throws not_found. This endpoint cannot produce the proposed unmatched conflict shape, and actual HTTP/native conflict exposes Reload/Keep mine.
  - `[low]` `[patch]` B4 Pending prefix lacks programmatic progress — added form aria-busy and delayed-request assertion; disabled controls remain the visible pending indication.
  - `[low]` `[patch]` B5 Ordinary prefix failure/retry untested — added delayed rejection proving visible error, unchanged draft/baseline and a successful explicit retry after settlement.
  - `[medium]` `[patch]` B6 Delayed duplicate/dismissal guard untested — executed two same-turn submits with one API call and disabled Close/blocked Escape until request settlement.
  - `[medium]` `[patch]` B7 Neighbor-column collapse traversal untested — new two-Activity mounted test exercises surviving Activity/Step/Story arrow destinations and re-expansion.
  - `[medium]` `[patch]` B8 Combined hierarchy/lane collapse untested — new mounted sequence independently closes/reopens both dimensions, checks Story/Note visibility and inactive hidden controls, and retains checked selection.
  - `[maybe-false]` `[defer]` B9 Native placeholder/pinned geometry incomplete — DOM column and observer tests cannot establish native sticky overlap. Safari checked actual Activity/Step collapse, shared views and reload; final two-Activity pinned native layout was additionally inspected after repair, but broader combined Release-collapse/keyboard/zoom remains unverified as recorded above.
  - `[false]` `[reject]` B10 Canonical local-summary oracle lacks independent expected totals — reports.test.ts independently asserts explicit all/release/null count/estimate/status/unestimated values, and actual TCP acceptance computes expected values independently. ReleasePanel's separate assertion deliberately proves canonical reuse; existing authoritative query preference is unchanged.
  - `[false]` `[reject]` I1 Collapse evidence lives only in jsdom — source-diff observation was descriptive; parent additionally executed actual Safari Activity collapse, page reload, Tree expansion/Step collapse and return to Discovery with hidden descendants absent from AX. Full native accessibility remains unclaimed.
  - `[false]` `[reject]` I2 Prefix behavior lacks connected native/persistence evidence — parent entered NATIVE in Safari, injected concurrent HTTP map edit, observed stale refusal/draft, explicitly chose Keep mine, reopened persisted NATIVE and created NATIVE-8 through HTTP on that same fixture; real restart after deletion produced NATIVE-9.
  - `[false]` `[reject]` I3 Other delivery consumers are unchanged — source confirms timeline/roadmap/slices/release-notes already select visible Stories; server reports call the canonical builder. Both actual TCP push planners exclude estimated root/Activity/Step Notes while snapshot retains them. No missing behavior established.
  - `[false]` `[reject]` I4 Diff cannot establish workflow execution/ownership — rendered workflow command succeeded exactly once; parent ran full package/release gates and actual HTTP/native checks with retained logs. Orchestrator paths were excluded from every stage/write/revert and remain unchanged; no sprint-row inference used.
  - `[medium]` `[patch]` G1 RootLayout preview wiring gap — added mounted actual RootLayout test driven by search.preview; prefix opener disabled/no API call during preview and enabled explicit save without preview.
  - `[medium]` `[patch]` G2 Ordered ChangeSet prefix allocation gap — extended actual executor test with create→prefix update→create, permanent LSM-2/NEXT-3 keys and delete/reopen NEXT-4; existing linked Card/evidence remains unchanged.

Patch groups: 8 (6 medium, 2 low); two deferred entries, six refuted findings. No intent gap or spec re-derivation was required. Parent final verification follows all repairs.

### 2026-10-17 — Review pass 2 (follow-up)

- verdicts: 26 findings — high 0, medium 0, low 11, false 13, maybe-false 2.
- All four layers ran in one batch; the verification-gap layer reported no gaps. No code changed in this pass.
- findings:
  - `[low]` `[reject]` Blind: unchanged prefix save bumps map version — real but harmless: explicit save of the same value only adds a version/history row, and disabling Save adds a branch for a negligible outcome.
  - `[low]` `[reject]` Blind: prefix schema has no length/charset limit — intent specifies only "nonblank"; `${prefix}-${n}` parsing uses the last hyphen segment, so any nonblank prefix round-trips; stricter rules are unrequested configurability.
  - `[false]` `[reject]` Blind: duplicate keys across maps — every map starts at the `LSM` default (projects-repository.ts:181), so cross-map key repeats predate this change; the allocator is per map by design.
  - `[maybe-false]` `[reject]` Blind: stored blank prefix now fails `storyMapSchema` parse — maps are created only with `LSM`; a blank value would need a prior unvalidated ChangeSet write. Would be low if true, so rejected.
  - `[false]` `[reject]` Blind: release summary contract changed silently — Story-only totals are the stated intent (Delivery matrix row); `totalCards` keeping its field is the "no new report shape" boundary.
  - `[false]` `[reject]` Blind: tautological ReleasePanel test — reports.test.ts and card-visibility.test.ts pin explicit numbers; the panel test intentionally proves canonical reuse (carried from B10).
  - `[low]` `[reject]` Blind: ReleasePanel `?? ""`/reset-to-all/dead link inputs — the reset handles a deleted selected Release; `releases` is a snapshot prop that is not transiently empty; the empty link lists are the report's required inputs and not a silent failure.
  - `[false]` `[reject]` Blind: search matches hidden by collapse — Filtering/selection row requires filter matches unaffected by collapse; no auto-expand is specified.
  - `[low]` `[reject]` Blind: duplicated ancestor walk and unmemoized sets — TreeGrid walks a different structure; render-time cost is linear in cards and no named caller diverges; extraction is refactoring beyond the request.
  - `[low]` `[reject]` Blind: TreeGrid focus-effect gaps (no deps, unescaped id, empty-state without treeRef, unstyled tabIndex) — the effect returns early when the row is visible; ids are UUIDs; the empty-state branch is the carried pre-existing deferral (B1); remaining points cosmetic.
  - `[false]` `[reject]` Blind: shared collapse store coupling/unpruned ids — shared Tree/Discovery collapse is the specified Design Note; stale ids are inert and tiny.
  - `[low]` `[reject]` Blind: missing aria-controls/keyboard shortcut for collapse — controls are keyboard-operable buttons with aria-expanded; a shortcut is unrequested.
  - `[low]` `[reject]` Blind: prefix editor UX (next-key preview, success confirmation) — unrequested nice-to-have.
  - `[false]` `[reject]` Blind: test hygiene in mcp-http-parity — a top-level `it` after the `describe` is valid and executed; formatting only.
  - `[false]` `[reject]` Edge: parent-chain cycle loops forever — hierarchy cycles are rejected at write time and TreeGrid/getChildren would already recurse forever; unreachable by the app.
  - `[low]` `[reject]` Edge: blur to body keeps stale focusedId — recovery requires the focused row to vanish while focus is on body; the relatedTarget guard is what makes removed-row recovery work, and the fix needs a second path.
  - `[false]` `[reject]` Edge: effect with no deps re-steals focus — it exits before touching focus whenever the row is visible or focus sits outside the tree.
  - `[low]` `[reject]` Edge: bulk delete includes collapsed selected cards — retained selection is the intended 6.4 semantic, identical under filters, and DeleteCardsDialog lists every card before confirmation.
  - `[low]` `[reject]` Edge: no-op prefix save — duplicate of the Blind finding above.
  - `[false]` `[reject]` Edge: "NEW" prefix collides with placeholder keys — placeholder detection applies only to creation changes without `before`; permanent NEW-n keys on existing cards are untouched, and arbitrary prefixes were accepted before this change.
  - `[low]` `[reject]` Edge: storyMapSchema tightened for blank prefixes — same as the stored-blank finding above.
  - `[false]` `[reject]` Edge: ReleasePanel scope reset on transient empty releases — duplicate of the Blind finding above; the snapshot prop is not transiently empty.
  - `[maybe-false]` `[defer]` carried B9 Edge: collapsed-activity placeholder inside collapsed/pinned lanes may misalign natively — needs a controlled native sticky/zoom/keyboard pass; already recorded in `deferred`.
  - `[false]` `[reject]` Edge claim: matrix row 51 overstates "no hidden keyboard targets" — claim covers focusable/draggable surfaces, which tests assert; selection retention is separately required.
  - `[false]` `[reject]` Intent: collapse, persistence and preview are asserted in jsdom while expectations live in a native browser — carried I1/I2: parent additionally ran Safari checks; native accessibility remains unclaimed.
  - `[false]` `[reject]` Intent: allocator, ChangeSet and push-plan expectations are assert-only with no production hunks — the intent says "Preserve" and "No new allocator"; protecting existing behavior with tests is the specified reading.

## Design Notes

Graph MCP unavailable; CLI search plus source and two independent read-only investigations confirmed scope. Story6.4 continuity retains full selected sets independently from rendering; never replace its selection semantics with hierarchy visibility. A stored hierarchy collapse may be shared across Tree/Discovery; Release-lane collapse remains separate. Detail plan refinement: existing prefix update must be extended through shared contracts/repository because storage alone did not expose it. Current report unestimated count is retained; future list presentation stays in6.9.

## Verification

Use Node24 first on PATH. Run gates serially when build outputs are shared; retain sanitized evidence under `evidence/story-6-5/` beside this spec.

- `corepack pnpm --filter @storymapper/web test`: actual mounted controls/focus/persistence/conflicts and Release panel regressions, nonzero tests.
- `corepack pnpm --filter @storymapper/core test`: mixed/scoped Story-only reports and existing projections.
- `corepack pnpm --filter @storymapper/contracts test`: valid prefix update and operation schema, invalid blank refused.
- `corepack pnpm --filter @storymapper/db test`: allocator/reopen/links/plans/atomic version/ChangeSet regressions.
- `corepack pnpm --filter @storymapper/server test`: public versioned prefix HTTP/MCP proposal/application and report output.
- `node scripts/verify.mjs`: hygiene, typecheck, capability parity and build.
- `git diff --check`: no whitespace errors.

Attempt isolated native browser collapse/prefix interaction if available, record limits explicitly. Functional evidence must use disposable fixtures, never user Projects; no live GitHub write required. Parent independently runs verification and audits every matrix row.

## Auto Run Result

Status: done

- Summary: Story 6.5 adds persisted Activity/Step collapse shared with the Tree, an explicit versioned Card Key prefix editor, and Story-only delivery totals shared by the canonical report and the Release panel; the stored allocator is untouched.
- Files changed: web collapse/Discovery/Tree/CardTile/Release panel/prefix editor/RootLayout/strings; contracts prefix schema and update payloads; core report totals; db map-update repository; focused tests across web, core, contracts, db and server.
- Review (follow-up pass 2): 26 findings — 11 low, 13 false, 2 maybe-false. Patches applied: 0. Deferred: 1 (carried native-geometry item, already in `deferred`). Rejected: 25, each with its reason in the Review Triage Log.
- Follow-up review recommendation: false — this pass patched nothing, so no high-verdict patch exists.
- Verification: no code changed in this pass, so the pass-1 parent verification stands (retained under `evidence/story-6-5/`); this pass re-ran no commands.
- Residual risks: native sticky/zoom/keyboard behavior of combined hierarchy and Release collapse is unverified; Tree empty-state focus recovery predates this story.
- Finalization: no commit created. The intent contract forbids commits, and `sprint-status.yaml` and `deferred-work.md` are orchestrator-owned and dirty, so a clean tree cannot be reached from this run; the orchestrator commits.
