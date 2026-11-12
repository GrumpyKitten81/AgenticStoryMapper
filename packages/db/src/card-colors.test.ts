import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { buildStoryMapExport } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork, createRedactedSnapshot, createRestorePoint, restoreProject } from "@storymapper/db";
import { loadMigrationAssets } from "@storymapper/db/migration-assets";
import { runMigrations } from "@storymapper/db/migration-runner";
import { copyStoryMap } from "@storymapper/db/repositories/map-copy-repository";

const actor = { actorType: "human", actorId: "card-colors-test" } as const;
const names = { "#f5a623": "Risk" };
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-card-colors-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const uow = new UnitOfWork(handle), repository = new StoryMapperRepository(handle);
  const data = uow.run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Color category fixture" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map", colorCategoryNames: names });
    repository.upsertProductContext({ projectId: project.id, storyMapId: map.id, purpose: "Color category fixture" });
    return { project, map };
  });
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  return { ...data, path, handle, uow, repository };
}

it("retains names through reopen, copy, exports and redacted archive metadata without sync data", () => {
  const f = fixture();
  f.handle.current.$client.close();
  f.handle.current = openStoryMapperDb(f.path);
  const before = f.repository.getStoryMapSnapshot(f.map.id)!;
  expect(before.storyMap.colorCategoryNames).toEqual(names);
  const state = f.uow.run(actor, ({ repository }) => repository.capturePlanState(f.map.id));
  expect(state.payload.storyMap.colorCategoryNames).toEqual(names);
  f.uow.run(actor, ({ repository }) => repository.updateStoryMap(f.map.id, { description: "Unrelated update" }));
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.colorCategoryNames).toEqual(names);
  const source = f.repository.getStoryMapSnapshot(f.map.id)!;
  const copiedId = randomUUID();
  f.uow.run(actor, ({ repository }) => copyStoryMap.call(repository, f.map.id, "Copy", copiedId));
  expect(f.repository.getStoryMapSnapshot(copiedId)!.storyMap.colorCategoryNames).toEqual(names);
  f.uow.run(actor, ({ repository }) => repository.updateStoryMap(copiedId, { colorCategoryNames: {} }));
  expect(f.repository.getStoryMapSnapshot(f.map.id)).toEqual(source);
  expect(f.repository.getStoryMapSnapshot(copiedId)!.storyMap.colorCategoryNames).toBeUndefined();
  expect(buildStoryMapExport(before, "json", f.map.createdAt).content).toContain(names["#f5a623"]);
  const archive = createRedactedSnapshot(f.path, f.project.id);
  const archived = openStoryMapperDb(archive.snapshotPath);
  try {
    const snapshot = new StoryMapperRepository(new DatabaseHandle(archived)).getStoryMapSnapshot(f.map.id)!;
    expect(snapshot.storyMap.colorCategoryNames).toEqual(names);
    expect(snapshot.externalRefs).toEqual([]);
    expect(snapshot.remoteWorkItemLinks).toEqual([]);
  } finally { archived.$client.close(); rmSync(archive.snapshotPath, { force: true }); }
});

it("restores names with map metadata and retains the clear in auditable history", async () => {
  const f = fixture();
  const point = createRestorePoint(f.handle, "manual");
  f.uow.run(actor, ({ repository }) => repository.updateStoryMap(f.map.id, { colorCategoryNames: {} }));
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.colorCategoryNames).toBeUndefined();
  expect(f.repository.listActivity(f.project.id).some((event) => event.action === "storyMap.updated" && JSON.stringify(event.before).includes(names["#f5a623"]))).toBe(true);
  await restoreProject(f.handle, f.project.id, point.fileName, actor);
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.colorCategoryNames).toEqual(names);
});


it("upgrades existing maps additively with absent names and unchanged stored content", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-pre-color-names-"));
  const path = join(directory, "storymapper.sqlite");
  const raw = new Database(path);
  const projectId = randomUUID(), mapId = randomUUID(), now = "2026-11-08T00:00:00Z";
  runMigrations(raw, path, loadMigrationAssets().slice(0, -1));
  raw.prepare("INSERT INTO projects (id, name, local_path, created_at) VALUES (?, 'Existing project', '', ?)").run(projectId, now);
  raw.prepare("INSERT INTO story_maps (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, 'Existing map', 'Retain description', ?, ?)").run(mapId, projectId, now, now);
  raw.close();
  const database = openStoryMapperDb(path);
  try {
    const map = new StoryMapperRepository(new DatabaseHandle(database)).getStoryMapSnapshot(mapId)!.storyMap;
    expect(map).toMatchObject({ id: mapId, name: "Existing map", description: "Retain description", version: 1, createdAt: now, updatedAt: now });
    expect(map.colorCategoryNames).toBeUndefined();
  } finally { database.$client.close(); rmSync(directory, { recursive: true, force: true }); }
});
