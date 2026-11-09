---
title: '8.8 Versioned releases'
type: feature
created: '2026-10-20'
status: done
baseline_revision: 8161081f43c794f3ddf77c516ccc2a64c8601b16
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-8-8-versioned-releases.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      Actual hosted release automation and native acceptance remain unverified.
    evidence: |-
      Local fixture success and workflow syntax do not establish real GitHub execution. A separately authorized exact-tag run with all three quality job URLs, blocking audit output, authenticated raw/peeled tag checks, accepted exact publication evidence and confirmed release outcome would settle hosted behavior. No real tag, push or release was performed. Existing Windows/Linux quickstart, native browser/reader/clipboard, credential and interrupted-push prerequisites remain open.
    location: >-
      .github/workflows/release.yml; docs/RUNBOOK.md
    severity: >-
      medium (unverified)
---

# Story 8.8: Versioned releases

Date: 2026-10-20. Version: 2.

Reproducing statement: Implement root application version metadata, deliberately tagged releases with blocking checks and reviewable notes, and accurate Project upgrade instructions; never write or revert orchestrator sprint-status.yaml.

<intent-contract>

## Intent

**Problem:** Application version consumers duplicate metadata access or advertise a literal; tagged-release automation is absent. Users need consistent versions, truthful release notes and a safe documented Project upgrade path.

**Approach:** Share validated root metadata across server surfaces. Build exact tagged revisions on three platforms and publish generated notes only after successful quality, advisory and fresh exact-candidate content checks.

## Boundaries & Constraints

**Always:** Root package.json is authoritative in source and compiled execution. Keep application, database, payload and operation versions distinct. Reuse existing migrations, pnpm check, safe audit parser and exact publication scanner. Tags follow strict v<SemVer> and exactly match root version and checked-out revision. Publication input includes generated notes and full history. Policy remains explicit private transient input; missing policy blocks. Preserve private-declaration/history/rights/native acceptance prerequisites.

**Never:** Write/revert sprint-status.yaml, alter deferred-work.md, infer verification from orchestrator rows, create commits/tags/pushes/releases, rewrite history, weaken gates, invent identity/provenance or private policy, add installers/npm publication/updaters/network behavior to the app, or change migration semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Version | Valid changed root SemVer, different workspace versions | Actual health, archive and MCP metadata agree, source and compiled | None |
| Invalid metadata | Missing/invalid JSON, wrong root identity or invalid SemVer | Startup refuses with cause and next action | No literal or cwd fallback |
| Release | Exact matching tag/revision, all three platform checks and gates pass | Publish notes for selected reachable release range | No automatic tag creation |
| Rejected candidate | Invalid/mismatched tag/version/revision; failed/skipped platform; high/critical advisory; unavailable/malformed audit | Publishing unreachable | Nonzero failure |
| Rejected content | Missing/invalid policy, unresolved/unsupported content, actual private markers, stale evidence or changed notes | Publishing unreachable | Fresh scan plus recomputed verification |
| Project upgrade | Supported older journal or prototype/newer/divergent input | Existing protected migration or actionable refusal | Preserve backups/manual recovery |

</intent-contract>

## Code Map

- Clean main baseline above; metadata refresh succeeded. Cached epic8 context valid. Previous done spec8.7 supplies continuity but no publication clearance. Three read-only investigators inspected source; graph tools unavailable in this session.
- `apps/server/src/http/routes/infrastructure-routes.ts`: /api/health duplicate APP_VERSION reader. `/health` is the operational liveness endpoint and must retain its contract.
- `apps/server/src/services/project-archive.ts`: duplicate APP_VERSION drives export manifest; HTTP export is GET /api/projects/export?projectId=....
- `apps/server/src/mcp/http.ts`: createSession advertises literal 0.1.0. `packages/mcp/src/transports/server.ts` already accepts supplied version. `scripts/mcp-bridge.mjs` forwards initialized serverInfo rather than owning another app version.
- Proposed `apps/server/src/app-version.ts`: ascend module ancestors to pnpm-workspace.yaml anchor; strictly read/validate that root package once. Stop at anchor on invalid metadata. Compiled output is nested dist/apps/server/src, so fixed source-relative package paths fail.
- Existing `apps/server/src/http/routes/project-archive.test.ts`, MCP transport tests and root static fixture conventions provide outer-surface reuse. Compiled fixture needs explicit compiled workspace alias mapping and source config/failures.mjs copied to equivalent output; source aliases alone do not establish compiled execution.
- `.github/workflows/ci.yml`: immutable checkout/setup-node pins, Node24, Corepack0.35.0, frozen install, native SQLite and three quality jobs. Preserve read-only PR and informational audit behavior. Reuse these contracts in proposed `.github/workflows/release.yml`.
- `scripts/ci-audit.mjs`: scanAudit/auditOutcome validates JSON/counts/exit consistency without printing scanner content. Release requires counts with high=critical=0, including rejection of unavailable/invalid outcomes.
- `scripts/check-publication{,-audit,-content,-git}.mjs`: runPublication explicit --policy; parsePolicy requires employerTerms. Scanner includes working/index/new files, all refs and authenticated Git objects; exact verification includes tools, policy digest, refs and fingerprints. A tag invalidates an older report. Generate notes before fresh scan, then verify immediately before publication. Do not edit current blocked publication-audit.json as implementation evidence.
- Release helpers proposed under `scripts/release*.mjs`, static notes template and fixture tests: strict SemVer/tag/root/revision validation; previous reachable valid version-tag range or full ancestry for first release; deterministic reviewable notes without private authors/bodies/annotations. Any commit text included must be escaped and included in exact content scan. Use explicit secret PUBLICATION_POLICY through environment, never shell interpolation or log values, transient out-of-repository input. Only publishing job receives contents:write; token only publishing step.
- `packages/db/src/migration-runner.test.ts`: populated every-table successor, JSON layout, pre-migration snapshots/retention, interruption/reopen and unchanged refused inputs already cover upgrade engine. Read-only implementation boundary.
- `docs/RUNBOOK.md`, `CONTRIBUTING.md`: replace future-release statements with actual maintainer tagging/gates/notes instructions; preserve upgrade/recovery and all publication/native/hosted limits.

## Tasks & Acceptance

**Execution:**

- [x] `apps/server/src/app-version.ts` and three consumers — consolidate strict root metadata without changing unrelated version counters.
- [x] Version integration tests and static fixtures — mutate disposable root metadata, assert actual source/compiled health, archive and HTTP/stdio MCP versions, and actionable missing/invalid refusal.
- [x] `.github/workflows/release.yml`, required small `scripts/release*.mjs` helpers/template — immutable tag checkout; three-platform builds/checks; blocking safe audit; selected-range notes; fresh content scan/verification; permission-scoped publication.
- [x] `scripts/release*.test.mjs` and disposable fixtures — exercise every refusal above and prove the real publishing command is never admitted on gate failures. Validate workflow dependency/permission contracts and syntax.
- [x] `docs/RUNBOOK.md`, `CONTRIBUTING.md` — document root version, matching maintainer tag, actual release commands/gates, explicit private policy provisioning, supported migration/prototype refusal/recovery and remaining acceptance prerequisites.
- [x] Run focused version/release/migration regressions, full aggregate and standalone verifier, independent review, final verification; retain accurate evidence without creating a real release.

**Acceptance Criteria:**

- Given changed root metadata, when real source and compiled server surfaces execute, then health, exported manifest and MCP initialization including stdio advertise the same root version.
- Given a deliberately matching SemVer tag, when release automation executes, then it builds that immutable revision on all three OSes and publishes scanned notes only after successful quality, safe advisory and fresh publication gates.
- Given any failed/skipped quality, invalid metadata/revision, high/critical advisory, scanner failure, unresolved declaration/content or stale/changed candidate, when release automation evaluates, then no release write runs.
- Given supported older or prototype Project folders, when the existing release migration boundary opens them, then protected upgrades or actionable refusals remain verified and documented.
- Given unexecuted hosted/native publication prerequisites, when local evidence is recorded, then it names those limits and never claims a real tag/release occurred.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass

- verdicts: 17 findings — high 1, medium 8, low 2, false 5, maybe-false 1
- findings:
  - `[medium]` `[patch]` E1 (edge): Partial transient-policy writes can retain private input. — privatePolicy writes before publishRelease enters its cleanup finally; an interrupted/failed write can leave its owned file. Added construction finally cleanup, focused ENOSPC classification and unchanged unexpected-error propagation; partial-write and error-identity tests pass.
  - `[low]` `[patch]` E2 (edge): A bridge exiting before its first line leaves the fixture waiting for its outer timeout. — The response awaits only readline line; child close cannot settle that promise. Raced first response with close/error, retained bounded diagnostics and added static exit-23 source/compiled assertions.
  - `[medium]` `[patch]` B1 (blind): Replacement-pattern commit subjects corrupt generated notes. — Parent actual generateNotes probe retained {{COMMITS}} and lost the literal subject; string replacement interprets dollar patterns. Inserted generated subjects with a callback and asserted literal dollar replacement sequences.
  - `[high]` `[patch]` B2 (blind): A replacement annotated tag with the same commit escapes the scanned object identity. — Parent actual verifyRemoteTag probe admitted a different raw tag object when its peeled commit matched; local scan covers only the original annotation. Captured the raw local tag object and compared remote raw identity plus peeled commit; same-commit replacement annotation is refused.
  - `[medium]` `[patch]` B3 (blind): Accepted publication report and policy digest are not retained for maintainer evidence. — The report remains only in the ephemeral checkout and gh output is suppressed. Release notes themselves do persist in the created release; retain the sanitized report and notes digest in workflow output. Emitted the accepted sanitized exact report and notes SHA256 to workflow output before the write; tests exclude policy values and token input.
  - `[medium]` `[patch]` B4 (blind): Generic CLI failure hides causes and next actions. — The catch emits one message for all failures; after a create timeout, its no-release claim can also be false because the remote outcome is unknown. Added fixed allowlisted cause/action categories and an explicitly unconfirmed write outcome; actual CLI and timeout tests withhold raw diagnostics.
  - `[medium]` `[patch]` B5 (blind): Preview instructions require notes before the local tag that the command requires. — The runbook prerequisite precedes tag creation, while validateCandidate requires the matching local tag and four event variables. Documented an independent disposable clone with its local preview tag and explicit event environment, followed by original-repository tag review and separately authorized push.
  - `[false]` `[reject]` B6 (blind): Duplicated SemVer admission could silently diverge. — Both current readers enforce the same strict grammar and 64-character bound; no currently divergent input was identified. The release validator must run before workspace dependencies are installed. Hypothetical future divergence is not an observed defect.
  - `[low]` `[patch]` B7 (blind): Bridge first-line wait does not settle on child exit. — Same verified first-line promise defect as E2; preserve a separate reviewer row. Raced first response with close/error, retained bounded diagnostics and added static exit-23 source/compiled assertions.
  - `[medium]` `[patch]` B8 (blind): Release range lacks competing, annotated, merged and tie boundary tests. — The one-prior-tag fixture cannot detect ordering regressions; all these branch/range cases are absent. Added competing, annotated, unreachable, merged and equal-distance tag fixtures asserting exact included commits.
  - `[medium]` `[patch]` V1 (verification): The actual release audit CLI dispatch is untested. — Preverified: existing tests invoke requireAudit/auditOutcome, never releaseMain or the CLI; removing dispatch leaves assertions green. Executed actual audit CLI against the existing deterministic scanner fixture for accepted and blocked outcomes.
  - `[medium]` `[patch]` V2 (verification): Nearest-boundary selection among multiple previous release tags is untested. — Preverified: reversing the distance comparator passes the only eligible previous-tag test; resulting notes can repeat earlier releases. Added competing, annotated, unreachable, merged and equal-distance tag fixtures asserting exact included commits.
  - `[false]` `[reject]` I1 (intent): A source diff cannot establish workflow execution. — The activation command, rendered workflow, delegated implementation and reviews were actually executed; source-only review is not the run evidence. Retained command results establish execution.
  - `[maybe-false]` `[defer]` I2 (intent): Local fixtures do not establish a hosted release or real three-platform execution. — No hosted run or real release is authorized/executed. A separately authorized exact-tag hosted run with all three job URLs and authenticated remote checks would settle operational behavior; local success does not claim it.
  - `[false]` `[reject]` I3 (intent): Runtime identity tests exercise the relevant version surfaces directly. — This is positive alignment, not a defect: actual source/compiled health, archive, HTTP MCP and stdio assertions passed.
  - `[false]` `[reject]` I4 (intent): The diff adds no migration behavior or new upgrade tests. — Migration changes were not needed: existing 27 focused regressions passed and were included in the parent full DB coverage run; documentation preserves the inspected boundary.
  - `[false]` `[reject]` I5 (intent): Test definitions alone do not prove execution or verification status. — Parent command-start file/index evidence and successful aggregate/verifier exits are independent of all sprint rows; no bookkeeping value was used as proof.

Nine patch groups: high 1, medium 7, low 1. Eleven finding rows patched, five rejected, one unverified deferral. All four lenses completed; the concurrency limit required two waves, with triage beginning only after every result. Review diff omitted the claims spec to preserve the instructed blind/verification separation; the edge lens alone received its path. No second post-patch reviewer is claimed.

### 2026-10-20 — Review pass (follow-up)

- verdicts: 33 findings — high 0, medium 4, low 17, false 10, maybe-false 2
- findings:
  - `[false]` `[reject]` carried B6 (blind): Duplicated SemVer regex in server and release validator. — Carried: both enforce the same strict grammar and 64-character bound; no divergent input shown.
  - `[low]` `[reject]` B-2 (blind): Workspace-root search exists in `app-version.ts` and `hostConfigs`. — The `hostConfigs` search is pre-existing and locates a different anchor; no divergence named.
  - `[false]` `[reject]` B-3 (blind): `APP_VERSION` throws at import time. — Startup refusal with cause and next action is the specified behavior in the I/O matrix.
  - `[low]` `[reject]` B-4 (blind): Compiled test copies `failures.mjs` into `dist`. — `tsc` has no `allowJs`, so the `.mjs` import is never emitted; this is pre-existing and nothing executes `dist` (the launcher uses tsx); the spec Code Map prescribes the copy.
  - `[false]` `[reject]` B-5 (blind): Test fixture ships in `dist`. — `apps/server/tsconfig.json` has no `allowJs`, so `src/fixtures/app-version.mjs` is not emitted.
  - `[low]` `[reject]` B-6 (blind): `before()` builds the server and a 10 s wall-clock assertion could flake. — The fixture's own 10 s child kill bounds the run; the build mirrors the `pnpm check` order; flake is not demonstrated.
  - `[low]` `[reject]` B-7 (blind): Policy-location assertion uses `/` and is vacuous on Windows. — `privatePolicy` enforces externality with `relative(realpath)`; the assertion is redundant extra coverage.
  - `[medium]` `[patch]` B-8 (blind): Commit subjects containing `@name` (for example `@types/node`) become mentions in the published notes. — Verified: the escape set omitted `@`. Appended a zero-width space after each `@`; a test asserts it and the unchanged subject text.
  - `[low]` `[reject]` B-9 (blind): Tie-break is lexical, not SemVer. — Equal-distance ties are rare and typically tags on one commit, which give the same range; the tie test already pins determinism.
  - `[false]` `[reject]` B-10 (blind): `release-notes.md` is not git-ignored. — The untracked notes file is intentionally part of the publication scan; `wx` refuses overwrite and the runbook uses a disposable clone.
  - `[low]` `[reject]` B-11 (blind): Candidate validation runs three times. — The later call is the intentional tag-identity recheck after the scan; the first is cheap fail-fast.
  - `[low]` `[reject]` B-12 (blind): Diagnostics are lossy; a re-run reports an unconfirmed write. — The fixed categories were added in the first pass (B4); "unconfirmed" is accurate when a prior release exists or the write timed out.
  - `[low]` `[reject]` B-13 (blind): Workflow setup repeats across jobs, no timeouts or environment gate. — Mirrors `ci.yml`; named harm absent; an environment gate is hardening beyond the intent.
  - `[low]` `[reject]` B-14 (blind): Runbook release procedure is POSIX shell. — Maintainer-only procedure; no user harm named.
  - `[low]` `[reject]` B-15 (blind): Changelog entry spacing differs. — Cosmetic.
  - `[low]` `[reject]` B-16 (blind): Import placement in `project-archive.ts`. — Cosmetic.
  - `[low]` `[reject]` B-17 (blind): No CLI happy-path or template-placeholder tests. — Notes tests already assert the commit list and absence of template markers; the added create-argument test covers the dispatch path.
  - `[low]` `[reject]` B-18 (blind): No ADR, README pointer or CODEOWNERS for release governance. — Story 8.8 and the epic preparation record the decision; tag protection is a repository setting outside this change.
  - `[low]` `[reject]` E-1 (edge): Unreadable root metadata (EISDIR/EACCES) in `validateCandidate` prints the generic failure. — Fails loudly with a nonzero exit; only the category text differs.
  - `[low]` `[reject]` E-2 (edge): Missing local tag is reported as git-input-unavailable. — `fetch-depth: 0` fetches tags; failure remains closed.
  - `[medium]` `[patch]` E-3 (edge): `@user` mentions in commit subjects. — Same root cause as B-8; fixed with it.
  - `[maybe-false]` `[reject]` E-4 (edge): `+` build metadata in the tag may not resolve through the API path. — Unverified locally; if true it blocks only build-metadata tags and fails closed (low), so not deferred.
  - `[low]` `[reject]` E-5 (edge): Re-run after a published release is reported as unconfirmed. — Same as B-12.
  - `[false]` `[reject]` E-6 (edge): A second tag at distance 0 is skipped as range base. — A tag on the candidate commit adds no history; the range correctly starts at the nearest earlier release.
  - `[low]` `[reject]` E-7 (edge): `localeCompare` tie-break is locale dependent. — Same as B-9.
  - `[medium]` `[patch]` V-1 (verification): `gh release create` arguments (prerelease, target, repo, notes file) are unasserted. — Preverified: inverting the prerelease condition passes. Added a test asserting the full argument list for a stable and a `-rc.1+build` candidate.
  - `[medium]` `[patch]` V-2 (verification): Workflow gate commands and the `RELEASE_CHECKS` mapping are only text-counted. — Preverified; its filed defer is overridden by a cheap test-only fix. The workflow test now asserts each job's command and evaluates the mapping.
  - `[false]` `[reject]` carried V-3 (verification, other): No test aligns the three SemVer definitions. — Carried from B6.
  - `[false]` `[reject]` I-1 (intent): Compiled mode runs through tsx with a remapped tsconfig. — The compiled `dist/*.js` modules are what execute (asserted by `import.meta.resolve`); the product has no separate `node dist` entry.
  - `[false]` `[reject]` I-2 (intent): Stdio version is observed only through the bridge. — The bridge is the stdio surface and forwards the server's `serverInfo`; the spec Code Map names it.
  - `[maybe-false]` `[defer]` carried I-3 (intent): Hosted three-OS execution is not established locally. — Carried: already recorded in `deferred`; no new item.
  - `[false]` `[reject]` carried I-4 (intent): Migration behavior changes only in documentation. — Carried: no migration change was required.
  - `[false]` `[reject]` I-5 (intent): Runbook anchors and evidence limits. — The `#supported-upgrades`, `#human-restore` and `#restore-and-upgrade-recovery` headings exist in `docs/RUNBOOK.md`; limits are stated.

Three patch groups (mention neutralization, create-argument assertions, workflow wiring assertions): medium 3, no high. Verification: `release*.test.mjs` 32/32, `app-version.test.mjs` 16/16, `node scripts/verify.mjs --skip-typecheck --skip-build` completed.

## Design Notes

Workspace anchor discovery handles source and nested compilation without an arbitrary version fallback. Existing launcher still uses tsx; compiled tests must exercise actual compiled modules explicitly. Current publication verdict is blocked and remains so until maintainer history/private-detail/rights decisions; implementing a gate is not clearing it. Fresh hosted scanning is required because adding a tag and changing tools invalidates a previously committed report. Instructional marker mentions do not count as unresolved declarations.

## Verification

- Use installed Node24.17.0 and pinned pnpm9.15.4.
- Focused root release fixtures and server version/transport/archive tests; migration-runner tests.
- `corepack pnpm check` and `node scripts/verify.mjs`: expected success; retain actual counts/exits.
- actionlint and YAML/workflow contract validation; exact paths and linked operational instructions.
- No hosted jobs, actual tag/push/release, Windows/Linux or new native reader acceptance is claimed by local fixture success.

## Verification evidence before final run

The parent pre-review `corepack pnpm check` and standalone `node scripts/verify.mjs` each exited 0 under Node24.17.0/pnpm9.15.4. Aggregate:202 root passes/two native-byte skips,3159 coverage tests/all eight floors,14 serial audit-performance and261 accessibility tests. Command-start file hashes and index bytes were independently compared after the aggregate and were unchanged. These checks preceded formal review repairs and do not substitute for the final run.

Matrix audit: version/invalid metadata rows map to actual source/compiled health, archive and HTTP/stdio MCP fixtures; release happy/refusal rows map to actual publication recomputation with a stubbed write, real audit CLI fixtures and workflow dependency checks; content refusals include declarations, unsupported inputs, notes/refs and scanner failure. Project upgrade/refusal uses27 existing migration regressions, also included in complete DB coverage. No relevant test was skipped; the two inherited native-byte skips concern separate publication filesystem inputs.

Evidence lives under `evidence/story-8-8/`: original/decoded/compressed SHA256 values distinguish sanitized retained logs from raw streams. Initial implementation fixture failures have transcript summaries only, not invented original logs. A fake read-only gh-api fixture attempt and its removed owned state artifact are recorded; no state value was read/retained and final tests stub remote calls.

## Auto Run Result

Status: done

Summary: Shared root application version across health, archive and MCP; tag-triggered release workflow with scripts for validation, audit, notes and guarded publication; documentation for tagging, gates and Project upgrades.

Follow-up pass changes: `scripts/release-candidate.mjs` neutralizes `@` mentions in generated notes; `scripts/release.test.mjs` asserts the `gh release create` arguments for stable and prerelease candidates, the workflow job commands and the `RELEASE_CHECKS` mapping, and mention neutralization.

Review: 33 findings; 3 patch groups applied (medium), 0 deferred anew (the hosted-execution deferral is carried), 30 rejected with the recorded reasons.

Follow-up review recommendation: false. No high finding was patched in this follow-up pass; patched counts: medium 4 rows in 3 groups.

Verification: `release.test.mjs`, `release-range.test.mjs`, `release-cli.test.mjs` 32 passed; `app-version.test.mjs` 16 passed; `node scripts/verify.mjs --skip-typecheck --skip-build` completed. Full aggregate was not re-run after these test-and-string patches.

Residual risks: hosted three-platform execution, a real tag and release, Windows/Linux quickstart and native acceptance remain unexecuted.

## Changelog

- 2026-10-20 v2: Complete shared versions, guarded releases, four-lens review, nine repair groups and final local verification; retain publication/native prerequisites and orchestrator ownership.
- 2026-10-20 v3: Follow-up review pass; neutralized notes mentions and tightened release-argument and workflow-wiring tests.
