import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DomainError, restorePointClassSchema, restorePointSchema, type RestorePoint, type RestorePointClass } from "@storymapper/contracts";
import type Database from "better-sqlite3";
import type { MigrationMeta } from "drizzle-orm/migrator";
import type { SqliteDatabase } from "@storymapper/db/connection";
import { assertSynchronous, type DatabaseHandle } from "@storymapper/db/database-handle";
import { listRestorePointFiles, nextRestorePointSequence, retainRestorePointFiles, restorePointDatabaseId } from "@storymapper/db/restore-point-files";
import { databaseSchemaVersion } from "@storymapper/db/restore-validation";
import { resolveSqlitePath } from "@storymapper/db/sqlite-path";

export function restorePointDirectory(database: SqliteDatabase): string {
  const databasePath = database.$client.name;
  if (!databasePath || databasePath === ":memory:") throw new Error("Restore points require a file-backed local database.");
  return join(dirname(resolve(databasePath)), "snapshots");
}

export function developmentSchemaVersion(database: SqliteDatabase, assets?: MigrationMeta[]): string {
  return databaseSchemaVersion(database.$client, assets);
}

export function listRestorePoints(handle: DatabaseHandle): RestorePoint[] {
  return listRestorePointFiles(restorePointDirectory(handle.current), restorePointDatabaseId(handle.current.$client.name));
}

export function createRestorePoint(handle: DatabaseHandle, pointClass: RestorePointClass, assets?: MigrationMeta[]): RestorePoint {
  const validatedClass = restorePointClassSchema.parse(pointClass);
  return handle.exclusive("Restore point creation", (database) => publishRestorePoint(database, validatedClass, assets));
}

export function publishRestorePoint(database: SqliteDatabase, pointClass: RestorePointClass, assets?: MigrationMeta[]): RestorePoint {
  return publishRawRestorePoint(database.$client, pointClass, developmentSchemaVersion(database, assets));
}

export function publishRawRestorePoint(database: Database.Database, pointClass: RestorePointClass, schemaVersion: string): RestorePoint {
  if (!database.name || database.name === ":memory:") throw new Error("Restore points require a file-backed local database.");
  const directory = join(dirname(resolve(database.name)), "snapshots");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, ".gitignore"), "*\n!.gitignore\n");
  const createdAt = new Date().toISOString();
  const databaseId = restorePointDatabaseId(database.name);
  const order = nextRestorePointSequence(listRestorePointFiles(directory, databaseId));
  const nonce = randomUUID().replace(/-/g, "");
  const temporaryPath = join(directory, `.restore-${nonce}.tmp`);
  let restorePoint: RestorePoint;
  try {
    database.prepare("VACUUM INTO ?").run(resolveSqlitePath(temporaryPath));
    const descriptor = openSync(temporaryPath, process.platform === "win32" ? "r+" : "r");
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    const sizeBytes = statSync(temporaryPath).size;
    const timestamp = createdAt.replace(/[:.]/g, "_");
    const fileName = `${databaseId}__${pointClass}__${timestamp}__${order}__${nonce}__${sizeBytes}__${schemaVersion}.sqlite`;
    restorePoint = restorePointSchema.parse({ fileName, class: pointClass, createdAt, sizeBytes, schemaVersion, scope: "local-database" });
    renameSync(temporaryPath, join(directory, fileName));
  } catch (error) {
    removeFailedSnapshot(temporaryPath, error);
    throw error;
  }
  try {
    syncSnapshotDirectory(directory);
    retainRestorePointFiles(directory, databaseId);
    syncSnapshotDirectory(directory);
  } catch (error) {
    const failure = new DomainError("internal", "Restore point published, but retention failed.", { errorId: randomUUID(), retainedRestorePoint: restorePoint.fileName, retainedPreparedEffects: [] });
    Object.defineProperty(failure, "cause", { value: error });
    throw failure;
  }
  return restorePoint;
}

function syncSnapshotDirectory(directory: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(directory, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function removeFailedSnapshot(temporaryPath: string, creationError: unknown): void {
  try {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${temporaryPath}${suffix}`, { force: true });
  } catch (cleanupError) {
    const creationCause = creationError instanceof Error ? creationError.message : String(creationError);
    const cleanupCause = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
    throw new AggregateError([creationError, cleanupError], `Restore point creation failed: ${creationCause}; temporary cleanup failed: ${cleanupCause}`);
  }
}

export function runProtectedMigration<Result>(handle: DatabaseHandle, migrate: (database: SqliteDatabase) => Result extends PromiseLike<unknown> ? never : Result): Result {
  if (Object.prototype.toString.call(migrate) === "[object AsyncFunction]") throw new Error("Migration callbacks must be synchronous.");
  return handle.exclusive("Protected migration", (database) => {
    publishRestorePoint(database, "pre-migration");
    return database.$client.transaction(() => {
      const result = migrate(database) as Result;
      assertSynchronous(result, "Migration callbacks must be synchronous.");
      return result;
    })();
  });
}
