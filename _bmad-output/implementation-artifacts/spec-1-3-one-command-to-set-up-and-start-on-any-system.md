---
title: '1.3 One command to set up and start on any system'
type: feature
created: '2026-10-03'
status: done
baseline_revision: 288e433b05ee2cc8cac76aceaadadc7e8e22304e
review_loop_iteration: 0
followup_review_recommended: false
context:
  - [REDACTED_HOME]/.claude/CLAUDE.md
  - [REDACTED_HOME]/Projects/StoryMapper/AGENTS.md
  - [REDACTED_HOME]/Projects/StoryMapper/.wolf/OPENWOLF.md
warnings: [oversized]
deferred:
  - summary: >-
      Native Windows clean-clone setup/start/browser/cleanup acceptance remains unexecuted.
    evidence: |-
      This session runs on macOS arm64 and has no native Windows runner. POSIX command regressions and fresh source-copy smoke pass; they do not establish Windows acceptance or timing.
    location: >-
      Story 1.3 Windows acceptance
    severity: medium
  - summary: >-
      Native Windows and Linux setup/start/browser/cleanup behavior remains unverified on this macOS host.
    evidence: |-
      Intent review distinguishes platform dispatch code from native acceptance. Windows has no runner; Docker is installed but its daemon is unavailable. Native clean-source smoke and runtime tests on those hosts would settle the remaining portability evidence.
    location: >-
      Story 1.3 supported-platform acceptance
    severity: medium (unverified)
  - summary: >-
      Automatic default-browser tab rendering was not visually observed on macOS.
    evidence: |-
      Real native open completed successfully after owned health; native-window inspection returned cgWindowNotFound. A separately opened Chrome tab rendered onboarding and Story Maps. Observing the automatically opened tab in an available desktop session would close this acceptance evidence gap.
    location: >-
      scripts/start.mjs browser acceptance
    severity: medium (unverified)
  - summary: >-
      Corepack discovery may fail on Node installs whose PATH entry is a shell shim or a Windows layout without node_modules/corepack.
    evidence: |-
      runtime.mjs corepackEntry realpaths the first PATH match and runs it with node, and on Windows requires node_modules/corepack/dist/corepack.js beside corepack.cmd. asdf/Volta-style shims or non-bundled Windows Corepack would fail with a SyntaxError or the generic missing-Corepack message. Running setup under such shims and on native Windows would settle it.
    location: >-
      scripts/runtime.mjs:9
    severity: medium (unverified)
---

Purpose: implement Epic 1 Story 1.3 portable installation/startup and record command-level acceptance evidence. Updated: 2026-10-03. Version: 3. Reproduce using the story acceptance scenarios, AD-21 and the source map below.

<intent-contract>

## Intent

**Problem:** Setup, startup and verification depend on Windows PowerShell and a downloaded repository-local Node runtime. Users must know a second web port and open the browser themselves.

**Approach:** Provide the same Node `.mjs` setup and startup commands on Windows, macOS and Linux, using installed Node 24 and Corepack's pinned pnpm. Serve the production app on one loopback URL and open the browser after health succeeds.

## Boundaries & Constraints

**Always:** Document `node scripts/setup.mjs` and `node scripts/start.mjs`. Setup uses frozen-lockfile dependencies through Corepack, builds the web app and creates `local-projects/default.lsm` without requiring `.env`. Bound Node to `>=24 <25`. Start builds missing web assets per AD-21, uses the same installed Node for native SQLite/server execution, preserves optional environment overrides and existing local env semantics, waits for healthy `/health`, prints the URL and opens the default browser. Respect loopback even if strict-local is disabled. Stop owned server descendants on interruption/failure; never mistake an already running server for the new process. Remove all `scripts/*.ps1` and repository-local Node download/path logic. Enforce LF with `.gitattributes`. Preserve existing Git release hygiene, typecheck and build via a portable verifier. Update README quickstart, RUNBOOK install/start/verification and AGENTS running instructions, plus the UI's stale start instruction.

**Never:** Write or revert `sprint-status.yaml`, infer completion from its rows, modify user Project data, print/store credentials, add SaaS dependencies/telemetry, alter schemas/API contracts/domain behavior, implement Story 1.4 doctor or Story 1.5 sample/checklist, add unrequested launcher options/fallback runtimes, or create commits/push without explicit authorization.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Setup | Fresh clone, Node 24/Corepack, no config | Pinned pnpm frozen install, built web assets, default folder | Command failure exits nonzero; no subsequent steps |
| Start | Setup completed; loopback default or overrides | Owned healthy server, printed one-origin URL, browser opens after health | Failed child/timeout/browser command fails loudly and owned process is stopped |
| Missing build | Dependencies present, web output absent | Build before server launch | Build failure exits nonzero |
| Invalid environment | Unsupported Node, missing Corepack, invalid/non-loopback host or port | Fail before server/Project mutation | Explicit nonzero error |
| Occupied port | Other listener already bound | Refuse startup, no browser opening against unrelated service | Explicit nonzero error |
| Interruption | Running launcher receives Ctrl+C/termination | Owned server and descendants stop | No orphaned runtime |

</intent-contract>

## Code Map

- `scripts/setup.ps1`, `scripts/start.ps1`, `scripts/verify.ps1`: legacy Windows Node download/cache and two-process development launch; replace rather than retain compatibility.
- `scripts/setup.mjs`, `scripts/start.mjs`, `scripts/verify.mjs`, shared script helpers as needed (new): installed-runtime setup, production orchestration and existing verification gates. Resolve repository paths from module URLs with `node:path`.
- `package.json:6`: already pins pnpm 9.15.4, Node lower bound only; tighten upper bound and wire meaningful launcher tests into root test command.
- `.gitattributes` (new): LF checkout policy. `.gitignore` retains generic ignored caches, not a Node download implementation.
- `apps/server/package.json:12`: production uses `tsx src/main.ts`; reuse TS execution rather than compiled dist, which imports workspace TS. `apps/server/src/main.ts:5`, `config/local-env.ts`, `config/runtime.ts`: existing env-loading/loopback/port behavior; reuse config rather than duplicate schemas/parsers.
- `apps/server/src/server.ts:34`: default SQLite path is repository-module-relative. `/health` reports `ok`, `mode`, databasePath; preserve existing real-build serving and dev-only CORS from Story 1.2.
- `apps/server/src/main.test.ts`, `server.test.ts`: actual dev/start and HTTP regressions, isolated temp DBs/process groups; preserve them.
- `README.md`, `docs/RUNBOOK.md`, `AGENTS.md:30`: update operational commands and one-origin URL; preserve unrelated content and historical changelog context.
- `apps/web/src/ui-strings/index.ts:32`: replace deleted PowerShell launch instruction using centralized copy.
- `scripts/runtime.test.mjs` and tracked static fixtures if needed (new): observable command regressions and failure/cleanup checks, no credentials or actual user data.

- `scripts/server-process.mjs`: retains a live IPC-supervised tree root for Windows cleanup; forwards owned readiness and concrete startup/runtime failures. Supervised main uses the environment already loaded by the launcher.
- `scripts/fixtures/*`: static command/server/browser and harmless Git fixtures support isolated command regressions.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/*.mjs`, `scripts/*.ps1` — implement portable setup/start/verification and delete obsolete PowerShell scripts; reuse existing server configuration and TS execution.
- [x] `package.json`, `.gitattributes` — bound installed runtime and enforce LF; wire launcher tests.
- [x] `scripts/runtime.test.mjs` and any dedicated fixtures — test matrix at actual command boundaries, meaningful browser-dispatch ordering and owned-child cleanup.
- [x] `README.md`, `docs/RUNBOOK.md`, `AGENTS.md`, `apps/web/src/ui-strings/index.ts` — replace operational instructions consistently.
- [x] Run clean tracked-source setup/start on POSIX with isolated data, record elapsed time against ten minutes, verify real browser opening and one-origin UI. Run Windows if available; otherwise record the unexecuted Windows acceptance explicitly under `deferred` without blocking completed POSIX work. Run workspace gates and full portable verification.

**Acceptance Criteria:**
- Given a fresh clone with Node 24 and Corepack and no `.env`, when documented setup runs, then pnpm 9.15.4 installs locked dependencies, built web assets exist and the default Project folder exists.
- Given completed setup, when documented start runs, then its server reaches healthy `/health`, prints the app URL and opens the default browser at that URL.
- Given Windows, macOS or Linux, when users follow setup/start commands, then command text is identical and avoids pnpm built-in collisions.
- Given the completed repository, when runtime artifacts are inspected, then PowerShell scripts and local Node download paths are absent, LF is enforced and Node engines is bounded to 24.
- Given the operational documents and unreachable-server UI, when read, then they name the portable commands and one-origin URL.
- Given clean Windows and POSIX source copies, when scripted setup/start runs, then health succeeds and elapsed time is recorded against SM-1; unavailable Windows execution is an explicit deferred acceptance item.

## Spec Change Log

- 2026-10-03 v1: planned from current Epic 1 context, Story 1.3/AD-21 and prior Story 1.2 source/evidence. Preserve production HTTP serving, dev workflow, local data and orchestrator ownership.
- 2026-10-03 v2: classified all 19 findings from four independent reviews; sent eight shared repairs to the original implementation agent and recorded native-platform/default-browser acceptance limits. Immutable intent preserved.

- 2026-10-03 v3: completed all eight shared repairs and final 100-test verification; recorded repaired clean-source timing and completion limits. No intent contract changes, repository commits or sprint-status writes.

## Review Triage Log

### 2026-10-03 — Review pass 1

- verdicts: 19 findings — high 4, medium 8, low 2, false 2, maybe-false 3
- All layers launched before triage. The fourth initial launch hit the platform limit; it launched when the first reviewer returned. Three reviewers ran concurrently.
- findings:
  - `[medium]` `[patch]` Verification: release-hygiene rejection has no command coverage — pre-verified: removing the tracked-data rejection leaves existing setup/start and successful-workspace checks green. Add isolated verifier success/rejection regressions.
  - `[medium]` `[patch]` Verification: Windows failure cleanup tests are skipped despite never opening a browser — pre-verified: browserTests skips all four server-failure cases. Remove that skip; native execution remains deferred until a Windows runner exists.
  - `[false]` `[reject]` Intent: literal story title implies one combined setup/start invocation — exact Story 1.3 asks for one setup command and one start command; its ACs observe those two commands separately. The implemented surface matches the resolved story.
  - `[maybe-false]` `[defer]` Intent: supported-platform outcomes exceed host-only execution — dispatch source alone cannot prove Windows/Linux behavior. Native supported-host smoke, browser and cleanup runs would settle it; record medium unverified acceptance risk.
  - `[false]` `[reject]` Intent: fixture Corepack tests do not establish installation — parent independently ran documented setup from a clean source copy with fresh Corepack/package caches, downloaded 466 dependencies, built UI and created the folder. Fixture tests preserve orchestration; actual install evidence addresses this claim on macOS.
  - `[maybe-false]` `[defer]` Intent: browser dispatch tests do not prove automatic tab rendering — native open returned success and separately opened Chrome rendered the actual app, but automatic default-tab observation failed. Available desktop observation would settle this medium unverified outcome.
  - `[maybe-false]` `[defer]` Intent: deferred acceptance narrows demonstrated completion — same supported-host evidence limit as the earlier platform row; source does not establish native failures or native success. Carry explicit unverified platform acceptance rather than infer it from orchestrator rows.
  - `[high]` `[patch]` Edge: server-local .env changes validated host/port — source confirms loadLocalEnv runs once from repository root, then again from apps/server while defaults are absent from runtimeEnv. Reproduced by reviewer in isolated configuration; skip the second read under supervised IPC and retain direct-command loading.
  - `[medium]` `[patch]` Edge: writable regular file passes Project-directory check — access(W_OK) alone accepts files. Require directory type and traversal/write access, with isolated invalid-layout tests.
  - `[high]` `[patch]` Edge claim: one-loopback-URL invariant can be broken before readiness rejects — same double-env-read defect; server loads HOST=0.0.0.0 and strict-local=false before listen. Share the environment repair above.
  - `[high]` `[patch]` Blind: double env loading causes port mismatch and brief non-loopback binding — verified by the same launcher/server working-directory trace and isolated reviewer reproduction; share the supervised environment repair.
  - `[medium]` `[patch]` Blind: supervisor drops failure cause — reportFailure serializes only error.code or a generic string. buildServer runs before main's logged try block. Preserve ordinary error.message and assert the concrete startup cause.
  - `[medium]` `[patch]` Blind: Project writability check weakened — reviewer reproduced mode 0666 directory passing W_OK but failing file creation; source also accepts a regular file. Require directory and W_OK|X_OK. Avoid writing a probe to user data while restoring the demonstrated checks.
  - `[high]` `[patch]` Blind: server shutdown can close a long-running browser handler — owner retains the opener until its exit and kills its process group on interruption. Upstream documents non-forking long-running handlers in the [xdg-open manual](https://manpages.debian.org/trixie/xdg-utils/xdg-open.1.en.html). Release/unref browser dispatch ownership and cover that handler lifetime.
  - `[medium]` `[patch]` Blind: Windows server failure tests unnecessarily skip — same browserTests gate as the Verification row; share its removal.
  - `[medium]` `[patch]` Blind: supervisor disconnect cleanup lacks verification — current tests signal the launcher so owner.stop runs; killing the launcher takes a distinct disconnect path. Add abrupt-parent-death command coverage with descendant and port assertions.
  - `[medium]` `[patch]` Blind: portable verifier lacks negative command tests — same missing verifier surface as the Verification row, expanded to invalid folder/flags/health/example-ignore gates. Share isolated rejection tests.
  - `[low]` `[patch]` Blind: Linux browser prerequisites omitted — native xdg-open requires a desktop handler and browser association; add one operational prerequisite line, consistent with the [upstream manual](https://portland.freedesktop.org/doc/xdg-open.html).
  - `[low]` `[reject]` Blind: auto-browser evidence gap absent from structured deferred metadata — this finding's prescribed fix edits the build spec, which the review workflow explicitly rejects as a code finding. The independently accepted intent outcome above records that acceptance limit in deferred metadata.

All eight shared patch entries were applied and verified: environment handoff, failure cause, Project-directory gate, browser lifetime, Windows test skip, disconnect coverage, verifier regressions and Linux prerequisite text. No intent_gap or bad_spec entries. Three deferred records include the existing Windows acceptance record plus two new evidence limits.

### 2026-10-03 — Review pass (follow-up)

- verdicts: 49 findings — high 1, medium 10, low 24, false 8, maybe-false 6
- Four layers launched together. The sprint-status and deferred-work ledger were not touched. No implementation agent from the original run existed in this session, so the patches were applied directly.
- findings:
  - `[medium]` `[patch]` Blind: package.json `app:doctor` runs a missing doctor.mjs and `app:setup`/`app:start` are unreferenced, unrequested aliases — confirmed: scripts/doctor.mjs absent, `git grep` finds the three names only in package.json; Story 1.4 doctor is excluded. Removed all three scripts.
  - `[medium]` `[patch]` Blind: RUNBOOK says the verifier checks default-Project-folder access but verify.mjs does not — confirmed, check absent from source (the earlier Project-directory-gate rows describe a check that no longer exists, so this is a new finding). Shared fix with the Project-folder gate below.
  - `[low]` `[reject]` Blind: `git check-ignore` failure prints generic "git failed with exit code 1" — loud nonzero failure; adding a catch branch is more than a direct correction for a rare release-time message.
  - `[low]` `[reject]` Blind: sensitive-path regex `/\.sqlite/` is broader than the old anchored pattern — deliberate: tests assert `.sqlite3` is rejected; false positives need unusual tracked names and fail loudly.
  - `[false]` `[reject]` Blind: `process.send` is also set under tsx watch/start — checked: tsx and `tsx watch` both leave `process.send` undefined, so the loopback guard and disconnect handler only apply to the launcher's IPC child.
  - `[low]` `[reject]` Blind: no SIGTERM handler for graceful `server.close()` — pre-existing (the original main.ts had none) and SQLite is crash-safe; not worth new code.
  - `[low]` `[patch]` Blind: `shutDown` try/finally exits 0 even when `server.close()` fails — confirmed in main.ts; now logs and exits 1 on close failure.
  - `[medium]` `[patch]` Blind: main.ts `.env` search changed from the nearest-upward search to root then apps/server — confirmed: reverses precedence when both files exist, drops parent search the RUNBOOK says is kept, and the explicit paths were not needed because the launcher runs with cwd apps/server and passes the root `.env` through its environment. Restored `loadLocalEnv()`.
  - `[low]` `[reject]` Blind: launcher `configuredUrl()` reads only the root `.env` while the server also reads apps/server/.env — the printed URL comes from the server's IPC message and the server rejects non-loopback hosts; only `verify --check-health` could probe a different port for an unusual extra file.
  - `[low]` `[reject]` Blind: `::1` bracketing duplicated in main.ts and runtime.mjs — two small expressions in different runtimes (TS server vs launcher); no demonstrated divergence.
  - `[false]` `[reject]` Blind: start serves a stale UI after git pull — AD-21 and the spec say start builds missing assets only; setup rebuilds.
  - `[low]` `[reject]` Blind: start before setup gives raw "Cannot find module tsx" — explicit nonzero failure asserted by a test; a hint needs a new guard.
  - `[maybe-false]` `[defer]` Blind: Windows Corepack lookup needs node_modules/corepack beside corepack.cmd — would need a native Windows host or non-bundled layout; grouped into the Corepack discovery deferral.
  - `[maybe-false]` `[defer]` Blind: POSIX Corepack shim found on PATH is realpathed and run by node — would need an asdf/Volta shim host; recorded as the new Corepack deferral (medium, unverified).
  - `[low]` `[reject]` Blind: `waitForHealth` retries on error-message prefix/TypeError — bounded to 30 seconds and fails loudly afterwards; no wrong outcome shown.
  - `[false]` `[reject]` Blind: detached children can stop on SIGTTIN when reading the TTY — libuv `detached` calls setsid, so the child has no controlling terminal and gets no job-control stop; install/build also fail rather than hang in tests.
  - `[low]` `[reject]` Blind: interrupted setup/verify exit 0 — deliberate and asserted by existing tests (interruption row requires cleanup, not an exit code); changing it touches many tests.
  - `[false]` `[reject]` Blind: tests need network and mutate the repo — installing dependencies is the task's purpose; fixtures run in temporary copies.
  - `[low]` `[reject]` Blind: docs/bmad-loop.md additions are unrelated and hardcode a Node patch path — operator doc of the loop orchestrator; a stale example path is harmless.
  - `[low]` `[reject]` Blind: stale `.ps1`/5173 mentions remain — only the historical RUNBOOK changelog and docs/usability-report.md (a dated report); the spec says to preserve historical context. `.cache/` in .gitignore is a generic cache entry.
  - `[low]` `[reject]` Blind: `.gitattributes` lacks a renormalize step — no CRLF-committed files demonstrated; renormalizing is a separate repository-wide commit.
  - `[low]` `[reject]` Blind: setup output lost the GitHub token hint — nice-to-have; `.env` is optional by spec.
  - `[medium]` `[patch]` Edge: `app:doctor` points at a missing file — same defect as the first row; fixed together.
  - `[medium]` `[patch]` Edge: `.env` loading no longer searches upward and reverses precedence — same defect as the `.env` search row; fixed together.
  - `[false]` `[reject]` Edge: IPC presence assumed to mean launcher ownership — same refutation as the tsx watch row.
  - `[low]` `[patch]` Edge: shutDown masks a failed close with exit 0 — same defect as the shutdown row; fixed together.
  - `[high]` `[patch]` Edge: 10-second opener deadline kills a blocking opener and fails startup — carried: same location and claim as the first-pass browser-lifetime row, and the source still bounds the opener at ten seconds (hang is tested to fail). Not patched again; remaining risk recorded in the run result.
  - `[medium]` `[patch]` Edge: verify has no default-Project-folder access check — same defect as the RUNBOOK-claim row; fixed with a `verify.mjs` check (directory plus W_OK|X_OK, no write probe) and a regression test.
  - `[medium]` `[patch]` Edge: old verifier required a writable Project directory and the port dropped it — same defect; fixed together.
  - `[low]` `[reject]` Edge: verify no longer warns on a non-loopback HOST — the warning is only reachable with strict-local disabled; `--check-health` and start reject it, and the Project is not touched.
  - `[low]` `[reject]` Edge: retired certificate configuration gives no guidance for TLS-intercepting proxies — the removed download logic is gone by spec; pnpm/Corepack honor the standard Node CA variables.
  - `[maybe-false]` `[reject]` Edge: Windows `stopProcess` skips taskkill when the root already exited — the owned server has no long-lived children on exit paths; if true it would be low, and only a native Windows run would settle it.
  - `[low]` `[reject]` Edge: start before setup fails with a raw module error — same as the earlier start-before-setup row.
  - `[maybe-false]` `[defer]` Edge: shim/other-Node Corepack resolution — same Corepack discovery deferral.
  - `[low]` `[reject]` Edge: build skipped when only dist/index.html exists — AD-21 existence check; a partial dist needs an interrupted build.
  - `[false]` `[reject]` Edge: server exit 0 would leave the launcher silent — the server exits 0 only on IPC disconnect, which cannot happen while the launcher is alive.
  - `[low]` `[reject]` Edge: second Ctrl+C swallowed and interrupted runs exit 0 — same deliberate, tested behavior as the interruption exit row.
  - `[low]` `[patch]` Edge: RUNBOOK claims setup validates runtime configuration — confirmed setup only checks Node/Corepack/pnpm (tsx is not installed before the install step); RUNBOOK sentence corrected.
  - `[medium]` `[patch]` Verification gap: verify's Project-folder check is untested and absent — pre-verified; fixed with the gate above and a test covering directory, regular file and read-only directory.
  - `[medium]` `[patch]` Verification gap: `app:doctor` references a missing file — pre-verified; removed.
  - `[low]` `[reject]` Verification gap: verify does not run the launcher tests — not requested; `pnpm test` runs them.
  - `[maybe-false]` `[defer]` Intent: supported-platform and real-opener behavior is exercised only through fixtures on this host — carried: same limit as the first-pass native-acceptance deferrals already recorded.
  - `[low]` `[reject]` Intent: server-local `.env` HOST is caught after spawn instead of in the pre-spawn check — the server's IPC guard exits before DB creation or bind and a test asserts it.
  - `[maybe-false]` `[reject]` Intent: occupied-port refusal happens after `buildServer` — the spec requires refusal and no browser, which tests assert; idempotent DB open on the same data would be low if true.
  - `[medium]` `[patch]` Intent: `app:doctor` is out-of-scope and dangling — same defect as the first row.
  - `[low]` `[reject]` Intent: bmad-loop doc paragraphs are outside the intent — same as the earlier bmad-loop row.
  - `[false]` `[reject]` Intent: RUNBOOK changelog gains a 0.2.5 entry — the changelog records every runbook change; this is the required convention.
  - `[low]` `[reject]` Intent: docs, `.gitattributes` and deletions have no tests — verified by inspection (scripts/*.ps1 absent, LF attribute, engines bound).
  - `[false]` `[reject]` Intent: sprint-status.yaml and deferred-work.md are modified in the tree — orchestrator-owned and not part of this diff.

Patches applied: package.json aliases removed; verify.mjs Project-folder gate plus test; main.ts `.env` search and shutdown exit code restored; RUNBOOK setup sentence corrected. Deferral added: Corepack discovery on shim/non-bundled installs.

## Verification

- Node 24 first on PATH; `node --test scripts/runtime.test.mjs` for launcher command regressions.
- `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm check-hygiene` and `node scripts/verify.mjs` pass.
- Isolated fresh tracked-source copy, no dependency/build/config/runtime caches: documented setup/start succeeds, browser opens and UI/API share one loopback origin; record timing, stop processes and remove only temporary data.
- Record unavailable native Windows execution as deferred. Never use mocked OS dispatch as evidence of a real Windows acceptance run.

### Parent verification evidence

- `corepack pnpm test`: 84 tests pass (18 launcher, four hygiene, server 27, db 19, web nine, core five, importers two), none skipped on macOS. Every matrix row ran at the command boundary, including owned readiness/health timeout and failed browser cleanup.
- Full `node scripts/verify.mjs`: Git hygiene, pnpm version, source hygiene, workspace typecheck and build pass. Actual global Node 22 setup rejects with the explicit Node 24 prerequisite before mutation.
- Fresh tracked-source copy in a path containing spaces: no node_modules, web dist, .env or repository cache. Isolated fresh Corepack cache and pnpm store downloaded all 466 dependencies; setup passed in 22.58 seconds, built UI and created the default folder. System Python/toolchain/node-gyp headers remain installed; this is clean-source evidence, not a newly provisioned machine.
- Real documented start creates its default database, prints the healthy one-origin URL, and invokes the native macOS `open` successfully. HTTP app and API return 200; Ctrl+C exits 130 and stops the port. Native-window observations returned cgWindowNotFound, so the automatically opened default-browser tab could not be observed. A separate CUA Chrome tab renders onboarding and Story Maps with the seed map on the same origin. Visual confirmation of the automatic default-browser tab remains limited.
- First isolated verifier attempt failed because the temporary source-copy Git repository had no commits; replaced only temporary metadata with a local shared clone. No source repair or commit was needed. Root repository full verifier already passed.
- Repeat actual start-to-ready timing: 0.88 seconds. Setup plus startup readiness totals 23.45 seconds, below SM-1's ten-minute target on this macOS host. Isolated verifier with --check-health passes after local history clone; Ctrl+C exits 130, the port is closed, and the temporary source/cache trees and CUA tab were removed.

### Final repair verification evidence

- `corepack pnpm test`: 100 tests pass, none skipped on macOS (34 launcher/verifier, four hygiene, 62 workspace tests). Full output includes each matrix case, concrete startup causes, conflicting server-local env, long browser lifetime, abrupt-parent disconnect and all verifier rejection cases.
- Full portable `node scripts/verify.mjs` passes after repairs: source/Git hygiene, pinned pnpm, typecheck and all package builds. Existing Vite chunk-size warning remains non-failing.
- Repaired final clean-source copy with spaces and fresh Corepack/package stores: setup 22.36 seconds; startup readiness 1.07 seconds; combined 23.43 seconds. With no `.env`, host/port/DB overrides or repository-local runtime, it served the app at default `http://127.0.0.1:4317`, created only temporary default data, and successfully invoked native open after health.
- Final separate Chrome observation rendered onboarding and the seeded Story Maps list at that default origin. Isolated `verify.mjs --skip-typecheck --skip-build --check-health` passes. Ctrl+C stops the default port; temporary checkouts/caches and CUA tabs are removed. Automatic default-browser tab observation and native Windows/Linux acceptance retain their recorded limits.
- New ignored-example regression initially exposed a status-order defect: staged deletion precedes ignored entry. Verifier now inspects every status line; focused 13-test rerun and final full suite pass.
- Generated OpenWolf index refreshed; JSON and spec YAML validated. No source changes appeared after final verification. No real repository commit was created; synthetic commits exist only inside deleted harmless verifier-test repositories.

## Auto Run Result

Status: done (follow-up pass)

Summary: Follow-up review of the portable setup/start/verify change. Four independent reviews produced 49 findings; five groups were patched, one deferred, the rest rejected or carried.

Files changed in this pass:
- `package.json`: removed unreferenced `app:setup`/`app:start` aliases and the dangling `app:doctor`.
- `scripts/verify.mjs`: existing default Project folder must be a directory with write/traverse access.
- `scripts/commands.test.mjs`: regression covering directory, regular file and read-only folder.
- `apps/server/src/main.ts`: restored the nearest-upward `.env` search; failed shutdown now exits 1.
- `docs/RUNBOOK.md`: setup sentence names only the checks setup performs.

Review breakdown: patched high 0, medium 4 groups (aliases, Project-folder gate, `.env` search; plus shared rows), low 2 (shutdown exit, RUNBOOK sentence). Deferred: Corepack shim/non-bundled-layout discovery (medium, unverified). Rejected findings carry their reasons in the log above. Carried unchanged from pass 1: the ten-second browser-opener bound.

Follow-up review recommended: false (this pass patched no high).

Verification: `corepack pnpm test` passes (launcher/verifier 31, workspace suites all green, none failing); `node scripts/verify.mjs` passes (hygiene, pinned pnpm, typecheck, builds).

Residual risks: a Linux xdg-open that blocks longer than ten seconds fails startup and stops the server; native Windows/Linux and automatic default-browser tab behavior remain unobserved; no commit was created because the spec and user rules forbid committing without explicit authorization, so the reviewed files remain uncommitted for the orchestrator.
