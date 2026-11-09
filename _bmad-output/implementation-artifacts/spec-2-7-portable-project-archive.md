---
title: '2.7 Portable Project archive'
type: 'feature'
created: '2026-10-04'
status: done
baseline_revision: 2bbad22ce8744e517e31730d03a65d70555ecc16
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '[REDACTED_HOME]/.claude/CLAUDE.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/AGENTS.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.wolf/OPENWOLF.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.wolf/cerebrum.md'
warnings: [oversized]
deferred:
  - summary: >-
      Existing saved portable files can retain previously exported Sync Activity payloads.
    evidence: |-
      Audit JSON/Markdown exports serialize full Activity values. When manually saved under exports, archive file copying retains that content unchanged, as it did in the baseline. Database aggregate redaction cannot sanitize arbitrary pre-existing files. A structured audit-export redaction policy and fixture would settle the repair.
    location: >-
      packages/db/src/repositories/audit-repository.ts:118; apps/server/src/services/project-archive.ts
    severity: medium
  - summary: >-
      Existing ZIP imports have no decoded-size or entry-count resource budget.
    evidence: |-
      Baseline JSZip loadAsync/extraction already allocated unbounded decompressed entries. A compressed upload can exhaust memory or disk; current CRC checking increases work. Establish supported archive budgets and add a bounded extraction regression in the owning hardening work.
    location: >-
      apps/server/src/services/project-archive.ts
    severity: medium
  - summary: >-
      Actual power-loss durability of archive folder publication remains unverified.
    evidence: |-
      Atomic rename and rollback tests establish process-level behavior, not native storage directory durability. Existing DW-27 records this limitation. Native filesystem fault injection and power-loss execution on Windows/Linux/macOS would settle it.
    location: >-
      apps/server/src/services/project-archive.ts
    severity: medium (unverified)
---

Date: 2026-10-04. Version: 12. Purpose: completed Story 2.7 implementation, independent review and verification after operator intent resolution and FR-46 refine. The orchestrator exclusively owns sprint-status.yaml: never write, stage or revert it, and never use a done or awaiting-operator row as verification evidence.

<intent-contract>

## Intent

**Problem:** The existing portable archive lacks schema/version validation, aggregate-driven redaction and an import flow that opens the imported data. Users need to move work without sharing credentials or accepting partial imports.

**Approach:** Export one Project as one archive (redacted DB, portable files, versioned manifest); validate supported imports without changing existing data on failure; on success publish a new Project folder and hot-switch the current one-process runtime to it.

## Resolved decisions (2026-10-04)

### 1. Archive scope — one Project

- Export **one** logical Project (one `.lsm` folder content set), not a whole multi-Project runtime bundle.
- Existing project content in the repo or a shared prototype DB does **not** need to be preserved or shipped for this story; disposable **demo** fixtures are enough for tests and acceptance.
- FR-46 and Story 2.7 ACs were refined accordingly; do not re-litigate whole-runtime export.

### 2. Import opening — hot-switch (option A)

- On successful import: publish the new Project folder, drain in-flight work, reopen through `DatabaseHandle` / path routing so the **current** server process serves the imported Project (no second server/port/browser).
- On failure: previously open Project unchanged.

## Boundaries & Constraints

**Always:** Follow refined Story 2.7 / FR-46 and AD-9, AD-14 and AD-17. Include documents, attachments and exports; derive application version from package.json. Export `redactedTables` beside the schema from aggregate classification; fail classification tests naming unclassified tables. Redact the Sync aggregate, preserve business-owned links and history, and prove the archive contains no secret value. Accept only the current development schema; unsupported format/schema errors name supported versions and change nothing. Expose import/export as human-only API capabilities without MCP tools. Keep contracts in packages/contracts and database access in packages/db. Preserve attribution, write-gate and holder invariants.

**Never:** Include snapshots, logs, `.lock` or `.port`; add forward migrations, credentials, outbound calls, telemetry or dependencies without a requirement. Do not implement multi-Project whole-runtime archives or a second concurrent server for import. Never touch user data, `.env`, sprint-status.yaml, or commit/push outside the orchestrator path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Export one Project | Supported source Project + portable files | One download with that Project's redacted DB and format/schema/package-derived app versions | Concrete cause; no success on failed generation |
| Redaction | Populated Sync and business aggregate rows | Sync rows absent; business links/history preserved; no secret bytes | Classification names unknown tables |
| Supported import | Valid portable archive | New folder published; current runtime hot-switches to it | Atomic publication; prior Project unchanged on failure |
| Unsupported version | Unsupported format or schema | Supported-version diagnostic | No new final folder or active-state change |
| Damaged archive | Invalid manifest, checksum, SQLite integrity or foreign keys | Explicit refusal | No partial published import |
| Unsafe files | Traversal, unexpected runtime entries or symlink escape | Refusal before publication | No writes outside owned import staging |
| Extra Projects in prototype DB | Other logical Projects present in runtime | Not included in archive; ignore for compatibility | Do not silently bundle them |

</intent-contract>

## Code Map

- `_bmad-output/planning-artifacts/epics.md` — Story 2.7 (refined); FR-46 one-liner.
- `_bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/prd.md` — FR-46 refined consequences.
- `ARCHITECTURE-SPINE.md` — AD-9, AD-14, AD-17.
- `apps/server/src/services/project-archive.ts` — replace whole-runtime assumptions; package-derived version; safe paths; validate + atomic publish + hot-switch.
- `packages/db/src/snapshot.ts` — classification-driven redaction; compaction of free pages.
- `packages/db` schema/classification, restore-validation fingerprints, database-handle drain/reopen.
- `packages/contracts` manifest `schemaVersion`, import/export diagnostics and open outcome.
- `apps/web` ProjectArchivePanel / api / ui-strings — pending/error, actual open after import.
- Tests: replace all-Project completion assumptions with one-Project + demo fixtures; serial Node 24 verify.

## Tasks & Acceptance

**Execution:**
- [x] Classification + `redactedTables` beside schema; fail unnamed tables.
- [x] One-Project export archive (manifest versions, safe portable files, no secrets/snapshots/logs/lock/port).
- [x] Import validate → atomic new folder → hot-switch current runtime; failure leaves prior Project open.
- [x] Human-only API capabilities; no MCP archive tools.
- [x] Focused db/server/web tests with disposable demo Projects; then serial full tests + `node scripts/verify.mjs`.

**Acceptance Criteria:** match refined Story 2.7 / FR-46 plus the decisions above.

## Spec Change Log

- 2026-10-04 v12: automation wake-up confirmed no pending verification process or running child agent; refreshed the terminal done/result artifact without repeating passed gates or changing product code.

- 2026-10-04 v11: resumed the supplied ready-for-dev spec against canonical HEAD 2bbad22ce8744e517e31730d03a65d70555ecc16. Source and focused checks confirm the existing implementation; no product edit was necessary. Fresh full tests and serial release verification passed; review and terminal handoff are recorded below.

- 2026-10-04 v10: automation completion check confirmed no pending task process or running child agent and refreshed the terminal result; final verification and orchestrator ownership remain unchanged.

- 2026-10-04 v9: completed implementation, 25 individual review verdicts, 13 shared repairs, three explicit deferrals and independent 553-test/release/browser verification. Frozen intent unchanged; staged orchestrator handoff without commit or sprint-status mutation.

- 2026-10-04 v8: ready-for-dev after dirty-tree catch-22 fix (skill gate + committed context).

- 2026-10-04 v7: refresh terminal blocked result for the fresh attempt and confirm no pending task process or child agent.

- 2026-10-04 v6: recorded terminal procedural blocker in the story spec after confirming no pending process or child agent; resolved intent unchanged.

- 2026-10-04 v5: operator resolved scope (one Project; no legacy content obligation) and import hot-switch; FR-46/epics refined; status `ready-for-dev`.
- 2026-10-04 v1–v4: prior blocked planning / dirty-tree stalls (superseded).

## Review Triage Log

### 2026-10-04 — Review pass
- verdicts: 25 findings — high 4, medium 17, low 0, false 3, maybe-false 1
- findings:
  - `[medium]` `[patch]` B1: excluded-Project portable files — Disposable HTTP export has counts.projects=1 but includes documents/excluded-demo.txt referenced only by another Project. Exclude known exclusively-owned references during scoped export. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[defer]` B2: saved audit files may retain Sync payloads — generateAuditExport serializes full Activity before/after payloads; manually saving that output under exports causes unchanged file copying to retain them. Baseline archive copied the same files unchanged; structured file redaction is a pre-existing issue.
  - `[medium]` `[defer]` B3: unbounded ZIP expansion — Baseline JSZip loading/extraction already expands every entry without decoded-size or entry-count limits. Current CRC checking adds work but does not introduce the unbounded expansion; record existing resource exhaustion risk.
  - `[high]` `[patch]` B4: portable namespace collisions — Disposable HTTP import of Collision.txt and collision.txt returned 200; native macOS retained only Collision.txt with the second file content. Individual name checks also permit NFC and file-directory aliases. Reject ambiguous namespaces on export and before extraction. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` B5: invalid root Project ID — Rehashed valid-schema/FK archive with invalid-demo-id returned HTTP 200 and switched; the browser UUID response contract and subsequent UUID requests cannot accept it. Validate the existing ID contract before publication. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` B6: missing Project settings — Deleting project_settings from a valid demo archive returned HTTP 200; getPrivacySettings then has no required row and throws. Refuse an uninitialized root before publication. Applied in the repaired implementation and covered by the verification below.
  - `[high]` `[patch]` B7: invalid Card hierarchy — A self-parented activity passes SQLite integrity/FK checks and returned HTTP 200. collectDescendantIds repeatedly pushes its children without visited tracking. Validate each map with the existing core hierarchy rules before publication. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` B8: inline attachment bypass — A valid card attachment pointing to inline://missing-demo returned HTTP 200; only source documents have inline content support. Restrict the exception to documents and require real portable attachments. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` B9: keyboard outcome focus — Disabled invoking controls and route replacement leave native focus at the web document root; result/error ARIA roles announce text but do not restore focus. Focus the settled visible outcome and exercise mounted keyboard behavior. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` B10: business preservation fixture — Archive/snapshot fixtures lacked populated Release, Roadmap/reference, Customization and ChangeSet aggregates and detailed attribution. Extend fixtures and round-trip assertions for the explicit preservation boundary. Applied in the repaired implementation and covered by the verification below.
  - `[high]` `[patch]` E1: case/Unicode namespace collisions — Same verified namespace defect as B4; reject aliases and file-directory conflicts before publication and during export. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[defer]` E2: decompressed archive resource exhaustion — Same pre-existing unbounded JSZip expansion as B3, present in baseline loadAsync and extraction.
  - `[medium]` `[patch]` E3: UUID response contract mismatch — Same disposable invalid-ID import as B5: HTTP 200 switches to a Project the UUID browser contract rejects. Validate before publication. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` E4: excluded Project file content — Same reproduced exclusively-owned source document leak as B1; scope the known file references with the selected Project. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` V1: unredacted import refusal evidence — Pre-verified gap: redacting exporter fixtures never exercise malicious populated Sync tables or copied Sync Activity payloads. Add rehashed, otherwise-valid refusal cases and preservation/cleanup assertions. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` V2: missing portable reference refusal evidence — Pre-verified gap: no test removes a referenced document or attachment entry while retaining valid database/hash metadata. Add both refusal cases proving prior state and cleanup. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` V3: fresh imported epoch evidence — Pre-verified gap: no assertion compares exported epoch with imported epoch or a second import. Assert three distinct epochs for repeated archive imports. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` I1: logical scope versus copied file ownership — Same concrete excluded-document leak as B1/E4; preserve selected/shared and unreferenced folder content while excluding known other-Project-only references. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` I2: archive-wide redaction evidence — Fixture populated only selected Sync tables and checked DB bytes, although the claim covers the generated artifact. Seed every classified Sync table and scan each ZIP file for fixture-only sentinels; preserve business Activity. Applied in the repaired implementation and covered by the verification below.
  - `[medium]` `[patch]` I3: all-business preservation evidence — Same missing populated business aggregate coverage as B10; extend owned demo preservation assertions. Applied in the repaired implementation and covered by the verification below.
  - `[high]` `[patch]` I4: active schema treated as supported application schema — supportedSchema derives from previous.$client DDL, so an unsupported extra index/trigger can authorize an archive with matching drift. Derive the supported fingerprint from the canonical current application initializer. Applied in the repaired implementation and covered by the verification below.
  - `[false]` `[reject]` I5: current-process path routing not demonstrated — HTTP repositories dereference the shared holder; health and generated MCP configuration read handle.current.$client.name, and archive export resolves that holder path. Executed post-import reads/export/health prove the current process uses the imported folder. No broken captured-path consumer was identified; independent stdio topology is already DW-23/DW-29.
  - `[false]` `[reject]` I6: browser acceptance only mocked — Parent operated production Chrome on a disposable actual server: inspected the downloaded ZIP, used the native file picker, observed different/same-ID imports and injected a dropped successful POST response through a real HTTP proxy. The manual evidence reported in the spec is actual transport evidence, complementary to mounted fetch regressions.
  - `[maybe-false]` `[defer]` I7: abrupt termination and filesystem publication durability — Validation/reopen rollback tests and atomic rename do not settle actual storage/power-loss durability. A native failure-injection and power-loss campaign on supported filesystems would settle the claim; prior directory durability is already DW-27.
  - `[false]` `[reject]` I8: human capability lacks independent caller identity authentication — AD-6 defines agent iff MCP transport and human on other routes, explicitly as cooperative guardrails rather than a local-process security boundary; AD-15 trusts same-user local processes. Human ActorContext validation and no archive MCP tools implement that captured boundary; independent identity authentication is not required.


### 2026-10-04 — Resumed-run review pass
- verdicts: 3 findings — high 0, medium 0, low 2, false 1, maybe-false 0
- findings:
  - `[low]` `[reject]` B1: pending terminal narrative — At review time v11 promised resumed review and terminal details below before finalization had written them. This is a temporary record inconsistency; the suggested fix edits this build's spec and is rejected by the review rule. Required terminal finalization supplies those details below.
  - `[false]` `[reject]` B2: supplied status conflicts with Git baseline — The invocation supplied ready-for-dev and the entry read confirmed it; canonical HEAD contained done while the staged operator-provided frontmatter reopened the spec. Git's prior state does not disprove the supplied status. No implementation completion was inferred from either status.
  - `[low]` `[reject]` B3: unnamed transient test/follow-up — The new verification paragraph omitted the affected test name, while the referenced first-run log includes it and the isolated/repeated runs establish recovery. The proposed correction edits this build's spec, which the review rule rejects. Required terminal evidence and OpenWolf bug bookkeeping identify the test and explicitly leave its root cause unconfirmed.
- Edge-case hunter returned no findings after tracing the implementation and checking claims. Verification-gap reviewer found no gaps. Intent auditor described a valid completion-against-existing-implementation reading: this diff refreshes evidence, while product behavior is verified in the baseline source and executed tests outside the diff. That observation does not identify a defect.

### 2026-10-04 — Follow-up review pass
- verdicts: 18 findings — high 0, medium 0, low 8, false 10, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind 1: spec `in-review` vs `done` elsewhere — `in-review` is the transient status this review step writes and finalization restores to `done`; the sprint row is orchestrator bookkeeping that predates this run (already ` M` in the starting git status).
  - `[false]` `[reject]` Blind 2: sprint-status flip rests on weak evidence — the row is orchestrator-owned and is not used as evidence here; verification rests on source and executed tests.
  - `[false]` `[reject]` Blind 3: `followup_review_recommended` flipped without justification — computed by rule: no patch was applied in the prior pass, so `false`; deferrals never drive it.
  - `[low]` `[reject]` Blind 4: B1/B3 rejected on procedural grounds — already logged rows; the only fix edits this build's spec.
  - `[low]` `[reject]` Blind 5: `/tmp` logs not durable — prose records command outcomes; fix edits this build's spec.
  - `[low]` `[reject]` Blind 6: `kill EPERM` flake has no tracker item — passed alone and in the full rerun; OpenWolf buglog tracks it; a flaky launcher diagnostic test predates this story and is not a product defect.
  - `[false]` `[reject]` Blind 7: browser evidence stale for new baseline — `git diff d908d27 2bbad22 -- apps packages` is empty, so product code is identical to what the Chrome acceptance exercised.
  - `[low]` `[reject]` Blind 8: duplicated or noisy bookkeeping — hook-maintained `.wolf` files; no end-user or developer harm named.
  - `[low]` `[reject]` Blind 9: stale or inconsistent `STATUS.md` handoff — hook/handoff-maintained file; fix edits agent-context bookkeeping.
  - `[false]` `[reject]` Edge 1: spec status claim contradicts frontmatter — same as Blind 1.
  - `[false]` `[reject]` Edge 2: sprint-status flipped before review — same as Blind 2; the author did not write it.
  - `[low]` `[reject]` Edge 3: evidence only in `/tmp` logs — same as Blind 5.
  - `[false]` `[reject]` Edge 4: follow-up flag flipped — same as Blind 3.
  - `[false]` `[reject]` Verification-gap other 1: status disagreement across files — same as Blind 1.
  - `[false]` `[reject]` Verification-gap other 2: sprint-status modified — same as Blind 2; orchestrator edit visible in the starting git status.
  - `[low]` `[reject]` Verification-gap other 3: `/tmp` log evidence — same as Blind 5.
  - `[false]` `[reject]` Intent auditor: diff touches only bookkeeping, tracker edited — descriptive; product behavior is verified in unchanged source and executed tests; the tracker edit is not the author's.
  - `[false]` `[reject]` Intent auditor: evidence gaps (no browser rerun, EPERM, deferrals) — browser rerun unnecessary (product code unchanged since d908d27); EPERM is the Blind 6 claim; deferrals are recorded and untouched.

## Verification

- Node 24.17.0: `corepack pnpm install --frozen-lockfile --offline` passed after declaring the existing internal db-to-core dependency.
- Focused post-review checks passed: snapshot 2/2, server archive 37/37, mounted import/runtime 6/6; web typecheck passed.
- Parent `corepack pnpm test` passed: 553 tests, zero failures/skips (61 scripts, 2 importers, 14 core, 94 web, 232 db, 150 server). Followed serially by `node scripts/verify.mjs`: Git/source hygiene, installed runtime checks, typecheck and production build passed. Logs: `/tmp/story-2-7-final-tests.log`, `/tmp/story-2-7-final-verify.log`.
- Parent read the implementation and repaired diffs. Graph tools were unavailable; scope was narrowed through targeted source navigation and exact caller/test reads.
- Actual HTTP/SQLite reproductions accepted invalid IDs, missing settings, cyclic Cards and inline attachments before repair; final refusals preserve prior database bytes/path/folders. Native macOS case aliases previously silently overwrote a file; repaired namespace validation refuses them.
- Production Chrome on disposable data: actual downloaded ZIP inspected for one Project and SQLite integrity/FKs; supported-version refusal retained the open Project; different-ID and same-ID imports opened/refreshed data; an HTTP proxy dropped a successful response and browser recovery loaded the current Project without resubmission or false success. The final verified production build imports the nullable sample archive, refreshes the visible map, focuses the result with a visible outline, and has no horizontal overflow. Refusal focuses its supported-version alert.
- All matrix rows have executed snapshot/classification, actual archive HTTP or mounted web coverage. Portable fixtures include real files and inline documents, every classified Sync table, populated business aggregates, business Activity, deleted Card versions and agent/session attribution. Every generated ZIP file is scanned for fixture-only secret sentinels.


- Resumed-run verification (2026-10-04): parent source inspection and implementation subagent found no unfinished requirement. Focused snapshot 2/2, archive server 37/37 and web archive 10/10 passed. Fresh parent `corepack pnpm test` passed all 553 tests with zero failures/skips; `corepack pnpm install --frozen-lockfile --offline` and subsequent serial `node scripts/verify.mjs` passed on Node 24.17.0. The first full attempt stopped at 60/61 script tests when the launcher startup diagnostic returned `kill EPERM`; the affected test passed alone, then the entire unchanged suite passed. Root cause of that transient process-signaling failure is unconfirmed. Logs: `/tmp/story-2-7-resume-tests.log`, `/tmp/story-2-7-resume-startup-recheck.log`, `/tmp/story-2-7-resume-tests-final.log`, `/tmp/story-2-7-resume-install.log`, `/tmp/story-2-7-resume-verify.log`. All seven matrix rows have executed snapshot/classification, archive HTTP or mounted runtime coverage. Prior production Chrome evidence remains historical; this resumed run did not repeat native browser acceptance.


## Auto Run Result

Status: done

- Summary: follow-up review pass over a spec already `done`. The product implementation is unchanged since d908d27 (`git diff d908d27 2bbad22 -- apps packages` is empty); the diff since baseline holds only OpenWolf bookkeeping and spec evidence.
- Files changed in the reviewed diff: spec (evidence and triage log), `.wolf/*` bookkeeping, `sprint-status.yaml` (orchestrator-owned, not written by this run).
- Review findings: 18 from four layers; patches applied 0; deferred 0 new (three existing entries untouched); rejected 18 (10 false, 8 low) with reasons in the Follow-up review pass triage log.
- Follow-up review recommended: false (no patch applied; patched counts high 0, medium 0).
- Verification: no code changed in this pass. Test and release results from the earlier passes stand (553 tests, `node scripts/verify.mjs`); this pass did not rerun them.
- Residual risks: the three deferred items above; native browser acceptance not repeated, product code is unchanged since it ran.
- Commit: none created. The reviewed diff includes orchestrator-owned `sprint-status.yaml`, which this run must not stage or commit, and the contract and user policy forbid committing outside the orchestrator path. The orchestrator owns the commit.
