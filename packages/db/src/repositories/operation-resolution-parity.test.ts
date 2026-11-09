import { splitTextIntoChunks } from "@storymapper/importers";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ChangeOperation, OperationSnapshot } from "@storymapper/contracts";
import { resolveOperations } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

const ACTOR = { actorType: "human", actorId: "parity-human" } as const;
const TIME = "2026-10-11T12:00:00.000Z";
const cleanup: Array<() => void> = [];
afterEach(() => { vi.useRealTimers(); for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(TIME);
  const directory = mkdtempSync(join(tmpdir(), "storymapper-resolution-parity-"));
  const database = openStoryMapperDb(join(directory, "storymapper.sqlite"));
  cleanup.push(() => { database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const handle = new DatabaseHandle(database);
  const repository = new StoryMapperRepository(handle);
  const uow = new UnitOfWork(handle);
  const roots = uow.run(ACTOR, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Resolution parity" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    const activity = tx.createCard({ storyMapId: map.id, level: "activity", title: "Activity" }, "human");
    const step = tx.createCard({ storyMapId: map.id, level: "step", parentId: activity.id, title: "Step" }, "human");
    const story = tx.createCard({ storyMapId: map.id, level: "story", parentId: step.id, title: "Story" }, "human");
    return { project, map, activity, step, story };
  });
  return { ...roots, repository, uow };
}

type Fixture = ReturnType<typeof fixture>;
function snapshot(data: Fixture): OperationSnapshot {
  const { repository, project, map } = data;
  const documents = repository.listSourceDocumentSummaryData(project.id).map(({ document }) => repository.getSourceDocumentDetails(document.id)!);
  const roadmaps = repository.listRoadmaps(project.id);
  return { projectId: project.id, projects: repository.listProjects(), storyMaps: repository.listStoryMaps(project.id), cards: repository.listCardsInInsertionOrder(map.id),
    releases: repository.listReleases(map.id), personas: repository.listPersonasForProject(project.id), externalRefs: repository.listExternalRefsForStoryMap(map.id),
    productContexts: [], roadmaps, roadmapColumns: roadmaps.flatMap(({ id }) => repository.listRoadmapColumns(id)),
    roadmapSwimlanes: roadmaps.flatMap(({ id }) => repository.listRoadmapSwimlanes(id)), roadmapCards: roadmaps.flatMap(({ id }) => repository.listRoadmapCards(id)),
    roadmapReferences: roadmaps.flatMap(({ id }) => repository.listRoadmapReferences(id)), annotations: repository.listAnnotations(project.id, map.id),
    workflowStatuses: repository.listWorkflowStatuses(project.id, map.id), storyTemplates: repository.listStoryTemplates(project.id, map.id),
    attachments: repository.listCardAttachmentsForStoryMap(map.id), cardPersonas: repository.listCardPersonasForStoryMap(map.id),
    cardAnnotations: repository.listCardAnnotationsForStoryMap(map.id), cardDependencies: repository.listCardDependenciesForStoryMap(map.id), remoteWorkItemLinks: repository.listRemoteWorkItemLinksForStoryMap(map.id),
    sourceDocuments: documents.map(({ document }) => document), sourceChunks: documents.flatMap(({ chunks }) => chunks),
    sourceLinks: repository.listSourceLinksForStoryMap(map.id), githubLinks: repository.listGitHubLinksForStoryMap(map.id), connections: repository.listConnectorConnections(project.id) };
}

function assertParity(data: Fixture, before: OperationSnapshot, operations: ChangeOperation[], ids: Record<string, string> = {}) {
  const actual = snapshot(data);
  const resolved = resolveOperations(before, operations, { createdAt: TIME, creationOrigin: "manual", ids, externalRefIds: {} }).state;
  for (const card of resolved.cards) if (card.key.startsWith("NEW-")) card.key = actual.cards.find(({ id }) => id === card.id)!.key;
  const ordered = (state: OperationSnapshot) => Object.fromEntries(Object.entries({ ...state, cards: state.cards.map(normalizePersistedOptionalCardScalars) }).map(([key, value]) => [key, Array.isArray(value) ? [...value].sort((left, right) => left.id.localeCompare(right.id)) : value]));
  expect(ordered(resolved)).toEqual(ordered(actual));
}

function normalizePersistedOptionalCardScalars(card: OperationSnapshot["cards"][number]) {
  return { ...card, assignee: card.assignee ?? null, businessValue: card.businessValue ?? null, color: card.color ?? null,
    effort: card.effort ?? null, estimate: card.estimate ?? null, priority: card.priority ?? null };
}

it("matches real SQLite mixed sibling positions, ties and parked Card moves", () => {
  const data = fixture();
  const others = data.uow.run(ACTOR, ({ repository }) => {
    const note = repository.createCard({ storyMapId: data.map.id, parentId: data.step.id, level: "note", title: "Z note", position: 0 }, "human");
    const story = repository.createCard({ storyMapId: data.map.id, parentId: data.step.id, level: "story", title: "A story", position: 0 }, "human");
    repository.archiveCard(note.id);
    repository.parkCard(data.activity.id, { childStrategy: "unassign" });
    repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Other activity", position: 0 }, "human");
    repository.createCard({ storyMapId: data.map.id, level: "note", title: "Root note", position: 0 }, "human");
    return { note, story };
  });
  const before = snapshot(data);
  const operations: ChangeOperation[] = [
    { operationId: "move-story", op: "move", entity: "card", entityId: data.story.id, after: { parentId: data.step.id, position: 1 } },
    { operationId: "move-parked", op: "move", entity: "card", entityId: data.activity.id, after: { parentId: null, position: 10 } }
  ];
  data.uow.run(ACTOR, ({ repository }) => { repository.moveCard(data.story.id, { parentId: data.step.id, position: 1 }); repository.moveCard(data.activity.id, { parentId: null, position: 10 }); });
  assertParity(data, before, operations);
  expect(data.repository.getCardDetails(others.story.id)!.version).toBe(before.cards.find(({ id }) => id === others.story.id)!.version);
});

it("matches real SQLite Release reorder and repeated lane writes in one UnitOfWork", () => {
  const data = fixture();
  const releases = data.uow.run(ACTOR, ({ repository }) => ["First", "Second", "Third"].map((name) => repository.createRelease({ storyMapId: data.map.id, name })));
  const before = snapshot(data);
  const operations: ChangeOperation[] = [
    { operationId: "move-release", op: "update", entity: "release", entityId: releases[2]!.id, after: { position: 0 } },
    { operationId: "rename-release", op: "update", entity: "release", entityId: releases[2]!.id, after: { name: "Published" } }
  ];
  data.uow.run(ACTOR, ({ repository }) => { repository.updateRelease(releases[2]!.id, { position: 0 }); repository.updateRelease(releases[2]!.id, { name: "Published" }); });
  assertParity(data, before, operations);
});

it("matches real SQLite shared GitHub evidence removal and every affected Card root", () => {
  const data = fixture();
  const identity = data.uow.run(ACTOR, ({ repository }) => {
    const shared = repository.createCard({ storyMapId: data.map.id, level: "story", title: "Shared" }, "human");
    const identity = repository.createGitHubLink({ cardId: data.story.id, repo: "fixture/repository", issueNumber: 7, url: "https://github.com/fixture/repository/issues/7" });
    repository.createCardSourceLink(shared.id, { kind: "github", externalRefId: identity.id });
    return identity;
  });
  const before = snapshot(data);
  const operations: ChangeOperation[] = [{ operationId: "unlink-direct", op: "unlink", entity: "sourceLink", entityId: identity.id, after: { kind: "github", id: identity.id, cardId: data.story.id } }];
  data.uow.run(ACTOR, ({ repository }) => repository.deleteCardSourceLink(data.story.id, { kind: "github", id: identity.id }));
  assertParity(data, before, operations);
});

it("matches real SQLite multiple Card writes, create then edit, and deduplicated source evidence in one UnitOfWork", () => {
  const data = fixture();
  const source = data.uow.run(ACTOR, ({ repository }) => repository.importSourceDocument({ parsedChunks: splitTextIntoChunks("Provided requirement"), projectId: data.project.id, title: "Requirements", type: "txt", content: "Provided requirement", fileHash: createHash("sha256").update("Provided requirement").digest("hex") }));
  const before = snapshot(data);
  const operations: ChangeOperation[] = [
    { operationId: "update-title", op: "update", entity: "card", entityId: data.story.id, after: { title: "Updated" } },
    { operationId: "update-description", op: "update", entity: "card", entityId: data.story.id, after: { description: "Detailed" } },
    { operationId: "create-story", op: "create", entity: "card", entityId: "local-story", after: { storyMapId: data.map.id, parentId: data.step.id, level: "story", title: "Created" } },
    { operationId: "edit-created", op: "update", entity: "card", entityId: "local-story", after: { description: "Edited" } },
    { operationId: "link-chunk", op: "link", entity: "sourceLink", entityId: "chunk-link", after: { kind: "chunk", cardId: data.story.id, chunkId: source.chunks[0]!.id } },
    { operationId: "repeat-chunk", op: "link", entity: "sourceLink", entityId: "repeat-link", after: { kind: "chunk", cardId: data.story.id, chunkId: source.chunks[0]!.id } },
    { operationId: "link-note", op: "link", entity: "sourceLink", entityId: "note-link", after: { kind: "note", cardId: "local-story", note: "Reviewed requirement" } }
  ];
  const ids = data.uow.run(ACTOR, ({ repository }) => {
    repository.updateCard(data.story.id, { title: "Updated" }); repository.updateCard(data.story.id, { description: "Detailed" });
    const created = repository.createCard({ storyMapId: data.map.id, parentId: data.step.id, level: "story", title: "Created" }, "human");
    repository.updateCard(created.id, { description: "Edited" });
    const chunk = repository.createCardSourceLink(data.story.id, { kind: "chunk", chunkId: source.chunks[0]!.id })!;
    repository.createCardSourceLink(data.story.id, { kind: "chunk", chunkId: source.chunks[0]!.id });
    const note = repository.createCardSourceLink(created.id, { kind: "note", note: "Reviewed requirement" })!;
    return { "create-story": created.id, "link-chunk": chunk.id, "link-note": note.id };
  });
  assertParity(data, before, operations, ids);
});

it("refuses stale persisted local selectors using the actual target before any ChangeSet writes", () => {
  const data = fixture();
  const before = snapshot(data);
  const changeSet = data.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: data.project.id, title: "Stale local target", source: "mcp", status: "proposed", createdAt: TIME, operations: [
    { operationId: "local-stale", op: "update", entity: "card", entityId: data.activity.id, selector: { kind: "local", localId: data.story.id }, baseVersion: data.story.version + 20, after: { title: "Must not save" } }
  ] }));
    data.uow.run({ actorType: "human", actorId: "fixture-reviewer" }, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"));
  expect(() => data.uow.run(ACTOR, ({ repository }) => repository.applyChangeSet(changeSet.id))).toThrow("conflicts with newer changes");
  expect(snapshot(data)).toEqual(before);
  expect(data.repository.getChangeSet(changeSet.id)!.status).toBe("approved");
});

it("matches real SQLite last chunk and note unlink with one root bump and immutable creation origin", () => {
  const data = fixture();
  const links = data.uow.run(ACTOR, ({ repository }) => {
    const source = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks("Provided requirement"), projectId: data.project.id, title: "Requirements", type: "txt", content: "Provided requirement", fileHash: createHash("sha256").update("Provided requirement").digest("hex") });
    const chunk = repository.createCardSourceLink(data.story.id, { kind: "chunk", chunkId: source.chunks[0]!.id })!;
    const note = repository.createCardSourceLink(data.story.id, { kind: "note", note: "Reviewed requirement" })!;
    return { chunk, note };
  });
  const before = snapshot(data);
  const operations: ChangeOperation[] = [
    { operationId: "unlink-chunk", op: "unlink", entity: "sourceLink", entityId: links.chunk.id, after: { kind: "chunk", id: links.chunk.id, cardId: data.story.id } },
    { operationId: "unlink-note", op: "unlink", entity: "sourceLink", entityId: links.note.id, after: { kind: "note", id: links.note.id, cardId: data.story.id } }
  ];
  data.uow.run(ACTOR, ({ repository }) => { repository.deleteCardSourceLink(data.story.id, { kind: "chunk", id: links.chunk.id }); repository.deleteCardSourceLink(data.story.id, { kind: "note", id: links.note.id }); });
  assertParity(data, before, operations);
  expect(data.repository.getCardDetails(data.story.id)).toMatchObject({ provenance: "manual", creationOrigin: "manual" });
});

it("matches real SQLite Annotation relationships and deletion with coalesced Card versions", () => {
  const data = fixture();
  const annotation = data.uow.run(ACTOR, ({ repository }) => repository.createAnnotation({ projectId: data.project.id, name: "Reviewed" }));
  const before = snapshot(data);
  const operations: ChangeOperation[] = [
    { operationId: "annotate", op: "set", entity: "cardAnnotation", entityId: "annotation-link", after: { cardId: data.story.id, annotationId: annotation.id } },
    { operationId: "delete-annotation", op: "delete", entity: "annotation", entityId: annotation.id, after: { definitionBefore: annotation, affectedCards: [{ id: data.story.id, baseVersion: data.repository.getCardDetails(data.story.id)!.version }], confirmUnlink: true } }
  ];
  const ids = data.uow.run(ACTOR, ({ repository }) => {
    const link = repository.setCardAnnotation(data.story.id, annotation.id);
    repository.deleteAnnotation(annotation.id, { definitionBefore: annotation, affectedCards: [{ id: data.story.id, baseVersion: before.cards.find((card) => card.id === data.story.id)!.version }], confirmUnlink: true });
    return { annotate: link.id };
  });
  assertParity(data, before, operations, ids);
  expect(data.repository.getCardDetails(data.story.id)!.version).toBe(before.cards.find(({ id }) => id === data.story.id)!.version + 1);
});

it("matches real SQLite park/unpark and archive/unarchive in one UnitOfWork", () => {
  const data = fixture();
  const before = snapshot(data);
  const operations: ChangeOperation[] = [
    { operationId: "park", op: "park", entity: "card", entityId: data.activity.id, after: { childStrategy: "unassign" } },
    { operationId: "unpark", op: "unpark", entity: "card", entityId: data.activity.id, after: {} },
    { operationId: "archive", op: "archive", entity: "card", entityId: data.story.id, after: {} },
    { operationId: "unarchive", op: "unarchive", entity: "card", entityId: data.story.id, after: { status: "planned" } }
  ];
  data.uow.run(ACTOR, ({ repository }) => {
    repository.parkCard(data.activity.id, { childStrategy: "unassign" });
    repository.unparkCard(data.activity.id);
    repository.archiveCard(data.story.id);
    repository.updateCard(data.story.id, { archived: false, status: "planned" });
  });
  assertParity(data, before, operations);
});
