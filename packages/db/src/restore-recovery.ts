import { createHash } from "node:crypto";
import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readFileSync, readSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import type { MigrationMeta } from "drizzle-orm/migrator";
import { currentReleaseSchemaVersion, loadMigrationAssets } from "@storymapper/db/migration-assets";
import { DomainError, restorePointSchema, type RestorePoint } from "@storymapper/contracts";
import { databaseSchemaVersion, RestoreValidationError, validateRestoreDatabase, validateRestoreSource, validateDatabaseEpoch } from "@storymapper/db/restore-validation";
import { discardRestorePointFiles } from "@storymapper/db/restore-point-files";
import { resolveSqlitePath } from "@storymapper/db/sqlite-path";

interface PreparedRestore {
  hash: string;
  schemaVersion: string;
  epoch: string;
}

function validateRecoverySource(database: Database.Database, schemaVersion: string, assets: MigrationMeta[]): void {
  validateRestoreSource(database, schemaVersion, assets);
  validateDatabaseEpoch(database);
  if (schemaVersion === currentReleaseSchemaVersion(assets)) validateRestoreDatabase(database, schemaVersion, assets);
}

function hasRestoreCompletion(database: Database.Database, epoch: string): boolean {
  const metadata = database.prepare("SELECT epoch FROM database_metadata WHERE id = 1").get() as { epoch: string } | undefined;
  if (metadata?.epoch !== epoch) return false;
  const invalidEpoch = database.prepare("SELECT project_id FROM project_settings WHERE epoch != ? OR epoch = ''").get(epoch);
  const event = database.prepare("SELECT id FROM activity_events WHERE action = 'project.restored' AND json_extract(after_json, '$.epoch') = ?").get(epoch);
  return !invalidEpoch && Boolean(event);
}

function publishedRestoreCompleted(databasePath: string, path: string, assets: MigrationMeta[]): boolean {
  if (!existsSync(`${path}.ready`)) return false;
  if (!existsSync(databasePath)) throw new RestoreValidationError("Installed restored database is missing; its completion marker was retained for recovery.");
  const prepared = JSON.parse(readFileSync(`${path}.ready`, "utf8")) as PreparedRestore;
  if (!prepared || typeof prepared.epoch !== "string" || typeof prepared.schemaVersion !== "string") throw new RestoreValidationError("Installed restore has an invalid completion marker.");
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    validateRecoverySource(database, prepared.schemaVersion, assets);
    if (!hasRestoreCompletion(database, prepared.epoch)) throw new RestoreValidationError("Installed restore is missing its final epoch or audit event.");
    return true;
  }
  finally { database.close(); }
}

function fileHash(path: string): string {
  const descriptor = openSync(path, "r");
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(1024 * 1024);
    let bytes: number;
    while ((bytes = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
    return hash.digest("hex");
  } finally { closeSync(descriptor); }
}

export function removeDatabaseSidecars(path: string): void {
  for (const suffix of ["-wal", "-shm", "-journal"]) rmSync(`${path}${suffix}`, { force: true });
}

function syncFile(path: string): void {
  const descriptor = openSync(path, process.platform === "win32" ? "r+" : "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function publishMarker(path: string, value: unknown): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { flag: "wx" });
  syncFile(temporary);
  renameSync(temporary, path);
}

function checkpointOriginal(databasePath: string): void {
  if (!existsSync(databasePath)) return;
  const database = new Database(databasePath, { fileMustExist: true });
  try {
    const checkpoint = database.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number }>;
    if (checkpoint.some((row) => row.busy !== 0)) throw new RestoreValidationError("Original database could not be checkpointed; restore publication was refused.");
  } finally { database.close(); }
  syncFile(databasePath);
}

export function publishRollbackDecision(path: string, preRestorePoint: RestorePoint): void {
  publishMarker(`${path}.rollback`, preRestorePoint);
}

export function replaceWithProtectedSnapshot(databasePath: string, point: RestorePoint, assets: MigrationMeta[] = loadMigrationAssets()): void {
  const source = join(dirname(databasePath), "snapshots", point.fileName);
  const database = new Database(resolveSqlitePath(source), { readonly: true, fileMustExist: true });
  try { validateRecoverySource(database, point.schemaVersion, assets); } finally { database.close(); }
  const rollback = `${databasePath}.restore-rollback`;
  copyFileSync(source, rollback);
  syncFile(rollback);
  checkpointOriginal(databasePath);
  removeDatabaseSidecars(databasePath);
  renameSync(rollback, databasePath);
}

export function publishPreparedRestore(path: string, schemaVersion: string, epoch: string): void {
  syncFile(path);
  const prepared: PreparedRestore = { hash: fileHash(path), schemaVersion, epoch };
  publishMarker(`${path}.ready`, prepared);
}

function validatePreparedRestore(path: string, databasePath: string, assets: MigrationMeta[]): void {
  const prepared = JSON.parse(readFileSync(`${path}.ready`, "utf8")) as PreparedRestore;
  if (!prepared || typeof prepared.hash !== "string" || typeof prepared.schemaVersion !== "string" || typeof prepared.epoch !== "string" || fileHash(path) !== prepared.hash) throw new RestoreValidationError("Prepared restore has an invalid completion marker.");
  const candidate = new Database(resolveSqlitePath(path), { readonly: true, fileMustExist: true });
  try {
    validateRecoverySource(candidate, prepared.schemaVersion, assets);
    if (existsSync(databasePath)) {
      const original = new Database(databasePath, { readonly: true, fileMustExist: true });
      try {
        if (databaseSchemaVersion(original, assets) !== prepared.schemaVersion) throw new RestoreValidationError("Prepared restore schema differs from the original database.");
      } finally { original.close(); }
    }
    if (!hasRestoreCompletion(candidate, prepared.epoch)) throw new RestoreValidationError("Prepared restore is missing its final epoch or audit event.");
  } finally { candidate.close(); }
}

export function discardPreparedRestore(path: string): void {
  discardRestorePointFiles(path);
  for (const suffix of [".ready", ".ready.tmp", "", "-wal", "-shm", "-journal", ".rollback.tmp", ".rollback"]) rmSync(`${path}${suffix}`, { force: true });
}

export function recoverInterruptedRestore(databasePath: string, assets: MigrationMeta[] = loadMigrationAssets()): string | undefined {
  const path = `${databasePath}.restoring`;
  if (existsSync(`${path}.rollback`)) {
    const point = restorePointSchema.parse(JSON.parse(readFileSync(`${path}.rollback`, "utf8")));
    if (point.class !== "pre-restore") throw new RestoreValidationError("Rollback decision does not reference a protective pre-restore point.");
    replaceWithProtectedSnapshot(databasePath, point, assets);
    discardPreparedRestore(path);
    return "Interrupted project restore rolled back to the protected pre-restore point.";
  }
  if (!existsSync(path)) {
    if (!existsSync(`${path}.ready`) && !existsSync(`${path}.ready.tmp`)) return undefined;
    const completed = publishedRestoreCompleted(databasePath, path, assets);
    discardPreparedRestore(path);
    return completed ? "Interrupted project restore completed; completion markers removed." : "Interrupted project restore rolled back; completion markers removed.";
  }
  if (!existsSync(`${path}.ready`)) {
    discardPreparedRestore(path);
    return "Interrupted project restore rolled back: candidate was not completely prepared.";
  }
  try { validatePreparedRestore(path, databasePath, assets); }
  catch (error) {
    if (!(error instanceof DomainError && error.code === "validation" || error instanceof Database.SqliteError || error instanceof SyntaxError)) throw error;
    discardPreparedRestore(path);
    return `Interrupted project restore rolled back: ${error.message}`;
  }
  checkpointOriginal(databasePath);
  removeDatabaseSidecars(databasePath);
  try { renameSync(path, databasePath); }
  catch (error) {
    throw new RestoreValidationError("Interrupted restore publication failed; the original committed database and prepared candidate are preserved for recovery.", { cause: error });
  }
  discardPreparedRestore(path);
  return "Interrupted project restore completed with preserved history and epoch.";
}
