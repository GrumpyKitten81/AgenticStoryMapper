---
epic: 4
story: 5
status: ready
date: 2026-10-10
version: 2
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.5: Operation registry for the remaining objects

Reproducing statement: Prepare Story 4.5 to cover all current writable domain families in the shared typed registry and version stored operation schemas without recursive lifecycle coverage.

## Intent

Complete the operation vocabulary so all current non-human domain writes can be routed through ChangeSets. Fulfills FR-30/FR-31 and AD-5.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md) and extend [4.4's catalog](story-plan-4-4-operation-registry-for-the-core-objects.md) rather than introducing another registry.
- 4.6 consumes resolved changes; 4.7 closes actual runtime routing. Registry parity alone does not prove writes already route through it.

## Design decisions (this story)

Catalog remaining Roadmap children/references, customization (annotations, workflow_statuses, story_templates, ai_function_templates), Product Context, attachments, park/unpark, archive/unarchive, reference set/unset, bulk status, reorder and child-strategy deletion. Also cover current Source import/chunks, Card-Persona/Card-Annotation links and map-copy/board-import effects. Each member has strict typed payload and one pure describe/resolve pair. Derive owner/version rules from AD-17 and actual current capabilities.

**Locked scope decision (2026-10-12):** `view_settings` is classified as a **planned-only family outside Epic 4's exposed-write catalog**. The DB schema/classification declares exactly four customization families (`annotations`, `workflow_statuses`, `story_templates`, `ai_function_templates`); there is no `view_settings` contract, table, repository or defined payload/owner anywhere in source. FR-12 Focus Release/per-View settings remains a documented PRD-gap that is explicitly not committed to as new functionality. The View Settings inclusions above are therefore a **planning requirement revision**, not an omitted effect to implement. Parity/tests classify View Settings as explicitly excluded from the current-write catalog; it is not an unexplained gap. This decision is recorded in deferred-work.md as DW-45 for traceability — no silent removal.

Classify human-only administration, ChangeSet lifecycle, restore/archive lifecycle, confirmed remote push and audit/sync bookkeeping explicitly. AI-template editing remains human-only; new Card dependencies belong to 5.1. File operations resolve prepared data/references, never execute host I/O in core.

Source import operations expose prepared document/chunk state in sequential simulation. Extend Source Link's typed selector with an earlier local source-import reference plus locator, alongside persisted chunk ids. This supports one protected cut proposal on an empty Project without inserting source rows first. Reject unknown locators/forward import references and include source-to-link edges in dependency closure; literal chunk ids still require actual persisted ownership.

Persist `operationsSchemaVersion` and retain historical schema-tagged applied data as readable history. Mark incompatible pending rows, including approved rows, stale. A current-schema resubmission and fresh approval are required; no partial application or compatibility fallback. Development schema bootstrap and operation-data transitions must follow the preparation's AD-9 distinction.

## Task sequence

1. `apps/server/src/application/descriptors.ts`, manifest and aggregate register: inventory every current write capability, map it to registry members or explicit exception, and record no unexplained gaps.
2. Contracts operation module and `packages/core/src/changesets/`: add remaining members and pure golden handlers, including source-derived chunks, links and copy/import fingerprint validation.
3. `packages/db/src/schema/tables.ts`, `connection.ts`, `repositories/row-mappers.ts`, `repositories/changesets-repository.ts`: store operation schema version and perform explicit incompatible-pending staleness transition; preserve applied/restore-undone history.
4. Archive/restore/versioned readers in `packages/db/src/` and `packages/contracts/src/schemas/project-archive.ts`: validate operation schema/status/version coherently without trying to execute historical data.
5. `apps/server/src/application/capability-manifest.test.ts`, capability-generation/parity scripts and contracts/core/db tests: assert catalog coverage, exception classification, one pair per member and no unknown payloads. Update generated artifacts through their generators.

## Preliminary code map

Current manifest/descriptors; `packages/db/src/repositories/{roadmaps,customizations,sources,tool-proposals,map-copy}-repository.ts`; root versions and schema classification; application source/customization/roadmap/tool-proposal use cases; `packages/db/src/restore-history.ts`, `archive-database.ts`. Existing copy/import proposals have reviewed fingerprints and resolved-result metadata that must remain distinct from immutable approved input.

## Acceptance outline

- **Given** every named remaining domain family, **when** catalog tests run, **then** each supported pair has strict payload and one describe/resolve pair with golden coverage.
- **Given** current manifest/aggregate coverage, **when** parity runs, **then** Source import/chunks, existing relationships and copy/import effects are included; View Settings is explicitly classified as a planned-only family outside the exposed-write catalog (see locked scope decision above, recorded in deferred-work.md as DW-45); all lifecycle/admin/remote/bookkeeping exceptions are explicit and the unexplained-gap list is empty.
- **Given** old pending and approved operation schemas, **when** an incompatible version transition runs, **then** rows become stale and cannot partially apply; applied history remains retained/readable and resubmission needs current schema/fresh approval.
- **Given** a prepared attachment/source operation, **when** resolved, **then** core performs no filesystem/network I/O and emits owner-validated resolved changes for 4.6.
- **Given** a local source import followed by a locator-addressed Source Link, **when** previewed/deselected, **then** prepared chunks resolve without persistence and deselecting the import removes dependent links; invalid locators/forward references fail.
- **Given** future Card dependencies or AI-template administration, **when** parity checks current scope, **then** neither becomes an unauthorized Agent operation.

## Out of scope

Executor/Agent routing, new dependency storage, GitHub identity migration, new strategy engines, prototype database compatibility.

## Risks and mitigations

A vocabulary checklist can miss indirect writes: use the actual manifest and read each family's persistence tests before claiming coverage. Historical applied payloads must remain readable without weakening the current submission schema. Scope/fingerprint checks remain attached to copy/import operations.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial complete-domain catalog/schema-version plan.
- Version 2 (2026-10-10): Added typed earlier-import chunk selection required by protected whole-cut publication.
