import type Database from "better-sqlite3";
import { JSON_PAYLOADS, jsonVersionColumn, parseStoredJson } from "@storymapper/db/versioned-json";
import { validateStoredOperations } from "@storymapper/db/operation-schema-transition";

export function validatePersistedJson(database: Database.Database): void {
  for (const [table, schemas] of Object.entries(JSON_PAYLOADS)) {
    const columns = Object.keys(schemas);
    const versions = [...new Set(columns.map((column) => jsonVersionColumn(table, column)))];
    const rows = database.prepare(`SELECT ${[...columns, ...versions].join(",")} FROM ${table}`).iterate() as Iterable<Record<string, string | number | null>>;
    for (const row of rows) for (const column of columns) {
      parseStoredJson(table as keyof typeof JSON_PAYLOADS, column as never, row[column] as string | null, row[jsonVersionColumn(table, column)]);
    }
  }
  validateStoredOperations(database);
}
