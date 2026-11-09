---
epic: 5
story: 2
status: ready
date: 2026-10-13
version: 3
epic_preparation: epic-5-preparation.md
---

# Story Plan 5.2: Slices view

Reproducing statement: Prepare Story 5.2 for bmad-build-auto developer planning in the authorized next wave, preserving epics acceptance, shared architecture and orchestrator ownership; write no runnable spec or application code.

## Intent

Provide Release Slices with Stories, totals, status, blockers, comparison and Activity progress, plus auditable movement.

## Cross-story constraints

Read [Epic 5 preparation](epic-5-preparation.md) and earlier completed story specs. Preserve contracts/core/repository/application boundaries, actual actor/version checks, ChangeSet-first external writes, restore and preview consistency. The Story 4.13 timing exception does not apply here. Current source anchors below are investigation inputs, not already-delivered new capabilities.

## Design decisions (this story)

Consume the completed 5.1 typed edge snapshot. Core owns violation detection (prerequisite later or unscheduled), configured-done blockers, lane summaries and per-Activity progress. Counts and estimates include active Stories only; use configured workflow groups and explicit Unscheduled membership.

The maintainer confirmed comparison of Plan states on 2026-10-13. Record an immutable canonical Story Map state via an explicit human control; identify it with state ID, capture time and Project/map ownership. Persist a schema-versioned projection of Story IDs, displayed fields, hierarchy/Activity membership, Release assignment and Release ID/name/order. Include enough data to display both sides without reading today's mutable Cards. New snapshot storage belongs in DB repositories and schema classification; follow UoW, actor auditing, archive/Restore and ChangeSet-first policy for any Agent write. Record a proposed/accepted ADR through the required process if its storage ownership is an architecture-level decision; do not quietly change the aggregate register.

Before/After selectors select two states of the same map. Core compares active Story IDs: After-only Added, Before-only Removed, shared IDs with differing releaseId Moved with captured old/new Slice names (including Unscheduled). Shared IDs never produce duplicate Added/Removed rows. Release rename and within-lane reorder do not count as a move. Equal states give no membership differences; reversed states reverse differences. Selection/comparison is read-only and never applies or restores a state. Missing/unsupported snapshots produce a visible error; no inferred history from coalesced Card Versions.

Use the DESIGN Slice lane and labelled Before/After columns with captured identity/time and +, -, > change cues. Drag, keyboard and form movement share the existing human move use case. Both Planning and Slices recompute non-color violations from canonical state; preserve current board preview and dirty-editor/hold-updates behavior.

## Task sequence

1. `packages/contracts/src/schemas/domain.ts` and new contract schema: define state capture/read and comparison payloads, stable state identity, schemaVersion and scoped validation. Freeze exact interfaces in the spec.
2. `packages/db/src/schema/tables.ts`, `packages/db/src/schema/classification.ts` and a new repository: persist immutable canonical state, integrate archive/Restore, actor/UoW and read mapping. Do not use raw DB calls in the UI/server.
3. `packages/core/src/reports/`: pure state comparison, configured blockers, lane totals and Activity progress; golden tests for additions/removals/moves and exact inverse/equal-state outcomes.
4. `apps/server/src/application/report/report.use-cases.ts` and new state application use cases: typed capture/list/get/compare descriptors with existing ownership and external-write policy; register manifest/parity and snapshot consistency tests.
5. `apps/web/src/app/router.tsx`, new `apps/web/src/app/routes/story-map.slices.tsx` and Slices components: route/navigation, lanes, explicit Record plan state action, Before/After selectors and named old/new comparison rows; no automatic board restore.
6. `apps/web/src/features/story-map/components/SwimlaneGrid.tsx`, `PlanningView.tsx` and `apps/web/src/ui-strings/story-map.ts`: shared accessible violations and canonical human movement, focus/keyboard/form parity.
7. Core/DB/server/web and isolated actual-browser checks: two recorded states separated by real moves/add/delete/archive, reopen immutability, cross-map/schema refusal, rollback/Restore coherence, keyboard flow, configured statuses and measured 1,000-Card budgets.

## Preliminary code map

- `packages/contracts/src/schemas/domain.ts`: Card.releaseId, StoryMapSnapshot and configured statuses.
- `packages/db/src/repositories/cards-repository.ts`: existing human movement/versioning and coalesced history; history is not a Plan-state store.
- `packages/db/src/repositories/operation-snapshot-repository.ts`: canonical ChangeSet snapshot reading to inspect before designing the state projection; no assumption that it is already a durable user Plan-state store.
- `packages/core/src/reports/reports.ts`: existing pure report patterns.
- `apps/server/src/application/report/report.use-cases.ts`, `application/card/card.use-cases.ts` and `application/descriptors.ts`: real application/registration paths.
- `apps/web/src/app/router.tsx`, `app/routes/story-map-shell.tsx`, `features/story-map/views/PlanningView.tsx`, `features/story-map/components/SwimlaneGrid.tsx`: current routes, shared state and lane movement.
- `apps/web/src/ui-strings/story-map.ts`: actual central string module.

## Acceptance outline

- **Given** Releases, active Stories and configured workflow groups, **when** /slices opens, **then** it shows Story-only count/estimate/status totals, blockers and Activity progress, with its own navigation/history URL.
- **Given** a later or unscheduled prerequisite, **when** Slices and Planning render or a human moves the Story, **then** both show or clear named non-color violations from the committed state; drag/keyboard/form call the same use case.
- **Given** recorded Before {A in R1, B in R1} and After {A in R2, C unscheduled}, **when** compared, **then** A is Moved R1 -> R2, B Removed and C Added exactly once; reverse comparison reverses all endpoints/categories.
- **Given** equal states, a renamed Release with the same ID, or a within-lane reorder, **when** compared, **then** no spurious membership move appears; scheduled/unscheduled assignment changes are real moves.
- **Given** a captured state followed by Card/Release edits, deletion and Project reopening, **when** selected again, **then** it retains captured IDs/values/time; reads do not mutate the live board or sync baseline.
- **Given** cross-map, missing or unsupported state data, **when** compared, **then** a visible scoped error occurs without reconstructed history; archive/Restore handling preserves coherent supported states.
- **Given** the 1,000-Card fixture, **when** interacting/filtering, **then** measured board responses meet 100 ms and filters 300 ms; capture/comparison timing is reported separately without assuming a nonexistent capture budget.

## Out of scope

New slicing-proposal generation, graph layout and guessed movement history. No manual sprint/deferred-ledger changes, user-data mutation or push.

## Risks and mitigations

Current Release lists cannot prove a historical move; immutable recorded states now define the comparison boundary. Do not count parent estimates or assume hardcoded status strings. Final spec refines exact symbols after source inspection and carries every epics criterion into executable acceptance; do not equate a plan or test substitute with actual browser evidence.

## Open questions

None. Requirements were reconciled first; exact implementation symbols are finalized in developer planning. The maintainer separately authorized an Epic-5-only run on 2026-10-13; the paused 4.13 follow-up stays documented and is not resumed.

## Changelog

- Version 3 (2026-10-13): Recorded explicit scoped Epic 5 start authorization, preserving the separate 4.13 follow-up status.

- Version 2 (2026-10-13): Updated after Epic 5 currency check and maintainer Plan-state clarification; replaced generic acceptance with concrete state, action and result checks.

- Version 1 (2026-10-13): Prepared source-anchored tasks, acceptance, boundaries and failure risks for Story 5.2.
