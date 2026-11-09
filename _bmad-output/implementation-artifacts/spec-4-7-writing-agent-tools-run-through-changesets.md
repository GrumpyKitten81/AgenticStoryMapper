---
title: 'Writing agent tools run through ChangeSets'
type: 'feature'
created: '2026-10-12'
date: '2026-10-12'
version: 4
status: done
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-4-preparation.md'
  - '_bmad-output/implementation-artifacts/story-plan-4-7-writing-agent-tools-run-through-changesets.md'
warnings: [oversized]
deferred:
  - summary: >-
      Deferred command proposals and successful call audits are not persisted atomically.
    evidence: |-
      The pre-existing executeChangeSetCommand creates the proposal in its own transaction before the MCP wrapper writes its successful audit; an audit-insert failure leaves that retained proposal. This predates Story 4.7. Applied command effects and their success audit remain atomic and covered.
    location: >-
      apps/server/src/application/changeset/changeset-command.ts
    severity: medium
  - summary: >-
      Repeated pulls can retain duplicate open conflicts for one Card/connection/remote field.
    evidence: |-
      The existing human repository/sync path already creates a conflict on every divergence without deduplication (historical duplicate-conflict lifecycle DW-37). New shared conflict checks truthfully refuse applying one while its same-field duplicate remains open. Follow-up lifecycle work must reconcile these existing rows; no automatic resolution is inferred.
    location: >-
      packages/db/src/repositories/work-item-repository.ts and apps/server/src/services/sync-merge.ts
    severity: medium
  - summary: >-
      Sync link state can disagree with existing durable open conflicts after divergence disappears.
    evidence: |-
      The pre-existing human finishSyncItem computes state from newly detected fields only, independently of persisted open conflict rows. The new incoming path preserves this calculation. A scoped conflict lifecycle repair must reconcile link state against durable open rows.
    location: >-
      apps/server/src/services/work-item-sync.ts:finishSyncItem
    severity: medium
  - summary: >-
      Clearing a remote assignee does not clear the local assignee.
    evidence: |-
      The unchanged shared human applyRemoteFields helper and the new incoming preparation both require a truthy remote.assignee. This predates the story; fixing it must define the existing provider unassigned representation and preserve human mapping semantics.
    location: >-
      apps/server/src/services/sync-merge.ts:applyRemoteFields
    severity: medium
review_loop_iteration: 0
baseline_revision: ce5550a59afec28d56205c7862d818d27bbbe95b
---

Reproducing statement: Execute bmad-build-auto for Story 4.7, route current non-human domain writes through ChangeSets, and preserve orchestrator-owned sprint-status.yaml without writing, staging or reverting it or treating its rows as verification.

<intent-contract>

## Intent

**Problem:** Shared application use cases still allow direct Agent domain writes, and GitHub import/sync local effects bypass ChangeSets. Protection currently refuses these commands instead of retaining reviewable proposals.

**Approach:** Construct typed operations in shared application use cases and invoke the existing command/executor. Return shared proposed/applied outcomes and preview references, retain actual proposing identity, and separately attribute GitHub local application while enforcing its initiating Agent's current authority.

## Boundaries & Constraints

**Always:** Contracts are the schema source; core owns pure resolution; DB repositories own persistence. Default command apply to true, defer on apply=false or Agent protection, and keep proposal generators proposal-only. Stored proposals require approval. Local execution remains atomic with snapshot outside SQLite, successful audit inside the apply transaction, and live events after commit. GitHub provider preparation occurs outside SQLite; access, GitHub enablement, runtime identity and reviewed versions are rechecked after awaits. Remote effects remain separate and truthful. GitHub push requires a human-confirmed Dry Run. Preserve current human command behavior and named lifecycle/administration/bookkeeping exceptions. Respect accepted ADRs 0002–0004 and Epic 4 preparation.

**Never:** Write, stage or revert sprint-status.yaml; infer verification from orchestrator rows; modify user data or credentials; create a second executor; substitute GitHub actor to bypass initiating Agent policy; fabricate confirmation or remote rollback; add provider/auth flows, SaaS, telemetry, compatibility adapters or unrelated functionality. No commit or push is authorized by this invocation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Command | Admitted non-human domain command, apply omitted, protection off | One new command ChangeSet and executor application with outcome/id/preview reference | Indexed shared conflicts; no partial local application |
| Proposal | apply=false or Agent protection on | Proposed ChangeSet; no domain rows, apply snapshot or remote write | Disabled access still refuses |
| Source import | Inline Markdown/TXT with deferred application | Reviewed content retained in typed proposal, no source rows or host-file read | Validate content hash before deriving chunks |
| GitHub local half | Import/pull with admitted initiating Agent | Source github; proposer host/session retained; effective GitHub application actor, versions and snapshot | Recheck authority/runtime after awaits |
| Provider drift | Access/GitHub disabled, database/connection/owner changed during await | Refusal before unauthorized local/provider effects | Typed disabled/conflict with truthful already-completed remote effects |
| Remote push | Agent request with protection on | Refuse before provider mutation | protected |
| Remote confirmation | Agent push with protection off | Human-confirmed reviewed Dry Run required | Missing authorization protocol blocks planning; see Auto Run Result |
| Lifecycle | Generators, approval, ApplyChangeSet | Existing lifecycle path, no recursive command ChangeSet | Preserve approval/access/protection checks |

</intent-contract>

## Code Map

- `apps/server/src/application/changeset/changeset-command.ts:8` — existing `executeChangeSetCommand`; records command separately, defers on protection/apply=false, but currently refuses deferred inline sources and returns only ChangeSetResponse.
- `apps/server/src/application/changeset/changeset-executor.ts:13` — `executeStoredOrNewChangeSet`; gate/preparation/snapshot/UoW, conflict collection, successful executor audit and retained-snapshot errors. Currently one actor channel; GitHub requires trusted separate initiating authority.
- `apps/server/src/application/changeset/{executor-audit,prepare-operation-supply}.ts` — AsyncLocalStorage audit bridge and reviewed source preparation. Generalize exact response audit; preserve content hashing even with supplied prepared imports.
- `apps/server/src/mcp/tools/{audit-tool-call,register-tools}.ts` — `auditToolCall` special-cases ApplyChangeSet; other atomic handlers open an enclosing UoW incompatible with runPrepared. `authorizeTool`, `permissionsForProject` and inventory all currently block protected domain/GitHub commands.
- `apps/server/src/mcp/tools/register-{card,content,customization,structure}-tools.ts` — thin registrations and current result projections; routed commands must return the canonical audited result and relinquish enclosing audit transactions.
- `apps/server/src/application/{card,story-map,release,persona,roadmap,customization,source-document,github-link,external-ref}/*.use-cases.ts` — current domain writers; construct catalog operations here. Preserve typed human response consumers rather than blanket incompatible return unions.
- `packages/contracts/src/{api/http,mcp/tools,mcp/tool-inputs}.ts` — command inputs/results and both transports; propagate apply to all applicable writers. Shared result needs outcome, ChangeSet id and preview reference.
- `packages/contracts/src/schemas/{operation-fields,change-operations,change-set-schemas,conflicts}.ts` — source import payload currently has no inline content; baseline operation schema version 2 (implemented version 3), actual actor metadata and common indexed conflict entries. Coordinate explicit schema transitions with history/restore consumers.
- `packages/core/src/changesets/{operation-registry,source-resolution,operation-conflicts}.ts` — typed catalog, source import validation, common version/sync conflicts. An explicitly resolved open sync conflict must not be rejected as an unresolved ordinary write.
- `packages/db/src/{unit-of-work,operation-schema-transition}.ts` and `repositories/{changesets-repository,operation-persistence-repository,operation-supply-repository}.ts` — existing synchronous actor-stable UoW/executor persistence. Reuse; no second domain apply path.
- `apps/server/src/application/sync/{sync,sync-conflict}.use-cases.ts`, `services/{work-item-sync,sync-merge,sync-conflict-resolution}.ts` — prepare providers and local operations. Current import directly writes Cards/Releases/links; current sync/pull is bidirectional and can remotely write inside prepareSyncItem. Split remote phases from atomic local command application.
- `packages/db/src/repositories/work-item-repository.ts` — existing import hierarchy/status/milestone/identity semantics. Ordinary remote-link command is absent from registry; baseline/run/conflict bookkeeping must be explicitly executor-owned and atomic with its associated local effects.
- `scripts/capability-operation-coverage.mjs` — MEMBERS provides the domain capability-to-operation inventory. Classification currently filters reads despite naming effectful read/bookkeeping exceptions. Schema membership is not runtime routing proof.
- `scripts/{capability-scan,capability-surface,generate-capability-manifest,check-capabilities}.mjs`, authored MCP metadata and generated manifest/tool/docs artifacts — extend coverage and regenerate together.
- Relevant existing tests: `apps/server/src/mcp/{http,stdio-main}.test.ts`, `mcp/tools/{register-tools,complete-surface,tool-call-audit}.test.ts`, `services/{work-item-sync,sync-review}.test.ts`, application parity tests and `packages/db/src/repositories/changeset-executor.test.ts`. Actual transport evidence is required.
- Read-only evidence: Epic 4 context/preparation, Story 4.7 detail plan, completed Story 4.6 spec continuity, orchestrator ledgers and user data. Code graph tools unavailable; two independent read-only investigations and focused source verification were used.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/{api/http,mcp/tools,mcp/tool-inputs,schemas/operation-fields,schemas/change-set-schemas}.ts` — after resolving the confirmation policy below, define canonical command results/apply inputs, reviewed inline source payload and trusted initiation metadata; update consumers and explicit schema transitions.
- [x] `apps/server/src/application/changeset/{changeset-command,changeset-executor,executor-audit,prepare-operation-supply}.ts` — enforce initiating authority, proposal/apply policy, exact atomic audit and reviewed source preparation through the existing executor.
- [x] `apps/server/src/application/{card,story-map,release,persona,roadmap,customization,source-document,github-link,external-ref}/*.use-cases.ts` — map every current non-human domain writer to typed operations with existing baselines and preserved human behavior.
- [x] `apps/server/src/mcp/tools/{register-tools,audit-tool-call,register-card-tools,register-content-tools,register-customization-tools,register-structure-tools}.ts` — propagate apply, return canonical results, admit protected proposals, retain disabled access/remote protection, and keep snapshot preparation outside audit UoW.
- [x] `apps/server/src/application/sync/*.use-cases.ts`, `services/{work-item-sync,sync-merge,sync-conflict-resolution}.ts`, associated DB persistence — prepare all local operations before atomic executor application, preserve effective GitHub/initiator identities, common conflicts and explicit remote outcomes. Implement only the resolved human-confirmation boundary.
- [x] `scripts/capability-operation-coverage.mjs`, parity/generation scripts and generated artifacts — prove every domain writer maps to a registry member, name exceptions including effectful reads, and reject handler repository-write bypasses.
- [x] Existing contracts/core/db/server transport and provider-await tests — cover the matrix with durable state/identity/snapshot/audit assertions, real /mcp and /api/mcp/call requests, protected proposals, atomic conflicts, flag flips and rollback.

**Acceptance Criteria:**

- Given every current non-human domain writer, when actual transport commands run, then persisted ChangeSets and executor effects prove universal routing and no handler repository domain writes.
- Given apply=false or protection, when a command executes on either Agent transport, then it returns a proposal id/preview reference with no domain apply/snapshot; omitted apply defaults true when permitted.
- Given GitHub import/pull, when local effects execute or defer, then effective GitHub attribution and actual initiating Agent host/session persist and current authority is enforced after every provider await and inside the applying gate.
- Given disabled access/GitHub or protected remote push, when called, then typed refusal occurs before unauthorized provider/domain effects; an unprotected push also requires the resolved human-confirmed Dry Run contract.
- Given version/sync conflicts and injected operation/success-audit failures, when local execution runs, then one shared ConflictReport or typed failure returns with no partial local effects or premature live event and exact durable call audit.
- Given lifecycle/proposal generators and parity checks, when invoked, then lifecycle is not recursively wrapped, explicit exceptions are named and the current-domain gap list is empty.

## Scope Decision (locked by supervisor 2026-10-12): human-confirmed remote push boundary resolved via existing localHumanActor confirmation, not a new protocol.

**Resolution:** Story 4.7 states the invariant "Push requires human-confirmed Dry Run and keeps truthful per-item remote evidence" (detail plan line 29) while Epic 4 preparation and ADR 0003 exclude inventing a new permission policy or provider flow. The competing acceptable behaviors an Agent might choose (treat the Agent's own `confirm` boolean as human approval, invent a new durable approval protocol, or disable existing Agent remote capabilities) are explicitly disallowed by the detail plan and produce observably different behavior. The minimal, spec-compliant resolution is to **encode the human-confirmation boundary using the existing confirmation mechanism** (`apps/server/src/http/routes/sync-routes.ts:22` attributes the human push route to `localHumanActor`, and `packages/contracts/src/api/http.ts:450` accepts `confirm:true` on that human path):

- An Agent-requested remote push produces a **proposed, reviewed Dry Run plan** (preview rows) through the normal executor path and retains truthful per-item remote evidence.
- **Actual provider mutation** (the committed write to GitHub) is gated on a separate human confirmation through the existing `localHumanActor` HTTP path (`confirm:true`). An Agent's MCP request does not itself mutate the provider, and an Agent-supplied `confirm` boolean is **not** treated as human approval.
- This preserves the invariant without a new durable approval protocol, without disabling Agent remote capabilities (agents still drive prepare/preview/dry-run), and without introducing a new permission family or provider flow.

The Agent execution contract that Story 4.7 identified as "absent" is therefore: **route remote provider mutation through the existing `localHumanActor` confirm boundary; an Agent may prepare and dry-run but a human must confirm before provider mutation.** This is the resolved boundary; implement it across the push path and, symmetrically, the outgoing sync/pull phases where `prepareSyncItem` may remotely write.

## Spec Change Log
- Version 3 → 4 (2026-10-12), review iteration 1: Stored sync-conflict baselines/selectors/relationships and combined-pull coherence were insufficiently specified. Added the Review Repair Requirements above to prevent stale resolutions, unrelated-field blockage, duplicate Releases and silent divergent updates. KEEP instructions and full attempted source are preserved in `/tmp/story47-review-keep.patch`; source was reverted to baseline before fresh re-derivation. The immutable intent and locked human-confirmation decision are unchanged.
- Version 1 → 2 (2026-10-12): Locked above scope decision resolving the human-confirmation intent gap; removed `status: blocked`, set to in-progress for a fresh dev re-drive.

## Review Repair Requirements (iteration 1)

Re-derive the implementation against the source after restoring the baseline; `/tmp/story47-review-keep.patch` preserves reviewed positive work and is a recovery aid, not verification. KEEP universal shared command routing, canonical response/audit hashing, inline reviewed imports, actual Agent proposer identity and trusted initiating authority, post-await access/runtime/owner checks, explicit remote human-confirmation boundary, all fresh regressions, disabled planning repairs and Release link baselines. Validate recovered code against every requirement; all gates must run again.

- Resolving one selected remote conflict must work while other fields on that Card remain conflicted. Permit only the selected reviewed field/baseline changes; preserve every unrelated open conflict and refuse ordinary writes touching those conflicts. Test two open fields and retained state.
- Deferred conflict resolutions must retain and compare the complete reviewed conflict baseline, including field, Card/connection/remote identity and values, before effects. Drift must yield indexed conflict with no partial local effects.
- GitHub sync operations must reject unsupported selectors rather than resolve a different identity from the dependency/scope walker. Validate SyncRun provider against its connection, and SyncConflict Card/map/connection/remote relationships against its referenced run and link.
- Allocated-ID collision checks must cover persisted and earlier batch-created SyncRuns and SyncConflicts, retaining indexed validation errors.
- Combined Story Map pulls must share pending Releases by name across connections and assign all Cards to the one pending Release. If connections propose different values for one Card field, return a shared indexed conflict before any domain effect; never silently overwrite or mark both links synced, including stored partial selection that omits bookkeeping operations. Cover both selected connections, duplicate milestones and divergent fields durably.
- Add Agent mapped-label import coverage with labelsAsAnnotations enabled, asserting persisted annotations/Card links and exclusion of status/default labels. Use existing mapping semantics.

## Review Triage Log

### 2026-10-12 — Review pass 1
- verdicts: 17 findings — high 4, medium 7, low 1, false 5, maybe-false 0
- findings:
  - `[high]` `[bad_spec]` Blind: selected remote conflict is blocked by another field on the same Card — operation-conflicts suppresses only the selected conflict for every Card operation. Amended field-scoped resolution acceptance; preserve unrelated open conflicts.
  - `[false]` `[reject]` Blind: local resolution has no executable human path — the existing localHumanActor conflict-resolve endpoint executes the specific conflict and persists its resolution; ordinary push is not that endpoint. Locked policy makes Agent output a Dry Run, not remote execution.
  - `[medium]` `[defer]` Blind: proposal survives successful-audit failure — HEAD already creates deferred commands before the wrapper audit. Recorded pre-existing lifecycle issue; applied effects and success audit remain atomic.
  - `[high]` `[bad_spec]` Blind: reviewed conflict values/identity can drift — resolveGitHubSync checks only id/open status. Amended complete retained conflict baseline comparison.
  - `[high]` `[bad_spec]` Blind: new sync selectors are ignored by resolution — operation-dependencies honors selector while sync resolver uses entityId. Amended strict unsupported-selector rejection.
  - `[medium]` `[patch]` Blind: SyncRun provider may disagree with connection — add exact provider guard in the re-derived resolver and regression.
  - `[medium]` `[bad_spec]` Blind: conflict/run/Card/connection/remote relationships are unchecked — the resolver checks run existence only. Amended coherent reviewed-owner relationship validation.
  - `[medium]` `[patch]` Blind: allocation omits sync rows — allEntities lacks newly allocatable collections. Add both collections and persisted/batch collision regressions during re-derivation.
  - `[low]` `[reject]` Blind: duplicated human/Agent import preparation risks future drift — named mapping consumers can diverge after future changes, but broad shared-planner extraction exceeds direct correction; retain concrete mapped-label regression and current shared mapping helpers.
  - `[false]` `[reject]` Blind: narrow write scanner proves no bypass — the scanner is a declared-method hygiene guard, not a proof for arbitrary future alias/computed syntax. No current aliased bypass was identified; all 51 admitted commands are exercised through the executor.
  - `[false]` `[reject]` Intent: remote policy chosen without authoritative decision — the pre-existing locked supervisor Scope Decision expressly chooses Agent previews plus existing separate human confirmation; immutable intent also says see Auto Run Result for that resolution.
  - `[false]` `[reject]` Intent: human confirmation must bind the Agent proposal — the locked decision expressly uses the existing localHumanActor confirm path and excludes a new durable authorization protocol; it does not authorize mutation by applying an Agent Dry Run. A human confirms a fresh human plan.
  - `[false]` `[reject]` Intent: stored application must retain original Agent authority — approved stored execution uses the actual applying caller, as explicitly established in Design Notes and the existing approval lifecycle. Original Agent attribution is retained; immediate GitHub commands still enforce their Agent initiator.
  - `[medium]` `[patch]` Verification: mapped Agent label import lacks regression — pre-verified mutation gap; add durable mapped-label assertions during re-derivation.
  - `[medium]` `[patch]` Verification: aggregate Agent pull lacks two-connection regression — pre-verified mutation gap; assert both incoming effects/runs in one ChangeSet during re-derivation.
  - `[medium]` `[bad_spec]` Edge: same pending milestone creates duplicate Releases — each incomingOperations owns a fresh map. Amended shared pending Release preparation.
  - `[high]` `[bad_spec]` Edge: divergent same-Card incoming fields silently overwrite — both operations use initial Card version and second wins. Amended indexed conflict/no-effect requirement.


### Implementation audit during re-derivation

- Parent found that divergent-pull detection counted only selected SyncRuns, so selecting both Card updates while omitting those bookkeeping operations could bypass the guard. The same no-overwrite requirement now explicitly includes stored partial selection; detection uses the complete reviewed batch and a regression covers the selected updates.
- Fresh retained-conflict validation exposed existing repository optional-field nulls (`resolvedAt`) that disagree with the schema. The mapper now omits absent optional fields, preserving the schema as the source of truth.

### 2026-10-12 — Review pass 2 (follow-up)
- verdicts: 18 findings — high 1, medium 10, low 0, false 7, maybe-false 0
- findings:
  - `[high]` `[patch]` Blind: partial selection can resolve without chosen effects — resolution currently precedes owner writes. Emitted it last: existing owner dependencies close resolution-only approval to an empty selection, leaving the row and domain state unchanged; fully approved execution applies the chosen value.
  - `[medium]` `[defer]` Blind: repeated pulls create duplicate conflicts — existing human repository path also unconditionally creates each divergent conflict; historical DW-37 predates this story. Record one lifecycle deferred item.
  - `[medium]` `[defer]` Blind: existing open conflict is omitted from link-state calculation — existing human finishSyncItem also derives state from newly detected fields only. Record this distinct pre-existing lifecycle inconsistency.
  - `[medium]` `[patch]` Blind: converged local/remote values retain stale baselines — incoming-only Agent semantics lack the previous remote-write baseline advancement. Cleared both equal-value flags during Agent preparation; durable regression advances baselines and retains local descriptions without provider mutation.
  - `[medium]` `[defer]` Blind: remote unassignment retains local assignee — unchanged human applyRemoteFields has the same truthy guard. Record pre-existing mapping limitation without altering human behavior in this story.
  - `[medium]` `[patch]` Blind: actual imported fallback-named activity is not reused — helper hierarchy map receives only synthetic Cards. Registered actual imports; child-first durable regression proves one fallback activity and correct parent IDs.
  - `[false]` `[reject]` Blind: duplicate provider IDs must import successfully — inconsistent duplicate identities are correctly refused by the existing typed remote-identity owner guard before domain effects; GitHub IDs identify unique items. Silently deduplicating potentially inconsistent provider data is not required.
  - `[false]` `[reject]` Blind: field-specific outgoing plan lacks executable human confirmation — carried: ordinary push is not the selected-conflict endpoint. Existing localHumanActor resolve endpoint invokes the same conflictWritePayload and persists that specific conflict while preserving unrelated remote fields.
  - `[medium]` `[patch]` Blind: import operation coverage omits mapped annotations — builder emits create:annotation/set:cardAnnotation but manifest member list omits them. Added both existing members, conditional builder/durable assertions and regenerated capability manifest/docs; fresh parity passes.
  - `[false]` `[reject]` Blind: scanner handles no future aliases/referenced handlers — carried: declared receiver/syntax hygiene guard is not a proof for arbitrary future code. No current bypass was identified, and complete command-family executor assertions remain complementary evidence.
  - `[medium]` `[patch]` Verification: hierarchical Agent import lacks regression — pre-verified parent-map mutation gap; added child-first activity/step/story durable parent-ID assertions, passing in the final full run.
  - `[medium]` `[patch]` Edge: cleared milestone conflict serializes undefined into SQL NULL — normalized absence to JSON null in typed Agent conflict construction; both cleared-side durable regressions pass in the final full run.
  - `[medium]` `[defer]` Edge: same-field duplicate blocks selected resolution — same pre-existing duplicate-row lifecycle cause as Blind duplicate finding. Existing shared conflict refusal protects unresolved same-field records; share that deferred item.
  - `[false]` `[reject]` Intent: routing tests are on complementary surfaces — exact application source implements shared routing; direct Agent services and executor tests supplement transport coverage. Auditor reports no routing deviation.
  - `[false]` `[reject]` Intent: human confirmation is not bound to retained Agent bytes — carried: locked supervisor decision chooses existing separate localHumanActor confirmation and excludes a new durable authorization protocol.
  - `[false]` `[reject]` Intent: original Agent authority does not endure human application — carried: actual approved applying caller is the trusted initiator, as established in Design Notes; proposer identity is retained.
  - `[medium]` `[defer]` Intent: proposal/audit writes remain separate — carried: pre-existing deferred command lifecycle issue already recorded; applied effects and their success audit are atomic. Do not append it again.
  - `[false]` `[reject]` Intent: remote drift tests exercise human effects — locked Agent boundary permits preparation/incoming effects only; human provider paths are the authorized remote execution surface. Auditor reports this distinction, not a conflicting behavior.

### 2026-10-12 — Review pass 3 (follow-up)
- verdicts: 41 findings — high 0, medium 10, low 15, false 16, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind/Edge/Verification: Agent protection no longer blocks write-permission tools outside the command set (CreateGitHubIssueDryRun, ExportAudit, ExportStoryMap) — baseline blocked every write/github tool; one shared `isBlockedByAgentProtection` now feeds `authorizeTool` and `listMcpToolStates`, restoring the block for those three while commands retain proposals and PlanWorkItems stays allowed; register-tools test asserts disabled state and `protected` refusal. (3 reports, 1 entry)
  - `[medium]` `[patch]` Blind/Edge: Agent update with an empty patch skips `requirePatch` (UpdateWorkflowStatus, UpdateAnnotation, UpdateStoryTemplate, UpdateGitHubLink, BulkUpdateCards) — validation moved before the non-human branch; complete-surface regression covers UpdateAnnotation and BulkUpdateCards. (Blind 6, Edge 1, Edge 2, Verification Other 2)
  - `[medium]` `[patch]` Verification: Agent post-await ownership drift (Card, connection, map) untested — added three durable no-effect regressions; mutation of `revalidateGitHubPreparation` fails two of them.
  - `[medium]` `[patch]` Verification: Agent read-only mirror, remote_deleted, plain milestone clearing and empty Story Map pull untested — four regressions added; empty pull pins one applied empty ChangeSet.
  - `[medium]` `[patch]` Verification: Agent import Release sharing, assignee and General step under an Activity parent untested — durable regression added.
  - `[medium]` `[patch]` Verification: protection decision for non-command write tools unpinned — covered by the first patch's test.
  - `[false]` `[reject]` Blind: schema version 2 to 3 stales pending proposals — the bump is the planned transition for added registry members (Code Map: baseline 2, implemented 3) and the transition path is the designed retirement mechanism.
  - `[low]` `[reject]` Blind: no ADR for the proposal/trust model — governed by accepted ADRs 0002–0004 and Epic 4 preparation; no new far-reaching decision beyond them.
  - `[low]` `[reject]` Blind: unchecked casts and unreachable guards — workspace typecheck passes, casts sit at schema-validated boundaries; a broad typing cleanup exceeds a direct correction.
  - `[low]` `[reject]` Blind: layering inversions — no caller named that will diverge; cosmetic.
  - `[low]` `[reject]` Blind: duplicated overload/destructure boilerplate — repeated structure, no divergence risk named; extraction exceeds direct correction.
  - `[false]` `[reject]` Blind: human requests accept an ignored `apply` — request schemas are non-strict Zod objects, so `apply` was already stripped on the human path; behavior is unchanged. (also Edge 3, Verification Other 1)
  - `[low]` `[reject]` Blind: weakened tests — MCP push variants removed because Agent push is now a Dry Run with no provider mutation by the locked decision, human HTTP variants remain; payload assertions replaced by outcome checks; the all-commands afterAll fails only under `-t` filtering and guards the universal-routing acceptance criterion.
  - `[low]` `[reject]` Blind: audit rows cannot tell proposal from application — output hash and ChangeSet outcome distinguish them, as the matrix requires exact response hashing.
  - `[low]` `[reject]` Blind: mapper null-to-undefined — the schema is the source of truth (see Implementation audit); all consumers pass typecheck and tests.
  - `[low]` `[reject]` Blind: O(n) revalidation cost — no demonstrated bottleneck; caching adds invalidation risk.
  - `[low]` `[reject]` Blind: unbounded inline content and title-slug paths — hash is validated at apply per the matrix, size is bounded by the transport, and the path is a provenance label.
  - `[false]` `[reject]` Blind: pull drops requested connections or runs unvalidated — mirrors the human selection semantics; planning and GitHub access checks run before the empty command; a regression now pins it.
  - `[low]` `[reject]` Blind: spec evidence references /tmp, stale changelog — fix edits this build's spec.
  - `[low]` `[reject]` Blind: leftover cleanups — cosmetic, typecheck passes.
  - `[low]` `[reject]` Blind: `?? []` on optional snapshot fields — cosmetic, no named harm.
  - `[low]` `[reject]` Blind: exception lists duplicated in tests — parity script is the authoritative check; no divergence seen.
  - `[false]` `[reject]` Edge: caller-prepared import overwritten by re-read — spec requires content hashing even with supplied prepared imports.
  - `[false]` `[reject]` Edge: Agent import reads host file path — MCP ImportSourceDocument input omits filePath.
  - `[false]` `[reject]` Edge: projectCommandResult skips asDomainError — audit-tool-call.ts maps every failure with asDomainError.
  - `[low]` `[reject]` Edge: empty remote title or duplicate remote ids on import — duplicate identities carried from pass 2; an empty title is pathological and shares the human normalizer.
  - `[false]` `[reject]` Edge: linkVersion owner baseline — create requires an owner by schema and the baseline is the edited link's current owner, same as the human path.
  - `[low]` `[reject]` Edge: committed-error result no longer schema-parsed — produced by the executor itself; no malformed producer shown.
  - `[false]` `[reject]` Edge: non-agent initiators skip deferral — protection is an Agent setting; system/github initiators are not Agents.
  - `[false]` `[reject]` Edge: Agent sync only pulls — locked decision: Agent produces incoming effects and Dry Run, human confirms outgoing writes.
  - `[false]` `[reject]` Edge: UpdateStoryMapPersona response lost projectId — every command tool returns the canonical command response by design.
  - `[false]` `[reject]` Intent: readings enumerated; carried: human confirmation not bound to retained Dry Run bytes — locked supervisor decision. (carried)
  - `[false]` `[reject]` Intent: tests drive MCP wrapper more than use cases — non-human branches are reachable only through MCP; acceptance requires actual transport evidence.
  - `[false]` `[reject]` Intent: response shapes differ between Agent and human — preserving human behavior is required by the intent.
  - `[false]` `[reject]` Intent: branch covers any non-human actor — intent routes non-human domain writers; GitHub actor is handled explicitly.

## Design Notes

Use the existing executor, not transport-only interception. Its audit must hash the actual response, including outcome/preview reference. Inline source proposals can retain content in their typed immutable operation JSON and derive chunks at apply without creating files or domain rows first. Proposal creation under initiating Agent plus source github retains actual identity; a trusted separate authority channel must guard GitHub-attributed execution. These are viable implementation refinements, not blocking questions.

Stored GitHub proposals retain Agent proposer provenance. A human applying an approved proposal supplies the trusted actual initiator; execution retains effective GitHub attribution and uses that human's current authority, including under Agent protection. This follows the existing approval lifecycle.

## Verification

Fresh final patched attempt, Node 24.17.0: parent `corepack pnpm test` passed 1,476 tests (Scripts 82, Contracts 119, Core 234, Importers 7, DB 349, Web 198, Server 479, Performance 8). Evidence: `/tmp/story47-final-parent-full.log`. Parent `node scripts/verify.mjs` passed Git/source hygiene, 115-capability parity, workspace typecheck and build (`/tmp/story47-final-parent-verify.log`). Whitespace passes. The corrected selector fixture ran in the fresh full suite; focused direct Vitest also passed 73 tests. Recovered earlier claims and logs do not establish current verification. Providers are mocked; no live GitHub mutation is claimed.

Matrix audit: Command — `complete-surface.test.ts` (26 tests) exercises all 51 command names through real loopback HTTP, with persisted executor effects. Proposal — `tool-call-audit.test.ts` (30 tests) covers protected and explicit proposals on HTTP and SDK, hashes, state and snapshots. Source import — HTTP/stdio and DB `changeset-executor.test.ts` (22 tests) cover inline payload retention, approval/application and hash rejection. GitHub local half and remote confirmation — `github-command-sdk.test.ts` (9 tests) covers persisted identities, protection, previews and separate human HTTP confirmation. Provider drift — `github-command-transports.test.ts` (8 tests), sync-review and sync service suites cover post-await access/GitHub revocation, runtime/connection/owner changes. Remote protection — SDK/HTTP refusals precede credentials/provider effects. Lifecycle and atomic failure — existing executor/lifecycle tests and success-only audit triggers assert no recursion, partial domain writes, premature domain events or duplicate audit. Every cited suite ran and passed in the fresh final parent full run. Added sync service regressions cover durable mapped labels, two selected connections with shared milestones/divergent fields, one-of-two-field resolution and deferred baseline drift; core tests cover full-batch conflict detection under partial selection, strict selectors, ownership/provider relationships and persisted/batch allocation collisions.

Registered executor samples 2451.310/2395.990/2381.006 ms pass the accepted four-second tolerance and exceed the two-second nominal diagnostic target. Existing Vite chunk-size advisories remain.

## Changelog

- Version 1 (2026-10-12): Recorded current Code Map, viable routing refinements, intended acceptance and independently verified human-confirmation planning gap; halted before implementation.

- Version 3 (2026-10-12): Resumed rolled-back attempt, recovered nine missing new files from local review diff, freshly verified implementation, repaired disabled planning, deleted-connection conflict typing and Release-only link baselines. Independent completion review pending.

- Version 4 (2026-10-12): Iteration-1 conflict/identity and combined-pull repairs implemented; fresh 1,471-test full suite and release verifier passed. Follow-up four-layer review completed; six scoped patch entries repaired and final 1,476-test/full-release gates passed. Selective approval follow-up remains recommended.

## Auto Run Result

Status: done (follow-up review pass 3, iteration 0)

Summary: Story 4.7 routes non-human domain writes and GitHub local effects through ChangeSets as recorded above. This follow-up pass reviewed the full diff since baseline with four independent layers and patched six medium entries.

Files changed this pass:
- `apps/server/src/mcp/tools/register-tools.ts` — one `isBlockedByAgentProtection` rule restores the protection block for the three non-command write tools.
- `apps/server/src/application/{customization,github-link,card}/*.use-cases.ts` — `requirePatch` runs before the non-human branch.
- `apps/server/src/mcp/tools/{register-tools,complete-surface}.test.ts` — protection and empty-patch regressions.
- `apps/server/src/application/sync/github-command-regressions.test.ts` — Agent drift, read-only mirror, remote_deleted, milestone clearing, empty pull and import hierarchy regressions.

Review findings: 41 reported; patched 6 medium entries (0 high); deferred 0 new (existing ledger untouched); rejected 35 with reasons in the triage log.

Follow-up review recommendation: false — no high entry patched on this follow-up pass.

Verification: Node 24.17.0 `corepack pnpm test` passed (Contracts 119, Importers 7, Core 234, Web 198, DB 349, Server 488, Performance 8); `node scripts/verify.mjs` passed (hygiene, capability parity, typecheck, build) after correcting one test mock type; a mutation of `revalidateGitHubPreparation` fails the new drift regressions. Providers are mocked; no live GitHub mutation is claimed.

Residual risks: the four deferred items in frontmatter remain open; the repository was not committed because the intent forbids commits for this invocation; `sprint-status.yaml` was neither written nor staged.
