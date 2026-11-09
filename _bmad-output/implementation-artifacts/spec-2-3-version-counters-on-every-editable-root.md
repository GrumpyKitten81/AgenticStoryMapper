---
title: '2.3 Version counters on every editable root'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_revision: '609a02584b6c2e493ee7f92966ea6782780b9f01'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '[REDACTED_HOME]/Projects/StoryMapper/AGENTS.md'
  - '[REDACTED_HOME]/.claude/CLAUDE.md'
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
      A deleted or hidden Card target bypasses ChangeSet conflict preflight and leaves the proposal approved after an explicit not-found failure.
    evidence: |-
      The baseline timestamp preflight already skipped absent Cards, and both baseline and current apply updateCard fail explicitly before SQLite rolls the transaction back. HTTP/MCP mark conflict only for ChangeSetConflictError. Integer-token substitution did not introduce this behavior; Epic 3 owns the full conflict surface, including deleted targets.
    location: >-
      packages/db/src/repositories/changesets-repository.ts:75
    severity: medium
---

Date: 2026-10-04. Version: 3. Purpose: implement Story 2.3 counters, aggregate mutation ownership, explicit deletion, Card save coalescing and integer concurrency tokens from the Epic 2 intent. sprint-status.yaml belongs to the orchestrator: never write, revert or stage it. No commit/push is authorized.

<intent-contract>

## Intent

**Problem:** Editable roots have no version counters, Card history counts rows, and automatic foreign-key edits hide changes. Timestamp tokens cannot represent aggregate changes consistently.

**Approach:** Give Story Map, Card, Release, Persona and Roadmap integer counters and update them atomically with owned changes; align Card history with its counter, coalesce rapid same-actor saves and replace timestamp concurrency tokens.

## Boundaries & Constraints

**Always:** All five persisted roots and shared output contracts expose required positive integer version starting at 1. Existing root/owned-child/link mutations increase the affected root exactly once in the same unit of work, including multi-helper/bulk operations. Root creation including initial owned children remains version 1. Ownership follows AD-17: map-scoped Product Context belongs to Story Map; personas/annotations/attachments/Source Links on Cards belong to Card; Roadmap owns columns/swimlanes/cards/references. Project-scoped Product Context and Customization and Sync aggregates remain unversioned. Card changes do not bump Story Map. Sibling reindex bumps only the moved Card; changed Release siblings follow the normal Release rule. Duplicate link requests that write nothing do not bump. Explicit use cases clean up root references before deletion; Release deletion unassigns and versions every assigned physical Card, including those in a logically deleted map. No ON DELETE CASCADE or SET NULL exists in either runtime SQLite schema or Drizzle definitions when either referencing or referenced table is a versioned root. Retain Card history after deletion. Card Version equals cards.version and is unique per (card_id,version); eliminate row counts. Explicit Card saves (updateCard) by the same actor identity/type/session within 60 seconds of the latest Card Version update that latest snapshot in place without increasing the counter; a different actor or expired window creates a new version. Compare the latest recorded version time; preserve attribution and observable final snapshots, and reject clock-negative intervals for coalescing. Structural actions, owned-link changes, Release unassignment and deletion retain normal bumps. Every returned Card and audit snapshot carries the committed counter. Replace baseUpdatedAt with positive integer baseVersion throughout shared schemas, proposal production, existing ChangeSet preflight and tests; check against pre-operation state once before application. Preserve current atomic conflict behavior. Use current-holder, transaction-bound repositories, explicit actor attribution and existing shared write gate. Add meaningful table-driven/failure/outer-boundary tests.

**Never:** Add timestamp-token compatibility, release migration/rebuild machinery for disposable development databases, new delete/update APIs, future Epic 3 editor/SSE/full conflict UX, dependencies/cloud/network, user-data edits, silent errors, placeholders, commit/push, or sprint-status mutations/staging/reverts. Existing behavior outside this story stays intact. Required workflow artifacts/tests are authorized by the invoked workflow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Root creation and mutation | Each of five roots; actual existing mutations | Creation version 1; root/owned changes +1 atomic; no other owner bump | Missing targets retain explicit existing behavior |
| Compound ownership | Bulk Card fields + links; Roadmap initial children and subsequent references; map-scoped context | One affected-root increment per UoW; created aggregate remains 1; duplicate links unchanged | Failed later write rolls all counters/content/history/activity back |
| Reorder isolation | Card sibling move and Release reorder | Only moved Card bumped; map and other Cards unchanged; changed Releases bumped once | No partial update |
| Explicit deletion | Release assignments, Persona joins, Card-owned children/Sync refs, connector default map refs | Explicit unassignment/unlink/cleanup and owning counters; deleted Card history survives | Trigger failures roll back cleanup and versions |
| Card save history | Same/different actor and session; times inside/outside 60s and negative clock interval | Same-actor rapid explicit saves coalesce; other mutations/new actors create matching unique history numbers | Uniqueness/history failure rolls back Card and counter |
| Concurrency token | Fresh/stale baseVersion, repeated same-Card ChangeSet operations; HTTP/MCP proposal/read surfaces | Integer tokens only; fresh preflight succeeds once; stale apply conflicts atomically | Existing conflict surface/status retained |
| Schema/public outputs | Real SQLite foreign_key_list and indexes; contracts and outer HTTP reads | Five required integer counters; unique history index; no automatic delete touching roots | Invalid version tokens rejected by shared schemas |

</intent-contract>

## Code Map

- `packages/db/src/schema/tables.ts`, `connection.ts` — Drizzle + actual development DDL both need counters, root-related FK actions removed and Card history uniqueness. Runtime map default_connection_id FK differs from Drizzle; align definitions. No production release migration exists.
- `packages/contracts/src/schemas/domain.ts:43,80,103,115,192,605` — five root outputs and ChangeOperation token; `api/http.ts` derives requests. Strictly required output versions; update typed fixtures throughout affected packages.
- `packages/db/src/database-handle.ts`, `unit-of-work.ts`, `repositories/storymapper-repository.ts` — active explicit actor Tx; coordinate repeated helper mutations at Tx scope without raw data access outside db.
- `repositories/cards-repository.ts:29,59,145,200,254,323,407,423` — creation/save/move/deletion/rehome/history writer/attachments. Currently row-count writer, no coalescing; siblings intentionally update position without versions. Preserve final deletion snapshot.
- `repositories/customizations-repository.ts:79,128,165,253` — Persona updates and Persona/Annotation deletion must explicitly unlink and version affected Cards; set/delete Card persona/annotation need owner bumps.
- `repositories/projects-repository.ts:79,165,189,270` — soft map delete, create/update and map-scoped Product Context owner changes; no Card-to-map bump.
- `repositories/releases-repository.ts:23,43,65,79` — update/reorder, explicit Card unassignment already exists but currently lacks counters; add Sync reference cleanup and physical hidden-map handling.
- `repositories/roadmaps-repository.ts:23,49,74,89,104,132` — creation adds three columns + swimlane through child methods; preserve version1; owner increments for subsequent children/references; duplicate reference branch writes nothing.
- `repositories/sources-repository.ts:134,152`, `work-item-repository.ts:94` — Source Link Card owner changes; connector deletion must explicitly clear versioned map default references. Sync tables remain unversioned but root FK cleanup must be explicit.
- `repositories/changesets-repository.ts:74`, `apps/server/src/http/routes/index.ts:1233` — existing timestamp preflight and generated proposal token. Preserve initial-state checks for multiple operations on one Card.
- `packages/db/src/unit-of-work.test.ts`, `repositories/storymapper-repository.test.ts`, `apps/server/src/http/routes/unit-of-work.test.ts` — real SQLite/HTTP/MCP attribution and rollback. Existing INSERT failure triggers need meaningful coverage of UPDATE coalescing too. New focused root-counter table tests complement existing integration tests.
- Graph tools unavailable in the enabled inventory; two synchronous investigation agents verified actual source. Cached Epic 2 context is current. Story 2.2 supplies current-holder/gate/snapshot invariants; its bookkeeping is not verification.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/schemas/domain.ts`, db `schema/tables.ts`, `connection.ts`, `repositories/row-mappers.ts` — counters, required outputs, uniqueness, safe root FKs and integer token contract.
- [x] `packages/db/src/database-handle.ts`, bounded db repository helper(s), `repositories/storymapper-repository.ts` — share atomic once-per-root mutation bookkeeping; preserve Tx lifetime and attribution.
- [x] db `repositories/cards-repository.ts`, `customizations-repository.ts`, `sources-repository.ts` — matching history/counters, rapid same-actor save coalescing, owned changes, explicit Card/Persona/Annotation cleanup and exact final returned snapshots.
- [x] db `repositories/projects-repository.ts`, `releases-repository.ts`, `roadmaps-repository.ts`, `work-item-repository.ts` — all root and owned mutation paths, initialization, explicit Release/connector cleanup and correct ownership.
- [x] db `repositories/changesets-repository.ts`, server `http/routes/index.ts`, affected typed fixtures — migrate token producer/consumer to baseVersion with unchanged atomic preflight.
- [x] focused db root/version tests plus existing db/server/web/core tests — execute every matrix row with actual SQLite and HTTP/MCP public output/token checks; include trigger rollback and coalescing update failure, same-second different actors, 60-second boundary/session and physical hidden-map deletion assignments.

**Acceptance Criteria:**
- Given the five editable roots, when created and returned by the existing public read surfaces, then each includes integer version 1; when each existing root/owned mutation commits, then only its owning counter increases once atomically.
- Given same-actor rapid Card saves, when the second save commits within 60 seconds, then latest history updates in place and the root counter stays; given another actor/session or expired window, then a new matching unique version appears.
- Given Card reorder, when the Card moves, then only its version changes and Story Map version remains unchanged.
- Given Release deletion, when Cards are unassigned, then explicit attributed code bumps Cards and rollback leaves all data unchanged on failure.
- Given runtime and Drizzle schemas, when inspected, then no CASCADE/SET NULL touches versioned roots and history is unique by Card/version.
- Given generated proposals and accepted operations, when read/applied, then baseVersion is the sole concurrency token, stale operations conflict before writes, and repeated fresh operations use initial state.

## Spec Change Log

## Review Triage Log

### 2026-10-04 — Review pass 1
- verdicts: 23 findings — high 0, medium 6, low 2, false 15, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: existing databases lack counter columns — AD-9 explicitly makes prototype/development databases disposable and says prototype Projects are not migrated; this is fresh-schema work until the release baseline, not a promised upgrade.
  - `[false]` `[reject]` Blind: existing FK actions are not rebuilt — The same explicit AD-9 no-prototype-migration decision excludes rebuilding old development tables. Both new runtime and Drizzle schemas are tested for the required invariant.
  - `[false]` `[reject]` Blind: historic counters/snapshots have no upgrade — AD-9 excludes migration of prototype Projects; adding historic backfill/compatibility would contradict the project decision and global AI-DO-NOT rules.
  - `[false]` `[reject]` Blind: coalesced content can retain a proposal token — Story 2.3 expressly requires cards.version not to change during rapid same-actor saves; the implementation preserves that requirement. Full editor conflict semantics belong to later stories, and a separate counter would violate matching history/counter intent.
  - `[false]` `[reject]` Blind: a save may coalesce with creation or structural/link history — AD-7 explicitly selects the latest Card Version, without a mutation-kind qualification. Structural/link actions themselves still bump and add history; a subsequent save follows the stated latest-version exception.
  - `[false]` `[reject]` Blind: a coalesced save followed by a bump rewrites prior committed history — The specified save updates the latest history in place, followed by a distinct structural action creating the bumped row. Both are valid snapshots of those actions; the intent does not require cancelling a valid coalesced save when a later action shares its transaction.
  - `[false]` `[reject]` Blind: rolling save timestamps can coalesce indefinitely — The requirement tests each save against the latest Card Version within sixty seconds, with no maximum editing-session duration. Updating the latest save timestamp matches that rule and the executed rolling-window regression.
  - `[medium]` `[patch]` Blind: deleted Card history bypasses later map hiding — Reproduced delete Card then logical map delete returning two retained history rows. Derive the owner from retained history and enforce map visibility; regression preserves durable rows while hiding reads.
  - `[low]` `[reject]` Blind: owned-link versions contain only Card fields — Owned-only revisions can have empty changedFields, but link Activity Events retain the changed relationship and Story 2.3 requires matching counters, not an expanded historical snapshot schema. Expanding the shared history surface is more than a direct correction and unnecessary for this prerequisite; user-facing history is Story 2.4.
  - `[false]` `[reject]` Blind: omitted baseVersion bypasses checking — The story replaces the sole token in schemas and prepares later conflict detection; it does not make every operation require a token. Existing optional-token behavior is retained, generated update proposals now carry tokens, and stale supplied tokens reject atomically.
  - `[medium]` `[patch]` Blind: finalizers overwrite earlier audit after snapshots — Reproduced Original→First→Second in one UoW recording both after titles as Second. Capture the independent after object before registering the callback; reconcile only its committed version. The new regression preserves both transitions.
  - `[medium]` `[patch]` Gap: first-Release proposal branch has no token/conflict regression — Add a zero-Release map proposal through actual MCP, assert each current baseVersion, then archive a target and reject ApplyChangeSet atomically with no Release, assignment, history or creation event persisted.
  - `[medium]` `[patch]` Gap: SQLite positive-integer guards are not exercised — Add twenty real SQLite writes across the five roots: zero, negative, fractional and null are rejected while original rows remain unchanged.
  - `[false]` `[reject]` Intent: every editable object could imply all configuration rows — The named Story 2.3 explicitly identifies five roots; AD-17 deliberately leaves Project, Customization and Sync unversioned. The five-root implementation follows the resolved story.
  - `[false]` `[reject]` Intent: individual helper edits could imply multiple increments — AD-7 specifies one +1 in the transaction changing an aggregate; Tx-scoped deduplication implements committed aggregate mutation and preserves the explicitly required same-actor save exception.
  - `[false]` `[reject]` Intent: collaborative editing motivation exceeds current public checks — The user story explicitly says later stories detect conflicting edits. This story supplies counters, public reads and integer proposal tokens; browser editor conflict enforcement is not an unfulfilled acceptance criterion here.
  - `[false]` `[reject]` Intent: existing installations are not migrated — AD-9 explicitly states prototype Projects are not migrated and development databases are disposable until the baseline release migration. Fresh real schemas are the required surface now.
  - `[false]` `[reject]` Intent: browser save-window behavior was not operated — The story states schema/counter/history outcomes and no UI change or browser acceptance. Actual HTTP/MCP and controlled real SQLite tests exercise those outcomes; no browser-save claim is made.
  - `[false]` `[reject]` Intent: diff cannot establish workflow/status/gate execution — One exact renderer invocation, prescribed snapshot steps, independent 373-test run and serial release gates are recorded in tool evidence. sprint-status is excluded from all edits, staging and rollback; bookkeeping supplies no verification claim.
  - `[false]` `[reject]` Edge: first save after a structural action can coalesce — Same AD-7 latest-CardVersion rule as the blind kind finding; no required prior-save-kind guard exists. Each structural mutation still performs its required bump before the subsequent explicit save.
  - `[medium]` `[patch]` Edge: deleted then hidden Card history exposes retained content — Same reproduced missing-owner-visibility defect as the blind finding; preserve durable rows and enforce the stored Story Map owner when the physical Card no longer exists.
  - `[low]` `[reject]` Edge: numeric versions exceed JavaScript safe range — Precision would fail at 2^53, but reaching that many local aggregate edits is not an everyday state. Adding saturation/schema/token guards increases complexity without a reachable practical requirement.
  - `[medium]` `[defer]` Edge: absent proposal targets skip conflict classification — Source confirms explicit not-found failure and full rollback, but proposal remains approved because only ChangeSetConflictError marks conflict. The baseline timestamp implementation had exactly the same skip; record this existing conflict-surface issue for Epic 3 in the parsed deferred list.

### 2026-10-04 — Review pass 2 (follow-up)
- verdicts: 26 findings — high 0, medium 2, low 8, false 16, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: existing databases lack counter columns/FK changes — `carried` AD-9 disposable development databases, no prototype migration.
  - `[false]` `[reject]` Blind: stored ChangeSets with baseUpdatedAt unreadable under `.strict()` — Never excludes timestamp-token compatibility; AD-9 databases are disposable; without `.strict()` Zod would silently strip the token.
  - `[false]` `[reject]` Blind: optional baseVersion skips the check — `carried` omitted-token row; proposal producers take every id from the same snapshot map, so the `!` lookup cannot miss.
  - `[false]` `[reject]` Blind: coalescing weakens the token — `carried` AD-7 requires the counter to stay on coalesced saves.
  - `[false]` `[reject]` Blind: coalescing overwrites the creation snapshot — `carried` AD-7 latest-CardVersion rule has no kind qualifier.
  - `[false]` `[reject]` Blind: audit `after_json` rewritten with the committed counter — the intent requires every audit snapshot to carry the committed counter; the earlier pass already preserved per-transition content.
  - `[low]` `[reject]` Blind: null filter in writeCardVersion keeps stale keys — only an earlier in-unit returned object keeps a cleared key; the last finalizer writes the correct history snapshot, so users never meet it and a fix adds branches.
  - `[low]` `[reject]` Blind: duplicated cleanup loops, dead bump before delete, public context sets — harmless, cosmetic; a refactor is more than a direct correction.
  - `[false]` `[reject]` Blind: no ADR — the decisions are already recorded as AD-7, AD-9 and AD-17 in the architecture spine.
  - `[false]` `[reject]` Blind: project/roadmap cascades removed without cleanup — no Project, Story Map or Roadmap delete use case exists and Never forbids new delete APIs; Drizzle FK alignment is required by the spec.
  - `[low]` `[reject]` Blind: repeated CHECK expression, naming, no-op bump, HTTP updates without expected version — cosmetic or Epic 3 scope; a fix adds complexity.
  - `[false]` `[reject]` Edge: coalesced saves keep the token — `carried` as above.
  - `[medium]` `[defer]` Edge: deleted target and non-Card operations skip conflict classification — `carried` existing deferred item for changesets-repository.ts:75; no new deferred entry added.
  - `[false]` `[reject]` Edge: `versionsByCardId.get(cardId)!` may be undefined — register-tools.ts builds the map from `snapshot.cards` and every cardId comes from that snapshot, so the lookup cannot miss.
  - `[low]` `[reject]` Edge: no-op update patches still bump — an update call is a root mutation; empty patches are not reachable from the UI and the guard adds branches.
  - `[false]` `[reject]` Edge: coalescing into a structural/link history row — `carried` AD-7 latest-CardVersion rule.
  - `[low]` `[patch]` Edge: removed `changedFields` assertions leave history field summaries unpinned — merged with the gap finding below; patched by one assertion in the coalescing table test.
  - `[low]` `[patch]` Gap: Story Map soft-delete bump has no test — added a raw `story_maps.version == 2` assertion after `deleteStoryMap` in the hidden-map history test of root-versions.test.ts.
  - `[low]` `[patch]` Gap: `changedFields` never asserted for an ordinary save — added `changedFields` ⊇ title, description to every coalescing-table case.
  - `[medium]` `[defer]` Gap: preflight skips a deleted Card target — `carried` same existing deferred item.
  - `[false]` `[reject]` Gap: legacy databases lack `ensureColumn` — `carried` AD-9.
  - `[false]` `[reject]` Intent: creation version can be overwritten by the creator's first save — `carried` AD-7.
  - `[false]` `[reject]` Intent: retained history readable only via the repository, HTTP still 404 — row retention is the requirement; Never forbids new APIs and the HTTP route is existing behavior.
  - `[low]` `[reject]` Intent: outer-boundary tests omit link bumps and Release deletion through HTTP — HTTP/MCP tests cover outputs, tokens, conflicts and coalescing history; link/delete rules run against real SQLite; extra route tests are not a direct correction.
  - `[false]` `[reject]` Intent: `.strict()` rejects every unknown ChangeOperation key — that is how baseUpdatedAt is rejected as an invalid token; the intent requires rejecting it.
  - `[false]` `[reject]` Intent: MCP proposals gain tokens and audit events carry final counters — both are required by the intent (proposal production, committed counter on audit snapshots).

## Design Notes

AD-7 specifies latest-CardVersion save coalescing; its general +1 mutation rule and explicit Release deletion requirement remain effective for structural and owned-link actions. Equality includes actor type/id/session. Map-scoped Product Context is owned by Story Map (AD-17); project-scoped context has no versioned map. Existing Sync rows are a separate unversioned aggregate, but their references must be explicitly cleaned when their root targets are deleted. Changes are pre-release in-place schema edits, with no old-database compatibility.

## Verification

Use installed Node 24: `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH`. Stage new source files explicitly for git-ls-files fixtures. Never stage sprint-status.yaml. All test/build commands run serially.

- `corepack pnpm --filter @storymapper/db test` — focused matrix and existing repository/UoW checks all pass, no skips.
- `corepack pnpm --filter @storymapper/server test` — real HTTP/MCP/read/proposal/apply boundaries pass.
- `corepack pnpm test` — workspace tests pass without failures/skips.
- `node scripts/verify.mjs` — hygiene, runtime, typecheck and production build pass.

## Changelog

- 2026-10-04 v1: initial source-grounded plan for Story 2.3.

- 2026-10-04 v2: four-lens review with 23 individual verdicts, four shared repair groups, one pre-existing conflict deferral and explicit reasons for every rejection.

- 2026-10-04 v3: automation completion check confirms no pending work and refreshes the persisted terminal result.

## Final Verification Evidence

Parent independently read the complete unified implementation diff, then all four repaired-file diffs. Initial independent db/server/workspace/release runs passed 167/102/373 tests and all release gates. After the review repairs, independent focused suites pass **189 db** and **103 server** tests; the final workspace command passes **396 tests**, zero failures/skips: 61 portable scripts, 2 importers, 13 core, 28 web, 189 db, 103 server. Serial `node scripts/verify.mjs` then passes Git/source hygiene, Node/pnpm checks, workspace typecheck and production build on Node 24.17.0. Existing bundle-size advisory is nonblocking.

Every matrix row has executed passing coverage: root-versions tests cover five-root/owned mutation tables, aggregate initialization and duplicate links, Card/Release reorder, explicit cleanup including hidden-map assignments, actor/type/session and sixty-second/negative-time save boundaries, INSERT/UPDATE/DELETE failure rollback, runtime/Drizzle root FKs, unique history and all twenty invalid SQLite writes. Existing UoW tests exercise compound/bulk and rehoming rollback; server tests exercise HTTP/MCP five-root output, proposal tokens, repeated initial-state application, stale conflict rollback and first-Release atomic rejection. Root also reproduced audit object aliasing and deleted-hidden history on a disposable database before fixing them. No user data was opened or modified.

Final logs: `/tmp/storymapper-2-3-parent-db-final.log`, `/tmp/storymapper-2-3-parent-server-final.log`, `/tmp/storymapper-2-3-parent-workspace-final.log`, `/tmp/storymapper-2-3-parent-verify-final.log`. No browser/UI conflict acceptance is claimed for this schema prerequisite. Native Windows/Linux SQLite execution has not been operated on this Mac.

## Auto Run Result

Status: done
Blocking condition: none

- Summary: follow-up review pass 2 of Story 2.3 (five-root integer version counters, Card save coalescing, baseVersion tokens). The implementation is unchanged; two verification gaps were closed with tests.
- Files changed in this pass: `packages/db/src/repositories/root-versions.test.ts` (asserts Card history `changedFields` in every coalescing case and the Story Map version after soft delete).
- Review findings: 26 (medium 2, low 8, false 16). Patched 3 low, all test assertions (0 high, 0 medium patched). Deferred: none new; the two medium rows carry the existing deferred item for absent-target conflict classification. Every rejected finding and its reason is in the Review Triage Log above.
- Follow-up review recommendation: false. No high finding was patched in this follow-up pass.
- Verification: `corepack pnpm --filter @storymapper/db test` passes 189 tests; `corepack pnpm --filter @storymapper/db typecheck` passes on Node 24.17.0. The server, workspace and release gates were not re-run, because this pass only changed one db test file.
- Commit: not created, because the spec states no commit/push is authorized. All reviewed changes remain in the working tree for the orchestrator. sprint-status.yaml was not touched.
- Residual risks: coalesced saves keep `cards.version` unchanged (AD-7), so a stale `baseVersion` can pass after a same-actor rapid save; the deleted-target conflict deferral is unchanged; no migration exists for pre-2.3 development databases.
