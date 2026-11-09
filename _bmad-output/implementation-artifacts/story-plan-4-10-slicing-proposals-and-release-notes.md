---
epic: 4
story: 10
status: ready
date: 2026-10-10
version: 2
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.10: Slicing proposals and release notes

Reproducing statement: Prepare Story 4.10 for the existing deterministic happy-path proposal, generic BMad-supplied cuts and read-only completed-Story release notes.

## Intent

Give users a proposed starting slice and deterministic release notes without adding a strategy engine. Fulfills FR-25 and AD-23.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md) and [4.7 routing](story-plan-4-7-writing-agent-tools-run-through-changesets.md). Generic externally supplied cuts use 4.8's submission surface once delivered.
- Proposal generators always store proposals, irrespective of command default/protection. Release notes are read-only output; release-note generation is not a ChangeSet mutation.

## Design decisions (this story)

Retain the existing first-12-visible-Stories heuristic, adding deterministic position/id tie ordering. Require an explicit existing target Release or explicit create-new request. Current use case selects `snapshot.releases[0]` silently; remove that choice. BMad supplies Persona/technical-foundation/theme cuts as ordinary typed Release/assignment operations, with rationale, rather than product strategy handlers.

The recipe submits these generated cuts with `apply=false` explicitly. The generic submission command keeps its normal `apply=true` default; this story's proposal-only guarantee comes from the generator/recipe choosing proposal mode, not a hidden default change.

Notes select visible, non-archived Stories assigned to the target Release whose configured Workflow Status group is done. Exclude Notes. Group by ancestor Activity, with an unassigned group when no valid Activity exists. Use stable position/id group/Card ordering and include Card Key/title. Pure core formatting takes supplied data and never calls Date or persists. Empty completion is explicit English output.

## Task sequence

1. Shared slice/notes request and response contracts: distinguish existing target from explicit create-new, and register a read-only notes capability with ActorContext/real scope.
2. `packages/core/src/release-slicing/slice.ts`, `proposals/release-slice.ts` and proposal builders: preserve first-12 visibility semantics, stable ties and supplied rationale; emit only typed proposal operations.
3. `application/changeset/changeset.use-cases.ts`: remove first-Release default, validate target ownership and store proposals through shared lifecycle; handle current related AI proposal paths consistently.
4. `packages/core/src/` focused release-note formatter and `application/release/` or report use case: derive done-group Cards/ancestor grouping as pure read output; use existing repository reads/data access.
5. Existing Release/Agent UI, `app/api.ts`, UI strings and MCP definitions/registration: expose explicit slice target/create-new and notes generation; regenerate manifest/docs.
6. Extend core proposal/report golden tests, server scope/read-only tests and mounted UI tests. Verify deterministic equal output, empty result and no domain writes for notes; run affected package checks.

## Preliminary code map

`packages/core/src/release-slicing/slice.ts` currently sorts by position only; `packages/core/src/proposals/release-slice.ts`; `apps/server/src/application/changeset/changeset.use-cases.ts` `proposeReleaseSlice`; `application/ai/ai.use-cases.ts`; `application/release/release.use-cases.ts`; existing core reports and `repositories/release-report-data.test.ts`; `features/releases/ReleasePanel.tsx`; `features/ai-mcp/AiMcpPanel.tsx`. New notes formatter/capability are planned additions.

## Acceptance outline

- **Given** a Story Map, **when** happy path is requested or a generic supplied cut is submitted, **then** a proposal with rationale persists and no proposed domain change applies automatically.
- **Given** equal-position visible Stories, **when** happy path runs, **then** position/id ordering selects at most the first 12; the target Release is explicitly chosen or explicitly created, never guessed.
- **Given** Persona/foundation/theme cuts, **when** supplied by BMad, **then** generic Release/assignment operations suffice with no product parser/strategy engine.
- **Given** a Release with configured done statuses, **when** notes are generated, **then** Markdown groups visible completed Stories by ancestor Activity/unassigned, orders them stably and includes key/title while excluding Notes/archived Cards.
- **Given** identical input or no completed Cards, **when** generation repeats, **then** output is identical or clearly reports no completed Cards; notes mutate no Card/Release/domain rows.
- **Given** UI/tool registration, **when** invoked, **then** both features use shared contracts, valid scope and English string modules.

## Out of scope

New slicing algorithms, BMad parsing, stored release-note documents, automatic apply/approval, telemetry or product-demand validation.

## Risks and mitigations

Existing AI strategy names may imply unsupported algorithms: expose only delivered behavior and generic supplied cuts without implementing new strategies. Completion derives from configured status groups rather than a hardcoded status name; assert notes are read-only apart from required call audit.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial lean slicing and deterministic notes plan.
- Version 2 (2026-10-10): Bound generic supplied slices to explicit apply=false without changing command defaults.
