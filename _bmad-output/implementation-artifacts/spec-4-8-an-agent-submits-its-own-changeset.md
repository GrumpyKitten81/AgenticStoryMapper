---
title: '4.8 An Agent submits its own ChangeSet'
type: feature
created: '2026-10-12'
status: done
baseline_revision: 891895e5a1f3a792def2ef7d226c7e10d5abc7a5
review_loop_iteration: 0
followup_pass: true
followup_review_recommended: false
context: []
warnings: [oversized]
deferred: []
version: 3
---

Reproducing statement: Implement Story 4.8 using bmad-build-auto: generic whole-cut Agent submission with actual transport identity, shared sequential operation validation and one ChangeSet; never write, stage or revert orchestrator sprint-status.yaml. Date: 2026-10-12. Version: 3.

<intent-contract>

## Intent

**Problem:** Agents can generate proposals or issue individual commands, but cannot submit a complete planning cut through one generic manifested tool for one review.

**Approach:** Expose `SubmitChangeSet` backed by actor-required `submitChangeSet`, sharing the current typed operation catalog, sequential resolver and existing command/executor. Validate the complete cut before storing exactly one ChangeSet.

## Boundaries & Constraints

**Always:** Contracts are the only schemas. Request includes Project, title, shared operations, optional shared context/source evidence/rationale, and apply default true. Source/rationale are planning metadata, never transport actor or lifecycle claims. Retain all validated operation metadata; propagate supplied shared context/evidence/rationale coherently without overriding explicit operation values. Actual transport host/session supplies proposer. Validate sequential references and actual persisted owners before storage. Only backward local references; persisted foreign identities cannot be disguised by aliases. Protected or apply=false creates one proposal with zero domain rows/files/snapshot. Immediate apply uses existing executor and its atomic audit, snapshot/conflict/live-event semantics. MCP source imports require inline content and cannot read host files. Source-generating proposals retain proposal-only behavior. No arbitrary operation-count cap; 200 Cards plus supporting operations must work. Preserve user data and orchestrator ledgers; no commit or push.

**Never:** Invent a second execution/preview engine, BMad parser, UI/HTTP product flow, provider call, compatibility fallback, source-generation rewrite, approval bypass for stored proposals, or source-file access. Do not treat sprint rows as verification. Do not write, stage, restore or revert sprint-status.yaml or deferred-work.md.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Whole cut | 200 Cards spanning supported levels; backward hierarchy, Release assignments, Personas, chunk/note links | Exactly one ChangeSet; permitted default application resolves cut in order and retains metadata/actual proposer | Shared executor errors remain atomic |
| Proposal | Same valid cut; protection or apply=false | Canonical proposed response, id/preview reference; no domain rows or snapshot | Disabled Agent access still refuses |
| Initial evidence | Inline source import precedes Cards and typed import+locator links | Protected proposal validates/simulates chunks before persistence; approved apply uses same operations | Bad hash/locator/missing inline content reject indexed; never read host paths |
| Invalid cut | Unknown parent/Release, forward refs, duplicate operation/local ids, unsupported/schema-invalid payload | Entire submission rejected before ChangeSet persistence, zero partial domain effects | Response identifies offending operation index and id where supplied |
| Ownership/identity | Foreign persisted id collides with local alias; forged actor/approval fields; inaccessible Project | Reject before storage or domain effects; no impersonation | Indexed owner errors for operations; strict request rejects actor/lifecycle fields |
| Conflict | Already-invalid supplied baseline or later drift in stored proposal | Pre-storage resolver may reject indexed conflict; drift after submission uses existing stored executor conflict lifecycle | No stale overwrite or silent repair |
| Parity/audit | Tool advertised and called on both actual MCP transports | Shared schema, registry, capability manifest/docs agree; one durable audit per call and success atomic with apply | Failure audit retained without partial applied effects |

</intent-contract>

## Code Map

- `packages/contracts/src/mcp/tools.ts` — McpToolName enum, changeSetCommandToolNames and canonical changeSetCommandResponseSchema. Add submission input built from changeSetSchema.shape operations/context/source schemas; export inferred type. Existing changeSet source enum is actor-attribution, not arbitrary source evidence.
- `packages/contracts/src/mcp/tool-inputs.ts` — actual SDK input schemas and audit partial parser; register strict submission schema. Duplicate ids already checked by changeSetSchema operations refinement; convert failures to indexed details including provided operationId.
- `apps/server/src/application/changeset/submission-operations.ts` — shared pure metadata merge used by scope validation and submission persistence.
- `apps/server/src/application/changeset/changeset-command.ts:8` — executeChangeSetCommand persists one command separately and defers on apply=false/protection. Reuse; do not create per-operation commands.
- `apps/server/src/application/changeset/changeset-executor.ts:13` — executeStoredOrNewChangeSet performs prepared write gate, snapshot, conflict aggregation, application/audit and post-commit events. Reuse unchanged unless required by submission-specific validation.
- `apps/server/src/application/changeset/prepare-operation-supply.ts:6` — prepareSourceOperations reads inline content preferentially or host files; enforce inline-only at submission boundary before calling. Hash validation produces source conflicts; report indexed submission failures.
- `packages/db/src/repositories/operation-supply-repository.ts:6` — prepareOperationSupply allocates IDs only; getOperationSnapshot is Project-scoped. All pre-storage validation can use these plus prepareSourceOperations and resolveOperations without writes.
- `packages/core/src/changesets/operation-registry.ts:86` — resolveOperations normalizes operations, validates duplicate ids and simulates all operations sequentially. OperationResolutionError preserves index/id; already-invalid baseline fails conflict. Full validation before persistence; later drift remains executor lifecycle.
- `apps/server/src/mcp/tools/project-scopes.ts:211` — resolveToolProjectIds resolves persisted ownership before creation aliases, preventing foreign alias spoofing absent from Project snapshot. Existing generic traversal lacks submission sequencing/indexed errors; adapt minimally so valid backward refs pass and invalid refs give operation index/id. Transport authorization and application must both retain actual-owner checks.
- `apps/server/src/application/errors.ts:6` — maps OperationResolutionError into DomainError indexed details; shared Zod errors currently only carry issues, so submission errors need explicit index/id without broad error swallowing.
- `apps/server/src/mcp/tools/register-tools.ts:89,264` — actor uses actual hostName/session; registerTool parses, authorizes actual scopes and wraps audit. Register canonical command result via data projection and changeSetCommandToolNames so snapshot preparation runs outside enclosing audit UoW and protected submission is enabled.
- `apps/server/src/application/descriptors.ts`; `scripts/{mcp-tool-metadata.json,capability-operation-coverage.mjs,generate-capability-manifest.mjs}` — explicit descriptor and lifecycle classification; authored metadata drives generated manifest, definitions/docs. Regenerate and test parity.
- Tests: `apps/server/src/mcp/tools/{tool-call-audit,register-tools}.test.ts`, `apps/server/src/mcp/http.test.ts`, contracts schema tests and core resolution tests are patterns. Add focused submission acceptance with real temporary SQLite and actual `/api/mcp/call` + initialized `/mcp` SDK. Graph tools unavailable; source inspected directly and independent investigation confirmed read-only supply/ownership boundaries.
- Read-only constraints: Epic4 context/preparation, Story4.8 plan, Story4.7 completed continuity, source proposal builders, user data and orchestrator ledgers. Global ~/.claude/CLAUDE.md and AGENTS/.cursor/OpenWolf rules apply.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/mcp/{tools,tool-inputs}.ts` and focused contract tests — strict submission request and canonical response; shared operation/schema metadata/defaults and indexed errors.
- [x] `apps/server/src/application/changeset/submit-changeset.use-cases.ts` and minimal `mcp/tools/project-scopes.ts` changes — actor-required full read-only sequential validation, indexed owner checks, one command persistence and reuse executor. Keep lifecycle identity server-owned and source content inline.
- [x] `apps/server/src/{application/descriptors,mcp/tools/register-tools}.ts`, authored metadata/classification and generated capability/tool/docs artifacts — register only required submission tool, protected admission, canonical result and audit integration.
- [x] `apps/server/src/mcp/tools/submit-changeset.test.ts` (split fixtures if necessary), contract tests — cover every matrix row, both actual transports, 200-Card protected/default cuts, metadata, identity, source import/link, all invalid refs, foreign alias spoofing, flag/access/approval behavior, later conflict and audit rollback. Assert exact durable counts and snapshot/live boundaries.

**Acceptance Criteria:**

- Given a valid 200-Card hierarchical cut plus supporting operations, when either actual Agent transport submits it, then exactly one ChangeSet retains validated metadata and actual host/session, and default apply uses the executor.
- Given protection or explicit apply=false, when valid cut is submitted, then one proposal returns id/preview reference with no domain rows/files/snapshot.
- Given an inline source import and dependent typed locator links, when protected cut is submitted and subsequently approved/applied, then simulated validation and actual application agree without preliminary source writes.
- Given invalid/forward/duplicate references or foreign aliases, when submitted, then indexed rejection leaves no ChangeSet or partial domain effect; strict actor claims cannot impersonate an approver.
- Given stored proposal state drift, when approved application runs, then the existing atomic conflict lifecycle refuses stale writes; source generators remain proposal-only.
- Given parity and successful/failing calls, when registry/docs checks and durable audit assertions run, then all public surfaces agree and one audited call remains consistent with atomic application.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass

- verdicts: 14 findings — high 0, medium 8, low 0, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: unused shared evidence/context rejects valid overrides — one submissionOperations helper now computes effective metadata for authorization and persistence; both transports prove distinct/empty sources and explicit context override inaccessible shared defaults.
  - `[medium]` `[patch]` Blind: shared reference failures lack operation diagnostics — scope only the supplied Project before effective operations; inherited evidence/context failure now identifies exact index 1 and operation id in both transports.
  - `[false]` `[reject]` Blind: later source preparation error can mask earlier invalid operation — source preparation must precede pure simulation; intent/plan requires sequential dependency resolution and identifying an offending index, not selecting the earliest among several independent invalid inputs. No partial storage/effects occur.
  - `[false]` `[reject]` Blind: generic sync bookkeeping bypasses disabled GitHub — shared catalog submission is local, truthfully attributed mcp and never calls credentials/providers; the GitHub switch forbids provider contact. Existing local GitHub-link commands likewise use write permission. No new remote authorization boundary is demonstrated or required by this story.
  - `[medium]` `[patch]` Blind: metadata tests omit explicit sources/context precedence — both actual transports now assert explicit note/empty arrays and context overrides in returned durable operations, plus rejection of inherited invalid defaults.
  - `[medium]` `[patch]` Blind: invalid tests accept arbitrary index/id — every structural/schema/alias/source case now asserts the exact offending index/id, including second-operation duplicate/inherited failures.
  - `[medium]` `[patch]` Blind: selectors/upserts lack transport coverage — both transports cover id/local/external targets, selector precedence, foreign/unknown targets and repeated publications resulting in one referenced entity.
  - `[medium]` `[patch]` Edge: ignored entityId rejects an explicit authorized selector — scope checks now honor selector precedence while retaining upsert creation-local checks; actual id/local/external acceptance and foreign target rejection pass.
  - `[false]` `[reject]` Intent: proposal-only interpretation differs from default application — Story4.8 accepted detail plan and epic context explicitly set default apply=true, and protection/apply=false retain proposals. Both transports exercise these exact expectations.
  - `[false]` `[reject]` Intent: actual autonomous planning could be implied by Agent submission — story requires accepting authored cuts with actual host/session attribution, not an autonomous planning engine; SDK/HTTP requests prove the outer submission surface without claiming agent composition or product demand.
  - `[false]` `[reject]` Intent: runtime diff cannot establish skill execution — parent executed renderer exactly once, followed its snapshot workflow, and records fresh verification/review evidence here; runtime tests are not used to claim development orchestration.
  - `[false]` `[reject]` Intent: diff alone cannot prove historical non-reversion of tracking — user restriction was applied throughout all mutations/staging; clean initial status and final ledger diff/index checks independently confirm no session ledger edit/stage/revert. Sprint rows were never verification evidence.
  - `[medium]` `[patch]` Verification: explicit operation evidence replacement has a regression gap — explicit distinct sources and an explicit empty array survive shared sources on both transports; recorded assertions use returned stored ChangeSet operations.
  - `[medium]` `[patch]` Parent: initial source proposal used only an existing Card — composed acceptance now includes import, a new local Card and dependent locator link in one protected cut; before approval zero new domain rows, after human approval/application one new Card owns the chunk link.

Six scoped medium patch groups: effective-metadata authorization, selector precedence, metadata evidence coverage, exact diagnostics, selector/publication coverage and initial-publication composition. No deferrals or unresolved findings. No intent-contract edits or spec re-derivation.

### 2026-10-12 — Review pass (follow-up)

- verdicts: 26 findings — high 0, medium 3, low 11, false 12, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: validation repeated across tool parse, use case and changeSet parse — efficiency only, no named harm; fix would remove a defensive parse at the application boundary.
  - `[false]` `[reject]` Blind: scope resolver reads unparsed SubmitChangeSet input — registerTool parses with the strict schema before authorization and the use case parses before calling the resolver.
  - `[low]` `[reject]` Blind: SubmitChangeSet name branches in shared resolver — Code Map prescribes minimal adaptation of project-scopes; the catch is limited to DomainError and rethrows others.
  - `[medium]` `[patch]` Blind: `op !== "import"` skip lacks pinned authorization — grouped with the Edge and Verification rows; foreign persisted source-document alias on import is now covered by an indexed rejection test on both transports.
  - `[false]` `[reject]` Blind: failed success-audit leaves a proposal — the matrix mandates failure audit retained without applied effects; stored proposal is the existing executor lifecycle.
  - `[false]` `[reject]` Blind: no operation-count bound — intent forbids an arbitrary cap; 202 operations pass.
  - `[false]` `[reject]` Blind: silent conflict-message fallback — ConflictEntry is a union with message-less version conflicts, so the check is type narrowing; source conflicts always carry a message.
  - `[low]` `[reject]` Blind: scope errors before disabled-agent check — only describes the caller's own submitted Project operations; no data leak shown, fix reorders guards.
  - `[low]` `[reject]` Blind: inconsistent metadata merge semantics — precedence (explicit operation value wins) is asserted by the metadata transport test; no divergent caller named.
  - `[low]` `[reject]` Blind: thin docs — generated tool docs are derived from authored metadata; markdown documentation is not a deliverable.
  - `[false]` `[reject]` Blind: coverage gate bypassed — the changeset-lifecycle classification is explicit and parity tests pass on manifest, definitions and docs.
  - `[low]` `[reject]` Blind: inline randomUUID/clock — matches sibling use cases; no caller affected.
  - `[low]` `[reject]` Blind: test hygiene — style only; assertions are exact.
  - `[false]` `[reject]` Blind: apply advertised as required — http.test.ts already asserts every advertised inputSchema equals `z.toJSONSchema(schema, { io: "input" })`.
  - `[low]` `[reject]` Edge: empty operations accepted — changeSetSchema permits it for all ChangeSets; harmless no-op and the fix adds a guard.
  - `[false]` `[reject]` Edge: human-only operation kinds reachable — intent shares the full typed catalog and the executor/protection gates still apply.
  - `[medium]` `[patch]` Edge: import ops dropped from entity scope for stored ChangeSets — see grouped patch; Submit rejects foreign import aliases before storage, so stored import ops are own-Project.
  - `[false]` `[reject]` Edge: validation outside unit of work allows stale or duplicate proposals — executor revalidates at apply/approve; drift is the existing conflict lifecycle per the matrix.
  - `[low]` `[reject]` Edge: inline-content message names Agent for any actor — wording only.
  - `[medium]` `[patch]` Verification: foreign source-document import alias untested — added `rejects an import aliasing a foreign persisted source document` on http and sdk; asserts index 0, operationId and zero ChangeSets.
  - `[false]` `[reject]` Verification: message fallback branch unasserted — unreachable for source conflicts (see above).
  - `[low]` `[reject]` Verification: whitespace-only inline content untested — trivial trim, no named harm.
  - `[false]` `[reject]` Intent: stdio not exercised — stdio server is built from the same generated storyMapperMcpTools definitions; the two actual call surfaces (/api/mcp/call and /mcp SDK) share the registry.
  - `[low]` `[reject]` Intent: application imports MCP scope resolver — prescribed by the Code Map, existing ApproveChangeSet/ApplyChangeSet use the same resolver.
  - `[false]` `[reject]` Intent: proposal-only source generators untested — code untouched, existing tests cover it.
  - `[false]` `[reject]` Intent: parity established by editing checkers — checkers classify a new tool; manifest, definitions and docs are regenerated and compared.

Patched: three rows, one root cause (missing authorization test for imports), no code change. No deferrals.

### 2026-10-12 — Review pass (second follow-up)
- verdicts: 27 findings — high 0, medium 1, low 13, false 13, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: non-import sourceDocument op without `after` throws TypeError — change-operations.ts:27 allows only `op: import` with required `after` for entity sourceDocument; no such operation can reach the check.
  - `[low]` `[reject]` Blind: disabled-access check after scope resolution — carried; caller's own submitted Project, no leak shown.
  - `[low]` `[reject]` Blind: application imports MCP scope resolver, claimed cycle — carried (Code Map prescribed, Approve/Apply use it); no cycle, submission-operations imports only contract types.
  - `[low]` `[reject]` Blind: input parsed and merged twice — carried efficiency-only; no named harm.
  - `[low]` `[reject]` Blind: SubmitChangeSet branch and ZodError instanceof in registerTool — carried; Code Map prescribes it, tests prove indexed errors with the shared zod copy.
  - `[false]` `[reject]` Blind: entityScopeKey/storyMapId allow-list changes untested for Approve/Apply — carried repair-review patch; both transports list, approve, apply and reread scoped Roadmap/customization proposals.
  - `[low]` `[reject]` Blind: schema reads `changeOperationSchema.options[0].shape` and lacks describe/docs — typecheck fails if option 0 loses the fields; documentation is not a deliverable; fix adds a contract refactor.
  - `[false]` `[reject]` Blind: advertised `apply` required — carried; http.test.ts asserts advertised inputSchema equals `io: "input"` JSON schema.
  - `[false]` `[reject]` Blind: no operation count bound or empty-array test — carried; intent forbids an arbitrary cap, 202 operations pass.
  - `[false]` `[reject]` Blind: conflict message fallback — carried; ConflictEntry union narrowing, source conflicts always carry a message.
  - `[low]` `[reject]` Blind: hard-coded submitChangeSet in capability-surface.mjs — lifecycle tools have no operation members by design; one explicit classification, no demonstrated drift.
  - `[false]` `[reject]` Blind: unrelated server.test.ts edit — it is the requested deterministic asset-comparison timeout repair (spec repair input).
  - `[low]` `[reject]` Blind: dense test file, magic arrays — carried style only; assertions are exact.
  - `[false]` `[reject]` Blind: human actor, concurrent edit and per-operation field loss untested — requireActor gates the actor; concurrent drift is the pre-existing executor write gate; the merge spreads `...operation` so reason/baseVersion survive.
  - `[low]` `[reject]` Edge: empty operations accepted — carried; harmless no-op shared by all ChangeSets.
  - `[medium]` `[patch]` Edge: import skip drops entityId scope for stored ChangeSets — carried; foreign import alias rejection test already added on http and sdk, no code change.
  - `[low]` `[reject]` Edge: later ZodErrors mapped to request validation — mapped errors stay validation with exact operation index; inherited-metadata failures are intentionally indexed; no wrong-class outcome shown.
  - `[low]` `[reject]` Edge: raw operationId echoed — client's own input returned to the same client and already audited.
  - `[low]` `[reject]` Edge: only first source conflict reported — spec requires identifying an offending index and id, not all of them.
  - `[false]` `[reject]` Edge: createdIds untyped set — scope admission only gates ownership; resolveOperations rejects wrong-kind references with OperationResolutionError index and id, mapped to indexed details.
  - `[false]` `[reject]` Edge: failed success audit leaves a stored proposal — carried; matrix mandates failure audit without applied effects, rollback test asserts it.
  - `[low]` `[reject]` Verification: whitespace-only inline content untested — carried; trivial trim, no named harm.
  - `[false]` `[reject]` Intent: stdio not exercised — carried; stdio is built from the same generated definitions as the two exercised surfaces.
  - `[low]` `[reject]` Intent: stored drift asserted at application layer — the conflict lifecycle is the unchanged executor; fix would duplicate existing ApplyChangeSet tool coverage.
  - `[false]` `[reject]` Intent: lifecycle-exempt manifest registration bypasses coverage — carried; checkers classify the tool and parity compares regenerated artifacts.
  - `[false]` `[reject]` Intent: edits outside intent rows — server.test.ts is the requested repair; io:"input" follows the `.default(true)` schema.
  - `[false]` `[reject]` Intent: no-cap claim shown at one size — carried; 202 operations pass, intent requires no cap rather than a boundary test.

Patched: none new (one carried row already covered by an existing test). No deferrals.

## Design Notes

Full pre-storage resolver validates currently submitted baselines as well as structure. It does not erase baseline fields or catch conflict and continue a partially simulated batch. State drift after submission still belongs to the executor. Top-level context/evidence/rationale may supply defaults to operations; operation-specific values win and the validated resulting operations remain immutable. ChangeSet.source stays server-owned `mcp`; typed source evidence carries authored source information. The input accepts no actor, id, status, approval, execution or schema-version impersonation fields. Existing-source import metadata paths are not authorization to read a host file: missing inlineContent always refuses before preparation.

### 2026-10-12 — Deterministic repair review

- verdicts: 13 findings — high 0, medium 6, low 2, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: foreign Roadmap child aliases evade persisted owners — existing resolver mappings now cover column/swimlane; each foreign alias reproduces indexed refusal on both transports.
  - `[false]` `[reject]` Blind: import skip changes stored proposal authorization without coverage — carried prior import triage; protected inline proposal is approved and applied by existing acceptance, and full source-generator/command suites pass. No bypass or failing existing generator was identified.
  - `[false]` `[reject]` Blind: direct application schema errors differ from tool diagnostics — application takes typed SubmitChangeSetInput and raises typed validation errors through existing outer adapter normalization; the public MCP tool retains indexed schema diagnostics. No direct public caller or promised inner error envelope identified.
  - `[medium]` `[patch]` Blind: whole-cut relationship assertions only count Cards — now assert exact parent hierarchy, Release assignments, Persona relation and note link.
  - `[medium]` `[patch]` Blind: success live check accepts unrelated events — now assert one domain transaction, actual proposer actor, all200 Card entities plus Release/Persona versions.
  - `[low]` `[reject]` Blind: immediate inline-source path lacks a submission-specific case — shared prepared import executor already has command/source acceptance; protected composition exercises submission preparation and later actual execution. Additional parallel fixture paths are unnecessary for the demonstrated timeout/scope defects.
  - `[low]` `[reject]` Blind: SDK disabled/stale baseline cases duplicate only HTTP coverage — both call surfaces use the same registration authorization and executor; existing SDK authority/approval tests pass. Extra repeated scenario wiring adds complexity without a demonstrated transport divergence.
  - `[medium]` `[patch]` Blind: failed audit count could accept success — rollback now asserts error outcome/errorId, tool id and actual transport actor.
  - `[false]` `[reject]` Blind: interim STATUS done differs from in-review spec — review runs intentionally use in-review until all gates finish; final handoff is refreshed at completion, not used as verification.
  - `[false]` `[reject]` Blind: repair result absent from unfinished review spec — workflow writes fresh Auto Run Result only after triage and final gates; original deterministic failure stays referenced.
  - `[medium]` `[patch]` Edge: foreign aliases survive creation admission — reproduced all four Roadmap child/composite map target types on both transports; mapped actual persisted owners. Workflow Status/Story Template portion disproved by existing scopeAliases mappings.
  - `[medium]` `[patch]` Edge: earlier Story Map aliases fail scoped roadmap/customization — added prior-created storyMapId support with persisted owners first; both transport regressions now list, approve, apply and reread scoped proposals.
  - `[false]` `[reject]` Intent: stdio-inclusive transport reading lacks direct cut coverage — carried prior transport triage; intended actual HTTP call and initialized SDK surfaces exercise shared registry, while stdio forwarding/inventory/schema suites also pass. No autonomous composition or UI flow is required by the frozen contract.

Verification-gap lens reported no gaps. Three available reviewer slots executed all four lenses, with verification and descriptive intent auditing combined in one reviewer. Six medium rows group into five repairs (owner mappings, backward Map aliases, relationships, live payload, audit outcome). Ten scope regressions failed before production fixes; focused87-test acceptance passes after fixes. No intent-contract edit, spec re-derivation or deferred item.

## Verification

Use Node24.17.0 from `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` (default shell currently Node22). Commands with that directory prepended to PATH:

- `corepack pnpm --filter @storymapper/contracts test` — all schemas pass.
- `corepack pnpm --filter @storymapper/server test` — full server suites and submission matrix pass, no skip substitutes.
- `corepack pnpm test` — configured script/package suite passes; retain failures and repair scoped causes.
- `node scripts/verify.mjs` — Git/source hygiene, parity, workspace typecheck/build pass. Portable setup fixtures require new source files tracked in the index; stage explicit story paths only, never orchestrator ledgers. Staging authorizes no commit.
- `git diff --check` and `git diff --cached --check` — whitespace clean.

No live GitHub/browser acceptance is required by this submission story; transport/SQLite tests must provide actual outer-surface evidence.

## Changelog

- Version 1 (2026-10-12): Fresh source-verified plan with indexed pre-storage validation, actual owner/actor boundaries and explicit inline source policy.

- Version 2 (2026-10-12): Completed implementation, four-layer review, scoped metadata/selector repairs and fresh serial verification; preserved orchestrator tracking.


- Version 3 (2026-10-12): Repaired deterministic asset comparison timeout and independently reproduced/repaired submission scope findings; all prior evidence retained.

## Deterministic verification repair input — 2026-10-12

Resume the existing implementation and repair the full configured test failure recorded in `.bmad-loop/runs/20261012-010242-7172/feedback/4-8-an-agent-submits-its-own-changeset-2.md`: `apps/server/src/server.test.ts` production asset byte/MIME test timed out at 5000ms during `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH corepack pnpm test`. Investigate and repair the cause without changing the frozen intent contract or weakening asset assertions. Prior done claims do not establish current verification. Preserve all orchestrator ledger changes; never write, stage or revert them.

## Auto Run Result

Status: done

- Summary: `SubmitChangeSet` accepts a whole cut (shared operations, optional shared context/sources/rationale, apply default true), validates it sequentially against actual persisted owners before storage, stores exactly one ChangeSet with the actual transport actor, and reuses the existing command/executor.
- Files changed: contracts (`mcp/tools.ts`, `mcp/tool-inputs.ts`, tests) hold the strict schema; `submit-changeset.use-cases.ts` and `submission-operations.ts` implement validation, metadata merge and persistence; `project-scopes.ts` adds indexed sequential owner checks; `register-tools.ts`, `descriptors.ts`, capability manifest, tool definitions, scripts and `docs/mcp-tools.md` register and document the tool; `submit-changeset.test.ts` and `complete-surface.test.ts` cover the matrix; `server.test.ts` carries the deterministic asset-comparison repair.
- Review (second follow-up pass, four lenses): 27 findings, high 0, medium 1, low 13, false 13. Patches applied this pass: none (the one medium row is carried and already covered by an existing test). Deferred: none. All other findings were rejected with the recorded reasons in the Review Triage Log.
- Follow-up review recommended: false (no high patched on this follow-up pass).
- Verification (Node 24.17.0): contracts suite 120 passed; `submit-changeset.test.ts` and `complete-surface.test.ts` 57 passed. `git diff --check` flagged only a trailing blank line in this spec, now removed. The full server suite, `corepack pnpm test` and `node scripts/verify.mjs` were not re-run, because this pass changed no code; their last results are in the earlier passes.
- Commit: none created. The intent contract forbids commit and push, and `sprint-status.yaml` stays orchestrator-owned and dirty, so the working copy is intentionally left uncommitted for the orchestrator.
- Residual risks: stdio transport is covered only through the shared generated definitions; no arbitrary operation-count bound by design.
