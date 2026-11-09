import Database from "better-sqlite3";
import { runMigrations } from "@storymapper/db/migration-runner";
import { loadTestMigrationAssets } from "@storymapper/db/test-fixtures/migration-assets";

const database = new Database(process.argv[2]!);
const execute = database.exec.bind(database);
database.exec = (sql: string) => {
  const result = execute(sql);
  if (sql.includes("test_projects_name_idx")) process.exit(87);
  return result;
};
runMigrations(database, process.argv[2]!, loadTestMigrationAssets());
