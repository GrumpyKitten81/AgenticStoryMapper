import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { OPERATIONS_SCHEMA_VERSION } from "@storymapper/contracts";
import { openStoryMapperDb } from "@storymapper/db/connection";
import { JSON_PAYLOADS, NULLABLE_JSON_PAYLOADS, parseStoredJson, parseStoredOperationsJson } from "@storymapper/db/versioned-json";
import { validatePersistedJson } from "@storymapper/db/versioned-json-validation";

const inventory = Object.entries(JSON_PAYLOADS).flatMap(([table, columns]) => Object.keys(columns).map((column) => [table, column] as const));

it("matches every persisted SQLite JSON column and version sibling to the parser inventory", () => {
  const database = openStoryMapperDb(":memory:");
  try {
    const tables = database.$client.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*'").all() as Array<{ name: string }>;
    const columns = tables.flatMap(({ name: table }) => (database.$client.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string; type: string; notnull: number; dflt_value: string | null }>).map((column) => ({ table, ...column })));
    const payloads = columns.filter((column) => column.name.endsWith("_json"));
    const registered = [...inventory.map(([table, column]) => `${table}.${column}`), "change_sets.operations_json"].sort();
    expect(payloads.map((column) => `${column.table}.${column.name}`).sort()).toEqual(registered);
    expect(payloads).toHaveLength(33);
    const pairedVersions = new Set<string>();
    for (const payload of payloads) {
      const versionName = ["source_plan_baselines", "plan_states"].includes(payload.table) ? "schema_version" : payload.name.replace(/_json$/u, "_schema_version");
      const version = columns.find((column) => column.table === payload.table && column.name === versionName);
      expect(version, `${payload.table}.${payload.name}`).toBeDefined();
      expect(payload.type).toBe("TEXT");
      expect(version!.type).toBe("INTEGER");
      expect(version!.notnull).toBe(payload.notnull);
      pairedVersions.add(`${payload.table}.${versionName}`);
      if (!["schema_version", "operations_schema_version"].includes(versionName)) expect(version!.dflt_value).toBe(payload.notnull ? "1" : null);
    }
    expect(columns.filter((column) => column.name === "schema_version" || column.name.endsWith("_schema_version")).map((column) => `${column.table}.${column.name}`).sort()).toEqual([...pairedVersions].sort());
    expect(payloads.filter((column) => !column.notnull).map((column) => `${column.table}.${column.name}`).sort()).toEqual([...NULLABLE_JSON_PAYLOADS].sort());
  } finally { database.$client.close(); }
});

it.each(inventory)("refuses malformed and future %s.%s payloads with explicit diagnostics", (table, column) => {
  const parse = (value: string, version: number) => parseStoredJson(table as keyof typeof JSON_PAYLOADS, column as never, value, version);
  expect(() => parse("null", 2)).toThrow("Unsupported stored JSON payload version");
  expect(() => parse("{", 1)).toThrow("Invalid stored JSON");
  expect(() => parse("null", 0)).toThrow("Unsupported stored JSON payload version");
});

it("retains JSON literal null separately from SQL NULL and enforces all nullable sibling pairs", () => {
  expect(parseStoredJson("activity_events", "before_json", "null", 1)).toBeNull();
  expect(parseStoredJson("sync_conflicts", "local_value_json", "null", 1)).toBeNull();
  expect(parseStoredJson("sync_conflicts", "remote_value_json", "null", 1)).toBeNull();
  expect(() => parseStoredJson("sync_conflicts", "local_value_json", null, null)).toThrow("null/version pair");
  for (const field of NULLABLE_JSON_PAYLOADS) {
    const [table, column] = field.split(".");
    const parse = (version: unknown) => parseStoredJson(table as keyof typeof JSON_PAYLOADS, column as never, null, version);
    expect(parse(null)).toBeUndefined();
    expect(() => parse(1)).toThrow("null/version pair");
  }
  expect(() => parseStoredJson("personas", "goals_json", '[1]', 1)).toThrow("Invalid stored JSON payload");
  expect(parseStoredJson("personas", "goals_json", '["Retained goal"]', 1)).toEqual(["Retained goal"]);
});

it("retains positive historical operations without reviving future executable consent", () => {
  const historical = '[ { "retired" : "immutable bytes" } ]';
  expect(parseStoredOperationsJson(historical, 1, "applied", false)).toEqual([{ retired: "immutable bytes" }]);
  expect(parseStoredOperationsJson(historical, OPERATIONS_SCHEMA_VERSION + 1, "approved", true)).toEqual([{ retired: "immutable bytes" }]);
  expect(() => parseStoredOperationsJson(historical, OPERATIONS_SCHEMA_VERSION + 1, "approved", false)).toThrow("Future active");
  expect(() => parseStoredOperationsJson(historical, OPERATIONS_SCHEMA_VERSION, "approved", false)).toThrow("Invalid current-schema");
});

it("checks the complete inventory before startup epoch or historical operation transitions", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-versioned-json-"));
  const path = join(directory, "storymapper.sqlite");
  const database = openStoryMapperDb(path);
  const projectId = randomUUID();
  const changeSetId = randomUUID();
  const now = new Date().toISOString();
  database.$client.prepare("INSERT INTO projects (id, name, local_path, created_at) VALUES (?, 'Versioned payload', '', ?)").run(projectId, now);
  database.$client.prepare("INSERT INTO change_sets (id, project_id, title, source, status, operations_schema_version, operations_json, created_at) VALUES (?, ?, 'Historical', 'mcp', 'approved', 1, '[]', ?)").run(changeSetId, projectId, now);
  database.$client.prepare("INSERT INTO product_contexts (id, project_id, key_features_json, updated_at) VALUES (?, ?, '[1]', ?)").run(randomUUID(), projectId, now);
  expect(() => validatePersistedJson(database.$client)).toThrow("product_contexts.key_features_json");
  const epoch = database.$client.prepare("SELECT epoch FROM database_metadata").get();
  database.$client.close();
  try {
    expect(() => openStoryMapperDb(path)).toThrow("product_contexts.key_features_json");
    const retained = new Database(path, { readonly: true });
    try {
      expect(retained.prepare("SELECT epoch FROM database_metadata").get()).toEqual(epoch);
      expect(retained.prepare("SELECT status FROM change_sets WHERE id = ?").get(changeSetId)).toEqual({ status: "approved" });
    } finally { retained.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it.each(["missing", "invalid"])("refuses %s persisted epoch metadata before startup mutation", (damage) => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-epoch-admission-"));
  const path = join(directory, "storymapper.sqlite");
  const database = openStoryMapperDb(path);
  database.$client.pragma("journal_mode = DELETE");
  if (damage === "missing") database.$client.exec("DELETE FROM database_metadata");
  else database.$client.exec("UPDATE database_metadata SET epoch = ' '");
  const before = database.$client.prepare("SELECT * FROM database_metadata").all();
  database.$client.close();
  try {
    expect(() => openStoryMapperDb(path)).toThrow("valid database epoch");
    const retained = new Database(path, { readonly: true });
    try {
      expect(retained.prepare("SELECT * FROM database_metadata").all()).toEqual(before);
      expect(retained.pragma("journal_mode", { simple: true })).toBe("delete");
    } finally { retained.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
