---
title: Record every tool call
type: feature
created: 2026-10-08
status: done
baseline_revision: b2d4c411b67c53d2f0adbc33d0cedc70448ab515
review_loop_iteration: 0
followup_review_recommended: false
context: [AGENTS.md]
warnings: [oversized]
deferred:
  - summary: >-
      Internal MCP error IDs lack retained diagnostic cause.
    evidence: |-
      Baseline register-tools.invokeTool already converted unexpected exceptions with asDomainError; replyWithError skips logging DomainError. The current generic audited envelope preserves that pre-existing limitation. A future safe correlated diagnostic must avoid raw secrets.
    location: >-
      apps/server/src/application/errors.ts
    severity: medium
  - summary: >-
      Global unscoped audit sorting at substantial history sizes remains unmeasured.
    evidence: |-
      All new indexes start with project_id; old unscoped listActivity also sorted the full history without a global timestamp index. Correctness is covered, but substantial-history query plans and latency are needed to establish a material bad outcome.
    location: >-
      packages/db/src/repositories/audit-repository.ts
    severity: medium (unverified)
  - summary: >-
      First-page cost with very large affected-object arrays remains unmeasured.
    evidence: |-
      The contract bounds event count and deliberately retains relevant IDs. Current actual-browser and strict read benchmarks pass; measuring twenty large-result calls against representative large maps would settle whether metadata size causes a material rendering failure. Do not truncate required IDs on speculation.
    location: >-
      apps/server/src/mcp/tools/audit-tool-call.ts
    severity: medium (unverified)
  - summary: >-
      Restore recovery still reads full internal Project history before selecting restore records.
    evidence: |-
      The baseline imperative recovery reader already fetched all Project Activity and parsed complete snapshots; the dedicated endpoint reduces returned evidence to validated restore records. A repository-only projection can optimize that pre-existing processing cost later.
    location: >-
      apps/server/src/application/restore/restore.use-cases.ts
    severity: low
  - summary: >-
      Markdown audit identities can contain markup and newlines.
    evidence: |-
      Baseline buildAuditMarkdown already interpolated actor and session text without escaping, including initialized MCP host identity. An initialization name containing a newline and Markdown can forge apparent Markdown rows; JSON evidence remains structured. This is pre-existing formatter behavior.
    location: >-
      packages/core/src/publishing/export-formatters.ts
    severity: medium
---

Reproducing statement: Execute bmad-build-auto for Story 3.8, recording all agent calls, adding filterable paged audit and safe exports, and measuring the specified performance budgets. Never write, stage or revert orchestrator-owned sprint-status.yaml or infer verification from its rows. Date: 2026-10-09. Version: 4. Changelog: Merged incoming authorization/source-visibility repairs and the user-approved diagnostic-only relative latency criterion; retained historical execution evidence.

<intent-contract>

## Intent

**Problem:** Current MCP audit skips calls without a Project and refusals before invocation. The audit screen reads every row without filters or paging, and JSON exports expose complete entity snapshots.

**Approach:** Record one metadata-only `tool_call` Activity Event for every completed call on both agent surfaces, including reads and refusals. Provide bounded, filtered audit pages and JSON/Markdown summaries, and measure the burst and rendering budgets.

## Boundaries & Constraints

**Always:** Use shared contracts, actor-aware application/UoW, repository-only SQL and the existing single writer. Preserve actual host/session attribution and existing safety/approval rules. Record tool, SHA-256 input/output hashes, outcome `ok|rejected|error`, affected IDs and a safe rejection reason. Hash the shared application result or typed error envelope before transport wrapping; hash raw tool arguments before validation. Cover unknown names, invalid tool arguments, missing targets, disabled/protected and scope refusals as well as successful reads/writes. Record once, including multi-Project calls, with no arbitrary Project attribution. Activity Project scope may be absent for runtime/unknown-target calls; known actual Project owners remain authoritative. Human Project audit lists/exports include that Project's rows and explicitly labeled runtime calls; agents must not gain other Projects' or runtime audit metadata. Apply visibility restrictions before paging. Public summaries omit arbitrary before/after, full inputs/outputs, credentials, local paths and raw exception messages. Preserve full internal Activity history for restore and ownership checks. Follow AD-9: prototype schema is changed in place, fresh development databases are disposable, old prototype Projects are not migrated. Update companion restore/archive logic: retain global audit evidence during restore without creating fictional Projects; exclude global rows from portable Project archives. Keep export self-audit and checklist completion atomic.

**Never:** Touch sprint-status.yaml in any manner, user databases, credentials, or unrelated ledger entries; add SaaS, telemetry, LLM, new writer, silent audit failure, runtime audit enable/disable settings, compatibility table rebuilds or Epic 4 executor work. Do not add architecture beyond what this story needs. Workflow documentation and a concise proposed ADR for nullable runtime Activity scope are authorized by this invoked skill and global ADR policy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Successful call | Global/scoped reads, writes, both agent transports | Exactly one persisted tool_call; actual identity, both hashes, ok, relevant input/result object IDs | Audit persistence failure is explicit |
| Refused call | Invalid arguments, unknown/human-only tool, missing target, mismatched scope, disabled/protected | Exactly one tool_call with rejected outcome, output hash and safe typed reason; no domain mutation | Shared typed refusal, no raw payload in audit |
| Internal failure | Handler throws sensitive/unexpected error | One error tool_call with hash of generic correlated envelope; no secret/raw exception | Shared internal error, correlation retained |
| Paged audit | 1,000 calls; actor/tool filters; identical timestamps; inaccessible Projects | Newest-first bounded matching pages with stable cursor; no duplicates/omissions; filters reset pagination | Typed invalid query; loading/error/retry preserve loaded evidence |
| Exports | Tool calls, GitHub writes, agent writes with planted payload secrets | JSON/Markdown include actor/time/objects and tool metadata; exclude secrets/full payloads/local paths; own export event present | Export failure rolls back self-audit/completion |
| Lifecycle | Global calls before/after actual restore and single-Project archive | Restore retains newer evidence as undone without fake Project; archive contains only selected Project history | Existing incompatible-schema refusals remain explicit |
| Read burst | Warm identical 100-call read workload within one second | One Activity INSERT per call and audited 100-call burst below one second; relative overhead is diagnostic | Report method and actual timings; no fabricated evidence |

</intent-contract>

## Code Map

- `apps/server/src/mcp/tools/register-tools.ts:252-324` parses and resolves scopes before audit, duplicates refusal recording, skips absent Project; existing hash/result resolvers are incomplete. Shared dispatch must own final recording outside all validation.
- `packages/mcp/src/tool-handlers/registry.ts`, `transports/server.ts:24-42` lookup/schema failures currently precede backend. Keep discovery schemas and route raw calls through the audited boundary; no private SDK overrides. `apps/server/src/http/routes/infrastructure-routes.ts:37` HTTP restore/envelope refusals bypass registry today. `apps/server/src/mcp/http.ts` owns real host/session.
- `packages/db/src/repositories/audit-repository.ts` has full internal ascending list and one-insert logger; preserve internal consumers. Add bounded public query with pre-limit actor/tool/Project visibility and stable timestamp+ID cursor; add matching indexes in `schema/tables.ts` and `connection.ts` fresh DDL.
- `packages/contracts/src/schemas/domain.ts:632`, `packages/core/src/audit/events.ts`, `packages/db/src/repositories/row-mappers.ts` require Project today. `packages/db/src/restore-history.ts` must skip historical Project creation for null scope; `packages/db/src/snapshot.ts` must delete null global events from Project archives. `apps/server/src/mcp/tools/project-scopes.ts:130` historical deletion ownership must guard absent scope. AD-9 and current fingerprints disallow implicit prototype compatibility.
- `packages/contracts/src/schemas/application-responses.ts:37`, `packages/contracts/src/http.ts`, `packages/contracts/src/mcp/tool-inputs.ts:60` need shared filter/cursor/limit contracts; `apps/server/src/application/customization/customization.use-cases.ts` and `apps/server/src/http/routes/customization-routes.ts` expose Activity; `apps/server/src/mcp/tools/register-customization-tools.ts:11` currently filters after querying, unsuitable for paging.
- `packages/core/src/publishing/export-files.ts:15`, `export-formatters.ts:106`, `apps/server/src/application/export/export.use-cases.ts:19` export raw project/settings/events; preserve export atomicity and own event but use safe shared projection.
- `apps/web/src/app/routes/audit.tsx`, `app/api.ts:211`, `ui-strings/index.ts`: only AuditRoute uses useActivity; currently loads all and slices twenty. Reuse card-history bounded paging pattern, add actor/tool controls and visible identity/outcome/objects/runtime scope without exposing payloads.
- Tests: registry `register-tools.test.ts`, `complete-surface.test.ts`, actual SDK `mcp/http.test.ts` and `stdio-main.test.ts`, application parity, DB getting-started/export and restore/archive suites, core export tests, new audit UI tests. Old `mcp.*` expectations need deliberate updates; discovery remains contract-equal. 105-capability manifests/docs are generated, regenerate when schema references change.

## Tasks & Acceptance

Additional source dependency: `apps/web/src/features/restore-points/restore-result.ts` uses imperative `api.readActivity`, independently of useActivity, to reconcile a lost restore response. Preserve that behavior with a narrowly typed human-only `GET /api/human/projects/:projectId/restore-activity` in `apps/server/src/application/restore/restore.use-cases.ts` and `apps/server/src/http/routes/restore-points.ts`, returning only restore event identity/undone state and validated RestoreProjectResult data. Update recovery API/UI consumers and descriptor parity; audit summaries/exports still contain no full payloads.

**Execution:**
- [x] Contracts/domain/core audit and DB schema/connection/row mapping/restore-history/snapshot/project-scopes paths above — represent nullable runtime scope and safe metadata, retain lifecycle/privacy invariants; record rationale in `docs/adr/0001-runtime-tool-call-activity.md` with proposed status.
- [x] Registry/transport/server MCP and HTTP infrastructure paths above — wrap every call before validation/lookup, remove duplicate recorder branches, finalize one event with outcome/hashes/affected IDs using existing UoW; preserve safe typed outer responses.
- [x] DB audit repository, shared page contracts, customization application/HTTP/MCP paths — implement bounded visibility-aware filter/paging and safe summaries; preserve internal raw history method.
- [x] Core export formatters/files and application export path — summarize both formats, include Project plus allowed runtime human evidence, preserve own-event/atomicity tests and agent safety.
- [x] Web audit route/API/strings — filter actor/tool, load bounded pages, display identity/objects/outcome/runtime scope and accessible loading/error/retry states.
- [x] Relevant tests and performance evidence — exercise every matrix row on actual surfaces, exact inserts, safe export redaction, nullable restore/archive and first-page rendering.

**Acceptance Criteria:**
- Given any completed call on `/mcp` or `/api/mcp/call`, when audit is read after reopening SQLite, then a single tool_call includes actual host/session, tool, both hashes, outcome and affected IDs; a rejected call includes its safe reason.
- Given the audit area, when actor type and tool name are selected and additional pages loaded, then only matching visible events appear in deterministic order and changing filters resets pages.
- Given JSON or Markdown audit export, when exported, then tool calls, GitHub writes and agent writes include actor/time/affected objects without secrets or full payloads.
- Given 1,000 recorded calls, when the browser loads the first audit page, then it renders within 300 ms; capture actual query-to-paint evidence, distinct from a unit-test proxy.
- Given 100 reads within one second, when recorded, then each performs one audit insert only and the audited burst completes within one second; capture warm equivalent workloads and diagnostic relative timing/insert counts.

## Spec Change Log

- 2026-10-09 merge: Honor incoming user-approved relative-latency relaxation. Preserve diagnostic paired timings, exactly100 audit INSERTs, per-burst<1s and durable completion; historical strict-budget tasks/reviews below describe the earlier requirement. Retain stricter dependent-Project MCP refusal while adding Agent-only filtering to common application reads/exports.

- 2026-10-08: Investigation during implementation found the imperative restore recovery reader. Added a dedicated typed human-only recovery read so safe audit summaries do not break lost-response reconciliation; preserve existing restore outcome tests.
- 2026-10-08 review pass 1: The representative in-process expensive-read benchmark concealed a real ingress budget failure. Five warmed alternating pairs of 100 simultaneous calls on each actual TCP surface show cheap-read overhead of 47.73–74.14%; replacing only the insert builder still leaves 24.66–49.91%. Strengthen verification to include real concurrent ListProjects/GetSafetySettings calls on both agent surfaces, exact inserts, persistence and the original strict budgets. Re-derive from baseline with the positive implementation preserved in `review-3-8-pass-1-preserved.patch`. KEEP the shared contracts, metadata-only hashes/outcomes, actor/session attribution, visibility-before-limit paging, safe exports, nullable restore/archive handling, dedicated typed restore recovery, complete discovery/manifest parity, permanent functional tests and recorded browser evidence. Avoid a known-bad completion based solely on expensive registry reads. No performance limit may be changed or bypassed.

### Repair tasks for re-derivation

- Restore the positive implementation from `review-3-8-pass-1-preserved.patch` as the starting point, then implement these repairs. The patch contains only this story's source/test/generated-document paths and excludes the spec, OpenWolf and sprint status. Preserve all KEEP constraints above.
- `apps/server/src/mcp/tools/audit-tool-call.ts`: derive audit IDs/scope only from declared tool fields. Use shared per-field parsing to strip unsupported nested fields; malformed declared ID values may still establish only a proved owner. Hash original raw input. Unrecognized tool names use a fixed safe placeholder instead of retaining arbitrary payload text; fixed human-only restore names remain recognizable. Add real ignored-ID/unsupported-scope/unknown-name redaction regressions.
- `apps/server/src/mcp/http.ts`: use the public SDK `specTypeSchemas.CallToolRequest` validation at the existing transport interception seam, including task and meta fields; every malformed envelope refusal enters the same audited registry. Cover missing/null/numeric names and malformed task/meta on real initialized SDK sessions, with exact event count and response hash.
- `apps/server/src/mcp/tools/tool-call-audit.test.ts`: verify actual HTTP combined actor/tool/limit/cursor filtering and malformed-query errors; traverse an unscoped agent query with dense newer disabled/runtime rows without shortened pages, missing visible evidence or leaks.
- `apps/web/src/app/api.ts`: cancel the old exact activity query before trimming cached pages, preventing outstanding next-page completions from repopulating a reset filter. Add a deferred-fetch regression that switches away and back.
- `apps/web/src/app/routes/audit.tsx`, `apps/web/src/ui-strings/index.ts`: validate tool-filter input against the shared query contract before applying it and show a field error while retaining loaded evidence. Wrap hashes/session/object IDs in narrow panels with a direct style correction. Verify invalid filters and narrow layout.
- `packages/db/src/repositories/audit-repository.ts`: include the fixed mcpTool entity type in the tool filter so the matching composite index can serve selective pages. Preserve the bounded pre-limit visibility query.
- Performance implementation: profiling already rules out a prepared insert alone as sufficient. Reuse resolved successful-call scopes rather than repeating raw ownership discovery; derive refusal scope from recognized fields. Remove unnecessary ORM work for the new audit insert if measured useful. If needed, coalesce audit records of concurrent calls through the SAME existing actor-aware UnitOfWork/write gate, retaining one INSERT per call and resolving each caller only after durable commit. This is no new writer/process/persistence mechanism. Group only identical registry actor/session contexts; every persistence failure remains explicit to all affected callers. No silent flush, timer deadline, PRAGMA/durability weakening, fake baseline overhead or unawaited background completion. Existing request draining must cover pending audit commits; add meaningful failure/drain tests if coalescing is introduced. Measure before claiming the budget met.
- `apps/server/src/mcp/tools/tool-call-performance.test.ts` and optional focused helper: retain the representative expensive-read benchmark AND add real TCP HTTP and SDK concurrent cheap-read budget tests. Warm identical handlers/connection patterns, alternate five pairs, disable only observer for baseline, report every pair/median, assert exactly100 inserts/no other SQLite changes, per-burst<1s and overhead<20%. Separate an aggregate harness timeout from these strict assertions. Clean all disposable ports/DB handles. If any budget fails, report unfinished rather than claim acceptance.

## Review Triage Log

### 2026-10-08 — Review pass 1
- verdicts: 19 findings — high 1, medium 13, low 1, false 4, maybe-false 0
- findings (in reporting order):
  - `[medium]` `[patch]` Human HTTP filters/cursors lack route-level coverage — filed verification-gap evidence is accepted; add combined real-route paging/error assertions after re-derivation. Moot in this pass because bad_spec takes precedence.
  - `[medium]` `[patch]` Unscoped agent visibility-before-limit lacks dense competing rows — filed evidence is accepted; add full traversal with newer disabled/runtime rows. Moot until re-derivation.
  - `[medium]` `[patch]` Malformed SDK names lack interception coverage — filed evidence is accepted; add missing/null/numeric name cases. Moot until re-derivation.
  - `[medium]` `[patch]` Malformed task metadata bypasses audited dispatch — installed SDK setRequestHandler validates the complete negotiated envelope before the callback; the current wrapper checks only name/arguments. Public SDK schema parsing rejects task/meta, demonstrating the missed seam; repair at the same seam after re-derivation.
  - `[medium]` `[patch]` Missing target plus unsupported claimed Project fabricates attribution — source trusts raw projectId after ignoring unresolved targets; GetStoryMapCardDetails does not declare that selector. Restrict to recognized tool fields after re-derivation.
  - `[high]` `[patch]` Unknown names can persist/export arbitrary sensitive text — the regex permits planted-payload-secret and unknown dispatch still records that text. Use a fixed unrecognized-name marker; preserve the raw argument hash. Moot until re-derivation.
  - `[medium]` `[patch]` Ignored raw IDs become affected IDs — ListProjects has an empty input schema, while inputIds scans ignoredId directly. Restrict extraction to recognized fields after re-derivation.
  - `[medium]` `[patch]` Unsupported nested fields fabricate owner scope — ListActivity is strict, but raw discovery recursively scans arbitrary.storyMapId before rejection. Recognized-field projection repairs the same root cause as the preceding ownership findings.
  - `[false]` `[reject]` Outcome schema permits malformed metadata — the proposed malformed shape parses, but every production producer constructs reason for rejected and correlation for error, with no path accepting externally supplied metadata. No reachable bad outcome or divergent caller is established; extra branch constraints would guard hypothetical producer state.
  - `[medium]` `[patch]` In-flight next page repopulates trimmed cache — cleanup only changes data and does not cancel the outstanding TanStack request; its completion can restore old pages. Cancel the exact old query before trimming; add a deferred-fetch regression after re-derivation.
  - `[medium]` `[patch]` Tool index lacks its preceding type predicate — source index is project/type/ID/time and query lacks type, matching the reviewer's EXPLAIN result. Add the fixed mcpTool predicate after re-derivation.
  - `[medium]` `[bad_spec]` Expensive registry-only benchmark hides cheap real-ingress overhead — independently measured actual concurrent100-call HTTP/SDK ListProjects/GetSafetySettings bursts below1s with exactly100 inserts, but 47.73–74.14% overhead. Native prepared insertion alone still fails at24.66–49.91%. Amend performance tasks/method above and re-derive with KEEP constraints; do not relax the intent or budgets.
  - `[medium]` `[patch]` Invalid tool filter creates repeated HTTP400 errors — form applies spaces/overlong names while the shared query rejects them; validate and show a field error after re-derivation.
  - `[low]` `[patch]` Unbroken hashes overflow narrow panels — source has no wrapping on the hash paragraphs and the audit grid uses intrinsic tracks. A direct wrapping style correction is sufficient after re-derivation.
  - `[medium]` `[patch]` Dense inaccessible paging rows remain untested — same missing competing-row coverage as verification-gap finding2; preserve its own row and shared repair.
  - `[false]` `[reject]` Diff alone cannot prove workflow invocation or absence of historical sprint writes — this is a limitation of a diff, not a defect; execution tools record the one renderer invocation, explicit excludes and no sprint mutations. Verification never relies on sprint status.
  - `[false]` `[reject]` Broader ingress refusals lack audit — missing/invalid sessions, initialization and HTTP admission are protocol admission rather than completed admitted tool invocations with actual host/session. Existing admission policy remains; expanding it is not necessary for the completed-call contract.
  - `[false]` `[reject]` Browser timing lacks permanent browser assertions — intent requires actual timing, which was executed and documented using the disposable real-HTTP1000-call fixture; permanent mock tests cover behavior, and scheduling outliers are retained. Lack of a permanent timing test does not invalidate that evidence.
  - `[medium]` `[bad_spec]` Registry latency does not verify endpoint workload — grouped with the confirmed real-ingress budget failure, whose amended verification tasks explicitly target both agent TCP surfaces. Keep all positive implementation; avoid completion based on internal proxies alone.
- Grouping: unsupported ID/scope extraction shares one root cause; the two dense-visibility gaps share one missing test; the two performance entries share one wrong verification workload/surface. Other findings remain separate. Lower patch routes are moot for this pass and are captured in re-derivation tasks rather than silently dropped.
- Platform limitation: all four review lenses reported in this turn. The platform rejected fresh agents after its retained-thread limit; the blind lens was context-free, while edge/gap/intent reused existing agents with their exact reviewer instructions. The fourth launch waited for a concurrency slot. This weakens independence and is retained as a review limitation.

### 2026-10-08 — Review pass 2
- verdicts: 17 findings — high0, medium8, low1, false6, maybe-false2
- findings (edge, blind, intent, then parent reporting order):
  - `[medium]` `[patch]` Deep ignored JSON bypasses recording — 8,000 nested objects parse as valid wire JSON but native JSON.stringify throws before the try. Replaced only the private hashing algorithm with equivalent iterative serialization; actual HTTP/SDK regressions persist/reopen exactly four deep calls. Grouped with blind finding1.
  - `[medium]` `[patch]` Deep arrays bypass recording — parent reproduced native JSON.parse success and stringify RangeError for10,000 levels. Same private hash defect as the preceding row; the iterative helper fixes both shapes without a new public surface or speculative guard.
  - `[false]` `[reject]` Restore-admission refusals lack recording — carried admission verdict from pass1. onRequest rejects before body parsing, runtime admission or tool invocation while the writer is unavailable/restoring; these are not completed admitted application calls. Recording into the replacing database would violate existing drain policy.
  - `[medium]` `[defer]` Error correlation lacks underlying diagnostics — baseline invokeTool/asDomainError already discarded unexpected causes and replyWithError already skipped DomainError logging. Record pre-existing diagnostic limitation; do not add raw secret-bearing logs.
  - `[maybe-false]` `[defer]` Project-leading indexes do not establish global unscoped latency — old global query also sorted full history; current bounded pages are correct and measured Project rendering passes. Global substantial-history query-plan/latency evidence would settle material cost; medium unverified.
  - `[maybe-false]` `[defer]` Large affected-ID arrays may hurt first paint — event count is bounded and all relevant IDs are required. Current benchmarks/browser pass; large-result metadata rendering needs representative-size measurement before claiming harm or dropping evidence; medium unverified.
  - `[low]` `[defer]` Restore recovery processes unrelated full Activity — baseline imperative reader already fetched/parses full Project history. The new route safely narrows returned evidence; query projection optimization is pre-existing processing debt.
  - `[medium]` `[defer]` Markdown host/session identity permits forged markup — confirmed baseline formatter interpolated the same actor/session fields directly. Record pre-existing formatter issue; structured JSON and payload redaction remain valid.
  - `[medium]` `[patch]` Batch failure lacks mutating-call coverage — current new failure test uses only ListProjects/GetSafetySettings. Added actual HTTP failed-batch assertions: one retained Card/domain event, explicit500 responses, no tool_call batch residue and no repeated mutation after a subsequent read. No production API change.
  - `[medium]` `[patch]` Pending drain lacks disconnected caller coverage — source retains running handlers through their awaited audit promise, but successful connected-client tests do not exercise onRequestAbort. Added actual TCP HTTP and SDK disconnect tests with pending recorder promises; both drains remain incomplete until durable audit commit.
  - `[medium]` `[patch]` SDK unexpected error hash/correlation lacks outer-surface coverage — actual HTTP parity already checks generic correlation; registry test checks hash. Added actual SDK and HTTP unexpected-handler tests that match exactly one persisted error/hash/correlation to the decoded returned envelope.
  - `[false]` `[reject]` Application versus broader admission — carried pass1 admission verdict; the implemented completed/admitted-call contract is explicit, while missing session/protocol admission lacks an actual invocation context.
  - `[false]` `[reject]` Application hashes differ from complete wire-byte hashes — raw arguments/shared result or typed envelope are the defined hash inputs. Existing actual SDK tests decode the envelope before comparing; headers/JSON-RPC wrapping are intentionally outside that hash.
  - `[false]` `[reject]` Permanent UI tests do not prove actual browser timing — carried pass1 verdict; actual first text paint81.1ms and narrow-layout/filtered paging were independently executed after final build and temporary instrumentation was restored exactly.
  - `[false]` `[reject]` Specific benchmark workloads are not universal guarantees — all five required strict workloads ran and passed on actual surfaces, and evidence explicitly limits its generality. No universal workload claim was made.
  - `[false]` `[reject]` Diff cannot prove historical workflow/sprint ownership — carried pass1 verdict: execution tools record skill invocation, no sprint mutations/staging and independent gates. This descriptive limitation of a diff is not a product defect.
  - `[medium]` `[patch]` Internal owner discovery is repeated after it fails — parent in-memory repository probe made getCardDetails throw: raw Error escaped and zero tool_call events. Fixed the internal catch to retain proved scopes and skip rediscovery; the unknown-owner regression observes one lookup and one runtime event with the matching generic correlated envelope. This directly repairs the demonstrated catch path.
- Grouping: the two deep-JSON rows share the private hash defect. Other survivors have separate root causes. Five medium patch entries were repaired by the same implementation agent; five deferred entries preserve pre-existing or explicitly unverified limitations. No intent_gap/bad_spec remains: the patches change private implementation/test details only, add no public surface and guard demonstrated failures.
- Review independence: all four lenses used fresh context-free agents of the parent capability. Four simultaneous reviewers exceed the available root+3 slots; intent launched after verification-gap completed and before any triage. Verification-gap reported no gaps.

### 2026-10-08 — Review pass 3 (follow-up pass on a done spec)
- verdicts: 33 findings — high 0, medium 1, low 10, false 21, maybe-false 1
- findings (blind, edge, verification-gap, then intent-alignment, in reporting order):
  - `[false]` `[reject]` Write-side rejection reasons can fall outside the strict metadata enum — `domainErrorCodes` minus `internal` is exactly validation/not_found/conflict/disabled/protected/restoring, the schema enum; no producer can emit another reason.
  - `[maybe-false]` `[defer]` carried: affectedEntityIds heuristic and unbounded size — same claim as the logged large-affected-ID deferral; the key-name heuristic cannot hit non-entity ids because error envelopes are not walked and no ok result carries session ids. Deferred ledger entry already exists.
  - `[false]` `[reject]` Committed mutation reported as failure when the audit insert fails — the matrix requires audit persistence failure to be explicit, and the pass-2 failed-batch test pins this.
  - `[false]` `[reject]` historicalScopeResolvers scans the whole table on every call — it runs only for an applied ChangeSet containing delete operations (project-scopes.ts:111), not for reads or refusals.
  - `[false]` `[reject]` readRestoreActivity filter, missing project check and strict parse — the JS filter is the already-deferred restore history entry; an unknown project returns an empty list, which breaks no consumer; `after` is produced only by the restore code, so no reachable row fails the schema.
  - `[low]` `[patch]` Restore-name list duplicated in audit-tool-call.ts and registry.ts — the two lists will diverge when a name is added; moved to the shared `humanOnlyRestoreToolNames` contract constant and used in both. (The narrower exact-name policy itself is deliberate; see the narrowed-guard rows.)
  - `[low]` `[reject]` Registry signature loosened, flag-style validate callback and `input: null` now rejected — raw-name typing is required to audit unknown names; null is not valid tool arguments (the SDK path rejects it and is tested) and the in-repo caller sends objects; a compatibility branch is not worth adding.
  - `[low]` `[patch]` Unused `server` parameter on createSession (http.ts) — the change added it and nothing reads it; removed. The SDK-validation, batch and unknown-tool-result concerns in the same finding are refuted below or required by the spec.
  - `[false]` `[reject]` Human export includes runtime rows from every Project — the intent requires Project audit lists and exports to include explicitly labeled runtime calls for humans.
  - `[false]` `[reject]` Index write cost, MessageChannel recorder and existing-database DDL — measured budgets pass on real surfaces; the schema version is computed from the live schema and AD-9 makes prototype databases disposable.
  - `[false]` `[reject]` WeakMap statement cache and hand-written SQL — named harm is stylistic; the insert is repository-owned and measured as required by the performance task.
  - `[false]` `[reject]` ListActivity plumbing — `registerTool` already parses the input with the shared schema before the handler runs, so the cast receives parsed data; the strict query is the specified typed invalid-query behavior.
  - `[false]` `[reject]` Web hook hand-rolled cache handling — pass-1 required the exact-query cancellation and trim; the finding names no failing outcome.
  - `[false]` `[reject]` Wall-clock performance tests brittle — the intent mandates strict one-second and 20-percent assertions; the harness timeout is already separate.
  - `[low]` `[reject]` Documentation, ADR wording and raw reason label — the ADR is intentionally proposed; no generated documentation drift (capability parity passes); unlabeled reason code is cosmetic and unlikely to be noticed.
  - `[false]` `[reject]` hashJson diverges from JSON.stringify for toJSON, cycles and BigInt — inputs are parsed JSON and results are JSON-safe repository/zod values; native stringify would fail on the same values on the wire.
  - `[low]` `[patch]` Paged ListActivity lists its cursor Activity Event id as an affected object — `affectedIds` recursed into `nextCursor`; added it to the skip keys.
  - `[false]` `[reject]` Post-invoke owner discovery can fail a committed call — every registered handler calls `recordProjectIds` before invoking its handler, so the fallback branch is unreachable for registered tools.
  - `[false]` `[reject]` Owner-lookup failure on a refusal replaces the typed error — requires a SQLite read error, which fails loudly and explicitly; no silent loss is demonstrated.
  - `[false]` `[reject]` Nested array-of-object input ids are missed — no declared MCP input schema contains such shapes; ids are top-level or under `patch`.
  - `[false]` `[reject]` JSON-RPC batches skip audit — the installed node transport rejects array bodies, so batches are unsupported.
  - `[false]` `[reject]` Strict summary parse throws on an odd stored row — no producer builds such metadata; same refutation as the pass-1 outcome-schema row.
  - `[false]` `[reject]` restore-activity strict parse blocks recovery — restore events are written only by the restore code with the validated shape.
  - `[low]` `[reject]` Restore guard narrowed from a blanket regex — deliberate: pass-1 high required fixed names so arbitrary text is never persisted, and buglog story-3-7-restore-surface-regressions records the regex rejecting real read tools; unlisted variants are still refused (not_found).
  - `[medium]` `[patch]` Output-derived affected ids verified only for CreateStoryMapCard and one read — added an agent push assertion for card ids and a ProposeBacklogGrooming matrix row asserting the changeSet id.
  - `[low]` `[reject]` Narrowed restore guard (gap duplicate) — same refutation as above.
  - `[low]` `[reject]` `input: null` untested over HTTP — same as the registry row; the behavior is a deliberate validation refusal.
  - `[false]` `[reject]` carried: AC4 lacks a permanent browser timing test — actual Chromium query-to-paint evidence (81.1 ms) is recorded; the permanent tests cover behavior.
  - `[false]` `[reject]` AC5 measured at registry and cheap-read TCP surfaces only — both representative and four real-ingress workloads run and pass with exact inserts.
  - `[low]` `[reject]` ListActivity and exports not exercised through the /mcp wire — the transport is generic for all tools and is exercised by raw and SDK calls; the shared projection is unit tested.
  - `[low]` `[reject]` GitHub-write export rows are synthetic — the export projection reads Activity rows regardless of producer; the GitHub write paths are unchanged.
  - `[false]` `[reject]` Raw before/after and per-status action names are gone from list surfaces — required by the single metadata-only tool_call and safe-summary intent.
  - `[false]` `[reject]` Working-tree sprint-status change — outside the diff; orchestrator-owned and untouched by this run.
- Grouping: restore guard narrowing (three rows) shares one deliberate-policy refutation; patches are independent. No intent_gap or bad_spec.
- Review independence: four fresh context-free layers; the code-review-graph server was unavailable, so triage read source directly.

## Design Notes

One runtime event represents one call, even when multiple Projects are touched. Scope is absent if ownership cannot be established; never manufacture a Project. Rejections store fixed safe reasons/codes rather than raw validation input or exceptions. Shared result/error hashes exclude transport text wrapping. Relevant input IDs plus returned entity IDs cover reads, deletes, creations and multi-item results; do not treat arbitrary string content as object IDs. Public projections are separate from full internal history used by restore and historical ownership. Proposed ADR records this cross-layer contract choice; no new persistence mechanism is needed.

## Verification

### Parent performance evidence — 2026-10-08

- Disposable SQLite/server fixture recorded 1,000 actual HTTP tool calls. Browser first page contained 20 rows, actor+tool filters returned matching rows, and Load older activity produced 40 rows. Temporary query/layout/frame and Chromium Element Timing instrumentation was removed; both source files were restored byte-for-byte against backups.
- Chromium text paint: 277 ms from audit query start (response 199.2 ms, layout 209.2 ms, frame estimate 233.9 ms), within 300 ms. Earlier frame estimates: initial 79.1 ms, filtered 72.6 ms, reloads 228.8/222.7/229.7 ms. Concurrent/scheduling outliers 442.3/552.5/413.5 ms are retained; these measurements do not establish a universal bound under contention. The Element Timing marker used a temporary block wrapper because Chromium did not report the inline marker.
- Executed `tool-call-performance.test.ts`: 100 GetStoryMapData reads per burst, identical handlers with only the call observer disabled for baseline through a test spy, warmed and alternating paired order. Every recorded burst changed exactly 100 SQLite rows and added exactly 100 tool_call events; every unrecorded burst changed zero. Five-pair median: 650.87 ms baseline vs 701.07 ms recorded (7.71% added); independent repeat 649.13 vs 710.19 ms (9.41%). Each recorded burst completed within one second. Log: system temp `storymapper-3-8-burst.log`. The benchmark proves this representative workload, not all tool/card-size combinations.
- Full-suite isolated benchmark repeat: 296.28 ms baseline vs 338.08 ms recorded median, 14.11% added latency; every recorded 100-read burst remains below one second with exactly 100 inserts and no other SQLite row changes.
- Server `test` runs the functional files first and then invokes `test:audit-performance` in an isolated Vitest process. Both phases are required in the full suite; no test is skipped. Its 20-second harness timeout covers two warmups plus ten measured bursts; the individual one-second burst and 20-percent overhead assertions remain strict.

- Focused contracts, DB audit/restore/archive/export, server registry/HTTP/bridge and web audit tests; every matrix covering suite must run and pass.
- Matrix coverage: successful/refused calls and reopening identity are covered by `tool-call-audit.test.ts` cases 1–3 and 5–6; internal/persistence failure by case 4; paged visibility by case 7 and the four `audit.test.ts` UI cases; exports by case 8, the two core summary tests and existing DB atomic export tests; lifecycle by the actual repeated-restore runtime case and archive NULL-row/byte-redaction assertions; read burst by the mandatory isolated `tool-call-performance.test.ts`. Browser paint is verified by the disposable actual-HTTP fixture above. Every covering suite must pass, including the isolated benchmark, before review.
- Measure actual browser first-page render using a disposable local fixture and temporary instrumentation restored exactly before final gates; never use user data. Record any unmeasured acceptance honestly.
- Run serially: `corepack pnpm typecheck`, `corepack pnpm check-capabilities`, `corepack pnpm build`, `corepack pnpm test`, `node scripts/verify.mjs`, `git diff --check`; success exit 0. Build and tests share assets and cannot run concurrently. Use installed Node 24/pnpm 9.15.4.
- Stage only reviewed task paths plus intentional spec/OpenWolf evidence; never stage, unstage, write or revert sprint-status.yaml. Preserve concurrent unrelated changes. No push; follow workflow finalization policy.
- Parent full suite passed: 721 tests (Scripts 73, Contracts 24, Importers 2, Core 30, Web 100, DB 233, Server 258 functional + 1 mandatory performance); two existing Windows permission skips in unrelated script tests. All matrix covering suites ran and passed. Parent workspace typecheck, 106-capability parity, build, full release verification and whitespace passed (exit 0); existing bundler advisories remain.

### Re-derived implementation verification — 2026-10-08

- Final built UI, disposable SQLite and 1,000 actual HTTP calls: 678.57 ms for the fixture calls; first page 20 rows; Chromium Element Timing query-to-text-paint 81.1 ms at 1718 px viewport. Temporary block marker/observer/query timestamp removed and both source files restored with matching SHA-256 backups before final gates. Earlier contention outliers above remain part of the evidence.
- Final UI at 360×800: audit panel 297 px wide, 20 rows with zero overflowing rows; hash paragraphs clientWidth=scrollWidth=227 px and overflow-wrap:anywhere. Invalid tool input showed an accessible field error and retained 20 loaded rows. Valid Agent/ListStoryMaps filter then Load older yielded 40 matching rows without overflow. Viewport override reset and disposable tab/fixture closed.
- Re-derivation focused tests passed: 84 backend audit/SDK/HTTP/paging/registry/complete/UoW/parity, both stdio cases, 37 UI/strings/restore cases, both affected typechecks and 106-capability parity. Final parent full gates below supersede these focused checks.

- Preservation artifact format: pass-1 patch retains the same source changes with zero-context hunks to avoid required patch-context blank spaces failing Git whitespace checks. Apply historical artifact with `git apply --unidiff-zero`; it is historical evidence, not the current implementation.

- Parent re-derived full suite: 736 passed (Scripts73,Contracts24,Importers2,Core30,Web105,DB233,Server264 functional+5 mandatory performance), two existing unrelated Windows permission skips. Workspace typecheck,106-capability parity and build passed. Every matrix row's covering suite ran and passed, including actual HTTP/SDK raw/refused/envelope calls, correlated errors, batch rollback/drain, 1,000 tied-time pages and dense inaccessible pre-limit traversal, UI filter cancellation/error/retry, safe self-audited exports/rollback, actual repeated restore and archive NULL-row removal.
- Parent five-pair performance medians (ms): GetStoryMapData302.95→336.22,+10.98%; HTTP ListProjects48.56→39.13,−19.42%; HTTP GetSafetySettings48.25→53.24,+10.34%; SDK ListProjects55.15→50.52,−8.39%; SDK GetSafetySettings78.40→57.46,−26.71%. Every individual100-read burst<1s;100 INSERTs and no other SQLite row changes per recorded burst; baseline zero writes; all four TCP fixtures reopened with600 rows. Negative overhead reflects this transport scheduling/workload and does not establish universal performance. Full log: system temp storymapper-3-8-pass2-tests.log.

- Parent full release verification `node scripts/verify.mjs` and staged/working-tree whitespace checks passed (exit0). Existing Rollup annotation and bundle-size advisories remain. No sprint-status mutations or staging occurred.

- Pass2 repairs applied: private iterative JSON hashing preserves native representation for actual JSON/undefined values without depth-dependent call-stack recursion. Internal failure catch retains proved owners and skips failed rediscovery. New actual-wire deep arguments/reopened SQLite, mutating failed-batch/domain-state, disconnected HTTP restore/SDK shutdown and exact outer error hash/correlation regressions pass. Both edited files are parent-read.17 focused audit tests and5 covering strict benchmarks pass; final parent gates below remain mandatory.

- Frozen intent rechecked against the initial staged review diff: byte-equivalent content, SHA256 b366cf0001848eb51fab93c219614dfab6d064755ad42603fad91d4894f4722d.

## Auto Run Result

Status: done

- Summary: follow-up review pass 3 of the delivered Story 3.8 (one metadata-only tool_call per completed agent call, filtered/paged audit, safe exports). Four fresh layers reported 33 findings; none required re-derivation.
- Files changed this pass: `apps/server/src/mcp/tools/audit-tool-call.ts` (skip pagination cursor ids, use shared restore-name constant), `apps/server/src/mcp/http.ts` (drop unused createSession parameter), `packages/contracts/src/schemas/restore-points.ts` (single `humanOnlyRestoreToolNames`), `packages/mcp/src/tool-handlers/registry.ts` (use it), `apps/server/src/services/work-item-sync.test.ts` and `apps/server/src/mcp/tools/tool-call-audit.test.ts` (affected-id assertions for pushes and ChangeSet proposals).
- Review findings: patches applied 4 (medium 1, low 3); deferred 0 new (the large affected-id array finding is carried against the existing ledger item); rejected 28 with reasons in the pass-3 triage log.
- Follow-up review recommendation: false (follow-up pass, no high patched; patched counts high 0, medium 1, low 3).
- Verification: `corepack pnpm typecheck`, `check-capabilities` (106), `build`, full `corepack pnpm test` (Scripts, Contracts 24, Importers 2, Core 30, Web 105, DB 233, Server 270 functional + 5 isolated performance), `node scripts/verify.mjs` and the focused audit/sync/HTTP/restore suites all passed.
- Residual risks: the existing deferred items remain; sprint-status.yaml and deferred-work.md are orchestrator-owned and were not touched or staged by this run.

## Merge verification — 2026-10-09

- 812 workspace tests pass, two existing Windows permission skips; Server342 includes all five audit workloads. Every recorded burst performs exactly100 INSERTs/no other SQLite writes and finishes below1s; highest median352.08ms. Relative latency remains diagnostic under the incoming user-approved requirement.
- Agent application snapshots/data/exports filter inaccessible Source Documents; existing MCP dependency authorization still refuses linked disabled Projects. Complete human exports and all19 focused source/authorization cases pass. Incoming safety revocation during awaited remote preparation/write and audit insertion failure/replacement tests also pass.
- Prior source/transport review evidence remains historical; no new browser rerun or independent Claude review is claimed for this merge.

## Incoming branch execution record (historical)

Date: 2026-10-09. Merge version: 1. Reproducing statement: Consolidate independently edited stories without losing branch evidence. Changelog: Preserve incoming c166011 execution evidence below; canonical implementation and current verification remain above. Incoming MCP Project/onboarding/file-import and audit-storage variants were superseded by the local AD17 boundary, content-only MCP imports, summary API and durable batch implementation. Incoming source-visibility/sync revalidation/shared request contracts/parity improvements were integrated. Story3.8 retains the incoming user-approved diagnostic-only relative latency requirement; one-second/one-insert budgets remain enforced. Incoming in-review/blocked completion statements describe that branch only.


Reproducing statement: Implement Story 3.8 through bmad-build-auto: record every agent tool call, expose paged actor/tool audit filters and metadata-only exports, and verify the stated latency limits. Never write, stage or revert sprint-status.yaml or infer verification from its bookkeeping. Date: 2026-10-09. Version: 2. Changelog: Restored preserved implementation and original tests; profiled and optimized terminal persistence; recorded passing browser acceptance and unresolved latency gate.

<intent-contract>

## Intent

**Problem:** Auditing begins after validation and skips unscoped calls, so malformed, unknown and global calls escape. The audit area cannot filter/page, and JSON export includes full payloads.

**Approach:** Record one tool_call Activity Event for each completed tool invocation on both transports, with safe metadata, and expose bounded server-side audit browsing and exports.

## Boundaries & Constraints

**Always:** Use contracts as schema authority, DB repositories/UoW, shared actor attribution and typed errors. Retain safety enforcement and existing domain Activity. Record host, session, tool name, SHA-256 input/output hashes, outcome ok/rejected/error, safe reason for non-ok and actual affected IDs. Audit validation and permission denials, unknown names, read calls and unscoped calls. Record unscoped calls without inventing Project ownership; make them visible to human audit browsing/export. Scoped audits belong to actual existing Project ownership, including disabled-Project denials; never disclose disabled Project data to agents. One terminal audit insert per call; never store tool input/output payloads or arbitrary error text. Transport output hash represents the emitted application/tool result or emitted error, with a documented deterministic serialization. Preserve restore-history recovery and export/checklist transaction ordering. All persistence changes must remain compatible with archive/restore schema validation. Centralized English UI strings and accessible controls.

**Never:** Touch sprint-status.yaml, user data or credentials; weaken Host/Origin/safety gates; add providers, telemetry or cloud dependencies; attribute calls to an arbitrary Project; create duplicate events across SDK/registry/HTTP paths; log secrets or full payloads; claim internal timing proves browser rendering. Protocol initialization, tools/list and requests rejected before an admitted tool-call request are outside tool invocation auditing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Completed scoped/unscoped reads and writes | Actual SDK /mcp and HTTP calls, known or unknown scope | Exactly one tool_call event, all metadata and hashes, actual affected IDs; original result preserved | None for valid calls |
| Rejections | Unknown tool, malformed args, unknown entity, disabled/protected Project or permission denial | One rejected event with safe reason and hashed emitted error; forbidden data unchanged | Existing typed/SDK rejection preserved |
| Handler failure | Controlled internal error containing private diagnostic | One error event; correlated safe reason/output hash, no private diagnostic or payload | Existing generic error mapping |
| Human audit browsing | 1,000 mixed actor/tool events and repeated timestamps | Server filters actor/tool together, stable newest-first bounded pages without omissions/duplicates; UI exposes metadata and page controls | Invalid paging/filter input rejected |
| Audit exports | Tool calls, agent writes and GitHub writes containing sensitive before/after payloads | JSON and Markdown list actor/time/objects and safe call metadata; no payload or secret, including unscoped calls | Explicit export failures preserve atomicity |
| Read burst | 100 actual reads in one second | Each audit performs one insert, all 100 recorded, audited burst completes within one second; relative overhead against identical unaudited execution is diagnostic only | Measured comparison, no artificial baseline work |

</intent-contract>

## Code Map

- Planning: epics.md Story3.8, cached epic-3-context.md; FR-33/FR-37 and AD-6/AD-24. Story3.7 establishes91 tools and105 capabilities; inventory/safety must survive. Graph tools unavailable; source investigators confirmed the following anchors.
- `apps/server/src/mcp/tools/register-tools.ts:255` — schema/scope parsing precedes current auditing; unscoped recording returns early. Replace partial success/denial/failure writes with one complete call envelope; reuse actual scope/affected resolvers.
- `packages/mcp/src/transports/server.ts:19`, `apps/server/src/mcp/http.ts`, `apps/server/src/http/routes/infrastructure-routes.ts` — SDK schema rejection occurs before callback; inspect SDK public request handler hooks/source to cover validation and unknown tools while retaining real input schemas. HTTP request validation must also fall inside auditing.
- `packages/contracts/src/schemas/domain.ts:632`, `api/http.ts`, `api/application-responses.ts`, `mcp/input-schemas.ts` — event metadata and audit query/response contracts.
- `packages/db/src/repositories/audit-repository.ts`, `schema/tables.ts:344`, `connection.ts:360`, `repositories/row-mappers.ts:231` — current required Project FK, before/after hashes, unbounded ascending list; support project-free audit and indexed paging. Inspect archive/restore history/schema consumers before changing nullable ownership.
- `apps/server/src/application/customization/customization.use-cases.ts:88`, HTTP customization routes, `mcp/tools/customization-tools.ts:18` — shared ListActivity capability. Preserve default historical read callers; add explicit paged query mode for audit browsing, including human unscoped visibility.
- `apps/web/src/app/api.ts:211`, `app/routes/audit.tsx`, `packages/ui-strings/src` — existing unpaged hook/last20 display; add filtered pages and metadata. `features/restore-points/restore-result.ts` needs its unpaged history read preserved.
- `packages/core/src/publishing/export-files.ts:21`, `export-formatters.ts:121`, application export use cases — JSON raw payload leak; shared metadata-only projection. `packages/db/src/repositories/getting-started.test.ts:379` pins self-inclusion and rollback on export serialization failure.
- Existing MCP registry/surface/HTTP/stdio and `application/mcp-http-parity.test.ts:142` — preserve generic private-error sanitization and attribution; extend real transport evidence. DB/contract/core/web tests cover paging/privacy; use actual browser for rendering latency.

## Tasks & Acceptance

- [x] `packages/contracts/src/schemas/domain.ts`, `packages/db/src/{schema/tables.ts,connection.ts,repositories/audit-repository.ts,repositories/row-mappers.ts}`, core event factory — support typed safe tool_call metadata and project-free events with one insert and indexed deterministic paging; verify archive/restore implications.
- [x] `apps/server/src/mcp/tools/register-tools.ts`, `packages/mcp/src/transports/server.ts`, HTTP MCP routes — centralize terminal audit across validation, authorization and execution on both surfaces; retain schema discovery, identity and safety.
- [x] Contracts API/MCP query/response, shared customization use case and adapters — expose validated filters/pages without truncating existing restore-history requests or exposing global events to agents.
- [x] `packages/core/src/publishing/export-files.ts`, `export-formatters.ts`, application export use case — project only safe metadata into both exports while retaining atomic export Activity/checklist behavior.
- [x] `apps/web/src/app/{api.ts,routes/audit.tsx}`, UI strings — add accessible actor/tool filters, page navigation and call metadata; render bounded result page.
- [ ] Focused real transport, DB/core/contracts/UI tests — exercise every matrix row and actual persistence, no payload logging; measure 100 reads burst overhead/SQL insert count and browser first-page rendering from 1,000 events.

**Acceptance Criteria:**

- Given any admitted tool invocation on /mcp or /api/mcp/call, when it completes, then exactly one tool_call records host/session/tool/hashes/outcome/affected IDs, including reads and failures.
- Given a rejected call, when the result is returned, then its audit records a safe reason without forbidden mutation or private diagnostics.
- Given the human audit area, when actor and tool filters and pages are selected, then only matching events appear in stable bounded pages, with usable actor/time/objects and tool details.
- Given JSON or Markdown audit export, when exported, then tool calls, GitHub writes and agent writes include actor/time/objects without secrets or full payloads.
- Given 1,000 recorded calls, when the audit first page loads, then browser rendering completes within 300 ms; given 100 reads in one second, when recorded, then each adds one insert and the audited burst completes within one second; relative overhead is measured but has no hard acceptance threshold.

## Spec Change Log

- 2026-10-09: User explicitly authorized relaxing performance requirements and committing/pushing a cross-machine checkpoint. Removed the relative <20% overhead acceptance gate; retain diagnostic overhead measurements, 100 audited reads within one second, exactly one terminal insert per call, synchronous persistence and <=300ms browser rendering. Independent review/finalization remains pending; this checkpoint is not a done claim.

## Review Triage Log

## Verification

Use Node24 via PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH. Stage newly added sources before Git-index portable fixtures; run build/test gates serially. Never stage sprint-status.yaml. Do not commit unless workflow finalization explicitly directs it.

- `corepack pnpm test` — full existing workspace and new regressions pass, including archive/restore and matrix coverage.
- `corepack pnpm typecheck` and `corepack pnpm check-capabilities` — types and105-capability inventory pass.
- `node scripts/verify.mjs` — release hygiene/typecheck/build pass.
- `git diff --check` — whitespace clean.
- Actual browser first-page rendering timing with 1,000 disposable recorded events; actual 100-read burst overhead and SQL insert observation — stated latency and insert limits pass, retained numerical evidence. Use isolated temporary database; never touch user data.

## Cross-machine checkpoint verification — 2026-10-09

- User approved removal of the relative20% gate; no workload, safety, durability or absolute latency assertions changed. `corepack pnpm test` passed all727 tests: Scripts75, Contracts24, Core28, Importers2, Web97, DB234, Server267.
- Audited100-read median27.986375ms; identical unaudited median23.036042ms; overhead21.489512% retained as diagnostic. Test asserts100 inserts and100 persisted records plus the <1000ms burst bound.
- `node scripts/verify.mjs` passed source/Git hygiene, typecheck and build.105-capability parity passed. Existing Vite bundle-size and dependency annotation warnings remain.
- Prior browser acceptance JSON is retained as `evidence-3-8-browser.json`; it is historical measured evidence, not a new browser run.
- Independent Claude review/finalization remains pending against original baseline `9fdda61e62a145a5b02be9e1e446a2bc0b649bf0` through the final checkpoint. Local engine exited and supervision is paused for the other machine. Sprint status was not altered.

## Historical Auto Run Result (before user-approved relaxation)

Status: blocked
Blocking condition: implementation verification failed — unchanged 100-read audit latency test exceeds the required 20% overhead.

- Original implementation/review baseline: `9fdda61e62a145a5b02be9e1e446a2bc0b649bf0`; HEAD remains that revision. Preserved tracked sources restored from `refs/attempt-preserve-dirty/20261008-214640-6bef-9fdda61e-0`; three original new audit tests recovered from unreachable Git objects. Sources/tests remain staged, no commit or rollback. Future independent review must cover the entire original baseline through final implementation, including recovery changes.
- Terminal persistence now uses one SQLite-atomic INSERT within the existing exclusive write gate, retains actor validation, synchronous afterCommit/failure propagation and statement replacement. UUIDv7 IDs reduce primary-key insertion cost; one `(project_id,created_at,id)` paging index remains. No durability, thresholds, baseline workload or safety gates changed.
- Independent profiling per 100 operations: full transaction terminal audit 5.267 ms, empty transaction 4.216 ms, atomic insert 3.894 ms; actor parse/freeze 0.0149 ms, event construction 0.0430 ms, tool metadata serialization 0.0245 ms, canonical serialization/hash approximately 0.204 ms. Empty scope 0.0017 ms; cheapest ListProjects has no scope-query cost. Production afterCommit is absent; callback and replacement semantics have passing regressions. Raw random-ID insert median 5.476 ms versus UUIDv7 4.283 ms. Configuration verified: SQLite 3.53.4, WAL, synchronous=NORMAL, foreign_keys=ON. These measurements do not prove architectural impossibility.
- All candidate evidence retained: unchanged restored baseline failed 32.39%; atomic-only failed 28.38%; UUIDv7 initially passed 15.58% then failed 26.90% and 26.08%; disposable single-index probes passed 19.28%, 10.41%, 13.95%. Final unchanged-source focused tests failed 23.812278% and 20.203891%; full-suite failed 24.280197% (29.242458 ms audited, 23.529459 ms baseline). All 100 calls and 100 inserts recorded; no passing retry adopted as acceptance.
- Final full workspace test correctness passed: Scripts 75, Contracts 24, Core 28, Importers 2, Web 97, DB 234, Server 266 (726 passing). Sole failed test is the latency criterion. Typecheck, 105-capability parity and full `node scripts/verify.mjs` passed. Transport, rejection/privacy, browsing/export and restore rows have executed passing tests; read-burst row remains unmet.
- Real Chromium 151.0.7922.34 with Playwright 1.61.1, rebuilt production UI and fresh disposable DB: exactly 1,000 UUIDv7 tool calls, final index schema confirmed. Request-to-20-rendered-rows plus two animation frames: 36.7, 36.2, 37.1, 36.9, 37.5 ms (all <=300 ms). Cold navigation-origin paint: 138.2, 137.0, 138.2, 137.3, 138.0 ms. Combined actor/tool filtering traversed all 84 expected records across five real pages with zero duplicates/omissions; repeated timestamps, unscoped visibility and previous-page restoration passed; screenshot inspected, no page errors. Disposable server/browser closed.
- Evidence retained under the configured scratch TMPDIR: `storymapper-recovery-final-full-tests.log`, `storymapper-recovery-audit-final1.log`, `storymapper-recovery-audit-final2.log`, `storymapper-recovery-typecheck.log`, `storymapper-recovery-capabilities.log`, `storymapper-recovery-verify.log`, `storymapper-recovery-audit-partition.log`, `storymapper-audit-profile-allocations.log`, `story38-browser-final/evidence.json`. Temporary partition instrumentation was restored before final tests.
- Independent Claude review was not entered because implementation verification failed; authenticated noninteractive preflight succeeded. No done/adopt-branch, cherry-pick, threshold change, artificial baseline work or gate bypass. Sprint status, user data, credentials and orchestration records were untouched.
