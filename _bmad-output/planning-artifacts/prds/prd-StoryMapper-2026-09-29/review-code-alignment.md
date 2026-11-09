---
title: PRD to code alignment review
created: 2026-09-29
updated: 2026-11-08
status: historical
reviewed: prd.md, addendum.md against commit 25e786d
---

# PRD to code alignment review

Date: 2026-11-08. Version: 2.

Reproducing statement: Preserve the original PRD/code-alignment findings and resolution log as a dated historical review, without presenting its status table or next steps as current release work.

**Historical review.** The findings describe the 2026-09-29 code and PRD revisions identified below. Status labels, test claims and recommended next steps belong to that review and its resolution log; they are not a new verification of the current repository. Use the current [PRD](prd.md) for requirements, the [architecture spine](../../architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md) for technical decisions, and the [release checklist](../../../../docs/public-release-readiness.md) for release work. Current usage is documented in the [README](../../../../README.md) and [Runbook](../../../../docs/RUNBOOK.md).

## Resolution log (2026-09-29, after this review)

Done in code and documentation: retired wiki connector removed (package, routes, tables, UI, core renderer, environment variable, documentation, ticket templates), retired work-item connector removed (provider, test, settings, UI, environment variable, documentation), the unused in-memory store removed, `docs/mcp-tools.md` aligned with the registry, a `PublishProvider` extension interface added. Typecheck and all tests pass.

Done in the PRD: sections 2 to 6 and 8 revised, FR-46 to FR-56 added (archive, history, attachments, parking, card fields, agent ChangeSets, external references, visual preview, provider extension points, BMad round trip, agent status updates), FR-27, FR-30, FR-32 and FR-43 corrected, NFR-7 and NFR-8 tightened, scope 6.2 rewritten.

Open at the time of this review (tracked by the FR status table below, not by this log): everything marked Missing or Partial, including cross-platform install, English UI, schema migrations, CI, legal files, the file-size split and test depth.

Note (2026-09-29): the architecture spine and PRD revision after this review superseded parts of the FR list (FR-32, FR-34 and FR-36 were rewritten, FR-57 to FR-59 added); the status table still describes the code at commit 5e4a647.

## Verdict

The PRD describes the product's intent and the release bar well, but its picture of the code is partly wrong in both directions. The code is further along than the PRD assumes in six areas (project archive, read-only retired work-item connector import, MCP permission gating, card history and attachments, Activity parking, per-connector privacy switches) and further behind in the release-facing areas the PRD newly demands (cross-platform install, English UI, credentials in the UI, migrations, CI, legal files). Of 45 FRs: 14 met, 18 partial, 12 missing, 1 unverified (table 3); several met and partial rows also carry unverified sub-conditions. The PRD should be corrected before epics are written, because two of its scope decisions (`.lsm.zip` out, MCP toolsets missing) contradict working code.

## 1. Method and limits

Read: `apps/server` routes (about 100 HTTP routes), MCP registry and permissions, `packages/db` schema and connection, `packages/*` module layout, web feature and route layout, scripts, `.env.example`. Grep-level checks for specific capabilities. Not done: running the app, reading every component, measuring performance (NFR-1), per-view content checks (FR-14), keyboard coverage, dry-run enforcement in the UI. "Unverified" means exactly that, not "missing".

## 2. Where the PRD misstates the code

| PRD statement | Code |
| --- | --- |
| Addendum A: "No MCP toolset switches or proposal-only mode" (my error) | Permissions exist: `packages/mcp/.../permissions.ts`; the server derives them per Project from privacy settings (`register-tools.ts`, `permissionsForProject`): read and proposal always on, write = `mcpWrites`, github = GitHub toggle, admin fixed off. Writes are off by default, which is proposal-only mode in effect. |
| 6.2: `.lsm.zip` project package out of v1.0 | Implemented: `apps/server/src/services/project-archive.ts` (JSZip, redacted snapshot, manifest v1, `/api/projects/export|import`) plus `ProjectArchivePanel`. |
| 6.2 and Addendum: retired work-item connector "connector abstraction stays", extent unknown | Read-only import exists: provider with write guard ("connections are read-only"), `/api/sync/work-items/*`, `connector_connections` with `readOnly`, a provider enable flag and token setting. Writes throw by design. |
| FR-18: sample map "through the same template mechanism" | No Story Map template mechanism exists. `story_templates` are per-Story description skeletons. |
| FR-27: "No GitHub write without a confirmed Dry Run" | `push_preview_enabled` is a project setting, so preview can be switched off. |
| FR-35: templates persist and are exposed as MCP prompts | Templates are hardcoded (`packages/ai` and `routes/index.ts`); only `GET /api/ai/templates` exists. |
| FR-30: inventory in `docs/mcp-tools.md` and the retired list | Registry has 24 tools; `GetSourceDocument` and `CreateStoryMap` are absent, `PullStoryMapGitHubLinks` is extra. |
| FR-11: Card Key prefix "configurable per Story Map" | Already stored (`storyMap.cardKeyPrefix`, key = prefix-number); editing in the UI not verified. |

## 3. FR status against code

Status: Met, Partial, Missing, Unverified.

| FR | Status | Evidence |
| --- | --- | --- |
| 1 Loopback | Met | `config/runtime.ts` enforces loopback unless `STORYMAPPER_STRICT_LOCAL=false`; "no outbound traffic when idle" unaudited |
| 2 Project persistence | Partial | Folder plus SQLite fine; schema is `CREATE TABLE IF NOT EXISTS` and ad hoc `ALTER TABLE ADD COLUMN` in `connection.ts`; no versioning, no backup hint; `packages/db/src/migrations` is empty |
| 3 Secrets | Partial | Tokens only from env or `gh` CLI, never stored (good); archive export is redacted; no keychain or in-app store |
| 4 One-command install, all OS | Missing | Only `setup.ps1` and `start.ps1`, repo-local Windows Node |
| 5 Failure messages, diagnosis | Partial | `verify.ps1` has readable errors and checks; not a diagnosis command for users |
| 6 First run, sample map | Partial | `OnboardingPanel` exists (German); no sample map, checklist not found |
| 7 English UI | Missing | German in `OnboardingPanel`, `ProjectArchivePanel`, `CardDetailModal`; no central string source; README, RUNBOOK, templates German |
| 8 Roles | Met | `card-taxonomy.ts`; two-interaction rule unverified |
| 9 Drag-and-drop, alternatives | Partial | dnd-kit in `BacklogList`, `DiscoveryMatrix`, `SwimlaneGrid`, move endpoint; key handling found in `DiscoveryMatrix` only |
| 10 Search, filter, bulk | Unverified | `PATCH /api/cards/bulk` exists; filters not checked |
| 11 Collapse, keys, notes | Partial | collapse stores for Discovery lanes and Tree; prefix stored; Notes exclusion from sync unchecked |
| 12 Focus Release, view settings | Missing | no matches |
| 13 Addressable navigation | Met | `router.tsx` |
| 14 Six Views | Met | six view components; content per view unverified |
| 15 Card modal, deep link | Met | `?card=` search param in router, `CardDetailModal`, Tiptap editor |
| 16 No hidden features | Missing | `VITE_DEV_FEATURES` gates `RootLayout` and `story-map-shell` |
| 17 Manage customization | Partial | create, patch, delete routes exist; UI delete wiring unverified |
| 18 Story Map templates | Missing | see section 2 |
| 19 Markdown/TXT import | Met | routes, importers, tests; dedup unverified |
| 20 Source Links | Met | routes and `card_source_links`; "agent Cards always linked" unverified |
| 21 Source coverage | Met | report route, core coverage |
| 22 Single-ticket import in composer | Missing | no composer flow; bulk import exists |
| 23 Releases and summary | Met | CRUD, summary, kanban, timeline; "released" state unverified |
| 24 Roadmaps | Met | columns, swimlanes, cards, references, types simple/release/epic |
| 25 Release notes, slicing | Partial | slicing exists (`release-slicing`, `ProposeReleaseSlice`); no release-notes generation |
| 26 Guided GitHub connection | Missing | connection validation exists, but tokens only from env or `gh` |
| 27 Push, import, sync, Dry Run | Partial | all present; preview switchable |
| 28 Conflicts, Sync Health | Met | conflict resolve route, health route |
| 29 Two-way navigation | Met | links routes; commit history shows Story Map and Card reference footer |
| 30 Complete MCP surface | Partial | no MCP tools for Roadmaps, Annotations, Workflow Statuses, Source Document import, reports, exports, privacy, retired work-item connector or ChangeSet approve and reject |
| 31 Proposals, ChangeSets | Partial | proposal tools, approve, reject, apply routes; selective apply not evident |
| 32 Approval, proposal-only | Partial | gating via privacy settings; no per-call approval, no Source Documents toolset, admin fixed off |
| 33 Tool-call audit | Partial | input hash recorded; output hash and host unverified |
| 34 Transport, client config | Partial | stdio only; `/api/mcp/host-configs` emits `corepack pnpm --dir` commands with absolute paths; no HTTP |
| 35 Context, templates | Partial | Product Context GET and PATCH; templates hardcoded |
| 36 Privacy Modes | Partial | mode enum and per-connector switches enforced with 403; visible on every page unverified; mode and switches overlap |
| 37 Activity Log, audit export | Met | `/api/activity`, `/api/exports/audit` |
| 38 Export center | Partial | HTML, PNG, PDF in view export; JSON, Markdown, CSV in privacy panel on the audit route |
| 39 Reports | Met | four report routes |
| 40 Legal files | Missing | no LICENSE, CONTRIBUTING, SECURITY, code of conduct |
| 41 English docs | Missing | README and RUNBOOK German |
| 42 CI | Missing | no `.github/workflows` |
| 43 History and content audit | Missing | see section 5 |
| 44 Versioned releases | Missing | version hardcoded `0.1.0` in archive service; no release process |
| 45 Agentic reference material | Partial | `AGENTS.md`, rules, BMad artifacts exist; no contributor walkthrough |

## 4. What the code does that the PRD does not say

1. **Project archive export and import** with redacted snapshot: contradicts scope 6.2. Move into v1.0 as a Should, and let FR-44 use its manifest version.
2. **retired work-item connector read-only import** and the multi-connection model: PRD must state the v1.0 position (ship read-only import as is, or strip) instead of "v1.1".
3. **Card history** (`card_versions`, history route) and **attachments** (`card_attachments`, upload routes): dropped from the PRD; add FRs and Glossary terms.
4. **Card metadata** priority, business value, effort, estimate, color, assignee: named in FR-10 and FR-14 but not defined by any FR.
5. **Activity parking** (park and unpark with child re-homing) and **archive versus delete**: no requirement.
6. **Persona scope** (Project or Story Map level) and **issue type mapping with parent linking** on push: absent from FR-26 to FR-29.
7. **Privacy switches with no feature behind them:** `external_llm_enabled`, `update_checks_enabled`. Decide: remove, or keep as documented guarantees.
8. **`/api/mcp/call` and `/api/credentials/status`**: an HTTP tool-invocation route the UI uses; PRD silent, and it needs the same approval rules as MCP.
9. **Release timeline** report and chart: covered only implicitly by FR-14.
10. **Repository content outside the app:** `tools/` Python CLIs, `.agents` and `.claude` skills, `docs/templates`, seven issue templates, `card-authoring.mdc`. These carry team-specific process and language. FR-43 must decide what ships.

## 5. What the code must do that the PRD does not yet demand

1. **retired wiki connector removal footprint** (FR-43 names only three parts): three tables, 11 routes, the removed provider package, its core storage module and publishing service, its enable flag and API-token setting, and the web panel and route.
2. **Third-party material:** `docs/story-mapping-playbook.pdf` has unknown provenance and license; add it to the FR-43 audit list.
3. **File-size and structure rule:** `AGENTS.md` and the project rules cap files at 750 lines. Five files exceed it, `storymapper-repository.ts` at 3,797 lines and `routes/index.ts` at 1,405 the worst. A showcase for agentic coding cannot ship that. NFR-7 needs a measurable threshold and an epic for the split.
4. **Test depth:** 9 test files in total; none for web, contracts, ai, mcp, retired wiki connector. NFR-8 lists what tests must cover; add a baseline and a coverage floor per package.
5. **Dead code and empty scaffolding:** unused `storage/in-memory-store.ts`, empty `packages/db/src/migrations`, `seed` and `apps/server/src/jobs`.
6. **Schema evolution:** replace ad hoc `ALTER` with versioned migrations before any tagged release, since FR-44 promises an upgrade path.
7. **`/api/mcp/call` and MCP host config** must work without `corepack pnpm` and absolute repository paths once the install path changes (FR-4, FR-34).
8. **Verify script** `verify.ps1` is Windows only; FR-42 needs an OS-neutral equivalent.

## 6. Recommended PRD edits

1. Correct the Addendum baseline (MCP permissions exist) and section 6.2 (`.lsm.zip` exists).
2. Add FRs: project archive (Should), card history, attachments, Activity parking and archive semantics, card metadata definition, `/api/mcp/call` approval parity.
3. Rewrite the retired work-item connector and privacy-switch items into explicit decisions.
4. Tighten FR-18, FR-27, FR-30, FR-32, FR-35 to match section 2, or mark the difference as intended work.
5. Extend FR-43 with the retired wiki connector footprint, the playbook PDF and the tools and skills decision; add a file-size threshold to NFR-7 and a per-package test floor to NFR-8.
6. Add a status column or an addendum table so epics can start from the delta, not from the whole PRD.

## 7. Suggested next step

Resolve Open Question 5 by turning table 3 into the baseline: verify FR-10 and the unverified sub-conditions named in the evidence column, then run `bmad-architecture` (schema versioning, credentials, MCP transport) before `bmad-create-epics-and-stories`.

## Changelog

- 2026-11-08 v2: Label findings, status tables, test claims and recommendations as historical; link current requirements and release guidance. Review results were preserved and not rerun.
