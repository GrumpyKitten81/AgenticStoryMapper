import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import Database from "better-sqlite3";
import { changeSetSchema, OPERATIONS_SCHEMA_VERSION, type ChangeOperation } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, openExistingStoryMapperDb, StoryMapperRepository, UnitOfWork, createRestorePoint, restoreProject } from "@storymapper/db";
import { prepareImportedDatabase, archiveDevelopmentSchemaVersion } from "@storymapper/db/archive-database";
import { transitionStoredOperations, validateStoredOperations } from "@storymapper/db/operation-schema-transition";
import { databaseSchemaVersion, validateRestoreDatabase } from "@storymapper/db/restore-validation";

const ACTOR = { actorType: "human", actorId: "schema-transition-fixture" } as const;
const cleanup: Array<() => void> = [];
const HISTORICAL_PAYLOAD = '[ { "retiredOperation" : "preserve original bytes" } ]';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-operation-version-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const uow = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const project = uow.run(ACTOR, ({ repository: tx }) => tx.createProject({ name: "Schema transition" }));
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, path, handle, uow, repository, project };
}

function oldProposal(data: ReturnType<typeof fixture>, status = "proposed", undone = false) {
  const id = randomUUID();
  data.handle.current.$client.prepare("INSERT INTO change_sets (id, project_id, title, source, status, operations_schema_version, operations_json, undone_by_restore, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, data.project.id, "Historical proposal", "mcp", status, 1, HISTORICAL_PAYLOAD, Number(undone), new Date().toISOString());
  return id;
}

afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

it("transitions all incompatible active statuses at startup while preserving history and payload bytes", () => {
  const data = fixture();
  const active = ["proposed", "approved", "rejected", "conflict"].map((status) => oldProposal(data, status));
  const applied = oldProposal(data, "applied");
  const undone = oldProposal(data, "approved", true);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  for (const id of active) {
    expect(data.repository.getChangeSet(id)).toMatchObject({ status: "stale", operationsSchemaVersion: 1 });
    expect(() => data.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(id, "approved"))).toThrow("resubmission and fresh approval");
    expect(() => data.uow.run(ACTOR, ({ repository }) => repository.applyChangeSet(id))).toThrow("resubmission and fresh approval");
  }
  expect(data.repository.getChangeSet(applied)).toMatchObject({ status: "applied", operations: JSON.parse(HISTORICAL_PAYLOAD) });
  expect(data.repository.getChangeSet(undone)).toMatchObject({ status: "approved", undoneByRestore: true });
  for (const id of [applied, undone]) expect(() => data.uow.run(ACTOR, ({ repository }) => repository.applyChangeSet(id))).toThrow();
  expect(data.handle.current.$client.prepare("SELECT DISTINCT operations_json, operations_schema_version FROM change_sets").all()).toEqual([{ operations_json: HISTORICAL_PAYLOAD, operations_schema_version: 1 }]);
  expect(data.repository.listActivity(data.project.id)).toHaveLength(1);
  const fresh = data.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: data.project.id, title: "Resubmitted", source: "mcp", operations: [], createdAt: new Date().toISOString() }));
  expect(fresh).toMatchObject({ status: "proposed", operationsSchemaVersion: OPERATIONS_SCHEMA_VERSION });
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.applyChangeSet(fresh.id))).toThrow("requires recorded approval");
});

it("refuses invalid schema tags, statuses, history flags and current payloads without partial staleness", () => {
  const data = fixture();
  const id = oldProposal(data);
  const invalid = oldProposal(data, "invalid-status");
  expect(() => transitionStoredOperations(data.handle.current.$client)).toThrow("schema, status or version");
  expect(data.repository.getChangeSet(id)?.status).toBe("proposed");
  const update = data.handle.current.$client.prepare("UPDATE change_sets SET status = ?, operations_schema_version = ?, undone_by_restore = ? WHERE id = ?");
  for (const version of [0, -1, 1.5]) {
    update.run("proposed", version, 0, invalid);
    expect(() => validateStoredOperations(data.handle.current.$client)).toThrow("operation version");
  }
  update.run("proposed", 1, 2, invalid);
  expect(() => validateStoredOperations(data.handle.current.$client)).toThrow("history flag");
  update.run("approved", OPERATIONS_SCHEMA_VERSION, 0, invalid);
  expect(() => validateStoredOperations(data.handle.current.$client)).toThrow("current-schema");
  expect(changeSetSchema.safeParse({ ...data.repository.getChangeSet(id), operationsSchemaVersion: 1 }).success).toBe(false);
});

it("transitions old operations when publishing a restored current-DDL snapshot", async () => {
  const data = fixture();
  const id = oldProposal(data, "approved");
  const historical = oldProposal(data, "applied");
  const point = createRestorePoint(data.handle, "manual");
  await restoreProject(data.handle, data.project.id, point.fileName, ACTOR);
  expect(data.repository.getChangeSet(id)).toMatchObject({ status: "stale", operationsSchemaVersion: 1 });
  expect(data.repository.getChangeSet(historical)).toMatchObject({ status: "applied", operationsSchemaVersion: 1 });
  expect(data.handle.current.$client.prepare("SELECT DISTINCT operations_json FROM change_sets").all()).toEqual([{ operations_json: HISTORICAL_PAYLOAD }]);
});

it("validates old operations in current-DDL archives and transitions them at import publication", () => {
  const data = fixture();
  const id = oldProposal(data, "rejected");
  const historical = oldProposal(data, "applied");
  const schemaVersion = databaseSchemaVersion(data.handle.current.$client);
  expect(schemaVersion).toBe(archiveDevelopmentSchemaVersion());
  validateRestoreDatabase(data.handle.current.$client, schemaVersion);
  data.handle.current.$client.close();
  prepareImportedDatabase(data.path, data.directory, data.project.id, ACTOR);
  data.handle.current = openExistingStoryMapperDb(data.path);
  expect(data.repository.getChangeSet(id)).toMatchObject({ status: "stale", operationsSchemaVersion: 1 });
  expect(data.repository.getChangeSet(historical)).toMatchObject({ status: "applied", operationsSchemaVersion: 1 });
  expect(data.handle.current.$client.prepare("SELECT DISTINCT operations_json FROM change_sets").all()).toEqual([{ operations_json: HISTORICAL_PAYLOAD }]);
});

it("refuses incompatible executable payloads before writes and requires approval of a fresh current proposal", () => {
  const data = fixture();
  const map = data.uow.run(ACTOR, ({ repository }) => repository.createStoryMap({ projectId: data.project.id, name: "Versioned map" }));
  const card = data.uow.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: map.id, level: "activity", title: "Reviewed title" }));
  const operations: ChangeOperation[] = [{ operationId: "rename-card", op: "update", entity: "card", entityId: card.id, baseVersion: card.version, after: { title: "Freshly approved title" } }];
  const outdated = oldProposal(data, "approved");
  const future = oldProposal(data, "approved");
  const update = data.handle.current.$client.prepare("UPDATE change_sets SET operations_schema_version = ?, operations_json = ? WHERE id = ?");
  update.run(1, JSON.stringify(operations), outdated);
  update.run(OPERATIONS_SCHEMA_VERSION + 1, JSON.stringify(operations), future);
  expect(() => transitionStoredOperations(data.handle.current.$client)).toThrow("Future active");
  expect(data.repository.getChangeSet(outdated)?.status).toBe("approved");
  data.handle.current.$client.prepare("UPDATE change_sets SET status = 'stale' WHERE id = ?").run(future);
  transitionStoredOperations(data.handle.current.$client);
  const activityBefore = data.repository.listActivity(data.project.id);
  const cardBefore = data.repository.getCard(card.id);
  for (const id of [outdated, future]) {
    expect(() => data.uow.run(ACTOR, ({ repository }) => repository.applyChangeSet(id))).toThrow("fresh approval");
    expect(() => data.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(id, "approved"))).toThrow("fresh approval");
  }
  expect(data.repository.getCard(card.id)).toEqual(cardBefore);
  expect(data.repository.listActivity(data.project.id)).toEqual(activityBefore);
  const fresh = data.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({
    id: randomUUID(), projectId: data.project.id, title: "Current resubmission", source: "mcp", operations,
    createdAt: new Date().toISOString()
  }));
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.applyChangeSet(fresh.id))).toThrow("requires recorded approval");
  data.uow.run(ACTOR, ({ repository }) => { repository.updateChangeSetStatus(fresh.id, "approved"); repository.applyChangeSet(fresh.id); });
  const applied = data.repository.getCard(card.id);
  expect(applied?.title).toBe("Freshly approved title");
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.applyChangeSet(fresh.id))).toThrow("permanently historical");
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(fresh.id, "approved"))).toThrow("cannot be changed");
  expect(data.repository.getCard(card.id)).toEqual(applied);
});

it("rejects invalid stored operation data and exact DDL mismatches before import publication", () => {
  const data = fixture();
  const id = oldProposal(data);
  const schemaVersion = databaseSchemaVersion(data.handle.current.$client);
  const update = data.handle.current.$client.prepare("UPDATE change_sets SET operations_json = ?, operations_schema_version = ?, status = ? WHERE id = ?");
  for (const [payload, version, status] of [["{", 1, "proposed"], ["{}", 1, "proposed"], ["[]", 0, "approved"], ["[]", 1, "invalid"]] as const) {
    update.run(payload, version, status, id);
    expect(() => validateRestoreDatabase(data.handle.current.$client, schemaVersion)).toThrow();
  }
  update.run(HISTORICAL_PAYLOAD, 1, "proposed", id);
  data.handle.current.$client.exec("CREATE INDEX incompatible_operation_index ON change_sets(status)");
  expect(() => validateRestoreDatabase(data.handle.current.$client, schemaVersion)).toThrow("inconsistent schema");
  expect(data.repository.getChangeSet(id)?.status).toBe("proposed");
});

it("rolls back import metadata and audit when operation-data transition fails", () => {
  const data = fixture();
  const active = oldProposal(data);
  const invalid = oldProposal(data, "invalid");
  const before = data.handle.current.$client.prepare("SELECT local_path FROM projects WHERE id = ?").get(data.project.id);
  const epoch = data.repository.getSafetySettings(data.project.id).epoch;
  const activity = data.repository.listActivity(data.project.id);
  data.handle.current.$client.close();
  expect(() => prepareImportedDatabase(data.path, data.directory, data.project.id, ACTOR)).toThrow("schema, status or version");
  expect(() => openExistingStoryMapperDb(data.path)).toThrow("schema, status or version");
  const retained = new Database(data.path, { readonly: true });
  try {
    expect(retained.prepare("SELECT local_path FROM projects WHERE id = ?").get(data.project.id)).toEqual(before);
    expect(retained.prepare("SELECT epoch FROM project_settings WHERE project_id = ?").get(data.project.id)).toEqual({ epoch });
    expect(retained.prepare("SELECT COUNT(*) AS count FROM activity_events").get()).toEqual({ count: activity.length });
    expect(retained.prepare("SELECT id, status FROM change_sets ORDER BY rowid").all()).toEqual([
      { id: active, status: "proposed" }, { id: invalid, status: "invalid" }
    ]);
  } finally { retained.close(); }
});

it("makes schema10 pending proposals stale after the strict Release metadata schema bump", () => {
  const data = fixture();
  const pending = oldProposal(data, "approved");
  data.handle.current.$client.prepare("UPDATE change_sets SET operations_schema_version = 10 WHERE id = ?").run(pending);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect(OPERATIONS_SCHEMA_VERSION).toBe(12);
  expect(data.repository.getChangeSet(pending)).toMatchObject({ status: "stale", operationsSchemaVersion: 10, operations: JSON.parse(HISTORICAL_PAYLOAD) });
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.applyChangeSet(pending))).toThrow("resubmission and fresh approval");
});
