import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { MigrationMeta } from "drizzle-orm/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPERATIONS_SCHEMA_VERSION } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { currentReleaseSchemaVersion, loadMigrationAssets } from "@storymapper/db/migration-assets";
import { authenticateMigrationPrefix, runMigrations } from "@storymapper/db/migration-runner";
import { listRestorePoints, publishRawRestorePoint } from "@storymapper/db/restore-points";
import { aggregateTables } from "@storymapper/db/schema/classification";
import { loadTestMigrationAssets } from "@storymapper/db/test-fixtures/migration-assets";
import { MIGRATION_ACTOR, populateMigrationDatabase } from "@storymapper/db/test-fixtures/populated-migration";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, unlinkSync: vi.fn(actual.unlinkSync) };
});

const COMMITTED_MIGRATIONS = loadMigrationAssets().length;
const cleanup: Array<() => void> = [];
const root = fileURLToPath(new URL("../../../", import.meta.url));
afterEach(() => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) close(); });

function fixture(populated = false) {
  const directory = mkdtempSync(join(tmpdir(), "story81-migration-"));
  const path = join(directory, "storymapper.sqlite");
  const database = openStoryMapperDb(path);
  const ids = populated ? populateMigrationDatabase(database) : undefined;
  cleanup.push(() => { if (database.$client.open) database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, path, database, ids };
}

function businessRows(database: Database.Database): Record<string, unknown[]> {
  return Object.fromEntries(Object.values(aggregateTables).flat().map((table) => [table, database.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]));
}

function failingAssets(statement: string): MigrationMeta[] {
  const assets = loadTestMigrationAssets();
  const next = assets.at(-1)!;
  return [...assets.slice(0, -1), { ...next, sql: [...next.sql, statement], hash: createHash("sha256").update(next.hash + statement).digest("hex") }];
}

function jsonMigrationAssets(): MigrationMeta[] {
  const assets = loadMigrationAssets();
  for (const name of ["migration-json-previous", "migration-json-current"]) {
    const sql = readFileSync(new URL(`./test-fixtures/${name}.sql`, import.meta.url), "utf8");
    assets.push({ sql: sql.split("--> statement-breakpoint"), bps: true, hash: createHash("sha256").update(sql).digest("hex"), folderMillis: assets.at(-1)!.folderMillis + 1 });
  }
  return assets;
}

describe("authenticated generated release migrations", () => {
  registerPublishesAPriorStateRestorePointForEveryPending();

  it("migrates supported older JSON column layouts before current validation", testMigratesSupportedOlderJSONColumnLayoutsBeforeCurrentValidation);

  it("refuses an invalid migrated JSON target before changing an older source", testRefusesAnInvalidMigratedJSONTargetBeforeChangingAnOlderSource);

  it("reports removed temporary preflight snapshots truthfully when migration execution fails", testReportsRemovedTemporaryPreflightSnapshotsTruthfullyWhenMigrationExecutionFails);

  registerRefusesMigratedSBeforeChangingTheSupportedSource();

  it("creates the generated baseline with actual checks, indexes, defaults and a no-op current reopen", testCreatesTheGeneratedBaselineWithActualChecksIndexesDefaultsAndA);

  it("preserves populated values and counts in every table through a protected generated successor", testPreservesPopulatedValuesAndCountsInEveryTableThroughAProtected);

  registerRefusesSWithoutChangingBytesPersistentPragmasOrBusiness();

  registerInvalidFk();

  registerDoesNotLeaveTheFirstMigrationJournalOrPartial();

  it("rolls back the required initial epoch INSERT with baseline DDL and journal, then reopens", testRollsBackTheRequiredInitialEpochINSERTWithBaselineDDLAnd);

  it("rolls back an interrupted initial epoch INSERT and creates a complete baseline on reopen", testRollsBackAnInterruptedInitialEpochINSERTAndCreatesAComplete);

  it("prevents SQL when snapshot publication fails", () => {
    const data = fixture(true);
    writeFileSync(join(data.directory, "snapshots"), "blocked snapshot directory");
    const before = businessRows(data.database.$client);
    expect(() => runMigrations(data.database.$client, data.path, loadTestMigrationAssets())).toThrow(/EEXIST/);
    expect(authenticateMigrationPrefix(data.database.$client).appliedCount).toBe(COMMITTED_MIGRATIONS);
    expect(businessRows(data.database.$client)).toEqual(before);
    expect(data.database.$client.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("stops migration after a published snapshot retention failure and reports the retained file", testStopsMigrationAfterAPublishedSnapshotRetentionFailureAndReportsThe);

  it("recovers the prior committed prefix after a process exits inside the migration transaction", testRecoversThePriorCommittedPrefixAfterAProcessExitsInsideThe);

  it("resolves committed assets from the source module when cwd is unrelated", () => {
    const directory = mkdtempSync(join(tmpdir(), "story81-assets-cwd-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const source = new URL("./migration-assets.ts", import.meta.url).href;
    const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "-e", `const m = await import(${JSON.stringify(source)}); process.stdout.write(m.currentReleaseSchemaVersion());`], { cwd: directory, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(currentReleaseSchemaVersion());
  });
});

function registerDoesNotLeaveTheFirstMigrationJournalOrPartial() {
  it("does not leave the first migration journal or partial DDL on baseline failure", () => {
    const database = new Database(":memory:");
    try {
      const baseline = loadMigrationAssets()[0]!;
      expect(() => runMigrations(database, ":memory:", [{ ...baseline, sql: [...baseline.sql, "INVALID BASELINE SQL"] }])).toThrow("migration 1 failed");
      expect(database.prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all()).toEqual([]);
      expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    } finally { database.close(); }
  });
}

function registerInvalidFk() {
  it.each(["THIS IS NOT SQL", "INSERT INTO cards (id, story_map_id, key, level, title, position, created_at, updated_at) VALUES ('invalid-fk', 'absent-map', 'X', 'story', 'Invalid', 0, 'now', 'now')"])("rolls back SQL, journal and FK failures atomically: %s", (statement) => {
    const data = fixture(true);
    const before = businessRows(data.database.$client);
    expect(() => runMigrations(data.database.$client, data.path, failingAssets(statement))).toThrow("Last usable snapshot:");
    expect(data.database.$client.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(data.database.$client.inTransaction).toBe(false);
    expect(businessRows(data.database.$client)).toEqual(before);
    expect(authenticateMigrationPrefix(data.database.$client).appliedCount).toBe(COMMITTED_MIGRATIONS);
    expect(data.database.$client.prepare("SELECT name FROM sqlite_schema WHERE name = 'test_projects_name_idx'").get()).toBeUndefined();
    expect(listRestorePoints(new DatabaseHandle(data.database))).toHaveLength(1);
  });
}

function registerRefusesSWithoutChangingBytesPersistentPragmasOrBusiness() {
  it.each([
    ["prototype", 'DROP TABLE "__drizzle_migrations"', /prototype/],
    ["newer", `INSERT INTO "__drizzle_migrations" VALUES (${COMMITTED_MIGRATIONS + 1}, '${"a".repeat(64)}', 9999999999999)`, /newer or unknown/],
    ["divergent hash", `UPDATE "__drizzle_migrations" SET hash = '${"b".repeat(64)}'`, /divergent/],
    ["timestamp", 'UPDATE "__drizzle_migrations" SET created_at = 1', /malformed/],
    ["journal gap", 'UPDATE "__drizzle_migrations" SET id = id + 100', /malformed/],
    ["empty journal", 'DELETE FROM "__drizzle_migrations"', /empty migration journal/],
    ["malformed journal", 'ALTER TABLE "__drizzle_migrations" ADD COLUMN untrusted TEXT', /malformed migration journal/],
    ["schema drift", 'DROP INDEX cards_parent_id_idx', /inconsistent schema/],
    ["unknown table", 'CREATE TABLE unknown_domain (id TEXT)', /inconsistent schema/]
  ])("refuses %s without changing bytes, persistent pragmas or business values", (_label, mutation, error) => {
    const data = fixture(true);
    data.database.$client.pragma("wal_checkpoint(TRUNCATE)");
    data.database.$client.pragma("journal_mode = DELETE");
    data.database.$client.exec(mutation as string);
    const beforeRows = businessRows(data.database.$client);
    data.database.$client.close();
    const before = readFileSync(data.path);
    expect(() => openStoryMapperDb(data.path)).toThrow(error as RegExp);
    expect(readFileSync(data.path)).toEqual(before);
    expect(existsSync(`${data.path}-wal`)).toBe(false);
    const raw = new Database(data.path, { readonly: true });
    try { expect(businessRows(raw)).toEqual(beforeRows); expect(raw.pragma("journal_mode", { simple: true })).toBe("delete"); } finally { raw.close(); }
  });
}

function registerRefusesMigratedSBeforeChangingTheSupportedSource() {
  it.each(["missing epoch", "invalid epoch", "PlanState ownership"])("refuses migrated %s before changing the supported source", (damage) => {
    const data = fixture(true);
    const other = new UnitOfWork(new DatabaseHandle(data.database)).run(MIGRATION_ACTOR, ({ repository }) => repository.createProject({ name: "Other Project" }));
    const statement = damage === "missing epoch" ? "DELETE FROM database_metadata" : damage === "invalid epoch" ? "UPDATE database_metadata SET epoch = ' '" : `UPDATE plan_states SET project_id = '${other.id}'`;
    const assets = failingAssets(statement);
    const before = businessRows(data.database.$client);
    data.database.$client.close();
    const original = readFileSync(data.path);
    let failure: unknown;
    try { openStoryMapperDb(data.path, undefined, assets); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ message: expect.stringMatching(damage === "PlanState ownership" ? /owning|ownership|Project/i : /epoch/i) });
    expect((failure as Error).message).toContain("temporary candidate and its snapshots were removed");
    expect(readFileSync(data.path)).toEqual(original);
    const raw = new Database(data.path, { readonly: true });
    try { expect(businessRows(raw)).toEqual(before); expect(authenticateMigrationPrefix(raw).appliedCount).toBe(COMMITTED_MIGRATIONS); }
    finally { raw.close(); }
    expect(existsSync(join(data.directory, "snapshots"))).toBe(false);
  });
}

function registerPublishesAPriorStateRestorePointForEveryPending() {
  it("publishes a prior-state restore point for every pending migration of a multi-step upgrade", () => {
    const data = fixture(true);
    const assets = jsonMigrationAssets();
    runMigrations(data.database.$client, data.path, assets);
    const points = listRestorePoints(new DatabaseHandle(data.database));
    expect(points.map((point) => point.class)).toEqual(["pre-migration", "pre-migration"]);
    expect(points.map((point) => point.schemaVersion).sort()).toEqual([COMMITTED_MIGRATIONS, COMMITTED_MIGRATIONS + 1].map((count) => currentReleaseSchemaVersion(assets.slice(0, count))).sort());
  });
}

function testMigratesSupportedOlderJSONColumnLayoutsBeforeCurrentValidation() {
  const data = fixture(true);
  const assets = jsonMigrationAssets();
  const before = businessRows(data.database.$client);
  runMigrations(data.database.$client, data.path, assets.slice(0, COMMITTED_MIGRATIONS + 1));
  data.database.$client.close();
  const reopened = openStoryMapperDb(data.path, undefined, assets);
  try {
    expect(businessRows(reopened.$client)).toEqual(before);
    expect(authenticateMigrationPrefix(reopened.$client, assets).appliedCount).toBe(COMMITTED_MIGRATIONS + 2);
    expect(listRestorePoints(new DatabaseHandle(reopened))).toHaveLength(2);
  } finally { reopened.$client.close(); }
}

function testRefusesAnInvalidMigratedJSONTargetBeforeChangingAnOlderSource() {
  const data = fixture(true);
  const assets = failingAssets("UPDATE product_contexts SET key_features_schema_version = 99");
  const before = businessRows(data.database.$client);
  data.database.$client.close();
  const original = readFileSync(data.path);
  expect(() => openStoryMapperDb(data.path, undefined, assets)).toThrow(/version/i);
  expect(readFileSync(data.path)).toEqual(original);
  const raw = new Database(data.path, { readonly: true });
  try {
    expect(businessRows(raw)).toEqual(before);
    expect(authenticateMigrationPrefix(raw).appliedCount).toBe(COMMITTED_MIGRATIONS);
  } finally { raw.close(); }
  expect(existsSync(join(data.directory, "snapshots"))).toBe(false);
}

function testReportsRemovedTemporaryPreflightSnapshotsTruthfullyWhenMigrationExecutionFails() {
  const data = fixture(true);
  data.database.$client.close();
  const original = readFileSync(data.path);
  let failure: unknown;
  try { openStoryMapperDb(data.path, undefined, failingAssets("INVALID SUCCESSOR SQL")); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ message: expect.stringContaining("original database is unchanged") });
  expect((failure as Error).message).toContain("temporary candidate and its snapshots were removed");
  expect((failure as Error).message).not.toContain("Last usable snapshot");
  expect(failure).not.toHaveProperty("details.retainedRestorePoint");
  expect(readFileSync(data.path)).toEqual(original);
  expect(existsSync(join(data.directory, "snapshots"))).toBe(false);
}

function testCreatesTheGeneratedBaselineWithActualChecksIndexesDefaultsAndA() {
  const data = fixture(true);
  const sqlite = data.database.$client;
  expect(authenticateMigrationPrefix(sqlite)).toEqual({ appliedCount: COMMITTED_MIGRATIONS, schemaVersion: currentReleaseSchemaVersion() });
  expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  expect(() => sqlite.prepare("INSERT INTO database_metadata VALUES (2, 'invalid')").run()).toThrow("database_metadata_singleton");
  expect(() => sqlite.prepare("UPDATE external_refs SET system = 'Invalid'").run()).toThrow("external_refs_system_valid");
  expect(() => sqlite.prepare("UPDATE external_refs SET external_id = ' padded '").run()).toThrow("external_refs_external_id_valid");
  expect(() => sqlite.prepare("UPDATE external_refs SET synced_version = 0").run()).toThrow("external_refs_synced_version_positive");
  expect(() => sqlite.prepare("UPDATE card_source_links SET kind = 'invalid'").run()).toThrow("card_source_links_kind_valid");
  expect(() => sqlite.prepare("UPDATE cards SET version = 0").run()).toThrow("cards_version_positive");
  expect(() => sqlite.prepare("UPDATE product_contexts SET key_features_schema_version = 0").run()).toThrow("key_features_json_version_valid");
  expect(() => sqlite.prepare("UPDATE change_sets SET approval_schema_version = 1").run()).toThrow("approval_json_version_valid");
  expect(sqlite.prepare("PRAGMA index_list(external_refs)").all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "external_refs_work_item_identity_idx", unique: 1, partial: 1 })]));
  expect(sqlite.prepare("PRAGMA table_info(cards)").all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "status", dflt_value: "'todo'" }), expect.objectContaining({ name: "version", dflt_value: "1" })]));
  const before = businessRows(sqlite);
  sqlite.close();
  const reopened = openStoryMapperDb(data.path);
  try { expect(businessRows(reopened.$client)).toEqual(before); } finally { reopened.$client.close(); }
}

function testPreservesPopulatedValuesAndCountsInEveryTableThroughAProtected() {
  const data = fixture(true);
  const before = businessRows(data.database.$client);
  expect(Object.keys(before)).toHaveLength(38);
  for (const [table, rows] of Object.entries(before)) expect(rows.length, table).toBeGreaterThan(0);
  const assets = loadTestMigrationAssets();
  expect(assets.at(-1)!.sql.join("\n")).toContain('DROP TABLE `projects`');
  runMigrations(data.database.$client, data.path, assets);
  expect(data.database.$client.pragma("foreign_keys", { simple: true })).toBe(1);
  expect(businessRows(data.database.$client)).toEqual(before);
  for (const table of ["projects", "project_settings", "ai_function_templates"]) expect(businessRows(data.database.$client)[table]).toEqual(before[table]);
  expect(authenticateMigrationPrefix(data.database.$client, assets)).toEqual({ appliedCount: COMMITTED_MIGRATIONS + 1, schemaVersion: currentReleaseSchemaVersion(assets) });
  expect(data.database.$client.prepare("SELECT name FROM sqlite_schema WHERE name = 'test_projects_name_idx'").get()).toBeDefined();
  const points = listRestorePoints(new DatabaseHandle(data.database));
  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({ class: "pre-migration", schemaVersion: currentReleaseSchemaVersion() });
  const snapshot = new Database(join(data.directory, "snapshots", points[0]!.fileName), { readonly: true });
  try { expect(businessRows(snapshot)).toEqual(before); expect(authenticateMigrationPrefix(snapshot).appliedCount).toBe(COMMITTED_MIGRATIONS); } finally { snapshot.close(); }
  data.database.$client.close();
  const reopened = openStoryMapperDb(data.path, undefined, assets);
  try {
    expect(businessRows(reopened.$client)).toEqual(before);
    const repository = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(repository.getCard(data.ids!.cardId)?.title).toBe("Preserved Card");
    expect(repository.listPlanStates(data.ids!.storyMapId)).toHaveLength(1);
    expect(repository.listSourcePlanBaselines(data.ids!.storyMapId)[0]?.entries).toHaveLength(1);
  } finally { reopened.$client.close(); }
}

function testRollsBackTheRequiredInitialEpochINSERTWithBaselineDDLAnd() {
  const directory = mkdtempSync(join(tmpdir(), "story81-epoch-failure-"));
  const path = join(directory, "storymapper.sqlite");
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const database = new Database(path);
  const prepare = database.prepare.bind(database);
  let observed: { inTransaction: boolean; journal: unknown } | undefined;
  vi.spyOn(database, "prepare").mockImplementation((sql) => {
    const statement = prepare(sql);
    if (sql.startsWith("INSERT INTO database_metadata")) vi.spyOn(statement, "run").mockImplementation(() => {
      observed = { inTransaction: database.inTransaction, journal: prepare("SELECT count(*) AS count FROM __drizzle_migrations").get() };
      throw new Database.SqliteError("Injected initial epoch INSERT failure", "SQLITE_CONSTRAINT");
    });
    return statement;
  });
  try {
    expect(() => runMigrations(database, path)).toThrow("migration 1 failed");
    expect(observed).toEqual({ inTransaction: true, journal: { count: 0 } });
    expect(database.prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all()).toEqual([]);
  } finally { database.close(); }
  const reopened = openStoryMapperDb(path);
  try { expect(authenticateMigrationPrefix(reopened.$client).appliedCount).toBe(COMMITTED_MIGRATIONS); expect(reopened.$client.prepare("SELECT epoch FROM database_metadata").get()).toEqual({ epoch: expect.any(String) }); }
  finally { reopened.$client.close(); }
}

function testRollsBackAnInterruptedInitialEpochINSERTAndCreatesAComplete() {
  const directory = mkdtempSync(join(tmpdir(), "story81-epoch-interrupt-"));
  const path = join(directory, "storymapper.sqlite");
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), resolve(root, "packages/db/src/test-fixtures/baseline-interrupt.ts"), path], { cwd: root, encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: resolve(root, "tsconfig.base.json") } });
  expect(result.status, result.stderr).toBe(87);
  const raw = new Database(path);
  try { expect(raw.prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all()).toEqual([]); }
  finally { raw.close(); }
  const reopened = openStoryMapperDb(path);
  try { expect(authenticateMigrationPrefix(reopened.$client).appliedCount).toBe(COMMITTED_MIGRATIONS); expect(reopened.$client.prepare("SELECT epoch FROM database_metadata").get()).toEqual({ epoch: expect.any(String) }); }
  finally { reopened.$client.close(); }
}

function testStopsMigrationAfterAPublishedSnapshotRetentionFailureAndReportsThe() {
  const data = fixture(true);
  for (let index = 0; index < 10; index++) publishRawRestorePoint(data.database.$client, "pre-migration", currentReleaseSchemaVersion());
  const before = businessRows(data.database.$client);
  vi.mocked(unlinkSync).mockImplementationOnce(() => { throw new Error("Injected snapshot retention failure"); });
  let failure: unknown;
  try { runMigrations(data.database.$client, data.path, loadTestMigrationAssets()); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ message: "Restore point published, but retention failed.", details: { retainedRestorePoint: expect.any(String), retainedPreparedEffects: [] } });
  const retained = (failure as { details: { retainedRestorePoint: string } }).details.retainedRestorePoint;
  expect(existsSync(join(data.directory, "snapshots", retained))).toBe(true);
  expect(authenticateMigrationPrefix(data.database.$client).appliedCount).toBe(COMMITTED_MIGRATIONS);
  expect(businessRows(data.database.$client)).toEqual(before);
  expect(data.database.$client.pragma("foreign_keys", { simple: true })).toBe(1);
}

function testRecoversThePriorCommittedPrefixAfterAProcessExitsInsideThe() {
  const data = fixture(true);
  const before = businessRows(data.database.$client);
  data.database.$client.close();
  const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), resolve(root, "packages/db/src/test-fixtures/migration-interrupt.ts"), data.path], { cwd: root, encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: resolve(root, "tsconfig.base.json") } });
  expect(result.status, result.stderr).toBe(87);
  const reopened = openStoryMapperDb(data.path);
  try {
    expect(businessRows(reopened.$client)).toEqual(before);
    expect(authenticateMigrationPrefix(reopened.$client).appliedCount).toBe(COMMITTED_MIGRATIONS);
    expect(reopened.$client.prepare("SELECT name FROM sqlite_schema WHERE name = 'test_projects_name_idx'").get()).toBeUndefined();
    expect(listRestorePoints(new DatabaseHandle(reopened))).toHaveLength(1);
  } finally { reopened.$client.close(); }
}

it("upgrades populated committed-prefix Cards, legacy mappings and pending mapping proposals", () => {
  const directory = mkdtempSync(join(tmpdir(), "dor-legacy-upgrade-")), path = join(directory, "storymapper.sqlite");
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const legacy = new Database(path), prefix = loadMigrationAssets().slice(0, 3);
  const projectId = randomUUID(), mapId = randomUUID(), cardId = randomUUID(), connectionId = randomUUID(), time = "2026-11-04T00:00:00.000Z";
  runMigrations(legacy, path, prefix);
  legacy.prepare("INSERT INTO projects (id,name,local_path,created_at) VALUES (?,?,?,?)").run(projectId, "Legacy Project", directory, time);
  legacy.prepare("INSERT INTO project_settings (project_id,epoch,updated_at) VALUES (?,?,?)").run(projectId, randomUUID(), time);
  legacy.prepare("INSERT INTO story_maps (id,project_id,name,created_at,updated_at) VALUES (?,?,?,?,?)").run(mapId, projectId, "Legacy Map", time, time);
  legacy.prepare("INSERT INTO cards (id,story_map_id,key,level,title,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(cardId, mapId, "LSM-1", "story", "Preserved legacy Card", 0, time, time);
  const mappings = [{ level: "story", issueType: "Task" }];
  legacy.prepare("INSERT INTO connector_connections (id,project_id,provider,name,auth_mode,owner,repository,issue_type_mapping_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(connectionId, projectId, "github", "Legacy", "token", "owner", "repo", JSON.stringify(mappings), time, time);
  const approval = JSON.stringify({ actor: MIGRATION_ACTOR, approvedAt: time, operationsHash: "a".repeat(64), selectedOperationIds: ["mapping"] });
  const operation = JSON.stringify([{ operationId: "mapping", op: "update", entity: "connectorConnection", entityId: connectionId, after: { issueTypeMapping: mappings } }]);
  const insert = legacy.prepare("INSERT INTO change_sets (id,project_id,title,source,status,operations_schema_version,operations_json,approval_json,approval_schema_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  const ids = new Map(["proposed", "approved", "conflict", "applied", "unrelated"].map((status) => [status, randomUUID()]));
  for (const status of ["proposed", "approved", "conflict", "applied"]) insert.run(ids.get(status), projectId, "Legacy mapping", "mcp", status, OPERATIONS_SCHEMA_VERSION, operation, approval, 1, time);
  insert.run(ids.get("unrelated"), projectId, "Unrelated proposal", "mcp", "proposed", OPERATIONS_SCHEMA_VERSION, "[]", null, null, time);
  expect(authenticateMigrationPrefix(legacy).appliedCount).toBe(prefix.length);
  expect((legacy.pragma("table_info(cards)") as Array<{ name: string }>).some((column) => column.name === "card_type")).toBe(false);
  legacy.close();
  const upgraded = openStoryMapperDb(path);
  try {
    expect(authenticateMigrationPrefix(upgraded.$client).appliedCount).toBe(COMMITTED_MIGRATIONS);
    expect(upgraded.$client.prepare("SELECT title,card_type FROM cards WHERE id = ?").get(cardId)).toEqual({ title: "Preserved legacy Card", card_type: null });
    expect(upgraded.$client.prepare("SELECT issue_type_mapping_json FROM connector_connections WHERE id = ?").get(connectionId)).toEqual({ issue_type_mapping_json: "[]" });
    for (const id of ["proposed", "approved", "conflict"]) expect(upgraded.$client.prepare("SELECT status,approval_json,approval_schema_version FROM change_sets WHERE id = ?").get(ids.get(id))).toEqual({ status: "stale", approval_json: null, approval_schema_version: null });
    expect(upgraded.$client.prepare("SELECT status FROM change_sets WHERE id = ?").get(ids.get("applied"))).toEqual({ status: "applied" });
    expect(upgraded.$client.prepare("SELECT status FROM change_sets WHERE id = ?").get(ids.get("unrelated"))).toEqual({ status: "proposed" });
    expect(upgraded.$client.prepare("SELECT count(*) AS count FROM card_review_records").get()).toEqual({ count: 0 });
  } finally { upgraded.$client.close(); }
});
