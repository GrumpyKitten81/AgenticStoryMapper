---
title: Delivery status from Agents
type: feature
created: 2026-10-12
status: done
baseline_revision: e034fd9125a75d8dbf0aaf895313b2c429d174b7
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      Global and map-specific Workflow Statuses can share a name with conflicting groups.
    evidence: |-
      Existing create/update allows duplicate names; Card.status stores only the name. Tracking chooses configured position order while release notes classify any matching done group. Existing fixed Tracking icons already disagreed for duplicate builtin names. Resolving identity/precedence is a pre-existing configuration policy issue.
    location: >-
      packages/db/src/repositories/customizations-repository.ts:21
    severity: medium
---

# Story 4.11: Delivery status from Agents

Reproducing statement: Implement scoped external-reference delivery batches through one atomic ChangeSet, configured Tracking statuses and the strict two-second server-call acceptance; preserve orchestrator-owned sprint tracking. Date: 2026-10-12. Version: 2.

<intent-contract>

## Intent

**Problem:** Agents cannot assign mixed delivery statuses to many Cards using their stable external references in one call. Tracking currently hides method-specific workflow states.

**Approach:** Expose one scoped delivery command producing one selected Card status operation per target in a single ChangeSet. Reuse the executor and configured Workflow Statuses, and render those statuses in Tracking.

## Boundaries & Constraints

**Always:** Contracts own shared schemas; pure core resolves operations; repositories own SQL. Require actual ActorContext and admitted Agent access. Resolve case-sensitive trimmed `(Story Map, card, system, external id)` identities; validate existing global/current-map status names; maximum 100 unique resolved Cards. Apply defaults true; Agent protection or apply=false stores a proposal only. Use addressed sync baselines for concurrency, aggregate every conflict and abort the batch. Successful apply advances only the addressed system baseline, records one operation Activity per Card, versions/history/audit atomically and publishes live changes after commit. Measure the complete real 100-status server call serially on 1,000 Cards against 2 seconds, retaining failures.

**Never:** Write, stage or revert sprint-status.yaml or deferred-work.md; infer verification from orchestrator rows; commit or push. No invented statuses, name mapping, new Workflow engine, chunked partial apply, GitHub identity migration, SaaS/provider/network dependency, custom bulk apply path, new Tracking view or performance tolerance relaxation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Batch | 1–100 cards with system/externalId/status and storyMapId | One ChangeSetCommandResponse; one update operation per Card; all statuses applied | Existing command lifecycle |
| Invalid | Empty/101, blank/reserved refs, unresolved refs, duplicate resolved Cards, unknown/foreign-map status | Entire call refused before proposal/domain changes; indexed target details identify unresolved/invalid rows | Strict schema or DomainError |
| Conflict | Human edit since addressed baseline, including several targets | Every conflicting operation/card reported; no partial status, version, history or baseline mutation | Shared ConflictReport |
| Proposed | Agent protection or apply=false | Proposal and preview reference; no Card changes or pre-apply snapshot | Existing protection policy |
| Baselines | Two systems bound to one Card | Successful addressed system advances to resulting version; other baseline stays unchanged | Other system remains stale |
| Delayed apply | Ref owner/state or status configuration changed after proposal | Revalidate actual scope/status/baselines; refuse invalid or stale batch | No partial apply |
| Same status / parked | Valid existing target retains same status or parked state | Existing Card-save semantics; status-only update, no unrelated hierarchy/park mutation | No implicit upsert/unarchive reset |
| Configuration | Method statuses created/adapted via generic tools | States exist before assignment and show in Tracking with live updates | No invented state |
| Budget | Real audited 100-status call on 1,000 Cards | Full snapshot/history/audit cost <=2,000ms | Retain failed timing evidence; strict bound |

</intent-contract>

## Code Map

- `packages/contracts/src/api/card-customization.ts`, `index.ts`, `mcp/{tools,tool-inputs}.ts` — strict shared request `storyMapId, cards:[{system,externalId,status}], apply?`; reuse ChangeSetCommandResponse. External selector constraints in `schemas/operation-fields.ts` and typed `card:update` already exist.
- `apps/server/src/application/card/delivery-status.use-cases.ts` (new), `application/descriptors.ts`, `mcp/tools/register-card-tools.ts` — capability updateDeliveryStatus / UpdateDeliveryStatus; resolve all rows using existing repository owner/ref/status reads; one status-only external-selector update with baseVersion from syncedVersion. Call executeChangeSetCommand; both Agent surfaces `/mcp` and `/api/mcp/call` share registration.
- `application/changeset/{changeset-command,changeset-executor}.ts` — reuse command policy, proposal, transaction-start aggregate conflicts, pre-apply snapshot, audit and committed live events; no bespoke executor.
- `packages/core/src/changesets/{entity-resolution,operation-conflicts}.ts` — targetId already verifies external scope. For external-selector Card status updates validate configured name, compare addressed baseline and advance addressed reference. Preserve initial-version semantics across sequential operations; never reset another system. Existing updateCard preserves parked/hierarchy and accepts same-value saves.
- `packages/db/src/repositories/{external-refs-repository,operation-executor-persistence}.ts` — read-only reuse: refs filtered through actual ownership, resolved references persisted with Card/history and exactly one changeSet.operation.applied event per operation. listWorkflowStatuses returns Project-global plus map-specific statuses.
- `scripts/{mcp-tool-metadata.json,capability-operation-coverage.mjs,generate-capabilities.mjs}` — author metadata/classification update:card; regenerate existing manifest, MCP definitions and docs/mcp-tools.md.
- `apps/web/src/features/story-map/views/TrackingView.tsx`, `features/releases/ReleaseKanban.tsx` — pass snapshot.workflowStatuses; replace fixed columns/select values with ordered configured names and group icons. `app/live/live-query-invalidation.ts` already refreshes story-map/customization on domain events.
- Tests: contracts strict request; core operation-resolution and DB operation-executor-persistence regressions; server temporary-SQLite actual `/mcp` and `/api/mcp/call` acceptance; mounted ReleaseKanban and live invalidation. Performance pattern `apps/server/src/mcp/tools/changeset-executor-performance.test.ts`, serial server test:audit-performance configuration. Graph unavailable; two independent source investigation summaries verified against executor/conflict/entity source.

## Tasks & Acceptance

**Execution:**

- [x] Contracts paths above — define/export strict delivery request and MCP input with count/ref constraints and shared response.
- [x] New delivery use case / descriptors — aggregate indexed invalid targets, validate actual scope/status and resolved uniqueness, construct one external-selector status operation per Card through shared command.
- [x] Core resolution/conflict paths — scoped apply-time status and addressed baseline enforcement/advancement; test atomic conflict and isolation with existing repository persistence.
- [x] MCP registration / metadata / capability artifacts — expose UpdateDeliveryStatus through both existing Agent surfaces and regenerate capability outputs.
- [x] TrackingView / ReleaseKanban — show configured status names and accept live updated snapshot; retain existing versioned human edits.
- [x] Focused contract/core/db/server/web tests — exercise every matrix row including durable actual actor/session audit, exactly one per-Card operation event, history, baseline isolation, proposal no-snapshot and delayed apply refusal.
- [x] Server delivery performance test / package.json — register serial real1,000-Card fixture, strict2s100-status call and retained measurements; run all configured/release gates.

**Acceptance Criteria:**

- Given valid scoped refs for up to100 Cards, when an Agent invokes either tool surface, then one ChangeSet applies all statuses atomically with one operation Activity per Card and durable actual actor/session attribution.
- Given invalid/unresolved/duplicate/foreign inputs or stale addressed versions, when invoked, then indexed invalid targets or every version conflict are returned with no partial domain writes.
- Given protection or apply=false, when invoked, then statuses/baselines remain unchanged and only a proposal is stored without snapshot.
- Given configured method states and live applied updates, when Tracking renders, then the configured states and Cards are visible and existing human editing remains versioned.
- Given1,000 Cards, when the complete audited100-status server call runs serially, then it meets2s without inheriting the ApplyChangeSet4s tolerance.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass

- verdicts: 17 findings — high0, medium7, low4, false6, maybe-false0. Four layers ran; platform capacity delayed later launches until a slot opened, without triage before every layer returned.
- findings:
  - `[medium]` `[patch]` Blind1: renamed configuration hides existing Cards — current columns contain only configured names; fixed: actual unconfigured Card statuses retain controls with restricted configured edit targets; live rename/removal regression passes.
  - `[low]` `[patch]` Blind2: variable states retain fixed four-track layout — existing CSS visibly wraps five states; direct grid-flow correction preserves one sequential row.
  - `[medium]` `[defer]` Blind3: overlapping global/map names select inconsistent group — duplicate names are already allowed and builtin fixed icons already disagree with done-name notes classification; recorded existing configuration identity policy.
  - `[low]` `[patch]` Blind4: generic mixed/nonstatus external updates lack targeted regression — focused tests secure newly shared status branch and unchanged nonstatus behavior.
  - `[medium]` `[patch]` Blind5: actual transport fixtures omit parent/Release — add hierarchy/Release-preservation acceptance to distinguish status-only updates from resets.
  - `[low]` `[patch]` Blind6: parked fixture lacks descendants — add subtree preservation/visibility acceptance alongside hierarchy fixture.
  - `[low]` `[patch]` Blind7: exact/trim-induced duplicates untested — add indexed whole-call refusals before storage; existing identity dedupe handles these.
  - `[medium]` `[patch]` Blind8: addressed-only baseline drift untested — add independent actual preview regression with fresh captured baseline and stale external baseline.
  - `[false]` `[reject]` Blind9: timing record claims semantic acceptance before assertions — passed records budget success (duration/bound/completed), and configured test separately fails on incorrect response/persistence; no semantic acceptance result is inferred from timing records alone.
  - `[medium]` `[patch]` Blind10: live rename/remove/reorder/group changes untested — fixed: mounted rename/removal/reorder/group/six-state lifecycle regressions pass.
  - `[medium]` `[patch]` Edge1: renamed status hides Cards and controls — same visibility defect as Blind1; preserve actual stored status representation without inventing configuration or migrating Cards.
  - `[false]` `[reject]` Intent1: automatic Agent lifecycle reporting reading — authoritative Story4.11 explicitly specifies Agent-callable status assignment; orchestrator lifecycle integration is not this story's intent.
  - `[false]` `[reject]` Intent2: diff cannot prove skill/ledger historical execution — tool history proves one renderer invocation and rendered workflow progression; every write/stage excluded ledgers, whose source diff stays empty; rows never used for verification.
  - `[false]` `[reject]` Intent3: mounted live UI is not a real browser-to-server test — both referenced transport/UI surfaces execute separately; actual-browser round trip belongs to Story4.13, and none is claimed here.
  - `[false]` `[reject]` Intent4: registry budget omits transport/browser latency — bound is complete server call with audit/snapshot/history; existing real registry call measures that exact surface. No browser latency claim is made.
  - `[false]` `[reject]` Intent5: application tests do not establish filesystem ownership — workflow tool writes/staging and final diffs provide this evidence independently of application tests.

  - `[medium]` `[patch]` Verification1: independent external-baseline aggregation lacks consumer regression — actual preview without operation baseVersion must return both indexed Card conflicts; regression also exercises addressed-only drift.

### 2026-10-12 — Review pass (follow-up)

- verdicts: 26 findings — high 0, medium 1, low 12, false 13, maybe-false 0. Verification-gap layer reported no gaps (no rows).
- findings:
  - `[false]` `[reject]` Blind1: baseline lock-out after any human edit — the I/O matrix Conflict row mandates exactly this refusal against the addressed sync baseline; it is the intended concurrency contract, not a defect.
  - `[low]` `[reject]` Blind2: thin documentation of tool contract — docs/mcp-tools.md is generated from capability metadata; extra prose is outside the no-markdown-documentation rule and unlikely to be met in everyday use.
  - `[false]` `[reject]` Blind3: possible TypeError on `ref!` in deliveryReference — `targetId` resolves the same (type, scope, system, externalId) ref and verifies scope before `updateCard` runs, so the lookup cannot miss; weak `toThrow()` part is covered by Intent7.
  - `[low]` `[reject]` Blind4: non-null assertions, implicit array, null-stripping and long lines in use case — assertions are guarded by the `reasons` check, typecheck passes, and the style matches the repository's flat dense code.
  - `[false]` `[reject]` Blind5: duplicated agentAccess check — the inline check runs before ref resolution so a disabled Agent cannot read `invalidTargets` detail; the command-level check only runs after resolution, and the disabled-access test asserts this.
  - `[false]` `[reject]` Blind6: operator precedence in operation-conflicts — `&&` binds tighter than `||`, so the expression is `upsert || (card update with status)` as intended; covered by preview regression.
  - `[low]` `[reject]` Blind7: `.trim()` on shared selector `system` — only loosens padded input and matches the spec's "case-sensitive trimmed" identity rule and `referenceSchema`; stored operations that parsed before still parse.
  - `[medium]` `[defer]` Blind8: Kanban duplicate-name/precedence gaps — duplicate-name part is the same claim as the prior pass Blind3 and is already in `deferred` (carried, not re-added); memoization, dead strings, CSS class reuse and localization are low and not worth fixing.
  - `[low]` `[reject]` Blind9: renaming a status orphans Cards — stored status is a name by design; the intent excludes name mapping and migration, and prior-pass repair already surfaces such Cards as Unconfigured columns.
  - `[low]` `[reject]` Blind10: performance test writes fixed tmp jsonl — the spec requires retaining timing evidence including failures; shared path is harmless.
  - `[low]` `[reject]` Blind11: test and registration hygiene (double close, magic counts, ordering, duplicated description) — cosmetic, no demonstrated failure; passing suite.
  - `[low]` `[reject]` Blind12: unrelated import alias churn — cosmetic and matches the surrounding web alias convention.
  - `[false]` `[reject]` Blind13: whitespace-only status untested — a whitespace-only name cannot equal any configured status name and is refused as unconfigured with an indexed target.
  - `[low]` `[reject]` Edge1: status update could archive/unarchive Cards — only possible when an operator configured a status named `archived`; the intent mandates existing Card-save semantics and persistence already handles archive transitions.
  - `[low]` `[reject]` Edge2: non-status external update leaves addressed baseline stale — pre-existing external-update behavior outside delivery; the fix adds baseline logic to paths this story does not own.
  - `[low]` `[reject]` Edge3: duplicate conflict entries when operation and ref baselines differ — pre-existing upsert pattern; the delivery command sets both baselines equal so the Set dedupes; extra entry is informative, not harmful.
  - `[false]` `[reject]` Edge4: ZodError escape from `cardSchema.parse` — cards come from the validated repository read, so a failure would be a loud fail-fast data-integrity error, not an unindexed validation path.
  - `[low]` `[reject]` Edge5: empty workflowStatuses leaves Kanban uneditable — builtin and configured statuses always exist in practice; the fix adds a branch for an unreachable state.
  - `[false]` `[reject]` Intent1: engine semantics and shared `system` trim apply to all external-selector status updates — the Code Map and Design Notes require core to enforce this at apply time without a new operation or bespoke path; no divergent bad outcome.
  - `[false]` `[reject]` Intent2: validation duplicated between use case and resolver with different error shapes — intended: the use case gives indexed pre-proposal details, the resolver revalidates at delayed apply (matrix Delayed apply row).
  - `[false]` `[reject]` Intent3: admission check only for agent actors — humans are not subject to Agent access; the matrix requires admitted Agent access, which is tested for the revoked case.
  - `[false]` `[reject]` Intent4: addressed baseline read twice (operation and ref) — verified in the prior pass; the preview regression covers addressed-only drift.
  - `[false]` `[reject]` Intent5: Tracking Unconfigured columns and disabled option exceed intent — added by the prior pass to avoid hiding Cards whose stored status is not configured; no divergent harm.
  - `[false]` `[reject]` Intent6: carried — budget measured through the in-process registry rather than a transport. Same claim as prior Intent4; the bound is the complete audited server call.
  - `[low]` `[reject]` Intent7: delayed-apply test asserts `toThrow()` without kind — the test also asserts snapshot equality, zero operation Activity and no snapshots dir; a stronger assertion is unlikely to catch a real regression.
  - `[false]` `[reject]` Intent8: carried — live Tracking updates exercised with mocked stream. Same claim as prior Intent3; real-browser round trip belongs to Story 4.13.

## Design Notes

Card.status stores WorkflowStatus.name; names are validated against actual global/current-map configuration, not IDs. Keep external selectors in stored operations to revalidate identity at apply. Delivery uses update, not upsert, avoiding full publication and implicit archive resets. No new operation union member or independent persistence path is necessary.

## Verification

Use Node24 PATH `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` before inherited PATH. Stage explicit new source files before portable fixtures using git ls-files, excluding orchestrator ledgers.

- Focused contracts/core/db/server/web tests — every matrix row passes.
- `corepack pnpm test` — all configured suites, including serial performance, pass.
- `node scripts/verify.mjs` — hygiene, capability parity, typecheck and build pass.
- `git diff --check` and `git diff --cached --check` — clean whitespace; no sprint/deferred staging or writes.

Matrix audit: every row ran/passed in parent full configured run: contracts delivery12, core operation resolution64, DB persistence18, server actual transports16 and delivery performance3, mounted Tracking2 plus existing chained-save test. Full configured1,616 tests pass; parent release hygiene/119-capability parity/typecheck/build and whitespace pass. Logs: /tmp/storymapper-4-11-parent-tests.log and /tmp/storymapper-4-11-parent-verify.log. Delivery samples remain in /tmp/storymapper-4-11-delivery-budget.jsonl. No source changed after those initial gates until the recorded review repairs; final source fingerprint is unchanged through final verification.

Independent repair confirmations: blind reviewer confirmed all scoped patch findings; verification reviewer confirmed actual-preview test fails if external-baseline collector branch is removed. No remaining scoped defect reported. Focused repair gates: server40, core66, UI14 pass. Final configured1,626 tests and full release hygiene/119-capability parity/typecheck/build pass. Earlier full1,616-test evidence predates review repairs.

Final verification (2026-10-12): `corepack pnpm test` passes1,626 tests: Scripts82,Contracts135,Core244,Importers7,DB350,Web230,Server564 and serial Performance14. Actual delivery20, preview20, core operation-resolution66, persistence18 and mounted Tracking5/chained-save all execute. `node scripts/verify.mjs` passes hygiene,119-capability parity,typecheck and build. Both whitespace gates pass. Logs: /tmp/storymapper-4-11-final-tests.log and /tmp/storymapper-4-11-final-verify.log. Complete audited delivery timings479.818542/397.739750/392.181209ms each<=2,000ms; all failed initial verification evidence retained. Final source fingerprint unchanged.

## Changelog

- Version2 (2026-10-12): Four independent lenses,17 individually triaged findings; scoped UI/layout and acceptance repairs confirmed independently. Final1,626 configured tests and release gates pass. One existing medium duplicate-name/group policy deferred; frozen intent unchanged; status done.

- Version1 (2026-10-12): Source-investigated plan from binding Epic4 preparation/detail plan. No intent gaps or runtime success claimed.

## Auto Run Result

Status: done

- Summary: follow-up review pass on the already-finished Story 4.11 (scoped `UpdateDeliveryStatus` batch through one ChangeSet, configured statuses in Tracking and ReleaseKanban, strict 2s audited performance test). No change to the implementation.
- Files changed in this pass: this spec only (triage log and this section). No source edits.
- Review findings: 26 triaged; patches applied 0; new deferrals 0 (the duplicate-name item is already in `deferred`, carried); rejected 25, each with its recorded reason in the triage log.
- Follow-up review recommendation: false. This pass patched no entries (high 0, medium 0, low 0), so the work has converged.
- Verification performed: no tree changes were made, so the final gates recorded under Verification (1,626 configured tests, `node scripts/verify.mjs`, whitespace gates) still describe the tree. I did not re-run them in this pass.
- Residual risks: the existing medium duplicate-name Workflow Status policy issue remains deferred. Real-browser acceptance is out of scope here (Story 4.13).
- Version control: no commit or push was made, because the intent contract forbids both. The working tree still carries the orchestrator-owned `sprint-status.yaml` and `deferred-work.md` changes, which this run must not stage or revert. Commit and finalization stay with the orchestrator.
