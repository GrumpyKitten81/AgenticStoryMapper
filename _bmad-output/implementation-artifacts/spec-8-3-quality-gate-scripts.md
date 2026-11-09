---
title: '8.3 Quality gate scripts'
type: feature
created: '2026-10-20'
version: 4
status: done
baseline_revision: 91d06bba8b3fe1060b4f0d8d2316aa98604a46cf
review_loop_iteration: 0
followup_review_recommended: false
context:
  - _bmad-output/implementation-artifacts/story-plan-8-3-quality-gate-scripts.md
  - _bmad-output/implementation-artifacts/epic-8-preparation.md
warnings: [oversized]
deferred:
  - summary: >-
      The existing English-copy guard uses German token and character heuristics, not universal language identification.
    evidence: |-
      Review I3: findViolations retains the pre-existing NFC/word/umlaut detector. Current static copy is checked with those rules; they do not classify every possible non-English string. An agreed acceptance corpus and language review are needed to extend the policy without treating names and domain terms as errors.
    location: >-
      scripts/check-hygiene.mjs:15
    severity: medium
  - summary: >-
      db tests import server use cases, so the db manifest declares a devDependency on server while the boundary gate exempts tests from layer direction.
    evidence: |-
      Review B4/E3: six db test files import @storymapper/server subpaths (pre-existing); declaring them makes db and server a workspace-level cycle that AD-1 layering does not allow for production code. Moving those integration tests to the server package would remove the coupling.
    location: >-
      packages/db/package.json:24
    severity: medium
  - summary: >-
      The repaired sync-service import cycle has no regression guard.
    evidence: |-
      Review V4: sync-values.ts breaks the work-item-sync/sync-merge/sync-conflict-resolution cycle, but check-boundaries has no cycle detection, so re-adding the import passes typecheck, tests and the gate. The spec reports cycle evidence separately and requests no acyclicity gate.
    location: >-
      apps/server/src/services/sync-values.ts:1
    severity: low
---

# Story 8.3: Quality gate scripts

Date: 2026-10-20. Version: 4.

Reproducing statement: Run bmad-build-auto for 8-3-quality-gate-scripts, implementing and independently verifying the binding Epic 8 preparation and detail plan. sprint-status.yaml belongs to the orchestrator and must never be written or reverted; its rows are not verification.

<intent-contract>

## Intent

**Problem:** Contributors lack one enforceable local command covering the architecture, complete source size limits, per-package coverage, table ownership, safe tracked-file hygiene and dependency licenses. Existing typecheck/build/release checks cover only part of that contract.

**Approach:** Supply `corepack pnpm check`, composing existing authoritative checks with parser-based boundary/size gates, coverage for every logic-bearing workspace, complete classification, safe hygiene and an offline resolved-dependency license allowlist. Repair only violations demonstrated by these required gates with behavior-preserving extraction.

## Boundaries & Constraints

**Always:** Node 24 and root-pinned pnpm 9.15.4 through Corepack; preserve loopback/ChangeSet/DB ownership and current domain behavior. Follow AD-1's existing layer diagram. Keep contracts the only schema source and data access in db. Every one of the eight workspaces contains logic, including MCP; require at least 60% line coverage separately, intended untested source included. Preserve meaningful ordinary tests, serial audit-performance and serial a11y checks and diagnostic-only timing. Enforce authored application/package/script source at 750 physical lines, 100,000 UTF-8 bytes and 50 physical lines per JS/TS function, including nested functions, callbacks, React components and tests. Include CSS/HTML and other authored source in file limits. Treat only genuinely generated/vendor/build output separately. Report exact path/line/package/rule without secret content. Inspect tracked hygiene/publication inputs only, never ignored user Projects or home credentials. Retain exact migration-journal infrastructure classification and Sync/provider-reference redaction. Use actual installed reachable dependency metadata, explicit license rules and compound-expression semantics. Leave evidence of commands, failures, measured coverage and any unexecuted native/platform acceptance.

**Never:** Write, stage, unstage, revert or otherwise mutate `_bmad-output/implementation-artifacts/sprint-status.yaml`, deferred ledgers or orchestrator run/policy files. Never infer verified work from their state. Do not commit, push, publish, tag, run the next story, change migration assets, weaken thresholds, baseline violations away, minify source to evade function limits, delete assertions, exclude real logic from coverage, add SaaS/telemetry, run provider/login flows or absorb unrelated deferred behavior. Online advisory audit stays separate from the blocking local aggregate. Full-history/content-disposition audit belongs to 8.7 and final publication. No boilerplate tests, broad exceptions or placeholder implementations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Actual tree | Installed frozen workspace under Node 24 | Every required local check runs and all eight coverage floors pass | Explicit nonzero failure from any gate |
| Boundaries | Undeclared/unused workspace dependency, forbidden layer/DB/core import, workspace source escape, feature deep import; static/dynamic/re-export/require syntax | Source, location, package and violated rule identified; legal public entries pass | Nonzero without exemptions |
| Size | 751 lines, 100,001 bytes, 51-line function; arrow/method/nested/component and LF/CRLF | Exact start and measured violation fail; 750/100,000/50 pass | Nonzero; all authored source roots checked |
| Classification | Missing/duplicate owner, unknown physical/declared table or stale assignment | Table named; exact infrastructure journal stays distinct | Nonzero; no wildcard infrastructure exemption |
| Coverage | Any logic workspace below 60%, no tests, stale/missing/empty/invalid report or absent instrumented source | Individual workspace fails, regardless of aggregate coverage | Nonzero; no passWithNoTests bypass |
| Hygiene | Tracked secret signature, SQLite/Project/user-data path, non-English string/seed/template | Category/path/line diagnostic, never the matched secret | Nonzero, unreadable/scanner failure explicit |
| Licenses | Unknown/missing/disallowed resolved metadata; AND/OR/parentheses/dual expression | Package/version/rule diagnostic; AND requires all, OR permits explicit compatible option | Nonzero, no stale-store or unknown-clean result |
| Child failure | Missing tool, child error/nonzero exit, SIGINT/SIGTERM | Aggregate fails and drains owned children; later success cannot mask failure | Nonzero exit, preserved diagnostic |

</intent-contract>

## Code Map

- Graph MCP tools are unavailable. Two read-only investigators inspected implementation/tests; current canonical baseline is `91d06bba8b3fe1060b4f0d8d2316aa98604a46cf`. No preexisting dirt before context refresh. Protected sprint working/index SHA256 both `a276506882f729c8d2181f9049a0175916af9cbab7851d12ee73074965f44233`, independently saved in `/tmp/story-8-3-protected-before.json`; external changes must be reported, never reverted.
- `package.json`, eight workspace manifests/configs, `pnpm-lock.yaml`: Vitest 4.1.12, Vite 8.3.4. No coverage plugin/config/reports. MCP has six logic modules and no local tests. All eight require coverage; root scripts use Node's test runner. Add matching `@vitest/coverage-v8` and record exact Corepack install command. Use `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` ahead of PATH for all validation/install processes.
- `scripts/{verify,runtime,processes}.mjs`: `verify` owns Git/runtime/health/a11y/typecheck/build; share or compose rather than duplicate/diverge. `run` owns subprocess errors/termination; `commandMain` suppresses its own AbortError without currently setting failing exit status. Preserve optional health identity validation and existing CLI flags. `commands.test.mjs:375`, `doctor.test.mjs`, `scripts/fixtures/checkout.mjs:30` use tracked checkout copies: stage newly required files individually before fixture runs, excluding protected paths. Never run builds concurrently with fixtures/coverage.
- `scripts/{check-hygiene,check-hygiene.test,capability-scan,check-capabilities}.mjs`, `scripts/german-stop-words.txt`: reuse TypeScript parser and existing English check; hygiene currently traverses filesystem and prints matched German words. Replace with safe tracked diagnostics; retain English scopes `apps/web/src`, `packages/db/src/seed`, `packages/core/templates`, default templates/repository routes. High-confidence secret signatures found zero current violations; generic `GITHUB_TOKEN=...` matching incorrectly flags source references. No home or ignored-data scan.
- `packages/db/src/schema/classification.ts:1,16,21`: aggregate registry and exact `__drizzle_migrations` infrastructure exist. Current assertion detects unknown tables only, misses duplicate/stale assignments. `snapshot.test.ts:48` examines physical and declared universes separately; strengthen both-way completeness with explicit infrastructure handling and retain redaction tests. `unit-of-work.test.ts:547` is the old partial regex DB-import/DB-only size gate; consolidate with new complete scripts.
- Boundary source roots are authored `apps`, `packages`, `scripts`; skip dependency/build/vendor output and exact proven generated files, never authored files marked generated to pass. Use TypeScript AST for imports/re-exports/import-equals/require/dynamic literals, function bodies and alias resolution. Workspace self aliases and `@storymapper/ui-strings` are internal aliases, not phantom packages. Validate declarations, use and exported subpaths; finite per-tool evidence allows test/build dependencies, no broad ignore.
- `apps/web/package.json`: missing actual production `@storymapper/core` dependency. `packages/importers/package.json`: unused contracts declaration. `packages/db/src/repositories/sources-repository.ts:14,25`: DB imports parser functions from importers, forbidden by diagram. Carry parsed chunks through prepared source input from application to DB, keeping DB-owned hashing/IDs/persistence and single contracts schema; update actual writers/tests rather than adding a new layer arrow or duplicate parsers.
- `apps/web/src/features/*/index.ts`: roughly 78 cross-feature deep imports including tests, especially changesets/github-sync/conflicts/story-map/what-changed/customization/releases/reports/safety. Export intentional production APIs; move shared fixtures outside production feature entrypoints and shared components to `src/components`. Preserve import-time behavior and test mocks.
- `apps/server/src/services/{work-item-sync,remote-push-plan,sync-conflict-resolution,sync-merge}.ts`, `application/sync/{github-import-command,github-pull-command}.ts`: source-verified runtime SCC; extract existing hash/label/release/status helpers into an acyclic shared values module. Report cycle evidence separately from layer compliance. Other observed SCCs are MCP register-tools versus registration groups, and WhatChangedProvider versus Drawer; split shared primitives/ActorBadge when affected by the gate, without claiming unmeasured global absence of cycles.
- Strict source inventory: 790 tracked JS/TS files, zero oversized JS/TS files, 169 functions >50 physical lines (63 non-test-path, including helpers; 106 tests: 68 describe, 32 it, 4 it.each, 2 beforeEach). `apps/web/src/styles/global.css` is 3,396 lines and needs ordered stylesheet extraction.
- Largest UI violations: `CardDetailModal` 531, `DiscoveryMatrix` 431, `GitHubSyncPanel` 388, `useStoryMapBoardState` 329, `RootLayout` 203, `DiscoveryLanes.ReleaseSection` 195. Remaining UI panels/hooks/components include live updates, Dialog, reviews, customization, connections, onboarding, personas, archive, releases, reports, restore, roadmaps, safety, sources and board components. Extract cohesive state hooks/sections without changing hook order, state ownership, keys, focus, dirty-save/Restore or event semantics. Split long test registrations with scenario helpers retaining nesting/hooks/names/assertions; do not flatten test scopes.
- Non-UI >50 functions: changeset execute/preview, project-lock claim, audit-tool-call, project-scopes, remote-push-plan prepareIssues; core operation conflicts/readPayload/proposal builder; db audit log and operation snapshot fixture; Markdown parser; launcher checkout/roundtrip fixtures. Read relevant tests before behavior-preserving extraction.
- License inventory has permissive licenses plus MPL-2.0, CC-BY-4.0, Python-2.0 and compound expressions. Traverse reachable installed metadata or authoritative offline pnpm license graph, not every `.pnpm` directory (stale copies exist). Allowlist must explicitly name compatible identifiers and retain obligations; standalone strong copyleft/unknown/SEE LICENSE fails, known compatible OR branch may pass. Mozilla FAQ confirms file-level MPL permits larger works under other terms with retained rights/source/notice obligations; approval is a dependency compatibility rule, not publication certification.
- Read-only: `packages/db/migrations/**`, root Node/pnpm policy, history patch, orchestration/sprint/deferred tracking. Previous 8.2 moderate dev esbuild advisory and native/browser/reader acceptance gaps remain distinct; do not silently close them.

## Tasks & Acceptance

**Execution:**

- [x] `scripts/check*.mjs`, root `package.json`, `scripts/{verify,processes}.mjs` — compose one deterministic offline local gate, reusing authoritative checks/process ownership and preserving separate online audit. Add focused failure/signal fixtures. Delegate independent cohesive extractions as needed; all subagents must preserve the protected tracking boundary.
- [x] `scripts/check-boundaries.mjs` and parser fixtures, affected manifests/public indexes/source-preparation contract/service/repository — enforce diagram/workspace/DB/core/feature rules, repair identified dependencies and entrypoints; classify/repair sync cycle without broad exemptions.
- [x] `scripts/check-size.mjs`, exact affected source/test/style modules — implement complete physical line/byte/function checks and boundary fixtures; extract demonstrated violations while preserving behavior, assertions and React lifecycle. Consolidate partial DB size check.
- [x] `packages/db/src/schema/classification.ts`, `snapshot.test.ts` — enforce unique aggregate/infrastructure ownership and exact physical/declared universes, retain redaction and journal behavior.
- [x] All workspace coverage configs/manifests and meaningful MCP/other uncovered behavior tests — instrument all intended source including untested logic at separate 60% floor; fresh report completeness validation; preserve serial suites and ordinary coverage across all8logic packages.
- [x] `scripts/check-hygiene.mjs`, tests and license helper/policy — safe tracked secret/data/English diagnostics; offline reachable resolved licenses, explicit compatible rules and compound-expression tests, missing scanner/metadata failures.
- [x] Root gate and story evidence — exercise every matrix failure and passing actual tree, run independent final checks, record eight percentages and native/platform limits, preserve protected bytes; leave one reviewable diff without commit.

**Acceptance Criteria:**

- Given a frozen installed checkout, when `corepack pnpm check` succeeds, then every required gate and serial acceptance suite ran, all8logic workspace source denominators were included and each line result is at least60%.
- Given any matrix violation, when the same aggregate/gate is executed, then actionable non-sensitive diagnostics and nonzero status identify the offending source/package; none can be masked by missing evidence or another package's success.
- Given existing source imports, UI lifecycle, domain persistence and redaction behavior, when the full existing regressions/typecheck/build run after extraction, then behavior and required assertions remain preserved with no architecture exemptions.
- Given orchestrator bookkeeping, when this run finishes, then it has never written/staged/unstaged/reverted sprint-status or other protected ledgers, and verification relies on checks rather than rows.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 24 findings — high 1, medium 16, low 1, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` B1: Core fetch/network effects bypass purity — Normalized global access now rejects fetch and network constructors; the regression fixture asserts exact locations.
  - `[false]` `[reject]` B2: Deterministic Date operations are rejected — AD-1 expressly prohibits all Date calls; rejection is the specified policy, including deterministic Date operations.
  - `[medium]` `[patch]` B3: Computed/qualified random APIs bypass purity — Property and literal computed global chains reject qualified crypto and Math.random; all twelve effect forms are exercised.
  - `[medium]` `[patch]` B4: Root script imports have no dependency owner — Root scripts now have a manifest owner and declaration checks; final verification also exposed Fastify test use, declared in root devDependencies.
  - `[medium]` `[patch]` B5: Unexported workspace roots/null exports pass — Export resolution now distinguishes root/subpath, conditional targets, null and wildcard denial with negative fixtures.
  - `[medium]` `[patch]` B6: node:sqlite bypasses DB ownership — node:sqlite and sqlite are included in DB-only ownership checks.
  - `[medium]` `[patch]` B7: Zero-line executable report evidence passes — Executable source detection now requires positive measured lines per source; empty/type-only/forwarding modules remain valid.
  - `[medium]` `[patch]` B8: Foreign report entries inflate package coverage — Reports reject paths outside the workspace intended-source inventory before accepting package evidence.
  - `[high]` `[patch]` B9: Tracked gzip evidence bypasses secret signatures — Tracked gzip bytes are decompressed and checked for supported signatures; malformed archives fail safely. Synthetic regression and 426 existing archives were checked without modifying bytes.
  - `[low]` `[patch]` B10: Card Detail context duplicates ninety forwarded fields — Card Detail context now spreads its model instead of rebuilding ninety fields; both modal suites pass56tests.
  - `[medium]` `[patch]` I1: Public orchestration has helper-only negative evidence — Actual coverage and license CLI negative tests now assert nonzero caller outcomes; shared child/signal and real aggregate boundary-failure tests remain.
  - `[medium]` `[patch]` I2: Test usage can satisfy runtime dependency usage — Production use is tracked separately from tests/tools; runtime dependencies used only for development are rejected.
  - `[medium]` `[defer]` I3: English guard remains a German-token heuristic — Pre-existing findViolations algorithm is preserved; no universal language classifier is claimed. Other-language copy needs an acceptance corpus and language review; retain this finite-detector limitation explicitly.
  - `[false]` `[reject]` I4: Secret signatures do not establish exhaustive secret/history audit — Current gate explicitly implements supported signature and tracked-path checks; no exhaustive history/unknown-secret certification is claimed. Concrete gzip omission is separately patched as B9.
  - `[false]` `[reject]` I5: License gate does not certify redistribution obligations — Story8.3 requests compatibility allowlist, not publication certification. Policy and command explicitly retain upstream obligations; later publication gates remain open.
  - `[false]` `[reject]` I6: Structural test parity does not prove semantics — No claim relies on counts alone: full runtime suites, real launcher/transport checks and independent489-node CSS AST equivalence also ran. Specific missing human parser assertion is patched as G1.
  - `[false]` `[reject]` I7: Only Darwin execution is established — This story supplies local checks; three-platform execution is Story8.4. Evidence expressly retains Windows/Linux/native-reader limits and makes no all-platform claim.
  - `[medium]` `[patch]` G1: Human HTTP Markdown parser selection lacks structural assertions — The real human HTTP test now asserts exact nested Markdown headings, source locators and stable repeated-import chunk identities.
  - `[medium]` `[patch]` G2: Coverage orchestration can omit final workspace undetected — The actual coverage CLI fixture records all eight visits and requires a final server floor failure after preceding passes.
  - `[medium]` `[patch]` G3: License inspection violations lack CLI exit assertion — The actual license CLI installs an offline local GPL tarball and requires nonzero exit with package/version diagnostic.
  - `[medium]` `[patch]` E1: Pure-core global effects bypass checks — Same global-access normalization as B1/B3; dedicated source-location regressions cover all reported forms.
  - `[medium]` `[patch]` E2: Nonliteral imports/require evade import checks — Nonliteral import/require forms now emit unresolved-dependency diagnostics with exact source locations.
  - `[medium]` `[patch]` E3: Exports-map absent root/null target bypasses gate — Same root/null/conditional export resolution repair as B5, including exact null denial before wildcard fallback.
  - `[false]` `[reject]` E4: Board diagnostics do not run in aggregate — Both board suites were diagnostic-only and excluded from standard acceptance before this change. Binding preparation preserves diagnostic-only timing; all required blocking serial audit/a11y suites ran.
- Grouped patch entries: high 1, medium 10, low 1. Seventeen finding rows patched; one pre-existing medium deferred; six false rejected. Four fresh review contexts completed; queued launches replaced declined/cancelled retained-context attempts. No layer skipped.


### 2026-10-20 — Deterministic repair review pass
- verdicts: 6 findings — high 0, medium 0, low 0, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` R-B1: Root script phase still uses Node default concurrency — True existing scheduling, but no demonstrated defect: scripts finish before package tests via &&; all104 scripts passed in both exact root test and independent aggregate. No claim that every file globally runs serially.
  - `[false]` `[reject]` R-B2: Shared DB worker limit broadens serial execution without timing evidence — Retained pre-repair DB-only run19.25s/560passes, failed overlapping root DB73.08s/2timeouts after DB1worker, and final serial ordinary DB59.12s/560passes (trial59.06s). Serialization trades wall time for predictable subprocess startup. CLI coverage already had1worker; no performance threshold changed.
  - `[false]` `[reject]` R-I1: Repair diff alone lacks aggregate gate implementation — Incremental repair retains existing scripts/check.mjs. Independent full aggregate passed architecture/size/hygiene/licenses/capabilities/build/coverage/audit/a11y/typecheck, with source and matrix checks.
  - `[false]` `[reject]` R-I2: Workspace and DB serialization differ from named serial acceptance suites — Independent controls address reproduced DB/server overlap. Existing server test:audit-performance and web test:a11y each still use maxWorkers1;14audit/261a11y passed. Intent does not require parallel ordinary tests.
  - `[false]` `[reject]` R-I3: Scheduling diff alone does not prove domain equivalence — No production or assertion change in repair. Existing crash exit87, committed-row/prefix/WAL recovery checks unchanged;56focused and3277ordinary tests passed, plus full3159test coverage suite.
  - `[false]` `[reject]` R-I4: Three-file diff lacks acceptance evidence or a scheduling-specific new test — Runtime evidence is separately retained, including failing root command and final successful exact command, all8coverage reports, serial acceptance and matrix audit. No implementation-mirroring test required for manifest/config scheduling.
- All four fresh lenses completed; edge-case and verification-gap returned no findings. Review is scoped to this resumed three-file repair, not a replacement claim for the previous full implementation review. Platform capacity delayed the fourth launch; no layer was skipped. No patches or new deferrals; follow-up recommendation false for this pass.

### 2026-10-20 — Follow-up review pass
- verdicts: 47 findings — high 0, medium 10, low 21, false 16, maybe-false 0
- findings:
  - `[false]` `[reject]` B1: Board-diagnostics suites are not run by the gate — `carried` E4: diagnostic-only before this change and kept diagnostic-only by the binding preparation; blocking serial suites run.
  - `[false]` `[reject]` B2: parsedChunks are unverified against content/fileHash — Clients cannot supply parsedChunks (the MCP/HTTP request schemas accept `ImportSourceDocumentRequest`; only `prepareSourceDocumentImport` derives chunks server-side), so no reachable caller persists mismatched chunks.
  - `[low]` `[reject]` B3: About fifteen test call sites repeat the chunk-building expression — Test-only duplication with no wrong outcome; a fixture helper is new surface for no demonstrated harm.
  - `[medium]` `[defer]` B4: Manifests declare db devDependencies on server and server on web — db tests import server use cases (pre-existing before this diff); the manifests now declare them truthfully while the boundary gate exempts tests from layer direction. Deferred as pre-existing test coupling.
  - `[low]` `[reject]` B5: server `test:coverage` does not build web first — `check.mjs` builds before coverage and a missing web `dist` fails loudly; a second build per run would be wasted work.
  - `[low]` `[reject]` B6: The 60 floor appears in nine places — The script is the authoritative floor and configs only fail earlier; sharing a base config is new surface for no demonstrated divergence.
  - `[false]` `[reject]` B7a: Hygiene output omits the offending word — The matrix requires category/path/line and forbids echoing matched content.
  - `[low]` `[reject]` B7b: `check.mjs` runs hygiene and capabilities twice — Redundant cost only; skip flags would add complexity.
  - `[medium]` `[patch]` B7c: `verify.mjs` no longer enforces source size — Hygiene used to report the 750-line limit and `verify.mjs` ran it; size moved to `check-size`. `verifyChecks` now runs `check-size`, and the aggregate test asserts it.
  - `[false]` `[reject]` B8: check-hygiene git-state edge cases — Tracked-only scanning is the specified scope, a deleted tracked file fails with an explicit ENOENT asserted by the existing test, and the signature set is finite by design.
  - `[low]` `[reject]` B9a: `check.mjs` runs main at import time — No module imports `runQualityGate`; guard would be speculative.
  - `[false]` `[reject]` B9b: The new exit-code line is overwritten and interrupt defaults to 0 — The overwrite occurs only on non-interrupt errors; interrupts keep `interruptExitCode`, which the three new CLIs set to 1, and the SIGINT/SIGTERM tests assert 1.
  - `[low]` `[reject]` B10: License obligation text is unused data — Cosmetic; the policy is a compatibility allowlist and the command reports that upstream obligations remain.
  - `[low]` `[patch]` B11: `readStylesheet` silently skips unmatched `@import` — Now throws on any unresolved `@import`; both consuming suites pass.
  - `[low]` `[reject]` B12: Misformatted extractions and an undocumented 50-line rule — The limit is in the intent contract; formatting is cosmetic.
  - `[low]` `[reject]` B13: Audit refactor shares one mutable state bag without new error-path tests — Behavior-preserving extraction; the existing audit and performance suites pass and no wrong outcome was shown.
  - `[low]` `[reject]` B14: db barrel gained exports — Required by the feature-entrypoint and workspace-entrypoint rules; no wrong outcome.
  - `[low]` `[reject]` B15: Root manifest ordering and quote style — Cosmetic.
  - `[low]` `[patch]` E1: `isTest` runs on absolute paths — A checkout under a directory named `fixtures` classified every file as a test and skipped layer, purity and production-use checks; now classified relative to the checked root, with a nested-root regression test.
  - `[low]` `[patch]` E2: Coverage exclusion runs on absolute paths — Same root cause as E1; relative classification applied.
  - `[medium]` `[defer]` E3: db manifest depends on server — Same pre-existing test coupling as B4.
  - `[low]` `[reject]` E4: Core purity misses aliased or non-call references — Syntactic gate by design; flagging references would false-positive on `Date` types and needs data flow.
  - `[low]` `[reject]` E5: Inline `{ type X }` import is not classified as type-only — Affects only a types-only export condition; no workspace uses one.
  - `[low]` `[reject]` E6: Scoped `@types/a__b` names are not mapped — No such dependency exists.
  - `[low]` `[reject]` E7: Stale-report mtime test on coarse filesystems — The stale report requirement is specified and the report directory is removed before each run; supported platforms have fine-grained mtimes.
  - `[false]` `[reject]` E8: An interrupt that does not throw exits 0 — If the action resolves, every gate completed successfully; an interrupted child throws `AbortError` and exits 1 (asserted).
  - `[low]` `[reject]` E9: Gzip expansion unbounded and other archives unscanned — Tracked inputs are the repository's own files; tracked archives are gzip only.
  - `[false]` `[reject]` E10: Hygiene diagnostics omit package and rule — The matrix specifies category/path/line for hygiene.
  - `[medium]` `[patch]` E11: Release verify lost the size gate — Same defect as B7c.
  - `[medium]` `[patch]` E12: Missing English-scan inputs are silently skipped — The previous scan failed when a listed file was absent; `checkHygiene` now fails when any listed file or directory has no tracked file, with a fixture test.
  - `[false]` `[reject]` E13: Stale check makes production snapshots throw — Every database is fully migrated before export, so a missing classified table is schema drift that must fail fast.
  - `[medium]` `[patch]` E14: A workspace missing from the coverage list is never checked — `checkCoverage` now fails when any workspace with a manifest is absent from `logicWorkspaces`; test added.
  - `[false]` `[reject]` E15: Database trusts caller chunks — Same refutation as B2.
  - `[low]` `[reject]` E16: One-line functions evade the 50-line limit — The intent bounds physical lines and forbids minification as a conduct rule; no line-length limit was requested.
  - `[medium]` `[patch]` V1: Aggregate order and later-step failure are untested — `scripts/quality-gates.test.mjs` runs the real `check.mjs` against stub gates and a fake Corepack, asserts the exact 14-step order and that a failing last step exits 1 without the completion message.
  - `[medium]` `[patch]` V2: Authored-source walk is untested — A fixture test asserts CSS/HTML/fixture inclusion, scripts root, dist/coverage/node_modules/generated exclusion and symlink refusal.
  - `[medium]` `[patch]` V3: Real-tree size and DB-import checks left default test and verify paths — Same defect as B7c.
  - `[low]` `[defer]` V4: Sync-service cycle repair has no regression guard — Pre-existing cycle; the spec reports cycle evidence separately and does not request a global acyclicity gate.
  - `[low]` `[reject]` VO1: Duplicate hygiene and capabilities runs — Same as B7b.
  - `[false]` `[reject]` VO2: parsedChunks accepted without validation — Same refutation as B2.
  - `[false]` `[reject]` A1: No test runs `check` on the actual tree — The actual-tree row is verified by the verification commands, not an ordinary test (it would recurse); the aggregate CLI is now exercised end to end on a fixture.
  - `[false]` `[reject]` A2: Classification is enforced only through the db test — That test runs in the db coverage step of the aggregate; the scope matches the plan.
  - `[false]` `[reject]` A3: Fixture directories may hold production logic — Inspected: they hold test support imported only by test files.
  - `[false]` `[reject]` A4: Extracted tests relocate code without proof they still run — `carried` I6: full suites and counts ran.
  - `[medium]` `[defer]` A5: Hygiene detects German only — `carried` I3: already deferred.
  - `[false]` `[reject]` A6: Manifest changes exceed demonstrated violations — Each added dependency is demanded by the undeclared-dependency rule or the coverage provider.
  - `[false]` `[reject]` A7: Online audit separated only by omission — The intent only requires it to stay outside the blocking aggregate.
- Grouped patch entries: medium 5 (verify size gate, English scope, coverage workspace list, aggregate order test, source walk test), low 2 (root-relative test classification, stylesheet import guard). Two entries deferred.

## Design Notes

Investigation validates the detail plan and adds actual source debt to the execution map; it does not lower thresholds. Authored source roots are the existing application/package/script roots; planning, archived evidence and BMAD/vendor sources are not product source. Tests and React callbacks are functions under the50line rule. Preserve lexical state/hooks through cohesive extraction, not compression or suppression. Coverage generated files may be excluded only when their generation/parity is independently checked; untested executable modules remain included. Offline license compatibility retains upstream license obligations and does not certify publication readiness.

Primary references checked2026-10-20: https://vitest.dev/guide/coverage.html and https://www.mozilla.org/en-US/MPL/2.0/FAQ/ . Record actual installed provider/config behavior during implementation. No code-review-graph tool is exposed; source/tests are authoritative.

## Verification

**Commands:**

- `corepack pnpm install --frozen-lockfile` under Node24 — matching installed dependencies and lockfile; no user credentials.
- `corepack pnpm check` under Node24 — all local gates, all tests/per-workspace coverage, serial audit-performance/a11y, typecheck and build pass; record exact gate/test counts/percentages and matrix fixture execution. Tests must include nonzero aggregate propagation and all failure categories above.
- `node scripts/verify.mjs` under Node24 — existing authoritative release verification remains passing, optional live health not required without an owned test runtime.
- `git diff --check HEAD` — clean whitespace including staged additions; compare protected working/index hashes against initial capture and report external changes without restoring them.

## Changelog

- 2026-10-20 v4: Label the historical orchestrator feedback path as local-only rather than a distributed document link; preserve the reported finding.

- 2026-10-20 v3: Resume after deterministic ordinary-test failure; serialize root workspaces and share the DB worker limit, preserve assertions/deadlines/frozen intent, retain reproduced failure and independently repeat all gates.

- 2026-10-20 v2: Implement complete local quality gates, preserve behavior through required extraction, triage all24review rows, repair demonstrated bypasses and fixture ownership, and independently verify the final candidate. Preserve protected orchestration bytes and staged finalization.
- 2026-10-20 v1: Planned from binding preparation, two source investigations, strict violation inventory and current runtime/test stack; preserve orchestrator ownership.


## Deterministic Verification Repair — 2026-10-20

Resume the existing implementation; do not reimplement completed tasks. The orchestrator feedback at `.bmad-loop/runs/20261019-231402-3e0a/feedback/8-3-quality-gate-scripts-1.md` (local-only orchestrator feedback, not distributed) reports `corepack pnpm test` failing on database subprocess tests exceeding the unchanged 5000ms deadline: migration transaction crash recovery and crashed uncheckpointed WAL restore (three failures in total, the first failure is truncated in feedback). Diagnose ordinary test scheduling and fixture lifecycle; repair the demonstrated failure without weakening assertions, timeouts, coverage floors or the frozen contract. Read orchestrator feedback only; never change its files.

- [x] Repair the ordinary deterministic verification failure and run the exact failed `corepack pnpm test` command under Node 24 in addition to the Verification commands above.
- Protected sprint bytes at repair entry differ by worktree/index: worktree SHA256 `c94217f7e45d2ad4c8d89a97e9de0e3e2c28e2eabd98e425b4545d2ba58762d7`, index SHA256 `a276506882f729c8d2181f9049a0175916af9cbab7851d12ee73074965f44233`. Preserve both separately; this is orchestrator bookkeeping, never restore either to the older snapshot. Frozen contract SHA256 `88d8084ba3fb2b460c4346fd315b9a12f7693f4d15e0bb55092e038db69bd4a7`.

Repair implementation: root `test` now uses `--workspace-concurrency=1`; DB `test.maxWorkers=1` covers ordinary and coverage runs, replacing its coverage-only CLI flag. No assertions, fixtures, deadlines, coverage denominator/floor or production code changed. Exact root `corepack pnpm test` passed104script +3173package tests. Parent independently passed frozen install, complete `pnpm check` (104script/3159coverage/14audit/261a11y, all8floors), standalone release verification and all8matrix rows. Logs retained under [repair evidence](evidence/story-8-3/repair-log-manifest.json), including the intermediate2migration-timeout failure with DB workers limited but workspace overlap still active. Fresh review of this resumed iteration concerns the three-file scheduling repair; the previous full implementation's24-row review remains recorded above.

## Auto Run Result

Status: done

- Summary: Follow-up review pass over the complete 8.3 diff (four fresh lenses, 47 rows). Seven findings were patched in two grouped fixes; two entries were deferred.
- Files changed this pass: `scripts/check-boundaries.mjs` and `scripts/check-coverage.mjs` (classify tests relative to the checked root; coverage fails when a workspace is missing from the floor list), `scripts/verify.mjs` (release verification runs `check-size` again), `scripts/check-hygiene.mjs` and its test (fail when an English-scan input has no tracked file), `scripts/quality-gates.test.mjs` with `scripts/fixtures/quality/gate-{corepack,stub}.fixture` (end-to-end aggregate order and last-step failure, authored-source walk, unlisted workspace, nested-root classification), `apps/web/src/test-fixtures/styles.ts` (unresolved `@import` throws).
- Review findings: patched medium 5 (verify size gate, English scope, coverage workspace list, aggregate order test, source walk test) and low 2 (root-relative test classification, stylesheet import guard); deferred 2 (db tests import server: medium; no sync-cycle regression guard: low); I3 carried as already deferred; rejected the rest with reasons in the triage log (16 false, 20 low).
- Follow-up review recommendation: false. No `high` entry was patched in this follow-up pass.
- Verification (Node 24.17.0, Corepack pnpm): `node --test scripts/*.test.mjs` 106 passed; `node scripts/verify.mjs --skip-typecheck --skip-build` completed (261 a11y tests); web typecheck passed; complete `corepack pnpm check` passed after all patches with floors contracts 91.34%, importers 100.00%, github 91.19%, core 93.14%, db 93.70%, mcp 83.33%, web 87.80%, server 94.88%; `git diff --check HEAD` clean.
- Residual risks: native/Windows/Linux/reader acceptance remains unexecuted (Story 8.4); the English guard is German-token based; sprint-status.yaml was not written, staged or reverted and remains dirty in the working tree as orchestrator bookkeeping.
