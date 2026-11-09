---
epic: 8
story: 1
status: ready
date: 2026-10-19
version: 1
epic_preparation: epic-8-preparation.md
---

# Story Plan 8.1: Baseline migration and upgrade path

Reproducing statement: Plan the first release migration baseline and protected forward upgrades, including Restore/archive candidates and versioned JSON, without adopting prototype databases.

## Intent

Fresh release Projects use committed generated SQL; supported release Projects upgrade safely with recoverable pre-migration state. Prototype, future or inconsistent databases receive actionable refusal.

## Cross-story constraints

- Follow [Preparation](epic-8-preparation.md), especially AD-9, independent version domains and per-migration foreign-key/snapshot ordering.
- 8.1 owns only the Drizzle ORM/Kit upgrade required for migrations; 8.2 owns the remaining upgrade wave.
- 8.3 consumes the migration tests/classification; 8.6 and 8.8 consume the recovery instructions and schema identity.

## Design decisions (this story)

Replace `connection.ts::migrate`, `ensureColumn` and old evidence consolidation with one journaled path. Generate baseline SQL from the fully aligned Drizzle schema, including actual constraints/indexes and missing JSON siblings. No bootstrap remains as an alternate creation route; runtime metadata DML follows baseline application. Test-only DDL fixtures remain explicitly test-only.

Inspect source journal before any DDL. Reject tables without a journal, including the current development database; do not silently enroll it. Validate supported journal prefix/hashes and unknown/future entries before changes. Resolve migrations relative to the module/package in source and compiled startup, not cwd. Commit SQL and Kit metadata together; no runtime generation or `drizzle-kit push`.

Use the existing snapshot/write-gate/owned runtime infrastructure. Startup migration has a raw database before `DatabaseHandle` exists, so factor the smallest snapshot publication primitive shared with `publishRestorePoint`; do not recursively open/migrate a database to learn its schema. Inspect the selected Drizzle migrator's BEGIN/COMMIT behavior; ensure the foreign-key check can reject each migration before accepting journal advancement. Keep per-migration SQL/journal atomic and `foreign_keys=ON` before normal access on success/failure. No network or asynchronous callback inside a migration transaction.

Inventory every `*Json` field in `schema/tables.ts`, its SQL name, reader, writer and nullable semantics. Reuse the existing Plan-state/source-baseline/operation version contracts where applicable and add siblings for remaining payloads. Version parsers reject malformed/future current payloads, preserve historical ChangeSet bytes and do not revive old remote consent. Add no pre-release compatibility reader.

Restore/archive source admission precedes current validation. Verify original archive hash/count/redaction and supported journal, migrate a prepared copy, then run current JSON/domain/integrity checks and existing atomic publication/recovery. Keep original input files and the active DB unchanged on refusal; recovery markers identify the migrated target. Update snapshot filename parsing/retention and schema display together. Explicitly classify Drizzle's journal as infrastructure without accepting unknown domain tables.

## Task sequence

1. `packages/db/package.json`, `pnpm-lock.yaml`: verify current advisories and supported ORM/Kit compatibility, upgrade the required Drizzle pair and run existing DB/Restore/archive regressions.
2. `packages/db/src/schema/tables.ts`, `packages/contracts/src`, `packages/db/src/repositories`: inventory JSON shapes/versions and align schema declarations, versioned parsers and all writes. Preserve root/history and operation semantics.
3. Proposed `packages/db/drizzle.config.ts`, `packages/db/migrations`: generate/review the complete baseline plus metadata; assert constraints/indexes against intended schema, not just table names.
4. `packages/db/src/connection.ts`, proposed `migration-runner.ts`, `restore-points.ts`, `restore-validation.ts`: replace inline bootstrap, add read-before-write journal admission, protected execution and one shared release-schema identity.
5. `restore-project.ts`, `restore-recovery.ts`, `restore-point-files.ts`, `archive-database.ts`, `snapshot.ts`: migrate supported staged candidates before current validation, preserve source files and existing rollback/unavailable behavior.
6. `apps/server/src/services/project-archive.ts`, `http/routes/infrastructure-routes.ts`, shared restore/archive contracts and existing web Restore/health consumers: remove current-only early rejection for supported releases, retain prototype/future refusal and correct target markers/epoch resets.
7. Extend existing DB/HTTP tests with populated previous-release journals, per-table before/after counts and JSON values, no-journal/future/hash refusal, failure/interrupt recovery, compiled migration-asset loading and migrated Restore/archive adoption. Use generated test-only next-migration assets; do not ship a dummy feature or real user fixture.
8. Run contracts/DB/server/web affected suites, full workspace gates and release verification under Node 24. Record supported schema policy and exact recovery text in spec evidence for 8.6.

## Preliminary code map

- `packages/db/src/connection.ts`: `openStoryMapperDb`, `openExistingStoryMapperDb`, inline `migrate`.
- `packages/db/src/restore-points.ts`: `publishRestorePoint`, `runProtectedMigration`, `developmentSchemaVersion`.
- `packages/db/src/restore-validation.ts`: `databaseSchemaVersion`, `validateRestoreDatabase`.
- `packages/db/src/restore-project.ts`, `restore-recovery.ts`, `restore-point-files.ts`, `archive-database.ts`, `snapshot.ts`.
- `packages/db/src/schema/{tables,classification}.ts`; `operation-schema-transition.ts`; existing Plan-state/source-plan validation modules.
- Existing `restore-points.test.ts`, `restore-failures.test.ts`, `restore-project.test.ts`, `snapshot.test.ts`, `operation-schema-transition.test.ts`, `github-archive-redaction.test.ts`, `source-document-migration.test.ts`.
- `apps/server/src/services/project-archive.test.ts`; `apps/web/src/features/{restore-points,project-archive}` tests.

## Acceptance outline

- **Given** an empty DB **When** created **Then** generated baseline SQL is its only creation path and all business tables/indexes/constraints exist.
- **Given** a supported populated earlier release **When** upgraded **Then** each pending migration has protected prior state, valid foreign keys, atomic journal advancement and explained row-count/value preservation.
- **Given** snapshot/retention/SQL/foreign-key failure **When** migration attempts **Then** no invalid migrated database is admitted and original state remains recoverable with truthful failure details.
- **Given** a prototype, future or divergent journal **When** opened/imported/restored **Then** refusal precedes schema/business mutation and names manual recovery.
- **Given** supported older Restore/archive input **When** selected **Then** its copy migrates and validates before publication, original bytes stay unchanged and the runtime adopts a new epoch safely.
- **Given** every JSON-bearing column **When** read/written/reopened **Then** its sibling version is honored; corrupt/future payloads fail and historical non-executable bytes remain intact.
- **Given** the selected Drizzle versions **When** advisory checks and full tests run **Then** the old-line advisory is absent and existing behavior remains covered.

## Out of scope

Prototype backfills/enrollment, downgrades, new migration UI/MCP tool, a second migration framework, non-Drizzle dependency upgrades, real user DB migration or release tags.

## Risks and mitigations

- Inline and declared schemas have historical divergences: compare indexes/checks/defaults and populated behavior before removing bootstrap.
- Post-COMMIT checks cannot provide rollback: prove transaction ordering with a violating-FK fixture, not only a successful migration.
- Old archive/current parser coupling can reject valid inputs or accept unredacted ones: validate source identity/redaction first and final current shape after migration.
- Snapshot schema/filename/recovery coupling spans files: test crash/reopen and retention, plus Windows path/handle rules, as one lifecycle.

## Open questions

None. Exact helper API names and selected compatible package versions are verified/refined in dev step 02 within the fixed requirements.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-19 | Source-grounded migration, JSON and Restore/archive plan |
