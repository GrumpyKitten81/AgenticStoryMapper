import { splitTextIntoChunks } from "@storymapper/importers";
import { randomUUID } from "node:crypto";
import { hashText } from "@storymapper/db/repositories/repository-values";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { changeSetSchema, OPERATIONS_SCHEMA_VERSION } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { buildAiProposalChangeSet } from "@storymapper/server/services/ai-proposal-change-set";

const actor = { actorType: "human", actorId: "source-ownership-test" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-source-ownership-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const data = unitOfWork.run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Owner Project" });
    const otherProject = repository.createProject({ name: "Other Project" });
    const storyMap = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const card = repository.createCard({ storyMapId: storyMap.id, level: "story", title: "Story" });
    const content = "Other Project evidence.";
    const source = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(content), projectId: otherProject.id, title: "Private source", type: "txt", content, fileHash: hashText(content) });
    return { project, otherProject, storyMap, card, source };
  });
  return { repository, unitOfWork, ...data };
}

it("refuses source links and proposal evidence owned by another Project", () => {
  const f = fixture();
  expect(() => f.unitOfWork.run(actor, ({ repository }) => repository.createCardSourceLink(f.card.id, { kind: "chunk", chunkId: f.source.chunks[0]!.id }))).toThrow("Source chunk not found.");
  expect(f.repository.listSourceLinksForStoryMap(f.storyMap.id)).toEqual([]);
  for (const sourceDocumentId of [f.source.document.id, randomUUID()]) {
    expect(() => buildAiProposalChangeSet(f.repository, { projectId: f.project.id, storyMapId: f.storyMap.id, templateId: "effort-estimate", sourceDocumentId })).toThrow("Source document not found.");
  }
});


it("creates a strict current-version proposal through the shared ChangeSet factory", () => {
  const f = fixture();
  const proposal = buildAiProposalChangeSet(f.repository, { projectId: f.project.id, storyMapId: f.storyMap.id, templateId: "effort-estimate" });
  expect(proposal.operationsSchemaVersion).toBe(OPERATIONS_SCHEMA_VERSION);
  expect(changeSetSchema.parse(proposal)).toEqual(proposal);
});
