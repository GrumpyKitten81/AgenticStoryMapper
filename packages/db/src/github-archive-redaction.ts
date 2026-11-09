import { JSON_PAYLOADS, jsonVersionColumn, parseStoredJson, parseStoredOperationsJson } from "@storymapper/db/versioned-json";
import { isWorkItemProvider, workItemProviderSchema } from "@storymapper/contracts";
import { isDeepStrictEqual } from "node:util";
import type Database from "better-sqlite3";

const GITHUB_ENTITIES = new Set(["githubLink", "githubExternalRef", "remoteWorkItemLink", "syncRun", "syncConflict", "githubBoardImport", "remotePushPlan", "remotePushExecution"]);
const SYNC_COLLECTIONS = new Set(["githubStatusCatalogs", "githubLinks", "remoteWorkItemLinks", "connections", "syncRuns", "openConflicts", "remotePushPlans", "remotePushExecutions"]);
const PAYLOAD_BATCH_SIZE = 32;
export const GITHUB_DELETION_ACTIVITY_PREDICATE = `action = 'externalRef.deleted' AND (
  json_extract(before_json, '$.system') IN (${workItemProviderSchema.options.map((provider) => `'${provider}'`).join(',')}) OR json_extract(before_json, '$.before.system') IN (${workItemProviderSchema.options.map((provider) => `'${provider}'`).join(',')}) OR
  json_extract(after_json, '$.system') IN (${workItemProviderSchema.options.map((provider) => `'${provider}'`).join(',')}) OR json_extract(after_json, '$.before.system') IN (${workItemProviderSchema.options.map((provider) => `'${provider}'`).join(',')}))`;
const PAYLOAD_COLUMNS = {
  activity_events: ["before_json", "after_json"],
  change_sets: ["operations_json", "approval_json", "execution_json", "warnings_json"],
  card_versions: ["snapshot_json"]
} as const;

function githubObject(value: unknown, referenceIds: ReadonlySet<string>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return isWorkItemProvider(record.system) || isWorkItemProvider(record.provider) || record.kind === "github"
    || GITHUB_ENTITIES.has(String(record.entity))
    || typeof record.externalRefId === "string" && (referenceIds.has(record.externalRefId) || "connectionId" in record)
    || record.entity === "externalRef" && typeof record.entityId === "string" && referenceIds.has(record.entityId);
}

export function redactGitHubPayload(value: unknown, referenceIds: ReadonlySet<string> = new Set()): unknown {
  if (githubObject(value, referenceIds)) return undefined;
  if (Array.isArray(value)) return value.map((entry) => redactGitHubPayload(entry, referenceIds)).filter((entry) => entry !== undefined);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (("op" in record || "entity" in record) && (githubObject(record.before, referenceIds) || githubObject(record.after, referenceIds))) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    const retained = SYNC_COLLECTIONS.has(key) ? [] : key === "defaultConnectionId" ? null : redactGitHubPayload(entry, referenceIds);
    if (retained !== undefined) result[key] = retained;
  }
  reconcileSnapshotProvenance(result);
  return result;
}

function reconcileSnapshotProvenance(value: Record<string, unknown>): void {
  if (!Array.isArray(value.cards) || !Array.isArray(value.sourceLinks)) return;
  const linkedIds = new Set(value.sourceLinks.map((link: { cardId?: string }) => link.cardId));
  value.cards = value.cards.map((card: Record<string, unknown>) => ({ ...card, provenance: linkedIds.has(String(card.id)) ? "linked" : card.creationOrigin }));
}

function* payloadRows(database: Database.Database, table: string, columns: readonly string[], includeVersions = true): Generator<Record<string, string | null>> {
  const versions = includeVersions ? columns.map((column) => column === "operations_json" ? "operations_schema_version" : jsonVersionColumn(table, column)) : [];
  if (includeVersions && table === "change_sets") versions.push("status", "undone_by_restore");
  const select = `SELECT rowid AS payload_row_id, id, ${[...columns, ...versions].join(",")} FROM ${table}`;
  const first = database.prepare(`${select} ORDER BY rowid LIMIT ?`).safeIntegers();
  const next = database.prepare(`${select} WHERE rowid > ? ORDER BY rowid LIMIT ?`).safeIntegers();
  let cursor: bigint | undefined;
  while (true) {
    const rows = (cursor === undefined ? first.all(PAYLOAD_BATCH_SIZE) : next.all(cursor, PAYLOAD_BATCH_SIZE)) as Array<Record<string, string | null> & { payload_row_id: bigint }>;
    if (!rows.length) return;
    for (const row of rows) yield row;
    cursor = rows[rows.length - 1]!.payload_row_id;
  }
}

export function redactGitHubDatabasePayloads(database: Database.Database, referenceIds: ReadonlySet<string>): void {
  for (const [table, columns] of Object.entries(PAYLOAD_COLUMNS)) {
    for (const row of payloadRows(database, table, columns)) {
      let changed = false;
      for (const column of columns) {
        if (row[column] === null) { parseRedactionPayload(table, column, row); continue; }
        const before = parseRedactionPayload(table, column, row);
        const after = redactGitHubPayload(before, referenceIds);
        if (isDeepStrictEqual(before, after)) continue;
        const json = after === undefined ? column === "operations_json" ? "[]" : null : JSON.stringify(after);
        const versionColumn = column === "operations_json" ? "operations_schema_version" : jsonVersionColumn(table, column);
        database.prepare(`UPDATE ${table} SET ${column} = ?, ${versionColumn} = ? WHERE id = ?`).run(json, json === null ? null : row[versionColumn], row.id);
        changed = true;
      }
      if (changed && table === "change_sets") database.prepare("UPDATE change_sets SET status = CASE WHEN status = 'applied' THEN status ELSE 'stale' END, approval_json = NULL, approval_schema_version = NULL, execution_json = NULL, execution_schema_version = NULL, warnings_json = NULL, warnings_schema_version = NULL WHERE id = ?").run(row.id);
    }
  }
}

export function containsGitHubDatabasePayloads(database: Database.Database): boolean {
  for (const [table, columns] of Object.entries(PAYLOAD_COLUMNS)) {
    for (const row of payloadRows(database, table, columns)) for (const column of columns) {
      const value = parseRedactionPayload(table, column, row);
      if (!isDeepStrictEqual(value, redactGitHubPayload(value))) return true;
    }
  }
  return false;
}

function parseRedactionPayload(table: string, column: string, row: Record<string, string | null>): unknown {
  if (column === "operations_json") return parseStoredOperationsJson(row[column]!, Number(row.operations_schema_version), row.status!, Number(row.undone_by_restore) === 1);
  const version = row[jsonVersionColumn(table, column)];
  parseStoredJson(table as keyof typeof JSON_PAYLOADS, column as never, row[column]!, version === null ? null : Number(version));
  return row[column] === null ? undefined : JSON.parse(row[column]!);
}

export function containsSourceGitHubDatabasePayloads(database: Database.Database): boolean {
  for (const [table, columns] of Object.entries(PAYLOAD_COLUMNS)) {
    for (const row of payloadRows(database, table, columns, false)) for (const column of columns) if (row[column] !== null) {
      const value: unknown = JSON.parse(row[column]!);
      if (!isDeepStrictEqual(value, redactGitHubPayload(value))) return true;
    }
  }
  return false;
}
