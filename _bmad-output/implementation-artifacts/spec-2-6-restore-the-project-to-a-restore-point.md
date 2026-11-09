---
title: '2.6 Restore the Project to a restore point'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_revision: '2fee0c743b74e512959c508d44778f560608fe5e'
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
      Directory rename durability during actual power loss remains unverified.
    evidence: |-
      Ready-file and database content fsync do not prove directory metadata durability across power loss. A native storage/power-loss campaign on supported filesystems would settle the actual failure and platform guarantee; deterministic process-crash recovery is being verified independently.
    location: >-
      packages/db/src/restore-recovery.ts
    severity: high (unverified)
  - summary: >-
      Other already-open browser clients retain stale data until live epoch resets arrive.
    evidence: |-
      The app already lacks cross-client invalidation for ordinary mutations. Story 3.10 explicitly owns epoch reset/refetch and all open Views reloading; this story reloads its initiating app and persists the epoch required by that work.
    location: >-
      apps/web/src/app/api.ts
    severity: medium
  - summary: >-
      Independent HTTP and stdio database writers are not coordinated by the process-local restore gate.
    evidence: |-
      Existing DW-23 records the separate stdio writer and local-only gate. Story 3.6 owns the stdio bridge and the process-model stories own single-writer locking; shared-handle HTTP use cases drain correctly here.
    location: >-
      apps/server/src/mcp/stdio-main.ts:11
    severity: medium
  - summary: >-
      Fresh and ALTER-migrated databases produce different sqlite_schema DDL text, so their schema fingerprints differ (this story's epoch, historical_stub and undone_by_restore columns follow the existing ensureColumn pattern).
    evidence: |-
      CREATE TABLE declares `epoch TEXT NOT NULL` while ensureColumn adds `epoch TEXT NOT NULL DEFAULT ''`; the same divergence already exists for earlier ensureColumn columns. A database's own restore points always match it, so only cross-database exchange (Story 2.7 archive import, Epic 8 migrations) can observe it.
    location: >-
      packages/db/src/restore-validation.ts:6
    severity: low
---

Date: 2026-10-04. Version: 8. Purpose: implement Story 2.6 after resolving the historical ChangeSet / Project-ownership intent gap. Preserve the orchestrator's exclusive ownership of sprint-status.yaml; never write, stage or revert it or infer verification from its rows. No commit or push until the story's normal bmad-loop commit path.

<intent-contract>

## Intent

**Problem:** Restore points can be created and listed, but the user cannot recover unwanted edits or an agent session by restoring one.

**Approach:** Add a human-only restore action with validation, request draining, a protective snapshot, recoverable database replacement, durable undone records and an accessible confirmation/progress/result flow.

## Resolved decisions (2026-10-04)

These close the prior intent gap. Implement exactly this reading of AD-8 / FR-57; do not re-litigate.

### ChangeSet rows that exist in the snapshot and change after it

A ChangeSet proposed at snapshot time may later be approved/applied under the same primary key (`created_at` unchanged). On restore:

1. Replace the live database with the chosen snapshot (map returns to snapshot state).
2. From the pre-restore database, copy `activity_events` and `change_sets` rows that are newer than the snapshot into the restored database and set `undone_by_restore`.
3. **Same-ID ChangeSets:** the copied row **replaces** the snapshot's proposed row. Retain the **later** status/payload, flagged `undone_by_restore`. That ChangeSet is **permanently ineligible** for approve/apply/reject flows that would mutate the map (treat as historical undone record only).
4. Do **not** rewind the row to the snapshot's `proposed` state while also keeping a second representation — one PK, one preserved later row, flagged undone.
5. Newer Activity Events for those transitions are retained and flagged `undone_by_restore` as required by the epic.

Rationale: AD-8 requires copying newer `change_sets` flagged undone so undone action records remain recoverable; the map still matches the snapshot because the apply effects lived only in non-history tables that came back with the snapshot file.

### Projects referenced only by post-snapshot history

Newer Activity/ChangeSet rows may reference a Project that did not exist at snapshot time. Existing Project FKs must stay valid without restoring that Project into the live inventory:

- When copying such history, materialize a **minimal historical Project stub** with the same id (stable id, non-interactive placeholder name, no Story Maps / no agent access) solely to satisfy FKs.
- Stubs must not appear as normal selectable Projects in the UI inventory used for day-to-day work (filter `historical_stub` / equivalent).
- Never silently drop history rows, never insert a full live Project with maps from thin air, and never leave FK-invalid rows.

## Boundaries & Constraints

**Always:** Follow Story 2.6 in epics.md and AD-8, accepting only the current development schema until Epic 8 migrations exist. Validate integrity and actual schema before changing data. Reject new requests with explanatory 503 responses while draining existing use cases. Create a pre-restore point; close SQLite handles, replace through the database's `.restoring` file, remove WAL/SHM safely and reopen through DatabaseHandle. Preserve newer Activity Event and ChangeSet rows flagged undone_by_restore per the decisions above; initialize an epoch in project_settings, regenerate it on restore and record project.restored. Resolve interrupted restoration deterministically before opening/seeding at startup and log the outcome. Return later GitHub links and state that attachment files were not deleted. Show a confirmation explaining undone changes and pre-restore protection, a non-dismissible progress Dialog focused on its container, then reload the app and display the result. Snapshots cover all Projects in the local database, as established in Story 2.2. All data access remains in db; contracts remain the single schema source. Preserve attribution, repository holder dereferencing, existing snapshot retention and shared Dialog behavior.

**Never:** Contact remote systems, delete attachment files, add dependencies or telemetry, touch user databases/input, implement individual-version undo, forward migrations or portable archives, duplicate schemas, modify sprint-status.yaml, commit or push outside the orchestrator path. Do not silently choose alternate historical ChangeSet semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Ordinary restore | Current-schema valid snapshot and subsequent edits | Map returns to snapshot; pre-restore point, new epoch and attributed event; holder accepts writes | Concrete failure cause, no partial exposed state |
| Invalid candidate | Corruption, schema mismatch or unrecognized point | Refused before mutation | Reason shown; original database unchanged |
| Slow request | In-flight asynchronous use case when restore begins | Existing work finishes before swap; new requests receive 503 | Duplicate restore cannot enter concurrently |
| Changed historical ChangeSet | Proposal already in snapshot, approved/applied afterward | Later row copied over snapshot row, `undone_by_restore`, permanently non-applicable | Must not re-apply or silently drop |
| Later Project | Audit/ChangeSet rows for a Project absent from snapshot | History preserved via historical Project stub; live inventory matches snapshot | No unwanted live Projects; no FK breaks |
| Interrupted swap | Partial or prepared `.restoring` file | Deterministic completion or rollback, logged before normal opening | No incomplete audit/epoch state exposed |
| Remote/attachment result | Later legacy and connector-backed GitHub links; attachment files | List later links, state attachments retained, reload all Views | No remote calls or file deletion |
| Human versus agent | UI confirmation or `/api/mcp/call` restore attempt | Human restore allowed; agent refused | Human-only explanation/capability |

</intent-contract>

## Code Map

- `_bmad-output/planning-artifacts/epics.md` — Story 2.6 acceptance; AD-8 in ARCHITECTURE-SPINE.
- `packages/db/src/restore-points.ts` — DDL fingerprint, exclusive creation; restore path to add.
- `packages/db/src/database-handle.ts` — replaceable holder and write gate.
- `packages/db/src/connection.ts` — WAL/FK opening; candidate validation and startup recovery before mutating opener.
- `packages/db/src/schema/tables.ts` — project_settings epoch; ChangeSets/Activity undone flag; Project stub marker as needed.
- `packages/db/src/repositories/changesets-repository.ts` — guard undone ChangeSets from apply/approve paths.
- `packages/contracts` + `row-mappers` — public models for flags / restore result.
- `apps/server` restore-points routes + startup — human restore, 503 drain, MCP reject.
- `apps/web` RestorePointsPanel, Dialog, api, ui-strings — confirm / progress / reload / result.
- Existing db/server/web restore-point and Dialog tests — extend with real SQLite/WAL fixtures.

## Tasks & Acceptance

**Execution:**
- [x] Contracts: restore input/result, epoch, `undone_by_restore`, historical Project stub field, capability.
- [x] DB schema + repositories: persist flags; guard undone ChangeSet mutations; stub Projects for FK-only history.
- [x] Restore protocol: validate, drain/503, pre-restore snapshot, `.restoring` swap, reopen, copy newer history per decisions, new epoch, `project.restored`, startup recovery.
- [x] Server + web: human-only route, confirmation/progress/reload/result, truthful undone display.
- [x] Tests + disposable production acceptance for the matrix; serial Node 24 verify gates.

**Acceptance Criteria:** match Story 2.6 in epics.md plus the resolved decisions above.

## Spec Change Log

- 2026-10-04 v8: automation completion check confirmed no pending task process or child agent; refreshed terminal done/result without changing implementation or sprint bookkeeping.

- 2026-10-04 v7: completed implementation, eleven shared review/native repairs and independent final verification; frozen intent unchanged, orchestrator ownership and no-commit boundary preserved.
- 2026-10-04 v6: resumed the authoritative ready-for-dev intent, recorded the implementation baseline and four independent review lenses.

- 2026-10-04 v5: operator resolved ChangeSet/Project intent gap; status `ready-for-dev` for clean re-drive.
- 2026-10-04 v1–v4: prior planning / dirty-tree / stall artifacts (superseded).

## Review Triage Log

### 2026-10-04 — Review pass

- verdicts: 22 findings — high 3, medium 13, low 3, false 2, maybe-false 1
- findings:
  - `[high]` `[patch]` B1 rollback decision can be reversed at startup — an initial failed rename leaves a ready candidate; successful rollback rename followed by failed reopen leaves it available for recovery replay. Persist rollback disposition before reopening and cover the exact boundary.
  - `[high]` `[patch]` B2 startup can lose committed original WAL on rename failure — recovery deletes sidecars before an unguarded rename. Preserve/checkpoint original WAL first and inject failure against a subprocess-crashed WAL fixture.
  - `[maybe-false]` `[defer]` B3 missing directory flush during power loss — file fsync alone does not establish directory durability, but actual loss under supported native filesystem/power-loss conditions has not been shown. Deferred high (unverified) with the campaign needed to settle it.
  - `[medium]` `[patch]` B4 already-renamed recovery omits validation — publishedRestoreCompleted checks epoch/audit only, so an installed invalid schema/FK state can be declared complete. Validate installed integrity/FKs/schema before completion and retain the marker on refusal.
  - `[medium]` `[patch]` B5 result persistence can prevent mandatory reload — sessionStorage.setItem can throw inside onSuccess before navigation. Decouple completed result recovery from that write and verify quota/storage failure.
  - `[medium]` `[patch]` B6 malformed saved result can crash the root — JSON/Zod parsing runs without an explicit recoverable error boundary. Handle invalid result data explicitly, clear/recover its state and announce the cause.
  - `[medium]` `[patch]` B7 lost completed response is reported as refused restore — fetch TypeError after publication reaches ordinary onError and enables stale cached views. Reload and reconcile with the durable project.restored record through existing APIs.
  - `[medium]` `[defer]` B8 other tabs lack epoch invalidation — the pre-existing app has no cross-client updates for ordinary writes either; Story 3.10 explicitly supplies epoch reset/refetch for all open Views. Keep the persisted epoch and initiating-app reload here.
  - `[false]` `[reject]` B9 same-ID URL change must be listed as a later-created link — Story 2.6 and AD-8 expressly require links created after the snapshot, not existing link edits. Snapshot ID-membership implements that requirement without wall-clock errors; new legacy and connector rows are covered.
  - `[medium]` `[patch]` B10 interrupted-WAL fixture checkpoints before recovery — clean close invalidates the assertion of actual uncheckpointed crash state. Add subprocess termination with committed WAL and use it for the recovery failure path.
  - `[medium]` `[patch]` V1 complete Activity preservation lacks independent expected set — pre-verified: retained count and result count share selection, and only one agent row is checked. Capture and compare every later human/agent event and its original fields.
  - `[low]` `[reject]` V2 automatic browser navigation has no automated native harness — pre-verified: jsdom mocks navigation, but the one-line production replace call was independently operated in Chrome through actual reload/result. A new browser automation harness adds disproportionate complexity for this gap; manual native evidence and the remaining automation limit are recorded.
  - `[medium]` `[patch]` V3 production root-gate installation is unprotected — pre-verified: the route fixture installs its own gate, leaving buildServer root HTML/assets uncovered. Add a real buildServer drain/503/completion scenario.
  - `[high]` `[patch]` E1 recovery rename failure can erase original WAL — same root cause and repair as B2, independently observed in exact recovery source.
  - `[medium]` `[patch]` E2 storage-write failure stops navigation — same demonstrated onSuccess boundary and repair as B5.
  - `[medium]` `[patch]` E3 lost response enables stale state — same transport-outcome boundary and durable-result reconciliation as B7.
  - `[medium]` `[defer]` I1 draining excludes independently opened stdio databases — exact stdio source and existing DW-23 establish this earlier topology issue; same single-writer follow-up as the deferred finding above.
  - `[false]` `[reject]` I2 later-link reading might include changed associations — the authoritative Story 2.6/AD-8 created-after clause settles this reading; same-ID association edits are not newly created rows.
  - `[low]` `[reject]` I3 jsdom reload proof is narrower than full Views — real Chrome navigation rebuilt the app, showed the durable result and HTTP confirmed restored data plus post-restore writes. Native automation is a recorded limit; no additional public flow is needed.
  - `[low]` `[reject]` I4 accessibility evidence is jsdom-only in the diff — parent operated native Cancel, Tab/Enter, Escape/Tab containment, inert background, progress container focus, result heading focus and failure opener focus. Actual screen-reader speech remains an explicit limit, not an observed defect needing speculative guards.
  - `[medium]` `[patch]` I5 interruption tests lack actual abrupt termination — same missing crashed-WAL evidence as B10, repaired by the dedicated subprocess fixture; power-loss durability remains separately unverified.
  - `[medium]` `[patch]` I6 multiple existing Projects only have epoch assertions — strengthen the shared-epoch test with independently captured Card snapshots and later edits in two existing Project maps, then assert both restored states.

Ten shared patch entries (two high, eight medium) cover fourteen findings. Three deferrals cover two pre-existing coordination issues and one unverified power-loss claim. Five observations are rejected with the specific evidence above.

All ten repair groups landed. Recovery persists the rollback decision before reopening, checkpoints/fsyncs the original committed WAL before replacement, and validates an already-installed candidate before removing its marker. A SIGKILL subprocess fixture independently proves uncheckpointed WAL content survives injected publication failure and retry. Tests compare every later Activity row, restore independently edited maps in two existing Projects, and exercise production buildServer HTML/JS/CSS admission during a real asynchronous use case.

UI repairs make reload independent of result-storage success, handle malformed saved records explicitly, and reconcile uncertain responses through existing Activity and epoch APIs. Parent patch inspection found that an available unchanged epoch could otherwise leave the UI blocked forever; the same B7/E3 repair now distinguishes a confirmed non-completion from unavailable or unresolved outcomes. Its terminal notice permits editing and explicit retry; 503/offline or changed-without-completion cases remain nondismissible. No restore request is resent automatically, and no public request fields or APIs were added.

### 2026-10-04 — Parent native verification repair

- verdicts: 1 finding — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` P1 recovered-result focus falls to the page body — final built Chrome completed restoration with its HTTP response deliberately dropped. Reload recovered the durable result correctly, but removing the progress container's tabindex left activeElement at BODY because shared Dialog only refocused transitions toward container mode. The existing focus-mode effect now focuses the topmost layer's appropriate target in either direction. Rendered regressions cover container → heading → container and protect a nested top layer.

This independent native boundary adds one medium shared repair: eleven total patch entries (two high, nine medium), with the original twenty-two lens verdicts preserved above.


### 2026-10-04 — Review pass (follow-up)

- verdicts: 37 findings — high 0, medium 2, low 22, false 12, maybe-false 1
- findings:
  - `[false]` `[reject]` Blind B1 `javascript:` result link — React 19 neutralizes javascript: hrefs and links come from app-created github_links/connector rows; no reachable bad outcome.
  - `[low]` `[reject]` Blind B2 no drain timeout — no streaming/hung route exists (grep of apps/server); AC requires waiting for in-flight use cases, a timeout adds configuration.
  - `[false]` `[reject]` Blind B3 project-scoped route versus global restore — resolved intent and Story 2.2 define all-Project snapshots; `prepareRestoredHistory` calls `ensureHistoricalProject(projectId)` so the audit event stays FK-valid and `readActivity` has no existence check.
  - `[low]` `[reject]` Blind B4 sessionStorage stores every event id — quota needs roughly 100k events; fix redesigns the reconciliation baseline.
  - `[low]` `[reject]` Blind B5 `projects[0]` for epoch — every Project has a settings row via createProject; the empty case throws an explicit labelled error (fail-fast).
  - `[false]` `[reject]` Blind B6 epoch repeated per project_settings row — AC and decision place the epoch in project_settings; tests prove one shared value.
  - `[low]` `[defer]` Blind B7 fresh versus migrated DDL fingerprints differ — pre-existing ensureColumn pattern; deferred with Story 2.7/Epic 8 owners.
  - `[false]` `[reject]` Blind B8 `/restore/i` MCP guard — AC requires refusal through `/api/mcp/call`; no registered tool matches and the capability source stays `mcp: false`.
  - `[false]` `[reject]` Blind B9 changedRows O(n)/recount — retained rows are the AC set; full-row comparison is required for same-ID ChangeSets; recount equals retained undone records.
  - `[low]` `[patch]` Blind B10 status codes — the only misclassified pre-mutation refusal (unresolved interrupted restore, plain Error to 500) now throws RestoreValidationError; finer 404/409 split not required.
  - `[false]` `[reject]` Blind B11 missing ADR — AD-8 in the architecture spine records the decision; the project has no docs/adr tree.
  - `[low]` `[reject]` Blind B12 crash fixture under src — harmless unreferenced dev harness; relocation has no user impact.
  - `[low]` `[reject]` Blind B13 duplicated pragmas and info log level — cosmetic.
  - `[low]` `[reject]` Blind B14 leftover `.restore-rollback` after a failed copy — overwritten by the next attempt; disk-only.
  - `[false]` `[reject]` Blind B15 thin confirmation — AC requires explaining undone changes and pre-restore protection, which the dialog does; extra counters are nice-to-have.
  - `[low]` `[reject]` Edge E1 rollback checkpoint on corrupt installed candidate — candidate was hash- and integrity-validated before publication; needs post-validation file corruption.
  - `[low]` `[reject]` Edge E2 concurrent stdio recovery — same root cause as the existing deferred independent-writer finding (DW-29).
  - `[low]` `[reject]` Edge E3 drain timeout — same as B2.
  - `[maybe-false]` `[reject]` Edge E4 abort before handler start releases the count early — writes stay behind the exclusive gate; would only produce an error for a gone client; low if true.
  - `[low]` `[patch]` Edge E5 plain Error 500 for pre-mutation refusal — same as B10.
  - `[low]` `[reject]` Edge E6 reconcile with no live Project — same as B5.
  - `[false]` `[reject]` Edge E7 recount of earlier undone rows — retained records are what the result lists.
  - `[low]` `[reject]` Edge E8 malformed link URL fails schema — app-created URLs only; unlikely.
  - `[low]` `[patch]` Edge E9 Markdown audit export hides `undone_by_restore` — event line now appends `| undone by restore`; asserted in the shared-epoch test.
  - `[false]` `[reject]` Edge E10 local HTTP caller is human — all `/api/human` routes share this existing local topology.
  - `[medium]` `[patch]` Gap G1 no upgrade test for epoch/historical_stub/undone_by_restore backfill — added a real DROP COLUMN reopen test asserting one shared uuid epoch and clean flags.
  - `[medium]` `[patch]` Gap G2 request-count release for non-handler paths unasserted — added an unknown-route request followed by a completing restore; verified it hangs without the onResponse hook.
  - `[false]` `[reject]` Gap other: audit export for stubs — `ensurePrivacySettings` already throws "Project not found." for stubs, same message.
  - `[false]` `[reject]` Intent I1 Project versus database scope — resolved intent: all Projects.
  - `[low]` `[reject]` Intent I2 human-only on a name check — registered tools never match; function-level guard also asserted.
  - `[low]` `[reject]` Intent I3 gate limited to Fastify — existing deferred DW-29.
  - `[low]` `[reject]` Intent I4 UI tests against stubbed server — real Chrome acceptance recorded above.
  - `[low]` `[reject]` Intent I5 stub/ChangeSet enforcement points — enforced in repository lookups and the two ChangeSet mutators; observation only.
  - `[false]` `[reject]` Intent I6 epoch per row — settings rows always exist (createProject), shared-epoch test passes.
  - `[low]` `[reject]` Intent I7 recovery tested at db layer — observation; recovery wiring covered by startup tests.
  - `[low]` `[reject]` Intent I8 attachmentsRetained constant — attachments are never deleted by design; file existence tested.
  - `[low]` `[reject]` Intent I9 pre-change restore points refused — AC accepts only the current schema.

Every reported finding has a row: four patched entries (two medium test gaps, two low), one deferral, the rest rejected with the evidence shown.

## Design Notes

Do not infer newer records solely from wall-clock creation times when a better snapshot-membership test exists. A complete recovery candidate must retain audit and epoch completion across interruption.

## Implementation Verification Evidence

Independent parent verification: 486 workspace tests pass without failures/skips (61 scripts, 2 importers, 14 core, 75 web, 223 db, 111 server). Serial `node scripts/verify.mjs` passes source/Git hygiene, Node 24.17.0, typecheck and production build. Parent read the staged baseline diff and exact source at the restore/recovery/history/request boundaries.

Every intent-matrix row has executed passing coverage: `restore-project.test.ts` (10), `restore-failures.test.ts` (4), HTTP `restore-points.test.ts` (10), web restore tests (9), undone ChangeSet regression (1), and shared Dialog tests (10). Tests cover current-schema/integrity refusal, WAL/map equality, post-restore writes, same-ID later ChangeSets and permanent guards, historical Project FKs/inventory/MCP access, slow request draining/duplicate 503, prepared/partial/hash/epoch/audit/crash completion, publication rollback/stopped serving, both GitHub link sources and retained attachment files, human-only confirmation, progress/reload/result/error labels.

Production Chrome operated the built app against an owned temporary SQLite fixture. Native Cancel focus, Tab/Enter confirmation, nondismissible container focus with Escape/Tab and inert background passed. A partially received real HTTP Project-create request held the drain: a new GET received explanatory 503, the existing request completed, and its later Project was absent from live inventory after restore. Reload displayed both snapshot identifiers, seven retained undone events and attachment/remote statements; HTTP confirmed snapshot Card state, human `project.restored`, and successful post-restore Card writes. A corrupted owned candidate was refused with a concrete alert, no new snapshot, enabled retry and native focus restored to its row.

Parent repaired the production completion Dialog's long-filename horizontal overflow. Exact rebuilt reload measured clientWidth = scrollWidth = 420px and a screenshot verified all result text and focus ring fit. Native Windows/Linux and actual screen-reader speech remain evidence limits. Logs are `/tmp/storymapper-2-6-parent-tests.log`, `/tmp/storymapper-2-6-parent-verify.log`, and `/tmp/storymapper-2-6-parent-web-layout-tests.log`. No user data, sprint-status writes/staging/reverts, commits or pushes.

### Final repaired-tree verification

Independent final `corepack pnpm test` passes **506 tests**, no failures/skips: 61 scripts, 2 importers, 14 core, 88 web, 229 db, 112 server. Serial `node scripts/verify.mjs` passes Git/source hygiene, installed Node 24.17.0, complete typecheck and production build. The existing Vite large-chunk advisory remains. Logs: `/tmp/storymapper-2-6-parent-final-tests.log` and `/tmp/storymapper-2-6-parent-final-verify.log`. Parent independently inspected the repair diff and exact recovery, UI reconciliation and Dialog source; the final unified code diff was refreshed for review.

Final native Chrome reloaded the exact production build. An owned loopback proxy deliberately dropped a successful restore response after the server completed it: the app reloaded, recovered the correct durable result, preserved the later edit as undone history, and displayed the restored Card state. The final build then recovered that same saved attempt with native H2 completion focus, inert background and 420px client/scroll widths. No additional restore POST was sent during reconciliation.

The proxy next dropped a restore request before forwarding it. Reload showed “Restoration did not complete” with native heading focus. Continue editing released the background; an explicit retry reopened confirmation and native Cancel returned focus to the selected restore row. HTTP independently confirmed the later Card edit survived, all four snapshot entries and both prior completion events were unchanged, and no restore was automatically resent. All acceptance databases/files, proxy/server processes and owned browser tabs were cleaned up. Earlier actual drain/corrupt-candidate acceptance and final database/server regressions cover the remaining matrix rows.

Native Windows/Linux, actual screen-reader speech and filesystem power-loss durability were not operated. The three frontmatter deferrals remain explicit. No user database/input, sprint-status write/stage/revert, commit or push occurred.

## Verification

- After implementation: Node 24.17.0, `corepack pnpm test`, then serial `node scripts/verify.mjs`.
- Disposable production browser/server acceptance for confirm → progress → reload/result and post-restore writes.

## Auto Run Result

Status: done

Summary: follow-up review of the already-complete Story 2.6 restore implementation by four independent lenses; four small repairs landed and the rest were rejected or deferred with evidence.

Files changed this pass:
- `packages/db/src/restore-project.ts` — unresolved interrupted restore now a RestoreValidationError (4xx, not an unknown-outcome 500).
- `packages/db/src/repositories/export-formatters.ts` — Markdown audit export flags undone events.
- `packages/db/src/restore-project.test.ts` — legacy upgrade backfill test; audit export undone assertion.
- `apps/server/src/http/routes/restore-points.test.ts` — non-handler request release then restore completes.

Review findings: patches applied 4 (medium 2, low 2); deferred 1 (low, DDL fingerprint divergence); every other row rejected with its reason in the triage log. Follow-up review recommended: false, no high patched on this follow-up pass.

Verification: `corepack pnpm test` passes (14 core, 88 web, 230 db, 113 server, 2 importers, scripts) and serial `node scripts/verify.mjs` reports "Verification completed" (typecheck and build; existing Vite chunk advisory). Removing the onResponse hook makes the new gate test hang, confirming it detects the regression.

Residual risks: native Windows/Linux, screen-reader speech and filesystem power-loss durability remain unverified; the three earlier deferrals stand. No commit made: sprint-status.yaml and deferred-work.md stay orchestrator-owned and dirty, so the working tree cannot be committed clean by this run; the orchestrator commit path owns it.
