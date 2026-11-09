import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork, createRestorePoint, restoreProject } from "@storymapper/db";
import { activityChangesQuerySchema } from "@storymapper/contracts";
import type { ChangeOperation } from "@storymapper/contracts";

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach((close) => close()));
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "changes-feed-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const uow = new UnitOfWork(handle), repository = new StoryMapperRepository(handle);
  const own = { actorType: "human", actorId: "local", originClientId: randomUUID() } as const;
  const other = { actorType: "human", actorId: "local", originClientId: randomUUID() } as const;
  const project = uow.run(own, ({ repository }) => repository.createProject({ name: "Feed fixture" }));
  const foreign = uow.run(own, ({ repository }) => repository.createProject({ name: "Other Project" }));
  const map = uow.run(own, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const query = activityChangesQuerySchema.parse({ projectId: project.id, originClientId: own.originClientId, limit: 2 });
  return { handle, uow, repository, own, other, project, foreign, map, query };
}
it("keeps origin and Project gaps, drains a fixed ascending cut, and does not leak snapshots or rollback events", () => {
  const f = fixture();
  const write = (title: string) => f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title }));
  write("A");
  f.uow.run(f.other, ({ repository }) => repository.createStoryMap({ projectId: f.foreign.id, name: "Foreign event" }));
  f.uow.run(f.own, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Own" }));
  write("B"); write("C");
  const first = f.repository.listActivityChanges(f.query);
  write("Concurrent");
  const next = f.repository.listActivityChanges({ ...f.query, epoch: first.epoch, highWater: first.highWater, afterSeq: first.nextAfterSeq! });
  expect([...first.events, ...next.events].map((event) => event.cards?.[0]?.title)).toEqual(["A", "B", "C"]);
  expect(first.events.every((event) => event.originClientId === f.other.originClientId && !("before" in event) && !("after" in event))).toBe(true);
  expect(next.nextAfterSeq).toBeNull();
  expect(() => f.uow.run(f.other, ({ repository }) => { repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Rollback" }); throw new Error("rollback"); })).toThrow("rollback");
  expect(f.repository.listActivityChanges({ ...f.query, limit: 100 }).events.map((event) => event.cards?.[0]?.title)).not.toContain("Rollback");
  expect(f.repository.listActivityPage({ projectId: f.project.id, limit: 2 }, { includeRuntime: true }).nextCursor).not.toBeNull();
});
it("uses the actual global Restore boundary for every Project, fresh browsers and stale paged reads", async () => {
  const f = fixture();
  const point = createRestorePoint(f.handle, "manual");
  f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Undone" }));
  const before = f.repository.listActivityChanges(f.query);
  await restoreProject(f.handle, f.foreign.id, point.fileName, f.own);
  const restored = f.repository.listActivityChanges({ ...f.query, epoch: before.epoch, highWater: before.highWater });
  expect(restored.epoch).not.toBe(before.epoch);
  expect(restored.events).toEqual([]);
  expect(restored.floor).toBeGreaterThan(0);
  f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "After Restore" }));
  expect(f.repository.listActivityChanges(f.query).events.map((event) => event.cards?.[0]?.title)).toEqual(["After Restore"]);
});
it.each(["proposal", "execution", "none"])("links only a genuine applied Agent snapshot (Agent %s) and reports retention loss", async (association) => {
  const f = fixture();
  f.uow.run(f.own, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "apply" }));
  const agent = { actorType: "agent", actorId: "Agent", mcpSessionId: "agent-session" } as const;
  const proposal = f.uow.run(association === "proposal" ? agent : f.other, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Agent-associated edit", source: "mcp", createdAt: new Date().toISOString(), operations: [{ operationId: "create", op: "create", entity: "card", entityId: "new-card", after: { storyMapId: f.map.id, title: "Applied card", level: "activity" } }] }));
  const deps = { repository: f.repository, unitOfWork: f.uow };
  const { approveChangeSet, applyChangeSet } = await import("@storymapper/server/application/changeset/changeset.use-cases");
  approveChangeSet(deps, f.other, proposal.id);
  const applied = applyChangeSet(deps, association === "execution" ? agent : f.other, proposal.id).changeSet;
  const fileName = applied.execution!.restorePoint!;
  const feed = () => f.repository.listActivityChanges({ ...f.query, limit: 100 }).events.find((event) => event.action === "changeSet.operation.applied");
  expect(feed()?.actorType).toBe(association === "execution" ? "agent" : "human");
  if (association === "none") return expect(feed()?.restorePoint).toBeUndefined();
  expect(feed()?.restorePoint).toEqual({ fileName, available: true });
  rmSync(join(f.handle.current.$client.name, "..", "snapshots", fileName));
  expect(feed()?.restorePoint).toEqual({ fileName, available: false });
});
it("rejects impossible same-epoch snapshots and floors a persisted cursor from a previous epoch", async () => {
  const f = fixture();
  const point = createRestorePoint(f.handle, "manual");
  const head = f.repository.listActivityChanges(f.query);
  const invalid = "Invalid activity snapshot high-water.";
  expect(() => f.repository.listActivityChanges({ ...f.query, highWater: head.highWater + 1 })).toThrow(invalid);
  expect(() => f.repository.listActivityChanges({ ...f.query, highWater: head.highWater, afterSeq: head.highWater + 1 })).toThrow(invalid);
  await restoreProject(f.handle, f.project.id, point.fileName, f.own);
  const restored = f.repository.listActivityChanges(f.query);
  expect(() => f.repository.listActivityChanges({ ...f.query, epoch: restored.epoch, highWater: restored.floor - 1 })).toThrow(invalid);
  f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "After Restore" }));
  const stale = f.repository.listActivityChanges({ ...f.query, epoch: head.epoch, afterSeq: head.highWater + 100 });
  expect(stale.events.map((event) => event.cards?.[0]?.title)).toEqual(["After Restore"]);
});

it("retains committed names for renamed and physically deleted Cards without manufacturing non-Card identities", () => {
  const f = fixture();
  const card = f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Original committed name" }));
  f.uow.run(f.other, ({ repository }) => repository.updateCard(card.id, { title: "Renamed committed name" }));
  f.uow.run(f.other, ({ repository }) => repository.deleteCard(card.id, { strategy: "unassign" }));
  f.uow.run(f.other, ({ repository }) => repository.createRelease({ storyMapId: f.map.id, name: "Committed Release" }));
  const events = f.repository.listActivityChanges({ ...f.query, limit: 100 }).events;
  expect(events.filter((event) => event.affectedEntityType === "card").map((event) => event.cards?.[0]?.title)).toEqual(["Original committed name", "Renamed committed name", "Renamed committed name"]);
  expect(events.find((event) => event.affectedEntityType === "release")?.cards).toBeUndefined();
  expect(f.repository.getCard(card.id)).toBeUndefined();
});
it("projects generic applied bulk, Card-owned child and delete changes from immutable operation evidence", async () => {
  const f = fixture();
  const [first, second] = ["First actual Card", "Second actual Card"].map((title) => f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title })));
  const agent = { actorType: "agent", actorId: "Generic Agent", mcpSessionId: "generic-session" } as const;
  const persona = f.uow.run(f.own, ({ repository }) => { repository.updateSafetySettings(f.project.id, { agentMode: "apply" }); return repository.createPersona({ projectId: f.project.id, name: "Actual persona", goals: [], pains: [] }); });
  const proposal = f.uow.run(agent, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Bulk and relationship", source: "mcp", createdAt: new Date().toISOString(), operations: [
    { operationId: "bulk", op: "bulk", entity: "card", entityId: "batch", after: { storyMapId: f.map.id, cards: [first!, second!].map((card) => ({ id: card.id, baseVersion: card.version })), patch: { status: "active" } } },
    { operationId: "relationship", op: "set", entity: "cardPersona", entityId: "relationship-link", after: { cardId: first!.id, personaId: persona.id } },
    { operationId: "remove", op: "delete", entity: "card", entityId: second!.id, after: { strategy: "unassign" } }
  ] }));
  const { approveChangeSet, applyChangeSet } = await import("@storymapper/server/application/changeset/changeset.use-cases");
  const deps = { repository: f.repository, unitOfWork: f.uow };
  approveChangeSet(deps, f.other, proposal.id); applyChangeSet(deps, f.other, proposal.id);
  f.uow.run(f.other, ({ repository }) => repository.updateCard(first!.id, { title: "Mutable later name" }));
  const operations = f.repository.listActivityChanges({ ...f.query, limit: 100 }).events.filter((event) => event.action === "changeSet.operation.applied");
  expect(operations).toHaveLength(3);
  expect(operations.find((event) => event.affectedEntityId === "bulk")?.cards).toMatchObject([{ id: first!.id, title: "First actual Card", changes: [{ field: "status", before: "todo", after: "active" }], navigation: { storyMapId: f.map.id, mapName: "Map", key: first!.key } }, { id: second!.id, title: "Second actual Card", availability: "deleted" }]);
  expect(operations.find((event) => event.affectedEntityId === "relationship")?.cards).toMatchObject([{ id: first!.id, actions: ["cardPersona.created"] }]);
  expect(operations.find((event) => event.affectedEntityId === "relationship")?.cards?.[0]?.title).toBeUndefined();
  expect(operations.find((event) => event.affectedEntityId === "remove")?.cards).toMatchObject([{ id: second!.id, title: "Second actual Card", availability: "deleted", action: "card.deleted" }]);
  expect(f.repository.getCard(second!.id)).toBeUndefined();
});

async function applyOperations(f: ReturnType<typeof fixture>, operations: ChangeOperation[]) {
  f.uow.run(f.own, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "apply" }));
  const proposal = f.uow.run(f.other, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Actual mixed operation", source: "mcp", createdAt: new Date().toISOString(), operations }));
  const { approveChangeSet, applyChangeSet } = await import("@storymapper/server/application/changeset/changeset.use-cases");
  const deps = { repository: f.repository, unitOfWork: f.uow };
  approveChangeSet(deps, f.other, proposal.id); applyChangeSet(deps, f.other, proposal.id);
  return f.repository.listActivityChanges({ ...f.query, limit: 100 }).events.filter((event) => event.action === "changeSet.operation.applied" && operations.some((operation) => event.affectedEntityId === operation.operationId));
}

it("retains actual dependency and bulk child evidence alongside Card updates without relation IDs", async () => {
  const f = fixture();
  const [first, second] = ["Dependent", "Prerequisite"].map((title) => f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title })));
  const persona = f.uow.run(f.own, ({ repository }) => repository.createPersona({ projectId: f.project.id, name: "Actual persona", goals: [], pains: [] }));
  const dependency = await applyOperations(f, [{ operationId: "dependency", entity: "cardDependency", op: "set", after: { cardId: { kind: "id", id: first!.id }, prerequisiteCardId: { kind: "id", id: second!.id } } }]);
  expect(dependency[0]!.cards).toMatchObject([{ id: first!.id, actions: ["cardDependency.created"] }, { id: second!.id, actions: ["cardDependency.created"] }]);
  const bulk = await applyOperations(f, [{ operationId: "bulk", entity: "card", entityId: "batch", op: "bulk", after: { storyMapId: f.map.id, cards: [{ id: first!.id, baseVersion: f.repository.getCard(first!.id)!.version }], patch: { status: "active", addPersonaId: persona.id } } }]);
  expect(bulk[0]!.cards).toMatchObject([{ id: first!.id, changes: [{ field: "status", before: "todo", after: "active" }], actions: ["cardPersona.created"] }]);
  expect(JSON.stringify(bulk[0]!.cards)).not.toContain(persona.id);
});

it("preserves Release deletion and Card unassignment as independent targets of the actual mixed operation", async () => {
  const f = fixture();
  const release = f.uow.run(f.other, ({ repository }) => repository.createRelease({ storyMapId: f.map.id, name: "Historical Release" }));
  const card = f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Assigned Card", releaseId: release.id }));
  const events = await applyOperations(f, [{ operationId: "delete-release", entity: "release", op: "delete", entityId: release.id, after: {} }]);
  expect(events[0]!.cards).toMatchObject([{ id: card.id, changes: [{ field: "releaseId" }] }]);
  expect(events[0]!.projectTargets).toEqual([{ subject: { type: "release", id: release.id, name: "Historical Release" }, action: "release.deleted", changes: [] }]);
  const noop = await applyOperations(f, [{ operationId: "noop", entity: "card", op: "update", entityId: card.id, baseVersion: f.repository.getCard(card.id)!.version, after: { status: "todo" } }]);
  expect(noop[0]!.cards).toBeUndefined(); expect(noop[0]!.projectTargets).toEqual([]);
});

it("excludes actual Project no-ops and unchanged evidence without hiding unsupported substantive fields", async () => {
  const f = fixture();
  const release = f.uow.run(f.other, ({ repository }) => repository.createRelease({ storyMapId: f.map.id, name: "Unchanged Release" }));
  const noop = await applyOperations(f, [{ operationId: "noop-release", entity: "release", op: "update", entityId: release.id, baseVersion: release.version, after: { name: release.name } }]);
  expect(noop[0]!.projectTargets).toEqual([]);
  const documentId = randomUUID(), before = { id: documentId, title: "Historical document", contentHash: "old" };
  f.uow.run(f.other, ({ repository }) => repository.logActivity(f.project.id, "changeSet.operation.applied", "changeSet", "document-evidence", undefined, { changes: [
    { entity: "release", entityId: release.id, before: release, after: { ...release, version: release.version + 1, updatedAt: new Date().toISOString() } },
    { entity: "sourceDocument", entityId: documentId, before, after: { ...before, contentHash: "new" } }
  ] }));
  const evidence = f.repository.listActivityChanges({ ...f.query, limit: 100 }).events.find((event) => event.affectedEntityId === "document-evidence")!;
  expect(evidence.projectTargets).toEqual([{ subject: { type: "sourceDocument", id: documentId, name: "Historical document" }, action: "sourceDocument.updated" }]);
});
it("keeps actual owner identity for direct Card-child Activity without inventing a retained name", () => {
  const f = fixture();
  const card = f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Owner" }));
  const persona = f.uow.run(f.own, ({ repository }) => repository.createPersona({ projectId: f.project.id, name: "Actual persona", goals: [], pains: [] }));
  f.uow.run(f.other, ({ repository }) => repository.setCardPersona(card.id, persona.id));
  const event = f.repository.listActivityChanges({ ...f.query, limit: 100 }).events.find((event) => event.action === "cardPersona.created");
  expect(event?.cards).toMatchObject([{ id: card.id, navigation: { key: card.key, storyMapId: f.map.id, mapName: f.map.name, availability: "available" } }]);
  expect(event?.cards?.[0]?.title).toBeUndefined();
});
it("projects both committed dependency endpoints for set and unset without inferring names", () => {
  const f = fixture();
  const dependent = f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Dependent" }));
  const prerequisite = f.uow.run(f.other, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Prerequisite" }));
  f.uow.run(f.other, ({ repository }) => repository.mutateCardDependency(dependent.id, prerequisite.id, true));
  f.uow.run(f.other, ({ repository }) => repository.mutateCardDependency(dependent.id, prerequisite.id, false));
  const dependencies = f.repository.listActivityChanges({ ...f.query, limit: 100 }).events.filter((event) => event.affectedEntityType === "cardDependency");
  expect(dependencies.map((event) => event.action)).toEqual(["card.dependency.set", "card.dependency.unset"]);
  expect(dependencies.map((event) => event.cards)).toMatchObject(Array.from({ length: 2 }, () => [{ id: dependent.id }, { id: prerequisite.id }]));
  expect(dependencies.flatMap((event) => event.cards ?? []).every((card) => card.title === undefined && card.navigation?.storyMapId === f.map.id)).toBe(true);
});
