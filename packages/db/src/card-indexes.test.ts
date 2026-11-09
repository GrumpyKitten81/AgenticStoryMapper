import { mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { afterEach, expect, it } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork, createRestorePoint, developmentSchemaVersion, restoreProject } from "@storymapper/db";
import { cards } from "@storymapper/db/schema";

const ACTOR = { actorType: "human", actorId: "card-index-fixture" } as const;
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).reverse().forEach((close) => close()));

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-card-index-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const repository = new StoryMapperRepository(handle);
  const uow = new UnitOfWork(handle);
  cleanups.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const rows = uow.run(ACTOR, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Index fixture" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Index map" });
    const activity = tx.createCard({ storyMapId: map.id, level: "activity", title: "Activity" });
    const step = tx.createCard({ storyMapId: map.id, parentId: activity.id, level: "step", title: "Step" });
    const story = tx.createCard({ storyMapId: map.id, parentId: step.id, level: "story", title: "Story" });
    tx.upsertProductContext({ projectId: project.id, storyMapId: map.id, purpose: "Stable snapshot context" });
    tx.updateStoryMap(map.id, { cardKeyPrefix: "IDX" });
    return { project, map, story };
  });
  uow.run({ ...ACTOR, actorId: "card-index-editor" }, ({ repository: tx }) => tx.updateCard(rows.story.id, { title: "Saved title" }));
  return { directory, path, handle, repository, uow, ...rows };
}

function assertIndexes(database: Database.Database) {
  const indexes = database.pragma("index_list(cards)") as Array<{ name: string; unique: number }>;
  for (const [name, column] of [["cards_story_map_id_idx", "story_map_id"], ["cards_parent_id_idx", "parent_id"]]) {
    expect(indexes).toContainEqual(expect.objectContaining({ name, unique: 0 }));
    expect(database.pragma(`index_info(${name})`)).toEqual([expect.objectContaining({ name: column })]);
  }
  expect(indexes.some((index) => index.unique === 1 && (database.pragma(`index_info(${index.name})`) as Array<{ name: string }>).map((column) => column.name).join(",") === "story_map_id,key")).toBe(true);
  expect(database.pragma("integrity_check", { simple: true })).toBe("ok");
  expect(database.pragma("foreign_key_check")).toEqual([]);
}

it("matches nonunique Drizzle indexes to generated baseline, reopened and restored databases without losing roots or history", async () => {
  const declarations = getTableConfig(cards).indexes.map(({ config }) => ({ name: config.name, unique: config.unique, columns: config.columns.map((column) => "name" in column ? column.name : undefined) }));
  expect(declarations).toEqual(expect.arrayContaining([
    { name: "cards_story_map_id_idx", unique: false, columns: ["story_map_id"] },
    { name: "cards_parent_id_idx", unique: false, columns: ["parent_id"] },
    { name: "cards_story_map_key_idx", unique: true, columns: ["story_map_id", "key"] }
  ]));
  const data = fixture();
  const snapshot = data.repository.getStoryMapSnapshot(data.map.id);
  const history = data.repository.listCardHistory(data.story.id);
  const version = developmentSchemaVersion(data.handle.current);
  const counter = () => data.handle.current.$client.prepare("SELECT next_card_number FROM story_maps WHERE id = ?").pluck().get(data.map.id);
  expect(counter()).toBe(4);
  expect(history.map((entry) => entry.version)).toEqual([1, 2]);
  assertIndexes(data.handle.current.$client);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect(counter()).toBe(4);
  assertIndexes(data.handle.current.$client);
  expect(developmentSchemaVersion(data.handle.current)).toBe(version);
  expect(data.repository.getStoryMapSnapshot(data.map.id)).toEqual(snapshot);
  expect(data.repository.listCardHistory(data.story.id)).toEqual(history);
  const point = createRestorePoint(data.handle, "manual");
  const pointDb = new Database(join(data.directory, "snapshots", point.fileName), { readonly: true });
  try { assertIndexes(pointDb); } finally { pointDb.close(); }
  data.uow.run(ACTOR, ({ repository }) => repository.updateCard(data.story.id, { title: "After point" }));
  await restoreProject(data.handle, data.project.id, point.fileName, ACTOR);
  assertIndexes(data.handle.current.$client);
  expect(data.repository.getStoryMapSnapshot(data.map.id)).toEqual(snapshot);
  expect(data.repository.listCardHistory(data.story.id)).toEqual(history);
  expect(counter()).toBe(4);
  expect(data.repository.getCard(data.story.id)).toMatchObject({ version: 2, creationOrigin: "manual", provenance: "manual" });
  const next = data.uow.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "story", title: "Next", parentId: data.story.parentId }));
  expect(next.key).toBe("IDX-4");
});

it.each(["cards_story_map_id_idx", "cards_parent_id_idx"])("rejects a Restore point missing required index %s before changing live state", async (index) => {
  const data = fixture();
  const before = data.repository.getStoryMapSnapshot(data.map.id);
  const point = createRestorePoint(data.handle, "manual");
  const path = join(data.directory, "snapshots", point.fileName);
  const snapshot = new Database(path);
  snapshot.exec(`DROP INDEX ${index}`);
  snapshot.close();
  const name = point.fileName.replace(`__${point.sizeBytes}__`, `__${statSync(path).size}__`);
  renameSync(path, join(data.directory, "snapshots", name));
  await expect(restoreProject(data.handle, data.project.id, name, ACTOR)).rejects.toThrow("schema");
  expect(data.repository.getStoryMapSnapshot(data.map.id)).toEqual(before);
  assertIndexes(data.handle.current.$client);
});
