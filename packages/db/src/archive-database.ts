import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import type { MigrationMeta } from "drizzle-orm/migrator";
import { currentReleaseSchemaVersion, loadMigrationAssets } from "@storymapper/db/migration-assets";
import { runMigrations } from "@storymapper/db/migration-runner";
import { discardRestorePointFiles } from "@storymapper/db/restore-point-files";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DomainError, workItemProviderSchema, actorContextSchema, aiFunctionTemplateSchema, cardHistorySnapshotSchema, noteCardSourceLinkSchema, projectSchema, type ActorContext, type ProjectArchiveManifest } from "@storymapper/contracts";
import { validateCardHierarchy } from "@storymapper/core";
import { parseStoredJson } from "@storymapper/db/versioned-json";
import { transitionStoredOperations } from "@storymapper/db/operation-schema-transition";
import { openExistingStoryMapperDb } from "@storymapper/db/connection";
import { DatabaseHandle } from "@storymapper/db/database-handle";
import { toCard } from "@storymapper/db/repositories/row-mappers";
import { aiFunctionTemplates, cards, cardSourceLinks } from "@storymapper/db/schema/tables";
import { redactedTables, redactedActivityEntityTypes } from "@storymapper/db/schema/classification";
import { validateRestoreDatabase, validateRestoreSource } from "@storymapper/db/restore-validation";
import { resolveSqlitePath } from "@storymapper/db/sqlite-path";
import { containsGitHubDatabasePayloads, containsSourceGitHubDatabasePayloads, GITHUB_DELETION_ACTIVITY_PREDICATE } from "@storymapper/db/github-archive-redaction";

export class ArchiveValidationError extends DomainError {
  constructor(message: string, options?: ErrorOptions) {
    super("validation", message);
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function archiveDevelopmentSchemaVersion(): string {
  return currentReleaseSchemaVersion();
}

export function validateArchiveSource(path: string, manifest: ProjectArchiveManifest, assets: MigrationMeta[] = loadMigrationAssets()): void {
  const database = new Database(resolveSqlitePath(path), { readonly: true, fileMustExist: true });
  try {
    validateRestoreSource(database, manifest.schemaVersion, assets);
    validateArchiveRedaction(database, manifest, containsSourceGitHubDatabasePayloads);
    validateArchiveCounts(database, manifest);
  } catch (error) {
    if (error instanceof SyntaxError) throw new ArchiveValidationError("Archive source contains invalid JSON redaction evidence.", { cause: error });
    if (error instanceof Database.SqliteError && ["SQLITE_NOTADB", "SQLITE_CORRUPT"].includes(error.code)) throw new ArchiveValidationError("Archive database is not a valid SQLite database.", { cause: error });
    throw error;
  } finally { database.close(); }
}

export function migrateArchiveDatabase(path: string, assets: MigrationMeta[] = loadMigrationAssets()): void {
  const database = new Database(resolveSqlitePath(path), { fileMustExist: true });
  try { runMigrations(database, path, assets); }
  finally { database.close(); }
  discardRestorePointFiles(path);
}

export function validateArchiveDatabase(path: string, manifest: ProjectArchiveManifest, assets: MigrationMeta[] = loadMigrationAssets()): string {
  const database = new Database(resolveSqlitePath(path), { readonly: true, fileMustExist: true });
  try {
    validateRestoreDatabase(database, currentReleaseSchemaVersion(assets), assets);
    validateArchiveRedaction(database, manifest);
    validateArchiveCounts(database, manifest);
    const project = database.prepare("SELECT id FROM projects WHERE historical_stub = 0").get() as { id: string } | undefined;
    if (!project) throw new ArchiveValidationError("Archive does not contain one openable Project.");
    if (!projectSchema.shape.id.safeParse(project.id).success) throw new ArchiveValidationError("Archive Project ID must be a UUID.");
    if (!database.prepare("SELECT project_id FROM project_settings WHERE project_id = ?").get(project.id)) throw new ArchiveValidationError("Archive Project is missing required project_settings.");
    validateArchiveHierarchy(database);
    validateArchiveTemplates(database);
    validateArchiveSourceNotes(database);
    validateArchiveProvenance(database);
    return project.id;
  } catch (error) {
    if (error instanceof Database.SqliteError && ["SQLITE_NOTADB", "SQLITE_CORRUPT"].includes(error.code)) throw new ArchiveValidationError("Archive database is not a valid SQLite database.", { cause: error });
    throw error;
  } finally { database.close(); }
}

function validateArchiveCounts(database: Database.Database, manifest: ProjectArchiveManifest): void {
  for (const [table, count] of [["projects", manifest.counts.projects], ["story_maps", manifest.counts.storyMaps], ["cards", manifest.counts.cards]] as const) {
    if ((database.prepare(`SELECT count(*) AS count FROM "${table}"`).get() as { count: number }).count !== count) throw new ArchiveValidationError(`Archive manifest count does not match ${table}.`);
  }
}

function validateArchiveRedaction(database: Database.Database, manifest: ProjectArchiveManifest, containsPayloads = containsGitHubDatabasePayloads): void {
  if ([...manifest.redactedTables].sort().join(",") !== [...redactedTables].sort().join(",")) throw new ArchiveValidationError("Archive manifest does not match the Sync aggregate redaction classification.");
  for (const table of redactedTables) {
    if ((database.prepare(`SELECT count(*) AS count FROM "${table}"`).get() as { count: number }).count) throw new ArchiveValidationError(`Archive contains unredacted Sync table ${table}.`);
  }
  if (database.prepare(`SELECT id FROM external_refs WHERE system IN (${workItemProviderSchema.options.map(() => "?").join(",")}) LIMIT 1`).get(...workItemProviderSchema.options)) throw new ArchiveValidationError("Archive contains unredacted GitHub external references.");
  for (const entityType of redactedActivityEntityTypes) {
    if (database.prepare("SELECT id FROM activity_events WHERE affected_entity_type = ? AND (before_json IS NOT NULL OR after_json IS NOT NULL) LIMIT 1").get(entityType)) throw new ArchiveValidationError("Archive contains unredacted Sync activity payloads.");
  }
  if (database.prepare(`SELECT id FROM activity_events WHERE ${GITHUB_DELETION_ACTIVITY_PREDICATE} LIMIT 1`).get()) throw new ArchiveValidationError("Archive contains unredacted Sync activity payloads.");
  if (containsPayloads(database)) throw new ArchiveValidationError("Archive contains unredacted Sync activity payloads.");
}

function validateArchiveProvenance(database: Database.Database): void {
  const inconsistent = database.prepare(`SELECT id FROM cards WHERE provenance IS NOT CASE WHEN
    EXISTS(SELECT 1 FROM card_source_links WHERE card_id = cards.id)
    THEN 'linked' ELSE creation_origin END LIMIT 1`).get();
  if (inconsistent) throw new ArchiveValidationError("Archive contains inconsistent Card provenance.");
}

function validateArchiveSourceNotes(database: Database.Database): void {
  for (const note of drizzle(database).select().from(cardSourceLinks).all().filter((link) => link.kind === "note")) {
    if (!noteCardSourceLinkSchema.safeParse(note).success) throw new ArchiveValidationError("Archive contains an invalid source note.");
  }
}

function validateArchiveTemplates(database: Database.Database): void {
  for (const { argumentsJson, examplesJson, argumentsSchemaVersion, examplesSchemaVersion, outputSchemaName, ...template } of drizzle(database).select().from(aiFunctionTemplates).all()) {
    let arguments_: unknown;
    let examples: unknown;
    try {
      arguments_ = parseStoredJson("ai_function_templates", "arguments_json", argumentsJson, argumentsSchemaVersion);
      examples = parseStoredJson("ai_function_templates", "examples_json", examplesJson, examplesSchemaVersion);
    } catch (error) {
      if (error instanceof SyntaxError) throw new ArchiveValidationError("Archive contains invalid AI template JSON.", { cause: error });
      throw error;
    }
    const result = aiFunctionTemplateSchema.safeParse({ ...template, arguments: arguments_, examples, ...(outputSchemaName === null ? {} : { outputSchemaName }) });
    if (!result.success) throw new ArchiveValidationError("Archive contains an invalid AI template declaration.");
  }
}

function validateArchiveHierarchy(database: Database.Database): void {
  const allCards = drizzle(database).select().from(cards).all().map(toCard);
  for (const card of allCards) cardHistorySnapshotSchema.parse(card);
  for (const mapId of new Set(allCards.map((card) => card.storyMapId))) {
    const issues = validateCardHierarchy(allCards.filter((card) => card.storyMapId === mapId));
    if (issues.length) throw new ArchiveValidationError(`Archive contains an invalid Card hierarchy: ${issues.map((issue) => `${issue.cardId}: ${issue.message}`).join(" ")}`);
  }
}

export function prepareImportedDatabase(path: string, localPath: string, projectId: string, actorContext: ActorContext, assets: MigrationMeta[] = loadMigrationAssets()): void {
  const actor = actorContextSchema.parse(actorContext);
  if (actor.actorType !== "human") throw new DomainError("protected", "Project archive import is human-only.");
  const database = openExistingStoryMapperDb(path, assets);
  const handle = new DatabaseHandle(database);
  try {
    handle.exclusive("Project archive import", () => database.$client.transaction(() => {
      database.$client.prepare("UPDATE projects SET local_path = ? WHERE id = ?").run(localPath, projectId);
      const epoch = randomUUID();
      database.$client.prepare("UPDATE project_settings SET epoch = ?, updated_at = ?").run(epoch, new Date().toISOString());
      database.$client.prepare("UPDATE database_metadata SET epoch = ? WHERE id = 1").run(epoch);
      database.$client.prepare("INSERT INTO activity_events (id, project_id, actor, actor_type, mcp_session_id, action, created_at, transaction_id, origin_client_id, live_entities_json, live_entities_schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)").run(randomUUID(), projectId, actor.actorId, actor.actorType, actor.mcpSessionId ?? null, "project.archiveImported", new Date().toISOString(), randomUUID(), actor.originClientId ?? null, JSON.stringify([{ entityType: "project", entityId: projectId, projectId, version: null }]));
      rebaseImportedFiles(database.$client, dirname(path), localPath);
      transitionStoredOperations(database.$client);
    })());
    database.$client.pragma("wal_checkpoint(TRUNCATE)");
    database.$client.pragma("journal_mode = DELETE");
  } finally { database.$client.close(); }
}

function rebaseImportedFiles(database: Database.Database, staging: string, localPath: string): void {
  for (const table of ["source_documents", "card_attachments"]) {
    const rows = database.prepare(`SELECT id, file_path FROM "${table}"`).all() as Array<{ id: string; file_path: string }>;
    for (const row of rows) {
      if (table === "source_documents" && row.file_path.startsWith("inline://")) continue;
      if (!/^(documents|attachments|exports)\//.test(row.file_path) || row.file_path.split("/").some((segment) => segment === ".." || segment === "." || !segment) || row.file_path.includes("\\") || row.file_path.includes("\0")) throw new ArchiveValidationError(`Archive contains a nonportable file reference in ${table}.`);
      if (!lstatSync(join(staging, row.file_path), { throwIfNoEntry: false })?.isFile()) throw new ArchiveValidationError(`Archive is missing a portable file referenced by ${table}.`);
      database.prepare(`UPDATE "${table}" SET file_path = ? WHERE id = ?`).run(join(localPath, ...row.file_path.split("/")), row.id);
    }
  }
}
