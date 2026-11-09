---
title: Resolve eight Epic4 retrospective actions
created: 2026-10-17
version: 2
type: bugfix
status: done
route: dispatch
baseline_commit: 4b9f847e60e4442f31e2a3e76a425d6148bb885b
review_loop_iteration: 0
context: []
---

Reproducing statement: Implement the explicitly approved A1–A7/P1 plan, independently verify it, commit eight scoped changes in order, then close exactly those action items. Date:2026-10-17. Version:2.

<frozen-after-approval reason="user explicitly requested implementation of the complete plan and its confirmed decisions">

## Intent

**Problem:** Epic4 retrospective records a confirmed reserved-operation-ID allocation defect plus source error, snapshot scaling, duplicated effect/construction, implicit persistence-order and unsafe external-completion issues.

**Approach:** Implement A1–A7/P1 in that order with focused tests and separate Conventional Commits. A1 supports valid __proto__/constructor/toString IDs through submission/preview/approval/apply. A2 classifies reviewed-source permission failures. A3 scopes SQL snapshots. A4 bounds cloning/diffing using conservative resolver write collections and full-reference parity. A5 checks dependency/effect parity and removes duplicate GitHub mutation. A6 shares pure source construction. A7 declares persistence order. P1 replaces unsafe bulk reconciliation with explicit verified-manifest dry-run/apply and canonical installed locking/atomic primitives.

## Boundaries & Constraints

**Always:** Preserve current HTTP/MCP contracts, persisted schemas, ordering, ownership, atomicity, exact approval and independent historical outputs. Use Node24; preserve all raw benchmark samples/unchanged gates. Protect unknown run fields, sessions, preserve refs and journal prefix. P1 requires dead engine under lock, exact ancestor delivery commits, hashed spec/acceptance evidence, complete selected scope, successful configured verification and unchanged source fingerprints before writing. Test temporary runs only. Existing dirty Epic6/planning/OpenWolf content is explicitly authorized to remain in place and outside commits. User confirms keeping all eight independent goals and closing only their exact stable action IDs after final acceptance.

**Never:** Schema/index migrations, external installed-orchestrator edits, real-run mutation in development, label-only verification, guessed commits, resets/re-drives, push, previous Epic3 action changes, Epic6 implementation or unrelated cleanup. Expected source permission failures become conflicts; unexpected errors remain visible. No speculative rewrites of dependency or approval engines.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior | Failure handling |
| --- | --- | --- | --- |
| A1 | Reserved operation IDs or inherited/malformed supply | Own nonempty allocated strings; valid publication and exact apply | Controlled refusal of malformed allocations |
| A2 | EACCES/EPERM after reviewed source proposal | Operation-specific source conflict; no partial domain writes | Other errors propagate |
| A3/A4 | Same target plus large unrelated Projects/source text | Identical scoped snapshot/effects/order; less unrelated materialization and copying | No weakened ownership or timing gate |
| A5 | Aliases, placement, nullable/shared GitHub evidence and deletion | Transitive selection/preview/approved execution agree | Refuse invalid chains atomically |
| A6/A7 | MD/TXT new/dedup/revision and mixed FK changes | Deterministic equivalent chunks; explicit forward/reverse persistence order | Rollback remains complete |
| P1 | Explicit run/manifest; missing/tampered/stale/partial/live/locked/failed verification | Default read-only inspection; apply only after all required evidence/gates | Refuse before run mutation; preserve backup/history; repeat is safe |

</frozen-after-approval>

## Code Map

- `packages/db/src/repositories/operation-supply-repository.ts`, `packages/core/src/changesets/resolution-context.ts` and supply readers — caller-controlled dictionary identity boundary; no schema restriction.
- `apps/server/src/application/changeset/prepare-operation-supply.ts` and source preparation tests — reviewed file conflicts and prepared imports.
- `packages/db/src/repositories/operation-snapshot-repository.ts`, `source-evidence-repository.ts` — currently global materialization/dynamic evidence ID list; use scoped SQL subqueries/joins.
- `packages/core/src/changesets/operation-registry.ts`, `remaining-owners.ts` — before snapshots/collection diff and implicit publication effects; preserve independent output/history.
- `packages/core/src/changesets/operation-dependencies.ts` — separate dependency simulation; duplicate GitHub reconstruction; coordinate with A1 reader changes.
- `packages/db/src/repositories/sources-repository.ts` and pure core source constructor — shared supplied IDs/time/hash/parsed chunks; preserve intentional inline-path defaults.
- `packages/db/src/repositories/operation-persistence-repository.ts` — ENTITY_TABLES order currently drives FK ordering; declare it independently.
- `scripts/bmad-loop-reconcile-sprint.mjs`, repository Python worker/tests — exact run+manifest CLI; installed uv tool runtime and canonical locks/journal/atomic writer, raw-state preservation.

## Tasks & Acceptance

- [x] A1 supply dictionaries/readers and core/DB/actual HTTP/MCP regressions; independently check and commit first.
- [x] A2 source preparation permission conflicts and injected-error preview/apply atomicity tests; commit second.
- [x] A3 project SQL snapshots/evidence helper, empty/malformed owner/order parity and unrelated-large-Project measurements; commit third.
- [x] A4 unchanged baseline benchmarks, conservative write sets, copied-collection/reference effect and history independence tests, serial after measurements; commit fourth.
- [x] A5 mixed dependency/preview/selection/persisted-state cases and single GitHub registration path; commit fifth.
- [x] A6 shared pure source construction and MD/TXT parity/dedup/history cases; commit sixth.
- [x] A7 explicit complete unique persistence ordering and actual mixed FK insert/delete/update tests; commit seventh.
- [x] P1 strict CLI/manifest, canonical worker, complete failure/success/idempotency preservation matrix in temporary runs; commit eighth after final gates/status.
- [x] Final independent full-range review; all tests/typecheck/release verify; isolated actual-browser preview/deselection/human Approve/separate Apply and persisted Activity evidence.
- [x] Supported status updater marks only epic-4-retro-a1..a7 and epic-4-retro-p1 done with evidence; preserve previous actions and concurrent work.

**Acceptance Criteria:**
- Given all eight scoped changes, when focused and whole-repository checks plus actual browser acceptance run, then every matrix row has passing executed coverage and existing contract/transaction gates remain intact.
- Given parallel uncommitted Epic6 work, when the eight local commits finalize, then only task-owned files/handoff hunks are committed and no next-story/remote execution occurs.

## Implementation Notes

- Existing user-approved plan supplies scope/decisions/commit authorization; no new intent gap or irreversible operation. Footprint spans internal helpers/tests and one local CLI, not product APIs. Skill dirty-tree/multi-goal checkpoints are already explicitly resolved by the user’s plan.
- Renderer executed once successfully. Implementation stays sequential; initial A3/P1 investigations were read-only and paused until their turn. Baseline captured before source changes.

## Spec Change Log

Version1: approved eight-action plan grounded in current sources and recorded without new scope.

## Review Triage Log

Final three-lens review: edge-case `[]`; verification-gap no gaps; blind ten reports individually classified before grouping. The diff excludes the independently committed Epic6 files; OpenWolf comparisons start at that owner's commit.

| ID | Verdict | Evidence and route |
| --- | --- | --- |
| B1 hidden physical unlink → identity delete → owner edit | false | Removing physical membership leaves canonical `state.owners` intact. `readAddress` recursively reads it and `registerOperation` stamps the owner's previous write before `registerRemainingEffects` removes identity data, so the claimed owner dependency loss does not follow. Focused reproduction requested independently. |
| B2 verification output discarded | low | Failure still reports configured command index/exit; operator can execute that exact policy command for diagnostics. Retaining potentially sensitive output adds artifact lifecycle/permissions without changing refusal safety. Rejected under low-complexity rule; no gate or success proof weakened. |
| B3 interrupted-write fault injection missing | medium | Existing interrupted-backup and missing-receipt tests do not execute the four individual write-failure boundaries. Patch: temporary-run injection at journal, atomic state, ATTENTION and receipt, preserving backups/history and refusing unsafe repeat. |
| B4 Windows CRLF evidence | false | Repository `.gitattributes` declares `* text=auto eol=lf`, including Windows checkouts. Exact working/Git-blob SHA identity is deliberate approved evidence semantics; CRLF modification must fail that identity check. |
| B5 working executable mode omitted | medium | Byte digest and index digest miss a chmod applied only in the worktree. Patch: include working regular-file permission modes in the fingerprint; execute chmod mutation regression. |
| B6 populated board import full-reference branches | medium | Existing catalog executes an empty board case; populated paths have other behavioral tests but lack this complete clone/diff oracle. Patch: add populated/new/existing/cleanup oracle fixtures without weakening catalog completeness. |
| B7 hidden physical GitHub full-reference branches | medium | A5 effect/HTTP parity tests cover representation behavior, while A4 full-clone oracle lacks those explicit owner/deletion states. Patch: add full-reference owner reassignment/deletion cases with hidden attachment and immutable input assertions. |
| B8 run-artifact mutation tests | medium | Fingerprint includes state/journal/ATTENTION, but mutation fixture only alters source/policy/manifest/refs/engine. Patch: exercise the three existing guarded paths and distinguish intentional verifier writes. |
| B9 final verification evidence pending | false | Review is running before closure and the spec explicitly leaves final gates pending; no completion assertion was made. All final outputs will be attached by the already-approved closure tasks before status writes. |
| B10 handoff still in progress | false | The staged handoff describes an unfinished session, not a completed delivery. Final status/memory refresh is an existing required closure task; no stale final handoff has been published. |

B1b: medium / patch — independent executed variant hidden physical unlink → owner reassignment → old-owner edit reproduces a missing dependency (delete variant still passes). Preserve canonical membership when removing only its physical row; retain both closure regressions.

B3/B5/B8 share P1 verification hardening ownership, but remain distinct root causes and patch records. B6/B7 are distinct oracle coverage patches. No intent gap, public contract change or deferred ledger mutation is needed.


A5: independent expanded source/core/HTTP review: no actionable findings. Extra selection uncovered canonical projection mismatch; internal snapshots now retain physical attachments and public previews derive canonical projection, preserving hidden evidence through ownership changes. No schema/API widening. A3 reference fixture explicitly uses the same internal physical representation; original global/scoped SQL comparison remains independent.

A4: independent complete mutator/write-set review and final test/fixture review return no findings. Parent verified source and reference paths.

A3: independent deleted-map helper visibility finding fixed by original visibility guards and direct helper regression. Final independent check: no actionable findings.

A2 parent source/test review: no findings. Explicit mock restoration isolates injected file-read errors between tests.

## Verification

A7:46focused DB tests including explicit complete27entityorder, mixedFK/history lifecycle and copy coverage passed; DB typecheck passed. [A7 evidence](evidence/epic-4-remediation/a7.json).

A6:1new pure-constructor independence test,6MD/TXT parity tests (+5permission tests),36focused DB/13source guards and core/DB/server typechecks passed. Independent review: no findings. [A6 evidence](evidence/epic-4-remediation/a6.json).

A5:8new differential cases,375fullcore/414full DB/30HTTP+permission tests,18elevatedRestoretests and core/DB/server typechecks passed. Public snapshot/preview parity includes physical evidence hide/reveal and canonicalunlink. [A5 evidence](evidence/epic-4-remediation/a5.json).

A4:64reference/immutability tests cover all60resolverkeys;367core/64focused DB/14recorded HTTP+SDK tests and core typecheck pass. Serial preview255/213/210ms, executor570/527/524ms pass unchanged gates. [A4 evidence](evidence/epic-4-remediation/a4.json).

A3:4complete-reference/scope/order/visibility tests and414full DB tests passed; DB typecheck passed. After2503foreign Cards/2500extra chunks, target materialization stays68rows (5.31→4.51ms); reference5113rows/20.07ms. [A3 evidence](evidence/epic-4-remediation/a3.json).

A2:5 injected permission/error/selection use-case tests,20HTTP preview and22DB executor regressions passed; server typecheck passed. [A2 evidence](evidence/epic-4-remediation/a2.json). Recorded-source baseline14/14 passed in30.53s; serial executor samples591/545/543ms pass nominal2000ms and tolerance4000ms, preview264/227/230ms pass500ms. Every raw sample retained.

A1:197 focused core and44 DB tests passed; final reserved-ID regressions13core/2 actual HTTP+SDK lifecycle tests passed, plus core/DB/server typechecks. Independent review found no introduced defect. Narrow follow-up guards cover malformed prepared document/Roadmap seed and inherited nested board dictionaries. Logs and review disposition: [A1 evidence](evidence/epic-4-remediation/a1.json).

Focused tests per action; full `corepack pnpm test`, `corepack pnpm typecheck`, `node scripts/verify.mjs`; serial existing actual preview500ms and executor nominal2000ms/tolerance4000ms measurements plus recorded-source fixture; real isolated browser. P1 worker tests exercise installed library APIs only against temporary fixtures. Persist commands, exit codes, matrix mapping and review dispositions in task evidence.

P1:25 installed-runtime Python cases and Node wrapper pass against temporary runs only. Exact selector/cap scope, evidence/ancestry, failed verification, live/unknown engine, lock, fingerprint changes, history preservation and receipt-backed repeat covered. [P1 evidence](evidence/epic-4-remediation/p1.json).

Final patch disposition: B1b fixed by preserving canonical GitHub membership on physical unlink; both delete/reassignment closure regressions pass (10 focused cases). B3/B5/B8 fixed with working permission modes, nine explicit mutation subcases and four injected actual write failures (29 Python cases). B6/B7 fixed with five populated/hidden-evidence oracle cases (69 total). Independent final patch review found a Windows executable-bit fixture issue: medium/patch, changed to supported Windows write-permission mask and POSIX executable mask; POSIX matrix passes, no Windows execution claimed. The added oracle callback also required explicit void return for Vitest typing; focused core typecheck passes. Independent repaired-source review reports no further findings. No reports deferred.

Final acceptance:2021 tests passed (83Node,150contracts,7importers,383core,326web,416DB,642server,14serialperformance),29 final P1 cases, workspace typecheck and complete release verification including129capabilities/build passed under Node24. Preview253/215/211ms <=500ms; executor586/522/521ms <=2000ms nominal/4000ms tolerance. Actual browser repeated on repaired source: exact selection, no domain write before human approval/separate Apply,1saved Card/6chunks/exact2human Activity events. Supported updater transitioned only8action statuses plus last_updated; previous10Epic3actions/all development status bytes unchanged. [Complete closure, matrix, full SHAs, metrics and evidence hashes](evidence/epic-4-remediation/closure.json).

Version2,2026-10-17: Completed all approved actions, three-lens review and narrow repairs, final verification/browser/status closure; frozen approved intent unchanged. P1 and final proof/status are recorded together in the eighth scoped commit. No deferred findings, push, real-run adoption or next-story continuation.
