---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/prd.md
  - _bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/review-code-alignment.md
  - _bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/epic-topics.md
  - _bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-StoryMapper-2026-09-29/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-StoryMapper-2026-09-29/EXPERIENCE.md
---

# Agentic Story Mapper - Epic Breakdown

Reproducing statement: Prepare Epic 8 for BMAD Loop with private independent MIT publication, no name checks, permitted private-detail placeholders, complete employer-reference removal and standard BMAD Loop story finalization for upgrades. Date: 2026-10-19. Version: 9. Changelog: Applied the maintainer correction removing per-upgrade commits; retained other epics and orchestration state.

Changelog: Version 9 removes the per-upgrade commit requirement and separate execution lane for Story 8.2 (2026-10-19); standard loop story finalization applies. Version 8 applies accepted Epic 8 publication and upgrade-history decisions (2026-10-19); see `epic-8-preparation.md`. Version 7 incorporates accepted Epic 7 decisions D1–D6 (2026-10-18) and source-grounded story dependencies/acceptance. Version 6 incorporates the maintainer-confirmed Epic 6 decisions (2026-10-17). Version 5 reconciles all five Epic 5 story baselines and acceptance with delivered Epic 4 capabilities, durable Plan-state comparison, dependency ownership, live-event identity and drift evidence. Version 4 reconciled all 13 Epic 4 stories with source/architecture/UX and confirmed user decisions on automatic apply, generic BMad slices, free-text provenance, file atomicity and simulated browser validation. Clarified dependencies, idempotency, schema/conflict handling and budget evidence. Added the user-requested optional Agent-approval flag; accepted self-approval and protection rules close the remaining planning blockers, recorded in `epic-4-readiness-2026-10-10.md`.

## Overview

This document provides the complete epic and story breakdown for Agentic Story Mapper, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1 [Core] Local web application on loopback: The user can run the API server and the web UI locally and open the UI in a browser.
FR-2 [Core] Project folder persistence: The user can create, open and switch between Projects; each Project stores structured data in SQLite and files in the Project folder.
FR-3 [Core] Secrets stay out of Project data: Connector credentials are never written to the Project folder, exports, logs or the Activity Log.
FR-4 [Core] One-command setup and start on all platforms: The user can install dependencies and start the app with one documented command each on Windows, macOS and Linux.
FR-5 [Core] Actionable failure messages and diagnosis: When setup or start fails, the user sees a plain-language cause and next action; a diagnosis command checks the common causes.
FR-6 [Core] Guided first run with a sample map: On first start the user sees a getting-started checklist and a ready-made sample Story Map.
FR-7 [Core] English user interface: All UI text, empty states, errors and built-in templates are English and defined in one central place.
FR-8 [Core] Three-level Cards with visible roles: The user can create and edit Activities, Steps, Stories and Notes; each level carries a role label in the UI and is not distinguished by color alone.
FR-9 [Core] Drag-and-drop and equivalent alternatives: The user can reorder, reparent and assign Cards to Releases by drag-and-drop, and can do the same by keyboard and by form.
FR-10 [Core] Search, filter and bulk actions: The user can search Cards by title, description, Source Links and GitHub links, filter by Persona, Workflow Status, Release, Annotation, color, estimate, priority, Sync State and Source coverage, and act on multiple selected Cards.
FR-11 [Core] Collapse, Card Keys and Notes: The user can collapse and expand Activities and Steps, configure a Card Key prefix per Story Map and place Notes.
FR-12 [Later] Focus Release and per-View display settings: The user can focus the board on one Release and choose which badges and fields appear on Cards per View.
FR-13 [Core] Addressable navigation: Every main menu entry and every View is a real link with its own URL, an active state and working browser history.
FR-14 [Core (Timeline View: Later)] Six Views with distinct focus: The user can switch between Discovery, Tree, Planning, Backlog, Tracking and Timeline Views, and to the Slices and Graph Views (FR-62, FR-63).
FR-15 [Core] Card detail as deep-linkable modal: The user can open a Card in a modal whose open state is in the URL and edit its description with a Rich Text editor that stores Markdown.
FR-16 [Core] Full-feature visibility: All user pages are reachable without an environment switch; existing View/Activity Export actions remain accessible without a dedicated Export route or rail entry (6B).
FR-17 [Core] Manage Personas, Annotations, Workflow and Templates: The user can create, edit and delete Personas, Annotations, Workflow Statuses and Story Templates in the UI.
FR-18 [Later] Story Map Templates: The user can start a Story Map from a template including colors, Annotations, Personas, Workflow and sample Cards.
FR-19 [Core] Markdown and TXT source import with chunking: The user can import Markdown and TXT files as Source Documents that are split into Source Chunks with stable IDs and locators.
FR-20 [Core] Source Links on Cards: The user or an Agent can link Cards to Source Chunks, GitHub Issues or notes, and every Card shows its provenance in the detail view.
FR-21 [Later] Source coverage view: The user can see which Source Chunks are linked to Cards and which are not.
FR-22 [Core] Single-ticket import in Card creation: The user can create a Card by entering a ticket URL or ID; the Card is filled with title and description and gets a Source Link to the ticket. Addresses S12.
FR-23 [Core] Release management and reporting: The user can create Releases with name, goal, start and end date and status, assign Stories by drag-and-drop or bulk action and read a Release summary with counts, estimates, status distribution and unestimated items.
FR-24 [Later] Roadmaps: The user can create Roadmaps with free columns, swimlanes and Roadmap Cards that reference Releases, Activities or Stories and show progress.
FR-25 [Core] Release notes and slicing: Built-in happy path and read-only release notes; BMad supplies other cuts through generic ChangeSet operations.
FR-26 [Core] Guided GitHub connection: The user can connect GitHub in the UI by GitHub CLI login or a token entered in a guided dialog that verifies the connection and explains what the token is used for. Addresses S2, S8.
FR-27 [Core] Push, import and sync with Dry Run: The user can push Cards or whole Releases as GitHub Issues and Milestones, import Issues into an unscheduled area and synchronize title, description, state and labels; every write is previewed by a Dry Run.
FR-28 [Core] Conflict handling and Sync Health: The user can see and resolve conflicts as diffs and review a Sync Health dashboard (unsynced, conflict, stale, deleted remote, deleted local).
FR-29 [Core] Two-way navigation: The user can jump from a Card to its Issue and from an Issue back to the Card.
FR-30 [Core] Complete MCP tool surface: An Agent can discover Projects, create Story Maps, read and change Cards, Releases, Personas, Roadmaps, Annotations, Workflow Statuses and Story Templates, import and read Source Documents, move and archive Cards, list ChangeSets and apply an already approved one, run reports and exports, and use the GitHub read, push, import and sync tools.
FR-31 [Core] Proposal tools and ChangeSets: An Agent can request a map from a Source Document, backlog grooming and release slices; each returns a ChangeSet with sources and rationale and writes nothing.
FR-32 [Core] Agent access, protection and approval: Agents can use the tool surface by default; the user controls this with the safety switches, and every tool call obeys the same rules whether it arrives over MCP or the HTTP tool-call route the UI uses.
FR-33 [Core] Tool-call audit: Every tool call records host, tool, input hash, output hash, affected objects and time.
FR-34 [Core] Transport and client configuration: The MCP server is reachable over Streamable HTTP on the app's own port at `/mcp`, and a stdio bridge forwards to it for hosts that only speak stdio. The user can copy ready-to-paste client configuration for Claude, Cursor and VS Code.
FR-35 [Core] Product context and function templates: The user can define a Product Context (type, purpose, key features, and optional users, platform, glossary, non-goals) and manage AI function templates (personas, goals, steps, stories, acceptance criteria, INVEST check, splitting, estimation, gap analysis) that are stored in the Project.
FR-36 [Core] Safety switches: The user sees and changes the safety switches in the app, the current state is visible on every page, and changes are logged.
FR-37 [Core] Activity Log and audit export: The user can review the Activity Log (human, agent, GitHub, system) with diffs and export it.
FR-38 [Later] Export center: The user finds all exports (HTML, PNG, PDF, JSON, Markdown, CSV, audit, GitHub-ready Issues) in one place with a short explanation per format. Addresses S10.
FR-39 [Later] Reports: The user can generate backlog health (missing description, acceptance criteria, estimate, source, GitHub link, stale), source coverage and Release reports.
FR-40 [Core] Legal and community files: The repository contains a license file, a contribution guide, a security policy, a code of conduct and issue and pull request templates.
FR-41 [Core] Public documentation in English: README, runbook and architecture documents are English, current and describe the real install path per operating system.
FR-42 [Core] Continuous integration: Every pull request runs typecheck, tests, build and a release-hygiene check on all supported operating systems.
FR-43 [Core] Repository history and content audit: Before the first public push, the repository history and tracked files are audited for secrets, personal data, customer or employer specific content and unlicensed material.
FR-44 [Core] Versioned releases: The project publishes tagged, semantically versioned releases with release notes and a documented upgrade path for Project folders.
FR-45 [Core] Agentic-coding reference material: The repository documents how it is built with agents: instruction files, planning artifacts, review and check workflow, and how a contributor reproduces it.
FR-46 [Core] Portable Project archive: The user can export one Project as one archive file and import it on another machine; import hot-switches the current runtime to the new folder (no second server). Multi-Project whole-runtime bundles are out of scope.
FR-47 [Core] Card history: Every change to a Card creates a Card Version, and the user can view versions with their field changes.
FR-48 [Later] Attachments: The user can attach files to a Card and remove them.
FR-49 [Core] Park, archive and delete: The user can park an Activity, archive a Card and delete a Card as three distinct operations.
FR-50 [Core] Card fields: A Card carries title, description, Workflow Status, priority, business value, effort, estimate, color, assignee, Release, Personas, Annotations, Source Links, Attachments and history; the fields are editable in the detail modal and visible per View settings.
FR-51 [Core] Agent-submitted ChangeSets: An Agent can submit its own ChangeSet: a batch of creates and updates covering Story Maps, Cards at all levels with parent relations, Releases with Card assignment, Personas and Source Links.
FR-52 [Core] External references and idempotent updates: A Card, Release and Persona can carry an external reference, and an Agent can address objects by it instead of by internal ID.
FR-53 [Core] Visual ChangeSet preview: The user can review a proposed ChangeSet on the board before applying it: added, changed, moved and removed Cards are marked in place, Slices show as swimlanes, and single operations can be deselected.
FR-54 [Core] BMad Method round trip: An Agent running BMad Method planning skills can publish its epics and stories to a Story Map and refresh them when the plan changes.
FR-55 [Core] Provider extension points: A developer can add a work item system or a publishing target by implementing one provider interface and registering it, without changing existing providers.
FR-56 [Core] Delivery status from Agents: An Agent can set Workflow Statuses for many Cards in one call by external reference, so that the status of the source method shows on the board.
FR-57 [Core] Restore points: The user can create restore points and restore the Project to one; the system creates them automatically before risky operations.
FR-58 [Core] Live board updates: The board reflects changes made by Agents, GitHub sync or another browser tab without a manual reload.
FR-59 [Core] Concurrent edits are never lost silently: When a human and an Agent change the same object, the later save is rejected with the current state and the user or Agent decides.
FR-60 [Core] Plan drift report: An Agent can request, per external system, the differences between the Story Map and the state last synchronized from that source: Cards moved between Slices, changed titles or descriptions, changed status, added and removed Cards.
FR-61 [Core] Dependencies between Cards: The user or an Agent can declare that a Card depends on another Card; dependencies are set through the same ChangeSet mechanism as other changes.
FR-62 [Core] Slices view: The user can view Releases as Slices on one board: per Slice the Stories, count, estimate sum, status distribution and blockers.
FR-63 [Core] Dependency graph view: The user can see Cards as a graph with Dependency edges, filter it by Activity, Slice, status or assignee, and list all blocked Cards.
FR-64 [Core] What changed since I looked: The user sees what Agents, GitHub sync and other tabs changed since they last looked, grouped by actor and affected Card, and can mark it as seen.

### NonFunctional Requirements

NFR-1 Performance: Epic 6 records reproducible 1,000-Card map read/mutation/interaction/search measurements against diagnostic 150/30/100/300 ms references, without timing-based acceptance or CI failures. Binding performance gates and ETags are deferred; earlier-story gates/evidence remain unchanged (7C/9C, 2026-10-17).
NFR-2 Privacy: no network connection without an enabled Connector or Agent.
NFR-3 Security: loopback binding by default, tokens never logged or persisted in Project data, agent writes governed by the protection switch and logged, input validation on every HTTP and MCP boundary.
NFR-4 Data integrity: conflicts are never resolved silently; ChangeSet application is atomic per ChangeSet.
NFR-5 Accessibility: every drag-and-drop action has a keyboard alternative; interactive elements have accessible names [ASSUMPTION: target WCAG 2.1 AA for core flows].
NFR-6 Portability: Windows, macOS and Linux on Node 24; no OS-specific requirement in the core install path.
NFR-7 Maintainability: the schema contracts are the single source for API, MCP and UI; domain logic stays free of network and database effects; no source file exceeds 750 lines or 100 KB and no function exceeds 50 lines.
NFR-8 Quality gate: automated tests cover MCP tools, ChangeSet application, GitHub sync conflict handling and Project migration; every package that contains logic has tests, and CI reports coverage per package against a floor set in architecture.

### Additional Requirements

- AD-1 Dependency direction and purity: imports follow the layer diagram; every workspace import is declared and verified by a CI script; only `packages/db` imports `better-sqlite3` or `drizzle-orm`; `core` is pure (no `node:*`, `Date`, `Math.random`, `crypto`; Clock and IdSource injected); web features import each other only through `index.ts`.
- AD-2 One use-case layer for HTTP and MCP: every use case has a typed contract, an `ActorContext` and a descriptor; the capability manifest is generated by scanning `application/**`; a two-way parity test fails on missing tools, missing operation-registry members or unmapped routes.
- AD-3 Unit of work and write gate: `unitOfWork.run(actorContext, fn)` with a synchronous body and Tx-bound repositories; required actor context; network I/O only before or after the transaction; events emitted after commit; one Activity Event per operation plus `changeset.applied`.
- AD-4 Non-human mutations are ChangeSets: one executor; `apply=true` takes a restore point then applies atomically; `apply=false` or protection stores a `proposed` ChangeSet; preview is computed server-side; dependents deselect with their operation; GitHub push stays its own use case with a confirmed Dry Run; one `ConflictReport` contract.
- AD-5 Operation registry: `ChangeOperation` is a discriminated union with typed payloads (no `z.unknown()`), one `describe` and one `resolve` per member in `core`, upserts resolved inside the applying transaction, placeholder keys `NEW-n` in previews, `operationsSchemaVersion` on ChangeSets.
- AD-6 Agent access, protection and approval: project flags `agentAccess` (on), `github` (off), `agentProtection` (off); actor is `agent` only on `/mcp` and `/api/mcp/call`; approve, reject, restore, settings, archive import and on-demand restore points are human-only; flags read inside the applying transaction; every tool call including reads is recorded; agent-triggered GitHub calls are refused under protection.
- AD-7 Versions and concurrency: integer `version` on Story Map, Card, Release, Persona and Roadmap with exact bump rules; `card_versions.version` equals `cards.version`; `baseVersion` checked once per object; HTTP 409 with a conflict list; no foreign-key cascades to versioned roots; every accepted Card save increases the version; same-actor saves within 60 seconds rewrite the latest Card Version under the new version (ADR 0002).
- AD-8 Restore points: `VACUUM INTO` a temp file outside transactions; classes `pre-migration`, `pre-restore`, `pre-apply`, `manual` with pinned retention and size cap; seven-step restore protocol with `DatabaseHandle` holder, `.restoring` recovery, undone actions kept flagged, new epoch.
- AD-9 Migrations and archive: drizzle-kit SQL migrations with `foreign_keys=OFF` plus `foreign_key_check`; populated-fixture migration tests; `--custom` backfills; refusal of newer schemas and of databases without a journal; `schemaVersion` beside every JSON column; exported `redactedTables`; archive manifest with format, schema and app version; archive excludes snapshots, logs, lock and port.
- AD-10 External references: table `external_refs` with `scope_id NOT NULL`, `synced_version`, two unique keys, reserved `github` system, deletion with the entity, archive keeps references, upsert onto archived entity unarchives.
- AD-11 Live updates: `activity_events.seq`, SSE id `<epoch>:<seq>`, one message per transaction with `{entityType, entityId, version}` tuples and `originClientId`, 100 ms coalescing, heartbeat every 15 s, one stream per browser profile, what-changed panel reads events after the client's last-seen `seq`.
- AD-12 Process model and operations: one process and port serving web build, `/api`, `/api/events`, `/mcp` (stateful sessions); exclusive `.lock`; `busy_timeout` and WAL checkpointing; heavy work on a worker thread or chunked; stdio bridge keeps `Mcp-Session-Id`; push intent rows; logs in `<project>/logs/`; `GET /api/health`; `.port` file; defined shutdown order; `STORYMAPPER_ALLOW_REMOTE_HOST` for non-loopback binding.
- AD-13 Host and Origin validation hook on every route, JSON content type for mutations except multipart and `DELETE /mcp`, `Accept: text/event-stream` for the event stream, no token.
- AD-14 Secrets in a user-level file (`%APPDATA%/StoryMapper` or `~/.config/storymapper`, mode 0600), never in the Project, archives, logs or events; GitHub CLI preferred.
- AD-15 Providers: `WorkItemProvider` and `PublishProvider` interfaces, one registry, registry rejects unknown ids (tested); GitHub writes need a confirmed Dry Run; no outbound requests when `github` is off and no agent is connected (tested).
- AD-16 Contracts and errors: Zod schemas are the single source; typed `DomainError(code, details)`; one `toErrorResponse` for HTTP and MCP; per-item results for multi-step operations.
- AD-17 Aggregate register: every table belongs to one aggregate row; a schema-classification test fails on unclassified tables; link tables belong to the rendering aggregate.
- AD-18 Epic 6 diagnostic performance measurements on a 1,000-Card fixture (read/mutation/interaction/search references 150/30/100/300 ms); no Epic 6 timing failure gate. Preserve earlier Apply/Restore gates and evidence. Required Card indexes use AD-9 current pre-release schema ownership; `next_card_number` never reuses keys. ETags/conditional reads are deferred beyond Epic 6.
- AD-19 Size limits (750 lines, 100 KB, 50-line functions) enforced by a CI script; every logic package tested with a 60 percent line-coverage floor.
- AD-20 Web architecture: TanStack Query for server state, Zustand for UI-local state, code-based TanStack Router routes, one page per View, one UI string module, keyboard and form paths for every drag action, editor save batching every 2 seconds.
- AD-21 Runtime and install: Node 24 with Corepack only; `scripts/*.mjs` for `setup`, `start`, `dev`, `doctor`; no repo-local Node; LF line endings via `.gitattributes`.
- AD-22 Dependency hygiene and upgrade wave: no unused dependencies, no LLM SDK; `packages/ai` folded into `core`; importers reduced to Markdown and TXT; before v1.0 upgrade Drizzle to 0.45.2 or later, zod to 4, MCP packages to 2.x, Vitest, Vite and Tiptap; `pnpm audit` gate on release; `check-hygiene` and license allowlist in CI.
- AD-23 Proposals, templates and seed content: deterministic proposal generators in `core`; Product Context and AI function templates persisted and exposed as MCP prompts; Story Map templates as English JSON files; sample map as a template; checklist state in `project_settings`.
- AD-24 Reports and exports: report functions in `core` (including dependency, blocked-Card, Slice comparison and drift) served by `application/reports`; JSON, Markdown, CSV and audit exports server-side; HTML, PNG and PDF view exports client-side.
- Brownfield baseline: there is no starter template; the existing code is the baseline, so every story states whether it builds, changes or removes existing code (see `review-code-alignment.md`, status at commit 5e4a647).
- Tiering: PRD section 6.3 defines Core and Later; epics and stories cover the Core tier only; Later items are listed in the Epic List as parked without stories.
- Validation gate: after the foundation topics (T1 to T4) and before the Core views and visualization requirements are built out, a thin slice runs as five browser-controlled BMad workflow simulations on disposable Projects (PRD section 6.3; user decision 2026-10-10).
- Fixed decisions from the memlog: no legacy database adoption (prototype folders are refused or deleted); retired wiki connector and retired work-item connector are removed; single-user local operation; Windows, macOS and Linux.

### UX Design Requirements

The UX contract is `_bmad-output/planning-artifacts/ux-designs/ux-StoryMapper-2026-09-29/DESIGN.md` (visual identity, tokens, components) and `_bmad-output/planning-artifacts/ux-designs/ux-StoryMapper-2026-09-29/EXPERIENCE.md` (information architecture, behavior, states, accessibility floor, key flows). Both are final; where a story and the contract differ, the contract wins and the story is corrected. No separate UX stories exist: each requirement below is owned by the story named, as acceptance criteria.

- UX-DR1 Shared Dialog (focus containment, inert background, Esc, focus restore, alertdialog confirms, no `window.confirm`): Story 2.5.
- UX-DR2 Status and alert announcer, global `:focus-visible` rule, form-control border token: Story 2.2.
- UX-DR3 Switch strip and switch settings semantics: Story 3.5.
- UX-DR4 Live-update behavior (held updates, focus never moved by an update, dirty-field guard): Stories 3.10 and 3.11.
- UX-DR5 Change markers and state-cue table (word, glyph, color): Stories 4.9 and 5.4.
- UX-DR6 ChangeSet review, status words, `?preview=<id>` closed state: Story 4.9.
- UX-DR7 Discovery roving grid, key table, Move dialog, focus continuity: Story 6.3.
- UX-DR8 Category chip, priority badge and accessible names of tile controls: Stories 6.2 and 6.4.
- UX-DR9 Navigation grouping, landmarks, skip link, per-route titles and focus, Experimental labels: Story 6.1.
- UX-DR10 Discovery grid semantics and tile name and description: Story 6.6.
- UX-DR11 Card modal behavior and description editor: Story 6.7.
- UX-DR12 Accessibility checks and release checklist: Story 6.10.
- UX-DR13 Slices and Graph visual components and table twin: Stories 5.2 and 5.3.
- Open: the Project switcher in the rail header (FR-2) is an unconfirmed assumption of the UX contract; its owning story is assigned once it is confirmed. A wireframe pass for ChangeSet review, Slices, Graph and What changed is recommended before Story 4.9 and Epic 5.

### FR Coverage Map

FR-1: Epic 3 - Local web application on loopback
FR-2: Epic 2 - Project folder persistence
FR-3: Epic 7 - Secrets stay out of Project data
FR-4: Epic 1 - One-command setup and start on all platforms
FR-5: Epic 1 - Actionable failure messages and diagnosis
FR-6: Epic 1 - Guided first run with a sample map
FR-7: Epic 1 - English user interface
FR-8: Epic 6 - Three-level Cards with visible roles
FR-9: Epic 6 - Drag-and-drop and equivalent alternatives
FR-10: Epic 6 - Search, filter and bulk actions
FR-11: Epic 6 - Collapse, Card Keys and Notes
FR-13: Epic 6 - Addressable navigation
FR-14: Epic 6 - Six Views with distinct focus
FR-15: Epic 6 - Card detail as deep-linkable modal
FR-16: Epic 6 - Full-feature visibility
FR-17: Epic 6 - Manage Personas, Annotations, Workflow and Templates
FR-19: Epic 4 - Markdown and TXT source import with chunking
FR-20: Epic 4 - Source Links on Cards
FR-22: Epic 7 - Single-ticket import in Card creation
FR-23: Epic 6 - Release management and reporting
FR-25: Epic 4 - Release notes and slicing
FR-26: Epic 7 - Guided GitHub connection
FR-27: Epic 7 - Push, import and sync with Dry Run
FR-28: Epic 7 - Conflict handling and Sync Health
FR-29: Epic 7 - Two-way navigation
FR-30: Epic 3 - Complete MCP tool surface
FR-31: Epic 3 - Proposal tools and ChangeSets
FR-32: Epic 3 - Agent access, protection and approval
FR-33: Epic 3 - Tool-call audit
FR-34: Epic 3 - Transport and client configuration
FR-35: Epic 3 - Product context and function templates
FR-36: Epic 3 - Safety switches
FR-37: Epic 3 - Activity Log and audit export
FR-40: Epic 8 - Legal and community files
FR-41: Epic 8 - Public documentation in English
FR-42: Epic 8 - Continuous integration
FR-43: Epic 8 - Repository history and content audit
FR-44: Epic 8 - Versioned releases
FR-45: Epic 8 - Agentic-coding reference material
FR-46: Epic 2 - Portable Project archive
FR-47: Epic 2 - Card history
FR-49: Epic 2 - Park, archive and delete
FR-50: Epic 6 - Card fields
FR-51: Epic 4 - Agent-submitted ChangeSets
FR-52: Epic 4 - External references and idempotent updates
FR-53: Epic 4 - Visual ChangeSet preview
FR-54: Epic 4 - BMad Method round trip
FR-55: Epic 7 - Provider extension points
FR-56: Epic 4 - Delivery status from Agents
FR-57: Epic 2 - Restore points
FR-58: Epic 3 - Live board updates
FR-59: Epic 3 - Concurrent edits are never lost silently
FR-60: Epic 5 - Plan drift report
FR-61: Epic 5 - Dependencies between Cards
FR-62: Epic 5 - Slices view
FR-63: Epic 5 - Dependency graph view
FR-64: Epic 5 - What changed since I looked

Later tier (parked, no epic): FR-12 Focus Release and per-View display settings, FR-18 Story Map Templates, FR-21 Source coverage view, FR-24 Roadmaps, FR-38 Export center, FR-39 Reports, FR-48 Attachments

## Epic List

### Core epics

### Epic 1: Run anywhere, in English
A user installs and starts Agentic Story Mapper with one command on Windows, macOS and Linux and opens an English app with a sample map to start from.
**FRs covered:** FR-4, FR-5, FR-6, FR-7
**NFRs addressed:** NFR-6
**Implementation notes:** Story 1.6 verifies the board requirements against the running app before any later epic assumes them (it has no dependencies and can run first); the UI string module lands first so later UI stories need no rework; Node scripts (`setup`, `start`, `dev`, `doctor`) replace PowerShell; no repo-local Node.

### Epic 2: Project data you can trust
Every change to a Card is recorded, the Project migrates between versions, and the user can restore a restore point or keep a portable archive.
**FRs covered:** FR-2, FR-46, FR-47, FR-49, FR-57
**NFRs addressed:** NFR-4
**Implementation notes:** Unit of work, write gate, version counters and the repository split land here for the aggregates they touch; schema changes are made in place until the baseline migration of Epic 8 (development databases are disposable, no legacy data exists).

### Epic 3: Human and agent share one live map
The user works with an Agent from a coding CLI on the same map, sees its changes immediately, and controls what the Agent may do.
**FRs covered:** FR-1, FR-30, FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37, FR-58, FR-59
**NFRs addressed:** NFR-2, NFR-3
**Implementation notes:** Application layer with use cases, `/mcp` on the MCP SDK 2.x with zod 4, Host and Origin validation, SSE with sequence and epoch, safety switches, tool-call audit, persisted templates as MCP prompts.

### Epic 4: Agents cut and publish, humans review
A BMad cut, or a cut made from the terminal, arrives as a reviewed story map with a preview before applying, idempotent re-runs and delivery status from the Agent.
**FRs covered:** FR-19, FR-20, FR-25, FR-51, FR-52, FR-53, FR-54, FR-56
**Implementation notes:** Operation registry, source import, external references, server-side preview; Story 4.13 is the validation gate with five browser-controlled simulations, and Epic 5 starts after it.

### Epic 5: See and judge the cut
The user can tell whether a cut holds: dependencies, Slices with violations, a graph, a what-changed panel and a plan drift report. Slice comparison means two recorded Plan states of the same Story Map, confirmed by the maintainer on 2026-10-13; Releases remain the lanes within each state. Requirements are reconciled before the separate implementation-preparation step. Epic 5 has not been implemented or started.
**FRs covered:** FR-60, FR-61, FR-62, FR-63, FR-64 (and the Slices and Graph Views of FR-14)
**Implementation notes:** Built after the validation gate; pure checks live in `core`; adds `card_dependencies` and the `dependency` operation.

### Epic 6: Everyday board work
The user creates, moves, searches, filters and plans on the board with mouse, keyboard or form, and every function is reachable.
**FRs covered:** FR-8, FR-9, FR-10, FR-11, FR-13, FR-14 (Discovery, Tree, Planning, Backlog, Tracking), FR-15, FR-16, FR-17, FR-23, FR-50
**NFRs addressed:** NFR-1, NFR-5
**Implementation notes:** Relies on the verified baseline of Story 1.6; removes the developer-feature switch; performance budget tests on the 1,000-Card fixture.

### Epic 7: Plan with GitHub
The user connects GitHub in the app, imports single tickets while creating Cards, and pushes, imports and syncs with a mandatory Dry Run and visible conflicts.
**FRs covered:** FR-3, FR-22, FR-26, FR-27, FR-28, FR-29, FR-55
**Implementation notes:** Credentials in the user-level file, the provider registry with its unknown-id test, push intent rows.

### Epic 8: Ready for the public
The repository can be published: license and community files, continuous integration on three operating systems, English documentation, a history audit, dependency currency and versioned releases.
**FRs covered:** FR-40, FR-41, FR-42, FR-43, FR-44, FR-45
**NFRs addressed:** NFR-7, NFR-8
**Implementation notes:** Includes the baseline migration with Drizzle 0.45.2 or later and the upgrade path for Project folders; the repository history decision (rewrite or fresh repository) is an open point without a story, made by the maintainer last (PRD Open Question 1); Vitest, Vite and Tiptap are raised here or earlier when touched.

### Parked (Later tier, no stories)
FR-12 (Focus Release, per-View display settings), FR-18 (Story Map templates), FR-21 (source coverage view), FR-24 (Roadmaps), FR-38 (export center consolidation, PNG and PDF), FR-39 (Reports), FR-48 (Attachments) and the Timeline View of FR-14. Existing implementations ship only if they meet the quality bar, otherwise they are labeled experimental.

### Dependencies and gate
Epic 1, then 2, 3 and 4 in order (Story 1.6 can run first); Story 4.13 is the validation gate; Epic 5 follows the gate; Epics 6 and 7 build on Epics 2 and 3; Epic 8 runs alongside and ends last. Each epic stands alone and needs no later epic.

## Epic 1: Run anywhere, in English

A user installs and starts Agentic Story Mapper with one command on Windows, macOS and Linux and opens an English app with a sample map to start from.

### Story 1.1: English UI from one string module

As a user,
I want the whole app in English with all text coming from one place,
So that the interface is consistent and a later translation needs no code search.

**Fulfills:** FR-7. **Baseline:** German text in `OnboardingPanel`, `ProjectArchivePanel` and `CardDetailModal`; mixed-language states in `RootLayout`, `index` and `story-maps.index` routes; German seed data and built-in Story Templates.

**Acceptance Criteria:**

**Given** the web app source
**When** the migration is done
**Then** every user-visible string in the migrated components, route states and empty states comes from `apps/web/src/ui-strings`
**And** no JSX text literal remains in `OnboardingPanel`, `ProjectArchivePanel`, `CardDetailModal` and the route state components.

**Given** the three components that contain German text
**When** I open them
**Then** they show English text with the same meaning
**And** the app behaves exactly as before apart from the language.

**Given** seed data, built-in Story Templates, default Workflow Statuses and default Personas
**When** a new Project is created
**Then** all their names and texts are English.

**Given** the hygiene check `check-hygiene` (string part)
**When** German umlauts, `ß` or a word from the maintained German stop-word list appear in `apps/web/src`, seed data or built-in templates
**Then** the check fails and names file and line
**And** it passes on the migrated code.

**Given** the change is complete
**When** typecheck and all tests run
**Then** they pass.

### Story 1.2: Serve the app under one URL

As a user,
I want to open Agentic Story Mapper at one address,
So that I do not have to know about two ports.

**Fulfills:** FR-4 (one URL), NFR-2, AD-12 (single origin). **Baseline:** API on 4317, Vite on 5173, CORS allowlist for 5173.

**Acceptance Criteria:**

**Given** a built web app in `apps/web/dist`
**When** the server starts
**Then** `GET /` returns the app
**And** client routes such as `/projects/<id>/story-maps` return `index.html`.

**Given** the server is running
**When** I call `/api/*` or `/health`
**Then** they answer on the same port
**And** an unknown `/api/*` path returns a JSON 404 and never `index.html`.

**Given** the web build is missing and dev mode is not set
**When** the server starts
**Then** it refuses to start with a message naming the build command.

**Given** the served app
**When** it loads in a browser
**Then** it calls `/api` with relative URLs
**And** the CORS allowlist for the Vite port applies only in dev mode.

**Given** dev mode (`dev` script)
**When** Vite runs
**Then** it proxies `/api` and `/health` to the server and hot reload works.

**Given** the built `index.html`
**When** a test scans it
**Then** it references no remote origin (no CDN, no remote fonts).

### Story 1.3: One command to set up and start on any system

As a developer or tech lead,
I want one command to set up and one to start Agentic Story Mapper,
So that I am running in minutes on Windows, macOS or Linux.

**Fulfills:** FR-4, NFR-6, SM-1, AD-21. **Baseline:** `scripts/setup.ps1`, `start.ps1`, `verify.ps1`, repo-local Node under `.cache`, manual `.env` copy, no browser opening.

**Acceptance Criteria:**

**Given** a fresh clone with Node 24 and Corepack
**When** I run the documented setup command
**Then** dependencies install with the pnpm version pinned through Corepack, the web app is built and the default Project folder exists
**And** no manual configuration file is needed.

**Given** setup finished
**When** I run the documented start command
**Then** the server starts, waits until `/health` reports healthy, opens the default browser on the app URL and prints the URL.

**Given** the command names
**When** they are chosen
**Then** they do not collide with pnpm built-ins (`pnpm setup` is reserved by pnpm)
**And** they are the same on all three operating systems.

**Given** the repository
**When** this story is done
**Then** `scripts/*.ps1`, the repo-local Node download logic and the `.cache` Node path are gone
**And** `.gitattributes` fixes LF line endings so a Windows checkout has LF
**And** `engines` states Node 24 with an upper bound that matches Corepack availability.

**Given** the documentation
**When** I read the README quickstart, the RUNBOOK install and start sections and the AGENTS.md "Running and verifying" section
**Then** they name the new commands and no longer mention PowerShell scripts.

**Given** a clean clone on Windows and on one POSIX system
**When** a scripted run performs setup and start
**Then** both reach a healthy app
**And** the elapsed time is recorded against the 10-minute target of SM-1.

### Story 1.4: Understandable failures and a doctor command

As a user,
I want plain-language help when setup or start fails,
So that I can fix the problem without reading a stack trace.

**Fulfills:** FR-5. **Baseline:** technical errors such as `ERR_PNPM_UNEXPECTED_STORE`, `ECONNREFUSED 127.0.0.1:4317`, `better-sqlite3` load failures.

**Acceptance Criteria:**

**Given** a Node version below 24
**When** setup or start runs
**Then** it stops with a message naming the required and the found version and where to install Node.

**Given** the configured port is in use
**When** start runs
**Then** it names the port, says which process type holds it if known, and how to choose another port
**And** it exits with a non-zero code.

**Given** `better-sqlite3` cannot load
**When** start runs
**Then** the message names the rebuild command.

**Given** dependencies are not installed
**When** start runs
**Then** the message tells the user to run setup.

**Given** `doctor`
**When** I run it
**Then** it reports pass or fail for Node version, Corepack, port free, native module loads, dependencies installed and web build present
**And** it changes nothing
**And** it exits non-zero when any check fails
**And** when a server answers on the configured port it also reports the `/health` result.

**Given** any of these failures
**When** the message is shown
**Then** it contains one cause and one next action and no stack trace unless a debug flag is set.

### Story 1.5: Sample map and getting-started checklist

As a new user,
I want a ready-made sample map and a short checklist,
So that I know what to do after the first start.

**Fulfills:** FR-6. **Baseline:** `OnboardingPanel` exists (German, no checklist); no sample content. **Note:** uses the current schema mechanism (`ensureColumn`); until the first release development databases are disposable, and the baseline migration created in Epic 8 captures the schema as it stands then.

**Acceptance Criteria:**

**Given** a Project with no Story Map and a checklist not dismissed
**When** I open the app for the first time
**Then** a sample Story Map exists with at least one Activity, one Step and one Story
**And** it is built from an English JSON template under `packages/core/templates`.

**Given** the sample map
**When** I delete it
**Then** no other Story Map, Persona, Workflow Status or setting changes
**And** it is not created again.

**Given** the checklist
**When** it is shown
**Then** it lists: create a Story Map, add first Cards, optionally connect GitHub, export once
**And** each item marks itself when the matching data or event exists (a non-sample Story Map, a user-created Card, a GitHub connection, a successful export).

**Given** progress or dismissal
**When** I reload or restart
**Then** the state persists in `project_settings`.

**Given** an existing Project that already has Story Maps
**When** the app starts
**Then** no sample map is added.

**Given** the sample content and checklist text
**When** the hygiene check runs
**Then** it passes (English only)
**And** the checklist is reachable and operable by keyboard.

### Story 1.6: Verified baseline for the board requirements

As a maintainer,
I want each board requirement checked against the running app,
So that the remaining stories fix real gaps and nothing is rebuilt.

**Fulfills:** PRD Open Question 3 (verification of FR-8 to FR-11, FR-13 to FR-17, FR-23, FR-50; no feature work). **Baseline:** the code alignment review lists these as Met, Partial or Unverified without a live check.

**Acceptance Criteria:**

**Given** the FRs of this epic
**When** each is checked against the running app
**Then** a table records Met, Partial or Missing with a reproducible check per row
**And** the table is stored under `_bmad-output/planning-artifacts/`.

**Given** a row that is Met
**When** no automated test covers it
**Then** a test is added that fails when the behavior regresses.

**Given** a row that is Partial or Missing
**When** the table is complete
**Then** it names the story in Epics 2 to 8 that closes it
**And** no requirement is left without a story or a Met test.

## Epic 2: Project data you can trust

Every change to a Card is recorded, the Project keeps consistent versions, and the user can restore a restore point or keep a portable archive.

### Story 2.1: All-or-nothing changes attributed to an actor

As a user working with agents,
I want every change saved completely or not at all and attributed to who made it,
So that a failure never leaves half a change behind and the history names the actor.

**Fulfills:** FR-2, NFR-4, AD-3, AD-19 (cards repository). **Baseline:** `archiveCard`, `deleteCard` and `parkCard` run several updates plus a separate `logActivity` outside a transaction; `logActivity` hardcodes the actor; one 3,797-line repository; routes capture the repository once.

**Acceptance Criteria:**

**Given** `unitOfWork.run(actorContext, fn)` in `packages/db`
**When** a Card mutation (create, update, move, archive, delete, park, unpark, bulk update) runs
**Then** it executes in one SQLite transaction with a synchronous body and `Tx`-bound repositories
**And** the change, the Card Version and the Activity Event commit together or not at all.

**Given** a test that injects a failure after the first write of a mutation
**When** the mutation runs
**Then** no partial write and no Activity Event persists.

**Given** an `ActorContext` (actor type human, agent, github or system; actor id or MCP host; optional MCP session id)
**When** a mutation is called without one
**Then** it is rejected at compile time or by the repository
**And** no code defaults an actor, and existing routes pass the human actor explicitly.

**Given** a repository built from the root handle
**When** a write method is called outside a `Tx`
**Then** a test fails the call.

**Given** the `DatabaseHandle` holder
**When** a test replaces the handle
**Then** existing repositories use the new handle on their next call, and none captures a raw handle.

**Given** the change is complete
**When** the module layout is inspected
**Then** the cards repository is its own module of at most 750 lines
**And** a test asserts that no file outside `packages/db` imports `better-sqlite3` or `drizzle-orm`.

**Given** a mutation commits
**When** it rolls back instead
**Then** the after-commit hook (no subscribers yet) fires only on commit
**And** API behavior is unchanged, typecheck and tests pass.

### Story 2.2: Create and list restore points

As a user,
I want to create restore points and see them,
So that I can recover from mistakes.

**Fulfills:** FR-57 (create and list), AD-8 (snapshots). **Baseline:** no snapshots exist.

**Acceptance Criteria:**

**Given** a Project
**When** I choose "Create restore point" in the UI
**Then** the server writes a `manual` snapshot into `<project>/snapshots/` with `VACUUM INTO` to a temporary file that is renamed on success, taken by the write gate outside any transaction
**And** the file name carries class, timestamp and schema version.

**Given** the snapshot write fails
**When** the error occurs
**Then** no partial file remains and the message names the cause.

**Given** the Restore points list
**When** I open it
**Then** it shows class (`pre-migration`, `pre-restore`, `pre-apply`, `manual`), time, size and schema version, newest first.

**Given** retention of the newest 10 snapshots per class and a 1 GB cap [ASSUMPTION: values]
**When** they are exceeded
**Then** the oldest are deleted, the newest `pre-migration` and `pre-restore` stay pinned until a later one succeeds, and the cap never deletes the last snapshot of a class.

**Given** a test migration on a fixture database
**When** the migrator starts
**Then** it takes a `pre-migration` snapshot first and aborts when that fails.

**Given** the folder `snapshots/`
**When** the Project is committed to Git
**Then** a `.gitignore` inside it excludes its contents.

**Given** the 1,000-Card fixture
**When** a snapshot is taken
**Then** it completes within 1 second (budget test, 2x tolerance).

**Given** the capability list
**When** the use case is registered
**Then** it is marked human-only and no MCP tool exists for it
**And** the list and button are keyboard operable with English strings from the string module.

**Given** the Restore points list and the create action
**When** I use them
**Then** a status message ("Restore point created", or the failure cause) is announced through an always-mounted polite status region and an alert region introduced in this story
**And** the app has one global `:focus-visible` rule (2px outline, 2px offset, `focus-ring-light` on light and `focus-ring-dark` on chrome and filled controls) and no `outline: none` without a replacement
**And** input, select and textarea use the `border-input` token (UX-DR2, EXPERIENCE.md Accessibility Floor).

### Story 2.3: Version counters on every editable root

As a user editing alongside an agent,
I want every editable object to carry a version,
So that a later story can detect conflicting edits.

**Fulfills:** FR-47 and FR-59 (prerequisite), AD-7. **Baseline:** `updated_at` and `baseUpdatedAt`; `card_versions.version` is `rows.length + 1`; `ON DELETE SET NULL` from releases to cards; cascades from cards.

**Acceptance Criteria:**

**Given** Story Map, Card, Release, Persona and Roadmap
**When** the schema is updated
**Then** each has an integer `version` starting at 1.

**Given** a mutation that changes a root row or any owned child row or link (Card personas, annotations, Source Links; Roadmap columns, swimlanes, cards, references)
**When** it commits
**Then** the root's version increases by exactly 1 in the same transaction.

**Given** a sibling reorder
**When** a Card is moved
**Then** only the moved Card's version changes.

**Given** a Release is deleted
**When** its Cards are unassigned
**Then** explicit use-case code performs the unassignment and bumps their versions
**And** no `ON DELETE SET NULL` or `CASCADE` exists to or from a versioned root (schema test).

**Given** `card_versions`
**When** a Card changes
**Then** `card_versions.version` equals `cards.version` with a unique `(card_id, version)`
**And** the row-count logic is removed.

**Given** a Card changes
**When** the Story Map row is not edited
**Then** the Story Map version does not change.

**Given** the same actor saves a Card twice within 60 seconds
**When** the second save commits
**Then** `cards.version` increases by exactly 1 and the latest Card Version row is rewritten under the new version, no new row is added
**And** a save by a different actor always adds a version row (ADR 0002).

**Given** the contracts
**When** the change is complete
**Then** `baseUpdatedAt` no longer exists and `baseVersion` is the only concurrency token in the schemas
**And** table-driven tests cover the bump rule for each root.

### Story 2.4: Read a Card's history

As a user,
I want to see every version of a Card,
So that I know who changed what and when.

**Fulfills:** FR-47. **Baseline:** `card_versions`, `/api/cards/:id/history` exist; no UI check.

**Acceptance Criteria:**

**Given** a Card with three saved versions
**When** I open its History in the Card detail modal
**Then** three entries appear, newest first
**And** each shows version, actor type, actor id or host, time and the changed fields with before and after.

**Given** an entry by an agent
**When** it is shown
**Then** it is labeled as agent and shows the MCP session id when present.

**Given** a long description change
**When** the entry is shown
**Then** before and after are truncated with an expand control.

**Given** a Card with 200 versions
**When** the history opens
**Then** it loads paged and the first page renders within 300 ms.

**Given** the History panel
**When** I look for a restore action
**Then** none is offered (restoring a version is out of scope)
**And** the panel is keyboard operable with English strings from the string module.

### Story 2.5: Park, archive and delete as separate actions

As a user,
I want to park an Activity, archive a Card and delete a Card as three different actions,
So that I choose between hiding, keeping and removing.

**Fulfills:** FR-49. **Baseline:** park, unpark, archive and delete routes exist; UI wiring unverified.

**Acceptance Criteria:**

**Given** an Activity with children
**When** I choose Park
**Then** I am asked what happens to its children using the strategies the API supports
**And** the Activity leaves the board and appears in a Parked list.

**Given** a parked Activity
**When** I choose Unpark
**Then** it returns at the end of the board.

**Given** a Card that is not an Activity
**When** Park is requested
**Then** the request is rejected with a message that only Activities can be parked.

**Given** a Card
**When** I archive it
**Then** it is hidden from the board and excluded from reports, counts and Release summaries
**And** it can be restored from an Archived list
**And** parked Cards are excluded from reports as well. [ASSUMPTION]

**Given** a Card
**When** I choose Delete
**Then** a confirmation states what will be removed
**And** after confirming, the Card is permanently removed and an Activity Event is written.

**Given** any of the three actions
**When** it commits
**Then** it ran through the unit of work and bumped the affected versions
**And** all three are reachable in the UI, keyboard operable, with English strings from the string module.

**Given** the app
**When** a destructive or high-impact action needs confirmation
**Then** it uses one shared Dialog component that contains focus, makes the background inert, closes only the topmost layer on `Esc` and restores focus to the opener or its documented fallback
**And** confirms are `alertdialog` with the least destructive button focused first, named by title and consequence
**And** multi-way choices ("where do child Cards go") are radio buttons plus one confirm button named with the verb
**And** both `window.confirm` calls and the three home-made dialogs in `DiscoveryMatrix.tsx` are replaced (UX-DR1).

### Story 2.6: Restore the Project to a restore point

As a user,
I want to reset the Project to a restore point,
So that I can undo an unwanted agent session or edit.

**Fulfills:** FR-57 (restore), NFR-4, AD-8. **Baseline:** no restore exists. **Note:** until versioned migrations exist (Epic 8) only snapshots with the current schema version are accepted.

**Acceptance Criteria:**

**Given** a restore point
**When** I choose Restore
**Then** validation runs first: `PRAGMA integrity_check` passes and the schema version equals the application's, otherwise the restore is refused with the reason and nothing changes.

**Given** the restore starts
**When** new requests arrive
**Then** they receive 503 with an explanation
**And** in-flight use cases finish before the swap (test with a slow in-flight use case).

**Given** validation passed
**When** the swap runs
**Then** a `pre-restore` snapshot is taken first
**And** the connection is closed, the snapshot copied to `storymapper.sqlite.restoring`, `-wal` and `-shm` deleted and the file renamed over the database
**And** the database reopens through the `DatabaseHandle` so repositories work without a restart.

**Given** the restore completes
**When** `activity_events` and `change_sets` rows newer than the snapshot exist
**Then** they are copied into the restored database flagged `undone_by_restore`
**And** the database holds an `epoch` value created with it (in `project_settings`) that the restore regenerates
**And** a `project.restored` event records the new value.

**Given** a `.restoring` file remains at startup
**When** the server starts
**Then** it completes or rolls back deterministically and logs which.

**Given** the restore result
**When** it is shown
**Then** it lists GitHub links created after the snapshot and states that attachments were not deleted.

**Given** an agent calls the restore use case through `/api/mcp/call`
**When** it is checked
**Then** it is rejected as human-only.

**Given** the UI
**When** I confirm Restore
**Then** a dialog first states that everything since the restore point is undone and that a pre-restore point is created
**And** after the restore the app reloads.

**Given** a restore
**When** it finishes
**Then** the map equals the snapshot state and the Project accepts writes.

### Story 2.7: Portable Project archive

As a user,
I want to export a Project as one file and import it elsewhere,
So that I can back up and move my work without sharing secrets.

**Fulfills:** FR-46, AD-9 (archive), AD-14, AD-17. **Baseline:** `project-archive.ts` with a hardcoded four-table redaction list and `APP_VERSION = "0.1.0"`.

**Acceptance Criteria:**

**Given** one Project (disposable demo fixtures are enough; other Projects in a shared prototype DB need not be preserved or shipped)
**When** I export it
**Then** one archive file downloads containing that Project's redacted database snapshot, `documents/`, `attachments/`, `exports/` and a manifest with `formatVersion`, `schemaVersion` and the application version read from `package.json`
**And** no other logical Project is included.

**Given** the exported `redactedTables` list beside the schema
**When** the archive is built
**Then** connector, sync-run, conflict and link tables are redacted from it
**And** the hardcoded list and the hardcoded application version are gone.

**Given** the schema-classification test
**When** a table belongs to no aggregate row of the register
**Then** the test fails naming the table.

**Given** an archive
**When** a test scans it
**Then** it contains no secret value and no `snapshots/`, `logs/`, `.lock` or `.port`.

**Given** an archive with a supported format and schema version
**When** I import it
**Then** a new Project folder is published and the current one-process runtime hot-switches to it (drain, reopen through the holder) with all Story Maps, Cards, links and history intact
**And** an archive exported on one operating system imports on another
**And** a failed import leaves the previously open Project unchanged.

**Given** an archive with an unsupported format or schema version
**When** I import it
**Then** the import fails naming the supported versions and changes nothing.

**Given** the use cases
**When** they are registered
**Then** export and import are human-only, run through the API, and no MCP tool exists for them.

## Epic 3: Human and agent share one live map

The user works with an Agent from a coding CLI on the same map, sees its changes immediately, and controls what the Agent may do.

### Story 3.1: Contracts on zod 4 and the current MCP SDK

As a developer,
I want the contracts on zod 4 and the MCP layer on the maintained SDK line,
So that the new `/mcp` endpoint builds on supported packages.

**Fulfills:** AD-22 (zod and MCP part), AD-16. **Baseline:** zod ^3.24 in all packages (contracts about 1,600 lines), MCP SDK ^1.7 in `packages/mcp` (lockfile 1.29), 24 tools registered.

**Acceptance Criteria:**

**Given** the workspace
**When** the migration is done
**Then** every package uses zod ^4.2 and no zod 3 remains in the lockfile.

**Given** `packages/mcp` and the server MCP layer
**When** they move to `@modelcontextprotocol/server` and `@modelcontextprotocol/fastify` 2.x
**Then** the 24 tools register with the same names and input schemas (a test compares names and JSON schemas with a stored snapshot)
**And** the existing stdio entry point still starts and lists the same tools.

**Given** the existing test suites
**When** they run
**Then** they pass without behavior changes.

**Given** `pnpm audit`
**When** it runs after the migration
**Then** these packages add no critical or high advisory
**And** typecheck passes.

### Story 3.2: Only the own browser may address the server

As a user,
I want the local server to reject foreign pages and hosts,
So that another website cannot drive my Agentic Story Mapper.

**Fulfills:** FR-1, NFR-2, NFR-3, AD-13. **Baseline:** a CORS allowlist only; `STORYMAPPER_STRICT_LOCAL` guards non-loopback binding.

**Acceptance Criteria:**

**Given** any route (`/api`, `/health`, the served app)
**When** the `Host` header is not a loopback name with the served port
**Then** the server answers 403.

**Given** a request with an `Origin` that is not the served origin (in dev mode also the Vite origin)
**When** it arrives
**Then** the server answers 403
**And** a request without `Origin` passes.

**Given** a mutating request (POST, PUT, PATCH, DELETE)
**When** its content type is not JSON
**Then** the server answers 415, except on multipart upload routes and `DELETE /mcp`, which require the Origin check only.

**Given** the server configuration
**When** `HOST` is not loopback and `STORYMAPPER_ALLOW_REMOTE_HOST` is not `true`
**Then** the server refuses to start and names the variable
**And** with the variable set it starts and logs a warning
**And** `STORYMAPPER_STRICT_LOCAL` no longer exists in code, `.env.example` or docs.

**Given** a test with a network stub, `github` off and no agent connected
**When** the server runs
**Then** it makes no outbound request (no update check, telemetry or remote asset).

**Given** the rebinding tests
**When** a request carries `Host: evil.example:<port>` or `Origin: http://evil.example`
**Then** both are rejected.

### Story 3.3: Use-case layer for Story Map data

As a developer,
I want Story Map capabilities to be use cases shared by every adapter,
So that HTTP and MCP cannot drift apart.

**Fulfills:** FR-30 (prerequisite), AD-2, AD-16, AD-19. **Baseline:** `routes/index.ts` (1,270 lines) calls the repository directly; MCP handlers are separate code.

**Acceptance Criteria:**

**Given** use cases for Story Map, Card, Release, Persona, Source Document and ChangeSet capabilities in `apps/server/src/application/<aggregate>`
**When** an HTTP route handles a request
**Then** it only validates input with the contracts, resolves the `ActorContext`, calls the use case and maps errors.

**Given** each use case file
**When** it is inspected
**Then** it exports a descriptor `{name, kind: read | write | human-only, tool?, route?}`
**And** a script generates the capability manifest by scanning `application/**`.

**Given** typed `DomainError(code, details)` with codes enumerated in contracts (validation, not_found, conflict, disabled, protected, restoring, internal) and their HTTP statuses
**When** a use case fails
**Then** `toErrorResponse(error)` returns `{code, message, details?}`
**And** an unknown error returns 500 `internal` with a logged id and no message leakage.

**Given** a multi-step use case such as import
**When** some items fail
**Then** it returns a per-item result array and does not throw once for all.

**Given** the MCP tool handlers of these aggregates
**When** a tool and its route are called with the same input
**Then** both call the same use case and return equal results (test).

**Given** the HTTP test suite
**When** it runs
**Then** responses are unchanged except for the new error envelope, with each changed status listed in the story notes
**And** no touched file exceeds 750 lines.

### Story 3.4: Use-case layer for the remaining capabilities

As a developer,
I want the remaining capabilities behind use cases as well,
So that the routes file shrinks and every capability has one implementation.

**Fulfills:** FR-30 (prerequisite), AD-2, AD-19, AD-24. **Baseline:** Roadmaps, Annotations, Workflow Statuses, Story Templates, Product Context, reports, exports, connector connections and work-item sync are wired in `routes/index.ts`.

**Acceptance Criteria:**

**Given** the listed capabilities
**When** the story is done
**Then** each is a use case with a descriptor and `ActorContext`, and its routes are thin adapters split into route modules per aggregate.

**Given** reports (backlog health, source coverage, release summary and timeline)
**When** they run
**Then** the computations live as pure functions in `core` and the use cases only call them.

**Given** the exports (JSON, Markdown, CSV, audit)
**When** they are requested
**Then** they are generated server-side by export use cases.

**Given** the HTTP side of the manifest
**When** the parity test runs
**Then** every route resolves to a descriptor and every exported use case has a descriptor.

**Given** the routes
**When** file sizes are checked
**Then** no route or application file exceeds 750 lines
**And** the HTTP test suite passes with unchanged behavior.

### Story 3.5: Safety switches replace the privacy mode

As a user,
I want three clear switches that control agent access, GitHub and protection,
So that I decide what an Agent may do and see it at a glance.

**Fulfills:** FR-32, FR-36, NFR-3, AD-6. **Baseline:** `privacyMode` is stored and shown but not enforced; separate flags `github`, `mcpWrites`, `externalLlm`, `updateChecks`, `pushPreview`; MCP read and proposal tools are always on. **Note:** until Epic 4 the executor does not exist, so protection refuses writing tools instead of storing proposals.

**Acceptance Criteria:**

**Given** a Project
**When** its settings are read
**Then** they hold `agentAccess` (default on), `github` (default off) and `agentProtection` (default off)
**And** `privacyMode`, `mcpWrites`, `externalLlm`, `updateChecks`, `pushPreview` and every Strict Local wording are gone from schema, contracts, UI, audit export and docs.

**Given** `agentAccess` is off
**When** an agent tool call arrives on `/api/mcp/call` (later also `/mcp`)
**Then** it is rejected as `disabled` and logged.

**Given** `github` is off
**When** any GitHub use case is called by a human or an agent
**Then** it is rejected as `disabled`.

**Given** `agentProtection` is on
**When** an agent calls a writing tool (including GitHub push, import and sync)
**Then** it returns `protected` and writes nothing
**And** read and proposal tools still work.

**Given** the switches
**When** an agent tries to change them
**Then** the call is rejected, no tool for them exists and the settings use cases are marked human-only.

**Given** a write in flight
**When** protection is turned on between request entry and commit
**Then** the write is refused (the flag is read inside the transaction).

**Given** any switch change
**When** it is saved
**Then** an Activity Event names the actor.

**Given** every page
**When** it renders
**Then** the header shows the state of the three switches and the notice that an enabled Agent may forward retrieved context to its own provider
**And** the switches are editable in a settings panel that is keyboard operable with English strings from the string module.

**Given** a request
**When** its actor is resolved
**Then** the actor is `agent` only if it arrived on `/mcp` or `/api/mcp/call`, otherwise `human` (test).

**Given** the switch strip
**When** it renders
**Then** each pill is a button named like `Agent access: On. Open switch settings` and the settings dialog holds three real switches with their consequence sentences
**And** Agent protection uses a shield icon and no warning tone
**And** a switch changed from another tab or by the Project is announced through the status region (UX-DR3).

### Story 3.6: `/mcp` on the app port and a stdio bridge

As a user with a coding CLI,
I want the CLI to reach Agentic Story Mapper over the app's own port,
So that agent and UI use one process.

**Fulfills:** FR-34, AD-12 (transport), AD-13. **Baseline:** `stdio-main.ts` starts a second process on the same SQLite file; `/api/mcp/host-configs` emits `corepack pnpm --dir` commands.

**Acceptance Criteria:**

**Given** the server is running
**When** an MCP client connects to `http://127.0.0.1:<port>/mcp` over Streamable HTTP
**Then** a stateful session with an `Mcp-Session-Id` is created, tools are listed and calls succeed
**And** a call without a valid session id is rejected and `DELETE /mcp` ends the session.

**Given** `agentAccess` is off
**When** a client calls `/mcp`
**Then** it is rejected
**And** the Host and Origin hook of Story 3.2 applies to `/mcp`.

**Given** a stdio-only host
**When** it launches the bridge script
**Then** the bridge forwards to `/mcp`, keeps the `Mcp-Session-Id` as its only state, re-initializes on a 404 and finds the port from `<project>/.port`.

**Given** the server starts and stops
**When** it does
**Then** it writes `<project>/.port` at start and removes it at shutdown.

**Given** the MCP panel
**When** I copy the configuration for Claude, Cursor or VS Code
**Then** it works without editing paths, including when the default port was taken and another port is in use.

**Given** the old separate stdio server entry
**When** the story is done
**Then** it is removed
**And** an SDK-client test lists the same tools as the manifest.

### Story 3.7: Complete MCP tool surface

As a user working through an Agent,
I want every capability of the UI to be available to the Agent,
So that I can instruct changes from the terminal instead of clicking.

**Fulfills:** FR-30, AD-2. **Baseline:** 24 tools; none for Story Map creation, Roadmaps, Annotations, Workflow Statuses, Story Templates, Source Document import and reading, reports, exports or ChangeSet listing.

**Acceptance Criteria:**

**Given** the capability manifest
**When** a use case is `read` or `write` and not on the human-only list
**Then** a tool exists for it, including create Story Map, Roadmaps and children, Annotations, Workflow Statuses, Story Templates, Source Document import and read, reports, exports, ChangeSet listing and applying an already human-approved ChangeSet.

**Given** the human-only list
**When** it is documented
**Then** it names the safety switches, connector credentials, ChangeSet approval and rejection, restore, restore points on demand and archive import and export.

**Given** `docs/mcp-tools.md`
**When** the build runs
**Then** it is generated from the manifest
**And** a test fails when it differs from the registered tools.

**Given** the parity test
**When** a use case has no descriptor, a `write` use case has no tool and is not human-only, or a route or tool resolves to no descriptor
**Then** the test fails
**And** the check for operation-registry membership is listed as a known gap to be emptied in Epic 4.

### Story 3.8: Record every tool call

As a privacy-minded user,
I want every agent tool call recorded and filterable,
So that I can see exactly what the Agent did.

**Fulfills:** FR-33, FR-37, AD-6, AD-24. **Baseline:** only an input hash is recorded; audit routes and export exist.

**Acceptance Criteria:**

**Given** any tool call, reads included, on `/mcp` or the HTTP tool-call route
**When** it completes
**Then** an Activity Event `tool_call` records host, session id, tool, input hash, output hash, outcome (ok, rejected, error) and affected ids.

**Given** a rejected call
**When** it happens
**Then** the event records the outcome and the reason.

**Given** the audit area
**When** I filter by actor type and tool name
**Then** only matching events appear, paged.

**Given** the audit export (JSON and Markdown)
**When** I export
**Then** it lists tool calls, GitHub writes and agent writes with actor, time and affected objects
**And** it contains no secret and no full payloads.

**Given** 1,000 recorded calls
**When** the audit list loads
**Then** the first page renders within 300 ms.

**Given** a burst of 100 read calls within one second
**When** they are recorded
**Then** each adds one insert only and the audited 100-call burst completes within one second.
**And** relative latency versus identical unaudited execution is recorded for diagnostics, not used as an acceptance threshold (user-approved relaxation, 2026-10-09).

### Story 3.9: One writer, health and orderly shutdown

As a user,
I want the app to refuse a second writer and to shut down cleanly,
So that my project file is never corrupted.

**Fulfills:** AD-12, NFR-4. **Baseline:** no lock, no health beyond `/health`, no log rotation; scripts in `tools/` may write Agentic Story Mapper data.

**Acceptance Criteria:**

**Given** a Project folder in use
**When** a second server starts on it
**Then** it refuses and names the PID and start time from `<project>/.lock`
**And** a lock of a dead PID is taken over with a log entry.

**Given** the database connection
**When** it opens
**Then** `busy_timeout` and WAL auto-checkpoint are set (test reads the pragmas).

**Given** `GET /api/health`
**When** called
**Then** it returns version, schema version, epoch, write-gate state and pending migration
**And** `doctor` reports it when a server runs.

**Given** logs
**When** the server runs
**Then** they go to `<project>/logs/` with size rotation (5 files of 10 MB) [ASSUMPTION: sizes]
**And** contain no secret and no personal path.

**Given** SIGINT or SIGTERM
**When** the server stops
**Then** it stops accepting, drains in-flight work, closes streams, checkpoints, closes the database and removes `.lock` and `.port`
**And** a test finds no leftover `-wal` and no lock afterwards.

**Given** scripts in `tools/` and skills
**When** they touch Agentic Story Mapper data
**Then** they use the HTTP API and none opens the SQLite file (test scans for direct SQLite use).

**Given** the map read on the 1,000-Card fixture
**When** it runs
**Then** the health endpoint still answers within 200 ms.

### Story 3.10: Live board updates

As a user,
I want the board to update by itself when an Agent changes something,
So that I always see the current map.

**Fulfills:** FR-58, AD-11. **Baseline:** no event stream; Activity Event ids are UUIDs.

**Acceptance Criteria:**

**Given** `activity_events`
**When** the schema is updated
**Then** `seq` is an integer autoincrement assigned inside the transaction.

**Given** `GET /api/events` with `Accept: text/event-stream`
**When** a transaction commits
**Then** one message with id `<epoch>:<seq>` is sent listing `{entityType, entityId, version}` tuples and the `originClientId`, never content
**And** a request without that `Accept` header is rejected.

**Given** a client reconnects with `Last-Event-ID`
**When** the epoch matches
**Then** missed events replay in order
**And** with a different epoch the client receives `reset` and refetches.

**Given** an Agent commits a change
**When** a View is open
**Then** it updates within 2 seconds without reload (test with two clients).

**Given** the web app sends its own mutation
**When** its own event returns
**Then** an editor holding unsaved text is not reset
**And** invalidations are coalesced over 100 ms so a 30-operation change causes at most one refetch per query.

**Given** the stream
**When** it is idle
**Then** it sends a heartbeat every 15 seconds and closes on server shutdown.

**Given** six tabs of one browser profile
**When** they are open
**Then** one stream is held per profile (BroadcastChannel leader) and API calls are not starved.

**Given** a restore completes
**When** clients receive `reset`
**Then** all open Views reload.

**Given** a dialog, popover, drag or text field has focus
**When** an update arrives
**Then** board-shape changes are queued, a "N changes waiting" line shows, and they apply when it closes
**And** a "Hold updates" toggle in the header does the same on demand.

**Given** the focused tile would move or disappear because of an update
**When** the update applies
**Then** focus is not moved and the change is held until focus leaves the tile.

**Given** a change by an Agent, GitHub sync or another tab
**When** it lands
**Then** at most one coalesced status message per 5 s is announced ("30 cards changed by Claude Code. Open What changed.") and the user's own event echo is not announced (UX-DR4).

### Story 3.11: Concurrent edits never lose data silently

As a user editing while an Agent works,
I want a conflicting save to be rejected with the current state,
So that neither of us overwrites the other unnoticed.

**Fulfills:** FR-59, NFR-4, AD-7. **Baseline:** last write wins; `baseUpdatedAt` exists only in ChangeSet operations.

**Acceptance Criteria:**

**Given** an update, move, archive or delete command for a versioned root over HTTP or MCP
**When** it carries no `baseVersion`
**Then** it is rejected as a validation error.

**Given** a command whose `baseVersion` equals the current version
**When** it runs
**Then** it applies and returns the new version.

**Given** a stale `baseVersion`
**When** the command runs
**Then** the answer is HTTP 409 `{code: "conflict", conflicts[]}` listing each conflicting object with its current state
**And** nothing is applied.

**Given** an edit form in the UI (Card modal, Release panel, Persona and Roadmap editors)
**When** a conflict occurs
**Then** the user sees the conflict with reload and resubmit options and the typed text is preserved.

**Given** an MCP tool
**When** a conflict occurs
**Then** it returns the same shape so the Agent re-reads before retrying.

**Given** a bulk action over many Cards
**When** any Card conflicts
**Then** the whole action aborts and lists all conflicts, with nothing applied.

**Given** a race test between a human save and an Agent save on one Card
**When** it runs
**Then** exactly one succeeds and the other receives the conflict.

**Given** a Card modal or panel with a dirty field
**When** a live update changes the Card
**Then** no dirty field is replaced, the unsaved-changes dialog stays open, and the modal shows "This Card changed. Reload / Keep mine" as an alert with the typed text kept (test with two clients editing different fields) (UX-DR4).

### Story 3.12: Persisted Product Context and templates as MCP prompts

As a user,
I want my Product Context and function templates stored and offered to Agents,
So that agents work from my context with my templates.

**Fulfills:** FR-35, AD-23, AD-22 (removal of `packages/ai`). **Baseline:** product context GET and PATCH exist; templates are hard-coded in `routes/index.ts` and `packages/ai`, which is unused and depends on the `ai` npm package.

**Acceptance Criteria:**

**Given** the Product Context form (type, purpose, key features; optional users, platform, glossary, non-goals)
**When** I save it
**Then** it persists and is returned by the route and the read tool.

**Given** the table `ai_function_templates` in the Customization aggregate
**When** a Project is created
**Then** default templates are seeded from `core`
**And** when I create, edit or delete a template in the UI, the change persists.

**Given** an MCP host
**When** it calls `prompts/list` and `prompts/get`
**Then** each template appears as a prompt with its instructions, arguments and the Product Context filled in.

**Given** the deterministic proposal generators
**When** they move into `core`
**Then** `ProposeMapFromSourceDocument`, `ProposeBacklogGrooming` and `ProposeReleaseSlice` behave as before (existing tests)
**And** the copies in the routes are removed.

**Given** `packages/ai` and the `ai` npm package
**When** the story is done
**Then** both are removed with their path mappings
**And** no LLM SDK remains in any `package.json`
**And** every template output remains a ChangeSet proposal and never a direct write.

## Epic 4: Agents cut and publish, humans review

A BMad cut, or a cut made from the terminal, arrives as a reviewed story map with a preview before applying, idempotent re-runs and delivery status from the Agent.

**Shared execution contract (2026-10-10):** New command ChangeSets with `apply=true` may execute without approval while protection is off. Proposal generators always store proposals. Previously stored proposals need human approval by default; optional Agent approval is governed by the Story 4.6 flag policy. Create/propose and apply remain distinct audited actions even within one request. Disabled Agent/GitHub access still refuses calls; protection changes domain writes into proposals. GitHub push retains a human-confirmed Dry Run.

**Shared integrity contract:** Preview resolves operations sequentially on a server snapshot, including earlier simulated changes; apply resolves again under the write gate. Selected existing roots are checked against transaction-start versions, not against earlier writes in the same batch. Invalid/conflicting selected operations abort the whole apply. Dependency deselection is transitive. Approval binds immutable operations and selection; changing either requires fresh approval. Preview/apply equality compares semantic state for unchanged input/state, normalizing allocated ids, Card Keys and timestamps.

**Shared scope contract:** Source Documents, existing Card links, View Settings and existing map-copy/board-import domain effects must be covered, in addition to the object families named below. Project/settings/credentials, restore/archive lifecycle, proposal lifecycle, confirmed remote push and audit/sync bookkeeping are explicitly classified exceptions, not recursively proposed domain operations. AI function template editing remains human-only as in Story 3.12. No tool or registry entry authorizes core to read host files.

**Budget evidence:** Apply timing includes pre-apply snapshot, database/history and audit, on the 1,000-Card fixture with 200 operations, using the recorded 2-second nominal/2x CI tolerance. Run it serially; preview's 500 ms and bulk status's 2 seconds are separate server-call measurements. Retain failed measurements and introduce no relative-overhead gate.

**Execution dependencies:** Epic 3 supplies verified shared use cases, versions, audit, restore and live events. 4.1 precedes 4.2; 4.3 precedes 4.4 → 4.5 → 4.6 → 4.7 → 4.8 → 4.9; 4.10 and 4.11 require 4.7; 4.12 requires 4.1–4.3 and 4.8–4.11; 4.13 requires 4.12. Until 4.7 the known direct Agent-write gap remains staged. No story requires Epic 5 views/drift reports or Epic 7 GitHub identity migration.

### Story 4.1: Import Markdown and TXT sources with stable chunks

As a user,
I want to import requirement documents and get stable, locatable chunks,
So that Cards can point exactly to where a requirement came from.

**Fulfills:** FR-19, AD-22 (importers). **Baseline:** Markdown and TXT importers exist with tests; DOCX, PDF, XLSX and image importers are stubs; `mammoth`, `pdf-parse` and `xlsx` are unused dependencies; duplicate behavior on re-import is unverified.

**Acceptance Criteria:**

**Given** a Markdown file with headings, paragraphs, lists and tables
**When** I import it
**Then** a Source Document and Source Chunks exist, each with a locator (file, heading path, paragraph index)
**And** a TXT file is chunked by paragraph.

**Given** the same document identity and content
**When** chunking is repeated
**Then** the locators and chunk ids derived from document id and locator are identical (test).

**Given** identical input imported into two different Projects
**When** each Project stores its Source Document
**Then** document and chunk identities are distinct between Projects
**And** locators are identical and each chunk belongs only to its owning document and Project.

**Given** a file whose type and content hash equal an existing Source Document in the same Project
**When** I import it again
**Then** nothing is created and the answer says "unchanged".

**Given** a file whose content differs
**When** I import it
**Then** a new Source Document is created and the earlier one and its Source Links stay untouched.

**Given** a file of another type
**When** I import it
**Then** the import is rejected with a message listing the supported types.

**Given** the importer package
**When** the story is done
**Then** the DOCX, PDF, XLSX and image stubs and the three dependencies are removed from code, `package.json` and the lockfile
**And** the importer interface for Markdown and TXT remains
**And** the import works from the UI and from the use case.

**Given** unchanged imports, nested/repeated Markdown headings, lists, tables and fenced blocks
**When** import tests run
**Then** concurrent re-imports in one Project return the existing document/chunks, with no duplicates
**And** locators retain heading paths and stable block indices; headings inside fenced code are content, and LF/CRLF inputs are covered
**And** the MCP path remains inline-content-only; human file preparation stays outside SQLite transactions.

### Story 4.2: Provenance on every Card

As a user,
I want every Card to show where it came from,
So that I can trust and check what agents produced.

**Fulfills:** FR-20. **Baseline:** Source Link routes and `card_source_links` exist; provenance display and inference marking do not.

**Acceptance Criteria:**

**Given** a Card and a Source Chunk, a GitHub Issue or a note
**When** I link them in the UI or through the use case
**Then** a typed Source Link is stored as a chunk reference, existing structured GitHub Issue reference, or nonblank free-text origin note
**And** chunk references belong to the Card's Project; origin notes are not interpreted as host paths.

**Given** a Card with Source Links
**When** I open its detail
**Then** it states the provenance, for example "from Requirements.md, section 3.2" or "GitHub #14".

**Given** a Card created by an Agent or a Proposal without a Source Link
**When** it is stored
**Then** it carries `provenance = inference` and shows an "Inferred" badge that does not rely on color alone
**And** adding a Source Link sets `provenance = linked`.

**Given** a Card created by a human without a Source Link
**When** it is stored
**Then** it carries `provenance = manual`.

**Given** the change
**When** typecheck and tests run
**Then** they pass with English strings from the string module.

**Given** the final Source Link is removed
**When** provenance changes
**Then** `manual` or `inference` derives from recorded creation origin, not the actor removing the link.

**Given** existing Cards
**When** provenance is migrated
**Then** linked Cards retain their evidence; unlinked origin uses recorded creation evidence, and absent historical evidence displays "Origin not recorded" rather than an invented human/Agent origin.

### Story 4.3: External references on Cards, Releases and Personas

As an Agent operator,
I want objects to carry a reference to their source,
So that an Agent can update them again without creating duplicates.

**Fulfills:** FR-52 (storage), AD-10. **Baseline:** none. **Note:** moving GitHub identity into this table is done in Epic 7; here `github` is only reserved.

**Acceptance Criteria:**

**Given** the table `external_refs(id, entity_type, entity_id, system, external_id, scope_id NOT NULL, synced_version, created_at)`
**When** it is created
**Then** it has unique `(scope_id, entity_type, system, external_id)` and unique `(entity_type, entity_id, system)`
**And** `scope_id` is the Story Map id, or the Project id for project-level Personas.

**Given** a Card, Release or Persona
**When** a reference with system `[a-z0-9-]+` and a trimmed, case-sensitive id is set
**Then** it is stored
**And** an identical repeated set is unchanged; a different reference of the same system on the same entity, or the same scoped key on another entity, is rejected
**And** the real owner/scope is validated and the initial baseline is the entity version at reference creation; subsequent apply advances only the addressed system's baseline.

**Given** the system `github`
**When** a caller other than the GitHub adapter sets it
**Then** it is rejected.

**Given** an entity is deleted
**When** the deletion commits
**Then** its references are deleted in the same transaction
**And** archiving keeps them.

**Given** a Card, Release or Persona with a reference
**When** it is shown
**Then** a badge names system and id
**And** searching for `system:id` finds it.

**Given** the use cases
**When** they are registered
**Then** they run through the unit of work with an `ActorContext`.

### Story 4.4: Operation registry for the core objects

As a developer,
I want one typed definition for every change an Agent can propose,
So that preview and apply cannot disagree.

**Fulfills:** FR-31, FR-51 (prerequisite), AD-5, AD-1 (purity). **Baseline:** `changeOperationSchema` with `z.unknown()` payloads; `applyChangeSet` whitelists five operation keys; hierarchy rules exist twice (`assertParentAllowed` and `core/hierarchy.ts`).

**Acceptance Criteria:**

**Given** `ChangeOperation` in contracts
**When** it is defined for Story Map, Card, Release, Persona, Source Link (link and unlink) and `upsert` by external reference
**Then** it is a discriminated union on `(op, entity)` with a typed payload per member and optional `sources` and `rationale`
**And** a schema test finds no `z.unknown()` payload among these members.

**Given** each member
**When** it is inspected
**Then** `core` provides exactly one `describe(snapshot, op)` and one `resolve(snapshot, op)`, both pure
**And** `core` imports no `node:*` module and calls no `Date`, `Math.random` or `crypto` (Clock and IdSource injected)
**And** golden tests cover every member.

**Given** hierarchy validation and sibling positioning
**When** the core registry is implemented
**Then** `resolve` covers their existing semantics with golden tests
**And** replacement of the existing persistence paths and deletion of duplicate domain logic belong to Story 4.6, after the executor exists.

**Given** a preview of a created Card
**When** it is shown
**Then** it carries the placeholder key `NEW-n`
**And** real keys come from `story_maps.next_card_number` at apply and are never reused.

**Given** an `upsert` by external reference
**When** it resolves
**Then** it becomes create or update and the preview marks it "may change"
**And** an archived target resolves to update plus an implicit unarchive shown in the preview.

**Given** an unknown parent, Release or reference
**When** `resolve` runs
**Then** it fails with a validation error naming the operation.

**Given** the dependents rule
**When** an operation is deselected
**Then** every later operation that references its local id or addresses the same entity or a descendant is deselected with it (test).

**Given** the registry catalog
**When** each supported `(op, entity)` is checked
**Then** its selector, payload fields, versioned owner, dependencies and validation failures are specified; unsupported pairs fail
**And** local ids are unique and reference only earlier operations; persisted identities take precedence, and aliases never bypass real Project/map/source ownership.

### Story 4.5: Operation registry for the remaining objects

As a developer,
I want every other writable object covered by the registry,
So that no tool has to bypass ChangeSets.

**Fulfills:** FR-30, FR-31, AD-5. **Baseline:** Roadmaps and children, Annotations, Workflow Statuses, Story Templates, Product Context, attachments, parking and reordering are outside the ChangeSet vocabulary.

**Acceptance Criteria:**

**Given** the union of Story 4.4
**When** it is extended
**Then** it covers Roadmap and its columns, swimlanes, cards and references, Annotation, Workflow Status, Story Template, Product Context, attachment, park and unpark, archive and unarchive, external reference set and unset, bulk status by external reference, reorder and delete with child strategy
**And** each member has typed payloads and one `describe` and one `resolve` with golden tests.

**Given** `ChangeSet` rows
**When** they are stored
**Then** each carries `operationsSchemaVersion`
**And** a version-changing migration marks incompatible pending rows, including approved rows, `stale`, while applied history remains retained
**And** schema-stale rows cannot be partially applied; current-schema resubmission and fresh approval are required.

**Given** the parity test
**When** it runs
**Then** it lists every write use case still without a registry member
**And** the list is empty for the objects covered here.

**Given** the manifest and aggregate register
**When** coverage is checked
**Then** Source Document import (including derived chunks), Card-Persona/Card-Annotation links, View Settings and existing copy/import domain operations are covered
**And** lifecycle, human-only administration, remote push and audit/sync bookkeeping exceptions are named explicitly instead of recursively requiring registry members
**And** new Card dependency storage/operations remain in Story 5.1; parity covers the currently exposed capabilities, not future Epic 5 behavior.

### Story 4.6: ChangeSet executor

As a user,
I want ChangeSets to apply atomically with a restore point and conflict checks,
So that agent changes are safe and reversible.

**Fulfills:** FR-31, FR-57 (pre-apply), NFR-4, AD-4, AD-6, AD-7, AD-8. **Baseline:** approve, reject and apply routes exist; the executor is a whitelist in the repository.

**Acceptance Criteria:**

**Given** a ChangeSet with `apply=true` and `agentProtection` off
**When** it executes
**Then** the write gate first creates a `pre-apply` restore point outside any transaction
**And** all operations apply in array order in one unit-of-work transaction that bumps versions and writes Card Versions and one Activity Event per operation plus `changeset.applied`.

**Given** operation k fails
**When** the ChangeSet executes
**Then** nothing is applied and the restore point remains.

**Given** the registry and executor are integrated
**When** human use cases, UI drag commands and ChangeSet apply change hierarchy or sibling positions
**Then** all use the core resolution rules
**And** `assertParentAllowed` and duplicated repository position semantics are removed; repositories persist resolved changes only.

**Given** touched objects
**When** their `baseVersion` differs from the state before the ChangeSet started
**Then** the ChangeSet gets status `conflict` and the result lists every conflicting operation
**And** nothing is applied
**And** upserts use `synced_version` as their base.

**Given** operations deselected by id
**When** the ChangeSet applies
**Then** they and their dependents are skipped and the rest applies.

**Given** an applied `upsert` by external reference
**When** it commits
**Then** `external_refs.synced_version` equals the entity's version afterwards.

**Given** the approval rules
**When** a ChangeSet is approved
**Then** `proposedBy` and `approvedBy` are stored
**And** the local human may approve its own UI-generated proposal
**And** approval is human-only by default; a human-controlled Project flag `allowAgentApproval` (default `false`) can explicitly permit Agent approval
**And** reject remains human-only; changing `allowAgentApproval` remains human-only and audited
**And** `proposedBy` and `approvedBy` retain actual actor type/id, host and session; callers cannot claim a human approver through tool payloads.

**Given** the new approval flag
**When** Story 4.6 is implemented
**Then** contracts, versioned migration, settings use cases, settings UI and conditional `ApproveChangeSet` MCP capability agree on the default and current Project policy
**And** disabled Agent access or a false flag refuses Agent approval; the flag and actual Project ownership are checked inside the approving transaction
**And** changing the flag creates Activity evidence and its value is visible in the Agent settings.

**Policy scope:** This Story 4.6 flag supersedes the earlier always-human-only approval rule; historical Epic 3 criteria describe the previously delivered baseline. Rejection and settings do not gain Agent tools.

**Given** `allowAgentApproval=true`
**When** an admitted Agent approves its own or another actor's proposed ChangeSet
**Then** approval succeeds with the actual Agent identity recorded, including while `agentProtection` is on
**And** approval changes no proposed domain rows and creates no pre-apply restore point.

**Given** an approved ChangeSet
**When** an Agent calls `ApplyChangeSet`
**Then** the executor accepts approval recorded from a human or an Agent authorized at approval time
**And** current `agentAccess` must be on and current `agentProtection` must be off; Agent approval never overrides protection
**And** a human can apply an approved proposal while protection is on.

**Given** `allowAgentApproval` is switched off before an Agent approval transaction
**When** approval runs
**Then** it is refused and audited; earlier approval records are preserved, not silently undone
**And** tests cover all four approval-flag/protection combinations, own and other-actor proposals, real MCP/HTTP actor identity and flag flips under the write gate.

**Given** a flag flip
**When** protection is turned on between approval and apply
**Then** the flag read inside the transaction blocks the agent-triggered apply (test).

**Given** two proposals that touch the same external reference
**When** the second is stored
**Then** a warning names the first.

**Given** the 1,000-Card fixture
**When** a 200-operation ChangeSet applies
**Then** it completes within 2 seconds (budget test, 2x tolerance).

**Given** file-coupled import or attachment operations
**When** they apply
**Then** file preparation/validation precedes the SQLite transaction; preparation failure changes no domain data
**And** SQLite domain rows, versions/history, operation Activity and successful mutation audit commit together; audit failure rolls them back
**And** database failure leaves no visible document/attachment links; retained prepared-file effects are reported explicitly, not claimed rolled back
**And** remote writes stay outside the atomic SQLite operation array under AD-3.

**Given** multiple operations on one root, or a newly created local root
**When** conflict checks run
**Then** existing roots compare only against transaction-start versions and every conflicting operation id/index is returned; new roots have no persisted baseline
**And** only the addressed external system's `synced_version` advances.

**Given** invalid deselection ids, an empty selection, or an applied/restore-undone ChangeSet replay
**When** application is requested
**Then** invalid ids and replay are refused without domain effects; an empty selection makes no domain changes and no restore point.

### Story 4.7: Writing agent tools run through ChangeSets

As a user,
I want every agent write to be a ChangeSet,
So that protection, preview, audit and restore points work for all of them.

**Fulfills:** FR-30, FR-32, FR-59, AD-4, AD-6. **Baseline:** write tools use the shared application use cases, which still perform direct transaction-bound repository writes; GitHub import and sync can change Cards outside ChangeSets; protection refuses writes (Story 3.5).

**Acceptance Criteria:**

**Given** every writing MCP tool except the human-only ones and GitHub push
**When** it is called
**Then** it builds a ChangeSet and hands it to the executor
**And** a test proves no tool handler calls a repository write method.

**Given** a writing tool
**When** it is called with `apply=false`
**Then** a `proposed` ChangeSet is stored and the answer returns its id and a preview reference
**And** `apply` defaults to `true`.

**Given** `agentProtection` on
**When** a writing tool is called
**Then** it behaves as `apply=false` and stores a proposal
**And** this replaces the `protected` refusal of Story 3.5, with its tests updated.

**Given** GitHub import and pull-sync
**When** they run
**Then** their local half is a ChangeSet with actor `github` that takes a restore point and bumps versions
**And** when an Agent triggered it under protection, it is stored as a proposal.

**Given** GitHub push
**When** an Agent triggers it under protection
**Then** it is refused as `protected` and never applied without a human-confirmed Dry Run.

**Given** version conflicts and sync conflicts
**When** either occurs
**Then** both are reported as one `ConflictReport` contract.

**Given** the parity test
**When** it runs
**Then** every write use case has a registry member and the known-gap list of Story 3.7 is empty.

**Given** real `/mcp` and `/api/mcp/call` requests
**When** write-routing acceptance runs
**Then** persisted ChangeSets, correct host/session, proposals under protection, flag changes during provider awaits, conflicts and rollback are verified on both surfaces
**And** proposal generators and `ApplyChangeSet` do not recursively wrap themselves in new ChangeSets; handler source inspection alone is insufficient.

### Story 4.8: An Agent submits its own ChangeSet

As an Agent operator,
I want an Agent to submit a whole cut as one ChangeSet,
So that I can review it once instead of edit by edit.

**Fulfills:** FR-51. **Baseline:** proposal tools generate ChangeSets from source documents only.

**Acceptance Criteria:**

**Given** a submission with Cards of all levels and parent relations by ChangeSet-local reference, Releases with Card assignment, Personas and Source Links
**When** an Agent submits 200 Cards
**Then** exactly one ChangeSet is created
**And** with `apply=false` or protection on it applies nothing.

**Given** a submission with an unknown parent or Release, a forward reference or a duplicate local id
**When** it is submitted
**Then** the whole submission is rejected and the answer names the offending operation by index.

**Given** a submission
**When** it is stored
**Then** the Agent host and MCP session id are recorded as actor.

**Given** the submission tool
**When** it is registered
**Then** it appears in the capability manifest and the tool documentation.

**Given** a valid submission
**When** `apply` is omitted
**Then** the command default is `true`; operations/source/rationale are preserved, actual owners are authorized, and one protected proposal creates no Card/domain rows or restore point.

### Story 4.9: Preview a ChangeSet on the board

As a user,
I want to see a proposed change on the board before it applies,
So that I can judge and adjust it in the place I know.

**Fulfills:** FR-53, AD-4. **Baseline:** no preview exists; the UI lists ChangeSets only.

**Acceptance Criteria:**

**Given** a stored ChangeSet
**When** I call `GET /api/changesets/:id/preview`
**Then** the server returns per-operation status and resulting state computed against the current database
**And** the web app never computes a preview itself.

**Given** I open a proposed ChangeSet
**When** the board shows it in the Tree and Planning Views
**Then** added, changed, moved and removed Cards are marked in place, with markers that do not rely on color alone
**And** Release operations show as swimlanes in the Planning View.

**Given** the preview
**When** I deselect an operation
**Then** its dependents are deselected too
**And** applying skips them.

**Given** an `upsert`
**When** it is shown
**Then** it is marked "may change".

**Given** a fixture ChangeSet
**When** it is applied
**Then** the resulting state equals its preview (test)
**And** a preview of 200 operations returns within 500 ms.

**Given** approve and apply
**When** I use them
**Then** human controls remain available; Agent approval follows `allowAgentApproval` and Agent apply remains blocked by protection
**And** after applying the board updates through the event stream
**And** directly applied ChangeSets remain reviewable through the Activity Log.

**Given** a marker, a violation or a conflict
**When** it is drawn
**Then** it follows the state-cue table of `DESIGN.md` (word, glyph, color; added, changed, moved, removed, conflict) on an opaque pill, and removed Cards stay visible struck through
**And** the glyphs are `aria-hidden` and the words are read.

**Given** a ChangeSet
**When** its status is shown
**Then** the words are Proposed, Approved, Applied, Rejected, Discarded, Stale or Conflict
**And** a failed apply shows that nothing was applied and the cause, and the ChangeSet stays open.

**Given** `?preview=<id>` names a ChangeSet that was applied, discarded or never existed
**When** the page opens
**Then** a callout says so with a link to Activity and the parameter is dropped (UX-DR5, UX-DR6).

**Given** a preview selection and unchanged database state
**When** the same selection applies
**Then** semantic state matches after normalizing allocated ids, real Card Keys and timestamps.

**Given** an incoming edit, incompatible operation schema or non-Card operation
**When** review continues
**Then** incoming edits invalidate the displayed preview/approval and apply reports conflicts; incompatible schemas require resubmission
**And** every non-Card operation has labelled before/after and selection controls in the review list, without requiring Epic 5 views
**And** no conflicting operation is skipped without explicit deselection/resubmission.

### Story 4.10: Slicing proposals and release notes

As a Product Owner or tech lead,
I want proposed slices and generated release notes,
So that I get a starting cut and a summary without writing them.

**Fulfills:** FR-25, AD-23. **Baseline:** `ProposeReleaseSlice` exists; release notes do not.

**Acceptance Criteria:**

**Given** a Story Map
**When** I or an Agent request the built-in happy path or submit a BMad-supplied slice through generic ChangeSet tools
**Then** a ChangeSet proposal with rationale is stored and nothing is written directly
**And** built-in happy path retains the existing first-12-visible-Stories heuristic with stable position/id ordering
**And** BMad supplies Persona, technical foundation and theme cuts as generic Release/assignment operations; the product adds no strategy engine or BMad parser
**And** the caller chooses an existing target Release or explicitly requests a new one; the first Release is never chosen silently.

**Given** a Release
**When** I generate release notes
**Then** a Markdown summary of its completed Cards grouped by Activity is produced
**And** Notes and archived Cards are excluded
**And** completed means configured Workflow Status group `done`; visible Stories are grouped by ancestor Activity with an unassigned group, ordered by position/id, and include Card Key and title
**And** release notes are read-only output, not a Card or Release mutation.

**Given** the same input
**When** slices or notes are generated twice
**Then** the output is identical (deterministic).

**Given** a Release with no completed Card
**When** I generate notes
**Then** a clear message says so.

**Given** the feature
**When** it is registered
**Then** it is available in the UI and as tools, with English strings from the string module.

### Story 4.11: Delivery status from Agents

As an Agent operator,
I want an Agent to set the status of many Cards by reference in one call,
So that the board shows the delivery state of my planning method.

**Fulfills:** FR-56. **Baseline:** Workflow Status routes exist; no bulk update by reference.

**Acceptance Criteria:**

**Given** external references and target statuses for up to 100 Cards
**When** the Agent calls the status tool
**Then** all update atomically as one ChangeSet
**And** each Card gets its own Activity Event.

**Given** a reference that does not resolve
**When** the call runs
**Then** the whole call is rejected and names the unresolved references.

**Given** a source method with its own states (for example backlog, ready, in progress, review, done)
**When** the Agent creates or adapts the Workflow Statuses of the Story Map
**Then** they exist before the statuses are set and show on the Tracking View.

**Given** the 1,000-Card fixture
**When** 100 statuses are set
**Then** the call completes within 2 seconds.

**Given** a bulk status request
**When** it is validated and normalized
**Then** `(Story Map, card, system, external id)` resolves every target; statuses belong to that map, duplicate Card targets and batches above 100 are rejected
**And** it emits one status operation and Activity Event per Card; every version conflict is reported with no partial apply
**And** protection/`apply=false` stores a proposal without status changes, and only the addressed system's sync baseline advances on apply.

### Story 4.12: The BMad round trip

As a developer using the BMad Method,
I want my epics and stories to appear as a story map and stay in step with the files,
So that I see and adjust the cut while the agents keep implementing from the plan.

**Fulfills:** FR-54, SM-7, AD-4, AD-10. **Baseline:** none. The product contains no BMad-specific parser.

**Acceptance Criteria:**

**Given** the repository
**When** the story is done
**Then** a documented recipe (Agent instructions plus mapping rules) exists that uses only tools from the capability manifest
**And** it maps Epic to Activity, one Step per Epic named like the Epic, Story to Story, MVP or sprint slice to Release, acceptance criteria into the Card description, each Card with an external reference (`bmad:epic-<n>`, `bmad:story-<epic>.<n>`) and a Source Link to the file it came from.

**Given** a fixture set of 6 epics and 34 stories
**When** the recipe publishes it with `apply=true`
**Then** the map holds 6 Activities, the derived Steps, 34 Stories, the Releases and all references
**And** with `agentProtection` on it stores one proposal that a human approves through the API and the result is identical.

**Given** the source changed (2 Stories edited, 1 removed, 1 added)
**When** the recipe runs again
**Then** the 2 edited Cards update, the new one is added, the removed one is proposed for archiving and never deleted, and no Card is duplicated.

**Given** a Card edited by a human since the last sync
**When** the recipe runs again
**Then** the ChangeSet marks it as a conflict and does not overwrite it.

**Given** the test suite
**When** it runs
**Then** the 30-plus-Story end-to-end test passes (SM-7)
**And** a test finds no BMad-specific parser in `packages` or `apps` outside fixtures and docs.

**Given** the recipe's mapping and re-run rules
**When** it publishes
**Then** stable references include `bmad:epic-<n>`, `bmad:step-<n>`, `bmad:story-<epic>.<n>` and stable Release ids in the same map scope
**And** unchanged re-runs do not change entity versions or produce duplicate domain rows; archive matching is restricted to the same map and `bmad` system
**And** changed source files are imported as new immutable documents with replacement links to new chunks; existing source history remains retained
**And** a missing/renumbered id is archive-plus-create, not a title-based identity guess; human-edited removed Cards also conflict before archive
**And** epics file, story files and sprint status are read by the Agent recipe; the product contains no BMad parser.

### Story 4.13: Validation gate with five BMad users

As the maintainer,
I want five browser-controlled simulations of the BMad publish, review and adjust loop before the views are built out,
So that functional acceptance follows recorded workflow evidence.

**Fulfills:** PRD section 6.3 (simulated validation gate), SM-8, SM-9. **User decision 2026-10-10:** simulations replace real-user recruitment and do not establish external demand. Keep the historical story title/key stable for orchestration. **Baseline:** none. No code changes; the result is stored as `_bmad-output/planning-artifacts/validation-gate.md`.

**Acceptance Criteria:**

**Given** Epics 1 to 3 and the technical Stories 4.1 to 4.12 are complete
**When** the validation runs
**Then** five browser-controlled scenarios execute against disposable Projects using the Story 4.12 fixture or recorded repository planning inputs
**And** no external users are recruited and no user Project data is modified.

**Given** the five scenarios
**When** they exercise initial publish; protection/approve/apply; dependent deselection; unchanged and edited re-publish; and human-edit conflict plus restore
**Then** each uses the actual local app through browser controls for publish/review/adjust steps, not only HTTP or component tests
**And** input, actual actions, timestamps, screenshots, applied operations and rollback Activity evidence are recorded
**And** source adjustment uses the recipe and fixture files without depending on the Epic 5 drift report.
**And** the protection/approval scenario verifies the default-off approval toggle, enabled Agent self-approval, refused Agent apply under protection and successful human apply through actual UI controls.

**Given** the five sessions
**When** SM-8 (90 percent of Agent changes kept) and SM-9 (at most 5 minutes) are computed
**Then** the raw numbers are recorded next to the results and nothing is rounded to reach a target
**And** retention counts applied domain operations, excluding proposal/approval/audit metadata; zero applied operations gives no percentage
**And** timing starts before the first publish call and ends at the reviewed browser board; setup time is reported separately
**And** the intentional recovery restore is reported separately from unintended rollback; screenshots and measurements are never fabricated.

**Given** a scenario or measurement fails, or browser control is unavailable
**When** the gate result is written
**Then** it records actual completed/failed/blocked scenarios and measured metric results separately
**And** unexecuted scenarios are not counted as passes; the gate stops on failed acceptance with evidence.

**Given** the findings
**When** they are reviewed
**Then** an evidence-based recommendation for Epics 5 to 7 is recorded (continue as planned, reduce, or change direction)
**And** failed acceptance blocks further execution; recommendations do not silently change product scope
**And** any scope change requires the maintainer's explicit decision and corresponding PRD/epic updates, using `bmad-correct-course` when cross-cutting.

## Epic 5: See and judge the cut

The user can tell whether a cut holds: dependencies, Slices with violations, a graph, a what-changed panel and a plan drift report. Slice comparison means two recorded Plan states of the same Story Map, confirmed by the maintainer on 2026-10-13; Releases remain the lanes within each state. Requirements are reconciled before the separate implementation-preparation step. Epic 5 has not been implemented or started.

### Story 5.1: Dependencies between Cards

As a developer or tech lead,
I want to declare that one Card depends on another,
So that the order of work is part of the map.

**Fulfills:** FR-61, AD-5, AD-17. **Baseline:** Card UoW/versioning and Epic 4 typed registry, preview/executor and scoped external references exist; Card dependency storage/operations/UI do not.

**Acceptance Criteria:**

**Given** the table `card_dependencies` owned by the Card aggregate
**When** a dependency between two Cards of the same Story Map is set
**Then** the dependent Card's version increases by 1 in the same transaction for an actual edge change
**And** a dependency across Story Maps is rejected.

**Given** the operation `dependency` (set and unset) in the registry
**When** it resolves
**Then** a cycle is rejected and the message names the cycle
**And** the operation is typed with `describe` and `resolve` and a golden test.

**Given** an Agent references Cards by external reference
**When** it submits dependencies
**Then** repeating the same set, or unsetting an absent edge, creates no duplicate dependency or domain-version change
**And** identity and external-reference aliases are resolved before checking self-edges, cross-map edges and cycles.

**Given** a Card with dependencies
**When** it is shown
**Then** a badge appears on both Cards naming the count and the related keys.

**Given** the Card modal
**When** I add or remove a dependency
**Then** the action works with mouse and keyboard, uses English strings from the string module and runs through the unit of work.

**Given** a Card is deleted
**When** the deletion commits
**Then** incoming and outgoing dependencies are removed in the same transaction
**And** every surviving dependent whose owned outgoing links changed gets its version/history/audit updated atomically.

**Given** an Agent dependency proposal
**When** it is previewed, selected, approved and applied
**Then** typed resolve, preview and executor agree on edges and version conflicts, and any failure rolls back all domain effects
**And** copy remaps internal dependencies, archive preserves them and Restore recovers them coherently. Card dependency edges are distinct from ChangeSet operation-selection dependencies.

### Story 5.2: Slices view

As a tech lead,
I want to see each Release as a Slice with its Stories, status and blockers,
So that I can judge whether a cut is sound.

**Fulfills:** FR-62, FR-14 (Slices View), AD-24. **Baseline:** Release swimlanes exist in Planning; canonical human movement exists; no dependency awareness, Slices route or recorded Plan-state comparison.

**Acceptance Criteria:**

**Given** a Story Map with Releases
**When** I open `/projects/:projectId/story-maps/:storyMapId/slices`
**Then** each Release appears as a Slice with its Stories, count, estimate sum, status distribution and blockers
**And** the view is reachable from the navigation with its own URL.

**Given** a Story whose prerequisite sits in a later Slice or in no Slice
**When** the view renders
**Then** the Story is flagged as a dependency violation in the Slices view and in the Planning view
**And** the flag does not rely on color alone.

**Given** two explicitly recorded Plan states of the same Story Map, labelled Before and After with capture time and stable identity
**When** I compare them in the Slices view
**Then** Stories present only in After are Added, Stories present only in Before are Removed, and the same Story ID assigned to a different Release (including unscheduled) is Moved with old/new Slice
**And** Release rename or within-Slice reordering alone is not a move, equal states produce no membership changes, and reversing the states reverses the differences.

**Given** I record a Plan state
**When** later Cards or Releases change or are deleted
**Then** the recorded membership and displayed values stay immutable and available after reopening the Project
**And** comparison uses recorded states, not inferred historical Card Versions or two current Release lists; unavailable or incompatible states produce a visible error without fabricated history.

**Given** the Slices view
**When** I drag a Story between Slices
**Then** the flags update immediately and a human edit is recorded
**And** a keyboard path and a form path do the same through the same use case.

**Given** the progress view
**When** it renders
**Then** it shows progress per Activity across Slices.

**Given** the checks
**When** they are implemented
**Then** violation detection, blocked Cards, Slice comparison and progress are pure functions in `core` with golden tests
**And** the 1,000-Card fixture meets the unchanged NFR-1 budgets: board interactions within 100 ms and filter results within 300 ms
**And** summaries use configured workflow groups and Story-only counts/estimates, with unscheduled membership explicit.

**Given** the Slices view
**When** it is built
**Then** it uses the Slice lane component of `DESIGN.md` and the Before/After Plan-state comparison shows added, removed and moved Stories with the change markers, so nothing relies on color (UX-DR13).

### Story 5.3: Dependency graph view

As a tech lead,
I want to see the Cards and their dependencies as a graph,
So that I understand what blocks what.

**Fulfills:** FR-63, FR-14 (Graph View), NFR-5. **Baseline:** no Graph route or layout; consumes dependency snapshots from 5.1 and shared pure blockers from 5.2. The layout library is researched, pinned and justified in this story.

**Acceptance Criteria:**

**Given** a Story Map with Cards and dependencies
**When** I open `/projects/:projectId/story-maps/:storyMapId/graph`
**Then** Cards appear as nodes and dependencies as edges
**And** I can filter by Activity, Slice, status and assignee.

**Given** a graph of 200 Cards with their edges
**When** I select, filter or pan
**Then** each interaction responds within 100 ms after the layout.

**Given** a selected Card
**When** it is highlighted
**Then** its prerequisites and dependents are highlighted with a marker that does not rely on color alone.

**Given** the blocked list
**When** it renders
**Then** each blocked Card names its open prerequisite.

**Given** users who cannot use the graph canvas
**When** they open the view
**Then** an accessible table of Cards and their edges offers the same information
**And** nodes are reachable by keyboard.

**Given** the chosen library
**When** it is added
**Then** its current version, maintenance state and license are recorded in the story notes and pass the license allowlist.

**Given** the Graph view
**When** it is built
**Then** the canvas is keyboard operable (arrows pan, `+` and `-` zoom only while it has focus, `Tab` cycles nodes in dependency then title order, `Enter` selects)
**And** the table twin has the columns Card, Depends on, Required by and Blocked order, shares selection and filters with the canvas, and a toggle button (`aria-pressed`) switches between them (UX-DR13).

### Story 5.4: What changed since I looked

As a user working with an Agent,
I want to see what others changed since I last looked,
So that I catch up in seconds.

**Fulfills:** FR-64, AD-11. **Baseline:** Activity routes, epoch/sequence SSE and browser client identity exist; DB Activity has originClientId, but Activity output omits it and current audit paging uses createdAt/id. No change panel or after-sequence read exists.

**Acceptance Criteria:**

**Given** a stored last-seen sequence per Project and epoch in the browser
**When** I open the panel
**Then** it lists Activity Events after that sequence grouped by actor type and affected Card, with a count per actor.

**Given** changes made by Agents, GitHub sync or another browser tab
**When** they commit
**Then** they appear in the panel within 2 seconds
**And** changes made by this browser client are excluded.

**Given** changed Cards
**When** the board renders
**Then** they carry a marker until I choose "Mark as seen"
**And** marking advances only to the observed high-water sequence, so commits arriving concurrently remain unseen
**And** reads carry real origin/sequence metadata, exclude this browser client rather than all humans, and preserve existing audit pagination and hold-updates/dirty-editor behavior.

**Given** the panel
**When** I look for undo
**Then** it links to the restore points for an Agent session
**And** the panel is keyboard operable with English strings from the string module.

**Given** a restore
**When** it completes
**Then** the panel resets to the new epoch.

**Given** the What changed panel and the change markers
**When** they render
**Then** they use the change marker and actor badge components of `DESIGN.md` with the words and glyphs of its state-cue table, and the panel is a drawer that returns focus to its button on close (UX-DR5).

### Story 5.5: Plan drift report

As a developer using coding agents,
I want to know how my map differs from the source plan,
So that the Agent can bring the plan files in line with my adjustments.

**Fulfills:** FR-60, SM-10, AD-10. **Baseline:** scoped references, syncedVersion, addressed-only publication and human-conflict refusal are delivered. No drift report or complete synchronized field/membership baseline exists; Card Versions coalesce and entity deletion removes ordinary references.

**Acceptance Criteria:**

**Given** an external system with scoped references, their `synced_version` and durable synchronized field/membership evidence
**When** I or an Agent request the drift report
**Then** it lists Cards moved between Slices, changed titles or descriptions, changed status, and Cards added or removed since the last synchronization
**And** it is available in the Slices Plan-drift drawer and as a read-only MCP tool
**And** old values and removed identities come from durable synchronized evidence, never guessed from coalesced Card Versions or absent ordinary references.

**Given** every applied upsert by external reference
**When** it commits
**Then** `synced_version` equals the entity's version afterwards (test) and addressed baseline values reflect the actual final applied state
**And** partial/deselected publication leaves unaddressed entities and other systems' baselines unchanged; a human conflict never silently advances the baseline.

**Given** a human moves a Story to another Slice
**When** the drift report runs
**Then** it names that Story and its old and new Slice.

**Given** an Agent updates its source and publishes again
**When** the drift report runs
**Then** it is empty (automated test for SM-10).

**Given** the report
**When** it runs
**Then** Agentic Story Mapper writes nothing to any source file.

**Given** a synchronized active cut
**When** a human adds an unreferenced Card, archives or deletes a synchronized Card, or changes a title, description, status or Slice
**Then** drift names the exact Added, Removed, Changed or Moved identity and old/new values; archived removal is distinguished from physical deletion
**And** reopening and Restore preserve a coherent scoped baseline and removed identity evidence.

**Given** an unknown external system
**When** the report is requested
**Then** it fails with a message listing the systems that have references.

## Epic 6: Everyday board work

The user creates, moves, searches, filters and plans on the board with mouse, keyboard or form, and every function is reachable. Maintainer decisions 1A/2C/3A/4A/5A/6B/7C/8A/9C were accepted on 2026-10-17; see [Epic 6 preparation](../implementation-artifacts/epic-6-preparation.md) and [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md). ETags and binding performance gates are outside this epic; functional, integrity and accessibility acceptance remains mandatory.

### Story 6.1: Every function reachable and addressable

As a user,
I want every page addressable and every action reachable without an environment switch,
So that nothing is hidden and I can bookmark and go back.

**Fulfills:** FR-13, FR-16. **Baseline:** `VITE_DEV_FEATURES` gates navigation in `RootLayout` and `story-map-shell`; the router is code-based with real routes.

**Acceptance Criteria:**

**Given** the web app
**When** the story is done
**Then** `VITE_DEV_FEATURES` and its type declaration are gone and no user-facing function depends on an environment variable.

**Given** the main navigation
**When** I look for Sources, Releases, AI and MCP, and Activity/Audit pages
**Then** each is a real link with its own URL, a visible active state and working browser history
**And** Export actions remain reachable in existing View toolbars and Activity surfaces without a dedicated Export route or rail entry (6B).

**Given** a View URL
**When** I reload it
**Then** the same View opens
**And** a decorative, non-clickable navigation element counts as a defect (test scans the navigation).

**Given** a Later-tier feature that does not meet the quality bar (Roadmaps, Timeline)
**When** it is shown
**Then** it carries an "Experimental" label instead of being hidden.

**Given** every page
**When** it renders
**Then** it has a skip link to the workspace, the landmarks banner, `nav` "Main", `nav` "Views" and one `main`, a document title of the form `{Route} - {Story Map} - Agentic Story Mapper`, and one `h1`
**And** on a route change focus moves to the page heading.

**Given** the navigation
**When** it is built
**Then** the rail groups Work, Setup and Trust as in `EXPERIENCE.md`, the Audit route is labelled Activity, and rail entries for an unavailable Story Map are absent, not disabled (UX-DR9).

### Story 6.2: Create and edit Cards

As a user,
I want to create and edit Cards at every level with all their fields,
So that the map holds what my team needs.

**Fulfills:** FR-8, FR-50. **Baseline:** role labels and priority/category options are centralized; Card detail already uses the shared Dialog and versioned field/link saves. Unit-aware display and a normal Note composer path remain incomplete.

**Acceptance Criteria:**

**Given** the role names Activity, Step, Story and Note
**When** they are shown
**Then** they come from one central definition
**And** each Card level carries a text label, not color alone.

**Given** any level
**When** I create a Card
**Then** opening the composer and submitting are at most two control actions; text entry inside the form is counted separately, for Activity, Step, Story and Note (1A).

**Given** the Card detail
**When** I edit title, description, Workflow Status, priority, business value, effort, estimate, color, assignee, Release, Personas, Annotations and Source Links
**Then** each change saves
**And** each accepted save advances the Card version while history retains AD-7/ADR 0002 same-actor/session coalescing; one separate history row per Save is not required.

**Given** a Story Map
**When** estimates are entered
**Then** they use that Story Map's unit
**And** priority values come from one central definition.

**Given** Notes
**When** I create one
**Then** it can be placed at the root, under an Activity or under a Step, remains visible and follows existing hierarchy validation.

**Given** the Card color category and the priority
**When** a tile shows them
**Then** the category is a chip with a distinct glyph and, when not Standard, its word; its accessible name states the value (`Color: Blocker. Change color`; `Priority 2. Change priority`) and its popover is a listbox with the current option selected
**And** the priority badge text has at least 4.5:1 contrast and the free hex color input is removed from the bulk bar (UX-DR8).

### Story 6.3: Move Cards by mouse, keyboard or form

As a user,
I want to reorder, reparent and assign Cards by any input method,
So that the board works for everyone.

**Fulfills:** FR-9, NFR-5. **Baseline:** dnd-kit in `BacklogList`, `DiscoveryMatrix` and `SwimlaneGrid`; no tile key handler exists, only dnd-kit's default keyboard sensor on the drag handle.

**Acceptance Criteria:**

**Given** a Card
**When** I drag it to reorder, reparent or assign it to a Release
**Then** the change persists through the move operation with sibling reindexing from `core`
**And** an Activity Event is written.

**Given** every drag-and-drop action
**When** I use the keyboard
**Then** a keyboard path performs the same action
**And** a form path does too, both through the same use case.

**Given** an illegal move (a Story under an Activity, a Step under a Step)
**When** it is attempted
**Then** it is refused with the reason shown.

**Given** two clients moving the same Card
**When** one is stale
**Then** the conflict from Epic 3 is shown.

**Given** the Discovery board
**When** I use the keyboard
**Then** the board has one tab stop and the key table of `EXPERIENCE.md` applies (arrows, Home, End, Page Up and Down, Enter, Space, `m`, Delete) only while a tile itself has focus and never from a text field, select or editor
**And** there is no global single-key shortcut and the dnd-kit keyboard sensor is removed.

**Given** a tile
**When** I press `Tab`
**Then** focus moves through that tile's secondary controls and then out of the grid, and `Esc` returns to the tile.

**Given** the focused tile
**When** I press Delete
**Then** the confirmed atomic Delete command targets the selected set if it includes the focused tile, otherwise the focused tile only
**And** this story supplies the shared command/confirmation, existing child-strategy choice and all-conflict rollback; Story 6.4 reuses them in the bulk toolbar rather than providing a prerequisite for closing 6.3.

**Given** the Move dialog
**When** I choose parent, position and Release and confirm
**Then** the same use case as a drag runs and focus lands on the moved tile in its new place
**And** after a delete, a park, a filter or an update, focus goes to that tile, else the next sibling, else the previous one, else the grid, and the result is announced (UX-DR7).

### Story 6.4: Search, filter and bulk actions

As a user,
I want to find Cards fast and act on many at once,
So that grooming a large map is practical.

**Fulfills:** FR-10, NFR-1. **Baseline:** atomic version-checked bulk patch and client filtering exist. Color filtering and current remote-link predicates are missing; filtering currently drops hidden selection; bulk hard-delete is absent.

**Acceptance Criteria:**

**Given** a Story Map
**When** I search
**Then** results match title, description, Source Links and GitHub links.

**Given** the filters
**When** I combine Persona, Workflow Status, Release, Annotation, color, estimate, priority, Sync State and Source Link presence
**Then** only matching Cards remain visible.

**Given** selected Cards
**When** I apply a bulk action (set Release, Workflow Status, Persona, Annotation or color; Archive; Delete)
**Then** it targets the complete retained selection, including Cards hidden by a filter
**And** Archive and Delete are distinct; Delete confirms the count, affected subtrees and the existing child-handling strategy, normalizing overlapping selected subtrees once
**And** selected-set push uses the existing GitHub Dry Run and human confirmation, not the atomic local transaction (3A).

**Given** any selected Card conflicts
**When** the bulk action runs
**Then** the whole action aborts and lists all conflicts.

**Given** the 1,000-Card fixture
**When** I type a search or set a filter
**Then** raw input-to-result timings are recorded against the diagnostic 300 ms reference, without timing-based acceptance or CI failures (9C).

**Given** the search, filter and bulk controls
**When** they are built
**Then** every select, input and checkbox has an accessible name (tile checkbox: `Select K-12, {title}`), the match count is a status message, and the bulk bar is a labelled region placed before the board in keyboard order
**And** hiding selected Cards retains their selection and announces visible/hidden selected counts; deleted/inaccessible Cards are not retained as implicit targets (UX-DR8, 3A).

### Story 6.5: Collapse, Card Keys and Notes

As a user,
I want to collapse parts of a large map, choose my Card Key prefix and keep Notes out of delivery,
So that big maps stay manageable.

**Fulfills:** FR-11. **Baseline:** Tree hierarchy and Discovery Release-lane collapse stores exist, but Discovery Activity/Step collapse is incomplete. Prefix and monotonic counter are persisted; push planning excludes Notes, but delivery totals currently include them.

**Acceptance Criteria:**

**Given** Activities and Steps
**When** I collapse and expand them
**Then** the state is remembered per Story Map.

**Given** a Story Map
**When** I set the Card Key prefix in the UI
**Then** new Cards use it
**And** existing Cards, including synced ones, keep their keys.

**Given** a Note
**When** GitHub push or a delivery report runs
**Then** the Note is excluded from both (test); delivery count, estimate and status distribution use visible Stories only and retain parked/archived-ancestor exclusion (5A).

**Given** Card Keys
**When** a highest key is deleted
**Then** the next Card never reuses it.

### Story 6.6: The five core Views

As a user,
I want each View to show what its task needs,
So that planning, backlog work and tracking each have a clear place.

**Fulfills:** FR-14 (Discovery, Tree, Planning, Backlog, Tracking). **Baseline:** the five core Views, Timeline, Slices and Graph exist. Discovery already shows delivery fields but lacks Personas/grid completion; Tracking lacks its shared Release summary. Timeline is Later.

**Acceptance Criteria:**

**Given** the Discovery View
**When** it renders
**Then** it shows the three levels with Personas and role labels, retaining Release lanes, Workflow Status, estimate and priority (2C)
**And** Notes remain visible at legal root, Activity or Step positions.

**Given** the Planning View
**When** it renders
**Then** Releases appear as swimlanes
**And** priority, business value and effort are editable on the Card.

**Given** the Backlog View
**When** it renders
**Then** it emphasizes status, estimate, description preview and GitHub and Source Link indicators.

**Given** the Tracking View
**When** it renders
**Then** it shows a Kanban by Workflow Status with the Release summary.

**Given** the Tree View
**When** it renders
**Then** Cards appear as an indented hierarchy with collapse controls.

**Given** each View
**When** I open its URL
**Then** it renders the same Story Map with English strings from the string module.

**Given** the Discovery board
**When** it renders
**Then** it is `role="grid"` with row and column counts, a two-row header (Activities with a column span, then Steps), Release lanes as rows with a row header, `aria-multiselectable`, and tiles named `{Card Key} {level} {title}` with their state (changed, blocked order, conflict) in the accessible description and no headings inside tiles
**And** if this proves too brittle a `<table>` twin ships instead, as the Graph does (UX-DR10).

### Story 6.7: Card detail as a deep-linkable modal

As a user,
I want to open a Card in a modal that I can link to,
So that I can share and reload exactly what I am looking at.

**Fulfills:** FR-15. **Baseline:** `?card=<id>` search parameter, `CardDetailModal` and a Tiptap editor exist.

**Acceptance Criteria:**

**Given** a View URL with `?card=<id>`
**When** I reload it
**Then** the modal for that Card opens.

**Given** the description editor
**When** I save
**Then** the stored value is Markdown
**And** it stays valid Markdown when pushed as a GitHub Issue body (test on a fixture).

**Given** a closed modal
**When** I use the browser back button
**Then** the modal state follows the history.

**Given** the modal
**When** I use the keyboard
**Then** focus is trapped while open and returns to the opener on close.

**Given** the Card modal
**When** it opens
**Then** it uses the shared Dialog of Story 2.5 with initial focus on its heading, closes on `Esc`, the close button and browser Back, and restores focus to the opener or the tile with the same Card id
**And** the description editor has a toolbar of named toggle buttons (Bold, Italic, Bullet list, Heading 2), an accessible name "Description" and a visible focus frame, and `Esc` leaves the editor before it closes the modal (UX-DR11).

### Story 6.8: Manage Personas, Annotations, Statuses and Templates

As a user,
I want to create, edit and delete my Personas, Annotations, Workflow Statuses and Story Templates,
So that the map uses my vocabulary.

**Fulfills:** FR-17. **Baseline:** create, patch and delete routes exist; UI delete wiring is unverified.

**Acceptance Criteria:**

**Given** each of the four object types
**When** I use the customization area
**Then** I can create, edit and delete it in the UI
**And** every delete operation available in the API is reachable.

**Given** an item that Cards still use
**When** I delete it
**Then** Workflow Status deletion requires a valid distinct replacement in its effective project/map scope; all affected Cards are version-checked and changed atomically with history/audit
**And** a used Workflow Status rename similarly updates affected Card values; ambiguous same-name ownership or invalid replacement is refused before writes
**And** Persona/Annotation deletion confirms unlinking, while deleting a copied template never rewrites existing Card descriptions (4A).

**Given** a Story Template
**When** I create a Card from it
**Then** its skeleton fills the description.

**Given** the area
**When** I use it
**Then** it is keyboard operable with English strings from the string module.

### Story 6.9: Manage Releases and read their summary

As a tech lead,
I want to manage Releases and see how full and how ready they are,
So that I can plan delivery.

**Fulfills:** FR-23. **Baseline:** Release CRUD, Kanban, timeline data and summary reports exist.

**Acceptance Criteria:**

**Given** the Release area
**When** I create or edit a Release
**Then** name, goal, startDate, releaseDate and the existing released/not-released state are saved through versioned Release commands.

**Given** Stories
**When** I assign them to a Release by drag or bulk action
**Then** the Release contains them and their versions bump.

**Given** a Release
**When** I read its summary
**Then** its count, estimate sum and status distribution use visible Stories only, excluding Notes/Activities/Steps and parked/archived ancestry
**And** every unestimated Story is listed; estimate 0 counts as estimated; no extra all-Card delivery metric is required (5A).

**Given** a Release marked released
**When** I choose the default Release list, Planning or Tracking
**Then** it is excluded from the open-Release scope
**And** an explicit show-all path reveals released Releases without changing assignments/history, and Unscheduled stays accessible. Discovery retains its Release lanes (5A/2C).

### Story 6.10: Performance and accessibility budgets

As a user with a large map,
I want the board to stay fast and usable by keyboard and screen reader,
So that size and input method do not limit me.

**Fulfills:** NFR-1, NFR-5, AD-18. **Baseline:** jsdom and existing Dialog/Card DOM tests exist; axe-core/Testing Library quality gates and the two required Card indexes are missing. Some other indexes already exist. No ETag support exists and none is required in Epic 6.

**Acceptance Criteria:**

**Given** the 1,000-Card fixture
**When** performance diagnostics run
**Then** map read, committed single-Card mutation, board interaction and search/filter timings are recorded with all raw samples, fixture/environment and cold/warm context against diagnostic 150/30/100/300 ms references
**And** these timings do not fail Epic 6 acceptance or CI; binding gates need a separate later decision. Earlier-story gates/evidence are unchanged (9C).

**Given** the current pre-release schema step of this story
**When** it runs
**Then** `cards.story_map_id` and `cards.parent_id` are indexed consistently in runtime bootstrap/opening and Drizzle declarations
**And** populated fixtures, reopening and current-schema Restore pass integrity checks; versioned baseline migrations remain in Story 8.1 (8A).

**Scope decision 7C:** ETags, aggregate cache revisions, conditional map reads and client 304 handling are deferred beyond Epic 6. Existing full snapshot reads and live invalidation remain; this is not an acceptance prerequisite.

**Given** the scope decision of the UX contract
**When** conformance is stated
**Then** it reads WCAG 2.1 AA for desktop viewports of 768 px and wider with 1.4.10 Reflow excluded, and the README says so.

**Given** the main Views, the Card modal (open and with its unsaved-changes dialog), a confirm dialog, the Move dialog and the Graph table
**When** the jsdom checks run `axe-core`
**Then** they report no violation and interactive elements have accessible names
**And** the job fails when zero specs ran (no `--passWithNoTests` pass for this suite).

**Given** the behavior rules of `EXPERIENCE.md`
**When** the Testing Library specs run
**Then** they cover grid traversal, keyboard moves with focus assertions, dialog containment and restore, the status message count and text, and the held-updates queue.

**Given** the documented contrast pairs
**When** the token unit test runs
**Then** it recomputes each pair and fails if text falls below 4.5:1 or a control boundary or focus ring below 3:1.

**Given** what jsdom cannot check (rendered contrast, target size, focus over sticky rows, browser zoom at 200 percent, forced colors, reduced motion, screen readers)
**When** a release is prepared
**Then** the manual checklist of `EXPERIENCE.md` runs (NVDA with Firefox, VoiceOver with Safari, a keyboard-only pass of UJ-1 and UJ-3, 200 percent zoom on non-board surfaces) and its findings are recorded in the story notes (UX-DR12).

## Epic 7: Plan with GitHub

The user connects GitHub in the app, imports single tickets while creating Cards, and pushes, imports and syncs with a mandatory Dry Run and visible conflicts.

Preparation: [Epic 7](../implementation-artifacts/epic-7-preparation.md), source baseline `32104fa34da623b82d5978cf4ee33157234725bc`, 2026-10-18. Accepted decisions D1–D6 are recorded in [ADR 0008](../../docs/adr/0008-epic-7-github-connection-and-sync-policy.md). Implement in story order; 7.3 supplies canonical identity to all subsequent stories, 7.4 supplies the sole remote-write protocol, and 7.5 supplies the shared incoming ChangeSet path. Preparation does not launch implementation.

### Story 7.1: Credentials in a user-level file

As a user,
I want my GitHub credentials stored outside the Project,
So that sharing a Project, archive or log never leaks a token.

**Fulfills:** FR-3, NFR-3, AD-14. **Baseline:** the central app resolver currently prefers `GITHUB_TOKEN`, then the CLI; no user-level credential file exists. Standalone Python reader CLIs are separate tooling.

**Acceptance Criteria:**

**Given** GitHub needs credentials
**When** the central app resolver selects a source
**Then** it uses authenticated CLI, then the user-level file, then the environment
**And** status and actual provider identity agree, including CLI subprocess environment behavior
**And** providers/routes do not independently read credentials.

**Given** a human stores a pasted token
**When** the credential file is written
**Then** it is `credentials.json` under `%APPDATA%/StoryMapper` on Windows or `~/.config/storymapper` elsewhere
**And** it is outside Project data, atomically replaced and mode 0600 on POSIX.

**Given** a source is absent
**When** another permitted source is available
**Then** the resolver advances in the specified order
**But** an unreadable/malformed selected file or rejected selected credentials produce an actionable error without silently changing accounts
**And** if no source is usable, the message names the file location and CLI/environment alternatives.

**Given** an in-memory test canary credential
**When** actual responses, logs, Activity, snapshots and archives are inspected
**Then** none contain its value or an authorization/request-body leak.

### Story 7.2: Connect GitHub in the app

As a user,
I want a guided dialog to connect GitHub,
So that I never edit a file to get started.

**Fulfills:** FR-26. **Baseline:** `GitHubConnectionsPanel` edits read-only-default settings; current validation requires the GitHub switch on and has no candidate-token flow. **Depends on:** 7.1.

**Acceptance Criteria:**

**Given** the connection dialog
**When** I choose a method
**Then** it explains token use and offers a pasted token or instructions to run `gh auth login` in my own terminal followed by Recheck
**And** the app does not launch an interactive login process.

**Given** GitHub is off
**When** I explicitly click Verify in the human connection dialog
**Then** only that candidate verification may contact GitHub without enabling the switch or persisting credentials/configuration
**And** after success I am told that GitHub is still off and blocks import, sync and push until I explicitly confirm Connect.

**Given** candidate verification
**When** it succeeds or fails
**Then** it checks the entered token or intended CLI identity and selected repository
**And** errors name invalid credentials, unavailable repository/permission, rate limit or network and the next action, without exposing secrets or treating masked 404 as proven deletion.

**Given** verified unchanged inputs
**When** I explicitly confirm Connect
**Then** the token is stored through 7.1 if applicable, the connection is read-only by default with the existing panel defaults, and the switch turns on with an attributed audit event
**And** failure leaves the switch unchanged and reports any retained credential-file effect truthfully.

**Given** keyboard use, a pending verification, scope change or Restore
**When** I continue or cancel
**Then** English module strings, labels, focus and draft retention work, and stale responses cannot connect a different Project or enable a stale scope
**And** no `.env` editing is required.

### Story 7.3: GitHub identity in external references

As a user,
I want a Card to show its Issue and the Issue to point back to the Card,
So that I can move between both in one click.

**Fulfills:** FR-29, AD-10, AD-14. **Baseline:** duplicate `github_links`/`remote_work_item_links` identity and `ensureLegacyGitHubLink` remain; typed source evidence also references `github_links`. **Depends on:** 7.1.

**Acceptance Criteria:**

**Given** the reserved system `github`
**When** an Issue or Milestone is linked
**Then** canonical scoped identity is an adapter-owned `external_refs` row
**And** `remote_work_item_links` stores sync state/baselines keyed by that ref, without duplicated Card/Release/remote identity
**And** generic external-ref writes still refuse `github` and duplicate scoped ownership is rejected.

**Given** the identity cutover
**When** the story completes
**Then** `github_links` and `ensureLegacyGitHubLink` are removed from executable code
**And** Source Links, provenance-only copies, explicit root versions/history, board import, filters/reports/exports, archive redaction and current-schema Restore use canonical refs
**And** no old prototype migration or legacy execution fallback is added under AD-9.

**Given** a linked Card and a pushed Issue
**When** I navigate between them
**Then** the Card shows a clickable Issue number and the Issue's delimited machine footer names Story Map and Card Key, contains a stable reconciliation marker and links to the local Card deep route
**And** authored Markdown is preserved and no local Workflow Status is written into the Issue body.

**Given** a missing/inaccessible Issue or provider failure
**When** observed by sync
**Then** identity and Card stay readable with stale/deleted-remote or explicit error information appropriate to the evidence
**And** network/auth/rate-limit/partial-response failures are never converted to confirmed remote deletion.

**Given** a hard local deletion
**When** live external refs are removed atomically
**Then** minimal scoped historical deletion evidence remains available for deleted-local health without retaining a live identity binding or silently recreating the Card.

### Story 7.4: Push with a mandatory Dry Run

As a tech lead,
I want to push Cards and Releases to GitHub only after seeing exactly what will happen,
So that nothing is written by surprise.

**Fulfills:** FR-27, AD-4, AD-12, AD-15. **Baseline:** selected-set previews and Agent Dry Run proposals exist, but human push accepts `confirm:true` and regenerates the plan; no durable pre-call intent/reconciliation exists. **Depends on:** 7.2, 7.3.

**Acceptance Criteria:**

**Given** selected Cards or a Release
**When** I start push
**Then** a persisted immutable Dry Run lists every Issue and Milestone effect, type, label change and excluded Note
**And** only a human UI confirmation referencing that exact plan id can write
**And** stale local/remote inputs, scope/connection/mapping drift or Restore require re-review; no setting or quick action bypasses it.

**Given** native Issue types
**When** a plan is prepared
**Then** a connection mapping assigns Activity/Step/Story to available repository types and imported types are preserved
**And** invalid/unavailable mappings block writes rather than inferring types from title prefixes or silently omitting them.

**Given** Issues/Milestones to push
**When** confirmed effects execute
**Then** Notes are excluded, export labels are configurable and local Workflow Status is absent from Issue bodies
**And** Milestone name, goal/description, due date and open/released state are explicit effects; shared Milestones are not hidden inside Issue creation.

**Given** twelve Issues and a crash after the sixth or after remote success before local persistence
**When** explicitly resumed after reopening
**Then** intent exists before every modifying call and stable-marker reconciliation prevents duplicates
**And** uncertain/incomplete lookup results stop visibly instead of blindly recreating Issues.

**Given** a completed/partial push
**When** results appear
**Then** each item has its actual link, error or not-attempted result, and double confirmation cannot execute it twice
**And** Restore does not claim to undo remote effects.

**Given** an Agent push
**When** protection is on
**Then** it is refused as `protected` before provider mutation
**And** without protection it can only propose the Dry Run; Agent ChangeSet approval never grants remote-write confirmation.

### Story 7.5: Import and sync

As a tech lead,
I want to pull Issues into the map and keep them in sync,
So that GitHub and the map describe the same work.

**Fulfills:** FR-27, AD-4. **Baseline:** Agent import/pull already use GitHub ChangeSets; human import/sync still include direct domain mutation paths, initial imports assign Releases, and read-only can overwrite local divergence. **Depends on:** 7.3, 7.4.

**Acceptance Criteria:**

**Given** a connection/query
**When** new Issues are imported
**Then** Cards retain hierarchy/type/source evidence but start Unscheduled without Release creation/assignment
**And** every incoming local domain mutation, including human-triggered flows, is a ChangeSet with proposing actor `github`, retained initiating identity, restore point on apply and atomic audit
**And** protection retains proposals rather than silently applying them.

**Given** an initially Unscheduled linked Card with a remote Milestone/iteration
**When** explicit later Release sync is reviewed
**Then** Release assignment may be proposed without interpreting intentional initial null placement as a remote Milestone removal or false divergence.

**Given** linked local/remote work
**When** explicit sync runs
**Then** title, authored description, state/status and mapped labels synchronize through one three-way merge
**And** only status and opted-in Annotation labels synchronize; unrelated GitHub labels survive, with export/structure labels managed separately
**And** Release/Milestone identity survives rename and clearing is explicit; iteration remains inbound-only.

**Given** read-only and local divergence
**When** pulled
**Then** no remote write occurs, local-only edits remain unsynced and overlapping edits create durable conflicts instead of overwriting local values.

**Given** an outgoing sync effect
**When** it is applied
**Then** it uses the exact human-confirmed Dry Run of 7.4, separately from incoming ChangeSet application
**And** every source item returns a truthful result including unchanged/already-linked/conflict/failure/not-attempted outcomes as applicable.

### Story 7.6: Conflicts and Sync Health

As a tech lead,
I want conflicts shown as diffs and a health overview,
So that I resolve them knowingly and see what is out of sync.

**Fulfills:** FR-28, AD-4. **Baseline:** field-aware merge/resolution, shared version/sync conflict entries and pure health exist; duplicate open conflicts and link/conflict state disagreement remain possible. **Depends on:** 7.5.

**Acceptance Criteria:**

**Given** a field changed on both sides
**When** sync detects or repeatedly refreshes it
**Then** exactly one unresolved canonical-ref/field conflict retains reviewed evidence and displays both sides as a diff
**And** only that field is blocked in UI and every server write path until an explicit resolution succeeds; convergence does not silently close it.

**Given** a local/remote choice
**When** resolved
**Then** remote-wins local changes use a GitHub ChangeSet, while local-wins remote effects use 7.4 and only successful confirmed persistence closes the conflict
**And** Cancel, stale evidence, failure or read-only refusal retains the conflict and unrelated edits.

**Given** Sync Health
**When** opened
**Then** unsynced, conflict, stale, deleted-remote and deleted-local counts/listed identities agree with durable state and canonical baselines without a provider call
**And** deleted-local entries retain historical Card identity/Issue navigation while permission/network failures are reported truthfully.

**Given** version and sync conflicts on one Card
**When** reported
**Then** both use the existing single ConflictReport wire contract and preserve drafts/evidence
**And** pending responses after Restore cannot overwrite restored state or authorize old intentions.

### Story 7.7: Import a single ticket while creating a Card

As a developer,
I want to create a Card by naming a ticket,
So that the Card arrives filled and linked.

**Fulfills:** FR-22 (S12). **Baseline:** the Card composer supports manual title/template/placement, with no ticket field. **Depends on:** 7.2, 7.3, 7.5, 7.6.

**Acceptance Criteria:**

**Given** the composer
**When** I enter a GitHub Issue HTTPS URL, `owner/repo#N`, or positive `N`/`#N` with selected/default connection
**Then** explicit lookup fills title/authored description for review
**And** confirmation atomically creates Card, canonical ref, baseline and Source Link through the incoming ChangeSet path in the chosen level/parent/position/Release; protected proposals are not reported as already-created Cards.

**Given** a missing/inaccessible ticket, invalid/foreign/PR URL, repository mismatch or stale placement
**When** lookup/apply is attempted
**Then** it names the problem and creates no partial Card/ref/source rows
**And** an existing scoped Issue binding identifies the existing Card instead of creating a duplicate.

**Given** GitHub off or no connection
**When** I use the field
**Then** the shared 7.2 dialog explains connection and blocking switch state
**And** my composer text/template/placement survive the detour, Cancel and failed lookup.

**Given** the created Card
**When** shown/reopened
**Then** the Issue number is clickable and typed source evidence persists
**And** late lookup/create responses after scope change or Restore cannot replace a current draft or create in another Map.

### Story 7.8: Provider extension points

As a developer,
I want to add another work item system without touching GitHub code,
So that other systems attach cleanly.

**Fulfills:** FR-55, AD-15. **Baseline:** `WorkItemProvider` is in `packages/github/src/providers/work-item-provider.ts`; factory/credential switches have one case and shared conflict logic still contains a GitHub-only restriction. `PublishProvider` in core has no implementation. **Depends on:** 7.1–7.7.

**Acceptance Criteria:**

**Given** the provider registry/credential lookup
**When** an unknown runtime id is requested
**Then** it is rejected explicitly before any side effect, never returned as undefined.

**Given** an isolated test-only provider implementation
**When** it is integrated after seam cleanup
**Then** only the contract enum fixture, registry and credential registration are integration change points, plus the new adapter module/tests
**And** GitHub implementation/tests and shared application orchestration are unchanged for the extension exercise
**And** actual shared import/conflict/confirmed-remote-plan flows retain their ownership/protection/ChangeSet boundaries.

**Given** AD-15
**When** read
**Then** it names both actual interfaces/files and the three registration sites
**And** GitHub remains the only production enum member/provider, the test provider does not ship and no publish provider is implemented.

## Epic 8: Ready for the public

The repository can be published: license and community files, continuous integration on three operating systems, English documentation, a history audit, dependency currency and versioned releases.

### Story 8.1: Baseline migration and upgrade path

As a user of v1.0,
I want my Project to upgrade safely when a later version changes the schema,
So that I never lose data by updating.

**Fulfills:** FR-44, FR-2, AD-9. **Baseline:** inline `CREATE TABLE IF NOT EXISTS` and `ALTER`; no migrations; `drizzle-orm ^0.38.3` and `drizzle-kit ^0.30.1`; restore and archive import accept only the current schema version (Stories 2.6 and 2.7).

**Acceptance Criteria:**

**Given** the workspace
**When** Drizzle moves to 0.45.2 or later and `drizzle-kit` to its matching version
**Then** all tests pass and the SQL-injection advisory of the older line no longer appears in the audit.

**Given** the schema as it stands
**When** the baseline migration is generated
**Then** `packages/db/migrations` holds it as SQL and a fresh database is created only through it
**And** no inline DDL or `ALTER` remains outside migrations.

**Given** a database opens
**When** a pending migration exists
**Then** a `pre-migration` restore point is taken first and the migration aborts if that fails
**And** each migration runs with `foreign_keys=OFF` outside the migrator transaction followed by `PRAGMA foreign_key_check`, aborting on any violation.

**Given** a database whose schema is newer than the application or that has tables but no migration journal
**When** it opens
**Then** it is refused with instructions naming the manual recovery.

**Given** a populated fixture database of the previous schema
**When** each migration is tested
**Then** row counts per table are asserted before and after.

**Given** restore (Story 2.6) and archive import (Story 2.7)
**When** the snapshot or archive has an older schema
**Then** it is migrated forward through the migrator
**And** JSON-bearing columns carry a `schemaVersion` sibling read by versioned parsers.

### Story 8.2: Dependency upgrade wave

As a user,
I want the product to ship without known serious advisories,
So that I can run it on my machine with confidence.

**Fulfills:** AD-22, NFR-3. **Baseline:** `pnpm audit` reported 63 advisories (1 critical, 27 high) in an earlier run, including Vitest 2, Vite and Tiptap 2 lines.

**Acceptance Criteria:**

**Given** the lockfile
**When** `pnpm audit --audit-level high` runs
**Then** it reports no critical or high advisory.

**Given** Vitest, Vite and Tiptap
**When** they are upgraded
**Then** each major step has tests green before the next, with versions and verification results recorded in the story evidence
**And** the Stack table of the architecture spine is updated to the installed versions
**And** standard BMAD Loop finalization produces one reviewed story commit; no separate commit per upgrade or special execution lane is required (maintainer correction 2026-10-19).

**Given** an advisory that cannot be fixed by an upgrade
**When** it remains
**Then** it is listed with the affected package, the reason and an owner in the story notes.

**Given** the upgrades
**When** the web build and the tests run
**Then** they pass and the UI behaves as before.

### Story 8.3: Quality gate scripts

As a contributor,
I want one command that runs every repository check,
So that I fix problems before CI reports them.

**Fulfills:** FR-42, NFR-7, NFR-8, AD-1, AD-17, AD-19, AD-22. **Baseline:** none of these scripts exist.

**Acceptance Criteria:**

**Given** the boundary check
**When** it runs
**Then** it fails on an undeclared or unused workspace dependency, on an import outside the layer diagram, on a non-test import of `better-sqlite3` or `drizzle-orm` outside `packages/db`, and on a web feature that imports another feature other than through its `index.ts`.

**Given** the size check
**When** a source file exceeds 750 lines or 100 KB or a function exceeds 50 lines
**Then** the check fails naming file and line.

**Given** the schema-classification test
**When** a table belongs to no aggregate row of the register
**Then** it fails naming the table.

**Given** coverage per package
**When** a package containing logic falls below 60 percent line coverage
**Then** the check fails.

**Given** `check-hygiene`
**When** it finds a tracked secret, a `.sqlite` file, Project or user data, or non-English text in the string module, seed data and templates
**Then** it fails naming the file.

**Given** the license check
**When** a dependency license is outside the allowlist compatible with the chosen license
**Then** the check fails naming the package.

**Given** the repository root
**When** I run the single check command
**Then** all of the above run locally and exit non-zero on any failure.

### Story 8.4: Continuous integration on three operating systems

As a maintainer,
I want every pull request checked on Windows, macOS and Linux,
So that a change works for every supported user.

**Fulfills:** FR-42, NFR-6. **Baseline:** no `.github/workflows`.

**Acceptance Criteria:**

**Given** a pull request
**When** CI runs
**Then** a matrix of Windows, macOS and Linux on Node 24 executes typecheck, tests, build and the quality gate scripts.

**Given** the audit
**When** it runs in a pull request
**Then** it reports its result without blocking
**And** the release job of Story 8.8 fails on any critical or high advisory.

**Given** a failing check
**When** the pull request is reviewed
**Then** the merge is blocked, and the required branch protection settings are documented.

**Given** the workflow
**When** it is read
**Then** it uses Corepack for the pinned pnpm and installs no repo-local Node.

### Story 8.5: License and community files

As an outside contributor,
I want to know the license and how to contribute or report a problem,
So that I can use the project and take part safely.

**Fulfills:** FR-40. **Baseline:** root community files are missing; issue templates already exist and need generalization. **Maintainer decision 2026-10-19:** private publication independent of the employer, under MIT as StoryMapper (renamed to Agentic Story Mapper on 2026-11-08). Employer approval and GitHub/npm/trademark name checks are not required. Private details may use explicit placeholders until supplied by the maintainer.

**Acceptance Criteria:**

**Given** the repository root
**When** the story is done
**Then** `LICENSE` names the chosen license, and `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md` exist in English.

**Given** `SECURITY.md`
**When** I read it
**Then** it explains how to report a vulnerability privately
**And** absent private details use `[PRIVATE_SECURITY_CONTACT]`, clearly identified as inactive until completed; absent copyright/conduct details use `[COPYRIGHT_HOLDER]` and `[CONDUCT_CONTACT]`, never invented personal data.

**Given** the issue and pull request templates
**When** they are inspected
**Then** they are generic English templates without team-specific fields.

**Given** the dependency licenses
**When** the license check of Story 8.3 runs
**Then** every dependency is compatible with the chosen license.

**Given** the MIT decision and the name Agentic Story Mapper
**When** the story starts
**Then** the maintainer's private independent publication decision, explicit waiver of name checks and permission for private-detail placeholders are recorded in the story notes
**And** required private details remain explicit publication prerequisites until supplied.

### Story 8.6: Public documentation in English

As a new user,
I want an accurate English README and runbook,
So that I can install and use Agentic Story Mapper without help.

**Fulfills:** FR-41. **Baseline:** README and RUNBOOK are German and describe the PowerShell path.

**Acceptance Criteria:**

**Given** README and RUNBOOK
**When** they are rewritten
**Then** they are English and describe the installation and start per operating system as implemented in Epic 1.

**Given** the README
**When** it describes agent use
**Then** it states that the protection switches guard a cooperative Agent and are not a security boundary
**And** it links to the architecture spine.

**Given** a fresh clone on Windows, macOS and Linux
**When** the README quickstart is executed
**Then** it works on each and the result is recorded.

**Given** documents that link to removed documents
**When** the story is done
**Then** every such link points to a current document.

### Story 8.7: Audit of content and tooling

As a maintainer,
I want the repository checked for anything that must not be published,
So that release does not expose secrets, personal data or unlicensed material.

**Fulfills:** FR-43. **Baseline:** commits with employer-specific tooling exist; `docs/story-mapping-playbook.pdf` has unknown provenance; `tools/`, skills, templates and the German usability report carry team-specific process.

**Acceptance Criteria:**

**Given** tracked files and history
**When** the audit runs
**Then** it lists findings for secrets, personal data, customer or employer specific content and unlicensed material with their resolution.

**Given** `docs/story-mapping-playbook.pdf`
**When** the audit completes
**Then** it is proven redistributable or removed.

**Given** `tools/`, `.agents/skills`, `.claude/skills`, `docs/templates`, `.github/ISSUE_TEMPLATE`, `.cursor/rules/card-authoring.mdc` and `docs/usability-report.md`
**When** they are reviewed
**Then** team-specific content is generalized, translated or removed.

**Given** all current tracked content, including source, defaults, configuration, instructions, planning artifacts and publishable evidence
**When** cleanup completes
**Then** every employer-specific reference is removed, including the company identifier named by the maintainer, and no encoded or ignored copy is used to evade removal.

**Given** the whole repository
**When** it is searched
**Then** no names or implementation identifiers of removed providers remain outside the change history.

**Given** the audit report
**When** it contains an unresolved finding
**Then** publication is blocked until it is resolved.
**And** the exact final publication candidate is rescanned after Story 8.9 and after the maintainer's history disposition; required private-detail placeholders are not treated as resolved findings.

### Story 8.8: Versioned releases

As a user,
I want tagged releases with notes and a clear upgrade path,
So that I know what changed and how to update.

**Fulfills:** FR-44. **Baseline:** application version hardcoded in places; no release process.

**Acceptance Criteria:**

**Given** the repository
**When** the version is needed (server, archive manifest, health endpoint)
**Then** all read it from the root `package.json`.

**Given** a release
**When** I create a tag following semantic versioning
**Then** a release job builds it, runs the audit gate and publishes release notes.
**And** quality failures, critical/high advisories, unavailable audit results, unresolved publication findings and required private-detail placeholders block publishing.

**Given** an older Project folder
**When** a newer release opens it
**Then** it migrates it or refuses with instructions
**And** the upgrade path is documented in the runbook.

**Given** a Project folder created by a prototype build
**When** any release opens it
**Then** it is refused with instructions.

### Story 8.9: Agentic-coding reference material

As a developer curious about agentic engineering,
I want to see how this project is built with agents,
So that I can follow and reuse the practice.

**Fulfills:** FR-45, SM-4. **Baseline:** `AGENTS.md`, `.cursor/rules` and BMad artifacts exist without a contributor walkthrough.

**Acceptance Criteria:**

**Given** the documentation
**When** it is complete
**Then** it describes the instruction files, the planning artifacts under `_bmad-output`, the review and check workflow and how a contributor reproduces it.

**Given** a small change
**When** a contributor follows the documented workflow from start to pull request
**Then** it works end to end without maintainer help (verified by a dry run recorded in the story notes).

**Given** the documentation
**When** it names commands or paths
**Then** they exist and match the repository.

### Open point (no story): repository history and publication

The maintainer has chosen private independent publication under MIT, waived name checks and permitted private-detail placeholders (2026-10-19). Supplying those required details, choosing between rewriting Git history and publishing from a fresh repository (PRD Open Question 1), repeating the audit on that exact final result including Story 8.9, and the first public push remain final maintainer actions. The push is done by the maintainer, not by an agent.
