---
title: '6.9 Manage Releases and read their summary'
type: feature
created: '2026-10-17'
version: 2
status: done
baseline_revision: a2f001ed1e1c13464b0519c0006d41cdb9e4557d
review_loop_iteration: 0
followup_pass: true
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      Full native accessibility and forced-failure/inactive-map Restore acceptance remain unverified.
    evidence: |-
      Native Safari exercised full fields/create/reopen, dirty Cancel, actual409/Keep mine, released scope across list/Planning/Tracking/Discovery and actual server restart/reloaded editor. Focused routed and delayed/failed Restore DOM tests cover repaired boundaries. Final native build also passed real MCP proposal projection, readonly controls, Close preview, actual dirty-editor Restore reset, restored fields and subsequent versioned Save. Full screen-reader, zoom, forced-colors/WCAG and native forced delayed/failed inactive-map Restore checks remain unverified; DOM/live regressions plus independent source recheck cover those races. Safari lost its window handle at final cleanup; the owned server is stopped.
    location: >-
      apps/web/src/features/releases; apps/web/src/app/live/useLiveUpdates.ts
    severity: medium (unverified)
---

Reproducing statement: Run bmad-build-auto for Story6.9 using accepted Epic6 preparation and story-plan6.9, with subagents and independent verification. Never write or revert orchestrator-owned sprint-status.yaml; bookkeeping does not prove acceptance. Date:2026-10-17. Version:2.

<intent-contract>

## Intent

**Problem:** Release creation exposes only name, complete versioned editing is missing from the Release area, and delivery summaries omit status distribution and unestimated Story identities. The Release list also defaults to released items being visible and hides failed report reads behind local fallback numbers.

**Approach:** Complete existing Release fields and versioned editing, enhance the canonical report and shared presentation, and consistently default list/Planning/Tracking to open Releases with explicit show-all and Unscheduled access.

## Boundaries & Constraints

**Always:** Apply accepted5A and Epic6 preparation/story-plan6.9. Contracts are the schema source, core pure, repositories own persistence and actor-aware application commands own transactions/audit/events. Count/sum/status/list use visible Stories only, excluding parked/archived ancestry and Notes/Activities/Steps; estimate0 is estimated. Use existing name/goal/startDate/releaseDate/released:boolean, root baseVersions and acknowledged version chaining. Nonhuman writes produce ChangeSets with separate auditable Apply; preserve established command safeguards and preview read-only behavior. Keep assignments/history intact when filtering released items, preserve Discovery lanes and existing moves/bulk Card versions. Use existing Dialog/conflict/announcement components, English strings, live holds, Restore-epoch/scope lifetimes and query invalidation. Retain dirty drafts and show refusals. Run on installed Node24. No commit/push without explicit user request; leave reviewed work staged.

**Never:** Write/stage/revert sprint-status.yaml, deferred-work.md or orchestrator state; infer acceptance from them; mutate user Projects or live GitHub; add a lifecycle enum/endDate column, alternate calculator, silent numeric fallback, new SaaS/schema migration framework, unrelated Epic6.10 or deferred Graph work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Complete Release | Create/edit name, goal, startDate, releaseDate, released | Supported fields persist, reopening/restarting retains them; update uses captured root version | Invalid fields visibly refused; draft retained; duplicate pending submissions prevented |
| Concurrent editing | Dirty Release draft, incoming newer root/version | Explicit409 with existing Reload/Keep mine decision; own acknowledged writes advance baseline | No automatic stale rebasing or partial write; non-conflict failures visible |
| Canonical delivery | Estimated incl0, unestimated Stories; Notes/parents and parked/archived ancestors; custom statuses | Exact visible-Story count/sum/status counts and every unestimated id/key/title, same report calculation across Release/Tracking | Empty lists/counts explicit; report read pending/errors visible, no misleading fallback |
| Released display scope | Open/released/Unscheduled Cards | List/Planning/Tracking default open, explicit show-all reveals released; assignments/history unchanged, Discovery preserved | Scope transitions remain explicit; preview stays readonly and projected |
| Assignment refresh | Drag/form/bulk Release assignment with Card versions | Accepted mutation bumps Cards and invalidates Release/Tracking summary; canonical persisted report agrees | Stale commands refuse without partial effects |

</intent-contract>

## Code Map

- `apps/web/src/features/releases/ReleaseEditor.tsx`, `ReleaseEditor.test.tsx`: complete captured-version editor with explicit conflict decisions, pending admission and suspended dirty-draft retention.
- `apps/web/src/app/live/live-interaction-store.ts`, `useLiveUpdates.ts`, `live-updates.test.tsx`: server epoch changes invalidate Release draft lifetimes; ordinary live transactions and same-epoch resets retain drafts.

- `apps/web/src/features/releases/ReleasePanel.tsx:19`: name-only create and all-release list; local numeric fallback to remove. `ReleasePanel.test.tsx` currently asserts fallback, replace with pending/error expectations. `ReleaseSummary.tsx` shared by Panel/Kanban; add status distribution/unestimated list once. `app/routes/story-map.releases.tsx` supplies snapshot and should forward estimationUnit.
- `features/releases/ReleaseDateFields.tsx:17`, `ReleaseDateFields.test.ts`: existing versioned date/conflict pattern used by Timeline; preserve it while sharing editor pieces only where useful. `components/Dialog.tsx`, `features/conflicts/ConflictAlert.tsx`, `useLatestVersions.ts` provide established behavior. New full editor component may keep Panel small; lifetime keyed to map/Release/epoch, holds while dirty/pending.
- `apps/web/src/app/api.ts:345,562`: useReleaseSummary query key/URL; existing complete updateRelease, create request needs released field support. `features/releases/release-utils.ts`, `features/story-map/card-query-invalidation.ts`: central invalidation for Release/Card assignments and related reports; preserve live holds.
- `packages/contracts/src/schemas/domain.ts:416`: one ReleaseSummaryReport schema, add required unestimated Story id/key/title array. `api/application-responses.ts:41`: report input. `api/card-customization.ts:168`: create request currently excludes released. `mcp/tool-inputs.ts`, `mcp/tools.ts`: report scope input; keep HTTP/MCP parity and generated capabilities current.
- `packages/core/src/reports/reports.ts:27`: existing canonical eligibility correct including0; extend list and prototype-safe status accumulator. Add optional includeReleased report display selection (default all for existing all-scope callers); filter after visibleCards(full ancestry), scope aggregate to open when requested. Keep exact explicit Release/Unscheduled semantics. `reports.test.ts` covers mixed rows/scopes/custom statuses.
- `apps/server/src/application/report/report.use-cases.ts:21`, `http/routes/report-routes.ts:22`, `mcp/tools/register-content-tools.ts:49`: forward contract-validated display scope to existing report, no new endpoint. `packages/db/src/repositories/releases-repository.ts`: persist create released if supported, retain versioned updates. `packages/core/src/changesets/*release*` and operation schemas/resolver: verify equivalent proposed create fields are not dropped.
- `apps/web/src/features/releases/ReleaseKanban.tsx:30`, `features/story-map/views/TrackingView.tsx`: already open/show-all with full-snapshot canonical calculation; reuse enhanced summary and canonical scope, retain preview ghosts/removal eligibility and projected readonly behavior. `components/SwimlaneGrid.tsx:26` already hides released lanes with show-all and retained DOM; preserve traversal/drop safety. `BoardToolbar.tsx` assignment destinations must not be removed by display filtering.
- Relevant evidence/tests: web `ReleasePanel.test.tsx`, `ReleaseDateFields.test.ts`, `ReleaseKanban.test.tsx`, `views/core-views.test.tsx`; DB `release-report-data.test.ts`; server report/Release routes and MCP tests; contracts/core request/resolver tests. Graph CLI search narrowed ReleasePanel; source wins over stale graph. Prior6.8 scope/dirty/conflict repairs remain unchanged. Current legacy-only GitHub risk input mismatch is a pre-existing6.6 deferral, not license for broad sync changes.

## Tasks & Acceptance

**Execution:**
- [x] ReleasePanel/editor/strings/API and create contract/repository/resolver paths above: complete accessible create/edit fields and released action, captured versions, pending/error/conflicts and scoped draft lifetime.
- [x] Shared report schema/core/application/HTTP/MCP above: unestimated identities, exact statuses incl arbitrary persisted names, explicit open aggregate selection with validated query/cache identity, no local error fallback.
- [x] Shared ReleaseSummary/Panel/Kanban/route/invalidation above: consistent summary presentation and units, default open list/show-all/Unscheduled, preserve Planning/Tracking existing display/assignments/preview behavior.
- [x] Relevant web/core/DB/contracts/server tests above: execute all matrix rows, including invalid/pending/failure/409 reload/keep-mine,0, excluded ancestry, special status keys, open/show-all, assignments and persisted reopen. Use disposable public HTTP/MCP/repository fixtures only.

**Acceptance Criteria:**
- Given the Release area, when a user creates/edits supported fields or marks released, then every field persists through versioned commands and stale edits require explicit conflict resolution.
- Given Stories, when assigned by drag/form/bulk, then their Card versions advance and Release/Tracking summaries refresh to canonical persisted totals.
- Given a mixed map, when reading Release/Tracking summaries for the same scope, then visible-Story totals/status distribution and all unestimated identities agree, with0 estimated.
- Given released items, when opening default Release list/Planning/Tracking, then open scope excludes them and an explicit show-all reveals them without assignment/history mutations; Unscheduled stays accessible and Discovery lanes remain.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass 1

- verdicts:20 findings — high2, medium13, low0, false4, maybe-false1.
- findings:
  - `[medium]` `[patch]` Edge1, Release preview never becomes ready — Shell projection whitelist excludes /releases; adding it connects the existing provider. Shared with Blind1 and VG2.
  - `[medium]` `[patch]` VG1, Save success lacks mounted list/report adoption proof — Filed consumer search confirms isolated request assertions and helper tests miss editor invalidation. Add mounted save→refetch/list/summary adoption; shared with Blind9.
  - `[medium]` `[patch]` VG2, Actual Release preview route lacks consumer verification — Direct Panel previewReady props bypass shell whitelist and route forwarding. Add actual routed projection/loading/read-only/draft regression; shared with Edge1/Blind1.
  - `[medium]` `[patch]` Blind1, Release projection route omitted — Verified shell route condition omits Releases; shared with Edge1/VG2.
  - `[medium]` `[patch]` Blind2, Projected summary counts retained removal ghosts — ReleasePanel sends every projected Card to builder without preview removal markers, unlike Tracking; exclude removed IDs after preserving ancestor eligibility.
  - `[medium]` `[patch]` Blind3, Suspended clean editor adopts projected Release values/version — Editor effect lacks suspended guard; route passes displayed releases so clean fields/version can become proposal values and refuse canonical downgrade. Keep canonical editor props.
  - `[medium]` `[patch]` Blind4, Timeline failed draft blocks Restore refresh indefinitely — New dirty marker holds flush, while Timeline date editor lacks actual-epoch lifetime reset. Same epoch/admission boundary repair as Blind6.
  - `[medium]` `[patch]` Blind5, Second date success masks failed first date write — change only sends the latest patch; onSuccess removes error while earlier displayed date stays unpersisted and hold remains. Submit complete retained dates.
  - `[high]` `[patch]` Blind6, Restore permits reopening cached pre-epoch Release before refresh — recordEpoch remounts immediately before held authoritative reset refresh, allowing stale fields and overlapping root versions to be captured. Disable Release admission until successful epoch refresh; shared boundary group with Blind4.
  - `[medium]` `[patch]` Blind7, Background report refetch leaves unlabeled stale totals — Panel uses data without isFetching while Query retains populated cache after invalidation. Show refreshing status during actual delayed refresh.
  - `[medium]` `[patch]` Blind8, Failed report scope has no direct retry — Hook disables focus/reconnect refresh and error branch lacks refetch control. Add named retry bound to current scope Query refetch.
  - `[medium]` `[patch]` Blind9, Create success lifecycle lacks mounted consumer proof — Editor rejection test does not prove close/hold release/list/refetch. Same adoption test group as VG1.
  - `[medium]` `[patch]` Blind10, Assignment evidence proves endpoint rereads rather than mounted refresh — HTTP tests explicitly GET reports; existing UI tests separately simulate controls. Add connected mutation/query adoption regressions; shared with Intent2.
  - `[false]` `[reject]` Intent1, Editor component tests alone omit native HTTP workflow — Parent actually exercised native full fields/create/reopen, dirty Cancel, real external409, Keep mine and released action against disposable TCP server; native-acceptance.json records limits separately.
  - `[medium]` `[patch]` Intent2, Actual assignment and visible refresh exceed direct endpoint tests — Same verified consumer coverage gap as Blind10; connected form/move/bulk mutation adoption tests supply missing boundary, no native drag claim.
  - `[false]` `[reject]` Intent3, Cross-view defaults depend mainly on inherited regression suites — Parent native list/Planning/Tracking default/show-all and Discovery retained released lanes verify those current inherited surfaces; canonical scope builder and existing suite also ran.
  - `[false]` `[reject]` Intent4, DB reopen does not prove reopened application fields — Parent stopped/restarted actual server, compared exact Cards/Releases and reloaded native application, then opened editor and verified name/goal/dates/released state; native-acceptance.json.
  - `[false]` `[reject]` Intent5, API all default differs from a broader possible open default — Accepted intent specifically names default Release list/Planning/Tracking display scopes. UI explicitly sends false; exact report Release/Unscheduled semantics are intentional and tested.
  - `[maybe-false]` `[defer]` Intent6, Complete native accessibility and combined acceptance remain unverified — Native dates/dirty/conflict/released/default/show-all/reopen were exercised; full screen-reader/zoom/forced-colors/WCAG and final repaired combined preview/Restore flow remain unproved. Native combined flow plus manual accessibility checks would settle this medium-if-true boundary.

  - `[high]` `[patch]` RepairCheck1, inactive cached map/Timeline retains pre-Restore roots after active refresh — independent incremental source check found default invalidation refetches only active queries, while cached map B is usable during delayed/failed reads. Evict stale inactive epoch caches before admission completes; same epoch-boundary group as Blind4/6. The in-progress parent gate was stopped and retained separately before this repair.

Four lenses launched before triage; agent limit required queuing the fourth until a slot opened. Verification reviewer reused a read-only investigator because the fresh launch hit the limit; blind/edge/intent reviewers were context-free. Fifteen patch rows form nine groups:1high/8medium (routed projection, removal ghosts, canonical suspended draft, epoch admission/date lifetime, full retained dates, refresh status, retry, save adoption, assignment adoption). All groups repaired with focused tests; final parent root2375tests and release verification pass; independent incremental check then found/fixed inactive-cache admission and confirmed the repair. Frozen intent unchanged.

### 2026-10-17 — Review pass (follow-up)

- verdicts: 29 findings — high 0, medium 0, low 17, false 7, maybe-false 5
- findings:
  - `[low]` `[reject]` Blind1, report keeps scope `all`/"All releases" when includeReleased=false — label is not rendered by any web consumer and callers choose the flag explicitly; fix would add a schema field.
  - `[false]` `[reject]` Blind2, API default includes released while UI defaults open — Design Notes fix API default as all-release semantics and the UI always sends the flag; preview showAll is intentional.
  - `[false]` `[reject]` Blind3, server restart changes epoch and silently drops drafts — epoch is persisted in database_metadata and changes only on Restore, where draft discard is the required Restore-epoch lifetime.
  - `[low]` `[reject]` Blind4, no retry after a failed post-Restore refresh — failure surfaces through the existing live failure report and reload/reconnect re-requests the refresh; a retry control is new UI.
  - `[low]` `[reject]` Blind5, restore-pending notice repeated per date row — cosmetic; the per-row notice is the only one on the Timeline surface.
  - `[low]` `[reject]` Blind6, ReleaseDateFields and ReleaseEditor duplicate draft/conflict wiring — real divergence risk but the fix is a hook extraction beyond a direct correction.
  - `[low]` `[defer]` Blind7 and Edge4, no start<=release ordering check — contract never enforced ordering and Timeline already accepted inverted ranges before this story; intent names no ordering rule.
  - `[maybe-false]` `[reject]` Blind8, statusCounts z.custom is opaque to schema export — no JSON-schema export of this contract found, and it would only be low; custom check is the intended `__proto__` support.
  - `[low]` `[reject]` Blind9, unestimated list not linked or capped — nice-to-have beyond the intent.
  - `[low]` `[patch]` Blind10 and Edge7, orphaned panelStrings.kanban/newReleaseName — grep confirmed no consumer; deleted both lines.
  - `[low]` `[reject]` Blind11, test title and inline stubs — cosmetic.
  - `[low]` `[reject]` Blind12, no DESIGN comment — comment-only, the spec Design Notes hold the decision.
  - `[false]` `[reject]` Blind13, delete/reorder/archive missing — intent covers create, edit and released only.
  - `[low]` `[reject]` Blind14, positional optional parameters — style, fix is a signature refactor.
  - `[low]` `[patch]` Edge1, `__proto__` status row dropped by TanStack structural sharing on refetch — verified replaceEqualDeep assigns `copy["__proto__"]` which is ignored for numbers; set `structuralSharing: false` on useReleaseSummary.
  - `[low]` `[reject]` Edge2, preview fetch error leaves the panel loading — the shell shows the error with Close preview; fix adds a new fallback branch.
  - `[false]` `[reject]` Edge3, editor vanishes if its Release is removed — the dirty-draft live hold defers the board update that would remove it.
  - `[low]` `[reject]` Edge5, same as Blind1.
  - `[maybe-false]` `[reject]` Edge6, z.custom message generic — cosmetic, only low if true.
  - `[low]` `[patch]` VG1, no test for a reconnect `ready` with a changed epoch — added a live-updates test asserting restoreRevision, restorePending and its clearing.
  - `[low]` `[patch]` VG2, eviction test omits inactive release-summary cache — seeded a release-summary key and asserted it is evicted.
  - `[false]` `[reject]` Intent1, Planning/Kanban defaults only inherited — carried from pass 1 (Intent3): native list/Planning/Tracking default and show-all were verified.
  - `[false]` `[reject]` Intent2, Tracking summary computed locally — carried design: Tracking uses the same pure builder over its authoritative snapshot (Design Notes).
  - `[maybe-false]` `[reject]` Intent3, invalidate-and-agree not one end-to-end test — pass 1 added mounted adoption tests; descriptive only.
  - `[false]` `[reject]` Intent4, ChangeSet path tested server-side — descriptive, covered by MCP/Apply tests.
  - `[maybe-false]` `[reject]` Intent5, Restore/draft machinery outweighs the matrix — descriptive; the intent lists those lifetimes under Always.
  - `[maybe-false]` `[reject]` Intent6, removed fallback assertions not mirrored for Kanban — Kanban has no server read to fall back from.

## Design Notes

Retain totalCards/totalStories contract fields but both denote eligible Stories; no new all-Card metric. Add includeReleased as the requested display scope to the existing canonical read, default preserving its all-release semantics; UI sends false for open aggregate. Compute ancestor eligibility before Release filtering. Explicit single Release and Unscheduled remain exact. Tracking consumes the same pure builder over its authoritative snapshot, including preview; server read failures in Panel remain visible and never substitute zeros/local numbers. Full released state on create needs request/repository/resolver parity, not a second update after creation.

## Verification

Use `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` first on PATH. Run gates serially; save sanitized evidence under `evidence/story-6-9/`. Focused suites must execute nonzero tests.

- `corepack pnpm test`: exact root regression gate; stage new source fixtures first because setup tests copy tracked files. Includes relevant contracts/core/DB/HTTP/MCP/DOM tests.
- `node scripts/verify.mjs`: source hygiene/capability parity/typecheck/build pass.
- `git diff a2f001ed1e1c13464b0519c0006d41cdb9e4557d --check` and staged whitespace; compare protected hashes and exact staged scope.
- Disposable persisted public HTTP/MCP tests verify full field creation/edits, stale rollback and assignment/report refresh, then reopen storage. Attempt available native browser keyboard/create/edit/show-all/conflict checks; record inaccessible native/screen-reader boundaries as unverified, never claim DOM tests prove them.

## Changelog

- 2026-10-17 v1: Planned from accepted6.9 detail plan,6.8 continuity and parallel UI/report source investigation.

- 2026-10-17 v2: Completed implementation, retained20review findings and repaired9groups; final2375tests/releaseverify/native projection/Restore evidence recorded.

## Auto Run Result

Status: done

Summary: Follow-up review pass on the already implemented Story 6.9 (Release create/edit with versioned conflicts, canonical release summary with status distribution and unestimated Stories, open-by-default Release scope, Restore-epoch draft lifetimes). Four independent lenses reported 29 findings; none verified high or medium.

Files changed this pass:
- `apps/web/src/app/api.ts` — release-summary query disables structural sharing so a `__proto__` status row survives refetch.
- `apps/web/src/app/live/live-updates.test.tsx` — added reconnect `ready` changed-epoch Restore test; eviction test now also seeds and asserts the inactive release-summary cache.
- `apps/web/src/ui-strings/index.ts` — removed orphaned `kanban` and `newReleaseName` panel strings.
- This spec — triage log and result.

Review findings: patches applied 4 groups (all low): structural sharing, ready-epoch test, summary cache eviction test, orphaned strings. Deferred 1 (low): no start<=release date ordering, pre-existing in the contract. Rejected: 24 rows, each with its reason in the triage log (false 7, maybe-false 5 not worth a guard, low 12 cosmetic or refactor-sized).

Follow-up review recommended: false. This pass patched no high and no medium entry.

Verification: `corepack pnpm test` on Node 24.17.0 passed (contracts 153, importers 7, core 390, web 601, db 443, server 685 + 14); `node scripts/verify.mjs` passed (hygiene, typecheck, build); `git diff a2f001e --check` clean apart from this spec's former trailing blank line, now removed. Native browser and screen-reader checks stay as in the existing deferred item.

Residual risks: full native accessibility and forced-failure/inactive-map Restore acceptance (existing deferred item); inverted Release date ranges are accepted as before.

Commit: not created. The frozen intent forbids committing without an explicit user request and leaves reviewed work staged; orchestrator-owned `sprint-status.yaml` and `deferred-work.md` remain modified and untouched by this run.
