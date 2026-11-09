import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { type LiveTransaction } from "@storymapper/contracts";
import { createRestorePoint, restoreProject, createRedactedSnapshot, DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { copyStoryMap } from "@storymapper/db/repositories/map-copy-repository";
import { databaseSchemaVersion, validateRestoreDatabase } from "@storymapper/db/restore-validation";
import { cardDependencies } from "@storymapper/db/schema/tables";

const human = { actorType: "human", actorId: "dependencies-human" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0)) close(); });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-dependencies-"));
  const path = join(directory, "storymapper.sqlite");
  const db = openStoryMapperDb(path);
  const handle = new DatabaseHandle(db);
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const uow = new UnitOfWork(handle);
  const roots = uow.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Dependency test" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const a = repository.createCard({ storyMapId: map.id, level: "activity", title: "A" });
    const b = repository.createCard({ storyMapId: map.id, level: "step", parentId: a.id, title: "B" });
    const c = repository.createCard({ storyMapId: map.id, level: "story", parentId: b.id, title: "C" });
    return { project, map, a, b, c };
  });
  return { path, db, handle, repository, uow, ...roots };
}
it("indexes prerequisite lookups in both the typed schema and physical database", () => {
  const f = fixture();
  const typedIndex = getTableConfig(cardDependencies).indexes.find((candidate) => candidate.config.name === "card_dependencies_prerequisite_idx")!;
  expect(typedIndex.config.columns).toEqual([cardDependencies.prerequisiteCardId]);
  expect(f.db.$client.prepare("PRAGMA index_info(card_dependencies_prerequisite_idx)").all()).toEqual([{ seqno: 0, cid: 2, name: "prerequisite_card_id" }]);
  expect(f.db.$client.prepare("EXPLAIN QUERY PLAN SELECT * FROM card_dependencies WHERE prerequisite_card_id = ?").all(f.c.id)).toEqual(expect.arrayContaining([expect.objectContaining({ detail: expect.stringContaining("USING INDEX card_dependencies_prerequisite_idx") })]));
});
it("owns edges on dependent roots, preserves no-ops and rejects named cycles atomically", () => {
  const f = fixture();
  const events: LiveTransaction[] = [];
  f.uow.subscribe((event) => events.push(event));
  f.uow.run(human, ({ repository }) => {
    repository.mutateCardDependency(f.a.id, f.b.id, true);
    repository.mutateCardDependency(f.a.id, f.c.id, true);
  });
  expect(f.repository.getCard(f.a.id)!.version).toBe(f.a.version + 1);
  expect(f.repository.getCard(f.b.id)!.version).toBe(f.b.version);
  expect(f.repository.listCardHistory(f.a.id)).toHaveLength(2);
  expect(events).toHaveLength(1);
  expect(events[0]!.entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "card", entityId: f.a.id, version: f.a.version + 1 })]));
  const before = f.repository.getOperationSnapshot(f.project.id);
  const activity = f.repository.listActivity();
  f.uow.run(human, ({ repository }) => {
    repository.mutateCardDependency(f.a.id, f.b.id, true);
    repository.mutateCardDependency(f.b.id, f.c.id, false);
  });
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(f.repository.listActivity()).toEqual(activity);
  expect(() => f.uow.run(human, ({ repository }) => repository.mutateCardDependency(f.b.id, f.a.id, true))).toThrow(`Dependency cycle: ${f.b.key} -> ${f.a.key} -> ${f.b.key}`);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
});
it("removes prerequisite incidents with one surviving owner history and rolls back all failures", () => {
  const f = fixture();
  const d = f.uow.run(human, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "story", parentId: f.b.id, title: "D" }));
  f.uow.run(human, ({ repository }) => {
    repository.mutateCardDependency(f.a.id, f.c.id, true);
    repository.mutateCardDependency(f.a.id, d.id, true);
    repository.mutateCardDependency(f.b.id, f.c.id, true);
  });
  const events: LiveTransaction[] = [];
  f.uow.subscribe((event) => events.push(event));
  const before = f.repository.getOperationSnapshot(f.project.id);
  const histories = before.cards.map((card) => f.repository.listCardHistory(card.id));
  const activity = f.repository.listActivity();
  const remove = (repository: StoryMapperRepository<"transaction">) => {
    repository.deleteCard(f.c.id, { strategy: "unassign" });
    repository.deleteCard(d.id, { strategy: "unassign" });
  };
  expect(() => f.uow.run(human, ({ repository }) => { remove(repository); throw new Error("abort deletion"); })).toThrow("abort deletion");
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(before.cards.map((card) => f.repository.listCardHistory(card.id))).toEqual(histories);
  expect(f.repository.listActivity()).toEqual(activity);
  expect(events).toEqual([]);
  f.uow.run(human, ({ repository }) => remove(repository));
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toEqual([]);
  const survivingRoots = [f.a, f.b].map((card) => ({ entityType: "card", entityId: card.id, projectId: f.project.id, version: before.cards.find((row) => row.id === card.id)!.version + 1 }));
  for (const root of survivingRoots) {
    expect(f.repository.getCard(root.entityId)!.version).toBe(root.version);
    expect(f.repository.listCardHistory(root.entityId)).toHaveLength(histories[before.cards.findIndex((card) => card.id === root.entityId)]!.length + 1);
  }
  expect(events).toHaveLength(1);
  expect(events[0]!.entities.filter((entity) => survivingRoots.some((root) => root.entityId === entity.entityId))).toEqual(expect.arrayContaining(survivingRoots));
  expect(events[0]!.entities.filter((entity) => survivingRoots.some((root) => root.entityId === entity.entityId))).toHaveLength(2);
  const activityIds = new Set(activity.map((event) => event.id));
  const committed = f.repository.listActivity().filter((event) => !activityIds.has(event.id));
  expect(committed).toHaveLength(5);
  const removedEdges = committed.filter((event) => event.action === "card.dependency.unset");
  expect(removedEdges).toHaveLength(3);
  for (const edge of before.cardDependencies) expect(removedEdges).toContainEqual(expect.objectContaining({ affectedEntityType: "cardDependency", affectedEntityId: edge.id, before: edge }));
  expect(committed.filter((event) => event.action === "card.deleted").map((event) => event.affectedEntityId).sort()).toEqual([f.c.id, d.id].sort());
});
it("copies internal endpoints, retains archived edges and validates coherent portable rows", () => {
  const f = fixture();
  f.uow.run(human, ({ repository }) => { repository.mutateCardDependency(f.a.id, f.c.id, true); repository.archiveCard(f.c.id); });
  const copiedId = randomUUID();
  f.uow.run(human, ({ repository }) => copyStoryMap.call(repository, f.map.id, "Copy", copiedId));
  const copy = f.repository.getStoryMapSnapshot(copiedId)!;
  expect(copy.cardDependencies).toHaveLength(1);
  const edge = copy.cardDependencies[0]!;
  expect(copy.cards.find((card) => card.id === edge.cardId)!.title).toBe("A");
  expect(copy.cards.find((card) => card.id === edge.prerequisiteCardId)!.title).toBe("C");
  expect(edge.cardId).not.toBe(f.a.id);
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toHaveLength(1);
  validateRestoreDatabase(f.db.$client, databaseSchemaVersion(f.db.$client));
  f.db.$client.prepare("INSERT INTO card_dependencies (id,card_id,prerequisite_card_id,created_at) VALUES (?,?,?,?)").run(randomUUID(), f.c.id, f.a.id, new Date().toISOString());
  expect(() => validateRestoreDatabase(f.db.$client, databaseSchemaVersion(f.db.$client))).toThrow("dependency cycle");
});

it("refuses cross-map dependencies with valid foreign keys during Restore validation", () => {
  const f = fixture();
  const foreign = f.uow.run(human, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: f.project.id, name: "Foreign" });
    return repository.createCard({ storyMapId: map.id, level: "activity", title: "Foreign prerequisite" });
  });
  f.db.$client.prepare("INSERT INTO card_dependencies (id,card_id,prerequisite_card_id,created_at) VALUES (?,?,?,?)").run(randomUUID(), f.a.id, foreign.id, new Date().toISOString());
  expect(f.db.$client.pragma("foreign_key_check")).toEqual([]);
  expect(() => validateRestoreDatabase(f.db.$client, databaseSchemaVersion(f.db.$client))).toThrow("different Story Maps");
});

it.each(["identity", "timestamp"])("refuses malformed dependency %s during Restore validation", (field) => {
  const f = fixture();
  f.db.$client.prepare("INSERT INTO card_dependencies (id,card_id,prerequisite_card_id,created_at) VALUES (?,?,?,?)").run(field === "identity" ? "invalid-id" : randomUUID(), f.a.id, f.c.id, field === "timestamp" ? "invalid-time" : new Date().toISOString());
  expect(f.db.$client.pragma("foreign_key_check")).toEqual([]);
  expect(() => validateRestoreDatabase(f.db.$client, databaseSchemaVersion(f.db.$client))).toThrow("invalid Card dependency");
});

it("restores exact owned edge rows and preserves only the scoped Project in portable snapshots", async () => {
  const f = fixture();
  f.uow.run(human, ({ repository }) => repository.mutateCardDependency(f.a.id, f.c.id, true));
  const edges = f.repository.listCardDependenciesForStoryMap(f.map.id);
  const point = createRestorePoint(f.handle, "manual");
  f.uow.run(human, ({ repository }) => repository.mutateCardDependency(f.a.id, f.c.id, false));
  await restoreProject(f.handle, f.project.id, point.fileName, human);
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toEqual(edges);
  f.uow.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Excluded" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Excluded map" });
    const dependent = repository.createCard({ storyMapId: map.id, level: "activity", title: "Excluded owner" });
    const prerequisite = repository.createCard({ storyMapId: map.id, level: "activity", title: "Excluded prerequisite" });
    repository.mutateCardDependency(dependent.id, prerequisite.id, true);
  });
  const portable = createRedactedSnapshot(f.path, f.project.id);
  const snapshot = new Database(portable.snapshotPath, { readonly: true });
  try {
    expect(snapshot.prepare("SELECT id, card_id AS cardId, prerequisite_card_id AS prerequisiteCardId, created_at AS createdAt FROM card_dependencies").all()).toEqual(edges);
    expect(snapshot.pragma("foreign_key_check")).toEqual([]);
  } finally { snapshot.close(); rmSync(portable.snapshotPath); }
});
