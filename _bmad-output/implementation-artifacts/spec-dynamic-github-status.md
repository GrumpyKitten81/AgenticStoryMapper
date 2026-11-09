---
title: Dynamic GitHub status and status filtering
type: feature
created: 2026-11-03
status: done
route: dispatch
baseline_commit: 00847d43d360704ce0eeaa7038c795ca550cac1e
review_loop_iteration: 0
context: []
---

Reproducing statement: Implement the user-approved plan for GitHub-owned dynamic Card statuses, source selection per connection, and consistent multi-status filtering in every Card view.

Version: 1. Date: 2026-11-03.

<frozen-after-approval reason="User explicitly requested implementation of the complete approved plan">

## Intent

Linked Cards reflect GitHub status without a fixed application status list. Each connection selects Repository (Open/Closed) or one GitHub Project and its Status field. GitHub leads; local status edits are refused. Read and adopt changes at linking/import/sync through the existing ChangeSet preview/apply flow, without polling.

## Boundaries & Constraints

Always retain stable connection/project/field/option identity independently of the readable `Card.status`. Read the complete catalog (name, order, available color), paginate Project discovery/membership, retain removed options for historical assignments, and update only Cards belonging to the changed source. Keep Issue Open/Closed separate from Project status. A missing value is “No status”; missing membership is explicitly identified. Permission/incomplete-response failures preserve existing data and never switch source implicitly.

Reject local status changes through UI, bulk, HTTP, MCP and ChangeSets. Outgoing edits preserve fresh remote state and status labels. Detach retains the last readable status and unlocks it. Existing connections start in Repository mode; adopt Card statuses only on the next applied sync. Preserve archive/restore/redaction policy and protection/audit/epoch safeguards. Local archiving is independent of external names and sync never unarchives a Card.

Build filter options from catalogs and actual Card data, removing injected fixed options. Provide multi-selection with include/exclude, OR within selection and AND across filters, plus hide completed/closed. Match identities rather than conflating identical labels. Recognize normalized exact Done, Closed, Completed, Resolved, Finished, Shipped, Released, Erledigt, Abgeschlossen as done; existing local groups remain meaningful. Unknown names are introduced automatically, remain visible and are internally active. Closed Issues are hidden regardless of Project status. All views including Graph and optional Roadmaps/Releases share the predicate. Retain ancestors as dim context, excluding them from match counts. Start unrestricted; retain filters only in the current usage session; reset clears everything. Reuse central styles, accessible labels and controls.

## I/O & Edge-Case Matrix

| Scenario | Expected behavior |
| --- | --- |
| Added/renamed/deleted options; same names across sources | Stable identities; atomic catalog/Card updates; retired options retained |
| Multiple/paginated Projects; null status or absent membership | Selected source only; explicit null/missing states |
| Closed Issue with In Review; reopened Issue | Separate evidence; completion filter follows latest applied state |
| Access error, incomplete response, stale preview | Visible refusal; no partial domain mutation |
| Import, existing-Card link, sync; repeated identical sync | Same resolver and ChangeSet flow; no unnecessary Card updates |
| Local status edits; outgoing other-field edits; detach | Refuse status writes; preserve remote status/labels; detach unlocks |
| Filters with open descendants and archived Cards | Context retained; correct counts; external Archived never archives |
| Existing DB, export/import, Restore | Migration preserves data; snapshots work; intentional GitHub redaction remains |

</frozen-after-approval>

## Code Map

- `packages/contracts/src/schemas/domain.ts`, `change-operations.ts`, `remaining-operations.ts`: canonical Card/connection/link/workflow schemas and typed operations. Derived API/MCP schemas must remain coherent.
- `packages/db/src/schema/tables.ts`, `repositories/row-mappers.ts`, `work-item-repository.ts`, `operation-persistence-repository.ts`, `versioned-json.ts`, `packages/db/migrations/`: persistence; pair JSON columns with schema versions. Snapshots reuse mappers. Sync tables are intentionally redacted from portable archives.
- `packages/core/src/changesets/`: pure operation resolution and guards. `packages/db/src/repositories/cards-repository.ts` also has direct human writes requiring guards. `core/story-map/visibility.ts` currently derives archive from literal status; introduce explicit lifecycle state.
- `packages/github/src/providers/github-provider.ts`, `work-item-provider.ts`: gh/Octokit transports; current first-five Project memberships only support iteration, not authoritative status.
- `apps/server/src/application/sync/github-{import,pull,ticket,command}.ts`, `services/{sync-merge,remote-push-plan}.ts`: atomic incoming operations, baselines, reviewed remote effects. Ticket evidence hashes need status evidence. `application/github-link/github-link.use-cases.ts` currently stores URL-only refs; add connection-aware binding without silently making reference-only links sync owners.
- `apps/web/src/features/story-map/useStoryMapBoardState.ts`, `components/{BoardToolbar,CardDetailModal}.tsx`: shared board filtering and fixed dropdowns. Graph model/view and Roadmaps route bypass board filters. GitHub connection draft/fields and app API expose source selection. Reuse `styles/{tokens,controls,workspace-panels}.css`.

## Tasks & Acceptance

- [x] Contracts/DB/core: source-qualified catalogs/link evidence, explicit archive lifecycle, migrations, pure status resolution, guarded writes and archive handling.
- [x] GitHub/server: discovery/catalog/item reads, connection-aware existing-Card binding, incoming catalog/status operations, baseline/evidence integration and outgoing status preservation.
- [x] Web: source setup, dynamic status display/options, locks, shared identity-aware filters and context in every Card view.
- [x] Tests: execute coverage of every matrix row, relevant package tests, typechecks/build and desktop/narrow browser verification.

Given a newly added arbitrary GitHub status, when a user applies sync, then its catalog entry and affected Cards update together without configuration. Given a proposal, when it is rejected or becomes stale, then no proposed Card/catalog changes apply. Given an excluded parent with an included child, when any Card view renders, then the child remains accessible and its parent is context only.

## Implementation Notes

Implemented source-qualified catalogs/evidence, explicit archive lifecycle, operation schema version 12 and additive migration 0002. Incoming GitHub changes are trusted only through prepared ChangeSets, with reviewed connection/Card versions. Catalog rename evidence is shared once per batch and inconsistent catalogs fail visibly. Repository state and Project status remain independent.

Filters use stable status identities, exact completion inference and explicit local groups; all Card views retain dim ancestor context without counting it. Tracking/Release/Roadmap summaries consume the matching set and completion evidence. Auth/owner/repository edits retain the explicitly chosen Project source while invalidating stale discovery alternatives.

Implementation is sequential. A dispatched implementer may explore but must not delegate concurrent writes. Apply the whole approved plan; no commit or push is authorized. Prefer minimal explicit fields/helpers and no new dependencies. The user already approved implementation; no additional spec-approval checkpoint is needed.

## Spec Change Log

- 2026-11-03 v1 implementation complete: retained the approved intent; fixed all verified review findings, added consumer regressions, and recorded baseline verification limits. No commit or push was requested.

- 2026-11-03 v1: Recorded approved plan and source-verified integration points.

## Review Triage Log

| Finding | Verdict / route | Verified evidence |
| --- | --- | --- |
| B1 Legacy status conflict double closure | high / patch | Incoming remote-link resolution closes open status conflicts before the explicit resolve operation requires open status. Correct that command path while retaining before/baseline checks. |
| B2 Stale discovered Projects | medium / patch | Pending responses are scoped, but stored results are not; changing owner/repository/auth/local Project retains selectable prior results. |
| B3 Status selector memo | medium / patch | CardDetailModal reads snapshot.cards while memo dependencies include workflowStatuses only. Live catalog adoption can leave the selector stale. |
| B4 Binding pending-write registration | medium / patch | New binding/detach/review mutations omit the card-owned-write key used by the enclosing dialog's pending/navigation guards. |
| B5 Per-Card projection queries | medium / patch | getPlanStateProjection reads links and workflow definitions inside cards.filter; reuse one read of each collection. |
| B6 Quadratic proposal evidence | high / patch | Every incoming link operation includes all connection-owned full Card rows, even when unaffected. Restrict evidence to actual status/catalog rename changes while preserving cross-map stale guards. |
| B7 Unbounded Project reads | medium / patch | GitHubProvider.listRemoteItems uses Promise.all over all Issues, newly creating unbounded per-Issue membership requests. Use bounded/sequential reads. |
| B8 Explicit local groups overridden | medium / patch | isCardCompleted applies the completion-name heuristic even when a local definition explicitly assigns active/open. Preserve explicit definitions; infer unknown names only. |
| B9 Renamed Status field undiscoverable | medium / patch | Discovery filters the exact field name Status; selected catalog reads already use field IDs. Offer explicit single-select field choices through the existing discovery response shape. GitHub supports field rename through UpdateProjectV2FieldInput.name. |
| B10 Active icon for closed Issue in In Review column | false / reject | The column represents the independent Project workflow status, so its active icon is correct. Issue closure intentionally affects completion independently and must not relabel the Project column as Done. |
| B11 Same-name summary aggregation | false / reject | statusCounts is an existing by-readable-name aggregate, not a status identity list. It does not drive identity matching, catalog updates, columns or completion. Stable identities remain on links and in filter/column keys; aggregation does not merge or mutate those identities. |
| E1 Tracking summary ignores filter | medium / patch | Columns use scoped filtered Cards, but deliveryCards selects canonicalCards without matchingCardIds. Filter summary input as well. |
| E2 Roadmap report ignores filter | medium / patch | RoadmapPanel takes details.data.reports unchanged and never consumes statusContext when calculating visible progress/estimates. Recompute from matching Card input. |
| E3 Releases filter has no effect | medium / patch | ReleasesRoute passes displayed.cards directly despite its shared toolbar; pass matching Cards into card-based release summary rendering. |
| E4 Stale discovered Projects | medium / patch | Independently verified same stored-result scope defect as B2; retain this separate finding before grouping fixes. |
| E5 Discovery request after context invalidation | high / patch | Credential resolution is awaited without a subsequent safety/database check before provider.listStatusProjects. Revalidate immediately before network access. |
| G1 Completion at report boundaries unverified | medium / patch | Preverified gap: release timeline and release-notes HTTP/MCP fixtures omit closed Issue evidence with active Project status. Test the actual consumers, including completed counts/progress and note inclusion. |
| G2 Actual Card-binding workflow unverified | medium / patch | Preverified gap: existing service/ownership tests do not operate Card-detail preview and apply. Add a dialog interaction through refreshed linked state. |
| G3 Connection discovery workflow unverified | medium / patch | Preverified gap: connection tests only save Repository defaults. Add actual discovery, selection and saved/reopened Project/field identity assertions. |
| R1 Historical source catalogs offered as current | medium / patch | Parent verified getStoryMapSnapshot exposes all source catalogs without distinguishing the connection selection; the filter offers every unretired option. Project historical options as retired so only still-assigned historical identities remain offered. |
| R2 Reserved archived status during Restore | medium / patch | Parent verified unarchive operation schema still rejects the literal archived name although lifecycle is now independent; local Restore choices also exclude it. Remove the name reservation, retain ownership checks, and use dynamic local options. |
| R3 Repeated BMAD fixture archive proposal | medium / patch | Native round-trip scenarios reached the repeat assertion, exposing composer.ts:37 still comparing status to archived. Use explicit archive lifecycle without weakening repeated-publication no-op assertions. |
| R4 Local Tracking choices omit existing names | medium / patch | Tracking used definitions plus only the current Card name. Share dynamic local names from definitions and canonical Card data, retaining ownership locks. The two-name consumer regression passes. |
| R5 Discovery fix changed explicit authority | medium / patch | Scope invalidation initially reset the selected Project to Repository. Remove that reset: discard stale alternatives/responses while preserving chosen Project/field IDs. Six scope/preservation cases and the live auth-mode change pass. |

GitHub field rename reference: [UpdateProjectV2FieldInput](https://docs.github.com/en/graphql/reference/projects#updateprojectv2fieldinput).

All surviving findings use existing surfaces and demonstrated state, and require direct corrections or focused regression coverage; grouped patch work was returned to the original implementer. B2/E4 share one root cause; optional-view summary input fixes remain distinct consumers. No spec intent change or external action is needed.

## Verification

- Node 24.21.0, Corepack pnpm 9.15.4. Full native workspace typecheck and build passed; final web typecheck/build passed again after the source-preservation correction. Capability manifest (139), dependency boundaries, source hygiene and tracked/untracked whitespace checks passed.
- Final full source suites: Contracts 193/193, Core 455/455 and GitHub 74/74 passed. The complete DB run exercised 567 cases: 566 initially passed and the unchanged-deadline 200-operation stress case passed alone; latest affected DB cases passed 9/9.
- Ordinary server suite exercised 1,029 cases. All feature regressions and obsolete expectations were corrected and covered by focused reruns, including final server 107/107, board-proposal transport 22/22, complete MCP surface 30/30 and native BMAD refresh HTTP/SDK 2/2. Three load-sensitive production/membership cases passed separately with unchanged deadlines.
- Full bounded web run: 979 passed / 4 failed across 98 files. The new stylesheet assertion was corrected and passed in focused coverage. Final focused consumer/Kanban, Card-detail/layout and source-discovery/preservation tests passed, including 6/6 preservation cases. These reruns overlap earlier suites; no combined unique total is claimed.
- Three remaining web failures were reproduced on original HEAD in an isolated baseline: the nine existing centralized-copy violations, the Discovery empty-prompt selector, and the board-diagnostics file-URL error. The release verifier stops on the existing 58-line function at changesets/review.test.tsx:66; no new size violations remain.
- Audit performance: one-row-per-call and domain effects were verified. Absolute bounds remain unchanged. Original HEAD also fails 2/3 preview samples (1.78 / 4.15 / 1.28 seconds against 1.5 seconds) and all three ApplyChangeSet samples against 4 seconds. The quiet final candidate Apply sample is 4.056 seconds versus baseline 4.059 seconds; delivery passes at 5.69 seconds against 6 seconds, and all five audited 100-read bursts pass at 2.45–2.74 seconds against 3 seconds with exactly 100 inserts. No blanket green performance claim is made.
- Live isolated browser verification at desktop and 390px: source-qualified include/exclude filters, closed-Issue hiding with active In Review Project status, reset/navigation, all Card views/context, optional populated Roadmap/Release/Tracking summaries, locked Card dialog, archive/restore, and connection source setup. No uncontained form overflow; Planning retains its bounded horizontal swimlane scroll. Narrow search width 319px. Auth-mode switching preserves the exact Project/field selection without saving. Viewport reset; only disposable temporary data changed and no live GitHub requests were made.
- Screenshots: /tmp/storymapper-status-desktop.jpg and /tmp/storymapper-status-narrow.jpg. Raw test evidence is in /tmp/storymapper-status-*.log and /tmp/dynamic-status-final-*.log; the focused preservation log is /tmp/dynamic-status-explicit-source-preservation-final.log.

All verified feature findings are fixed. B10/B11 were rejected with source-based explanations; no feature work was deferred. Baseline test/performance/size limits above remain visible and unchanged.
