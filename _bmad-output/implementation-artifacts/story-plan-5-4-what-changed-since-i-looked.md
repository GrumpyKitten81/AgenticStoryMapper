---
epic: 5
story: 4
status: ready
date: 2026-10-13
version: 3
epic_preparation: epic-5-preparation.md
---

# Story Plan 5.4: What changed since I looked

Reproducing statement: Prepare Story 5.4 for bmad-build-auto developer planning in the authorized next wave, preserving epics acceptance, shared architecture and orchestrator ownership; write no runnable spec or application code.

## Intent

Expose other-client committed changes with actor/Card grouping, unseen markers, explicit seen state and Restore navigation.

## Cross-story constraints

Read [Epic 5 preparation](epic-5-preparation.md) and earlier completed story specs. Preserve contracts/core/repository/application boundaries, actual actor/version checks, ChangeSet-first external writes, restore and preview consistency. The Story 4.13 timing exception does not apply here. Current source anchors below are investigation inputs, not already-delivered new capabilities.

## Design decisions (this story)

Follow AD-11 contentless SSE and canonical refetch. Store last-seen per Project/epoch in browser; expose actual originClientId via contracts because DB has it but current Activity output omits it. Existing Activity pagination is createdAt/id, not after-sequence: provide a typed sequence read without replacing audit semantics. Filter only this browser client; other tabs, Agents and GitHub remain visible. Mark all as seen advances the observed high-water, retaining concurrently arriving events. Marking an actor group acknowledges only its displayed events; it must not hide unseen events of another group. Persist scoped group acknowledgements as necessary and advance the global seen cursor only across acknowledged events; freeze the minimal representation in the spec. Restore resets epoch and markers; dirty editing/hold-updates remain honored.

## Task sequence

1. `packages/contracts/src/schemas/{domain,audit}.ts, packages/db/src/repositories/audit-repository.ts`: safe sequence/origin read shape and repository query, Project scope and undone/epoch treatment.
2. `apps/server/src/application/customization/customization.use-cases.ts or shared read descriptor`: register scoped after-sequence capability and HTTP/MCP parity as required by capability model.
3. `apps/web/src/app/live/{live-client-id,live-stream,live-query-invalidation,live-interaction-store}.ts`: reuse current client identity, contentless notifications and refetch; no polling.
4. `apps/web/src/features/story-map/ and new change drawer`: actor/Card grouping/counts, non-color board markers, Mark as seen per group/all and 420px drawer with focus return.
5. `apps/web/src/features/restore-points/RestorePointsPanel.tsx and strings`: link genuine Agent-session restore points; no new undo mechanism.
6. `DB/server/web plus isolated two-client browser fixtures`: within-2-second changes, same-client exclusion, observed-high-water race, Project switching, storage failure visibility, hold-updates and epoch reset.

## Preliminary code map

- `packages/contracts/src/schemas/{domain,audit}.ts, packages/db/src/repositories/audit-repository.ts` — safe sequence/origin read shape and repository query, Project scope and undone/epoch treatment.
- `apps/server/src/application/customization/customization.use-cases.ts or shared read descriptor` — register scoped after-sequence capability and HTTP/MCP parity as required by capability model.
- `apps/web/src/app/live/{live-client-id,live-stream,live-query-invalidation,live-interaction-store}.ts` — reuse current client identity, contentless notifications and refetch; no polling.
- `apps/web/src/features/story-map/ and new change drawer` — actor/Card grouping/counts, non-color board markers, Mark as seen per group/all and 420px drawer with focus return.
- `apps/web/src/features/restore-points/RestorePointsPanel.tsx and strings` — link genuine Agent-session restore points; no new undo mechanism.

## Acceptance outline

- **Given** a Project/epoch last-seen cursor and other-client Card commits, **when** the panel opens/refetches, **then** real after-sequence events group by actor and Card with correct counts.
- **Given** commits from this client, another tab, an Agent and GitHub, **when** SSE invalidates canonical reads, **then** only this client's changes are excluded and others appear within 2 seconds without polling.
- **Given** unseen sequence 20 is displayed and 21 arrives concurrently, **when** Mark as seen runs, **then** the observed cursor advances only to 20 and 21 remains unseen; group/all actions retain honest markers.
- **Given** two unseen actor groups, **when** only one group is marked seen, **then** the other group and its markers remain unseen after reopening; the global cursor cannot skip unacknowledged events.
- **Given** a dirty editor or held updates, **when** other-client events arrive, **then** typed fields and focus remain stable and markers follow the existing hold/refetch contract.
- **Given** keyboard navigation, **when** the drawer closes or an Agent session restore link is followed, **then** focus returns appropriately and actual restore points are reachable with English actor/glyph cues.
- **Given** a real Restore/new epoch, **when** canonical reads reset, **then** previous epoch cursors and undone history do not generate false current-change badges.

## Out of scope

New undo engine, modifying domain versions for seen actions, polling, event content in SSE and cross-Project sequences. No manual sprint/deferred-ledger changes, user-data mutation or push.

## Risks and mitigations

Same-client filtering must use origin identity, not actor type. Lost-arrival races and reused sequence numbers after Restore require Project/epoch/high-water tests; preserve existing audit paging. Final spec refines exact symbols after source inspection and carries every epics criterion into executable acceptance; do not equate a plan or test substitute with actual browser evidence.

## Open questions

None. Requirements were reconciled first; exact implementation symbols are finalized in developer planning. The maintainer separately authorized an Epic-5-only run on 2026-10-13; the paused 4.13 follow-up stays documented and is not resumed.

## Changelog

- Version 3 (2026-10-13): Recorded explicit scoped Epic 5 start authorization, preserving the separate 4.13 follow-up status.

- Version 2 (2026-10-13): Updated after Epic 5 currency check and maintainer Plan-state clarification; replaced generic acceptance with concrete state, action and result checks.

- Version 1 (2026-10-13): Prepared source-anchored tasks, acceptance, boundaries and failure risks for Story 5.4.
