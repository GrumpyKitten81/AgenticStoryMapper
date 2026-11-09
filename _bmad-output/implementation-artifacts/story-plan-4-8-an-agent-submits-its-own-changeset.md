---
epic: 4
story: 8
status: ready
date: 2026-10-10
version: 2
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.8: An Agent submits its own ChangeSet

Reproducing statement: Prepare Story 4.8's generic whole-cut Agent submission using the shared operation catalog, sequential validation and actual transport identity.

## Intent

Submit Cards, hierarchy, Releases, assignments, Personas and source evidence together as one reviewable ChangeSet. Fulfills FR-51.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md) and [4.7 routing](story-plan-4-7-writing-agent-tools-run-through-changesets.md), using 4.6's executor and current operation schema.
- Supply generic submission for 4.9 review and 4.12 recipes. Existing-source proposal generators remain separate and proposal-only.

## Design decisions (this story)

Add one generic manifested submission capability whose concrete exported/tool name is fixed during dev step 02. Request uses shared typed operations, supplied Project/context, title, source/rationale and optional apply defaulting true. Actual transport identity supplies proposing actor, host and session; request metadata never impersonates a human approver.

Validate the whole submission using the sequential resolver before storing it. Resolve local references only to prior creations and verify actual persisted owners before considering aliases. Preserve operation/source/rationale data exactly as validated; do not silently repair invalid parent/Release references. A 200-Card cut may include extra operations for Releases, Personas and links: the 200-operation performance fixture is a separate benchmark, not an invented submission-size cap.

Valid protected or apply=false submissions create exactly one ChangeSet and no domain rows/snapshot. Unprotected new-command apply uses the shared executor and creates no intermediate per-Card ChangeSets. Structural validation errors identify operation index/id and reject the whole submission; transaction-start concurrency conflicts use the executor's conflict lifecycle.

A cut may include prepared source-import operations before its Cards/links. Source Links use persisted chunks or 4.5's typed earlier-import reference plus locator; this must work before any source row exists. Do not require protected callers to apply separate source proposals first.

## Task sequence

1. Contracts command/response modules and `packages/contracts/src/mcp/tool-inputs.ts`: define strict generic submission input/output from the current operation schema, including default apply and indexed validation errors.
2. `apps/server/src/application/changeset/`: add actor-required submission use case/descriptor, owner-aware sequential validation and one-ChangeSet persistence/execution orchestration.
3. MCP registration, shared tool definitions, descriptors and generators: expose the submission capability and regenerate manifest/tool documentation; register only the required surface rather than inventing an unrelated product flow.
4. Existing source/proposal builders: reuse operation contracts without turning source generators into automatic commands or introducing product-specific parsers.
5. Server transport/SQLite acceptance: publish a whole hierarchical cut of 200 Cards plus Releases/Personas/links, test protected and explicit proposed results, omitted apply, forged scope/identity and invalid local references; verify contracts/server tests and typecheck.

## Preliminary code map

`application/changeset/changeset.use-cases.ts`; 4.4–4.6 registry/executor modules; `packages/contracts/src/mcp/tool-inputs.ts`, `packages/mcp/src/tool-definitions/{tools,capabilities}.ts`; `apps/server/src/application/descriptors.ts`; `mcp/tools/register-tools.ts`; `mcp/http.test.ts`, `mcp/tools/complete-surface.test.ts`, `application/capability-manifest.test.ts`. New submission module/tool name is planned, not claimed present.

## Acceptance outline

- **Given** 200 Cards of all supported levels with backward parent refs, Releases/assignments, Personas and Source Links, **when** submitted, **then** exactly one ChangeSet is created and permitted apply resolves the whole cut in order.
- **Given** apply=false or protection, **when** valid input is submitted, **then** one proposal returns with no Card/domain rows or restore point.
- **Given** new source imports and dependent chunk links in the same cut, **when** protected submission previews, **then** earlier-import locators resolve in simulated state with no persisted source/chunk/Card rows.
- **Given** unknown parent/Release, forward reference, duplicate local id or foreign persisted owner disguised as an alias, **when** submitted, **then** the entire structural submission is rejected with offending operation index/id and no partial domain effects.
- **Given** omitted apply, operation/source/rationale metadata and actual Agent transport identity, **when** submitted, **then** apply defaults true, metadata is retained, actual owners are authorized and host/session persist without trusting actor claims.
- **Given** registration, **when** parity/docs tests run, **then** the tool is present in the actual registry, shared schema, capability manifest and generated documentation.

## Out of scope

BMad parser/recipe, source-specific generation changes, browser review, new arbitrary batch-size configuration or approval bypass for stored proposals.

## Risks and mitigations

Per-entity command reuse can accidentally create many ChangeSets: assert exactly one root proposal and inspect durable results. Structural validation before storage must remain distinct from apply-time conflict detection. Whole-cut identity fields cannot override owner/transport facts.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial generic submission plan.
- Version 2 (2026-10-10): Aligned prepared source imports and links with one protected proposal.
