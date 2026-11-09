---
epic: 4
story: 9
status: ready
date: 2026-10-10
version: 2
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.9: Preview a ChangeSet on the board

Reproducing statement: Prepare Story 4.9 for server-only ChangeSet preview in Tree/Planning, accessible operation review and explicit stale/conflict handling.

## Intent

Review proposed effects in their board context and choose the exact operation selection before approval/application. Fulfills FR-53 and AD-4.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md); consume [4.8 submission](story-plan-4-8-an-agent-submits-its-own-changeset.md), shared 4.6 preview/executor/approval and Epic 3 live invalidation.
- Follow current DESIGN state cues and EXPERIENCE review/focus/conflict behavior. No Epic 5 view is needed to review non-Card effects.

## Design decisions (this story)

Expose `GET /api/changesets/:id/preview` through an actor-required read use case with selection input using shared contracts. Server sequentially resolves selected operations against current state and returns statuses, dependency closure, labelled before/after and resulting state. The web renders returned projections; it neither resolves operations nor computes dependency closure. Selection changes request a fresh server projection and invalidate prior selection-bound approval.

Tree uses existing TreeGrid; Planning uses SwimlaneGrid/Release lanes. Add one shared review surface for every operation, including sources, Persona, Roadmap/customization/file-coupled effects, so non-Card changes remain visible/selectable. Created keys use NEW-n; upserts show may change/implicit unarchive. Removed Cards remain struck through. All five marker kinds carry word/glyph/color on opaque pills, decorative glyphs aria-hidden.

Retain dirty editor text/focus and existing held-update behavior. Incoming edits invalidate review state and require explicit conflict resolution/resubmission; do not advance baselines automatically. Schema-stale content requires current-schema resubmission/fresh approval. Failed apply stays open and names cause/nothing applied; directly applied results remain reviewable through Activity. Closed/missing preview parameters show an Activity-linked callout then drop the parameter.

## Task sequence

1. Contracts preview/status/selection responses and `application/changeset/`: add the read descriptor and HTTP route using shared core sequential preview; enforce actual Project ownership/schema/lifecycle checks.
2. `apps/web/src/app/api.ts`, router search definitions and query keys: fetch server projection by ChangeSet/selection, preserve `card` search state and handle closed/missing ids.
3. `features/story-map/views/{TreeView,PlanningView}.tsx`, `components/{TreeGrid,SwimlaneGrid}.tsx` and feature state: render server-result Cards/Release lanes and accessible markers without a local preview engine.
4. Shared review component and `features/ai-mcp/`: show all operation before/after rows, dependency-driven selection, seven lifecycle status words, human controls and actual approver identity/policy.
5. `apps/web/src/app/live/`: invalidate preview/approval on relevant commits or epoch reset; preserve dirty editors/focus and use post-commit events for applied board refresh.
6. Add server semantic preview/apply comparison fixtures with normalized ids/keys/times and serial 200-operation server-preview measurement; add mounted interaction/accessibility/query-state tests and real browser inspection. Verify server/core/contracts/web checks.

## Preliminary code map

`apps/server/src/http/routes/changeset-routes.ts`; 4.6 core preview/executor; `apps/web/src/features/ai-mcp/AiMcpPanel.tsx`, `apps/web/src/features/ai-mcp/useAiMcpPanelState.ts`; TreeView/PlanningView and existing grids; `apps/web/src/app/live/{live-query-invalidation,useLiveUpdates,live-interaction-store}.ts`; `apps/web/src/app/routes/story-map-shell.tsx`; `apps/web/src/app/api.ts`; Activity route. Current Tree/Planning only render ordinary board state, and existing panel lists a truncated operation summary.

## Acceptance outline

- **Given** a stored proposal/selection, **when** GET preview runs, **then** current server state yields per-operation statuses and resulting state; web renders it without operation simulation.
- **Given** added/changed/moved/removed Cards and Release operations, **when** Tree/Planning review opens, **then** in-place markers/Release lanes appear; removed Cards remain visible, words are read and decorative glyphs are aria-hidden on opaque pills.
- **Given** operation deselection/upsert, **when** reviewed, **then** server dependency closure deselects dependents, apply skips them and upsert says may change.
- **Given** unchanged state and same selection, **when** preview then apply runs, **then** semantic results match after normalizing ids/keys/times; the separate server preview of 200 operations meets 500 ms.
- **Given** human approval/apply, **when** used, **then** controls remain available, Agent approval follows the flag, protection still blocks Agent apply, events refresh the board and direct applies remain in Activity.
- **Given** Proposed/Approved/Applied/Rejected/Discarded/Stale/Conflict, failed apply or incoming edits, **when** shown, **then** status/cause is explicit, failed work stays open, dirty text/focus survives and conflicts never silently skip operations.
- **Given** applied/discarded/missing `?preview` or incompatible schema, **when** opened, **then** closed/missing callout links Activity and drops the parameter; stale schemas require resubmission, not partial apply.
- **Given** any non-Card operation, **when** reviewed, **then** labelled before/after and selection controls exist without a future view dependency.

## Out of scope

Client preview engine, Epic 5 views/drift, implicit conflict skipping, new domain operations, changes to approval policy.

## Risks and mitigations

Fresh preview can accidentally replace approved baselines: keep displayed projection separate from immutable approved input. Late query responses must not replace a newer selection. Resolve the seven UX lifecycle labels through the shared contract, preserving rejected-proposal re-approval semantics and historical apply refusal.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial server projection and accessible board review plan.
- Version 2 (2026-10-10): Corrected current UI/server code-map path notation.
