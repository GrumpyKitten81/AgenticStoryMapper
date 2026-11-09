import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";

export function loadMigrationAssets(): MigrationMeta[] {
  const migrations = readMigrationFiles({ migrationsFolder: fileURLToPath(new URL("../migrations/", import.meta.url)) });
  if (!migrations.length) throw new Error("Committed release migration assets are empty. Reinstall the complete application before opening a Project.");
  for (const [index, migration] of migrations.entries()) {
    if (!/^[a-f0-9]{64}$/.test(migration.hash) || !Number.isSafeInteger(migration.folderMillis) || migration.folderMillis <= 0 || !migration.sql.length || index > 0 && migration.folderMillis <= migrations[index - 1]!.folderMillis)
      throw new Error("Committed release migration assets are inconsistent. Reinstall the complete application before opening a Project.");
  }
  return migrations;
}

export function currentReleaseSchemaVersion(assets: MigrationMeta[] = loadMigrationAssets()): string {
  return releaseSchemaVersion(assets.map((migration) => migration.hash));
}

export function releaseSchemaVersion(hashes: string[]): string {
  return `release-sha256-${createHash("sha256").update(JSON.stringify(hashes)).digest("hex")}`;
}
