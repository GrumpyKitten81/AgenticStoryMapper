---
epic: 5
story: 1
status: ready
date: 2026-10-13
version: 3
epic_preparation: epic-5-preparation.md
---

# Story Plan 5.1: Dependencies between Cards

Reproducing statement: Prepare Story 5.1 for bmad-build-auto developer planning in the authorized next wave, preserving epics acceptance, shared architecture and orchestrator ownership; write no runnable spec or application code.

## Intent

Let humans and Agents declare same-map acyclic Card dependencies with visible related keys and atomic Card-owned versioning.

## Cross-story constraints

Read [Epic 5 preparation](epic-5-preparation.md) and earlier completed story specs. Preserve contracts/core/repository/application boundaries, actual actor/version checks, ChangeSet-first external writes, restore and preview consistency. The Story 4.13 timing exception does not apply here. Current source anchors below are investigation inputs, not already-delivered new capabilities.

## Design decisions (this story)

The Card owns outgoing edges (AD-17); use dependent -> prerequisite, unique pairs, resolved IDs and a named cycle path. No-op repeats do not add edges or increment versions. External references use existing scoped resolution. Registry dependency set/unset operations, sequential projection and execution must agree. Both Cards show incoming/outgoing counts and keys; modal controls support mouse and keyboard.

## Task sequence

1. `packages/contracts/src/schemas/domain.ts and existing changeset schemas`: define dependency requests, edge snapshots and typed operation payloads after checking the registry catalog.
2. `packages/core/src/changesets/operation-registry.ts and a new pure dependency module`: implement describe/resolve, cycle validation and deterministic golden fixtures; keep operation-selection closure separate.
3. `packages/db/src/schema/tables.ts, schema/classification.ts and repositories/cards-repository.ts`: add owned edges, repository access, snapshot integration, versioned set/unset and atomic cleanup with surviving-owner bumps; cover copy/archive/restore.
4. `apps/server/src/application/card/ and application/changeset/`: shared human use cases and Agent ChangeSet adaptation; register descriptors and prove HTTP/MCP/preview/executor parity.
5. `apps/web/src/features/story-map/components/CardDetailModal.tsx, Card badges and apps/web/src/ui-strings/story-map.ts`: related-key badges and accessible add/remove controls.
6. `Existing core/DB/server/web test suites`: verify duplicate aliases, self/cross-map edges, cycles, no-op idempotency, conflicts, deletion, rollback and actual modal flow.

## Preliminary code map

- `packages/contracts/src/schemas/domain.ts and existing changeset schemas` — define dependency requests, edge snapshots and typed operation payloads after checking the registry catalog.
- `packages/core/src/changesets/operation-registry.ts and a new pure dependency module` — implement describe/resolve, cycle validation and deterministic golden fixtures; keep operation-selection closure separate.
- `packages/db/src/schema/tables.ts, schema/classification.ts and repositories/cards-repository.ts` — add owned edges, repository access, snapshot integration, versioned set/unset and atomic cleanup with surviving-owner bumps; cover copy/archive/restore.
- `apps/server/src/application/card/ and application/changeset/` — shared human use cases and Agent ChangeSet adaptation; register descriptors and prove HTTP/MCP/preview/executor parity.
- `apps/web/src/features/story-map/components/CardDetailModal.tsx, Card badges and apps/web/src/ui-strings/story-map.ts` — related-key badges and accessible add/remove controls.

## Acceptance outline

- **Given** two Cards in one map, **when** an edge is set/unset, **then** the dependent owned state changes with one transactional version/audit update; repeating the same set or absent unset is a domain no-op.
- **Given** self/cross-map targets or a multi-edge cycle, including external-reference aliases, **when** resolved, **then** typed validation names the invalid cycle/ownership and no partial edge is applied.
- **Given** an Agent proposal, **when** described, previewed, selected, approved and applied, **then** resolution and executor agree on edge state/conflicts; failed application rolls back all effects.
- **Given** dependencies, **when** Cards and the detail modal render, **then** both endpoints show counts/related keys and add/remove works with mouse and keyboard using English strings.
- **Given** incoming/outgoing edges, **when** a Card is deleted, copied, archived or restored, **then** deletion bumps surviving dependent owners atomically, copy remaps internal edges, archive preserves edges and Restore recovers them coherently.

## Out of scope

Graph layout, Slice analytics, change drawer and source drift. No manual sprint/deferred-ledger changes, user-data mutation or push.

## Risks and mitigations

Alias cycles and deletion cascades can evade naive ID checks/versioning. Resolve identities before cycle tests; assert surviving owner versions and audit/restore consistency. Final spec refines exact symbols after source inspection and carries every epics criterion into executable acceptance; do not equate a plan or test substitute with actual browser evidence.

## Open questions

None. Requirements were reconciled first; exact implementation symbols are finalized in developer planning. The maintainer separately authorized an Epic-5-only run on 2026-10-13; the paused 4.13 follow-up stays documented and is not resumed.

## Changelog

- Version 3 (2026-10-13): Recorded explicit scoped Epic 5 start authorization, preserving the separate 4.13 follow-up status.

- Version 2 (2026-10-13): Updated after Epic 5 currency check and maintainer Plan-state clarification; replaced generic acceptance with concrete state, action and result checks.

- Version 1 (2026-10-13): Prepared source-anchored tasks, acceptance, boundaries and failure risks for Story 5.1.
