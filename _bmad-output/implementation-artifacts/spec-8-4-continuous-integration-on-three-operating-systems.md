---
title: '8.4 Continuous integration on three operating systems'
type: chore
created: '2026-10-20'
status: done
followup_pass: true
baseline_revision: c5b76dfecb22d62c6d0abdea39c37200df2f8d2e
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-8-4-continuous-integration-on-three-operating-systems.md'
warnings: [oversized]
deferred:
  - summary: >-
      Hosted OS execution and platform quickstart acceptance remain unverified.
    evidence: |-
      Workflow syntax and macOS arm64 local commands pass. No authorized remote PR run was created; actual Windows/macOS/Linux hosted provisioning, native SQLite and full shared gates require run URLs/results. Native Windows/Linux quickstart and browser/reader evidence remain separate prior prerequisites.
    location: >-
      .github/workflows/ci.yml:10
    severity: medium (unverified)
  - summary: >-
      Repository merge-protection activation remains an operational prerequisite.
    evidence: |-
      The runbook documents exact required names and active ruleset/branch configuration. No repository settings were changed or certified. Authorized maintainer settings evidence and a failing or missing quality check preventing merge would settle enforcement.
    location: >-
      docs/RUNBOOK.md:211
    severity: medium (unverified)
  - summary: >-
      Global `npm install --global corepack@0.35.0` over the runner's bundled Corepack is unproven on hosted Linux/macOS.
    evidence: |-
      Edge review asserts an EEXIST bin-link collision could fail every quality and audit job at setup. The bin link targets the same package directory and local installation succeeds, so the claim is not established; no hosted run exists to confirm either way. A hosted run's Provision Corepack step result would settle it.
    location: >-
      .github/workflows/ci.yml:33
    severity: medium (unverified)
---

# Story 8.4

Date: 2026-10-20. Version: 2.
Reproducing statement: Execute bmad-build-auto for story 8.4 using the prepared CI contract; never write, stage, unstage or revert orchestrator-owned sprint-status.yaml, or infer verification from its bookkeeping.

<intent-contract>

## Intent

**Problem:** Pull requests have no automated verdict across the three supported operating systems.

**Approach:** Add read-only GitHub Actions quality checks on Windows, macOS and Linux using Node 24, frozen installation and the shared `corepack pnpm check`. Report dependency audit outcomes independently and document exact required-check configuration.

## Boundaries & Constraints

**Always:** Root engines/packageManager remain authoritative. Provision Corepack explicitly; honor pinned pnpm 9.15.4. Each OS installs its own native SQLite dependencies. Use verified full Action commit SHAs, ordinary pull_request and read-only contents permission. Installation/quality failures fail their OS job. Audit advisories and unavailable/invalid scanner results are visible, informational PR outcomes; reports contain only validated safe summaries. Keep required external setup and unexecuted platform evidence explicit.

**Never:** Write/stage/unstage/revert sprint-status.yaml or other orchestrator ledgers. Use privileged PR events, provider credentials, messages, repo-local Node or shared native node_modules. Weaken existing checks/deadlines/floors/assertions. Create commits, push/PR/tag/publish, alter repository settings or claim remote platform acceptance without evidence. Implement Story 8.8 release publication/audit enforcement here.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Audit clean | Valid completed audit, no advisories | Safe clean status and severity counts | Informational success |
| Audit advisories | Valid completed audit with high/critical counts and nonzero scanner exit | Visible advisory status and counts | Informational success, quality unaffected |
| Audit unavailable | Spawn/transport/registry failure or error JSON | Visible scanner-unavailable status, never clean | Informational success, quality unaffected |
| Audit invalid | Malformed/missing/inconsistent count evidence | Visible invalid/unavailable status, never clean | Informational success, quality unaffected |
| Audit sensitive output | Scanner stdout/stderr contains untrusted content | Console and job summary contain only safe static text/counts | Never echo raw scanner content |

</intent-contract>

## Code Map

- Baseline HEAD `c5b76dfecb22d62c6d0abdea39c37200df2f8d2e`; clean entry tree; main is the established in-place orchestrator branch. Graph tools unavailable. Protected worktree/index hashes captured independently in `/tmp/story-8-4-protected-before.json`.
- `.github/workflows/ci.yml` is new; no existing workflow. Use stable names `Quality (ubuntu-latest)`, `Quality (macos-latest)`, `Quality (windows-latest)` and `Dependency audit (informational)`. Run all matrix entries even if another fails. No cache is needed; if adding one, cache downloads only by OS/architecture/lockfile.
- `package.json:7,10,23`, `pnpm-lock.yaml`: Node >=24 <25, Corepack pnpm9.15.4, existing aggregate; no dependency or runtime policy change needed.
- `scripts/check.mjs:9`: offline aggregate runs architecture/size/hygiene/licenses/capabilities/build/root script tests/all8workspace coverage/serial audit-performance and `verifyChecks` with typecheck/a11y. Reuse unchanged; ordinary root tests are sequential since Story8.3 repair.
- `scripts/runtime.mjs:corepackEntry,runtime`: selected installed Node invokes real Corepack entry and checks exact root pin, including Windows global installation layout. `scripts/processes.mjs:run` forwards stderr even in capture mode without diagnostics, so an audit reporter must suppress untrusted stdout AND stderr rather than accidentally forward it. Do not change shared process behavior for this local requirement.
- New `scripts/ci-audit.mjs` and focused `scripts/ci-audit.test.mjs`: minimal safe CLI report with meaningful tests, included automatically in existing root test glob and source gates. Use actual pnpm audit JSON structure verified from the pinned CLI. Scanner failure must remain visible without pretending advisory counts are known.
- `docs/RUNBOOK.md:1,200`: existing operational document, version0.2.9, Changelog. Add English CI section with stable required names and branch/ruleset steps; no CONTRIBUTING file yet. Keep broad English rewrite for8.6.
- `scripts/fixtures/checkout.mjs:copyCheckout` uses git-tracked app/package/root files and copies scripts; gate fixtures inspect tracked inputs. Stage only owned new files before tests if required.
- Action pins verified via official GitHub commit API on2026-10-20: checkout v6.0.2 `de0fac2e4500dabe0009e67214ff5f5447ce83dd`; setup-node v6.3.0 `53b83947a5a98c8d113130e565377fae1a50d02f`. Sources: https://github.com/actions/checkout and https://github.com/actions/setup-node . Corepack installation guidance: https://github.com/nodejs/corepack . Verify any further third-party pin before use.
- Read-only: application behavior, migrations, dependency versions/lockfile, existing checks, sprint/deferred ledgers. Prior native/reader/live-account and publication gaps remain open.

## Tasks & Acceptance

**Execution:**

- [x] `.github/workflows/ci.yml` — add Node24 OS matrix, explicit Corepack provisioning and exact pnpm verification, frozen installation, native SQLite construction smoke and shared aggregate. Disable persisted checkout credentials and automatic cache; choose portable shell commands. Keep failures blocking.
- [x] `scripts/ci-audit.mjs`, `.github/workflows/ci.yml` — independent informational audit job, explicit scanner outcome, safe console/job summary, no raw artifact upload; keep installation errors visible. Suppress only intended audit-result failure, not blocking quality or future release gates.
- [x] `scripts/ci-audit.test.mjs` — run every matrix scenario using deterministic transport/process fixtures, including stdout/stderr safety and CLI status; preserve failing evidence.
- [x] `docs/RUNBOOK.md` — document required job names, ruleset/branch configuration with up-to-date checks, informational exclusion and pending operational activation. Update date/version/changelog.
- [x] Story evidence — validate workflow syntax with actionlint, inspect permission/event/exit/native/pin contracts, run frozen install, full local aggregate and release verifier. Retain exact outputs, revision and limits; do not manufacture remote runs.

**Acceptance Criteria:**

- Given a PR, when the configured workflow runs, then all three OS jobs select installed Node24, root-pinned Corepack pnpm, fresh OS-specific native dependencies and every shared local quality rule.
- Given installation or quality failure, when an OS job finishes, then it fails without continue-on-error; documented required-check settings block merging when activated by a maintainer.
- Given any audit result, when its independent job reports, then the safe outcome remains visible without weakening the three quality jobs.
- Given workflow review and local verification, when reporting completion, then permissions/pins/commands are validated and remote jobs/ruleset activation and platform quickstart evidence are distinguished from local proof.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass

- verdicts: 13 findings — high 0, medium 3, low 2, false 3, maybe-false 5.
- Four context-free lenses completed; the edge-case lens returned no finding. A fourth simultaneous launch exceeded the platform's three-child concurrency limit; it launched after a slot freed, before triage. No layer skipped.
- findings:
  - `[medium]` `[patch]` Verification-gap: CLI expected text reused the production renderer, so a constant Clean regression could pass — replaced it with independent literal status/count/unavailable text and exact stdout/summary assertions; 38 focused tests pass.
  - `[medium]` `[patch]` Blind B1: shallow quality checkout hides the existing .env history gate — source verifier line15 and an empty-file two-commit fixture reproduce full-history true/depth-one false; quality checkout now fetches full history. No credentials used.
  - `[low]` `[patch]` Blind B2: mutable Corepack changes the otherwise pinned toolchain — both installs now specify 0.35.0, matching all local gates; official npm metadata supports Node24.15+ and current Node24.17.0.
  - `[maybe-false]` `[reject]` Blind B3: no explicit shorter job timeout leaves installation/native/aggregate stalls running too long — GitHub supplies a documented360minute default, while audit has a60second process bound. No problematic hosted stall or required shorter bound was established; harm would be low and an extra deadline is unnecessary policy without timing evidence. Source: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes .
  - `[maybe-false]` `[reject]` Blind B4: obsolete PR runs delay the current revision — actual runner saturation/queue delay was not established. Harm would be low; a PR cancellation policy would add scheduling behavior without demonstrated need, so no new concurrency policy.
  - `[false]` `[reject]` Blind B5: missing-Corepack matching is currently broken — current focused missing-Corepack test passes against the actual decorated error prefix. The earlier mismatch is repaired and retained; changing shared error APIs would address hypothetical future wording rather than a remaining defect.
  - `[low]` `[reject]` Blind B6: no real60second timeout/8MB overflow fixture — the standard spawnSync resource limits are explicit, timeout/error classification and actual spawn failure are covered. Extra pathological subprocess scenarios would add test branches/time without an everyday demonstrated defect; no weaker bound or silent-success path was found.
  - `[medium]` `[patch]` Blind B7: original log hashes cannot authenticate retained sanitized gzip bytes — each implementation check now references its actual retained gzip and distinguishes original, decoded sanitized and compressed SHA256s. All eight chains validate; historical source hashes are explicitly labeled.
  - `[maybe-false]` `[defer]` Intent I1: configuration does not prove hosted three-OS execution — no remote execution claimed; collect actual hosted provisioning/native/gate results to settle compatibility. Grouped with I4 as unverified medium platform evidence.
  - `[maybe-false]` `[defer]` Intent I2: instructions do not prove merge enforcement — no settings operation authorized or performed; active ruleset and failing/missing-check merge refusal require maintainer evidence. Unverified medium operational prerequisite.
  - `[false]` `[reject]` Intent I3: reporter tests do not prove GitHub dispatch/protection — they substantiate only their named reporter contract; workflow source and runbook separately name hosted/protection limits. No reporter claim equates these surfaces.
  - `[maybe-false]` `[defer]` Intent I4: macOS aggregate does not prove Windows/Linux parity — true evidence limit, with no specific cross-OS failure observed. Grouped with I1; actual native hosted runs would settle it, rather than weakening checks or inventing results.
  - `[false]` `[reject]` Intent I5: diff alone cannot prove temporary sprint writes — independent entry and current worktree/index hashes match, no sprint mutation command was issued, and acceptance is grounded in actual gates rather than status rows.

Four patch entries: medium3/low1; no high. Two deferred groups cover three review rows; six rows rejected individually above. Follow-up review recommended for full-history checkout and pinned Corepack provisioning/native setup on actual hosted OS runners; no second fresh-context review of these repairs has run.

### 2026-10-20 — Review pass (follow-up)

- verdicts: 31 findings — high 0, medium 0, low 11, false 11, maybe-false 9.
- Four layers ran (blind 19, edge 6, verification-gap 0, intent-alignment descriptive divergences 6). No layer skipped. Diff covered workflow, runbook and scripts (17 KB); orchestrator ledgers and evidence archives were excluded from the diff.
- findings:
  - `[maybe-false]` `[reject]` carried B4 Blind: no concurrency cancellation — carried B4; runner saturation unestablished, low if true.
  - `[maybe-false]` `[reject]` carried B3 Blind: no job `timeout-minutes` — carried B3; documented 360-minute default, no demonstrated stall.
  - `[false]` `[reject]` Blind: no `push` trigger leaves no post-merge baseline — required checks gate the PR head; intent mandates ordinary `pull_request`.
  - `[false]` `[reject]` Blind: audit step lacks `continue-on-error` — audit outcomes exit 0 by design (`ci-audit.mjs:160`); setup failures failing visibly is documented (`docs/RUNBOOK.md:216`).
  - `[low]` `[reject]` Blind: duplicated setup steps and pins without version comments — two small duplicated blocks; composite action or comments add structure for no demonstrated drift, pins are recorded in evidence.
  - `[false]` `[reject]` Blind: `fetch-depth: 0` only on quality — deliberate (history-based hygiene gate, B1 repair); audit job runs no git history check.
  - `[low]` `[reject]` Blind: audit scope and package details absent from report — counts-only output is the intent's safety requirement; no defect.
  - `[false]` `[reject]` Blind: exit 1 with zero counts labeled invalid — matrix row "inconsistent count evidence" requires a visible non-clean invalid status.
  - `[false]` `[reject]` Blind: string-coupled Corepack error text — `ci-audit.test.mjs:69` runs the real `PATH: ''` case, so wording drift fails loudly in the aggregate.
  - `[low]` `[reject]` Blind: missing ENOBUFS/ETIMEDOUT/null-stdout/array tests — code read confirms each path ends in a non-clean status (`ci-audit.mjs:8-18`); carried B6 covers pathological subprocess scenarios.
  - `[low]` `[reject]` Blind: fixture exit code NaN when env unset — test-only helper, every caller sets it; fix adds a guard for an unreached state.
  - `[low]` `[reject]` Blind: Windows fixture coupled to `corepackEntry` layout — intentional to exercise the real resolver; the Windows quality job runs it.
  - `[false]` `[reject]` Blind: English section in German runbook — the spec directs an English CI section; broad rewrite belongs to 8.6.
  - `[low]` `[reject]` Blind: no CI troubleshooting entry — nice-to-have documentation not requested.
  - `[maybe-false]` `[defer]` carried I2 Blind: no tracked artifact ensures required-check activation — carried I2; covered by the existing second deferred item.
  - `[false]` `[reject]` Blind: summary not retained as artifact — intent forbids raw artifact upload; job summary is the specified surface.
  - `[false]` `[reject]` Blind: new tests may not run in CI — root `test` glob `node --test scripts/*.test.mjs` (`package.json:16`) includes them via `pnpm check`.
  - `[low]` `[reject]` Blind: floating `*-latest` runner labels — labels are the required-check names; pinning images is policy beyond the intent.
  - `[low]` `[reject]` Blind: `node-version: '24'` floats within 24.x — matches `engines >=24 <25`; exact pin would add upkeep without a demonstrated failure.
  - `[maybe-false]` `[defer]` Edge: Corepack global install EEXIST on Linux/macOS (quality job) — hosted run's provisioning step would settle it; recorded as a new unverified medium deferral.
  - `[maybe-false]` `[defer]` Edge: same EEXIST path in audit job — same root cause and deferral as the previous row.
  - `[low]` `[reject]` Edge: info-only advisories exit 0 and are labeled invalid — info severity is not emitted in practice; result is still visible and non-clean, fix adds threshold logic.
  - `[maybe-false]` `[reject]` Edge: spawnSync can block when a grandchild holds the pipe — no demonstrated occurrence; harm bounded by the job default and low if true.
  - `[false]` `[reject]` Edge: main-module guard false on Windows path forms — audit runs on ubuntu only and Node's loader derives `import.meta.url` through the same `realpathSync`.
  - `[low]` `[reject]` Edge: empty-stdout exit 1 labeled invalid not unavailable — both statuses are visible and never clean; real registry failures emit error JSON and map to unavailable (`ci-audit.test.mjs:16`).
  - `[maybe-false]` `[reject]` Intent: workflow YAML has no automated assertions — verified by actionlint and inspection; no defect shown, a YAML test is new surface; low if true.
  - `[false]` `[reject]` Intent: audit runs on ubuntu only — intent requires an independent informational audit, native SQLite applies to quality jobs.
  - `[false]` `[reject]` Intent: unknown errors rethrown fail the audit step — fail-fast is the intended behavior for unexpected errors; matrix scenarios return exit 0.
  - `[low]` `[reject]` Intent: transport failure labeled invalid versus matrix wording — duplicate of the Edge empty-stdout row; label only.
  - `[maybe-false]` `[defer]` carried I1/I4 Intent: hosted three-OS execution unproven — carried; covered by the first existing deferred item.
  - `[maybe-false]` `[defer]` carried I2 Intent: merge enforcement unproven — carried; covered by the second existing deferred item.

No patch entries; one new deferred item. Verification not re-run: no code changed.

## Verification

Under installed Node24.17.0 (`[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` ahead of PATH):

- `corepack pnpm install --frozen-lockfile` — successful matching dependency installation.
- `node --test scripts/ci-audit.test.mjs` — all matrix behaviors pass including CLI output/exit.
- `actionlint .github/workflows/ci.yml` — valid Actions syntax; install validator outside repository if absent and record version/source.
- `corepack pnpm check` — full deterministic gates including new tests and all workspace coverage pass.
- `node scripts/verify.mjs` — independent existing release checks pass.
- `git diff --check HEAD` — whitespace clean; compare protected working/index hashes independently without restoring external changes.

## Changelog

- 2026-10-20 v2: Record complete review triage, four repairs and independent final gates; retain operational limits.
- 2026-10-20 v1: Resolve prepared story into implementation scope, safe audit matrix and verification boundaries.


## Auto Run Result

Status: done

- Summary: Follow-up review of the pull-request CI workflow, the safe audit reporter and the runbook section. No code changed in this pass.
- Files changed (earlier passes): `.github/workflows/ci.yml` (three-OS quality matrix and independent audit job), `scripts/ci-audit.mjs` (safe audit reporter), `scripts/ci-audit.test.mjs` and `scripts/fixtures/ci-audit-scanner.mjs` (matrix tests and scanner fixture), `docs/RUNBOOK.md` (required-check names and activation steps).
- Review breakdown: patches applied 0; deferred 1 new (Corepack global install over bundled shim, unverified medium) plus carried hosted-execution and merge-protection items; rejected 25 findings with reasons in the triage log; 6 rows carried or grouped under deferrals.
- Follow-up review recommended: false. This pass patched no high finding.
- Verification: no commands re-run because no code changed; prior-pass gates are listed under Verification. Findings were checked against `ci.yml`, `ci-audit.mjs`, the audit tests, `package.json` and the runbook by reading.
- Residual risks: hosted Windows/macOS/Linux execution, Corepack provisioning on hosted runners and maintainer ruleset activation remain unverified.
- Not done: no commit was made. The intent contract forbids creating commits, and the tree also holds orchestrator-owned `sprint-status.yaml`, `deferred-work.md` and `.wolf` changes that this run must not touch, so it cannot be left clean.
