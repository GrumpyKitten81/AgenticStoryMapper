---
epic: 5
story: 3
status: ready
date: 2026-10-13
version: 3
epic_preparation: epic-5-preparation.md
---

# Story Plan 5.3: Dependency graph view

Reproducing statement: Prepare Story 5.3 for bmad-build-auto developer planning in the authorized next wave, preserving epics acceptance, shared architecture and orchestrator ownership; write no runnable spec or application code.

## Intent

Render filtered Card dependency relationships with fast selection/panning and an equivalent accessible table.

## Cross-story constraints

Read [Epic 5 preparation](epic-5-preparation.md) and earlier completed story specs. Preserve contracts/core/repository/application boundaries, actual actor/version checks, ChangeSet-first external writes, restore and preview consistency. The Story 4.13 timing exception does not apply here. Current source anchors below are investigation inputs, not already-delivered new capabilities.

## Design decisions (this story)

Consume 5.1 edges and shared pure 5.2 blocker/order rules; Graph never owns dependency persistence. Research a current layout library using official sources during implementation; record exact version, maintenance evidence, license/allowlist result and pin it. Share filters and selection between canvas and table. Keyboard: arrows pan, +/- zoom only with canvas focus, Tab nodes in dependency then title order, Enter selects. Table columns: Card, Depends on, Required by, Blocked order.

## Task sequence

1. `Current package/license policy and apps/web/package.json`: research, justify and pin layout library using primary sources; avoid SaaS or runtime outbound calls.
2. `apps/web/src/app/router.tsx and new story-map.graph.tsx route`: own /graph URL and navigation; render existing scoped snapshots.
3. `apps/web/src/features/story-map/`: canvas, non-color prerequisite/dependent highlighting and blocked list naming open prerequisites.
4. `Graph table twin, shared view model and apps/web/src/ui-strings/story-map.ts`: Activity/Slice/status/assignee filters, shared selection, aria-pressed toggle and keyboard interactions.
5. `Core/web fixtures and real isolated browser`: table/canvas equality, filtered empty states, focus-scoped shortcuts and measured 200-Card selection/filter/pan under 100 ms after layout.

## Preliminary code map

- `Current package/license policy and apps/web/package.json` — research, justify and pin layout library using primary sources; avoid SaaS or runtime outbound calls.
- `apps/web/src/app/router.tsx and new story-map.graph.tsx route` — own /graph URL and navigation; render existing scoped snapshots.
- `apps/web/src/features/story-map/` — canvas, non-color prerequisite/dependent highlighting and blocked list naming open prerequisites.
- `Graph table twin, shared view model and apps/web/src/ui-strings/story-map.ts` — Activity/Slice/status/assignee filters, shared selection, aria-pressed toggle and keyboard interactions.

## Acceptance outline

- **Given** Cards/edges from 5.1, **when** /graph opens, **then** node/edge state is scoped to the map and Activity/Slice/status/assignee filters affect the same canvas/table dataset.
- **Given** a selected Card and open prerequisites, **when** selection changes, **then** Requires/Required by non-color cues and a blocked list name the actual prerequisite keys.
- **Given** keyboard focus on the canvas, **when** arrows, +/- , Tab or Enter are used, **then** pan/zoom, dependency-then-title traversal and selection work; canvas shortcuts do not affect controls outside it.
- **Given** the aria-pressed table toggle, **when** switched, **then** the hidden representation leaves tab order and Card/Depends on/Required by/Blocked order columns share selection/filters.
- **Given** 200 Cards after layout, **when** selecting/filtering/panning, **then** measured responses are at most 100 ms; layout time is recorded separately.
- **Given** the chosen layout package, **when** installed, **then** exact pinned version, current primary-source maintenance/license evidence and allowlist result are recorded.

## Out of scope

Graph-based dependency edits, cycles, remote layout services and unrelated visualization features. No manual sprint/deferred-ledger changes, user-data mutation or push.

## Risks and mitigations

Layout time differs from post-layout interaction time; measure both separately. Do not use inaccessible canvas as the sole representation or install an unverified/unpinned library. Final spec refines exact symbols after source inspection and carries every epics criterion into executable acceptance; do not equate a plan or test substitute with actual browser evidence.

## Open questions

None. Requirements were reconciled first; exact implementation symbols are finalized in developer planning. The maintainer separately authorized an Epic-5-only run on 2026-10-13; the paused 4.13 follow-up stays documented and is not resumed.

## Changelog

- Version 3 (2026-10-13): Recorded explicit scoped Epic 5 start authorization, preserving the separate 4.13 follow-up status.

- Version 2 (2026-10-13): Updated after Epic 5 currency check and maintainer Plan-state clarification; replaced generic acceptance with concrete state, action and result checks.

- Version 1 (2026-10-13): Prepared source-anchored tasks, acceptance, boundaries and failure risks for Story 5.3.
