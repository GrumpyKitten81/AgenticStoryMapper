import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { MigrationMeta } from "drizzle-orm/migrator";
import { DomainError } from "@storymapper/contracts";
import { loadMigrationAssets, releaseSchemaVersion } from "@storymapper/db/migration-assets";
import { publishRawRestorePoint } from "@storymapper/db/restore-points";

const JOURNAL_TABLE = "__drizzle_migrations";
const JOURNAL_DDL = `CREATE TABLE "__drizzle_migrations" (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)`;
const RECOVERY = "Keep the original database unchanged. Open it with the matching application release, or restore a supported pre-migration snapshot into a separate Project directory. For prototype data, use the original development application to export required content as Markdown or TXT, then import those documents into a new release Project. Prototype SQLite files and archives cannot be imported.";
interface SchemaRow { type: string; name: string; tbl_name: string; sql: string }
interface JournalRow { id: number; hash: string; created_at: number }
export interface MigrationAdmission { appliedCount: number; schemaVersion: string }

function refuse(reason: string): never {
  throw new DomainError("validation", `Database migration refused: ${reason}. ${RECOVERY}`);
}

function schemaRows(database: Database.Database): SchemaRow[] {
  return database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' ORDER BY type, name, tbl_name").all() as SchemaRow[];
}

function assertSchema(database: Database.Database, assets: MigrationMeta[], appliedCount: number): void {
  const expected = new Database(":memory:");
  try {
    for (const migration of assets.slice(0, appliedCount)) for (const statement of migration.sql) expected.exec(statement);
    if (appliedCount) expected.exec(JOURNAL_DDL);
    if (JSON.stringify(schemaRows(database)) !== JSON.stringify(schemaRows(expected))) refuse("inconsistent schema differs from its authenticated release migration prefix");
  } finally { expected.close(); }
}

export function authenticateMigrationPrefix(database: Database.Database, assets: MigrationMeta[] = loadMigrationAssets()): MigrationAdmission {
  const objects = schemaRows(database);
  const journal = objects.find((row) => row.name === JOURNAL_TABLE);
  if (!journal) {
    if (objects.length) refuse("unsupported prototype database has no release migration journal");
    return { appliedCount: 0, schemaVersion: releaseSchemaVersion([]) };
  }
  if (journal.type !== "table" || journal.sql !== JOURNAL_DDL) refuse("malformed migration journal definition");
  const rows = database.prepare('SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY id').all() as JournalRow[];
  if (!rows.length) refuse("inconsistent empty migration journal");
  if (rows.length > assets.length) refuse("newer or unknown release migration journal");
  for (const [index, row] of rows.entries()) {
    const migration = assets[index]!;
    if (row.id !== index + 1 || row.hash !== migration.hash || row.created_at !== migration.folderMillis) refuse("unknown, divergent or malformed migration journal prefix");
  }
  assertSchema(database, assets, rows.length);
  if ((database.pragma("foreign_key_check") as unknown[]).length) refuse("database contains invalid foreign keys");
  return { appliedCount: rows.length, schemaVersion: releaseSchemaVersion(rows.map((row) => row.hash)) };
}

function setForeignKeys(database: Database.Database, enabled: boolean): void {
  database.pragma(`foreign_keys = ${enabled ? "ON" : "OFF"}`);
  if (database.pragma("foreign_keys", { simple: true }) !== (enabled ? 1 : 0)) throw new Error(`Migration could not set foreign_keys=${enabled ? "ON" : "OFF"}.`);
}

function applyMigration(database: Database.Database, migration: MigrationMeta, index: number): void {
  setForeignKeys(database, false);
  try {
    database.transaction(() => {
      if (index === 0) database.exec(JOURNAL_DDL);
      for (const statement of migration.sql) database.exec(statement);
      if (index === 0) database.prepare("INSERT INTO database_metadata (id, epoch) VALUES (1, ?)").run(randomUUID());
      if ((database.pragma("foreign_key_check") as unknown[]).length) throw new Error("Migration contains invalid foreign keys.");
      database.prepare('INSERT INTO "__drizzle_migrations" (id, hash, created_at) VALUES (?, ?, ?)').run(index + 1, migration.hash, migration.folderMillis);
    })();
  } finally { setForeignKeys(database, true); }
}

export function runMigrations(database: Database.Database, databasePath: string, assets: MigrationMeta[] = loadMigrationAssets()): void {
  const admission = authenticateMigrationPrefix(database, assets);
  if (database.inTransaction) throw new Error("Release migrations cannot run inside a transaction.");
  for (let index = admission.appliedCount; index < assets.length; index++) {
    const snapshot = admission.appliedCount > 0 && databasePath !== ":memory:" && databasePath ? publishRawRestorePoint(database, "pre-migration", releaseSchemaVersion(assets.slice(0, index).map((migration) => migration.hash))) : undefined;
    try { applyMigration(database, assets[index]!, index); }
    catch (error) {
      const retained = snapshot ? ` Last usable snapshot: ${snapshot.fileName}.` : " No prior database state required a snapshot.";
      const failure = new DomainError("validation", `Release migration ${index + 1} failed.${retained} ${RECOVERY}`, { ...(snapshot ? { retainedRestorePoint: snapshot.fileName } : {}), retainedPreparedEffects: [] });
      Object.defineProperty(failure, "cause", { value: error });
      throw failure;
    }
  }
  setForeignKeys(database, true);
  authenticateMigrationPrefix(database, assets);
}
