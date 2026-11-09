---
title: '7.6 Conflicts and Sync Health'
type: feature
created: 2026-10-19
version: 2
status: done
baseline_revision: 65d96699a495b8a0a440a6ff895b97918ab3dbee
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-7-6-conflicts-and-sync-health.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      Native browser/provider resolution and connected Restore-to-pending-resolution acceptance remain unverified (I2, I3).
    evidence: |-
      Browser inventory exposed no usable browser. Fixture UI/HTTP/core/DB tests passed, but do not establish a connected native keyboard, focus, screen-reader, platform or live-account journey. Settle with an observed disposable-provider browser resolution and actual Restore while a resolution is pending, without real user data.
    location: >-
      GitHubSyncPanel and native acceptance
    severity: medium (unverified)
  - summary: >-
      Pre-existing linked Release goal and released-state edits can remain shown as synced (P2B5).
    evidence: |-
      Before Story7.6, Release links retained persisted syncState while releaseSyncBaseline/syncReleaseMetadata omitted goal and released state. updateRelease changes neither link state nor those missing baselines. remote-push-plan publishes goal as Milestone description and released as Milestone state. Settling this requires acknowledged evidence for those published fields and independent edit regressions; current Story7.6 name/date projection does not introduce the omission.
    location: >-
      packages/core/src/reports/sync-health.ts:49; apps/server/src/services/remote-push-plan.ts:90; packages/db/src/repositories/releases-repository.ts:46
    severity: medium
---

Reproducing statement: Implement Story 7.6 using bmad-build-auto, preserving orchestrator-owned sprint-status.yaml without writing, staging, reverting or treating its rows as verification. Date: 2026-10-19. Version: 2.

<intent-contract>

## Intent

**Problem:** Durable sync disagreements lack universal field locks and explicit review of drift. Health can contradict open conflicts and omit deleted local identities; users cannot reliably review and finish either resolution path.

**Approach:** Preserve one canonical-reference/field disagreement until an explicit reviewed resolution succeeds, enforce precise locks on every editing surface, display both sides with the existing conflict contract and derive truthful local health from canonical baselines, conflicts and deletion evidence.

## Boundaries & Constraints

**Always:** Use contracts as schema source, DB repositories for persistence and pure core projection. Incoming remote-wins changes use an attributed github ChangeSet with existing approval/protection/restore/audit rules; outgoing local-wins effects use Story 7.4's exact immutable human-confirmed plan. Preserve independent fields and their acknowledged/observed evidence. Read-only protects divergence and blocks remote writes only. Repeated pulls/convergence retain reviewed conflict evidence; successful chosen-field effect and baseline persistence alone close the row. Revalidate actor, scope, connection, identity, inputs and database epoch across awaits. Version and sync conflicts coexist in the existing ConflictReport envelope. Health reads make no provider call; unavailable/auth/network/rate-limit/partial responses cannot prove remote deletion. Retain local-deletion navigation evidence without recreating anything.

**Never:** Write/stage/unstage/revert sprint-status.yaml, deferred-work.md or orchestrator artifacts; infer verification from tracking; touch real credentials/user Projects; call live providers in tests; start login; commit/push without explicit user authorization. No prototype migration/backfill/compatibility reader, automatic conflict closure, whole-Card lock, remote-write bypass, undelete, polling, new provider, broad assignee/hierarchy synchronization or unrelated conflict UI rewrite. Keep all meaningful prior tests/gates; record native acceptance limits truthfully.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Repeated disagreement | Both sides edit title; repeat pull, reopen, convergence | One open canonical-ref/title row retains original values; counts and diff agree; explicit choice still required | Duplicate attempts reuse row; no silent closure |
| Precise locks | Title/status/labels/milestone conflicts plus unrelated edits; human HTTP, bulk/move/children and generic upsert/ChangeSet | Only disputed fields and shared Release metadata affecting them are refused; unrelated fields remain editable in UI/server | Shared envelope reports every applicable version and sync entry, retaining draft |
| Remote choice | User reviews current disputed field and chooses remote | Visible incoming github ChangeSet/review; exact field applies atomically with baseline/closure, protection respected | Drift requires explicit re-review; cancel/stale/failed apply leaves row open |
| Local choice | Reviewed local field plus independent remote change | Existing exact one-field Dry Run preserves unrelated remote content; closure only after human-confirmed persisted success | Cancel, read-only, disabled/protected, provider/persistence failure retain row |
| Evidence drift | Local/remote changes after displayed evidence or while preparing choice | Refuse silent substitution; display current evidence for deliberate re-review/resubmission using existing error family | Original conflict evidence remains immutable |
| Health | Synced/local divergence/open conflicts/stale or unavailable observation/proven deletion | Counts and listed identities agree; conflict overrides ordinary synced/unsynced; local divergence is unsynced; last observation/error remains truthful | No provider calls; unavailable is stale, never fabricated deleted-remote |
| Deleted local | Hard delete, source detach, rebind, Restore, parked/archived ancestry | Typed non-undone entity-deletion history retains Map/Card identity and Issue link; equivalent live binding suppresses history; hidden live Cards excluded | No automatic recreation or misleading live Card link |
| Mounted concurrency | Pending resolution/confirmation, scope or connection change, Restore then late response; version+sync errors | Refuse stale queued actions and response adoption; preserve drafts, live hold, accessible diff/choice and focus; refresh health after own apply | No stale closure/intent authorization or hidden failure |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/{domain,conflicts}.ts`, `api/{http,application-responses}.ts`: SyncConflict currently has no externalRefId; health wire duplicates an incomplete report; resolve request lacks captured review. Extend existing contracts, not a parallel error family. Extract cohesive schema modules if approaching 750 lines.
- `packages/db/src/repositories/work-item-repository.ts#createSyncConflict/resolveSyncConflict/getWorkItemSyncHealthData`: currently blind insert/closure and no deletion evidence. Canonical externalRefId plus one-open-ref/field uniqueness in `schema/tables.ts` and `connection.ts`; validate ownership and retain original evidence. Match bootstrap/Drizzle, row mappers, operation persistence and current-schema reopen/Restore/archive classification.
- `packages/db/src/repositories/external-refs-repository.ts#listDeletedGitHubRefs`: reuse typed scoped, non-undone deletion Activity without UI pagination; already excludes equivalent live refs. `externalRef.deleted` evidence owns historical identity; do not fabricate live sync bindings.
- `packages/core/src/changesets/{github-sync-resolution,operation-conflicts}.ts`: resolver currently appends conflicts; upsert locks every field and Release mutations omit dependent milestone disputes. Preserve sequential executor ownership/before guards and operation dependencies. Shape changes require existing operation-schema transition, not old-prototype conversion.
- `apps/server/src/application/card/{card,card-children}.use-cases.ts`, `apps/server/src/application/release/release.use-cases.ts`: direct human update/bulk/move/Annotation/Release paths bypass core conflict collection. Share precise collection with generic operations and accumulate version+sync entries before refusal; keep ordinary version policy.
- `apps/server/src/application/sync/{github-pull-command,github-conflict-command,sync-conflict.use-cases}.ts`, `services/sync-conflict-resolution.ts`: command currently deduplicates only Card/connection/remote/field; request refetches remote without comparing reviewed value. Reuse canonical fields/baselines and captured evidence; drift returns existing ConflictReport with current review values. Only explicit renewed submission accepts new evidence; immutable original row stays intact.
- `services/{remote-push-plan,remote-push-execution}.ts`: local choice already prepares exact remote plan and resolves inside persisted binding transaction; preserve this ordering, other open-field state and independent remote fields. No direct provider resolution writer.
- `packages/core/src/reports/sync-health.ts`: pure projection currently trusts persisted state and marks local changes stale; add durable conflict precedence, meaningful unsynced vs stale observation, typed deleted-local entries and count/list identity consistency. Keep canonical body/footer, mapped status/Annotation and Release normalization from 7.5.
- `apps/web/src/features/github-sync/GitHubSyncPanel.tsx`: remote-choice response discarded, raw JSON diff, selected connection incorrectly determines per-conflict readOnly, resolution omitted from busy. Use existing executable ChangeSet review and exact remote-plan review; scope the actual conflict connection/Card; coordinate synchronous pending admission, epoch/adoption and own-mutation invalidation.
- `apps/web/src/features/conflicts/ConflictAlert.tsx`, `app/conflicts.ts`: first currentVersion entry can misclassify sync as version and hide coexisting errors. Preserve both recovery types. `features/story-map/components/{CardDetailModal,CardTile}.tsx` and inline editors need field-specific hints/refusal while retaining unrelated drafts/actions; central strings live in `shared/strings/`.
- Relevant tests inspected by two investigators: server `services/{sync-review,remote-push-merge,remote-push-execution}.test.ts`, `application/sync/github-command-regressions.test.ts`; core `changesets/remaining-operation-resolution.test.ts`, `reports/sync-health.test.ts`; DB `repositories/{canonical-github-identity,card-visibility}.test.ts`; web `features/github-sync/{github-selection,incoming-review}.test.tsx`, `features/story-map/components/card-detail-github.test.ts`. Add actual HTTP and both MCP transport regression coverage where behavior changes, fake provider/credential boundaries only.
- Read-only continuity: `spec-7-5-import-and-sync.md` Code Map/Design Notes/Spec Change Log/tasks were loaded. Shared Release metadata and separate acknowledged-local/observed-remote evidence must survive one-field choices, including newly fetched unrelated data being proposed by the next pull. Graph tools unavailable; source wins.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/`, `packages/db/src/{schema,connection.ts,repositories}/` — canonical durable field identity/uniqueness, captured review and typed health projection; preserve current-schema reopen, Restore and portable redaction.
- [x] `packages/core/src/changesets/`, server Card/child/Release use-cases — enforce precise locks and combined version/sync errors across human and generic writes, including dependent shared Release metadata.
- [x] `apps/server/src/application/sync/`, `services/sync-conflict-resolution.ts`, remote-plan services — guard displayed evidence and preserve explicit incoming/outgoing resolution protocols with truthful failure accounting.
- [x] `packages/core/src/reports/sync-health.ts`, DB health read, server health use-case — pure consistent conflict/unsynced/stale/deletion counts and identities using existing canonical normalization and typed history.
- [x] `apps/web/src/features/{github-sync,conflicts,story-map}/`, `app/{api,conflicts}.ts`, shared strings — accessible field diffs/locks, distinct review paths, actual-connection restriction, explicit drift re-review and scope/epoch/pending/focus safety; refresh health on own success.
- [x] Focused contracts/core/DB/server/web/transport tests — exercise every matrix row with actual executed tests, then serial workspace and release verification; preserve raw failures/evidence under `evidence/story-7-6/`.

**Acceptance Criteria:**

- Given a Card with simultaneous version and sync disputes, when any changed editing boundary rejects a write, then the shared response and UI preserve every relevant dispute and the user's draft while permitting unrelated fields.
- Given a completed resolution, when health and Card state refresh through own mutation or external invalidation, then the same canonical identity and remaining open fields determine counts, navigation and editability.
- Given an incoming or outgoing review is cancelled, stale or refused, when another action is attempted, then no prior choice silently supplies new consent or closes the original conflict.

## Spec Change Log

### 2026-10-19 — Review loop 1

Triggering findings: B2–B10, V1–V2 and E1–E5. Amend effective lock projection, semantic closure, actual shared error rendering, dirty-field adoption and cheap human-write conflict admission as specified below. Avoid false resolution, sequential alias/implicit-status bypasses, overlocking, hidden failures, stale draft overwrite and new project-size write costs. Patch groups B5/V2/E5, B6 and V1 are folded into this coherent rederivation; no frozen intent changes.

**KEEP:** Preserve every existing Story7.6 feature and meaningful regression, canonical conflict identity/immutable evidence, one-field incoming/outgoing review, all7.5 normalization and acknowledged-vs-observed evidence, health and deleted history, current-schema persistence, scope/epoch/pending/focus guards, unrelated-field editing and preserved drafts. Preserve prior passing test and release-gate evidence without claiming it verifies the repaired tree. Preserve protected paths and native acceptance limitations. Preservation scaffold: [full source patch](evidence/story-7-6/pre-review-implementation.patch.gz), SHA256 a2c6e061747a44cd5dc5788e75e30cfb1294128f5c08cc671002c578853e141c. Code is reverted before rederivation; implementation should restore this source-only scaffold with `gzip -dc` to a temporary patch then `git apply` and repair coherently. Working copy also exists at `/tmp/story7-6-pre-review-implementation.patch`. Do not drop working features or tests while repairing.

## Review Triage Log

### 2026-10-19 — Review pass 1
- verdicts: 21 findings — high 0, medium 16, low 0, false 3, maybe-false 2
- findings:
  - `[false]` `[reject]` I1: Workflow execution is not proved by the diff alone — The recorded renderer invocation, independent parent full test and verify logs, and eight-row matrix audit establish execution; no sprint row is treated as proof.
  - `[maybe-false]` `[defer]` I2: Connected native provider resolution acceptance — No browser was available; an observed disposable-provider native resolution journey would settle this medium unverified acceptance risk.
  - `[maybe-false]` `[defer]` I3: Connected Restore during pending UI resolution — Complementary UI epoch and DB Restore tests do not establish one native connected journey; an actual Restore during pending review would settle this medium unverified risk.
  - `[false]` `[reject]` I4: Prototype schema reopening compatibility — AD9 and the frozen intent explicitly exclude prototype migration; current-schema reopen and Restore are covered.
  - `[false]` `[reject]` B1: Old prototype lacks external_ref_id — Old prototype compatibility is excluded by AD9 and frozen intent, so CREATE-only bootstrap is intentional.
  - `[medium]` `[bad_spec]` B2: Baseline-only resolution can close without chosen field — Direct core probe closed a remote title choice while Card title stayed local. Require semantic chosen-field agreement before closure; public submission already rejects adapter operations.
  - `[medium]` `[bad_spec]` B3: Upsert implicitly changes archived status — applyPublication changes archived to todo even when status is omitted. Amend lock checks to use effective field deltas.
  - `[medium]` `[bad_spec]` B4: Annotation definition collisions change managed labels — Unassigned duplicate rename changes effective name mapping without a membership delta. Require before/after managed projection and guard human definition creation too.
  - `[medium]` `[patch]` B5: Sync notice expects SyncConflict but receives Card — operation-conflicts and dependent entries supply Card as current. Fold existing-envelope SyncConflict payload correction and actual-response UI regression into rederivation.
  - `[medium]` `[patch]` B6: Release error filtering hides dependent Card conflicts — Release editors filter by Release id and suppress generic ConflictError. Fold dependent sync-entry rendering into rederivation.
  - `[medium]` `[bad_spec]` B7: Partial save retains untouched stale draft fields — Release and Card editors replace baseline but retain omitted old values, turning them falsely dirty. Require true dirty-field merge while preserving edits made during await.
  - `[medium]` `[bad_spec]` B8: Idempotent Annotation assignment is blocked — Membership checks ignore assignment presence. Require effective deltas so set-present/unset-absent noops and unrelated bulk edits remain allowed.
  - `[medium]` `[bad_spec]` B9: Workflow color metadata falsely locks status — affectedCards triggers status lock for color-only changes. Require effective status-name/deletion changes, preserving review evidence validation.
  - `[medium]` `[bad_spec]` B10: Every human edit materializes full project snapshot — assertBaseVersions newly loads source chunks and map fingerprints across project even with no conflicts. Add cheap relevant-open-conflict repository query before expensive materialization and measure actual human write path.
  - `[medium]` `[patch]` V1: Missing actual HTTP Release guard regression — Preverified gap: core and mocked UI tests cannot catch removal of release.use-cases guard. Add fresh-version PATCH/Delete canonical milestone conflict refusal and unrelated-field success.
  - `[medium]` `[patch]` V2: Actual sync payload is not rendered — Preverified gap duplicates B5; test real server envelope consumption rather than hand-built SyncConflict-shaped payload.
  - `[medium]` `[bad_spec]` E1: Resolver accepts baseline-only fake resolution — Parent pure-core probe reproduces B2. Require current chosen field and canonical acknowledgement agreement atomically before closing.
  - `[medium]` `[bad_spec]` E2: New managed Annotation alias bypasses lock — Parent probe creates definition then assigns alias while labels conflict is open and collector misses it. Evaluate sequential effective state and aliases, retaining transaction-start version checks.
  - `[medium]` `[bad_spec]` E3: Duplicate managed definition rename bypass — Parent probe confirms B4 with duplicate names. Guard all definition changes that alter effective managed-label projection.
  - `[medium]` `[bad_spec]` E4: Color-only workflow review blocks conflict Card — Parent probe confirms B9. Compare effective status changes rather than affectedCards metadata alone.
  - `[medium]` `[patch]` E5: Existing error UI cannot parse actual sync entry — Source confirms B5/V2. Correct payload within shared envelope and render dependent entries with integration regression.

### 2026-10-19 — Review pass 2
- verdicts: 18 findings — high 0, medium 10, low 1, false 5, maybe-false 2
- findings:
  - `[false]` `[reject]` P2I1: Workflow execution is outside the source diff — carried I1: exact renderer invocation and parent logs/matrix establish execution; protected-path tool audit and working/index hashes establish ownership compliance. The source-only review input intentionally omits this narrative.
  - `[maybe-false]` `[defer]` P2I2: Native browser and assembled product acceptance — carried I2: fixture/jsdom evidence cannot establish native connected keyboard/focus/provider acceptance. Observe a disposable-provider browser journey to settle the medium unverified risk; do not duplicate deferral.
  - `[maybe-false]` `[defer]` P2I3: Live provider persistence acceptance — carried I2: mocked SDK/stdio provider observations establish local protocol behavior, not live GitHub persistence. Actual disposable-provider/native acceptance would settle the medium unverified limit; no duplicate deferral.
  - `[false]` `[reject]` P2I4: Full story scope is absent from reviewer prompt — Parent loaded the complete prepared Story7.6 requirements and context and audited every frozen matrix row against executed tests; the source-only auditor input is intentionally narrower.
  - `[false]` `[reject]` P2B1: Old prototype table lacks canonical conflict column — carried B1/I4: AD9 and frozen intent exclude prototype migration. Current-schema reopening and Restore remain tested.
  - `[medium]` `[patch]` P2B2: Raw provider URL casing rejects canonical identity — Provider returns URLs unchanged while refs canonicalize owner/repository. Parsed canonical locator comparison fixes equivalent case while retaining foreign identity refusal.
  - `[medium]` `[patch]` P2B3: Release reference agreement depends on repository order — The helper selects first Release ref; localMilestoneLocator already scopes by Issue repository. Select matching canonical repository and test both ref orders.
  - `[false]` `[reject]` P2B4: New conflict followed by disputed write bypasses initial collection — Public SubmitChangeSet rejects syncConflict adapter operations; the only conflict-creation builder emits disputed-safe Card/Annotation effects before conflict creation, then preserves disputed baselines. No current application caller can construct the claimed overwrite sequence; arbitrary direct core construction is not a public bypass.
  - `[medium]` `[defer]` P2B5: Release goal/released divergence is absent from health evidence — Pre-existing: before this story Release links retained persisted syncState and baseline metadata omitted goal/state; updateRelease does not update link state. Outgoing payload publishes both fields. New name/date projection does not introduce this missing evidence; defer with concrete baseline/payload locations.
  - `[medium]` `[patch]` P2B6: Duplicate mapped status labels prevent agreement — Accepted mapping permits duplicates; syncStatusLabels deduplicates canonical baselines but agreement only sorts. Reuse canonical normalization without mutation.
  - `[false]` `[reject]` P2B7: Color-only clearing serializes an empty patch — There is no color-clearing action: Card Detail only assigns nonempty category values, including Standard #ffffff. makeDraft empty color is also the unchanged baseline; the reviewer did not show a UI path that makes it a dirty empty string. Do not add a new clearing feature.
  - `[low]` `[patch]` P2B8: All dirty fields locked leaves inert enabled Save — Both buttons use isDirty while save returns for empty editable patch. Derive editable dirtiness for the existing controls; retained draft and visible lock explanations remain.
  - `[medium]` `[patch]` P2B9: New Dry Run Cancel loses keyboard position — Cancel is new in this diff and removes the focused control; neither panel invalidateScope nor review restores its initiator. Restore connected initiator only when cancelling inside the review, without overriding outside scope focus.
  - `[medium]` `[patch]` P2B10: Kanban disabled fields expose lock text only in title — Disabled selects cannot receive ordinary keyboard focus and the row has no persistent field-lock explanation. Add existing visible text and aria-describedby relationships.
  - `[medium]` `[patch]` P2V1: Human Card Annotation admission endpoint regression gap — Preverified: core and mocked UI tests cannot catch removal of human set/delete assertBaseVersions. Add real POST/DELETE refusal plus no-op/unmanaged success and persisted-state audit assertions.
  - `[medium]` `[patch]` P2V2: Human workflow admission endpoint regression gap — Preverified: existing HTTP workflow cases lack open status disagreement; helper tests survive removing admission. Add reviewed rename/delete refusal and metadata success through actual routes.
  - `[medium]` `[patch]` P2E1: Structured reviewed values reject reordered object keys — Source and reviewer Node24/Vite probe show JSON.stringify makes equal status/Release values order-sensitive. Compare JSON objects independently of key order while preserving arrays and rejecting real drift.
  - `[medium]` `[patch]` P2E2: Duplicate status mapping blocks successful remote choice — Same root cause as P2B6; actual module probe returns false for duplicate mapping and true for unique mapping. Canonical normalization and regression share one repair entry.

All nine pass2 repair entries are implemented and independently verified: eight medium and one low; P2B6/P2E2 share one normalization repair. Parent full gates passed after repairs.

### 2026-10-19 — Review pass 3 (follow-up pass)
- verdicts: 24 findings — high 0, medium 2, low 10, false 12, maybe-false 0
- findings:
  - `[false]` `[reject]` BH1: Missing DB upgrade path for external_ref_id — carried B1/I4/P2B1: AD9 and the frozen intent exclude prototype migration; current-schema reopen and Restore are tested.
  - `[false]` `[reject]` BH2: Persisted ChangeSets not migrated (schema version 6 to 8) — `operation-schema-transition.ts` marks every non-current-version open ChangeSet stale and `changesets-repository` requires current-schema resubmission; skipping 7 is harmless.
  - `[false]` `[reject]` BH3: Public contract change undocumented — `docs/mcp-tools.md` lists tools and operations, not argument shapes; no documented statement became wrong.
  - `[false]` `[reject]` BH4: `reviewed` rule enforced outside the schema — a missing `reviewed` throws a typed validation DomainError in `prepareRemotePush`; an empty review object parses but compares as drift against real values, so it cannot close or authorize anything.
  - `[false]` `[reject]` BH5: assertBaseVersions weak shape — bulk schema has `cards.min(1)` so `targets[0]` always exists; annotation base-version tautology predates the story and sync admission is the intended check there.
  - `[false]` `[reject]` BH6: Silent de-duplication of conflicts — spec matrix requires "Duplicate attempts reuse row; no silent closure"; the unique index is the backstop.
  - `[false]` `[reject]` BH7: Overloaded `ConflictEntry.current` — mandated by Design Notes (SyncConflict in sync entries' `current`) and covered by the envelope-consumer regression.
  - `[low]` `[reject]` BH8: Duplicated lock, label and equality logic across core and web — server enforcement is authoritative so client drift only mislabels controls; consolidating is a refactor larger than a direct correction.
  - `[low]` `[reject]` BH9: Repeated freeze and structuredClone at entry points — redundant but harmless; no wrong outcome.
  - `[false]` `[reject]` BH10: Card colour cannot be cleared — carried P2B7: no colour-clearing action exists.
  - `[low]` `[reject]` BH11: Swallowed or unhandled web errors — stale-scope silent return is the intended epoch guard; the rethrow only triggers for non-Error values (see ECH3).
  - `[low]` `[reject]` BH12: `localStatusForRemote` re-export from work-item-sync.ts — matches the two sibling re-exports and has live importers; cosmetic.
  - `[false]` `[reject]` BH13: Server enforcement gaps and stale-to-unsynced semantics — persona, story-map and attachment writes cannot change the five synchronized fields; local divergence as unsynced is the spec matrix row.
  - `[low]` `[reject]` BH14: Review-dialog remount key, string homes and unused strings — cosmetic.
  - `[low]` `[reject]` ECH1: Clearing estimate/value/effort leaves Save enabled but inert — pre-existing: baseline skipped empty numerics and enabled Save from isDirty; no clearing feature exists.
  - `[low]` `[reject]` ECH2: Lane rename input stays disabled if a lock appears mid-edit — the draft is preserved, the lock hint is visible and the input re-enables when the dispute resolves; unlikely and spec asks for preserved drafts.
  - `[low]` `[reject]` ECH3: Review `.catch` rethrows non-Error values — all provider/DomainError failures are Errors; only a non-Error rejection reaches the rethrow.
  - `[false]` `[reject]` ECH4: `remote!` undefined in conflict plan — a conflict requires a linked Issue so `item.remoteId` is set and `requireRemoteItem` throws typed errors first.
  - `[low]` `[reject]` ECH5: Open conflict hides stale or remote_deleted state — nothing in the codebase produces remote_deleted; stale links keep lastError on the conflict row and the matrix mandates conflict precedence.
  - `[medium]` `[patch]` VG1: No HTTP regression for archive, bulk, delete, move, Annotation delete admission — added table-driven actual-route cases (10) asserting 409 with `reason: sync`, unchanged snapshot/Activity and open row in `base-version-conflicts.test.ts`.
  - `[medium]` `[patch]` VG2: `hasRelevantOpenSyncConflicts` field mapping untested for description, status, releaseId and bulk Annotation branches — covered by the same VG1 table through the real routes.
  - `[low]` `[patch]` VG3: Missing-review Dry Run guard unasserted — added `sync-review.test.ts` case for a conflict plan without `reviewed` (400 validation, no provider call, row unchanged); the freeze/clone mutation test is rejected as speculative defence-in-depth.
  - `[false]` `[reject]` IA1: Provider failure classes not newly classified — no code produces remote_deleted, so unavailable responses cannot prove deletion; health makes no provider call (tested).
  - `[false]` `[reject]` IA2: Closure decided in core rather than the repository — matches the intent's "pure core projection" and the Design Notes' resolver invariant; repository checks ownership and openness.

## Auto Run Result

Status: done (follow-up review pass 3)

Summary: Story 7.6 (conflicts and sync health) was already implemented; this pass re-reviewed the full source diff since baseline `65d96699a495b8a0a440a6ff895b97918ab3dbee` with four independent layers and added missing regression coverage.

Files changed this pass:
- `apps/server/src/http/routes/base-version-conflicts.test.ts` — ten actual-route admission cases (archive, bulk status/release/Annotation add, card status/description/release, move, Annotation delete, card delete) and a widened conflict-field helper type.
- `apps/server/src/services/sync-review.test.ts` — conflict Dry Run without captured review values is refused before any provider call.

Review findings: 24 — patches applied 3 (2 medium, 1 low), deferred 0 new, rejected 21 (12 false, 9 low) with reasons in the triage log. Existing deferrals (I2, I3, P2B5) are unchanged.

Follow-up review recommendation: false. This pass patched no high finding; patched counts: high 0, medium 2, low 1.

Verification: `vitest run` of `base-version-conflicts.test.ts` and `sync-review.test.ts` passed (79 tests); `@storymapper/server` typecheck passed; `node scripts/verify.mjs --skip-typecheck --skip-build` passed. The full workspace gate was not re-run (test-only changes this pass).

Residual risks: Native browser/provider acceptance remains unverified (deferred I2/I3). Nothing was committed: the spec's Never list forbids committing without explicit authorization, and `sprint-status.yaml` and `deferred-work.md` are orchestrator-owned and left untouched, so the working tree is intentionally not clean for the orchestrator to commit.

## Design Notes

### Review repair design, loop 1

- Resolve only after the actual chosen canonical local field (title/body/status/labels/milestone) agrees with the explicit choice and persisted canonical baseline. A link-only acknowledgement cannot pretend a Card/Annotation/Release effect occurred. Permit explicit convergence when state already equals the choice. Preserve all independent fields and original conflict evidence. Exercise direct resolver invariant and public incoming/outgoing command paths.
- Compute locks from effective sequential operation state, including aliases for definitions created earlier in the same ChangeSet and implicit upsert publication status transitions. Keep transaction-start root versions and before guards; do not replace original version evidence with projected versions. Compare effective managed-label projection before/after Annotation definition create/rename/delete, including duplicate-name ambiguity and unassigned definitions affecting mapping. Apply same guard to human customization writes, including createAnnotation. Check actual assignment deltas; set-present/unset-absent operations and untouched bulk members remain allowed. Workflow color/position/unchanged-name metadata alone must not lock status; name/deletion effects still do.
- Keep the existing ConflictReport family and existing root/version metadata, but put actual SyncConflict in sync entries' `current` so SyncConflictNotice parses real responses. Release editors must render dependent Card sync entries even when the Release root-version entry is filtered separately. Add an actual server-envelope-to-consumer test, including simultaneous version and sync entries; no generic ConflictError may disappear.
- In CardDetailModal, ReleaseEditor and ReleaseDateFields partial-save adoption, compare with the pre-submit baseline: adopt returned values for genuinely untouched omitted fields; retain genuinely dirty excluded fields and changes typed while awaiting. Retain cancellation, Restore/epoch/current-result guards. Test version KeepMine retry with a newly locked field, canonical refresh, unlock and later unrelated save to prove no stale overwrite.
- Before loading the full project OperationSnapshot on human edits, use a minimal repository query for relevant open conflicts (including dependent Release and managed-definition effects). With none relevant, retain ordinary version checks without materializing every project's maps/source chunks. Do not bypass conflict enforcement when GitHub is off. Add regression on actual human write path and diagnostic evidence; do not add or relax performance thresholds.
- Add actual fresh-version human HTTP Release PATCH and Delete conflict regression with canonical linked Card/milestone conflict and unchanged DB after refusal; allow unrelated field changes. Cover human Annotation definition boundaries and all effective-delta counterexamples above.


The canonical unresolved key is externalRefId plus field; connection is configuration, not identity. Validate current Card Issue ownership before creation/resolution. A partial unique DB index complements pure resolver/repository reuse without altering original evidence. Historical closed rows remain history. Current-schema restore must retain uniqueness; no prototype migration is promised.

Carry reviewed local/remote field values through the existing resolution request and compare canonical values on preparation. Existing conflict/fingerprint entries can expose new evidence for explicit re-review. Do not silently mutate the original durable conflict or accept a different remote value because it was freshly fetched. Plan confirmation still performs its own exact-input validation.

Use typed historical health entries for deleted owners rather than inventing a RemoteWorkItemLink whose foreign keys no longer exist. Compute totals from exactly the returned active/historical inventory, with one identity once. Preserve last-known Issue URL and historical owner identity while labelling an unavailable local owner truthfully.

## Verification

- Use Node24: `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH` for every Node/pnpm command.
- Run focused Vitest directly via `corepack pnpm --filter <package> exec vitest run <actual files>`; package server test script filename arguments target its trailing performance phase. Confirm real test counts and all matrix rows executed.
- Stage only task sources/tests/artifacts/OpenWolf changes explicitly before launcher fixture checks using git ls-files. Never include protected tracking/orchestrator paths. No commit or push.
- Run `corepack pnpm test` and root script tests as configured, serial with `node scripts/verify.mjs`; final verify covers capability parity, source hygiene, all typechecks and build. Preserve failures losslessly, never trim gate evidence or relax assertions.
- Parent independently reads complete diff from baseline, reruns gates, audits matrix coverage, records revision/fingerprint and protected-path working/index hashes under `evidence/story-7-6/`.
- Attempt native keyboard/diff/focus/link journey on disposable provider fixtures if browser available; inventory currently exposes no browser. Unexecuted native reader/platform/live-account acceptance stays explicitly unverified and never becomes a passing claim.

## Changelog

- 2026-10-19 v2 final: Two review passes/39rows, final9patch groups,2943parent tests, full release gate and explicit protected-file/native/deferred evidence.

- 2026-10-19 v2: Review loop1 refines effective effects, resolution invariants, error consumption, draft merge and human-write cost; preserves frozen intent.

- 2026-10-19 v1: Source-grounded spec from two independent investigations, accepted Epic7 preparation and Story7.5 continuity.

