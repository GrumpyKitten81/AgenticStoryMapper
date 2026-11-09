---
title: '1.4 Understandable failures and a doctor command'
type: feature
created: '2026-10-03'
status: done
baseline_revision: 407c4060071b75076980582a5c59e7b034c9297f
review_loop_iteration: 0
followup_review_recommended: false
context:
  - [REDACTED_HOME]/.claude/CLAUDE.md
  - [REDACTED_HOME]/Projects/StoryMapper/AGENTS.md
  - [REDACTED_HOME]/Projects/StoryMapper/.wolf/OPENWOLF.md
warnings: [oversized]
deferred:
  - summary: >-
      Native Windows and Linux doctor/start diagnostics and cleanup acceptance remain unexecuted.
    evidence: |-
      All command tests and unmocked acceptance ran on macOS. Native supported-host runs would settle the remaining platform behavior; mocks and dispatch branches alone do not establish it.
    location: >-
      Story 1.4 supported-platform acceptance
    severity: medium (unverified)
  - summary: >-
      Browser opening now pipes opener stdout/stderr; a Linux opener whose browser descendant inherits the pipes could keep the child from closing until the ten-second deadline.
    evidence: |-
      scripts/runtime.mjs openBrowser passes diagnostics to run(), which pipes stdio and waits for the close event. Whether real xdg-open descendants hold those pipes depends on the desktop and browser; macOS and the fixture opener do not show it. A native Linux start with the real opener would settle it (ignored opener stdio would be the repair if it reproduces).
    location: >-
      scripts/runtime.mjs:openBrowser, scripts/processes.mjs:run
    severity: medium (unverified)
---

Purpose: implement Epic 1 Story 1.4 from its acceptance criteria and AD-21, preserving portable startup. Updated: 2026-10-03. Version: 6. Reproduce from the intent, source map and command acceptance below.

<intent-contract>

## Intent

**Problem:** Setup/start failures expose technical errors without a clear repair, and no read-only doctor command exists. Users cannot diagnose runtime, installation, native SQLite or occupied-port failures reliably.

**Approach:** Provide plain English failure messages and `node scripts/doctor.mjs`, using the same runtime and configuration as startup. Each failure gives one cause and one concrete next action; `--debug` enables diagnostic traces.

## Boundaries & Constraints

**Always:** Support installed Node 24 (`>=24 <25`) and portable commands on Windows/macOS/Linux. Unsupported Node errors name required/found versions and https://nodejs.org/en/download. Occupied-port errors name the configured port and process type if known and explain choosing another `PORT` in optional `.env`; unknown holders are explicitly unknown. Native load failures name `corepack pnpm --filter @storymapper/db rebuild better-sqlite3` under the same Node 24 runtime. Missing dependencies direct users to `node scripts/setup.mjs`. Doctor reports PASS/FAIL independently for Node version, Corepack availability, configured port free, installed dependencies, native module loads and web build present; each failed check has a named fix. Doctor exits nonzero if any check fails, including occupied port even when Agentic Story Mapper is healthy, and reports the `/health` result when a server answers. Keep requests bounded, local and read-only. Probe the native binding using a transient in-memory database, never Project files. Doctor works before setup and collects all checks rather than stopping at the first failure. Preserve config precedence, production serving, browser-after-owned-health behavior and owned-child cleanup. Normal failure output has no stack traces; debug traces never disclose credentials. Validate `--debug` at public setup/start/doctor commands. Document doctor, debug and repairs in operational guidance.

**Never:** Write or revert `sprint-status.yaml` or derive verification from its bookkeeping. Modify user Project data during diagnosis, install/rebuild/build from doctor, create files/caches through a Corepack download check, print/store credentials, add dependencies, SaaS, telemetry, remote network checks, duplicated configuration schemas/parsers, new API contracts, sample-map features, unrequested launch options, commits or pushes. Preserve existing loopback restrictions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Unsupported Node | Setup/start on unsupported version | Required/found versions and installation location; no subsequent work | Nonzero; cause/action, no trace by default |
| Missing dependencies | Start before setup or with missing runtime dependency | Instruction to run setup before launching/building | Nonzero; no DB/browser side effects |
| Occupied port | Start while configured port is bound | Port, known process type or unknown holder, choose another PORT | Nonzero; no browser opening; preserve other listener |
| Native load failure | Start with unloadable better-sqlite3 binding | Names module and exact rebuild command | Nonzero; no raw trace by default |
| Setup failure | Install/store or build command fails | Concrete phase/cause and next action | Nonzero; stop subsequent steps; technical details only under debug |
| Doctor success | Supported runtime, Corepack/dependencies/native/build present, port free | Six PASS rows; no filesystem/Project changes | Zero exit |
| Doctor multiple failures | Fresh checkout, missing deps/build/Corepack or bad Node | All six rows still reported, with fixes for failures | Nonzero; no writes or command downloads |
| Doctor occupied server | Healthy, unhealthy, malformed or stalled service on port | Port FAIL and bounded /health result without losing other rows | Nonzero; health status/body validity accurately reported |
| Debug/errors | Failure with --debug; unknown flag | Debug includes useful trace; unknown argument is actionable | Nonzero; default excludes traces and all output excludes credentials |

</intent-contract>

## Code Map

- `scripts/runtime.mjs:9,24,37` — Corepack PATH resolution, Node/pinned-pnpm checks, configuredUrl currently requires tsx and loads root .env. Reuse shared config TS directly on Node 24 (verified import succeeds); preserve actual child precedence: process env, root .env loaded by launcher, then nearest-upward server .env fills absent values. Use existing loader with supplied env and accurate server cwd for diagnosis/start. No copying parsers.
- `apps/server/src/config/runtime.ts`, `local-env.ts` — single source for host/port/strict-local and env precedence. Direct `.ts` imports need no dependencies on supported Node.
- `scripts/start.mjs`, `setup.mjs`, `launcher.mjs` — public commands, build-if-missing, IPC listening ownership and health/browser ordering. Add preflight before server DB/browser side effects while retaining bind-race handling.
- `scripts/processes.mjs:77,111` — shared child execution currently inherits stderr, losing structured phase context and exposing raw errors; commandMain prints only error.message. Keep cancellation/tree cleanup and verifier semantics while adding appropriate command-boundary diagnostics.
- `apps/server/src/main.ts:1,20,40` — configuration and buildServer occur outside current startup catch; listen logs err objects. Ensure startup failures travel to launcher meaningfully without duplicate default stack output, including bind races. Preserve direct server commands and shutdown behavior.
- `packages/db/package.json`, `apps/server/package.json` — resolve better-sqlite3 from its owning package and runtime dependencies from actual manifests. Require plus `new Database(':memory:')` loads binding; close immediately without touching persistent data.
- `scripts/doctor.mjs` and narrowly shared diagnostic helpers (new) — six checks, port/read-only health, safe diagnostic rendering; Node built-ins suffice.
- `scripts/commands.test.mjs`, `scripts/fixtures/*` — isolated temporary source copies, fresh/missing dependencies, real server/native binding, controllable process commands and node version. Reuse and extend meaningful actual-command coverage; no boilerplate tests or user data.
- `README.md:81`, `docs/RUNBOOK.md:160` — operational commands and troubleshooting; add concise English doctor/debug guidance and exact repairs, update metadata/changelog, preserve unrelated content.
- Prior Story 1.3 spec is continuity evidence only: preserve production launch tests and record missing native Windows/Linux acceptance explicitly rather than block this Mac run.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/runtime.mjs`, diagnostic helpers, `scripts/setup.mjs`, `start.mjs`, `processes.mjs`, `launcher.mjs`, `apps/server/src/main.ts` — actionable failure handling and debug plumbing, shared preflight/config and startup error reporting.
- [x] `scripts/doctor.mjs` — implement all six independent read-only checks and occupied-port health reporting.
- [x] `scripts/commands.test.mjs`, `scripts/fixtures/*` — exercise every matrix row at actual CLI boundary, assert nonzero/zero status, default trace suppression/debug, no unintended writes, unchanged other listeners and bounded health handling.
- [x] `README.md`, `docs/RUNBOOK.md` — document doctor/debug and failure repairs consistently.
- [x] Run focused tests and full release gates; inspect the diff and matrix coverage; record supported-platform execution limits.

**Acceptance Criteria:**
- Given a fresh clone without setup, when doctor runs, then six check results and named fixes are printed without changing files or downloading/installing anything.
- Given supported installed prerequisites and a free configured port, when doctor runs, then all six checks pass and it exits zero without opening persistent data.
- Given a running service on the configured port, when doctor runs, then port fails, /health is reported within a bound, all other checks remain visible and it exits nonzero.
- Given any failure in the matrix, when the documented setup/start/doctor command runs, then its cause and next action are observable at that command surface with no default stack trace and useful --debug diagnostics.
- Given valid existing startup, when start runs, then production UI/API serving, owned-health browser ordering and interruption cleanup remain intact.

## Spec Change Log

- 2026-10-03 v1: planned Story 1.4 from explicit epic ACs, current source and Story 1.3 continuity; excluded later health-schema/port-file work and preserved orchestrator ownership.

- 2026-10-03 v2: classified four review lenses, applied eleven shared repairs and a parent correction to database error classification; added native-platform evidence limits without changing the intent contract.

- 2026-10-03 v3: final parent verification passed 114 tests plus full release gates; recorded unmocked read-only acceptance, review counts and terminal completion without commits or sprint-status writes.

- 2026-10-03 v4: automation status check confirmed no pending test/start/doctor processes and refreshed the existing terminal completion artifact; no code or verification outcome changed.

- 2026-10-03 v5: repaired the deterministic stdout fixture race, completed a fresh four-lens review, corrected diagnostic decoding/redaction/flush and metadata actions, and extended focused regressions. The frozen contract and orchestrator sprint file remain unchanged.

- 2026-10-03 v6: confirmed no pending background tasks and refreshed the terminal completion checkpoint; final test and release verification evidence is unchanged.

## Review Triage Log

### 2026-10-03 — Review pass 1

- verdicts: 18 findings — high 1, medium 13, low 1, false 2, maybe-false 1
- All four lenses completed before triage. The fourth initial launch hit the platform's three-reviewer limit and launched after the first reviewer returned; no result was triaged before all launches.
- findings:
  - `[medium]` `[patch]` Verification: native tests fail at package load, leaving constructor probing unprotected — pre-verified; added a command case recording JavaScript load then actual .node addon attempt, with native FAIL, rebuild instruction and unchanged persistent-data snapshot.
  - `[medium]` `[patch]` Verification: successful owned startup never proves root/server env precedence — pre-verified; added conflicting ports from an unrelated cwd, checking root-selected browser URL, reachable API and both ports after cleanup.
  - `[high]` `[patch]` Blind: escaped credentials leak through diagnostic redaction — reproduced with synthetic quote/backslash values; redact JSON-serialized environment values and fully consume escaped quoted credential fields. Formatter and chunked live-debug regressions cover the repairs.
  - `[medium]` `[patch]` Blind: successful debug startup hides server stderr — source confirms stderr was retained only for later failure; stream complete redacted lines under --debug and cover a server remaining live after diagnostics.
  - `[medium]` `[patch]` Blind: lifetime stderr buffering grows without bound — verified by the unbounded accumulator; retain a 16 KiB redacted tail and omit overlong lines without leaking chunked values. Shared stderr repair with the previous row.
  - `[medium]` `[patch]` Blind: dependency manifests pass despite missing entry files — reproduced with a private corrupted fastify copy; validate installed required entries without executing application code, preserve legitimate subpath-only packages, and cover doctor rejection without writes.
  - `[low]` `[reject]` Blind: startup requires web test tooling even with a production build — source confirms full workspace dependency checking. A production-only partial install is not the documented setup path; changing it needs added conditional checks/parameters for a rarely encountered layout, beyond a direct correction. Full setup remains the named repair.
  - `[medium]` `[patch]` Blind: empty Corepack entry falsely passes — reproduced with an empty PATH entry; run only local Corepack --version with network/autopin/project-spec disabled and validate its result, with all-six-check/no-cache regression.
  - `[medium]` `[patch]` Blind: directory named index.html falsely passes and skips rebuilding — reproduced in an isolated checkout; share a readable-regular-file check between doctor and launcher, with diagnosis and attempted build regressions.
  - `[medium]` `[patch]` Blind: compiler cause is suppressed while repair refers to a reported error — source confirms ordinary TS diagnostics contain no ERR code; include one concise redacted compiler/build cause in normal output and exclude stack lines.
  - `[medium]` `[patch]` Blind: database access repair loops through doctor, which never inspects Project access — existing actual file-layout failure test reproduces it; give the writable-directory/database-path action. Parent recheck narrowed the repair to mkdir/SQLite errors so unreadable .env is not misclassified; both cases are covered.
  - `[medium]` `[patch]` Blind: root .env PORT repair is ineffective under a process override — source/config tests establish process precedence; name changing/removing that override or changing .env, and cover the message.
  - `[medium]` `[patch]` Edge: arbitrary health bodies are buffered without a byte limit — parent accepted a valid 2 MB response before the repair; stream at most 16 KiB before parsing and retain the two-second deadline, with oversized occupied-service coverage and other rows still visible.
  - `[medium]` `[patch]` Edge: long-lived stderr exhausts launcher memory — same verified accumulator as the Blind stderr row; shared bounded-tail repair.
  - `[false]` `[reject]` Intent: repository diff cannot establish skill invocation or sprint write history — tool history shows the exact renderer ran once and its snapshot workflow was followed; no action wrote/reverted sprint status. Verification uses actual command runs, not bookkeeping rows.
  - `[medium]` `[patch]` Intent: human repair surface lacks underlying generic causes/actions — verified for ordinary compiler errors and database access; shared concise compiler-cause and concrete database-action repairs above, with public-command tests.
  - `[maybe-false]` `[defer]` Intent: controlled failures do not establish all native platform conditions — actual Node 22 setup/start and real native loading pass on this Mac, and constructor-time failure is now covered; native Windows/Linux command, browser and cleanup runs would settle the medium unverified platform outcome.
  - `[false]` `[reject]` Intent: filesystem snapshots do not prove external cache/dependency immutability — diagnosis source only resolves/reads dependencies, opens transient memory SQLite and invokes local Corepack --version with bootstrap/network disabled; unmocked parent acceptance checks an unused external Corepack cache remains absent and files unchanged. No persistent DB is opened.

Eleven shared repair entries applied: one high (redaction), ten medium (stderr, dependency entries, Corepack, web entry, compiler cause, database repair, PORT guidance, health byte bound, constructor regression, successful env-handoff regression). One deferred platform record; three rejected rows retain their evidence above. Immutable intent preserved.

### 2026-10-03 — Review pass 2 (follow-up pass)

- verdicts: 43 findings — high 0, medium 9, low 17, false 11, maybe-false 6
- No row matched an earlier log row except the platform-evidence finding, carried. Layers: Blind 14, Edge 17, Verification gap 5, Intent alignment 7 (divergences listed by the auditor).
- findings:
  - `[medium]` `[patch]` Blind: server `.env` loader falls back to the caller's cwd when no `.env` exists upward — source confirms `loadLocalEnv(undefined)` takes its default `findEnvFile(process.cwd())`; guarded the call and added a doctor test with a foreign-cwd `.env`.
  - `[low]` `[reject]` Blind: redaction has no minimum secret length and misses `GH_PAT`/`*_KEY`/token shapes — real only for short values under secret-named variables; project secret is `GITHUB_TOKEN`; a length rule trades mangling for leaking and is added policy, not a direct correction.
  - `[low]` `[patch]` Blind: `startupFailure` classifies by message text — only the `/HOST|PORT/` match could misfire (restricted to the two runtime-config messages); module-not-found, sqlite-name and default-path claims are rejected as developer-only wording with no reachable misrepair.
  - `[false]` `[reject]` Blind: failure contract is a string convention — no failing input shown; `startupFailure` always returns a marked error, so `redact(undefined)` is unreachable.
  - `[low]` `[reject]` Blind: setup is silent during install/build and buffers output — silence is the matrix's "details only under debug" choice (tsc errors go to stdout); the buffered processes are finite; progress output would be new functionality.
  - `[low]` `[patch]` Blind: launcher stdout gaps — added utf8 decoding and end-of-stream flush, removed the unused `config` handoff; `process.env` assignment is needed for default redaction, and later-stderr discard matches the contract.
  - `[maybe-false]` `[reject]` Blind: Corepack two-second bound can fail a cold host — would need a slow-start measurement; if true, a rerun clears it, so low.
  - `[false]` `[reject]` Blind: dependency check over-engineered and stops at first missing name — current dependencies pass in real runs, the first-name report satisfies the setup instruction, and no concrete harm is named.
  - `[false]` `[reject]` Blind: port check and holder reporting — doctor and server resolve `HOST` through the same listen call; unknown holders are explicitly reported as the matrix allows.
  - `[medium]` `[patch]` Blind: server IPC loopback guard is untested after the test flipped — test title claimed the server guard while the launcher now rejects first; renamed it and added a direct IPC server test (shared root with Edge, Gap, Intent rows).
  - `[low]` `[patch]` Blind: unrequested `main.ts` changes — restored the `{ host }` warn field; the structured-log replacement is the specified stderr behavior and a closed IPC channel still exits through the send callback.
  - `[false]` `[reject]` Blind: docs duplicate and overlap — the spec requires the English block in both documents; existing German bullets stay consistent; two changelog entries record two repair rounds.
  - `[false]` `[reject]` Blind: spec has local paths and stale evidence — the fix edits this build's spec.
  - `[low]` `[reject]` Blind: test timing and missing cases — speculative flakiness and cases without a demonstrated defect; fixing needs new scaffolding.
  - `[medium]` `[patch]` Edge: runtime `.env` cwd fallback — same defect as the first Blind row; fixed there.
  - `[medium]` `[patch]` Edge: claim form of the same cwd fallback — same fix and test.
  - `[medium]` `[patch]` Edge: doctor copies `process.env` into a plain object, losing Windows case-insensitive `Path` — Corepack lookup reads `env.PATH`, so a standard Windows host reports FAIL; doctor now uses `process.env`; unexecuted natively (existing platform deferral).
  - `[maybe-false]` `[defer]` Edge: piped browser-opener stdio may block `close` on Linux — depends on real `xdg-open` descendants; deferred as medium (unverified) with the native Linux run that settles it.
  - `[false]` `[reject]` Edge: ESM-only dependency fails `require.resolve` — not reachable with the current dependency set, which passes unmocked doctor runs.
  - `[low]` `[reject]` Edge: short secret values mangle output — same as the second Blind row.
  - `[low]` `[reject]` Edge: SQLite corruption/EROFS/ENOSPC fall through to the doctor repair — outside the matrix; correct repair text would be new per-code behavior.
  - `[low]` `[patch]` Edge: `/HOST|PORT/` classification — fixed with the Blind classification row.
  - `[low]` `[reject]` Edge: setup output unbounded and silent — same as the setup Blind row.
  - `[maybe-false]` `[reject]` Edge: Corepack timeout reports a generic row — same as the Blind timeout row.
  - `[low]` `[reject]` Edge: null health body reports a generic failure — still a nonzero, accurately-failed health row; waitForHealth retries to its bound.
  - `[low]` `[patch]` Edge: stdout decode/flush — fixed with the Blind launcher row.
  - `[low]` `[reject]` Edge: browser-deadline error points at doctor — only reachable if the unverified opener hang exists; covered by that deferral.
  - `[false]` `[reject]` Edge: Node below 17.3 — each doctor row except the loop check is already caught per row, Node 17 is outside any supported runtime and the Node row is first.
  - `[low]` `[reject]` Edge: fix text blames Node for loopback errors — message states the real cause first; wording only.
  - `[medium]` `[patch]` Edge: loopback test flipped — same root as the Blind loopback row.
  - `[low]` `[patch]` Edge: dropped `{ host }` in warn — restored.
  - `[medium]` `[patch]` Gap: server stdout forwarding/redaction unasserted — pre-verified; added `stdoutChunks` fixture option and a start test for redaction and an unterminated final line.
  - `[medium]` `[patch]` Gap: IPC loopback guard unexercised — pre-verified; same repair as the Blind loopback row.
  - `[low]` `[reject]` Gap other: setup stdout never shown — same as the setup Blind row.
  - `[low]` `[patch]` Gap other: final stdout line lost — fixed with the launcher row and covered by the new test.
  - `[maybe-false]` `[reject]` Gap other: Corepack timeout untested — same as the timeout rows.
  - `[medium]` `[patch]` Intent: loopback test flipped and server guard unreached — same root as the loopback rows.
  - `[false]` `[reject]` Intent: debug/no-debug at the server boundary seen only through relay — direct-server variants in doctor.test.mjs already assert both modes without the launcher.
  - `[maybe-false]` `[reject]` Intent: doctor on a truly unsupported Node not run — doctor catches each row and the Node row is first; would need an old-Node host; if true only low.
  - `[maybe-false]` `[defer]` Intent: native Windows/Linux acceptance — `carried` from review pass 1 platform row; existing deferral stands.
  - `[false]` `[reject]` Intent: process type limited to health classification — the matrix accepts a known type or an explicit unknown holder.
  - `[false]` `[reject]` Intent: redaction tests do not use `GITHUB_TOKEN` — the key pattern matches it and synthetic secret variables cover the paths.
  - `[false]` `[reject]` Intent: out-of-diff self-reported verification and split streams — tests merge both streams and assert order; verification here was rerun.

Patches applied: nine medium rows and seven low rows route to eight edits (env guard, Windows env, stdout decode/flush, unused handoff, warn host, message regex, loopback test pair, stdout test). No high found.

### 2026-10-03 — Review pass 3 (deterministic verification repair)

- verdicts: 24 findings — high 3, medium 3, low 12, false 2, maybe-false 4
- All four lenses completed before triage. The fourth launch initially hit the three-reviewer capacity and launched when the gap reviewer returned; results were not classified until every layer returned.
- findings:
  - `[medium]` `[patch]` Gap: conditional ESM export validation lacked a failing regression — Extended the private dependency fixture to remove Drizzle’s imported ESM target while its CommonJS counterpart stays present; doctor rejects it read-only with the setup action.
  - `[medium]` `[patch]` Gap: default server stderr suppression lacked confirmed emission coverage — A write-completion marker now confirms fixture stderr emission before normal start asserts that diagnostic and stack lines stay absent, including after cleanup.
  - `[low]` `[reject]` Blind: launcher stdout line buffering is unbounded — The existing server emits finite newline-delimited logs; an indefinitely growing malformed stream is not an everyday application output. Adding an omission state machine is more than a direct correction.
  - `[low]` `[reject]` Blind: finite install/build output capture is unbounded — carried from review pass 2 setup-buffer rows: the captured setup processes are finite; a bounded collector would add policy and branching for an unusual output volume.
  - `[high]` `[patch]` Blind: Buffer-to-string conversion corrupts split UTF-8 secrets — Captured stdout and stderr now use UTF-8 stream decoding. Actual setup failures split a multibyte credential across byte chunks in both streams under normal/debug modes and assert redaction without replacement characters.
  - `[low]` `[reject]` Blind: workspace dependency links are skipped — The validator deliberately checks installed external manifests; a damaged individual workspace link can lead to a later actionable setup failure. This rare partial checkout does not justify adding a separate workspace-resolution traversal in this repair.
  - `[low]` `[reject]` Blind: transitive dependency loadability is not validated — The source validates declared package entries without executing dependency code. A missing transitive package still fails startup with the setup repair; recursively loading/traversing dependency internals adds complexity for an unusual damaged installation.
  - `[low]` `[reject]` Blind: readable web index does not prove referenced assets are complete — The named check is web-build presence; current serving tests validate actual built assets. Additional HTML/asset validation for a manually corrupted build would require new parsing and checks.
  - `[false]` `[reject]` Blind: missing SQLite package is classified as native failure before module-not-found — Public start checks dependencies before the native probe or server launch, so a missing declared SQLite package receives the setup action. Doctor independently reports dependency and native rows as specified; the direct-server classification does not disprove that public behavior.
  - `[low]` `[reject]` Blind: Next action text is also an IPC delimiter — A filesystem path deliberately containing the exact delimiter could confuse repair text, but this is not an everyday path. Replacing the failure representation would add a structured error contract rather than a direct correction.
  - `[low]` `[reject]` Blind: successful debug setup stdout is discarded — carried from review pass 2 setup-stdout rows: captured successful command stdout is not a failure. Forwarding new progress output would add behavior beyond correcting failure diagnostics.
  - `[high]` `[patch]` Blind: line forwarding can disclose multiline credential fragments — Parent reproduced unchanged synthetic fragments. The existing redactor now removes full raw/serialized values first and nonempty raw/serialized line fragments; formatter and actual start stdout/debug-stderr tests cover raw newline boundaries.
  - `[maybe-false]` `[defer]` Blind: native Windows/Linux and Linux opener acceptance remains unexecuted — carried from existing platform and opener deferrals. Native commands, browser ownership and cleanup on those hosts would settle the medium unverified behavior; no duplicate deferral is added.
  - `[false]` `[reject]` Intent: the baseline diff contains a forbidden sprint-status edit — carried from the prior ownership finding. The user explicitly identifies orchestrator bookkeeping as owned externally; this session’s starting/final hashes match and no action writes, reverts or stages that file. The pre-existing row is not a defect or verification evidence.
  - `[low]` `[reject]` Intent: dependency preflight does not establish all workspace/transitive loadability — Same rare partial-install outcomes as the Blind workspace/transitive rows. Direct installed entries are checked, server import failures remain actionable, and extra recursive/runtime loading is more than a direct correction.
  - `[maybe-false]` `[defer]` Intent: injected runtime/native failures do not establish every native host outcome — carried from the platform-evidence row. Actual default Node 22.23.1 setup/start were rerun and both fail immediately with required/found versions and download action; incompatible native binaries and Windows/Linux behavior remain under the existing deferral.
  - `[maybe-false]` `[defer]` Intent: fixture browser success does not settle Linux descendant pipe inheritance — carried from the existing opener deferral. A native Linux desktop run with the real opener is needed; no second deferral is added.
  - `[low]` `[reject]` Intent: repair commands and concise compiler causes differ from a stronger reading of plain-English repairs — carried from prior setup/normal-cause triage. Matrix failures name a phase/cause and actionable command or configuration repair; traces remain debug-only. No new failing matrix input or unusable repair was demonstrated.
  - `[high]` `[patch]` Edge: split UTF-8 chunks bypass exact-value redaction — Shared root and repair with the Blind decoding row: both captured streams use UTF-8 decoding, and public normal/debug setup tests prove byte-split credential redaction.
  - `[low]` `[reject]` Edge: continuously verbose diagnostic children can exhaust capture memory — carried from the finite setup capture rows. No everyday supported command demonstrates the unbounded-volume trigger; a new bounded output collector would add policy and branching.
  - `[low]` `[reject]` Edge: indefinite server stdout line can exhaust pending buffer — Same rare malformed-output trigger as the Blind stdout row. Current server logs terminate their lines; an additional omission state machine is not a direct correction.
  - `[maybe-false]` `[defer]` Edge: browser descendant can retain newly piped opener streams — carried from the existing Linux opener deferral; a real native desktop run would settle it. No duplicate item is added.
  - `[low]` `[patch]` Edge: immediate direct-server exit can truncate piped stderr — Startup failure now exits from the stderr write callback. A large actual direct-server diagnostic regression requires its end marker, trailing stack and final newline before exit.
  - `[medium]` `[patch]` Edge: malformed/unreadable dependency metadata escapes without an action — Parent reproduced malformed private Fastify metadata through start without Next action. The existing entry validator now maps known parse/read failures to its incomplete result; start/doctor coverage asserts the setup action, no trace, no DB/browser effects and unchanged files.

Six shared review patches: two high (UTF-8 decoding, multiline redaction), three medium (ESM regression, default stderr regression, metadata action), one low (stderr flush). Four carried deferral findings retain the two existing evidence limits; thirteen findings were rejected with the reasons above. The initial stdout fixture race repair remains in place.

### 2026-10-03 — Review pass 4 (follow-up pass)

- verdicts: 34 findings — high 0, medium 3, low 16, false 11, maybe-false 4
- Layers: Blind 14, Edge 8, Verification gap 4, Intent alignment 8 (divergences listed by the auditor). All four launched in one message and returned before triage. Rows matching earlier log rows are marked `carried`.
- findings:
  - `[low]` `[reject]` Blind: `run()` pipes and hides child progress, output unbounded — carried from the setup-silent and finite-capture rows of passes 2 and 3.
  - `[low]` `[reject]` Blind: doctor native row gives the rebuild action when the package is missing — carried from the pass 3 missing-SQLite row; the dependency row beside it already names setup, so the misdirection is cosmetic and a fix adds a branch.
  - `[low]` `[reject]` Blind: doctor has no summary line — six rows plus exit code satisfy the matrix; a summary is new output.
  - `[maybe-false]` `[reject]` Blind: two-second Corepack bound on a cold host — carried from pass 2; a rerun clears it, so at most low.
  - `[false]` `[reject]` Blind: dependency check heavy and heuristic — no harm named; `tsx` is a server `dependencies` entry and is checked, EACCES/invalid-config map to the setup action.
  - `[low]` `[reject]` Blind: `startupFailure` guesses causes and hard-codes the default path — carried from pass 2; mkdir errors always carry a path, the literal is only a fallback and duplicates a pre-existing literal in `server.ts`.
  - `[low]` `[reject]` Blind: structured startup log replaced by plain stderr — carried from pass 2; the specified stderr behavior.
  - `[low]` `[reject]` Blind: launcher stdout line buffer unbounded — carried from pass 3.
  - `[low]` `[reject]` Blind: direct `.ts` import and single catch in `configuredRuntime` — Node 24 strips types unflagged, the spec verified the import, and the catch message names Node 24 plus the config repair.
  - `[low]` `[reject]` Blind: redaction short secrets, fragments, shadowed variable — carried from pass 2 and 3; variable shadowing is cosmetic.
  - `[false]` `[reject]` Blind: failure module location and hand-written `.d.mts` — no divergence shown; the module is the single shared source for server and scripts.
  - `[false]` `[reject]` Blind: two sources of truth for debug — `runtime(signal, debug)` leaving callers like `verify.mjs` unchanged is the specified verifier-preserving behavior.
  - `[false]` `[reject]` Blind: duplicated mixed-language docs — carried from pass 2.
  - `[low]` `[reject]` Blind: slow tests, import-time hook, direct-server strict-local doc claim — test timing carried from pass 2; public commands enforce loopback through the launcher, so the doc claim holds.
  - `[false]` `[reject]` Edge: `localhost` probe binds one address while Fastify binds two — disproved: Fastify's secondary `::1`/`127.0.0.1` bindings ignore errors (`lib/server.js` multipleBindings), so only the first address, which the probe also binds, can fail the server; a Mac run confirmed the probe and the main listener agree.
  - `[maybe-false]` `[defer]` Edge: piped opener stdio may block `close` on Linux — `carried` from the opener deferral; no duplicate item added.
  - `[low]` `[reject]` Edge: launcher SIGKILL leaves server stdout/stderr pipes closed so a log write may crash it — the server exits either way and frees its port; graceful versus abrupt exit has no named harm.
  - `[low]` `[reject]` Edge: early Node 24.0-24.2 prints the type-stripping warning — cosmetic stderr line on a supported range; a fix needs a version branch.
  - `[false]` `[reject]` Edge: `renderFailure` on a non-Error — carried from pass 2; no code throws a non-Error.
  - `[low]` `[patch]` Edge: `packageImports` reads directories named like sources and escapes with EISDIR — verified in `scripts/diagnostics.mjs`; switched to `withFileTypes` with an `isFile()` filter.
  - `[low]` `[reject]` Edge: debug failure repeats streamed server stderr as the cause — duplicate lines only in debug output; a fix adds a branch.
  - `[low]` `[reject]` Edge: native probe masks missing package or close error — same root as the second Blind row; closing an in-memory database does not fail in practice.
  - `[medium]` `[patch]` Gap: pnpm lockfile and store repair texts unasserted — pre-verified; `doctor.test.mjs` asserts the store repair after "Next action:" and `commands.test.mjs` asserts the lockfile repair.
  - `[low]` `[patch]` Gap: server HOST/PORT repair text unasserted — the direct-server `config` variant now asserts the loopback/PORT repair; the module-not-found branch cannot be reached through public commands because start's dependency preflight fires first.
  - `[low]` `[reject]` Gap: dependency check covers only two packages, no `@types` or web devDependency case — the private-package helper symlinks scope directories into the shared store, so a safe case needs new scaffolding, beyond a direct correction for a rarely damaged layout.
  - `[medium]` `[patch]` Gap: URL userinfo and Basic redaction unasserted — pre-verified; `failures.test.mjs` asserts both rewrites.
  - `[maybe-false]` `[defer]` Intent: injected Node and native failures do not settle native hosts — `carried` from the platform-evidence row; existing deferral stands.
  - `[maybe-false]` `[reject]` Intent: doctor under a truly unsupported Node never run — carried from pass 2; every doctor row is caught and Node 22.23.1 setup/start ran for real.
  - `[false]` `[reject]` Intent: doctor and start do not share the pinned-pnpm check — the matrix lists Corepack availability, not the pinned version, and both use the same config, dependency, native and port functions.
  - `[false]` `[reject]` Intent: FAIL on stderr and health on stdout may interleave — carried from pass 2; tests merge both streams and a terminal preserves order.
  - `[medium]` `[patch]` Intent: loopback guard test changed from server-spawned to launcher-rejects — `carried` from pass 2; the pair of tests still covers launcher and IPC guard, no change.
  - `[false]` `[reject]` Intent: no OS-level port-holder lookup, non-Agentic Story Mapper services shown as unknown — carried from pass 2; the matrix accepts a known type or an explicit unknown holder.
  - `[false]` `[reject]` Intent: diff cannot show `sprint-status.yaml` compliance — carried; this session did not touch that file and it is excluded from the diff.
  - `[false]` `[reject]` Intent: English documentation inside German files with version bumps — carried from pass 2; the spec requires the English block.

Four patch rows: one in `scripts/diagnostics.mjs` and three test assertion edits. No high found, so the work has converged.

## Verification

- With `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` first on PATH: `node --test scripts/*.test.mjs` — all new matrix cases and prior launcher/verifier regressions pass.
- `corepack pnpm test` — full workspace regressions pass.
- `node scripts/verify.mjs` — Git/source hygiene, pinned pnpm, typecheck and builds pass.
- Actual doctor command on isolated temp source copy with no deps/build and on fully installed temp source with free/occupied configured port; record filesystem snapshot equality and no persistent database creation. Keep real Project folders untouched.
- Native Windows/Linux acceptance unavailable on this macOS host is an explicit deferred evidence limit, not inferred success or an automatic blocking condition.

### Parent verification evidence

- `node --test scripts/*.test.mjs`: 41 tests passed, none skipped. Every matrix row has actual CLI coverage in `commands.test.mjs` or `doctor.test.mjs`, including debug/no-default-stack, occupied listeners, native load failure, setup phase errors and all six read-only doctor results.
- `corepack pnpm test`: 103 total tests passed (41 scripts, 62 workspace); none failed or skipped on macOS.
- `node scripts/verify.mjs`: Git/source hygiene, pinned pnpm, full typecheck and build passed; existing Vite chunk-size warning remains non-failing.
- Unmocked doctor in isolated source copies: fresh/no-deps/no-build/no-Corepack exits 1 with six results; installed/free port exits 0 with six PASS rows; installed/occupied healthy service exits 1 and reports /health PASS. Before/after hashes and modification times match, no Corepack cache or Project directory is created. Temporary source copies and server are removed.
- Actual default Node 22.23.1 setup/start both exit 1 immediately with required/found versions and Node download URL, with no stack trace.
- `git diff --cached --check` passed; sprint status has no diff. Native Windows/Linux acceptance remains unavailable on this Mac.

### Final repair verification evidence

- `node --test scripts/*.test.mjs`: 52 passed, zero failed/skipped, including every original matrix row and all repair cases. The POSIX permission and unreadable-env tests ran on this Mac.
- `corepack pnpm test`: 114 passed (52 scripts and 62 workspace), including real production/dev server commands; no failing or skipped tests on macOS.
- `node scripts/verify.mjs`: source/Git hygiene, pinned pnpm, full workspace typecheck and builds passed after all repairs. The existing Vite chunk-size warning remains non-failing.
- Final unmocked isolated doctor acceptance: fresh checkout exits 1, installed/free port exits 0, occupied healthy service exits 1 with health PASS, oversized 2 MB service exits 1 with the 16 KiB health rejection. Every run prints six rows; hashes/mtimes match, assigned external Corepack cache stays absent and no Project folder/database is created. Temporary trees and service are removed.
- Source/diff checks confirm native probe construction/close, redacted chunk boundaries, bounded buffers, direct-server error classification, root/server env handoff and unchanged sprint status. OpenWolf anatomy regenerated through its CLI; spec YAML and buglog JSON validated.


### Deterministic verification repair input — 2026-10-03

Resume the existing implementation and preserve the frozen intent. Feedback in `.bmad-loop/runs/20261003-002047-b324/feedback/1-4-understandable-failures-and-a-doctor-command-2.md` reports `corepack pnpm test` failing at `scripts/doctor.test.mjs:319`: successful launch loses the final unterminated server stdout line. Repair the cause and verify the existing output assertion. Sprint status remains exclusively orchestrator-owned, including its existing diff.

### Deterministic repair final verification — 2026-10-03

- `corepack pnpm test` under installed Node 24.17.0: exit 0, 122 tests passed (60 script tests and 62 workspace tests), zero failed or skipped. The root command executes `node --test scripts/*.test.mjs`, covering the focused script gate with the same final source.
- `node scripts/verify.mjs` under the same runtime, run after tests finished: exit 0, Git/source hygiene, pinned pnpm, full typecheck and builds passed. The existing Vite chunk-size warning is non-failing.
- Final unmocked isolated doctor acceptance: fresh/no-dependencies/no-build/no-Corepack exits 1; installed/free port exits 0; occupied healthy service exits 1 with health PASS. Each reports six rows, hashes/mtimes match, external Corepack cache stays absent and no persistent database is created; fixtures and service are removed.
- Actual default Node 22.23.1 setup/start both exit 1 immediately with required/found versions and the download action, without traces or subsequent work.
- All nine matrix rows have passing actual-command coverage: unsupported runtime and missing dependencies in `scripts/commands.test.mjs`; occupied port in both command suites; native failure, setup phase failure, doctor success/multiple failures/occupied services and debug/unknown arguments in `scripts/doctor.test.mjs`. Every covering test ran in the 60-test script gate without skips.
- The original stdout EOF assertion passes after a confirmed fixture write. New regressions cover split UTF-8 bytes in both command streams, full and fragmented multiline redaction, conditional ESM target absence with intact CJS, malformed installed metadata, confirmed normal stderr suppression and complete large direct-server stderr before exit.
- One preliminary parent run collided with a concurrent release build clearing Vite output; rerunning gates serially passed. The final gates above use serial execution. This was verification scheduling, not a production-code defect.
- Starting and final SHA-256 checks establish byte-identical frozen intent and orchestrator sprint file. The existing orchestrator sprint diff is preserved and is not verification evidence. Working and staged diff whitespace checks pass.

## Auto Run Result

Status: done

- Summary: Story 1.4 follow-up review pass over the full diff since `407c4060071b75076980582a5c59e7b034c9297f` with four layers. No high finding; four verified patches applied.
- Files changed in this pass: `scripts/diagnostics.mjs` (source scan lists regular files only), `scripts/doctor.test.mjs` (store and server config repair assertions), `scripts/commands.test.mjs` (lockfile repair assertion), `scripts/failures.test.mjs` (URL userinfo and Basic redaction).
- Review breakdown: 34 findings (medium 3, low 16, false 11, maybe-false 4). Patches: 4 rows (medium 2, low 2) plus one carried medium. Deferred: none new; two carried platform and opener items remain in `deferred`. Rejected rows and reasons are in the pass 4 triage log.
- Follow-up review recommended: false; this follow-up pass patched no high finding.
- Verification: `corepack pnpm test` under Node 24.17.0 exit 0 (61 script and 62 workspace tests, none failed or skipped); `node scripts/verify.mjs` exit 0; `git diff --check` clean for code files.
- Residual risks: native Windows/Linux acceptance and the real Linux opener pipe behavior remain unexecuted. No commit was made because the frozen intent forbids commits and the orchestrator owns them; the working tree still holds the uncommitted reviewed diff. `sprint-status.yaml` was not touched.
