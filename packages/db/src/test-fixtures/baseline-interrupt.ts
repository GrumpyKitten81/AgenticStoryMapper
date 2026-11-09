import Database from "better-sqlite3";
import { runMigrations } from "@storymapper/db/migration-runner";

const database = new Database(process.argv[2]!);
const prepare = database.prepare.bind(database);
database.prepare = ((sql: string) => {
  const statement = prepare(sql);
  if (sql.startsWith("INSERT INTO database_metadata")) {
    const run = statement.run.bind(statement);
    statement.run = (...values: unknown[]) => {
      run(...values);
      if (!database.inTransaction) throw new Error("Epoch INSERT must be inside the baseline transaction.");
      process.exit(87);
    };
  }
  return statement;
}) as typeof database.prepare;
runMigrations(database, process.argv[2]!);
