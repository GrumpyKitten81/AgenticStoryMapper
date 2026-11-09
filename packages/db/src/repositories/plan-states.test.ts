import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseHandle, StoryMapperRepository, UnitOfWork, createRedactedSnapshot, createRestorePoint, databaseSchemaVersion, openExistingStoryMapperDb, openStoryMapperDb, restoreProject, validateRestoreDatabase } from "@storymapper/db";

const actor = { actorType: "human", actorId: "plan-state-fixture" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-plan-states-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const uow = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const data = uow.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Recorded cut" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Canonical map" });
    const release = tx.createRelease({ storyMapId: map.id, name: "First release" });
    const story = tx.createCard({ storyMapId: map.id, level: "story", title: "Captured Story", releaseId: release.id });
    return { project, map, release, story };
  });
  return { directory, path, handle, uow, repository, ...data };
}

it("reads shared status evidence once for a Plan-state projection", () => {
  const data = fixture();
  data.uow.run(actor, ({ repository }) => { for (const title of ["Second", "Third"]) repository.createCard({ storyMapId: data.map.id, level: "story", title }); });
  const links = vi.spyOn(data.repository, "listRemoteWorkItemLinksForStoryMap");
  const definitions = vi.spyOn(data.repository, "listWorkflowStatuses");
  expect(data.repository.getPlanStateProjection(data.map.id).cards).toHaveLength(3);
  expect(links).toHaveBeenCalledTimes(1);
  expect(definitions).toHaveBeenCalledTimes(1);
});

it("records one attributed immutable canonical state without changing domain or sync versions, surviving edits/deletion and reopening", () => {
  const data = fixture();
  const before = data.repository.getStoryMapSnapshot(data.map.id)!;
  const state = data.uow.run(actor, ({ repository }) => repository.capturePlanState(data.map.id));
  expect(data.repository.getStoryMapSnapshot(data.map.id)).toMatchObject({ storyMap: before.storyMap, cards: before.cards, releases: before.releases, externalRefs: before.externalRefs });
  expect(state.actor).toBe(actor.actorId);
  expect(state.payload.storyIds).toEqual([data.story.id]);
  const { payload: capturedPayload, ...capturedSummary } = state;
  expect(data.repository.listActivity().filter((event) => event.action === "planState.recorded")).toMatchObject([{ affectedEntityId: state.id, actor: actor.actorId, actorType: "human", after: capturedSummary }]);
  expect(JSON.stringify(data.repository.listActivity().filter((event) => event.action === "planState.recorded"))).not.toContain(data.story.title);
  data.uow.run(actor, ({ repository }) => {
    repository.updateRelease(data.release.id, { name: "Renamed release" });
    repository.deleteCard(data.story.id, { strategy: "unassign" });
    repository.deleteRelease(data.release.id);
  });
  const reopened = openExistingStoryMapperDb(data.path);
  try {
    const repository = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(repository.getPlanState(data.map.id, state.id)).toEqual(state);
    const { payload, ...summary } = state;
    expect(repository.listPlanStates(data.map.id)).toEqual([summary]);
  } finally { reopened.$client.close(); }
});

it("rejects Agent captures and rolls back state insertion when its audit fails", () => {
  const data = fixture();
  expect(() => data.uow.run({ actorType: "agent", actorId: "capture-agent" }, ({ repository }) => repository.capturePlanState(data.map.id))).toThrow("human-only");
  expect(() => data.uow.run(actor, ({ repository }) => {
    vi.spyOn(repository, "logActivity").mockImplementation(() => { throw new Error("Audit insert refused"); });
    repository.capturePlanState(data.map.id);
  })).toThrow("Audit insert refused");
  expect(data.repository.listPlanStates(data.map.id)).toEqual([]);
  expect(data.repository.listActivity().filter((event) => event.action === "planState.recorded")).toEqual([]);
});

it("refuses to persist an unusable state when canonical data has a foreign-map Release assignment", () => {
  const data = fixture();
  const foreignRelease = data.uow.run(actor, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: data.project.id, name: "Foreign release map" });
    return repository.createRelease({ storyMapId: map.id, name: "Foreign release" });
  });
  data.handle.current.$client.prepare("UPDATE cards SET release_id = ? WHERE id = ?").run(foreignRelease.id, data.story.id);
  expect(() => data.uow.run(actor, ({ repository }) => repository.capturePlanState(data.map.id))).toThrow("inconsistent captured ownership");
  expect(data.repository.listPlanStates(data.map.id)).toEqual([]);
  expect(data.repository.listActivity().filter((event) => event.action === "planState.recorded")).toEqual([]);
});

it("rejects foreign-map reads, unsupported payload versions and inconsistent captured membership in reads and Restore validation", () => {
  const data = fixture();
  const state = data.uow.run(actor, ({ repository }) => repository.capturePlanState(data.map.id));
  const other = data.uow.run(actor, ({ repository }) => repository.createStoryMap({ projectId: data.project.id, name: "Other map" }));
  expect(() => data.repository.getPlanState(other.id, state.id)).toThrow("not found");
  const client = data.handle.current.$client;
  client.prepare("UPDATE plan_states SET schema_version = 2 WHERE id = ?").run(state.id);
  expect(() => data.repository.getPlanState(data.map.id, state.id)).toThrow("unsupported schema");
  expect(() => data.repository.listPlanStates(data.map.id)).toThrow("unsupported schema");
  expect(() => validateRestoreDatabase(client, databaseSchemaVersion(client))).toThrow("Unsupported stored JSON payload version");
  client.prepare("UPDATE plan_states SET schema_version = 1, payload_json = ? WHERE id = ?").run(JSON.stringify({ ...state.payload, storyIds: [] }), state.id);
  expect(() => data.repository.getPlanState(data.map.id, state.id)).toThrow("active Story cut");
  client.prepare("UPDATE plan_states SET payload_json = ? WHERE id = ?").run(JSON.stringify({ ...state.payload, storyMap: { ...state.payload.storyMap, id: other.id } }), state.id);
  expect(() => validateRestoreDatabase(client, databaseSchemaVersion(client))).toThrow("ownership");
});

it("rejects corrupt captured dependencies, duplicate Cards and foreign workflow statuses in reads and Restore validation", () => {
  const data = fixture();
  const second = data.uow.run(actor, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "story", title: "Second Story", releaseId: data.release.id }));
  const state = data.uow.run(actor, ({ repository }) => repository.capturePlanState(data.map.id));
  const edge = (cardId: string, prerequisiteCardId: string) => ({ id: randomUUID(), cardId, prerequisiteCardId, createdAt: state.capturedAt });
  const forward = edge(data.story.id, second.id);
  const corruptions = [
    ["invalid captured dependencies", { cardDependencies: [edge(data.story.id, randomUUID())] }],
    ["invalid captured dependencies", { cardDependencies: [forward, edge(forward.cardId, forward.prerequisiteCardId)] }],
    ["invalid captured dependencies", { cardDependencies: [forward, edge(second.id, data.story.id)] }],
    ["inconsistent captured ownership", { cards: [...state.payload.cards, state.payload.cards[0]] }],
    ["inconsistent captured ownership", { workflowStatuses: [{ ...state.payload.workflowStatuses[0], projectId: randomUUID() }] }]
  ] as const;
  const client = data.handle.current.$client;
  for (const [message, corruption] of corruptions) {
    client.prepare("UPDATE plan_states SET payload_json = ? WHERE id = ?").run(JSON.stringify({ ...state.payload, ...corruption }), state.id);
    expect(() => data.repository.getPlanState(data.map.id, state.id)).toThrow(message);
    expect(() => validateRestoreDatabase(client, databaseSchemaVersion(client))).toThrow(message);
  }
});

it("lists capture metadata without hydrating payload JSON while enforcing stored Project ownership", () => {
  const data = fixture();
  const state = data.uow.run(actor, ({ repository }) => repository.capturePlanState(data.map.id));
  const { payload, ...summary } = state;
  data.handle.current.$client.prepare("UPDATE plan_states SET payload_json = '{' WHERE id = ?").run(state.id);
  expect(data.repository.listPlanStates(data.map.id)).toEqual([summary]);
  expect(() => data.repository.getPlanState(data.map.id, state.id)).toThrow("invalid JSON");
  const other = data.uow.run(actor, ({ repository }) => repository.createProject({ name: "Foreign state owner" }));
  data.handle.current.$client.prepare("UPDATE plan_states SET project_id = ? WHERE id = ?").run(other.id, state.id);
  expect(() => data.repository.listPlanStates(data.map.id)).toThrow("ownership");
});

it("retains only the selected Project's captured states in portable archive snapshots", () => {
  const data = fixture();
  const state = data.uow.run(actor, ({ repository }) => repository.capturePlanState(data.map.id));
  data.uow.run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Excluded Project" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Excluded map" });
    repository.capturePlanState(map.id);
  });
  const archive = createRedactedSnapshot(data.path, data.project.id);
  const database = openExistingStoryMapperDb(archive.snapshotPath);
  try {
    const repository = new StoryMapperRepository(new DatabaseHandle(database));
    expect(repository.getPlanState(data.map.id, state.id)).toEqual(state);
    expect(database.$client.prepare("SELECT id FROM plan_states").all()).toEqual([{ id: state.id }]);
  } finally { database.$client.close(); rmSync(archive.snapshotPath); }
});

it("Restore returns the recorded point-in-time state set while retaining later capture audit as undone", async () => {
  const data = fixture();
  const before = data.uow.run(actor, ({ repository }) => repository.capturePlanState(data.map.id));
  const point = createRestorePoint(data.handle, "manual");
  const after = data.uow.run(actor, ({ repository }) => repository.capturePlanState(data.map.id));
  await restoreProject(data.handle, data.project.id, point.fileName, actor);
  expect(data.repository.getPlanState(data.map.id, before.id)).toEqual(before);
  expect(() => data.repository.getPlanState(data.map.id, after.id)).toThrow("not found");
  expect(data.repository.listActivity().filter((event) => event.action === "planState.recorded")).toMatchObject([
    { affectedEntityId: before.id, undoneByRestore: false }, { affectedEntityId: after.id, undoneByRestore: true }
  ]);
});
