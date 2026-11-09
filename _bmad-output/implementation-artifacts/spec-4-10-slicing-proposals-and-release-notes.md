---
title: Slicing proposals and release notes
type: feature
created: 2026-10-12
status: done
baseline_revision: 709c1ae0e7f94ac5e44ed5857cadfc4bed002435
version: 4
review_loop_iteration: 0
followup_review_recommended: false
context:
  - [REDACTED_HOME]/Projects/StoryMapper/AGENTS.md
  - [REDACTED_HOME]/Projects/StoryMapper/.wolf/OPENWOLF.md
  - [REDACTED_HOME]/Projects/StoryMapper/_bmad-output/implementation-artifacts/story-plan-4-10-slicing-proposals-and-release-notes.md
warnings: [oversized]
deferred:
  - summary: >-
      Existing-target empty slices have inconsistent direct versus AI lifecycle behavior.
    evidence: |-
      The baseline direct generator stored an empty ChangeSet when its chosen Release existed and no visible Stories remained; the baseline AI service rejected zero operations. Both behaviors predate Story4.10. Empty-new requests contain a Release create. A separate empty-slice policy decision/test would reconcile this inherited behavior.
    location: >-
      apps/server/src/application/changeset/changeset.use-cases.ts; apps/server/src/services/ai-proposal-change-set.ts
    severity: medium
  - summary: >-
      Existing AI proposal success/error messages can arrive after navigation to another Story Map.
    evidence: |-
      The baseline useProposalEditor callbacks update shared message state without submitted-scope checks. This behavior is unchanged by Story4.10. Its new direct-tool error rendering is separately repaired in this story. A deferred successful AI proposal followed by a map switch would demonstrate the inherited message issue.
    location: >-
      apps/web/src/features/ai-mcp/useAiMcpPanelState.ts
    severity: medium
---

Reproducing statement: Implement Story4.10's deterministic explicit-target happy-path proposals and read-only Activity-grouped release notes. Never write, stage or revert orchestrator-owned sprint-status.yaml or treat its rows as verification. Date:2026-10-12. Version:3.

<intent-contract>

## Intent

**Problem:** Slicing silently chooses a Release and exposes unsupported product strategies; completed-Story release notes are missing.

**Approach:** Share the existing first-12-visible-Stories happy path across proposal surfaces with an explicit existing/new Release target. Generate deterministic Markdown notes from configured done statuses, exposed through HTTP, MCP and Release UI.

## Boundaries & Constraints

**Always:** Shared contracts; pure core logic; repository-only data access; actual ActorContext/real ownership/access checks; proposal-only generators under any protection state. Retain rationale, versions and provenance. Generic BMad Persona/foundation/theme cuts use typed Release/assignment operations with explicit apply=false. Keep command defaults unchanged. Preserve unrelated changes and existing other AI templates. Never write/stage/revert sprint-status.yaml or deferred-work.md; rows are bookkeeping. No commit or push is authorized.

**Never:** New strategy engine, BMad parser, provider/network dependency, stored note document, auto approval/application, compatibility fallback or guessed first Release.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Happy path | Visible Stories, equal positions, explicit existing/new target | First12 ordered position/id; typed proposal with rationale; no domain application; repeat semantic output equal | Missing/ambiguous target rejects |
| Scope | Foreign/missing Release or disabled Agent Project/map | No proposal/notes data or domain changes | Explicit ownership/access refusal |
| Generic cuts | BMad-supplied Release/assignment operations with rationale, apply=false | Stored proposal only through existing generic submission | Existing typed validation retained |
| Completed notes | Target Release; custom status names in configured done group; Activity ancestors | Visible completed Stories only, grouped Activity/unassigned, groups and Cards ordered position/id, key/title included | Invalid Release rejects |
| Exclusions/empty | Notes, archived/parked Cards/ancestors, incomplete Stories, missing ancestor | Exclude invisible/non-Story/incomplete; missing valid Activity becomes unassigned; explicit English empty output | Cycle-safe ancestor traversal |
| Read-only/determinism | Permuted same input and repeated HTTP/MCP generation | Identical Markdown; domain rows/versions/Activity unchanged; required tool audit allowed | No persistence of generated notes |
| UI | AI editor and direct slice action; Release selector/request pending or error | Explicit existing/new payload on both paths; notes only for actual Release; readonly result; errors visible; stale result cannot replace another scope | Shared strings and typed API |

</intent-contract>

## Code Map

- `packages/contracts/src/api/http.ts`, `mcp/{tools,tool-inputs}.ts`, exports — add shared release target discriminated union (`releaseTarget: {kind: existing, releaseId} | {kind: new}`), slice input and notes input/output. AI release-slice requires this target; remove product strategy choices while retaining other template inputs. Optional supplied rationale is shared. Notes response carries Markdown.
- `packages/core/src/release-slicing/slice.ts`, `proposals/{release-slice,ai-proposals}.ts` — visibleCards reuse, position/id tie sort, one shared happy-path builder. AI currently chooses first Release and ad hoc theme/persona/foundation heuristics; replace those release-only paths. Existing versions and operationContext evidence remain.
- `packages/core/src/reports/` and exports — new pure formatter from Release/cards/workflowStatuses; status matches configured status.name for group done. visibleCards excludes archived/parked descendants. Same-map, cycle-safe ancestor Activity lookup; stable order; no Date calls.
- `apps/server/src/application/changeset/changeset.use-cases.ts:135`, `application/ai/ai.use-cases.ts`, `services/ai-proposal-change-set.ts` — explicit target validation and proposal lifecycle reuse; never executor-apply generated proposals.
- `application/release/` or `report/`, `http/routes/`, `mcp/register-tools.ts`, `mcp/tools/register-content-tools.ts`, `application/descriptors.ts` — notes read use case with existing getStoryMapSnapshot; provides Cards/releases/workflowStatuses, no DB changes needed. GET `/api/story-maps/:storyMapId/releases/:releaseId/notes`, MCP `GetReleaseNotes`. Reuse project-scopes real owner/disabled-access guards.
- `scripts/mcp-tool-metadata.json`, generated manifest/MCP capabilities and `docs/mcp-tools.md` — regenerate existing artifacts with registered read capability; generic submission recipe explains apply=false for supplied cuts.
- `apps/web/src/features/ai-mcp/{AiMcpPanel,useAiMcpPanelState}.tsx`/`.ts` — ProposalSelectors/useProposalEditor plus SourceActionsView both need target; remove unsupported strategies. `features/releases/ReleasePanel.tsx`, `app/api.ts`, `ui-strings/index.ts` — actual Release scope enables notes; pending/error/read-only result with response ownership on scope change.
- Tests: core `proposals/proposals.test.ts` and focused formatter golden tests; contracts input tests; server `application/ai/ai.use-cases.test.ts`, proposal service and actual HTTP/MCP scope/audit/no-write tests; web mounted `AiMcpPanel.test.tsx`, `ReleasePanel.test.tsx`. Mounted tests need fresh root/query client, real event dispatch, deferred-response regression. Graph unavailable; three source investigation agents supplied this map. Completed4.9 preview/approval engine is reused, unchanged.

## Tasks & Acceptance

**Execution:**

- [x] Contracts above — strict shared explicit-target and notes schemas/exports.
- [x] Core slice/proposal builders and formatter — deterministic shared proposals and notes.
- [x] Server use cases/routes/MCP/descriptors — ownership, proposal-only and read-only integration; regenerate capability artifacts and supplied-cut recipe.
- [x] Web API/AI panel/ReleasePanel/strings — explicit targeting and notes generation with stale-response protection.
- [x] Focused schema/core/server/mounted web tests — cover every matrix row; verify all configured gates.

**Acceptance Criteria:**

- Given a human or Agent requesting either generator surface, when an explicit existing/new target is supplied, then only a rationale-bearing deterministic happy-path proposal is stored.
- Given generic BMad cuts, when submitted with apply=false, then normal typed Release/assignment operations suffice without product strategies.
- Given a Release and configured done statuses, when HTTP/MCP/UI notes are requested, then identical read-only Markdown groups visible completed Stories by ancestor Activity/unassigned and includes key/title.
- Given missing targets, foreign scope, empty completion or delayed UI responses, when invoked, then matrix refusals/empty/error and scope-safe output hold.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass

- Verdicts:20 findings — high0, medium12, low0, false8, maybe-false0. Four lenses completed before triage. Seven medium patch groups; two inherited medium defer groups. Every reported issue/intent observation is recorded individually below.
- Findings, in reporting order:
  - `[medium]` `[patch]` Blind1: release-slice Story picker implied subset scope — hide it for this action and omit cardIds from release-slice requests; mounted test preserves selection for other templates.
  - `[medium]` `[patch]` Blind2: selected-card provenance disagreed with full-map assignments — core release operations now derive context.cardIds from the actual stable candidate, preserving other evidence; >12 subset and complete-operation tests pass.
  - `[medium]` `[patch]` Blind3: supplied context order could defeat operation determinism — same candidate-provenance repair as Blind2; complete-operation permutation regression passes for both target kinds.
  - `[medium]` `[defer]` Blind4: existing-target zero-Story direct proposal differs from AI refusal — both branches existed at baseline709c1ae0e7f94ac5e44ed5857cadfc4bed002435; retained as inherited lifecycle policy issue in the single deferred list.
  - `[medium]` `[patch]` Blind5: generated notes lacked live/Release cache invalidation — added notes to existing map and Release invalidation sets; Card/Release/status and foreign-map regression passes.
  - `[false]` `[reject]` Blind6: retained explicit new target after map navigation is implicit guessing — new is an explicit create request with no persisted owner to guess; each outgoing request supplies the currently addressed map. No requirement invalidates that explicit target choice on navigation.
  - `[medium]` `[defer]` Blind7: delayed AI proposal callbacks update another map's shared message — baseline callbacks already had this behavior; recorded inherited UI message issue. New direct-tool error is repaired separately.
  - `[false]` `[reject]` Blind8: nested releaseTarget escapes authorization — ordinary collector omits that nesting, but both shared generator implementations validate the actual Release against the requested map before generating/persisting. Cross-Project HTTP/MCP/shared regressions demonstrate refusal; no data/access bypass occurs.
  - `[medium]` `[patch]` Blind9: foreign fixture remained same-Project — replaced it with a real second Project; actual transports and shared functions refuse cross-Project target combinations and disabled foreign Project access with unchanged domain snapshots/ChangeSets/Activity.
  - `[medium]` `[defer]` Blind10: successful/delayed AI completion message untested — success callbacks are unchanged baseline code; their scope-related gap shares the inherited message issue in Blind7. New target request payloads, actual proposal persistence and direct delayed failure are exercised separately.
  - `[false]` `[reject]` Blind11: partial MCP snapshot comparison permits hidden writes — source trace of safety, snapshot, formatter and registered read handler shows only reads before required audit. HTTP byte-identical SQLite assertions plus MCP exact-one-audit and complete relevant snapshot/Activity checks substantiate current read-only behavior; no extra write is demonstrated.
  - `[medium]` `[patch]` Verification1: existing-target tests cannot distinguish first from second eligible Release — both generators now explicitly target the second same-map Release, with direct assignment destination assertions under both protection states.
  - `[medium]` `[patch]` Verification2: selectedCards equals snapshot.cards in prior fixtures — new >12-Story application test selects the last Story while asserting first12 exact IDs, equivalence with direct operations and truthful candidate provenance.
  - `[medium]` `[defer]` Edge1: direct zero-operation existing-target proposal versus AI refusal — same independently verified inherited defect as Blind4, retained in the single deferred entry.
  - `[medium]` `[patch]` Edge2: new direct-tool error renders after switching maps — rendering now binds to submitted variables.input.storyMapId; deferred-failure mounted regression proves the old error stays hidden.
  - `[false]` `[reject]` Intent1: diff alone cannot establish workflow execution/gates — execution tool output records one renderer invocation and snapshot workflow routing; full real test/release logs are inspected separately. This evidence limit is not a product defect.
  - `[false]` `[reject]` Intent2: mounted UI versus actual browser — this story requires shared UI/transport behavior without actual-browser acceptance; mounted controls and actual server integration exercise the specified surfaces. No browser claim is made.
  - `[false]` `[reject]` Intent3: generic submission does not generate BMad cut semantics — external supplied semantics are the accepted requirement; product typed proposal acceptance and explicit apply=false are verified, with no strategy engine requested.
  - `[false]` `[reject]` Intent4: no single browser-to-server acceptance — each changed outer transport/UI surface has executed coverage; a combined real-browser scenario is not required for this story and none is claimed.
  - `[false]` `[reject]` Intent5: diff cannot prove historical ledger nonwrites — all this session's writes/staging exclude sprint/deferred tracking, whose diff remains empty; no row served as verification. The descriptive limitation supplies no contrary evidence or defect.

### 2026-10-12 — Review pass (follow-up)

- verdicts: 32 findings — high 0, medium 5, low 15, false 11, maybe-false 1. Four lenses (blind 13, edge-case 13, verification-gap 1, intent-alignment 5 observations).
- findings:
  - `[low]` `[reject]` Blind1: application/actors.ts imports resolveToolProjectIds from mcp/tools/project-scopes — baseline changeset.use-cases.ts already imports it; project-scopes depends only on contracts/db/submission-operations (no cycle); relocation is a larger refactor than a correction.
  - `[false]` `[reject]` Blind2: access enforcement split across layers, GetReleaseNotes has no registry resolver — CreateAiProposal is registered the same way; the use-case check refuses disabled-Agent Projects (release-notes.test.ts disabled assertions), so no unguarded path.
  - `[low]` `[reject]` Blind3: redundant schema parsing at MCP and use-case layers — baseline createAiProposal already re-parsed; harmless, and parse-once changes cross-cutting boundaries.
  - `[medium]` `[patch]` Blind4: release-slice silently ignores supplied cardIds — cardIds moved onto the non-slice variant of createAiProposalRequestSchema so the strict release-slice variant rejects them; contracts rejection test added, server test no longer passes cardIds, ai-proposal-change-set reads cardIds only when present.
  - `[low]` `[reject]` Blind5: releaseId dead on non-slice templates — retained deliberately ("retained other-template inputs", asserted in release-slicing.test.ts); removal would change other templates' contract.
  - `[low]` `[reject]` Blind6: existing-Release lookup duplicated — each layer needs its own scoped check; only message text differs, no named diverging caller.
  - `[low]` `[reject]` Blind7: position/id comparator duplicated in slice.ts and release-notes.ts — equal rules today, helper extraction exceeds a direct correction.
  - `[low]` `[reject]` Blind8: rationale has no max length — operation reason schema is an unbounded string so nothing fails later; local tool, HTTP body limit applies.
  - `[low]` `[reject]` Blind9: notes escape set, hard-coded English, Unassigned collision, key/title only — notes render in a plain read-only textarea; English empty output and key/title are specified by the matrix; cosmetic.
  - `[low]` `[reject]` Blind10: test setup nits (pragma comment, duplicate stubGlobal, >=400 assertions, no malformed-UUID test) — test hygiene without a demonstrated defect.
  - `[low]` `[reject]` Blind11: release-notes.test.ts misplaced/overloaded — organization only.
  - `[low]` `[reject]` Blind12: UI coupling (slice button disabled without hint, differing error paths, duplicated release filter) — matrix requires disabled missing targets; error path divergence for AI editor is the inherited message issue already deferred.
  - `[low]` `[reject]` Blind13: alias import churn, contract removal without ADR, manifest ordering — strategy removal is the requested change; reversible within the story.
  - `[medium]` `[carried]` `[defer]` Edge1: direct existing-target zero-Story proposal stored empty — carried: same claim and location as the logged Blind4/Edge1 inherited-lifecycle deferral.
  - `[medium]` `[carried]` `[defer]` Edge2: AI release-slice with no visible Stories — carried: same deferred inherited zero-operation policy item.
  - `[medium]` `[patch]` Edge3: cardIds accepted but ignored for release-slice — same root cause and fix as Blind4.
  - `[false]` `[reject]` Edge4: snapshot read outside unitOfWork can go stale — better-sqlite3 use cases are synchronous with no await between read and run, and operations carry baseVersion checked at apply time.
  - `[false]` `[reject]` Edge5: missing ids could skip the agent-access check — verification request, not a defect; missing Story Map/Release paths throw not_found in covered tests.
  - `[maybe-false]` `[reject]` Edge6: map-specific non-done status shadowing a same-named global done status — workflow_statuses has no uniqueness, but no creation path was shown to produce the collision and, if real, the harm is low.
  - `[false]` `[reject]` Edge7: Story order ignores Step ordering — matrix specifies Activity group then Card position/id ordering.
  - `[low]` `[reject]` Edge8: additional markdown escapes (& ~ | ! #) — plain-text textarea rendering; cosmetic.
  - `[low]` `[reject]` Edge9: rationale unbounded — same as Blind8.
  - `[false]` `[reject]` Edge10: stale releaseId sent for non-slice templates breaks request — server ignores the field and the schema accepts any UUID, so no failure occurs.
  - `[false]` `[reject]` Edge11: manual refetch versus invalidation duplicates/cancels — query refetch cancels and restarts to the same result; no incorrect state.
  - `[false]` `[reject]` Edge12: rationale optional contradicts "rationale-bearing" proposals — every operation carries a reason (default text when no rationale supplied).
  - `[medium]` `[carried]` `[defer]` Edge13: zero-Story map stored empty or Release-only proposal — carried: same deferred inherited item; a new target always contains a Release create.
  - `[low]` `[reject]` Verification1: releaseId dead on non-slice AI requests — same as Blind5.
  - `[false]` `[reject]` Intent1: HTTP routes use the human actor so the use-case agent check is a no-op there — HTTP is human-only; agent refusal is exercised through use cases and MCP.
  - `[false]` `[reject]` Intent2: AI versus direct equivalence asserted at use-case/core level rather than HTTP/MCP happy paths — shared generator is the specified approach.
  - `[false]` `[reject]` Intent3: notes matrix rows partly covered only in core — pure formatter owns those rows; server tests cover transport and custom done status.
  - `[low]` `[reject]` Intent4: AI-editor error visibility not asserted — test-only gap, baseline callbacks already show errors.
  - `[false]` `[reject]` Intent5: generic BMad cuts change only a description and one test — specified: existing generic submission is retained.

## Verification

Implementation gates (2026-10-12): all configured `corepack pnpm test` suites passed **1,577 tests**: Scripts82, Contracts123, Core240, Importers7, DB349, Web224, Server541 and Performance11. Full workspace typecheck and `node scripts/verify.mjs` passed (Git/source hygiene,118-capability parity,typecheck,build); unstaged and staged whitespace checks passed. Logs: `/tmp/storymapper-4-10-all-tests.log`, `/tmp/storymapper-4-10-typecheck.log`, `/tmp/storymapper-4-10-verify.log`; focused server and contract logs remain alongside them. New source files alone were staged so portable Git-based fixtures include them; no orchestrator ledgers were staged or changed.

Matrix evidence:

- Strict missing/ambiguous targets, strategy rejection and retained other-template inputs: contracts `release-slicing.test.ts` and catalog/input tests.
- Equal position/id ordering, first12, full ancestry visibility, repeat semantic output and shared AI/direct operations/rationale/context: core proposal tests plus server `release-notes.test.ts`.
- Configured done names, Activity/group/Card ordering, unassigned/missing/foreign ancestors, parked/archived trees, Notes, incomplete and empty output, cycles and permutations: core formatter golden tests.
- Actual HTTP repeat byte equality and zero SQLite writes; actual MCP equality and exactly one tool audit with identical domain snapshots/Activity; foreign scopes and shared Agent access refusals; proposal-only generators under both protection states and generic supplied cuts with explicit apply=false: server `release-notes.test.ts`.
- Mounted explicit existing/new payloads on both generator paths, disabled missing targets, errors, notes pending/error/readOnly, actual Release eligibility and delayed responses across Release/Story Map changes: web `AiMcpPanel.test.tsx` and `ReleasePanel.test.tsx`.

Independent completion review and scoped cross-reviews are complete. Final configured suites pass1,581 tests; the final release gate passes after the recorded test-fixture literal correction.


Use Node24 PATH `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` before the inherited PATH. Run serially with build fixtures:

- `corepack pnpm --filter @storymapper/contracts test`; `corepack pnpm --filter @storymapper/core test`; `corepack pnpm --filter @storymapper/server test`; `corepack pnpm --filter @storymapper/web test` — focused behaviors and all matrix rows pass.
- `corepack pnpm test` — every configured script/package suite passes. Stage explicit new source paths first because portable fixtures copy git ls-files; never stage orchestrator ledgers.
- `node scripts/verify.mjs` — hygiene/parity/typecheck/build pass.
- `git diff --check`; `git diff --cached --check` — whitespace passes; verify sprint/deferred paths absent from staging.

## Changelog

- Version3 (2026-10-12): Four-layer completion review,20 individual triage rows, seven scoped patch groups and independent repair confirmations complete. Final1,581 configured tests plus241-test core rerun and release verification pass. Two inherited medium issues deferred; frozen intent unchanged; status done, no commit/push or orchestrator-ledger writes.

- Version2 (2026-10-12): Implemented explicit shared deterministic slicing, configured done-status Activity-grouped notes, actual ownership/access checks, HTTP/MCP/UI integration and strict/mounted regression coverage; all1,577 configured tests and release verification/typecheck/build passed. No intent changes, automatic application, note persistence, ledger edits, commit or push.

- Version1 (2026-10-12): Source-investigated plan from binding Epic4 preparation and Story4.10 detail plan. No intent gaps; no runtime verification claimed yet.

- Version4 (2026-10-12): Follow-up review pass: 32 triaged findings, one patch group (release-slice rejects cardIds), three carried inherited deferrals, no new deferrals. No intent changes.

## Auto Run Result

Status: done

Summary: Follow-up review of Story 4.10 (explicit-target deterministic slicing, Activity-grouped release notes over HTTP/MCP/UI). One patch applied; otherwise the implementation converged.

Files changed this pass:
- packages/contracts/src/api/http.ts — cardIds now only on the non-release-slice CreateAiProposal variant, so release-slice rejects it.
- apps/server/src/services/ai-proposal-change-set.ts — reads cardIds only when present on the input.
- packages/contracts/src/release-slicing.test.ts — asserts release-slice rejects cardIds.
- apps/server/src/http/routes/release-notes.test.ts — AI slice call no longer passes ignored cardIds.

Review findings: 32 — patches 1 group (2 findings, medium), deferred 0 new (3 carried inherited), rejected 27 with reasons in the triage log.

Follow-up review recommended: false (no high patched).

Verification: recursive typecheck clean; contracts 123, web 225, server 543 plus 11 performance tests pass; verify.mjs quick checks and 118-capability parity pass; git diff --check clean.

Residual risks: inherited empty-slice lifecycle and shared AI message-scope issues remain deferred. No commit was made: the frozen intent contract states no commit or push is authorized. sprint-status.yaml and deferred-work.md were not touched and remain orchestrator-owned dirty paths.
