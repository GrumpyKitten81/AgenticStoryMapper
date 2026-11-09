---
epic: 5
date: 2026-10-13
version: 3
status: ready-for-planning
---

# Epic 5 currency check

Reproducing statement: First check Epic 5 against completed Epic 4 and current PRD/architecture/UX/source, adjust outdated story requirements, then prepare its stories for implementation. Withhold implementation until both steps complete.

## Execution boundary

Requirement currency check and story reconciliation completed first; shared preparation and all five detail plans were then updated to version 2 with bmad-prepare-epic. No Epic 5 implementation or runtime acceptance is claimed. This report records preparation readiness only. The automatic transition controller is gone and its script no longer starts Epic 5. Run 20261013-193420-d734 is paused on a Story 4.13 follow-up browser-control escalation; its unfinished working files remain preserved. On 2026-10-13 the maintainer explicitly instructed: “Comitte und starte epic 5”. This authorizes a separate Epic-5-only run after the reconciled plans are committed, despite the paused 4.13 follow-up. It does not mark 4.13 passed, change its evidence or restart its run; future Epic 5 gates remain mandatory. No manual orchestrator tracking change is authorized.

## Confirmed product decision

On 2026-10-13 the maintainer answered: “5.2 bezieht sicj auf planstände”. Therefore Story 5.2 compares two recorded Before/After states of the same Story Map. Releases are lanes inside those states. Stable Story identity determines additions/removals, Release assignment changes determine moves. State identity/time, immutability, reopening, reverse/equal-state outcomes and visible errors are now explicit acceptance. FR-62, epics and UX companions were updated together.

## Findings and required story adjustments

| Story | Current evidence | Required adjustment before planning |
| --- | --- | --- |
| 5.1 | No card_dependencies table or domain-edge registry handler; Epic 4 provides typed resolution, preview, executor and scoped reference publication. | Update baseline; explicitly cover no-op set/unset, same-map alias cycles, complete preview/application parity, conflict/rollback/restore, and surviving dependent versions on deletion. Card edges remain distinct from operation-selection dependencies. |
| 5.2 | Planning swimlanes and canonical Card movement exist; Card has one nullable releaseId. No Slices route or dependency awareness. PRD/UX promise two-Slice added/removed/moved comparison without defining time/baseline semantics. | Keep lane/progress/blocker scope; bind the confirmed Before/After Plan-state comparison, immutable captured membership and exact directional semantics. A static current membership difference cannot substantiate historical moves. Preserve 100ms board/300ms filter budgets with 1,000 Cards. |
| 5.3 | No Graph route; dependency snapshot from 5.1 and pure blocker rules from 5.2 are required. | Make dependency ordering explicit; research/pin/allowlist library in implementation, prove equivalent filtered canvas/table and focus-scoped keyboard actions; preserve measured 200-Card 100ms post-layout requirement. |
| 5.4 | Ordered epoch:seq live stream/client origin exists. DB Activity stores originClientId; Activity output omits it. Existing listActivityPage paginates createdAt/id. | Add contract/repository sequence/origin read requirements; Project/epoch seen state, current-client exclusion, concurrent observed-high-water seen semantics, undo historical filtering, and restore reset. Preserve 2-second visibility and hold-updates/dirty-editor behavior. |
| 5.5 | Scoped refs/syncedVersion and addressed-only publication exist. CardVersion saves coalesce within 60s and deletion removes refs. No drift read capability or durable baseline field snapshot exists. | Baseline is partially delivered, not none. Require explicit durable synchronized field/membership and removal evidence; no reconstruction from coalesced history. Preserve per-system scope, human conflict refusal, addressed-only baseline advance and read-only UI/MCP report. Define unreferenced additions, archive versus deletion, and partial publication semantics in executable acceptance. |

## Source anchors

- epics.md Epic 5 and PRD FR-60–64, NFR-1/NFR-5, SM-10.
- ARCHITECTURE-SPINE.md AD-3/5/10/11/17/24.
- DESIGN.md Slice lane/Graph twin/actor markers; EXPERIENCE.md own routes, drift drawer, live/restore interaction.
- packages/db/src/schema/tables.ts; packages/contracts/src/schemas/domain.ts.
- packages/core/src/changesets/upsert-resolution.ts: addressed ref version and conflict checks.
- packages/db/src/repositories/cards-repository.ts: deleteCard and coalesced writeCardVersion.
- packages/db/src/repositories/external-refs-repository.ts: deleteExternalRefsForEntity.
- packages/db/src/repositories/audit-repository.ts: listActivityPage.
- apps/web/src/app/live/live-client-id.ts, app/router.tsx and PlanningView.tsx.

## Second-step preparation

[Shared preparation](../implementation-artifacts/epic-5-preparation.md) and all five linked detail plans are version 3 and ready for bmad-build-auto step 02. They carry concrete tasks, source anchors, cross-story interfaces and story-specific Given/When/Then criteria. The 5.2 immutable snapshot projection is reusable by 5.5, but manual captures never advance external sync baselines. Graph-library choice and exact storage symbols remain developer-spec implementation choices; any far-reaching persistence ownership decision follows the required ADR process. There are no unresolved product questions in this preparation.

## Consistency verification

Canonical Epic 5 includes exactly Stories 5.1–5.5 and retains FR-60–64. The shared dependency sequence and each plan's scope agree. Old two-current-Slice comparison wording is absent from requirements/UX/plans; Plan-state comparison and read-only baseline handling agree. Existing source paths and all preparation links were checked; future paths are labelled new. Metadata and git whitespace checks pass. No application tests were run for these document-only changes; no application/API/schema, user data or sprint/deferred-ledger edits were made by this planning work. Earlier 4.13 working edits are distinct and preserved.

## Open questions

None for Epic 5 requirements/preparation. The maintainer explicitly authorizes a separate Epic 5 run after commit. The 4.13 follow-up remains paused and retains its blocked result.

## Changelog

- Version 3 (2026-10-13): Recorded explicit commit and Epic-5-only start authorization after completed reconciliation/preparation.

- Version 2 (2026-10-13): Applied maintainer Plan-state decision to canonical requirements and prepared all five stories in a separate second step; verified consistency and kept dispatch held.
- Version 1: Checked delivered source and bound requirements; identified five story updates and one blocking product ambiguity; stopped automatic Epic 5 transition.
