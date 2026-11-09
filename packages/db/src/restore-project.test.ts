import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreProjectResultSchema, type RestoreProjectResult } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork, createRestorePoint, developmentSchemaVersion, listRestorePoints, restoreProject } from "@storymapper/db";
import { loadTestMigrationAssets } from "@storymapper/db/test-fixtures/migration-assets";
import { currentReleaseSchemaVersion, loadMigrationAssets, releaseSchemaVersion } from "@storymapper/db/migration-assets";
import { runMigrations } from "@storymapper/db/migration-runner";
import { prepareRestoredHistory } from "@storymapper/db/restore-history";
import { publishPreparedRestore, publishRollbackDecision } from "@storymapper/db/restore-recovery";
import { publishRawRestorePoint } from "@storymapper/db/restore-points";
import { listRestorePointFiles, restorePointDatabaseId } from "@storymapper/db/restore-point-files";
import { resolveSqlitePath } from "@storymapper/db/sqlite-path";
import { exportAudit } from "@storymapper/server/application/export/export.use-cases";

const ACTOR = { actorType: "human", actorId: "restore-fixture" } as const;
const close: Array<() => void> = [];

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-restore-project-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const uow = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const project = uow.run(ACTOR, ({ repository: tx }) => tx.createProject({ name: "Restore fixture" }));
  const map = uow.run(ACTOR, ({ repository: tx }) => tx.createStoryMap({ projectId: project.id, name: "Restore fixture map" }));
  const created = uow.run(ACTOR, ({ repository: tx }) => tx.createCard({ storyMapId: map.id, level: "activity", title: "Before restore" }));
  const card = repository.getCard(created.id)!;
  close.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, path, handle, uow, repository, project, map, card };
}

function proposed(data: ReturnType<typeof fixture>) {
  return data.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({
    id: randomUUID(), projectId: data.project.id, title: "Restore proposal", source: "mcp", status: "proposed", createdAt: new Date().toISOString(),
    operations: [{ operationId: "fixture-operation-1", op: "update", entity: "card", entityId: data.card.id, baseVersion: data.card.version, after: { title: "After restore point" } }]
  }));
}

function prepared(data: ReturnType<typeof fixture>, point: RestoreProjectResult["restorePoint"]): RestoreProjectResult {
  const preRestorePoint = createRestorePoint(data.handle, "pre-restore");
  const result: RestoreProjectResult = { restorePoint: point, preRestorePoint, epoch: randomUUID(), githubLinks: [], attachmentsRetained: true, undoneActivityEvents: 0, undoneChangeSets: 0 };
  const path = `${data.path}.restoring`;
  copyFileSync(join(data.directory, "snapshots", point.fileName), path);
  const target = new Database(path);
  target.pragma("foreign_keys = ON");
  try { prepareRestoredHistory(data.handle.current.$client, target, data.project.id, ACTOR, result); }
  finally { target.close(); }
  publishPreparedRestore(path, developmentSchemaVersion(data.handle.current), result.epoch);
  return result;
}

function candidateSnapshots(data: ReturnType<typeof fixture>) {
  return listRestorePointFiles(join(data.directory, "snapshots"), restorePointDatabaseId(`${data.path}.restoring`));
}

afterEach(() => { vi.restoreAllMocks(); for (const cleanup of close.splice(0).reverse()) cleanup(); });

describe("recoverable human project restore", () => {
  it("retains runtime tool-call evidence across repeated actual restores without fictional Projects", testRetainsRuntimeToolCallEvidenceAcrossRepeatedActualRestoresWithoutFictional);
  it("restores committed WAL map state, preserves later same-ID ChangeSets and historical Project ownership, and accepts holder writes", testRestoresCommittedWALMapStatePreservesLaterSameIDChangeSetsAnd);

  it("reports new canonical identities and identity changes at the same id and leaves attachment files intact", testReportsNewCanonicalIdentitiesAndIdentityChangesAtTheSameId);

  it("rejects unknown, corrupt, mismatched actual schemas and agent attempts without protective snapshots or live changes", testRejectsUnknownCorruptMismatchedActualSchemasAndAgentAttemptsWithoutProtective);

  it("initializes one shared persisted epoch and changes it for every snapshot Project on restore", testInitializesOneSharedPersistedEpochAndChangesItForEverySnapshot);

  registerRefusesAnAlteredReleaseSchemaWithoutRepairingOrEnrolling();

  it("completes a fully prepared interrupted swap before normal opening, retaining epoch and audit exactly once", testCompletesAFullyPreparedInterruptedSwapBeforeNormalOpeningRetainingEpoch);

  registerRecoversASupportedOlderSMarkerBeforeProtectedForward();

  it("discards interrupted migrated candidate snapshots without touching active snapshots", testDiscardsInterruptedMigratedCandidateSnapshotsWithoutTouchingActiveSnapshots);

  registerRollsBackInterruptedSCandidatesBeforeOpeningAndPreserves();

  it("recognizes a completed interrupted rename and keeps the same final epoch and audit", testRecognizesACompletedInterruptedRenameAndKeepsTheSameFinalEpoch);

  it.each(["integrity", "foreign-keys", "schema", "audit"] as const)("refuses an already installed restore with invalid %s and keeps its completion marker", (failure) => {
    const data = fixture();
    const point = createRestorePoint(data.handle, "manual");
    prepared(data, point);
    data.handle.current.$client.close();
    renameSync(`${data.path}.restoring`, data.path);
    if (failure === "integrity") writeFileSync(data.path, Buffer.alloc(statSync(data.path).size));
    else {
      const installed = new Database(data.path);
      installed.pragma("foreign_keys = OFF");
      if (failure === "foreign-keys") installed.exec("UPDATE cards SET story_map_id = 'invalid-map'");
      if (failure === "schema") installed.exec("CREATE INDEX invalid_schema_index ON projects(name)");
      if (failure === "audit") installed.exec("DELETE FROM activity_events WHERE action = 'project.restored'");
      installed.close();
    }
    const logs: string[] = [];
    expect(() => openStoryMapperDb(data.path, (outcome) => logs.push(outcome))).toThrow();
    expect(logs).toEqual([]);
    expect(existsSync(`${data.path}.restoring.ready`)).toBe(true);
  });

  it("preserves genuinely crashed uncheckpointed WAL commits when startup publication fails and can retry the prepared restore", testPreservesGenuinelyCrashedUncheckpointedWALCommitsWhenStartupPublicationFailsAnd);
});

it("restores complete Customization template metadata and deleted defaults from an actual restore point", async () => {
  const data = fixture();
  const template = data.uow.run(ACTOR, ({ repository }) => repository.updateAiTemplate(data.project.id, "prd-to-map", {
    instructions: 'Reviewed "instructions"\nsecond line', arguments: [{ name: "evidence", description: "Required source", required: true }],
    examples: ['Example "quoted"\nline'], outputSchemaName: "ChangeSet"
  }));
  data.uow.run(ACTOR, ({ repository }) => repository.deleteAiTemplate(data.project.id, "personas"));
  const expected = data.repository.listAiTemplates(data.project.id);
  const point = createRestorePoint(data.handle, "manual");
  data.uow.run(ACTOR, ({ repository }) => {
    repository.updateAiTemplate(data.project.id, template.id, { instructions: "Later", arguments: [], examples: [], outputSchemaName: null });
    repository.createAiTemplate({ projectId: data.project.id, id: "personas", name: "Recreated", instructions: "Later default", arguments: [], examples: [] });
  });
  expect(data.repository.listAiTemplates(data.project.id)).not.toEqual(expected);
  await restoreProject(data.handle, data.project.id, point.fileName, ACTOR);
  expect(data.repository.getAiTemplate(data.project.id, template.id)).toEqual(template);
  expect(data.repository.getAiTemplate(data.project.id, "personas")).toBeUndefined();
  expect(data.repository.listAiTemplates(data.project.id)).toEqual(expected);
});

it("migrates an older supported Restore copy, preserves source bytes and publishes the target schema and new epoch", async () => {
  const data = fixture();
  const point = createRestorePoint(data.handle, "manual");
  const source = join(data.directory, "snapshots", point.fileName);
  const hash = () => createHash("sha256").update(readFileSync(source)).digest("hex");
  const originalHash = hash();
  const assets = loadTestMigrationAssets();
  runMigrations(data.handle.current.$client, data.path, assets);
  data.uow.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Current release edit" }));
  const previousEpoch = data.repository.getSafetySettings(data.project.id).epoch;
  const filesystem = await vi.importActual<typeof import("node:fs")>("node:fs");
  let publishedSchema: string | undefined;
  vi.mocked(renameSync).mockImplementation((source, destination) => {
    if (source === `${data.path}.restoring` && destination === data.path) publishedSchema = (JSON.parse(readFileSync(`${data.path}.restoring.ready`, "utf8")) as { schemaVersion: string }).schemaVersion;
    filesystem.renameSync(source, destination);
  });
  const result = await restoreProject(data.handle, data.project.id, point.fileName, ACTOR, assets);
  expect(hash()).toBe(originalHash);
  expect(result.restorePoint.schemaVersion).toBe(point.schemaVersion);
  expect(result.preRestorePoint.schemaVersion).toBe(currentReleaseSchemaVersion(assets));
  expect(publishedSchema).toBe(currentReleaseSchemaVersion(assets));
  expect(data.repository.getCard(data.card.id)).toEqual(data.card);
  expect(data.repository.getSafetySettings(data.project.id).epoch).toBe(result.epoch);
  expect(result.epoch).not.toBe(previousEpoch);
  expect(data.handle.current.$client.prepare("SELECT name FROM sqlite_schema WHERE name = 'test_projects_name_idx'").get()).toEqual({ name: "test_projects_name_idx" });
  expect(data.handle.current.$client.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({ count: loadMigrationAssets().length + 1 });
  expect(candidateSnapshots(data)).toEqual([]);
  expect(listRestorePoints(data.handle)).toContainEqual(result.preRestorePoint);
  expect(listRestorePoints(data.handle)).toContainEqual(point);
});

it("preserves the active database and original Restore bytes when the prepared copy migration fails", async () => {
  const data = fixture();
  const point = createRestorePoint(data.handle, "manual");
  const source = join(data.directory, "snapshots", point.fileName);
  const originalBytes = readFileSync(source);
  const assets = loadTestMigrationAssets();
  const successor = assets[assets.length - 1]!;
  const failing = [...assets.slice(0, -1), { ...successor, sql: [...successor.sql, "INSERT INTO missing_test_migration_table VALUES (1)"] }];
  data.uow.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Preserved current edit" }));
  const previous = data.handle.current;
  await expect(restoreProject(data.handle, data.project.id, point.fileName, ACTOR, failing)).rejects.toThrow("temporary candidate and its snapshots were removed");
  expect(data.handle.current).toBe(previous);
  expect(data.repository.getCard(data.card.id)?.title).toBe("Preserved current edit");
  expect(readFileSync(source)).toEqual(originalBytes);
  expect(candidateSnapshots(data)).toEqual([]);
  expect(listRestorePoints(data.handle)).toContainEqual(point);
  expect(existsSync(`${data.path}.restoring`)).toBe(false);
  expect(listRestorePoints(data.handle).filter((candidate) => candidate.class === "pre-restore")).toEqual([]);
});

it.each(["empty", "missing epoch", "blank epoch"])("refuses a %s Restore candidate without changing source bytes or the active database", async (damage) => {
  const data = fixture();
  const point = createRestorePoint(data.handle, "manual");
  const source = join(data.directory, "snapshots", point.fileName);
  const database = new Database(source);
  try {
    if (damage === "empty") {
      database.pragma("foreign_keys = OFF");
      const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*'").all() as Array<{ name: string }>;
      for (const { name } of tables) database.exec(`DROP TABLE "${name}"`);
      database.exec("VACUUM");
    } else if (damage === "missing epoch") database.exec("DELETE FROM database_metadata");
    else database.exec("UPDATE database_metadata SET epoch = ' '");
  } finally { database.close(); }
  const schema = damage === "empty" ? releaseSchemaVersion([]) : point.schemaVersion;
  const fileName = point.fileName.replace(`__${point.sizeBytes}__`, `__${statSync(source).size}__`).replace(point.schemaVersion, schema);
  const path = join(data.directory, "snapshots", fileName);
  if (fileName !== point.fileName) renameSync(source, path);
  const before = readFileSync(path);
  const active = data.handle.current;
  await expect(restoreProject(data.handle, data.project.id, fileName, ACTOR)).rejects.toThrow(damage === "empty" ? "no authenticated release journal" : "valid database epoch");
  expect(readFileSync(path)).toEqual(before);
  expect(data.handle.current).toBe(active);
  expect(data.repository.getCard(data.card.id)).toEqual(data.card);
  expect(listRestorePoints(data.handle).filter((entry) => entry.class === "pre-restore")).toEqual([]);
});

function registerRollsBackInterruptedSCandidatesBeforeOpeningAndPreserves() {
  it.each(["partial", "hash", "epoch", "audit", "journal", "json-version"] as const)("rolls back interrupted %s candidates before opening and preserves the original WAL state", async (failure) => {
    const data = fixture();
    const point = createRestorePoint(data.handle, "manual");
    data.uow.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Original stays" }));
    const path = `${data.path}.restoring`;
    if (failure === "partial") copyFileSync(join(data.directory, "snapshots", point.fileName), path);
    else {
      const result = prepared(data, point);
      if (failure === "hash") writeFileSync(path, Buffer.alloc(readFileSync(path).length));
      else {
        const candidate = new Database(path);
        if (failure === "epoch") candidate.prepare("UPDATE project_settings SET epoch = ?").run(randomUUID());
        else if (failure === "journal") candidate.prepare("UPDATE __drizzle_migrations SET hash = ?").run("0".repeat(64));
        else if (failure === "json-version") candidate.exec("UPDATE activity_events SET after_schema_version = 99 WHERE after_json IS NOT NULL");
        else candidate.exec("DELETE FROM activity_events WHERE action = 'project.restored'");
        candidate.close();
        rmSync(`${path}.ready`);
        publishPreparedRestore(path, point.schemaVersion, result.epoch);
      }
    }
    data.handle.current.$client.close();
    const logs: string[] = [];
    data.handle.current = openStoryMapperDb(data.path, (outcome) => logs.push(outcome));
    expect(logs[0]).toContain("rolled back");
    expect(data.repository.getCard(data.card.id)?.title).toBe("Original stays");
    expect(data.repository.listActivity().filter((event) => event.action === "project.restored")).toEqual([]);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(`${path}.ready`)).toBe(false);
    expect(data.handle.current.$client.pragma("foreign_key_check")).toEqual([]);
  });
}

function registerRecoversASupportedOlderSMarkerBeforeProtectedForward() {
  it.each(["ready", "completed", "rollback"] as const)("recovers a supported older %s marker before protected forward migration", (state) => {
    const data = fixture();
    const point = createRestorePoint(data.handle, "manual");
    const originalPoint = readFileSync(join(data.directory, "snapshots", point.fileName));
    data.uow.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Active before interrupted Restore" }));
    const oldEpoch = data.repository.getSafetySettings(data.project.id).epoch;
    const result = prepared(data, point);
    const path = `${data.path}.restoring`;
    const candidate = new Database(path);
    try { publishRawRestorePoint(candidate, "pre-migration", point.schemaVersion); }
    finally { candidate.close(); }
    expect(candidateSnapshots(data)).toHaveLength(1);
    data.handle.current.$client.close();
    if (state === "completed") renameSync(path, data.path);
    if (state === "rollback") publishRollbackDecision(path, result.preRestorePoint);
    const assets = loadTestMigrationAssets();
    const logs: string[] = [];
    data.handle.current = openStoryMapperDb(data.path, (message) => logs.push(message), assets);
    expect(logs[0]).toContain(state === "rollback" ? "rolled back" : "completed");
    expect(data.repository.getSafetySettings(data.project.id).epoch).toBe(state === "rollback" ? oldEpoch : result.epoch);
    expect(data.repository.getCard(data.card.id)?.title).toBe(state === "rollback" ? "Active before interrupted Restore" : data.card.title);
    expect(data.repository.listActivity().filter((event) => event.action === "project.restored")).toHaveLength(state === "rollback" ? 0 : 1);
    expect(data.handle.current.$client.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({ count: loadMigrationAssets().length + 1 });
    expect(data.handle.current.$client.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(listRestorePoints(data.handle).filter((entry) => entry.class === "pre-migration")).toHaveLength(1);
    expect(candidateSnapshots(data)).toEqual([]);
    expect(existsSync(`${path}.ready`)).toBe(false);
    expect(existsSync(`${path}.rollback`)).toBe(false);
    expect(readFileSync(join(data.directory, "snapshots", point.fileName))).toEqual(originalPoint);
  });
}

function registerRefusesAnAlteredReleaseSchemaWithoutRepairingOrEnrolling() {
  it("refuses an altered release schema without repairing or enrolling it", () => {
    const data = fixture();
    data.handle.current.$client.exec("DROP INDEX activity_events_external_ref_deletion_idx");
    data.handle.current.$client.close();
    const original = readFileSync(data.path);
    expect(() => openStoryMapperDb(data.path)).toThrow(/schema|inconsistent/i);
    expect(readFileSync(data.path)).toEqual(original);
    const database = new Database(data.path, { readonly: true });
    try { expect(database.prepare("SELECT name FROM sqlite_schema WHERE name = 'activity_events_external_ref_deletion_idx'").get()).toBeUndefined(); }
    finally { database.close(); }
  });
}

async function testRetainsRuntimeToolCallEvidenceAcrossRepeatedActualRestoresWithoutFictional() {
  const data = fixture();
  const metadata = { toolName: "ListProjects", inputHash: "a".repeat(64), outputHash: "b".repeat(64), outcome: "ok" as const, affectedEntityIds: [] };
  const runtimeActor = { actorType: "agent", actorId: "runtime-audit-host", mcpSessionId: "runtime-audit-session" } as const;
  const before = data.uow.run(runtimeActor, ({ repository }) => repository.logMcpToolCall({ projectId: null, metadata }));
  const point = createRestorePoint(data.handle, "manual");
  const after = data.uow.run(runtimeActor, ({ repository }) => repository.logMcpToolCall({ projectId: null, metadata }));
  const result = await restoreProject(data.handle, data.project.id, point.fileName, ACTOR);
  expect(result.undoneActivityEvents).toBe(1);
  expect(data.repository.listActivity().filter((event) => event.projectId === null)).toMatchObject([
    { id: before.id, undoneByRestore: false, actor: runtimeActor.actorId },
    { id: after.id, undoneByRestore: true, actor: runtimeActor.actorId }
  ]);
  const latest = data.uow.run(runtimeActor, ({ repository }) => repository.logMcpToolCall({ projectId: null, metadata }));
  await restoreProject(data.handle, data.project.id, point.fileName, ACTOR);
  expect(data.repository.listActivity().find((event) => event.id === latest.id)).toMatchObject({ projectId: null, undoneByRestore: true });
  expect(data.handle.current.$client.prepare("SELECT id, historical_stub FROM projects").all()).toEqual([{ id: data.project.id, historical_stub: 0 }]);
  expect(data.handle.current.$client.pragma("foreign_key_check")).toEqual([]);
}

async function testRestoresCommittedWALMapStatePreservesLaterSameIDChangeSetsAnd() {
  const data = fixture();
  data.handle.current.$client.pragma("wal_autocheckpoint = 0");
  const changeSet = proposed(data);
  const point = createRestorePoint(data.handle, "manual");
  const snapshotEventIds = new Set(data.repository.listActivity().map((event) => event.id));
  const beforeEpoch = data.repository.getSafetySettings(data.project.id).epoch;
  data.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"));
  data.uow.run({ actorType: "agent", actorId: "restore-agent", mcpSessionId: "restore-session" }, ({ repository }) => {
    repository.applyChangeSet(changeSet.id);
  });
  const laterProject = data.uow.run(ACTOR, ({ repository }) => repository.createProject({ name: "Later Project" }));
  const laterChangeSet = data.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: laterProject.id, title: "Later proposal", source: "ai", status: "proposed", operations: [], createdAt: changeSet.createdAt }));
  const expectedLaterEvents = data.repository.listActivity().filter((event) => !snapshotEventIds.has(event.id));
  const result = restoreProjectResultSchema.parse(await restoreProject(data.handle, data.project.id, point.fileName, ACTOR));
  expect(data.repository.getCard(data.card.id)).toEqual(data.card);
  expect(data.repository.getChangeSet(changeSet.id)).toMatchObject({ status: "applied", operations: changeSet.operations, createdAt: changeSet.createdAt, undoneByRestore: true });
  expect(data.repository.getChangeSet(laterChangeSet.id)).toMatchObject({ status: "proposed", undoneByRestore: true });
  expect(data.repository.listProjects().map((project) => project.id)).toEqual([data.project.id]);
  expect(data.handle.current.$client.prepare("SELECT historical_stub, name FROM projects WHERE id = ?").get(laterProject.id)).toEqual({ historical_stub: 1, name: "Historical Project" });
  expect(data.repository.listStoryMaps(laterProject.id)).toEqual([]);
  expect(data.handle.current.$client.prepare("SELECT * FROM project_settings WHERE project_id = ?").get(laterProject.id)).toBeUndefined();
  expect(data.handle.current.$client.pragma("foreign_key_check")).toEqual([]);
  const laterEvents = data.repository.listActivity().filter((event) => event.undoneByRestore);
  expect(laterEvents).toEqual(expectedLaterEvents.map((event) => ({ ...event, undoneByRestore: true })));
  expect(result.undoneActivityEvents).toBe(expectedLaterEvents.length);
  expect(new Set(expectedLaterEvents.map((event) => event.actorType))).toEqual(new Set(["agent", "human"]));
  for (const id of [changeSet.id, laterChangeSet.id]) {
    for (const status of ["approved", "rejected", "conflict"] as const) expect(() => data.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(id, status))).toThrow("permanently historical");
    expect(() => data.uow.run(ACTOR, ({ repository }) => repository.applyChangeSet(id))).toThrow("permanently historical");
  }
  expect(result.epoch).not.toBe(beforeEpoch);
  expect(data.repository.getSafetySettings(data.project.id).epoch).toBe(result.epoch);
  expect(data.repository.listActivity().filter((event) => event.action === "project.restored")).toMatchObject([{ actor: ACTOR.actorId, actorType: "human", after: { epoch: result.epoch }, undoneByRestore: false }]);
  expect(listRestorePoints(data.handle)).toContainEqual(result.preRestorePoint);
  expect(existsSync(`${data.path}.restoring`)).toBe(false);
  data.uow.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Write after restore" }));
  expect(data.repository.getCard(data.card.id)?.title).toBe("Write after restore");
}

async function testReportsNewCanonicalIdentitiesAndIdentityChangesAtTheSameId() {
  const data = fixture();
  const identity = data.uow.run(ACTOR, ({ repository }) => repository.createGitHubLink({ cardId: data.card.id, repo: "fixture/repo", issueNumber: 1, url: "https://github.com/fixture/repo/issues/1" }));
  const originalCard = data.repository.getCard(data.card.id);
  const point = createRestorePoint(data.handle, "manual");
  mkdirSync(join(data.directory, "attachments"));
  const attachment = join(data.directory, "attachments", "retained.txt");
  writeFileSync(attachment, "Attachment after snapshot");
  data.uow.run(ACTOR, ({ repository }) => {
    repository.createCardAttachment(data.card.id, { label: "Attachment", filePath: attachment });
    repository.updateGitHubLink(identity.id, { repo: "fixture/repo", issueNumber: 2, url: "https://github.com/fixture/repo/issues/2" });
    const connection = repository.createConnectorConnection({ projectId: data.project.id, name: "GitHub fixture", provider: "github", owner: "fixture", repository: "repo", authMode: "token" });
    const second = repository.createCard({ storyMapId: data.map.id, title: "Later issue", level: "activity" });
    const linked = repository.createGitHubLink({ cardId: second.id, repo: "fixture/repo", issueNumber: 3, url: "https://github.com/fixture/repo/issues/3" });
    repository.upsertRemoteWorkItemLink({ connectionId: connection.id, externalRefId: linked.id, labels: [] });
  });
  const result = await restoreProject(data.handle, data.project.id, point.fileName, ACTOR);
  expect(result.githubLinks).toHaveLength(2);
  expect(result.githubLinks).toEqual(expect.arrayContaining([
    { kind: "canonical", provider: "github", url: "https://github.com/fixture/repo/issues/2" },
    { kind: "canonical", provider: "github", url: "https://github.com/fixture/repo/issues/3" }
  ]));
  expect(result.attachmentsRetained).toBe(true);
  expect(readFileSync(attachment, "utf8")).toBe("Attachment after snapshot");
  expect(data.repository.listCardAttachments(data.card.id)).toEqual([]);
  expect(data.repository.getCard(data.card.id)).toEqual(originalCard);
}

async function testRejectsUnknownCorruptMismatchedActualSchemasAndAgentAttemptsWithoutProtective() {
  const data = fixture();
  const point = createRestorePoint(data.handle, "manual");
  const path = join(data.directory, "snapshots", point.fileName);
  const valid = readFileSync(path);
  const original = data.handle.current;
  await expect(restoreProject(data.handle, data.project.id, "../escape.sqlite", ACTOR)).rejects.toThrow("not recognized");
  await expect(restoreProject(data.handle, data.project.id, point.fileName, { actorType: "agent", actorId: "agent" })).rejects.toThrow("human-only");
  writeFileSync(path, Buffer.alloc(valid.length));
  await expect(restoreProject(data.handle, data.project.id, point.fileName, ACTOR)).rejects.toThrow("could not be read");
  writeFileSync(path, valid);
  const altered = new Database(resolveSqlitePath(path));
  try { altered.exec("ALTER TABLE projects RENAME TO invalid_projects"); }
  finally { altered.close(); }
  const alteredName = point.fileName.replace(`__${point.sizeBytes}__`, `__${statSync(path).size}__`);
  renameSync(path, join(data.directory, "snapshots", alteredName));
  await expect(restoreProject(data.handle, data.project.id, alteredName, ACTOR)).rejects.toThrow("schema");
  expect(data.handle.current).toBe(original);
  expect(data.repository.getCard(data.card.id)).toEqual(data.card);
  expect(listRestorePoints(data.handle).filter((entry) => entry.class === "pre-restore")).toEqual([]);
  expect(existsSync(`${data.path}.restoring`)).toBe(false);
}

async function testInitializesOneSharedPersistedEpochAndChangesItForEverySnapshot() {
  const data = fixture();
  const other = data.uow.run(ACTOR, ({ repository }) => repository.createProject({ name: "Second Project" }));
  const otherMap = data.uow.run(ACTOR, ({ repository }) => repository.createStoryMap({ projectId: other.id, name: "Second snapshot map" }));
  const otherCreated = data.uow.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: otherMap.id, level: "activity", title: "Second snapshot content", description: "Second snapshot description" }));
  const otherCard = data.repository.getCard(otherCreated.id)!;
  const before = data.repository.getSafetySettings(data.project.id).epoch;
  expect(data.repository.getSafetySettings(other.id).epoch).toBe(before);
  const point = createRestorePoint(data.handle, "manual");
  data.uow.run(ACTOR, ({ repository }) => {
    repository.updateCard(data.card.id, { title: "Changed first Project", description: "Changed first description" });
    repository.updateCard(otherCard.id, { title: "Changed second Project", description: "Changed second description" });
  });
  const result = await restoreProject(data.handle, other.id, point.fileName, ACTOR);
  expect(data.repository.getCard(data.card.id)).toEqual(data.card);
  expect(data.repository.getCard(otherCard.id)).toEqual(otherCard);
  for (const project of data.repository.listProjects()) expect(data.repository.getSafetySettings(project.id).epoch).toBe(result.epoch);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect(data.repository.getSafetySettings(other.id).epoch).toBe(result.epoch);
  expect(exportAudit({ repository: data.repository, unitOfWork: data.uow }, ACTOR, other.id, "markdown").content).toContain(" | undone by restore");
}

function testCompletesAFullyPreparedInterruptedSwapBeforeNormalOpeningRetainingEpoch() {
  const data = fixture();
  const changeSet = proposed(data);
  const point = createRestorePoint(data.handle, "manual");
  data.uow.run(ACTOR, ({ repository }) => { repository.updateChangeSetStatus(changeSet.id, "approved"); repository.applyChangeSet(changeSet.id); });
  const result = prepared(data, point);
  expect(data.repository.getCard(data.card.id)?.title).toBe("After restore point");
  data.handle.current.$client.close();
  const logs: string[] = [];
  data.handle.current = openStoryMapperDb(data.path, (outcome) => logs.push(outcome));
  expect(logs).toEqual(["Interrupted project restore completed with preserved history and epoch."]);
  expect(data.repository.getCard(data.card.id)).toEqual(data.card);
  expect(data.repository.getSafetySettings(data.project.id).epoch).toBe(result.epoch);
  expect(data.repository.getChangeSet(changeSet.id)).toMatchObject({ status: "applied", undoneByRestore: true });
  expect(data.repository.listActivity().filter((event) => event.action === "project.restored")).toHaveLength(1);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path, (outcome) => logs.push(outcome));
  expect(logs).toHaveLength(1);
}

function testDiscardsInterruptedMigratedCandidateSnapshotsWithoutTouchingActiveSnapshots() {
  const data = fixture();
  const point = createRestorePoint(data.handle, "manual");
  const source = join(data.directory, "snapshots", point.fileName);
  const original = readFileSync(source);
  const path = `${data.path}.restoring`;
  copyFileSync(source, path);
  const candidate = new Database(path);
  try { runMigrations(candidate, path, loadTestMigrationAssets()); }
  finally { candidate.close(); }
  expect(candidateSnapshots(data)).toHaveLength(1);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path, () => undefined);
  expect(candidateSnapshots(data)).toEqual([]);
  expect(listRestorePoints(data.handle)).toContainEqual(point);
  expect(readFileSync(source)).toEqual(original);
  expect(data.repository.getCard(data.card.id)).toEqual(data.card);
}

function testRecognizesACompletedInterruptedRenameAndKeepsTheSameFinalEpoch() {
  const data = fixture();
  const point = createRestorePoint(data.handle, "manual");
  data.uow.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "After snapshot" }));
  const result = prepared(data, point);
  data.handle.current.$client.close();
  renameSync(`${data.path}.restoring`, data.path);
  const logs: string[] = [];
  data.handle.current = openStoryMapperDb(data.path, (outcome) => logs.push(outcome));
  expect(logs).toEqual(["Interrupted project restore completed; completion markers removed."]);
  expect(data.repository.getCard(data.card.id)).toEqual(data.card);
  expect(data.repository.getSafetySettings(data.project.id).epoch).toBe(result.epoch);
  expect(data.repository.listActivity().filter((event) => event.action === "project.restored")).toHaveLength(1);
  expect(existsSync(`${data.path}.restoring.ready`)).toBe(false);
}

async function testPreservesGenuinelyCrashedUncheckpointedWALCommitsWhenStartupPublicationFailsAnd() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-crashed-wal-"));
  close.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "storymapper.sqlite");
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const child = spawnSync(process.execPath, [join(root, "apps/server/node_modules/tsx/dist/cli.mjs"), "--tsconfig", join(root, "apps/server/tsconfig.json"), fileURLToPath(new URL("./fixtures/restore-crash.ts", import.meta.url)), path], { cwd: root, encoding: "utf8", timeout: 15_000 });
  expect(child.error).toBeUndefined();
  expect(child.status).not.toBe(0);
  expect(statSync(`${path}-wal`).size).toBeGreaterThan(0);
  const saved = JSON.parse(readFileSync(`${path}.fixture.json`, "utf8")) as { cardId: string; epoch: string };
  const mainCopy = join(directory, "main-only.sqlite");
  copyFileSync(path, mainCopy);
  const main = new Database(mainCopy, { readonly: true });
  try { expect(main.prepare("SELECT title FROM cards WHERE id = ?").get(saved.cardId)).toEqual({ title: "Checkpointed snapshot state" }); }
  finally { main.close(); }
  const filesystem = await vi.importActual<typeof import("node:fs")>("node:fs");
  vi.mocked(renameSync).mockImplementation((source, destination) => {
    if (source === `${path}.restoring` && destination === path) throw Object.assign(new Error("recovery rename EACCES"), { code: "EACCES" });
    filesystem.renameSync(source, destination);
  });
  expect(() => openStoryMapperDb(path)).toThrow("original committed database and prepared candidate are preserved");
  expect(existsSync(`${path}.restoring`)).toBe(true);
  expect(existsSync(`${path}.restoring.ready`)).toBe(true);
  const original = new Database(path, { readonly: true });
  try { expect(original.prepare("SELECT title FROM cards WHERE id = ?").get(saved.cardId)).toEqual({ title: "Committed only in crashed WAL" }); }
  finally { original.close(); }
  vi.mocked(renameSync).mockImplementation(filesystem.renameSync);
  const recovered = openStoryMapperDb(path, () => undefined);
  try {
    expect(recovered.$client.prepare("SELECT title FROM cards WHERE id = ?").get(saved.cardId)).toEqual({ title: "Checkpointed snapshot state" });
    expect(recovered.$client.prepare("SELECT epoch FROM project_settings").get()).toEqual({ epoch: saved.epoch });
    expect(recovered.$client.pragma("foreign_key_check")).toEqual([]);
  } finally { recovered.$client.close(); }
}
