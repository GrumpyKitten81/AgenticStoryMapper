---
title: '2.2 Create and list restore points'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_revision: '0841005826d42b092804a51ff51b803e44dee0d2'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '[REDACTED_HOME]/Projects/StoryMapper/AGENTS.md'
  - '[REDACTED_HOME]/.claude/CLAUDE.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.wolf/OPENWOLF.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.wolf/cerebrum.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/code.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/typescript.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/comments.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/logging.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/markdown.mdc'
warnings: [oversized]
deferred:
  - summary: >-
      HTTP and stdio retain independent database writers and process-local write gates.
    evidence: |-
      The baseline stdio process opened the same SQLite database directly before this story. The architecture gate is in-process; a stdio write can occur between snapshot publication and a migration transaction in another process. Single-writer server/bridge topology remains Epic 8 work.
    location: >-
      apps/server/src/mcp/stdio-main.ts:11
    severity: medium
---

Date: 2026-10-04. Version: 3. Purpose: implement Story 2.2 create/list restore points, retention, protected fixture migration and accessibility. Never write, revert or stage orchestrator-owned sprint-status.yaml; bookkeeping is not verification. No commit or push is authorized.

<intent-contract>

## Intent

**Problem:** Users have no restore points to protect local work, and database writes have no shared exclusion gate for snapshots.

**Approach:** Create complete SQLite restore points with atomic file publication, fixed retention and a human-only Activity tab. Share one synchronous write gate with units of work and protected fixture migrations.

## Boundaries & Constraints

**Always:** Snapshot the current DatabaseHandle database with VACUUM INTO a unique temporary file outside transactions; publish by rename only on success. Use the actual runtime database directory's snapshots/ folder, not Project.localPath metadata. The existing prototype stores several Projects per database: clearly state that restore points include all Projects in this local database. Filename and shared metadata carry class, UTC creation timestamp, size and actual development-schema identity. Use a deterministic SHA-256 fingerprint of ordered application sqlite_schema DDL as the development schema version; do not invent a release migration baseline. Classes are manual, pre-migration, pre-restore and pre-apply. Retain newest ten per class, then enforce a fixed 1 GiB cap oldest eligible first; never delete the last of any class or newest pre-migration/pre-restore until a successor successfully publishes. Preserve protected points even if they alone exceed the cap. List finalized recognized files newest first, persist across reopen, and create snapshots/.gitignore excluding contents. Snapshot/migration/UoW share one handle-owned gate with explicit reentrancy errors; afterCommit runs after release. Failed snapshot creation removes temporary artifacts and exposes cause; retention failures also remain explicit. Mark create/list capabilities human-only and expose no MCP tool. Controls and announcements use shared English strings.

**Never:** Apply restoration, wire pre-apply/session automatic triggers, create production versioned migrations, alter archive redaction behavior, add remote services or dependencies, change Project storage ownership, edit user data, create compatibility fallbacks/placeholders, commit/push, or touch sprint-status.yaml. Required workflow artifacts and meaningful tests are authorized. New source files stay within 750 lines/100 KB and new functions within 50 lines.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Manual create | Existing Project, committed WAL data | Complete manual SQLite file, integrity valid, correct filename/metadata, current database contents | No error |
| Snapshot failure | Real SQLite or filesystem failure before publication | No partial file/list entry; prior points remain | Concrete cause reaches HTTP and visible alert |
| Ordering/reopen | All four classes, same-clock creations, reopened holder | Unique names, newest-first metadata and byte sizes remain accurate | Reject malformed API input/project ID |
| Retention | More than ten/class or total exceeds 1 GiB | Oldest eligible removed; last/class and newest protected classes preserved | Cleanup failures explicit |
| Protected migration | Populated fixture, real synchronous migration callback | pre-migration point exists before callback changes data | Snapshot failure prevents callback; migration failure rolls back migration |
| Gate/lifetime | UoW calling snapshot or snapshot/migration calling UoW; replaced holder | Reject reentrancy; gate released on failures; later work uses current holder | Explicit error; preserve prior UoW guarantees |
| Human surface | Human HTTP and Activity UI; MCP manifest/registry | Create/list available only human capability surface; MCP contains no corresponding tool | No agent restore-point endpoint/tool |
| Accessible action | Keyboard action, pending request, success/failure | Keyboard list/button; pending prevents duplicate UI action; persistent status says Restore point created; persistent alert announces cause | Cause remains visibly available |

</intent-contract>

## Code Map

- `packages/db/src/database-handle.ts` DatabaseHandle.current and TransactionContext.execute; `unit-of-work.ts` run and afterCommit: no gate currently. Preserve immutable actors, synchronous/expired/forged Tx enforcement. Server/stdio and HTTP fixtures currently use structural holders; convert affected constructors.
- `packages/db/src/connection.ts` openStoryMapperDb/private migrate: unversioned pre-release DDL, no journal/version marker. `snapshot.ts` creates redacted archive DB and must remain separate. New restore-point module owns all SQLite reads/writes and filesystem snapshot lifecycle.
- `packages/db/src/unit-of-work.test.ts` provides temporary real SQLite, failure injection, lifetime and replacement tests. New restore tests must inspect actual snapshot database including WAL, not only mocked VACUUM calls.
- `apps/server/src/http/routes/index.ts` RouteOptions has repository, UoW and databasePath; add dedicated restore routes module. `server.ts` and `mcp/stdio-main.ts` holder construction; `mcp/tools/register-tools.ts` registry has no snapshot tools. No general capability registry exists yet (later Story 3.3); minimal explicit typed descriptors suffice.
- `packages/contracts/src/schemas/domain.ts`, `api/http.ts`, `index.ts`: shared restore class/metadata/list/create/capability schemas and types originate here.
- `apps/web/src/app/routes/audit.tsx` AuditRoute `/projects/$projectId/audit`; `RootLayout.tsx:102` Audit nav is dev-gated. Make Activity normally reachable; Restore points tab preserves existing log/export panels.
- `apps/web/src/app/api.ts:101,109` discards server message: restore requests must preserve actual cause; add query/create helpers and invalidation. `ui-strings/index.ts` owns copy; `ui-strings.test.ts` scans literal JSX.
- `apps/web/src/styles/global.css`: no global focus-visible rule; Tiptap outline suppression at1608 and input/topbar borders need replacement. DESIGN tokens: focus-ring-light #2D5F45, focus-ring-dark #FFFFFF, border-input #7A877F. RootLayout lacks shared persistent announcements.
- `apps/web/src/features/story-map/components/card-detail.test.ts` demonstrates real DOM/QueryClient/fetch tests; server `http/routes/unit-of-work.test.ts` demonstrates actual HTTP/current holder.
- Graph tools unavailable; both investigation agents read source. Epic context current; prior Story 2.1 source and final verification provide continuity without treating status as proof.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/schemas/restore-points.ts`, `api/http.ts`, `index.ts` — shared validated metadata/classes and human capability descriptors.
- [x] `packages/db/src/database-handle.ts`, `unit-of-work.ts` — handle-owned synchronous exclusion shared by UoW/snapshot/migration; notifications after release; update affected structural holders.
- [x] `packages/db/src/restore-points.ts`, focused lifecycle/retention helpers as needed, `index.ts` — current-holder VACUUM publication, metadata/listing, fixed retention, gitignore and protected migration callback entrypoint; no production migration hooks yet.
- [x] `apps/server/src/http/routes/restore-points.ts`, existing route registration/server/stdio — validated human list/manual-create routes using real runtime storage; preserve errors and existing actors/API behavior.
- [x] `apps/web/src/features/restore-points/RestorePointsPanel.tsx`, `app/api.ts`, `app/routes/audit.tsx`, `RootLayout.tsx`, shared announcement component/store and `ui-strings/index.ts` — production Activity navigation/tab, create/list, retained visible causes, always-mounted status/alert.
- [x] `apps/web/src/styles/global.css` — single global focus-visible rule 2px/2px via surface token; dark on chrome/filled, light on light surfaces; replace outline suppression and input/select/textarea borders with border-input.
- [x] `packages/db/src/restore-points.test.ts` plus focused server/web tests — execute every matrix row, real failure cleanup/retention/migration/gate/current-holder/WAL checks and 1,000-Card timing; root CSS/token assertions and outer HTTP/DOM coverage.

**Acceptance Criteria:**
- Given a Project in the normal production UI, when I navigate to Activity and keyboard-activate Restore points/Create restore point, then a persisted manual SQLite point appears with class/time/size/schema, success is announced, and reload retains it.
- Given storage failure, when I create a point, then the UI visibly names and announces the server cause and no partial list entry appears.
- Given retention thresholds, when a new point successfully publishes, then files obey newest-ten/class and oldest-eligible cap rules without losing protected points; failed publication preserves the prior newest protected point.
- Given a populated fixture migrator, when protected migration starts, then its pre-migration snapshot captures pre-change content; when snapshot fails, then migration never starts.
- Given 1,000 Cards, when snapshot creation alone is timed, then it completes in at most 2 seconds (1-second budget with 2x tolerance).
- Given global controls, when keyboard focus reaches light controls/chrome/filled controls/editor, then computed outline is 2px with 2px offset and correct surface token; input/select/textarea boundaries use border-input.
- Given the human capability list and MCP registry, when inspected, then create/list are human-only and no restore-point MCP tool is advertised or callable.

## Spec Change Log

## Review Triage Log

### 2026-10-04 — Review pass 1
- verdicts: 21 findings — high 4, medium 9, low 1, false 7, maybe-false 0
- findings:
  - `[high]` `[patch]` Blind: rollback of the clock prunes the just-published point — publication unconditionally runs timestamp-ordered retention and then returns success; use persisted publication order and exercise protected migration pre-change contents under clock rollback.
  - `[high]` `[patch]` Blind: colocated database files share restore inventories — directory uses dirname(current client name) and file names/listing contain no origin; isolate origin inventories and test retention across two real colocated files.
  - `[medium]` `[patch]` Blind: async migration continues after rollback — the raw database is supplied before returned Promise rejection, so an awaited continuation remains writable; reject async functions before invocation and exercise delayed-write nonexecution.
  - `[medium]` `[defer]` Blind: stdio and HTTP use independent process gates — stdio already directly opened the same database before this story; the named architecture gate is explicitly in-process. Existing independent-writer topology remains Epic 8 work; no distributed lock is introduced here.
  - `[medium]` `[patch]` Blind: post-publication retention error leaves a stale UI — retention runs after rename, while onError announces failed creation without refetching; revalidate settled requests and use truthful operation-error wording while preserving cause.
  - `[medium]` `[patch]` Blind: filled-button white focus outline is invisible on white panels — rendered outline is white, offset 2px outside a white-panel button; add contrasting focus backing while preserving mandated outline tokens/geometry.
  - `[medium]` `[patch]` Blind: view remount discards duplicate prevention — unmount recreates both ref and observer even though original mutation remains pending; reuse shared mutation state/cache and test pending view switches.
  - `[false]` `[reject]` Blind: non-JSON proxy errors lose HTTP causes — these fixed loopback Fastify routes return JSON for validation, missing Projects and storage errors, including actual tested EISDIR; no proxy/non-JSON response path exists in the supported runtime. No hypothetical parser fallback is added.
  - `[low]` `[reject]` Blind: externally corrupted matching files pass listing — this needs out-of-band modification of a successfully VACUUM-published file; no creation/list caller produces such content. Adding SQLite integrity scans to every listing/retention is disproportionate to this rare trigger; integrity validation is assigned to restoration.
  - `[medium]` `[patch]` Blind: declarations cannot prove visible primary focus — CSS/jsdom checks did allow white-on-white focus. Supplement the focus repair with parent rendered-browser contrast/keyboard inspection; actual screen-reader speech remains an explicitly recorded evidence limit.
  - `[medium]` `[patch]` Verification: ordinary satisfiable 1 GiB cap is untested — pre-verified search and mutation demonstration: a 2 GiB limit passes the existing protected-over-cap fixture. Add three real 400 MiB sparse files and assert oldest removed/newest two total 800 MiB.
  - `[high]` `[patch]` Edge: clock rollback loses migration protection — same verified timestamp-order root cause as the blind finding; publication order protects new manual and pre-migration points.
  - `[medium]` `[patch]` Edge: awaited migration writes after gate release — same verified async invocation root cause; reject before callback begins and assert no delayed write.
  - `[high]` `[patch]` Edge: colocated files delete one another's backups — same verified origin-free inventory root cause; isolate source inventories with real independent retention checks.
  - `[medium]` `[patch]` Edge: primary focus vanishes on a white panel — same verified white-outline/background root cause; preserve dark-token outline and provide a contrasting two-color indicator.
  - `[false]` `[reject]` Intent: database-wide snapshots differ from independent Project folders — the required VACUUM INTO snapshots the actual runtime database, which already stores multiple Projects; Project.localPath never selected persistence. The UI explicitly discloses actual scope and tests confirm it; per-Project storage refactoring is not a reading consistent with the existing source plus VACUUM requirement.
  - `[false]` `[reject]` Intent: protected callback is not startup migrator integration — Story 2.2 expressly requires a test migration on a fixture; real callbacks capture pre-change SQL, rollback and abort before invocation. Release/startup migration integration belongs to the versioned migration story; no placeholder is introduced.
  - `[false]` `[reject]` Intent: declaration is not a shared registry or authenticated human identity — no general registry exists yet; the actual typed capability endpoint registers both use cases as human-only, with no MCP tool. Architecture classifies actors by entry surface and states this is a cooperative-agent guardrail, not process authentication.
  - `[false]` `[reject]` Intent: browser keyboard/computed accessibility absent from diff tests — parent independently operated Enter/Tab and inspected computed chrome/light/filled/editor focus and input/select borders in Chrome. The real primary contrast defect is separately patched; no claim of operated screen-reader speech is made.
  - `[false]` `[reject]` Intent: UI persistence has no continuous live check — parent created through the production browser, reloaded against the same real server/database and inspected retained metadata/newest order; complementary layer tests also passed.
  - `[false]` `[reject]` Intent: diff alone cannot prove workflow/status preservation — tool evidence establishes one exact renderer invocation, prescribed steps/subagents, 310 passing tests and serial release gates. Commands never write/revert/stage sprint-status; no status diff exists. This descriptive evidence limit is not a code defect.

### 2026-10-04 — Review pass 2 (follow-up)
- verdicts: 45 findings — high 0, medium 0, low 15, false 30, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: file names exceed Windows limits — name is about 244 characters, below the 255 NAME_MAX, and Node namespaces absolute paths (`\\?\`) for fs calls, so MAX_PATH does not apply to rename/list
  - `[false]` `[reject]` Blind: snapshots keep default permissions — snapshots mirror the live database file's permissions on a loopback-only local tool; no requirement or policy asks for stricter modes and `.gitignore` is created
  - `[low]` `[reject]` Blind: invalid recognized files are skipped silently — skipping unfinalized/unrecognized files is the specified listing rule; the size/timestamp guard is now pinned by a test; a truncated file needs out-of-band tampering
  - `[false]` `[reject]` Blind: retention failure returns 500 after publication — the spec requires retention failures to remain explicit; the UI revalidates the list and shows the point with the alert (patched in pass 1)
  - `[false]` `[reject]` Blind: extra classes and protected migration are speculative — the intent requires four classes, class-specific retention and a protected fixture migration entrypoint
  - `[false]` `[reject]` Blind: Activity link no longer dev-gated — the Code Map requires Activity to be normally reachable; exposing its panels follows from that
  - `[low]` `[patch]` Blind: duplicate Activity headings and non-URL tab state — outer and panel h2 read the same; panel h2 now uses the existing activity-log string; deep-linking is not required
  - `[low]` `[reject]` Blind: announcement never clears or re-announces on refetch — persistent status/alert regions are required by the intent; re-announcing an unchanged error is negligible
  - `[low]` `[reject]` Blind: three overlapping double-submit guards — redundant but pinned by pending/remount tests; no named harm and removal needs re-verification
  - `[false]` `[reject]` Blind: focusable list rows are inert tab stops — the intent's accessible-action row requires a keyboard list
  - `[false]` `[reject]` carried Blind: restorePointJson fails on non-JSON bodies — same claim as pass-1 non-JSON proxy row; fixed loopback Fastify routes return JSON
  - `[false]` `[reject]` Blind: synchronous VACUUM blocks the event loop — the spec mandates a synchronous gate and a snapshot-only 2-second bound, which is tested
  - `[false]` `[reject]` Blind: creation is not audited — the intent does not require an Activity Event and no ChangeSet applies to a human action
  - `[low]` `[reject]` Blind: database id/directory depend on basename and cwd — no code path changes cwd or renames the database after open; fix needs new state on the handle
  - `[low]` `[reject]` Blind: project existence via listProjects().some — inefficient only; project counts are small and a new repository method would add surface
  - `[low]` `[reject]` Blind: many hand-placed focus-ring declarations and hard-coded alert colour — maintainability opinion with no named divergence; two-colour ring is the pass-1 contrast repair
  - `[low]` `[reject]` Blind: brittle CSS-text, wall-clock and sparse-file tests — the 2-second bound and 400 MiB files are mandated by the spec and pass-1 repair
  - `[false]` `[reject]` Blind: no ADR written — AD-3 in the architecture spine already records the single write gate, human-only restore/snapshot and in-process scope
  - `[false]` `[reject]` Blind: nested-unit-of-work message changed — no source or test references the old text; all suites pass
  - `[low]` `[reject]` Blind: synchronous function returning a Promise passes the AsyncFunction check — the callback type forbids promises and assertSynchronous fails loudly; remaining hole needs a type violation and extra guards
  - `[false]` `[reject]` Blind: API exposes file names and filesystem errors — the intent requires the concrete cause; fileName is the point identity on a loopback tool
  - `[false]` `[reject]` carried Edge: non-JSON error bodies — same as the pass-1 proxy row
  - `[low]` `[reject]` Edge: ENOENT between readdir and lstat — requires external deletion; the gate serializes in-process work and stdio never lists snapshots
  - `[low]` `[reject]` Edge: ENOENT on retention unlink — same external-deletion trigger, and the error stays explicit
  - `[low]` `[reject]` Edge: orphaned .tmp after a process kill — needs a crash mid-VACUUM; a sweep adds new lifecycle behaviour outside the failure-cleanup requirement
  - `[false]` `[reject]` Edge: retention failure aborts protected migration — the migration has not started and the error is explicit; only data-safe fail-fast behaviour
  - `[false]` `[reject]` Edge: sequence exhaustion — explicit error at 99,999,999 points; unreachable under ten-per-class retention
  - `[low]` `[reject]` Edge: relative path and cwd change — same as the database id/cwd row
  - `[false]` `[reject]` Edge: filename length — same as the Windows-limit row
  - `[false]` `[reject]` Edge: stale alert across routes — persistent live regions are specified
  - `[low]` `[reject]` Edge: focus box-shadow replaces element elevation — intentional two-colour indicator from the pass-1 contrast patch; cosmetic during focus only
  - `[false]` `[reject]` Edge: editor wrapper keeps low-contrast border — the requirement covers input/select/textarea; the editor is contenteditable and its outline was verified
  - `[false]` `[reject]` Edge: nav no longer gated — same as the Activity link row
  - `[low]` `[patch]` Gap: size/timestamp guards in listing are untested — added a db test where a mismatched embedded size and an impossible date are not listed and do not affect sequence
  - `[false]` `[reject]` carried Gap other: restorePointJson non-JSON body — same as pass-1 proxy row
  - `[false]` `[reject]` carried Intent: human-only is naming/absence, not a caller check — same as pass-1 registry/identity row; AD-6 classifies actors by entry surface
  - `[false]` `[reject]` carried Intent: UI tests mock fetch — same as pass-1 live-persistence row; real server and Chrome were exercised
  - `[false]` `[reject]` Intent: tab is aria-pressed buttons, not ARIA tabs — the intent asks for keyboard list/button controls
  - `[false]` `[reject]` carried Intent: project-scoped URL fronts database-wide action — same as pass-1 scope row; the UI states the all-Projects scope
  - `[false]` `[reject]` Intent: file name carries more than listed fields — the extras support the pass-1 origin isolation and publication-order repairs
  - `[false]` `[reject]` carried Intent: cap is per database id — decided by the pass-1 colocated-database repair
  - `[false]` `[reject]` carried Intent: ordering by sequence not timestamp — decided by the pass-1 clock-rollback repair
  - `[false]` `[reject]` Intent: retention failure yields 500 although published — same as the retention-500 row
  - `[false]` `[reject]` Intent: retention failure inside a protected migration also prevents the callback — same as the Edge retention/migration row; the migration never starts and the error is explicit
  - `[false]` `[reject]` Intent: global.css, announcement store, audit restructure and fixtures exceed the listed scope — all are in the spec's Tasks and Code Map

## Design Notes

Synchronous SQLite operations already serialize on the Node event loop; the shared gate makes reentrant overlap explicit and provides the required common owner. A protected migration entrypoint performs an actual supplied synchronous SQLite migration only after snapshot success, enabling the required populated fixture without premature release migration machinery. All snapshots cover the current runtime DB; Project routes authorize existence but do not pretend file metadata is isolated Project storage. Development schema fingerprints are schema identifiers, not forward migration versions.

## Verification

Use PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH. Stage new source/test files explicitly before portable script fixtures use git ls-files; never stage sprint-status.yaml. Run builds and tests serially.

**Commands:**
- `corepack pnpm --filter @storymapper/db test` — real snapshot, gate, migration, retention and performance regressions pass.
- `corepack pnpm --filter @storymapper/server test` and `corepack pnpm --filter @storymapper/web test` — actual API/DOM and existing regressions pass.
- `corepack pnpm test` — all workspace tests pass without failures/skips.
- `node scripts/verify.mjs` — Git/source hygiene, runtime, typecheck and build pass.

**Browser:** Isolated disposable runtime, production Activity link, keyboard create/reload, inspect metadata/success and computed focus/border styles. Stop owned server and remove temporary data; never open user Projects.

## Verification Evidence

Parent independently read the complete unified diff and ran db (118), server (90), web (26), then full workspace (310 total, zero failures/skips) and serial release verification; all exited zero on Node 24.17.0. An earlier overlapping release invocation was interrupted, then rerun serially successfully. All eight matrix rows have executed passing coverage: real WAL/integrity; SQLite/filesystem/rename cleanup plus HTTP/DOM causes; all-class same-clock/reopen ordering; per-class/cap/retention error; pre-change migration/abort/rollback; gate/replacement/afterCommit; HTTP capabilities and absent MCP; production-router DOM/pending/permanent regions. Snapshot-only timing passed the 2-second bound.

Isolated default-production Chrome acceptance verified Activity navigation and create by keyboard, real point metadata, reload persistence, newest-first rows, a real EISDIR failure with unchanged prior row, recovery after repair, permanent visible success/error regions, computed 2px/2px light/chrome/filled/editor outlines and border-input on text inputs/selects. Temporary browser/server/data cleaned. Screenshot saved outside the repository at /tmp/storymapper-2-2-restore-points.png. Native Windows/Linux and an actual screen reader have not been operated.

## Final Post-Repair Verification

Parent read the repaired source and tests and independently reran db (123), server (90), web (28), then the full workspace: **317 tests pass, zero failures/skips** (61 scripts, 2 importers, 13 core, 28 web, 123 db, 90 server). Every command exited zero. After workspace completion, `node scripts/verify.mjs` passed Git/source hygiene, Node/pnpm checks, typecheck and production build serially. The existing bundle-size advisory remains nonblocking. Final logs: `/tmp/storymapper-2-2-workspace-repaired.log` and `/tmp/storymapper-2-2-release-verify-repaired.log`.

All eight matrix rows have executed passing coverage. Repair regressions add clock-rollback publication ordering/protected migration, colocated database isolation, async/bound-async rejection before invocation, ordinary satisfiable 1 GiB cap, retention-error listing refresh and pending mutation view remount. The actual 1,000-Card snapshot timing meets the 2-second tolerance. No declaration or sprint row is used as verification evidence.

Fresh final production Chrome acceptance on a disposable database verified Enter and Space creation, newest-first metadata, both points retained across reload, the concrete EISDIR action error without partial files or loss of prior points, and successful recovery after repairing the fixture. Keyboard Tab focuses the filled button with a white 2px outline, 2px offset and visible green outer backing on the white panel. Parent inspected the rendered screenshot as well as computed focus styles. Screenshot: `/tmp/storymapper-2-2-restore-points.png`. Owned browser tab/server/database were cleaned. Earlier light/chrome/editor and input/select boundary checks remain valid; actual screen-reader speech and native Windows/Linux execution were not operated.

## Auto Run Result

Status: done

Summary: Story 2.2 restore points (create/list, retention, protected migration entrypoint, shared write gate, human-only Activity tab, focus/border styling) implemented in earlier passes; this follow-up pass reviewed the full diff again and found nothing high or medium.

Files changed this pass:
- `apps/web/src/app/routes/audit.tsx` — panel heading uses the activity-log string so the page no longer shows two identical Activity headings.
- `packages/db/src/restore-points.test.ts` — new test pins that a mismatched embedded size or impossible timestamp is never listed and does not advance the sequence.

Review findings: 45 reported — patched 2 low, deferred 0, rejected 43 (see Review Triage Log, pass 2, for each reason; carried rows repeat pass-1 verdicts).

Follow-up review recommendation: false — no high patched on this follow-up pass; patched counts: high 0, medium 0, low 2.

Verification: `corepack pnpm --filter @storymapper/db test` (124 pass), `corepack pnpm --filter @storymapper/web test` (28 pass), `node scripts/verify.mjs` (hygiene, runtime, typecheck, build) passed on Node 24.17.0. The server and full-workspace suites were not rerun because no server or contract code changed.

Residual risks: the existing deferred item about independent HTTP and stdio write gates remains; no screen reader or native Windows/Linux run. No commit was made: the spec states no commit or push is authorized, so the changes remain in the working tree for the orchestrator.
