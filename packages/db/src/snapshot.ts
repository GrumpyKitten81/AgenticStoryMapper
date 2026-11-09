import { workItemProviderSchema } from "@storymapper/contracts";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import Database from "better-sqlite3";
import { assertClassifiedTables, infrastructureTables, redactedTables, redactedActivityEntityTypes } from "@storymapper/db/schema/classification";
import { databaseSchemaVersion, validateRestoreDatabase } from "@storymapper/db/restore-validation";
import { GITHUB_DELETION_ACTIVITY_PREDICATE, redactGitHubDatabasePayloads } from "@storymapper/db/github-archive-redaction";

export interface RedactedSnapshot {
  snapshotPath: string;
  schemaVersion: string;
  databaseSha256: string;
  redactedTables: string[];
  redactedRowCount: number;
  counts: { projects: number; storyMaps: number; cards: number };
  excludedFiles: string[];
}

export function createRedactedSnapshot(databasePath: string, projectId: string): RedactedSnapshot {
  const snapshotPath = join(dirname(databasePath), `snapshot-${randomUUID()}.sqlite`);
  const source = new Database(databasePath, { readonly: true });
  try { source.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`); }
  catch (error) { rmSync(snapshotPath, { force: true }); throw error; }
  finally { source.close(); }
  const snapshot = new Database(snapshotPath);
  try {
    const tables = (snapshot.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*'").all() as Array<{ name: string }>).map(({ name }) => name);
    assertClassifiedTables(tables);
    if (!snapshot.prepare("SELECT id FROM projects WHERE id = ? AND historical_stub = 0").get(projectId)) throw new Error("Project not found.");
    const schemaVersion = databaseSchemaVersion(snapshot);
    const knownFiles = referencedFiles(snapshot, dirname(databasePath));
    const domainTables = tables.filter((table) => !infrastructureTables.some((name) => name === table));
    const redactedRowCount = redactProject(snapshot, domainTables, projectId);
    portableFileReferences(snapshot, dirname(databasePath));
    const retainedFiles = new Set(referencedFiles(snapshot, dirname(databasePath)).map((path) => path.normalize("NFC").toLowerCase()));
    const excludedFiles = knownFiles.filter((path) => !retainedFiles.has(path.normalize("NFC").toLowerCase()));
    snapshot.exec("VACUUM");
    validateRestoreDatabase(snapshot, schemaVersion);
    const counts = { projects: countRows(snapshot, "projects"), storyMaps: countRows(snapshot, "story_maps"), cards: countRows(snapshot, "cards") };
    snapshot.close();
    return { snapshotPath, schemaVersion, databaseSha256: createHash("sha256").update(readFileSync(snapshotPath)).digest("hex"), redactedTables: [...redactedTables], redactedRowCount, counts, excludedFiles };
  } catch (error) {
    if (snapshot.open) snapshot.close();
    rmSync(snapshotPath, { force: true });
    throw error;
  }
}

function referencedFiles(database: Database.Database, projectDirectory: string): string[] {
  return (database.prepare("SELECT file_path FROM source_documents UNION SELECT file_path FROM card_attachments").all() as Array<{ file_path: string }>)
    .map(({ file_path }) => isAbsolute(file_path) ? relative(projectDirectory, file_path).split(sep).join("/") : file_path.split(sep).join("/"))
    .filter((path) => /^(documents|attachments|exports)\//.test(path));
}

function portableFileReferences(database: Database.Database, projectDirectory: string): void {
  database.prepare("UPDATE projects SET local_path = '.'").run();
  for (const table of ["source_documents", "card_attachments"]) {
    const rows = database.prepare(`SELECT id, file_path FROM "${table}"`).all() as Array<{ id: string; file_path: string }>;
    for (const row of rows) {
      if (table === "source_documents" && row.file_path.startsWith("inline://")) continue;
      const portablePath = isAbsolute(row.file_path) ? relative(projectDirectory, row.file_path).split(sep).join("/") : row.file_path.split(sep).join("/");
      if (!/^(documents|attachments|exports)\//.test(portablePath) || portablePath.split("/").some((part) => part === ".." || part === "." || !part)) throw new Error(`Project contains a nonportable file reference in ${table}.`);
      if (!lstatSync(join(projectDirectory, portablePath), { throwIfNoEntry: false })?.isFile()) throw new Error(`Project is missing a portable file referenced by ${table}.`);
      database.prepare(`UPDATE "${table}" SET file_path = ? WHERE id = ?`).run(portablePath, row.id);
    }
  }
}

function redactProject(database: Database.Database, tables: string[], projectId: string): number {
  database.pragma("foreign_keys = OFF");
  database.pragma("secure_delete = ON");
  return database.transaction(() => {
    let redactedRowCount = 0;
    const referenceIds = new Set((database.prepare(`SELECT id FROM external_refs WHERE system IN (${workItemProviderSchema.options.map(() => "?").join(",")})`).all(...workItemProviderSchema.options) as Array<{ id: string }>).map((row) => row.id));
    for (const table of redactedTables) redactedRowCount += database.prepare(`DELETE FROM "${table}"`).run().changes;
    redactedRowCount += database.prepare(`DELETE FROM external_refs WHERE system IN (${workItemProviderSchema.options.map(() => "?").join(",")})`).run(...workItemProviderSchema.options).changes;
    for (const entityType of redactedActivityEntityTypes) database.prepare("UPDATE activity_events SET before_json = NULL, before_schema_version = NULL, after_json = NULL, after_schema_version = NULL WHERE affected_entity_type = ?").run(entityType);
    database.prepare(`UPDATE activity_events SET before_json = NULL, before_schema_version = NULL, after_json = NULL, after_schema_version = NULL WHERE ${GITHUB_DELETION_ACTIVITY_PREDICATE}`).run();
    database.exec(`UPDATE activity_events SET before_json = NULL, before_schema_version = NULL, after_json = NULL, after_schema_version = NULL
      WHERE affected_entity_type = 'sourceLink' AND
      (json_extract(before_json, '$.kind') = 'github' OR json_extract(after_json, '$.kind') = 'github')`);
    redactGitHubDatabasePayloads(database, referenceIds);
    database.prepare("UPDATE story_maps SET default_connection_id = NULL").run();
    database.prepare("DELETE FROM card_versions WHERE json_extract(snapshot_json, '$.storyMapId') NOT IN (SELECT id FROM story_maps WHERE project_id = ?)").run(projectId);
    for (const table of tables) {
      const columns = database.pragma(`table_info("${table}")`) as Array<{ name: string }>;
      if (table === "projects") database.prepare("DELETE FROM projects WHERE id != ?").run(projectId);
      else if (columns.some(({ name }) => name === "project_id")) database.prepare(`DELETE FROM "${table}" WHERE project_id IS NULL OR project_id != ?`).run(projectId);
    }
    pruneForeignRows(database, tables);
    database.exec(`UPDATE cards SET provenance = CASE WHEN
      EXISTS(SELECT 1 FROM card_source_links WHERE card_id = cards.id)
      THEN 'linked' ELSE creation_origin END`);
    database.exec(`
      DELETE FROM external_refs WHERE
        (entity_type = 'card' AND entity_id NOT IN (SELECT id FROM cards)) OR
        (entity_type = 'release' AND entity_id NOT IN (SELECT id FROM releases)) OR
        (entity_type = 'persona' AND entity_id NOT IN (SELECT id FROM personas))
    `);
    return redactedRowCount;
  })();
}

function pruneForeignRows(database: Database.Database, tables: string[]): void {
  let removed: number;
  do {
    removed = 0;
    for (const table of tables) {
      const keys = database.pragma(`foreign_key_list("${table}")`) as Array<{ table: string; from: string; to: string }>;
      for (const key of keys) removed += database.prepare(`DELETE FROM "${table}" WHERE "${key.from}" IS NOT NULL AND "${key.from}" NOT IN (SELECT "${key.to}" FROM "${key.table}")`).run().changes;
    }
  } while (removed);
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}
