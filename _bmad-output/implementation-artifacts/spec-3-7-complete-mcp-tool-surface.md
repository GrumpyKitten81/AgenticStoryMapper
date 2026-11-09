---
title: Complete MCP tool surface
type: feature
created: 2026-10-08
status: done
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: ee03d97493f853f3198bb6fe1d15515b99e33e5b
context: [AGENTS.md]
warnings: [oversized]
deferred:
  - summary: >-
      Ownership scans may cause noticeable latency for large linked Source Document snapshots.
    evidence: |-
      The resolver scans Projects and document details once per linked chunk. No measured latency or representative large-project workload establishes the user-visible harm. A benchmark with many documents and linked chunks would settle it; if material, targeted repository ownership lookups or call-local indexing would address it.
    location: >-
      apps/server/src/mcp/tools/project-scopes.ts:37-64,110
    severity: medium (unverified)
  - summary: >-
      Agent mutations still use direct application writes pending the explicitly staged Epic 4 operation registry and executor.
    evidence: |-
      The pre-existing MCP adapters already perform direct writes; Story 3.7 acceptance expressly records operation-registry membership as an Epic 4 gap. This inventory expansion preserves that staged design and verifies only application of already human-approved ChangeSets, not universal ChangeSet-first routing. The broader repository policy remains unmet until the Epic 4 work lands.
    location: >-
      apps/server/src/mcp/tools/register-tools.ts and generated docs/mcp-tools.md
    severity: high
  - summary: >-
      ListChangeSets may slow down on a large Activity log because each applied-delete ChangeSet rescans all Activity.
    evidence: |-
      historicalScopeResolvers calls repository.listActivity() without a Project filter and rebuilds the owner map once per ChangeSet that contains a delete. Cost grows with applied-delete ChangeSets times Activity rows, but no measurement shows user-visible latency. A benchmark with many applied-delete ChangeSets and a large Activity log would settle it; if material, build the owner index once per ListChangeSets call or add an indexed repository query.
    location: >-
      apps/server/src/mcp/tools/project-scopes.ts:98-140
    severity: medium (unverified)
---

Reproducing statement: Execute bmad-build-auto for Story 3.7 to expose all nonhuman application capabilities as usable MCP tools, generate inventory and enforce parity; never write, stage, revert or infer verification from orchestrator-owned sprint-status.yaml. Date: 2026-10-08. Version: 3. Changelog: Applied the operator content-only policy, completed pending review repairs and independently verified historical ownership and discovery constraints.

<intent-contract>

## Intent

**Problem:** Only 24 of 105 capabilities have MCP tools. Missing capabilities include Story Map creation, Roadmaps and children, customization, Source Documents, reports, exports and ChangeSet listing. Existing SDK registration omits input schemas and discards arguments.

**Approach:** Expose every read/write capability outside the human-only boundary through shared application use cases and contracts. Generate the tool inventory from the capability manifest and fail parity checks on missing or orphaned mappings.

## Boundaries & Constraints

**Always:** Retain existing tool names and behavior while supplying usable shared Zod input schemas. Reuse required ActorContext, UnitOfWork, repository access and typed error mapping. Enforce actual owning/touched Project safety for each call, including mismatched IDs and multi-target operations; filter runtime-wide reads to accessible Projects. Agents can apply only already human-approved ChangeSets. Follow explicit FR-30 customization capability requirements. Project creation stays human-only under the architecture aggregate register. Document every human-only descriptor, including safety changes, connector credential control, approval/rejection, restore/manual restore points, archive import/export and UI checklist bookkeeping. Keep the existing runtime-scoped transport policy. Generate docs/mcp-tools.md during build from manifest and compare against actual registration. Explicitly retain operation-registry membership as a known gap for Epic 4.

**Never:** Change sprint-status.yaml; add an LLM, telemetry or another SQLite writer; expose human-only tools; invent runtime authorization for Project creation; implement the Epic 4 operation registry/executor or Story 3.8 audit expansion; alter personal credentials or user databases; substitute direct registry tests for wire acceptance; let MCP agents read arbitrary host files via `ImportSourceDocument.filePath`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Inventory | Manifest and initialized SDK client | One tool for each eligible descriptor with shared input schema | Parity rejects missing/duplicate/orphan tools |
| New surface | Disposable accessible Project; required arguments | Story Maps, Roadmaps/children, customization, Source Documents, reports/exports and ChangeSet listing execute shared use cases | Typed validation/not-found errors |
| Safety | Disabled or protected Project; mismatched scopes or multi-target input | No unauthorized write or disabled data exposure | disabled/protected without data mutation |
| Approval | Proposed versus human-approved ChangeSet | Only approved ChangeSet applies when writes allowed | Proposed/rejected application refused |
| Generation | Build, stale docs or descriptor-less use case | Deterministic manifest inventory; parity detects drift | Check exits unsuccessfully |

</intent-contract>

<frozen-after-approval reason="operator choice Option A during bmad-loop resolve 20261008-132154-6706">

## MCP Source import (Option A)

`ImportSourceDocument` over MCP is **content-only**: required non-empty `content`; `filePath` is not in the MCP input schema and must be rejected on the wire (strict validation). Agents must not trigger `readFileSync` or otherwise read host paths.

The HTTP `/api/source-documents/import` route keeps the existing human-facing contract (`content` or `filePath`) unchanged.

After this policy is implemented, apply the review triage patches previously marked moot (ListChangeSets delete visibility, missing permission/owner/coverage tests, inputSchema pinning, orphan fixture removal) unless superseded by review.

</frozen-after-approval>

## Code Map

- `apps/server/src/application/**/**.use-cases.ts`, `descriptors.ts` — 105 descriptors (26 human-only,28 read,51 write); 24 tool mappings. Nine customization CUD descriptors/guards contradict explicit FR-30; promote them to writes. `createProject` incorrectly lacks the human-only guard required by AD-17 Project aggregate register (architecture spine line140).
- `apps/server/src/mcp/tools/register-tools.ts` — shared invocation, attribution and safety reuse points; private project resolvers trust supplied scope on existing release/persona updates. Split registrations into bounded modules as inventory grows; guard actual entity owners and all supplied targets.
- `packages/contracts/src/mcp/tools.ts` and existing request schemas — tool names/inputs/results are contract source. SDK accepts Zod object directly; reuse request schemas instead of duplicating fields.
- `packages/mcp/src/tool-definitions/tools.ts`, `transports/server.ts` — static24 tool metadata; missing inputSchema discards wire arguments. Generate metadata from manifest and attach contract schemas during SDK registration.
- `scripts/capability-scan.mjs`, `check-capabilities.mjs`, `generate-capability-manifest.mjs`, `package.json` — static AST scan checks descriptor/export and actual routes/tools; generation currently only writes JSON and build omits it. Extend checks to nonhuman coverage and generated docs; preserve actual registration validation.
- `apps/server/src/application/capability-manifest.test.ts`, `mcp-http-parity.test.ts`, `mcp/http.test.ts`, `mcp/stdio-main.test.ts`, `mcp/tools/register-tools.test.ts`, `scripts/capability-scan.test.mjs` — existing parity/safety/transport tests; remove hardcoded24/empty-schema expectations. Real wire writes must establish persisted host/session attribution and disabled-target refusal now that arguments survive.
- `docs/mcp-tools.md` — currently hand-maintained24 tools; replace through deterministic generation. `ChangeOperation` currently has generic entity/op fields and no operation registry; Epic4.4–4.7 owns registry/executor/ChangeSet routing.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/mcp/tools.ts`, `packages/mcp/src/tool-definitions/tools.ts`, `transports/server.ts` — add complete names and reusable schema mapping; generate metadata and preserve actual wire arguments.
- [x] `apps/server/src/application/**/**.use-cases.ts`, `mcp/tools/**` — classify nine customization writes and Project creation correctly; register all eligible capabilities using existing use cases and actual Project ownership checks.
- [x] `scripts/capability-scan.mjs`, `check-capabilities.mjs`, `generate-capability-manifest.mjs`, `package.json`, manifest and `docs/mcp-tools.md` — generate complete inventory during build, list human-only boundary and Epic4 known gap, enforce bidirectional parity and drift checks.
- [x] Relevant registry/parity/scanner/HTTP/bridge tests — execute representative new capability families, existing typed calls, approval restrictions, global filtering, hostile cross-scope and multi-target safety, wire attribution and matrix failures.

**Acceptance Criteria:**
- Given the manifest, when a capability is read/write and outside the human-only boundary, then an initialized MCP client discovers a usable tool for it, including every family named by Story3.7.
- Given the generated documentation, when build completes, then its inventory matches the manifest and actual registered tools, and lists the required human-only actions and operation-registry gap.
- Given a missing descriptor, an eligible capability without a tool or an orphan route/tool, when parity runs, then it fails.
- Given runtime sessions and conflicting Project switches, when calls specify actual or mismatched entity IDs, then safety applies to every touched Project and disabled data stays undisclosed.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass

- verdicts: 22 findings (21 review-layer findings and one parent repair audit) — high 7, medium 10, low 0, false 4, maybe-false 1
- findings, in layer completion order:
  - `[medium]` `[patch]` Edge: foreign Roadmap swimlane — both Projects can be accessible, while the repository validates column ownership but accepts a foreign swimlane. Add the missing matching-Roadmap check after permission checks and assert no invalid card is persisted.
  - `[medium]` `[patch]` Edge: rejected repeat initialization changes recovery identity — the bridge overwrites saved params before forwarding; SDK rejects repeated initialize while later recovery consumes the rejected params. Preserve accepted initialization identity and exercise recovery after rejection.
  - `[high]` `[patch]` Edge: ChangeSet operations expose disabled data — the accessible-parent hostile fixture contains an operation targeting hiddenCard, but ListChangeSets checks only parent access. Filter operation dependencies before returning the payload.
  - `[medium]` `[patch]` Blind: every GetCardHistory call fails — the handler passes cardId in the query, and listCardHistoryPage parses a strict schema containing only beforeVersion and limit. Separate the selector from the query and execute pagination.
  - `[high]` `[patch]` Blind: defaultConnectionId bypasses authorization — UpdateStoryMap accepts this field and persistence stores it; the generic resolver has no alias, so a disabled/protected connection owner is unchecked. Resolve the supplied connection owner before calling the use case.
  - `[medium]` `[patch]` Blind: bulk Persona/Annotation targets bypass authorization — all four add/remove fields reach repository operations, while collectScopes ignores their names. Map them to their existing resolvers and verify refusal precedes writes.
  - `[high]` `[patch]` Blind: ChangeSet listing checks only parent access — independently verified against ListChangeSets and its hostile fixture; group with the edge finding and filter existing targets plus before/after/context dependencies.
  - `[high]` `[patch]` Blind: implicit pull connections are unchecked — pullStoryMapWorkItems selects connections from stored remote links and invokes bidirectional sync; its shared guard checks github, not agentAccess/agentProtection. Collect selected connection scopes before invocation and test refusal before network work.
  - `[high]` `[patch]` Blind: sync health can expose foreign connection data — getWorkItemSyncHealthData returns stored links, open conflicts and SyncRuns, but MCP scopes include only storyMapId. Authorize the owning connections of the returned dependencies.
  - `[medium]` `[patch]` Blind: dangling Roadmap references break reads — DeleteCard/DeleteRelease preserve roadmapReferences, while requiredScope rejects their absent targets; the shared domain read still returns the Roadmap. Ignore absent stored read targets while preserving existing-target authorization and strict explicit inputs.
  - `[medium]` `[patch]` Blind: foreign Roadmap swimlane accepted — independently verified against createRoadmapCard, which checks only column.roadmapId. Group with the edge finding and add matching-lane validation.
  - `[medium]` `[patch]` Blind: malformed wire input loses typed validation — installed SDK validateToolInput runs before our callback and its createToolError returns plain text. Use the supported request-handler API with shared contracts and assert typed JSON code validation on the wire.
  - `[maybe-false]` `[defer]` Blind: repeated ownership scans block large Projects — nested scans are real, but no benchmark establishes observable latency at the cited surface. Record medium unverified; measure representative document/chunk workloads before selecting an optimization.
  - `[false]` `[reject]` Intent: inventory does not enumerate every UI workflow — no missing eligible UI capability was identified. Story 3.7 explicitly anchors parity to exported application descriptors and excludes the listed human-only actions; the actual registered inventory is compared with that manifest.
  - `[false]` `[reject]` Intent: broad family tests use the registry — those tests intentionally compare the shared adapters/application behavior; actual SDK tests independently verify discovery, all advertised property sets, argument forwarding, mutations and safety. The descriptive surface difference does not demonstrate an unfulfilled story requirement.
  - `[false]` `[reject]` Intent: wire execution covers representative families — every registered tool uses the same validated forwarding adapter, and all 87 names/input shapes are discovered through the SDK. No distinct untested protocol branch or broken family was claimed; representative transport acceptance is supported by direct family execution.
  - `[high]` `[defer]` Intent: universal ChangeSet-first routing remains unmet — the direct-write pattern predates this change and the named story expressly defers operation-registry parity to Epic 4. Record the architectural debt rather than claim this approval test proves universal routing.
  - `[false]` `[reject]` Intent: web repairs are outside MCP expansion — the prior unchanged full-suite failures were reproduced and the four edits minimally repair current assertions/mock and centralized punctuation without adding a user flow. No harmful behavior or unrequested feature was identified.
  - `[medium]` `[patch]` Verification: file-only Source import lacks execution coverage — pre-verified searches find inline-only MCP tests; the separate HTTP test cannot cover readFileSync in the MCP handler. Add a temporary-file call and inspect persisted hash, chunks and provenance.
  - `[medium]` `[patch]` Verification: accessible Source Document linked to disabled Card lacks coverage — pre-verified searches show own-document denial and snapshot/Roadmap tests but no linked-Card refusal for GetSourceDocument. Add that exact fixture and assert disabled.
  - `[medium]` `[patch]` Verification: runtime lists lack accessible inclusion assertions — pre-verified tests would accept empty arrays and do not seed a permitted source in this case. Assert permitted document/ChangeSet IDs appear while hidden records and hostile operations stay absent.
  - `[high]` `[patch]` Parent repair audit: invocation still skipped existing entities claimed as future aliases — an approved ChangeSet can link a hidden Card first, then create a Card claiming that ID; the executor has not populated idMap at the first operation and source-link persistence lacks the per-Project agent guard. Apply the same existing-owner-first rule to invocation. The regression refuses disabled, preserves approved status, and proves no Card/source-link mutation; a genuine new-card proposal still applies with generated links. Group with ChangeSet dependency filtering.

Grouped patch entries: high 3 (omitted scope aliases; ChangeSet dependency filtering/alias masking; implicit sync connection dependencies), medium 8 (Roadmap lane; recovery identity; history query; dangling Roadmap read; typed SDK validation; file import coverage; linked-document coverage; runtime-list inclusion coverage). Duplicate findings retain separate rows above. Deferred entries: 2. Rejected findings: 4. All 11 entries were repaired by the original implementation agent and its re-engaged transport contributor; focused application36/surface10 and wire11 checks passed. Full parent verification follows below.

### 2026-10-08 — Review pass (follow-up)

- verdicts: 41 findings — high 3, medium 7, low 14, false 13, maybe-false 4
- findings, in layer completion order (Blind 18, Edge 11, Verification-gap 8, Intent 4):
  - `[high]` `[intent_gap]` Blind: ImportSourceDocument reads any local path for an agent — `register-content-tools.ts:16` calls `readFileSync(parsed.filePath!)` on agent input; an agent with write access can ingest `.env` (GITHUB_TOKEN) and read it back via GetSourceDocument, against the AGENTS.md token policy. The spec does not say whether agents may import by `filePath`, and the smallest fixes (drop `filePath` for agents, or confine to a directory) change the public tool contract and the earlier file-only test; needs a human decision. Saved the reviewed diff as `spec-3-7-complete-mcp-tool-surface-intent-gap.patch`.
  - `[low]` `[reject]` Blind: file-read logic duplicated with the HTTP route and fs errors unclassified — HTTP route has the same behavior (pre-existing); moot beside the intent gap.
  - `[false]` `[reject]` Blind: scope authorization fails open for id-like keys without resolver — enumerated every `*Id` key in contracts request/tool schemas; the only keys without a resolver (`remoteId`, `syncRunId`, `mcpSessionId`, `externalCallId`, `auditEventId`) are not tool inputs.
  - `[maybe-false]` `[defer]` Blind: assertMatchingScopes covers four pairs only — repository validates Persona/Annotation (`customizations-repository.ts:177,273`) and column ownership; cross-Project RoadmapReference targets and similar pairs between two write-enabled Projects are unverified. Would settle it: a CreateRoadmapReference with a card from a second enabled Project. Medium (unverified).
  - `[maybe-false]` `[defer]` carried Blind: repeated ownership scans per call — carried from the deferred ownership-scan entry; same location and claim.
  - `[false]` `[reject]` Blind: unresolved target type crash, audit under projectIds[0], unused toolName — `targetType` enum is `release|card`, both resolvers exist; each touched Project is authorized separately (`register-tools.ts:259`); multi-Project audit expansion belongs to Story 3.8.
  - `[low]` `[reject]` Blind: input parsed three times — redundant but harmless; developer-only.
  - `[low]` `[reject]` Blind: hand-written tools/call handler overrides the SDK — introduced by the earlier typed-validation repair; no skipped SDK behavior demonstrated.
  - `[medium]` `[patch]` Blind: stdio exact-schema baseline removed — grouped with the inputSchema pinning gap below; moot this pass.
  - `[high]` `[defer]` carried Blind: direct agent writes bypass ChangeSet-first — carried from the deferred operation-registry entry (Epic 4).
  - `[low]` `[reject]` Blind: generated descriptions are humanized identifiers ("Git Hub", "Ai") — cosmetic for model-facing text; fix means authoring 63 descriptions.
  - `[false]` `[reject]` Blind: permission classes inconsistent — exports write files under the Project (write is the conservative class); legacy GitHub link records are local rows with no network call.
  - `[low]` `[reject]` Blind: generator embeds Story 3.7 date/version narrative in the doc — deterministic; no caller diverges.
  - `[false]` `[reject]` Blind: build rewrites tracked files — the spec requires generation during build; `check-capabilities` detects drift.
  - `[low]` `[reject]` Blind: descriptor formatting churn — cosmetic.
  - `[false]` `[reject]` Blind: bridge replays stale initialize params — a session id only exists after a successful initialize, whose params are recorded in the same forward (`mcp-bridge.mjs:79`); already repaired in the first pass.
  - `[false]` `[reject]` carried Blind: unrelated UI changes — carried from the rejected "web repairs" row.
  - `[medium]` `[patch]` Blind: mutating tools lack coverage — grouped with the uncalled-tools gap below; moot this pass.
  - `[medium]` `[patch]` Edge: applied ChangeSets with delete operations vanish from ListChangeSets — `canReadChangeSet` treats the deleted entity as unresolved (`project-scopes.ts:99-107`). Smallest fix: add delete operations' entityIds to `createdIds`. Moot this pass (intent_gap precedence); apply on re-drive.
  - `[maybe-false]` `[defer]` Edge: cross-entity pairs unchecked — same entry as the assertMatchingScopes row above.
  - `[high]` `[intent_gap]` Edge: arbitrary filePath import — same defect as the first row.
  - `[low]` `[reject]` Edge: not_found versus disabled reveals entity existence — IDs are unguessable UUIDs.
  - `[false]` `[reject]` Edge: other read tools expose linked data — `getCardDetails` returns only the Card; legacy GitHub links carry no connection; reports and exports take a Project scope.
  - `[low]` `[reject]` Edge: stale delete in an approved ChangeSet gives not_found before apply — existing tests still expect `conflict` from the executor.
  - `[false]` `[reject]` Edge: bridge recovery with undefined params — see the bridge row above.
  - `[false]` `[reject]` Edge: removed listProjects check — `resolveToolProjectIds` still throws `disabled` for unavailable Projects (`project-scopes.ts:126`).
  - `[maybe-false]` `[defer]` Edge: claim that mismatched IDs across two enabled Projects are accepted — same entry as above.
  - `[low]` `[reject]` Edge: claim that disabled data stays undisclosed — only existence of an unguessable ID is distinguishable.
  - `[false]` `[reject]` Edge: claim that GitHub link tools need the GitHub switch — doc says "GitHub calls"; those tools make no network call.
  - `[medium]` `[patch]` Verification: permission class of PlanWorkItems, ResolveSyncConflict and CreateAiProposal is not pinned by any test (pre-verified). Add refusal tests with github off and agentProtection on. Moot this pass.
  - `[medium]` `[patch]` Verification: owner resolvers for statusId, templateId, linkId, conflictId, attachmentId, roadmapCardId, columnId and roadmapId lack hostile cross-Project tests (pre-verified). Moot this pass.
  - `[medium]` `[patch]` Verification: about 26 new tools are never invoked by any test (pre-verified). Add a table-driven call per tool. Moot this pass.
  - `[medium]` `[patch]` Verification: exact tools/list inputSchema pinning removed (pre-verified). Assert `required` equals the contract JSON Schema for each tool. Moot this pass.
  - `[low]` `[reject]` Verification: unknown tool name over the wire is untested — single guarded branch; the layer filed it as low risk.
  - `[low]` `[patch]` Verification (other): `fixtures/stdio-tools-sdk1.json` is unreferenced — delete it. Moot this pass.
  - `[low]` `[reject]` Verification (other): humanized descriptions — same as the Blind row.
  - `[false]` `[reject]` Verification (other): bridge params after early 404 — see the bridge row above.
  - `[false]` `[reject]` carried Intent: wire tests cover a subset of tools — carried from the rejected "wire execution covers representative families" row.
  - `[false]` `[reject]` Intent: stdio and restore-point expectations changed — the changes follow from arguments surviving the wire and from Snapshot tools now existing.
  - `[low]` `[reject]` Intent: contract tool names are hand-maintained beside the manifest — parity tests fail on drift.
  - `[low]` `[reject]` Intent: humanized descriptions — same as the Blind row.

Outcome: intent_gap — no code changed in this pass, and committed work `ee03d97` was left in place. Open question for the human: may agents call ImportSourceDocument with a local `filePath`? Options: content-only for agents, or confinement to an allowed directory. The verified patch entries marked "moot this pass" (ListChangeSets delete operations, permission-class and owner-resolver tests, uncalled-tool tests, inputSchema pinning, orphan fixture) should be applied once the question is settled.

### 2026-10-08 — Content-only repair review pass

- verdicts:13 findings — high3, medium7, low0, false3, maybe-false0. Verification-gap and Edge layers returned no findings. The platform refused a fourth reviewer thread; the context-free Blind reviewer separately completed Intent alignment after its defect review.
- findings, in reporting order (Blind9, Intent4):
  - `[high]` `[patch]` Blind: absent applied deletion target loses former ownership — global exemption at project-scopes.ts:99 accepts an absent foreign Card with title-only before data. Restrict the specific target reference to repository-backed historical ownership; refuse unprovable ownership and test a deleted disabled Card.
  - `[high]` `[patch]` Blind: untyped deletion allowance exempts unrelated dependencies — collectScopes shares createdIds across every resolver, so a missing documentId matching a deleted Card ID is accepted. Keep typed unrelated dependencies unresolved and filtered.
  - `[medium]` `[patch]` Blind: deletion history disappears after its Story Map dependency is removed — before.storyMapId still requires a live map. The current lifecycle fix must use established historical ownership for that dependency or refuse when no evidence exists; exercise actual map deletion.
  - `[medium]` `[patch]` Blind: nonblank content is absent from discovery — Zod refine emits only type:string. Replace it with native equivalent constraints and assert advertised validation.
  - `[medium]` `[patch]` Blind: Persona add/remove can mask missing insertion persistence — table asserts envelopes and final empty links only. Assert stored insertion before deletion.
  - `[medium]` `[patch]` Blind: park/unpark lacks persisted intermediate evidence — returned parked fields alone permit false success. Read stored Card after both transitions.
  - `[medium]` `[patch]` Blind: link update is masked by later deletion — table checks returned issueNumber3 but only final missing link. Read stored updated link before deletion.
  - `[medium]` `[patch]` Blind: protected proposal success lacks persistence/list evidence — current assertion checks returned status. Assert stored operations, proposed status and ListChangeSets inclusion under protection/GitHub-off, while retaining unchanged Cards.
  - `[false]` `[reject]` Blind: human mixed content/file precedence has no acceptance — http/routes/unit-of-work.test.ts:93-95 sends both after deleting the actual file and verifies inline hash with supplied path. All27 tests in that suite ran and passed; the human handler is unchanged.
  - `[medium]` `[patch]` Intent: discovery nonblank/runtime mismatch — same demonstrated constraint omission as Blind; grouped with native schema repair.
  - `[false]` `[reject]` carried Intent: execution coverage is chiefly registry while discovery covers both transports — the prior triage rejects this same surface claim: all tools share the forwarding adapter and representative wire writes cover its branches. This pass adds real Source boundary refusals/persistence and exact87 schemas; no broken distinct protocol branch was identified.
  - `[false]` `[reject]` Intent: human combination coverage and strict unknown fields diverge — frozen Option A explicitly requires strict validation; existing unchanged HTTP mixed-input precedence is executed at unit-of-work.test.ts:93-95. The implemented human/agent distinction follows the operator decision.
  - `[high]` `[patch]` Intent: absent deletion rests on enclosing Project rather than actual historical owner — same verified deletion root cause; grouped with typed ownership repair.

Grouped patches:1 high historical-dependency authorization entry and3 medium entries (advertised content constraint, intermediate persistence assertions, protected proposal persistence). Existing deferred items are retained; no new deferred items were introduced by this pass. All four grouped entries were repaired by the re-engaged implementation agent. Native regex advertises the existing nonblank requirement; canonical typed deletion Activity establishes historical ownership; intermediate writes and protected proposals have direct persisted assertions. Parent added real restore and contradictory-owner regressions. The original defect reviewer independently re-probed and confirmed findings1-4 resolved, and withdrew the human mixed-input claim. Final parent gates below passed.
### 2026-10-08 — Review pass (follow-up 2)

- verdicts: 31 findings — high 0, medium 3, low 12, false 13, maybe-false 3
- findings, in layer completion order (Blind 14, Edge 11, Verification-gap 3, Intent 3); diff scope: `ee03d97..HEAD` excluding `_bmad-output` and `.wolf`:
  - `[medium]` `[patch]` Blind: delete scope coverage covers only card and storyMap — `deletedScopeTypes` maps release, persona, githubLink, sourceLink and parentId, but no test deleted any of them. Added a test that deletes accessible and hidden instances of each through the repository and asserts only the accessible ChangeSets are listed (grouped with the Verification-gap and activity-name-coupling rows).
  - `[false]` `[reject]` Blind: unmapped entities (annotation, status, template, attachment, connection) become unreadable — `changeOperationSchema.entity` is only storyMap, card, release, persona, sourceLink or githubLink; all have resolver keys.
  - `[maybe-false]` `[defer]` Blind: full Activity scan per ChangeSet — real structure, unmeasured; recorded as medium unverified.
  - `[medium]` `[patch]` Blind: activity-name coupling (`${type}.deleted`, `cardSourceLink.deleted`) unguarded — names checked against the repositories and all six match; the new per-entity test pins them. Grouped with the first row.
  - `[low]` `[reject]` Blind: identity comparison `operationResolvers !== resolvers` and a discarded `entityId` — readable enough, no divergence named, and extracting a function is a refactor beyond a direct correction.
  - `[false]` `[reject]` carried Blind: removed SDK fixture leaves schema equality self-referential — the earlier "inputSchema pinning" patch asked for contract-equal schemas on both transports; the contract itself is pinned by `tool-inputs.test.ts`.
  - `[low]` `[reject]` Blind: schema-equality loop duplicated in HTTP and stdio tests — test-only duplication; no divergence named.
  - `[low]` `[reject]` Blind: unrecognized-key error for `filePath` lacks a hint — zod names the key; the tool description and docs state content-only.
  - `[low]` `[reject]` Blind: no upper bound on inline content — the HTTP route has the same unbounded content (pre-existing) and server body limits apply.
  - `[low]` `[reject]` Blind: inline provenance path `inline://<slug>` is not unique — pre-existing repository behavior (`sources-repository.ts:25`) for every content import; chunk and document IDs carry provenance.
  - `[low]` `[reject]` Blind: no ADR for content-only import — the decision is frozen in the spec and docs; it is a local boundary, not a cross-module architecture decision.
  - `[low]` `[reject]` Blind: version and changelog duplicated in generator and doc — the doc is generated output and drift fails `check-capabilities`.
  - `[false]` `[reject]` Blind: owner-resolver test lacks a positive control — it asserts the exact `disabled` and `protected` codes, which an unrelated validation failure cannot produce; positive paths are covered in the earlier tests.
  - `[low]` `[reject]` Blind: module-wide `createWorkItemProvider` mock — scoped to this file, restored per test, and no other test here reaches a provider.
  - `[maybe-false]` `[defer]` carried Edge: full Activity scan per ChangeSet — same entry as the Blind row.
  - `[false]` `[reject]` Edge: five entity types missing from `deletedScopeTypes` — not operation entities, see above.
  - `[false]` `[reject]` Edge: entities without a resolver key drop the ChangeSet — all six operation entities have one.
  - `[false]` `[reject]` Edge: cascade-deleted links lose ownership evidence — a ChangeSet delete of a link logs its own event when applied, before any later Card deletion.
  - `[false]` `[reject]` Edge: non-applied ChangeSets with deletes are hidden — status values are proposed, approved, applied, rejected or conflict; a conflict ChangeSet has not deleted its targets, so live resolvers work.
  - `[low]` `[reject]` Edge: symbol-only titles yield `inline://` — pre-existing behavior of the shared repository path, also taken by the human route.
  - `[low]` `[reject]` Edge: same-title imports share one inline path — same pre-existing behavior as above.
  - `[low]` `[reject]` Edge: unbounded or zero-width-only content — same as the Blind bound row; negligible.
  - `[false]` `[reject]` carried Edge: loosened schemas pass because the test compares against its own source — same as the carried Blind row.
  - `[false]` `[reject]` Edge: deleted fixture still referenced — grep found no references; noted as safe.
  - `[false]` `[reject]` Edge: `CreateCardAttachment` accepts a host path string — the path is only stored (`cards-repository.ts:460,468`); no MCP tool reads it.
  - `[medium]` `[patch]` Verification: historical ownership of deleted release, persona, githubLink, sourceLink and parent untested (pre-verified) — fixed by the new test above.
  - `[maybe-false]` `[defer]` Verification (other): Activity scan per ChangeSet — same entry.
  - `[low]` `[reject]` Verification (other): same-title inline paths — same pre-existing row.
  - `[false]` `[reject]` carried Intent: wire acceptance is chiefly registry-level for safety and approval — carried from the earlier rejected rows; every tool shares one forwarding adapter and wire tests cover discovery, schemas, writes and refusals.
  - `[false]` `[reject]` Intent: no test for the Generation row in this diff — the scanner suite (missing, orphan, duplicate and stale-artifact cases) and the build parity ran in earlier passes and again here.
  - `[false]` `[reject]` Intent: dropping `filePath` conflicts with "retain existing behavior" — resolved by the frozen operator decision (Option A).

Grouped patch: 1 medium (historical-deletion mapping coverage); applied directly because no implementation subagent is available in this run. Deferred: 1 (Activity scan, unverified medium). Rejected: 25 including carried rows. The three medium rows share one root cause and one fix.

## Verification

- Focused contract, registry, scanner, application parity and HTTP/bridge tests establish the changed behaviors with disposable fixtures.
- `corepack pnpm typecheck`, `corepack pnpm check-capabilities`, `corepack pnpm build`, `corepack pnpm test`, `node scripts/verify.mjs`, `git diff --check` must pass. Run build/tests serially because command fixtures use built assets.

### Parent verification — 2026-10-08

- Full combined `corepack pnpm test` passed:687 tests (Scripts73,Contracts22,Core28,Importers2,Web96,DB232,Server234); two existing Windows permission skips. Typecheck,105-capability check, full build and release verify passed. Build retains existing Zod annotation/bundle-size advisories.
- Inventory row: contract schema tests3, manifest parity2 and real SDK discovery ran/passed. New-surface row: complete-surface4 and HTTP/MCP parity10 ran/passed. Safety row: actual-owner/multi-target, linked reads and SDK/bridge disabled/protected tests ran/passed. Approval row: proposed/rejected refusal, human-approved application and cross-Project denial ran/passed. Generation row: scanner8 includes missing/orphan/duplicate/stale-artifact failures; build generation and actual registered-tool/doc parity passed.
- Real HTTP9 and bridge2 tests verify existing/new arguments and persisted host/session after SQLite reopen. Reproduced recovery identity loss was repaired by forwarding original initialization parameters.
- Full gates exposed three unchanged Story3.5 web failures; centralized existing label/state punctuation, updated current disclosure assertions and supplied missing safety query mock. Restore assertions now distinguish Story Map data snapshots from human-only SQLite restore points. Scope resolution retains the existing unavailable-Project disabled contract. Guards and meaningful checks were preserved.

### Post-review parent verification - 2026-10-08

- All required commands passed with exit0: `corepack pnpm typecheck`, `corepack pnpm check-capabilities`, `corepack pnpm build`, `corepack pnpm test`, `node scripts/verify.mjs`, `git diff --check`. Commands ran serially against the repaired tree.
- Full combined suite:693 passed (Scripts73,Contracts22,Importers2,Core28,Web96,DB232,Server240); two existing Windows permission skips. The same run executes surface10, HTTP9 and bridge2 with the review regressions. All five matrix rows have passing executed coverage; file-only import, linked-document refusal, permitted lists, history pagination, typed malformed wire input, rejected initialization recovery and link-first alias masking now have direct assertions.
- Logs: system temporary directory `storymapper-3-7-reviewed-{typecheck,capabilities,build,tests,release-verify,whitespace}.log`. Release verification completed; existing Zod annotation and Vite bundle advisories remain. Frontmatter parsed as YAML with one deferred list preserving both entries.


## Escalation Resolution (2026-10-08)

Operator chose **Option A (content-only for agents)**. Recorded in `<frozen-after-approval>`; `bmad-loop resolve --no-interactive` re-arms follow-up repair/review.


### Content-only repair parent verification — 2026-10-08

- All six gates passed with exit 0: workspace typecheck,105-capability parity, build, full tests, release verify and staged/unstaged whitespace checks. Build and tests ran serially.
- Full suite:699 passed (Scripts73,Contracts22,Importers2,Core28,Web96,DB232,Server246); two existing Windows permission skips. Surface15, HTTP10, bridge2, application parity10 and manifest2 all executed. Wire tests reject missing/blank content, filePath-only and content-plus-filePath without persistence; both supported source types and unchanged human HTTP file import pass. Both transports compare all87 complete input schemas with contracts.
- Matrix audit: Inventory has contract/manifest and real SDK discovery coverage; New surface has surface15 and parity10; Safety has actual-owner/multi-target, linked reads and wire refusal tests; Approval has proposed/rejected denial, approved apply and cross-Project/alias denial; Generation has scanner8 missing/orphan/duplicate/stale checks and build/registry/doc parity. Every covering suite ran and passed.
- Logs are in the system temporary directory as storymapper-3-7-content-repair-{typecheck,capabilities,build,tests,release-verify,whitespace}.log. Existing build advisories remain. The original baseline remains ee03d97493f853f3198bb6fe1d15515b99e33e5b; concurrent external commit9bcc0bcfe5a738b9ab29ae1181a8ded201ba46dc was preserved. Orchestrator sprint status was never written, staged, unstaged or reverted by this session.
### Final repair verification — 2026-10-08

- All six required gates passed with exit0 after the review patches: `corepack pnpm typecheck`, `corepack pnpm check-capabilities`, `corepack pnpm build`, `corepack pnpm test`, `node scripts/verify.mjs`, staged/unstaged whitespace checks. Build and tests ran serially. Full suite:701 passed (Scripts73,Contracts22,Importers2,Core28,Web96,DB232,Server248), with two existing Windows permission skips.
- Surface17, HTTP10, bridge2, application parity10, manifest2 and scanner8 executed and passed. Every matrix row retains passing coverage. Historical deletion tests now cover deleted foreign owners, forged scopes, unknown targets, unrelated same-string IDs, removed Story Maps, actual restore marking Activity undone and contradictory owners with both Projects accessible. Wire discovery explicitly advertises nonblank content and both transports pin all87 complete input schemas.
- Logs: system temporary directory storymapper-3-7-content-final-{typecheck,capabilities,build,tests,release-verify,whitespace}.log. Frontmatter parses with one deferred list and its two original entries. Existing build advisories remain.

## Auto Run Result

Status: done

- Summary: follow-up review of the content-only Source import repair and hardening commits (`ee03d97..HEAD`). One medium finding group (untested historical-deletion ownership for release, persona, githubLink, sourceLink and parent) was patched with a test; no production code changed.
- Files changed: `apps/server/src/mcp/tools/complete-surface.test.ts` (new test pinning deleted-entity ownership mappings and activity names); this spec (triage log, one deferred entry).
- Review findings: 31 (medium 3, low 12, false 13, maybe-false 3). Patched: 1 group (medium). Deferred: 1 (Activity scan per ChangeSet, medium unverified). Rejected: 25, each with its reason in the triage log.
- Follow-up review recommendation: false (follow-up pass; no `high` patched; patched counts: high 0, medium 1 group).
- Verification: `corepack pnpm typecheck`, `check-capabilities`, `build`, `test` (Contracts 22, Importers 2, Core 28, Web 96, DB 232, Server 249 plus Scripts) and `node scripts/verify.mjs` passed serially; `git diff --check` flagged only a trailing blank line in this spec, now removed.
- Residual risks: the deferred Activity-scan cost and the earlier deferred entries (ownership scans, Epic 4 operation registry). Diff scope excluded `_bmad-output` and `.wolf` bookkeeping; orchestrator-owned `sprint-status.yaml` and the deferred-work ledger were not touched.

## Incoming branch execution record (historical)

Date: 2026-10-09. Merge version: 1. Reproducing statement: Consolidate independently edited stories without losing branch evidence. Changelog: Preserve incoming c166011 execution evidence below; canonical implementation and current verification remain above. Incoming MCP Project/onboarding/file-import and audit-storage variants were superseded by the local AD17 boundary, content-only MCP imports, summary API and durable batch implementation. Incoming source-visibility/sync revalidation/shared request contracts/parity improvements were integrated. Story3.8 retains the incoming user-approved diagnostic-only relative latency requirement; one-second/one-insert budgets remain enforced. Incoming in-review/blocked completion statements describe that branch only.


Reproducing statement: Run bmad-build-auto for Story 3.7 to expose every eligible UI capability through MCP, register real contract input schemas, generate the tool documentation and enforce parity. Never write, stage or revert orchestrator-owned sprint-status.yaml or infer verification from its rows. Date: 2026-10-08. Version: 3.

<intent-contract>

## Intent

**Problem:** Only 24 of 105 application capabilities have MCP tools. SDK registration omits input schemas and discards supplied arguments, preventing targeted calls.

**Approach:** Expose every read/write capability through shared application use cases, preserving human control of explicitly restricted workflows. Generate MCP documentation from the capability manifest and fail verification on surface drift.

## Boundaries & Constraints

**Always:** Reuse contracts as schema source, existing application use cases, repositories/UoW, safety switches, actor/session attribution and typed errors. Preserve existing tool names. Expose Annotation, Workflow Status and Story Template CRUD as writes; expose the three mutable getting-started capabilities as writes. Keep safety-switch changes, connector configuration/credential workflows, ChangeSet approval/rejection, restore/on-demand restore points and archive import/export (including their workflow-specific listing/capability helpers) human-only. ApplyChangeSet uses persisted human approval. Require an existing authorization projectId for CreateProject and pass only creation fields to its use case. Validate actual entity ownership and all supplied scope identifiers. Scoped/global reads must not expose disabled Projects. Register SDK input schemas from contracts. Import Markdown/TXT only, prepare file contents before UoW. Export content through existing contracts. Keep proposal generation and allowed direct writes under existing safety policy until Epic 4.

**Never:** Modify sprint-status.yaml, user data or credentials; add another writer, a provider or cloud dependency; invent an operation executor; weaken safety switches; claim SDK discovery establishes mutation correctness. Operation-registry membership remains an explicit known gap to be emptied in Epic 4.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Discovery | Runtime admitted; tools/list | Every eligible descriptor has exactly one registered tool with its contract schema | Parity failure for missing/extra tools |
| Scoped calls | Valid IDs and arguments | Shared use-case behavior with persisted Agent host/session attribution | Contract/domain errors |
| Ownership and switches | Disabled/protected Project or mismatched entity scopes | Refusal without forbidden mutation or data exposure | disabled/protected/validation/not_found as appropriate |
| Source and exports | Markdown/TXT content or existing file input; report/export requests | Existing importer, report and export outcomes | Existing explicit errors; unsupported formats rejected |
| ChangeSets | Proposed versus human-approved persisted ChangeSet | List allowed; only approved ChangeSet applies | Reject unapproved application |
| Inventory drift | Missing descriptor/tool, orphan route/tool, stale generated docs | Build generation and parity checks expose mismatch | Verification fails |

</intent-contract>

## Code Map

- `apps/server/src/application/**/*.use-cases.ts` — 105 static descriptors, 98 domain routes; add tool mappings. `customization/customization.use-cases.ts` has nine required CRUD human guards; `project/project.use-cases.ts` has three mutable onboarding human guards. Reclassify those 12; intended inventory is 91 tools and 14 human-only capabilities.
- `packages/contracts/src/mcp/tools.ts`, `api/http.ts`, `api/card-customization.ts` — current 24 names and tool schemas; reuse HTTP request/query/patch schemas with entity IDs rather than duplicating validation.
- `packages/mcp/src/tool-definitions/tools.ts`, `transports/server.ts:createStoryMapperMcpServer` — tool metadata and SDK registration; registration lacks inputSchema and loses all targeted arguments.
- `apps/server/src/mcp/tools/register-tools.ts:createMcpRegistry` — existing authorization, resolver and audit wrapper; split thin new domain adapters into bounded files. Actual entity ownership must agree with supplied Project/map IDs.
- `apps/server/src/application/changeset/changeset.use-cases.ts:applyChangeSet` and DB apply — persisted approval is authoritative; current MCP approvalToken is required but unused.
- Source import HTTP route/preparation service — prepares inline/file content before transactional application; reuse this preparation for MCP.
- `scripts/capability-scan.mjs`, `check-capabilities.mjs`, `generate-capability-manifest.mjs`, root `package.json` — static exported-use-case/descriptor identity scan, generated manifest and build integration.
- `apps/server/src/application/capability-manifest.test.ts` — runtime route/tool capture and bidirectional parity, currently fixed to 24 tools.
- `apps/server/src/mcp/http.test.ts`, `stdio-main.test.ts`, `application/mcp-http-parity.test.ts` — real SDK/bridge and shared behavior fixtures; old SDK1 empty-schema fixture must be replaced with current contracts/manifest expectations.
- `docs/mcp-tools.md` — current handwritten inventory; generate deterministically from manifest with human-only list and Epic 4 known gap.
- Planning authority: Story 3.7 in `epics.md`, valid cached `epic-3-context.md`. Story 3.6 source and completion evidence document argument loss and wire-attribution verification limits. Graph tools unavailable this session; two read-only investigators inspected source.

## Tasks & Acceptance

- [x] `packages/contracts/src/mcp/*`, `packages/mcp/src/tool-definitions/tools.ts`, `transports/server.ts` — define complete names/input schemas and register them with SDK.
- [x] `apps/server/src/application/**/*.use-cases.ts`, `capability-manifest.json` — complete tool mappings, reclassify required customization/onboarding writes, preserve 14 human-only workflows.
- [x] `apps/server/src/mcp/tools/*` — modular thin adapters for all eligible use cases using existing authorization/audit, correct ownership and source preparation; remove the unused approvalToken requirement.
- [x] `scripts/capability-scan.mjs`, generation/check scripts, `package.json`, `docs/mcp-tools.md` — enforce eligibility and bidirectional parity, generate inventory during build, detect stale documentation and record Epic 4 operation-registry gap.
- [x] Existing/new focused contract, parity, registry, HTTP SDK and bridge tests — exercise matrix and representative new-domain workflows, including mutation attribution and denials.

**Acceptance Criteria:**

- Given the manifest, when a capability is read/write and outside the documented human-only workflows, then a tool exists, including Story Map creation, Roadmaps/children, customization CRUD, Source Document import/read, reports/exports and approved ChangeSet application.
- Given generated documentation, when build executes, then docs/mcp-tools.md is generated from the manifest and its tool set matches actual registrations; human-only workflows and the Epic 4 operation-registry gap are named.
- Given parity fixtures, when a use case lacks a descriptor, an eligible write lacks a tool or a route/tool has no descriptor, then the check fails.
- Given actual SDK HTTP and stdio bridge clients, when they pass valid target arguments and mutate an accessible unprotected Project, then those arguments reach shared use cases and persisted audit records retain Agent host/session; denied calls leave forbidden data unchanged.

## Spec Change Log

- 2026-10-08 v3: Operator authorized finalization recovery after excluding only local supervisor runtime metadata. Retain current attempt baseline separately from the full original implementation review range; reuse committed code and repeat verification/review. Intent and provider-test limits unchanged; preserve prior deferred items and record unmeasured inherited file-read limits.

- 2026-10-08 v2: Resumed interrupted work; completed91-tool registration, schemas, documentation and parity. Independent review repaired literal ChangeSet ownership, GitHub admission, awaited Agent safety, disabled linked-card exposure, audit IDs/denials and behavioral test gaps. Intent unchanged; orchestrator files preserved.

- 2026-10-08 v1: Planned and implemented the expanded surface; halted at step-03 verification after the permission/environment change stopped agent work and exposed incomplete installed dependencies. Frozen dependency restoration could not complete. Intent remains unchanged.

## Recovery Review Context

- Current attempt baseline: `10e7c4d067cb11a026eea8dc9c0770d0c075696d`; this protects the already committed implementation.
- Original implementation review range for every review lens and independent Claude follow-up: `aeadb5151f8f6fe43339c36052800bacad6767fd..612150c63b7b98e6d22523b0acd9c738c46c045c`. The recovery diff alone is not the review scope.
- Recovery is finalization only: reuse the implementation, run normal verification and finalization, preserve deferred items and provider-test limits. Focus follow-up on repaired ChangeSet aliases, nested source visibility and awaited Agent safety. `followup_review_recommended` remains `true`.
- Operator excluded only `/.bmad-loop/supervision-current-run.json` in checkout-local `.git/info/exclude`; supervisor metadata stays unstaged. No tracked story/OpenWolf files are ignored. Operator reports clean loop validation and Node24/Claude auth preflight; independently rerun workflow verification. Operator test evidence: `.bmad-loop/runs/20261008-214640-6bef/operator-finalization-tests.log`.

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 22 findings — high 8, medium 4, low 1, false 8, maybe-false 1
- findings:
  - `[medium]` `[patch]` Onboarding assertions do not observe state — The surface test calls dismissal/export but only counts Activity; extend returned and persisted checklist assertions.
  - `[medium]` `[patch]` Customization update assertions miss patches — Workflow Status color and Story Template description are not checked before deletion; assert responses and persisted values.
  - `[high]` `[patch]` ChangeSet aliases bypass literal ownership — DB create-release uses raw storyMapId while the scope filter removes every proposed-ID collision; validate literal fields and only executor-remapped prior aliases.
  - `[high]` `[patch]` GitHub tools use write permission — PlanWorkItems import awaits provider listing and ResolveSyncConflict awaits/writes GitHub; write:true/github:false currently admits both. Classify github and test admission.
  - `[high]` `[patch]` Async conflict resolution ignores revoked Agent safety — Existing revalidation checks DB/input identity and github only; add actor-specific access/protection checks before remote write and persistence.
  - `[medium]` `[patch]` New tool audit affectedEntityIds are empty — registerApplicationTool uses registerTool default resolver for all new mutations; supply actual created/updated/deleted entity IDs.
  - `[medium]` `[patch]` Scope denials bypass Project audit — New validateToolScope throws before audit creation; record supplied independently accessible Project denials without writing into disabled/foreign Projects.
  - `[false]` `[reject]` Capability kind and proposal permission differ — Capability kind write describes persistence; proposal permission deliberately permits proposal creation under protection, expressly preserved by intent. Equality would weaken the existing policy.
  - `[high]` `[defer]` Server-side file import can persist arbitrary sensitive file content — Existing human HTTP source import already reads caller-supplied filePath with readFileSync; this story expressly reuses that same preparation and accepts existing file inputs. A safe import-root boundary needs a separately specified authority policy; no credential file was read or imported during verification.
  - `[maybe-false]` `[defer]` Chunk ownership scan may scale poorly — chunkScope traverses Project source summaries. No workload/timing evidence demonstrates user harm; representative large-source timing would settle whether this is a medium performance problem.
  - `[false]` `[reject]` Generated inventory omits full input/output reference — Intent requires manifest-generated tool inventory and SDK contract registration. Both exist; no per-tool expanded reference format is required.
  - `[low]` `[reject]` Tool descriptions mostly repeat names — Descriptions are terse but names and registered SDK input schemas expose actionable invocation fields. Broader descriptive authoring is optional and no failed tool selection was demonstrated.
  - `[high]` `[patch]` Create-release alias collision bypasses disabled target — Duplicate scope defect: raw storyMapId is removed when equal to create entityId; same literal-field validation repair.
  - `[high]` `[patch]` Source details leak disabled linked Card data — Repository visibleSourceLinks filters deletion visibility rather than Project agentAccess; human-created cross-Project links reach links and linkedCardsByChunkId. Filter MCP output by actual Card ownership/access.
  - `[high]` `[patch]` Revoked access permits asynchronous conflict write — Duplicate async safety defect: revalidateConflictResolution checks github but not actor access/protection; same actor-aware revalidation repair.
  - `[high]` `[patch]` Claim of universal operation ownership is contradicted — Duplicate ChangeSet alias collision; literal fields must remain validated regardless of proposed create aliases.
  - `[false]` `[reject]` Optional global Activity/ChangeSet forms not exposed — Each eligible capability has one tool; required MCP projectId safely scopes these reads. Intent does not require all optional HTTP invocation variants; actual global Project/map discovery remains filtered.
  - `[false]` `[reject]` Ownership enforcement is at MCP ingress rather than universal application boundary — The intent targets MCP exposure and validates supplied scopes at that boundary. Human HTTP behavior is intentionally unchanged; it does not demand all human cross-Project links be prohibited.
  - `[false]` `[reject]` Representative wire checks do not prove all tool mutations — Spec explicitly requires representative new-domain workflows and real HTTP/stdio targeted mutations. Those executed; inventory is separately exhaustive and no all-tool mutation claim is made.
  - `[false]` `[reject]` Sanitized connector listing could be a human-only configuration helper — ListConnectorConnections returns publicConnectorConnection planning metadata with Project admission; configuration mutation/validation/credentials remain human-only. No credential workflow is exposed.
  - `[false]` `[reject]` Build refreshes stale docs before checking — Intent expressly requires build generation and standalone parity failure for stale docs. Build regenerates deterministically; standalone checker fixture rejects stale content without rewriting.
  - `[false]` `[reject]` Portable/UI verification repairs lie outside MCP intent — Repairs were required to run the explicitly requested full workspace gate: stale safety mock/copy, raw separator hygiene, canonical path and shutdown observation. Rendered behavior and acceptance assertions remain intact.


Original pass applied repairs: literal scope fields remain validated while only prior executor-remapped aliases are exempt; GitHub permission guards block custom write-only admission; Agent safety is rechecked at every conflict-resolution boundary; MCP source responses filter disabled linked Cards; all new mutations report audit IDs and independently accessible supplied-Project denials are audited. Returned and persisted onboarding/customization changes are asserted. Focused affected suites:64 passed.


### 2026-10-08 — Recovery review pass

Original review range: `aeadb5151f8f6fe43339c36052800bacad6767fd..612150c63b7b98e6d22523b0acd9c738c46c045c`; current attempt baseline remains unchanged. All four lenses read the full original unified diff. Three ran concurrently; the fourth launched once the platform reviewer slot opened, before triage.

- verdicts: 22 findings — high 4, medium 3, low 1, false 12, maybe-false 2
- findings:
  - `[high]` `[patch]` Snapshot/export source visibility — Accessible map snapshots and JSON exports include foreign source chunks via human links; filter Agent chunks/links by actual source Project, preserve human data, and exercise snapshot/data/export outcomes.
  - `[high]` `[defer]` Unrestricted filesystem import — carried: same inherited file authority claim and readFileSync location as prior deferred row; the intent expressly reuses file inputs and needs a separate source-authority policy. No credential was accessed.
  - `[maybe-false]` `[defer]` Unbounded synchronous source reads — The inherited HTTP reader also lacks a bound. No representative size/blocking evidence establishes actual harm; regular-file/size policy and measured workload would settle severity (medium unverified).
  - `[maybe-false]` `[defer]` Chunk inventory traversal — carried: same chunkScope traversal and unmeasured workload as prior deferred row; retain the existing medium-unverified item without re-deferring.
  - `[false]` `[reject]` Existence differentiation before admission — The contract explicitly permits not_found/disabled/validation errors; no protected content is returned, and supplied unknown identifiers are not an authorized content read. An indistinguishable existence policy is not part of this intent.
  - `[medium]` `[patch]` Missing denial audit without projectId — Supported wrong-map UpdateStoryMapRelease input carries storyMapId/releaseId but no projectId; scope validation bypasses invocation audit. Attribute refusal to independently accessible supplied ownership and assert persisted denial/state.
  - `[false]` `[reject]` Unreachable registration satisfies static parity — Runtime capability-manifest.test captures createMcpRegistry registrations and compares the complete expected set; an uninvoked helper fails that test. Static syntax checks are deliberately complemented by runtime parity.
  - `[false]` `[reject]` Name parity does not verify handler mapping — No incorrectly mapped adapter was demonstrated; each thin adapter calls the named shared use case. Inventory checks and representative behavioral tests are separate acceptance evidence, rather than a static proof of arbitrary handler semantics.
  - `[false]` `[reject]` Some adapters lack direct mutation tests — carried: same representative-versus-exhaustive behavioral coverage claim as the prior rejected wire row. Intent requires representative workflows and complete inventory, not a mutation test for every tool.
  - `[low]` `[reject]` Terse descriptions and contract guidance — carried: same terse-description claim as prior rejected low row; registered SDK schemas supply invocation fields, and expanded descriptive authoring is optional without demonstrated failed use.
  - `[medium]` `[patch]` Customization removal is unobserved — Verification-gap evidence accepted: ok/audit assertions allow a no-op deletion adapter. Extend existing test with persisted absence for all three customization entities.
  - `[medium]` `[patch]` Conflict credential-await revocation is unobserved — Verification-gap evidence accepted: fetch/write suspension tests would still pass with the post-auth guard removed. Suspend credentials and assert refusal before fetch plus unchanged persisted state.
  - `[high]` `[patch]` Reverse source-link leakage — Same demonstrated snapshot/export source leak as the first finding; group under actual source-Project visibility and preserve human links.
  - `[high]` `[patch]` Import plan survives awaited Agent revocation — planWorkItems import checks database, connection and visible map after awaits but omits Agent safety; add checks before and after credentials/provider reads and assert denial with no plan/persistence.
  - `[false]` `[reject]` Exhaustive declarations differ from exhaustive outcomes — Descriptive evidence boundary, not a demonstrated behavior defect: runtime parity is exhaustive, mutation evidence is representative as specified. Actual source leaks and awaited planning harm are separately patched.
  - `[false]` `[reject]` Transport discovery differs from mutation evidence — Real SDK/stdio targeted mutations and persisted host/session effects are tested; no claim that discovery proves all mutations is made.
  - `[false]` `[reject]` Registry evidence bypasses transport — Registry tests intentionally cover broader use-case behavior; complementary actual HTTP/stdio tests verify schema/transport argument forwarding and attribution. Both required surfaces are exercised.
  - `[false]` `[reject]` Ingress differs from universal enforcement — carried: prior rejected ingress/universal-ownership row. Intent concerns MCP exposure; shared human HTTP cross-Project behavior is explicitly preserved.
  - `[false]` `[reject]` Scoped tool forms omit global invocation variants — carried: prior rejected optional global Activity/ChangeSet row. One callable safely scoped tool exists per eligible capability; intent does not demand every optional HTTP form.
  - `[false]` `[reject]` Connector listing classification differs by reading — carried: prior rejected publicConnectorConnection planning-read row. Scoped sanitized discovery does not expose configuration or credential workflows; all 14 documented human-only capabilities remain excluded.
  - `[false]` `[reject]` Build repairs stale documentation — carried: prior rejected build-generation row. Build is required to generate, and standalone checker explicitly fails stale docs without rewriting them.
  - `[false]` `[reject]` Operation-registry gap remains — Intent expressly excludes a new executor and requires the Epic4 gap to remain documented; no operation-registry completion is claimed.

### 2026-10-08 — Follow-up review pass

Scope: full original range `aeadb5151f8f6fe43339c36052800bacad6767fd` to HEAD `f257b8abddcd0f56d9fd2c6f2081b07b58dca31b` (implementation plus recovery repairs, 61 files, orchestrator/OpenWolf/loop files excluded). Findings listed in layer order: Blind Hunter (15), Edge Case Hunter (19), Verification Gap (6), Intent Alignment (5).

- verdicts: 45 findings — high 1, medium 3, low 15, false 25, maybe-false 1
- findings:
  - `[false]` `[reject]` Human-only guards dropped for customization/onboarding — Intent Always-clause requires Annotation, Workflow Status, Story Template CRUD and the three mutable getting-started capabilities as writes.
  - `[low]` `[reject]` Placeholder tool descriptions — carried: prior rejected terse-description row; SDK schemas supply invocation fields and no failed selection was shown.
  - `[false]` `[reject]` Permission classes inconsistent / GitHub link tools bypass switch — GetGettingStarted is a required write; github-link use cases perform no network call, so write is correct; kind-to-permission drift is now pinned by the patched test below.
  - `[low]` `[patch]` Existing 24-tool schema baseline orphaned — fixture `stdio-tools-sdk1.json` has no remaining reader; deleted (grouped with the Edge and Verification fixture rows). Reuse of HTTP request schemas is the Code Map's direction; no default leakage was shown.
  - `[false]` `[reject]` approvalToken removed — Code Map and Tasks require removing the unused token; persisted approval is authoritative and the strict schema test documents it.
  - `[false]` `[reject]` RecordVisualExport ignores format — HTTP export-success route validates and ignores format identically through the same use case; MCP parity, no harm.
  - `[false]` `[reject]` CreateProject authorization projectId — Intent expressly requires an existing authorization projectId and creation-only fields.
  - `[false]` `[reject]` Scope validation fails open / costly — enumerated every Id-suffixed key across all 91 input schemas (29 keys); each is handled by entityScope or a dedicated check, so none is unvalidated. Chunk traversal cost is already the carried medium-unverified deferral.
  - `[false]` `[reject]` Source visibility filter incomplete — snapshot, data and every export format are built from `visibleSnapshotSources`; agentSourceDocument filters links by actual card Project; chunks belong to the already-validated document Project.
  - `[low]` `[reject]` Agent safety check duplicated in two services — real duplication but divergence unlikely in everyday use and the extraction adds a new helper; not worth the added surface here.
  - `[false]` `[reject]` Build generates before checking — carried: prior rejected build-generation row; `scripts/verify.mjs` runs `check-capabilities` standalone and the checker fails stale docs.
  - `[low]` `[reject]` Generated doc header and hardcoded date/version — the Reproducing-statement header is the convention in docs/RUNBOOK.md, agent-tooling.md and others; cosmetic.
  - `[low]` `[reject]` Test weakening, hardcoded counts, loosened restore regex — restore-named tools remain blocked by explicit name checks; typed validation payload change follows from required SDK schema registration; positive-path coverage claim carried as representative-by-spec.
  - `[false]` `[reject]` Unrelated changes bundled — carried: prior rejected portable/UI verification row.
  - `[low]` `[reject]` Type and style smells (cast, double parse, import order) — no demonstrated defect; double parse is idempotent.
  - `[false]` `[reject]` ChangeSet move/archive/delete/link ops unchecked — ChangeSet apply supports only create card/release/persona, update card and link sourceLink and rejects every other op as unsupported before applying; all id fields of those operations are validated.
  - `[false]` `[reject]` Aliases in other fields break apply — aliasable fields are exactly the remapped ones (card parentId/releaseId, card update releaseId, sourceLink cardId); no other operation field can reference a created entity.
  - `[high]` `[defer]` Unrestricted filesystem import — carried: same inherited file authority and readFileSync location as the existing deferred row; not re-added.
  - `[false]` `[reject]` Non-UUID unknown Id key throws — no registered schema has remoteId/externalId-style keys (enumerated); templateId non-UUID is special-cased.
  - `[false]` `[reject]` Nested non-patch ids skip ownership — ids appear only at top level, in patch or in cardIds/connectionIds arrays across all schemas.
  - `[false]` `[reject]` Existence probing before admission — carried: prior rejected existence-differentiation row.
  - `[maybe-false]` `[reject]` Orphan GitHub link cannot be updated/deleted — card and release columns are both nullable so a link without either might exist; would be low if true (unreachable through creation contract not verified), so rejected per the low rule.
  - `[false]` `[reject]` Zero-argument tools reject missing arguments — SDK `validateToolInput` validates `args ?? {}` (dist/mcp-DIH4cS6P.mjs:1814); ListProjects wire tests pass.
  - `[medium]` `[patch]` Kind/permission pairing unchecked — same defect as the Verification Gap permission finding; new manifest test pins every tool permission to its descriptor kind plus the four proposal and six GitHub exceptions.
  - `[false]` `[reject]` Build rewrites before check — carried: prior rejected build-generation row.
  - `[false]` `[reject]` Hidden-Project linked chunk fields unfiltered — chunks and summary belong to the validated document Project; only cross-Project card links needed filtering and are filtered.
  - `[false]` `[reject]` ChangeSet validate/apply time gap — ChangeSets have no update operation and validation and apply run in one synchronous sequence with no await between.
  - `[false]` `[reject]` GitHub link/dry-run tools lack github permission — local records and dry run perform no remote call; only network tools carry github permission.
  - `[low]` `[reject]` Mechanical tool descriptions — carried: prior rejected terse-description row.
  - `[low]` `[reject]` Plain-text SDK validation error replaces typed payload — consequence of the required SDK input-schema registration; rejection still enforced and asserted.
  - `[low]` `[patch]` Orphan stale fixture — deleted `apps/server/src/mcp/fixtures/stdio-tools-sdk1.json` (no reader remains).
  - `[false]` `[reject]` Ownership claim contradicted for non-card entities — same as the unsupported-operation row; disproved by the supported-operation list.
  - `[false]` `[reject]` Docs claim GitHub switch for link tools — sentence refers to remote GitHub tools; link and dry-run tools are local.
  - `[false]` `[reject]` Disabled-Project probing contradicts no-exposure — carried: prior rejected existence-differentiation row.
  - `[medium]` `[patch]` Write-tool permission classes not pinned — added `pins every tool permission class to its capability kind` in `capability-manifest.test.ts`.
  - `[medium]` `[patch]` CreateAiProposal and ListAiTemplates untested through MCP — added a surface test for list, proposed ChangeSet creation under agent protection, attribution audit and wrong-map refusal.
  - `[low]` `[patch]` Unreferenced stdio-tools-sdk1 fixture — same root cause as above; deleted.
  - `[low]` `[reject]` Restore denylist loosened to /restore/ — explicit restore-point name checks and the restore pattern remain; snapshot read tool is legitimate and required.
  - `[low]` `[reject]` Mechanical descriptions — carried: prior rejected terse-description row.
  - `[low]` `[reject]` Existing tool schemas changed shape (status, assignee, released, position) — HTTP request schemas are the Code Map's schema source; former extra keys were silently stripped.
  - `[false]` `[reject]` Wire checks only for one tool — carried: prior rejected representative-wire row; generic registration plus HTTP/stdio targeted mutations and exhaustive registry parity.
  - `[low]` `[reject]` Existing-tool behavior changes (approvalToken, validation shape, baseline) — each is required or a consequence of required SDK schemas; baseline fixture handled by the deletion patch.
  - `[false]` `[reject]` Partial unit coverage of parity fixture — carried: prior rejected exhaustive-versus-representative row.
  - `[low]` `[reject]` Descriptions and export permissions — descriptions carried; export tools are writes because they log Activity and mark export completion.
  - `[false]` `[reject]` Operation-registry gap only in docs — Intent requires it documented as a known gap; no check required.

Patches applied: permission-class pinning test, AI proposal surface test, orphan fixture deletion. No bad_spec or intent_gap.

## Verification

Use installed Node 24 at `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` before global Node. Run serial build/test gates where fixtures share dist output.

Use installed Node 24 at `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` before global Node. Run serial build/test gates where fixtures share dist output.

- `corepack pnpm --filter @storymapper/server test`, focused contracts/core/MCP tests and script parity fixtures — passing focused regression and wire acceptance.
- `corepack pnpm typecheck`, `corepack pnpm check-capabilities`, `corepack pnpm build`, `node scripts/verify.mjs`, `git diff --check` — passing workspace/release gates and deterministic inventory generation.
- `corepack pnpm test` — full workspace and portable script verification, serial with build.

## Auto Run Result

Status: done

Summary: Follow-up review of Story 3.7 over the full original range plus recovery repairs (`aeadb51..f257b8a`, 61 files). The change exposes 91 contract-schema MCP tools across 105 capabilities, keeps 14 human-only workflows, and enforces manifest, documentation and route parity. The recovery repairs for ChangeSet aliases, nested source visibility and awaited Agent safety were re-examined and held up.

Files changed this pass:

- `apps/server/src/application/capability-manifest.test.ts` — pins every tool permission class to its capability kind, with the four proposal and six GitHub exceptions named.
- `apps/server/src/mcp/tools/surface.test.ts` — covers ListAiTemplates and CreateAiProposal, including proposal permission under agent protection, attribution audit and wrong-map refusal.
- `apps/server/src/mcp/fixtures/stdio-tools-sdk1.json` — deleted; the stale 24-tool fixture had no reader.
- This spec — triage log and result.

Review findings: 45 triaged (high 1, medium 3, low 15, false 25, maybe-false 1). Patched: 3 groups (2 medium: permission-class pinning, AI proposal coverage; 1 low: orphan fixture). Deferred: none new; the high file-import authority row is carried against the existing deferred item. Rejected: 38, each with its reason in the Follow-up review pass log (carried rows reference their earlier dispositions).

Follow-up review recommended: false. This follow-up pass patched no high finding, so the work has converged.

Verification: `corepack pnpm typecheck`, `corepack pnpm check-capabilities` (105 capabilities), `node scripts/verify.mjs` (typecheck and build, exit 0) and focused MCP/manifest suites (35 passed) passed on Node 24.17.0. `corepack pnpm test` passed in full on a rerun (Scripts 75, Contracts 22, Importers 2, Core 28, Web 96, DB 232, Server 264). An earlier first full run exited with ELIFECYCLE in an unrecorded suite because its output was filtered; the failing test was not identified and the identical rerun passed without changes.

Residual risks: the file-import authority, chunk-scope traversal and synchronous file-read deferrals remain open. Placeholder-style tool descriptions persist. GitHub live timing and cancellation are not covered by the controlled-provider tests. The Epic 4 operation-registry gap stays documented.
