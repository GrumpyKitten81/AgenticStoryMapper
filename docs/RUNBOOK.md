# Agentic Story Mapper Runbook

Date: 2026-11-08. Document version: 0.4.12.

Reproducing statement: Provide English, source-verified installation, Codex/Claude Code guided startup with verified MCP before planning, browser-only startup, configuration, diagnostics, credentials, Agent controls, GitHub operations, archive/Restore and migration recovery, with a bounded Linux CI gate, local verification and honest platform coverage limits.

Use this guide for local operation on Windows, macOS and Linux. The [README](../README.md) introduces the product; the [Architecture spine](../_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md) defines the operating and safety invariants.

## Install from a fresh clone

For a guided installation, open a local folder in Codex or Claude Code and use the [README startup prompt](../README.md#with-codex-or-claude-code). The Agent follows the commands below, then [connects and verifies MCP](#connect-codex-or-claude-code) before planning or map changes. It needs local terminal access and a persistent launcher session; a cloud-only task cannot open the app on your computer. You can use the browser yourself without MCP instead.

1. Install Git and Node 24 (`>=24 <25`); put that installed Node and Corepack on `PATH`. Corepack selects pnpm `9.15.4` from the root `packageManager` field. If missing, install Corepack into the active Node installation with `npm install --global corepack@0.35.0`.
2. Use a desktop session with a default browser. Windows uses `rundll32.exe`, macOS `open`, and Linux requires `xdg-open`.
3. Clone the repository and open a terminal in its root. Do not copy another user's workspace, `.env`, Project data or `node_modules`.
4. Run:

```sh
node --version
corepack pnpm --version
node scripts/setup.mjs
```

Installation requires package-network access. Setup checks Node/Corepack/pnpm, installs with `--frozen-lockfile`, builds the web app and creates `local-projects/default.lsm`. Setup then runs the same dependency/native/configuration checks as start, launches the server and opens the default browser after health succeeds. Keep this terminal open and stop with Ctrl+C. A failed phase stops setup before subsequent phases; install/build failures never launch the server. No `.env`, provider account or token is needed for local use. Install and run native `better-sqlite3` with the same installed Node 24; there is no repository-local Node download.

After startup, agent-guided users complete the MCP connection below before map work. For browser-only use, the overview presents the active Project as the local container, followed by its Story Maps. Name and create an empty map. Open **Story Map help** in the map toolbar for optional Activity → Step → Story guidance. Cards save automatically locally; restart with `node scripts/start.mjs` and open the same map. New Projects contain no automatic sample data. Existing samples, archives and history remain available. Project storage and archive actions and the getting-started checklist are collapsed secondary controls.

## Start, actual URL and stop

For later sessions, `node scripts/start.mjs` checks dependencies/native SQLite, builds missing web assets and starts its owned server. After its own listener and `/health` succeed, it prints the actual URL and opens the OS default browser. UI and API share that origin.

The preferred URL is `http://127.0.0.1:4317`. With `PORT` unset, an occupied 4317 causes selection of an available port. With `PORT` explicitly set, an occupied port fails. Use the **printed URL**, including its actual port, and append `/health` for liveness or `/api/health` for operational health. The latter reports version, schema, epoch, write gate and pending-migration state.

Keep the launcher terminal open. **Ctrl+C** performs orderly owned shutdown, drains admitted work and cleans runtime discovery. Startup, health, build, browser-opener or timeout failures fail visibly and stop owned server processes. Do not terminate unrelated processes to free a port.

The launcher permits only `127.0.0.1`, `localhost` or `::1`, including when direct-server remote binding is opted in. Setup/start/doctor accept only optional `--debug`; no headless flag exists.

## Configuration

No configuration file is required. For optional local settings, use `.env.example` as a guide. Keep actual `.env` private. Be aware that the example explicitly sets `PORT=4317`; copying that value disables automatic port selection.

Startup/doctor precedence is process environment, root `.env`, then missing values from the nearest `.env` found upward from `apps/server`, then defaults. A process override therefore wins over a changed `.env`.

| Variable | Default | Behavior |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Loopback binding; launcher accepts `127.0.0.1`, `localhost`, `::1`. |
| `PORT` | Preferred `4317` | Explicit values must be integers 1–65535 and free; unset permits available-port selection. |
| `STORYMAPPER_DB_PATH` | `local-projects/default.lsm/storymapper.sqlite` | SQLite file; relative paths resolve from the checkout. Use a writable local directory. |
| `STORYMAPPER_ALLOW_REMOTE_HOST` | `false` | Exact `true` permits a directly started server to bind elsewhere, with a warning. Explicit security approval is required; launcher and HTTP Host validation remain loopback-only. |
| `GITHUB_TOKEN` | Unset | Last normal GitHub credential source, after CLI and user file. Never include its value in logs or shared files. |

### Frontend feature flags

These flags control view availability across the frontend build, for every Project. Only the exact strings `true` and `false` are accepted; unset flags use the defaults below. Disabled views disappear from navigation, and direct URLs redirect to an available view. At least one Story Map view must remain enabled; Sources, Releases and Roadmaps do not count toward this requirement.

| Flag | Default | Purpose |
| --- | --- | --- |
| `VITE_FEATURE_VIEW_DISCOVERY` | `true` | Explore the Story Map through activities, steps and stories. |
| `VITE_FEATURE_VIEW_TREE` | `true` | Inspect and edit the card hierarchy in a structured tree. |
| `VITE_FEATURE_VIEW_PLANNING` | `false` | Plan stories in release swimlanes. |
| `VITE_FEATURE_VIEW_BACKLOG` | `false` | Inspect and edit stories in a backlog list. |
| `VITE_FEATURE_VIEW_TRACKING` | `false` | Follow workflow progress in the release Kanban. |
| `VITE_FEATURE_VIEW_SLICES` | `false` | Assign stories to releases and inspect delivery scope. |
| `VITE_FEATURE_VIEW_GRAPH` | `false` | Visualize dependencies between cards. |
| `VITE_FEATURE_VIEW_TIMELINE` | `false` | Display release schedules on an experimental timeline. |
| `VITE_FEATURE_VIEW_GITHUB` | `false` | Manage GitHub import and synchronization for a Story Map; independent of the Project Connections page. |
| `VITE_FEATURE_VIEW_SOURCES` | `false` | Manage Markdown/TXT source documents, text chunks and their links to cards. |
| `VITE_FEATURE_VIEW_RELEASES` | `false` | Manage releases, their dates and goals, release notes and delivery summaries for a Story Map. |
| `VITE_FEATURE_VIEW_ROADMAPS` | `false` | Build experimental roadmap boards with columns, cards and links to releases or stories. |
| `VITE_FEATURE_PERSONAS` | `false` | Enable Persona navigation, card assignment and labels, search/filter/bulk operations and the built-in Persona AI template. |

Sources is a Project view. When disabled, its direct URLs redirect to that Project's Story Maps list. Existing source data, card provenance and backend import/linking capabilities remain available. Releases and Roadmaps are independent auxiliary Story Map views. Disabled direct URLs redirect to the first enabled regular view of the same map, preserving card/preview search. Release data, story assignments and backend capabilities remain available to the other planning views. View flags control the interface; they are not permissions or Agent safety settings.

Persona is a frontend capability gate, independent of the view flags and the minimum enabled Story Map view requirement. When disabled, Persona URLs redirect to the same Project's Story Maps list; Persona links, assignments, chips, badges, accessible descriptions, filter/bulk controls and built-in AI template choices are hidden. Persona names do not affect card search, stale Persona filters do not filter cards or count as active, and UI bulk updates omit Persona fields. Browser ChangeSet approval/application is unavailable while explicit Persona or card-Persona link operations are selected; inspection, deselection and rejection remain available. Existing Persona data and links remain unchanged; enabling the flag restores their interface behavior. API, MCP, exports and history remain available. This flag is not a backend permission or safety setting.

Set flags in the build process environment or in `apps/web/.env.local` (one `NAME=true` or `NAME=false` per line). Process values take precedence over Vite env files. The root `.env` described above is runtime configuration; use the frontend env file for persistent frontend settings.

Rebuild from the repository root after changing flags. For example, enable Sources for a build in Bash:

```bash
VITE_FEATURE_VIEW_SOURCES=true corepack pnpm --filter @storymapper/web build
node scripts/start.mjs
```

Or in PowerShell:

```powershell
$env:VITE_FEATURE_VIEW_SOURCES = 'true'
corepack pnpm --filter @storymapper/web build
Remove-Item Env:VITE_FEATURE_VIEW_SOURCES
node scripts/start.mjs
```

Use `false` to hide Sources again and rebuild. To enable Persona, set `VITE_FEATURE_PERSONAS=true` for the same build command; unset or `false` disables it. Restarting alone does not change flags in existing assets: startup only builds the frontend when assets are missing. Reload the browser after rebuilding. During frontend development, restart the Vite dev server after changing env files.

## Storage and privacy

The default Project database is `local-projects/default.lsm/storymapper.sqlite`. Project folders also hold documents, attachments, exports, logs and manifest information as used by the relevant features. Restore points are in `snapshots/` beside the database, for example `local-projects/default.lsm/snapshots/`; they are not a `backups/` folder. Treat the entire Project and its snapshots as private user data.

The app owns one shared database runtime. The `.port` discovery file lives in the initial runtime directory beside the configured startup database and remains the discovery location even after an archive opens a different Project. Do not edit it during operation. The MCP bridge uses that runtime directory, not a second database server.

Never distribute `.env`, `input/`, SQLite/WAL/SHM files or raw local Project directories with a source checkout. Use the archive workflow when deliberately transferring a Project, and review its private business content first. Credentials stay outside normal connection records and portable Project state.

## Agent controls and ChangeSets

These four human-controlled Project flags replace the old privacy-mode descriptions:

| Flag | Default | Effect |
| --- | --- | --- |
| Agent mode (`agentMode`) | `apply` | `off` rejects Agent access; `propose` retains Agent domain commands as proposals and blocks Agent remote push (human Apply remains available); `apply` lets Agents apply approved ChangeSets; `autonomous` also lets Agents approve stored proposals, including their own ([ADR 0010](adr/0010-single-agent-mode.md)). |
| GitHub (`github`) | Off | Enables normal GitHub provider operations; consented human Verify has the specific exception below. |

The Agent mode is a **cooperative-tool guardrail, not a security boundary against local processes**. An enabled Agent may forward retrieved context to its own provider. Read [AD-6](../_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md#ad-6--agent-access-protection-and-approval) before enabling access to sensitive content.

Agent-driven and incoming GitHub domain changes first persist a ChangeSet and apply through a separate auditable action. A newly generated unprotected domain command with `apply=true` (the default) may immediately apply its newly created ChangeSet. `apply=false`, proposal generators and Agent protection retain proposals. Review the server preview and selected operations before approving a stored proposal; recorded approval is required before its Apply. Agent approval requires Agent access and the approval flag. Agent Apply additionally requires protection off. Reject, Restore and safety-setting changes are human-only. Tool calls and flag changes are audited; stale operations require resubmission and fresh approval.

## Credentials and connection consent

Normal GitHub operations resolve credentials in this order, irrespective of stored connection `authMode`:

1. Locally configured GitHub CLI credentials for `github.com`.
2. The Agentic Story Mapper user credential file.
3. The server's `GITHUB_TOKEN` environment value.

Only an absent source advances to the next. An unusable selected CLI/file source fails visibly; an environment token does not silently bypass a malformed selected file. Local availability is not remote verification. CLI authentication, if needed, belongs in the user's own terminal; never initiate unattended interactive login.

The user file is `%APPDATA%/StoryMapper/credentials.json` on Windows and `~/.config/storymapper/credentials.json` elsewhere. Tokens are **unencrypted**, outside the Project. POSIX files must be owned by the user with permissions `0600`; unsafe links/parent permissions are refused. Do not copy or print this file for diagnostics. Connector configuration in SQLite contains no token.

In the human GitHub connection flow:

1. Enter a candidate repository/configuration and select CLI or a candidate token. Explicitly consent before **Verify**. This is a human-only credential/provider access, permitted even while GitHub is off.
2. Inspect Verify's capability and selected operational-source result. Verify saves neither a connection nor the GitHub switch. A configured CLI still takes operational precedence over a supplied token.
3. Confirm separate **Connect** for that unchanged candidate/proof. Token candidates are stored in the user file; Connect saves configuration and enables GitHub with audit. Changed credentials, inputs, Project scope or proof require Verify again.

Credential-file storage and SQLite commit are not one transaction. A reported failure can mean the credential was stored while the connection/switch was unchanged. Follow the reported next action and Verify again; do not assume SQLite rollback removed a stored token. Tokens are accepted only by the consented human flow, not normal connection requests or Agent tools.

## GitHub workflow

GitHub is the supplied work-item provider. Imported Issues and linked Cards use canonical provider/repository/remote identities. Import and pull-sync route local domain effects through ChangeSets; Agent-initiated operations remain proposals under Agent protection. Check preview, provenance and conflicts before applying. Local planning does not require enabling GitHub.

For outgoing Issue/Milestone changes:

1. Enable the intended connection and prepare a persisted **Dry Run**. Review its exact items, repository, capabilities, labels/mappings and blockers.
2. A human confirms that plan in the UI. Agent approval and a recomputed selection do not authorize remote effects.
3. Execution rechecks local/remote fingerprints, connection, epoch and capabilities. Drift requires a new Dry Run and review. Retained per-item outcomes distinguish success, failure and uncertain effects.
4. After interruption, inspect retained evidence and explicitly **Resume** as a human. Resume reconciles prior effects and skips recorded successes; ambiguous lookup or changed targets refuses further writes and needs a new review.

Remote writes and their local outcome records are separate effects. Local Restore cannot undo GitHub changes. Inspect the remote state and retained execution evidence before deciding the next action; never treat Restore as remote rollback.

## MCP operation

The running app serves MCP (Model Context Protocol) at `/mcp` over Streamable HTTP with `Mcp-Session-Id` sessions. Start the app first. For a stdio host, use Node 24 and `scripts/mcp-bridge.mjs` with the **absolute initial runtime directory** as its only argument. The bridge reads that directory's `.port`, validates the owning runtime and forwards to the app; it opens no SQLite database.

MCP is the Agent’s interface to Agentic Story Mapper’s application data and shared database runtime. Establish it before agent-guided planning; browser-only use needs no MCP. Open **Setup → Agent setup**, the Project overview's **Agent setup** link, or `/agent-setup` at the launcher's printed actual URL. This entry works before any map exists. The launcher prints its direct URL after health succeeds.

1. Install your own MCP-compatible host, such as Codex, Claude Code, Claude Desktop, Cursor or VS Code, and complete that host's provider configuration or sign-in. Agentic Story Mapper requires no provider account for local planning, installs no host and performs no host login.
2. Keep Agentic Story Mapper running and copy the generated configuration matching your host into its MCP settings. The values include the actual absolute Node executable, bridge path and stable initial runtime directory; preserve that directory even after switching Projects through an archive.
3. Save settings and restart or reconnect the host's MCP server. Configuration and clipboard success do not establish a connection; inspect connection/provider status in the host.
4. Ask the host to list tools and use read-only `ListProjects` and `ListStoryMaps` to inspect your Project. An empty map list is valid. Successful tool responses verify the bridge without changing content. Review Agent mode in the header's **Safety switches** before requesting changes; copying configuration enables no permissions. GitHub remains independent and optional.

For optional method-specific planning, the [BMad round-trip recipe](bmad-round-trip.md) describes explicit import/refresh mappings through MCP. It is not required for ordinary map work.

Local proposal templates are deterministic; Agentic Story Mapper has no embedded language model. An external host supplies model/provider access and may forward retrieved context to its provider. Host identity comes from initialize `clientInfo.name`; Agent access and Project scope govern tools. See the generated [Tool inventory and human-only boundary](mcp-tools.md).

After a hard stop, discovery may remain. Confirm there is **no live Agentic Story Mapper owner** (nothing answers `/health` at the recorded host and port) before removing only the stale `.port` and restarting. A missing, invalid or foreign discovery record is an error, not permission to open the database independently or kill an unknown service.

### Connect Codex or Claude Code

Keep Agentic Story Mapper running. The Agent can read the bootstrap configuration at the actual printed URL’s `/api/mcp/host-configs`, or you can open **Setup → Agent setup** and copy **Development command**. Use its generated `command` (the installed Node executable) and `args` (the bridge path followed by the initial runtime directory) intact. This bootstrap HTTP read prepares MCP; domain reads and changes then go through MCP, not direct database or HTTP access.

In your coding Agent, paste that JSON with this request:

```text
Connect this running Agentic Story Mapper to my host as an MCP server named storymapper.
Use the supplied command and args exactly, with stdio transport. Preserve my
other MCP servers. Explain any host setting or reconnect I need to perform.
Before any planning or map changes, call ListProjects and ListStoryMaps
through this host’s MCP tools. Report successful responses; an empty map
list is valid. If this session cannot load the tools, explain the required
reconnect and stop until the calls succeed. Respect host permissions.
Do not substitute direct HTTP calls or SQLite access for MCP.
```

For CLI setup, [Codex MCP](https://developers.openai.com/codex/mcp/) uses `codex mcp add storymapper --` followed by the quoted `command` and each quoted argument. [Claude Code MCP](https://code.claude.com/docs/en/mcp) uses `claude mcp add --transport stdio --scope local storymapper --` followed by those same values. Run registration in another terminal while the launcher stays running. If you use host settings instead, add a stdio server with those fields; the Claude Desktop JSON block is for Claude Desktop, not Codex configuration.

Reconnect or restart the host as it requires. If new tools are unavailable in the current session, resume in the reconnected host before continuing. Saved settings, successful copying and direct HTTP registry calls do not establish a host connection: successful `ListProjects` and `ListStoryMaps` calls through that host do. Repeat these read-only checks after restarting Agentic Story Mapper or reconnecting the host.

Once connected, the Agent asks what you want to map. With the user’s request and an allowed Agent mode, it can create the empty map through the existing audited `CreateStoryMap` command, then propose Activity → Step → Story content with `apply=false`. Review content proposals in that map’s **AI / MCP** view before approval and Apply. If protection requires a human to create the empty map, use **Create a Story Map** in the browser, then have the Agent read it through MCP before continuing. `CreateProject` and safety changes remain human-only; never bypass a refusal. Browser-only editing remains available throughout.

## Portable Project archives

Human UI export/import supports `.lsm.zip`. Export includes one Project's business database, manifest/checksum, documents, attachments and exports. Connection, sync and remote runtime state is redacted. The archive still contains private content, source documents and history; review it before sharing. It is not an export of user credentials or the source workspace.

Import validates archive paths, format, checksum, schema, redaction and business data in a staged copy. A supported older release copy migrates before adoption. Successful import creates a separate `imported-<uuid>.lsm` folder with a fresh epoch and switches the running app to it. This switch lasts only for the current runtime: restart still opens the configured startup database. Retain the import response's `localPath`; to reopen the imported Project after restart, set `STORYMAPPER_DB_PATH` to `storymapper.sqlite` inside that returned directory before starting again. The source archive and previous Project remain unchanged. Validation or candidate-migration failure keeps the current Project active and removes the failed candidate. A post-switch ownership-cleanup failure is reported as runtime unavailable; follow the error rather than assuming the switch failed.

Do not import prototype SQLite files or archives; use the prototype recovery path below. Do not unpack an archive over the active Project or modify manifest checksums to bypass validation.

## Restore and upgrade recovery

### Supported upgrades

Startup creates an empty database from committed release migration SQL. Existing databases must have an authenticated supported release-journal prefix and matching schema. Supported older releases migrate forward; each pending migration of an existing file-backed release database gets a durable `pre-migration` restore point before mutation. Snapshot/retention failure stops migration. Newer, unknown, divergent, malformed, schema-inconsistent or nonempty unjournaled prototype inputs are refused before business writes.

Keep originals unchanged when startup refuses an input. Open it with the matching application release, or use a supported pre-migration snapshot in a **separate Project directory** with `STORYMAPPER_DB_PATH` pointing to that copy. Preserve related local files as appropriate; never overwrite the only original. For prototype data, use the original development application to export required content as Markdown/TXT, then import those documents into a fresh release Project. Prototype SQLite files and archives cannot be adopted.

Never edit the migration journal, schema, payload versions or recovery markers to force an upgrade. Release schema identity, application version and archive format version are distinct. A failed migration reports retained usable snapshot information where applicable; retain that evidence and follow the stated recovery action.

### Human Restore

Use the human Restore UI to list recognized local snapshots, inspect the intended point and confirm Restore. Restore replaces the **entire active database, including every Project it contains**. The app validates a staged candidate, migrates supported older copies, drains admitted requests and creates a protected `pre-restore` point before replacing the database. Restore publishes a fresh epoch and keeps later audit/ChangeSet history marked as undone. Original snapshot bytes remain unchanged. Attachment files are retained and **not rolled back**; remote GitHub effects are not undone.

Snapshots are not permanent backups. Pruning first keeps up to 10 points per class, then targets a total of 1 GiB while preserving the last point of each class and the newest `pre-migration` and `pre-restore` points. Protected points can keep usage above that target; older points can disappear.

Interrupted-restore recovery runs before normal startup. If an unresolved restore or unavailable database is reported, restart for deterministic recovery first. Preserve the original database, sidecars, snapshots and recovery files while diagnosis is pending; do not manually delete `.restoring` or ready/rollback markers. If recovery still refuses, retain the reported error and use a matching release/supported protected snapshot in a separate directory. Never run a second writer against the same database.

## Troubleshooting

Run `node scripts/doctor.mjs` before setup or after a startup failure. It reports seven independent checks: Node version, Corepack availability, configured port free, runtime port discovery, installed dependencies, native module load and web build. It is read-only: no installs/rebuilds/builds or Project database opens. Before setup, missing dependency/build checks are expected to fail. Any failure exits nonzero.

Doctor checks local Corepack with `--version` without downloading pnpm. Local health probes are bounded to two seconds and 16 KiB. An occupied configured/preferred port can fail the port check even when discovery finds a healthy running app; inspect both rows instead of interpreting this as a complete runtime failure.

Normal errors identify a cause and next action without stack traces. Add `--debug` to setup/start/doctor for redacted diagnostic traces. Successful debug starts stream redacted server stderr; retained diagnostic tails are bounded. Review logs before sharing; operational paths/content can still be private.

| Failure | Repair |
| --- | --- |
| Unsupported Node or missing Corepack | Put installed Node 24 and usable Corepack on `PATH`; verify versions and rerun setup. |
| Dependencies/build missing | Run `node scripts/setup.mjs`; for install/store/build failure use `--debug` and repair the reported phase. |
| `ERR_PNPM_UNEXPECTED_STORE` | Use the same Corepack/pnpm environment as setup and inspect local pnpm configuration before reinstalling. |
| Native SQLite cannot load | Use the same installed Node 24, then run `corepack pnpm --filter @storymapper/db rebuild better-sqlite3`. |
| Explicit occupied `PORT` | Remove/change the process override first, or set a free port in optional `.env`; unset allows default-port selection. |
| Database directory inaccessible | Make the reported directory and files writable/readable as required, or point `STORYMAPPER_DB_PATH` at a file in a writable local directory. Doctor does not inspect database permissions. |
| Browser does not open | Repair the OS default-browser/opener association and restart. Opener failure stops the owned server. |
| `ECONNREFUSED` | Use the actual launcher URL, confirm the launcher is running and inspect its error; 4317 may not be the selected port. |
| Development API requests fail | Vite uses port 5173 and its proxy targets fixed `127.0.0.1:4317`; an API on an automatically selected port will not match that proxy. |

## Development and validation

From the root with the same Node 24 runtime:

```sh
corepack pnpm dev
corepack pnpm dev:server
corepack pnpm dev:web
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
corepack pnpm check
```

Development uses separate Vite/API servers; the user launcher serves the built UI/API at one origin. `lint` is the TypeScript no-emit check, identical to `typecheck`. Test scripts allowing no tests do not establish coverage. `check` is the offline blocking aggregate with architecture/size/hygiene/license/capability checks, build, script/workspace coverage tests, serial audit-performance and accessibility verification. See [Contributing](../CONTRIBUTING.md) for focused commands and submission scope.

Desktop accessibility scope is WCAG 2.1 AA at ≥768 CSS pixels except 1.4.10 Reflow. Separate diagnostics:

```sh
corepack pnpm --filter @storymapper/web test:a11y
corepack pnpm --filter @storymapper/web test:diagnostics
corepack pnpm --filter @storymapper/server test:diagnostics
```

Axe/jsdom does not certify native layout, contrast or reader behavior; stylesheet contrast-pair tests supplement the excluded `color-contrast` rule. The 1,000-Card 150/30/100/300 ms read/mutation/interaction/search references are diagnostic. Functional errors fail; fixture, environment, build and cold/warm context must accompany timing. Existing native accessibility evidence remains in [Story 6.10](../evidence/story-6-10/).

## Verification and publication prerequisites

```sh
node scripts/verify.mjs
node scripts/verify.mjs --skip-typecheck --skip-build
node scripts/verify.mjs --skip-typecheck --skip-build --check-health
```

The verifier checks Git hygiene, `.env` ignore/history, tracked sensitive paths, workspace metadata, installed Node/pnpm, existing default-folder access, source hygiene, size, capabilities and accessibility; the full command adds typecheck/build. `--check-health` discovers and verifies the owned runtime before probing `/health`. Quick flags do not skip the other gates. It does not mutate Project data. Stage intended new inputs before tracked-content checks and inspect staged changes for sensitive data.

Record native setup/start/health/browser/stop separately per OS. [Story 8.6 evidence](../_bmad-output/implementation-artifacts/evidence/story-8-6/) distinguishes inspected source, fixture tests and native observations. Missing Windows/Linux environments remain unverified; macOS PowerShell and an unavailable Docker daemon do not establish those OSes. Hosted checks alone do not prove native quickstart, OS browser opening or reader acceptance.

Before publication, supply and verify `[COPYRIGHT_HOLDER]`, `[PRIVATE_SECURITY_CONTACT]` and `[CONDUCT_CONTACT]` in the [License](../LICENSE), [Security](../SECURITY.md) and [Conduct](../CODE_OF_CONDUCT.md) declarations. Contacts remain inactive meanwhile. Preserve upstream notices and license obligations. Complete the current-tree/full-history audit, maintainer history disposition and exact-final-result rescan, including future contributor material. Record native quickstart, browser/clipboard, screen-reader/accessibility, credential and interrupted-push acceptance for available platforms, with unavailable environments explicitly unverified. Hosted CI and protection activation remain separate evidence. Passing local gates does not establish those observations. The tagged-release workflow below does not certify these unexecuted acceptance checks.

## Pull request continuous integration

The `CI` workflow in `.github/workflows/ci.yml` runs exactly one Linux job named `CI` per pull-request revision. New revisions cancel older runs. It installs Node 24, Corepack and pinned pnpm `9.15.4`, installs the frozen lockfile, rebuilds and constructs native SQLite, then runs `corepack pnpm check:ci`. Only the pnpm store is cached, keyed by OS, Node 24 and lockfile hash; `node_modules` is never cached.

`check:ci` runs boundaries, size, hygiene, licenses, capability consistency, the normal typed build, contracts/core unit suites and fixed server ChangeSet-preview and web first-map/filtered-report smoke files with one worker. It needs no BMAD, models or Python environment. Any failed child fails the gate. When a successful Git diff of `HEAD^1..HEAD` shows a changed `pnpm-lock.yaml`, the same job runs `node scripts/ci-audit.mjs`. It reports only validated advisory counts and a fixed status; advisories or unknown scan results remain informational. The release audit remains blocking.

Configure the single required status check `CI`, replacing obsolete matrix names. A maintainer must activate the repository ruleset or branch protection separately, require pull requests and this check from GitHub Actions, and require branches to be up to date. Confirm a new pull request reports `CI` and that a missing or failing check prevents merging. Workflow tests do not activate protection or prove a hosted run. This workflow does not handle `merge_group`; configure that separately before enabling a merge queue.

If GitHub rejects protection/rulesets for a private repository with an upgrade-required HTTP 403, automatic merge enforcement is unavailable in that plan. The maintainer must check the successful `CI` result before merging and record that enforcement limit. This policy does not authorize changing repository visibility or purchasing a plan.

## Full local and platform verification

Run `corepack pnpm check` on the operator's installed host before release. It preserves all product script tests, exhaustive workspace coverage floors, audit-performance, accessibility, typecheck and build checks. Product `check` and `test` do not discover the BMAD wrapper. Local board-import integration tests may require Python/uv.

Run `corepack pnpm test:bmad` explicitly when changing BMAD development tooling. It requires `uv` and the installed `bmad-loop` tool, uses that tool's Python environment and fails clearly when prerequisites are missing. Hosted product CI does not install orchestration tooling.

On each available platform, use the existing commands for targeted verification:

```sh
node scripts/setup.mjs
node scripts/start.mjs
node scripts/verify.mjs --skip-typecheck --skip-build --check-health
node --test --test-name-pattern="setup installs|start serves" scripts/commands.test.mjs
corepack pnpm --filter @storymapper/db test
corepack pnpm --filter @storymapper/server exec vitest run src/http/routes/changeset-preview.test.ts --maxWorkers=1
corepack pnpm --filter @storymapper/web test:a11y
```

Observe browser opening, health and Ctrl+C shutdown in the actual desktop session. Record the host, revision, commands and results, including unavailable OSes and unexecuted native/browser/reader scenarios. The maintainer accepts that releases may proceed without platforms unavailable to the operator; there is no mandatory all-OS gate. Linux CI and host-local checks do not establish unexecuted platform coverage. [ADR 0012](adr/0012-minimal-hosted-ci-and-local-verification.md) records this policy. Privacy, exact-candidate, audit and publication safeguards remain mandatory.

## Versioned releases

The root [package.json](../package.json) is the authoritative application SemVer, currently `0.1.0`. The server reads validated root metadata for `/api/health`, Project archive manifests and MCP initialization, including the stdio bridge. `/health` remains the launcher/runtime liveness endpoint. Workspace package versions, database release schema identity, archive `formatVersion`, JSON payload versions and operation versions are independent. Missing, malformed or invalid root metadata refuses startup; repair the root metadata rather than substituting a version.

A release starts with a deliberate maintainer tag, strictly `v<SemVer>` and exactly matching the root version at that revision (`v0.1.0` for the current metadata). Choose the release candidate, update root metadata as appropriate and review it before tagging. Creating this automation does not authorize a tag, push or public release. It publishes release notes; it does not package installers, publish npm packages or add automatic updates.

Before a maintainer previews or pushes a release tag:

1. Resolve the declaration, privacy, provenance and upstream rights prerequisites above; record actual local/hosted verification and unavailable-platform limits. Choose the final public-history disposition and audit that resulting repository, including contributor material added later. An earlier publication report does not establish clearance for a new candidate.
2. Run `corepack pnpm check` and `node scripts/verify.mjs` under installed Node 24 and pinned pnpm. Preserve the original Project folder and local files before opening user data with a changed release; use [Supported upgrades](#supported-upgrades) and [Human Restore](#human-restore) for protected migration and recovery.
3. Provision the repository Actions secret `PUBLICATION_POLICY` privately. Its value is JSON with only the `employerTerms` key containing a nonempty array of the actual maintainer-supplied terms. Keep those values out of tracked files, commands, logs and issue bodies; do not substitute invented terms or an empty policy. The release helper receives the secret through its environment and writes only transient policy input outside the checkout, then removes it. Missing or malformed policy blocks publication.
4. Commit and review the final candidate, including its root version. Review generated notes and their selected history range using the disposable preview below. The nearest reachable valid version tag (by the fewest commits to the candidate, with lexical tag tie-break) bounds the range; the first release uses the candidate's full ancestry. Notes and the full reachable Git object/ref history belong to the publication input. A tag, changed notes, changed policy/tools or other candidate change invalidates an earlier report. Generate notes before a fresh scan and recompute exact verification immediately before publication.

In a POSIX shell at the candidate repository root, use installed Node 24 and pinned pnpm to preview committed files in an independent disposable clone. This creates the preview tag only in that clone and supplies every required event variable. It needs no GitHub credentials or publication policy:

```sh
revision=$(git rev-parse HEAD)
release_tag="v$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).version')"
preview=$(mktemp -d)
git clone --no-local . "$preview/checkout"
git -C "$preview/checkout" checkout --detach "$revision"
git -C "$preview/checkout" tag "$release_tag" "$revision"
(
  cd "$preview/checkout" || exit 1
  corepack pnpm install --frozen-lockfile || exit 1
  GITHUB_EVENT_NAME=push GITHUB_REF_TYPE=tag \
    GITHUB_REF="refs/tags/$release_tag" GITHUB_SHA="$revision" \
    node scripts/release.mjs notes
)
cat "$preview/checkout/release-notes.md"
```

Stop on any failed command. Review the displayed notes and range before proceeding. Keep any review copy outside the candidate checkout, then remove the disposable clone with `rm -rf -- "$preview"`. Preview output is not publication clearance. After all prerequisites, notes review and separate authorization, create the real local tag and push that exact tag from the original repository in the same shell:

```sh
test "$(git rev-parse HEAD)" = "$revision" && git tag "$release_tag" "$revision"
```

Inspect `git show "$release_tag"` and confirm the reviewed candidate before the separately authorized push:

```sh
git push origin "refs/tags/$release_tag"
```

The [Release workflow](../.github/workflows/release.yml) checks out the immutable event revision with full history. Its Linux `Release quality (Linux)` job installs Node 24/Corepack/pinned pnpm with the frozen lockfile, constructs native SQLite and runs `corepack pnpm check:ci`. The operator runs the full local product check before release; unavailable macOS/Windows environments alone do not block publication. `Release dependency audit` safely validates advisory counts; high/critical findings, unavailable transport/registry results, malformed output or inconsistent scanner exits block release. Lower-severity findings do not bypass the other gates.

The workflow invokes these commands in its tag-event environment:

```sh
node scripts/release.mjs validate
node scripts/release.mjs audit
node scripts/release.mjs publish
```

Every command requires a push/tag event with `GITHUB_EVENT_NAME=push`, `GITHUB_REF_TYPE=tag`, `GITHUB_REF=refs/tags/v<SemVer>` and `GITHUB_SHA` equal to both checkout HEAD and the tag's commit. A shallow checkout, mismatched root version, malformed tag or changed revision fails. `Publish checked release` depends on successful quality and audit jobs; failed, skipped or cancelled results prevent publication. Its helper validates `RELEASE_CHECKS` with both `quality` and `audit` equal to `success`. Only the publishing job has `contents: write`; only the publishing step receives the publication policy and `GH_TOKEN`.

`node scripts/release.mjs notes` creates `release-notes.md` exclusively for inspection in a disposable candidate checkout with that same validated event environment. It lists commit hashes, escaped commit subjects and the selected range, excluding authors, commit bodies and tag annotations, plus upgrade guidance and acceptance limits. An existing notes file is refused: keep preview output separately, since `publish` creates its own notes before scanning. Publication freshly scans those notes, working/index/new inputs, all refs and reachable authenticated Git objects, then recomputes and compares the exact report immediately before `gh release create --verify-tag`. Unresolved declaration markers in actual declarations, unsupported/unreviewed content, findings or stale/changed evidence block the write. The committed report from an earlier candidate is insufficient.

Immediately before the release write, `verifyRemoteTag` uses authenticated `gh api` requests to compare both the remote tag's raw object identity and its peeled commit with the checked local tag and candidate revision. Replacing an annotated tag with another tag object at the same commit is refused. Unavailable, malformed or observed moved-tag results block publication. The publishing workflow retains the accepted sanitized publication report and notes digest in its output; it does not emit the private policy. Maintainers must configure immutable/restricted release tags before publishing: remote movement between this check and GitHub release creation remains a race that local verification cannot prevent.

Local fixture and workflow checks do not establish a hosted release run. Record the actual tag, immutable revision, job URLs, policy digest and accepted exact-candidate result only when those actions have been separately authorized and executed. Do not manually bypass a failed gate or reuse a report from another revision.

## Changelog

- 2026-11-08 v0.4.12: Link the optional MCP planning recipe separately from repository development automation.

- 2026-11-08 v0.4.11: Remove the stale blanket publication-report status; retain fresh exact-candidate verification.

- 2026-11-08 v0.4.10: Require host MCP verification before agent-guided map work, distinguish bootstrap from domain access and retain human-only setup and approval boundaries.

- 2026-11-08 v0.4.9: Add guided local startup and Codex/Claude Code MCP registration from generated paths, with read-only verification and an explicit planning proposal.

- 2026-11-08 v0.4.8: Use one bounded Linux CI job, retain full local product verification and explicit BMAD tests, and record accepted unavailable-platform release coverage.

- 2026-10-31 v0.4.6: Clarify Project/Map hierarchy, optional toolbar help and map-free Agent host setup, reload and read-only verification.

- 2026-10-31 v0.4.5: Align setup with automatic health-checked launch, empty first maps, autosave and later startup.

- 2026-10-31 — v0.4.4: Document the default-disabled Persona frontend capability gate, preserved data and build-time operation.

- 2026-10-31 — v0.4.3: Document independent default-disabled Releases/Roadmaps flags, view purposes and same-map redirects.

- 2026-10-31 v0.4.2: Document all view feature flags, their defaults and purposes, Sources visibility, and frontend rebuild instructions.

- 2026-10-20 v0.4.1: Make disposable notes preview executable before the real local tag/review/push sequence; describe remote tag object binding and retained sanitized release evidence.

- 2026-10-20 v0.4.0: Document root application metadata, maintainer-controlled release gates and private policy provisioning; preserve protected upgrade/recovery and pending acceptance.

- 2026-10-20 v0.3.1: Clarify imported-Project restart selection, whole-database Restore scope and snapshot pruning.
- 2026-10-20 v0.3.0: Rewrite operations in English from source/tests; document actual port discovery, seven doctor checks, consent/credential precedence, four safety flags, shared MCP, reviewed remote plans, implemented archives and supported upgrade/Restore recovery. Preserve CI names/configuration and outstanding acceptance.
- 2026-10-20 v0.2.10: Add three-platform pull-request quality checks, safe informational audit and pending maintainer protection activation.
- Earlier document versions described prototype behavior; use Git history for historical instructions.


## Card Definition of Ready reviews

Choose the explicit Card type in create/edit/bulk independently of hierarchy. Existing Cards remain untyped; local saves are allowed. Existing GitHub connections need explicit outbound native Issue-type remapping after this upgrade. A missing or unavailable mapping blocks affected Dry Runs; an explicit Card type change produces a reviewed native Issue-type change.

Open Card reviews from a Card badge, its detail panel or the map-wide Card reviews menu. Select Cards to request reviews. Without an invoking agent, work remains visibly waiting. Copy the skill/MCP instruction and run the installed `card-dor-review` skill in the connected agent. Agentic Story Mapper does not launch models, agents or a polling service. Failed or stale reviews never appear clean.

Project review settings are human-only: review before agent push defaults on; reviews after applied agent creation/content changes and human push overrides default off. Optional save reviews run only after Apply. Human-origin pushes remain review-free; exact type mapping and existing safety checks still apply. An agent-origin Dry Run keeps its provenance through human confirmation and resume and requires current successful review without effective blockers. Warnings do not block. If explicitly enabled, a human may confirm an override with a reason bound to the exact Dry Run and inputs.

Select findings to request KI corrections, copy the handoff and have the invoking agent propose the version-bound ChangeSet. Open the correction preview, approve it as a human, then Apply separately. Request a new review to verify the applied result. Manual corrections use the existing editor. Ignore one reviewed occurrence or the rule for that Card with a reason; revoke exceptions from the Card panel. Historical findings remain visible. Redacted portable archives omit review evidence; Restore invalidates reports by epoch.

## Review workflow changelog

- 2026-11-04 v0.4.7: Add explicit Card types, native type remapping, skill-based DoR review, human exceptions/corrections and exact agent-origin push gating.
