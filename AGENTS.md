## Instruction hierarchy

1. `~/.claude/CLAUDE.md` — global user rules (Development Guide, AI-DO-NOT). Read it first when present; Claude Code and OpenCode load it themselves. **AI-DO-NOT always wins.** Never edit it without explicit user confirmation.
2. This file.
3. `.cursor/rules/*.mdc` — topic rules, see "Where things are".

If instructions conflict, prefer the instructions closest to the files to be worked with and the task (except AI-DO-NOT).

## Helping a user start the app

Date: 2026-11-08. Version: 2.

Reproducing statement: Guide first-time users from Codex or Claude Code through local startup and a verified MCP connection before their first Story Map; preserve direct browser-only use.

For requests to install, start or use Agentic Story Mapper, follow [README Quickstart](README.md#quickstart) and [Runbook installation](docs/RUNBOOK.md#install-from-a-fresh-clone). Check Git, installed Node 24 and Corepack; use `node scripts/setup.mjs` initially and `node scripts/start.mjs` later. Keep the launcher in a persistent local terminal, wait for health and report its actual printed URL. If the host cannot retain a process, give the user the command to run in their own terminal. Help with prerequisite failures; do not change product code merely to start the app.

For agent-guided use, MCP setup is required before planning or map changes. Obtain the generated command and args from the actual URL's `/api/mcp/host-configs` or **Setup → Agent setup**, then register/reconnect this host following [MCP operation](docs/RUNBOOK.md#mcp-operation). Preserve other host servers and respect host permissions. Confirm successful `ListProjects` and `ListStoryMaps` calls through this host's MCP tools; saved configuration, clipboard success and direct HTTP tool calls are not proof. If the current session cannot load the tools, explain the required reconnect and resume only after those calls succeed. Ask what the user wants to map before proposing content. Use MCP for application data, never SQLite, Project files or domain HTTP as a substitute. Preserve ChangeSet/approval rules, human-only actions and separate human GitHub confirmation. Browser-only use remains available without MCP.

Changelog: 2026-11-08 v2 — make verified MCP connection part of initial agent-guided startup. 2026-11-08 v1 — add the startup route shared by Codex and Claude Code.

<!-- bmad:context -->
<!-- Verified 2026-09-29 against 5e4a647. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## Agentic Story Mapper

Local-first story mapping and GitHub planning tool. TypeScript pnpm monorepo: `apps/server` (Fastify, MCP), `apps/web` (React, Vite), `packages/*`; SQLite via Drizzle. `README.md`, `docs/RUNBOOK.md`, the PRD (`_bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/prd.md`), instructions, code and identifiers are English. Planning artifacts live in `_bmad-output/planning-artifacts/` and `_bmad-output/implementation-artifacts/`, project knowledge in `docs/`.

## Policy

- Never store or print tokens (`GITHUB_TOKEN`) in files, logs, prompts, outputs or tests; `.env` stays local.
- Never share or commit `local-projects/*.lsm/`, `*.sqlite*`, `input/` — user data.
- Add no SaaS dependencies, cloud accounts, telemetry or outbound network calls unless the task requires them.
- External, GitHub, AI or agent-driven changes produce a `ChangeSet` first; applying it is a separate auditable action.
- Keep `HOST` on loopback (`127.0.0.1`, `localhost`, `::1`); direct non-loopback binding requires explicit `STORYMAPPER_ALLOW_REMOTE_HOST=true` and security approval. The owned launcher remains loopback-only; HTTP Host validation remains loopback-only with either binding.

## Where things are

- Before editing a file, read each `.cursor/rules/*.mdc` whose `globs` match it (Cursor does this itself). Read `card-authoring.mdc` when creating or editing story-map cards or GitHub tickets.
- Architecture spine (invariants, ADs, aggregate register, ERD) `_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md`, MCP `docs/mcp-tools.md`, operations `docs/RUNBOOK.md`.
- GitHub access: `gh` CLI; board import and Story Map copy scripts in `tools/` (Python, HTTP-only); skills `github-projects`, `github-issues`, `github-board-import` exist in `.agents/skills/` and `.claude/skills/` — change both copies.

## Running and verifying

- Node 24 and pnpm 9.15.4 via Corepack (`engines`, `packageManager`).
- Set up with `node scripts/setup.mjs` and start with `node scripts/start.mjs` on Windows, macOS and Linux. Use the same installed Node 24 (`>=24 <25`) for native `better-sqlite3` installation and execution. UI/API share `http://127.0.0.1:4317`; start opens the browser after health succeeds (`docs/RUNBOOK.md`).
- Run `node scripts/verify.mjs` before release: Git hygiene, installed Node/pnpm, source hygiene, typecheck and build; `--check-health` also probes `/health`. `--skip-typecheck --skip-build` runs the quick checks.
- `corepack pnpm lint` is `tsc --noEmit`, identical to `typecheck`. Test scripts use `--passWithNoTests`, so packages without tests pass silently.
- Validate focused changes with `corepack pnpm --filter @storymapper/server test` (or `web typecheck`).

## Conventions that differ from defaults

- `packages/contracts` (Zod) is the single schema source for API, MCP and UI; never duplicate schemas.
- All data access goes through `packages/db` repositories; no raw Drizzle queries elsewhere.
- `packages/core` is pure domain logic; no network or DB side effects.
- Persistence is `<project-name>.lsm/` (`storymapper.sqlite`, documents, attachments, exports, logs, `manifest.json`).
- Imported or generated cards keep links to source chunks, GitHub issues or the originating MCP/AI action.
- Importers implement Markdown and TXT only; DOCX, PDF, XLSX and images stay reserved. Deterministic proposal generators live in `packages/core`; the removed `packages/ai` package must not be referenced as current code.
- Tool-audit performance uses exact one-row-per-call persistence and the absolute burst/render bounds; relative overhead is diagnostic under the user-approved Story 3.8 relaxation.
- Read GitHub issues and comments with `gh`; use REST only when needed. For boards, filter with `github-projects` first, then read details with `github-issues`.

<!-- /bmad:context -->

## GUI design system

For every GUI change, inspect the central tokens and layout, form and action primitives in `apps/web/src/styles/` before implementation. Reuse those primitives and their spacing tokens; do not introduce ad hoc local visual overrides. Verify the actual affected pages and dialogs in a browser at desktop and narrow widths, including spacing, wrapping and overflow.

## BMAD loop (orchestration)

Story automation (Codex dev → verify → Claude review) is documented in `docs/bmad-loop.md`. Before a new epic wave, run **`/bmad-prepare-epic`** so per-story detail plans exist for dev planning (`docs/bmad-epic-preparation.md`, `_bmad/custom/bmad-build-auto.toml`). Before `bmad-loop run`, `resume`, or `resolve --resume`, run `node scripts/bmad-loop-preflight.mjs` (Node 24, Claude logged in).

**Windows multiplexer:** Local policy uses `[mux] backend = "psmux"` for Codex/Claude sessions. Install with `winget install marlocarlo.psmux` and confirm `psmux --version` works. WinGet often does not put the binary on `PATH`; if `bmad-loop` crashes with `psmux has-session failed: [WinError 2]`, add the package folder to user `PATH` (typical location: `%LOCALAPPDATA%\Microsoft\WinGet\Packages\marlocarlo.psmux_Microsoft.Winget.Source_8wekyb3d8bbwe`, or locate with `where.exe /R %LOCALAPPDATA%\Microsoft\WinGet psmux.exe`).

**Unattended review:** When `[adapter.review] extra_args` is set in `.bmad-loop/policy.toml`, include `--permission-mode bypassPermissions` together with `--dangerously-skip-permissions` and `--effort high`. Custom `extra_args` replace Claude’s default bypass flags; omitting `bypassPermissions` can stall review on permission prompts.

**CLI notes:** `bmad-loop resolve … --no-interactive` is valid; `bmad-loop resume <run_id>` does not accept `--no-interactive`. Keep the resume/ctl process alive (multiplexer session), not a short-lived shell that exits right after launch.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**This project has a knowledge graph. Start with the code-review-graph
MCP tools to narrow scope, then read the source.** The graph is cheaper than scanning files and
gives you structural context (callers, dependents, test coverage) that file search cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

### Verify in the source

- Narrow scope with the graph, then read the source. Do not change code from graph output alone.
- For any non-trivial change, read the implementation and the relevant tests before concluding.
- Verify the exact source when touching behavior, database logic, migrations, retries, fallbacks,
  recovery, or compatibility code.
- When the graph and the source disagree, the source wins. The graph may be stale or may not
  model that relationship.
- An empty graph result can mean "not indexed" or "not statically visible", not "does not exist".

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
<!-- /code-review-graph MCP tools -->

<!-- openwolf:begin -->
# OpenWolf

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md at session start. Check .wolf/cerebrum.md before generating code. Grep .wolf/anatomy.md for a file's path before reading it (never read the whole index).
<!-- openwolf:end -->

## Card readiness reviews

Date: 2026-11-04. Version: 1. Reproducing statement: Install the approved Card DoR protocol with a narrow audited persistence exception and separate human-approved corrections.

Use the installed `card-dor-review` skill with MCP for captured Card review requests. Direct immutable audited review-report persistence is the user-approved narrow exception to ChangeSet-first; it never changes Card content, versions or sync baselines. Corrections require proposed ChangeSets and separate human approval/Apply. Agentic Story Mapper never launches an agent or model. Criteria and applicability come only from `packages/contracts/src/schemas/card-review.ts`. See [ADR 0011](docs/adr/0011-immutable-card-readiness-reviews.md).

Changelog: 2026-11-04 v1 — document the approved readiness-review exception and skill protocol.
