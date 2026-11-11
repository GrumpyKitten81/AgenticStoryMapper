# Agentic Story Mapper

Date: 2026-11-11. Document version: 0.4.10.

Reproducing statement: Provide a simple first start, optionally guided by Codex or Claude Code, with MCP connected before guided planning, alongside the direct browser/terminal path and first-map guidance; describe implemented capabilities, local data and current operating links in English.

Agentic Story Mapper is a local-first story mapping and GitHub planning tool. A local Fastify server serves a React web app and stores Projects in SQLite. Plan visually, connect stories to source material, review proposed changes and choose when to interact with GitHub.

The product name is **Agentic Story Mapper**. Technical identifiers remain `storymapper`, including workspace packages (`@storymapper/*`), MCP configuration, environment variables and local storage names. The current repository is [GrumpyKitten81/AgenticStoryMapper](https://github.com/GrumpyKitten81/AgenticStoryMapper). Historical source links and artifact paths retain their original names.

Read the English [map levels, planning types and GitHub Issues guide](docs/story-map-levels-and-issues.md). It is also available offline from the Story Map Help dialog.

## Quickstart

Choose a guided start with your coding Agent or run the commands yourself. Guided planning uses MCP to connect the Agent to Agentic Story Mapper before map work; browser-only use needs no MCP. No GitHub connection, API key or `.env` is needed for Agentic Story Mapper.

### With Codex or Claude Code

Use an installed, signed-in coding Agent with local terminal access. Open a local folder in [Codex](https://learn.chatgpt.com/docs/projects?surface=app), or start [Claude Code](https://code.claude.com/docs/en/quickstart) there. If Agentic Story Mapper is already cloned, open its repository folder. Paste:

```text
Help me get Agentic Story Mapper running locally. If this folder is not already an
Agentic Story Mapper checkout, clone https://github.com/GrumpyKitten81/AgenticStoryMapper.git
into a new agentic-story-mapper subfolder and work there. Read AGENTS.md and README.md.
Check Git, Node 24 and Corepack; help me install any missing prerequisites
for my operating system. Use the same Node 24 for installation and startup.
Run node scripts/setup.mjs for first setup, or node scripts/start.mjs if
setup is already complete. Keep the launcher running in a persistent local
terminal, wait for health, and give me the actual printed browser URL.
Before planning or creating a map, get the generated MCP host configuration
from the printed URL at /api/mcp/host-configs or Setup → Agent setup.
Register its exact command and args in this host as storymapper, preserving
other servers and respecting host permissions. Reconnect if needed, then
actually call ListProjects and ListStoryMaps through this host’s MCP tools.
Do not claim connection from saved settings or a direct HTTP tool call.
If this session cannot load the tools, explain the reconnect step and stop
until the MCP calls succeed. Then ask what I want to map before proposing
content. Use MCP and the existing ChangeSet/approval workflow for application
data; do not access SQLite or domain HTTP endpoints as a substitute.
If a command fails, explain its next action. Do not change the app’s source code.
```

Your Agent may ask for access to the folder, package downloads or prerequisite installation. Keep its launcher terminal/session running while you use the app. If the Agent cannot keep a process alive, run the setup/start command in your own terminal instead. Account setup for the coding Agent belongs to that host; Agentic Story Mapper itself needs no provider account.

### From a terminal

Prerequisites: Git, installed Node 24 (`>=24 <25`), Corepack on `PATH`, and a desktop session with a default browser. Linux also needs `xdg-open`. Use the same Node 24 for installation and execution of native `better-sqlite3`. If Corepack is missing, install it with `npm install --global corepack@0.35.0`; it selects pnpm `9.15.4`. Installing dependencies needs network access.

1. Clone the repository and enter its folder:

   ```sh
   git clone https://github.com/GrumpyKitten81/AgenticStoryMapper.git agentic-story-mapper
   cd agentic-story-mapper
   ```

2. Set up and open the app:

   ```sh
   node scripts/setup.mjs
   ```

   Setup installs dependencies, builds the app, checks startup and opens your browser after the local server is healthy. Keep this terminal open while using Agentic Story Mapper. Stop with **Ctrl+C**.

### Your first map

The overview shows your **Project**, the local container for its Story Maps and shared settings. For the guided route, first complete [Connect Codex or Claude Code](docs/RUNBOOK.md#connect-codex-or-claude-code): **Setup → Agent setup** works before a map exists. Once the host’s MCP queries succeed, tell the Agent what you want to map. It works through MCP and the existing ChangeSet/approval controls.

For browser-only use, enter a map name and choose **Create a Story Map**. Use **Story Map help** in its toolbar: start with an Activity, add a Step beneath it and a Story beneath that. Use your own planning content. Cards save automatically; return to the same Project and map next time. GitHub is optional and starts off.

### Come back later

For later sessions, run this from the repository folder and open the same saved map. For guided work, reconnect the host and confirm its MCP queries succeed before continuing:

```sh
node scripts/start.mjs
```

The preferred UI/API address is `http://127.0.0.1:4317`. If `PORT` is unset and 4317 is occupied, Agentic Story Mapper selects an available port. **Use the URL printed by the launcher** and append `/health` for its healthcheck. An explicitly configured occupied `PORT` fails. Stop the launcher with **Ctrl+C** for orderly shutdown of its owned server.

If startup fails, run `node scripts/doctor.mjs` and follow the reported next action. Use `--debug` for more detail. See [Troubleshooting](docs/RUNBOOK.md#troubleshooting) for installation, native SQLite or browser problems. Actual platform coverage is recorded in the [release checklist](docs/public-release-readiness.md).

## Scope

- Story Maps with Activity, Step and Story Cards, drag-and-drop and keyboard movement, release swimlanes, search and filters.
- Card details with Markdown editing, workflow status, estimates, dependencies, personas, annotations, attachments and source links.
- Releases, timelines, Roadmaps, Plan states, coverage and backlog-health reports; JSON, Markdown, CSV and audit exports.
- Markdown and TXT document import with chunks and traceable source links. DOCX, PDF, XLSX and image imports remain reserved.
- GitHub Issue import, pull-sync, conflict review and human-confirmed outgoing Issue/Milestone plans. GitHub is the only supplied work-item provider.
- Deterministic template-based proposals and reviewed ChangeSets. Agentic Story Mapper's proposal generator does not call a language-model provider.
- Model Context Protocol (MCP) tools in the running app, with a stdio bridge for compatible Agent hosts.
- Human-only local Restore and portable `.lsm.zip` Project archive import/export.

The [Product requirements](_bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/prd.md) describe the broader product goal. Use the [Runbook](docs/RUNBOOK.md) for current operations and recovery.

## Local data and privacy

Each Project uses a local `.lsm/` folder, by default `local-projects/default.lsm/`, containing `storymapper.sqlite` and local documents, attachments, exports and other runtime files. Local work does not require a cloud account or GitHub connection. Do not share `.env`, `input/`, Project folders, SQLite/WAL/SHM files or restore snapshots. Archives redact connection/sync/remote state but still contain private business content; review them before sharing.

GitHub starts disabled. Consented human **Verify** can check a candidate connection while GitHub is off; separate **Connect** saves it and enables GitHub. Normal operations choose credentials in this order: GitHub CLI, user credential file, `GITHUB_TOKEN` environment value. An unusable selected source fails visibly. User-file tokens are unencrypted, outside the Project, with POSIX permissions `0600`; normal connection records contain no tokens. See [Credentials and connection consent](docs/RUNBOOK.md#credentials-and-connection-consent).

## Agents and reviewed changes

The Project safety settings default to Agent mode `apply` and GitHub off. The Agent mode (`off`, `propose`, `apply`, `autonomous`) is a guardrail for cooperative Agents using the tool surface, **not a security boundary against local processes**. An enabled Agent may send retrieved context to its own provider. The [Architecture spine, AD-6](_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md#ad-6--agent-access-protection-and-approval) defines these limits.

Agent and incoming GitHub domain changes create ChangeSets before a separate auditable apply. Agent protection or `apply=false` retains a proposal. A new unprotected domain command with `apply=true` can apply its newly created ChangeSet immediately; an already stored proposal needs recorded approval first. Agent approval needs the human-controlled approval flag; Agent Apply also needs protection off. Human Apply remains available under protection.

Outgoing GitHub effects require review of a persisted Dry Run and explicit human confirmation. Agent approval cannot authorize remote writes. Drift requires a new review; interrupted plans retain per-item evidence for explicit human Resume. Restore affects local state and cannot undo GitHub effects. See [GitHub workflow](docs/RUNBOOK.md#github-workflow) and [MCP tools](docs/mcp-tools.md).

## Validation and accessibility

The repository can be cloned and used without a GitHub release or tag. Tagged releases are optional maintainer work; their `PUBLICATION_POLICY` Actions secret is not application configuration. Local use needs neither that secret nor a `.env` file.

For contributor setup and checks, read [Contributing](CONTRIBUTING.md). The offline blocking aggregate is `corepack pnpm check`; `node scripts/verify.mjs` provides release verification, with `--check-health` for the running runtime. The quick verifier `node scripts/verify.mjs --skip-typecheck --skip-build` still checks hygiene, size, capabilities and accessibility.

Desktop accessibility scope is WCAG 2.1 AA at widths of at least 768 CSS pixels, excluding 1.4.10 Reflow. Automated checks cover views, dialogs, keyboard movement, focus and live holds. jsdom cannot establish native layout or color contrast; stylesheet-pair tests supplement its excluded Axe `color-contrast` rule. Automated success does not certify native browser or screen-reader behavior.

The 1,000-Card diagnostics retain fixture/environment/build and cold/warm context. Read/mutation/interaction/search references of 150/30/100/300 ms are diagnostic; functional failures fail the command. Native UJ-1/UJ-3, 200% zoom, sticky focus, targets, contrast, Forced Colors, Reduced Motion and reader obligations remain separately recorded in [Accessibility evidence](evidence/story-6-10/).

## Stack and project structure

TypeScript and pnpm workspaces connect React/Vite, Fastify, SQLite/Drizzle, shared Zod contracts and Vitest. The [Architecture spine](_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md) records decisions and the installed stack.

| Path | Responsibility |
| --- | --- |
| `apps/web` | Browser UI |
| `apps/server` | Local API, MCP and connector orchestration |
| `packages/contracts` | Shared schemas and data contracts |
| `packages/core` | Pure domain logic and deterministic proposals |
| `packages/db` | SQLite repositories, migration and recovery |
| `packages/importers`, `packages/github`, `packages/mcp` | Document import, GitHub adapter and MCP tools |
| `scripts`, `tools`, `docs` | Portable commands, GitHub CLIs and project documentation |

## Documentation and contribution

| Need | Read |
| --- | --- |
| Install, use, connect MCP or recover a Project | [Runbook](docs/RUNBOOK.md) |
| Understand map levels and planning types | [Concept guide](docs/story-map-levels-and-issues.md) |
| Look up the Agent tool surface | [MCP inventory](docs/mcp-tools.md) |
| Change the repository | [Contributing](CONTRIBUTING.md), with its optional Agent workflow |
| Prepare a release | [Release checklist](docs/public-release-readiness.md) and [release procedure](docs/RUNBOOK.md#versioned-releases) |

The BMad/loop guides describe optional development automation. `_bmad-output/` contains requirements, architecture and development history; it is not a first-user reading list. Current operating instructions are in the guides above.

Read [Security](SECURITY.md), [Code of conduct](CODE_OF_CONDUCT.md) and the [MIT license](LICENSE) when contributing.

## Changelog

- 2026-11-11 v0.4.10: Point startup at the new repository and distinguish repository use from optional tagged releases.

- 2026-11-08 v0.4.9: Rename the product to Agentic Story Mapper; retain working technical identifiers and existing repository URLs.

- 2026-11-08 v0.4.8: Separate user/reference documentation from optional maintainer automation and development history.

- 2026-11-08 v0.4.7: Connect and verify MCP before agent-guided map work; preserve browser-only use and application approval controls.

- 2026-11-08 v0.4.6: Link the map concepts guide and offline Help.

- 2026-11-08 v0.4.5: Add a copyable Codex/Claude Code startup prompt, separate terminal and optional MCP paths, and simplify first-use and release navigation.

- 2026-10-31 v0.4.4: Clarify Projects and owned Maps, compact toolbar help and immediately available optional Agent host setup.

- 2026-10-31 v0.4.3: Lead with clone, setup-and-launch and an empty guided first map; explain local autosave, terminal ownership and later startup.

- 2026-10-20 v0.4.2: Link the contributor walkthrough and its isolated Agent rehearsal.

- 2026-10-20 v0.4.1: Replace the stale release-automation deferral with the configured maintainer release procedure and retain publication and hosted-verification limits.

- 2026-10-20 v0.4.0: Rewrite public guidance in English from current source; correct startup discovery, credentials, safety, shared MCP, Restore and implemented archives. Preserve verification and publication limits.
- Earlier document versions described prototype behavior; use Git history for those historical instructions.
