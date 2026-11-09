---
title: '1.2 Serve the app under one URL'
type: feature
created: '2026-10-03'
status: done
baseline_revision: f37d68f56f9a379e6727f94ee2be45b2b694ee5e
review_loop_iteration: 0
followup_review_recommended: false
context:
  - [REDACTED_HOME]/.claude/CLAUDE.md
  - [REDACTED_HOME]/Projects/StoryMapper/AGENTS.md
  - [REDACTED_HOME]/Projects/StoryMapper/.wolf/OPENWOLF.md
  - [REDACTED_HOME]/Projects/StoryMapper/.wolf/cerebrum.md
warnings: [oversized]
deferred: []
---

Purpose: implement Story 1.2 from Epic 1, serving built UI and API at one loopback origin. Version: 5. Updated: 2026-10-03. Reproduce from the story's six acceptance scenarios and the source map below.

<intent-contract>

## Intent

**Problem:** Production currently serves only the API, so opening Agentic Story Mapper requires knowing a separate Vite port. Production also enables the development CORS allowlist unconditionally.

**Approach:** Serve the existing built web app and client navigation from the API server. Keep relative browser API requests and the existing Vite proxy/hot reload development workflow; select development mode explicitly through the server dev script.

## Boundaries & Constraints

**Always:** Serve built assets from `apps/web/dist`, independent of working directory. Preserve existing API behavior and JSON errors, distinguish unknown API paths from SPA navigation, keep loopback and existing ChangeSet boundaries, and fail before opening the database when a production web build is missing. The failure names `corepack pnpm --filter @storymapper/web build`. Development does not require built assets and alone permits the existing two Vite CORS origins. Use a supported Fastify static-file plugin for local files, with bounded file serving and correct MIME types.

**Never:** Write, stage selectively as a repair, or revert `sprint-status.yaml`; infer verification from its status; modify local Project data; add cloud services, telemetry, remote fonts/CDNs, unrequested deployment options or runtime portability work; alter database schemas, repository behavior or API contracts; create commits or push without an explicit request. Orchestrator changes are not defects. The existing PowerShell verification runtime limitation belongs to Story 1.3.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Built app | Production with real built assets; GET/HEAD root, client route and referenced JS/CSS | App entry point for navigation, asset bytes and MIME types, HEAD without body | No error |
| API isolation | GET unknown `/api`, `/api/*`; POST unknown route; GET missing asset; valid `/health` and `/api/projects` | Existing API/health JSON on the same server; unknown endpoints/assets return JSON 404, never app HTML | Explicit 404 |
| Missing build | Production without built `index.html` | Startup rejected before database creation, naming the web build command | Actionable error |
| Development | Explicit server dev script, no built assets; Vite-origin CORS requests | API starts without build, allowlisted origins permitted only in dev; production has no allow-origin header | Unknown app routes remain 404 in dev |

</intent-contract>

## Code Map

- `apps/server/src/server.ts:8`: `buildServer` owns Fastify, unconditional CORS, multipart, default DB and seed initialization; no static serving. Add testable explicit dev mode, validate assets before DB access, and register UI serving. Existing default DB path is module-relative.
- `apps/server/src/main.ts:1`: local environment loading, runtime guard and listen; pass explicit dev flag. Preserve runtime/loopback semantics and logger.
- `apps/server/package.json:8`, `pnpm-lock.yaml`: dev script currently `tsx watch src/main.ts`; select dev mode portably by a CLI flag, add supported `@fastify/static` dependency via Corepack/pnpm.
- `apps/server/src/http/web-app.ts` (new): module-relative build location, startup check, static assets and SPA handling, with JSON 404 isolation for API/health, non-navigation methods and missing files. Do not expose files outside the built directory.
- `apps/server/src/server.test.ts` (new): exercise real build through `buildServer`, temporary DB paths via existing `STORYMAPPER_DB_PATH`, missing-build check, CORS and HTTP boundaries; clean temporary databases and restore environment.
- `apps/server/vitest.config.ts`, `tsconfig.base.json`: existing aliases only map package roots; if needed add server internal absolute import mapping and use it in changed/new imports.
- `apps/web/src/app/api.ts:91,101,109,125,435`: empty base already yields relative API and health URLs, including archive upload. Read-only evidence; no rewrite needed.
- `apps/web/vite.config.ts:16`: already proxies API/health to loopback 4317 and uses Vite React plugin. Preserve HMR; verify actual proxy traffic and browser hot reload.
- `apps/server/src/http/routes/index.test.ts`: relevant existing HTTP regression suite. Leave its pre-existing fixture lifecycle separate.
- Prior Story 1.1 spec: preserve centralized English copy and existing English seed data. No translation, strings-module or hygiene scope change needed.

## Tasks & Acceptance

**Execution:**
- [x] `apps/server/src/http/web-app.ts`, `apps/server/src/server.ts` — implement production build preflight, static file serving and SPA navigation with API/asset isolation.
- [x] `apps/server/src/main.ts`, `apps/server/package.json`, `pnpm-lock.yaml`, alias configs if needed — enable explicit dev script mode, limit CORS to it and install the static plugin. Keep start production by default.
- [x] `apps/server/src/server.test.ts` — meaningful real-build HTTP regressions for every matrix row; scan actual built HTML resource references for remote origins.
- [x] `apps/web/vite.config.ts`, `apps/web/src/app/api.ts` — verify existing relative requests/proxies without unnecessary edits; run production browser and development proxy/HMR checks on isolated temporary data.
- [x] Run verification and review the complete diff; record concrete evidence and limitations.

**Acceptance Criteria:**
- Given `apps/web/dist`, when the production server starts, then root and client navigation return the built app, and its scripts/styles load on that origin.
- Given the running server, when API or health is called, then JSON answers on that same port and unknown API paths return JSON 404.
- Given a missing web build without dev mode, when startup is attempted, then startup fails naming the build command before DB creation.
- Given the served app, when loaded in a browser, then its API/health requests stay relative to its origin and production never permits Vite-port cross-origin access.
- Given the dev script, when Vite runs, then API and health proxy successfully and a source edit hot reloads without a production build.
- Given built `index.html`, when scanned by the regression test, then resource references contain no remote origins.

## Spec Change Log

- 2026-10-03 v1: planned from cached Epic 1 context and Story 1.2; verified relative URLs and Vite proxies already exist. Preserve them and implement only missing production serving/dev isolation.

- 2026-10-03 v2: review exposed shared build mutation, clean-checkout collection, Windows symlink privileges and command-level regression gaps; isolated dependency-injected build fixtures and an explicit test build prerequisite avoid those known-bad states. KEEP verified HTTP/browser behavior, explicit dev-only CORS and read-only web API/Vite paths. Include the two reproduced crash repairs during re-derivation.

- 2026-10-03 v4: automation completion recheck confirmed terminal done artifact, completed verification and no pending test/server processes; implementation unchanged.
- 2026-10-03 v5: installed orchestrator parser verified the spec is a qualifying, status-consistent done result; refreshed the terminal marker after another idle nudge. Implementation unchanged.

## Review Triage Log

### 2026-10-03 — Review pass 1

- verdicts: 15 findings — high 2, medium 4, low 1, false 8, maybe-false 0
- All four layers returned before triage; three ran concurrently and the fourth launched after one completed because the fourth initial launch hit the platform limit.
- findings:
  - `[high]` `[patch]` Blind: malformed unsupported-method URL crashes the process — parent reproduced POST /foo%ZZ exiting Node with URIError from decodeURIComponent; reject non-navigation methods before decoding and return JSON errors for malformed navigation. Repair is included in re-derivation because bad_spec supersedes patches.
  - `[low]` `[reject]` Blind: extensionless JSON-client request receives HTML — reproduced GET /missing with Accept application/json. This is outside the API prefix and actual browser callers use /api; extra content-negotiation branches for unused non-API JSON callers are disproportionate. Required unknown API behavior already passes.
  - `[medium]` `[bad_spec]` Blind: missing-build tests move shared web output — source renames actual apps/web/dist, so concurrent app/test processes can lose assets. Amend tasks to copy real output to an isolated temporary fixture with internal dependency injection; never rename shared build output.
  - `[medium]` `[bad_spec]` Blind: top-level built-HTML read prevents clean-checkout test collection — confirmed readFileSync at module initialization with absent dist would throw before development tests run. Explicitly build before real-build verification tests through the normal test-command prerequisite, and collect fixture reads inside setup. Preserve actual-build byte/MIME checks.
  - `[medium]` `[bad_spec]` Blind: file symlink regression needs Windows privileges — Windows file symlinks require Developer Mode or elevation; replace with directory junction containment fixture (supported without those permissions), preserving traversal/outside-root checks.
  - `[false]` `[reject]` Blind: cwd independence is unverified — actual start command ran from apps/server while module-relative roots returned the real assets; source resolves import.meta.url, not cwd. A further automated case is optional, no wrong behavior or unverified acceptance remains.
  - `[false]` `[reject]` Blind: srcset/inline CSS bypass the remote-origin scan — actual built index contains only quoted script src/link href; it has no srcset or inline CSS. The story explicitly scans built index, not potential future HTML forms.
  - `[high]` `[patch]` Edge: asset removal between existence and realpath crashes static serving — installed plugin calls the async sender without awaiting; allowedPath can throw ENOENT during rebuild. Replace the check-then-use with one realpath lookup and narrowly handle missing/not-directory errors as unavailable files. Include in re-derivation.
  - `[medium]` `[bad_spec]` Verification: automated dev-mode tests bypass actual command — pre-verified regression gap: removing --dev propagation leaves direct factory tests green. Add a command-entry regression that observes healthy API and dev CORS using isolated data; the actual dev script was manually verified but needs preservation coverage.
  - `[false]` `[reject]` Intent: production hosting surface differs from injection tests — injection exercises HTTP entry HTML/assets/API/CORS directly and the parent separately ran the actual app, deep-link reload and Discovery board. No demonstrated divergence.
  - `[false]` `[reject]` Intent: browser API execution absent from automated tests — parent observed app rendering and server logs for API/health/assets on 4319, plus no app console errors. Automated browser harness is not a story requirement.
  - `[false]` `[reject]` Intent: dev command/proxy/HMR absent from automated tests — manual CLI, proxy requests and browser heading change/restoration passed. Command regression gap is independently kept above; no proxy/HMR failure exists.
  - `[false]` `[reject]` Intent: broader launcher reading is unimplemented — Story 1.3 explicitly owns portable setup/start and browser opening. Story 1.2 implements the specified server-origin capability.
  - `[false]` `[reject]` Intent: HTML scan does not inspect all JS/CSS network references — story acceptance explicitly names built index.html and current resource references pass; actual browser execution also worked. No remote dependency introduced.
  - `[false]` `[reject]` Intent: concurrent orchestration docs/OpenWolf changes are unrelated — tool timeline and implementation report establish that these edits are external. Leave them untouched; no sprint-status mutation occurred.

### 2026-10-03 — Review pass 2

- verdicts: 16 findings — high 3, medium 3, low 6, false 4, maybe-false 0
- All four layers returned before triage; the fourth launch again waited for an available concurrency slot. The blind floor arithmetic was not a finding.
- findings:
  - `[high]` `[patch]` Blind: decoded NUL crashes static serving — parent reproduced GET /foo%00.js exiting Node with ERR_INVALID_ARG_VALUE. Reject NUL as malformed URL before sendFile; GET/HEAD regressions and subsequent healthy requests pass.
  - `[high]` `[patch]` Blind: overlong filename crashes realpath lookup — parent reproduced ENAMETOOLONG process termination for a 256-character filename. Focused ENAMETOOLONG handling yields JSON 404; the 300-character regression and following API request pass.
  - `[low]` `[reject]` Blind: swapping a checked symlink can serve outside-root bytes — traced the separate pathname validation and plugin open; the deterministic reproduction requires concurrent mutation of trusted build files. Normal Vite output has no symlinks and remote callers cannot mutate this directory. Preventing hostile local filesystem races would require descriptor-based custom serving, disproportionate to this negligible everyday risk. Existing outside-root links are rejected; retain this residual limitation.
  - `[medium]` `[patch]` Blind: index disappears between realpath and stat — source would throw raw ENOENT. statSync now uses throwIfNoEntry:false with optional isFile, preserving the actionable build error; missing-index regression passes.
  - `[low]` `[reject]` Blind: extensionless built file returns entry HTML — traced /LICENSE fixture path selecting index.html. Actual built app contains only index.html and extension-bearing assets; no current built file is affected. Adding filesystem probing/branching for an absent asset form is disproportionate.
  - `[low]` `[patch]` Blind: process-stop error skips temporary-directory cleanup — cleanup followed stop in the same finally. Nested finally now removes the directory while retaining the termination error.
  - `[low]` `[reject]` Blind: failed command startup loses detailed diagnostics — source discards stdout/stderr and reports a generic exit/timeout; a missing Corepack spawn error can therefore be obscured. Corepack is an explicit prerequisite and present in normal verification. Bounded sanitized output capture and extra polling branches are disproportionate for rare broken-prerequisite diagnostics; failures remain loud.
  - `[low]` `[reject]` Blind: removed-asset regression does not force a lookup race — source/test confirm removal happens before the request. Current implementation performs one realpath lookup and handles missing-file errors; injecting an artificial interleaving would add instrumentation for negligible remaining coverage benefit. The removed-file response and continued health are exercised.
  - `[high]` `[patch]` Edge: encoded NUL asset crashes sender — same verified root cause as Blind NUL; shared JSON 400 repair and GET/HEAD survival regressions pass.
  - `[low]` `[patch]` Edge: later command-test fetches outlive test cleanup — unbounded fetches could prevent finally reaching the watch-process termination. API/navigation and new production fetches now use AbortSignal.timeout; command regressions pass and no listeners remain.
  - `[medium]` `[patch]` Verification: production default build location bypassed — pre-verified gap: injected factory tests and dev command would remain green if the module-relative URL regressed. Added actual production start-command test, without override, matching root/deep-link HTML and referenced asset bytes; pass.
  - `[false]` `[reject]` Intent: browser expectation exceeds injection automation — carried: actual browser execution, same-origin request logs, client navigation and reload passed separately; no required executable browser suite.
  - `[medium]` `[patch]` Intent: production startup uses an untested default — same coverage root cause as Verification; shared actual production command regression now exercises it and passes.
  - `[false]` `[reject]` Intent: Vite proxy/HMR omitted from command automation — carried: actual Vite browser, API/health proxy requests and heading change/restoration were verified independently; no behavior defect.
  - `[false]` `[reject]` Intent: broader launcher interpretation remains unimplemented — carried: original Story 1.3 owns portable setup/start/browser opening, while Story 1.2 explicitly retains Vite development.
  - `[false]` `[reject]` Intent: unrelated orchestration docs/OpenWolf changes appear — carried: these are concurrent external edits, left untouched. Sprint status has no diff and was never written/reverted.

Six shared patch entries: high 2 (NUL, filename limit), medium 2 (startup stat race, production command coverage), low 2 (cleanup, fetch timeout). Five low findings and four false findings were rejected with individual reasons above. No deferred entries were added.

### 2026-10-03 — Review pass (follow-up)

- verdicts: 34 findings — high 0, medium 0, low 19, false 15, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: no start script builds the web app before production start — carried: Story 1.3 owns portable setup/start/browser opening; `start.ps1` runs the explicit dev script, which still works without a build.
  - `[false]` `[reject]` Blind: README/RUNBOOK still describe the two-port setup — the documents describe `start.ps1`, which still launches server dev plus Vite at 5173; nothing they state became false.
  - `[false]` `[reject]` Blind: `@storymapper/server/*` self-alias breaks compiled `dist` output and is out of scope — `.cursor/rules/code.mdc:22` mandates absolute module imports; no script runs `dist` (`start`/`dev` use tsx) and extensionless relative ESM imports already made `dist` non-runnable; runtime portability is excluded by the intent.
  - `[false]` `[reject]` Blind: `WEB_BUILD_DIRECTORY` resolves wrongly from compiled output — same as above: `dist` is not an execution surface; tsx runs the source where the module-relative path is verified by the actual `start` command test.
  - `[low]` `[patch]` Blind: method guard in `serve` can never fire — confirmed: `serve` is registered only via `server.get` (GET plus automatic HEAD). Removed the dead guard.
  - `[low]` `[patch]` Blind: manual URL decoding is redundant — probe confirmed Fastify answers GET/HEAD `/foo%ZZ` with its own 400 before the handler, leaving the `decodeURIComponent` catch unreachable. Replaced with the router-decoded `*` param plus the NUL check; GET `/foo%00.js` still yields JSON 400.
  - `[low]` `[reject]` Blind: client routes containing a dot get JSON 404 — real routes are `/projects/$projectId/story-maps/$storyMapId` with `randomUUID` ids (seed included), so dotted segments do not occur in everyday use; distinguishing them needs filesystem probing/branching.
  - `[low]` `[patch]` Blind: custom 404 body duplicates Fastify's default — confirmed identical format kept as a second source. Replaced with `reply.callNotFound()` and removed the custom not-found handler; JSON 404 bodies unchanged.
  - `[false]` `[reject]` Blind: two containment layers and per-request realpath are redundant — `send` root containment follows symlinks; the realpath check is what rejects outside-root links (junction regression from pass 1).
  - `[low]` `[reject]` Blind: no long-lived caching headers — `max-age=0` revalidation does guarantee a fresh entry point; extra cache configuration on a loopback single-user server is a nice-to-have.
  - `[low]` `[reject]` Blind: server `test` script builds the web app every run — deliberate clean-checkout prerequisite from change log v2; cost is a few seconds and alternatives add setup machinery.
  - `[low]` `[reject]` Blind: `main.test.ts` is a slow integration test in the unit suite — spec-required command-level regression (pass 1 bad_spec); bounded by timeouts and passes in ~3 s.
  - `[false]` `[reject]` Blind: `--dev` read outside runtime config; `webBuildDirectory` ignored in dev — the spec selects mode by CLI flag, while runtime config is environment-based; no caller passes both options.
  - `[low]` `[reject]` Blind: DB not closed when startup fails after opening; `db.$client` bypasses repository boundary — a startup failure exits the process, which releases the handle; closing a client is not a data query; a try/catch adds a branch for an undemonstrated seed failure.
  - `[low]` `[reject]` Blind: test files compiled into `dist` — pre-existing `include: ["src"]` already emitted existing tests; `dist` is not executed, no harm.
  - `[low]` `[reject]` Edge: dotted client route returns JSON 404 — same root cause and reason as the Blind dotted-route row.
  - `[low]` `[reject]` Edge: realpath ELOOP/EACCES in build dir escapes the static callback — requires a symlink loop or unreadable entry inside trusted Vite output; adding more guarded error codes for undemonstrated states is disproportionate.
  - `[false]` `[reject]` Edge: `/API/unknown` gets index.html — Fastify routing is case-sensitive, so `/API` is not an API path on this server; no caller uses it and the intent's isolation targets `/api`.
  - `[low]` `[reject]` Edge: DB handle not closed on later startup failure — same root cause and reason as the Blind DB-close row.
  - `[low]` `[reject]` Edge: probed port can be taken before the child binds — rare test flake; port-0 reporting would add protocol plumbing to the test harness.
  - `[low]` `[patch]` Edge: temp directory leaks if port probe throws before `try` — confirmed ordering. Moved `mkdtempSync` after the port probe (spawn reports failures via the `error` event, inside the cleanup path).
  - `[low]` `[reject]` Edge: spawn error hidden behind generic exit message — carried from pass 2 (Corepack is an explicit prerequisite; failures remain loud).
  - `[low]` `[reject]` Edge: remote-origin scan only matches double-quoted attributes — Vite emits double-quoted attributes and the actual built index passes; broadening the regex is speculative.
  - `[low]` `[patch]` Verification: method check at `web-app.ts:79` never runs — same root cause as the Blind dead-guard row; removed.
  - `[false]` `[reject]` Verification: `onClose` DB hook only runs on `server.close()` — reviewer confirms no defect; process exit releases the handle in production.
  - `[false]` `[reject]` Intent: documented launch path (`start.ps1`) still needs the Vite port — carried: Story 1.3 owns the launcher; the intent selects dev mode through the server dev script that `start.ps1` uses.
  - `[false]` `[reject]` Intent: HEAD/MIME only in-process and cwd not varied — carried for cwd (module-relative `import.meta.url`); HEAD/MIME are asserted on real built bytes through the HTTP entry and the command test covers the default location.
  - `[false]` `[reject]` Intent: missing-build failure not tested at command level; escapes as unhandled rejection — top-level await rejection prints the error (naming the build command) and exits non-zero; validation before DB creation is asserted.
  - `[false]` `[reject]` Intent: dev-without-build only proven in-process — carried from re-derivation requirements: the CORS assertion exposes missing flag propagation while factory tests prove no-build dev mode.
  - `[low]` `[reject]` Intent: fallback tests use non-real routes; dotted segments 404 — same root cause and reason as the Blind dotted-route row (live check confirmed `/projects/x/story-maps` serves the app).
  - `[false]` `[reject]` Intent: malformed-URL 400 and POST/GET asymmetry exceed the matrix — the matrix's 404 rows concern well-formed unknown paths; rejecting undecodable URLs with JSON 400 is Fastify's own behavior and crash-safe.
  - `[false]` `[reject]` Intent: compiled `dist` cannot resolve the alias — same refutation as the Blind alias row.
  - `[low]` `[reject]` Intent: server test script rewrites `apps/web/dist` each run — same root cause and reason as the Blind test-script row.
  - `[false]` `[reject]` Intent: `onClose` hook is unmentioned scope — it is required for temporary database cleanup in the spec-mandated tests.

Four patched entries, all low (dead method guard, redundant decoding, duplicated 404 format, temp-dir leak ordering). No intent_gap, bad_spec or defer entries; no deferred items added.

### Re-derivation requirements

- `apps/server/src/server.ts`, `apps/server/src/http/web-app.ts`: permit internal factory dependency injection of a build directory solely for isolated tests, with the module-relative production default unchanged and no CLI/environment deployment option. Validate before DB creation. Reject unsupported methods before URL decoding; any URI decoding failure must yield JSON 400. Use one realpath lookup with focused missing-file error handling so ordinary rebuild races cannot escape the static callback.
- `apps/server/src/server.test.ts`, `apps/server/package.json`: copy actual built output into each temporary test fixture; remove/mutate only that fixture for missing-build checks. Move HTML reads to fixture setup. Wire an explicit web build prerequisite into the server test command so clean checkout collection succeeds, while dev startup still never builds/requires assets. Use a directory junction fixture for containment across operating systems.
- `apps/server/src/server.test.ts` or a dedicated entry-point test: run the actual server development command with isolated database/loopback port and observe health plus allowed Vite CORS. Ensure child/watch descendants stop on all outcomes. A production build may exist for this command check because absent flag propagation is still exposed by the CORS assertion; factory tests separately prove no-build mode.
- KEEP: correct root and deep-link HTML, real JS/CSS bytes/MIME/HEAD, API/health JSON isolation, strict loopback, build failure before DB creation, explicit dev-only CORS, existing relative browser API URLs, existing Vite proxies and hot reload, temporary DB cleanup, and database close hook. Do not edit the immutable intent contract or external concurrent changes.

## Verification

Use installed Node 24 first on PATH (this machine has `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin`), Corepack and pnpm 9.15.4. Do not use global Node 22 for native SQLite tests.

- `corepack pnpm build` before tests requiring actual built assets — all packages build.
- `corepack pnpm --filter @storymapper/server test` — matrix and existing HTTP tests pass.
- `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm check-hygiene` — workspace gates pass.
- Production browser on an isolated temporary SQLite path and loopback test port: verify app, navigation and API requests share one origin, with no asset/network errors.
- Explicit development server and Vite: verify API/health proxy and HMR; restore any source edit and stop processes after checks.
- `pwsh -NoProfile -File scripts/verify.ps1` — attempt required verification; record known Windows-only runtime lookup limitation without altering Story 1.3 scope.

### Implementation verification evidence

- Parent reran full build, workspace tests (59 Vitest plus four hygiene), server tests (24), typecheck and hygiene: pass. Every matrix row ran in the eight new real-build regressions.
- Production browser on isolated data at loopback 4319: root, Story Maps navigation/deep-link reload and seeded Discovery map rendered. Fastify request logs show built JS/CSS, API and health sharing host 127.0.0.1:4319; no app console errors, only installed browser-extension warnings.
- Explicit server dev script on 4317 and Vite on 5173: browser app rendered, curl API/health proxy returned JSON. Temporary welcome-heading edit appeared and restoration appeared automatically; existing mixed exports cause Vite to reload the page through HMR. Source bytes restored, all check servers stopped and temporary data removed.
- PowerShell verify: Git hygiene passes, known Windows-only Node lookup fails at line 89 on macOS. No runtime changes in this story.
- Concurrent docs/bmad-loop.md and hook-maintained OpenWolf changes appeared during this run; they are external edits and remain untouched.

### Re-derivation verification evidence

- Parent reran workspace build, typecheck, tests (60 Vitest plus four hygiene) and hygiene: pass. Server matrix tests (8) and actual dev command (1) ran, total server 25 pass.
- Parent repeated production browser root, Story Maps navigation and deep-link reload, no console errors. Browser and Fastify logs show API/health and built assets at loopback 4319.
- Parent repeated explicit server dev plus Vite at 5173, actual API/health proxy and welcome-heading hot reload/restoration. Temporary source bytes restored, processes stopped, temporary data removed.
- Required PowerShell verification retains the recorded Windows-only lookup limitation on macOS. No user Project data or sprint status changed.

### Follow-up review verification evidence

- Corepack/pnpm 9.15.4 on Node 24.17.0: workspace build, typecheck and hygiene pass; workspace tests pass (server 27, db 19, web 9, core 5, importers 2).
- Live production `start` on isolated temporary data, loopback 4329: `/` and `/projects/x/story-maps` return built HTML; `/health` and `/api/projects` return JSON; `/api/nope`, `/assets/nope.js` and `/.env` return JSON 404; `/foo%00.js` and `/foo%ZZ` return JSON 400; HEAD `/` 200; POST `/nope` 404. Server stopped and temporary data removed.

## Auto Run Result

Status: done

**Summary:** Follow-up review pass on Story 1.2 (production server serves `apps/web/dist` plus SPA navigation on the API origin, build preflight before DB creation, dev-only Vite CORS via `--dev`). Four low-severity simplifications applied; behavior unchanged.

**Files changed (story total):**
- `apps/server/src/http/web-app.ts` — build preflight, bounded static serving, SPA fallback with JSON API/asset isolation; this pass removed the dead method guard, redundant URL decoding and the hand-copied 404 body.
- `apps/server/src/server.ts` — explicit dev mode, dev-only CORS, build validation before DB open, web app registration, DB close hook.
- `apps/server/src/main.ts` — passes `--dev` flag; absolute imports.
- `apps/server/package.json`, `pnpm-lock.yaml` — `@fastify/static`, `--dev` dev script, web build prerequisite for tests.
- `apps/server/src/server.test.ts` — real-build HTTP matrix regressions on isolated fixtures.
- `apps/server/src/main.test.ts` — actual `dev`/`start` command regressions; this pass moved temp-dir creation after the port probe.
- `apps/server/vitest.config.ts`, `tsconfig.base.json` — `@storymapper/server` internal alias.

**Review findings (this pass):** 34 findings — patched 4 (all low: dead method guard, redundant decoding, duplicated 404 format, temp-dir leak ordering); deferred 0; rejected 30 (15 false, 15 low), each with its reason in the Review Triage Log.

**Follow-up review recommendation:** false — follow-up pass patched no high entry (patched counts: high 0, medium 0, low 4).

**Verification:** see Follow-up review verification evidence above; all gates pass.

**Residual risks:** dotted client-route segments would receive JSON 404 (no current route produces them); realpath errors other than ENOENT/ENOTDIR/ENAMETOOLONG from a damaged build directory are not caught; `scripts/verify.ps1` Windows-only Node lookup limitation remains with Story 1.3. No commit was created: the intent contract forbids commits without an explicit request, so the orchestrator owns committing the staged/unstaged story files.

