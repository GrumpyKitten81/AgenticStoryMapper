import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { composeRecordedFiles, recordedFiles, type RecordedFile } from "@storymapper/server/fixtures/bmad-round-trip/composer";
import { requestedEvidenceIds } from "@storymapper/server/fixtures/bmad-round-trip/ownership";
import { human, publicationResult, roundTripFixture, type RoundTripFixture } from "@storymapper/server/fixtures/bmad-round-trip/harness";

const fixtures: RoundTripFixture[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture() { const f = await roundTripFixture(); fixtures.push(f); return f; }
function sliceFile(content: string): RecordedFile { return { name: "sprint.txt", type: "txt", content, hash: createHash("sha256").update(content).digest("hex") }; }

it("rejects duplicate explicit Story IDs, repeated release IDs and duplicate/overlapping slice membership", async () => {
  const f = await fixture();
  const { snapshot } = await f.read("http");
  const files = recordedFiles("initial");
  const story = files.find((file) => file.name === "stories/1.1.md")!;
  const duplicateId = [...files.slice(0, -1), { ...story, name: "stories/duplicate.md" }, files.at(-1)!];
  expect(() => composeRecordedFiles(f.project.id, snapshot, duplicateId, [], new Set())).toThrow(/Duplicate explicit publication ID/);
  for (const content of ["MVP|MVP|1.1,1.1\n", "MVP|MVP|1.1\nsprint-1|Sprint 1|1.1\n", "MVP|MVP|1.1\nMVP|Again|1.2\n"]) expect(() => composeRecordedFiles(f.project.id, snapshot, [...files.slice(0, -1), sliceFile(content)], [], new Set())).toThrow(/Duplicate slice membership|unique/);
  expect(f.repository.listChangeSets()).toHaveLength(0);
});

it.each(["http", "sdk"])("explicitly clears removed membership through the actual %s publication", async (surface) => {
  const f = await fixture();
  publicationResult((await f.publication(surface, "initial")).result); await f.rememberSources(surface, "initial");
  const before = (await f.read(surface)).snapshot;
  const ref = before.externalRefs.find((ref) => ref.externalId === "story-1.2")!;
  const card = before.cards.find((card) => card.id === ref.entityId)!;
  expect(card.releaseId).not.toBeNull();
  const files = recordedFiles("initial");
  const slices = files.at(-1)!.content.replace("1.1,1.2,1.3", "1.1,1.3");
  const cut = await f.publication(surface, "initial", true, [...files.slice(0, -1), sliceFile(slices)]);
  expect(cut.operations.find((op) => op.op === "upsert" && op.selector.externalId === "story-1.2")!.after).toMatchObject({ releaseId: null });
  expect(publicationResult(cut.result).outcome).toBe("applied");
  expect((await f.read(surface)).snapshot.cards.find((row) => row.id === card.id)).toMatchObject({ releaseId: null, version: card.version + 1 });
}, 20_000);

it("fails every missing applied evidence association and refuses to adopt an unrelated manual link", async () => {
  const f = await fixture();
  const { result, operations } = await f.publication("http", "initial"); publicationResult(result);
  const { snapshot, documents } = await f.read("http");
  const files = recordedFiles("initial");
  const linkOperation = operations.find((op) => op.op === "link")!;
  const requested = [linkOperation];
  const associated = [...requestedEvidenceIds(snapshot, documents, files, requested)][0]!;
  const link = snapshot.sourceLinks.find((link) => link.id === associated)!;
  if (link.kind !== "chunk") throw new Error("Associated evidence must be a chunk link.");
  const chunk = snapshot.sourceChunks.find((chunk) => link.kind === "chunk" && chunk.id === link.chunkId)!;
  const missingDocument = documents.filter((doc) => doc.document.id !== chunk.documentId);
  expect(() => requestedEvidenceIds(snapshot, documents, [], requested)).toThrow(/Missing requested file/);
  expect(() => requestedEvidenceIds(snapshot, missingDocument, files, requested)).toThrow(/Missing applied document/);
  expect(() => requestedEvidenceIds(snapshot, documents.map((doc) => ({ ...doc, chunks: doc.chunks.filter((row) => row.id !== chunk.id) })), files, requested)).toThrow(/Missing applied chunk/);
  expect(() => requestedEvidenceIds({ ...snapshot, cards: snapshot.cards.filter((card) => card.id !== link.cardId) }, documents, files, requested)).toThrow(/Missing applied Card/);
  const otherChunk = snapshot.sourceChunks.find((row) => row.id !== chunk.id)!;
  const manual = { ...link, id: "manual-exact-owner", kind: "chunk" as const, chunkId: otherChunk.id };
  expect(() => requestedEvidenceIds({ ...snapshot, sourceLinks: [...snapshot.sourceLinks.filter((row) => row.id !== link.id), manual] }, documents, files, requested)).toThrow(/Missing applied link/);
  expect(f.unitOfWork.run(human, ({ repository }) => repository.deleteCardSourceLink(link.cardId, { kind: "chunk", id: link.id }))).toBe(true);
  await expect(f.rememberSources("http", "initial")).rejects.toThrow(/Missing applied link/);
}, 20_000);

it("associates applied evidence by Project/type/hash despite preceding TXT bytes", async () => {
  const f = await fixture();
  const files = recordedFiles("initial");
  const file = files[0]!;
  publicationResult(await f.call("http", { projectId: f.project.id, title: "Same bytes as TXT", apply: true, operations: [{ operationId: "prior-txt", op: "import", entity: "sourceDocument", after: { projectId: f.project.id, title: "prior.txt", type: "txt", inlineContent: file.content, fileHash: file.hash } }] }));
  const { result, operations } = await f.publication("http", "initial"); publicationResult(result);
  const { snapshot, documents } = await f.read("http");
  const txt = documents.find((row) => row.document.type === "txt" && row.document.fileHash === file.hash)!;
  const markdown = documents.find((row) => row.document.type === "markdown" && row.document.fileHash === file.hash)!;
  expect(txt.document.id).not.toBe(markdown.document.id);
  const requested = operations.filter((op) => op.op === "link" && op.after.kind === "chunk" && "chunk" in op.after && op.after.chunk.kind === "import" && op.after.chunk.operationId === "import-0");
  const foreign = { ...markdown, document: { ...markdown.document, projectId: f.otherMap.id }, chunks: [] };
  const ids = requestedEvidenceIds(snapshot, [txt, foreign, markdown], files, requested);
  expect(ids.size).toBe(requested.length);
  for (const id of ids) {
    const link = snapshot.sourceLinks.find((row) => row.id === id)!;
    expect(link.kind === "chunk" && markdown.chunks.some((chunk) => chunk.id === link.chunkId)).toBe(true);
  }
  expect(() => requestedEvidenceIds(snapshot, [txt, foreign], files, requested)).toThrow(/Missing applied document/);
}, 20_000);

it.each(["fenced headings", "CRLF"])("publishes full recorded Story content with %s without changing import bytes", async (variant) => {
  const f = await fixture();
  const files = recordedFiles("initial");
  const index = files.findIndex((file) => file.name === "stories/1.1.md");
  const original = files[index]!;
  const content = variant === "CRLF" ? original.content.replace(/\n/g, "\r\n") : `${original.content}\n\n~~~markdown\n# Story 9.9: An example only\n# Recording\n~~~\n\nThe real Story continues after the example.\n`;
  files[index] = { ...original, content, hash: createHash("sha256").update(content).digest("hex") };
  const { result, operations } = await f.publication("http", "initial", true, files); publicationResult(result);
  await f.rememberSources("http", "initial");
  const imported = operations.find((op) => op.operationId === `import-${index}`)!;
  expect(imported.after).toMatchObject({ inlineContent: content, fileHash: files[index]!.hash });
  const { snapshot, documents } = await f.read("http");
  expect(snapshot.cards).toHaveLength(46);
  expect(snapshot.externalRefs.some((ref) => ref.externalId === "story-9.9")).toBe(false);
  const ref = snapshot.externalRefs.find((row) => row.externalId === "story-1.1")!;
  expect(snapshot.cards.find((card) => card.id === ref.entityId)!.description).toBe(content.replace(/\r\n?/g, "\n").split("\n").slice(1).join("\n").trim());
  const document = documents.find((row) => row.document.fileHash === files[index]!.hash)!;
  expect(document.chunks.every((chunk) => chunk.locator.startsWith("Story 1.1: Create a research collection"))).toBe(true);
}, 20_000);
