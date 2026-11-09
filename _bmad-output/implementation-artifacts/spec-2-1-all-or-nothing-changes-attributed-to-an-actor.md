---
title: '2.1 All-or-nothing changes attributed to an actor'
type: 'refactor'
created: '2026-10-04'
status: 'done'
baseline_revision: '097405abe7790a592a36ac4b83435bed3216b437'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '[REDACTED_HOME]/Projects/StoryMapper/AGENTS.md'
  - '[REDACTED_HOME]/.claude/CLAUDE.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.wolf/OPENWOLF.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.wolf/cerebrum.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/code.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/typescript.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/comments.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/logging.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/testing.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/markdown.mdc'
warnings: [oversized]
deferred:
  - summary: >-
      Missing milestone values abort conflict serialization.
    evidence: |-
      Both original and current createSyncConflict stringify undefined into required local_value_json/remote_value_json columns when a milestone is removed.
    location: >-
      packages/db/src/repositories/work-item-repository.ts:287
    severity: medium
  - summary: >-
      Push and sync use different GitHub issue-body representations.
    evidence: |-
      Original and current push hash generated issue bodies; sync compares and sends raw Card descriptions, causing false local-change detection and removal of generated metadata.
    location: >-
      apps/server/src/services/work-item-sync.ts:241
    severity: medium
  - summary: >-
      Independent remote edits can be overwritten by a full local sync payload.
    evidence: |-
      Original and current conflict detection blocks overlapping changed fields but sends all local fields after non-overlapping changes; a local title update can overwrite a remote description update.
    location: >-
      apps/server/src/services/work-item-sync.ts:178
    severity: high
  - summary: >-
      Conflict resolution can apply stale Card data after awaited provider calls.
    evidence: |-
      Baseline and current local/remote resolution branches capture Card/link input before remote awaits; a newer human edit can be overwritten or reported synced despite pending differences.
    location: >-
      apps/server/src/http/routes/index.ts:561
    severity: medium
  - summary: >-
      Pending sync state can remain inaccurate after a later provider failure.
    evidence: |-
      Baseline and current earlier results remain committed after subsequent failure; later status/release edits of earlier Cards are not reflected by the text-only health check or the skipped final phase.
    location: >-
      apps/server/src/services/work-item-sync.ts:84
    severity: medium
  - summary: >-
      Unchanged read-only refreshes append Card versions and activity.
    evidence: |-
      Original and current read-only sync unconditionally applies remote payloads and calls updateCard even when mapped values are identical.
    location: >-
      apps/server/src/services/work-item-sync.ts:216
    severity: medium
  - summary: >-
      Version numbering materializes every previous Card snapshot.
    evidence: |-
      The unchanged numbering implementation selects full version rows to count them; growing histories incur avoidable reads inside a transaction.
    location: >-
      packages/db/src/repositories/cards-repository.ts:409
    severity: low
  - summary: >-
      A Card deleted during remote creation leaves the external result unlinked.
    evidence: |-
      Baseline and current link upsert reject a missing Card after the provider returns; settling detached result storage or reconciliation requires a separate integration policy.
    location: >-
      apps/server/src/services/work-item-sync.ts:108
    severity: medium
---

Date: 2026-10-04. Version: 3. Purpose: implement Epic 2 Story 2.1 using atomic, explicitly attributed Card mutations, transaction-bound repositories and a replaceable database holder. The orchestrator exclusively owns sprint-status.yaml: never write, revert or stage it; its status rows prove nothing about verification. No commit or push is authorized.

<intent-contract>

## Intent

**Problem:** Most Card mutations perform multiple independent writes and hardcode human attribution, allowing failed operations to leave partial data and misleading history. Repository instances retain stale raw handles after replacement.

**Approach:** Introduce an explicit actor-aware synchronous unit of work with transaction-bound repositories, atomic Card/version/activity persistence and commit-only notifications. Extract the Card aggregate and related repository modules so the implementation remains within repository size limits.

## Boundaries & Constraints

**Always:** `unitOfWork.run(actorContext, fn)` in packages/db receives validated explicit `{ actorType, actorId, mcpSessionId? }` with human/agent/github/system type and nonempty identity. Mutation reads and writes use one active Tx; root write methods reject invocation outside Tx. All indirect Card writes share that boundary. Card mutations and affected Cards' version snapshots/activity commit together; delete retains a final attributed pre-deletion version and durable activity. Root repositories dereference DatabaseHandle on every call; escaped Tx repositories reject use. External I/O stays outside synchronous transaction bodies. After-commit hook fires only for successful commit. Shared schemas live in contracts; data access only in db. Preserve source/provenance independently of actor and preserve HTTP payloads/statuses and existing checklist semantics.

**Never:** Invent/default an actor, wrap asynchronous network work in SQLite transactions, silently swallow errors, add compatibility fallbacks, implement later root counters/coalescing/baseVersion/history UI/snapshots/restoration, edit user data, add cloud services, create commits, or touch sprint-status.yaml. Required workflow artifacts and focused meaningful tests are authorized. New/split source modules stay at most 750 lines/100 KB; no speculative abstractions or mutation-name Proxy whitelist.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Atomic Card actions | Explicit actor; create/update/move/archive/delete/park/unpark/bulk update | All Card/child/link/order changes, corresponding versions and activity commit atomically with actor/session | Existing validation errors propagate |
| Failure after write | SQLite trigger aborts a subsequent version/activity/related write in each action | Complete relevant database state equals its pre-call state; no new activity/version or notification | Original failure propagates |
| Missing/invalid actor or root write | Absent actor, empty identity, invalid type, or write called on root repository | Rejected before writes | Compile-time and runtime enforcement |
| Async or expired Tx | Promise callback or repository retained after run | No writes commit; expired repository refuses access | Explicit error |
| Holder replacement | Existing repositories, routes and MCP registry; new database assigned to holder | Next reads/writes use replacement; old database unchanged | No stale captured handle |
| HTTP/MCP attribution | Human HTTP mutation; MCP host with optional session; GitHub sync/import | Version and Card event carry actual human/agent/github identity; source still reflects template/MCP/AI/import | Permissions and conflict errors retain behavior |
| Commit hook | Successful commit and injected rollback | Hook called only after success and outside transaction | Failures propagate without pretending committed data rolled back |

</intent-contract>

## Code Map

- `packages/db/src/connection.ts:9` returns raw Drizzle DB; schema SQL at 339/353 must agree with `schema/tables.ts:337` activity and 351 Card versions. Versions currently cascade on delete and lack attribution.
- `packages/db/src/repositories/storymapper-repository.ts:125` is 3,666 lines; captures raw DB. Card actions 433–757, Card helpers 2568/2719–2781, activity 2908–2938, row mappers 2941 onward. Only create self-transacts; archive creates duplicate audit events; history hardcodes actor.
- Same repository: samples/templates 148–201, release deletion 880, remote import 2137, ChangeSet apply 2316 write Cards indirectly. Rehome 676 changes descendants; move 573 reorders siblings/links. Getters at 160/2532 write initialization. Preserve behavior through explicit transactional initialization/callers while keeping root reads free of writes.
- `packages/db/src/repositories/getting-started-store.ts:7` and `project-repository.ts:9` capture DB. Getting-started store and helpers need holder/Tx context; existing rollback tests use real abort triggers.
- `packages/contracts/src/schemas/domain.ts:11,297,611`: actor type, history summary default, Activity Event schema. Add shared ActorContext and persisted actor/session fields; remove actor default. `packages/core/src/audit/events.ts:3` already takes explicit actor.
- `apps/server/src/http/routes/index.ts:153,270–321,588,942`: captured repository/MCP registry, eight human actions, conflict resolution and ChangeSet apply. `apps/server/src/server.ts:35–38` and `mcp/stdio-main.ts:11–15` capture raw DB including close hook.
- `apps/server/src/mcp/tools/register-tools.ts:36,112–140,278,314–354`: optional/default host, Card/ChangeSet actions and separate asynchronous tool-call audit. Require supplied host identity; optional supplied session. Keep separate tool audit outside atomic Card event.
- `apps/server/src/services/work-item-sync.ts:111,210,261`: remote fetch precedes imports/updates; actor is github with connection id. Human choosing remote in conflict resolution stays human.
- `packages/db/src/repositories/storymapper-repository.test.ts`, `getting-started.test.ts`, `apps/server/src/http/routes/index.test.ts`, `mcp/tools/register-tools.test.ts`: existing callers need explicit UoW; preserve source-sensitive checklist and approval behavior. No external better-sqlite3/drizzle imports were found. Graph MCP tools unavailable; source is authoritative.
- `scripts/diagnostics.mjs:88` — broader source scan found the existing native constructor probe requiring better-sqlite3 outside db. Move its loading/constructing/closing into dedicated db source while retaining doctor error formatting here; initial app/package-only scan missed this script.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/schemas/domain.ts`, contracts exports, `packages/core/src/audit/events.ts` — define explicit ActorContext and attributed history/activity without defaults.
- [x] `packages/db/src/connection.ts`, `schema/tables.ts`, new `database-handle.ts` and `unit-of-work.ts`, db exports — implement holder, active synchronous Tx lifecycle, root-write rejection and commit hook; persist actor/session and retained deletion versions. Development schema changes in place; do not add legacy migration compatibility.
- [x] `packages/db/src/repositories/cards-repository.ts` and focused Card helpers/history, `storymapper-repository.ts` and aggregate modules — extract bounded modules, bind every writer to Tx, dereference holder for reads, and make direct/indirect Card changes plus history/activity atomic. Avoid redundant nested transactions; internal calls reuse Tx. Record changed descendants for rehome/release deletion; record moved Card only for position-only sibling bookkeeping.
- [x] `apps/server/src/server.ts`, `mcp/stdio-main.ts`, HTTP routes, MCP registration, work-item sync — explicitly choose actor at call boundaries, run synchronous SQLite phases in UoW, use current holder for shutdown. Explicit HTTP human id is local-user; MCP actor id is supplied host; github actor id is connection id; startup system id is sample-initialization. Keep sources human/mcp/ai/template separate.
- [x] Focused db/server tests and affected existing fixtures — cover every matrix row with actual SQLite failure injection and real HTTP/MCP caller assertions; add architecture import scan and Card/module size guard.
- [x] `scripts/diagnostics.mjs`, `packages/db/src/native-probe.mjs` — keep native probing within db and preserve constructor-time doctor regressions; stage source before portable fixtures.

**Acceptance Criteria:**
- Given each named Card action, when invoked through a Tx-bound repository, then its state, Card Versions and Activity Events commit together or not at all, with explicit actor attribution.
- Given an indirect Card writer, when templates/imports/ChangeSets/release deletion/rehome change Cards, then the same transaction and attribution rules hold and existing approval/provenance behavior survives.
- Given a root repository, when any writer is invoked without Tx, then it fails before writes; given a replaced holder, when an existing caller next reads or writes, then it uses the new handle.
- Given completed implementation, when layout/import guards run, then Card repository and new/split source modules are at most 750 lines and no file outside packages/db imports better-sqlite3 or drizzle-orm.
- Given existing public API flows, when regression tests run, then response statuses/payloads and permission/conflict behavior remain valid and all typecheck/build/test gates pass.

## Spec Change Log

### 2026-10-04 — v3 re-derivation after review

Trigger: successful GitHub writes became buffered until the whole remote loop completed, so later provider failure lost previously retained issue identifiers; writable push had no caller regression. Amend the caller task to preserve baseline external-outcome retention: persist each successful push result and its legacy link/activity in one synchronous UoW before the next remote call; create the applied SyncRun only after all remote calls and local phases succeed. A later failure must not claim an applied batch. A failed local phase fully rolls back that result, while previously completed results remain attributable and accurately linked. Remote operations cannot be rolled back by SQLite.

KEEP: all eight Card actions and indirect Card histories remain one Tx with real trigger rollback; explicit actor/source separation; deletion retention; pure reads and explicit initialization; current-holder lookup and shutdown; forged/expired Tx rejection; original HTTP/MCP shapes/permissions/conflict responses; separate ChangeSet conflict persistence; bounded modules; prepared source content before UoW; native doctor probe within db; Node24 serial gates. The previous code-only diff at `/tmp/storymapper-2-1-preservation.patch` is a preservation reference, not authority: reuse verified portions after source inspection, and replace the known-bad paths described here. Never restore the buffered external push or the fresh-content/old-response hash mismatch.

Additional direct repairs to preserve during re-derivation:
- Keep validated ActorContext immutable during a run; readonly exposure and runtime freeze prevent attribution changes.
- Reject async callbacks and hooks explicitly and observe any returned rejection so misuse cannot terminate the process. Hooks remain synchronous; failures after commit must never imply rollback.
- Sync must preserve human edits arriving during fetch/push: no absent-result dereference, no unsent content hashes marked synced; retain the actual sent payload and mark pending local differences unsynced. Add deterministic deferred-provider tests for both races, with all provider calls outside SQLite.
- Add parked to changedFields and verify both parking and unparking.
- Add left/right reassignment rollback/history tests and matching repeated-Card baseUpdatedAt success coverage.
- Add writable HTTP/MCP push coverage, including later remote failure retaining earlier successful links and a later local failure rolling back every write of that result with no applied batch.
- Correct RUNBOOK stdio commands and the env example for explicit supplied MCP host and optional supplied session; no actor default.
- Ensure the architecture assertion also catches bare static side-effect imports of forbidden DB packages outside db.

Known-bad state avoided: successful remote creation identifiers discarded solely because a later remote call failed; truthful per-result local atomicity confused with distributed batch atomicity; unsent edits falsely marked synchronized; Promise misuse causing process-level rejection.


## Review Triage Log

### 2026-10-04 — Review pass 1
- verdicts: 24 findings — high 2, medium 13, low 4, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: concurrent edit enters a push branch without a prepared result — The pre-await Card decides pushed entries; the Tx rereads it and dereferences an absent entry. Re-derivation must retain the edit as unsynced without a crash.
  - `[high]` `[patch]` Blind: later edit is falsely hashed as sent — Fresh Card text is hashed beside an older provider response. Re-derivation must persist actual outgoing hashes and preserve newer local edits.
  - `[medium]` `[bad_spec]` Blind: later remote failure loses earlier successful creation linkage — Baseline persisted each successful remote result before the next call; buffering all results regresses this behavior. Amend external-result phases to retain each successful link atomically before continuing.
  - `[medium]` `[patch]` Blind: rejected callback Promise is unobserved — Returned thenables trigger rollback but their rejection is discarded. Re-derivation must reject unsupported async execution without an unhandled rejection.
  - `[medium]` `[patch]` Blind: transaction actor can be mutated to blank — The facade returns the same mutable validated ActorContext; logActivity subsequently reads it. Re-derivation must freeze that identity and expose readonly typing.
  - `[low]` `[reject]` Blind: raw capabilities are accessible through repository context — The holder intentionally exposes the raw DB and callers already own it; no app caller uses repository.db to bypass a method. Additional capability isolation is unlikely to affect everyday callers and needs substantial new machinery; repository writer enforcement is covered.
  - `[low]` `[reject]` Blind: extracted helper methods are public — Helpers remain Tx-only and no HTTP/MCP/service caller independently invokes them. This developer-only exposure has no demonstrated everyday outcome; hiding the cross-module receiver requires more than a direct correction.
  - `[medium]` `[patch]` Blind: async after-commit hook rejection is discarded — The () => void type accepts async functions and run discards their result. Re-derivation must enforce the synchronous hook contract and make rejected hooks explicit without a process-level rejection.
  - `[low]` `[patch]` Blind: parked field missing from version changedFields — Park/unpark now write versions, but changedCardFields omits parked. Re-derivation must add the actual field and assertions.
  - `[medium]` `[patch]` Blind: documented stdio commands omit required host — RUNBOOK MCP commands and env example do not supply the newly mandatory identity. Re-derivation must document supplied host and optional session without inventing a fallback.
  - `[false]` `[reject]` Intent: patch alone cannot prove workflow execution — This is an evidence limit, not a defect: parent independently executed 247 tests and release checks and is performing all four review layers. No sprint-status change exists.
  - `[false]` `[reject]` Intent: local transactions do not provide cross-GitHub atomicity — Story 2.1 expressly specifies one synchronous SQLite transaction per Card mutation. It does not promise distributed rollback of GitHub or separate tool-call audit.
  - `[false]` `[reject]` Intent: selected actor identities do not distinguish real people — The local-first story requires an explicit actor id or MCP host, not authentication or automatic client discovery. Tests verify explicitly chosen identities and optional sessions.
  - `[false]` `[reject]` Intent: browser actor cues and production notifications are absent — The story explicitly says after-commit hook with no subscribers yet; browser history UI and notification delivery are later scope. Persistence and injected HTTP are the specified outer surfaces.
  - `[false]` `[reject]` Intent: Project-wide counters and deleted-history UI are absent — Named Story 2.1 covers atomic Card mutations; later stories own root counters, snapshots and visible history. Retained deletion rows satisfy this story without adding those features.
  - `[medium]` `[bad_spec]` Verification: writable GitHub push commit phase is untested — Trust the filed caller search: current tests only reject read-only push. Clarify successful-external-result phases and add actual two-Card caller regressions covering later provider and local failures, with each result atomic and prior successful remote linkage preserved.
  - `[medium]` `[patch]` Verification: reassignment versions and rollback untested — Trust filed test searches: only unassign is exercised. Re-derivation must cover left/right reassignment snapshots, actor/event data and injected child-history rollback.
  - `[medium]` `[patch]` Verification: matching repeated-Card ChangeSet baselines untested — Trust filed baseUpdatedAt search: tests exercise stale values or omit them. Re-derivation must verify two operations sharing a matching original timestamp succeed.
  - `[medium]` `[patch]` Verification other: concurrent edit crashes sync — Source tracing confirms recomputed localChanged can dereference a missing pushed result. Same repair as the blind concurrent-edit finding.
  - `[medium]` `[patch]` Edge: concurrent edit lacks pushed result — Current final Tx reads a newer Card than the remote-phase decision; same verified crash and repair as blind/verification findings.
  - `[high]` `[patch]` Edge: edits during push are falsely synchronized — Final hashes use newer Card content that was never sent; same verified data-loss risk and repair as blind finding.
  - `[medium]` `[bad_spec]` Edge: successful remote creations lose linkage after later failure — Later provider failure is a new regression from buffering; baseline also lacked reconciliation if the same result could not persist. Restore earlier-result retention, keeping each local result atomic; distributed reconciliation remains outside the SQLite guarantee.
  - `[low]` `[patch]` Edge: parked-only history has no changed field — changedCardFields lacks parked; same direct field correction as blind finding.
  - `[medium]` `[patch]` Edge: rejected async continuation is unhandled — Runtime guard rolls back and expires repositories but leaves returned Promise rejection unobserved; same repair as blind finding.


### 2026-10-04 — Review pass 2
- verdicts: 20 findings — high 1, medium 13, low 1, false 5, maybe-false 0
- findings:
  - `[medium]` `[defer]` Blind: removed milestone cannot serialize a conflict value — Baseline createSyncConflict and milestone comparison use the same JSON.stringify(undefined) and required columns; this pre-existing removal case can abort sync.
  - `[medium]` `[defer]` Blind: generated push bodies differ from raw sync descriptions — Baseline push already hashes buildGitHubIssueBody while sync compares/sends card.description. Shared payload normalization is pre-existing integration work.
  - `[high]` `[defer]` Blind: independent remote field changes can be overwritten — Baseline uses the same overlapping-field conflict check then sends the full local payload; a local title edit can overwrite a remote-only description edit.
  - `[medium]` `[patch]` Blind: current hierarchy override is cleared by persistPushResult — The new shared helper omits the flag whereas baseline sync spread the existing link; repair preserves current persisted overrides and tests changes during awaits.
  - `[medium]` `[defer]` Blind: conflict resolution races with newer Card edits — Both baseline resolution branches captured Card/link values before provider awaits and applied the same stale fields/hashes; the new UoW makes their local writes atomic without creating this older race.
  - `[medium]` `[defer]` Blind: an earlier edit remains marked synced after later provider failure — Baseline also persisted the first result before later calls without updating its state on subsequent failure, and its health report only compared text/body hashes. Earlier human edits remain saved; pending state accuracy is older integration behavior.
  - `[medium]` `[patch]` Blind: holder replacement can apply stale prepared responses — A replacement retaining identifiers makes the new Tx consume values fetched for the former DB; an internal holder-identity check now rejects such result phases and deferred tests exercise cloned identifiers.
  - `[medium]` `[defer]` Blind: unchanged read-only sync grows history — Baseline read-only sync unconditionally called applyRemoteWorkItem/updateCard and appended history/events, even for identical remote content.
  - `[medium]` `[patch]` Blind: Markdown audit omits newly meaningful Card actor identities — The shared formatter emits only actorType; newly distinct Card actors therefore disappear from this existing accountability surface. A direct rendering correction adds actor and optional session with export regression.
  - `[low]` `[defer]` Blind: version numbering reads all previous snapshots — Baseline writeCardVersion used the identical select-all and row-count implementation. Its extra materialization is real but pre-existing; aggregate numbering optimization is deferred.
  - `[medium]` `[defer]` Edge: deleting a Card during push leaves a remote result unlinked — Baseline upsertRemoteWorkItemLink had the same missing-Card validation after the provider await; neither implementation can retain that result without a detached-outcome/reconciliation policy.
  - `[medium]` `[patch]` Edge: sync resets an existing local hierarchy override — Same verified omission as the blind hierarchy finding; preserve existing override within the Tx upsert and exercise the caller.
  - `[medium]` `[patch]` Verification: sync partial-result failure lacks regression — Trust the filed repository searches: explicit push failure tests do not execute syncWorkItems. Add a sync push-then-failure case proving retained actual sent data and no applied run.
  - `[medium]` `[patch]` Verification: generated conflicts lack caller assertions — Trust the filed searches: the resolution test manually creates its conflict. Add divergent-title sync and inspect the health report's actual generated conflict contents.
  - `[medium]` `[patch]` Verification: deletion snapshot contents are not checked — Trust the filed searches: current assertions count and attribute retained rows only. Capture a meaningfully edited pre-delete Card and compare its final decoded snapshot.
  - `[false]` `[reject]` Intent: patch records alone do not prove workflow or status preservation — carried: parent independently ran all four commands; 265 tests and serial hygiene/typecheck/build passed. Mutating commands exclude sprint-status and the selective reversion targeted only 42 code paths.
  - `[false]` `[reject]` Intent: caller-wide effects exceed SQLite atomicity — carried: named Story 2.1 expressly guarantees synchronous SQLite Card mutations, with separate tool audit; distributed GitHub rollback is not its guarantee. Result retention preserves baseline external behavior.
  - `[false]` `[reject]` Intent: configured actor is not authenticated real-person identity — carried: story requires explicit actor id or host/session; authentication and automatic client identity discovery are not requested.
  - `[false]` `[reject]` Intent: browser actor/history presentation is absent — carried: Card persistence/version/activity is the named story surface; browser history presentation belongs to later stories. Retained deletion evidence does not require new UI.
  - `[false]` `[reject]` Intent: production notifications have no subscriber — carried: the story explicitly specifies an after-commit hook with no subscribers yet. Tests exercise successful/rollback sequencing and committed data after hook failure.

### 2026-10-04 — Review pass 3 (follow-up pass)
- verdicts: 35 findings — high 0, medium 5, low 10, false 20, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: assertSynchronous discards the async rejection silently — carried from pass 1: the explicit "must be synchronous" error is thrown and the returned Promise rejection is deliberately observed so it cannot terminate the process; the run is not silent.
  - `[false]` `[reject]` Blind: HTTP routes hardcode MCP host "local-mcp-host" — the call boundary supplies an explicit identity as the spec requires ("MCP actor id is supplied host"); createMcpRegistry itself rejects a missing or blank host and the value matches the documented dev:mcp env.
  - `[low]` `[reject]` Blind: in-place schema change without stale-schema guard — AD-9 of the architecture spine and the intent ("never add compatibility fallbacks", no legacy migration) specify in-place schema changes before the first tagged release; no user databases are opened.
  - `[false]` `[reject]` Blind: no ADR for UoW, holder and actor taxonomy — the unit-of-work rule and versioning decisions are already recorded in ARCHITECTURE-SPINE.md and the actor taxonomy is fixed by the intent; this story makes no new far-reaching choice.
  - `[false]` `[reject]` Blind: facade bind casts and bare `this.context.database;` assertions — design preference with no demonstrated wrong outcome; writer enforcement is covered by runtime and compile-time tests.
  - `[false]` `[reject]` Blind: afterCommit hook and TransactionContext are over-engineered — the after-commit hook and expired-Tx rejection are required by the intent contract and matrix.
  - `[false]` `[reject]` Blind: source import reads file in handler with empty-string fallback and 500 on missing file — the request schema refinement guarantees content or filePath so the empty fallback is unreachable; the baseline read the same file and also surfaced a 500, and the intent preserves statuses.
  - `[false]` `[reject]` Blind: ChangeSet conflict handling duplicated and non-atomic — the separate conflict-status persistence is specified (KEEP: separate ChangeSet conflict persistence) and tested for HTTP and MCP; structure matches the baseline catch path.
  - `[low]` `[reject]` Blind: syncWorkItems length and JSON.stringify comparison — cosmetic; the comparison is deterministic for the same Card object shape and the rework is not a direct correction.
  - `[false]` `[reject]` Blind: initiating actor lost for sync, push and import — the spec explicitly sets the github actor id to the connection id for sync and import.
  - `[false]` `[reject]` Blind: GET routes now run write transactions — spec requires visible default initialization to be preserved via explicit initialization at callers while root reads stay write-free; the baseline getters wrote on read.
  - `[false]` `[reject]` Blind: retained deletion versions unreadable and no unique index — Design Notes state deleted-Card history visibility remains unchanged and history UI is a later story; numbering and indexes are the deferred DW version-numbering entry.
  - `[false]` `[reject]` Blind: test architecture depends on cwd and git ls-files — Verification requires staging new files before tests and tests run from package roots; the failure mode only appears outside the specified workflow.
  - `[low]` `[patch]` Blind: RUNBOOK mixes an English paragraph into a German document — verified at docs/RUNBOOK.md MCP section and changelog; translated both to German. Other sub-claims (empty `STORYMAPPER_MCP_HOST=` in .env.example) are false: the empty value fails fast with a required-variable error as intended.
  - `[low]` `[reject]` Blind: mechanical-extraction indentation debt in new modules — real but cosmetic; no formatter is configured and a repository-wide whitespace rewrite is not a direct correction at review stage.
  - `[false]` `[reject]` Blind: redundant validation in contracts/import path — no demonstrated input that is accepted on one path and wrongly rejected on another.
  - `[medium]` `[reject]` Edge: legacy databases lack new columns — carried reject: same root cause as the in-place schema row above and excluded by AD-9 and the intent; [low] by reason of the intended development-only schema policy.
  - `[medium]` `[reject]` Edge: removed card_versions FK cascade persists on old databases — same root cause and same exclusion as the schema row above.
  - `[medium]` `[defer]` Edge: Card deleted during push leaves remote result unlinked (push path) — carried: already in the `deferred` list ("A Card deleted during remote creation leaves the external result unlinked").
  - `[medium]` `[defer]` Edge: Card deleted during remote call in syncWorkItems aborts after the remote write (sync path) — carried: same root cause as the push-path row and the existing deferred entry.
  - `[low]` `[reject]` Edge: holder replaced during push yields 409 after remote write — holder replacement during a live push is not a reachable runtime event in the server; the deferred unlinked-result entry already covers the remote-applied-but-unlinked outcome.
  - `[low]` `[reject]` Edge: read-only connection with concurrent local edit marks link unsynced — required behavior to preserve human edits arriving during fetch; a read-only connection re-applies remote on its next sync, so the effect is a one-run delay.
  - `[low]` `[reject]` Edge: MCP success audit failure reports failed call — baseline had the identical log-after-handler structure inside the same try; the audit remains separate by spec and the case needs the project to vanish mid-call.
  - `[false]` `[reject]` Edge: listCardHistory returns [] for deleted Card — carried by the deletion-history row above; deleted-history visibility is unchanged by design.
  - `[medium]` `[patch]` Gap: conflict resolution "local" branch untested — pre-verified; added a route test in apps/server/src/http/routes/unit-of-work.test.ts (shared conflictFixture helper) asserting the provider update outside the transaction, injected link-trigger rollback of link and conflict, then resolved-local with synced hashes.
  - `[low]` `[reject]` Gap: stdio-main environment wiring has no test — thin process wrapper over tested createMcpRegistry; a spawn harness is not a direct correction and is unlikely to regress silently.
  - `[low]` `[reject]` Gap other: old databases not migrated — same root cause as the schema rows above.
  - `[low]` `[defer]` Gap other: conflict route spreads stale link including parentOverrideLocal — carried: same stale-capture root cause as the existing deferred entry "Conflict resolution can apply stale Card data after awaited provider calls".
  - `[false]` `[reject]` Intent: readings A-D enumerated — descriptive; the diff implements reading B, which the intent states, and D is excluded by the intent.
  - `[false]` `[reject]` Intent divergence 1: sync/push rewrite goes beyond transaction boundaries — the behavior changes are the spec-change-log amendments (per-result UoW, no applied run after failure) and are tested in work-item-sync.test.ts and unit-of-work.test.ts.
  - `[false]` `[reject]` Intent divergence 2: actor vocabulary drops ai and mcp — fixed by the intent contract (human/agent/github/system) with no legacy compatibility.
  - `[false]` `[reject]` Intent divergence 3: schema edit without migration — AD-9 and the intent; same as the schema rows above.
  - `[false]` `[reject]` Intent divergence 4: @storymapper/db subpath aliases — test and tsconfig plumbing needed for the db module split and the architecture import scan; no behavioral effect.
  - `[false]` `[reject]` Intent divergence 5: stdio host now required — follows the intent (no default actor) and is documented in the RUNBOOK; the missing entry-point test is the rejected Gap row above.
  - `[false]` `[reject]` Intent divergence 6: existing tests rewritten to use UoW — mechanical wrapping that keeps the original assertions and checks preserved semantics.

## Design Notes

Deletion keeps durable final version data to satisfy the literal all-or-nothing deletion/version/event requirement; deleted Card history visibility remains unchanged. Card history sequence numbers continue the existing sequence model; root counters and 60-second coalescing belong to later stories. Reads that historically initialized defaults must be made genuinely read-only or dispatched through an explicit initialization unit of work at their outer caller, preserving visible defaults. Existing development database schema may be changed directly per architecture; no user databases are opened. Main is the orchestrator's authorized in-place branch; initial tree was clean at 097405abe7790a592a36ac4b83435bed3216b437 before the workflow created artifacts.

## Verification

Use PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH. Stage new source/test files before portable fixtures (git ls-files), excluding sprint-status.yaml. Run build and test commands serially because Vite clears shared output.

**Commands:**
- `corepack pnpm --filter @storymapper/db test` — all matrix DB regressions pass, none skipped.
- `corepack pnpm --filter @storymapper/server test` — real HTTP/MCP actor, rollback, replacement and existing API regressions pass.
- `corepack pnpm test` — all workspace tests pass without failures/skips.
- `node scripts/verify.mjs` — Git/source hygiene, Node/pnpm, workspace typecheck and build succeed.

## Changelog

- 2026-10-04 v3: recorded all 24 review verdicts; clarified external-result retention and preservation constraints for one coherent re-derivation.

- 2026-10-04 v1: source-investigated initial plan; froze explicit attribution, full Tx write enforcement and deletion-version retention while preserving later-story boundaries.
- 2026-10-04 v2: expanded the literal import guard to scripts; native probe relocation preserves existing doctor behavior without changing the intent contract.

## Auto Run Result

Status: done

**Summary:** Follow-up review pass 3 over the Story 2.1 diff since baseline. Four reviewers reported 35 findings; one medium test gap and one low documentation inconsistency were patched, the rest were carried from earlier passes, rejected with reasons, or recorded as already deferred.

**Files changed in this pass:**
- `apps/server/src/http/routes/unit-of-work.test.ts` — shared `conflictFixture` helper and a new "local" conflict-resolution test (provider call outside Tx, rollback via trigger, resolved-local with synced hashes).
- `docs/RUNBOOK.md` — MCP identity paragraph and changelog entry translated to German to match the document.

**Review findings breakdown:** patches applied 2 (medium 1, low 1); new deferrals 0 (three rows carried to existing deferred entries); rejected rows carry their reasons in the Review Triage Log above (schema/migration rows excluded by AD-9 and the intent, design-preference rows, behavior required by the spec).

**Follow-up review recommendation:** false. This was a follow-up pass and no `high` finding was patched.

**Verification:** `corepack pnpm --filter @storymapper/db test` 103 passed; `corepack pnpm --filter @storymapper/server test` 85 passed; `corepack pnpm test` all workspace packages passed; `node scripts/verify.mjs` completed (typecheck and build). Run serially on Node 24.

**Residual risks:** the eight existing deferred entries remain open (GitHub integration races and pending-state accuracy). `stdio-main.ts` environment wiring has no process-level test. No commit was made because the spec states no commit or push is authorized; new test and docs changes are staged. `sprint-status.yaml` was not touched.
