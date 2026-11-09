---
title: '6.10 Performance and accessibility budgets'
type: feature
created: '2026-10-17'
version: 2
status: done
baseline_revision: b1ecc9d910e3cc52a5b2f8285a615bb830408d09
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      Full native desktop accessibility and platform/screen-reader conformance remains unverified (I2/I3).
    evidence: |-
      Bounded Safari keyboard/zoom observations and automated DOM/contrast checks do not establish full rendered contrast, target geometry, scrolled sticky-focus occlusion, complete UJ sequences, forced-colors/reduced-motion preferences or screen-reader speech/interaction. Settle with the complete native desktop rendering/journey matrix, VoiceOver/Safari and NVDA/Firefox acceptance; no full WCAG pass is claimed.
    location: >-
      evidence/story-6-10/native-acceptance.json
    severity: medium (unverified)
---

Reproducing statement: Run bmad-build-auto for Story6.10 with subagents, accepted Epic6 preparation and story-plan6.10. Preserve orchestrator-owned sprint-status.yaml; its rows never prove verification. Date:2026-10-17. Version:1.

<intent-contract>

## Intent

**Problem:** The integrated board lacks the two required Card indexes, reproducible diagnostics across four performance boundaries, and a dedicated nonempty automated accessibility gate. Earlier feature checks do not establish integrated desktop accessibility.

**Approach:** Synchronize the current pre-release SQLite/Drizzle indexes, verify populated/reopened/current-schema Restore integrity, record raw legal1,000-Card diagnostic measurements, and execute integrated axe/behavior/contrast checks with honest separate native evidence.

## Boundaries & Constraints

**Always:** Apply accepted Epic6 decisions7C/8A/9C and story-plan6.10. Full snapshot reads, existing Query/live invalidation, Restore epochs, dirty holds, version checks, history, actor attribution, provenance and ChangeSet-first nonhuman changes remain binding. Use existing schemas/repositories/use cases and Dialog/announcement/focus components. Accessibility scope is desktop widths>=768px, WCAG2.1AA excluding1.4.10 Reflow. Functional/accessibility assertions fail; timing references150/30/100/300ms are diagnostic only. Record every measured sample with fixture, environment, boundary, build and cold/warm context; distinguish jsdom committed DOM from native rendering/paint. Preserve earlier timing gates and raw evidence independently. Native checks and unavailable platform checks must be separately truthful. Use Node24. No commit/push without explicit user request; leave reviewed work staged.

**Never:** Write/stage/revert sprint-status.yaml, deferred-work.md or orchestrator state; infer verification from bookkeeping; mutate user Projects/live GitHub; add ETags/304/cache revisions, server search, latency gates/tolerances/statistical passing rules, migration framework/backward compatibility, new SaaS/telemetry, speculative optimization or unrelated deferred Epic5 work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Current schema | Populated Cards, reopen and current-schema Restore | Named nonunique map/parent indexes agree with declarations; Cards, root versions/history/counters and integrity preserved | Schema-incompatible Restore refused, no conditional skipping of required indexes |
| Diagnostic performance | Legal1000Cards; read, committed mutation, board interaction, search/filter | Every raw sample and150/30/100/300ms reference recorded without timing pass/fail; mutation persists after reopen | Functional mismatch fails; over-reference timing remains recorded |
| Integrated UI | Five core Views, Slices, Graph/table, open Card, dirty-close, Move, Delete confirmation | Nonempty axe/behavior/token checks cover actual controls, names/roles, focus, traversal, equivalent moves, status/live holds | Meaningful accessibility violations fail; no blanket rule exclusions |
| Manual scope | Native keyboard UJ-1/UJ-3, contrast/targets/sticky focus, zoom200%, forced colors/reduced motion, screen readers | Executed observations and unavailable/unexecuted checks recorded individually | Missing native evidence never becomes an automated or full WCAG pass |

</intent-contract>

## Code Map

- `apps/web/src/features/changesets/ChangeSetReview.tsx`, `useChangeSetReview.ts`, `review-focus.test.tsx`, `app/api.ts`: native UJ3 exposed selection-refresh and lifecycle-button focus loss. Same-ID/revision placeholder keeps checklist mounted; synchronous selection/decision guards retain canonical closure and freshness. Focusable aria-disabled decisions preserve Approve focus; closed Apply focuses review heading/status. Delayed consumer tests and existing selection-race/review suites join dedicated accessibility gate.

- `packages/db/src/connection.ts:migrate`, `schema/tables.ts:cards`: add matching cards_story_map_id_idx(story_map_id), cards_parent_id_idx(parent_id). Preserve existing unique map/key index and bootstrap mechanism. `restore-validation.ts:databaseSchemaVersion` already hashes named indexes; no fingerprint algorithm change.
- `packages/db/src/restore-project.test.ts`, `restore-points.test.ts`, new `card-indexes.test.ts`: real populated/reopen/Restore/FK/data/version/history assertions and dropped-index fingerprint rejection; inspect Drizzle getTableConfig too. `source-document-migration.test.ts:25` deliberately creates cards(id) only: extend test fixture with nullable map/parent columns and explicit id insert, never production compatibility. Key-prefix persistence tests protect counters/provenance.
- `apps/server/src/fixtures/changeset-preview.ts`: reuse real SQLite/DatabaseHandle/UoW/Fastify lifecycle patterns, not its1000Activities fixture. New `http/routes/board-diagnostics.test.ts` uses legal1Activity+1Step+998Stories; times actual GET map and versioned PATCH Card, verifies history/version and durable reopen outside timer.
- `apps/web/src/features/story-map/board-filter-selection.test.tsx:293`: actual complete1000Card Discovery diagnostic, not toolbar-only proxy at95. New `board-diagnostics.test.tsx` reuses real state/BoardToolbar/DiscoveryMatrix/CardTiles/DndContext; time actual selection/collapse input through committed board DOM plus search/color input through complete tile/match status. Mode is Vitest source transform/React development/jsdom, nativePaint:false.
- `apps/web/src/features/story-map/components/card-detail-test-fixture.ts`: actual router/QueryClient/Views, strict fetch harness. RootLayout mocked to Outlet means feature tests cannot prove full shell landmarks. Slices needs plan-states response. Populate Release/dependency for Graph/table coverage; audit document.body for portal Dialogs, active alertdialog when lower layer inert.
- New dedicated accessibility suite under `apps/web/src/features/story-map/` uses axe-core and @testing-library/dom role/name/event APIs. `apps/web/package.json` adds actually used dev dependencies and test:a11y without passWithNoTests; wire gate into existing validation/CI path. Lockfile remains synchronized.
- `components/discovery-navigation.test.tsx`, `views/SlicesView.test.tsx`, `components/card-detail.test.ts`, `card-detail-navigation.test.ts`, `apps/web/src/components/Dialog.test.ts`, `app/live/live-updates.test.tsx`: reuse integrated traversal, keyboard/form move, editor-first Escape, focus containment/restoration, status/live holds/Restore checks through dedicated invocation rather than redundant mirror tests.
- `apps/web/src/styles/global.css`: focus-ring-light#2D5F45/dark#FFFFFF, border-input#7A877F; compute actual required text/nontext pairs from stylesheet. No current reduced-motion rule; change actual offending motion only when observed. Token tests do not prove browser contrast/layout. Keep existing large stylesheet scope narrow.
- `README.md`, story evidence directory `evidence/story-6-10/`: state accepted desktop scope, diagnostic commands and current manual checklist results/limits. `scripts/verify.mjs` remains full release gate. Native Safari currently accessible via CUA; no browser automation dependency required.
- Graph MCP tools absent; CLI search confirmed DiscoveryMatrix and databaseSchemaVersion nodes. Source/three independent investigations anchor this map. Previous6.9 continuity preserves epoch admission/inactive-cache eviction and projected readonly editors; do not weaken them.

## Tasks & Acceptance

**Execution:**
- [x] DB bootstrap/declarations/tests above: add exact indexes and verify populated/reopen/current-schema Restore plus mismatch rejection, counters/history/integrity.
- [x] Server/web diagnostic suites above: reproduce pinned legal1000Card hierarchy and record every raw read/mutation/interaction/search/filter sample with environment/build/fixture/boundary/coldwarm metadata and references; functional assertions only.
- [x] Web manifest/lockfile/dedicated accessibility suite and existing behavior suites above: install only used axe/TestingLibrary tooling; nonzero gate over required surfaces and keyboard/move/focus/status/live behavior. Repair actual scoped violations.
- [x] CSS/token suite above: recompute relevant normal text4.5:1 and nontext3:1 contrast pairs; verify actual source tokens, preserve visible focus and address observed violations.
- [x] README/evidence above: document scope and run available native UJ-1/UJ-3 and manual rendering checks; explicitly record unavailable screen-reader/platform checks.
- [x] Run dedicated diagnostics/accessibility, affected DB and complete root regressions, typecheck/build/release verify; preserve earlier gates independently and frozen intent/protected files.

**Acceptance Criteria:**
- Given populated/reopened/current-schema restored databases, when inspected, then required map/parent indexes exist with exact columns and data/root/history/counter/integrity invariants hold.
- Given the pinned1000Card fixture, when diagnostics run, then all four measured boundaries report raw samples/environment/build/coldwarm context against diagnostic references without timing-based failure.
- Given required Views and modal layers, when the dedicated gate runs, then nonzero meaningful axe/name/role/contrast/keyboard move/traversal/focus/status/live-hold assertions pass and real failures fail the command.
- Given integrated accessibility evidence, when reviewed, then native executed and unexecuted checks are distinguished; jsdom never establishes rendering or screen-reader conformance.
- Given existing full snapshot/live and earlier Apply/Restore gates, when regressions run, then established behavior/gates remain without conditional reads or new timing policy.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts:19 findings — high0, medium12, low2, false3, maybe-false2
- findings:
  - `[medium]` `[patch]` B1 — Refresh native disable loses focus during reachable fetch; same native disabled-control behavior observed in lifecycle actions. Stable focusable Refresh retains focus; pending activation is guarded.
  - `[medium]` `[patch]` B2 — Selection fetch error branch replaces operation checklist and removes focused checkbox without error destination. Stable retry receives focus when focused checklist disappears on preview error; delayed failure/retry regression passes.
  - `[medium]` `[patch]` B3 — Live revision mismatch is refused by select guard while checkbox disabled predicate omits revision; exposed state disagrees with operability. Checkbox aria-disabled follows current review availability; selection guard refuses stale activation.
  - `[medium]` `[patch]` B4 — Actual tool-pill CSS pair #6a746d/#f4f6f2 fails4.5:1 and new selected token cases omit it. Corrected actual .tool-pill foreground; source-derived ratio now exceeds4.5:1.
  - `[low]` `[patch]` B5 — GraphView keyboard pan/reveal/table assertions exist but dedicated script omits suite; direct gate path addition. Added existing GraphView keyboard suite to dedicated gate.
  - `[medium]` `[patch]` B6 — Axe surface audits never mount changed ChangeSet review lifecycle/checklist/status controls; direct actual-consumer semantic audit needed. Added actual open/closed ChangeSet consumer axe audits.
  - `[medium]` `[patch]` B7 — Index fixture populated only after updated bootstrap installed indexes, so opening existing populated tables without indexes is not asserted; shared withVG2. Dropped both indexes from populated live database before reopen; verified exact reinstall and preserved data/history/counters/Restore.
  - `[medium]` `[patch]` B8 — Both finally writers produce success-shaped raw JSON even when assertions fail; outcome metadata missing. Both diagnostic finally writers now record explicit completed/success flags.
  - `[low]` `[patch]` B9 — Timestamp/build mode lacks exact source-state provenance, preventing association of repeated captures with dirty measured implementation. Both captures include HEAD and deterministic actual source-byte SHA256 over measured application inputs.
  - `[medium]` `[patch]` B10 — Novel focusable guarded lifecycle controls have only happy-path focus assertions; delayed Reject/refused/unknown Apply coverage will establish behavior. Added delayed Reject, refused Apply and unknown Apply outcome/focus/duplicate suppression coverage.
  - `[medium]` `[patch]` VG1 — Pre-verified consumer gap: shell strips preview and unmounts focused heading after Apply; isolated passing test cannot establish settled focus. Connected shell retains and focuses Activity notice after removing preview; dirty Card resumes and retains its own modal focus.
  - `[medium]` `[patch]` VG2 — Pre-verified populated existing-database installation gap; same root asB7. Shared patch withB7: populated missing-index bootstrap regression.
  - `[medium]` `[patch]` VG3 — Pre-verified identity/revision isolation gap: unconditional placeholder retention would pass current same-context focus/selection tests. Placeholder survives only same identity/review revision; changed identity and invalidated revision regressions verify isolation.
  - `[false]` `[reject]` I1 — Diagnostic boundaries are explicitly Fastify inject/real SQLite and complete React/jsdom commit; accepted plan permits jsdom plus separate manual checks, with no native timing gate.
  - `[maybe-false]` `[defer]` I2 — Full rendered contrast/target/occlusion conformance remains unproved; actual desktop rendering matrix beyond bounded observations would settle medium-if-true risk.
  - `[maybe-false]` `[defer]` I3 — Full UJ/platform/screen-reader conformance is unproved; recorded bounded native flows and explicit unavailable checks are truthful. Full journey, VoiceOver/Safari, NVDA/Firefox and preference matrix would settle medium-if-true risk. Shared manual boundary withI2.
  - `[false]` `[reject]` I4 — Descriptive evidence distinction: delayed hook/component tests plus separate native actual fetch/Approve/Apply observations exist; no contradictory pass claim.
  - `[false]` `[reject]` I5 — Bookkeeping is reporting only; actual commands/outputs, native observations and unchanged protected hashes independently support conclusions.
  - `[medium]` `[patch]` RepairCheck1 — Independent source check: refreshPending is set synchronously but decideAction/mutationFn omit it; render-captured fresh/revision can admit Refresh→decision or live invalidation→decision before render. Same-event regression and current-revision/refresh guard repair required. Same-event Refresh/live invalidation regression reproduced2failures; decision admission and mutation execution now read synchronous Refresh/current live revision.27focused tests pass; independent source recheck resolved finding.

All four lenses were launched before triage; capacity queued intent after edge completed. A fresh verification reviewer was denied by the thread cap, so that lens reused the read-only DB investigator; other three were context-free. Edge reported no findings. An additional independent repair check supplied RepairCheck1 and confirmed its final repair. B7/VG2 share one patch group; I2/I3 share one medium-unverified manual deferral. No intent-gap or bad-spec loopback.

### 2026-10-17 — Review pass (follow-up)
- verdicts: 43 findings — high 0, medium 4, low 22, false 15, maybe-false 2
- findings:
  - `[medium]` `[patch]` Blind1 — Both diagnostics suites ran under default `test` and wrote a timestamped JSON into tracked `evidence/story-6-10/` on every run (16 files exist). Excluded both from default web/server `test`; `test:diagnostics` still runs them.
  - `[low]` `[reject]` Blind2 — `sourceBuildProvenance` duplicated in two test files; evidence-only helper, no caller will diverge; extraction adds a file.
  - `[low]` `[patch]` Blind3 — Web diagnostics resolved evidence dir from `process.cwd()`. Now `import.meta.url`, same as the server suite.
  - `[false]` `[reject]` Blind4 — Intent forbids timing verdicts/statistical rules; raw samples with references are the required output.
  - `[low]` `[reject]` Blind5 — Axe options repeated in three test files; no named divergence, fix adds a shared helper.
  - `[low]` `[reject]` Blind6 — Explicit file list in `test:a11y` is the planned dedicated gate; the zero-test injection still fails the command.
  - `[low]` `[reject]` Blind7 — `test:a11y` in `verify.mjs` is the intent's required validation wiring; quick-check skips only typecheck/build by documented flags.
  - `[low]` `[patch]` Blind8 — `aria-disabled` Refresh and checkboxes had no disabled styling (rule covered only `.changeset-actions button`). Rule is now `.changeset-review [aria-disabled="true"]`. ADR part: not architecture-level, nothing done.
  - `[low]` `[reject]` Blind9 — Focus flags kept on blur with null `relatedTarget` is deliberate (removed focused element); stale flag only moves focus to the Retry/heading destination after an unrelated blur; fix adds branches.
  - `[low]` `[reject]` Blind10 — Manual Close focus drop predates this diff (Close button unchanged); `closedNotice` was already never cleared.
  - `[low]` `[reject]` Blind11 — `decide.mutate` stays exposed for tests only; all UI paths use `decideAction`; no caller diverges.
  - `[low]` `[reject]` Blind12 — String-split CSS parse works for the current flat token rules and is paired with manual observations; wider rendered contrast stays under the I2 deferral.
  - `[false]` `[reject]` Blind13 — Fixture `beforeEach` rebuilds `state.snapshot` (card-detail-test-fixture.ts:87), so pushes do not accumulate.
  - `[false]` `[reject]` Blind14 — Index addition is a local reversible schema detail, not ADR-level; intent forbids backward compatibility/migration.
  - `[low]` `[reject]` Blind15 — Double `server.close()` guarded, hardcoded test strings and a blank line are cosmetic.
  - `[low]` `[reject]` Edge1 — `readFileSync` of a tracked-but-deleted file throws only in a dirty tree with deletions; test-only and loud.
  - `[false]` `[reject]` Edge2 — Test runs under vitest with cwd inside the repo, so `git rev-parse --show-toplevel` resolves.
  - `[low]` `[patch]` Edge3 — Same defect as Blind3, fixed together.
  - `[low]` `[reject]` Edge4 — Null-selector assertion gives a less readable failure but still fails; test-only.
  - `[medium]` `[patch]` Edge5 — Same defect as Blind1, fixed together.
  - `[low]` `[reject]` Edge6 — Same claim as Blind9.
  - `[false]` `[reject]` Edge7 — `closedNotice` is always nonempty (explanation, `missing` or `closed` string); skipping focus when a Card modal is open is intended.
  - `[false]` `[reject]` Edge8 — Preview query has default `staleTime` 0 and a real fetch, so a key change or `refetch` toggles `isFetching`, which clears the latch; same-event regressions in `review-focus.test.tsx` pass.
  - `[false]` `[reject]` Edge9 — A changed id starts a new fetch whose `isFetching` toggle clears `refreshPending`; `decisionPending` settles with its mutation.
  - `[low]` `[patch]` Edge10 — Same defect as Blind8, fixed together.
  - `[low]` `[reject]` Edge11 — Same claim as Blind12.
  - `[low]` `[reject]` Edge12 — Same claim as Blind6.
  - `[low]` `[reject]` Edge13 — Same claim as Blind7.
  - `[false]` `[reject]` Edge14 — Production bootstrap creates `cards` before the indexes; only a hand-built legacy fixture lacks the columns and compatibility is excluded by the intent.
  - `[false]` `[reject]` Edge15 — Pre-index Restore points fail schema validation by design; the intent excludes migration/backward compatibility.
  - `[false]` `[reject]` Edge16 — axe `color-contrast` cannot evaluate in jsdom; it is the only rule off, is documented, and is paired with the token test and native observations.
  - `[maybe-false]` `[defer]` Edge17 — `carried` under I2: hand-listed contrast pairs do not prove all rendered pairs; settled by the native desktop matrix (no new ledger item).
  - `[low]` `[patch]` VG1 — `review-outcomes.test.tsx` lines 42/62/126 asserted `.disabled === false` on a button that now uses `aria-disabled`, so they were vacuous. Now assert `aria-disabled` `"false"`.
  - `[low]` `[patch]` VG2 — Same defect as Blind8, fixed together.
  - `[medium]` `[patch]` VG3 — Same defect as Blind1/Blind3, fixed together.
  - `[maybe-false]` `[defer]` Intent1 — `carried` under I2/I3: jsdom axe is not native rendering or screen-reader conformance; stated in README and native record.
  - `[low]` `[reject]` Intent2 — Same claim as Blind6.
  - `[false]` `[reject]` Intent3 — `carried` I1: web boundary is explicitly jsdom committed DOM with `nativePaint:false`.
  - `[false]` `[reject]` Intent4 — `carried` I1: Fastify inject over real SQLite is the planned server boundary.
  - `[false]` `[reject]` Intent5 — DB-package tests are the planned surface (Code Map); populated/reopen/Restore are exercised there.
  - `[false]` `[reject]` Intent6 — Review-panel edits come from native UJ-3 findings recorded in Code Map and the first triage pass; not a defect.
  - `[medium]` `[patch]` Intent7 — Same defect as Blind1 (timestamped evidence growth per run), fixed together.
  - `[false]` `[reject]` Intent8 — Descriptive; native record separates executed and unavailable checks, no contradictory pass claim.

Patched groups this pass: evidence written on every default run (medium, 4 rows), evidence dir path (low), `aria-disabled` styling (low), vacuous `.disabled` assertions (low). Edited by the parent because the step-03 subagent could not be re-engaged. Re-run: web `test:a11y` 15 files/229 tests, web default `test` 75 files/647 tests (diagnostics excluded), review/contrast suites, web typecheck. No intent-gap or bad-spec loopback.

## Design Notes

Reuse legal1Activity+1Step+998Stories shape with fixed deterministic values; synthetic test fixtures are explicitly required by the accepted story. Cold means first operation on a fresh fixture/process, not OS-cache eviction; warm means subsequent operations. Keep source-transform DOM diagnostics separately labelled from built native acceptance. Current schema fingerprints already include index DDL, so tests rather than a second Restore mechanism establish that boundary. Dedicated axe audits exclude color-contrast only if explicitly unsupported in jsdom and pair that limitation with real token checks/manual observations; never suppress other findings globally.

## Verification

Final parent `corepack pnpm test` passed2427tests/0skips: scripts83, contracts153, importers7, core390, web648, DB446, server686 plus14existing timing-gate tests. Final `node scripts/verify.mjs` passed hygiene,130capability parity,229dedicated accessibility tests/15files, workspace typecheck and production build. Dedicated zero-test injection exited1 as required. Exact final diagnostic captures share actual source fingerprint e5c6d5453a97b40f0daa101143da246fd3df5934a3e44983302fb60269b26f9c across856inputs;27samples have explicit successful functional completion. Timing references remain diagnostic, with no acceptance gates added.

Evidence: `evidence/story-6-10/parent-final-root-test.log`, `parent-final-release-verify.log`, `parent-a11y-zero-tests.log`, `verification-summary.json`, `matrix-audit.json`. Raw earlier captures and failing repair repros are retained as historical evidence.

Earlier native bounded UJ1 creation/sample edit/checklist/export and UJ3 dependency selection/Approve/Apply/live Tree update passed after initial focus repairs. Final review-patch native retest was unavailable: Safari binding/reacquisition returned cgWindowNotFound and no browser surfaces were exposed. Connected final shell Apply/dirty Card focus, preview error/retry, refused/unknown outcomes and same-event guards passed automated DOM regressions; these do not prove final native focus or speech. `native-acceptance.json` preserves that distinction and full manual/platform limits. Both earlier owned tabs and listener were closed; no final listener was started.

Use `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` first on PATH. Save sanitized raw JSON/logs under `evidence/story-6-10/`; run resource-heavy gates serially.

- `corepack pnpm --filter @storymapper/db test`: focused index/Restore coverage and existing invariants.
- Dedicated web test:a11y and server/web diagnostics commands added by implementation: nonzero functional/accessibility checks pass; raw latency has no pass threshold.
- `corepack pnpm test`: complete exact root gate; stage new source fixtures first because setup tests copy tracked inputs.
- `node scripts/verify.mjs`: hygiene/capability parity/typecheck/build pass.
- `git diff b1ecc9d910e3cc52a5b2f8285a615bb830408d09 --check`, staged whitespace/scope and protected file hashes.
- Native Safari on disposable temporary server/data only: exercise actual keyboard journeys and rendered checks where available, record screen-reader/forced-colors/platform limits honestly.

## Changelog

- 2026-10-17 v2: Finalized implementation,19-row review triage/13patch groups, full final gates and explicit native/manual deferral. Frozen intent unchanged.

- 2026-10-17 v1: Planned from accepted6.10 detail plan/epic contracts,6.9 continuity and three independent source investigations.

- 2026-10-17 v3: Follow-up review pass: 43 rows, 4 patch groups (default-run evidence writes, web evidence path, `aria-disabled` styling, vacuous assertions); no loopback. Frozen intent unchanged.

## Auto Run Result

Status: done

**Implemented change:** Card map/parent indexes with populated/reopen/Restore coverage; server and web 1,000-Card diagnostics recording raw samples without timing gates; dedicated 15-file `test:a11y` gate (axe, keyboard/move/focus/status/live holds, CSS token contrast) wired into `scripts/verify.mjs`; ChangeSet review focus/admission repairs; native Safari record with explicit unavailable checks.

**Files changed:** see `## Code Map`; this follow-up pass edited `apps/web/package.json` and `apps/server/package.json` (diagnostics excluded from default `test`), `apps/web/src/features/story-map/board-diagnostics.test.tsx` (evidence path via `import.meta.url`), `apps/web/src/features/changesets/review-outcomes.test.tsx` (`aria-disabled` assertions), `apps/web/src/styles/global.css` (`.changeset-review [aria-disabled="true"]` disabled styling).

**Review findings (follow-up pass):** 43 rows. Patched: 4 groups (medium x4 rows sharing one root, low x6 rows). Deferred: none new; Edge17 and Intent1 carried under the existing I2/I3 deferral. Rejected: all others with the reasons in the triage log (false 15, low 22 minus patched).

**Follow-up review recommended:** false. This was a follow-up pass and patched no `high`.

**Verification:** Node 24.17.0. `test:a11y` 15 files/229 tests pass; web default `test` 75 files/647 tests pass (diagnostics excluded); changesets + contrast suites 65 tests pass; web typecheck clean. Server `test` script change and full root `pnpm test`/`verify.mjs` not re-run after the package.json edits; the earlier final root gate (2427 tests) predates this pass.

**Residual risks:** I2/I3 native desktop and screen-reader conformance unverified (existing deferral). Default `test` no longer runs the diagnostics functional assertions; they run through `test:diagnostics`. Work is left staged and uncommitted per the frozen intent and user rules; `sprint-status.yaml` and `deferred-work.md` remain orchestrator-owned and untouched.
