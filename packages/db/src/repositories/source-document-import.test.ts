import { splitMarkdownIntoChunks, splitTextIntoChunks } from "@storymapper/importers";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashText } from "@storymapper/db/repositories/repository-values";
import { DatabaseHandle, UnitOfWork } from "@storymapper/db";
import { openStoryMapperDb } from "@storymapper/db/connection";
import { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

const actor = { actorType: "human", actorId: "source-import-test" } as const;

describe("source document import", () => {
  it("deduplicates by Project, type and byte-exact hash while retaining stable identities", () => {
    const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
    const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));
    const firstProject = new UnitOfWork(repository.handle).run(actor, ({ repository: tx }) => tx.createProject({ name: "First Project" }));
    const secondProject = new UnitOfWork(repository.handle).run(actor, ({ repository: tx }) => tx.createProject({ name: "Second Project" }));
    const storyMap = new UnitOfWork(repository.handle).run(actor, ({ repository: tx }) => tx.createStoryMap({ projectId: firstProject.id, name: "Evidence map" }));
    const card = new UnitOfWork(repository.handle).run(actor, ({ repository: tx }) => tx.createCard({ storyMapId: storyMap.id, level: "story", title: "Evidence" }));
    const content = "# Parent\n\n## Child\n\nEvidence.";
    const importDocument = (projectId: string, title = "Source", type: "markdown" | "txt" = "markdown", text = content) =>
      new UnitOfWork(repository.handle).run(actor, ({ repository: tx }) => tx.importSourceDocument({ parsedChunks: type === "markdown" ? splitMarkdownIntoChunks(text) : splitTextIntoChunks(text), projectId, title, type, content: text, fileHash: hashText(text) }));

    const first = importDocument(firstProject.id);
    new UnitOfWork(repository.handle).run(actor, ({ repository: tx }) => tx.createCardSourceLink(card.id, { kind: "chunk", chunkId: first.chunks[0]!.id }));
    const activityCount = repository.listActivity(firstProject.id).length;
    const unchanged = importDocument(firstProject.id, "Renamed source");
    const otherProject = importDocument(secondProject.id);
    const otherType = importDocument(firstProject.id, "Plain text", "txt");
    const changed = importDocument(firstProject.id, "Source", "markdown", "# Parent\n\nUpdated evidence.");

    expect(first.status).toBe("imported");
    expect(first.document.fileHash).toBe(hashText(content));
    expect(unchanged).toMatchObject({ status: "unchanged", document: first.document, chunks: first.chunks });
    expect(repository.listActivity(firstProject.id)).toHaveLength(activityCount + 2);
    expect(otherProject.chunks.map(({ locator }) => locator)).toEqual(first.chunks.map(({ locator }) => locator));
    expect(otherProject.document.id).not.toBe(first.document.id);
    expect(otherProject.chunks.map(({ id }) => id)).not.toEqual(first.chunks.map(({ id }) => id));
    expect(otherType.document.id).not.toBe(first.document.id);
    expect(changed.document.id).not.toBe(first.document.id);
    expect(repository.getSourceDocumentDetails(first.document.id)?.chunks).toMatchObject(first.chunks);
    expect(repository.getSourceDocumentDetails(first.document.id)?.links).toContainEqual(expect.objectContaining({ cardId: card.id, chunkId: first.chunks[0]!.id }));
  });
});
