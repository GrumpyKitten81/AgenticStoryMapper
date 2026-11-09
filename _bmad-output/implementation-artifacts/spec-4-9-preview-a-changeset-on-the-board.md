---
title: '4.9 Preview a ChangeSet on the board'
type: feature
created: '2026-10-12'
status: done
baseline_revision: f46913ddf7a30cc99c558cc587b8af5e7653d907
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: [oversized]
deferred: []
version: 4
---

Reproducing statement: Complete the interrupted Story 4.9 with actual browser acceptance, scoped completion-review repairs and independent verification; preserve orchestrator ownership and paused automation. Date: 2026-10-12. Version: 4.

<intent-contract>

## Intent

**Problem:** The UI lists truncated ChangeSet operations, without showing their effects in Tree/Planning or allowing complete contextual review.

**Approach:** Serve sequential selected-operation projections from the existing resolver through GET preview. Render these read-only boards and a shared complete operation review with server-closed selection, explicit lifecycle/conflict handling and human approval/apply.

## Boundaries & Constraints

**Always:** Contracts own shared API shapes. Core remains pure; repositories own data access. Use existing sequential resolution, dependency closure, immutable operations/baselines, executor and accepted approval/protection policy. GET preview is read-only, checks actual ownership/schema/lifecycle, returns indexed statuses, dependencies, labelled Before/After effects and resulting state. Server computes board projections, markers, removed ghosts and NEW-n keys; web never simulates operations or closes dependencies. Review all operation families without an Epic5 view. Words/glyph/color use DESIGN opaque pills; decorative glyphs aria-hidden and removed Cards visible struck through. Preserve card search, dirty editors, focus and held updates; incoming edits invalidate review/approval eligibility without silently advancing baselines. Selection changes require fresh approval. Failed apply stays open and explicitly names cause and nothing applied. Applied results remain reviewable through Activity. Use Node24.17.0; no commit/push in this run.

**Never:** Write, stage, restore or revert sprint-status.yaml/deferred-work.md; derive verification from sprint rows; touch user data; introduce client resolver, new domain operations, approval policy changes, provider/network dependency, compatibility adapter, automatic conflict skipping or benchmark tolerance. Preview grids cannot mutate simulated ids.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Board proposal | Card additions/edits/moves/removals and Release effects | GET current-state projection; Tree/Planning in-place markers, removed ghosts/lanes; NEW-n creations | No database/history/audit mutation by read |
| Full review | Source, Persona, Roadmap, customization, attachment and other supported effects, upsert | Every operation selectable with labelled Before/After; may change and implicit unarchive shown | No truncated list or future-view dependency |
| Selection | Deselect prerequisite then approve/apply retained selection | Server transitively excludes dependents, approval binds exact closure; apply skips excluded operations | Duplicate/unknown ids reject; no local closure; late responses cannot replace new selection |
| Conflicts | Drifted roots/source or invalid selected work | All indexed conflicts/status/cause visible, current board remains; no implicit skip or baseline update | Apply nothing atomically, review stays open; explicit deselect/resubmit |
| Lifecycle | Proposed/Approved/Applied/Rejected/Discarded/Stale/Conflict | Seven shared presentation labels, actual proposer/approver and policy; human controls retained | Restore-undone is Discarded with restore explanation, rejected remains reapprovable; schema-stale requires resubmission |
| Query closure | Applied/restore-undone/missing preview id | Activity-linked callout persists, only preview parameter removed | Preserve card and navigation state; historical input never executes |
| Incoming changes | Relevant commit/reset while review/dirty editor open | Review/approval eligibility invalidated immediately even when board refetch held; draft/focus survive | Explicit fresh review/approval, no automatic baseline repair |
| Parity/budget | Same selection and unchanged state; 1,000 Cards, 200 ops | Preview→approve→apply semantic state equal after normalizing allocated ids/keys/time; serial actual GET preview <=500ms | Preserve failures, no internal-only timing substitute |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/{change-set-schemas,operation-resolution,domain}.ts`, `http/` and package exports — six persisted statuses, typed OperationSnapshot/Description/changes and StoryMapSnapshot. Add shared preview request/response and seven presentation labels; derive Discarded only from real undoneByRestore, do not add discard mutation. Historical incompatible operations remain readable without current-schema parsing.
- `apps/server/src/application/changeset/preview-changeset.use-cases.ts` (new), `changeset.use-cases.ts` and `http/routes/changeset-routes.ts` — require actor; add GET descriptor/route. Approval/apply already support selected ids. Reuse actual owner checking from `mcp/tools/project-scopes.ts`, selected-operation scopes plus mandatory owning Project; existing persisted ids outrank aliases. No status/baseline writes in preview.
- `packages/db/src/repositories/operation-supply-repository.ts` — read-only getOperationSnapshot/prepareOperationSupply; `application/changeset/prepare-operation-supply.ts` prepares sources only for dependency-closed selected operations. Read/projection must preserve actor-sensitive source visibility through `visibleSnapshotSources`.
- `packages/core/src/changesets/{operation-registry,operation-dependencies,operation-conflicts}.ts` — resolveOperations supplies sequential changes, NEW-n, may change, unarchive. Selected output excludes deselected operations: synthesize excluded rows from server dependency metadata rather than executing them. Collect all conflicts before resolving. Strip per-op states from transport. Measure repeated full-state cloning before narrowly optimizing shared resolver for preview; no second engine.
- `apps/server/src/application/descriptors.ts`, `scripts/{generate-capability-manifest,check-capabilities}.mjs` and generated capabilities — register ordinary read route, regenerate/check existing capability artifacts.
- `apps/web/src/app/{api,router}.tsx`/`api.ts`, `routes/story-map-shell.tsx` — router currently retains only card; add preview, selection-specific query keys/cancellation. Shell owns persisted snapshot/editor; provide separate server board projection to Tree/Planning. Drop only preview after closed/missing callout with Activity link. Tab navigation preserves search.
- `apps/web/src/features/story-map/{useStoryMapBoardState,views/TreeView,views/PlanningView,components/TreeGrid,components/SwimlaneGrid,components/CardTile}.tsx`/`.ts` — Tree consumes shell state; Planning builds own. visibleCards removes archived/parked rows: explicitly render server tombstones, including hierarchy/Release lanes. Disable drag/edit/bulk on projection; mark headers/rows/tiles/lanes for all relevant levels.
- `apps/web/src/features/changesets/` (new cohesive review components/hooks), `features/ai-mcp/{AiMcpPanel,useAiMcpPanelState}.tsx`/`.ts` — replace truncated summary with shared complete review, board links, exact server selection approval/apply, actual identities and policy. Shared marker/status strings belong to `packages/ui-strings/src/`; styling uses existing tokens.
- `apps/web/src/app/live/{live-query-invalidation,useLiveUpdates,live-interaction-store}.ts` — pendingChanges signals commits before held refetch; reset needs explicit epoch/revision signal. Invalidate preview queries and local reviewed approval eligibility without replacing dirty CardDetailModal snapshot or remounting editors.
- Tests: core `operation-resolution.test.ts`, `operation-selection-regressions.test.ts`; db `operation-executor-persistence.test.ts`; server `historical-changesets.test.ts`, executor performance acceptance; web `lifecycle.test.tsx`, `AiMcpPanel.test.tsx`, `live-updates.test.tsx` and card-detail fixture patterns. Mounted tests use createRoot/act/jsdom + actual providers/strict fetch fixtures. Browser inspection uses a disposable loopback runtime and actual browser controls, never user database.
- Read-only: epic4 context/preparation/story-plan4-9 and completed4-8 continuity; global CLAUDE, AGENTS, matching .cursor and OpenWolf rules. Graph tools unavailable; source-based investigation by two agents verified anchors.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/` preview contracts/exports and tests — typed selection/projection/review/status surface.
- [x] `apps/server/src/application/changeset/`, `http/routes/changeset-routes.ts` and capability registration — read-only ownership/schema/lifecycle/closure/conflict projection using shared resolver; all selected and excluded review rows, server board ghosts/markers and source filtering.
- [x] `apps/web/src/app/{api,router,routes/story-map-shell}.tsx`/`.ts`, `features/changesets/` and AI panel — preview fetch, preserved query state, shared exhaustive review, exact approval selection and identity/policy controls, explicit errors/callout.
- [x] `features/story-map/views/` and grids/tiles/board state, UI strings/styles — server-only projection rendering in Tree/Planning, read-only operation markers and removed visibility.
- [x] `apps/web/src/app/live/` and review hook — immediate commit/reset invalidation preserving held updates/drafts/focus.
- [x] Server/core/contracts/web meaningful tests covering every matrix row, normalized preview/apply parity and serial actual200-op GET budget; inspect real browser Tree/Planning/full review/selection/failed/closed and dirty focus on disposable runtime.

**Acceptance Criteria:**

- Given a stored proposal, when GET preview and Tree/Planning open, then current database sequential effects render with all required words/glyphs/opaque pills, NEW-n Cards and visible removed Cards/Release lanes, without client resolution.
- Given any supported non-Card operation or upsert, when review opens, then all rows have accessible selection and labelled Before/After; may change/implicit unarchive remain explicit.
- Given deselected prerequisites, when server responds then approval/apply run, then only the server-closed selected set executes and changes of selection require fresh approval.
- Given drift, schema staleness or failed apply, when review continues, then explicit statuses/causes prevent silent partial execution; stale resubmission differs from ordinary conflict.
- Given incoming edits/reset and a dirty focused editor, when preview is invalidated, then approval eligibility clears immediately and text/focus survive held board updates.
- Given closed/missing preview search, when opened, then an Activity-linked callout explains closure and only preview is removed; applied history remains reviewable.
- Given unchanged state and selected200-op fixture, when actual GET preview then approval/apply run, then normalized semantic state matches and preview meets500ms serial bound.

## Spec Change Log

- Version4 (2026-10-12): Resumed browser acceptance; three completion-review lenses identified scoped server/web defects, repaired with meaningful regressions. Frozen intent unchanged. Browser bridge now works; no loop, cron, commit or push restarted.

- Version3 (2026-10-12): Implemented server-only projection and shared review. Measured repeated resolver cloning exceeded the unchanged500ms GET bound; descriptions remain immutable while preview/submission/executor/persistence omit unused intermediate states. Public resolver validation remains intact. Added scoped audit association for historical Before/After. Reproduced and repaired pending-selection loss; added actual-shell/dirty-editor/late-response tests. Intent contract unchanged.

## Review Triage Log

Completion review on 2026-10-12: three independent reviewers inspected the full implementation diff; each reported finding is recorded below. Source verification preceded repairs. Two independent cross-reviews subsequently found no blockers in the repaired server/web boundaries.

| Finding | Verdict | Evidence / disposition |
| --- | --- | --- |
| Blind 1: untouched hidden Cards exposed | medium | Server included all state Cards while preview bypasses normal visibility. Patched to visible resulting Cards plus explicit removal ghosts; archived/parked hierarchy regression passes. |
| Blind 2: move followed by edit loses marker | medium | Later changed marker overwrote moved. Preserve moved across subsequent content changes; sequential regression passes. |
| Blind 3: all Project marker metadata on each board | low | Consumers match entity and ID, so foreign markers cannot mark local rows. Metadata duplication has no demonstrated bound failure; reject additional filtering complexity. |
| Blind 4: nonexecuted historical rows labelled unchanged | medium | Partial apply retained no excluded status. Execution selection now determines excluded rows; actual HTTP partial-apply regression passes. |
| Blind 5: closed preview scans full Activity | maybe-false | Source confirms full history lookup and per-operation search, but no history-heavy latency failure was measured. Defer medium/unverified performance concern; a large-history historical-preview benchmark would settle it. Existing proposed-preview bound passes unchanged. |
| Blind 6: failed preview loses refresh control | medium | Error branch returned alert only with query retry disabled. Explicit retry survives errors; recovery regression passes. |
| Blind 7: reopened partial approval selects all | medium | Default cut ignored stored approval. Omitted selection now uses the approved cut; actual HTTP reopen regression passes. |
| Blind 8: stale Reject enabled | medium | Stale response remains open while repository refuses its mutation. Disable stale Reject and selection; mounted regression passes. |
| Blind 9: uncertain apply claims nothing applied | medium | Transport/JSON failure can follow a commit. Refetch current history; distinguish confirmed HTTP refusal, confirmed applied history and unknown outcome, and disable immediate retry. Transport/JSON/server outcome regressions pass. |
| Blind 10: submitted patch presented as resolved effects | medium | Empty changes used submitted before/after despite missing resolved state. Separate submitted intent from explicit unchanged/excluded/unavailable effect labels; mounted regressions pass. |
| Edge 1: hidden Cards | medium | Same verified cause as Blind 1; same repair/test. |
| Edge 2: move marker overwritten | medium | Same verified cause as Blind 2; same repair/test. |
| Edge 3: GitHub-disabled Apply enabled | medium | Preview omitted the executor's existing GitHub safety check. Eligibility now matches the execution guard; actual 403/no-write regression passes. |
| Edge 4: stale Reject enabled | medium | Same verified cause as Blind 8; same repair/test. |
| Verification 1: shell projection wiring unproved | medium | Board tests bypassed shell; shell fixtures reused live state. New real-router Tree/Planning tests assert differing projection/markers and selection effects. Both fail when a temporary transform removes projection lookup, and pass on final source. |
| Browser follow-up: cancelled initial read stranded | medium | Initial live reset with held dirty editor cancelled the no-data preview, leaving Loading without a control. Explicit refresh also survives no-data cancellation; cancellation/recovery regression passes. |

## Design Notes

Persisted lifecycle remains unchanged. Shared presentation derives Discarded for restore-undone history with explanation, retaining Rejected re-approval. Keep immutable stored selection/operations separate from local review request: fresh projection never updates submitted versions. Incoming commit invalidation must occur even while existing live refetch is held. Server responses carry renderable map snapshots/tombstones/marker metadata; client may group/render returned rows but cannot infer effects or run dependency closure. Per-operation full snapshots are internal resolver evidence, not duplicated wire payloads.

## Verification

Prefix all commands with `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH`:

- `corepack pnpm --filter @storymapper/contracts test` — schemas/status/selection pass.
- `corepack pnpm --filter @storymapper/core test` — shared resolver/dependency/parity regressions pass.
- `corepack pnpm --filter @storymapper/server test` — actual GET readonly/owner/conflict/selection/parity and serial200-op preview measurement pass.
- `corepack pnpm --filter @storymapper/web test` — mounted review/boards/query/accessibility/held dirty focus tests pass.
- `corepack pnpm test` — all configured scripts/package suites pass; run serially with release verification.
- `node scripts/verify.mjs` — hygiene/parity/workspace typecheck/build pass. Portable fixtures use git ls-files: stage explicit new story source/spec paths first, never orchestrator ledgers. Staging grants no commit permission.
- `git diff --check` and `git diff --cached --check` — clean whitespace; confirm sprint/deferred paths absent from story staging.

Real browser checks: use disposable loopback Project, inspect both board projections/all operation review, selection/fresh approval, failed/closed callout/Activity and preservation of dirty editor/focus. Record observed evidence; do not claim unperformed scenarios.

## Changelog

- Version4 (2026-10-12): Real-browser acceptance, completion review and all final automated gates passed. Status done; no new commit/push or loop/cron resume.

- Version3 (2026-10-12): Implementation and independent automated gates complete; run blocked on required actual-browser acceptance, before workflow completion review.

- Version1 (2026-10-12): Source-verified complete implementation plan preserving orchestrator ownership and accepted preview/approval semantics.

## Auto Run Result

Status: done
Blocking condition: none for Story4.9 acceptance. The previous browser bridge failure did not recur in this desktop session. The stopped loop still retains its historical escalation and the Cron remains paused; neither was resumed or edited.

Completion review: three independent lenses, 15 individual findings plus one actual-browser cancellation follow-up, all recorded above. Scoped server/web repairs passed independent cross-reviews. One medium/unverified large-history historical-preview latency concern remains deferred in this spec; no measured bound failure or unresolved functional blocker. Graph tools were unavailable; source and relevant tests were read directly.

Final unchanged-source verification:

- All configured package suites PASS1482: Contracts122, Core235, Importers7, DB349, Web221, Server537, serial Performance11. Command `corepack pnpm -r test`, log `/tmp/storymapper-4-9-resume-packages.log`.
- Scripts PASS82, zero skips/failures: `node --test scripts/*.test.mjs`, log `/tmp/storymapper-4-9-resume-scripts.log`. Together these execute every configured root-test suite: total1564. The initial root `pnpm test` failed only because an unrelated live launcher occupied4317; the user explicitly authorized its graceful shutdown before the unchanged script rerun. No test/bound was weakened.
- `node scripts/verify.mjs` PASS source/release hygiene, capability parity, workspace typecheck/build. Log `/tmp/storymapper-4-9-resume-verify.log`. Existing Vite bundle-size advisory remains.
- Actual serial1000-Card/200-operation GET preview268.736333/230.771833/227.311375ms, all<=500ms; HTTP read-only bytes and normalized preview/approve/apply semantic parity pass. Existing actual registered200-operation MCP apply performance tests pass their unchanged bounds.
- Final focused server19 and web15 cross-review checks pass. Real-router Tree/Planning projection mutation check fails both new tests when the projection lookup is removed, and passes on final source.
- Final whitespace checks pass. No commit or push was requested; changes remain uncommitted. The previous implementation is preserved by11e7d89. Sprint/deferred ledgers were neither written, staged nor restored/reverted; no tracking row was treated as verification evidence.

Actual-browser acceptance on isolated SQLite backups of the retained disposable fixture, never user databases:

- Tree/Planning projection, all seven complete operation rows with labelled Before/After, actual proposer, NEW-1/New/Moved/Removed markers, removed Card and Release lane, disabled Planning P/V/E and selection controls observed.
- Deselecting create server-closes dependent update/delete; excluded rows remain visible. Approve records human local-user. Changing the cut disables Apply until fresh approval. Actual partial Apply persisted only edit/lane/annotation, kept excluded Card work untouched, removed only preview from URL and displayed the Activity callout.
- Final-source renewed approval/full Apply succeeds; Activity reopens Applied history with complete Before/After. Applied and missing preview URLs preserve the existing card parameter; closing the card reveals the persistent Activity-linked missing callout.
- Dirty persisted CardDetailModal title/Tiptap drafts and editor focus survive a real Card save from a second browser tab with held updates, and an actual Restore all Projects reset. The browser observed pending updates and blocked review eligibility. Initial cancellation exposed and verified the explicit no-data refresh repair.
- Stopping only the owned disposable server before Apply produces an explicit unknown-outcome/review-current-state message; review stays open with recovery. SQLite still held approved status and original Card contents. After server recovery, renewed review/approval/full Apply succeeds. Ambiguous transport is not represented as confirmed rollback; confirmed refusal/atomic failure paths are exercised by actual server and mounted outcome regressions.
- Screenshot proofs: `/tmp/storymapper-4-9-dirty-editor-proof.png`, `/tmp/storymapper-4-9-applied-proof.png`. No live GitHub/provider claim.

All eight matrix rows have executed automated coverage; actual browser requirements above are now observed. Disposable fixture copies and logs are retained under the temporary directory. User explicitly approved discarding the unsaved acceptance drafts; both test tabs are closed. Owned disposable server44319 and Vite5173 are stopped, with both ports verified free. Existing live launcher was gracefully stopped under explicit user instruction; it was not restarted. The loop's historical escalation needs its own operator reconciliation before a later authorized orchestration wave.
