---
epic: 4
story: 3
status: ready
date: 2026-10-10
version: 2
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.3: External references on Cards, Releases and Personas

Reproducing statement: Prepare Story 4.3 for scoped external identities, uniqueness, version baselines and UI discovery while reserving GitHub identity migration for Epic 7.

## Intent

Allow repeat Agent publication to address Cards, Releases and Personas by stable external identity without duplicates. Fulfills FR-52 storage and AD-10.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md); Epic 3 versioned roots/UoW are prerequisites.
- Expose identity lookup and addressed-system baseline for [4.4](story-plan-4-4-operation-registry-for-the-core-objects.md), executor and later delivery/BMad recipes. This story defines storage, not automatic upsert application.

## Design decisions (this story)

Use `external_refs(id, entity_type, entity_id, system, external_id, scope_id NOT NULL, synced_version, created_at)`. Unique keys are `(scope_id, entity_type, system, external_id)` and `(entity_type, entity_id, system)`. Scope comes from the actual Story Map or Project for project Personas; caller-supplied scope cannot authorize another owner.

System matches `[a-z0-9-]+`; trim external id but preserve case. Repeated identical binding is unchanged; changing an entity's same-system binding or reusing its scoped key for another entity fails. Initial baseline captures the resulting entity version inside the reference-creation transaction, including any version bump owned by that binding; subsequent sync advancement belongs to the applying executor and only its addressed system. Generic callers cannot write reserved `github` refs.

## Task sequence

1. `packages/contracts/src/schemas/domain.ts` and command/response schemas: define refs/selectors and strict system/id validation.
2. `packages/db/src/schema/tables.ts`, `schema/classification.ts`, `connection.ts`: add indexed unique storage and classification, following the preparation's development/schema-version policy and archive validation.
3. `packages/db/src/repositories/` owning Card/Release/Persona repositories plus focused reference persistence: validate real scope and entity type, implement identical-set/no-op and conflicting-binding refusals, and expose scoped lookup.
4. Owning deletion use cases/repositories: explicitly delete refs in the same UoW, preserve refs on archive and apply root version ownership consistently; test initial baseline versus resulting root version.
5. `apps/server/src/application/` descriptors, HTTP/MCP inputs and registration: expose attributed reads/writes and reserve adapter-only GitHub authority. Later 4.7 routes non-human domain changes through ChangeSets.
6. Card/Release/Persona UI, `apps/web/src/features/story-map/useStoryMapBoardState.ts`, API/snapshot and strings: show `system:id` badges and support cached-map search; test isolation, deletion/archive and duplicate constraints with actual SQLite.

## Preliminary code map

Existing anchors: `packages/db/src/repositories/{cards,releases,customizations}-repository.ts`, `repositories/root-versions.ts`, `schema/tables.ts`, `schema/classification.ts`; `apps/server/src/application/{card,release,persona}/`; `apps/web/src/features/{personas,releases,story-map}/`. A new dedicated external-ref module is a planned path, not an existing implementation.

## Acceptance outline

- **Given** the table, **when** scoped keys/bindings are inserted, **then** both exact unique constraints are enforced, including races, while the same external id in another valid scope remains legal.
- **Given** a Card/Release/Persona and valid trimmed case-sensitive id, **when** set, **then** owner-derived scope and initial entity baseline persist; an identical repeated set changes nothing and conflicting bindings are refused.
- **Given** reserved `github` or forged scope, **when** a generic caller sets a ref, **then** validation refuses before mutation.
- **Given** a referenced entity, **when** deleted versus archived, **then** deletion removes refs atomically and archive keeps them.
- **Given** a referenced object, **when** displayed/searched by `system:id`, **then** badges/search find it; use cases require actual ActorContext and run inside UoW.

## Out of scope

Epic 7 GitHub link migration, title-based matching, cross-map Card moves, automated upsert/preview behavior, new server search unless the accepted budget requires it.

## Risks and mitigations

Polymorphic references need explicit owner validation and deletion; SQL uniqueness alone cannot prove ownership. Reference changes must not leave `synced_version` stale relative to their own successful binding or advance unrelated systems. Preserve refs in archives/restores and classification tests.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial scoped-reference storage plan.
- Version 2 (2026-10-10): Clarified initial baseline versus the reference-owned root version bump.
