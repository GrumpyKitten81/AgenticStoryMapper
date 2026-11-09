---
title: 'ChangeSet executor'
type: 'feature'
created: '2026-10-12'
status: done
version: 3
review_loop_iteration: 0
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-4-preparation.md', '_bmad-output/implementation-artifacts/story-plan-4-6-changeset-executor.md']
warnings: [oversized]
deferred:
  - summary: >-
      A failed post-commit subscriber prevents later subscribers and afterCommit from running.
    evidence: |-
      The baseline UnitOfWork already iterates listeners without independent error capture and runs afterCommit afterward. Story4.6 preserves a committed successful outcome with a loud diagnostic; independent publication fan-out is pre-existing deferred work.
    location: >-
      packages/db/src/unit-of-work.ts:74
    severity: medium
baseline_revision: 5a3134a674f8e1a36eb7577b6ac9cba57db1e4e9
---

Reproducing statement: Implement Story 4.6 with bmad-build-auto and independent investigation/review, preserving orchestrator-owned sprint-status.yaml and verifying actual source and checks. Date: 2026-10-12. Version: 3.

<intent-contract>

## Intent

**Problem:** Stored ChangeSets apply through a seven-pair whitelist without pre-apply snapshots, immutable approval/selection, complete conflict checks or the accepted optional Agent approval policy.

**Approach:** Integrate the complete pure registry with a write-gated application executor and transaction repository persistence; share hierarchy/position rules with human commands, implement policy/identity storage and prove atomic local execution.

## Boundaries & Constraints

**Always:** Follow Epic 4 preparation, 4.6 detail plan and accepted ADR0002/0003/0004. Contracts own shared schemas, core resolves without I/O, repositories own SQL. Prepare files/allocated identities before the applying transaction; keep one gate through outside-transaction pre-apply snapshot and synchronous UoW. Recheck current state, actual ownership/access/protection and runtime identity inside UoW. Commit domain state, once-per-UoW root versions, coalesced Card history, one Activity per selected operation, applied Activity and successful mutation/tool audit together; emit live events after commit. Preserve immutable operations and approved dependency-closed selection, actual proposer/approver actor type/id(host)/session and readable historical data. Existing roots compare transaction-start versions; new roots need no baseline. Card Keys are monotonic, never reused after deletion. Only addressed external baselines advance. Keep rejection reapprovable, schema staleness and applied/restore-undone replay refusal. Approval flag defaults off, only human settings change it with Activity; admitted enabled Agents can self/other approve under protection, while protection always blocks Agent apply. Human own approval/apply under protection works. Disabling flag preserves prior approvals.

**Never:** Write, stage or revert sprint-status.yaml; treat done/awaiting-operator rows as verification. No commit/push, universal command routing (4.7), generic submission (4.8), board preview rendering (4.9), new View Settings storage, compatibility adapter/prototype migration, remote rollback, inverse undo, cleanup/retry service, provider/SaaS/telemetry or permissive operation payload. Never let a caller boolean or approval token bypass approval on a stored id; newly created command auto-apply is only reachable through the command-creation flow. No remote provider effects inside the SQLite operation array.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| New command | apply=true, unprotected admitted actor | Distinct proposal/apply audit; one pre-apply snapshot; ordered atomic resolved effects | Any operation/history/applied-event/success-audit failure rolls back local batch; snapshot remains |
| Stored proposal | Recorded approval matching operations and closed selection | Apply exactly reviewed input and selection | Changes require fresh approval; stale/applied/undone replay refused |
| Selection | Selected/deselected stable ids | Dependents excluded transitively; empty selection no domain writes/snapshot | Invalid ids refused before effects |
| Conflicts | Repeated root operations, upserts, new locals | Every offending operation id/index and actual target reported against start versions; status conflict; no writes | Unified conflict report, no partial apply |
| Approval | All access/flag/protection combinations, own/other actors | Actual identity persists; default off; enabled approval works under protection without domain effects/snapshot | Agent access/flag refusal audited; protection independently refuses Agent apply |
| External identity | Upsert and overlapping pending proposal | Addressed baseline resulting root version; other baseline retained; warning names prior proposal | Human drift conflicts; identical no-op preserves versions |
| Files | Source/attachment/copy preparation then local failure | No visible links survive rollback; retained prepared effects reported explicitly | Preparation failure changes no domain data; no false file/remote rollback claim |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/{change-set-schemas,operation-resolution,conflicts,domain}.ts`, `api/http.ts`, `mcp/{tools,tool-inputs}.ts` — strict current/history contracts, indexed results, ActorContext identity, selection and policy; current schema version 2, apply token required but discarded. Real MCP host is actorId, not caller payload.
- `packages/core/src/changesets/{operation-registry,resolution-context,operation-dependencies,upsert-resolution,position-resolution,entity-resolution,card-command-resolution}.ts` — complete typed resolutions, owner/dependency closure, initial+1 versions, pure hierarchy/placement; current baseline throws first error, requiring full conflict collection. Move needs existing remote parentOverrideLocal parity.
- `packages/db/src/repositories/changesets-repository.ts` — replace whitelist; currently rewrites approved copy/import input. Add immutable approval binding/execution metadata and warnings.
- `packages/db/src/schema/tables.ts`, `connection.ts`, `repositories/row-mappers.ts`, `operation-schema-transition.ts`, archive/restore readers — extend exact bootstrap schema and operation-data transition; no prototype compatibility. New policy and metadata must survive historical restore/import.
- `packages/db/src/repositories/{storymapper-repository,cards-repository,root-versions,card-history-repository,external-refs-repository,map-copy-repository,tool-proposals-repository}.ts` — expose snapshot/supply/persistence helpers here or cohesive adjacent files; preserve Card history/finalizers, soft-deleted Map history and Card deletion sync-conflict cleanup. Current key allocator scans survivors and must become durable. SQL encodes Persona arrays, ProductContext features, Roadmap labels and connection mappings. Chunk/note links and GitHub associations use distinct physical tables; direct GitHub evidence is synthesized, never duplicated.
- `packages/db/src/{database-handle,unit-of-work,restore-points}.ts` — ordinary gates are nonreentrant; introduce concrete gate-owned UoW/snapshot path, preserving nested actor and synchronous constraints. Existing protected migration demonstrates snapshot then transaction.
- `apps/server/src/application/changeset/changeset.use-cases.ts`, application deps, HTTP changeset routes — own lifecycle/execution orchestration and strict selected request schemas; keep proposal/apply distinct actions and current-schema response verification inside transaction.
- `apps/server/src/mcp/tools/{audit-tool-call,register-tools,project-scopes}.ts`, MCP HTTP/bridge — wrapper currently opens UoW before handler. Move executor snapshot outside while successful audit still inserts inside apply transaction, exactly once. Scope all actual owners and permitted local identities.
- `packages/db/src/repositories/projects-repository.ts`, server customization use cases, `packages/mcp/src/permissions/permissions.ts`, `apps/web/src/features/safety/SafetySwitchStrip.tsx`, web API/strings — default-off human-controlled approval flag. Generic write permission currently blocks protection; conditional ApproveChangeSet must bypass only this apply policy, not access/flag ownership checks.
- `scripts/{capability-scan,capability-operation-coverage,capability-artifacts,generate-capability-manifest,check-capabilities}.mjs`, generated capability/MCP files — approval remains lifecycle exception, becomes conditional Agent tool; update authored metadata and regenerate coherent artifacts.
- Source evidence: DB operation-resolution parity/selector regressions, root-versions/card-history/UoW/restore/board-import tests; server tool-call-audit, complete-surface, register-tools, tool-proposals and HTTP UoW tests. Their old whitelist refusal expectations change only where executor now supports the operation.
- Read-only: orchestrator sprint/deferred ledgers and user data/credentials. Knowledge graph unavailable; three independent source investigations found no intent conflict.

## Tasks & Acceptance

**Execution:**
- [x] Extend shared ChangeSet/conflict/selection/preview/execution and safety contracts plus DB schema/mappers/transitions; bind actual proposal/approval identities and immutable selection, separate result IDs from input.
- [x] Implement production operation snapshot and supply preparation in `packages/db/src/repositories/` and server changeset application helpers, including literal ownership, fingerprints, prepared imports, bulk/copy/board/Roadmap allocations and retained-file reporting.
- [x] Replace `packages/db/src/repositories/changesets-repository.ts` whitelist with exhaustive resolved-change persistence; preserve physical encodings, soft deletion/history, cleanup, no-op semantics, external baselines and monotonic Card allocator.
- [x] Integrate core hierarchy/position resolution into `cards-repository.ts` human creation/move/delete/unpark and release movement paths; remove duplicated assertParentAllowed/reindex/placement semantics after parity verification.
- [x] Implement gated preparation/snapshot/UoW orchestration in DB gate/UoW/restore services and server changeset use cases; collect all selected start-version/sync conflicts, enforce immutable lifecycle/selection and command-only auto-apply boundary.
- [x] Wire conditional approval through projects/customization/settings UI, HTTP/MCP shared inputs, permissions/scopes/descriptors/authored metadata and generated artifacts; preserve human-only rejection/settings/restore.
- [x] Integrate atomic successful MCP audit with executor transaction and exact single-call durable evidence, including failure responses and post-commit live events.
- [x] Add meaningful contract/core/temporary-SQLite/server transport/mounted web tests and serial full-cost budget; run package suites, release checks and independent review; repair every verified scoped defect.

**Acceptance Criteria:**
- Given every registered selected operation family, when the actual executor applies on temporary SQLite, then persisted state matches pure resolution semantically (normalized real IDs/keys/time), exact history/versions/operation Activity hold and approved input remains byte-identical.
- Given newly generated unprotected commands versus stored proposals, when the application creation flow executes or HTTP and both Agent transports apply a stored id, then only the creation flow auto-applies; stored-id apply requires bound approval and one snapshot occurs before the applying transaction.
- Given invalid/empty selection, dependency deselection and replay/stale work, when preview/apply executes, then stable original indexes and transitive closure are preserved, invalid/replay fail and empty selection takes no snapshot/domain mutation.
- Given multiple differently versioned roots, repeated-root operations or local creations and human/external baseline drift, when apply checks current start state, then all conflicting operation ids/indexes/targets are returned, status conflict persists separately and zero partial domain effects exist.
- Given all four flag/protection combinations, own/other Agent and Human proposals, flag/access changes under the gate, when real HTTP, /mcp and /api/mcp/call approve/apply, then actual durable identities, fresh-approval requirements and policy matrix hold, approval takes no snapshot and prior approval survives flag disable.
- Given prepared sources/attachments/copies and forced operation/history/applied-event/success-audit failure, when applying, then domain/history/version/links/success audit roll back together, no premature live event publishes, snapshot remains and retained prepared effects are explicitly reported.
- Given human drag/move/create/rehome and executor hierarchy/position operations, when parity tests run including mixed-level tied insertion order and parked Cards, then core rules agree, remote override and sibling/history semantics survive and duplicate hierarchy/position logic is absent.
- Given deletion and later Card creation, when persisted/reopened, then monotonic map keys are not reused; identical publication stays unchanged and only addressed external baseline advances, while pending overlap warnings name the earlier ChangeSet.
- Given 1,000 Cards and 200 selected operations, when the executor including snapshot/history/audit is measured serially, then the 2-second nominal/4-second tolerance budget passes and all observed measurements/failures are retained.

## Spec Change Log

- Version 2 scope correction (2026-10-12): Initial Edge1 retrofit classification contradicted frozen no-prototype-migration intent, Epic4 preparation:93 and global AI-DO-NOT. Withdraw the retrofit/backfill directive, preserve exact current DDL plus operation/history transitions, and record Edge1 as rejected with the explicit scope refutation. Earlier registry plan4.4:29 also requires literal Map scope IDs; preserve that refusal and do not infer general Map-alias support from new-local Card/selector acceptance.

- Version 2 (2026-10-12), review loop 1: Verified persistence ordering, allocation, selected preparation, conflict aggregation and post-commit audit defects require re-derivation. Amend detailed implementation requirements below; frozen intent unchanged. Avoid the known-bad first-refusal collector, final-state-only key allocator, delete-first persistence, unconditional excluded-copy reads and duplicate post-commit audit. KEEP all correctly reviewed registry coverage, pure/domain separation, immutable approval/selection/runtime identity, protected Agent policy, actual MCP transport tests, source-byte preparation outside SQLite, gate/snapshot atomicity, root/history finalizers, monotonic allocator, privacy filtering, generated artifacts and serial real-audit benchmark. The three patch findings remain required corrections during re-derivation.

## Review Triage Log

### 2026-10-12 — Review pass 1
- verdicts: 20 findings — high 3, medium 11, low 0, false 6, maybe-false 0
- findings:
  - `[high]` `[bad_spec]` Blind1: Release deletion precedes reference clearing — SQLite cards.release_id is an immediate FK; persistence deletes before updates while core emits both. Amend ordering and require assigned-Card deletion coverage.
  - `[high]` `[bad_spec]` Blind2: Copy plus create can reuse a copied key — NEW allocation runs before fixed copied keys reserve their numbers. Amend allocation order and require mixed-batch uniqueness coverage.
  - `[medium]` `[bad_spec]` Blind3: Create Card then delete Map crashes key allocation — final resolution.state omits the Map; use operation-time Map metadata and preserve soft-delete history.
  - `[medium]` `[bad_spec]` Blind4: Later before snapshots retain NEW keys — only after and final state are normalized. Same key-allocation root as Blind2; require canonical keys in every Activity/history snapshot.
  - `[medium]` `[bad_spec]` Blind5: Deselected copy still reads missing source — prepareOperationSupply loops over all operations. Separate dependency allocation from selected preparation; preserve identity/dependency closure without discarded source reads.
  - `[false]` `[reject]` Blind6: Human command must autoapply under protection — the preparation plan explicitly restricts new-command autoapply to protection off, while stored Human approval/apply remains available. Command behavior implements that declared boundary.
  - `[medium]` `[bad_spec]` Blind7: Composite conflicts stop at first resolver refusal — collector explicitly skips composite creates, and copy/board resolvers throw first fingerprint conflict. Require complete indexed preparation/composite conflict collection.
  - `[medium]` `[bad_spec]` Blind8: Source conflicts stop at first generic error — preparation throws before collecting other selected sources and loses operation index. Require identifiable source conflict entries combined before snapshot.
  - `[medium]` `[bad_spec]` Blind9: Existing external binding deletion omitted from overlap warning — referenceOperations reads only external selectors/set payloads; an id-addressed delete has a persisted tuple. Amend warning repository read boundary and deletion warning coverage.
  - `[high]` `[bad_spec]` Blind10: Post-commit publication error creates a second audit — runPrepared notifies after commit; audit catch resets persistedInline and adds error after committed success. Require explicit committed-outcome handling, one successful audit and loud publication-error diagnostics; never claim rollback.
  - `[false]` `[reject]` Edge1: Existing databases miss added columns — old-DDL reads fail, but prototype compatibility is explicitly excluded by frozen intent, Epic4 preparation:93 and global AI-DO-NOT. Current bootstrap DDL includes every new column; current-DDL operation/history transitions remain required. This scope refutation supersedes the initial mistaken retrofit directive.
  - `[medium]` `[bad_spec]` Edge2: Excluded copy source aborts apply — same verified selected-preparation root as Blind5; amend allocation/preparation separation.
  - `[medium]` `[bad_spec]` Edge3: Upsert local aliases lose indexed conflicts — collector looks up localId literally in the initial snapshot, while sequential resolution maps the alias to a persisted upsert root. Require sequential identity/owner tracking against initial versions.
  - `[medium]` `[patch]` Edge4: Dual-owner GitHub baseline uses Release — collector prioritizes releaseId, while link-resolution validates Card when cardId exists. Correct Card-first primary owner and test differing versions.
  - `[medium]` `[patch]` Verification1: Reviewed source drift lacks an assertion — pre-verified mutation evidence: existing file remains unchanged. Add changed-byte refusal with complete indexed conflict, cleared approval, unchanged domain/history and no snapshot.
  - `[medium]` `[patch]` Verification2: ChangeSet move lacks persisted remote override coverage — pre-verified searches identify direct-move tests only. Add approved resolved move and assert parentOverrideLocal on the persisted remote link.
  - `[false]` `[reject]` Intent1: Diff cannot prove workflow/tracking actions — tool execution records prove rendered skill invocation, fresh implementation/review agents and explicit exclusion of tracking from all mutations; this is an artifact limitation, not a workflow defect.
  - `[false]` `[reject]` Intent2: Added tests do not prove they ran — parent full configured test command passed, including all covering files; release checks passed. Independent review has now completed its four reports.
  - `[false]` `[reject]` Intent3: Executor does not establish universal routing — Story4.7 explicitly owns universal routing; no current claim asserts it.
  - `[false]` `[reject]` Intent4: Nominal 2-second target missed — actual samples and nominal misses are retained explicitly, and the accepted 4-second tolerance passes; no false nominal-pass claim remains.


### 2026-10-12 — Review pass 2
- verdicts: 19 findings — high 0, medium 12, low 1, false 6, maybe-false 0
- findings:
  - `[medium]` `[bad_spec]` Blind1: MCP authorizes excluded operations — resolveToolProjectIds walks every stored operation before the executor; an excluded deleted Card causes requiredScope to throw. Require selection closure before MCP scope authorization.
  - `[medium]` `[patch]` Blind2: Annotation/Roadmap local identities rejected — collectScopes permits only card/parent/release/persona references despite remaining-context resolving Annotation/Roadmap local identities. Extend only registered alias-bearing fields; preserve literal Project/Map/chunk refusal.
  - `[medium]` `[patch]` Blind3: Bulk relationship allocation misses Card aliases — allocation uses input target.id while resolveBulk indexes by resolved card.id. Use the input target allocation key and cover create-then-bulk SQLite success.
  - `[medium]` `[patch]` Blind4: Deduplicated source metadata refuses reviewed imports — prepareSourceOperations supplies unchanged existing title/path, while importSource validates them against reviewed after before deduplicating. Validate reviewed preparation without mutating the immutable existing document; cover title/path changes.
  - `[medium]` `[bad_spec]` Blind5: Pending inline command loses prepared content — executeChangeSetCommand accepts preparedSourceImports but proposal-only/protected return discards them; later stored execution refuses inline paths lacking existing documents. Prevent creating an unexecutable pending proposal: require durable reviewed local source paths for deferred command imports and loudly refuse ephemeral-only pending input before proposal writes; preserve immediate prepared imports. No generic submission/storage system.
  - `[medium]` `[bad_spec]` Blind6: Update-then-delete applied history disappears — canReadChangeSet uses current resolvers for the update even when the same applied batch deletes its Card. Require historical ownership throughout an applied batch, with current ownership winning and ambiguous owners refused.
  - `[medium]` `[bad_spec]` Blind7: ExternalRef deletion history disappears — historical deletion types omit externalRef and scopeResolvers has no externalRefId; applied delete cannot resolve its own root. Recover binding ownership from recorded operation changes and enforce Project access.
  - `[medium]` `[defer]` Blind8: First failed live subscriber skips later publications — baseline UnitOfWork already stops at the first listener and skips afterCommit. This story preserves committed outcomes and loud diagnostics but did not cause the publication fan-out limitation; defer the existing behavior.
  - `[medium]` `[bad_spec]` Blind9: Retained snapshot is absent from rollback error — publishRestorePoint creates a durable file before the transaction, but the catch rethrows without naming it. Require safe retained snapshot/effect details on before-commit failure through existing error details, preserving error code/conflicts and atomic audit.
  - `[low]` `[reject]` Blind10: Snapshot reads unrelated table rows — source confirms broad SELECT plus filtering and fingerprints for all Project Maps. Current full pipeline meets accepted tolerance; extra reads are negligible in the verified fixture and selective SQL/fingerprint APIs add branching and parameter complexity. Reject this optimization absent measured user harm.
  - `[medium]` `[bad_spec]` Edge1: Deselected deleted targets block MCP selection — same verified root as Blind1; authorization must use requested approval closure or recorded apply closure before resolving targets.
  - `[medium]` `[patch]` Verification1: Human HTTP selection forwarding lacks evidence — Pre-verified: route tests submit empty bodies and transport tests cover MCP instead. Add real Human HTTP approve closed subset, explicit apply mismatch refusal before snapshot, and persisted excluded-Card assertions.
  - `[medium]` `[patch]` Verification2: Changed operation bytes lack hash-refusal evidence — Pre-verified: no test mutates valid approved operations retaining approval. Add application pre-snapshot and transaction repository immutable hash mismatch refusals.
  - `[false]` `[reject]` Intent1: Workflow cannot be proven by diff — carried: tool records establish rendered workflow, delegation and four review layers; diff-only visibility is not a workflow defect.
  - `[false]` `[reject]` Intent2: Tracking action history cannot be proven by final diff — carried: all mutation lists explicitly exclude sprint-status; no tracking writes, staging or reverts performed.
  - `[false]` `[reject]` Intent3: Documentary in-review/unchecked state does not prove completion — current review intentionally remains in-review until verified finalization; parent full 1,397-test run and release command passed independently of documentary/orchestrator rows.
  - `[false]` `[reject]` Intent4: Universal routing is not established — carried: frozen intent explicitly reserves universal routing for Story4.7.
  - `[false]` `[reject]` Intent5: Nominal performance threshold not asserted — carried: actual nominal misses are recorded; accepted 4-second tolerance is asserted and passed without a nominal-pass claim.
  - `[false]` `[reject]` Intent6: Local tests do not prove remote rollback — frozen intent explicitly excludes remote rollback; tests and claims consistently concern local atomicity.


### 2026-10-12 — Review pass 3
- verdicts: 18 findings — high 0, medium 7, low 1, false 10, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind1: Remaining creation-local fields rejected — Core remainingTarget resolves local Workflow Status/Story Template/Attachment selectors, but MCP exemptions omit their statusId/templateId/attachmentId fields. Added the existing whitelist fields and passing registered create/update/delete alias coverage.
  - `[false]` `[reject]` Blind2: Source Link creation-local unlink rejected — Pure simulate registers aliases only for create/upsert/import, and unlinkSource addresses after.id literally. Link-local unlink is not a registered supported alias path; MCP refusal agrees with core rather than blocking a valid resolution.
  - `[medium]` `[patch]` Blind3: Deletion before snapshot mutated — writeCardVersion assigns provenance/version into change.before before operation Activity JSON is serialized. Passed a copy; passing Activity assertions preserve original pre-delete version/provenance and final deletion history.
  - `[low]` `[patch]` Blind4: Non-root identities absent from live metadata — Resolved project-scoped customizations emit only ChangeSet metadata. Current project caches still invalidate, but concrete entity metadata is less precise than ordinary repository writes. Reused trackLiveActivity; passing tests assert concrete identities after commit and unchanged operation Activity counts.
  - `[false]` `[reject]` Blind5: EACCES must aggregate as a source conflict — Missing/changed reviewed input is explicitly collected as indexed source conflicts. Other read failures are fatal preparation errors and propagate loudly before snapshot/domain effects; permissions failures are not version/input drift. No partial apply or promised conflict aggregation is lost.
  - `[false]` `[reject]` Blind6: Throwing diagnostic reporter replaces committed marker — No production path making the configured Pino logger or constant emitWarning reporter throw was demonstrated. A deliberately throwing replacement callback creates caller misuse rather than a verified runtime state; do not add a fallback/catch for an unproven condition.
  - `[medium]` `[patch]` Blind7: Mixed repository/UoW changes double-bump roots — Immediate snapshot sees an earlier direct bump and pure resolution computes another +1; persistence then writes it despite bumpedRoots. Added pre-persistence refusal for already-created/bumped changed roots; passing created/updated rollback and independent-root tests verify the boundary.
  - `[false]` `[reject]` Blind8: Duplicate resolution misses nominal budget — carried: original Intent4/pass2 Intent5 record actual nominal misses and accepted tolerance passes. Rechecking inside the applying transaction is required; nominal miss is not a false pass or unmet tolerance and does not justify speculative optimization.
  - `[false]` `[reject]` Blind9: Create-then-delete Card lacks coverage — operation-executor-persistence.test.ts:180 already runs the delete variant in one selected batch and asserts canonical before/after keys, surviving history, two operation Activities and next_card_number=2. The claimed separate-only coverage is disproved.
  - `[medium]` `[patch]` Blind10: Snapshot publication failure lacks evidence — Current tests inject later operation/history/audit failures and helper-level snapshot failures. Added passing registered publication/retention failure regressions with durable reopen, exact audit hashes, unchanged domain/history/approval and no business live events.
  - `[medium]` `[patch]` Edge1: Retention failure loses published snapshot identity — publishRestorePoint renames the snapshot, then retention can throw a generic error before the executor assignment. Propagated safe retained snapshot details through the existing error contract, preserved the original diagnostic cause and passed registered execution/reopen coverage.
  - `[medium]` `[patch]` Verification1: Disabling flag lacks executable-approval evidence — Pre-verified: preservation tests check stored approval and only protected apply refusals. Added passing successful registered apply after disabling approval, asserting the Card state and retained actual Agent approval identity.
  - `[medium]` `[patch]` Verification Other1: Retention failure lacks retained identity — Same source-verified published-then-retention-error root as Edge1. Helper and registered executor tests now assert the safe filename, diagnostic cause, durable retention and exact atomic/audit failure boundaries.
  - `[false]` `[reject]` Intent1: Artifact cannot prove workflow execution — carried: session tool history establishes rendered skill, independent reviewers and passing parent commands; artifact-only evidence limits are not unmet workflow.
  - `[false]` `[reject]` Intent2: Diff cannot establish every tracking action — carried: mutation/staging/revert lists explicitly excluded tracking throughout; the absence of tracking diff agrees with recorded actions.
  - `[false]` `[reject]` Intent3: No interactive browser approval/apply journey — Intent requests executor implementation and independent verification; actual HTTP/MCP plus mounted setting tests exercise the required surfaces. No browser-journey completion is claimed or required by frozen matrix.
  - `[false]` `[reject]` Intent4: Universal Agent routing not established — carried: frozen intent expressly reserves universal routing for Story4.7.
  - `[false]` `[reject]` Intent5: Performance excludes network/browser and uses tolerance — carried: accepted matrix measures the executor with snapshot/history/audit, not network/browser latency. Actual registered pipeline retains nominal misses and passes the 4-second tolerance without broader claims.

### 2026-10-12 — Review pass 4 (follow-up pass on a done spec)
- verdicts: 44 findings — high 0, medium 3, low 17, false 24, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind1: No ensureColumn for new columns — carried: prototype/old-DDL compatibility is excluded by frozen intent and Epic4 preparation:93 (pass1 Edge1).
  - `[false]` `[reject]` Blind2: next_card_number lacks backfill — carried: same excluded old-DDL root; bootstrap DDL creates the counter with the map.
  - `[false]` `[reject]` Blind3: Rejected ChangeSet can be re-approved — intent says "Keep rejection reapprovable" and admits enabled Agents to approve; only rejection is Human-only, which is enforced.
  - `[false]` `[reject]` Blind4: No separation of duties for Agent approval — intent states admitted enabled Agents can self/other approve; actual proposer/approver identities are stored.
  - `[false]` `[reject]` Blind5: Approval not gated by protection — intent states approval works under protection while protection always blocks Agent apply; both are enforced and tested.
  - `[low]` `[reject]` Blind6: Capability kind vs permission special case — naming nit; the unambiguous fix adds a capability kind and generated-artifact churn with no demonstrated divergence.
  - `[low]` `[reject]` Blind7: Optional approval permission defaults to deny — fail-closed default with a defined `approval: false` base; denial is loud, not a silent fail.
  - `[low]` `[reject]` Blind8: Internal error details spread to caller — version 3 requirement 4 requires retained snapshot identifier through existing safe error details; details are server-authored.
  - `[medium]` `[defer]` Blind9: CommittedUnitOfWorkError only unwrapped by executor/audit — carried: pass2 Blind8; baseline run() already surfaced the first listener failure to every caller, existing deferred ledger item covers it.
  - `[low]` `[reject]` Blind10: Approval repeats snapshot/supply work — carried performance reasoning (pass1 Intent4); measured 2.3s against 4s tolerance, speculative caching adds state.
  - `[low]` `[reject]` Blind11: Snapshot scans whole tables — carried: pass2 Blind10 rejection.
  - `[low]` `[reject]` Blind12: O(n^2) lookups — 1,000-Card/200-operation pipeline measured 2.34-2.39s, within tolerance; no user harm shown.
  - `[false]` `[reject]` Blind13: Arbitrary host path read by Agent-authored source op — unreachable: ImportSourceDocument omits filePath (tool-inputs.ts:105) and no MCP tool authors raw operations; reviewed-hash check also applies. Human HTTP path pre-existing.
  - `[low]` `[reject]` Blind14: createChangeSet forces proposed and drops approval — deliberate: new ChangeSets are always proposed and approval is only recorded by approval; failing on input adds a branch.
  - `[false]` `[reject]` Blind15: retainedPreparedEffects hard-coded empty — preparation is in-memory plus hash checks, so no durable prepared effects exist; version 3 requirement 4 forbids inventing file effects.
  - `[false]` `[reject]` Blind16: Looser baseline checks — baseline is undefined only for roots created in the same batch ("new roots need no baseline"); every existing root has a snapshot start version.
  - `[low]` `[reject]` Blind17: AsyncLocalStorage executor audit — design preference; the repository already uses AsyncLocalStorage for the active UoW and audit tests assert exactly one success row.
  - `[low]` `[reject]` Blind18: Test hygiene — JSONL retention is the intentional "retain all observed measurements" requirement; nominal misses carried from pass2 Intent5; rejected-approval case is intended behavior.
  - `[false]` `[reject]` Blind19: placeSameLevelAtIndex semantics changed — delegating to the shared core placeCard is the required hierarchy/position parity; operation-resolution-parity tests pass and no diverging case was shown.
  - `[false]` `[reject]` Edge1: Existing databases miss columns — carried (pass1 Edge1).
  - `[false]` `[reject]` Edge2: Existing maps restart key counter — carried (pass1 Edge1).
  - `[low]` `[reject]` Edge3: Internal error details unfiltered — same root as Blind8.
  - `[false]` `[reject]` Edge4: Proposal warnings leak via Activity — warnings come from the same Project's ChangeSets (listChangeSets(projectId)); Agents with Project access already read that Project's Activity including the full ChangeSet payload.
  - `[false]` `[reject]` Edge5: Updates null other DB-only columns — only deleted, creationSource and nextCardNumber are DB-only and are excluded; no other column was shown and catalog-wide update tests persist exact state.
  - `[low]` `[reject]` Edge6: Selection comparison is order-sensitive — approved selection is stored in document order and a differing request correctly requires fresh approval; loud refusal, not wrong data.
  - `[false]` `[reject]` Edge7: Selected source op outside closure unprepared — repository compares resolved selection against selected and refuses a non-closed selection loudly; stored approvals are already closed.
  - `[false]` `[reject]` Edge8: Non-import source op crashes — sourceDocument payload is the strict import schema; any other shape fails loudly with a validation error.
  - `[false]` `[reject]` Edge9: Human command deferred under protection — carried: pass1 Blind6; preparation limits new-command auto-apply to unprotected state.
  - `[medium]` `[defer]` Edge10: Listener failure after commit for non-executor callers — carried: pass2 Blind8 and the existing deferred ledger entry.
  - `[low]` `[patch]` Edge11: applyToolProposal orphaned — verified: its only call site in changesets-repository was removed; deleted applyToolProposal and the apply-only helpers (applyGitHubBoard, upsertIssueCard, boardConnections, parkingCards, upsertIssueLinks, levelOrder, hash) plus unused imports; db typecheck, full tests and verify pass.
  - `[false]` `[reject]` Edge12: Re-approval overwrites a Human approval — reapproval is intended; the actual approver identity, hash and selection are recorded and apply uses the latest record.
  - `[false]` `[reject]` Edge13: Counter not backfilled contradicts monotonic claim — carried (pass1 Edge1).
  - `[false]` `[reject]` Verification1: Agent approval of rejected ChangeSet untested — behavior is intended (see Blind3); no defect to cover.
  - `[medium]` `[defer]` Verification2: Publication failure tested only for Apply — carried: same publication fan-out root as pass2 Blind8; existing deferred ledger entry.
  - `[low]` `[reject]` Verification3: Publication-failure log wiring untested — diagnostic-only; message is a literal constant and the reporter is exercised in tool-call-audit tests.
  - `[low]` `[patch]` Verification Other1: applyToolProposal unreferenced — same root and fix as Edge11.
  - `[low]` `[reject]` Verification Other2: Order-only selection difference refused — same root as Edge6.
  - `[low]` `[reject]` Verification Other3: Conflict-marking UoW publication failure replaces conflict — requires a throwing listener, same pre-existing fan-out root as Blind9.
  - `[false]` `[reject]` Intent1: Command flow has no production caller — carried: pass1 Intent3; universal routing is Story4.7.
  - `[false]` `[reject]` Intent2: Ownership recheck happens outside UoW — resolveOperations re-resolves owners from the in-transaction snapshot and refuses foreign Project owners (resolution-context.ts:54-78).
  - `[false]` `[reject]` Intent3: Files row satisfied only by empty field — same as Blind15; real retained snapshot identifier is reported and tested.
  - `[low]` `[reject]` Intent4: Approval permission modelled differently across surfaces — same root as Blind6.
  - `[false]` `[reject]` Intent5: Existing tests rewritten to new lifecycle — mandated by the intent (stored proposals require recorded approval; creation forces proposed).
  - `[false]` `[reject]` Intent6: Performance measured through registry, not HTTP — carried: pass3 Intent5; matrix measures executor with snapshot/history/audit.

## Design Notes

Transaction-owned persistence must apply resolved values, not repository commands that regenerate IDs, redo rules or duplicate Activity/version/history. Existing once-per-UoW root bumps and independent Card history coalescing remain authoritative. Gate ownership is explicit, never an unrestricted reentrant escape. Approval permission differs from domain apply permission. Planned-only View Settings remains excluded as locked in Story4.5.


### Review-derived implementation requirements (version 2)

The preserved source-only review snapshot is `/var/folders/yk/kp5r12sn1cd_q53r53_zkmyw0000gn/T/story46-rederive-source-uf8dnr1z.patch`. It is an implementation aid, not an acceptance authority: reconstruct its positive KEEP behavior after the mandated code revert, then correct every known-bad boundary below before verification. Never restore its old spec/knowledge/tracking state. Only code files are in that snapshot.

1. `packages/db/src/repositories/operation-persistence-repository.ts`: persist reference-clearing updates before deleting referenced roots, while new referenced rows precede insertions. Cover Release deletion with assigned Cards and surviving GitHub links. Allocate canonical Card keys with copied fixed keys reserved first; use operation-time Map rows when a Map is later removed, normalize both before/after plus final state and retain durable counter/history semantics. Cover copy+create, create+update, create+delete and create+Map-delete sequences.
2. `packages/db/src/repositories/operation-supply-repository.ts` and executor preparation: keep identity/dependency allocation for the immutable full operation list, but read copy/source inputs only for the closed selected list. An excluded deleted copy source must not prevent selected or empty application; no snapshot for empty selection.
3. `packages/core/src/changesets/operation-conflicts.ts` and application source preparation: trace sequential aliases and changed primary owners to actual initial roots. Card wins the GitHub primary baseline when both Card and Release exist. Aggregate all indexed version/sync, composite fingerprint and missing/changed-source conflicts before snapshot; add shared typed nonversion conflict entries when needed, without invented baselines. Preserve stable original indexes, actual targets, no partial effects and separately persisted conflict status/cleared approval. Include multiple copies, multiple source files and upsert aliases in regression cases.
4. `packages/db/src/repositories/changeset-warnings.ts`: resolve an existing external binding addressed for deletion to its stored tuple; warning must name the earlier pending deletion/publication without modifying either input.
5. `packages/db/src/connection.ts` and operation/archive schema transitions: extend exact current bootstrap DDL and versioned operation-data transitions only. Preserve readable historical operation data on current DDL, current-schema archive/restore and durable counters. Do not add a pre-4.6 column retrofit, key backfill or prototype compatibility; old-DDL compatibility is expressly excluded.
6. `packages/db/src/unit-of-work.ts`, application executor and MCP audit: distinguish a successfully committed apply from subsequent listener/afterCommit failure. A committed apply returns its canonical successful result and retains exactly one successful audit with matching output hash; report publication failure loudly through the existing diagnostic path. A before-commit successful-audit insertion failure still rolls back and yields exactly one durable error audit. Cover throwing listener/afterCommit on actual registered ApplyChangeSet and durable reopen; avoid suppressing failures silently or claiming committed data rolled back.
7. Required surviving patch tests: changed selected source bytes refuse before snapshot with indexed identity and unchanged domain/history; approved resolved Card move persists remote parentOverrideLocal; dual-owner GitHub link compares its Card baseline with differing Release version.

## Verification

Use Node24 PATH `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin`.

| Requirement | Evidence surface |
|---|---|
| Registry persistence/preview equality and human shared rules | Core golden/purity/selection plus actual DB executor/parity tests with exact state/history/version oracles |
| Lifecycle/selection/conflicts/snapshot ordering/failure atomicity | File-backed temporary SQLite, durable reopen, injected failing operations/history/applied events/audit and captured commit events |
| Policy/identity/audit/schema/restore | Actual HTTP and both MCP transports, preserved sessions, four flag/protection combinations, gated flips and restore/history transitions |
| Human setting control | Mounted SafetySwitchStrip updates, default/current visibility and existing live invalidation |
| Full apply budget | Serial actual executor 1,000-Card/200-op fixture includes snapshot/history/audit, 2s nominal/4s tolerance |

Commands: focused contracts/core/db/server/web tests, `corepack pnpm test`, `node scripts/verify.mjs`, `git diff --check`. Required new files may be staged only if the tracked-files portable verification fixture requires it; never stage orchestrator tracking, commit or push.

## Changelog

- Version 2 (2026-10-12): Four-layer review logged individually; positive implementation preserved for re-derivation and verified defect boundaries made concrete.

- Version 1 (2026-10-12): Source-verified executor plan after three independent investigations; no unresolved intent or preparation conflict.

### Review-derived implementation requirements (version 3)

The new source-only KEEP patch is `/var/folders/yk/kp5r12sn1cd_q53r53_zkmyw0000gn/T/story46-review2-keep-wysvfq29.patch`. Restore code from this patch only, then repair the requirements below; do not restore spec, knowledge or tracking from any patch. Preserve all version2 KEEP behavior and constraints, including no prototype compatibility and literal Project/Map/chunk scopes.

1. MCP approval/application authorization must resolve only dependency-closed requested approval or recorded apply selection before resolving target scopes. Preserve Project admission and immutable selection-mismatch refusal; both MCP transports must cover an excluded deleted Card, an empty selection and dependent exclusion.
2. Applied ChangeSet history remains visible after earlier updated/referenced roots are deleted in the same batch. Current ownership wins, historical ownership comes from auditable recorded operation changes, ambiguous ownership refuses access. Include ExternalRef deleted bindings and keep access/privacy enforcement.
3. Deferred command imports require reviewed durable local source paths. If prepared inline-only bytes would be discarded by proposal-only or protection behavior, refuse loudly before creating the proposal; do not create unusable pending input or invent generic submission, persistent sidecars, retries or command routing. Immediate prepared source execution remains supported.
4. After a pre-apply snapshot succeeds and the applying transaction fails, report its retained identifier and any actual retained preparation effects through existing safe error details. Preserve original domain error code/conflicts, one error audit and unchanged transactional state. Report no invented file effects; no remote rollback claim.
5. Required surviving patches: alias support only for registered alias-bearing Annotation/Roadmap/child fields, never literal Project/Map/chunk; bulk relationship allocation by reviewed input target identity; same-hash source deduplication validates reviewed metadata while preserving existing immutable document/chunks; Human HTTP subset forwarding and explicit mismatch refusal; approved-byte hash refusals at both application and repository transaction boundaries. Cover successful persisted bulk relationship and Release upsert operation families in the actual executor catalog.

## Spec Change Log — version 3

- 2026-10-12, loop2: Review2 exposed selection authorization, historical visibility, unusable ephemeral pending-source input and retained snapshot error reporting. Requirements above amend implementation boundaries outside frozen intent. KEEP every previously passing registry, policy, audit, key/conflict, history and actual-budget behavior. Avoid full-list authorization, current-only applied history, discarded-only source proposals and unnamed retained snapshots. Five trivial patch entries survive the re-derivation; one pre-existing publication fan-out limitation is deferred.

## Auto Run Result

Status: done

Summary: Follow-up review pass 4 on the done Story 4.6 ChangeSet executor. Four independent reviewers (Blind, Edge Case, Verification Gap, Intent Alignment) reported 44 findings; one verified defect (orphaned legacy apply path) was patched, and all remaining findings were rejected or matched the carried publication fan-out deferral.

Files changed in this pass:
- `packages/db/src/repositories/tool-proposals-repository.ts` - removed the orphaned `applyToolProposal` apply path and its apply-only helpers plus unused imports; proposal creation and previews unchanged.
- `_bmad-output/implementation-artifacts/spec-4-6-changeset-executor.md` - triage log, result and status.

Review findings: patches applied 2 rows (1 root, low), items deferred 0 new (3 rows carried to the existing publication fan-out ledger entry), rejected 39 with reasons in the Review pass 4 log (24 false, 15 low).

Follow-up review recommendation: false. This follow-up pass patched no high entry; patched counts: high 0, medium 0, low 1 entry.

Verification: `corepack pnpm --filter @storymapper/db typecheck` passed; `corepack pnpm test` exit 0 (contracts 118, core 217, db 347, web 198, server 440 plus serial audit and executor performance suites; executor budget samples 2.34-2.39s, 4s tolerance passed, nominal 2s missed and retained); `node scripts/verify.mjs` exit 0 (hygiene, typecheck, build); `git diff --check` clean for code.

Residual risks: nominal 2s executor target is missed (accepted tolerance passes); post-commit subscriber fan-out limitation remains the existing deferred ledger item; no commit was made because the frozen intent forbids commit/push, so the working tree (including orchestrator-owned sprint-status.yaml and deferred-work.md and OpenWolf bookkeeping) remains uncommitted for the orchestrator.
