# Recorded Plan states

- Status: proposed
- Date: 2026-10-15
- Deciders: maintainer (requirements); implementation proposal pending maintainer acceptance

Reproducing statement: Implement Story 5.2's explicitly recorded immutable Before/After Plan states, preserving existing root versions, audit, archive and Restore semantics. Version: 1. Changelog: Initial implementation proposal; no accepted architecture status is claimed.

## Context and Problem Statement

Card Versions coalesce and cannot reconstruct a captured Plan. AD-17 has no Plan-state table; AD-7 restricts Story Map version changes to Story Map fields. Captures need durable scoped identities and values without modifying the live cut or synchronization baselines.

## Decision Drivers

- Capture canonical committed values atomically with actor-attributed Activity.
- Preserve recorded Story and Release identities after their deletion.
- Reuse SQLite, repositories, archive classification and Restore.

## Considered Options

1. Immutable Project-owned records scoped to a Story Map, without changing domain root versions.
2. Story Map-owned children that require changing Story Map version semantics.

## Decision Outcome

Propose option 1. `plan_states` stores UUID identity, Project/map ownership, UTC capture time, a schema-version sibling and an immutable JSON projection. The projection includes captured Stories, hierarchy/Activities, Releases and configured workflow statuses; historical Card/Release IDs are values, not foreign keys. Capture is human-only through the existing synchronous UnitOfWork and emits `planState.recorded` Activity. No Agent capture tool or new ChangeSet operation is introduced. Read/list/compare capabilities use ordinary scoped Agent read authorization.

Archive retains records for the selected Project. Restore recovers records present at the restore point and removes later records, while existing undone-Activity handling remains unchanged. Unsupported or inconsistent payloads fail visibly; current Card history never substitutes for missing states. Manual capture never advances external synchronization baselines. The implemented proposal remains proposed until explicit maintainer acceptance; it does not silently revise AD-17.

### Consequences

- Add Project classification and versioned payload validation, including archive/Restore validation.
- Capture does not bump Card, Release or Story Map versions.
- Comparison remains read-only; no restore/apply control is added.
