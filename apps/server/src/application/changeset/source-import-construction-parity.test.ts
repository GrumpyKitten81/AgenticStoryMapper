import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { changeOperationSchema, type OperationSnapshot, type SourceDocument } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { splitMarkdownIntoChunks, splitTextIntoChunks } from "@storymapper/importers";
import { prepareSourceOperations } from "@storymapper/server/application/changeset/prepare-operation-supply";
import { applyChangeSet, approveChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";

const HUMAN = { actorType: "human", actorId: "source-parity" } as const;
const AGENT = { actorType: "agent", actorId: "source-parity-agent", mcpSessionId: "source-parity-session" } as const;
const CONTENT = "# Parent\n\n## Child\n\nEvidence.\n\nSecond paragraph.";
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach((close) => close()));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-source-parity-"));
  const database = openStoryMapperDb(join(directory, "storymapper.sqlite"));
  cleanup.push(() => { database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const handle = new DatabaseHandle(database);
  const unitOfWork = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const roots = unitOfWork.run(HUMAN, ({ repository }) => {
    const project = repository.createProject({ name: "Source parity" });
    repository.updateSafetySettings(project.id, { agentMode: "apply" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Evidence" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Evidence" }, "human");
    return { project, card };
  });
  return { ...roots, repository, unitOfWork };
}
type Fixture = ReturnType<typeof fixture>;

function prepare(snapshot: OperationSnapshot, type: SourceDocument["type"], content: string, documentId: string, importedAt: string, filePath?: string) {
  const operation = changeOperationSchema.parse({ operationId: "source", op: "import", entity: "sourceDocument", after: {
    projectId: snapshot.projectId, title: "Shared source", type, fileHash: hash(content), inlineContent: content, ...(filePath !== undefined ? { filePath } : {})
  } });
  const result = prepareSourceOperations([operation], snapshot, { createdAt: importedAt, creationOrigin: "inference", ids: { source: documentId }, externalRefIds: {} }, [operation.operationId]);
  expect(result.conflicts).toEqual([]);
  return result.supply.preparedSourceImports!.source!;
}

it.each(["markdown", "txt"] as const)("constructs identical Human and Agent %s documents/chunks with identical supplied identity, time and path", (type) => {
  const data = fixture();
  const before = data.repository.getOperationSnapshot(data.project.id);
  const human = data.unitOfWork.run(HUMAN, ({ repository }) => repository.importSourceDocument({ parsedChunks: type === "markdown" ? splitMarkdownIntoChunks(CONTENT) : splitTextIntoChunks(CONTENT), projectId: data.project.id, title: "Shared source", type, content: CONTENT, fileHash: hash(CONTENT), filePath: "documents/shared-source" }));
  const agent = prepare(before, type, CONTENT, human.document.id, human.document.importedAt, human.document.filePath);
  expect(agent).toEqual({ document: human.document, chunks: human.chunks });
  const parsed = type === "markdown" ? splitMarkdownIntoChunks(CONTENT) : splitTextIntoChunks(CONTENT);
  expect(agent.chunks.map(({ id, documentId, ...chunk }) => { expect(id).toBe(hash(`${documentId}:${chunk.locator}`)); return chunk; })).toEqual(parsed);
});

it.each(["markdown", "txt"] as const)("preserves intentional Human/Agent %s inline paths and their supplied identities/times", (type) => {
  const data = fixture();
  const before = data.repository.getOperationSnapshot(data.project.id);
  const human = data.unitOfWork.run(HUMAN, ({ repository }) => repository.importSourceDocument({ parsedChunks: type === "markdown" ? splitMarkdownIntoChunks(CONTENT) : splitTextIntoChunks(CONTENT), projectId: data.project.id, title: "Shared source", type, content: CONTENT, fileHash: hash(CONTENT) }));
  const allocatedId = randomUUID(), allocatedAt = "2026-10-11T12:00:00.000Z";
  const agent = prepare(before, type, CONTENT, allocatedId, allocatedAt);
  expect(human.document.filePath).toBe("inline://shared-source");
  expect(agent.document).toMatchObject({ id: allocatedId, importedAt: allocatedAt, filePath: "inline://reviewed-source" });
  expect(human.document.id).not.toBe(allocatedId);
  expect(human.document.importedAt).not.toBe(allocatedAt);
  expect(agent.chunks.map(({ id }) => id)).not.toEqual(human.chunks.map(({ id }) => id));
  expect(agent.chunks.map(({ id: _id, documentId: _documentId, ...chunk }) => chunk)).toEqual(human.chunks.map(({ id: _id, documentId: _documentId, ...chunk }) => chunk));
});

function applyAgentImport(data: Fixture, type: SourceDocument["type"], content: string, title: string) {
  const proposal = data.unitOfWork.run(AGENT, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: data.project.id,
    source: "mcp", title: "Reviewed source import", createdAt: new Date().toISOString(), operations: [{ operationId: "source", op: "import", entity: "sourceDocument", after: {
      projectId: data.project.id, title, type, inlineContent: content, fileHash: hash(content)
    } }] }));
  approveChangeSet(data, HUMAN, proposal.id);
  expect(applyChangeSet(data, HUMAN, proposal.id).changeSet?.status).toBe("applied");
}

it.each(["markdown", "txt"] as const)("deduplicates actual Human/Agent %s imports while retaining prior revision identities and linked evidence", (type) => {
  const data = fixture();
  const first = data.unitOfWork.run(HUMAN, ({ repository }) => repository.importSourceDocument({ parsedChunks: type === "markdown" ? splitMarkdownIntoChunks(CONTENT) : splitTextIntoChunks(CONTENT), projectId: data.project.id, title: "Original", type, content: CONTENT, fileHash: hash(CONTENT) }));
  data.unitOfWork.run(HUMAN, ({ repository }) => repository.createCardSourceLink(data.card.id, { kind: "chunk", chunkId: first.chunks[0]!.id }));
  const humanRepeat = data.unitOfWork.run(HUMAN, ({ repository }) => repository.importSourceDocument({ parsedChunks: type === "markdown" ? splitMarkdownIntoChunks(CONTENT) : splitTextIntoChunks(CONTENT), projectId: data.project.id, title: "Human renamed", type, content: CONTENT, fileHash: hash(CONTENT) }));
  expect(humanRepeat).toEqual({ ...first, status: "unchanged" });
  applyAgentImport(data, type, CONTENT, "Agent renamed");
  expect(data.repository.getOperationSnapshot(data.project.id).sourceDocuments).toEqual([first.document]);
  const revision = `${CONTENT}\n\nUpdated evidence.`;
  applyAgentImport(data, type, revision, "Revision");
  applyAgentImport(data, type, revision, "Repeated revision");
  const snapshot = data.repository.getOperationSnapshot(data.project.id);
  expect(snapshot.sourceDocuments).toHaveLength(2);
  const revised = snapshot.sourceDocuments.find(({ fileHash }) => fileHash === hash(revision))!;
  expect(revised.id).not.toBe(first.document.id);
  expect(revised.filePath).toBe("inline://reviewed-source");
  const previous = data.repository.getSourceDocumentDetails(first.document.id)!;
  expect(previous.document).toEqual(first.document);
  expect(previous.chunks).toEqual(first.chunks);
  expect(previous.links).toContainEqual(expect.objectContaining({ cardId: data.card.id, chunkId: first.chunks[0]!.id }));
});
