import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { referenceOperationSnapshot } from "@storymapper/db/fixtures/operation-snapshot-reference";
import * as tables from "@storymapper/db/schema";

const ACTOR = { actorType: "human", actorId: "scope-parity" } as const;
const TIME = "2026-10-17T12:00:00.000Z";
const cleanup: Array<() => void> = [];
afterEach(() => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-snapshot-scope-"));
  const database = openStoryMapperDb(join(directory, "storymapper.sqlite"));
  cleanup.push(() => { database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const handle = new DatabaseHandle(database);
  return { database, repository: new StoryMapperRepository(handle), uow: new UnitOfWork(handle) };
}
type Fixture = ReturnType<typeof fixture>;

function roots(data: Fixture, name: string) {
  return data.uow.run(ACTOR, ({ repository }) => {
    const project = repository.createProject({ name });
    const map = repository.createStoryMap({ projectId: project.id, name });
    const secondMap = repository.createStoryMap({ projectId: project.id, name: `${name} second` });
    const card = repository.createCard({ storyMapId: map.id, level: "activity", title: name }, "human");
    const secondCard = repository.createCard({ storyMapId: secondMap.id, level: "activity", title: `${name} second` }, "human");
    const lastCard = repository.createCard({ storyMapId: map.id, level: "activity", title: `${name} last`, position: 0 }, "human");
    const release = repository.createRelease({ storyMapId: map.id, name });
    const persona = repository.createPersona({ projectId: project.id, storyMapId: map.id, name });
    const roadmap = repository.createRoadmap({ projectId: project.id, storyMapId: map.id, name });
    return { project, map, secondMap, card, secondCard, lastCard, release, persona, roadmap };
  });
}
type Roots = ReturnType<typeof roots>;

function populate(data: Fixture, root: Roots) {
  const db = data.database;
  const id = () => randomUUID();
  const connection = id(), run = id(), document = id(), chunk = id(), identity = id(), annotation = id();
  db.insert(tables.connectorConnections).values({ id: connection, projectId: root.project.id, provider: "github", name: "Recorded", authMode: "github-cli", owner: "scope", createdAt: TIME, updatedAt: TIME }).run();
  db.insert(tables.syncRuns).values({ id: run, projectId: root.project.id, storyMapId: root.map.id, connectionId: connection, provider: "github", mode: "sync", status: "applied", createdAt: TIME }).run();
  db.insert(tables.syncConflicts).values({ id: id(), externalRefId: identity, syncRunId: run, connectionId: connection, cardId: root.card.id, field: "title", localValueJson: '"Local"', remoteValueJson: '"Remote"', createdAt: TIME }).run();
  db.insert(tables.sourceDocuments).values({ id: document, projectId: root.project.id, title: "Recorded", type: "md", filePath: "recorded.md", fileHash: "a".repeat(64), importedAt: TIME }).run();
  db.insert(tables.sourceChunks).values({ id: chunk, documentId: document, locator: "L1", text: "Recorded requirement" }).run();
  db.insert(tables.cardSourceLinks).values({ id: id(), cardId: root.card.id, kind: "chunk", chunkId: chunk, createdAt: TIME }).run();
  db.insert(tables.externalRefs).values({ id: identity, entityType: "card", entityId: root.card.id, scopeId: root.map.id, system: "github", externalId: "https://github.com/scope/recorded/issues/1", syncedVersion: 1, createdAt: TIME }).run();
  db.insert(tables.cardGithubEvidence).values({ id: id(), cardId: root.lastCard.id, externalRefId: identity }).run();
  db.insert(tables.cardDependencies).values({ id: id(), cardId: root.lastCard.id, prerequisiteCardId: root.card.id, createdAt: TIME }).run();
  db.insert(tables.cardAttachments).values({ id: id(), cardId: root.card.id, label: "Recorded", filePath: "recorded.txt", createdAt: TIME }).run();
  db.insert(tables.cardPersonas).values({ id: id(), cardId: root.card.id, personaId: root.persona.id, createdAt: TIME }).run();
  const milestone = id();
  db.insert(tables.externalRefs).values({ id: milestone, entityType: "release", entityId: root.release.id, scopeId: root.map.id, system: "github", externalId: "https://github.com/scope/recorded/milestone/1", syncedVersion: 1, createdAt: TIME }).run();
  db.insert(tables.remoteWorkItemLinks).values({ id: id(), connectionId: connection, externalRefId: milestone }).run();
  db.insert(tables.annotations).values({ id: annotation, projectId: root.project.id, storyMapId: root.map.id, name: "Recorded", position: 0 }).run();
  db.insert(tables.cardAnnotations).values({ id: id(), cardId: root.card.id, annotationId: annotation, createdAt: TIME }).run();
  addScopedRows(data, root);
  const column = db.select().from(tables.roadmapColumns).where(eq(tables.roadmapColumns.roadmapId, root.roadmap.id)).get()!;
  const roadmapCard = id();
  db.insert(tables.roadmapCards).values({ id: roadmapCard, roadmapId: root.roadmap.id, columnId: column.id, title: "Recorded", position: 0 }).run();
  db.insert(tables.roadmapReferences).values({ id: id(), roadmapCardId: roadmapCard, targetType: "card", targetId: root.card.id }).run();
  return { connection, run, identity, document };
}

function addScopedRows(data: Fixture, root: Roots, mapId: string | null = null) {
  const db = data.database;
  const projectId = root.project.id;
  db.insert(tables.personas).values({ id: randomUUID(), projectId, storyMapId: mapId, name: "Project persona", role: "User" }).run();
  db.insert(tables.productContexts).values({ id: randomUUID(), projectId, storyMapId: mapId, updatedAt: TIME }).run();
  db.insert(tables.annotations).values({ id: randomUUID(), projectId, storyMapId: mapId, name: "Project annotation", position: 1 }).run();
  db.insert(tables.workflowStatuses).values({ id: randomUUID(), projectId, storyMapId: mapId, name: "Project status", group: "todo", position: 1 }).run();
  db.insert(tables.storyTemplates).values({ id: randomUUID(), projectId, storyMapId: mapId, name: "Project template", position: 1 }).run();
  db.insert(tables.roadmaps).values({ id: randomUUID(), projectId, storyMapId: mapId, name: "Project roadmap", createdAt: TIME, updatedAt: TIME }).run();
  for (const scopeId of [root.map.id, projectId, root.secondMap.id]) db.insert(tables.externalRefs).values({ id: randomUUID(), scopeId, entityId: randomUUID(), entityType: "persona", system: "recorded", externalId: randomUUID(), syncedVersion: 1, createdAt: TIME }).run();
}

function measure(data: Fixture, read: () => unknown) {
  let materializedRows = 0;
  const originalPrepare = data.database.$client.prepare.bind(data.database.$client);
  const spy = vi.spyOn(data.database.$client, "prepare").mockImplementation((sql) => {
    const statement = originalPrepare(sql);
    const originalAll = statement.all.bind(statement);
    vi.spyOn(statement, "all").mockImplementation((...parameters: unknown[]) => {
      const result = originalAll(...parameters);
      materializedRows += result.length;
      return result;
    });
    return statement;
  });
  const started = performance.now();
  try { return { snapshot: read(), materializedRows, elapsedMs: performance.now() - started }; }
  finally { spy.mockRestore(); }
}

it("matches the complete reference snapshot, insertion order, scoped/project-wide rows and malformed ownership", () => {
  const data = fixture();
  const target = roots(data, "Target");
  const foreign = roots(data, "Foreign");
  const targetRows = populate(data, target);
  const hiddenEvidence = randomUUID();
  data.database.insert(tables.cardGithubEvidence).values({ id: hiddenEvidence, cardId: target.card.id, externalRefId: targetRows.identity }).run();
  const foreignRows = populate(data, foreign);
  addScopedRows(data, target, target.map.id);
  addScopedRows(data, target, foreign.map.id);
  for (const card of [target.lastCard, target.secondCard, target.card]) {
    data.database.insert(tables.cardSourceLinks).values({ id: randomUUID(), cardId: card.id, kind: "note", note: card.title, createdAt: TIME }).run();
    if (card.id !== target.card.id) data.database.insert(tables.externalRefs).values({ id: randomUUID(), entityType: "card", entityId: card.id, scopeId: card.storyMapId, system: "github", externalId: "https://github.com/scope/ordered/issues/2", syncedVersion: 1, createdAt: TIME }).run();
    data.database.insert(tables.cardGithubEvidence).values({ id: randomUUID(), cardId: card.id, externalRefId: foreignRows.identity }).run();
  }
  const deleted = roots(data, "Deleted target map");
  data.database.update(tables.storyMaps).set({ projectId: target.project.id, deleted: true }).where(eq(tables.storyMaps.id, deleted.map.id)).run();
  addScopedRows(data, target, deleted.map.id);
  data.database.insert(tables.cardDependencies).values({ id: randomUUID(), cardId: target.card.id, prerequisiteCardId: foreign.card.id, createdAt: TIME }).run();
  data.database.insert(tables.syncConflicts).values({ id: randomUUID(), externalRefId: randomUUID(), syncRunId: targetRows.run, connectionId: targetRows.connection, cardId: foreign.card.id, field: "title", localValueJson: "null", remoteValueJson: "null", createdAt: TIME }).run();
  data.database.insert(tables.remoteWorkItemLinks).values({ id: randomUUID(), connectionId: foreignRows.connection, externalRefId: targetRows.identity }).run();
  const snapshot = data.repository.getOperationSnapshot(target.project.id);
  const reference = referenceOperationSnapshot.call(data.repository, target.project.id);
  for (const key of Object.keys(reference) as Array<keyof typeof reference>) expect(snapshot[key], key).toEqual(reference[key]);
  expect(snapshot.cards.map(({ id }) => id)).toEqual([target.card.id, target.secondCard.id, target.lastCard.id]);
  expect(snapshot.sourceLinks.filter(({ kind }) => kind === "github")).toHaveLength(5);
  expect(snapshot.sourceLinks).toContainEqual(expect.objectContaining({ id: hiddenEvidence, cardId: target.card.id }));
  expect(data.repository.getStoryMapSnapshot(target.map.id)!.sourceLinks.some((link) => link.id === hiddenEvidence)).toBe(false);
  expect(snapshot.cardDependencies).toHaveLength(1);
  expect(snapshot.syncConflicts).toHaveLength(1);
  expect(snapshot.remoteWorkItemLinks).toHaveLength(1);
  for (const collection of [snapshot.personas, snapshot.productContexts, snapshot.workflowStatuses, snapshot.annotations, snapshot.storyTemplates, snapshot.roadmaps]) {
    expect(collection.some((row) => row.storyMapId === foreign.map.id || row.storyMapId === deleted.map.id)).toBe(false);
    expect(collection.some((row) => row.storyMapId === null)).toBe(true);
  }
});

it("retains empty Project and unavailable Project behavior", () => {
  const data = fixture();
  const project = data.uow.run(ACTOR, ({ repository }) => repository.createProject({ name: "Empty" }));
  expect(data.repository.getOperationSnapshot(project.id)).toEqual(referenceOperationSnapshot.call(data.repository, project.id));
  expect(data.repository.getOperationSnapshot(project.id).cards).toEqual([]);
  expect(() => data.repository.getOperationSnapshot(randomUUID())).toThrow("Project not found");
  data.database.update(tables.projects).set({ historicalStub: true }).where(eq(tables.projects.id, project.id)).run();
  expect(() => data.repository.getOperationSnapshot(project.id)).toThrow("Project not found");
});

it("retains hidden-map link helper exclusions after SQL scoping", () => {
  const data = fixture();
  const root = roots(data, "Hidden map");
  populate(data, root);
  expect(data.repository.listGitHubLinksForStoryMap(root.map.id)).toHaveLength(2);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(root.map.id)).toHaveLength(1);
  data.database.update(tables.storyMaps).set({ deleted: true }).where(eq(tables.storyMaps.id, root.map.id)).run();
  expect(data.repository.listGitHubLinksForStoryMap(root.map.id)).toEqual([]);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(root.map.id)).toEqual([]);
  data.database.update(tables.storyMaps).set({ deleted: false }).where(eq(tables.storyMaps.id, root.map.id)).run();
  data.database.update(tables.projects).set({ historicalStub: true }).where(eq(tables.projects.id, root.project.id)).run();
  expect(data.repository.listGitHubLinksForStoryMap(root.map.id)).toHaveLength(2);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(root.map.id)).toHaveLength(1);
});

it("materializes no additional target rows after a large foreign Project is added", () => {
  const data = fixture();
  const target = roots(data, "Measured target");
  populate(data, target);
  const before = measure(data, () => data.repository.getOperationSnapshot(target.project.id));
  const foreign = roots(data, "Large foreign Project");
  const foreignRows = populate(data, foreign);
  const template = data.database.select().from(tables.cards).where(eq(tables.cards.id, foreign.card.id)).get()!;
  data.database.$client.transaction(() => {
    for (let index = 0; index < 2500; index += 1) {
      data.database.insert(tables.cards).values({ ...template, id: randomUUID(), key: `FOREIGN-${index}`, title: `Foreign ${index}` }).run();
      data.database.insert(tables.sourceChunks).values({ id: randomUUID(), documentId: foreignRows.document, locator: `L${index + 2}`, text: "Recorded requirement ".repeat(400) }).run();
    }
  })();
  const legacy = measure(data, () => referenceOperationSnapshot.call(data.repository, target.project.id));
  const after = measure(data, () => data.repository.getOperationSnapshot(target.project.id));
  expect(after.snapshot).toEqual(before.snapshot);
  expect(legacy.snapshot).toEqual(before.snapshot);
  expect(after.materializedRows).toBe(before.materializedRows);
  expect(legacy.materializedRows - after.materializedRows).toBeGreaterThanOrEqual(5000);
  console.log(JSON.stringify({ action: "A3", foreignCards: 2503, foreignExtraChunks: 2500,
    before: { rows: before.materializedRows, elapsedMs: before.elapsedMs },
    referenceAfter: { rows: legacy.materializedRows, elapsedMs: legacy.elapsedMs },
    scopedAfter: { rows: after.materializedRows, elapsedMs: after.elapsedMs } }));
});
