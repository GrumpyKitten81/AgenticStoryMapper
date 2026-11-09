import { splitTextIntoChunks } from "@storymapper/importers";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { changeOperationSchema, type ChangeOperation, type OperationSnapshot } from "@storymapper/contracts";
import { resolveOperation } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

const actor = { actorType: "human", actorId: "selector-parity" } as const;
const createdAt = "2026-10-11T12:00:00.000Z";
const cleanup: Array<() => void> = [];
afterEach(() => { vi.useRealTimers(); for (const close of cleanup.splice(0)) close(); });

function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(createdAt);
  const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
  cleanup.push(() => handle.current.$client.close());
  const repository = new StoryMapperRepository(handle);
  const uow = new UnitOfWork(handle);
  const roots = uow.run(actor, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Parity" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    const step = tx.createCard({ storyMapId: map.id, level: "step", title: "Step" });
    const story = tx.createCard({ storyMapId: map.id, level: "story", parentId: step.id, title: "Story", position: 2 });
    tx.createCard({ storyMapId: map.id, level: "note", parentId: step.id, title: "Note", position: 0 });
    const hidden = tx.createCard({ storyMapId: map.id, level: "story", parentId: step.id, title: "Archived", position: 0 });
    tx.archiveCard(hidden.id);
    return { project, map, step, story };
  });
  const snapshot: OperationSnapshot = { projectId: roots.project.id, projects: repository.listProjects(), storyMaps: repository.listStoryMaps(), cards: repository.listCardsInInsertionOrder(roots.map.id), releases: [], personas: [], connections: [], externalRefs: [], productContexts: [], sourceDocuments: [], sourceChunks: [], sourceLinks: [], githubLinks: [],
    roadmaps: [], roadmapColumns: [], roadmapSwimlanes: [], roadmapCards: [], roadmapReferences: [], annotations: [], workflowStatuses: [], storyTemplates: [],
    attachments: [], cardPersonas: [], cardAnnotations: [], cardDependencies: [], remoteWorkItemLinks: [] };
  return { ...roots, repository, uow, snapshot };
}

it("matches persisted insertion order when movement ties both position and createdAt", () => {
  const f = fixture();
  const operation = changeOperationSchema.parse({ operationId: "move", op: "move", entity: "card", entityId: f.story.id, after: { parentId: f.step.id, position: 0 } });
  const result = resolveOperation(f.snapshot, operation, { createdAt, creationOrigin: "manual", ids: {}, externalRefIds: {} });
  f.uow.run(actor, ({ repository }) => repository.moveCard(f.story.id, { parentId: f.step.id, position: 0 }));
  expect(result.state.cards).toEqual(f.repository.listCardsInInsertionOrder(f.map.id));
  expect(f.repository.getCardDetails(f.story.id)?.position).toBe(0);
});

function approvedChangeSet(f: ReturnType<typeof fixture>, operations: ChangeOperation[]) {
  return f.uow.run(actor, ({ repository }) => {
    const changeSet = repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, source: "mcp", title: "Evidence", status: "proposed", createdAt, operations });
    return repository.updateChangeSetStatus(changeSet.id, "approved")!;
  });
}

it("applies approved note, GitHub and nested literal-chunk operations with real source identities", () => {
  const f = fixture();
  const evidence = f.uow.run(actor, ({ repository }) => {
    const content = "Source requirement";
    const source = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(content), projectId: f.project.id, title: "Source", type: "txt", content, fileHash: createHash("sha256").update(content).digest("hex") });
    const github = repository.createGitHubLink({ cardId: f.step.id, repo: "org/repo", issueNumber: 7, url: "https://github.com/org/repo/issues/7" });
    return { chunkId: source.chunks[0]!.id, github };
  });
  const operations = [
    { operationId: "note", op: "link", entity: "sourceLink", entityId: "note-local", after: { kind: "note", cardId: f.story.id, note: "Reviewed evidence" } },
    { operationId: "github", op: "link", entity: "sourceLink", entityId: "github-local", after: { kind: "github", cardId: f.story.id, externalRefId: evidence.github.id } },
    { operationId: "chunk", op: "link", entity: "sourceLink", entityId: "chunk-local", after: { kind: "chunk", cardId: f.story.id, chunk: { kind: "chunk", chunkId: evidence.chunkId }, confidence: 0.75 } }
  ].map((entry) => changeOperationSchema.parse(entry));
  const changeSet = approvedChangeSet(f, operations);
  expect(f.uow.run(actor, ({ repository }) => repository.applyChangeSet(changeSet.id))?.status).toBe("applied");
  const links = f.repository.listSourceLinksForStoryMap(f.map.id).filter((link) => link.cardId === f.story.id);
  expect(links).toHaveLength(3);
  expect(links).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "note", note: "Reviewed evidence", cardId: f.story.id }),
    expect.objectContaining({ kind: "github", externalRefId: evidence.github.id, cardId: f.story.id, issueNumber: 7, repoFullName: "org/repo" }),
    expect.objectContaining({ kind: "chunk", chunkId: evidence.chunkId, cardId: f.story.id, confidence: 0.75 })
  ]));
  expect(f.repository.getGitHubLink(evidence.github.id)).toEqual(evidence.github);
  expect(f.repository.getCardDetails(f.story.id)).toMatchObject({ provenance: "linked", creationOrigin: "manual", version: 2 });
  const repeat = approvedChangeSet(f, operations);
  f.uow.run(actor, ({ repository }) => repository.applyChangeSet(repeat.id));
  expect(f.repository.listSourceLinksForStoryMap(f.map.id).filter((link) => link.cardId === f.story.id)).toEqual(links);
  expect(f.repository.getCardDetails(f.story.id)?.version).toBe(2);
});

it("refuses a missing prepared import dependency during approval without Card or evidence writes", () => {
  const f = fixture();
  const operations = [
    { operationId: "edit", op: "update", entity: "card", entityId: f.story.id, after: { title: "Must roll back" } },
    { operationId: "note", op: "link", entity: "sourceLink", entityId: "note-local", after: { kind: "note", cardId: f.story.id, note: "Must roll back" } },
    { operationId: "prepared", op: "link", entity: "sourceLink", entityId: "prepared-local", after: { kind: "chunk", cardId: f.story.id, chunk: { kind: "import", operationId: "earlier-import", locator: "L1" } } }
  ].map((entry) => changeOperationSchema.parse(entry));
  const changeSet = f.uow.run(actor, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, source: "mcp", title: "Missing dependency", status: "proposed", createdAt, operations }));
  const before = { cards: f.repository.listCardsInInsertionOrder(f.map.id), links: f.repository.listSourceLinksForStoryMap(f.map.id), history: f.repository.listCardHistory(f.story.id), activity: f.repository.listActivity(f.project.id), changeSet: f.repository.getChangeSet(changeSet.id) };
  expect(() => f.uow.run(actor, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"))).toThrow(/dependency.*unknown|unknown dependency/);
  expect({ cards: f.repository.listCardsInInsertionOrder(f.map.id), links: f.repository.listSourceLinksForStoryMap(f.map.id), history: f.repository.listCardHistory(f.story.id), activity: f.repository.listActivity(f.project.id), changeSet: f.repository.getChangeSet(changeSet.id) }).toEqual(before);
  expect(f.repository.getChangeSet(changeSet.id)?.status).toBe("proposed");
});

it("retains supported nonempty assignees through approved Card creation", () => {
  const f = fixture();
  const changeSet = approvedChangeSet(f, [changeOperationSchema.parse({ operationId: "assigned", op: "create", entity: "card", after: { storyMapId: f.map.id, level: "story", title: "Assigned", assignee: "owner" } })]);
  f.uow.run(actor, ({ repository }) => repository.applyChangeSet(changeSet.id));
  expect(f.repository.listCards(f.map.id).find((card) => card.title === "Assigned")?.assignee).toBe("owner");
});

it.each(["id", "local"] as const)("applies effective %s selectors and scoped external-reference execution", (kind) => {
  const f = fixture();
  const selector = kind === "id" ? { kind, id: f.story.id } : { kind, localId: f.story.id };
  const changeset = f.uow.run(actor, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, source: "mcp", title: "Selector", status: "proposed", createdAt, operations: [changeOperationSchema.parse({ operationId: "edit", op: "update", entity: "card", entityId: "unused", selector, after: { title: "Selected" } })] }));
  f.uow.run(actor, ({ repository }) => repository.updateChangeSetStatus(changeset.id, "approved"));
  f.uow.run(actor, ({ repository }) => repository.applyChangeSet(changeset.id));
  expect(f.repository.getCardDetails(f.story.id)?.title).toBe("Selected");
  const external = f.uow.run(actor, ({ repository }) => repository.createChangeSet({ ...changeset, id: randomUUID(), operations: [changeOperationSchema.parse({ ...changeset.operations[0], selector: { kind: "externalRef", scopeId: f.map.id, system: "bmad", externalId: "story" }, after: { title: "Externally selected" } })] }));
  f.uow.run(actor, ({ repository }) => repository.setExternalRef({ entityType: "card", entityId: f.story.id, system: "bmad", externalId: "story" }));
  f.uow.run(actor, ({ repository }) => repository.updateChangeSetStatus(external.id, "approved"));
  f.uow.run(actor, ({ repository }) => repository.applyChangeSet(external.id));
  expect(f.repository.getCardDetails(f.story.id)?.title).toBe("Externally selected");
});
