---
epic: 4
story: 2
status: ready
date: 2026-10-10
version: 1
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.2: Provenance on every Card

Reproducing statement: Prepare Story 4.2 for typed Card origin evidence and truthful provenance, building on stable sources without inventing historical authorship.

## Intent

Every Card explains its recorded origin or honestly shows missing historical evidence. Fulfills FR-20.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md); depends on [4.1](story-plan-4-1-import-markdown-and-txt-sources-with-stable-chunks.md).
- Typed evidence feeds 4.4 Source Link members and 4.8/4.12 submissions. Preserve actual owner validation and Agent source visibility.

## Design decisions (this story)

Current `card_source_links` stores chunk ids only; Card detail renders those links and separate GitHub links. Extend contracts to a typed chunk/GitHub/free-text origin union, reusing existing structured GitHub identity rather than moving it into external refs early. Nonblank notes are text, never host paths.

Store creation origin independently from effective provenance. Unlinked human creations are manual; non-human/proposal creations are inference; any evidence makes them linked. Removing the final evidence restores recorded origin. Historical rows with no trustworthy creation evidence remain explicitly unknown; do not infer origin from the most recent editor or `source` label alone. All evidence changes obey Card root version/history/Activity rules.

## Task sequence

1. `packages/contracts/src/schemas/domain.ts`, command/response schemas: define evidence variants, creation-origin representation and effective provenance, including an honest historical unknown display.
2. `packages/db/src/schema/tables.ts`, `connection.ts`, `repositories/row-mappers.ts`, `repositories/cards-repository.ts`, `repositories/sources-repository.ts`: persist creation evidence on every actual creation path, adapt link/unlink, and backfill only recorded evidence under the preparation's schema policy.
3. `apps/server/src/application/card/card.use-cases.ts`, source/GitHub link use cases and corresponding routes: validate actual Card/chunk/GitHub ownership and nonblank notes; keep changes in attributed UoW.
4. `apps/web/src/features/story-map/components/CardDetailModal.tsx`, feature components, `apps/web/src/app/api.ts` and UI strings: render source locator, GitHub issue or origin note; add accessible Inferred/Origin not recorded labels and link/unlink controls.
5. Extend focused db source/Card/history tests and server source-ownership tests; add mounted Card detail assertions for evidence/badges. Verify contracts/db/server tests and web typecheck.

## Preliminary code map

`packages/contracts/src/schemas/domain.ts` source/link/Card schemas; `packages/db/src/repositories/sources-repository.ts` validates chunk Project and writes Card history; `cards-repository.ts` creation paths; `apps/web/src/features/story-map/components/CardDetailModal.tsx` `DetailSourceSections`; `apps/web/src/features/story-map/components/card-detail.test.ts`. Include copy/import/proposal creation paths during dev investigation so origin is not assigned only for direct CreateCard.

## Acceptance outline

- **Given** a Card and same-Project chunk, existing structured GitHub Issue or nonblank note, **when** linked in UI/use case, **then** typed evidence persists and Card detail names the origin.
- **Given** a foreign chunk or blank note, **when** linked, **then** validation refuses with no partial mutation; notes never trigger file access.
- **Given** human versus non-human/proposal creation without links, **when** stored, **then** provenance is manual versus inference and Inferred uses a readable word in addition to color.
- **Given** recorded creation origin, **when** evidence is added then its last link removed by another actor, **then** provenance becomes linked then returns to the original manual/inference state.
- **Given** existing Cards, **when** schema data is reconciled, **then** existing links remain; missing historical origin reads “Origin not recorded” without fabricated authorship.
- **Given** tests/typecheck, **when** run, **then** ownership, root versions/history and English string-module rendering pass.

## Out of scope

GitHub identity migration, arbitrary path/file provenance execution, inference of missing historical authorship, full ChangeSet routing.

## Risks and mitigations

Multiple evidence stores can make “last link” incorrect: compute effective provenance over all supported evidence variants. Preserve archive/restore serialization and source visibility filtering when changing link shapes. Historical unknown is a first-class result, not a fallback to manual.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial typed-evidence and creation-origin plan.
