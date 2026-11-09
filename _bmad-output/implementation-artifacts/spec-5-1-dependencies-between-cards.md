---
title: Dependencies between Cards
type: feature
created: 2026-10-13
version: 12
status: done
baseline_commit: fecba85636b8abeab6542f8b96d8b63aa9ba77ff
baseline_revision: 994710f3a6254485e9c0bba5424c05933ed67c0d
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      The existing Discovery sortable lane exceeds the 300 ms filter budget when resetting a 1,000-Card map with 998 Stories in one lane.
    evidence: |-
      Native visible-browser filter reset measured 604.8 ms before the attempted memo repair, 650.2 ms with it, and 630 ms in a controlled temporary build omitting only CardTile dependency badges. Same 1,000 Cards and 999 edges; input isTrusted=true, observed DOM mutation followed by two animation frames. Supported sortable options do not avoid its unconditional per-Card index/suffix work or actual remount registration. The unsuccessful memo attempt is removed. No timing relaxation or acceptance claim. Exact runtime samples are retained under /tmp/story-5-1-browser-timings-{before,memo,without-badges}.json.
    location: >-
      apps/web/src/features/story-map/components/CardTile.tsx: SortableCardTile; existing @dnd-kit/sortable useSortable mounting
    severity: medium
  - summary: >-
      Opening a Card on the unfiltered 1,000-Card/999-edge map took 214 ms against the nominal 100 ms target; optimize later under explicit Story 5.1 acceptance.
    evidence: |-
      Final native Safari trusted click, DOM mutation and two animation frames measured 214 ms (one sample). All 725 tested source hashes match. The maintainer chose “Funktional abschließen, Optimierung später (empfohlen)” on 2026-10-14. This is a raw nominal failure with accepted completion, not a global waiver or a proven root cause. See evidence/story-5-1-resume-browser-proof.json; profile before optimizing.
    location: >-
      apps/web/src/features/story-map/components/CardDetailModal.tsx — observed board-to-modal interaction; root cause not yet profiled
    severity: medium

---

# Story 5.1: Dependencies between Cards

Reproducing statement: Resume the autonomous ready-for-dev Story5.1 spec with bmad-build-auto; independently verify implementation and preserve orchestrator-only sprint bookkeeping. Fresh version11 is blocked on the new Card-open timing failure. Historical intent: Accept Story 5.1 after the maintainer-authorized filter timing relaxation on 2026-10-14, commit its reviewed changes and continue only Epic 5 through the orchestrator. Original implementation request: Implement story 5-1 through bmad-build-auto, consuming Epic 5 preparation version 3 and its detail plan; preserve orchestrator ownership of sprint-status.yaml, never write/revert it and never infer verification from its rows.

<intent-contract>

## Intent

**Problem:** Cards cannot express prerequisites, so the map does not record work ordering.

**Approach:** Add acyclic same-map directed dependencies owned by the dependent Card, shared typed mutation/ChangeSet support, and related-key badges and modal controls.

## Boundaries & Constraints

**Always:** dependent -> prerequisite; all Card levels; unique ordered pairs; resolve persisted identities, creation aliases and scoped external references before ownership/self/cycle checks. Actual edge changes bump dependent Card once per transaction with history/audit/live tracking. Human writes use existing UoW/baseVersion; external writes produce ChangeSets with existing approval/protection semantics. Contracts are sole schema source, core pure, DB access repository-only. Preserve preview immutability and canonical dirty modal editor. Copy remaps internal edges, archive preserves edges, Restore recovers edges, deletion updates surviving owners atomically. Use Node 24 and English strings. Preserve raw timing failures; the maintainer accepts the observed Story 5.1 full-filter timings within 1,000 ms and the final 214 ms Card-open observation for functional completion, with optimization later. These are scoped exceptions, not global performance changes.

**Never:** edit/stage/revert sprint-status.yaml or deferred-work.md; equate bookkeeping with verification; modify user Projects; push; local completion commits and scoped Epic 5 continuation are explicitly maintainer-authorized; implement Slices/Graph/drift/change drawers; add SaaS/network/telemetry; invent browser/timing evidence; conflate domain DAG with operation-selection dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Set/unset | Two same-map Cards and current dependent baseline | Create/remove edge; one dependent version/history/audit update | Typed missing/stale refusal |
| No-op | Duplicate set through another selector or absent unset | Exact edges/root versions unchanged; ordinary tool audit allowed | Still validate identities/baseline |
| Invalid identity | Self, missing or foreign-map endpoint after alias resolution | No domain writes | Typed validation/not_found with useful endpoint evidence |
| Cycle | A->B, B->C, proposed C->A, including aliases | Reject with named Card-key cycle | No partial effects |
| Sequential proposal | Earlier create/bind/unset and later dependency | Shared describe/resolve/preview/executor agree; deselection honors prerequisites | Existing typed selection/conflict refusal |
| Delete | Card with incident edges | Remove incident edges; bump/history/audit every surviving dependent owner once | Entire transaction rolls back on failure |
| Lifecycle | Copy/archive/Restore/archive import | Internal copied endpoints remap; archive preserves; Restore recovers exact rows | Existing classification/schema refusal |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/domain.ts` (`cardSchema`, `storyMapSnapshotSchema`, `makeChangeOperationSchema`) — edge snapshot and shared request/response schemas; keep Card shape stable.
- `packages/contracts/src/schemas/remaining-operations.ts`, `change-operations.ts`, `operation-resolution.ts` — strict dependency set/unset, both endpoint selectors, required snapshot collection and resolved entity-change shape.
- `packages/contracts/src/schemas/mcp.ts`, existing MCP input/catalog modules — shared tool inputs and discovery metadata.
- `packages/core/src/changesets/entity-resolution.ts` (`targetId`), `resolution-context.ts` (`referenceId`, `bumpVersion`) — reuse scoped selector/persisted-first identity and transaction-start versions.
- `packages/core/src/changesets/operation-registry.ts`, `remaining-owners.ts` (`CHANGE_COLLECTIONS`, `ownersFor`), `operation-dependencies.ts` — resolver catalog, edge owner/effects, sequential endpoint/binding/graph reads; no-op before bump.
- `packages/core/src/changesets/card-command-resolution.ts`, `copy-resolution.ts` — pure delete/copy edge state and surviving-owner changes.
- `packages/db/src/connection.ts`, `schema/tables.ts`, `schema/classification.ts` — actual DDL, typed table and snapshot ownership classification; both endpoint FKs and unique pair.
- `packages/db/src/repositories/storymapper-repository.ts`, `projects-repository.ts`, `operation-snapshot-repository.ts`, `operation-persistence-repository.ts` — repository binding, canonical map snapshot, operation state and entity-table persistence.
- `packages/db/src/repositories/cards-repository.ts` (`deleteCard`, `writeCardVersion`), existing map-copy repository — direct mutation cleanup/versioning and copy rows; FK cascades alone are insufficient. History is Card fields; owned-edge evidence belongs to Activity/map/operation snapshots.
- `apps/server/src/application/card/card-children.use-cases.ts` — human UoW/baseVersion and nonHumanCommand reuse; dedicated dependency module avoids enlarging unrelated use cases.
- `apps/server/src/application/changeset/changeset-executor.ts`, `preview-board-projection.ts` — existing atomic executor/approval; add collection to manually enumerated projected snapshot.
- `apps/server/src/http/routes/card-routes.ts`, `mcp/tools/register-card-tools.ts`, application descriptors/modules and generated capability artifacts — shared surface registration and metadata generation.
- `apps/web/src/features/story-map/useStoryMapBoardState.ts`, `components/CardTile.tsx`, `components/TreeGrid.tsx`, `DiscoveryLanes.tsx`, `DiscoveryMatrix.tsx`, `BacklogList.tsx`, `SwimlaneGrid.tsx` — full-map adjacency before filtering; Tree has independent rows; thread badges through every board surface.
- `apps/web/src/features/story-map/components/CardDetailModal.tsx`, `apps/web/src/app/api.ts`, `apps/web/src/ui-strings/story-map.ts`, `card-query-invalidation.ts` — canonical modal, typed requests, English controls, history/Activity invalidation.
- `apps/web/src/app/routes/story-map-shell.tsx` — read-only constraint: projected boards but canonical modal; preserve dirty editor/hold-updates semantics.

- `apps/web/src/features/story-map/views/TrackingView.tsx`, `features/releases/ReleaseKanban.tsx` — follow-up full-snapshot badge consumer and scoped-release rendering.
- `packages/db/src/schema/tables.ts`, `connection.ts`, `repositories/cards-repository.ts`, `operation-persistence-repository.ts` — internal dependency history marker, migrated through existing column initialization, preserved across same-version writes.

## Tasks & Acceptance

**Execution:**

- [x] Contracts files above — define edge `id/cardId/prerequisiteCardId/createdAt`, snapshots, strict endpoint selector payloads, request/response and MCP schemas.
- [x] Core dependency module and registry files above — pure deterministic DAG validation, describe/resolve, alias/baseline validation, owner effects and selection closure.
- [x] DB schema/repository files above — persist owned edges, canonical snapshots, versioned set/unset and atomic incident-edge deletion; integrate operation persistence/copy/Restore.
- [x] Server application/route/MCP/projection/catalog files above — expose shared human/Agent commands, scope policy and full preview/executor parity; regenerate authored capability artifacts using existing generator.
- [x] Web files above — both-endpoint count/key badges and accessible canonical modal add/remove with pending/error/conflict state and current baseline.
- [x] Existing core/DB/server/web suites — meaningful regressions for matrix, exact versions/history/audit, selectors/cycles, selection, preview, rollback and lifecycle; actual modal DOM flow and dirty draft retention.
- [x] Fresh configured tests, release hygiene/capability parity/typecheck/build, lint and whitespace — passed on version8 repaired source.
- [x] Complete remaining final-build actual-browser acceptance — named-cycle refusal passed without a cyclic write; final 346 ms full filter reset and 214 ms Card opening recorded. The maintainer explicitly accepted the scoped timing exceptions for functional completion; raw nominal failures remain documented.

**Acceptance Criteria:**

- Given same-map Cards at any level, when an actual dependency is set/unset through human HTTP/MCP, then the dependent root increments once with transactional edge/history/audit effects; duplicate set/absent unset changes no domain version.
- Given invalid resolved endpoints or a multi-edge cycle, when a human command or Agent proposal resolves, then self/cross-map/cycle validation rejects it, the cycle names related Card keys, and domain state remains unchanged.
- Given an Agent references Cards by scoped external refs or earlier aliases, when dependency operations are described, previewed, selected, approved and applied, then all paths use resolved identity and consistent edges/conflicts; deselection respects required prior operations and failed apply rolls back all effects.
- Given dependencies on visible/filtered/archived related Cards, when each board surface renders a Card, then both endpoint badges give direction, count and related keys from complete canonical/projected adjacency.
- Given the canonical Card modal, when mouse or keyboard adds/removes a dependency, then English labelled controls send current baseline through the shared UoW, show failures/pending state, and preserve unrelated dirty fields/focus.
- Given deletion of a prerequisite, when committed, then incoming/outgoing rows disappear and every surviving dependent gets one version/history/audit/live update; failure rolls back all owners.
- Given copy/archive/Restore and portable snapshots, when executed, then copy remaps only internal endpoints, archive retains edges, Restore recovers exact coherent rows and import classification preserves valid Project ownership.

## Spec Change Log

- 2026-10-14: Maintainer explicitly answered “Funktional abschließen, Optimierung später (empfohlen)” after reviewing the final 214 ms Card-open observation. Scope: Story 5.1 acceptance of this measured interaction, alongside the existing 1,000 ms full-filter exception. Keep nominal 100/300 ms failures and both optimization items; no application rewrite or global waiver. Complete the remaining exact-source acceptance and continue Epic 5 through supported orchestration.

- 2026-10-14 follow-up: Preserve dependency-owned history through later ordinary Saves with an internal persisted dependency_change marker, including same-cut ChangeSet update then edge-only effects. Add Tracking/ReleaseKanban to the badge consumer Code Map and mounted coverage. Existing consecutive ordinary-save coalescing and the scoped timing exception remain unchanged. No public schema or edge semantics change.

- 2026-10-14: Maintainer explicitly instructed “relx die zeitanforderung und aktzeptiere die story, comitte und dann fahre fort mit dem loop (umsetzung von nur epic 5 stories)”. For Story 5.1, relax the measured 1,000-Card full filter reset to 1,000 ms and accept the functional implementation. All measured samples and the inherited performance debt remain recorded. This later instruction supersedes the original no-commit boundary solely for this completion and authorizes continuation of Epic 5 only; the original intent contract is preserved. No global timing waiver, new optimization, fabricated passing measurement or manual sprint-ledger edit.

## Review Triage Log

### 2026-10-13 — Independent review pass

- verdicts: 20 findings — high 0, medium 8, low 7, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Edge hunter: earlier-created-map endpoint scope was mistaken for a foreign Project — created IDs now preserve the scope of the earlier operation; focused owner authorization covers Submit/Approve/Apply and readable proposals. Persisted identities still resolve first. Raw Card creation map literals retain their separate existing invariant.
  - `[medium]` `[patch]` Edge hunter: Planning Activity/Step headers omitted dependency badges — both headers now use the shared badges and full snapshot adjacency; canonical and projected tests cover both directions and archived related keys.
  - `[medium]` `[patch]` Gap reviewer: ChangeSet dependency history non-coalescing lacked a regression — fixed-clock real SDK set/unset by the same actor/session now asserts each committed root version and separate history row. This would fail if dependency-owned history used ordinary save coalescing.
  - `[medium]` `[patch]` Blind hunter: unresolved scope failure auditing called a removed project resolver — optional resolver access retains the original typed refusal; HTTP/SDK tests assert exactly one rejected tool audit and unchanged domain state.
  - `[medium]` `[patch]` Blind hunter: created-map endpoint scope became a spurious foreign Project — same scope defect as the edge finding; earlier creation IDs are recognized before Project fallback, with explicit owner-resolution assertions.
  - `[medium]` `[patch]` Blind hunter: Save/lifecycle could overlap an edge write at the same Card baseline — the existing modal pending guard includes dependency writes, with delayed regressions in both orders and current committed baselines. No new public surface.
  - `[low]` `[patch]` Blind hunter: shared dependency badge styling was absent in Tree/modal — the existing pill styling now includes dependency badges, making directions visibly separate on every surface.
  - `[false]` `[reject]` Blind hunter: Tree dependency lists were clipped by hidden-overflow title cells — the cited overflow/nowrap rule belongs to `.tree-cell` and `.tree-title-button`; badges are siblings in `.tree-cell-title`, which has neither rule. The existing complete title and accessible text already expose all keys. Wrapping is retained when applying shared badge styling, but no extra control is added for this refuted clipping claim.
  - `[low]` `[reject]` Blind hunter: adjacency/path array copying has avoidable cost — this is real extra allocation, but the 1,000-Card/999-edge chain produces the full 1,001-key cycle in 0.53–2.33 ms. Predecessor reconstruction would add complexity without a demonstrated everyday latency defect.
  - `[low]` `[reject]` Blind hunter: Restore repeatedly reconstructs/searches the accumulated graph — real extra work, but complete validation on the same dependency-bearing database takes 195–202 ms. A new whole-graph algorithm is not justified by a measured failure in this story.
  - `[low]` `[patch]` Blind hunter: prerequisite incident deletion lacked a reverse index — actual DDL and typed schema now share the prerequisite index; focused SQLite query-plan evidence confirms indexed access.
  - `[low]` `[reject]` Blind hunter: the spec lacked new UI timing evidence — a narrative/evidence gap rather than a demonstrated source defect. The workflow rejects findings whose fix edits its spec; parent independently executed the 1,000-Card browser verification; the measured inherited sortable-lane failure is recorded separately below.
  - `[low]` `[reject]` Blind hunter: current spec result still described the historical browser blocker — finalization replaces the current result and preserves earlier evidence as history; the workflow excludes spec-edit findings from repair routing.
  - `[medium]` `[patch]` Intent auditor: richer create/bind dependency cases were covered chiefly below the persisted pipeline — added protected HTTP/SDK sequential create/bind/dependency submission, readable proposal, agent protection refusal, human approval and actual persisted Apply assertions. Existing literal-map creation behavior remains unchanged.
  - `[false]` `[reject]` Intent auditor: reported protected browser evidence is not executable test coverage — correct distinction of evidence types, but no changed-behavior defect: actual parent browser preview/selection/approval/Apply was executed; the new protected transport regression and existing executor atomicity suites exercise the pipeline.
  - `[false]` `[reject]` Intent auditor: portable snapshot tests are not a full archive round trip — correct test granularity, but no divergent archive behavior identified. Classified dependency rows use the existing generic archive pipeline; focused portable-row ownership/FK validation and actual file-backed Restore exercise the added persistence boundary.
  - `[false]` `[reject]` Intent auditor: deletion bookkeeping assertions are distributed across layers — no missing effect found: explicit incident cleanup calls version/history and Activity tracking for every surviving owner inside the same UoW; rollback tests preserve exact snapshot/history, and generic UoW/live tests cover commit emission.
  - `[false]` `[reject]` Intent auditor: browser evidence appears as narrative in the diff — review content cannot itself execute a browser, but parent actually observed mouse/keyboard, cycle refusal, immutable preview, protected Apply and dirty-title/Tiptap/focus behavior. Saved DOM/screenshot artifacts identify those observations separately from jsdom tests.
  - `[low]` `[reject]` Intent auditor: OpenWolf handoff retained the earlier blocked narrative — current handoff is refreshed as required session bookkeeping; historical entries remain labelled history. This does not establish a dependency implementation defect or require deferred domain work.
  - `[medium]` `[patch]` Repair regression discovery: new set:externalRef binding identities made the sequential proposal unreadable — canReadChangeSet now treats the operation's own binding identity as newly created, while still resolving referenced owners first. Protected HTTP/SDK List/Approve/Apply tests reproduce and close the failure.

Eight medium and two low patched finding rows correspond to seven medium and two low repair entries; duplicate created-map scope claims share one entry. No deferred, intent-gap or bad-spec entry. Two actual-browser repairs (JSON DELETE/security compatibility and removal focus) preceded this review and are recorded separately.


### 2026-10-13 — Browser performance follow-up

- verdicts: 1 finding — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[defer]` Actual 1,000-Card full filter reset exceeds 300 ms — original visible sample 604.8 ms; unsuccessful memo attempt 650.2 ms; controlled badge omission 630 ms. Independent source review confirms the existing sortable mounting path predates this story and adjacency is memoized independently of search. These controls demonstrate failure without badges, but are not an exact pre-story runtime baseline or a CPU profile establishing the dominant cost. No supported trivial fix was demonstrated; the memo attempt was removed and the unchanged runtime gate remains blocked. Recorded only in this spec's deferred list.

### 2026-10-14 — Follow-up review pass

- verdicts: 18 findings — high 0, medium 7, low 8, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind hunter: ordinary Save replaces a dependency history version — Fixed-time regression reproduced history [1,3] instead of [1,2,3]. Persisted dependency_change metadata protects direct, incident-deletion and ChangeSet boundaries while consecutive ordinary Saves still coalesce.
  - `[medium]` `[patch]` Blind hunter: Tracking omits dependency badges — Tracking now computes complete canonical adjacency and ReleaseKanban reuses the existing badge component. Mounted tests retain archived and other-Release keys.
  - `[low]` `[patch]` Blind hunter: successful add retains a nonexistent selected option — Successful addition resets selectedId; mounted DOM assertions verify placeholder value and disabled Add.
  - `[low]` `[reject]` Blind hunter: large maps can exceed SQLite bound-variable limits — Two expanded Card ID lists have this finite limit. The required 1,000-Card case fits; no everyday failing map was demonstrated. A join rewrite adds query complexity for an unobserved extreme and is not warranted in this pass.
  - `[low]` `[reject]` Blind hunter: live-update fixture lacks dependency edges — Exact added fixture coverage is absent, but Project snapshot invalidation in live-query-invalidation.ts refreshes complete adjacency regardless of the prerequisite version. Tracking coverage now also consumes a dependent-root live refresh; additional remote set/unset fixtures do not correct a demonstrated defect.
  - `[low]` `[reject]` Blind hunter: dependency conflict Reload lacks specific coverage — This exact test is absent. Reload resets the mutation and invalidates queries; CardDetailModal preserves dirty drafts and the dependency version ref tracks the current Card independently. Additional interaction fixtures add coverage without correcting an observed bad outcome.
  - `[medium]` `[patch]` Blind hunter: malformed and cross-map Restore refusals lack regressions — Valid-FK foreign-map edges and malformed identity/timestamp rows now independently exercise the validator refusals. Same repair as the gap reviewer finding.
  - `[low]` `[reject]` Blind hunter: incident-deletion audit/live assertions are incomplete — The existing test does not enumerate every audit/live effect. Source explicitly audits each incident edge, deduplicates surviving owner history writes and tracks live roots inside the rollback UoW. Additional enumeration is not a direct behavior correction.
  - `[low]` `[reject]` Blind hunter: approved graph-change-before-Apply scenario lacks a dedicated test — Executor obtains a fresh snapshot and resolves all operations before persistence; dependency resolution performs named-cycle validation. Thus newly cyclic input refuses before domain effects. The dedicated ordering fixture is absent, but no changed-behavior defect was demonstrated.
  - `[low]` `[reject]` Blind hunter: alternate prerequisite selector repeat lacks exact coverage — Both endpoints share selectedEntityId before the existing-pair return, which precedes version mutation. Existing alternate dependent-selector/no-op tests cover the shared mechanism; another endpoint fixture does not correct demonstrated divergent behavior.
  - `[medium]` `[patch]` Edge hunter: Tracking Cards omit dependency information — Same verified omission and repair as the blind hunter; complete adjacency is supplied before visibility and Release filtering.
  - `[medium]` `[patch]` Verification-gap reviewer: Discovery/Backlog badge consumers lack populated coverage — Mounted Discovery and Backlog now assert both directions while archived and filtered opposite endpoints are absent from the rendered board.
  - `[medium]` `[patch]` Verification-gap reviewer: Restore malformed-row/cross-map branches lack refusal coverage — Raw stored rows with valid foreign keys now exercise same-map and shared-schema refusal independently; coherent portable/Restore and cycle tests remain.
  - `[false]` `[reject]` Intent auditor: browser and gate narratives are not independent executions — carried: Correct evidence distinction rather than a functional defect. This run executes fresh automated gates and separately records the actual browser blocker; prior recordings remain explicitly historical.
  - `[false]` `[reject]` Intent auditor: portable ownership and distributed deletion tests have narrower granularity — carried: Correct test descriptions, with no divergent behavior identified. Generic archive classification and transactional repository/operation paths consume the shared dependency collection; no full browser archive round trip is claimed.
  - `[false]` `[reject]` Intent auditor: timing exception and later commit authorization alter recorded acceptance — The recorded explicit maintainer exception is retained with the original failed 300 ms samples. No new runtime pass is inferred, and sprint bookkeeping is excluded from verification.
  - `[medium]` `[patch]` Independent repair review: update then dependency in one ChangeSet leaves history unmarked — Reproduced with changeset-update-set: the edge operation emits no second Card change after the first operation bumps the root. Persistence now marks every surviving dependency owner current-version history row even when only an edge changes. Independent source review confirms closure.
  - `[low]` `[patch]` Parent typecheck: Tracking test Release fixture omits shared required fields — Workspace typecheck refused missing goal/released. The fixture now parses through releaseSchema; web typecheck and six Tracking tests pass.

The four review layers were launched before triage; the fourth waited for a concurrency slot. Original reports are preserved in the review threads. Six patch groups: history boundary (including its repair follow-up), Tracking badges, selector reset, populated consumer tests, Restore refusal tests and the type-safe Release fixture. Four medium and two low groups; no high or new deferred group. Existing deferred performance debt remains unchanged. Fresh browser verification is required for the changed UI.

### 2026-10-14 — Fresh redispatch review

- verdicts: 22 findings — high 0, medium 5, low 8, false 9, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind hunter: edge-only proposals inherit unrelated open GitHub field conflicts — touchesSyncField defaulted true for cardDependency. Exclude this entity while retaining root baseline checks; four field regressions and stale-version assertion pass.
  - `[false]` `[reject]` Blind hunter: copied-edge shadow omission breaks selection closure — actual resolver reproduction on three- and four-Card chains retains only copy when break-cycle is deselected. Conservative copied-Card Map ownership supplies the prerequisite; no shadow patch applied.
  - `[low]` `[reject]` Blind hunter: large maps exceed SQLite variables — carried: same location and claim as prior follow-up. Required 1,000-Card map fits; no everyday failing map established, and join rewrite adds complexity.
  - `[low]` `[reject]` Blind hunter: candidate exclusion scans Cards times outgoing edges — extra work exists, but no failing modal latency or everyday harm established. Additional Set/scanning optimization is unwarranted for this repair.
  - `[low]` `[reject]` Blind hunter: cycle traversal copies adjacency/path arrays — carried: unchanged rejected allocation concern; no algorithm rewrite.
  - `[low]` `[reject]` Blind hunter: Restore rebuilds graphs per edge — carried: unchanged rejected performance concern; no whole-graph rewrite.
  - `[low]` `[reject]` Blind hunter: conflict Reload lacks exact coverage — carried: prior coverage-only claim stays rejected. The edge hunter's separately reproduced lower-Restore-version behavior is a distinct defect, repaired below.
  - `[low]` `[reject]` Blind hunter: graph changes between approval and Apply lack a dedicated regression — carried: fresh snapshot resolution already rejects before persistence. Supplemental fresh HTTP acceptance now also pins the exact approved-state refusal; no behavior patch.
  - `[low]` `[reject]` Blind hunter: deletion effects are not enumerated together — carried: source already commits audit/live/history atomically. Supplemental fresh DB acceptance enumerates one live receipt, exact Activities and shared-owner deduplication; no behavior patch.
  - `[low]` `[reject]` Blind hunter: both remote endpoint badge changes lack direct coverage — carried: complete-map invalidation already refreshes adjacency. Supplemental fresh mounted live acceptance now observes set/unset without reopening rows; no behavior patch.
  - `[medium]` `[patch]` Edge hunter: Reload after Restore retries the former higher baseline — mounted regression failed [5,5] versus [5,2] despite refetched version2 and retained dirty drafts. Reload adopts reported currentVersion; layout effect tracks canonical version transitions, including decreases, instead of render-time Math.max. Test now passes.
  - `[false]` `[reject]` Verification-gap reviewer: public created-Map alias endpoint resolution lacks full-chain coverage — reviewer retracted after both proposed transport cases failed earlier at authorization under the intentional literal Map-ID Card creation contract. No mocked authorization, contract broadening or speculative production change; temporary test edits removed and original35 tests passed.
  - `[false]` `[reject]` Intent auditor: DOM modal tests do not prove native keyboard/HTTP acceptance — correct evidence distinction, not a demonstrated defect; fresh browser acceptance is a separate required gate.
  - `[false]` `[reject]` Intent auditor: mounted board coverage is not fresh full-browser acceptance — same evidence distinction; supplemental Not assigned populated rendering and fresh native acceptance remain distinct checks.
  - `[false]` `[reject]` Intent auditor: protected lifecycle is tested at HTTP/SDK rather than only core — these tests exercise persisted approval/apply; no functional divergence reported.
  - `[false]` `[reject]` Intent auditor: portable rows/Restore are not a complete archive round trip — carried: generic archive classification consumes dependency rows; no specific archive defect established or complete browser round trip claimed.
  - `[false]` `[reject]` Intent auditor: deletion evidence is distributed — carried: no missing effect established; supplemental exact DB commit/rollback receipt verification adds current evidence.
  - `[false]` `[reject]` Intent auditor: preserved alias delivery repairs have pure-resolution evidence — correct surface distinction. Their reachable pure public resolver failures are reproduced directly; no persisted transport claim inferred from that test.
  - `[false]` `[reject]` Intent auditor: inherited completion prose cannot establish fresh gates — this attempt runs every configured/manual gate again and preserves prior results as historical. No ledger row or old fingerprint proves verification.
  - `[medium]` `[patch]` Parent preserved-work audit: failed request remains retryable after selecting another prerequisite — stale mutation variables can target former selection. Reset mutation on selector change; native retry controls and focused regression verify selected-target behavior.
  - `[medium]` `[patch]` Parent preserved-work audit: closing/discarding the modal hides pending refusal — clean close and dirty Discard were reachable during held requests. Keep modal mounted and disable Discard until completion; clean/dirty mounted regressions fail before and pass after repair.
  - `[medium]` `[patch]` Parent preserved-work audit: aliased external delivery scope crashes after successful selector resolution — actual pure resolver archive/status cases dereference an absent binding at unresolved scope. Query by resolved Card Map; both cases and selection closure pass without changing ownership validation.

Four review lenses launched before triage; the fourth waited for the three-child concurrency limit. Five medium repair groups, no high, no new deferred entry. Supplemental fresh verification does not change carried rejection verdicts. Independent repair audit found no residual changed-behavior defect. Preserved sprint/deferred ledger changes and historic gate prose were not applied.

### 2026-10-14 — Redispatch review

- verdicts: 8 findings — high0, medium2, low3, false3, maybe-false0
- findings:
  - `[low]` `[reject]` Blind hunter: missing Auto Run Result heading — terminal result was removed by the orchestrator re-arm and is written by finalization/HALT. A spec-only correction, rejected under the workflow rule; this halt supplies the required heading.
  - `[medium]` `[reject]` Blind hunter:306.7ms is not covered by the specific214ms acceptance — verified against the read-only intent contract. Do not extend acceptance. Spec-edit finding rejected as prescribed; the actual failed fresh gate independently blocks this run.
  - `[low]` `[reject]` Blind hunter: fresh evidence lives only under/tmp — correct persistence limitation in the narrative. Spec-only evidence finding rejected as prescribed; terminal reporting now links a synthetic persistent proof, retaining local raw files.
  - `[false]` `[reject]` Intent auditor: feature intent lives at executable surfaces while diff is documentation — carried: existing implementation already supplies those surfaces; this run inspected source and executed fresh116 focused/1732 configured tests and actual browser checks. No missing application behavior identified.
  - `[false]` `[reject]` Intent auditor: matrix/lifecycle evidence is suite coverage rather than changed tests — carried: exact source/assertions and passing named suites were inspected. No new application/test change was needed; no complete browser archive round trip is claimed.
  - `[medium]` `[reject]` Intent auditor:306.7ms treated as a topic-level exemption — independently verified same acceptance mismatch as blind hunter; that sentence is removed and terminal status is blocked. No application performance correction or new accepted measurement is claimed.
  - `[low]` `[reject]` Intent auditor: completed functionality alongside in-review metadata — correct transient review stage; terminal HALT records the actual blocked timing outcome. Spec-edit finding rejected as prescribed.
  - `[false]` `[reject]` Intent auditor: boundary claims remain documentary — observed root actions used isolated synthetic storage, and final ledger hashes match. No prohibited ledger/source/network mutation identified.

Edge-case hunter returned no findings; verification-gap reviewer returned no gaps. All four were launched before triage. Zero patch/defer groups; follow-up review recommendation:false. Rejections do not waive the failed performance gate.

## Design Notes

Use existing Card aggregate ownership AD-17 and version semantics AD-3, with a unique ordered edge pair. Reuse selector resolution rather than special external string matching. DAG validation includes archived canonical Cards. Graph reads participate in sequential selection dependencies so excluding an earlier unset cannot silently change validity. A no-op can retain the ordinary MCP call audit but emits no domain edge/version effect. Do not expand Card history payloads solely for edges.

## Verification

Use `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` first on PATH.

- Focused core/DB/server/web Vitest commands from each actual package — exact executed test files/cases pass.
- `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test` — configured gates pass, run serially with release verification.
- `node scripts/verify.mjs` — hygiene/capability parity/typecheck/build pass; stage required new source files for portable Git fixtures, never tracking files.
- `git diff --check` — no whitespace errors.
- Actual browser on isolated acceptance storage — mouse/keyboard add/remove, both endpoint badges and rejection/preview flows observed; actual CUA browser controls now work. DOM tests alone do not satisfy this browser requirement. Measure 100 ms board interactions and 300 ms filtering on 1,000 Cards; keep failed samples.

## Changelog

- Version 11 (2026-10-14): Fresh ready-for-dev redispatch; existing implementation inspected without source changes, 1,732 configured tests and full release/typecheck/lint passed, actual isolated Chrome functional acceptance repeated. Raw timing observations retained; orchestrator ledgers untouched.

- Version 10 (2026-10-14): Maintainer accepted the final measured Card-opening timing exception; functional browser acceptance complete, raw failures and two optimization items retained, no source change.

- Version 9 (2026-10-14): Completed remaining actual named-cycle and final timing observations on unchanged source; retained 214 ms nominal interaction failure pending explicit maintainer decision. Owned resources cleaned up.

- Version 8 (2026-10-14): Fresh redispatch against 6572ff0dcf621b1677b26c862ff9426bbe34fc36; independently inspect preserved repairs, reproduce lower-Restore Reload, rerun all gates. Earlier results are historical, orchestrator ledgers remain untouched.

- Version 7 (2026-10-14): User unlocked the Mac and explicitly requested resumed browser verification and workflow completion. Actual repaired-UI acceptance passes on isolated synthetic storage; all 713 source fingerprints still match the 1,719-test/release/lint gates. Owned tab/server cleaned up.

- Version 6 (2026-10-14): Fresh four-layer follow-up review repairs Tracking badges, prerequisite selection and dependency history boundaries; adds populated board and corrupt-Restore regressions. Prior maintainer acceptance and timing exception remain historical. Fresh browser verification is unavailable.

- Version 5 (2026-10-14): Maintainer accepted Story 5.1 under a scoped 1,000 ms full-filter-reset budget and explicitly authorized its local commit plus Epic-5-only loop continuation.

- Version 4 (2026-10-13): Actual functional browser acceptance, four independent review layers and repairs completed; final unchanged source gates pass. Actual large-lane filter timing fails, so status remains blocked with retained measurements and one inherited deferred issue.

- Version 1 (2026-10-13): Planned from three source investigation agents and current Epic 5 contracts; no implementation or acceptance claim.

- Version 2 (2026-10-13): Implemented and checked staged diff; automated gates pass. Halted at step 03 verification on unavailable actual-browser controls; no independent completion review or final acceptance claimed.

## Historical initial run result

Status: blocked
Blocking condition: implementation verification failed — required actual-browser acceptance unavailable.

Implementation covers typed Card-owned dependency edges, pure named-cycle checks after selector resolution, human UoW/Agent ChangeSet commands, sequential selection/projection/persistence, deletion/version/history/live effects, copy/archive/Restore, all board badges and canonical modal controls. Parent read the complete unified diff and checked captured gate evidence. No commit/push, user-data mutation, sprint-status/deferred ledger edit/stage/revert or acceptance inference from bookkeeping.

Full canonical baseline: `0428e3187f9d339f0153782b69b26df906181571`.
Implementation staged-diff SHA256: `0ba8a9a9a9cf138f41d9c640cae06a54b64fd316318aaa8a82580193a5d4830a`; parent reproduced the implementation agent's digest after validation. No unstaged implementation difference. Complete parent diff: `/tmp/story-5-1-parent-verify.diff`.

Automated evidence on Node 24: exact full configured `corepack pnpm test` passed 1,691 tests (Scripts 82, Contracts 136, Core 261, Importers 7, Web 234, DB 356, Server 601, Performance 14). Final release verify passed Git/source hygiene, 121-capability parity, workspace typecheck/build; final lint and staged/unstaged whitespace checks pass. Subsequent test-only formatting/fixture type corrections passed MCP 29 and HTTP 2 focused reruns; application source stayed unchanged. Logs: `/tmp/story-5-1-final-tests-2.log`, `/tmp/story-5-1-final-verify-4.log`, `/tmp/story-5-1-final-lint-2.log`, `/tmp/story-5-1-final-surface.log`.

Matrix audit (all named files ran and passed in full configured output):

| Matrix row | Passing evidence |
| --- | --- |
| Set/unset | core `dependency-resolution.test.ts` dependent-only roots and transaction coalescing; DB `card-dependencies.test.ts` exact versions/history/live; HTTP `card-dependencies.test.ts` current baselines |
| No-op | core exact unchanged snapshot, duplicate external selector, absent unset and stale refusal; DB exact snapshot/Activity no-op; HTTP stale/current duplicate requests |
| Invalid identity | core self/missing/foreign-map/foreign-Project and alias self cases; HTTP typed self/foreign/missing refusals with exact preserved state |
| Cycle | core named multiedge/archived and creation-alias cycle rejection; DB cycle and rollback; HTTP named cycle refusal |
| Sequential proposal | core bind/create/unset selection closure and describe parity; HTTP immutable preview; MCP `complete-surface.test.ts` applied set/unset commands |
| Delete | core incident rows/surviving-owner versions/dependencies; DB incident cleanup and aborted deletion state/history rollback |
| Lifecycle | core archive/internal copy; DB actual remapped copy, file-backed Restore and scoped portable snapshot/DAG validation |

Web evidence: modal dependency tests 4 passing plus board-preview regression cover keys/counts on both endpoints, current baseline, pending/refusal/conflict UI, dirty title/Tiptap retention and focus. These are DOM/jsdom tests; they do not prove actual-browser mouse/keyboard acceptance or new UI timing budgets. Protected approval/apply and full selected-cut rollback remain subject to independent completion review; existing generic executor suites passed, but no browser lifecycle claim is made.

Required actual-browser check failed: root CUA inventory returned `apps: []`, `browsers: []`, and `The Mac is locked and automatic unlock could not unlock it`. Attempt to create IAB returned `Browser is not available: iab`. No acceptance Project/server/browser state was created. No screenshots or mouse/keyboard browser results were fabricated. Step 03 directs HALT when verification cannot be completed; step 04 independent review has not run and `review_loop_iteration` remains 0. Next authorized run must restore browser controls, execute isolated actual acceptance and then complete independent review and any resulting repairs/gates; this blocked result is not a completed story.

### Resume 2026-10-13

Maintainer explicitly authorized resuming browser acceptance and independent review with repairs. Root CUA now reports native apps and an available IAB; prior blocker is historical. Original intent/baseline remain unchanged, sprint-status.yaml remains orchestrator-owned. Resume at step03 Verify; implementation subagent already returned in the initial attempt.

### Actual browser acceptance 2026-10-13

Root CUA used Codex IAB against the source server and built UI at `127.0.0.1:44321`, backed solely by `/tmp/story-5-1-browser-resume.lsm/storymapper.sqlite`. Mouse add/remove and native keyboard select/add/remove were observed. Both endpoints updated their direction/count/keys in Discovery and Tree. A three-Card cycle was refused with `Dependency cycle: LSM-1 -> LSM-3 -> LSM-2 -> LSM-1.` and no extra edge. Unsaved title and Tiptap description survived edge changes; subsequent Save succeeded with the current dependent baseline.

Browser found and repaired two defects: bodyless DELETE conflicted with both Fastify parsing and the production JSON mutation security guard; DELETE now sends JSON `{}` and the native HTTP regression installs that actual guard. Keyboard removal lost focus when its button unmounted; successful removal now returns focus to the prerequisite select only when focus would be lost, with delayed-response tests preserving unrelated title/Tiptap focus. Both repairs were rebuilt and rechecked in the actual browser; final removal left the prerequisite select focused with drafts intact.

Protected `SubmitChangeSet` produced a proposal without mutating the canonical dependency state. Tree/Planning preview displayed the proposed adjacency; the canonical modal still showed the original prerequisite. Deselecting the earlier unset also excluded its dependent set. Human approval then Apply succeeded and closed the preview with the applied state visible. Evidence: `/tmp/story-5-1-browser-{cycle,tree,preview-planning,canonical-preview,applied,focus-fixed,mouse-remove,final}.txt` and `/tmp/story-5-1-browser-final.png`. Transport and focus regressions: `/tmp/story-5-1-delete-security-after.log`, `/tmp/story-5-1-remove-focus-tests.log`. Performance claims remain confined to executed configured performance tests; no new browser timing measurement is claimed. Independent completion review remains next.


## Historical resumed run result

Status: blocked
Blocking condition: patch verification failed — actual 1,000-Card filter reset exceeds the unchanged 300 ms budget.

Functional browser acceptance and all four independent review layers completed. The reviewed dependency implementation remains staged and uncommitted. JSON DELETE/security and removal-focus defects discovered in the browser were repaired and rechecked. Review repairs cover authorization of earlier scopes/new bindings, typed rejection auditing, Planning header badges, pending-write serialization, shared badge styling, reverse indexing and protected transport/history regressions. Scoped independent reviewers confirmed the repairs with no remaining changed-behavior defect. No commit/push, user Project mutation or sprint/deferred-ledger write/stage/revert occurred.

Initial review recorded 20 individual findings: eight medium and two low patched rows, grouped into seven medium and two low repair entries; five low and five false rejected rows retain their specific reasons above. The actual-browser transport/focus repairs precede those rows. One inherited medium performance issue is recorded in the spec's sole `deferred` list, never the orchestrator ledger. Follow-up review recommendation: false for the completed functional patches, whose scoped independent confirmations found no remaining unverified changed-behavior risk. The separate inherited filter gate remains blocked and any subsequent repair needs its own review.

Final reviewed-source automated gates: `corepack pnpm test` passed 1,705 tests (Scripts 82, Contracts 136, Core 261, Importers 7, Web 240, DB 357, Server 608, Performance 14). `node scripts/verify.mjs` passed Git/source hygiene, 121-capability parity, workspace typecheck and build; `corepack pnpm lint` and staged/unstaged whitespace passed. Logs: `/tmp/story-5-1-review-final-{tests,verify,lint}.log`. Subsequent temporary memoization was independently reviewed and passed 54 focused tests but failed to correct the timing gate; it is removed, rather than presented as a successful repair. Source identity is checked against the full-gate fingerprint after removal.

Actual acceptance uses only `/tmp/story-5-1-browser-resume.lsm/storymapper.sqlite`, the built UI and source server at loopback `127.0.0.1:44321`, with GitHub disabled. Parent CUA observed mouse and native keyboard add/remove, both endpoint badges, exact named cycle refusal, dirty title/Tiptap retention, focus restoration, immutable canonical detail during projected preview, operation selection closure, human approval and protected Apply. Final Planning Activity/Step and Story badges show the applied canonical edges. Evidence includes `/tmp/story-5-1-browser-review-planning.{txt,png}` and the earlier detailed browser artifacts above. Created-map coverage proves authorization, while the complete protected create/bind/dependency transport test uses an existing persisted map; raw Card creation map literals deliberately retain their existing contract. Portable-row and file-backed Restore tests do not claim a browser archive round trip.

Performance evidence uses a separate synthetic 1,000-Card/999-edge chain: one Activity, one Step and 998 Stories in one sortable lane. Temporary instrumentation in ignored built HTML observed a real input/click timestamp, the ensuing changed React DOM and two animation frames; it did not invoke application actions. Native `isTrusted=true` filter samples include narrowing to 368 matches in 124.7 ms after the unsuccessful memo attempt, but returning all 1,000 Cards took 650.2 ms. Before that attempt the visible reset took 604.8 ms (background sample 785.3 ms is also retained). A controlled temporary build omitting only dependency badge rendering still took 630 ms. A filter-panel click took 64.6 ms, within the 100 ms interaction budget. Modal-open latency was not successfully sampled, so no modal timing claim is made. Runtime records: `/tmp/story-5-1-browser-timings-{before,memo,without-badges}.json`; sampler source: `/tmp/story-5-1-browser-measurement.js`. Pure named-cycle validation took 0.53–2.33 ms and complete Restore validation 195–202 ms on this fixture; those measurements are not full Restore/export timings.

The existing sortable mounting path remains over budget and no supported, behavior-preserving trivial correction was identified. The skill requires HALT when patch verification fails; no acceptance or `done` is inferred from orchestrator bookkeeping. Resume after the existing board filtering issue is resolved and the actual unchanged budget passes; retain all failed measurements. Temporary instrumentation and owned runtime are cleaned up, with evidence retained.

Final cleanup verification: release `node scripts/verify.mjs` and `corepack pnpm lint` reran successfully after removing the attempt (`/tmp/story-5-1-resume-clean-{verify,lint}.log`); all 78 reviewed source/test/generated fingerprints match the 1,705-test gate exactly. Focused post-removal tests pass 54/54. Clean built HTML SHA256 matches the original reviewed build; no instrumentation node/script remains. Final actual browser console has no warnings/errors; final Planning screenshot and DOM saved, then the owned tab closed. Tracking hashes match the resume baseline and no tracking path is staged.


## Historical maintainer acceptance result

Status: done — accepted by the maintainer on 2026-10-14 with a scoped timing relaxation.

The completed implementation adds typed same-map acyclic Card dependencies, transactional dependent-owned versions, history/audit/live effects, shared human and protected Agent ChangeSet mutations, immutable preview, lifecycle persistence, related-key badges on both endpoints and accessible modal controls. Actual browser acceptance and four independent review layers completed; all functional findings were repaired and scoped independent confirmations found no remaining changed-behavior defect. The source remains identical to the 1,705-test/full-release/lint gate fingerprint. Detailed changed files and evidence are in the code map, triage log and historical run results.

Acceptance exception: the 1,000-Card full filter reset in the measured one-Activity/one-Step/998-Story lane may take up to 1,000 ms for Story 5.1. Observed original visible reset 604.8 ms and background reset 785.3 ms fit that relaxed bound. Temporary memo/control samples 650.2/630 ms remain historical diagnostics, not final-source measurements. The 100 ms board interaction budget, 200-node Graph budget, 2-second live-update budget and later-story requirements remain unchanged. The inherited optimization issue stays in this spec's single deferred list as debt; it no longer blocks acceptance. No orchestrator deferred ledger is edited.

Review totals remain 20 functional observations (ten patched rows in nine repair entries, ten rejected rows with reasons) plus one inherited medium performance finding. No new source change, test exclusion or optimization was needed for this acceptance decision. Follow-up review recommendation remains false for the independently confirmed functional repairs. Automated verification and actual functional browser evidence are unchanged and retained; the prior blocked decisions remain historical rather than rewritten as passing the original 300 ms budget.

Commit and execution authorization: the maintainer explicitly requests a local Conventional Commit and continuation only of Epic 5. Preserve sprint-status.yaml and deferred-work.md under orchestrator ownership: no manual writes, staging or reverts. No push. The old escalated attempt will be closed through the orchestrator CLI, then an Epic-5-only run will reconcile the accepted done spec through its normal review/gates and continue the remaining stories.

## Historical follow-up blocked result

Status: blocked
Blocking condition: patch verification failed — fresh actual-browser verification unavailable (Mac locked; IAB unavailable).

This invocation routed the existing done spec to a fresh four-layer follow-up review. Card dependency implementation remains intact; repairs add Tracking related-key badges, reset the prerequisite selector after successful addition, and preserve dependency history through subsequent ordinary Saves, including update-then-edge operations in one ChangeSet. Existing ordinary-save coalescing remains. New mounted consumer and corrupt-Restore regressions close verified gaps.

Files changed in this follow-up:

- `apps/web/src/features/releases/ReleaseKanban.tsx` — render shared directional dependency badges; `ReleaseKanban.test.tsx` — supply the required adjacency prop.
- `apps/web/src/features/story-map/views/TrackingView.tsx` — derive adjacency from the complete snapshot; `TrackingView.test.tsx` — assert both directions across archived and other-Release endpoints with a shared-schema Release fixture.
- `apps/web/src/features/story-map/components/CardDependenciesSection.tsx` — clear a successfully added prerequisite selection; `card-dependencies.test.tsx` — assert placeholder and disabled Add.
- `apps/web/src/features/story-map/components/lifecycle.test.tsx` — verify Discovery/Backlog keys with filtered and archived opposite endpoints.
- `packages/db/src/schema/tables.ts`, `connection.ts` — persist and initialize the internal dependency history marker.
- `packages/db/src/repositories/cards-repository.ts` — protect marked history while preserving subsequent ordinary-save coalescing; `card-dependencies-repository.ts` — mark direct edge and incident-owner writes.
- `packages/db/src/repositories/operation-persistence-repository.ts` — mark ChangeSet dependency history, including edge-only effects after an earlier same-cut Card update.
- `packages/db/src/repositories/root-versions.test.ts` — fixed-time direct/set/unset/deletion/ChangeSet/same-cut/reopen/column-initialization regressions.
- `packages/db/src/card-dependencies.test.ts` — refuse valid-FK foreign-map edges and malformed stored identity/timestamp.
- This spec and `.wolf/` handoff/bug/learning records — preserve all review verdicts, failures and the fresh runtime blocker.

Review: 18 individually triaged observations including two repair-verification discoveries. Nine patched rows share six repair groups (four medium, two low). Nine rejected rows retain their reasons in the follow-up triage log: six low coverage/extreme-scale observations had no demonstrated everyday behavior defect warranting more fixture/query complexity; three intent observations describe evidence granularity or retained maintainer decisions rather than a functional defect. Two prior evidence-granularity verdicts are carried. No new deferred entry; the original medium performance debt remains in the sole frontmatter list. Independent repair review confirmed the final history and UI source fixes without a remaining changed-behavior risk.

Follow-up review recommendation: false. This is a follow-up pass with zero high patch groups; four medium and two low groups were patched and independently inspected. This recommendation does not waive the unavailable actual-browser gate.

Final automated verification on Node 24.17.0:

- `corepack pnpm test`: 1,719 passed (Scripts 82, Contracts 136, Importers 7, Core 261, Web 243, DB 368, Server 608, configured Performance 14); exit 0. Log: `/tmp/story-5-1-followup-final-tests.log`.
- `node scripts/verify.mjs`: Git/source hygiene, 121-capability parity, workspace typecheck/build passed; exit 0. Log: `/tmp/story-5-1-followup-final-verify.log`.
- `corepack pnpm lint`: all workspace packages passed; exit 0. Log: `/tmp/story-5-1-followup-final-lint.log`. This is the same TypeScript check as typecheck.
- Focused web 34 tests, DB 102 tests and final same-cut/history/parity 82 tests passed. Fixed-time dependency-then-Save and ChangeSet-update-then-edge regressions each failed before repair with history [1,3], then passed with the preserved boundary. Initial lifecycle fixture remount/search failure and Tracking Release fixture typecheck failure are retained in buglog; final exact configured gates passed after correction.
- All 713 tracked source/test/tool fingerprints match the final test gate; manifest `/tmp/story-5-1-followup-final-fingerprints.json`. Whitespace and YAML frontmatter checks pass; the one original deferred item is preserved.

Fresh actual-browser preflight: root CUA returned empty apps/browsers and “The Mac is locked and automatic unlock could not unlock it”. Attempt to create an IAB returned “Browser is not available: iab”. No browser acceptance runtime or Project was created. No fresh mouse/keyboard, visual or UI timing result is claimed. The prior maintainer acceptance and scoped 1,000 ms filter exception remain historical and intact; they do not verify these follow-up repairs.

Current revision: `dd563747c6f4456b8790c5dc67681282407854d7`; original full review baseline remains `0428e3187f9d339f0153782b69b26df906181571`. Repairs and handoff are intentionally left uncommitted and unstaged at this blocked gate. No push, loop continuation, user-data change, or sprint-status/deferred-ledger write/stage/revert occurred. Resume this story after actual browser controls return, verify the repaired UI, then complete normal finalization.

## Historical version 7 Auto Run Result

Status: done

Resumed under the user instruction: “The Mac is unlocked now. Resume Story 5.1’s browser verification and finish bmad-build-auto.” Actual browser controls were available, and the repaired artifact passed fresh functional UI verification.

The completed Card dependency implementation and this follow-up's Tracking badges, prerequisite selection reset, persistent history boundary and added board/Restore regressions are retained. Four independent review layers produced the recorded 18 follow-up observations: nine patched rows in six groups (four medium, two low), nine rejected rows with individual reasons, no high group and no new deferral. Independent repair review confirmed closure, including same-cut ordinary update then edge-only effects. Follow-up review recommendation: false. The one inherited medium performance debt and all failed timing samples remain recorded.

Changed follow-up files and purpose: ReleaseKanban/TrackingView render full-snapshot directional badges; their tests cover both directions across hidden/other-Release endpoints. CardDependenciesSection resets successful additions; its test checks the DOM placeholder. lifecycle.test verifies populated Discovery/Backlog consumers. DB schema/connection persist and initialize dependency history metadata; cards/dependency/operation persistence repositories preserve history across later Saves and same-cut effects. root-versions and card-dependencies tests cover history/ordinary coalescing/reopen and malformed/cross-map Restore refusals. Exact paths and individual descriptions remain in Code Map and the historical follow-up result above. Spec and OpenWolf records preserve review/verification evidence.

Fresh actual browser acceptance used only `/tmp/story-5-1-followup-browser.lsm/storymapper.sqlite`, a separate copy of the previously authorized synthetic fixture, and the built UI/source server at `127.0.0.1:44322`; GitHub remained Off.

- Tracking initially rendered LSM-3's prerequisite LSM-1. Native keyboard addition of LSM-2 reset the prerequisite select to its placeholder and disabled Add while dirty title and Tiptap description remained. Ordinary Save committed both drafts at the current baseline. Read-only SQLite evidence confirmed marked dependency version 12 remains alongside ordinary Save version 13; `/tmp/story-5-1-followup-browser-history.json` records exact observed versions.
- Native keyboard removal returned focus to the prerequisite select. Mouse addition on LSM-2 created an incoming relationship to LSM-3 and reset its selector. Tree showed both endpoint directions; Tracking displayed `Depends on (1): LSM-1` and `Required by (1): LSM-2`, including after selecting the MVP Release while LSM-2 remained unscheduled and outside Tracking's Story inventory.
- Discovery showed the same complete keys after filtering to the one matching Story. Saved DOM: `/tmp/story-5-1-followup-browser-discovery.txt`. Tracking DOM/screenshot: `/tmp/story-5-1-followup-browser-tracking.txt` and `.png`. Actual browser console warnings/errors were empty. No new archived-endpoint, full archive round-trip, protected-preview or performance measurement is claimed by this scoped follow-up; their existing tests/earlier evidence remain accurately distinguished.

The repaired source remained unchanged through this resume: all 713 source/test/tool hashes match `/tmp/story-5-1-followup-final-fingerprints.json`. The completed exact configured gates remain valid: 1,719 tests passed, release Git/source hygiene/121-capability parity/workspace typecheck/build passed, and workspace lint passed. Logs are `/tmp/story-5-1-followup-final-{tests,verify,lint}.log`. No repeat full gate is necessary without source changes. Final whitespace passes.

Acceptance retains the explicit Story 5.1-only 1,000 ms full-filter-reset exception and the original failed 300 ms samples. No new timing claim or global waiver. Owned acceptance tab closed and server interrupted cleanly; no listener remains on 44322. The synthetic copy and evidence remain under /tmp; no user Project was opened or mutated.

Finalization follows the invoked workflow's local Conventional Commit of reviewed source/spec/OpenWolf paths, followed by clean-tree and reviewed-path verification. Original full review baseline: `0428e3187f9d339f0153782b69b26df906181571`; pre-finalization revision: `dd563747c6f4456b8790c5dc67681282407854d7`. No push or loop dispatch; orchestrator alone owns subsequent bookkeeping/continuation. Sprint-status.yaml and deferred-work.md were never written, staged or reverted, and their rows were not used as verification.

## Historical Auto Run Result — interrupted final build

Status: blocked.
Blocking condition: patch verification failed — fresh final-build browser gates incomplete because the Mac locked; IAB is unavailable.

Starting revision: `6572ff0dcf621b1677b26c862ff9426bbe34fc36`. Original review baseline: `0428e3187f9d339f0153782b69b26df906181571`. Preserved range inspected exactly as requested: commits `f5ee0f1` and `8e6720d`. Only independently judged source/test repairs were taken; preserved spec, OpenWolf and ledger evidence was not imported.

Implemented five minimal medium repair groups: dependency Reload accepts lower restored versions; selector changes clear obsolete failed requests; pending writes retain the modal and disable Discard; dependency operations ignore unrelated GitHub field conflicts; external archive/status pure resolution uses canonical resolved Map scope. Files: `CardDependenciesSection.tsx` and `CardDetailModal.tsx` implement UI repairs; `operation-conflicts.ts`, `entity-resolution.ts` and `card-command-resolution.ts` implement pure resolver repairs; focused dependency/selection/modal tests pin the reproduced defects. Existing lifecycle/live/HTTP/DB tests additionally exercise Not assigned badges, both endpoint remote updates, approval-time graph changes and exact deletion effects. No new public surface or production performance rewrite.

Review:22 individually triaged rows — five medium patches, eight rejected low rows (including carried verdicts), nine false/retracted rows. No high or new deferred item. Copy-selection suspicion was disproved by actual resolution. The transport new-Map gap was retracted after authorization rejected the intentionally unsupported creation chain; its temporary edits were removed. Independent repaired-source audit found no residual changed-behavior defect. Follow-up review recommendation:false (follow-up pass, no high patch); this does not waive incomplete browser verification.

Fresh final gates pass:1,732 configured tests (82 script +1,650 package tests), `node scripts/verify.mjs` Git/source hygiene,121-capability parity, workspace typecheck/build, and `corepack pnpm lint`. Logs:`/tmp/story-5-1-fresh-final-{tests,verify,lint}.log`. All725 tracked source/test/tool fingerprints exactly match `/tmp/story-5-1-fresh-final-fingerprints.json`; no source change occurred after those gates. YAML frontmatter retains one deferred item, and whitespace checks pass.

Fresh actual native Safari on isolated `/tmp/story-5-1-fresh-browser.lsm/` passed: keyboard prerequisite selection and mouse add with dirty title/Tiptap retained; ordinary Save at advanced baseline; mouse removal; native option-Tab/Space removal with selector focus restored. Actual Restore lowered mounted Card19 to18; add conflicted, changing LSM-2 toLSM-1 cleared dependency retry, Reload accepted18, retry succeeded19 and retained both drafts, then Save succeeded. Delayed-request harness proved clean Close remains mounted and dirty Discard disabled. A real concurrent update caused the late request refusal to remain visible; changing prerequisite to placeholder cleared only dependency retry controls while retaining the editor conflict.

Fresh protected ChangeSet native acceptance passed: projected Tree displayed LSM-3→LSM-2 while canonical modal still showed LSM-3→LSM-1; deselecting unset also deselected dependent set; exact selection was reselected, local human approval displayed, Apply committed and displayed the applied graph. Direct runtime reported live connected. Historical aggregate Restore/copy/archive tests are freshly executed by configured suites; no new complete browser archive round trip or browser-console measurement is claimed.

Timing harness records trusted input, board DOM mutation and two animation frames in `/tmp/story-5-1-fresh-timings.jsonl`. Earlier-in-this-attempt full1,000-Card/999-edge reset measured340ms (original300ms fail, within recorded Story5.1-only1,000ms exception); this was before the final-build timing repeat and is not substituted for it. Final-build100ms board interaction and repeated full filter reset remain unmeasured. Remaining native named-cycle refusal was interrupted before execution. On the next action CUA returned “The Mac is locked and automatic unlock could not unlock it”; IAB fallback returned “Browser is not available: iab”. Every required fresh browser gate has therefore not passed, and this attempt is blocked.

Owned44323/44324 proxy/server stopped; no listeners remain. One owned Safari acceptance tab could not be closed while locked; after unlock, close only that StoryMapper tab or reuse it for remaining acceptance. Disposable fixtures/evidence remain in `/tmp`, including `/tmp/story-5-1-fresh-browser-history.json`, restore records and fresh proposal. No user Project or external account was mutated. No commit, staging, push, loop continuation, or sprint/deferred-ledger write/revert. Both ledgers retain their initial SHA256:`12db6a8ee6202dbef08f34663075255877275f52c4a3b48c4bfbe4e0a1f45d36` and `a6deb9a64255bf9e59cea0ab24ec6b80e33278f38a7b65e4b456ab40de37cb94`. Orchestrator owns further dispatch/bookkeeping; resume after actual browser control returns.


## Browser completion on 2026-10-14

Maintainer explicitly unlocked the Mac and requested only the remaining browser verification and Epic 5 continuation. Same tested application: all 725 source/test/tool hashes match the passing 1,732-test, release and lint gates; checkpoint fecba85 introduced no later application change. Existing four-layer review and independent repaired-source inspection remain evidence, with no new feature implementation.

Root reused the exact disposable database /tmp/story-5-1-fresh-browser.lsm/storymapper.sqlite with loopback server 44324 and existing passive timing proxy 44323. Actual native Safari attempted LSM-1 -> LSM-3 on the applied LSM-3 -> LSM-2 -> LSM-1 graph. UI refused with `Dependency cycle: LSM-1 -> LSM-3 -> LSM-2 -> LSM-1.` Read-only database comparison retains LSM-1 version 1 and the existing two Demo-map edges; no proposed cyclic edge exists. This completes the previously interrupted named-cycle check.

On the final built 1,000-Card/999-edge map, native trusted filter input produced the one matching Story and its ancestor Cards in 12 ms. Native full reset rendered all 1,000 Cards in 346 ms: raw original 300 ms target fails, existing explicit Story-5.1-only 1,000 ms exception passes. Native Card click on the unfiltered map opened the expected modal in 214 ms (one observed sample, including DOM mutation and two animation frames). This is a real raw failure of the nominal 100 ms interaction target, not a pass. No source optimization or unapproved global waiver was introduced.

Durable synthetic-only measurement/domain proof: [story-5-1-resume-browser-proof.json](evidence/story-5-1-resume-browser-proof.json). Existing observer/raw log remain /tmp/story-5-1-fresh-observe.js and /tmp/story-5-1-fresh-timings.jsonl. Native cycle screenshot and AX capture remain locally at /tmp/story-5-1-resume-cycle.png and /tmp/story-5-1-resume-cycle-ax.txt; the full native screenshot is not committed because Safari chrome includes unrelated user tab labels. Evidence hash retained in the synthetic proof.

Owned Safari test tab was closed through its observed background-tab Close action after the user changed tabs; unrelated tabs were retained. Both owned proxy/server processes stopped; no listeners remain on 44323/44324. No user Project or external account was changed. Application source and orchestrator sprint/deferred ledgers remain unchanged.

## Historical timing decision request

Status at that checkpoint: blocked
Blocking condition then: actual browser Card opening took 214 ms against the nominal 100 ms target; maintainer decision requested.

All remaining functional checks are complete, and Mac-lock blockage is resolved. The loop remains paused while the new measured timing decision is pending. Do not falsely convert 214 ms to a 100 ms pass or apply the full-filter exception to another interaction without explicit authorization.

## Fresh redispatch verification — 2026-10-14

Baseline: `994710f3a6254485e9c0bba5424c05933ed67c0d`. The implementation subagent read the full spec and inspected source; no application change was needed or made. Fresh focused checks passed 116 tests. Parent read the complete baseline diff; only the orchestrator's spec re-arm and this workflow's spec metadata/evidence differ from HEAD.

Fresh Node 24.17.0 / pnpm 9.15.4 gates: `corepack pnpm test` passed 1,732 (Scripts82, Contracts136, Importers7, Core267, Web249, DB368, Server609, Performance14); `node scripts/verify.mjs` completed Git/source hygiene,121-capability parity,typecheck/build; standalone `corepack pnpm typecheck` and `corepack pnpm lint` passed. Logs: `/tmp/story-5-1-redispatch-20261014-{tests,verify,typecheck,lint}.log`. Matrix audit: all seven rows covered by executed passing core dependency-resolution18, DB card-dependencies8/root-history, HTTP card-dependencies4 and MCP complete-surface suites. No covering case skipped; source and assertions inspected.

Actual Chrome acceptance used only a fresh SQLite backup of the existing synthetic fixture at `/tmp/story-5-1-redispatch-20261014.lsm`, source server44324 and passive observer proxy44323. Mouse remove/add and keyboard Enter-add/Space-remove passed; removal focus returned to the prerequisite selector. Dirty title/Tiptap drafts survived all edge writes; Save succeeded at advanced baseline27. Tree displayed both endpoint keys; selected prerequisite reset after add. Native keyboard selection did not change the Chrome popup, so selection used the supported browser selectOption API; no native selection claim.

Actual cycle `LSM-1 -> LSM-3 -> LSM-2 -> LSM-1` was visibly refused, with LSM-1 still version1 and two valid Demo-map edges. Protected SubmitChangeSet remained proposed without an edge write. Tree projection showed LSM-3->LSM-1 while canonical modal retained LSM-3->LSM-2; deselecting unset excluded its dependent set. Reselection, human approval and Apply succeeded with canonical badges and closed-preview notice. Evidence: `/tmp/story-5-1-redispatch-20261014-{cycle,canonical-preview,applied,filtered}.txt`; cycle/applied screenshots remain local.

Passive observer records input/click, actual DOM mutation and two animation frames. Trusted typed narrowing produced one Story plus ancestors in15.6ms; trusted full reset892.9ms rendered1,000 Cards (nominal300ms fails; existing scoped1,000ms exception passes). Trusted Card opening observed Performance step in306.7ms, a raw nominal100ms failure; the recorded acceptance is specific to the prior214ms observation and does not accept this new306.7ms measurement. Fresh timing verification is therefore blocked; no numerical upper bound or global relaxation is invented. Earlier synthetic fill/paste timings were isTrusted=false and are diagnostics only (103.6/152.7ms narrowing,922.5ms reset). Raw log: `/tmp/story-5-1-redispatch-20261014-timings.jsonl`. Both accepted optimization items remain unchanged. The owned tab closed and owned listeners were stopped; no user Project or external account changed.

## Auto Run Result

Status: blocked
Blocking condition: implementation verification failed — fresh actual-browser Card opening306.7ms exceeds the nominal100ms requirement; recorded maintainer acceptance is specific to the prior214ms observation. Do not generalize it.

No application changes were needed or made. Existing Card-owned same-map DAG, versions/history/audit/live effects, shared Human/Agent ChangeSet surfaces, preview protection, lifecycle persistence and complete adjacency remain intact. Only this spec and OpenWolf handoff/evidence changed. Four independent reviews produced eight individually logged observations: zero application patch groups, zero new deferred entries, eight rejected narrative/spec findings with reasons above. Existing two deferred optimization items retained verbatim; follow-up review recommendation:false.

Fresh1732 configured tests, release hygiene/121-capability parity/typecheck/build, standalone typecheck/lint and all seven matrix rows passed. Actual isolated Chrome functional acceptance passed mouse/keyboard activation, dirty editor/current-baseline Save, both endpoint badges, named-cycle refusal, immutable protected proposal/preview, canonical detail, selection closure, human approval and Apply. Large-map trusted narrowing15.6ms and reset892.9ms recorded; reset fits the existing scoped1000ms exception while nominal300ms fails. Trusted opening306.7ms is retained as a failed gate, not newly accepted.

Durable synthetic-only evidence: [fresh redispatch proof](evidence/story-5-1-redispatch-20261014-proof.json). Source/build fingerprints, exact raw trusted/untrusted samples, final synthetic Card versions/edges and outcomes are retained there; raw logs/DOM/screenshots remain under/tmp. Browser tab and owned44323/44324 listeners closed. Initial blank-at-EOF whitespace defect from the re-arm was corrected; final whitespace check passes. No commit/push, user Project/external-account mutation, loop continuation or sprint/deferred-ledger write/revert. Orchestrator alone owns further dispatch and bookkeeping.
