---
title: Persisted Product Context and templates as MCP prompts
type: feature
created: 2026-10-10
status: done
baseline_revision: d0649713c02730ed37c419d70b28f6b76d9c4d29
review_loop_iteration: 0
followup_review_recommended: false
context: [AGENTS.md, .wolf/OPENWOLF.md]
warnings: [oversized]
deferred:
  - summary: >-
      Resolved historical verification failure: macOS Node24.17.0 launcher probe hit Undici setTypeOfService EINVAL.
    evidence: |-
      Both full pnpm test runs and the unchanged standalone script-suite retry produced 76 passed / 1 failed at scripts/commands.test.mjs:260. The unchanged isolated abrupt-launcher-loss test passed. Existing buglog story-3-7-recovery-node-tos predates this story. Resolved in this repair by directly checking TCP refusal, retaining unexpected errors and all shutdown assertions; final exact full gate passes 973 tests.
    location: >-
      scripts/commands.test.mjs:260
    severity: medium
  - summary: >-
      AGENTS.md still describes packages/ai as deterministic template/regex logic although the package was removed.
    evidence: |-
      AGENTS.md:45 (Conventions) names packages/ai; the package no longer exists and the logic lives in packages/core/src/proposals. The fix edits an agent-context file.
    location: >-
      AGENTS.md:45
    severity: low
---

Reproducing statement: Execute bmad-build-auto for Story 3.12: persist editable Project function templates, expose populated MCP prompts, move deterministic generators into core and remove packages/ai. Never write, stage or revert orchestrator-owned sprint-status.yaml; its rows do not verify work. Date: 2026-10-10. Version: 2. Changelog: Resumed deterministic verification repair; frozen intent preserved.

<intent-contract>

## Intent

**Problem:** Product Context persists, but function templates are duplicated global constants with no editing or MCP prompt surface. Deterministic proposal logic remains outside pure core.

**Approach:** Seed Project-owned Customization templates from core, expose persisted CRUD in the UI and shared application layer, and offer their instructions/arguments with exact-scope Product Context through MCP prompts. Move existing deterministic computations into core without changing proposal behavior.

## Boundaries & Constraints

**Always:** Shared contracts are the schema source; repositories own SQL; attributed synchronous UnitOfWork owns writes. Templates use Customization last-write-wins. Preserve independent Project/map Product Context scope. Prompt discovery excludes Agent-disabled Projects and retrieval rechecks actual ownership/access. Outputs are proposed ChangeSets, never direct writes. Preserve supported deterministic generator inputs/outputs, provenance and version baselines. Keep HOST loopback. Leave sprint-status.yaml untouched.

**Never:** Add an LLM/provider/SDK, execute arbitrary template instructions locally, introduce context inheritance, migrate prototype data, or change unrelated generator algorithms. No user data, credentials or full template/context payloads in logs. No commits unless user explicitly asks.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| New Project | Project creation | Twelve core defaults persist once in ai_function_templates | Transaction rolls back on failure |
| Edited templates | Project-owned name, instructions and string argument declarations | Create/edit/delete survives reopen; deleted defaults do not reappear | Shared validation; missing/foreign ownership refuses |
| Prompt discovery | Multiple Projects, identical template IDs | Stable Project-qualified prompt names; accessible templates expose arguments | Disabled Projects omitted |
| Prompt resolution | Qualified name, optional storyMapId and declared argument values | Instructions, supplied arguments and full exact-scope context populate text messages, with fixed ChangeSet-only output requirement | Unknown prompt/argument, missing required argument or foreign map refuses explicitly |
| Scope change | Access disabled after session initialization | Prompt get refuses and list omits Project | Existing typed refusal mapping |
| Deterministic generation | Existing supported action inputs | Existing proposed operations and provenance preserved, no domain application | Existing validation preserved |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/domain.ts:409`, `api/http.ts:92,133,490`, `mcp/tool-inputs.ts` — Product Context and global template/closed deterministic generator schemas; add Project template CRUD/argument contracts while retaining generator enum.
- `packages/db/src/repositories/projects-repository.ts:105,239` — Project seed and exact-scope context; map lookup never inherits Project record. `schema/`, `connection.ts`, `repositories/customizations-repository.ts` and repository facade own table creation/classification/CRUD.
- `apps/server/src/application/ai/ai.use-cases.ts`, descriptors and HTTP routes — list defaults currently ignores repositories; replace with Project reads and attributed CRUD, keep CRUD human-only because Agent changes must first be ChangeSets; retain scoped read tool and prompts.
- `apps/server/src/services/default-ai-templates.ts`, `packages/ai/src/prompt-templates/templates.ts` — duplicate twelve defaults; canonicalize in core.
- `packages/mcp/src/transports/server.ts:createStoryMapperMcpServer`, `apps/server/src/mcp/http.ts:createSession` — SDK tools only; inject prompt callbacks backed by application reads and dynamic safety. `scripts/mcp-bridge.mjs` already forwards generic RPC.
- `apps/web/src/features/ai-mcp/{AiMcpPanel,useAiMcpPanelState}.tsx`, `app/api.ts:439`, `packages/ui-strings` — current templates list doubles as generator selector. Keep deterministic supported actions separate from editable prompt templates; follow existing accessible form and error patterns.
- `apps/server/src/application/changeset/proposal-builders.ts`, `changeset.use-cases.ts`, `services/ai-proposal-change-set.ts` — move pure generation into core with application-supplied IDs/times/data. Unused packages/ai map algorithm differs; preserve actual server behavior.
- `apps/server/package.json`, `tsconfig.base.json`, `pnpm-lock.yaml`, `packages/ai/` — remove package/references; npm ai SDK is already absent.
- Relevant tests: DB `storymapper-repository.test.ts`, server `ai.use-cases.test.ts`, HTTP `index.test.ts`, MCP `register-tools.test.ts`, `stdio-main.test.ts`, web `AiMcpPanel.test.tsx`, `context-draft.test.ts`. Graph unavailable; two read-only agents investigated and parent verified source.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/schemas/domain.ts`, `api/http.ts`, `mcp/tool-inputs.ts` — define persisted Project-owned templates and unique string prompt arguments; share create/update/list validation.
- [x] `packages/core/src/default-ai-templates.ts`, `packages/db/src/schema/`, `connection.ts`, `repositories/customizations-repository.ts`, `repositories/projects-repository.ts` — transactional seed and scoped CRUD, preserved archive classification, no reseeding reads.
- [x] `apps/server/src/application/ai/ai.use-cases.ts`, `application/descriptors.ts`, `http/routes/`, `mcp/tools/` — Project-scoped human-only CRUD, Agent read tool/prompts and current safety/audit/parity integration; never add direct Agent template mutation tools.
- [x] `packages/mcp/src/transports/server.ts`, `apps/server/src/mcp/http.ts`, `apps/server/src/application/ai/prompts.ts` — dynamic discovery/resolution with qualified names, exact context, examples/outputSchemaName and immutable proposal-only instructions; both HTTP and stdio support. Preserve internal versus invalid-argument RPC errors.
- [x] `apps/web/src/app/api.ts`, `features/ai-mcp/AiMcpPanel.tsx`, `useAiMcpPanelState.ts`, `packages/ui-strings/src/` — persisted editing of name/instructions/arguments/examples/outputSchemaName, errors reset across selections/actions, disabled fields during deletion and retained save-time drafts; separate deterministic action selector. Nullable PATCH outputSchemaName clears stored guidance.
- [x] `packages/core/src/proposals/`, `apps/server/src/application/changeset/proposal-builders.ts`, `changeset.use-cases.ts`, `services/ai-proposal-change-set.ts`, `apps/server/package.json`, `tsconfig.base.json`, `pnpm-lock.yaml`, `packages/ai/` — move actual computations unchanged and remove packages/ai/duplicate defaults.
- [x] `apps/server/src/mcp/stdio-main.test.ts`, HTTP `index.test.ts`, `packages/db/src/ai-templates.test.ts`, `apps/web/src/features/ai-mcp/AiMcpPanel.test.tsx` and adjacent tests — verify matrix edge cases, persistence and no direct domain writes. Add exact wire argument-value assertions, query-backed local list refresh, metadata clear/reopen and archive export/import preservation plus malformed JSON/declaration refusal before runtime activation.

**Acceptance Criteria:**
- Given the complete Product Context form, when saved, then HTTP and GetProductContext return all persisted fields after reopen.
- Given a newly created Project, when templates are listed, then core defaults are stored; when a user creates, edits or deletes one in the UI, then reopened storage reflects the change.
- Given a real MCP host over HTTP or stdio, when prompts/list and prompts/get run, then each accessible persisted template exposes instructions and arguments with the chosen Product Context filled in.
- Given disabled or foreign Project/map scope, when prompt retrieval is attempted, then no inaccessible context or template is disclosed.
- Given existing proposal inputs, when ProposeMapFromSourceDocument, ProposeBacklogGrooming or ProposeReleaseSlice runs, then existing regression behavior remains proposed-only with computations in core.
- Given completion, when workspace dependencies/mappings are inspected, then packages/ai and every LLM SDK are absent.

## Spec Change Log

- 2026-10-10, pass1: Added human-only authoring, complete persisted guidance/clearing, archive admission validation and focused UX/wire/list assertions. Trigger: new direct Agent writes violate AGENTS, and partial guidance/editor contracts plus unchecked archive fields left user-visible gaps. Avoid direct Agent mutation, inaccessible stored guidance and runtime switch into unreadable templates. KEEP every working behavior listed under Preserved implementation. Intent-contract remains verbatim.

## Review Triage Log

### 2026-10-10 — Review pass 1

- verdicts: 20 findings — high 2, medium 9, low 3, false 6, maybe-false 0
- findings:
  - `[high]` `[bad_spec]` New MCP template mutations apply immediately — source and MCP test prove direct writes; AGENTS requires ChangeSet first. Re-derive with human-only template CRUD and Agent reads/prompts; adding a new executor is outside this story.
  - `[medium]` `[bad_spec]` Prompt drops examples/outputSchemaName — getPrompt only emits instructions,args,context; require all stored template guidance in messages.
  - `[medium]` `[bad_spec]` Output schema cannot be cleared — sparse PATCH preserves omission while null fails; require explicit nullable clearing and reopen evidence.
  - `[low]` `[patch]` Selection retains unrelated errors — useMutation errors survive select; reset mutation state on selection/new operations.
  - `[medium]` `[patch]` Internal prompt errors use INVALID_PARAMS — generic errors become internal envelopes but RPC code remains invalid params; use internal-error RPC code for server failures.
  - `[low]` `[reject]` Generated inventory omits prompt documentation — discovery exposes names/arguments and editor explains prompt use; additional manual documentation is prohibited by global instructions and would require generator expansion, beyond a direct correction.
  - `[medium]` `[bad_spec]` Invalid template JSON admitted in archives — archive validator checks SQLite integrity/hierarchy only; malformed new JSON reaches fromRow after activation. Require shared-contract validation before switch.
  - `[medium]` `[patch]` Archive template roundtrip unverified — classification retains table, but existing archive tests do not assert edited metadata/deleted defaults; add outer archive roundtrip assertions.
  - `[false]` `[reject]` Defaults have no usable prompt arguments — every exposed default has reserved optional storyMapId selecting persisted context; task data may be retrieved through existing source/card tools or user-declared arguments. Story specifies no additional required default arguments.
  - `[medium]` `[bad_spec]` Editor omits stored examples/output schema — controls expose only name/instructions/arguments; require editing stored guidance rather than silently retaining inaccessible fields.
  - `[medium]` `[patch]` Pending deletion clears newly typed draft — fields remain enabled and onSuccess select() clears them; disable fields during delete while preserving save-time edits.
  - `[low]` `[patch]` Failed delete error survives save/selection — independent mutation errors are never reset; same reset repair as selection finding.
  - `[medium]` `[patch]` Supplied argument values lack wire assertion — pre-verified gap; assert exact quoted/newline values from returned message.
  - `[medium]` `[patch]` Local list refresh lacks rendered assertion — pre-verified gap; test query-fed buttons after local create/rename/delete rather than manually supplying templates.
  - `[false]` `[reject]` No continuous browser-to-host journey — separate rendered UI, real HTTP persistence and real host tests observe all required surfaces; invocation does not require an additional browser E2E scenario.
  - `[false]` `[reject]` No external Agent generation/enforcement — intent requires prompt delivery and deterministic proposed-only outputs, not executing an external LLM. Fixed prompt contract is guidance; existing approved ChangeSet application is separate.
  - `[false]` `[reject]` No placeholder substitution — neither story nor contracts define placeholder syntax; separate populated argument/context messages satisfy prompt delivery.
  - `[false]` `[reject]` Existing Projects lack default backfill — acceptance explicitly seeds on Project creation; AD9 excludes prototype migration.
  - `[high]` `[bad_spec]` Direct template writes diverge from ChangeSet policy — same demonstrated new-tool policy defect as blind finding; human-only authoring repairs it.
  - `[false]` `[reject]` Sprint/workflow claims cannot be established from diff alone — sprint file absent and parent independently ran renderer/gates; no contrary bookkeeping mutation exists.


### 2026-10-10 — Review pass 2

- verdicts: 16 findings — high 0, medium 6, low 3, false 7, maybe-false 0
- findings:
  - `[false]` `[reject]` Prompt reads require tool-call audit — existing audit contract covers admitted tools/calls; prompts are read-only protocol delivery and are not tools. No new mutation or promised prompt-specific audit surface exists.
  - `[low]` `[patch]` DB persistence test leaves first connection open — closed first client before reopening with safe cleanup; final package gate passes.
  - `[medium]` `[patch]` Restore lacks template regression — actual SQLite restore copies the full snapshot, but the new table has no behavioral assertion; test guidance/arguments/deletions across an actual Restore.
  - `[false]` `[reject]` Runtime reset silently overwrites restored draft — no write occurs on reset. Existing draft remains until explicit Save under Customization last-write-wins; Project changes remount the editor using its Project key. Automatically discarding edits would conflict with draft preservation.
  - `[medium]` `[patch]` Pending creation lacks draft-preservation assertion — create changes editing identity and existing delayed test exercises updates only; add delayed creation followed by update of the created ID.
  - `[low]` `[patch]` Same-session CRUD discovery not fully asserted — existing HTTP test already updates arguments after initialization and proves dynamic resolution; extend it with create/rename/delete observations.
  - `[medium]` `[patch]` HTTP ownership route lacks cross-Project refusal assertion — source passes both route IDs correctly and repository guards ownership, but no outer PATCH/DELETE test protects wiring; add refusal and unchanged owner data.
  - `[medium]` `[patch]` Stdio custom argument population untested — HTTP tests assert exact argument/context values while stdio uses defaults; extend actual bridge test with quoted/newline values and scoped context.
  - `[low]` `[patch]` Duplicate template names indistinguishable before selection — contracts allow duplicates and buttons expose names only; add an ID title/description and assertion.
  - `[medium]` `[patch]` Metadata-only edit audit unasserted — source logs attributed aiTemplate.updated even when safe before/after metadata match; add direct assertions for guidance-only changes, private payload omission and live invalidation through existing coverage.
  - `[medium]` `[patch]` Deterministic selector separation unprotected — pre-verified regression gap; assert supported options with empty/custom persisted prompt lists.
  - `[false]` `[reject]` Workflow execution unprovable from diff — carried: parent renderer, implementation handoffs and gates supply independent execution evidence; sprint file remains absent from all changes.
  - `[false]` `[reject]` Complete Product Context form lacks newly added rendered coverage — unchanged form/draft behavior already has rendered tests; added real HTTP save/reopen/GetProductContext and exact prompt assertions verify complete persistence.
  - `[false]` `[reject]` No continuous browser-to-host journey — carried: separate rendered UI, real HTTP persistence and real host tests exercise the required surfaces; no additional continuous browser scenario was required.
  - `[false]` `[reject]` Prompt guidance lacks external execution — carried: story requires populated prompt delivery and deterministic proposed-only outputs, not executing an external model or validating its output.
  - `[false]` `[reject]` Editable guidance does not drive local generators — carried: arbitrary instruction interpretation is expressly excluded, and the existing closed deterministic generator request remains independent from editable MCP prompts.

### 2026-10-10 — Review pass 3 (follow-up)

- verdicts: 36 findings — high 0, medium 3, low 23, false 10, maybe-false 0
- findings:
  - `[false]` `[reject]` Existing Projects get no templates and defaults cannot be restored — carried: acceptance seeds on Project creation, AD9 excludes prototype migration; restoring deleted defaults is not requested.
  - `[low]` `[patch]` resolveAuditProjectIds deletes the templateId resolver by input shape — verified redundant: collectScopes already skips CreateAiProposal enum ids and no other tool carries projectId plus a story templateId; line removed, MCP/server suites pass.
  - `[false]` `[reject]` Prompts bypass tool-call audit — carried: prompts are not tools; no promised prompt audit surface.
  - `[low]` `[reject]` No prompts listChanged capability — pull listing observes changes and revocation in the tested session; notifications are nice-to-have beyond a direct correction.
  - `[false]` `[reject]` PATCH loses argument uniqueness — removeDefault does drop the refine (verified), but updateAiTemplate re-parses the merged template with aiFunctionTemplateSchema, ZodError maps to a 400 validation DomainError and nothing is persisted.
  - `[low]` `[reject]` Inconsistent template REST shape and unencoded projectId — UUID path segments need no encoding; renaming public routes exceeds a direct correction.
  - `[false]` `[reject]` Core self-imports through the barrel — established core pattern (reports, publishing, release-slicing import from @storymapper/core); build and tests pass.
  - `[low]` `[reject]` Moved code keeps odd indentation/blank line — moved unchanged by requirement; reformatting hurts move verification.
  - `[low]` `[reject]` Repeated empty arguments/examples in defaults — works as specified; typing refactor not worth the churn.
  - `[low]` `[reject]` Editor UX gaps (no delete confirmation, dirty draft on selection, key=index, legend) — not requested by acceptance; fixes add behavior.
  - `[low]` `[patch]` mockRestore inside try leaks the spy on failure — moved into finally.
  - `[low]` `[reject]` Refs assigned during render in useTemplateEditor — works under the current React usage; no demonstrated failure.
  - `[low]` `[patch]` Required prompt argument accepts empty string — empty or blank values now count as missing; assertion added to the HTTP prompt test.
  - `[low]` `[reject]` Prompt list description size, per-project settings reads, one malformed row breaking list, opaque names — rows are validated on write and archive admission; none shown reachable in everyday use.
  - `[low]` `[reject]` Missing docs/ADR/spine update — spine already registers ai_function_templates under Customization; capability inventory is generated; ADR would restate the spine.
  - `[low]` `[reject]` Spec file status fields and temp path references — fix would edit this build's spec.
  - `[low]` `[patch]` Same empty required argument defect (edge hunter) — shared fix with the row above.
  - `[low]` `[reject]` Prompt internal errors are not logged against the returned errorId — tool path logs no cause either; adding a logger parameter exceeds a direct correction.
  - `[low]` `[reject]` Editor keeps a stale template after a failed update/delete — query refetch on focus refreshes it; extra invalidation is optional.
  - `[low]` `[reject]` One malformed template row breaks prompts/list — fromRow input is validated on write and before archive activation; only external corruption reaches it.
  - `[false]` `[reject]` Existing Projects have zero templates — carried.
  - `[low]` `[patch]` Dead templateId resolver deletion (edge hunter) — same fix as the second row.
  - `[low]` `[patch]` mockRestore leak (edge hunter) — same fix as above.
  - `[low]` `[patch]` README lists deleted packages/ai — line removed.
  - `[low]` `[defer]` AGENTS.md:45 still describes packages/ai — fix edits an agent-context file; deferred.
  - `[medium]` `[patch]` Moved generators lack behavior-level tests (verification-gap, pre-verified) — added packages/core/src/proposals/proposals.test.ts pinning exact operations for story-writing, SPIDR, estimates, gap analysis, personas, map, release slice, map/grooming/release builders.
  - `[medium]` `[patch]` Editor mount in AiMcpPanel untested (verification-gap, pre-verified) — AiMcpPanel.test.tsx asserts editor heading and template names with a projectId and absence without.
  - `[low]` `[patch]` Unexercised templateId resolver branch (verification-gap other) — removed with the second row.
  - `[low]` `[patch]` mockRestore leak (verification-gap other) — same fix as above.
  - `[medium]` `[patch]` Intent audit: no core-level coverage of moved computations — same root and fix as the generator test row.
  - `[false]` `[reject]` Intent audit: ListAiTemplates now requires projectId — Project-owned templates are only listable per Project; matches the intent.
  - `[false]` `[reject]` Intent audit: generators stay independent of editable templates — Never clauses exclude executing template instructions locally.
  - `[false]` `[reject]` Intent audit: Projects predating the table have no templates — carried.
  - `[false]` `[reject]` Intent audit: older snapshot without the table fails validation — validateRestoreDatabase rejects a schema mismatch before template validation.
  - `[false]` `[reject]` Intent audit: script and lifecycle test edits outside the intent surfaces — consequences of removing packages/ai and test stability, recorded in the spec.
  - `[low]` `[reject]` Intent audit: prompt list description carries full instructions — duplicate of the list-size row above.

### 2026-10-10 — Deterministic repair review

- verdicts: 16 findings — high 0, medium 0, low 9, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` Clean selected editor retains old values after external refresh — draft state intentionally stays separate from query state under Customization last-write-wins; automatic draft reconciliation adds behavior, no incorrect persistence demonstrated.
  - `[low]` `[reject]` External deletion leaves selected ID — carried: missing-record writes refuse explicitly; automatic disappearance handling adds editor behavior beyond a direct correction.
  - `[low]` `[reject]` Selection/New discards draft — carried: prior editor UX row; selection intentionally loads the chosen record, draft retention across selections was not promised.
  - `[low]` `[reject]` Duplicate names distinguished only by title — title carries ID and existing rendered assertion protects it; additional visible/accessibility presentation is polish requiring changed authoring behavior.
  - `[low]` `[reject]` Repeated argument/example labels lack row names — individually associated controls work; row numbering is optional presentation, no failed interaction demonstrated.
  - `[low]` `[reject]` Blank editor during discovery loading/error — template error is rendered by AiMcpPanel and creation is server-validated; adding loading gates is additional behavior rather than fixing silent failure.
  - `[low]` `[reject]` Unbounded template fields — no everyday failing input demonstrated; inventing limits changes public contracts and is not a direct correction.
  - `[low]` `[reject]` Unbounded prompt discovery with full instructions — carried: prior prompt-list size row, no measured failure; pagination/short descriptions add a public surface.
  - `[false]` `[reject]` Missing immutability/repeated-call tests imply purity defect — traced moved core generators: they construct new operations, arrays and sets, use supplied identity/time and do not mutate inputs or access effects; representative behavior tests pass. No purity regression demonstrated.
  - `[low]` `[defer]` AGENTS still names deleted packages/ai — carried: existing agent-context deferred item retained, no duplicate append or instruction-file edit.
  - `[false]` `[reject]` Intent reading: editable prompts should configure local generators — carried: frozen Never clause excludes interpreting arbitrary instructions locally; independent selector is tested.
  - `[false]` `[reject]` Intent reading: shared authoring requires Agent mutation — carried: MCP delivery is required, Agent CRUD is not; human-only use cases preserve ChangeSet-first policy.
  - `[false]` `[reject]` Intent reading: fixed prompt requirement must enforce external response — carried: matrix requires populated text messages; external execution is excluded from this deterministic implementation.
  - `[false]` `[reject]` Intent reading: representative generator tests are not exhaustive equivalence — textual extraction preserves actual computations and representative core plus application regressions pass; no changed algorithm identified.
  - `[false]` `[reject]` Intent reading: UI mock persistence versus actual persistence — rendered controls plus actual HTTP reopen, DB, archive and Restore tests observe the required surfaces; no missing acceptance surface found.
  - `[false]` `[reject]` Intent reading: archive/launcher changes extend explicit matrix — archive validation preserves persistence admission and launcher repair is explicitly requested by verification feedback; no expanded product behavior.

Edge-case reviewer returned no findings. Verification-gap reviewer returned no gaps. Four review lenses completed at the parent model capability; the fourth launched when a concurrency slot became available, before triage. No review patches were required.

### 2026-10-10 — Review pass (follow-up)

- verdicts: 26 findings — high 0, medium 0, low 11, false 14, maybe-false 1
- findings:
  - `[false]` `[reject]` Existing Projects get no default templates (blind) — carried: acceptance seeds on Project creation; AD9 excludes prototype migration.
  - `[false]` `[reject]` Self-imports through the `@storymapper/core` barrel — six pre-existing core files use the same import; build, typecheck and tests pass, no cycle failure occurs.
  - `[false]` `[reject]` New prompt surface undocumented and no ADR — docs/mcp-tools.md is the generated tool inventory and prompts are not tools; ARCHITECTURE-SPINE.md:181 already records the persisted-template and MCP-prompt decision.
  - `[low]` `[reject]` Default instructions mention inputs the prompt never supplies; empty Examples/Output schema lines — defaults are the moved core text and Product Context is the specified supplied input; a fix adds branches or new declarations.
  - `[low]` `[patch]` Tool-count pin `toHaveLength(87)` weakened to the enum length in http.test.ts and stdio-main.test.ts — restored the literal 87 (4 places); manifest still exposes 87 tools.
  - `[false]` `[reject]` Deferred-work ledger DW-56/DW-58 contradict — the orchestrator owns ledger entries; the invocation forbids modifying them.
  - `[low]` `[patch]` Redundant project/template existence checks and dead `requireEntity` in ai.use-cases.ts — repository already throws not_found; removed the three checks and the unused import.
  - `[low]` `[reject]` prompts.ts repeats access gating, per-project settings reads, no prompt-read audit — settings reads are local SQLite; AD-6/ADR 0001 audit tool calls and prompts are not tools; no divergence demonstrated and a fix is a refactor.
  - `[low]` `[reject]` No size or count bounds on template fields — loopback local-first tool, existing contract schemas are equally unbounded; a fix adds limits not requested.
  - `[low]` `[reject]` Editor UX gaps (client validation, unsaved-edit warning, delete confirm, restore defaults, static dropdown, fieldset legend) — nice-to-have additions; static dropdown carried from pass 1; server validation already refuses invalid input.
  - `[false]` `[reject]` Unrelated launcher/fixture/hygiene changes bundled — requested by the verification-repair feedback and listed under KEEP.
  - `[low]` `[reject]` Moved code keeps indentation, push pattern and repeated default fields — intent requires no algorithm change; cosmetic only.
  - `[low]` `[reject]` HTTP route shapes inconsistent — existing routes already mix body and path Project scoping; cosmetic.
  - `[false]` `[reject]` Template activity too thin and archive error lacks template ID — intent forbids full template payloads in logs; metadata-only Activity is required.
  - `[false]` `[reject]` PATCH schema accepts duplicate argument names — repository re-parses with aiFunctionTemplateSchema and ZodError maps to a validation DomainError before any write.
  - `[false]` `[reject]` One corrupt stored row breaks prompts/list — archive import and every write validate rows; reaching it needs direct DB tampering and failing loudly is the intended behavior.
  - `[maybe-false]` `[reject]` Empty-string storyMapId from hosts is refused — would only be low if real (host-specific behavior, a fix adds a branch); settles by observing a host that sends empty optional arguments.
  - `[low]` `[reject]` Unbounded template sizes (duplicate of the bounds row) — same reason.
  - `[low]` `[reject]` portClosed rejects after a 500 ms connect stall — loopback connects complete or refuse immediately; fail-fast is intentional and a retry adds complexity.
  - `[false]` `[reject]` Ledger inconsistency (verification gap) — same as the ledger row above.
  - `[false]` `[reject]` Reading B: persisted templates should drive generators — carried: the Never clause excludes local interpretation of template instructions; the selector is independent by design.
  - `[false]` `[reject]` Existing Projects not backfilled (intent audit) — carried.
  - `[false]` `[reject]` sprint-status.yaml modified in the tree — orchestrator-owned bookkeeping, not part of the reviewed diff and not touched here.
  - `[false]` `[reject]` Scope bleed into scripts/hygiene/ledger/README — repair feedback and package removal require them.
  - `[false]` `[reject]` Live-update test uses a synthetic aiTemplate event — logActivity writes affectedEntityType aiTemplate on every template commit, so the server emits it.
  - `[low]` `[reject]` Last-write-wins not asserted and default prompt only bridge-tested — behavior follows from the absence of a version check and covered prompt paths; a fix is boilerplate tests.

Verification after patches: server src/application/ai, src/mcp and src/http/routes suites 170 passed; `node scripts/verify.mjs` passed (hygiene, capability parity, typecheck, build).

## Design Notes

Project-qualified prompt names avoid collisions because prompts/list has no Project argument. Reserved storyMapId selects exact existing context scope; declarations carry string argument values. Prompt messages include editable instructions and values plus a fixed ChangeSet-only contract. Custom instructions are Agent prompts; they are never interpreted by local generators. Keep the generator selector limited to its existing request enum, including the dedicated grooming action separately.

## Verification

- Node 24 + `corepack pnpm test` — relevant functional suites pass; record inherited failures accurately.
- `node scripts/verify.mjs` — hygiene, capability parity, typecheck and build pass.
- Real HTTP/stdio SDK prompt tests and UI CRUD interaction tests — outer surfaces satisfy persistence, population and safety acceptance.

### Implementation verification (2026-10-10)

Node24.17.0 package suites pass: contracts50, importers2, core30, web170, DB247, server362 plus5 audit-performance cases (866 total). Full script gate77 tests:76 passed, one inherited Node/Undici setTypeOfService EINVAL (buglog story-3-7-recovery-node-tos); unchanged isolated abrupt-launcher case passes. Offline uv Python3.12.14 prerequisite provisioned. Parent repaired removed-package fixture/hygiene paths, stale scoped web fixture, lifecycle response-log cleanup and template live invalidation; all assertions retained.

Matrix audit: DB ai-templates tests cover atomic default seed/rollback, edits/arguments/deletion/reopen and scope isolation; rendered TemplateEditor tests cover create/edit/delete and retained drafts; HTTP SDK prompt test covers qualified duplicate names, declared args, exact complete contexts, foreign scopes, unknown names, revocation and no domain mutation; runtime reopen test covers HTTP persistence plus GetProductContext; actual stdio bridge tests cover prompts/list/get. Existing MCP/HTTP proposal tests cover unchanged deterministic proposed operations. Every covering test ran and passed in the package gate.

Release verification: `node scripts/verify.mjs` passes Git/source hygiene,111-capability parity, workspace typecheck and build.

### Re-derivation requirements (2026-10-10)

`packages/db/src/archive-database.ts` — validate every ai_function_templates record using shared contracts before archive activation; malformed JSON or declarations must produce typed validation refusal with old runtime/data preserved. Extend existing archive tests with rich metadata roundtrip and invalid-input cases. Metadata belongs in populated prompts and human template controls; outputSchemaName null in PATCH explicitly removes it.

## Preserved implementation

Parent saved the reviewed implementation excluding story/OpenWolf bookkeeping to `/tmp/story-3-12-preserved-implementation.patch`. Reuse working behavior from this patch, then apply the amendments above; do not restore forbidden Agent CRUD tools. KEEP: transactional scoped seed/CRUD and metadata-only Activity, exact Product Context scope/access revocation, actual HTTP/stdio prompt callbacks, core generator behavior/IDs/provenance, removal of ai workspace, lifecycle completion-log wait, moved hygiene/check-out paths, scoped fixture keys, template live invalidation, all passing functional/wire tests and their original assertions. Preserve the original baseline revision. Sprint-status.yaml was never changed or staged.


## Deterministic Verification Repair

Resume input: repair the exact failed full `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH corepack pnpm test` gate from `.bmad-loop/runs/20261010-130543-b551/feedback/3-12-persisted-product-context-and-templates-as-mcp-prompts-2.md`. Investigate and repair the `setTypeOfService EINVAL` launcher shutdown verification failure without suppressing errors or weakening server shutdown assertions. Preserve the frozen intent contract and all prior implementation. Never write, stage or revert sprint-status.yaml.

## Auto Run Result

Status: done

Summary: Project-owned function templates persist in `ai_function_templates` (seeded from core on Project creation), have human-only CRUD in the application layer, HTTP and the UI editor, and are offered as Project-qualified MCP prompts with exact-scope Product Context and a fixed ChangeSet-only requirement. Deterministic generators moved into `packages/core/src/proposals`; `packages/ai` is removed.

Files changed in this follow-up pass:
- apps/server/src/application/ai/ai.use-cases.ts — removed three redundant existence checks and the unused import.
- apps/server/src/mcp/http.test.ts, apps/server/src/mcp/stdio-main.test.ts — restored the independent `87` tool-count pin.

Review findings: 26 triaged; 2 patched (both low), 0 deferred, 24 rejected with the reasons logged above.

Follow-up review recommended: false (no high patched on this follow-up pass; patched counts: high 0, medium 0, low 2).

Verification: server suites (ai, mcp, routes) 170 tests passed; `node scripts/verify.mjs` passed with hygiene, 111-capability parity, workspace typecheck and build.

Residual risks: Projects created before this schema have no seeded templates (excluded by AD9). No commit was made: the frozen intent says no commits unless the user asks, and the orchestrator-owned sprint-status.yaml row stays modified and unstaged, so the working tree is intentionally not clean.
