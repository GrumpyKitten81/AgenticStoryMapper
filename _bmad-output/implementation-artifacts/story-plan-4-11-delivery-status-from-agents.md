---
epic: 4
story: 11
status: ready
date: 2026-10-10
version: 1
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.11: Delivery status from Agents

Reproducing statement: Prepare Story 4.11's scoped external-reference status batch with at most 100 unique Cards, atomic ChangeSet application and addressed-system baselines.

## Intent

Let Agents update delivery state by their stable references in one call, with all-or-none version checks and one Card operation/event per target. Fulfills FR-56.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md) and [4.7 routing](story-plan-4-7-writing-agent-tools-run-through-changesets.md); use 4.3 refs, 4.5 catalog and 4.6 executor.
- 4.12 uses this command after adapting Workflow Statuses through existing generic operations. Status setup precedes status assignment; do not invent statuses silently.

## Design decisions (this story)

Shared request targets a Story Map and carries system/external id plus target status per Card, optional apply default true, with at most 100 unique resolved Card targets. Resolve `(map, card entity, system, external id)` using real scope; reject blank/unresolved refs, duplicate resolved Cards and foreign-map statuses. Preserve case-sensitive trimmed reference semantics.

Normalize into exactly one selected status operation per Card in one ChangeSet. Addressed external baseline supplies optimistic concurrency; aggregate every version conflict and abort all status changes. Only the addressed system baseline advances on successful apply. Protected/explicit proposed calls change no statuses. Setup/adaptation of Workflow Status lists uses registry operations before assignment, respecting last-write-wins customization versus versioned Cards.

## Task sequence

1. Contracts bulk-status request/response and shared MCP input: validate maximum count, scoped targets/statuses, apply behavior and indexed unresolved/conflict results.
2. Application Card/ChangeSet use case and descriptor: resolve all refs/owners/statuses, reject duplicate resolved targets and build one ChangeSet containing one typed status operation per Card.
3. Existing core bulk/status member and executor/reference persistence: verify addressed baseline checks and per-Card version/history/Activity without duplicate composite-operation events.
4. MCP tool registration, definitions and capability generation: expose status command; preserve existing Workflow Status create/update tools through 4.7 routing and update docs.
5. `features/story-map/views/TrackingView.tsx`, live invalidation and current status configuration UI: verify configured method states and applied updates render without an independent bulk-write path.
6. Real temporary-SQLite and both Agent-surface acceptance: valid 100 batch, unresolved/duplicate/101/foreign-status/conflicting input, protection and apply=false, baseline isolation and durable audit. Measure the complete 100-status call serially on 1,000 Cards; run affected contracts/core/db/server/web checks.

## Preliminary code map

`packages/contracts/src/schemas/domain.ts` Workflow Status and refs added in 4.3; `application/customization/customization.use-cases.ts`; `application/card/card.use-cases.ts`; `mcp/tools/register-customization-tools.ts`; `repositories/cards-repository.ts`, root/history persistence; 4.6 executor; `features/story-map/views/TrackingView.tsx`; `app/live/live-query-invalidation.ts`. Current exposed status commands do not yet implement scoped bulk external-reference resolution.

## Acceptance outline

- **Given** up to 100 unique scoped Card refs and existing target statuses, **when** called, **then** one ChangeSet updates all atomically with one operation/Activity Event per Card.
- **Given** unresolved refs, duplicate Card targets, more than 100 or foreign-map statuses, **when** normalized, **then** the whole call is refused and unresolved/invalid targets are named; no partial statuses apply.
- **Given** method-specific status names, **when** created/adapted through generic operations before assignment, **then** valid Workflow Statuses exist and Tracking shows them.
- **Given** stale addressed baselines, **when** applying, **then** every conflict is reported and no Card changes; successful apply advances only the addressed system baseline.
- **Given** protection/apply=false, **when** called, **then** a proposal stores with unchanged statuses and no snapshot.
- **Given** the 1,000-Card fixture, **when** the real 100-status call runs serially, **then** the separate 2-second call bound is measured with full execution cost and failed measurements retained.

## Out of scope

Automatic status-name mapping, new Workflow engine, over-100 batches/chunked partial apply, GitHub identity migration, new Tracking view.

## Risks and mitigations

Two systems can address the same Card; deduplicate resolved identity rather than only input strings. Bulk composite vocabulary must normalize to per-Card events without double counting. A human edit must remain visible as a conflict rather than having its baseline overwritten during normalization.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial atomic delivery batch plan.
