---
epic: 6
story: 8
status: ready
date: 2026-10-17
version: 2
epic_preparation: epic-6-preparation.md
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Story Plan 6.8: Manage Personas, Annotations, Statuses and Templates

Reproducing statement: Prepare Story 6.8 as part of the requested Epic 6 consistency, open-decision and current-codebase assessment, incorporating the accepted selections 1A/2C/3A/4A/5A/6B/7C/8A/9C. Define ordered implementation tasks and acceptance checks without implementing the story.

## Intent

Make existing customization CRUD fully reachable and safe when items are already used by Cards.

## Cross-story constraints

- Accepted decision record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md), 2026-10-17.
- Apply the shared decisions and ownership table in [Epic 6 preparation](epic-6-preparation.md). This is a detail plan for dev step 02, not a runnable spec or implementation authorization.
- Preserve actor-aware use cases, root baseVersion checks, ChangeSet-first nonhuman writes, source provenance, live-update holds, Restore epochs and read-only preview behavior.
- All static interface text comes from the English string modules. Reuse existing Dialog/announcement/conflict components and query invalidation.

## Design decisions (this story)

- Depend on 6.1 navigation and 6.2 shared fields. Apply accepted 4A for atomic used-status rename and replacement/deletion within the effective scope.
- Keep Story Templates distinct from AI/MCP prompt templates. Story Templates copy description skeletons and defaults; no durable live template reference is implied.
- Respect project versus optional map scope. CustomizeRoute currently reads remembered map identity; expose/validate the effective scope so a Project B URL never operates on Project A remembered map.
- Used Persona/Annotation may confirm unlink; used Workflow Status needs a valid replacement, never null. Apply replacement and deletion in one audited transaction with Card versions, source-drift/concurrency protections and ChangeSet parity.
- Statuses currently identify Card values by name; resolve the selected definition and effective scope before updating stored names; refuse ambiguous same-name ownership rather than guessing. Last-write-wins customization roots do not remove Card version requirements.

## Task sequence

1. `app/routes/customize.tsx; features/customization/CustomizationPanel.tsx; features/personas/PersonasPanel.tsx; PersonaDetail.tsx`: Expose effective project/map scope and full create/edit/delete UI for all four types, using named keyboard controls and existing Dialog.
2. `contracts customization requests; server/application/customization/customization.use-cases.ts; persona/persona.use-cases.ts`: Implement the accepted 4A replacement/unlink/rename contract; validate scope, affected roots and supported actor flow before mutation.
3. `db/repositories/customizations-repository.ts; core operation registry`: Perform atomic replacement/unlink/delete with canonical version/history/event effects and no silent cross-project edits; migrate affected Card status values on rename within effective scope and refuse ambiguous ownership before writes.
4. `CardDetailModal.tsx; agreed Card composer path; query invalidation`: Make templates populate descriptions at the agreed creation/edit point without replacing dirty text unexpectedly; invalidate options and affected map/report queries.
5. `customization/Persona DOM tests; DB/application contract tests`: Exercise used/unused deletes, replacement conflict rollback, scoped same-name statuses, invalid replacement, copied-template independence and project switching.

## Preliminary code map

Concrete existing entry points (repository-relative); short filenames in the tasks refer to these paths:

- `apps/web/src/app/routes/customize.tsx`
- `apps/web/src/features/customization/CustomizationPanel.tsx`
- `apps/web/src/features/personas/PersonasPanel.tsx`
- `apps/web/src/features/personas/PersonaDetail.tsx`
- `apps/server/src/application/customization/customization.use-cases.ts`
- `apps/server/src/application/persona/persona.use-cases.ts`
- `packages/db/src/repositories/customizations-repository.ts`
- `packages/contracts/src/schemas/change-operations.ts`

Dev refines this map against actual implementation and relevant tests before changes; graph coverage is stale. Proposed new contracts/components/tests are design targets, not existing files.

## Acceptance outline

- Given any of the four types, when creating/editing/deleting from the UI, then persistence and reachable controls match the API capabilities.
- Given an item still in use, when deleting, then a distinct valid effective-scope status replacement or confirmed Persona/Annotation unlinking is required under 4A and all Card changes commit atomically with versions/history.
- Given a template, when creating a Card from it, then its description skeleton is populated and later template deletion does not rewrite that Card.
- Given project/map switching or a stale affected Card, when submitting, then wrong-scope writes are refused and concurrency remains explicit.

## Out of scope

AI prompt-template redesign, new customization entity IDs on Cards without a separate architecture decision or cascading silent status renames.

## Risks and mitigations

Status-name matching currently scans visible Cards; inspect actual scope and collision behavior before reuse. Fetching usage counts in the UI cannot replace authoritative transaction-time checks.

## Open questions

None. The maintainer resolved all nine preparation questions on 2026-10-17. Apply the accepted decisions in the epic preparation and ADR 0007; readiness is planning readiness only.

## Changelog

- 2026-10-17 v1: Source-anchored detail plan; ownership, existing behavior, acceptance and open decisions reconciled with Epic 6 preparation.
- 2026-10-17 v2: Applied the maintainer's accepted decisions, resolved open planning questions and marked this detail plan ready. ETags/new Export navigation and binding Epic 6 timing gates remain outside scope.
