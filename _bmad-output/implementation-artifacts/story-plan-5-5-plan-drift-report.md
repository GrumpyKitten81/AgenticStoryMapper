---
epic: 5
story: 5
status: ready
date: 2026-10-16
version: 4
epic_preparation: epic-5-preparation.md
---

# Story Plan 5.5: Plan drift report

Reproducing statement: Prepare Story 5.5 for bmad-build-auto developer planning in the authorized next wave, preserving epics acceptance, shared architecture and orchestrator ownership; write no runnable spec or application code.

## Intent

Compare the local map with a scoped external system synchronization baseline and expose read-only drift in UI/MCP.

## Cross-story constraints

Read [Epic 5 preparation](epic-5-preparation.md) and earlier completed story specs. Preserve contracts/core/repository/application boundaries, actual actor/version checks, ChangeSet-first external writes, restore and preview consistency. The Story 4.13 timing exception does not apply here. Current source anchors below are investigation inputs, not already-delivered new capabilities.

## Design decisions (this story)

Read AD-10 and completed Epic 4 upsert resolution. Addressed applied refs must set syncedVersion to the resulting entity version without advancing other systems. A version number alone cannot recover baseline fields; coalesced CardVersions and deleted refs are insufficient. Specify durable per-system/map synchronized snapshots and removal evidence in the runnable spec, reuse the typed state projection from 5.2 and persist a versioned per-system baseline with removal identities, independent of manual Plan-state capture. Advance only addressed applied baseline entries from final committed state; partial/deselected operations and other systems stay unchanged. Compare the scoped active cut, including unreferenced local additions; preserve archived versus physically deleted distinctions. Pure drift includes old/new Slice/title/description/status and added/removed IDs; never writes source files.

### Maintainer reconciliation decision — 2026-10-16

The maintainer accepted an explicit **Accept source reconciliation** ChangeSet step. An Agent proposes source values after updating its own source; a human reviews and approves the acknowledgment. Application revalidates the reviewed Card versions, external binding/baseline evidence and equality between proposed source fields/membership and the current local projection. Any intervening relevant change or divergence refuses the selected transaction atomically. Acknowledgment advances only addressed synchronization evidence and matching existing refs' syncedVersion, never Card fields or manual Plan states. Divergent Card updates require ordinary separately reviewed changes; ordinary upsert conflict checks remain unchanged. Agentic Story Mapper does not independently certify that the Agent actually edited its external files. The reviewed submitted source projection is the evidence being approved. No generic Agent auto-apply/Agent approval may bypass this human acknowledgment gate. See docs/adr/0006-source-plan-reconciliation.md.

## Task sequence

1. `packages/core/src/changesets/upsert-resolution.ts and packages/db/src/repositories/external-refs-repository.ts`: inspect existing addressed-only baselines; define durable field/membership snapshot and deletion evidence ownership in spec/ADR if needed.
2. `packages/contracts/src/schemas/domain.ts and packages/db/src/schema/{tables,classification}.ts/repositories`: typed versioned baseline storage/read/restore/import handling; ensure atomic publication updates and local deletions preserve removal evidence.
3. `packages/core/src/reports/`: pure per-system/map drift over supplied current/baseline snapshots, stable IDs and explicit old/new values.
4. `apps/server/src/application/report/report.use-cases.ts and descriptor/MCP manifest tests`: shared read-only UI/HTTP/MCP capability; unknown system lists available referenced systems.
5. `apps/web/src/features/reports/, Slices Plan-drift drawer and apps/web/src/ui-strings/`: system selector, honest changed/moved/added/removed presentation and empty state.
6. `Core/DB/server/web and synthetic publication tests`: human move names old/new Slice; human-approved matching source acknowledgment clears addressed drift (SM-10), stale/divergent/unapproved acknowledgment refuses atomically; title/description/status/add/remove drift, addressed-ref version equality, cross-system isolation, coalesced history/deletion and Restore.

## Preliminary code map

- `packages/core/src/changesets/upsert-resolution.ts and packages/db/src/repositories/external-refs-repository.ts` — inspect existing addressed-only baselines; define durable field/membership snapshot and deletion evidence ownership in spec/ADR if needed.
- `packages/contracts/src/schemas/domain.ts and packages/db/src/schema/{tables,classification}.ts/repositories` — typed versioned baseline storage/read/restore/import handling; ensure atomic publication updates and local deletions preserve removal evidence.
- `packages/core/src/reports/` — pure per-system/map drift over supplied current/baseline snapshots, stable IDs and explicit old/new values.
- `apps/server/src/application/report/report.use-cases.ts and descriptor/MCP manifest tests` — shared read-only UI/HTTP/MCP capability; unknown system lists available referenced systems.
- `apps/web/src/features/reports/, Slices Plan-drift drawer and apps/web/src/ui-strings/` — system selector, honest changed/moved/added/removed presentation and empty state.

## Acceptance outline

- **Given** a known system/map synchronized baseline, **when** a human changes Slice/title/description/status or adds/removes a Card, **then** UI and MCP name stable identity and exact old/new values; archive and physical deletion remain distinguishable.
- **Given** a synchronized Card followed by coalesced saves or deletion of its ordinary ref, **when** reopened/reported, **then** durable baseline values/removed identity remain available without guessing from Card Versions.
- **Given** an applied publication with addressed, excluded and unrelated-system entities, **when** it commits, **then** only addressed applied baselines advance to their final versions/values and conflicts never advance them silently.
- **Given** a human Slice move, **when** drift is read, the Agent updates its source and proposes a matching acknowledgment, a human approves and applies it, **then** old/new Slice appears in the first report and the second report is empty (SM-10).
- **Given** manual Plan-state capture in 5.2, **when** a state is recorded or compared, **then** no external syncedVersion/baseline advances; Restore recovers coherent state and source baseline separately.
- **Given** an unknown system, **when** requested, **then** the error lists systems represented by actual scoped references/baseline evidence; report reads never write source files, domain state or baseline.

## Out of scope

Automatic source-plan patching, global synchronization baselines, inferred missing history and applying drift as a mutation. No manual sprint/deferred-ledger changes, user-data mutation or push.

## Risks and mitigations

Deletion destroys ordinary refs and version coalescing loses exact snapshots. Test a durable baseline and removals explicitly; read-only calculations must not silently repair or advance baselines. Final spec refines exact symbols after source inspection and carries every epics criterion into executable acceptance; do not equate a plan or test substitute with actual browser evidence.

## Open questions

None. Requirements were reconciled first; exact implementation symbols are finalized in developer planning. The maintainer separately authorized an Epic-5-only run on 2026-10-13; the paused 4.13 follow-up stays documented and is not resumed.

## Changelog

- Version 4 (2026-10-16): Maintainer resolves the reconciliation gap with a separate human-approved matching-state ChangeSet acknowledgment; preserve ordinary upsert conflict refusal.

- Version 3 (2026-10-13): Recorded explicit scoped Epic 5 start authorization, preserving the separate 4.13 follow-up status.

- Version 2 (2026-10-13): Updated after Epic 5 currency check and maintainer Plan-state clarification; replaced generic acceptance with concrete state, action and result checks.

- Version 1 (2026-10-13): Prepared source-anchored tasks, acceptance, boundaries and failure risks for Story 5.5.
