---
title: 'Clone, setup, create a Story Map'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
baseline_commit: '05b33ebba53ea8050758220d19936cc5f9556812'
review_loop_iteration: 0
context: []
---

# Three-step first use

Date: 2026-10-31. Version: 1.
Reproducing statement: Implement the user-approved first-use plan for Git-aware beginners: clone, setup with launch, create an empty guided Story Map.

<frozen-after-approval reason="User approved the conversational plan with Implement the plan">

## Intent

Make the existing local app immediately usable by a first-time story mapper who already has Git and Node 24. The flow is clone, one setup command that opens the app, and create a named empty Story Map. Success includes creating an Activity, its Step and a Story, understanding local autosave and recovering the same data after restart.

## Boundaries & Constraints

Always reuse existing launcher, persistence, creation APIs, shared contracts, design primitives and English UI strings. Keep GitHub optional and off by default. Keep all existing project data, sample maps, archives and history. Keep the existing standalone voluntary onboarding page. Start later sessions with start.mjs. Setup must leave the terminal owning the server and explain Ctrl+C. No additional accounts, env configuration, dependencies or modes.

Never auto-generate sample business content for new first-use projects, perform external operations, commit, or rewrite history. No schema migration needed. Existing sample fixtures may be explicitly created in tests to preserve coverage of legacy sample identities.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
| --- | --- | --- | --- |
| Setup succeeds | Supported prerequisites and installed build | Launch using existing start checks, health and browser behavior | Propagate launcher errors |
| Setup fails | Install/build error | Do not launch | Concrete phase and next action |
| Map creation | Trimmed nonempty name | Create and navigate straight to enabled default map view | Inline error; no navigation on failure |
| Invalid/repeated submit | Blank name or pending mutation | No extra creation | Disable action appropriately |
| Guided hierarchy | Existing persisted visible cards | Explain next missing Activity, Step or Story linked to a valid hierarchy | Recompute after reload or deletion |
| New project | Checklist initialization | No automatic sample map | Existing samples retained |

</frozen-after-approval>

## Code Map

- scripts/setup.mjs installs/builds then creates default.lsm; scripts/start.mjs performs runtime, configuration and native checks then calls launcher.mjs. Extract reusable startup function rather than importing an entrypoint with side effects. scripts/commands.test.mjs and fixtures cover lifecycle; setup now remains running intentionally.
- README.md Quickstart currently follows scope and requires separate setup/start; docs/RUNBOOK.md contains operational setup text that must remain consistent.
- apps/web/src/app/routes/story-maps.index.tsx creates without navigating; project archive section precedes create form. useGettingStartedChecklist enables list only once fetched. Preserve sample badge/delete identity behavior, but prioritize creation and keep archives secondary.
- apps/web/src/features/onboarding/GettingStartedChecklist.tsx has four mandatory-looking rows including GitHub/export; reduce core checklist to map creation/cards and present optional actions separately. Legacy persisted completion fields can remain without migration.
- apps/web/src/features/story-map/components/DiscoveryMatrix.tsx already provides Activity empty-state action and CardComposer plus AddControl creation paths. Reuse those handlers for guidance. Guidance must use full snapshot cards with deleted/disabled visibility semantics rather than filtered search results; follow valid parent relationships, not unrelated level counts. Keep existing preview read-only behavior.
- apps/web/src/ui-strings/app.ts and story-map.ts centralize copy; index.ts exports dictionaries. Use dedicated compact helper/component if needed to meet size limits; no new dependencies or speculative abstractions.
- packages/db/src/repositories/projects-repository.ts initializeGettingStarted seeds sample template on first read/start. Remove that automatic creation, initialize null sample identity for new projects, preserve existing initialized state. Existing tests assume automatic samples and require explicit fixture creation where testing sample lifecycle rather than deleting those tests.
- Relevant tests: apps/web/src/features/onboarding/getting-started.test.ts, component accessibility tests, packages/db/src/repositories/getting-started.test.ts, apps/server/src/http/routes/getting-started.test.ts, scripts commands/setup/runtime tests. Read before changing behavior.

## Tasks & Acceptance

- [x] Startup: shared startup function, setup auto-launch and clear phase/status output, update lifecycle tests for long-running setup and failure behavior.
- [x] Documentation: README begins with concise three-step quickstart including real clone URL and cd, prerequisites/Corepack provisioning; later startup command and terminal ownership explicit. Update inconsistent runbook instructions.
- [x] Frontend: prominent named create form first, inline validation/pending/error handling and immediate enabled-default-view navigation; move project/archive details below main work. Separate optional checklist actions.
- [x] Guidance: contextual Activity/Step/Story help using existing creation controls and hierarchy, local autosave notice, persisted-state-derived progress, keyboard/focus accessible behavior.
- [x] Initialization: no automatically created sample for new projects; preserve legacy sample behavior and data. Update meaningful regression tests.
- [x] Verification: focused launcher, web and DB/server tests, typecheck/build and source hygiene; browser inspect resulting frontend if runtime is available without changing private user data.

Acceptance criteria:
- Given supported prerequisites, when setup completes, then the health-checked app opens without a separate start command.
- Given a new project, when opened, then creation is primary and no sample data is generated.
- Given a successful creation, when the response arrives, then the new map opens immediately.
- Given a partial valid hierarchy, when cards change or reload, then help identifies the next structural action and disappears on a complete Activity-Step-Story chain.
- Given existing user content, when setup or checklist initialization repeats, then content remains intact.

## Implementation Notes

Intent gaps: none; user chose Git-aware beginners and empty guided first map. Irreversibles: none intended; no migrations, no live data writes. Footprint spans launcher, existing documentation, initialization and frontend first-use components/tests. Prior plan already explicitly approved, so no repeated approval checkpoint.

## Spec Change Log

## Review Triage Log

- Blind layout: high, patch. Live browser confirms horizontal flex makes the helper consume a large side column; shared-shell placement restores full board width.
- Blind stale action: medium, patch. createCard onSuccess did not await canonical refetch; returning that promise retains pending state until refreshed.
- Blind alternate view: medium, patch. Tree is a supported default destination; shared-shell placement supplies the same guidance there.
- Blind saved-card coverage: medium, patch. Existing test injects cache data rather than exercising successful writes; extend submission/refetch coverage. Native isolated browser additionally created all three cards and reloaded successfully.
- Blind retry coverage: low, patch. Existing assertion only enabled the button; exercise a successful retry.
- Blind completion announcement: medium, patch. Conditional live region disappeared on completion; retain a stable region with completion copy.
- Blind contributor recipe: low, patch. Current setup description misses startup/browser side effects; correct sentence and metadata.
- Verification unrelated Story: medium, patch. Existing test has no valid Activity-Step chain plus unassigned Story; add the missing relational case.
- Edge-case hunter: no findings.

## Verification

Run focused scripts tests and workspace web/db/server regression tests plus web typecheck/build. Native Windows/macOS/Linux fresh-clone runs and an independent novice observation require available systems/participants; report unverified evidence explicitly.

## Changelog

- 2026-10-31 v1: Record approved implementation scope.


## Final evidence

All review patches completed: shared-shell compact guidance, stable completion region, awaited canonical updates, successful retry and unrelated Story/Tree/real submit regressions. Web85focused plus30style checks passed; DB561unique tests passed across initial full run559passed and native rerun of two files56passed; server129focused passed. Repeat fresh setup lifecycle passed including preserved map. Web/db typechecks and web build passed. Isolated live browser created the full hierarchy, reloaded and confirmed full-width layout. Final screenshot: /tmp/storymapper-first-use.png.

Quick verify: hygiene passes, then pre-existing changesets/review.test.tsx:66 size violation stops aggregate. Existing missing-build launcher browser wait20s failed even on native isolated-temp rerun; no timeout changed. Native multi-OS/independent novice acceptance unverified. No commit or push authorized or made.
