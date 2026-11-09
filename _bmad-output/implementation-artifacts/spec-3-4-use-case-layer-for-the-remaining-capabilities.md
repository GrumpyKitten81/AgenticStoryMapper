---
title: Complete the shared application layer and consolidate the local mainline
type: refactor
created: 2026-10-07
status: done
baseline_commit: 89fda62ffdbe1c2e2320a0525cf11c064612d6e4
route: dispatch
review_loop_iteration: 0
context: [AGENTS.md]
---

Reproducing statement: Implement the user-approved Story 3.4 completion plan, repair verified prerequisite and sync defects, verify all workspace gates, and consolidate local branches without changing origin. Date: 2026-10-07. Version: 2.

<frozen-after-approval reason="user approved the complete plan and requested implementation">

## Intent

**Problem:** Story 3.4 stalled twice. Story 3.3 still has direct repository adapters, missing actors and incomplete capability coverage. Nine Windows restore tests fail despite scoped server acceptance.

**Approach:** Complete one shared actor-aware application layer in independently verified packages; move report/export computations out of persistence, repair concrete sync defects, and fast-forward the verified result onto local main.

## Boundaries & Constraints

**Always:** Contracts own public I/O. Only db accesses SQL; core remains pure. Writes use synchronous actor-aware UoW; network effects stay outside transactions. Every capability has a descriptor and required ActorContext, including reads. Human-only use cases reject agent actors. Preserve existing success wrappers, archive/recovery behavior, attribution and checklist effects. Changed files stay below 750 lines/100 KB and functions below 50 lines. Keep the existing 24 tools.

**Never:** Merge failed preserve snapshots; restart the whole loop; touch user projects/SQLite/input/credentials; add dependencies, configuration, fallbacks or compatibility layers; push or change origin; rewrite history; indiscriminately delete recovery refs/stash. Stories 3.5–3.12 and the Epic 4 executor/operation registry remain outside scope.

## I/O & Edge-Case Matrix

| Scenario | State | Required outcome |
|---|---|---|
| Adapter parity | Equivalent HTTP/MCP inputs | Same underlying result and actor attribution after transport normalization |
| Errors | Invalid/empty patch; missing/conflicting/protected data; unknown failure | Shared code/message/details mapping; unknown failure has generic text and correlated errorId |
| Sync | Missing milestone; independent remote edits; stale awaited inputs | Persist null; merge non-overlapping fields; never overwrite newer local state |
| Batch failure | Provider failure after earlier success | Return typed per-item outcomes, retain actual remote successes, failed SyncRun, no automatic retry |
| Remote orphan | Card disappears during issue creation | Failed item and Activity with remote ID/URL; no recreation or remote deletion |
| Repeated sync | Unchanged remote payload | No extra Card version or card-update Activity |
| Formatting | Push, sync and health compare same card | One idempotent existing metadata/reference format |
| Proposals | Parked/archived ancestors | Exclude invisible cards consistently |

</frozen-after-approval>

## Code Map

- `apps/server/src/application/` — existing aggregate/deps/error pattern; reads lack actors, release summary uses wrong ID, proposals are incorrectly read-kind.
- `apps/server/src/http/routes/` — 55 index handlers plus extracted modules; Card child operations and restore still access persistence directly.
- `apps/server/src/mcp/tools/register-tools.ts` — preserve names/permissions/wrappers; six tools lack descriptors; sync loses initiating actor.
- `packages/db/src/restore-*.ts`, `sqlite-path.ts` — reuse extended path normalization and Windows writable fsync; tests still bypass helper and assume POSIX rename errors.
- `packages/db/src/repositories/` — reports/export formatting and sync plan/health persistence; preserve audit/atomicity, remove duplicate computations.
- `packages/core/src/` — reuse visibility/coverage functions; inject all time/context inputs.
- `scripts/*capabilit*.mjs` — replace executable regex parsing and mutation during check with deterministic static TypeScript scan.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/restore*` — repair native Windows tests and close all handles; verify full db suite before closing DW-34/35/36.
- [x] `apps/server/src/application` and aggregate adapters — fix actors, human guards, Card children, proposal kinds and Release summary.
- [x] Remaining adapters/application — extract Project/Getting Started/Product Context; Customization/Activity/Privacy; Roadmaps; Reports/Exports/Archive/Restore; Connector/GitHub/Sync; AI proposals, in that order.
- [x] `packages/core/src`, db repositories — move complete reports and formatters, inject time, preserve export Activity/checklist effects and shared callers.
- [x] Sync/contracts/proposal selectors — repair DW-15–20/22/26, typed per-item results, revalidate database/version/link/connection after awaits.
- [x] Capability scripts/tests — statically scan exported use cases/descriptors and compare stored manifest without writes; bidirectional route/tool coverage and uniqueness.
- [x] Existing specs/ledger/sprint/OpenWolf — update only after actual verification; commit reports and changes in cohesive Conventional Commits.
- [x] Local Git — clean tree, verify ancestry, fast-forward main, unset stale WIP upstream and delete four integrated local story branches; retain origin and recovery artifacts.

**Acceptance Criteria:**
- Given all registered domain routes (including restore), when parity runs, then each maps to exactly one descriptor and every capability export and existing tool is covered. Only health, credential status and three MCP meta/dispatch routes are infrastructure exceptions; generated HEAD/OPTIONS are normalized.
- Given reads/writes/reports/exports, when called, then adapters only validate/resolve actor/invoke/map; application composes repositories/core and no SQL or domain calculations move into adapters.
- Given workspace gates, when executed without restore exclusions, then tests, typecheck, manifest check, build, release verify and whitespace pass.
- Given completion, when reviewing bookkeeping and Git, then 3.3/3.4 are done, Epic 3 is in progress, main contains every accepted change and only obsolete local branches are removed.

## Implementation Notes

Baseline: `89fda62ffdbe1c2e2320a0525cf11c064612d6e4`. User approved local commits/fast-forward/cleanup, unified errors, concrete sync repairs, orphan audit and existing Push format. Existing untracked handoff reports are authorized inputs. Existing plan approval satisfies the build checkpoint; no renewed permission gate is needed.

Implementation handoff: finish source changes, focused and full verification first. The parent performs independent review and then commits, bookkeeping reconciliation and local Git consolidation; report these finalization tasks as pending when returning the implementation. Do not reopen scope/approval decisions or launch bmad-loop. The sandbox process launcher currently fails with setup-refresh errors; read/write operations via exec_command can use require_escalated within the approved repository task. apply_patch works normally. No code-review-graph tools are available in this session; verify source directly. Do not run builds and fixture-copying command tests simultaneously.

## Spec Change Log

- 2026-10-07 v1: Derived from the approved plan and verified source/tests; scope and decisions unchanged.
- 2026-10-07 review: All three independent layers completed. Retain actor propagation, complete capability coverage, pure reports, native restore repair and existing success wrappers. Repair verified sync boundary defects directly within the approved intent; the user explicitly requires package repairs and forbids restarting a full loop, so no cumulative revert/re-derivation or renewed scope approval is used. A missing original FK owner or replaced DB produces typed conflict evidence containing known remote outcomes; no synthetic successful persistence is claimed.

## Review Triage Log

| Finding | Verdict | Route | Verified evidence |
| --- | --- | --- | --- |
| B1 | high | bad_spec / repair | Local-status mergedPayload selects local.labels and loses remote non-status labels; independent remote field preservation explicitly includes these labels. |
| B2 | medium | bad_spec / repair | conflictFields JSON-compares status label arrays although label equality elsewhere is set-based; equivalent orderings can conflict. |
| B3 | medium | defer | Baseline 89fda62 already creates an open conflict on each divergent refresh. Duplicate-conflict lifecycle is unchanged and outside the enumerated sync repairs. |
| B4 | high | bad_spec / repair | Remote resolution updates all title/body/status fields even for a description conflict, erasing an independent local title. Preserve unrelated fields per approved merge intent. |
| B5 | medium | bad_spec / repair | Resolution sets synced before considering other open field conflicts or local differences; state becomes misleading. |
| B6 | high | bad_spec / repair | Post-write conflict-resolution revalidate throws without recording or returning the known remote identity; preserve the external outcome while rejecting stale local persistence. |
| B7 | high | bad_spec / repair | finishPush re-queries deleted connection/map and finishSync requires them for createSyncRun; this replaces known item outcomes with a generic failure. Preserve auditable outcomes in a typed conflict when the original FK owner no longer exists; never invent a persisted SyncRun or write to a replacement database. |
| B8 | medium | bad_spec / repair | First item failure breaks the batch loop, omitting later requested items; report explicit failed/not-attempted outcomes for those items. |
| B9 | medium | bad_spec / repair | Import hashes prefixed remote title while Card title strips prefix; canonical normalization is required for import, remote comparison and baseline hashes. |
| B10 | high | bad_spec / repair | finishSync silently skips prepared incoming updates after connection changes while item status remains succeeded; mark unapplied preparations as failed. |
| E1 | high | bad_spec / repair | Duplicate of verified B7 outcome: deleted connector prevents finalization and discards already known remote outcomes. |
| E2 | high | bad_spec / repair | Database identity check sits outside the remote-outcome catch after successful provider writes; rejected persistence loses ID/URL. Original DB identity must remain authoritative for audit. |
| E3 | medium | patch | Formatter splits only LF and matches an exact heading; CRLF formatted descriptions fail heading recognition and duplicate generated reference metadata. |
| E4 | high | bad_spec / repair | finishSyncItem returns when Card/link disappears, retaining succeeded status and applied run; explicit per-item failure is required. |
| E5 | medium | patch | Extracted privacy read lacks Project existence validation; getPrivacySettings missing row throws internal whereas old route returned404. Validate visible Project before repository invariant lookup. |
| V1 | medium | patch | Pre-verified regression gap: conflict-resolution endpoint tests do not alter captured inputs during provider await; add Card-edit rejection test preserving newer state/open conflict. |
| V2 | medium | patch | Pre-verified broken-verification gap: real stdio subprocess rejection asserts only isError/text substring; parse JSON and assert code/message/details. |
| P1 | medium | bad_spec / repair | Parent contract audit: added per-item response property is results, while the approved public interface explicitly names items. Rename the new property rather than add an unrequested alias. |
| P2 | medium | bad_spec / repair | Parent size audit: touched exported AiMcpPanel spans about277 lines. Split state and rendering functions to honor the user function-size gate, which is stricter than the local component allowance. |
| P3 | medium | patch | Parent attribution audit: default HTTP/stdio callers omit mcpSessionId; registry must create one stable genuine session ID while retaining supplied IDs, so every MCP action has Host and Session. |
| P4 | medium | patch | Parent error-boundary audit: archive validation classified errors by message prefix and SqliteError name, exposing low-level SQL messages. Introduce ArchiveValidationError and typed SQLite corruption handling; unknown failures keep the shared internal mapping. |

## Verification

- Focused package tests and typecheck after each package.
- `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm check-capabilities`, `corepack pnpm build`, `node scripts/verify.mjs`, `git diff --check` must pass.
- Final checks run serially where web build output is shared. New files must be staged before Git-index-based command fixtures.

## Completion evidence (2026-10-07)

The approved direct implementation is complete. Three independent review lenses produced B1–B10, E1–E5 and V1–V2; parent audits added P1–P4. All scoped repairs were verified in exact source and regression tests. B3 is the unchanged pre-existing duplicate-conflict lifecycle and remains open as DW-37; no later story is accepted by this closure.

| Gate | Final result on native Windows / Node24.20.0 / pnpm9.15.4 |
| --- | --- |
| Workspace test | 658 passed; two permission-based Script cases skipped on Windows |
| Scripts | 64 passed, two skipped; the other packages have no skips |
| Contracts / Core / Importers | 19 / 28 / 2 passed |
| Web / DB / Server | 95 / 232 / 218 passed |
| Restore / Archive | Every DB Restore test included; server Archive suite39 passed |
| Workspace typecheck | Pass |
| Capability check | Pass; stored manifest compared without writes |
| Build / release verification | Both pass; existing Vite chunk-size advisory remains |
| Source hygiene / whitespace | Pass; unstaged and staged diff checks |
| Size audit | 111 touched JS/TS files; maximum732 lines per file,49 per production function, all below100 KB |

Verification commands: `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm check-capabilities`, `corepack pnpm build`, `node scripts/verify.mjs`, `node scripts/check-hygiene.mjs`, `git diff --check` and `git diff --cached --check`. Runtime parity exercises actual Fastify route registration and the actual MCP registry in both directions, including successful reads/writes after wrapper normalization. The real stdio subprocess test parses rejected JSON error envelopes. New default MCP sessions are genuine IDs generated once per registry.

Review repairs: status labels are canonical sets while independent remote labels survive; conflict resolution changes only the chosen field and preserves other pending/conflicting fields; awaited Card/link/connection/map/release/database changes reject stale persistence. Every requested batch item receives an outcome, including not-attempted items. Remote writes that cannot be persisted retain ID/URL and original-database audit where available. If a deleted foreign-key owner or replaced database makes creating the original SyncRun impossible, return a typed conflict with known outcomes in details.items; do not fabricate a run or write into a replacement database. Ordinary failed batches persist a failed SyncRun. Push, import, sync and pull return items and retain existing total fields. The three nullable existing output fields releaseId/milestone/remoteParentNumber now match actual persisted values; input schemas are unchanged.

The LF/CRLF issue formatter remains idempotent and preserves the existing generated metadata/references. Missing privacy Projects return404; unknown HTTP/MCP errors expose only generic text and a correlated error ID. Archive validation uses explicit domain errors and typed SQLite corruption detection rather than error-name/message-prefix classification. Report/export calculations use core functions with supplied time and keep transaction, audit and checklist effects. Proposal visibility follows archived/parked ancestry in server, MCP and the rendered picker.

## Complete capability inventory

The saved manifest is the machine-readable inventory. All105 exported capabilities/descriptors are listed below:98 domain HTTP routes,24 existing MCP tools,28 read /51 write /26 human-only descriptors. HTTP-only and MCP-only capabilities are retained explicitly. No new tools are added. Only GET /health, GET /api/credentials/status, GET /api/mcp/tools, GET /api/mcp/host-configs and POST /api/mcp/call are infrastructure; automatic HEAD/OPTIONS are normalized separately.

| Use case | Kind | HTTP route | Existing MCP tool | Source |
| --- | --- | --- | --- | --- |
| `applyChangeSet` | write | `POST /api/changesets/:changeSetId/apply` | `ApplyChangeSet` | `apps/server/src/application/changeset/changeset.use-cases.ts` |
| `approveChangeSet` | human-only | `POST /api/changesets/:changeSetId/approve` | — | `apps/server/src/application/changeset/changeset.use-cases.ts` |
| `archiveCard` | write | `POST /api/cards/:cardId/archive` | `DeleteOrArchiveStoryMapCard` | `apps/server/src/application/card/card.use-cases.ts` |
| `bulkUpdateCards` | write | `PATCH /api/cards/bulk` | — | `apps/server/src/application/card/card.use-cases.ts` |
| `createAiProposal` | write | `POST /api/ai/proposals` | — | `apps/server/src/application/ai/ai.use-cases.ts` |
| `createAnnotation` | human-only | `POST /api/annotations` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `createCard` | write | `POST /api/cards` | `CreateStoryMapCard` | `apps/server/src/application/card/card.use-cases.ts` |
| `createCardAttachment` | write | `POST /api/cards/:cardId/attachments` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `createCardSourceLink` | write | `POST /api/cards/:cardId/source-links` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `createConnectorConnection` | human-only | `POST /api/connectors/connections` | — | `apps/server/src/application/connector/connector.use-cases.ts` |
| `createGitHubIssueDryRun` | write | `POST /api/github/issue-dry-run` | — | `apps/server/src/application/github-link/github-link.use-cases.ts` |
| `createGitHubLink` | write | `POST /api/github/links` | — | `apps/server/src/application/github-link/github-link.use-cases.ts` |
| `createPersona` | write | `POST /api/personas` | `CreateStoryMapPersona` | `apps/server/src/application/persona/persona.use-cases.ts` |
| `createProject` | write | `POST /api/projects` | — | `apps/server/src/application/project/project.use-cases.ts` |
| `createRelease` | write | `POST /api/releases` | `CreateStoryMapRelease` | `apps/server/src/application/release/release.use-cases.ts` |
| `createRestorePoint` | human-only | `POST /api/human/projects/:projectId/restore-points` | — | `apps/server/src/application/restore/restore.use-cases.ts` |
| `createRoadmap` | write | `POST /api/roadmaps` | — | `apps/server/src/application/roadmap/roadmap.use-cases.ts` |
| `createRoadmapCard` | write | `POST /api/roadmap-cards` | — | `apps/server/src/application/roadmap/roadmap.use-cases.ts` |
| `createRoadmapColumn` | write | `POST /api/roadmap-columns` | — | `apps/server/src/application/roadmap/roadmap.use-cases.ts` |
| `createRoadmapReference` | write | `POST /api/roadmap-references` | — | `apps/server/src/application/roadmap/roadmap.use-cases.ts` |
| `createRoadmapSwimlane` | write | `POST /api/roadmap-swimlanes` | — | `apps/server/src/application/roadmap/roadmap.use-cases.ts` |
| `createStoryMap` | write | `POST /api/story-maps` | — | `apps/server/src/application/story-map/story-map.use-cases.ts` |
| `createStoryTemplate` | human-only | `POST /api/story-templates` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `createWorkflowStatus` | human-only | `POST /api/workflow-statuses` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `deleteAnnotation` | human-only | `DELETE /api/annotations/:annotationId` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `deleteCard` | write | `POST /api/cards/:cardId/delete` | — | `apps/server/src/application/card/card.use-cases.ts` |
| `deleteCardAnnotation` | write | `DELETE /api/cards/:cardId/annotations/:annotationId` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `deleteCardAttachment` | write | `DELETE /api/cards/:cardId/attachments/:attachmentId` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `deleteCardPersona` | write | `DELETE /api/cards/:cardId/personas/:personaId` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `deleteCardSourceLink` | write | `DELETE /api/cards/:cardId/source-links/:chunkId` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `deleteConnectorConnection` | human-only | `DELETE /api/connectors/connections/:connectionId` | — | `apps/server/src/application/connector/connector.use-cases.ts` |
| `deleteGitHubLink` | write | `DELETE /api/github/links/:linkId` | — | `apps/server/src/application/github-link/github-link.use-cases.ts` |
| `deletePersona` | write | `DELETE /api/personas/:personaId` | — | `apps/server/src/application/persona/persona.use-cases.ts` |
| `deleteRelease` | write | `POST /api/releases/:releaseId/delete` | — | `apps/server/src/application/release/release.use-cases.ts` |
| `deleteStoryMap` | write | `DELETE /api/story-maps/:storyMapId` | — | `apps/server/src/application/story-map/story-map.use-cases.ts` |
| `deleteStoryTemplate` | human-only | `DELETE /api/story-templates/:templateId` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `deleteWorkflowStatus` | human-only | `DELETE /api/workflow-statuses/:statusId` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `dismissGettingStarted` | human-only | `POST /api/projects/:projectId/getting-started/dismiss` | — | `apps/server/src/application/project/project.use-cases.ts` |
| `exportAudit` | write | `GET /api/exports/audit` | — | `apps/server/src/application/export/export.use-cases.ts` |
| `exportProjectArchive` | human-only | `GET /api/projects/export` | — | `apps/server/src/application/export/export.use-cases.ts` |
| `exportStoryMap` | write | `GET /api/exports/story-map` | — | `apps/server/src/application/export/export.use-cases.ts` |
| `getBacklogHealthReport` | read | `GET /api/reports/backlog-health` | — | `apps/server/src/application/report/report.use-cases.ts` |
| `getCardDetails` | read | — | `GetStoryMapCardDetails` | `apps/server/src/application/card/card.use-cases.ts` |
| `getCardHistory` | read | `GET /api/cards/:cardId/history` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `getCustomization` | read | `GET /api/customization` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `getGettingStarted` | human-only | `GET /api/projects/:projectId/getting-started` | — | `apps/server/src/application/project/project.use-cases.ts` |
| `getGitHubSyncHealth` | read | `GET /api/github/sync-health` | — | `apps/server/src/application/github-link/github-link.use-cases.ts` |
| `getPrivacySettings` | read | `GET /api/settings/privacy` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `getProductContext` | read | `GET /api/product-context` | — | `apps/server/src/application/project/project.use-cases.ts` |
| `getProjectArchiveCapabilities` | human-only | `GET /api/human/project-archive-capabilities` | — | `apps/server/src/application/export/export.use-cases.ts` |
| `getReleaseDetails` | read | — | `GetStoryMapReleaseDetails` | `apps/server/src/application/release/release.use-cases.ts` |
| `getReleaseSummaryReport` | read | `GET /api/reports/release-summary` | — | `apps/server/src/application/report/report.use-cases.ts` |
| `getReleaseTimelineReport` | read | `GET /api/reports/release-timeline` | — | `apps/server/src/application/report/report.use-cases.ts` |
| `getRestorePointCapabilities` | human-only | `GET /api/human/restore-point-capabilities` | — | `apps/server/src/application/restore/restore.use-cases.ts` |
| `getRoadmapDetails` | read | `GET /api/roadmaps/:roadmapId` | — | `apps/server/src/application/roadmap/roadmap.use-cases.ts` |
| `getSourceCoverageReport` | read | `GET /api/reports/source-coverage` | — | `apps/server/src/application/report/report.use-cases.ts` |
| `getSourceDocument` | read | `GET /api/source-documents/:documentId` | — | `apps/server/src/application/source-document/source-document.use-cases.ts` |
| `getStoryMapData` | read | — | `GetStoryMapData` | `apps/server/src/application/story-map/story-map.use-cases.ts` |
| `getStoryMapSnapshot` | read | `GET /api/story-maps/:storyMapId` | — | `apps/server/src/application/story-map/story-map.use-cases.ts` |
| `getWorkItemSyncHealth` | read | `GET /api/sync/work-items/health` | — | `apps/server/src/application/sync/sync.use-cases.ts` |
| `importProjectArchive` | human-only | `POST /api/projects/import` | — | `apps/server/src/application/export/export.use-cases.ts` |
| `importSourceDocument` | write | `POST /api/source-documents/import` | — | `apps/server/src/application/source-document/source-document.use-cases.ts` |
| `importWorkItems` | write | `POST /api/sync/work-items/import` | `ImportGitHubIssues` | `apps/server/src/application/sync/sync.use-cases.ts` |
| `listActivity` | read | `GET /api/activity` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `listAiTemplates` | read | `GET /api/ai/templates` | — | `apps/server/src/application/ai/ai.use-cases.ts` |
| `listCardAttachments` | read | `GET /api/cards/:cardId/attachments` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `listCards` | read | — | `GetStoryMapCards` | `apps/server/src/application/card/card.use-cases.ts` |
| `listChangeSets` | read | `GET /api/changesets` | — | `apps/server/src/application/changeset/changeset.use-cases.ts` |
| `listConnectorConnections` | read | `GET /api/connectors/connections` | — | `apps/server/src/application/connector/connector.use-cases.ts` |
| `listGitHubLinks` | read | `GET /api/github/links` | `ListGitHubLinks` | `apps/server/src/application/github-link/github-link.use-cases.ts` |
| `listPersonas` | read | `GET /api/personas` | `GetStoryMapPersonaDetails` | `apps/server/src/application/persona/persona.use-cases.ts` |
| `listProjects` | read | `GET /api/projects` | `ListProjects` | `apps/server/src/application/project/project.use-cases.ts` |
| `listRestorePoints` | human-only | `GET /api/human/projects/:projectId/restore-points` | — | `apps/server/src/application/restore/restore.use-cases.ts` |
| `listRoadmaps` | read | `GET /api/roadmaps` | — | `apps/server/src/application/roadmap/roadmap.use-cases.ts` |
| `listSourceDocuments` | read | `GET /api/source-documents` | — | `apps/server/src/application/source-document/source-document.use-cases.ts` |
| `listStoryMaps` | read | `GET /api/story-maps` | `ListStoryMaps` | `apps/server/src/application/story-map/story-map.use-cases.ts` |
| `moveCard` | write | `POST /api/cards/:cardId/move` | `MoveStoryMapCard` | `apps/server/src/application/card/card.use-cases.ts` |
| `parkCard` | write | `POST /api/cards/:cardId/park` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `planWorkItems` | write | `POST /api/sync/work-items/plan` | — | `apps/server/src/application/sync/sync.use-cases.ts` |
| `proposeBacklogGrooming` | write | — | `ProposeBacklogGrooming` | `apps/server/src/application/changeset/changeset.use-cases.ts` |
| `proposeMapFromSourceDocument` | write | — | `ProposeMapFromSourceDocument` | `apps/server/src/application/changeset/changeset.use-cases.ts` |
| `proposeReleaseSlice` | write | — | `ProposeReleaseSlice` | `apps/server/src/application/changeset/changeset.use-cases.ts` |
| `pullStoryMapWorkItems` | write | `POST /api/sync/work-items/pull-story-map` | `PullStoryMapGitHubLinks` | `apps/server/src/application/sync/sync.use-cases.ts` |
| `pushWorkItems` | write | `POST /api/sync/work-items/push` | `PushCardsToGitHub` | `apps/server/src/application/sync/sync.use-cases.ts` |
| `recordVisualExport` | human-only | `POST /api/projects/:projectId/getting-started/export-success` | — | `apps/server/src/application/project/project.use-cases.ts` |
| `rejectChangeSet` | human-only | `POST /api/changesets/:changeSetId/reject` | — | `apps/server/src/application/changeset/changeset.use-cases.ts` |
| `resolveSyncConflict` | write | `POST /api/sync/conflicts/:conflictId/resolve` | — | `apps/server/src/application/sync/sync-conflict.use-cases.ts` |
| `restoreProject` | human-only | `POST /api/human/projects/:projectId/restore` | — | `apps/server/src/application/restore/restore.use-cases.ts` |
| `setCardAnnotation` | write | `POST /api/cards/:cardId/annotations/:annotationId` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `setCardPersona` | write | `POST /api/cards/:cardId/personas/:personaId` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `syncWorkItems` | write | `POST /api/sync/work-items/sync` | `SyncGitHubLinks` | `apps/server/src/application/sync/sync.use-cases.ts` |
| `unparkCard` | write | `POST /api/cards/:cardId/unpark` | — | `apps/server/src/application/card/card-children.use-cases.ts` |
| `updateAnnotation` | human-only | `PATCH /api/annotations/:annotationId` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `updateCard` | write | `PATCH /api/cards/:cardId` | `UpdateStoryMapCard` | `apps/server/src/application/card/card.use-cases.ts` |
| `updateConnectorConnection` | human-only | `PATCH /api/connectors/connections/:connectionId` | — | `apps/server/src/application/connector/connector.use-cases.ts` |
| `updateGitHubLink` | write | `PATCH /api/github/links/:linkId` | — | `apps/server/src/application/github-link/github-link.use-cases.ts` |
| `updatePersona` | write | `PATCH /api/personas/:personaId` | `UpdateStoryMapPersona` | `apps/server/src/application/persona/persona.use-cases.ts` |
| `updatePrivacySettings` | human-only | `PATCH /api/settings/privacy` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `updateRelease` | write | `PATCH /api/releases/:releaseId` | `UpdateStoryMapRelease` | `apps/server/src/application/release/release.use-cases.ts` |
| `updateRoadmap` | write | `PATCH /api/roadmaps/:roadmapId` | — | `apps/server/src/application/roadmap/roadmap.use-cases.ts` |
| `updateStoryMap` | write | `PATCH /api/story-maps/:storyMapId` | — | `apps/server/src/application/story-map/story-map.use-cases.ts` |
| `updateStoryTemplate` | human-only | `PATCH /api/story-templates/:templateId` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `updateWorkflowStatus` | human-only | `PATCH /api/workflow-statuses/:statusId` | — | `apps/server/src/application/customization/customization.use-cases.ts` |
| `upsertProductContext` | write | `PATCH /api/product-context` | — | `apps/server/src/application/project/project.use-cases.ts` |
| `validateConnectorConnection` | human-only | `POST /api/connectors/connections/validate` | — | `apps/server/src/application/connector/connector.use-cases.ts` |

## Remaining target architecture

Epic 3 stays in progress. Stories3.5–3.12 remain outside this completion, including the production MCP transport/stdio bridge, new tools in3.7 and later streaming/process work. Full operation-registry parity and the ChangeSet/Operation executor remain Epic 4 work (4.4–4.5). Windows tests here do not establish native Linux/macOS, real power-loss or every-browser acceptance. Existing unrelated deferred items remain open.

## Changelog

- 2026-10-07 v2: Verified reviewed implementation, recorded full native Windows gates, reconciled Story 3.3/3.4 evidence and retained one pre-existing review finding as DW-37. Local integration completed by fast-forward with renewed branch ancestry checks.

Verified source commit before evidence/local integration: `6f50e570de90f390c57fb8d87f5debd59eeab9b8`. No source changed after the recorded full workspace and release gates; the release build was also repeated by verify.

## Local integration result (2026-10-07)

Clean feature tree and main ancestry were verified, then local main fast-forwarded from11436cc99e0ec47a1743ca86445d89d0f477b4a1 to9edb967a4eda067e19beedf38679da707766125d. The following local branches were checked again as ancestors of main and removed with branch -d: wip/3-1-contracts-zod4 (stale upstream first unset), feature/3-2-own-browser, feature/3-3-use-case-layer and feature/3-4-remaining-use-cases. Main is checked out. This final handoff commit only records completed operations.

All remote refs (origin/main and origin/wip included), seven attempt-preserve-dirty refs and refs/stash match the snapshot taken before integration. No push, history rewrite, preserve-diff merge or user-data cleanup occurred. The two original handoff reports were committed with diagnostic text retained and trailing whitespace normalized.
