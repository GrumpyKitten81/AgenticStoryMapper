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

const actor = { actorType: "human", actorId: "epic-context-test" } as const;
const context = { title: "Map-wide goal", goal: "Retain local framing", githubIssueUrl: "https://github.com/fixture/repo/issues/9" };
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-epic-context-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const uow = new UnitOfWork(handle), repository = new StoryMapperRepository(handle);
  const data = uow.run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Context fixture" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map", epicContext: context });
    repository.upsertProductContext({ projectId: project.id, storyMapId: map.id, purpose: "Context fixture" });
    return { project, map };
  });
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  return { ...data, path, handle, uow, repository };
}

it("retains context through reopen, copy, exports and redacted archive metadata without sync data", () => {
  const f = fixture();
  f.handle.current.$client.close();
  f.handle.current = openStoryMapperDb(f.path);
  const before = f.repository.getStoryMapSnapshot(f.map.id)!;
  expect(before.storyMap.epicContext).toEqual(context);
  const copiedId = randomUUID();
  f.uow.run(actor, ({ repository }) => copyStoryMap.call(repository, f.map.id, "Copy", copiedId));
  expect(f.repository.getStoryMapSnapshot(copiedId)!.storyMap.epicContext).toEqual(context);
  f.uow.run(actor, ({ repository }) => repository.updateStoryMap(copiedId, { epicContext: null }));
  expect(f.repository.getStoryMapSnapshot(f.map.id)).toEqual(before);
  expect(buildStoryMapExport(before, "markdown", f.map.createdAt).content).toContain(context.goal);
  expect(buildStoryMapExport(before, "json", f.map.createdAt).content).toContain(context.githubIssueUrl);
  const archive = createRedactedSnapshot(f.path, f.project.id);
  const archived = openStoryMapperDb(archive.snapshotPath);
  try {
    const snapshot = new StoryMapperRepository(new DatabaseHandle(archived)).getStoryMapSnapshot(f.map.id)!;
    expect(snapshot.storyMap.epicContext).toEqual(context);
    expect(snapshot.externalRefs).toEqual([]);
    expect(snapshot.remoteWorkItemLinks).toEqual([]);
  } finally { archived.$client.close(); rmSync(archive.snapshotPath, { force: true }); }
});

it("restores context with map metadata and retains the clear in auditable history", async () => {
  const f = fixture();
  const point = createRestorePoint(f.handle, "manual");
  f.uow.run(actor, ({ repository }) => repository.updateStoryMap(f.map.id, { epicContext: null }));
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.epicContext).toBeUndefined();
  expect(f.repository.listActivity(f.project.id).some((event) => event.action === "storyMap.updated" && JSON.stringify(event.before).includes(context.goal))).toBe(true);
  await restoreProject(f.handle, f.project.id, point.fileName, actor);
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.epicContext).toEqual(context);
});


it("upgrades existing maps additively with absent context and unchanged stored content", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-pre-context-"));
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
    expect(map.epicContext).toBeUndefined();
  } finally { database.$client.close(); rmSync(directory, { recursive: true, force: true }); }
});
