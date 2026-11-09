---
title: Agentic Story Mapper
status: final
created: 2026-09-29
updated: 2026-11-08
---

# PRD: Agentic Story Mapper

Reproducing statement: Define Agentic Story Mapper independently of former organization-specific tooling and vendor comparisons; distinguish current product requirements from historical planning baselines while preserving requirement IDs, release scope and recorded decisions. Date: 2026-11-08. Version: 9.
*Product name: Agentic Story Mapper.*

## 0. Document Purpose

This PRD defines what Agentic Story Mapper must be at its first public open-source release (v1.0) on GitHub. It supersedes the prototype planning documents. It is written for the maintainer, for downstream BMad workflows (UX, architecture, epics and stories) and for the first external contributors. Vocabulary is anchored in the Glossary; features are grouped with globally numbered FRs nested under them; every inferred item is tagged `[ASSUMPTION]` and indexed in section 9.

Current operating guidance lives in the [README](../../../../README.md) and [Runbook](../../../../docs/RUNBOOK.md); technical contracts live in the [architecture spine](../../architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md) and [MCP inventory](../../../../docs/mcp-tools.md). The [release checklist](../../../../docs/public-release-readiness.md) tracks remaining release work.

The [usability report](../../../../docs/usability-report.md), [addendum](addendum.md), [code-alignment review](review-code-alignment.md) and [epic topics](epic-topics.md) are historical planning inputs. Their observations and status tables describe their stated baselines, not the current implementation. They are retained to explain requirement and architecture decisions; their old findings are not a current release checklist. The product focuses on local story mapping, agent-driven planning and GitHub integration.

## 1. Vision

Agentic Story Mapper is a local-first story mapping and GitHub planning tool that a person and an AI agent operate side by side on the same data. A Product Owner sees a visual story map (Activities, Steps, Stories), slices it into Releases and pushes it to GitHub Issues. An agent (Claude Code, Copilot, Cursor or any MCP host) reads the same map and changes it directly by default; a protection switch turns its changes into proposals that a human approves, and restore points make every change reversible. Everything runs on the user's machine: no account, no SaaS backend, no telemetry.

The differentiator is verifiable context fidelity. Every Card can show where it came from (a requirement chunk, a GitHub Issue, a meeting note, an agent action) and every change by a human, an agent or GitHub sync is auditable. Agents work directly or propose, humans stay in control through protection and restore points, and nothing leaves the machine unless a Connector is enabled.

The primary way work enters Agentic Story Mapper is through Agents. Planning agents, notably those of the BMad Method, produce epics and stories as files; Agentic Story Mapper turns them into a reviewable story map with Release slices, keeps them current as the agents revise the plan, and gives humans a visual place to inspect and adjust what the agents cut. Agentic Story Mapper stays methodology-agnostic: BMad Method support consists of generic Agent capabilities plus a documented recipe, not a built-in parser. Its primary user is a developer or tech lead working with coding agents; Product Owners and analysts are a secondary audience.

Agentic Story Mapper is also the maintainer's public reference for professional agentic coding. The repository itself must demonstrate the practice it enables: agent instructions, spec-driven planning artifacts, automated checks and reviewable change history that an outside reader can follow and reuse.

## 2. Target User

### 2.1 Jobs To Be Done

- **Developer or Tech Lead working with coding agents (primary):** plan, cut and adjust epics and stories together with an Agent, see whether the cut is sound, and keep the plan the Agent implements against in line with what was adjusted, without leaving the terminal workflow.
- **Product Owner / Product Manager (secondary):** turn scattered requirements and tickets into a prioritized, release-sliced backlog and keep it in sync with GitHub, without depending on a SaaS vendor.
- **Business Analyst:** structure requirements consistently, see which requirements are not yet covered by any Story, and keep every Story traceable to its source.
- **Tech Lead / Developer:** derive GitHub Issues and Milestones from a story map and see delivery status per Release.
- **Agent operator (any role):** let an AI agent draft, groom and slice a map safely, with a diff to review instead of silent edits.
- **BMad Method user:** see the epics and stories that planning agents generated as a visual story map with slices, adjust the cut by hand and keep delivery status visible.
- **Privacy-conscious team member:** know exactly which data stayed local and which was fetched by an agent or sent to GitHub.
- **Open-source adopter and contributor:** install from a fresh clone in minutes, understand the architecture, run the checks and contribute with confidence. This is also the maintainer's own framing: a credible showcase of agentic engineering.

### 2.2 Non-Users (v1)

- Teams that need hosted multi-user collaboration, accounts, roles or real-time co-editing.
- Users who expect a hosted SaaS or a mobile app.
- Users who require a bundled work-item provider other than GitHub or a wiki publishing connector; custom integrations use the provider extension points (FR-55).
- Product Owners or analysts who cannot install Node and use a terminal: v1.0 installs from a clone and serves them only as far as that path allows.

### 2.3 Key User Journeys

- **UJ-1. Maya, a Product Owner, gets to a first map without help.**
  - **Persona + context:** Maya owns a B2B product, is comfortable with a browser and a terminal only when a README gives her exact commands.
  - **Entry state:** fresh `git clone`, Node 24 available, no configuration.
  - **Path:** runs one setup command, runs one start command, the browser opens on the app, a short getting-started checklist appears, she opens the sample story map, edits a Card and creates her own Story Map from a template.
  - **Climax:** a first map of her own product with three levels exists and every step told her what to do next.
  - **Resolution:** she exports it as HTML/PNG/PDF and shares it.
  - **Edge case:** setup fails because Node is too old; the message names the required version and the next action.
- **UJ-2. Tom, a Tech Lead, builds a map from existing tickets.**
  - **Persona + context:** Tom has 200 GitHub Issues and no map.
  - **Entry state:** app running, GitHub not yet connected.
  - **Path:** connects GitHub in-app with a guided dialog, imports Issues in bulk, then creates a new Card by pasting an Issue URL; the Card fills with title and description and links to the Issue.
  - **Climax:** every Card shows its Issue number and jumps to GitHub in one click.
  - **Resolution:** imported Cards sit in an unscheduled area ready to be placed on the map.
  - **Edge case:** the Issue was deleted remotely; the Card shows a stale Sync State instead of failing.
- **UJ-3. Lena, a Product Manager, works with an agent.**
  - **Persona + context:** Lena uses Claude Code with the Agentic Story Mapper MCP server and has a requirements document.
  - **Entry state:** Project with the document imported; agent connected with `agentProtection` on.
  - **Path:** Lena asks the agent to propose a map from the document; the agent calls the proposal tool and returns a ChangeSet; Lena reviews the diff in the app, sees the Source Chunks behind each new Card, deselects two entries and applies the rest.
  - **Climax:** the map appears with each Card linked to its Source Chunk, and the Activity Log names the agent and the ChangeSet.
  - **Resolution:** Lena keeps editing manually; the agent proposes a release slice next.
  - **Edge case:** with protection on, a write tool call is stored as a proposal instead of being applied; with `agentAccess` off the call is rejected and logged.
- **UJ-4. Sam plans a Release and pushes it to GitHub.**
  - **Persona + context:** Sam leads delivery for a two-team product.
  - **Entry state:** a groomed map with estimates and Personas.
  - **Path:** Sam drags Stories into Releases on the Planning view, checks the Release summary, starts a GitHub push, reviews the Dry Run, and confirms.
  - **Climax:** Issues and a Milestone appear on GitHub and link back to the Cards.
  - **Resolution:** the Tracking view shows Release progress and the Sync Health dashboard is clean.
  - **Edge case:** a title was edited on both sides; the conflict is shown as a diff and never overwritten silently.
- **UJ-5. Jonas, a privacy-minded lead, audits what left the machine.**
  - **Persona + context:** Jonas must show that planning data stayed local.
  - **Entry state:** Project used for a month with the `github` switch on.
  - **Path:** opens the audit area, filters by actor type, exports the audit log.
  - **Climax:** the export lists every GitHub write and every agent tool call with actor, time and affected objects.
  - **Resolution:** he switches `github` and `agentAccess` off and confirms that outbound access and agent calls are blocked.
- **UJ-6. Alex, a contributor, adds a feature.**
  - **Persona + context:** Alex found Agentic Story Mapper through the maintainer's agentic-coding write-ups and wants to fix a bug.
  - **Entry state:** fork and clone.
  - **Path:** reads the contribution guide and the agent instructions, runs setup and checks, changes code with their own agent, opens a pull request.
  - **Climax:** CI runs the same checks Alex ran locally and passes.
  - **Resolution:** the maintainer merges; the change history stays reviewable.

- **UJ-7. Nora publishes BMad epics and stories as a story map.**
  - **Persona + context:** Nora, an engineering lead, runs BMad Method planning with Claude Code and wants to see the cut of epics and stories on one board.
  - **Entry state:** Agentic Story Mapper running with the MCP server configured, `agentProtection` on, an epics-and-stories set of 6 epics and 34 stories on disk.
  - **Path:** asks the agent to publish the set; the agent submits one ChangeSet; Nora opens the preview, sees epics as Activities and the MVP slice as a Release swimlane, deselects one story cluster and applies.
  - **Climax:** the whole cut is on one board; the Slices view flags Story 3.2 as sitting in an earlier slice than its prerequisite 2.4, she drags it into the next slice, and the change is logged as a human edit.
  - **Resolution:** she asks the agent to bring the source files in line with the plan drift report, a second publish shows no drift, and after BMad sprint planning the agent updates delivery status by external reference and the board reflects it.
  - **Edge case:** the agent regenerates the epics with renumbered Stories; the ChangeSet proposes archiving unmatched Cards instead of duplicating them, and flags Cards Nora edited by hand as conflicts.

## 3. Glossary

- **Project** — a local folder (`<name>.lsm/`) holding the SQLite database, documents, attachments, exports and logs. Contains Story Maps, Roadmaps and Source Documents.
- **Story Map** — a named, three-level hierarchy of Cards with Releases, Workflow Statuses, Personas and Annotations. Belongs to one Project.
- **Card** — the unit on a Story Map. Has a Card Key, a level (Activity, Step, Story or Note), title, description and metadata.
- **Activity** — top-level Card: what the user broadly wants to achieve.
- **Step** — second-level Card: a step in the user's journey under an Activity.
- **Story** — third-level Card: a concrete, implementable piece of work under a Step.
- **Note** — a Card of type note for context (release goals, OKRs, architecture hints). Never synced to GitHub and not counted in delivery reports.
- **Card Key** — stable human-readable Card identifier with a configurable prefix, for example `PAY-123`.
- **Release** — a named delivery slice with goal, dates and status; Stories are assigned to it.
- **Roadmap** — a board of Roadmap Cards in freely defined columns and swimlanes referencing Releases, Activities or Stories.
- **Persona** — a described user type linked to Cards.
- **Annotation** — a colored label attached to Cards.
- **Workflow Status** — an ordered, customizable state of a Card (for example To Do, In Progress, Done).
- **Source Document** — an imported Markdown or TXT file, split into Source Chunks.
- **Source Chunk** — a locatable piece of a Source Document with a stable ID.
- **Source Link** — a stored provenance reference from a Card to a Source Chunk, GitHub Issue, note or agent action.
- **Connector** — an optional outbound integration. GitHub is the only shipped Connector; other systems attach through provider extension points (FR-55). Off unless the `github` switch is on.
- **External reference** — a system name plus identifier stored on a Card, Release or Persona so an Agent can update it idempotently.
- **Slice** — a Release used as a delivery cut of Stories, created by a human or an Agent.
- **Card Version** — the record of a Card's fields at one change, with actor and time.
- **Attachment** — a file linked to a Card and stored in the Project folder.
- **Parked Activity** — an Activity removed from the board without being deleted.
- **Project archive** — a single-file export of a Project with credentials and connector data excluded.
- **BMad Method** — an agentic planning method whose skills produce epics and stories as files; the reference workflow for Agent-driven planning here.
- **Unscheduled area** — the part of a Story Map that holds imported Cards not yet placed under an Activity and Step.
- **Sync Health** — the dashboard that counts Cards per Sync State.
- **Product Context** — the structured description of a product (type, purpose, key features, optional users, platform, glossary, non-goals) used by Proposals.
- **Story Template** — a reusable description skeleton for Stories; distinct from a Story Map template, which seeds a whole Story Map.
- **Safety switch** — a per-Project setting: `agentAccess` (on by default), `github` (off by default) or `agentProtection` (off by default). Only a human changes them.
- **Restore point** — a snapshot of the Project database taken before risky operations and on demand.
- **Agent** — an AI client using the MCP server; also called MCP host client.
- **ChangeSet** — a reviewable, selectively applicable list of proposed changes produced by an Agent, an AI proposal or an external source. Applying it is a separate audited action.
- **Proposal** — a ChangeSet generated by Agentic Story Mapper's deterministic proposal logic or by an Agent, never a direct write.
- **Dry Run** — a preview of GitHub writes that changes nothing.
- **Sync State** — the relation between a Card and its GitHub Issue: synced, unsynced, conflict, stale, deleted remote, deleted local.
- **Activity Log** — the audit trail of every change with actor type (human, agent, GitHub sync, system), time, diff and source.
- **View** — a focused rendering of one Story Map: Discovery, Tree, Planning, Backlog, Tracking, Timeline, Slices or Graph.
- **Dependency** — a directed link between two Cards meaning one must be done before the other.
- **Plan drift** — the difference between a Story Map and the last synchronized state of an external source, computed per external system.

## 4. Features

### 4.1 Local runtime and Project storage
**Description:** Agentic Story Mapper runs as a local server and web UI on loopback. All data lives in a Project folder that can be versioned in Git. No account or hosted backend exists. Realizes UJ-1, UJ-5.

**Functional Requirements:**

#### FR-1: Local web application on loopback
The user can run the API server and the web UI locally and open the UI in a browser. Realizes UJ-1.

**Consequences (testable):**
- The server listens on `127.0.0.1` by default and refuses to start on a non-loopback host unless an explicit unsafe override is set.
- With no Connector enabled and no Agent connected, the process makes no outbound network requests.

#### FR-2: Project folder persistence
The user can create, open and switch between Projects; each Project stores structured data in SQLite and files in the Project folder. Realizes UJ-1.

**Consequences (testable):**
- A Project folder copied to another machine opens with all Story Maps, Cards, links and history intact.
- Database schema migrations run automatically on open after a restore point and fail loudly, leaving the Project untouched, if they cannot complete. Projects created by prototype builds are not migrated.

#### FR-3: Secrets stay out of Project data
Connector credentials are never written to the Project folder, exports, logs or the Activity Log. Realizes UJ-5.

**Consequences (testable):**
- No export or log file contains a stored token value.
- Credentials entered in the UI are kept in `credentials.json` outside the Project folder (`%APPDATA%/StoryMapper` on Windows, `~/.config/storymapper` elsewhere, mode 0600 on POSIX). The single app resolver tries authenticated GitHub CLI, then that file, then the environment; an absent source advances in order, but malformed/unreadable selected credentials or authentication errors fail visibly instead of silently switching accounts. The CLI method stores no credentials in Agentic Story Mapper.

#### FR-46: Portable Project archive
The user can export **one** Project (one `.lsm` folder / one logical Project) as one archive file and import it on another machine. Realizes UJ-5.

**Consequences (testable):**
- Each archive contains exactly one Project: a redacted database snapshot for that Project, its `documents/`, `attachments/` and `exports/` folders, and a manifest with `formatVersion`, `schemaVersion` and the application version. Connector connections, sync runs, conflicts and other Sync-aggregate tables are redacted; secrets never appear in the archive.
- Export does not require preserving or shipping other Projects that may share a prototype multi-Project runtime database; tests may use a disposable demo Project. A whole-runtime multi-Project bundle is out of scope for this FR.
- Import validates the archive first; on success it publishes a **new** Project folder and the **current** one-process runtime hot-switches to that folder (drain in-flight work, reopen through the database holder) so the imported Project is open without starting a second server. On failure nothing about the previously open Project changes.
- Importing an archive with an unsupported format or schema version fails with a message naming the supported versions and changes nothing.

**Feature-specific NFRs:**
- With the `github` switch off and no Agent connected, Agentic Story Mapper makes no outbound request; this is verifiable in the audit area.

#### FR-57: Restore points
The user can create restore points and restore the Project to one; the system creates them automatically before risky operations. Realizes UJ-3, UJ-7.

**Consequences (testable):**
- Restore points are created before every ChangeSet apply, before every migration, at the first apply of an Agent session and on demand.
- Restoring first creates a pre-restore point, keeps the record of the undone actions flagged as undone, and never contacts remote systems or deletes Attachments; the result lists GitHub links created after the point.
- Retention keeps the newest points per class within a size cap and never deletes the last point of a class; restore points are excluded from the Project archive.

### 4.2 Installation and first run
**Description:** A new user goes from a fresh clone to a working app with as few commands as possible on Windows, macOS and Linux, and gets plain-language help when something fails. Realizes UJ-1, UJ-6. Addresses usability findings S1-S4, S6, S7.

**Functional Requirements:**

#### FR-4: One-command setup and start on all platforms
The user can install dependencies and start the app with one documented command each on Windows, macOS and Linux. Realizes UJ-1.

**Consequences (testable):**
- The documented setup requires only Node 24 and Corepack; the pnpm version is pinned through Corepack.
- Setup needs no manual configuration file.
- After the start command reports healthy, the default browser opens on the web UI.

#### FR-5: Actionable failure messages and diagnosis
When setup or start fails, the user sees a plain-language cause and next action; a diagnosis command checks the common causes. Realizes UJ-1 edge case.

**Consequences (testable):**
- Failures for wrong Node version, blocked port, missing native module and missing dependencies each print a message naming the fix.
- A diagnosis command reports pass or fail per check without changing state.

#### FR-6: Guided first run with a sample map
On first start the user sees a getting-started checklist and a ready-made sample Story Map. Realizes UJ-1.

**Consequences (testable):**
- A new Project offers a sample Story Map with at least one Activity, Step and Story, which can be deleted without side effects.
- The checklist tracks: create a Story Map, add first Cards, optionally connect GitHub, export once; each item marks itself done.

#### FR-7: English user interface
All UI text, empty states, errors and built-in templates are English and defined in one central place. Realizes UJ-1.

**Consequences (testable):**
- No German string remains in `apps/web` or in built-in templates and seed data.
- UI strings are extracted to a single source so a later translation needs no code search.

### 4.3 Story map board
**Description:** The board shows Activities across the top, Steps below and Stories beneath, editable in place, with keyboard operation and drag-and-drop. Realizes UJ-1, UJ-4.

**Functional Requirements:**

#### FR-8: Three-level Cards with visible roles
The user can create and edit Activities, Steps, Stories and Notes; each level carries a role label in the UI and is not distinguished by color alone. Realizes UJ-1.

**Consequences (testable):**
- Role names ("Activity", "Step", "Story", "Note") come from one central definition.
- A new Activity, Step, Story or Note takes at most two control actions: open the composer and submit. Text entry inside that form is separate and does not count as an additional control action (decision 1A, 2026-10-17).

#### FR-9: Drag-and-drop and equivalent alternatives
The user can reorder, reparent and assign Cards to Releases by drag-and-drop, and can do the same by keyboard and by form. Realizes UJ-4.

**Consequences (testable):**
- Every drag-and-drop operation has a keyboard path and a form path.
- Dropping persists position through the existing move operation with sibling reindexing and writes an Activity Log entry.

#### FR-10: Search, filter and bulk actions
The user can search Cards by title, description, Source Links and GitHub links, filter by Persona, Workflow Status, Release, Annotation, color, estimate, priority, Sync State and Source coverage, and act on multiple selected Cards. Realizes UJ-4.

**Consequences (testable):**
- Bulk actions set Release, Workflow Status, Persona, Annotation and color. Archive and Delete are distinct actions; Delete confirms the entire target set and the existing child-handling strategy. Overlapping selected parent/child subtrees are resolved once. All selected Card versions are checked before an atomic local action; every conflict is reported and nothing partially applies.
- Filtering retains selected Cards that become hidden and announces the visible/hidden selected counts. Actions target the complete explicitly selected set; deleted or inaccessible Cards cannot remain implicit targets.
- Bulk push hands the selected set to the existing GitHub Dry Run and human confirmation flow, retaining GitHub safety checks and Note exclusion. It does not make external writes part of the atomic local bulk transaction.
- With 1,000 Cards, record search/filter input-to-result measurements and raw samples. The 300 ms reference is diagnostic for Epic 6, not a pass/fail acceptance gate (decision 9C).

#### FR-11: Collapse, Card Keys and Notes
The user can collapse and expand Activities and Steps, configure a Card Key prefix per Story Map and place Notes. Realizes UJ-1.

**Consequences (testable):**
- Changing the Card Key prefix does not alter existing keys of already synced Cards.
- Notes are excluded from GitHub sync and from delivery reports.

#### FR-12: Focus Release and per-View display settings
The user can focus the board on one Release and choose which badges and fields appear on Cards per View. Realizes UJ-4.

**Consequences (testable):**
- Focus Release shows the chosen Release's Stories with only their relevant Activities and Steps.
- View display settings persist per Story Map and View.

#### FR-49: Park, archive and delete
The user can park an Activity, archive a Card and delete a Card as three distinct operations. Realizes UJ-1.

**Consequences (testable):**
- Parking an Activity asks what happens to its children and un-parking restores the Activity at the end of the board.
- Archived Cards are hidden, restorable and excluded from reports; deleting is permanent after confirmation and creates an Activity Log entry. [ASSUMPTION: parked Cards are also excluded from reports]

#### FR-50: Card fields
A Card carries title, description, Workflow Status, priority, business value, effort, estimate, color, assignee, Release, Personas, Annotations, Source Links, Attachments and history; the fields are editable in the detail modal and visible per View settings. Realizes UJ-4.

**Consequences (testable):**
- Estimates use the Story Map's unit and priority values come from one central definition.
- Editing any field advances the Card root version; owned links participate in the same transaction. History rows retain the accepted same-actor/session 60-second coalescing rule, so a new version number does not require a separate history row per Save (FR-47, architecture AD-7, ADR 0002).

### 4.4 Views and navigation
**Description:** Each View is a separate, addressable page with its own grouping and emphasis over the same Story Map. Realizes UJ-1, UJ-4.

**Functional Requirements:**

#### FR-13: Addressable navigation
Every main menu entry and every View is a real link with its own URL, an active state and working browser history. Realizes UJ-1.

**Consequences (testable):**
- Reloading any View URL reopens the same View.
- A decorative, non-clickable navigation element is a defect.

#### FR-14: Six Views with distinct focus
The user can switch between Discovery, Tree, Planning, Backlog, Tracking and Timeline Views, and to the Slices and Graph Views (FR-62, FR-63). Realizes UJ-1, UJ-4.

**Consequences (testable):**
- Discovery shows the three levels with Personas and role labels, retaining Release lanes, Workflow Status, estimate and priority. Notes remain visible at legal root, Activity or Step positions. Delivery attributes are intentionally visible (decision 2C, 2026-10-17); this supersedes the earlier no-delivery-attributes restriction.
- Planning shows Releases as swimlanes with priority, business value and effort editable on the Card.
- Backlog emphasizes status, estimate, description preview and GitHub and Source link indicators.
- Tracking shows a Kanban by Workflow Status with Release summary.
- Timeline shows Release bars with editable dates and progress.

#### FR-15: Card detail as deep-linkable modal
The user can open a Card in a modal whose open state is in the URL and edit its description with a Rich Text editor that stores Markdown. Realizes UJ-4.

**Consequences (testable):**
- Opening `?card=<id>` on a View URL opens that Card's modal after a reload.
- Saved descriptions remain valid Markdown when pushed as a GitHub Issue body.

#### FR-16: Full-feature visibility
All non-developer pages (Sources, Releases, Roadmaps, AI/MCP and Activity/Audit) are reachable from the main navigation without an environment switch. Export actions remain reachable in their existing View toolbars and Activity surfaces; no dedicated Export route or rail entry is required (decision 6B, 2026-10-17). Realizes UJ-1. Addresses S5.

**Consequences (testable):**
- No user-facing feature is hidden behind an environment variable; developer-only tooling is documented as such; unfinished Later-tier features are labeled experimental instead of hidden.

#### FR-47: Card history
Every change to a Card creates a Card Version, and the user can view versions with their field changes. Realizes UJ-5.

**Consequences (testable):**
- Each Card Version shows actor type (human, agent, GitHub sync), time and changed fields.
- Restoring an older version is not part of v1.0. [NON-GOAL for v1.0]

#### FR-48: Attachments
The user can attach files to a Card and remove them. Realizes UJ-1.

**Consequences (testable):**
- Attachments are stored in the Project folder and included in the Project archive.
- The maximum file size is enforced and shown before upload.

#### FR-58: Live board updates
The board reflects changes made by Agents, GitHub sync or another browser tab without a manual reload. Realizes UJ-3, UJ-7.

**Consequences (testable):**
- A change committed by an Agent appears in an open View within 2 seconds.
- An editor holding unsaved text is not overwritten by an incoming update.
- After a restore, all open Views reload.

#### FR-59: Concurrent edits are never lost silently
When a human and an Agent change the same object, the later save is rejected with the current state and the user or Agent decides. Realizes UJ-3.

**Consequences (testable):**
- Saves carry the version they are based on; a conflict lists every conflicting operation and applies nothing partially.
- The UI offers reload or resubmit.

### 4.5 Customization
**Description:** The user shapes Workflow Statuses, Personas, Annotations and Story Templates. Realizes UJ-1.

**Functional Requirements:**

#### FR-17: Manage Personas, Annotations, Workflow and Templates
The user can create, edit and delete Personas, Annotations, Workflow Statuses and Story Templates in the UI. Realizes UJ-1.

**Consequences (testable):**
- Every delete operation available in the API is reachable in the UI.
- Renaming a used Workflow Status updates the affected Cards in its effective project/map scope atomically, with Card base-version checks, history and audit. Deleting a used status requires a distinct valid replacement from that effective scope; null status is not allowed. Ambiguous same-name scope collisions are rejected before writes rather than guessed.
- Deleting a used Persona or Annotation confirms unlinking and updates affected Card versions atomically. Deleting a Story Template never rewrites descriptions already copied into Cards.

#### FR-18: Story Map Templates
The user can start a Story Map from a template including colors, Annotations, Personas, Workflow and sample Cards. Realizes UJ-1.

**Consequences (testable):**
- The sample map from FR-6 is provided through the same template mechanism.

### 4.6 Sources and traceability
**Description:** Documents and tickets become Cards without losing where they came from. Realizes UJ-2, UJ-3.

**Functional Requirements:**

#### FR-19: Markdown and TXT source import with chunking
The user can import Markdown and TXT files as Source Documents that are split into Source Chunks with stable IDs and locators. Realizes UJ-3.

**Consequences (testable):**
- Re-importing an unchanged file creates no duplicate Source Chunks.
- Each Source Chunk shows file and heading or paragraph index.

#### FR-20: Source Links on Cards
The user or an Agent can link Cards to Source Chunks, GitHub Issues or notes, and every Card shows its provenance in the detail view. Realizes UJ-3.

**Consequences (testable):**
- Every Card created by an Agent or Proposal has at least one Source Link or is marked as an inference.
- The detail view reads, for example, "from Requirements.md, section 3.2".

#### FR-21: Source coverage view
The user can see which Source Chunks are linked to Cards and which are not. Realizes UJ-3.

**Consequences (testable):**
- The view lists unlinked Chunks and a coverage ratio per Source Document.

#### FR-22: Single-ticket import in Card creation
The user can create a Card by entering a ticket URL or ID; the Card is filled with title and description and gets a Source Link to the ticket. Realizes UJ-2. Addresses S12.

**Consequences (testable):**
- The flow works for a GitHub Issue URL and reports a clear error for an inaccessible ticket.
- The created Card shows the Issue number and links to it.

### 4.7 Releases and Roadmaps
**Description:** Stories are sliced into Releases with tracking and reporting; Roadmaps show larger initiatives. Realizes UJ-4.

**Functional Requirements:**

#### FR-23: Release management and reporting
The user can create Releases with name, goal, start and end date and status, assign Stories by drag-and-drop or bulk action and read a Release summary with counts, estimates, status distribution and unestimated items. Realizes UJ-4.

**Consequences (testable):**
- Release counts, estimate sums and status distributions use visible Stories only, excluding Notes, Activities, Steps and parked/archived ancestry; every unestimated Story is listed. An estimate of 0 is estimated. No additional all-Card delivery metric is required.
- Releases use the existing released/not-released state. The default Release list, Planning and Tracking show open Releases; an explicit show-all path reveals released ones without unassigning Cards or deleting history. Unscheduled Stories remain accessible (decision 5A). Discovery retains Release lanes under decision 2C; this default-focus change does not add Later per-View settings.

#### FR-24: Roadmaps
The user can create Roadmaps with free columns, swimlanes and Roadmap Cards that reference Releases, Activities or Stories and show progress. Realizes UJ-4.

**Consequences (testable):**
- Progress bars derive from referenced Cards and update when those Cards change.
- Roadmap types Simple, Release Roadmap and Epic Roadmap are selectable.

#### FR-25: Release notes and slicing
The user can generate release notes from completed Cards and request the built-in happy-path slice as a Proposal. BMad supplies other slice strategies as generic Release/assignment ChangeSets; the product provides the mechanism without additional strategy algorithms. Realizes UJ-3, UJ-4.

**Consequences (testable):**
- Slicing never writes directly; it returns a ChangeSet.

### 4.8 GitHub integration
**Description:** GitHub Issues and Milestones stay linked with Cards and Releases in both directions with visible state and no silent overwrites. Realizes UJ-2, UJ-4.

**Functional Requirements:**

#### FR-26: Guided GitHub connection
The user can connect GitHub in the UI by GitHub CLI login or a token entered in a guided dialog that verifies the connection and explains what the token is used for. Realizes UJ-2. Addresses S2, S8.

**Consequences (testable):**
- No manual editing of `.env` is needed to connect, and connecting turns the `github` switch on after an explicit confirmation.
- The human dialog offers a pasted token or instructions for `gh auth login` in the user's own terminal plus Recheck; the app does not launch an interactive login.
- An explicit human Verify may contact the candidate repository while `github` is off. It saves nothing and leaves the switch unchanged; after success, the UI states that GitHub remains off and blocks import, sync and push until explicit Connect. No MCP/background/ordinary sync call inherits this exception (ADR 0008, D1/D4).
- A failed check names invalid credentials, unavailable repository/permission, rate limit or network and the fix, without exposing secrets or claiming a masked 404 proves deletion. The dialog identifies the operational credential source when CLI precedence differs from the pasted candidate.

#### FR-27: Push, import and sync with Dry Run
The user can push Cards or whole Releases as GitHub Issues and Milestones, import Issues into an unscheduled area and synchronize title, description, state and labels; every write is previewed by a Dry Run. Realizes UJ-2, UJ-4.

**Consequences (testable):**
- Every outbound effect, including quick Sync and local-wins conflict resolution, uses a persisted Dry Run listing explicit Issue and Milestone effects. Only human UI confirmation of that exact plan id authorizes writes; changed local/remote inputs, connection/mapping or Restore require re-review. No setting or Agent ChangeSet approval bypasses it.
- Per-effect intent is durable before each modifying call; partial results retain actual links/errors, and explicit resume reconciles stable markers rather than blindly creating duplicates. Remote effects are not rolled back by SQLite or Restore.
- Pushed Issues use connection-level Activity/Step/Story mappings to available repository-native issue types; imported native types are retained. Invalid mapping blocks writes; title-prefix guessing is removed (D5). Configurable export labels remain and Notes are excluded. Local Workflow Status is never written into the Issue body.
- New imports retain hierarchy/source/type but start Unscheduled with no Release creation/assignment. Release assignment occurs only on explicit later sync; the initial null baseline must not imply remote Milestone removal (D2). All incoming domain changes, including human-triggered import/pull, use actor `github` ChangeSets with initiating identity, restore point on apply and atomic audit.
- Only status-mapped and opted-in Annotation labels synchronize bidirectionally; unrelated remote labels survive, while export/structure labels remain adapter-managed (D6). Existing effective scoped Annotation names supply the mapping; unknown remote labels do not auto-create Annotations and assignment removal does not delete a reusable definition. Release/Milestone identity is durable across rename; Milestone name, goal/description, due date and open/released state are previewed explicitly. Iteration remains inbound-only.

#### FR-28: Conflict handling and Sync Health
The user can see and resolve conflicts as diffs and review a Sync Health dashboard (unsynced, conflict, stale, deleted remote, deleted local). Realizes UJ-4.

**Consequences (testable):**
- A conflicting edit is never overwritten without an explicit successful choice. Read-only forbids GitHub writes but retains ordinary three-way merge/conflict protection; local-only edits remain unsynced (D3).
- One unresolved conflict per canonical ref/field retains reviewed values through repeated refresh/convergence. Only the disputed field is blocked in UI and server writes. Version and sync conflicts use the same existing ConflictReport wire envelope. Cancel/failure of a local-wins Dry Run leaves the conflict open.
- Health counts/listed identities agree with durable conflicts, canonical baselines and scoped deleted-local history without a network call. Provider/auth/network errors are not treated as proven deletion.
- The Card-to-Issue link is an adapter-owned `github` external reference; sync state is keyed by its id and source-only evidence does not grant active sync ownership.

#### FR-29: Two-way navigation
The user can jump from a Card to its Issue and from an Issue back to the Card. Realizes UJ-2.

**Consequences (testable):**
- Issue body contains one delimited machine-added reference footer naming Story Map and Card Key, a stable reconciliation marker and a clickable loopback Card deep link. Authored Markdown is preserved and generated footer text is excluded from local description/merge baselines.

#### FR-55: Provider extension points
A developer can add a work item system or a publishing target by implementing one provider interface and registering it, without changing existing providers. Realizes UJ-6.

**Consequences (testable):**
- The work item provider and publish provider interfaces are documented in the architecture spine (AD-15); GitHub is the only provider shipped and no publish provider ships.
- The existing WorkItemProvider lives in `packages/github/src/providers/work-item-provider.ts`; PublishProvider is interface-only in `packages/core/src/publishing/publish-provider.ts`.
- Adding an adapter module requires only three production integration sites: contract enum, registry and credential registration. An isolated test-provider exercise also runs shared import/conflict/confirmed-plan flows without changing GitHub implementation/tests or shared orchestration. Unknown runtime ids are refused explicitly; the fake provider does not ship.

### 4.9 Agent interface (MCP) and ChangeSets
**Description:** Agentic Story Mapper exposes its capabilities as an MCP server. Agents read and write directly by default, a protection switch turns writes into proposals, and proposed ChangeSets need human approval by default; a human-controlled `allowAgentApproval` flag can explicitly permit Agent approvers. Realizes UJ-3, UJ-6, UJ-7.

**Functional Requirements:**

#### FR-30: Complete MCP tool surface
An Agent can discover Projects, create Story Maps, read and change Cards, Releases, Personas, Roadmaps, Annotations, Workflow Statuses and Story Templates, import and read Source Documents, move and archive Cards, list ChangeSets and apply an already approved one, run reports and exports, and use the GitHub read, push, import and sync tools. Realizes UJ-3, UJ-7.

**Consequences (testable):**
- The tool inventory in `docs/mcp-tools.md` matches the registered tools exactly, checked by an automated test.
- Every UI capability that reads or changes Story Map data has an MCP equivalent; the only exceptions are the safety switches, connector credentials, ChangeSet rejection, restore, restore points on demand and archive import, which stay human-only and are listed in `docs/mcp-tools.md`. ChangeSet approval is human-only by default, with conditional Agent approval through the flag policy of Story 4.6.

#### FR-31: Proposal tools and ChangeSets
An Agent can request a map from a Source Document, backlog grooming and release slices; each returns a ChangeSet with sources and rationale and writes nothing. Realizes UJ-3.

**Consequences (testable):**
- The user can apply a ChangeSet selectively and discard the rest.
- ApplyChangeSet supports every operation and entity combination that proposal tools can emit.

#### FR-32: Agent access, protection and approval
Agents can use the tool surface by default; the user controls this with the safety switches, and every tool call obeys the same rules whether it arrives over MCP or the HTTP tool-call route the UI uses. Realizes UJ-3.

**Consequences (testable):**
- The switches are `agentAccess` (on by default), `github` (off by default), `agentProtection` (off by default) and `allowAgentApproval` (off by default); only a human can change them, and every change is logged.
- Domain-writing tools apply directly after a restore point unless the call sets `apply=false` or `agentProtection` is on; then the call is stored as a proposed ChangeSet.
- With `agentAccess` off a tool call is rejected and logged, on both routes.
- A human may approve its own UI-generated proposal. Approval is human-only by default; a human-controlled Project flag `allowAgentApproval` (default `false`) may permit Agent approval. Rejection, restore and changes to the flag remain human-only. Actual approving actor identity is recorded. With the flag on, an Agent may approve its own or another actor's ChangeSet. Approval can occur under protection, but `agentProtection` always prevents Agent apply; a human may still apply. Turning the approval flag off blocks new Agent approvals and preserves recorded prior approvals.
- The Agent panel states that the switches guard a cooperative Agent and are not a security boundary against local processes.

#### FR-33: Tool-call audit
Every tool call records host, tool, input hash, output hash, affected objects and time. Realizes UJ-5.

**Consequences (testable):**
- The audit area filters entries by actor type and tool name.

#### FR-34: Transport and client configuration
The MCP server is reachable over Streamable HTTP on the app's own port at `/mcp`, and a stdio bridge forwards to it for hosts that only speak stdio. The user can copy ready-to-paste client configuration for Claude, Cursor and VS Code. Realizes UJ-3.

**Consequences (testable):**
- Requests with a non-loopback Host or a foreign Origin are rejected, and the server never binds to a non-loopback address by default.
- Generated configuration works without editing paths in the documented setup, including when the default port is taken.

#### FR-51: Agent-submitted ChangeSets
An Agent can submit its own ChangeSet: a batch of creates and updates covering Story Maps, Cards at all levels with parent relations, Releases with Card assignment, Personas and Source Links. Realizes UJ-3, UJ-7.

**Consequences (testable):**
- A single submission of 200 Cards creates one ChangeSet; with `apply=false` or protection on it applies nothing.
- An invalid reference (unknown parent or Release) rejects the whole submission and names the offending operation.
- The submission records the Agent host as actor.

#### FR-52: External references and idempotent updates
A Card, Release and Persona can carry an external reference, and an Agent can address objects by it instead of by internal ID. Realizes UJ-7.

**Consequences (testable):**
- Submitting the same external reference twice updates the existing object and never duplicates it.
- An external reference is unique per Story Map, entity type and system, with at most one reference per system per entity, shown on the Card and searchable.

#### FR-53: Visual ChangeSet preview
The user can review a proposed ChangeSet on the board before applying it: added, changed, moved and removed Cards are marked in place, Slices show as swimlanes, and single operations can be deselected. Realizes UJ-3, UJ-7.

**Consequences (testable):**
- The preview marks each operation type distinctly and is available at least in the Tree and Planning Views.
- Deselected operations are not applied, and applying is atomic (NFR-4).
- Directly applied ChangeSets are reviewable afterwards through the Activity Log and reversible through restore points.

### 4.10 AI-assisted Proposals
**Description:** Product context and reusable function templates let the user or an Agent produce structured proposals. Agentic Story Mapper contains no LLM provider; intelligence comes from the connected Agent, and built-in logic is deterministic. Realizes UJ-3.

**Functional Requirements:**

#### FR-35: Product context and function templates
The user can define a Product Context (type, purpose, key features, and optional users, platform, glossary, non-goals) and manage AI function templates (personas, goals, steps, stories, acceptance criteria, INVEST check, splitting, estimation, gap analysis) that are stored in the Project. Realizes UJ-3.

**Consequences (testable):**
- Templates persist in the database and are exposed to Agents as MCP prompts.
- Every template output appears as a ChangeSet, never as a direct write.

### 4.11 Privacy, audit and export
**Description:** The user controls outbound access, sees what happened and takes data out in useful formats. Realizes UJ-1, UJ-5.

**Functional Requirements:**

#### FR-36: Safety switches
The user sees and changes the safety switches in the app, the current state is visible on every page, and changes are logged. Realizes UJ-5.

**Consequences (testable):**
- With `github` off, GitHub is never contacted; with `agentAccess` off, `/mcp` and agent tool calls are rejected.
- The UI states that an enabled Agent may forward retrieved context to its own provider.
- No stored privacy mode and no Strict Local label exist.

#### FR-37: Activity Log and audit export
The user can review the Activity Log (human, agent, GitHub, system) with diffs and export it. Realizes UJ-5.

**Consequences (testable):**
- The export lists GitHub writes, Agent writes and external calls with actor, time and affected objects.

#### FR-38: Export center
The user finds all exports (HTML, PNG, PDF, JSON, Markdown, CSV, audit, GitHub-ready Issues) in one place with a short explanation per format. Realizes UJ-1. Addresses S10.

**Consequences (testable):**
- Every export format is reachable from one page and from the current View where relevant.

#### FR-39: Reports
The user can generate backlog health (missing description, acceptance criteria, estimate, source, GitHub link, stale), source coverage and Release reports. Realizes UJ-4.

**Consequences (testable):**
- Each report links from a finding to the affected Card.

### 4.12 Open-source release readiness
**Description:** The repository is safe and welcoming to publish, and demonstrates professional agentic coding. Realizes UJ-6.

**Functional Requirements:**

#### FR-40: Legal and community files
The repository contains a license file, a contribution guide, a security policy, a code of conduct and issue and pull request templates. Realizes UJ-6.

**Consequences (testable):**
- `LICENSE` is the MIT license; publication is private and independent of the employer (maintainer decision 2026-10-19). No employer permission or name checks are required. The maintainer supplies private details later; explicitly labeled `[COPYRIGHT_HOLDER]`, `[PRIVATE_SECURITY_CONTACT]` and `[CONDUCT_CONTACT]` placeholders are permitted during implementation, never invented identities or contact addresses. `SECURITY.md` explains private vulnerability reporting and makes an absent channel visibly inactive. Required details must be completed before publication.
- Dependency licenses are checked for compatibility with the chosen license.

#### FR-41: Public documentation in English
README, runbook and architecture documents are English, current and describe the real install path per operating system. Realizes UJ-1, UJ-6.

**Consequences (testable):**
- README quickstart is executed from a fresh clone on each supported operating system before release.
- Every document that links to a removed document is updated.

#### FR-42: Continuous integration
Every pull request runs typecheck, tests, build and a release-hygiene check on all supported operating systems. Realizes UJ-6.

**Consequences (testable):**
- A failing check blocks merging.
- Hygiene check fails on tracked secrets, `.sqlite` files, user data and non-English source strings [ASSUMPTION: last item enforceable by a lint rule].

#### FR-43: Repository history and content audit
Before the first public push, the repository history and tracked files are audited for secrets, personal data, customer or employer specific content and unlicensed material. Realizes UJ-6.

**Consequences (testable):**
- The audit report lists findings and their resolution; unresolved findings block publication.
- Company-specific tooling and examples are removed or made generic.
- All employer-specific references are removed from current tracked files, including source, defaults, configuration, instructions, planning artifacts and publishable evidence; this includes the company identifier named by the maintainer. Historical occurrences remain subject to the final history-disposition audit.
- No code, configuration, environment variable, documentation or template outside the change history retains the names or implementation identifiers of removed providers.
- `docs/story-mapping-playbook.pdf` is either proven redistributable or removed.
- `tools/`, `.agents/skills`, `.claude/skills`, `docs/templates`, `.github/ISSUE_TEMPLATE` and `.cursor/rules/card-authoring.mdc` are reviewed; team-specific content is generalized, translated or removed.
- The route for the history audit result (rewrite history or publish from a fresh repository) is decided last, immediately before publication (Open Question 1).
- The exact final publication candidate is rescanned after the contributor material and history disposition; required private-detail placeholders and incomplete/stale audit results block publication.

#### FR-44: Versioned releases
The project publishes tagged, semantically versioned releases with release notes and a documented upgrade path for Project folders. Realizes UJ-6.

**Consequences (testable):**
- Opening a Project folder created by an older release migrates it or refuses with instructions; folders created by prototype builds are refused.

#### FR-45: Agentic-coding reference material
The repository documents how it is built with agents: instruction files, planning artifacts, review and check workflow, and how a contributor reproduces it. Realizes UJ-6.

**Consequences (testable):**
- A contributor can follow the documented workflow end to end on a small change.

### 4.13 Agent-driven planning with the BMad Method
**Description:** A planning Agent publishes epics and stories to a Story Map, the user reviews and adjusts the cut visually, and later plan changes and delivery status flow in by external reference. The product stays methodology-agnostic; BMad support is a recipe on generic capabilities. Realizes UJ-7.

**Functional Requirements:**

#### FR-54: BMad Method round trip
An Agent running BMad Method planning skills can publish its epics and stories to a Story Map and refresh them when the plan changes. Realizes UJ-7.

**Consequences (testable):**
- A documented recipe (Agent instructions plus mapping rules) turns epics and stories into one ChangeSet: Epic to Activity, one Step per Epic named like the Epic, Story to Story, MVP or sprint slice to Release, acceptance criteria into the Card description, each Card with an external reference and a Source Link to the file it came from.
- Re-running the recipe after the source files changed produces a ChangeSet that updates changed Cards, adds new ones and proposes archiving removed ones, without duplicates (FR-52).
- A ChangeSet that would overwrite a Card edited by a human since the last sync is marked as a conflict.
- The product contains no BMad-specific parser; the recipe uses only generic tools (FR-30, FR-51).

#### FR-56: Delivery status from Agents
An Agent can set Workflow Statuses for many Cards in one call by external reference, so that the status of the source method shows on the board. Realizes UJ-7.

**Consequences (testable):**
- An Agent can create or adapt the Workflow Statuses of a Story Map to match the source method.
- One call updating 100 Cards is atomic and writes one Activity Log entry per Card.

### 4.14 Plan visualization and drift
**Description:** The map is not only a board but a way to judge whether a cut of epics and stories is sound: what depends on what, what each Slice holds, what changed since the user last looked, and where the map and the source plan differ. Realizes UJ-3, UJ-7.

**Functional Requirements:**

#### FR-60: Plan drift report
An Agent can request, per external system, the differences between the Story Map and the state last synchronized from that source: Cards moved between Slices, changed titles or descriptions, changed status, added and removed Cards. Realizes UJ-7.

**Consequences (testable):**
- The report is computed from external references and their synced versions and is available in the UI and as an MCP tool.
- After an Agent updates its source and publishes again, the report is empty.
- Agentic Story Mapper never writes to the source files.

#### FR-61: Dependencies between Cards
The user or an Agent can declare that a Card depends on another Card; dependencies are set through the same ChangeSet mechanism as other changes. Realizes UJ-7.

**Consequences (testable):**
- A Dependency links two Cards of the same Story Map, must stay acyclic (a cycle is rejected and named), and shows as a badge on both Cards.
- Dependencies can be created and updated by external reference, so a prerequisite list from a planning file imports without duplicates.

#### FR-62: Slices view
The user can view Releases as Slices on one board: per Slice the Stories, count, estimate sum, status distribution and blockers. Realizes UJ-4, UJ-7.

**Consequences (testable):**
- A Story whose prerequisite sits in a later Slice, or in no Slice, is flagged as a dependency violation in the Slices view and in the Planning view.
- Two recorded Plan states of the same Story Map can be compared side by side as Before and After, showing added, removed and moved Stories across their Release Slices (maintainer clarification, 2026-10-13). Capture time and state identity are explicit; recorded membership survives later edits and reopening. Stable Story identity determines additions/removals; a Release assignment change determines movement, including scheduled/unscheduled transitions. Two current Release lists are not the comparison baseline.
- Dragging a Story between Slices updates the flags immediately and records a human edit.
- Progress per Activity across Slices is visible.

#### FR-63: Dependency graph view
The user can see Cards as a graph with Dependency edges, filter it by Activity, Slice, status or assignee, and list all blocked Cards. Realizes UJ-7.

**Consequences (testable):**
- A graph of 200 Cards with their edges renders and stays interactive within 100 ms per interaction after layout.
- Selecting a Card highlights its prerequisites and dependents.
- The blocked list names each blocked Card with its open prerequisite.

#### FR-64: What changed since I looked
The user sees what Agents, GitHub sync and other tabs changed since they last looked, grouped by actor and affected Card, and can mark it as seen. Realizes UJ-3, UJ-7.

**Consequences (testable):**
- Changed Cards are marked on the board until marked seen; the panel opens with the count per actor.
- The panel reads from the Activity Log and lists a change within 2 seconds of its commit (FR-58).
- Undoing an Agent session is reachable from the panel through restore points (FR-57).

## Cross-Cutting NFRs

- **NFR-1 Performance:** record reproducible measurements on a 1,000-Card map. For Epic 6, map read 150 ms, committed single-Card mutation 30 ms, board interaction 100 ms and search/filter 300 ms are diagnostic reference values, not pass/fail or CI timing gates (decision 9C, 2026-10-17). Record fixture, environment, measured boundary, cold/warm context and every raw sample; binding performance gates require a separate later decision. Existing earlier-story gates and acceptance evidence are not retroactively changed. ETags/conditional map reads are deferred beyond Epic 6 (decision 7C). Accessibility, correctness and data-integrity gates remain binding.
- **NFR-2 Privacy:** no network connection without an enabled Connector or Agent.
- **NFR-3 Security:** loopback binding by default, tokens never logged or persisted in Project data, agent writes governed by the protection switch and logged, input validation on every HTTP and MCP boundary.
- **NFR-4 Data integrity:** conflicts are never resolved silently; ChangeSet application is atomic per ChangeSet.
- **NFR-5 Accessibility:** every drag-and-drop action has a keyboard alternative; interactive elements have accessible names Target WCAG 2.1 AA for core flows on desktop viewports of 768 px and wider; Reflow (1.4.10) is excluded (decision 2026-09-30, see the UX contract)..
- **NFR-6 Portability:** Windows, macOS and Linux on Node 24; no OS-specific requirement in the core install path.
- **NFR-7 Maintainability:** the schema contracts are the single source for API, MCP and UI; domain logic stays free of network and database effects; no source file exceeds 750 lines or 100 KB and no function exceeds 50 lines.
- **NFR-8 Quality gate:** automated tests cover MCP tools, ChangeSet application, GitHub sync conflict handling and Project migration; every package that contains logic has tests, and CI reports coverage per package against a floor set in architecture.

## 5. Non-Goals (Explicit)

- Agentic Story Mapper is not a SaaS, has no accounts, billing or hosted workspace, and collects no telemetry.
- It is not a multi-user collaboration tool; there is no role model or real-time co-editing in v1.0.
- It does not embed an LLM provider; it does not call model APIs itself.
- It does not replace GitHub Issues as the delivery system; Story Maps plan and link, GitHub tracks.
- It does not ingest email, Slack, Zapier, feedback portals or public sharing links.
- It does not generate epics or stories; planning Agents do. It is not tied to one method: BMad Method support is a recipe on generic capabilities.
- GitHub is the only bundled Connector.
- It is not a replacement for GitHub Projects or Issues as a work tracker; it visualizes and adjusts the plan that Agents work from.
- Product scope follows the planning workflows in this PRD rather than third-party feature parity.

## 6. Release Scope

### 6.1 In Scope for v1.0
- The Core tier of section 6.3, with the complete MCP tool surface (FR-30) and the Views of FR-14, FR-62 and FR-63. Later-tier items are not release blockers.
- Installation and first-run flow on Windows, macOS and Linux.
- Open-source release readiness (FR-40 to FR-45).

### 6.2 Out of Scope for v1.0
- Other bundled work-item or wiki publishing connectors: outside the product scope, not deferred release work. Custom integrations use the provider extension points (FR-55).
- DOCX, PDF, XLSX, HTML and image import. Deferred; the importer interface stays reserved.
- Built-in LLM provider layer.
- LAN multi-user.
- Restoring an older Card Version.

### 6.3 Priority tiers
- **Core:** everything that carries the loop plan, adjust, implement with an Agent, plus release readiness: FR-1 to FR-11, FR-13 to FR-17, FR-19, FR-20, FR-22, FR-23, FR-25 to FR-37, FR-40 to FR-47, FR-49 to FR-64, and the Views of FR-14 except Timeline.
- **Later:** FR-12 (Focus Release, per-View display settings), the Timeline View of FR-14, FR-18 (Story Map templates chosen by the user; the sample map of FR-6 stays Core as seed data), FR-21 (source coverage view), FR-24 (Roadmaps), FR-38 (export center consolidation, PNG and PDF), FR-39 (Reports), FR-48 (Attachments). Existing implementations of Later items ship only if they meet the quality bar; otherwise they are labeled experimental and take no v1.0 effort.
- **Validation gate:** after the Core foundations (epic topics T1 to T4) and before the Core views and the visualization requirements are built out, a thin slice runs as five browser-controlled BMad workflow simulations on disposable Projects: publish a cut, review it live, adjust it and bring fixture sources in line using the generic recipe. No Epic 5 drift report is required for this gate. The recorded functional findings inform remaining scope; simulations do not validate external demand. User-approved change, 2026-10-10.

## 7. Success Metrics

**Primary**
- **SM-1**: Time from fresh clone to a running app with the sample map open is at most 10 minutes on each supported operating system, measured by a scripted clean-machine run. Validates FR-4, FR-5, FR-6. [ASSUMPTION: target]
- **SM-2**: A complete agent round trip (agent submits a map from a document with protection on, user reviews and approves the ChangeSet, Activity Log names both) works end to end in an automated test and is documented. Validates FR-30, FR-31, FR-32.
- **SM-3**: Every pull request to the default branch passes the quality gate on all operating systems, and the first tagged release publishes cleanly. Validates FR-42, FR-44.
- **SM-7**: A BMad epics-and-stories set of at least 30 Stories appears as one reviewed ChangeSet and, after a re-run with changes, updates without duplicates, verified by an automated test. Validates FR-51, FR-52, FR-53, FR-54. [ASSUMPTION: 30-Story size]
- **SM-4**: An outside contributor can reproduce the documented agentic workflow on a small change without maintainer help. Validates FR-45.
- **SM-8**: At least 90 percent of Agent-applied changes are not rolled back within the same session, measured in the validation slice and in the Activity Log. Validates FR-51, FR-57. [ASSUMPTION: 90 percent target]
- **SM-9**: From a finished BMad epics-and-stories set to a reviewed board takes at most 5 minutes in the validation slice. Validates FR-53, FR-54, FR-62. [ASSUMPTION: 5-minute target]
- **SM-10**: After a human moves a Story to another Slice, one drift report call lets an Agent bring the source in line, and a second publish shows no drift, verified by an automated test. Validates FR-60.

**Secondary**
- **SM-5**: The release-hygiene audit closes with zero unresolved findings. Validates FR-43.
- **SM-6**: All usability findings rated high in `docs/usability-report.md` (S1, S2, S3, S5, S8, S12) are resolved or explicitly deferred with a reason. Validates FR-4, FR-5, FR-16, FR-22, FR-26.

**Counter-metrics (do not optimize)**
- **SM-C1**: Stars, downloads and clone counts; never trade safety, privacy or documentation quality for reach. Counterbalances SM-4.
- **SM-C2**: Number of clicks to apply a ChangeSet; do not remove review or approval steps to reduce friction. Counterbalances SM-2.
- **SM-C3**: Install speed; do not skip the version and hygiene checks to shave minutes. Counterbalances SM-1.
- **SM-C4**: Number of Views and features; each View must serve a step of the plan, adjust, implement loop, so do not add Views to raise usage. Counterbalances SM-9.

## 8. Open Questions

1. **Repository history:** rewrite the Git history or publish from a fresh repository? Commits with employer-specific tooling exist. Decided last, immediately before publication, after every other item is done (FR-43).
2. **License and name:** MIT retained; the maintainer renamed the product to Agentic Story Mapper on 2026-11-08. The original 2026-10-19 decision retained the name StoryMapper: publication is private and independent of the employer; employer permission and name checks are not required. Private details may remain explicit placeholders during implementation and are supplied by the maintainer before publication. All employer references are removed from the publication surface under FR-43.
3. **Baseline gap analysis:** which of FR-8 to FR-15 does the current UI already satisfy? Needs a verified pass before epics are written.
4. **BMad mapping details:** resolved 2026-09-29: one Step per Epic named like the Epic; the recipe reads the epics file, the story files and the sprint status file; a Card edited by a human since the last sync is flagged as a conflict and never overwritten (FR-54).
5. **Agent change subscriptions:** should Agents be able to subscribe to changes or only poll? [NOTE FOR PM: post-1.0.]
6. **Demand validation:** not established by browser simulation. Real-user recruitment is no longer an Epic 4 gate requirement (user decision 2026-10-10); external-demand validation remains an open product question. Simulated SM-8/SM-9 measurements are defined by Story 4.13.

## 9. Assumptions Index

- FR-49 — parked Cards are excluded from reports.
- SM-7 — a 30-Story set as the test size.
- SM-8 — 90 percent of Agent changes not rolled back.
- SM-9 — 5 minutes from planning set to reviewed board.
- FR-42 — non-English source strings are enforceable by a lint rule.
- NFR-5 — WCAG 2.1 AA target for core flows.
- SM-1 — 10-minute install target.
- Global (no inline tag) — single-user local operation, no built-in LLM provider, English UI, Windows/macOS/Linux support, non-Markdown imports outside v1.0.

## Changelog

- 2026-11-08 v9: Remove vendor comparisons and obsolete connector descriptions from the active product definition; distinguish historical planning baselines from current operating guidance. Requirement IDs and acceptance criteria are retained.

- 2026-10-19 v8: Applied accepted private independent MIT publication, waived employer/name-check prerequisites, allowed explicit private-detail placeholders, and required full employer-reference cleanup plus final-candidate audit.

- 2026-10-18 v7: Applied accepted Epic 7 decisions D1–D6, bound remote-plan confirmation, canonical GitHub identity and coherent incoming ChangeSet/conflict/health acceptance; see ADR 0008 and epic-7-preparation.md.

- 2026-10-17 v6: Incorporated all nine accepted Epic 6 selections; clarified retained Discovery delivery fields, creation counting, atomic bulk/customization operations, Story-only delivery summaries, open Release defaults and existing Export locations. Deferred ETags and binding Epic 6 performance gates; preserved earlier-story evidence and history coalescing.
