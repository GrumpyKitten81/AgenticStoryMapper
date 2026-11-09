import { fileURLToPath } from "node:url";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { loadMigrationAssets } from "@storymapper/db/migration-assets";

export function loadTestMigrationAssets(): MigrationMeta[] {
  const production = loadMigrationAssets();
  const successors = readMigrationFiles({ migrationsFolder: fileURLToPath(new URL("./migrations/", import.meta.url)) });
  return [...production, ...successors.map((migration, index) => ({ ...migration, folderMillis: production.at(-1)!.folderMillis + index + 1 }))];
}
