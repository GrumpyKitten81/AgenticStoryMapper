import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { MigrationMeta } from "drizzle-orm/migrator";
import { currentReleaseSchemaVersion, loadMigrationAssets } from "@storymapper/db/migration-assets";
import { runMigrations } from "@storymapper/db/migration-runner";
import { actorContextSchema, restoreProjectResultSchema, DomainError, type ActorContext, type RestoreProjectResult } from "@storymapper/contracts";
import { openExistingStoryMapperDb } from "@storymapper/db/connection";
import type { DatabaseHandle } from "@storymapper/db/database-handle";
import { laterGitHubLinks, prepareRestoredHistory } from "@storymapper/db/restore-history";
import { createRestorePoint, listRestorePoints, restorePointDirectory } from "@storymapper/db/restore-points";
import { discardPreparedRestore, publishPreparedRestore, publishRollbackDecision, replaceWithProtectedSnapshot, removeDatabaseSidecars } from "@storymapper/db/restore-recovery";
import { RestoreValidationError, validateRestoreDatabase, validateRestoreSource } from "@storymapper/db/restore-validation";
import { resolveSqlitePath } from "@storymapper/db/sqlite-path";

function validateFile(path: string, schemaVersion: string, assets: MigrationMeta[], source = false): void {
  let database: Database.Database | undefined;
  try {
    database = new Database(resolveSqlitePath(path), { readonly: true, fileMustExist: true });
    if (source) validateRestoreSource(database, schemaVersion, assets);
    else validateRestoreDatabase(database, schemaVersion, assets);
  } catch (error) {
    if (error instanceof Database.SqliteError) throw new RestoreValidationError(`Restore point could not be read: ${error.message}`, { cause: error });
    throw error;
  } finally { database?.close(); }
}

function prepareCandidate(handle: DatabaseHandle, path: string, projectId: string, actor: ActorContext, result: RestoreProjectResult, assets: MigrationMeta[]): void {
  const candidate = new Database(resolveSqlitePath(path));
  try {
    candidate.pragma("journal_mode = DELETE");
    candidate.pragma("foreign_keys = ON");
    result.githubLinks = laterGitHubLinks(handle.current.$client, candidate);
    restoreProjectResultSchema.parse(result);
    prepareRestoredHistory(handle.current.$client, candidate, projectId, actor, result);
    validateRestoreDatabase(candidate, currentReleaseSchemaVersion(assets), assets);
  } finally { candidate.close(); }
  publishPreparedRestore(path, currentReleaseSchemaVersion(assets), result.epoch);
}

function rollbackDatabase(handle: DatabaseHandle, databasePath: string, preRestorePoint: RestoreProjectResult["preRestorePoint"], assets: MigrationMeta[]): void {
  if (handle.current.$client.open) handle.current.$client.close();
  const path = `${databasePath}.restoring`;
  publishRollbackDecision(path, preRestorePoint);
  replaceWithProtectedSnapshot(databasePath, preRestorePoint, assets);
  handle.current = openExistingStoryMapperDb(databasePath, assets);
  discardPreparedRestore(path);
}

function replaceDatabase(handle: DatabaseHandle, path: string, preRestorePoint: RestoreProjectResult["preRestorePoint"], assets: MigrationMeta[]): void {
  const databasePath = handle.current.$client.name;
  handle.current.$client.close();
  try {
    removeDatabaseSidecars(databasePath);
    renameSync(path, databasePath);
    handle.current = openExistingStoryMapperDb(databasePath, assets);
    discardPreparedRestore(path);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    try { rollbackDatabase(handle, databasePath, preRestorePoint, assets); }
    catch (rollbackError) {
      const rollbackCause = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      const reason = `Project restore failed (${cause}) and rollback failed (${rollbackCause}). Database access is stopped; restart to recover or use the protected pre-restore point.`;
      handle.markUnavailable(reason);
      throw new AggregateError([error, rollbackError], reason);
    }
    throw new Error(`Project restore failed and the original database was restored: ${cause}`, { cause: error });
  }
}

export async function restoreProject(handle: DatabaseHandle, projectId: string, fileName: string, actorContext: ActorContext, assets: MigrationMeta[] = loadMigrationAssets()): Promise<RestoreProjectResult> {
  const actor = actorContextSchema.parse(actorContext);
  if (actor.actorType !== "human") throw new RestoreValidationError("Project restore is human-only.");
  if (handle.restoring) throw new RestoreValidationError("A project restore is already in progress.");
  const restorePoint = listRestorePoints(handle).find((point) => point.fileName === fileName);
  if (!restorePoint) throw new RestoreValidationError("Restore point is not recognized in this local database.");
  const source = join(restorePointDirectory(handle.current), restorePoint.fileName);
  validateFile(source, restorePoint.schemaVersion, assets, true);
  return handle.restore(() => executeRestore(handle, source, projectId, actor, restorePoint, assets));
}

function executeRestore(handle: DatabaseHandle, source: string, projectId: string, actor: ActorContext, restorePoint: RestoreProjectResult["restorePoint"], assets: MigrationMeta[]): RestoreProjectResult {
  const path = `${handle.current.$client.name}.restoring`;
  if (existsSync(path) || existsSync(`${path}.ready`) || existsSync(`${path}.ready.tmp`)) throw new RestoreValidationError("An unresolved interrupted restore exists; restart the server to recover it first.");
  try {
    copyFileSync(source, path);
    validateFile(path, restorePoint.schemaVersion, assets, true);
    migrateCandidate(path, assets);
    validateFile(path, currentReleaseSchemaVersion(assets), assets);
    const preRestorePoint = createRestorePoint(handle, "pre-restore", assets);
    const result: RestoreProjectResult = { restorePoint, preRestorePoint, epoch: randomUUID(), githubLinks: [], attachmentsRetained: true, undoneActivityEvents: 0, undoneChangeSets: 0 };
    handle.exclusive("Project restore", () => {
      prepareCandidate(handle, path, projectId, actor, result, assets);
      replaceDatabase(handle, path, preRestorePoint, assets);
    });
    return restoreProjectResultSchema.parse(result);
  } catch (error) {
    if (!handle.unavailableReason) discardPreparedRestore(path);
    throw error;
  }
}

function migrateCandidate(path: string, assets: MigrationMeta[]): void {
  const database = new Database(resolveSqlitePath(path), { fileMustExist: true });
  try { runMigrations(database, path, assets); }
  catch (error) {
    if (!(error instanceof DomainError)) throw error;
    throw new RestoreValidationError("Restore candidate migration failed; the original snapshot and active database are unchanged. The temporary candidate and its snapshots were removed.", { cause: error });
  } finally { database.close(); }
}
