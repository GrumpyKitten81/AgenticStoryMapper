# Reconcile: PRD vs Architecture Spine

Inputs: `prd.md` (FR-1..56, NFR-1..8, 4.13, UJ-1..7), `epic-topics.md`, `ARCHITECTURE-SPINE.md`, `.memlog.md`. Method: compared each AD's `Binds:` line and the capability map against every FR, NFR and Consequence bullet.

## 1. Requirements with no owner

Legend: NONE = no AD binds it, and the capability map has no row or a misleading row. THIN = a capability row exists but no AD or component decides anything.

| Req | Status | What is missing |
| --- | --- | --- |
| NFR-1 Performance | NONE | No AD binds it. Only the "1,000-Card fixture" appears in Testing. Undecided: search and filter client-side or server-side, 100 ms and 300 ms budgets, indexes. FR-10 searches comments, Source Links and GitHub links. |
| NFR-2 Privacy (no network without Connector or Agent) | NONE | No AD or test states it. FR-1's second consequence ("no outbound requests when idle") is likewise unowned. |
| NFR-5 Accessibility | NONE | No AD binds it. FR-8 (role label, not color alone) and FR-9 (keyboard path and form path for every drag-and-drop) have no rule. AD-17 covers only routing, state and strings. |
| NFR-8 Quality gate | PARTIAL | The PRD says "coverage per package against a floor set in architecture". The spine sets no floor and no coverage reporting. AD-16 binds NFR-8 but only for size limits. Nothing requires tests in every logic package. |
| FR-35 Product Context and AI function templates | THIN, effectively NONE | The capability row (FR-30..35) points at `adapters/mcp`, and `packages/mcp` is "tool names and input schemas only". Missing: persisting Product Context and templates in the database, exposing templates as MCP prompts, and the fate of the deterministic template logic after `packages/ai` is folded into `core` (AD-19). The ERD has no entity for them. |
| FR-33 Tool-call audit | PARTIAL | AD-3's Activity Event records actor type, actor id or host, and session id. Missing: tool name, input hash, output hash, and audit of read-only tool calls. AD-3 audits mutations and AD-5 audits rejections, so "every tool call" and UJ-5's "every agent tool call" are not met. The audit area cannot filter by tool name. |
| FR-37 Activity Log audit export | THIN | No AD or component owns an export. It lists "external calls" (GitHub) as well as agent writes. |
| FR-38 Export center, FR-39 Reports | THIN, wrong owner | The map files them under `application/activity` and `adapters/events`. No AD decides client-side PNG/PDF (html2canvas, jspdf in the stack) versus server-side exports, and none decides where reports live (core "coverage" and "health" are not named as reports). |
| FR-40, FR-41, FR-45 | THIN | The row says only ".github/workflows, repository root". AD-16, AD-18 and AD-19 do not govern docs. FR-45 (agentic-coding reference material) has no owner. FR-41's architecture document has no defined home; see delta D14. |
| FR-42 CI hygiene check | PARTIAL | The deployment note lists typecheck, tests, build, boundary and size scripts and `pnpm audit`. The PRD's release-hygiene check (tracked secrets, `.sqlite`, user data, non-English strings) is absent, and so is the license-compatibility check from FR-40 (`pnpm audit` is not a license check). |
| FR-43 History and content audit | PARTIAL | AD-19 binds FR-43 but covers only dependency hygiene. Not covered: history audit, removal of retired wiki connector and retired work-item connector references, playbook PDF, review of `tools/`, `.agents/skills`, `.claude/skills` and `docs/templates`. This is a task, not a design decision, but no epic owner is named. |
| FR-3 | OK in AD-13 but missing from the capability map | No map row lists FR-3. |
| FR-6, FR-18 Sample map, checklist, template mechanism | THIN | The row lists FR-6 under runtime and FR-18 under the board. No AD or ERD entity covers the Story Map template mechanism or the checklist state (where it is stored). |
| FR-10..12 view settings, Focus Release, Card Key prefix, comments | THIN | The ERD has no entity for per-View display settings, comments (FR-10 searches them), Roadmap Cards, Story Templates, Product Context, or settings. The ERD is abbreviated, but these have no other home. |
| FR-20, FR-31 | PARTIAL | See section 2, Q8. |

Confirmed covered (AD binds them): FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-13..16, FR-26..29, FR-30, FR-32, FR-34, FR-36 (as replaced), FR-44, FR-46, FR-47, FR-50..54, FR-55, FR-56, NFR-3, NFR-4, NFR-6, NFR-7.

## 2. Quiet requirements the AD structure dropped

- Q1 Dry Run mandatory: LANDED (AD-14, AD-4, memlog removed the `pushPreview` switch). Open point: an agent-triggered push (FR-30 lists GitHub push tools) has no defined Dry Run confirmer. AD-4 says GitHub push is "not a ChangeSet", and AD-5 says protection makes "every writing tool" behave as `apply=false`. It is unstated whether a GitHub push tool is a writing tool, whether it falls under protection, and who confirms the Dry Run (human only, presumably).
- Q2 Agent self-approval: FR-30 lists "approve, reject and apply ChangeSets" as tools. FR-32 says "approval by an Agent requires the Write toolset". The spine has no equivalent. With `agentProtection` on, an agent could call ApproveChangeSet and defeat the flag. Approve, apply, restore, snapshot-on-demand and archive import need an explicit human-only or agent-allowed rule. AD-2's human-only list still reads "privacy settings, secrets", which is stale.
- Q3 Project archive contents (FR-46, FR-48): not stated. Documents, attachments and exports folders in the archive; manifest with format version and application version; unsupported-version message naming supported versions; redaction of "connector connections, sync runs and conflicts" (AD-13 says only "connector tables"). Unstated: whether `snapshots/` is excluded from the archive. Snapshots contain full database copies, and AD-7 only git-ignores them.
- Q4 No outbound traffic when idle: dropped (see section 1, NFR-2). Removal of `updateChecks` helps, but nothing states or tests it.
- Q5 Sample map and getting-started checklist that self-marks items (FR-6): dropped. Also: the sample map is delivered through the template mechanism (FR-18) and can be deleted without side effects.
- Q6 English UI: only partly kept. AD-17 keeps the single string module. Dropped: English built-in templates and seed data (FR-7), the "no German string" check, and the non-English hygiene lint (FR-42).
- Q7 GitHub conventions (FR-27, FR-29): dropped. Native GitHub issue type, configurable export label, Workflow Status never in the Issue body, machine-added reference footer naming Story Map and Card Key. Kept: the link in `REMOTE_LINK` (ERD).
- Q8 Provenance rules (FR-20, FR-31): every agent or Proposal Card has a Source Link or is marked as an inference; every ChangeSet operation carries sources and rationale. AD-4 does not define these fields.
- Q9 Safety-state visibility (FR-36 leftovers): the notice that an enabled Agent may forward retrieved context to its own provider; the current state visible on every page; flag changes logged. AD-5 logs only rejected calls, not changes to the flags, and does not say where the flag state is shown.
- Q10 Install details (FR-4, FR-5): `.env` created from `.env.example` when missing (the spine keeps `.env`-style config in `config/` but names no `.env` handling); named failure messages for wrong Node, blocked port, missing native module and missing dependencies; `doctor` reports pass or fail per check without changing state. AD-18 lists `doctor` only.
- Q11 Per-Card audit atomicity (FR-56, FR-47): FR-56 requires "one Activity Log entry per Card" for a 100-Card call, and FR-47 one Card Version per Card change. AD-3 says "an Activity Event" per use case. Per operation versus per ChangeSet is not stated.
- Q12 FR-54 conflict basis: AD-6 checks a base version per touched object. For an upsert by external reference, the agent has no base version. `external_refs` (AD-9) has no last-synced version or hash. "Card edited by a human since the last sync" cannot be detected. In the default mode (`apply=true`) an agent re-run could overwrite human edits.
- Q13 Hidden tests the PRD demands: unknown provider ids rejected by the registry (FR-55); tool inventory in `docs/mcp-tools.md` equals registered tools (FR-30; AD-2's parity test is close, but it does not check the doc); atomic 100-Card and 200-Card operations; quality gate per package. The spine's Testing row names none of these except the parity test.
- Q14 Provider extension guidance (FR-55): AD-14 says a provider id is in the enum and one registry. The PRD also names credential resolution as a change point, and the interfaces must be documented in `docs/architecture.md` (which is being deleted).
- Q15 Single-ticket import (FR-22) and GitHub connection (FR-26): both need `github` on, and it defaults to off (AD-5). The flow for turning it on while connecting is not defined. FR-22 also needs a single-item fetch on `WorkItemProvider`; AD-14 does not state one.
- Q16 Project data continuity: AD-8 says "no legacy adoption". FR-44 says an older Project folder "either migrates or refuses with instructions". Prototype-era folders will be refused or deleted; the PRD should say so.
- Q17 FR-53 timing: "review on the board before applying" only exists for proposed ChangeSets (`apply=false` or protection). In the default mode applying is immediate and a restore point is the only recourse. Post-apply review is not specified.
- Q18 FR-52 uniqueness: PRD is unique per Story Map and system. AD-9 is unique per (story map, entity type, system, external id). Also, "shown on the Card and searchable" is a UI matter with no owner.

## 3. PRD deltas forced by user decisions (memlog) or by the spine

Format: location, exact current PRD text, required change.

D1. FR-34 (title and body): "The user can start the MCP server over stdio and, optionally, HTTP on loopback with a local token, and can generate ready-to-paste client configuration for Claude, Cursor and VS Code."
Change: MCP is served over Streamable HTTP at `/mcp` on the single app port, with a stdio bridge that only forwards to it; no token; access control is Host and Origin validation (AD-11, AD-12). Client configuration generation is not addressed in the spine and needs an owner or a decision to drop.
D1b. FR-34 consequence 1: "HTTP MCP requires a token and never binds to a non-loopback address by default." Change: "HTTP MCP rejects requests with a non-loopback Host or a foreign Origin and never binds to a non-loopback address by default." Also Open Question 4 is resolved: HTTP is in v1.0.
D2. FR-32 (title and body): "Toolsets and default-off writes. Write access is off by default, toolsets are enabled separately per Project, and every tool call obeys the same permissions whether it arrives over MCP or the HTTP tool-call route the UI uses."
Change: agent writes are on by default. Project settings are `agentAccess` (default on), `github` (default off) and `agentProtection` (default off, human-only). Each write tool has an `apply` parameter (default true).
D2b. FR-32 consequence 1: "The toolsets Read, Proposal, Write and GitHub are separate per-Project switches; Read and Proposal are always on; Write and GitHub are off in a new Project." Change to the three flags above.
D2c. FR-32 consequence 3: "A ChangeSet applies only after approval; approval by an Agent requires the Write toolset." Change: agent ChangeSets with `apply=true` and protection off apply atomically after a restore point; with `apply=false` or protection on they are stored as `proposed` and need human approval. State who may approve (see Q2).
D3. FR-36 (whole): "Privacy Modes. The user can select Strict Local, Local + GitHub or Agent Mode, and the selection is enforced, visible and logged." with consequences "Strict Local blocks Connector requests and Agent access", "The current mode is visible on every page", "The UI states that an enabled Agent may forward retrieved context to its own provider."
Change: replace with "Safety switches": `agentAccess`, `github`, `agentProtection`; no stored mode and no Strict Local label. Keep the enforced/visible/logged and context-forwarding notice, mapped to the flags. Also remove the `mcpWrites`, `externalLlm`, `updateChecks` and `pushPreview` switches.
D4. Glossary: "Privacy Mode — one of Strict Local, Local + GitHub, Agent Mode; controls which outbound and agent access is allowed." Remove or replace with the flags. Also "Toolset — a group of MCP tools (Read, Write, GitHub, Source Documents, Admin) that can be enabled separately." Remove. "Connector — ... Disabled in Strict Local." becomes "Off unless the `github` flag is on". "Agent — an AI client using the MCP server" stays.
D5. FR-3 consequence 2: "Credentials entered in the UI are kept in the OS credential store or a user-level encrypted store outside the Project folder. [ASSUMPTION: OS keychain as the store; exact mechanism is an architecture decision]"
Change: a user-level config file (`%APPDATA%/StoryMapper` or `~/.config/storymapper`, mode 0600), unencrypted by design; GitHub CLI preferred. Update Section 9's assumption index and close Open Question 3. The keychain moves to "post-1.0".
D6. NEW requirement, restore points: no PRD text. Add an FR: restore points are SQLite snapshots taken before every ChangeSet apply, before every migration, at the first write of an MCP session and on demand; restore takes a pre-restore snapshot; retention is capped. Touches FR-2 (consequence 2: "fail loudly with a backup hint" becomes an automatic restore point before migration), FR-44, FR-46 and NFR-4. Clarify Section 6.2 "Restoring an older Card Version" and FR-47's non-goal line: Card-level restore stays out; Project-level restore is in.
D7. NFR-3: "write tools disabled by default". Change to reflect agent writes on by default with the protection flag.
D8. Vision, paragraph 2: "An agent ... reads the same map, proposes changes and applies them only after human approval." Also "Agents propose, humans decide, and nothing leaves the machine unless a Connector is enabled." Change: agents apply directly by default, and human approval is required when protection is on or `apply=false`. Restore points make rollback possible.
D9. FR-51 consequence 1: "A single submission of 200 Cards creates one ChangeSet and applies nothing." Change: applies nothing only with `apply=false` or protection on.
D10. FR-30 consequence 2: "the only exceptions are privacy settings and connector credentials, which stay human-only" becomes safety flags, secrets and (to decide) restore, approval and archive import.
D11. UJ-3: entry state "agent connected in Agent Mode with write tools requiring approval" becomes `agentProtection` on. Edge case "the agent attempts a direct write while proposal-only mode is on; the call is rejected and logged" becomes: with protection on, a write tool is converted to a stored proposal, not rejected. Rejection happens only with `agentAccess` off.
D12. UJ-5: entry "Project used for a month in Local + GitHub mode" and resolution "he switches to Strict Local and confirms outbound access is blocked" become `github` on, then off. Also 4.1 feature-specific NFR: "Strict Local Privacy Mode blocks all Connector traffic and is verifiable in the audit area."
D13. UJ-7 entry state: "Write toolset off" becomes protection on. SM-2 and SM-C2 ("user reviews and applies the ChangeSet") apply only in that state. Section 4.9 description: "Reads and proposals are always available, direct writes are opt-in, and ChangeSets need approval." needs the same rewrite.
D14. Docs pointers: FR-55 ("documented in `docs/architecture.md`"), FR-41 ("architecture documents") and Section 0 ("Builds on ... `docs/architecture.md`, `docs/data-model.md`"). The memlog says architecture.md is to be replaced by the spine and deleted, and data-model.md is probably replaced by the ERD (open). Update the references and decide where FR-55's interface docs live.
D15. FR-4 consequence 1: "The documented setup uses the repository-pinned Node and pnpm versions". AD-18: no repo-local Node; Node comes from `engines`. Reword to "the required Node version (24) and the pnpm version pinned through Corepack".
D16. FR-52 consequence 2: "unique per Story Map and system" becomes unique per Story Map, entity type and system, and one reference per system per entity (AD-9).
D17. FR-44 / FR-2: add that Projects created by prototype builds are not migrated (AD-8, memlog "existing local data may be deleted").
D18. Open Questions 3, 4 and 6: 3 and 4 are resolved by AD-13 and AD-11. 6 is delegated to the recipe (Deferred).

Count: 18 deltas (D1 to D18, with sub-items). D6 is a new FR. D1 to D5 are the known ones from the memlog.

## 4. Spine content that the PRD does not ask for (scope added)

- SSE live updates (AD-10, `GET /api/events`, `Last-Event-ID`). Needed for "live collaboration" (memlog primary use case). The PRD has no live-update requirement and says nothing on headless mode.
- Optimistic concurrency `version` on Story Maps, Cards, Releases, Personas and Roadmaps with HTTP 409 (AD-6). The PRD asks for conflict handling only for GitHub sync and ChangeSets.
- Restore points with retention and size cap, first-write snapshots and restore endpoint with 503 (AD-7). User-decided, but new scope.
- The `apply` parameter, `agentProtection` and `agentAccess` flags (AD-4, AD-5). User-decided.
- Host, Origin and JSON content-type validation (AD-12). Goes beyond NFR-3's "loopback binding". Justified by CVE-2025-66414, but is not a PRD requirement.
- Single process and port serving the built web app plus `/mcp` (AD-11); a stdio bridge; `@fastify/static`. The PRD says only "local server and web UI on loopback".
- Capability manifest and parity test (AD-2), dependency boundary script (AD-1, `check-boundaries.mjs`), `pnpm audit` in CI (AD-19). Repository tooling that the PRD does not request.
- Drizzle-kit migrations with newer-schema refusal (AD-8) and folding `packages/ai` into `core`, removing unused deps (AD-19). Enabling refactors from the brownfield review; the PRD asks only for migrations (FR-2, FR-44).
- Multiple external references per entity (AD-9). FR-52 needs one per system.
- TanStack Router, Zustand and Query (AD-17), a Deferred plan for major dependency upgrades, `STORYMAPPER_ALLOW_REMOTE_HOST` rename. Implementation choices and housekeeping.
- Deletion of `docs/architecture.md` and `docs/data-model.md` (memlog): the PRD (FR-41, FR-55) still depends on them.

## Summary

Gaps: NFR-1, NFR-2 and NFR-5 unowned (plus NFR-8 floor); FR-35 has no home; FR-33 tool-call audit is incomplete (reads, tool name, hashes); agent self-approval and GitHub push under protection undefined; FR-54 conflict detection lacks a sync-version basis. Deltas: 18.
