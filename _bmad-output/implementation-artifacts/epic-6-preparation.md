---
epic: 6
status: ready
date: 2026-10-17
version: 2
readiness: planning-ready
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Epic 6 Preparation: Everyday board work

Reproducing statement: Prepare Epic 6, check consistency among all ten stories, identify decisions required before implementation, and verify fit with the current Agentic Story Mapper codebase. Produce and reconcile a shared implementation contract and ten detail plans using the maintainer selections 1A, 2C, 3A, 4A, 5A, 6B, 7C, 8A and 9C, without starting development or changing orchestration state.

## Goal

Complete everyday Card creation, movement, search, bulk actions, view behavior, customization and Releases using the existing local application. Preserve the completed Epic 2–5 contracts for optimistic concurrency, provenance, ChangeSets, live updates, Restore and history. The maintainer accepted all nine decisions on 2026-10-17. Preparation and all ten detail plans are ready for dev step 02; this is planning readiness, not implemented behavior, runtime acceptance or authorization to start the loop.

Date: 2026-10-17. Version: 2. Source revision: `ab50aa78263d10bdcd32c410a7aee97f106ca912`. All ten sprint rows are backlog; delivery conclusions come from source and evidence, not those rows.

## Story sequence

| Order | Story and detail plan | Depends on | Deliverable |
| --- | --- | --- | --- |
| 1 | [6.1 Every function reachable and addressable](story-plan-6-1-every-function-reachable-and-addressable.md) | Existing router/live shell | Ungated page links, landmarks/focus; existing Export surfaces retained. |
| 2 | [6.2 Create and edit Cards](story-plan-6-2-create-and-edit-cards.md) | 6.1 shell | All-role creation with open+submit counting, units and accessible controls; retain Discovery delivery fields. |
| 3 | [6.3 Move Cards by mouse, keyboard or form](story-plan-6-3-move-cards-by-mouse-keyboard-or-form.md) | 6.2 tile identity | Equivalent move paths, pointer-only drag, Discovery focus and shared atomic selected-set Delete primitive/confirmation. |
| 4 | [6.4 Search, filter and bulk actions](story-plan-6-4-search-filter-and-bulk-actions.md) | 6.2 categories; 6.3 focus | Complete predicates, retained hidden selection, distinct Archive/atomic Delete and selected-set Dry Run handoff. |
| 5 | [6.5 Collapse, Card Keys and Notes](story-plan-6-5-collapse-card-keys-and-notes.md) | 6.2 Notes; 6.3 focus; 6.4 filters | Hierarchy collapse, prefix and Story-only delivery eligibility. |
| 6 | [6.6 The five core Views](story-plan-6-6-the-five-core-views.md) | 6.2–6.5; current release report | View projections, retained Discovery fields, complete grid semantics and Tracking summary slot. |
| 7 | [6.7 Card detail as a deep-linkable modal](story-plan-6-7-card-detail-as-a-deep-linkable-modal.md) | Existing Dialog/router; 6.1/6.3 integration | Accessible editor and preserved deep links, focus and dirty-close guards. |
| 8 | [6.8 Manage Personas, Annotations, Statuses and Templates](story-plan-6-8-manage-personas-annotations-statuses-and-templates.md) | 6.1 navigation; 6.2 fields | Full CRUD with atomic effective-scope used-status rename/replacement. |
| 9 | [6.9 Manage Releases and read their summary](story-plan-6-9-manage-releases-and-read-their-summary.md) | 6.3/6.4 assignments; 6.5/6.6 summary | Full Release fields, Story-only summary, default open scopes and show-all. |
| 10 | [6.10 Performance and accessibility budgets](story-plan-6-10-performance-and-accessibility-budgets.md) | 6.1–6.9 integrated behavior | Diagnostic measurements, required indexes and binding accessibility checks; no ETags or timing gates. |

All plans have status ready. Keep canonical story keys/titles and the numbered execution sequence. Story 6.3 builds the grid/focus primitives needed for its own keyboard acceptance; 6.6 completes semantic coverage. Story 6.6 embeds the existing summary and 6.9 enhances that same shared component, avoiding a future-story prerequisite. Story 6.3 implements the shared atomic selected-set Delete command and confirmation required by its own keyboard contract; Story 6.4 reuses them in the bulk toolbar and adds retained-hidden selection. This avoids a prerequisite on unfinished Story 6.4. Story 6.10 retains final integration checks; no client loops over individual Delete requests. Accessibility belongs to each feature story and remains a binding integrated gate in 6.10.

## Current code fit and baseline corrections

| Stories | Verified source and implication |
| --- | --- |
| 6.1 | `apps/web/src/app/routes/RootLayout.tsx:49,96` and `story-map-shell.tsx:100,134` still gate links with `VITE_DEV_FEATURES`. `app/router.tsx` already defines real routes including Slices and Graph. RootLayout currently wraps the application in `main`, its main nav is unnamed, and its h1 uses the map name. Extend routing; preserve `card`, `preview` and Restore-point search state. |
| 6.2 | `features/story-map/card-taxonomy.ts` and `card-visual-options.ts` already centralize role labels, category colors and priority options. `CardDetailModal.tsx:319` lacks a map-unit label; CardTile uses points formatting. `DiscoveryMatrix.tsx:212,221` creates Steps/Stories; Notes have a legal domain shape but no equivalent normal composer path. No second taxonomy or category registry is needed. |
| 6.3 | `MoveAreaDialog.tsx` only offers Unscheduled/Not assigned, with two different mutations. Matrix/Backlog/Swimlane/Slices use DndContext defaults, not an explicitly configured KeyboardSensor. Removing an import alone cannot satisfy the keyboard AC: supply pointer-only sensors and a complete alternate move path. Hierarchy rules are in `packages/core/src/story-map/hierarchy.ts`; Notes may have null, Activity or Step parents. |
| 6.4 | `useStoryMapBoardState.ts:104,365` already searches chunk/note/GitHub source evidence and legacy GitHub links. Current remote WorkItem links feed badges but not the filter haystack/Sync State predicate. `BoardFilters` has no color. The effect at lines 193–199 discards hidden selection; bulk operates on selectedVisibleIds. This conflicts with the accepted retained-hidden-selection behavior (3A). Bulk patch exists and asserts all base versions before writes. No bulk hard-delete command exists. |
| 6.5 | Persisted Tree hierarchy collapse exists, Discovery persistence is Release-lane collapse only. `cards-repository.ts:45,367` uses the stored next-card counter already. `work-item-repository.ts:129` excludes Notes from push. `core/reports/reports.ts:29` includes Notes in totalCards, estimateTotal and statusCounts, so delivery exclusion is a real gap. |
| 6.6 | Five requested views, Timeline, Slices and Graph already exist. CardTile displays workflow status/estimate/priority in Discovery, now intentionally retained by 2C; it lacks assigned Persona display and uses h3 inside tiles. Tracking mounts ReleaseKanban without the separate ReleasePanel summary. Planning already exposes inline fields; verify before changing them. |
| 6.7 | `CardDetailModal.tsx:260,382` already uses shared Dialog with dirty-close protection. `components/Dialog.tsx` traps focus, inerts background and restores same-Card or board focus; its document capture Escape handler needs coordination with the editor. Rich Markdown and history paths already have tests. Focus on missing toolbar names/toggle state, editor name/frame, layered Escape and route regressions. |
| 6.8 | `CustomizationPanel.tsx` creates statuses/annotations/templates but only lists them afterwards. Persona has separate UI. Used Workflow Status deletion currently returns conflict; Persona/Annotation deletion unlinks Cards and writes history. Card.status stores a name, not a status ID. Accepted 4A requires atomic effective-scope rename/replacement with affected Card version checks; ambiguous same-name ownership is refused before writes. `CustomizeRoute` gets map identity from a UI store without a shareable map selector. |
| 6.9 | Release persistence already has goal, startDate, releaseDate and released:boolean (`schema/tables.ts:46`). ReleasePanel creates by name and displays numeric summary/risk counts. The report has statusCounts but no unestimated Story list. Do not invent another Release status enum or rename releaseDate to endDate. |
| 6.10 | jsdom and extensive DOM tests already exist. `web/package.json` has no axe-core or Testing Library dependency and its default test script allows zero tests. Some DB indexes already exist, but the two required Card indexes are missing. Full map snapshot reads remain intentional under 7C. `db/src/connection.ts` uses the pre-release bootstrap path retained by AD-9/8A; generated baseline migrations remain Story 8.1. |

The 2026-10-04 board baseline remains useful historical evidence, not a statement of present runtime behavior. Its relationship-version gaps are superseded by Epic 2; its search, Notes, units and summary observations still identify source-confirmed gaps. Its old Discovery restriction is superseded by 2C. Epic 5 is delivered with open items; its acceptance exceptions remain historical and scoped; Epic 6 measurements are diagnostic under 9C, not inherited passes or waivers.

## Shared design decisions

1. Contracts remain in `packages/contracts`; pure rules and calculations in `packages/core`; all persistence in `packages/db`; actor-aware application use cases own transaction boundaries. Web calls `app/api.ts`. Preserve capability manifest/HTTP/MCP parity when adding a public command. Never import Drizzle into web/server use cases.
2. Human board actions use existing versioned commands. Nonhuman actions go through the existing ChangeSet-first submission and separately audited Apply flow. Do not add direct agent writes or use a human approval as permission to bypass concurrency checks.
3. Every accepted Card save advances its root version once per transaction, including owned links. History uses the existing same-actor/session 60-second coalescing and dependency-history boundaries (`cards-repository.ts:407`; architecture AD-7 and ADR0002). Interpret the Story 6.2 wording through that already binding rule; do not require one new history row per Save. Record this clarification when reconciling epics/PRD wording.
4. Use existing Dialog, Announcements, live-interaction store, conflict UI, `useLatestVersions` and report invalidation. Stable Card identity is `id`, display identity is `key`. Route-level focus runs on page changes, not merely query changes that open a Card or preview. Dirty drafts and incoming changes retain existing holds and explicit conflict behavior.
5. Reuse `cardLevelMeta`, `CARD_PRIORITY_OPTIONS`, `CARD_COLOR_CATEGORIES` and English string modules. Show estimationUnit in applicable tiles, forms, Tree, Tracking and summaries, including retained Discovery estimate output. UI categories do not justify narrowing persisted arbitrary color values or priority strings without a separate decision; legacy/custom values must remain visible without silent remapping.
6. All pointer reorder/reparent/Release assignment and matching keyboard/form actions call the existing move use case with `{parentId, position, releaseId}` and current baseVersion. Park/unpark remain lifecycle use cases, not fake moves. Scope shortcuts to the tile itself and keep form/editor events out. Preserve dependency/change/conflict/preview markers and read-only projections.
7. Under accepted 3A, Story 6.3 owns the shared atomic selected-set Delete primitive/confirmation needed by its keyboard contract; Story 6.4 owns retained-hidden selection, the bulk toolbar and bulk-patch/push integration, reusing that Delete primitive. Structural ancestors retained for hierarchy context are not search matches or implicitly selected Cards. Prune deleted/inaccessible IDs, not merely filtered IDs. On apply, make the complete target count visible and validate all target versions before any write.
8. Story 6.5 owns visible-Story-only delivery calculations under 5A; 6.6/6.9 consume one pure report implementation. Board visibility and delivery eligibility are different predicates: Notes remain usable on the map. Preserve parked/archived-ancestor exclusion and legitimate zero estimates.
9. 6.3 owns traversal/Move/focus and shared atomic Delete/confirmation; 6.6 owns final view projections and grid/table conformance; 6.7 owns modal/editor behavior; 6.10 owns integrated quality gates. No duplicate focus manager, report calculator or second modal system.
10. ETags, conditional map reads, cache aggregate revisions and client 304 handling are deferred under 7C. Existing full snapshot reads and live invalidation remain. Measure performance diagnostically under 9C; no timing-based Epic 6 acceptance/CI gate or new statistical pass rule. Existing earlier-story gates, raw failures and exceptions remain unchanged.
11. Used Workflow Status rename and replacement/deletion update all affected Cards in their effective scope atomically with current base versions, history and audit. Resolve definition ownership before matching stored status names; refuse ambiguous same-name scope collisions without writes. Used Persona/Annotation deletion confirms unlinking; copied templates remain independent.
12. Until Story 8.1 creates the release migration baseline, add required Card indexes consistently through the existing runtime bootstrap/opening and Drizzle schema path. Verify populated fixtures, reopening and current-schema Restore integrity; do not add a second migration mechanism.
13. Delivery count, estimate and status metrics use visible Stories only and list all unestimated Stories; 0 is estimated. Default Release list, Planning and Tracking show open Releases with explicit show-all and preserve Unscheduled/assignments/history. Discovery retains Release lanes, status, estimate and priority. Export remains on existing View/Activity surfaces with no new route or rail entry.

## Interfaces between stories

| Producer | Consumer | Contract |
| --- | --- | --- |
| 6.1 | All views, 6.7 | Route identity, accessible page heading, workspace target; preserve search state and modal focus. |
| 6.2 | 6.3–6.6 | Stable tile opener `data-card-id`, existing `data-live-card-id`, shared role/category/priority definitions and map unit. |
| 6.3 | 6.4–6.7 | One Discovery active Card, visible traversal order, operation focus recovery, generalized Move dialog and atomic selected-set Delete/confirmation; no authority delegated to client rules. |
| 6.4 | 6.5/6.6/6.9 | Separate matching/visible/selected ID sets, retained hidden selection, complete mutation targets and announcements. |
| 6.5 | 6.6/6.9 | Canonical delivery eligibility; persisted UI collapse per map; unchanged key allocator. |
| 6.6 | 6.9/6.10 | View projections reuse reports, existing Graph/table and Slices survive, shared summary slot in Tracking. |
| 6.8 | 6.2/6.4/6.6 | Refreshed scoped customization options; stale draft values stay explicit rather than silently reset. |
| 6.9 | Tracking/Planning/6.10 | Same report result for totals, statuses and unestimated list; released filtering affects display, never assignments/history. |
| 6.10 | All completed features | Diagnostic timings and required indexes; existing full snapshot/live behavior stays, accessibility checks remain binding. |

## Open questions

None. The maintainer explicitly selected 1A, 2C, 3A, 4A, 5A, 6B, 7C, 8A and 9C on 2026-10-17. The earlier proposals are superseded by the accepted contract below. Local implementation details are refined in dev step 02; they do not reopen these product decisions.

## Accepted decisions

| Question | Selection | Binding outcome | Stories |
| --- | --- | --- | --- |
| Q1 | 1A | Opening the composer and submitting are two control actions; text entry inside it counts separately, for all four roles. | 6.2 |
| Q2 | 2C | Retain Discovery Release lanes, status, estimate and priority with hierarchy/Personas/roles; Notes remain visible at legal root/Activity/Step locations. | 6.2/6.3/6.5/6.6 |
| Q3 | 3A | Retain hidden selected Cards; separate Archive/Delete; confirm complete Delete scope and existing child-strategy choice; normalize overlapping subtrees once; atomic local command with all conflicts. Push uses the existing selected-set Dry Run/confirmation outside local transaction atomicity. | 6.3/6.4 |
| Q4 | 4A | Rename used status values and replace/delete used statuses atomically within effective scope; require distinct valid replacement and refuse ambiguous same-name ownership. Confirm Persona/Annotation unlinking; never rewrite copied template descriptions. | 6.8 |
| Q5 | 5A | Count/sum/status distribution over visible Stories only; list unestimated Stories and count 0 as estimated. Open Release list/Planning/Tracking by default with show-all; preserve Unscheduled, assignments/history and Discovery lanes. | 6.5/6.6/6.9 |
| Q6 | 6B | Existing View/Activity Export actions remain; no dedicated Export URL or rail entry; export center stays Later. | 6.1 |
| Q7 | 7C | Defer ETags, aggregate cache revision and client 304 support beyond Epic 6; retain full snapshot/live reads. | 6.10 |
| Q8 | 8A | Retain current pre-release schema mechanism; synchronize runtime and declarations, verify populated/reopen/current-schema Restore; baseline migration remains Story 8.1. | 6.10 |
| Q9 | 9C | Record reproducible raw timings only; reference 150/30/100/300 ms is diagnostic, with no Epic 6 timing gate, CI tolerance gate or invented repeated-run pass rule. Earlier-story gates/evidence and functional/accessibility checks stay intact. | 6.4/6.10 |

Accepted architecture record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md). PRD FR-8/10/14/16/17/23/50 and NFR-1, Epic 6 stories, architecture AD-7/9/18/24 and EXPERIENCE now express these choices. Canonical story title “Performance and accessibility budgets” remains for stable keys; its active scope is diagnostic performance and binding accessibility.

## Verification strategy

- Prior preparation v1 evidence on Node 24.17.0 (not rerun during this documentation reconciliation): four focused web suites passed, 41 tests: `Dialog.test.ts`, `card-detail.test.ts`, `ReleaseDateFields.test.ts`, `ReleaseKanban.test.tsx`. Existing jsdom `HTMLFormElement.requestSubmit` diagnostic appeared; no test failed. This proves the named regressions only, not browser accessibility or Epic 6 acceptance.
- Use graph search/query for scope, then source. MCP graph tools were not exposed in this session; installed `code-review-graph` CLI search found board-state relationships. Qualified tests_for returned zero with an explicit stale-graph warning; actual source has 26 Card-detail and 12 Dialog tests. Empty graph coverage is not absence of tests. No graph rebuild was needed for this planning assessment.
- Dev gates: focused contract/core/DB/application/HTTP/MCP tests for changed commands and projection rules; DOM/router tests for actual controls, selection, focus, modal history and live holds. Use temporary databases and public routes, never user Projects or live GitHub writes for routine acceptance.
- 6.10 adds a dedicated axe/Testing Library invocation that fails on zero tests, including all five core Views, Slices, Graph/table, open Card and dirty-close layer, Move and confirmation. Follow the accepted jsdom-plus-manual decision; do not replace it with a mandatory new browser-runner dependency. Record browser/screen-reader manual checks separately.
- Diagnostic performance evidence includes all raw samples, fixture, runtime/build/environment, measured boundary and cold/warm context, without a pass/fail claim or forced repetition/statistical rule. Record nominal references 150/30/100/300 ms. AD-18 retains earlier 200-operation Apply <= 2 s and Restore point <= 1 s gates and their original CI treatment; do not retroactively reinterpret existing evidence.
- Run appropriate workspace typecheck/build and release verification during implementation; no new full release verification, browser pass or performance measurement is claimed by this preparation.
- Reconciliation v2 verification: independent architecture invariant, current-code reality and PRD/structure checks completed; dependent prose check found none. Fixed the 6.3/6.4 Delete sequencing gap by assigning the shared primitive/confirmation to 6.3, removed an unintended released-only selector from 6.9 wording, and labelled the 41-test run as prior evidence. Architecture mechanical lint reports zero findings; document links/metadata/story slugs and unchanged non-Epic-6 acceptance/ledgers are checked. No runtime tests were rerun for these documentation-only changes.

## Non-goals (epic)

ETags/aggregate cache revisions/304 support and binding Epic 6 timing gates are deferred; their later introduction requires a separately scoped decision. No product code changes during preparation; no runnable spec files, loop run/resume, commits, pushes or orchestrator-ledger changes. Do not absorb all Epic 5 retrospective follow-ups: Graph viewport/filter relationship defects and What changed focus/history-scaling items remain proposed follow-ups unless they directly prevent a named Epic 6 acceptance condition. Preserve their evidence and ownership; do not duplicate or falsely close them. Timeline/Roadmaps stay Experimental, no Later export-center or per-View settings, no new sync model, migration framework, telemetry or external services.

## Changelog

- 2026-10-17 v1: Prepared ten source-anchored story plans, reconciled baseline drift and cross-story ownership, recorded nine launch decisions and verified 41 existing focused tests. Epic stayed draft until decisions were closed.
- 2026-10-17 v2: Applied all nine accepted selections; reconciled PRD/Epics/architecture/UX/ADR 0007, removed proposed Export/ETag work and timing gates, resolved all planning questions and marked preparation/plans ready. No development or loop launch.
