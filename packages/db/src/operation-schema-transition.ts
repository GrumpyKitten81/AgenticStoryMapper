import { parseStoredJson, parseStoredOperationsJson } from "@storymapper/db/versioned-json";
import type Database from "better-sqlite3";
import { changeSetSchema, DomainError, OPERATIONS_SCHEMA_VERSION, storedChangeSetSchema } from "@storymapper/contracts";

interface OperationRow {
  id: string;
  project_id: string;
  title: string;
  source: string;
  status: string;
  operations_schema_version: number;
  operations_json: string;
  undone_by_restore: number;
  created_at: string;
  proposed_by_json: string | null;
  proposed_by_schema_version: number | null;
  approval_json: string | null;
  approval_schema_version: number | null;
  execution_json: string | null;
  execution_schema_version: number | null;
  warnings_json: string | null;
  warnings_schema_version: number | null;
}

export function validateStoredOperations(database: Database.Database): void {
  const rows = database.prepare("SELECT * FROM change_sets").all() as OperationRow[];
  for (const row of rows) {
    if (row.undone_by_restore !== 0 && row.undone_by_restore !== 1) throw new DomainError("validation", "Invalid ChangeSet restore-history flag.");
    const operations = parseStoredOperationsJson(row.operations_json, row.operations_schema_version, row.status, row.undone_by_restore === 1);
    const stored = storedChangeSetSchema.safeParse({
      id: row.id, projectId: row.project_id, title: row.title, source: row.source, status: row.status,
      operationsSchemaVersion: row.operations_schema_version, operations, undoneByRestore: row.undone_by_restore === 1, createdAt: row.created_at,
      proposedBy: parseStoredJson("change_sets", "proposed_by_json", row.proposed_by_json, row.proposed_by_schema_version),
      approval: parseStoredJson("change_sets", "approval_json", row.approval_json, row.approval_schema_version),
      execution: parseStoredJson("change_sets", "execution_json", row.execution_json, row.execution_schema_version),
      warnings: parseStoredJson("change_sets", "warnings_json", row.warnings_json, row.warnings_schema_version)
    });
    if (!stored.success) throw new DomainError("validation", "Invalid stored ChangeSet schema, status or version.");
    if (row.operations_schema_version === OPERATIONS_SCHEMA_VERSION && row.status !== "stale" && row.status !== "applied" && !row.undone_by_restore && !changeSetSchema.safeParse(stored.data).success)
      throw new DomainError("validation", "Invalid current-schema ChangeSet operations.");
  }
}

export function transitionStoredOperations(database: Database.Database): void {
  database.transaction(() => {
    validateStoredOperations(database);
    database.prepare("UPDATE change_sets SET status = 'stale' WHERE operations_schema_version < ? AND undone_by_restore = 0 AND status IN ('proposed', 'approved', 'rejected', 'conflict')").run(OPERATIONS_SCHEMA_VERSION);
  })();
}
