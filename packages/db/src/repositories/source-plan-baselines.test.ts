import type { ChangeOperation } from "@storymapper/contracts";
import { buildPlanStateProjection, resolveOperations } from "@storymapper/core";
import { randomUUID } from "node:crypto";
import { copyStoryMap } from "@storymapper/db/repositories/map-copy-repository";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DatabaseHandle, StoryMapperRepository, UnitOfWork, createRedactedSnapshot, createRestorePoint, databaseSchemaVersion, openExistingStoryMapperDb, openStoryMapperDb, prepareImportedDatabase, restoreProject, validateRestoreDatabase } from "@storymapper/db";

const actor = { actorType: "human", actorId: "source-plan-fixture" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-source-plan-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const uow = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const data = uow.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Source evidence" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Source map" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Published Slice" });
    const card = tx.createCard({ storyMapId: map.id, level: "story", title: "Published Story", releaseId: release.id });
    tx.setExternalRef({ entityType: "card", entityId: card.id, system: "source", externalId: "story" });
    return { project, map, card, release };
  });
  return { directory, path, handle, uow, repository, ...data };
}

it("preserves exact initial evidence across coalesced edits, deletion, ref cleanup and reopening without coupling manual captures", () => {
  const data = fixture();
  const before = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  expect(before.entries).toMatchObject([{ cardId: data.card.id, identity: { key: data.card.key }, card: { title: "Published Story" }, active: true }]);
  data.uow.run(actor, ({ repository }) => {
    repository.updateCard(data.card.id, { title: "Human edit" });
    repository.updateCard(data.card.id, { description: "Later coalesced edit" });
    repository.capturePlanState(data.map.id);
    repository.deleteCard(data.card.id, { strategy: "unassign" });
    repository.deleteRelease(data.release.id);
  });
  expect(data.repository.listExternalRefsForStoryMap(data.map.id)).toEqual([]);
  const reopened = openExistingStoryMapperDb(data.path);
  try {
    const repository = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(repository.getSourcePlanBaseline(data.map.id, "source")).toEqual(before);
    expect(repository.listSourcePlanBaselines(data.map.id)).toEqual([before]);
    expect(repository.getOperationSnapshot(data.project.id).sourcePlanBaselines).toEqual([before]);
  } finally { reopened.$client.close(); }
});

it("keeps systems and copies independent, repeat binding unchanged, and failed transactions atomic", () => {
  const data = fixture();
  const before = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  data.uow.run(actor, ({ repository }) => {
    repository.setExternalRef({ entityType: "card", entityId: data.card.id, system: "source", externalId: "story" });
    repository.setExternalRef({ entityType: "card", entityId: data.card.id, system: "other", externalId: "story" });
  });
  expect(data.repository.getSourcePlanBaseline(data.map.id, "source")).toEqual(before);
  expect(data.repository.listSourcePlanBaselines(data.map.id).map((row) => row.system)).toEqual(["other", "source"]);
  expect(() => data.uow.run(actor, ({ repository }) => {
    repository.setExternalRef({ entityType: "card", entityId: data.card.id, system: "rollback", externalId: "story" });
    throw new Error("Abort publication");
  })).toThrow("Abort publication");
  expect(data.repository.getSourcePlanBaseline(data.map.id, "rollback")).toBeUndefined();
  const copiedId = randomUUID();
  data.uow.run(actor, ({ repository }) => copyStoryMap.call(repository, data.map.id, "Copy", copiedId));
  expect(data.repository.listSourcePlanBaselines(copiedId)).toEqual([]);
});

it("retains selected Project evidence in archive snapshots and restores the exact point-in-time baseline", async () => {
  const data = fixture();
  const before = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  const point = createRestorePoint(data.handle, "manual");
  data.uow.run(actor, ({ repository }) => {
    const card = repository.createCard({ storyMapId: data.map.id, level: "story", title: "Later evidence" });
    repository.setExternalRef({ entityType: "card", entityId: card.id, system: "source", externalId: "later" });
    const project = repository.createProject({ name: "Excluded" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Excluded map" });
    const excluded = repository.createCard({ storyMapId: map.id, level: "story", title: "Excluded evidence" });
    repository.setExternalRef({ entityType: "card", entityId: excluded.id, system: "source", externalId: "excluded" });
  });
  const archive = createRedactedSnapshot(data.path, data.project.id);
  prepareImportedDatabase(archive.snapshotPath, data.directory, data.project.id, actor);
  const database = openExistingStoryMapperDb(archive.snapshotPath);
  try {
    expect(database.$client.prepare("SELECT project_id FROM source_plan_baselines").all()).toEqual([{ project_id: data.project.id }]);
    expect(new StoryMapperRepository(new DatabaseHandle(database)).getSourcePlanBaseline(data.map.id, "source")?.entries).toHaveLength(2);
  } finally { database.$client.close(); rmSync(archive.snapshotPath); }
  await restoreProject(data.handle, data.project.id, point.fileName, actor);
  expect(data.repository.getSourcePlanBaseline(data.map.id, "source")).toEqual(before);
});

it("rejects unsupported or corrupt baseline evidence during reads and Restore validation", () => {
  const data = fixture();
  const client = data.handle.current.$client;
  client.prepare("UPDATE source_plan_baselines SET schema_version = 2").run();
  expect(() => data.repository.listSourcePlanBaselines(data.map.id)).toThrow("unsupported schema");
  expect(() => validateRestoreDatabase(client, databaseSchemaVersion(client))).toThrow("Unsupported stored JSON payload version");
  client.prepare("UPDATE source_plan_baselines SET schema_version = 1, entries_json = '{'").run();
  expect(() => data.repository.getSourcePlanBaseline(data.map.id, "source")).toThrow("invalid JSON");
});

it("discovers systems from scoped identity metadata without hydrating unsupported payloads", () => {
  const data = fixture();
  const client = data.handle.current.$client;
  client.prepare("UPDATE source_plan_baselines SET schema_version = 2, entries_json = '{', releases_json = '{'").run();
  expect(data.repository.listSourcePlanSystems(data.map.id)).toEqual(["source"]);
  expect(() => data.repository.getSourcePlanBaseline(data.map.id, "source")).toThrow("invalid JSON");
  expect(() => data.repository.listSourcePlanSystems(randomUUID())).toThrow("not found");
  const foreign = data.uow.run(actor, ({ repository }) => repository.createProject({ name: "Foreign owner" }));
  client.prepare("UPDATE source_plan_baselines SET project_id = ?").run(foreign.id);
  expect(() => data.repository.listSourcePlanSystems(data.map.id)).toThrow("ownership");
});

it.each(["identity-id", "identity-key", "identity-title", "binding-version", "deleted-binding", "deleted-active", "missing-release", "missing-release-name", "unscheduled-name", "archived-active", "parked-active"])("rejects contradictory captured %s evidence in reads and Restore", (kind) => {
  const data = fixture();
  const baseline = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  const entry = structuredClone(baseline.entries[0]!);
  if (kind === "identity-id") entry.identity.id = randomUUID();
  if (kind === "identity-key") entry.identity.key = "WRONG-1";
  if (kind === "identity-title") entry.identity.title = "Contradictory identity";
  if (kind === "binding-version") entry.binding!.syncedVersion += 1;
  if (kind === "deleted-binding") { entry.card = null; entry.active = false; }
  if (kind === "deleted-active") { entry.card = null; entry.binding = null; }
  if (kind === "missing-release") baseline.releases = [];
  if (kind === "missing-release-name") entry.releaseName = null;
  if (kind === "unscheduled-name") entry.card!.releaseId = null;
  if (kind === "archived-active") entry.card!.archived = true;
  if (kind === "parked-active") entry.card!.parked = true;
  const client = data.handle.current.$client;
  client.prepare("UPDATE source_plan_baselines SET entries_json = ?, releases_json = ? WHERE id = ?").run(JSON.stringify([entry]), JSON.stringify(baseline.releases), baseline.id);
  expect(() => data.repository.getSourcePlanBaseline(data.map.id, "source")).toThrow("invalid captured data");
  expect(() => data.repository.listSourcePlanBaselines(data.map.id)).toThrow("invalid captured data");
  expect(() => validateRestoreDatabase(client, databaseSchemaVersion(client))).toThrow(/invalid captured data|Invalid stored JSON payload/);
});

it("persists selected no-op publication at final same-cut Card versions and keeps excluded and other-system evidence unchanged", () => {
  const data = fixture();
  data.uow.run(actor, ({ repository }) => repository.setExternalRef({ entityType: "card", entityId: data.card.id, system: "other", externalId: "story" }));
  const other = data.repository.getSourcePlanBaseline(data.map.id, "other");
  const excluded = data.uow.run(actor, ({ repository }) => {
    const card = repository.createCard({ storyMapId: data.map.id, level: "story", title: "Excluded" });
    repository.setExternalRef({ entityType: "card", entityId: card.id, system: "source", externalId: "excluded" });
    return card;
  });
  const excludedBefore = data.repository.getSourcePlanBaseline(data.map.id, "source")!.entries.find((entry) => entry.cardId === excluded.id);
  const operations: ChangeOperation[] = [
    { operationId: "publish", entity: "card", op: "upsert", selector: { kind: "externalRef", scopeId: data.map.id, system: "source", externalId: "story" }, after: { storyMapId: data.map.id, level: "story", title: data.card.title } },
    { operationId: "note", entityId: "new-note", entity: "sourceLink", op: "link", after: { cardId: data.card.id, kind: "note", note: "Published evidence" } },
    { operationId: "excluded", entity: "card", op: "upsert", selector: { kind: "externalRef", scopeId: data.map.id, system: "source", externalId: "excluded" }, after: { storyMapId: data.map.id, level: "story", title: "Excluded update" } }
  ];
  persist(data, operations, ["publish", "note"]);
  const card = data.repository.getCard(data.card.id)!;
  const baseline = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  expect(baseline.entries.find((entry) => entry.cardId === card.id)).toMatchObject({ card, binding: { syncedVersion: card.version }, releaseName: "Published Slice" });
  expect(baseline.entries.find((entry) => entry.cardId === excluded.id)).toEqual(excludedBefore);
  expect(data.repository.getSourcePlanBaseline(data.map.id, "other")).toEqual(other);
  expect(data.repository.getCard(excluded.id)?.title).toBe("Excluded");
});

it("repairs final allocated keys in new publication evidence and rolls back failed persistence", () => {
  const data = fixture();
  const operations: ChangeOperation[] = [{ operationId: "new", entity: "card", op: "upsert", selector: { kind: "externalRef", scopeId: data.map.id, system: "source", externalId: "new" }, after: { storyMapId: data.map.id, level: "story", title: "New published Story" } }];
  const resolution = persist(data, operations);
  const card = data.repository.getStoryMapSnapshot(data.map.id)!.cards.find((row) => row.title === "New published Story")!;
  const baseline = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  expect(baseline.entries.find((entry) => entry.cardId === card.id)).toMatchObject({ identity: { key: card.key }, card: { key: card.key } });
  expect(JSON.stringify(baseline)).not.toContain("NEW-");
  expect(resolution.operations.flatMap((operation) => operation.changes).find((change) => change.entity === "sourcePlanBaseline")?.after).toEqual(baseline);
  const before = data.repository.getOperationSnapshot(data.project.id);
  expect(() => data.uow.run(actor, ({ repository }) => {
    const supply = repository.prepareOperationSupply(operations, before);
    repository.persistOperationResolution(resolveOperations(before, operations, supply), data.project.id, randomUUID());
    throw new Error("Abort after persistence");
  })).toThrow("Abort after persistence");
  expect(data.repository.getOperationSnapshot(data.project.id)).toEqual(before);
});

function persist(data: ReturnType<typeof fixture>, operations: ChangeOperation[], selected?: string[]) {
  const snapshot = data.repository.getOperationSnapshot(data.project.id);
  const supply = data.repository.prepareOperationSupply(operations, snapshot);
  const resolution = resolveOperations(snapshot, operations, supply, selected);
  data.uow.run(actor, ({ repository }) => repository.persistOperationResolution(resolution, data.project.id, randomUUID()));
  return resolution;
}

it("atomically persists matching acknowledgments without changing Cards or manual states and refuses stale reviewed evidence", () => {
  const data = fixture();
  const baseline = data.repository.getSourcePlanBaseline(data.map.id, "source")!;
  const manual = data.uow.run(actor, ({ repository }) => repository.capturePlanState(data.map.id));
  data.uow.run(actor, ({ repository }) => repository.updateCard(data.card.id, { releaseId: null, title: "Reconciled human Story" }));
  const card = data.repository.getCard(data.card.id)!;
  const binding = data.repository.listExternalRefsForStoryMap(data.map.id).find((ref) => ref.system === "source")!;
  const acknowledgment: ChangeOperation = { operationId: "accept-source", entity: "sourcePlan", op: "acknowledge", after: {
    storyMapId: data.map.id, system: "source", baselineId: baseline.id, baselineVersion: baseline.version,
    entries: [{ cardId: card.id, before: baseline.entries[0]!, current: card, binding,
      source: { title: card.title, description: card.description, status: card.status, releaseId: null, active: true } }]
  } };
  const before = data.repository.getOperationSnapshot(data.project.id);
  expect(() => data.uow.run(actor, ({ repository }) => {
    const supply = repository.prepareOperationSupply([acknowledgment], before);
    repository.persistOperationResolution(resolveOperations(before, [acknowledgment], supply), data.project.id, randomUUID());
    throw new Error("Abort acknowledgment");
  })).toThrow("Abort acknowledgment");
  expect(data.repository.getOperationSnapshot(data.project.id)).toEqual(before);
  persist(data, [acknowledgment]);
  expect(data.repository.getSourcePlanBaseline(data.map.id, "source")).toMatchObject({ version: baseline.version + 1, entries: [{ card, binding: { syncedVersion: card.version }, releaseName: null }] });
  expect(data.repository.getCard(card.id)).toEqual(card);
  expect(data.repository.getPlanState(data.map.id, manual.id)).toEqual(manual);
  const accepted = data.repository.getOperationSnapshot(data.project.id);
  expect(() => persist(data, [acknowledgment])).toThrow(/baseline.*stale/);
  expect(data.repository.getOperationSnapshot(data.project.id)).toEqual(accepted);
});

it("reads the exact canonical Plan projection including archived and hidden Cards, scoped statuses and dependencies", () => {
  const data = fixture();
  const topology = data.uow.run(actor, ({ repository }) => {
    const activity = repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Hidden branch" });
    const step = repository.createCard({ storyMapId: data.map.id, parentId: activity.id, level: "step", title: "Hidden Step" });
    const hidden = repository.createCard({ storyMapId: data.map.id, parentId: step.id, level: "story", title: "Hidden Story" });
    const archived = repository.createCard({ storyMapId: data.map.id, level: "story", title: "Archived prerequisite" });
    repository.mutateCardDependency(data.card.id, archived.id, true);
    repository.archiveCard(activity.id);
    repository.archiveCard(archived.id);
    const parked = repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Parked Activity" });
    repository.parkCard(parked.id, { childStrategy: "unassign" });
    const other = repository.createStoryMap({ projectId: data.project.id, name: "Other projection scope" });
    repository.createWorkflowStatus({ projectId: data.project.id, storyMapId: other.id, name: "foreign-status", group: "active" });
    const foreign = repository.createCard({ storyMapId: other.id, level: "story", title: "Foreign endpoint" });
    return { hidden, archived, parked, foreign };
  });
  for (const [dependent, prerequisite] of [[data.card.id, topology.foreign.id], [topology.foreign.id, data.card.id]]) {
    data.handle.current.$client.prepare("INSERT INTO card_dependencies (id, card_id, prerequisite_card_id, created_at) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), dependent, prerequisite, new Date().toISOString());
  }
  const expected = buildPlanStateProjection(data.repository.getStoryMapSnapshot(data.map.id)!);
  const actual = data.repository.getPlanStateProjection(data.map.id);
  expect(actual).toEqual(expected);
  expect(actual.cards.map((card) => card.id)).toEqual(expect.arrayContaining([topology.hidden.id, topology.archived.id, topology.parked.id]));
  expect(actual.cards.find((card) => card.id === topology.parked.id)?.parked).toBe(true);
  expect(actual.storyIds).toEqual([data.card.id]);
  expect(actual.cardDependencies).toHaveLength(1);
  expect(actual.cardDependencies).toMatchObject([{ cardId: data.card.id, prerequisiteCardId: topology.archived.id }]);
  expect(actual.workflowStatuses.some((status) => status.name === "foreign-status")).toBe(false);
  expect(() => data.repository.getPlanStateProjection(randomUUID())).toThrow("not found");
  const empty = data.uow.run(actor, ({ repository }) => repository.createStoryMap({ projectId: data.project.id, name: "Empty projection" }));
  expect(data.repository.getPlanStateProjection(empty.id)).toEqual(buildPlanStateProjection(data.repository.getStoryMapSnapshot(empty.id)!));
  expect(data.repository.getPlanStateProjection(empty.id)).toMatchObject({ cards: [], releases: [], cardDependencies: [], storyIds: [] });
});
