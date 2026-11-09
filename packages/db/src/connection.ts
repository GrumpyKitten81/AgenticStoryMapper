import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { MigrationMeta } from "drizzle-orm/migrator";
import { currentReleaseSchemaVersion, loadMigrationAssets } from "@storymapper/db/migration-assets";
import { authenticateMigrationPrefix, runMigrations } from "@storymapper/db/migration-runner";
import { transitionStoredOperations } from "@storymapper/db/operation-schema-transition";
import { DomainError } from "@storymapper/contracts";
import { validateDatabaseEpoch, validateRestoreDatabase, RestoreValidationError } from "@storymapper/db/restore-validation";
import { recoverInterruptedRestore } from "@storymapper/db/restore-recovery";
import { validatePersistedJson } from "@storymapper/db/versioned-json-validation";
import { resolveSqlitePath } from "@storymapper/db/sqlite-path";
import * as schema from "@storymapper/db/schema";

export type SqliteDatabase = ReturnType<typeof drizzle<typeof schema>>;

function validateMigrationTarget(sqlite: Database.Database, assets: MigrationMeta[], appliedCount: number): void {
  if (!appliedCount) return;
  validateDatabaseEpoch(sqlite);
  if (appliedCount === assets.length) {
    validatePersistedJson(sqlite);
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "storymapper-migration-preflight-"));
  const path = join(directory, "storymapper.sqlite");
  try {
    sqlite.prepare("VACUUM INTO ?").run(resolveSqlitePath(path));
    const candidate = new Database(path, { fileMustExist: true });
    try {
      runMigrations(candidate, path, assets);
      validateRestoreDatabase(candidate, currentReleaseSchemaVersion(assets), assets);
    } finally { candidate.close(); }
  } catch (error) {
    if (!(error instanceof DomainError || error instanceof Database.SqliteError)) throw error;
    const reason = error instanceof DomainError && error.details?.retainedRestorePoint ? "Migration execution failed." : error.message;
    throw new RestoreValidationError(`Migration preflight failed: ${reason} The original database is unchanged. The temporary candidate and its snapshots were removed.`, { cause: error });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

function admitDatabase(sqlite: Database.Database, databasePath: string, assets: MigrationMeta[]): void {
  const admission = authenticateMigrationPrefix(sqlite, assets);
  validateMigrationTarget(sqlite, assets, admission.appliedCount);
  runMigrations(sqlite, databasePath, assets);
  validateDatabaseEpoch(sqlite);
  validatePersistedJson(sqlite);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("wal_autocheckpoint = 1000");
}

export function openExistingStoryMapperDb(databasePath: string, assets: MigrationMeta[] = loadMigrationAssets()): SqliteDatabase {
  const sqlite = new Database(databasePath, { fileMustExist: true });
  try {
    admitDatabase(sqlite, databasePath, assets);
    return drizzle(sqlite, { schema });
  } catch (error) { sqlite.close(); throw error; }
}

export function openStoryMapperDb(databasePath: string, logRecovery: (outcome: string) => void = (outcome) => process.emitWarning(outcome), assets: MigrationMeta[] = loadMigrationAssets()): SqliteDatabase {
  const recovery = recoverInterruptedRestore(databasePath, assets);
  if (recovery) logRecovery(recovery);
  mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  try {
    admitDatabase(sqlite, databasePath, assets);
    transitionStoredOperations(sqlite);
    return drizzle(sqlite, { schema });
  } catch (error) { sqlite.close(); throw error; }
}
