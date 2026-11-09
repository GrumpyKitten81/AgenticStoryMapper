---
title: 'Story 8.2: Dependency upgrade wave'
type: chore
created: '2026-10-20'
date: '2026-10-20'
version: 3
status: done
baseline_revision: 06a38494b979120e33240059a4e2f12a0dfb09da
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-8-2-dependency-upgrade-wave.md'
warnings: [oversized]
deferred:
  - summary: >-
      The proxy-smoke optimizer waits have no overall deadline; an actual stalled optimizer remains unverified.
    evidence: |-
      E1/B5: request fetches are timed out, but request-idle, scanProcessing and dependency-processing waits are not. All recorded Vite runs completed. Reproduce a reachable optimizer stall and observe exit/cleanup to establish the alleged hang.
    location: >-
      _bmad-output/implementation-artifacts/evidence/story-8-2/proxy-smoke.mts:43
    severity: >-
      medium (unverified)
  - summary: >-
      DescriptionEditor editable-state changes emit the existing update callback.
    evidence: |-
      B1: both Tiptap2.27.2 and3.32.0 setEditable default emitUpdate=true; the application already called it before this upgrade. Card Detail value-based dirty detection and title-only Markdown preservation pass. Follow up separately on non-user callback semantics.
    location: >-
      apps/web/src/features/story-map/components/DescriptionEditor.tsx:26
    severity: >-
      low
  - summary: >-
      Native browser clipboard HTML/plain-text extraction and OS paste remain unverified.
    evidence: |-
      B2/I2: actual ProseMirror paste parsing, transactions and exact Markdown serialization pass in JSDOM, but a native clipboard/DOM paste dispatch was not executed. Run an isolated real browser paste to settle possible incompatibility.
    location: >-
      apps/web/src/features/story-map/components/DescriptionEditor.test.tsx:63
    severity: >-
      medium (unverified)
  - summary: >-
      A broader existing-Markdown compatibility corpus remains unverified.
    evidence: |-
      B3: no mismatch was shown for ordered/nested lists, blockquotes, code, strike or hard breaks. Current focused tests exercise toolbar formats, prop sync, paste, unchanged descriptions and exact save/reload. Compare those additional supported formats between actual v2/v3 runtimes to settle possible serialization risk.
    location: >-
      apps/web/src/features/story-map/components/DescriptionEditor.test.tsx
    severity: >-
      medium (unverified)
  - summary: >-
      Native execution and rendered boot of the final compiled browser bundle remain unverified.
    evidence: |-
      B4: actual proxy transformation, production static/deep-route bytes and mounted React suites pass, but the smoke does not execute the compiled application in a native browser. Run a disposable built-app browser boot/render check to settle possible runtime-import or boot risk.
    location: >-
      _bmad-output/implementation-artifacts/evidence/story-8-2/proxy-smoke.mts:41
    severity: >-
      medium (unverified)
  - summary: >-
      Native Windows/Linux and actual screen-reader acceptance remain open operational prerequisites.
    evidence: |-
      I3: this run executes on macOS Node24 only. Existing platform/reader acceptance from prior epics remains open; automated launcher/a11y checks do not certify those surfaces. Owners are the platform and accessibility acceptance maintainers.
    location: >-
      _bmad-output/implementation-artifacts/evidence/story-8-2/acceptance-limits.json
    severity: >-
      medium
---

# Story 8.2: Dependency upgrade wave

Reproducing statement: Execute audited dependency upgrades for Story 8.2 using bmad-build-auto, preserving orchestrator-owned sprint-status.yaml and recording green checks between consecutive major upgrades.

<intent-contract>

## Intent

**Problem:** The frozen graph has known serious advisories in test tooling and runtime dependencies. A fresh audit reports 50 advisories (5 critical, 24 high, 19 moderate, 2 low); the historical count is not current evidence.

**Approach:** Upgrade coherent dependency families one major at a time, verifying each before starting the next. Repair remaining advisory paths with supported upstream updates and record final installed versions and reproducible evidence.

## Boundaries & Constraints

**Always:** Keep Node 24 (installed 24.17.0) and Corepack pnpm 9.15.4. Install and run native SQLite with that same Node. Preserve Markdown storage/serialization, dirty drafts, save batching, toolbar accessibility, Restore/epoch lifecycle, navigation protection, static serving, loopback/proxy behavior, transport/provider contracts and serial audit-performance checks. Preserve Story 8.1 migration SQL/metadata and schema identity. Reassess the TanStack history patch against actual source and behavioral tests. Keep full scanner failures visible. Record intermediate checks and exact resolved versions, not just final success. Normal orchestrator finalization owns the single story commit.

**Never:** Write, stage, unstage or revert sprint-status.yaml (even if it changes externally); its rows are not verification evidence. Do not alter orchestrator/deferred ledgers, dispatch another story, create commits, push/tag/publish, read local user Projects/credentials, add SaaS/telemetry, blanket-ignore advisories, force unreviewed resolutions, add unused dependencies/LLM SDKs, repeat Zod/MCP or DB schema migrations, or weaken existing assertions/budgets to obtain green results.

</intent-contract>

## Code Map

- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` — pinned runtime/package manager, no overrides; only customization is history patch. All eight workspace manifests declare Vitest ^2.1.8, locked 2.1.9.
- `apps/{server,web}/package.json`, `packages/{contracts,core,db,github,importers,mcp}/package.json` — coherent Vitest changes. No coverage plugin is installed: do not add unused coverage tooling; future coverage gate is Story 8.3.
- `apps/server/vitest.config.ts`, `packages/{contracts,core,db,github}/vitest.config.ts` — alias-only test configs. Web tests share `apps/web/vite.config.ts`.
- `apps/server/package.json` test ordering — web build, ordinary tests with exclusions, then four serial audit-performance suites. Web excludes board diagnostics; a11y/audit/diagnostics use maxWorkers=1/minWorkers=1; preserve serialization under new CLI.
- `apps/web/vite.config.ts` — React plugin, workspace aliases, port 5173, API/health proxy to 127.0.0.1:4317; scripts bind 127.0.0.1. Baseline Vite 6.4.3/plugin-react 4.7.0; Vitest also carries Vite 5.4.21.
- `apps/web/src/features/story-map/components/DescriptionEditor.tsx` — only production editor: StarterKit + tiptap-markdown html:false, storage.markdown.getMarkdown(), legacy setContent(value,false), focused-editor prop guard. Use v3 options signature with emitUpdate:false and preserve reactive toolbar state; disable newly introduced StarterKit semantics if needed to preserve existing Markdown behavior.
- `apps/web/src/features/story-map/components/CardDetailModal.tsx:63,129,325,363` — draft/baseline/version, save response merge, dirty snapshot protection, changed-field save/epoch guards; read-only unless a proven migration requires a focused correction.
- `apps/web/src/features/story-map/components/card-detail.test.ts:64,89,653` — actual rich edit/save/reload and pending-save draft tests; exact heading/bold/italic and bullet Markdown expectations must survive unchanged.
- `apps/web/src/features/story-map/components/card-detail-navigation.test.ts:26,399,434` — real browser history Back/Forward and go(-2)/(2), beforeunload, dirty blocking, toolbar pressed state/accessibility. `card-dependencies.test.tsx:218`, `features/changesets/shell.test.tsx:91`, `app/live/live-updates.test.tsx:104` cover Restore and batched refresh.
- `apps/server/src/http/routes/card-markdown.test.ts:16` — real DB/snapshot/dry-run/remote-plan Markdown preservation; `apps/server/src/server.test.ts`, `main.test.ts`, `http/web-app.ts` — emitted assets/deep routes/origin/host/security/static-build guards.
- `scripts/{commands,doctor}.test.mjs` — real frozen setup/repeat/mismatch, native binding, production launcher/API/deep route/loopback failure behavior. Fixture copies use git ls-files: stage new required code assets before these tests, excluding protected paths.
- `patches/@tanstack__history@1.162.0.patch` — fixes beforeunload suppression and exact history traversal deltas; retain unless upstream equivalence is demonstrated by source plus regression checks. Current Router update is not inherently required; advisory seroval may resolve within current constraints.
- `_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md:205` — existing Stack table; update exact installed versions only plus required metadata/changelog.
- Read-only `packages/db/migrations/**`, root Node/pnpm policy and protected sprint-status; migration assets must remain byte-identical. Starting revision is 06a38494b979120e33240059a4e2f12a0dfb09da. Starting sprint SHA256 is 7a47d43afb8f4ba1ce069a28b7d4da66e6f7ab08ef374fa52b9a2bd0b6fa418c; capture index too, report external changes without reverting.

## Tasks & Acceptance

**Execution:**

- [x] `pnpm-lock.yaml`, story evidence directory `evidence/story-8-2/` — capture sanitized machine-readable initial audit with package/version/path/severity/fix range and production/dev classification; preserve scanner exit status. Initial raw audit is available at `/tmp/story-8-2-audit-before.json`, registry metadata at `/tmp/story-8-2-registry.json`; recheck under Node24. Primary docs and current registry determine supported exact versions.
- [x] All eight Vitest manifests, affected configs/tests — upgrade 2→3 (current 3.2.7), run full workspace tests, typecheck/build; only after green advance to 4 (current 4.1.12) and repeat. Stop at an advisory-free supported line; use 5 only if a concrete unresolved advisory/compatibility requires it. Do not force transitive incompatible versions. Document any required coherent Vite tool dependency movement. Preserve failures and fixes as evidence.
- [x] `apps/web/package.json`, `vite.config.ts`, necessary peers — upgrade direct Vite 6→7 (current 7.3.7), verify before 7→8 (current 8.3.4). Select compatible React plugin (5.2.0 supports Vite8; 6.1.2 uses Oxc). Full relevant tests/typecheck/build and actual bounded loopback Vite API/health proxy smoke must pass before next major; preserve emitted assets/deep-route and production launcher behavior. Avoid unintended multi-major upgrades of companion tooling.
- [x] `apps/web/package.json`, `DescriptionEditor.tsx`, focused actual-editor regression tests — upgrade coherent Tiptap family 2→3 (current 3.32.0) with compatible `tiptap-markdown` 0.9.0 (peer core ^3.0.1). Keep existing Markdown adapter and representation; prove initial content, non-emitting prop sync, rich content/paste, exact serialization, toolbar selection, unchanged descriptions, edit/save/reload, pending save and mounted dirty/Restore. Add focused behavioral coverage only where actual gaps exist. Run full relevant checks before next dependency major.
- [x] Runtime manifests/lockfile remaining paths — minimally update actual affected parents/transitives. Initial additional affected packages: Fastify 5.10.0, static 8.3.0, fast-uri 3.1.3, find-my-way 9.6.0, busboy 3.2.0, postcss 8.5.16, browserslist 4.28.4, nanoid 3.3.15, seroval 1.5.4, source-map-js 1.2.1, prosemirror-view 1.42.0, shell-quote 1.9.0, dompurify 3.4.11 and markdown-it 14.3.0. Test consecutive necessary parent majors independently (e.g. static 8→9→10). Retain Drizzle and other already completed families unless actual advisory requires a change. No established unused runtime dependency was found.
- [x] Architecture Stack and story evidence/spec — record final exact versions, primary migration/registry sources, every intermediate command/result, patch disposition, remaining advisory owners and any unexecuted platform acceptance. Keep non-sensitive raw failure evidence losslessly, e.g. gzip.
- [x] Final release checks — fresh frozen install under Node24, full test/typecheck/build/verify and high-level audit, native SQLite open/reopen, final history navigation/Markdown regressions, protected-path/migration byte checks. Leave one reviewable story diff for independent review and orchestrator finalization.

**Acceptance Criteria:**

- Given the final frozen dependency graph, when `corepack pnpm audit --audit-level high` completes, then critical/high counts are zero and scanner failures remain failures; unresolved lesser advisories list package/version/path, reason and role owner.
- Given consecutive major upgrades, when evidence is inspected, then each preceding major has successful tests/typecheck/build recorded before the next begins and no intermediate commits were created.
- Given existing editing, board, transport and lifecycle behavior, when the upgraded product and full regressions run, then exact Markdown edit/save/reload, dirty/Restore, toolbar accessibility, navigation, loopback proxy and production emitted/deep-route behavior are preserved.
- Given final installed versions, when the architecture Stack is read, then it matches manifests/lockfile and contains no removed package as current.
- Given orchestrator bookkeeping, when implementation finishes, then sprint-status.yaml has never been written/staged/unstaged/reverted by this run and completion claims rely on independent checks.

## Spec Change Log

- 2026-10-20 v2: Implemented sequential upgrades and recorded every invocation, including failures. Preserve static10's stricter security admission: an invalid overlong filename now returns explicit JSON403 instead of legacy404. The parent directed this observable migration change after source inspection; preserving404 would bypass or duplicate upstream spelling validation. Valid assets, traversal/containment refusal, API and health contracts remain covered. No production static-serving workaround was added.

## Review Triage Log

### 2026-10-20 — Review pass

- verdicts: 16 findings — high 0, medium 1, low 4, false 5, maybe-false 6
- findings:
  - `[maybe-false]` `[defer]` E1: Optimizer/request-idle waits have no overall deadline, so a stalled optimizer could hang the bounded proxy smoke. — Per-request deadlines exist; waitForRequestsIdle, scanProcessing and dependency.processing have no deadline. All actual Vite7/8/final runs settled. A reachable stalled optimizer plus non-exit reproduction is needed to establish the alleged hang; retain as medium unverified.
  - `[low]` `[defer]` B1: Clearing the callback after mounting hides setEditable mount/suspension callbacks. — Confirmed core2.27.2 Editor.ts:192 and core3.32.0 Editor.ts:310 both default setEditable emitUpdate=true, and the application already called it before this change. Card Detail compares draft values with baseline; title-only rich-description regression passes. This callback behavior predates the upgrade.
  - `[maybe-false]` `[defer]` B2: Direct pasteHTML with a cast Event bypasses clipboard-data extraction and DOM paste dispatch. — The test deliberately covers real ProseMirror parser/transaction/Markdown serialization, not clipboard extraction or OS paste. No changed local clipboard handler or observed failure was found. A real browser paste carrying HTML/plain text would settle the remaining medium unverified native-path risk.
  - `[maybe-false]` `[defer]` B3: Compatibility cases omit ordered/nested lists, blockquotes, code, strike and hard breaks. — The focused corpus covers specified toolbar formats, prop sync, paste and unchanged-description Save; exact existing format regressions pass. No mismatch in the other formats was demonstrated. Compare an actual supported-format corpus between v2 and v3 to settle possible medium serialization risk.
  - `[maybe-false]` `[defer]` B4: Fetching transformed entry does not establish actual browser boot/render from the built application. — Correct limit: proxy smoke proves HTTP transformation and proxy/native lifecycle; full mounted React suites and production static/deep-route/byte checks provide separate evidence. No native compiled-bundle boot was executed. A disposable native-browser boot/render exercise would settle a possible medium boot regression.
  - `[maybe-false]` `[defer]` B5: Unbounded optimizer waits could hang the smoke despite fetch deadlines. — Same unverified root cause as E1; no stalled optimizer was reproduced in any actual run. Need a reachable stall and exit/cleanup observation before claiming the bad outcome.
  - `[low]` `[patch]` B6: Canonical proxy invocation records omit TSX_TSCONFIG_PATH required for exact replay. — Parent reproduced ERR_MODULE_NOT_FOUND with recorded argv and passed with TSX_TSCONFIG_PATH=apps/server/tsconfig.json. Implementation agent confirmed this was the original inherited setting. Added explicit verified replay prerequisites to all seven proxy records/release record, retaining historical command/status/raw output.
  - `[low]` `[reject]` B7: Intermediate lock hashes without retained lockfiles cannot recreate every intermediate resolved graph. — Historical graph replay is a real limitation, but ordinary development uses the final frozen lockfile. The accepted story requires intermediate exact versions/check results, which are retained; it explicitly withdrew per-upgrade commits. Recovering/retaining whole intermediate lock snapshots is more than a direct correction and rarely needed in everyday use. Do not claim intermediate clean-checkout reproducibility.
  - `[false]` `[reject]` B8: Tiptap tests predate adding the direct core dependency, so the completed runtime graph was not tested before static upgrade. — The install log reports downloaded0/added0/Already up to date. Existing Tiptap core/pm/react/starter-kit were already3.32.0; adding the identical direct core peer link supports only the erased Storage type augmentation. Runtime modules did not change. Typecheck/build covered the declaration, and later full workspace/root checks additionally cover the final graph.
  - `[low]` `[patch]` B9: Manifest/privacy summaries omit newly added parent verification evidence. — Confirmed original149-member manifest and privacy scope predated parent logs. Preserved original privacy summary, rescanned all current JSON/gzip/evidence and regenerated full member hashes; parent repeats integrity/privacy after final review evidence is added.
  - `[false]` `[reject]` B10: Instrumentation/index refer to a nonexistent vitest3-install-confirm.json; report alternates contradictory identical names. — Exact retainedEvidence path exists on disk and in the manifest: vitest3-install-confirm.json. It parses, hashes correctly and records successful frozen install. No vitest3-install-confirmation.json is referenced by instrumentation or command index.
  - `[false]` `[reject]` I1: Strict preservation interpretation diverges at invalid overlong path JSON404→JSON403. — This intentional upstream security refusal is explicitly recorded and exercised, with unchanged production web-app.ts, canonical200, noncanonical/case refusal and healthy API. The dependency story does not require bypassing updated security admission to preserve the status of an invalid path.
  - `[maybe-false]` `[defer]` I2: Native clipboard interaction is not established by JSDOM pasteHTML. — Same verification limit as B2, explicitly admitted in acceptance-limits. No OS clipboard certification is claimed; a real browser/clipboard run is needed to settle any medium unverified incompatibility.
  - `[medium]` `[defer]` I3: Mac automated checks do not establish native Windows/Linux or actual screen-reader acceptance. — These checks were not executed and remain named operational prerequisites from prior epics/preparation, with platform/accessibility maintainer owners. They predate this story and cannot be inferred from green automated suites.
  - `[false]` `[reject]` I4: A completely clean audit interpretation exceeds zero high/critical plus one moderate. — Story8.2 explicitly requires no critical/high and disclosure of unresolved advisories. High-threshold audit exits0, full JSON exits1, and development esbuild0.18.20 path/fix range/reason/owner are recorded without claiming a fully clean graph.
  - `[false]` `[reject]` I5: Handoff/acceptance records describe review/finalization as pending while parent verification is present. — Those implementation-capture records correctly described pending review at their timestamps. This pass completes review and writes final state separately. Source checks, not a pending/done row, establish verification; no speculative commit/publication is implied.

All four fresh-context review layers ran; platform capacity required two waves. The verification-gap layer found no gaps. Two low evidence patch groups were applied by the same implementation agent. Six findings were rejected; eight rows map to six deferred groups. No high/medium patch was applied, so followup_review_recommended=false. [Structured review record](evidence/story-8-2/review-pass-1.json).

### 2026-10-20 — Review pass (follow-up)

- verdicts: 27 findings — high 0, medium 0, low 14, false 11, maybe-false 2
- findings:
  - `[low]` `[reject]` Blind: Stack table claims exact versions while manifests keep caret floors. — The table is explicitly the resolved lockfile snapshot; drift needs an unfrozen install and the fix (pin all manifests) is far beyond a direct correction.
  - `[false]` `[reject]` Blind: pnpm-lock.yaml and root package.json absent from the diff. — Excluded from the staged review diff for size; lockfile, audit and versions are retained under evidence/story-8-2/.
  - `[low]` `[reject]` Blind: Stack table omits some direct dependencies and the upgrade-wave pointer. — The table was always selective; no named consumer breaks.
  - `[low]` `[reject]` Blind: repeated `--exclude "**/dist/**"` and silent `--minWorkers` removal. — Both are recorded Vitest 4 migrations (default exclude changed, option removed); serial audit-performance gate passed 14/14; centralizing is a refactor beyond a direct correction.
  - `[low]` `[reject]` Blind: static 403 change and filesystem-conditional case-alias assertion. — 403 is the recorded intentional upstream admission; the conditional expectation asserts correct per-host behavior (no alias exists on case-sensitive hosts).
  - `[false]` `[reject]` Blind: github-connect `mockReset` inconsistent with credentials.test. — The factory mock is `vi.fn(actual.rename)`; Vitest 4 `mockReset` restores that original implementation, so no `undefined` returns; suite passes.
  - `[low]` `[patch]` Blind: `shouldRerenderOnTransaction` unexplained and disabled StarterKit extensions untested. — The comment part is rejected (repo rules forbid explanatory comments, spec records the reason); the untested-extensions part is grouped with the gap finding and patched.
  - `[maybe-false]` `[defer]` Blind: rich-editor corpus narrow (lists, code, quotes, strike, breaks). — carried B3, already in `deferred`.
  - `[low]` `[reject]` Edge: case-alias assertion depends on host filesystem. — same as the static finding above.
  - `[maybe-false]` `[reject]` Edge: other noncanonical path forms untested. — No observed divergence; would be low if true.
  - `[false]` `[reject]` Edge: github-connect resets only rename. — Only `rename` is a `vi.fn` in that module's factory.
  - `[low]` `[patch]` Edge: StarterKit extension set not pinned. — grouped with the gap finding; patched.
  - `[low]` `[defer]` Edge: disabled/setEditable path untested and may emit onChange. — carried B1, already in `deferred`.
  - `[false]` `[reject]` Edge: setContent options may not be forwarded by the adapter. — The non-emission assertions in DescriptionEditor.test.tsx exercise exactly this and pass.
  - `[low]` `[reject]` Edge: serial gates rely on maxWorkers=1 alone. — see the `--minWorkers` row; final serial gates pass.
  - `[low]` `[reject]` Edge: Stack claim vs caret manifests. — duplicate of the first row.
  - `[false]` `[reject]` Edge: traversal/containment coverage not shown. — The `server.test.ts` missing-asset 404 and containment cases are unchanged; only the overlong-name expectation moved.
  - `[low]` `[reject]` Edge: "case-alias refusal" proven only on case-insensitive hosts. — same as the static finding above.
  - `[low]` `[patch]` Gap: disabled link/underline/listKeymap/trailingNode not pinned by any test. — Added an extension-set assertion to `DescriptionEditor.test.tsx`; mutation check (removing `link: false`) fails the new test, restored source passes; web 853 pass, web typecheck passes.
  - `[low]` `[reject]` Gap other: case-alias test computed from the host filesystem. — same as the static finding above.
  - `[false]` `[reject]` Gap other: overlong-name 404 intent lost. — `carried` I1: intentional recorded upstream admission; `validateWebBuild` unaffected.
  - `[false]` `[reject]` Intent: success lives in lockfile/audit/evidence absent from the diff. — Excluded from the diff; they exist and are hashed in the evidence manifest.
  - `[false]` `[reject]` Intent: history-patch reassessment not visible. — `history-patch-upstream.json` and `history-patch-installed.json` record it; the patch is intentionally unchanged.
  - `[false]` `[reject]` Intent: one-major-at-a-time sequencing unobservable. — `sequential-gates.json` records it.
  - `[false]` `[reject]` Intent: 8.x static 403 diverges from strict preservation. — `carried` I1.
  - `[false]` `[reject]` Intent: `@tiptap/core` direct dependency only used by a `.d.ts`. — `carried` B8: the adapter's exported storage augmentation requires it; typecheck covers it.
  - `[low]` `[reject]` Intent: Stack doc is an unenforced snapshot. — duplicate of the first row.

Four layers ran. One low patch group (extension-set test) was applied; two earlier deferred groups were carried; everything else was rejected. No high/medium patch, so followup_review_recommended=false.

## Design Notes

Code-review-graph capabilities are unavailable in this session; two read-only investigations verified source and tests. Current official migration docs: https://vitest.dev/guide/migration.html (and https://v3.vitest.dev/guide/migration), https://v7.vite.dev/guide/migration, https://vite.dev/guide/migration, https://tiptap.dev/docs/guides/upgrade-tiptap-v2, adapter source https://github.com/aguingand/tiptap-markdown. Registry metadata is primary exact-version/peer evidence. Preserve old behavior through documented options, not fallbacks. Vitest4 removes minWorkers and changes spy generics/reset behavior; validate actual installed CLI/types before necessary migrations. Keep source aliases and all existing serial gate semantics. Use installed Node via `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH` for every install/check process. Do not perform parallel builds with launcher fixture tests.

## Verification

- `corepack pnpm test` under Node24 — all eight workspace suites plus script tests and serial audit performance pass. Run after each major as required above; keep actual executed case counts.
- `corepack pnpm typecheck` and `corepack pnpm build` under Node24 — all workspaces pass after every major.
- `node scripts/verify.mjs` under Node24 — hygiene, capabilities, serial accessibility, typechecks and build pass.
- `corepack pnpm install --frozen-lockfile` under Node24 — actual locked graph installs; native SQLite operates under the same runtime.
- `corepack pnpm audit --audit-level high` under Node24 — zero critical/high, scanner succeeds.
- `TSX_TSCONFIG_PATH=apps/server/tsconfig.json node --import ./apps/server/node_modules/tsx/dist/loader.mjs _bmad-output/implementation-artifacts/evidence/story-8-2/proxy-smoke.mts` under Node24 — actual loopback Vite proxy/native reopen passes. Existing static/deep-route/production launcher regressions run in the full suite. No claim of Windows/Linux/reader acceptance from this Mac.
- `git diff --check HEAD` and protected-path/migration hash comparison — no whitespace errors or unauthorized protected-file mutation.

## Final Executed Results

Node24.17.0/pnpm9.15.4 final root test passed **3251**:83 script,193 contracts,7 importers,66 GitHub,449 core,852 web,561 DB,1026 server and14 serial audit-performance. Final `node scripts/verify.mjs` passed source/Git hygiene,138 capabilities,261 serial accessibility cases, all workspace typechecks and builds. Fresh final frozen install, separate full typecheck/build, actual loopback proxy/native SQLite open/reopen and high audit also passed on the same lock hash. [release-result.json](evidence/story-8-2/release-result.json) links exact invocations/times; complete output is retained. Vite's existing large-chunk warning remains visible and is outside this dependency wave.

`git diff --check HEAD` passes. [protected-final.json](evidence/story-8-2/protected-final.json) proves working/index migration assets and sprint-status unchanged and HEAD still at the baseline. Final source/test diff SHA256 is `dae8c9a19ebde9ac5c850af1b13b423103fa7e86c11282b72042e535da3b896d` (scope recorded there). No production changes followed these checks. Implementation is ready for independent parent review; story finalization remains orchestrator-owned.

## Implementation Evidence

All artifacts are relative to this spec: [evidence/story-8-2/](evidence/story-8-2/). Invocation JSON records UTC timestamps, Node version, exact command, exit status, lock hash and all manifests. Matching `.log.gz` preserves complete stdout/stderr, including failed attempts. [sequential-gates.json](evidence/story-8-2/sequential-gates.json) checks that successful preceding-major checks finished before the next install began. No intermediate commit was created.

| Upgrade | Successful coverage before next major | Evidence prefixes |
| --- | --- | --- |
| Vitest2→3.2.7 | Root3246; all typechecks/builds | `vitest3-*` |
| Vitest3→4.1.12 | Workspace3163; portable83 in prior root invocation; all typechecks/builds | `vitest4-*` |
| Vite6→7.3.7, React plugin5.2.0 | Root3246; all typechecks/builds; actual loopback API/health proxy and native SQLite | `vite7-*` |
| Vite7→8.3.4 | Root3246; all typechecks/builds; actual loopback API/health proxy and native SQLite | `vite8-*` |
| Tiptap2→3.32.0, adapter0.9.0 | Full web852; actual server Markdown1; focused114 overlap; all typechecks/builds. Added cases also passed on Tiptap2 (33). | `tiptap2-*`, `tiptap3-*` |
| static8→9.3.0; compatible runtime/transitive patches | Workspace3167; six real setup/launcher fixtures; all typechecks/builds | `static9-*`, `runtime-transitive-*` |
| static9→10.1.6 | Final release gate below; initial403 migration failure retained | `static10-*`, `final-*` |

The Vitest4 intermediate gate is composed coverage, not a claim that its failed root invocation passed: portable83 passed before module-factory mock cleanup; the complete workspace3163 passed afterward. Final root validation is separate. Vite's test-tool copies moved coherently5→6 with Vitest3, then6→7→8 with the direct Vite upgrades. Vitest4 clears its advisory paths; no Vitest5 or unused coverage tooling was added. React plugin5 avoids an unnecessary plugin6/Oxc migration.

Vitest4 migration failures required documented CLI/type/mock changes: remove obsolete `minWorkers` while retaining serial `maxWorkers=1`; explicitly exclude every nested `dist` from all test scripts because the default changed; type callable mocks and exported provider fixtures; reset module-factory filesystem mocks explicitly because `restoreAllMocks` no longer clears them. Original diagnostic exclusions, assertions and performance bounds remain. Initial failed gates are preserved.

Tiptap3 uses the supported non-emitting `setContent` options, reactive transaction rendering for toolbar state and explicit disabling of StarterKit's new Link/Underline/ListKeymap/TrailingNode semantics. The existing Markdown adapter/storage remains. A used direct core dependency supports the adapter's exported storage type augmentation. Actual editor tests cover initial content, prop sync without emission, focused drafts and rich paste serialization; Card Detail also proves title-only saves omit unchanged canonical rich Markdown. Existing exact rich edit/save/reload, pending-save, navigation, dirty/Restore and accessibility assertions remain.

The history1.162.0 patch remains byte-identical. [history-patch-upstream.json](evidence/story-8-2/history-patch-upstream.json) and [history-patch-installed.json](evidence/story-8-2/history-patch-installed.json) compare the actual installed source and npm upstream: upstream still lacks both exact traversal restoration and beforeunload-reset behavior. Existing real history-API regressions pass; no native browser-reader certification is inferred.

[resolved-versions.json](evidence/story-8-2/resolved-versions.json) and final recursive installed output record exact versions; Architecture Stack matches them. Runtime fixes stay in supported parent/compatible transitive ranges, with no overrides. Initial audit:50 advisories (5critical/24high/19moderate/2low), scanner exit1. Final [audit-final.json](evidence/story-8-2/audit-final.json):0critical/0high/1moderate; high-threshold scanner exit0 and full JSON scanner exit1 are both preserved. Remaining development-only esbuild0.18.20 path is `packages/db > drizzle-kit0.31.11 > @esbuild-kit/esm-loader2.6.5 > @esbuild-kit/core-utils3.3.2 > esbuild0.18.20`, patched>=0.25.0. Owner: development-tooling maintainer. Latest stable kit retains that incompatible old transitive line; no forced override or unrelated DB migration was introduced.

Static10's invalid-path403 admission is recorded in [static-security-migration.json](evidence/story-8-2/static-security-migration.json), supported by [upstream source](https://github.com/fastify/fastify-static/blob/v10.1.6/index.js). Focused server18 passes canonical200, overlong/noncanonical JSON403, filesystem-case-alias refusal, unchanged traversal/containment and healthy subsequent API/health. Production `web-app.ts` is unchanged. The first final root failure is retained as `final-test.log.gz`.

Unexecuted acceptance: native Windows/Linux, actual screen-reader interaction and native clipboard UI. JSDOM paste uses the real ProseMirror paste parser with an explicitly supplied supported event; it does not claim OS clipboard certification. No user Projects/credentials or live GitHub were accessed. Sprint-status and migration SQL/metadata are read-only and compared in working tree and index; no bookkeeping ledgers were edited. Independent parent review and orchestrator finalization remain pending.

## Changelog

- 2026-10-20 v4: Follow-up review pass; add one StarterKit extension-set regression test and record triage.
- 2026-10-20 v3: Complete independent parent verification and four-layer review; apply two evidence corrections, retain every finding/deferred acceptance and preserve orchestrator finalization.

- 2026-10-20 v2: Record implementation, sequential gates, exact installed Stack, residual advisory ownership and intentional upstream invalid-path403 admission.
- 2026-10-20 v1: Planned audited sequential upgrades from actual graph/source and prepared Epic8 contracts.

## Independent Parent Verification

All3251tests, full typecheck/build, release verifier138capabilities/261accessibility, frozen install and high audit passed independently under Node24.17.0. Initial exact proxy evidence command failed because required alias-loader configuration was omitted; explicit `TSX_TSCONFIG_PATH=apps/server/tsconfig.json` then passed every200status and native SQLite reopen. Both results are retained in [parent-verification.json](evidence/story-8-2/parent-verification.json). The configured smoke subprocess exited0; its later bookkeeping wrapper error is separately retained. Production/source fingerprint remains unchanged.


## Auto Run Result

Status: done

- Summary: Follow-up review pass on the completed dependency upgrade wave (Vitest 4, Vite 8, Tiptap 3, static 10, runtime transitives). Four fresh-context layers produced 27 findings; one low patch group applied, two earlier deferrals carried, the rest rejected with recorded reasons.
- Files changed in this pass: `apps/web/src/features/story-map/components/DescriptionEditor.test.tsx` (new test pinning that the Tiptap 3 link/underline/listKeymap/trailingNode extensions stay disabled); this spec (triage log, changelog, result).
- Review breakdown: patched 1 group (low); deferred 0 new (B1, B3 carried, already in `deferred`); rejected all others (see Review Triage Log).
- Follow-up review recommended: false (no high patched; no medium patched).
- Verification: new test passes; mutation check (removing `link: false`) fails it, source restored with no residual diff; `@storymapper/web` typecheck passes; `@storymapper/web` tests 853/853 pass under Node 24.17.0.
- Finalization: no commit created, per the intent contract (orchestrator owns the single story commit). sprint-status.yaml was never written, staged or reverted by this run; it shows an external modification that is orchestrator bookkeeping.
- Residual risks: the deferred unverified items (optimizer deadline, native clipboard paste, broader Markdown corpus, native compiled-bundle boot, Windows/Linux and screen-reader acceptance) and the development-only esbuild 0.18.20 moderate advisory.
