# Contributing to Agentic Story Mapper

Date: 2026-11-11. Version: 11.

Reproducing statement: Give outside contributors accurate local setup, validation, scope, review and licensing guidance using the repository's actual commands and architecture, including maintainer-controlled versioned releases and protected Project upgrades, without requiring AI tooling or claiming publication clearance.

## Before changing code

Read [AGENTS.md](AGENTS.md) and the applicable `.cursor/rules/*.mdc` files, then the [Architecture spine](_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md). Follow the [Conduct](CODE_OF_CONDUCT.md) policy. Send security concerns through the [Security](SECURITY.md) process; issues must contain only sanitized, non-sensitive information.

Check existing issues before proposing work. Describe the problem, intended outcome, bounded acceptance criteria and scope before a substantial implementation. Discuss architecture changes, dependencies and changes to data or external effects with maintainers first. Keep each pull request focused and explain any remaining uncertainty.

Use the English [Agentic-coding walkthrough](docs/agentic-coding.md) for preparation, manual implementation, independent review and local PR preparation.

Manual contributions are welcome. No AI subscription, agent installation or paid service is required to edit, test or submit a change. The repository's optional [BMAD loop](docs/bmad-loop.md) automates development and review for maintainers.

## Report a problem or request work

Use the [issue chooser](https://github.com/GrumpyKitten81/AgenticStoryMapper/issues/new/choose): report a bug, suggest an improvement, or plan a task. A bug needs the observed problem, steps to reproduce it and expected behavior. An improvement needs your goal and the change that would help. A task needs the intended change and a completion check. Other context is optional; you do not need to know our internal planning process.

For a manually written report, use the matching [bug](docs/templates/bug-ticket-template.md), [improvement](docs/templates/improvement-template.md) or [task](docs/templates/task-template.md) structure. Review logs and screenshots before sharing; vulnerability details belong in the [Security](SECURITY.md) process.

Story-map structure and planning types are independent. Use neutral [Activity](docs/templates/map-activity-template.md), [Step](docs/templates/map-step-template.md) and [Story](docs/templates/map-story-template.md) descriptions for structural levels. Keep parent relationships explicit through supported Card operations.

Use the independent [Epic](docs/templates/epic-template.md), [Feature](docs/templates/feature-template.md) and [User Story](docs/templates/story-template.md) issue forms when that planning type is intended. Forms do not assign a map level or native GitHub Issue type. The [concept guide](docs/story-map-levels-and-issues.md) explains all four concepts and local map-wide Epic context.

## Local environment

Use installed Node 24 (`>=24 <25`) and Corepack with the root `packageManager` pin, pnpm `9.15.4`. With that Node 24 environment active on `PATH`, provision Corepack using the same command as CI:

```sh
npm install --global corepack@0.35.0
```

This must install into the active Node 24 environment. Use that same Node installation to install and run native `better-sqlite3`; do not copy `node_modules` between operating systems. Hosted Corepack provisioning remains unverified until actual CI runs are recorded.

From the repository root:

```sh
node --version
corepack pnpm --version
node scripts/setup.mjs
```

Setup installs the frozen lockfile, builds the web app, creates a local default Project folder and opens the browser after the local server is healthy. Keep its terminal open while using the app. Press Ctrl+C before running more commands in that terminal; use `node scripts/start.mjs` for later sessions. UI and API share the URL printed by the launcher, normally `http://127.0.0.1:4317`. With `PORT` unset, a busy default port causes selection of an available port; an explicitly configured occupied port fails. Stop the launcher with Ctrl+C. For separate development servers use `corepack pnpm dev`; see the [Runbook](docs/RUNBOOK.md) for operational details.

## Implementation and validation

Follow the repository's spec → implementation → verification → review workflow. A prepared spec records intent, acceptance criteria and boundaries; implementation must satisfy that scope. The current [Story 8.5 spec](_bmad-output/implementation-artifacts/spec-8-5-license-and-community-files.md) is an example. Include reproducible commands, their actual results and any unverified acceptance criteria, then address review findings before merge. Maintainers may use the BMAD automation; a manual contributor can provide the same spec, implementation and evidence in an issue or pull request.

Run focused tests while working, for example:

```sh
corepack pnpm --filter @storymapper/server test
corepack pnpm --filter @storymapper/web typecheck
```

The root commands are:

```sh
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm check
```

`check` is the offline blocking aggregate: architecture boundaries, source size, tracked-content hygiene, resolved dependency licenses, capabilities, build, script tests, workspace coverage, serial audit-performance checks and release verification including accessibility. `test`, `typecheck` and `build` are useful individual checks; they do not replace the full aggregate. Dependencies must already be installed. Run `corepack pnpm check` on the final candidate and report any failures accurately.

Hygiene scans tracked inputs only. Before final checks, stage intended new files and inspect `git diff --cached` for secrets, private data and other prohibited inputs.

## Architecture and data boundaries

- `packages/contracts` owns the shared Zod schemas for API, MCP and UI; do not duplicate them.
- `packages/core` contains pure domain logic; keep network and database effects out of it.
- `packages/db` owns repositories and persistence; other packages must not issue raw Drizzle queries. Preserve transactions, audit history, migration and recovery guarantees.
- External, GitHub, AI and agent-driven changes to Story Map data produce a ChangeSet before a separate auditable apply. Outgoing GitHub effects require the existing reviewed plan and explicit confirmation flow.
- Keep the owned launcher and HTTP Host validation on loopback. Direct non-loopback binding requires explicit `STORYMAPPER_ALLOW_REMOTE_HOST=true` and security approval.
- Never commit secrets, `.env`, `GITHUB_TOKEN` values, `local-projects/*.lsm/`, `*.sqlite*` or `input/`. Use disposable, sanitized test data. Keep imported/generated source links and provenance intact.
- Add no SaaS dependency, cloud account, telemetry or outbound call unless the agreed task requires it.

## Pull requests, merge and release

Explain what changed, why, validation performed and what reviewers should inspect. Link the relevant issue/spec and disclose unverified platform or behavior checks. Use the supplied pull request template.

Use Conventional Commits: `<type>[optional scope]: <short description>`, for example `docs: clarify contributor setup`.

The pull request workflow has one Linux quality job named `CI`. Maintainers require its successful result before merging; workflow files alone do not establish enforced branch protection. Comprehensive product verification remains local, as described above. See [ADR 0012](docs/adr/0012-minimal-hosted-ci-and-local-verification.md) for the accepted CI/platform policy.

`Dependency audit (informational)` is nonblocking for pull requests and must not be reported clean when its result is unknown. The release workflow separately blocks on its dependency audit. Record unavailable platform, browser and reader coverage honestly; unavailable environments alone do not impose a mandatory multi-OS release gate.

Only authorized repository maintainers merge changes and create releases. Review approval does not itself authorize a contributor to merge, publish, push a tag or alter repository settings. The root `package.json` supplies the application SemVer (currently `0.1.0`) for `/api/health`, exported archive manifests and MCP initialization. Workspace package versions, database schema identity, archive format and operation/payload versions are independent. A maintainer deliberately creates a strict `v<SemVer>` tag matching that root version and exact candidate revision only after publication prerequisites are resolved. The [Release procedure](docs/RUNBOOK.md#versioned-releases) describes local verification, bounded Linux quality checks, blocking advisory/content gates, private policy provisioning and generated notes. This automation does not create tags or provide installers, npm publication or an updater.

Project upgrades use the existing protected forward-migration boundary. Preserve the original Project and local files before upgrading; supported older release journals migrate with durable pre-migration restore points. Nonempty unjournaled prototypes and newer, unknown or divergent journals are refused. Follow [Upgrade recovery](docs/RUNBOOK.md#restore-and-upgrade-recovery) for a matching release or separate snapshot copy; never stamp a prototype journal or overwrite the only original.

## License and publication prerequisites

Agentic Story Mapper uses the [MIT license](LICENSE). Contributions must be yours to submit and compatible with that license. Preserve third-party copyright, license text, attribution, notices and any applicable source or modification-disclosure conditions; the root MIT license does not replace upstream licenses. `corepack pnpm check-licenses` checks resolved installed dependency metadata against the existing [Policy](scripts/license-policy.mjs); passing it does not remove those obligations.

Repository use does not require a version tag, GitHub release, private reporting contact or Actions secret. Security and conduct concerns use sanitized GitHub Issues under the linked policies. Changing repository visibility requires a separate maintainer decision and review of the actual contents and rights. Optional tagged releases retain the existing content/history, exact-candidate and dependency-audit safeguards; their `PUBLICATION_POLICY` Actions secret is not application configuration. Native/platform coverage follows the accepted limits above.

## Changelog

- 2026-11-11 v11: Update repository links, adopt GitHub reporting and separate repository readiness from optional tagged releases.

- 2026-11-08 v10: Remove obsolete three-OS check names and blanket native-acceptance prerequisites; align release guidance with the accepted Linux CI policy.

- 2026-11-08 v9: Separate neutral map-level templates, planning-type forms and map-wide Epic context.

- 2026-11-08 v8: Add dedicated Epic/Activity, Feature/Step and User Story templates and distinguish structured planning from general improvement requests.

- 2026-11-08 v7: Introduce the three public report forms and matching Markdown structures without requiring internal planning terminology.

- 2026-10-31 v6: Explain setup auto-launch, terminal ownership and later startup.

- 2026-10-20 v5: Link the reproducible contributor walkthrough and isolated rehearsal.

- 2026-10-20 v4: Explain authoritative application version, maintainer tag/release gates and protected Project upgrade/refusal/recovery.

- 2026-10-20 v3: Use the actual launcher URL and distinguish default-port selection from explicit port conflicts.
- 2026-10-20 v2: Clarify Corepack provisioning, tracked-input checks and commit format; keep internal scope decisions in story evidence.
- 2026-10-20 v1: Add contributor setup, architecture, validation, review and publication guidance.
