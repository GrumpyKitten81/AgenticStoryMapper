# Epic 1 Context: Run anywhere, in English

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->
<!-- Updated: 2026-10-03. Version: 1. Purpose: compile concise Epic 1 implementation context from the epics, PRD, architecture and UX artifacts. Changelog: created the English UI, local runtime, onboarding and verified-baseline context. -->

## Goal

A user can install and start Agentic Story Mapper with one command each on Windows, macOS and Linux, open one local app URL, and begin with an English sample Story Map and a short getting-started checklist. Failures explain their cause and the next action. The epic also establishes which board requirements already work so later implementation closes verified gaps instead of rebuilding existing behavior.

## Stories

- Story 1.1: English UI from one string module
- Story 1.2: Serve the app under one URL
- Story 1.3: One command to set up and start on any system
- Story 1.4: Understandable failures and a doctor command
- Story 1.5: Sample map and getting-started checklist
- Story 1.6: Verified baseline for the board requirements

## Requirements & Constraints

- All interface text, accessible names, errors, loading and empty states, default Personas, Workflow Statuses, seed content and built-in templates must be English. Interface strings have one source so later translation requires no code search. Language migration preserves behavior and meaning.
- The English hygiene check rejects German umlauts, `ß` and words from a maintained German stop-word list in web source, seeds and built-in templates; failures identify file and line.
- Node 24 and Corepack are the only installation prerequisites. Pin pnpm through Corepack and bound the supported Node range while Corepack ships with Node. Setup requires no manual configuration file; environment variables are optional overrides.
- The same setup and start commands work on all three supported operating systems, without colliding with pnpm built-ins. Remove PowerShell scripts and the downloaded repository-local runtime when the portable install path lands; update quickstart, runbook install/start guidance and agent running instructions together.
- Setup installs dependencies, builds the web app and prepares the default Project folder. Start waits for a healthy server, prints its URL and opens the default browser. Record clean-machine timings against the ten-minute fresh-clone-to-sample-map target.
- Diagnosis is read-only, reports pass or fail per check, gives a named fix and exits nonzero on failure. Check runtime, Corepack, port, installed dependencies, native SQLite module and built web assets; report health when a server answers. Routine errors contain one cause and one next action, with stack traces reserved for debug mode.
- A new empty Project receives a sample map containing Activity, Step and Story levels. Existing maps are left alone; removing the sample changes no other data and does not recreate it. Checklist progress and dismissal survive reloads and restarts.
- Verify existing board requirements in the running app with reproducible Met, Partial or Missing evidence. Preserve Met behavior through meaningful regression coverage and map gaps to later stories. This verification adds no features.
- Keep the app local: one loopback origin, no CDN or remote fonts, and no network connection without an enabled Connector or Agent. Interactive elements need English accessible names and keyboard operation.

## Technical Decisions

- Keep all web interface strings in `apps/web/src/ui-strings`. Role names and accessibility labels use that same source; color alone never communicates a role or state.
- One server process serves built web assets and the API on one loopback port. Browser requests use relative API URLs; development uses Vite with an API/health proxy. Client navigation resolves to the app entry point, while unknown API routes return a JSON 404. Production startup refuses missing built assets with an actionable build instruction.
- Portable runtime commands are Node `.mjs` scripts using `node:path`; enforce LF through `.gitattributes`. The native SQLite module must match the runtime that starts the app. Diagnosis never changes Project state.
- Store English Story Map templates as JSON under `packages/core/templates`; the sample uses the same template mechanism. Applying a template is a human use case. Persist getting-started state in `project_settings`.
- Shared contracts remain the single schema source; repositories own persistence and domain logic stays free of database and network effects. Before the first tagged release, development databases are disposable and schema changes use the current mechanism; the release baseline migration belongs to Epic 8.

## UX & Interaction Patterns

Use direct, concrete English with verbs and counts. Name objects consistently as Project, Story Map, Card, Activity, Step, Story, Note, Release, Slice, ChangeSet, Restore point and Card Key. Replace misleading epic/feature wording with Activity/Step. Avoid blaming the user, marketing language, emoji and exclamation marks.

An empty state has a title, one explanatory sentence and one primary action. First start shows the sample in the Story Maps list with the checklist over the list. Checklist items mark themselves from actual activity: a non-sample map, a user-created Card, a GitHub connection and a successful export. Connecting GitHub is optional; the checklist can be dismissed and operated by keyboard. An unreachable-server banner explains how to start the server.

## Cross-Story Dependencies

The string module lands before later UI work, including the checklist, so subsequent stories share the English source. Serving one app URL supports portable startup and automatic browser opening; diagnosis shares the resulting runtime and health assumptions.

Story 1.6 has no dependencies and can run first. Its verified baseline informs the later board stories, especially Epic 6. Epics 2, 3 and 4 follow Epic 1; Epic 8 runs alongside and finishes last, reusing the real installation path and English hygiene checks for release readiness. User-selected Story Map templates remain Later scope; the sample template stays Core.
