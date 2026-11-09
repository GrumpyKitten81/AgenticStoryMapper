---
epic: 4
story: 4
status: ready
date: 2026-10-10
version: 2
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.4: Operation registry for the core objects

Reproducing statement: Prepare Story 4.4's typed core operation catalog, pure sequential resolver and dependency semantics, retaining persistence replacement for Story 4.6.

## Intent

Establish one typed definition and one pure description/resolution pair for each supported core change. Fulfills FR-31, FR-51 prerequisites and AD-1/AD-5.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md); use 4.1/4.2 source evidence and [4.3 references](story-plan-4-3-external-references-on-cards-releases-and-personas.md).
- 4.5 extends this exact union/catalog; 4.6 integrates it. Do not delete current repository semantics before the executor can persist resolved changes.

## Design decisions (this story)

The current strict operation object accepts `z.unknown()` payloads and a loose op/entity combination. Replace supported members with a typed discriminated catalog on `(op, entity)` including sources/rationale. Give every operation a unique stable id; local creation ids and operation ids have distinct roles.

Enumerate supported current Story Map/Card/Release/Persona commands and Source Link link/unlink plus external-reference upserts. For each pair record selector, fields, versioned owner, dependencies and failure cases. Strictly reject unsupported pairs. Keep existing map-copy/board-import vocabulary typed while 4.5 completes its coverage; no untyped escape hatch or dual compatibility executor.

Pure resolution simulates each selected operation on the preceding state with injected Clock/IdSource. Hierarchy and position behavior uses the existing core rules. Persisted identities win over aliases; literal Project/map/chunk fields never become aliases. Dependents include later local references, same-target work and descendant work, with transitive closure. Preview new keys are `NEW-n`; upsert may change and can implicitly unarchive.

## Task sequence

1. `packages/contracts/src/schemas/domain.ts`, new focused operation contract module if needed: replace unknown payloads with typed members/selectors/sources/rationale and update proposal builders/callers to this schema.
2. `packages/core/src/changesets/`, `packages/core/src/story-map/hierarchy.ts` and current position helpers: add typed snapshot/resolved-change contracts and one registry handler pair per supported member, injecting time/ids.
3. Core resolver/catalog: implement sequential local references, scope validation, external-ref create/update/unarchive resolution and deterministic operation dependency closure.
4. `packages/core/src/proposals/{proposal-builders,release-slice}.ts`, `packages/core/src/changesets/changeset.ts`: emit typed operations and remove default Date use from touched pure core code by requiring supplied time; retain proposal-only behavior.
5. Contracts tests and new focused core golden/catalog tests: cover each member, invalid pair/field, hierarchy/position parity, alias collision/forward reference and deterministic description/resolution. Run contracts/core tests and workspace typecheck.

## Preliminary code map

`packages/contracts/src/schemas/domain.ts: changeOperationSchema`; `packages/core/src/changesets/changeset.ts`; existing hierarchy module; proposal builders and release slice; `packages/db/src/repositories/changesets-repository.ts` supported-key whitelist and `cards-repository.ts` hierarchy/positions, read as parity baselines only. Current core ChangeSet helper's default Date is a purity gap to remove where touched.

## Acceptance outline

- **Given** supported Story Map/Card/Release/Persona/Source Link/upsert pairs, **when** schema/catalog tests run, **then** each has typed payloads, selector/owner/dependencies/errors and optional sources/rationale; no unknown payload or unsupported pair passes.
- **Given** each member, **when** described/resolved, **then** exactly one pure handler pair exists, golden fixtures cover it and core uses no node imports/Date/random/crypto.
- **Given** hierarchy/position changes, **when** resolved, **then** existing semantics match golden fixtures; persistence duplication remains scheduled for 4.6.
- **Given** Card creation or ref upsert, **when** previewed, **then** new keys are `NEW-n`, upserts say “may change”, and archived targets show update plus unarchive; apply allocation is left to 4.6.
- **Given** unknown targets/parents/Releases, duplicate local ids, forward refs or existing-owner alias collisions, **when** resolved, **then** indexed validation identifies the operation and refuses unsafe ownership.
- **Given** deselection, **when** closure runs, **then** all later local-reference/same-target/descendant dependents are deselected transitively.

## Out of scope

Remaining-object implementation, executor integration/removal of repository hierarchy, full Agent routing, browser preview rendering, new Card dependencies.

## Risks and mitigations

Strict schemas can strand current producers: migrate all current generated operations together and keep invalid old pending data from execution under 4.5's schema policy. Golden tests must model real hierarchy/positions, not only mirror new handlers.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial core catalog/resolver plan.
- Version 2 (2026-10-10): Corrected the existing core hierarchy path during consistency verification.
