# Accept Epic 6 board scope and diagnostic performance

Reproducing statement: Record the maintainer's explicit Epic 6 selections 1A, 2C, 3A, 4A, 5A, 6B, 7C, 8A and 9C and reconcile the cross-module requirements they change.

- Status: accepted
- Date: 2026-10-17
- Version: 1
- Deciders: Agentic Story Mapper maintainer (explicit selection in the Epic 6 preparation conversation)

## Context and Problem Statement

Epic 6 planning exposed contradictions in Discovery content, Export navigation, bulk/customization mutation semantics and performance acceptance. The maintainer selected the behavior below before development. This decision changes planning and acceptance, not current runtime behavior or historical delivery evidence.

## Decision Drivers

- Preserve existing workflows and shared versioned mutation paths.
- Make destructive effects and Release delivery metrics unambiguous.
- Keep Epic 6 bounded: defer ETags, migration-framework work and binding timing gates.

## Considered Options

The nine preparation questions offered alternate interaction counting, Discovery density, bulk selection/delete policy, used-status policy, delivery/default Release scope, Export navigation, ETag scope, schema path and timing acceptance. The selected options below supersede the unaccepted proposals in preparation version 1.

## Decision Outcome

Chosen option: the maintainer's complete selection, recorded as one cross-story contract:

| Decision | Accepted behavior |
| --- | --- |
| 1A | Creation counts open and submit as two control actions; text entry inside the form is separate. |
| 2C | Discovery retains Release lanes, Workflow Status, estimate and priority alongside hierarchy/roles/Personas. Notes remain visible at legal root/Activity/Step positions. |
| 3A | Retain hidden selection; Archive and Delete are separate. Confirm full Delete scope and existing child strategy; resolve overlapping subtrees once and validate all target versions before an atomic local action. Push hands the selection to existing GitHub Dry Run/human confirmation, outside local atomicity. |
| 4A | Used Workflow Status rename and deletion/replacement update affected effective-scope Cards atomically with versions/history/audit. Require a distinct valid replacement; refuse ambiguous same-name ownership before writes. Confirm Persona/Annotation unlinking; copied template text is independent. |
| 5A | Delivery count/estimate/status totals use visible Stories only, excluding other roles and parked/archived ancestry. List unestimated Stories; 0 is estimated. Default Release list/Planning/Tracking exclude released with explicit show-all, preserve Unscheduled/assignments/history. Discovery lanes remain. |
| 6B | Export stays on existing View/Activity surfaces. No new Export route or rail entry; consolidated export center remains Later. |
| 7C | ETags, aggregate cache revisions and client 304 handling are deferred beyond Epic 6. Keep existing full snapshot reads/live invalidation. |
| 8A | Follow the current pre-release schema path for required indexes, consistent runtime/schema declarations and populated/reopen/current-schema Restore tests. Baseline versioned migrations stay in Story 8.1. |
| 9C | Measure Epic 6 performance diagnostically; no timing-based acceptance/CI gates or new statistical pass rule. Binding gates require a later decision. Preserve earlier-story timing gates, failures and accepted exceptions, and all functional/integrity/accessibility gates. |

### Consequences

- Good: PRD, Epics, architecture, UX and all ten story plans share the same accepted contract; no new ETag or migration subsystem is required by Epic 6.
- Bad: diagnostic performance measurements do not establish a binding latency guarantee; known misses must remain visible rather than be described as passing budgets.
- Neutral: this record does not launch a story, change sprint tracking or retroactively alter prior acceptance evidence. History coalescing remains governed by ADR 0002. AD-7/9/18/24 retain their IDs and now reference the accepted scope.

## Changelog

- 2026-10-17 v1: Recorded the nine explicitly accepted decisions and their scope boundaries.
