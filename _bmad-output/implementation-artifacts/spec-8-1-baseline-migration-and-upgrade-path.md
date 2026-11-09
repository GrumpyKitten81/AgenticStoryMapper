---
title: '8.1 Baseline migration and upgrade path'
type: feature
created: '2026-10-19'
status: done
baseline_revision: 'caf2a61fc7a3447a02d29aad545f9473082ca86d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-8-1-baseline-migration-and-upgrade-path.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      Exercise an older supported Restore/archive upgrade through the running browser lifecycle.
    evidence: |-
      Unverified: service and browser lifecycle tests pass independently, but no running browser has adopted an older generated release and demonstrated epoch/cache/dirty-editor reset end to end. A disposable older-release input through the existing HTTP/browser surface would settle this concern.
    location: >-
      Restore/archive browser lifecycle
    severity: medium (unverified)
  - summary: >-
      Nothing automated detects divergence between schema/tables.ts and the committed generated baseline SQL.
    evidence: |-
      Verification-gap review: migration tests assert selected constraints and the JSON inventory only; drizzle-kit check ran manually. A CHECK, index or default added to tables.ts without a generated migration (or SQL edited alone) passes every current test. The same drift class existed with the former bootstrap DDL, so it is not introduced here.
    location: >-
      packages/db/src/schema/tables.ts, packages/db/migrations
    severity: medium
---

# Story 8.1: Baseline migration and upgrade path

Date: 2026-10-20. Version: 3.

Reproducing statement: Implement the generated release baseline, protected forward migrations, versioned persisted JSON and supported Restore/archive upgrades for Story 8.1. Never write, stage or revert orchestrator-owned sprint-status.yaml; its rows are not verification evidence.

<intent-contract>

## Intent

**Problem:** Inline bootstrap and prototype backfills cannot establish a trustworthy release upgrade path; Restore/archive reject older schemas and most persisted JSON lacks versioned readers.

**Approach:** Generate one complete Drizzle baseline, admit only authenticated supported migration prefixes, and protect each forward migration with a restore point and atomic foreign-key validation. Prepare older supported Restore/archive copies through that same runner and validate every JSON payload with an explicit version.

## Boundaries & Constraints

**Always:** Follow AD-9 and Epic 8 preparation; DB owns persistence, contracts owns schemas, core stays pure. Preserve ownership/draining, epoch reset, historical bytes, redaction and truthful filesystem effects. Keep schema identity, archive format, app version, payload versions and operation versions distinct. Upgrade only ORM/Kit here; use Node 24 and pinned pnpm. Generated SQL is the sole schema creation/change path; infrastructure journal is the only explicitly classified nonaggregate table. Existing file-backed state receives a successful durable pre-migration snapshot including retention before each pending migration. Empty and memory databases need no prior-state snapshot.

**Never:** Enroll/backfill prototype databases, downgrade, manufacture remote consent, add alternate bootstrap/compatibility readers, runtime schema generation, private ORM access, new migration HTTP/MCP operations, user data fixtures, unrelated dependency upgrades, push/tag/publication, or change sprint-status.yaml.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Fresh/current | Empty DB / authenticated current journal | Baseline creation / no migration or business rewrite | Missing assets fail explicitly |
| Supported old | Populated generated baseline followed by generated test-only next migration(s) | Snapshot before each; preserved table counts/values; accepted SQL+journal only after FK check | Restore instructions identify last usable snapshot |
| Unsupported | Populated no-journal, future/unknown/divergent/malformed journal, schema drift | Refuse before persistent pragmas, DDL or business writes | Name prototype/newer/inconsistent reason and concrete manual recovery |
| Migration failure | Snapshot/retention, SQL, FK violation or interrupted transaction | Snapshot failure prevents SQL; transaction failure rolls SQL+journal back; FK ON restored | No invalid DB admitted; report retained filesystem effects |
| Restore/archive | Supported older original | Source integrity/checksum/count/redaction admission, copy migration, current validation, atomic adoption/new epoch | Original unchanged; failed candidate leaves active DB intact |
| Payload | Current, SQL NULL, malformed/future JSON; old historical operations | Version-aware validation; NULL retained; historical applied/undone bytes non-executable | Reject malformed/future live values visibly before startup mutation |

</intent-contract>

## Code Map

- `packages/db/src/connection.ts:25,39,55` — existing opener bypasses validation; normal opener sets WAL before admission; remove inline migrate/ensureColumn/backfills (through end of file), include required initial epoch DML inside the baseline transaction.
- `packages/db/src/schema/tables.ts` — 28 JSON columns/14 tables; add 24 siblings below. Align external_refs entity/provider/nonblank-ID/positive synced-version checks, database_metadata id=1, card_source_links kind enum with actual existing bootstrap before generation.
- `packages/db/src/schema/classification.ts:22`, `snapshot.ts:28,69` — explicitly classify __drizzle_migrations as infrastructure, preserve it through export/redaction, exclude from domain pruning.
- `packages/db/src/restore-points.ts:34,76` — factor raw SQLite snapshot publication out of publishRestorePoint; retain VACUUM/promotion/retention and exclusive gate, avoid recursively acquiring DatabaseHandle or opening a DB to learn identity. Existing runProtectedMigration must not wrap stock Drizzle BEGIN/COMMIT.
- Proposed `packages/db/src/migration-{assets,runner}.ts`, `packages/db/drizzle.config.ts`, `packages/db/migrations` — public readMigrationFiles plus DB-owned transactions; committed SQL and Kit metadata. No private dialect code.
- `packages/db/src/restore-validation.ts:18,23` — replace DDL development hash with authenticated release-chain identity; separate supported source admission and final current-domain/JSON validation.
- `packages/db/src/restore-project.ts:75,85,35`, `restore-recovery.ts:90` — stage/migrate before current validation/history merge; ready marker identifies migrated target schema. Keep interruption/swap recovery semantics.
- `packages/db/src/archive-database.ts:25,31`, `apps/server/src/services/project-archive.ts:64` — eliminate recursive fresh DB schema lookup/current-only early rejection; validate original checksum/source counts/redaction before migrating a staged copy.
- `packages/db/src/restore-history.ts:34,56` — same-column history merge after migration; preserve explicit remote evidence bytes and new version columns.
- `packages/db/src/restore-point-files.ts:5`, `packages/contracts/src/schemas/restore-points.ts:12` — schema filename grammar; server infrastructure health reads same schema identity. UI prints schema directly; adjust only actual contract consumers.
- `packages/db/src/repositories/row-mappers.ts`, `operation-persistence-repository.ts::encodeRow` — repository readers and generic operation writes; encodeRow otherwise overwrites absent sibling values with NULL.
- `packages/db/src/operation-schema-transition.ts` — current operation version 11; historical loose operations intentionally preserve bytes. Future active operations must refuse; older active may become stale; applied/undone remain non-executable.
- `packages/db/src/repositories/{projects,customizations,roadmaps,work-item,changesets,audit,cards,card-history,ai-templates,remote-push,github-refs,external-refs}-repository.ts`, `live-events.ts`, `github-archive-redaction.ts` — JSON readers/writers including direct SQL/JSON.parse bypasses and nullable redaction pairs.
- `packages/db/package.json`, `apps/server/package.json`, build scripts/tsconfigs — ORM/Kit and asset packaging. Actual tsc copies DB source into both packages/db/dist/packages/db/src and apps/server/dist/packages/db/src; prove assets resolve module-relatively in source and built output from unrelated cwd.
- Relevant existing tests: DB restore-points/failures/project, snapshot, operation-schema-transition, source-document-migration, card-history/live-events/remote-push/archive-redaction; server project-archive and web Restore/archive tests. Graph unavailable; maps were verified against source by three investigations.

## Tasks & Acceptance

**Execution:**

- [x] `packages/db/package.json`, `pnpm-lock.yaml` — select ORM >=0.45.2 and matching Kit using current official metadata/advisory evidence; record exact install/audit commands; run existing DB/lifecycle regressions before further changes.
- [x] `packages/db/src/schema/tables.ts`, shared DB JSON validation module and mapped repository/lifecycle files — implement the complete inventory below with shared contract schemas and every writer/read bypass; preserve null/history/consent semantics.
- [x] `packages/db/drizzle.config.ts`, `packages/db/migrations`, mapped schema — generate complete baseline and Kit metadata; review SQL checks/defaults/unique constraints/indexes and assert intended semantics, not merely table names.
- [x] `packages/db/src/migration-assets.ts`, `migration-runner.ts`, `connection.ts`, `restore-points.ts` — authenticate journal prefix AND actual schema, implement protected per-migration atomicity/FK ordering/shared identity, remove alternate bootstrap, package assets and validate current reopen.
- [x] Mapped Restore/archive/classification/contracts/server files — admit source version, migrate staged copies through same runner, final validation, target markers and active-epoch adoption; preserve original bytes and safety boundaries.
- [x] DB/server affected tests and generated test-only migration fixtures — exercise every matrix case, all-table counts/value readback, each failure boundary, transaction interruption/reopen, source/built assets and supported old Restore/archive via outer API. Replace prototype-backfill tests with refusal tests.
- [x] Workspace/release verification — run Node24 focused suites then full tests/typecheck/build/verify serially; record exact commands/results, audit limits and recovery instructions for 8.6. Preserve sprint ownership.

**Acceptance Criteria:**

- Given an empty DB, when startup runs, then committed generated baseline SQL creates all intended constraints/indexes/defaults and no application bootstrap DDL remains.
- Given a populated supported prefix with pending migrations, when opened, then each migration has a successful prior-state restore point and atomically accepted SQL/journal/FK validation with every table's expected counts and JSON/history values preserved.
- Given each snapshot/retention/SQL/FK failure or process interruption, when reopening, then no falsely advanced journal or invalid DB is admitted, FK mode is restored for surviving connections and prior committed state is recoverable.
- Given a prototype, newer/divergent journal or altered schema, when opened, restored or imported, then refusal precedes source mutation and provides actionable manual recovery.
- Given older supported Restore/archive input, when adopted through the existing user surface, then original hash/count/redaction checks precede copy migration, target schema/epoch are correct, original bytes remain unchanged and failed preparation preserves the active DB.
- Given all 28 persisted JSON fields, when written/read/reopened and validated as candidates, then sibling versions are consumed, malformed/future live payloads refuse, nullable pairs stay null and applied/undone operation bytes/history remain intact and non-executable.
- Given selected ORM/Kit and packaged assets, when audit, source/built startup and workspace/release gates run, then the older Drizzle advisory is absent and all relevant checks pass; unrelated advisory/platform limits are recorded accurately.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass

- verdicts: 17 findings — high 5, medium 4, low 2, false 5, maybe-false 1
- findings:
  - `[false]` `[reject]` I1: Diff cannot establish workflow execution or protected-file history — exact renderer and verification command results exist outside the code diff; sprint-status is unchanged and is not used as evidence of verification.
  - `[false]` `[reject]` I2: Existing installations might include prototype databases — AD-9 and the named story explicitly refuse populated databases without an authenticated release journal; the implemented refusal is required.
  - `[false]` `[reject]` I3: Synthetic successors do not prove independently historical production releases — this is the first supported release baseline, so no prior production release exists; generated successors are the required forward-migration evidence.
  - `[maybe-false]` `[defer]` I4: User upgrade expectations extend beyond directly exercised services — the existing browser lifecycle and older-schema services are tested separately; a running-browser older-schema Restore/archive adoption would settle the remaining medium-severity risk.
  - `[false]` `[reject]` I5: Source asset tests do not establish distributed assets — parent compiled-only startup from unrelated cwd passed, and both emitted asset directories match source hashes; no compiled-server startup is claimed.
  - `[high]` `[patch]` B1: Baseline epoch insertion occurs after schema/journal commit — the demonstrated failure leaves journal=1 and epoch rows=0; initial epoch insertion now runs inside the baseline transaction; fault and actual process-interruption regressions prove rollback/reopen.
  - `[high]` `[patch]` B2: Preflight fails to validate migrated epoch — a successor can delete metadata and still mutate the source; current candidate validation now checks epoch and domain state; invalid-epoch regressions preserve original bytes.
  - `[high]` `[patch]` B3: Preflight fails to validate domain ownership — changing PlanState ownership to another existing Project passes foreign keys and JSON but fails repository admission; current domain candidate validation now rejects the inconsistent target while preserving original bytes. Shares incomplete target validation with B2.
  - `[medium]` `[patch]` B4: Candidate migration snapshots survive discard — snapshots use the .restoring database ID, are absent from active listing and retain a separate quota; existing discard paths now remove only candidate snapshots; success/failure/interruption tests retain active snapshots.
  - `[high]` `[patch]` B5: Recovery markers require current schema before startup can migrate — a supported older ready/rollback candidate is rejected during an application upgrade; supported-source admission preserves marker/completion guards; ready/completed/rollback regressions then run protected startup migration.
  - `[false]` `[reject]` B6: Older archive prefixes might lack current redacted tables/columns — every prefix in the shipped chain contains those tables and columns; an arbitrarily altered test baseline is not a supported production prefix. No speculative missing-table fallback is added.
  - `[medium]` `[patch]` B7: Preflight materializes the entire SQLite file in memory — VACUUM already creates a disposable file; preflight now opens that file directly and reports temporary snapshot removal truthfully.
  - `[low]` `[reject]` B8: No persistent compiled-output copy-script test — emitted assets and compiled DB startup were independently verified; the supported launcher consumes source. Building another distribution harness adds setup/branches for an unlikely everyday defect beyond a direct correction.
  - `[low]` `[reject]` B9: JSON fixture changes layout rather than inventing another payload version — no supported second JSON payload version exists; current/future versions and operation history transitions are covered. Inventing a version/parser solely for the fixture adds unsupported complexity.
  - `[medium]` `[patch]` B10: Inventory test uses its registry as its own universe — a newly omitted JSON field silently loses startup validation; inventory now compares registry and version siblings independently against actual SQLite columns.
  - `[high]` `[patch]` E1: Baseline crash window loses mandatory epoch — independently reproduced journal=1/metadata=0 and refused reopen; the atomic-initialization correction and interruption/failure regressions from B1 cover this duplicate.
  - `[medium]` `[patch]` V1: No referenced-parent rebuild regression — verification reviewer independently demonstrated DROP with FK ON cascades child deletion while final FK check passes; the generated test-only parent rebuild preserves every populated table and asserts final FK ON and journal prefix.

Seven patch groups: three high (B1/E1, B2/B3, B5), four medium (B4, B7, B10, V1). Each uses existing transaction, validation, cleanup or fixture boundaries, adds no public surface and guards a demonstrated state. The contaminated first verification report is excluded; the context-free replacement is the sole verification-gap report counted.

### 2026-10-20 — Review pass (follow-up)

- verdicts: 40 findings — high 0, medium 3, low 25, false 11, maybe-false 1 (rows BH12, BH18, EC6, VG2, IA1, IA3 reuse earlier-pass reasoning for B8, B1, B6, B8, I3, I4)
- findings:
  - `[low]` `[reject]` BH1: Startup repeats prefix authentication, FK check and JSON validation — redundant work scales with history, but local-first sizes make it negligible and removing it restructures admission order that AD-9 fixes.
  - `[low]` `[reject]` BH2: Older-release upgrade makes a temp preflight copy plus a snapshot — preflight is the Design Notes mechanism that protects source bytes; mkdtemp is owner-only and a SIGKILL leftover is unlikely; a free-space guard adds a branch.
  - `[low]` `[reject]` BH3: Prefix authentication runs outside the write transaction — Project ownership lock prevents a second opener; a loser fails with a clean rollback and unchanged data, only the message is generic.
  - `[false]` `[reject]` BH4: Catch blocks are broader than the focused-catch rule — runMigrations wraps migration failures deliberately to report the retained snapshot (matrix requirement) and preserves the original as `cause`; nothing is silenced.
  - `[low]` `[reject]` BH5: One RECOVERY text for all refusals — it names the matching release, snapshot and prototype-export paths; per-reason wording is cosmetic.
  - `[low]` `[reject]` BH6: Parsers hard-code version 1 and the literal repeats — no second payload version exists (B9 carried reasoning); a version map would be speculative.
  - `[low]` `[reject]` BH7: Parallel plan-state/baseline parse paths and loosened refusal regexes — double parse is trivial cost; the loosened tests still assert refusal of malformed/unsupported rows.
  - `[low]` `[reject]` BH8: Weakened tests and mocked SQLite write failures — the extra-live-schema archive test still refuses an archive with an altered schema (its old regex named the removed dev fingerprint); the mocked statement failure still exercises transaction rollback.
  - `[low]` `[reject]` BH9: Duplicated test helper and vitest import in a fixture file — tsc build and typecheck pass; developer-only tidiness.
  - `[low]` `[reject]` BH10: Stale "development" names (developmentSchemaVersion and aliases) — no wrong behavior; the rename touches a public export across 10 files.
  - `[low]` `[reject]` BH11: Hard-coded CHECK lists could drift from contracts — drift detection is the deferred tables/SQL sync item; no current mismatch shown.
  - `[low]` `[reject]` BH12: carried B8 — copy script brittle and untested; reject as previously decided.
  - `[low]` `[reject]` BH13: No new ADR — the decision is recorded as AD-9 in the architecture spine and RUNBOOK/ADR text is Story 8.6 scope.
  - `[low]` `[reject]` BH14: Prototype-era restore points orphaned — populated prototypes are refused wholesale by AD-9, so their snapshot directory is never opened by this release.
  - `[low]` `[reject]` BH15: fsync lacks F_FULLFSYNC on macOS — power-loss acceptance is stated as not executed; hardening is outside the story.
  - `[low]` `[reject]` BH16: Large unused test-only Kit snapshot — generated fixture metadata; no behavioral harm.
  - `[false]` `[reject]` BH17: Spec evidence gaps and missing lockfile in the diff — the lockfile is committed and was only excluded from the staged review diff; advisories are recorded and reserved for the dependency wave by the spec.
  - `[false]` `[reject]` BH18: carried B1 — epoch seeding lives in the baseline transaction of the runner; regenerating SQL does not touch the runner.
  - `[false]` `[reject]` EC1: busy_timeout/journal_mode set after migration — spec requires refusal before persistent pragmas; better-sqlite3 defaults to a 5 s timeout.
  - `[low]` `[reject]` EC2: Concurrent openers get a misleading error — same as BH3.
  - `[low]` `[reject]` EC3: FK restore in finally could mask the original error — setForeignKeys(true) runs after the transaction closed and cannot realistically fail.
  - `[medium]` `[patch]` EC4: Archive staging migration snapshot is renamed into the imported Project — reproduced: `listRestorePoints` on the imported Project returned a pre-migration point of the archive source; migrateArchiveDatabase now discards the candidate snapshots on success, and the older-archive import test asserts no restore points.
  - `[low]` `[reject]` EC5: unlinkSync in snapshot discard may throw on a vanished file — listed files are owned by this process and the helper predates the story.
  - `[false]` `[reject]` EC6: carried B6 reasoning — no shipped prefix lacks the queried tables or columns; a future rename is speculative.
  - `[low]` `[reject]` EC7: Extended SQLITE_CORRUPT codes are missed — the exact-match list is unchanged from the baseline commit (pre-existing).
  - `[low]` `[reject]` EC8: Health recomputes schema identity on each poll — cost is a replay of schema SQL and an FK scan, negligible at local scale; the DomainError needs external tampering of an open DB.
  - `[low]` `[reject]` EC9: Startup validates three times — same as BH1.
  - `[low]` `[reject]` EC10: Recovery catch accepts any validation DomainError — such errors come from validating the candidate or the original, and discarding an unpublished candidate is the intended rollback.
  - `[false]` `[reject]` EC11: No snapshot before migration 2 for a fresh database — an empty database has no prior state (spec); populated databases snapshot before every pending migration.
  - `[medium]` `[patch]` VG1: Multi-pending migrations in one run are untested — behavior was correct; added a runner test asserting two pre-migration points with the prefix-1 and prefix-2 identities.
  - `[low]` `[reject]` VG2: carried B8 — packaged asset copy has no persistent verification.
  - `[medium]` `[defer]` VG3: No automated tables.ts versus baseline SQL sync check — pre-existing drift class, recorded in deferred.
  - `[low]` `[reject]` VG4: Health schemaVersion test compares against the same function — the function is covered by identity tests elsewhere; cosmetic.
  - `[low]` `[reject]` VG5: FK finally masking — duplicate of EC3.
  - `[false]` `[reject]` IA1: Older-state coverage relies on injected test successors — carried I3; no prior production release exists, and Design Notes mandate generated test-only successors.
  - `[false]` `[reject]` IA2: Optional assets parameter exists only for tests — Design Notes record it as dependency injection, not configuration.
  - `[maybe-false]` `[defer]` IA3: carried I4 — no running-browser older Restore/archive adoption; already in `deferred`, not added again.
  - `[false]` `[reject]` IA4: Preflight copy migration is outside the stated intent — Design Notes specify it as the source-preserving validation step.
  - `[false]` `[reject]` IA5: Lockfile absent from the diff — excluded from the staged diff by the reviewer setup; committed in 283cfc7.
  - `[false]` `[reject]` IA6: sprint-status.yaml modified in the tree — orchestrator-owned bookkeeping, not part of the reviewed diff and not touched here.

Two patches, both medium (EC4, VG1); one medium deferred (VG3); no high patched, so no further follow-up pass is recommended.

## Design Notes

Use public `readMigrationFiles` and one better-sqlite3 transaction per migration. Stock Drizzle creates the journal before BEGIN and commits pending SQL internally without a per-migration FK hook. Verify foreign_keys=OFF outside each transaction, execute generated SQL, FK-check, append journal and commit; finally verify ON. A failed first migration rolls back journal creation too. Source admission precedes WAL changes and startup operation transitions. Detect drift by comparing sqlite_schema (excluding SQLite internals and exact infrastructure journal) to the expected schema obtained by replaying the authenticated generated prefix in a disposable memory DB; this is generated SQL validation, not another bootstrap. Validate journal table/rows too. Current identity is `release-sha256-` plus SHA-256 of ordered committed migration hashes; use that same prefix-derived identity in manifests, snapshots, health and recovery. Unknown/partial/malformed journal chains refuse.

JSON inventory (existing versions retained; all new payload versions start at 1): source_plan_baselines entries_json+releases_json share existing schema_version; plan_states payload_json uses existing schema_version; change_sets operations_json uses existing operations_schema_version. New siblings: ai_function_templates arguments/examples; product_contexts key_features; personas goals/pains; roadmap_cards labels; connector_connections status_mapping/issue_type_mapping/type_mapping; remote_work_item_links managed_labels/baseline/labels; sync_conflicts local_value/remote_value; change_sets proposed_by/approval/execution/warnings; activity_events live_entities/before/after; card_versions snapshot; remote_push_plans plan; remote_push_executions execution. Use explicit `<payload>_schema_version` SQL and corresponding camelCase names. Nullable baseline/proposed_by/approval/execution/warnings/before/after have NULL version iff SQL NULL payload. Unknown-valued Activity/conflict JSON literal null is distinct from SQL NULL. Shared versioned parsers consume existing contracts; candidate validation uses the same readers. Preserve independent operation v11 contract and historical positive versions, refuse future active versions before any write, retain older-active-to-stale policy. Remote plan versions cannot revive confirmation; preserve immutable bytes/outcomes and epoch-based invalidation on Restore.

For an older supported prefix, startup first validates the migrated target on a disposable file-backed VACUUM image, then runs the real protected migration. This lets generated SQL upgrade older JSON layouts while refusing an invalid target before changing source bytes. Current prefixes validate directly before any startup DML. Writable startup admission deliberately avoids integrity_check before DELETE-to-WAL transitions: a real regression showed later checkpoint SQLITE_LOCKED. Restore/archive integrity checks remain on closed read-only inspection connections. Existing metadata epochs are validated rather than repaired.

There is only one shipped release baseline; prove forward mechanics with a generated test-only successor (not an invented shipped feature). Test-only migration asset injection is dependency injection, not operator configuration. No user Project is opened for validation.

## Verification

- Node24 `corepack pnpm --filter @storymapper/db test`, affected contracts/server/web tests and typechecks; serial focused audit-performance gates where affected.
- Node24 `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm build`, `node scripts/verify.mjs`, `git diff --check HEAD`.
- `corepack pnpm audit --json` with sanitized package/advisory evidence; fail rather than claim a clean audit if registry unavailable. Native OS acceptance is limited to the executing host.
- Populated previous generated schema fixtures: before/after counts per table (journal separately), JSON/history/identity readback; failure/interrupt/Restore/archive and compiled-assets subprocess evidence.

## Changelog

- 2026-10-19 v1: Source-grounded plan from three focused investigations, aligned with Epic 8 preparation and exact Story 8.1 requirements.
- 2026-10-19 v2: Implemented the release baseline, persisted JSON versions and supported candidate upgrade paths.
- 2026-10-20 v3: Triaged all four independent review layers, applied seven correction groups, recorded deferred acceptance and passed final verification.

## Implementation Verification

- Node 24.17.0: root scripts 83, contracts 193, importers 7, GitHub 66, core 449, web 848 and DB 549 passed. The complete workspace invocation found one malformed-current test fixture; after correcting its three loose historical records, the complete server command passed all 1,025 ordinary tests and 14 serial audit-performance tests. No assertion or timeout was removed.
- Workspace typecheck/build and parent `node scripts/verify.mjs` passed. Release verification includes 260 accessibility tests and serial diagnostics. Drizzle Kit metadata check and `git diff --check HEAD` passed. One initial hygiene failure from the fixture crossing 750 lines was fixed by removing two blank lines.
- Parent compiled-only alias harness opened/reopened a disposable DB from unrelated cwd: 37 business tables, one journal row, all 28 JSON columns matched the versioned registry, stable epoch and working checkpoint. Both emitted migration directories contain the exact three source assets. Standalone compiled server alias/dependency resolution is pre-existing; no successful compiled-server startup is claimed. The supported server command uses tsx.
- ORM 0.45.4 / Kit 0.31.11 installed with Corepack pnpm. Completed audit reports no Drizzle advisory; remaining advisories are 2 low, 19 moderate, 24 high and 5 critical, reserved for the dependency wave. This is not a clean release audit.
- Migration matrix coverage ran: 20 runner tests cover fresh/current, populated prior schema, journal/prototype/drift refusals, snapshots/retention, SQL/FK rollback, interruption, older JSON layout and invalid-target source preservation. JSON inventory tests cover syntax/version/null/history; Restore/recovery and 59 archive tests cover source validation, migration, unchanged originals, epoch/reset and failed publication.
- Manual recovery: preserve the original; use the matching application release or a supported pre-migration snapshot in a separate Project directory. For prototypes, export required content as Markdown/TXT with the original development application, then import those documents into a new release Project. Prototype SQLite files and archives are not accepted.
- Current schema: `release-sha256-72557065c3b5f34936e896480ddcfbbe42bec652763f5571c37067b2f1c0f456`. Native Windows/Linux and actual power-loss acceptance were not executed. Sprint status remains orchestrator-owned and untouched.

## Auto Run Result

Status: done

- Summary: Follow-up review of the release baseline, protected migration runner, versioned persisted JSON and supported Restore/archive upgrade path. Two medium patches applied; one pre-existing medium gap deferred.
- Files changed in this pass: `packages/db/src/archive-database.ts` (discard the candidate's pre-migration snapshots after a successful archive copy migration), `apps/server/src/services/project-archive.test.ts` (imported Project must list no restore points), `packages/db/src/migration-runner.test.ts` (multi-pending migrations each get their own prior-state restore point).
- Review findings: 40 triaged. Patches: EC4, VG1. Deferred: VG3 (tables/SQL sync check); carried deferred I4. Rejected: all remaining rows with the reasons in the Review Triage Log.
- Follow-up review recommendation: false. This pass patched 2 medium and 0 high.
- Verification: Node 24.17.0 `corepack pnpm --filter @storymapper/db test` (561 passed), `corepack pnpm --filter @storymapper/server test` (ordinary suite plus 14 serial audit-performance tests passed), `corepack pnpm typecheck` passed. The new archive assertion failed before the fix and passes after it.
- Residual risks: running-browser older Restore/archive adoption remains unverified (deferred); tables.ts versus baseline SQL drift is not gated automatically; startup and health recompute prefix authentication without caching.
