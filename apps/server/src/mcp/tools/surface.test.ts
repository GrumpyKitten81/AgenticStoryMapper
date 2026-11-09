import { splitTextIntoChunks } from "@storymapper/importers";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { hashText } from "@storymapper/db/repositories/repository-values";
import { afterEach, expect, it } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";
import { getStoryMapData, getStoryMapSnapshot } from "@storymapper/server/application/story-map/story-map.use-cases";
import { exportStoryMap } from "@storymapper/server/application/export/export.use-cases";

const human = { actorType: "human", actorId: "fixture" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function seedLegacySourceLink(handle: DatabaseHandle, cardId: string, chunkId: string): void {
  handle.current.$client.prepare("INSERT INTO card_source_links (id, card_id, kind, chunk_id, created_at) VALUES (?, ?, 'chunk', ?, ?)").run(randomUUID(), cardId, chunkId, new Date().toISOString());
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-surface-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Accessible" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Accessible Map" });
    const otherMap = repository.createStoryMap({ projectId: project.id, name: "Other Map" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Target" });
    const release = repository.createRelease({ storyMapId: otherMap.id, name: "Other release" });
    const disabled = repository.createProject({ name: "Disabled" });
    const disabledMap = repository.createStoryMap({ projectId: disabled.id, name: "Disabled Map" });
    const disabledCard = repository.createCard({ storyMapId: disabledMap.id, level: "story", title: "Disabled target" });
    const disabledPersona = repository.createPersona({ projectId: disabled.id, name: "Disabled persona" });
    repository.updateSafetySettings(project.id, { agentMode: "apply" });
    repository.updateSafetySettings(disabled.id, { agentMode: "off" });
    return { project, map, otherMap, card, release, disabled, disabledMap, disabledCard, disabledPersona };
  });
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "surface-host", mcpSessionId: "surface-session" });
  return { ...rows, handle, repository, unitOfWork, registry };
}

it("filters application source reads and exports while retaining dependent MCP refusals and complete human exports", async () => {
  const f = fixture();
  const agent = { actorType: "agent", actorId: "surface-host", mcpSessionId: "surface-session" } as const;
  const sources = f.unitOfWork.run(human, ({ repository }) => {
    const visibleText = "Visible requirement";
    const hiddenText = "Disabled source text";
    const visible = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(visibleText), projectId: f.project.id, title: "Visible source", type: "txt", content: visibleText, fileHash: hashText(visibleText) });
    const hidden = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(hiddenText), projectId: f.disabled.id, title: "Hidden source", type: "txt", content: hiddenText, fileHash: hashText(hiddenText) });
    repository.createCardSourceLink(f.card.id, { kind: "chunk", chunkId: visible.chunks[0]!.id });
    const note = repository.createCardSourceLink(f.card.id, { kind: "note", note: "Accessible origin note" })!;
    const issue = repository.createGitHubLink({ releaseId: f.release.id, repo: "fixture/repository", issueNumber: 12, url: "https://github.com/fixture/repository/issues/12" });
    const github = repository.createCardSourceLink(f.card.id, { kind: "github", externalRefId: issue.id })!;
    seedLegacySourceLink(f.handle, f.card.id, hidden.chunks[0]!.id);
    return { visible, hidden, note, github };
  });
  const humanSnapshot = getStoryMapSnapshot(f, human, f.map.id);
  expect(humanSnapshot.sourceChunks).toHaveLength(2);
  expect(humanSnapshot.sourceLinks).toHaveLength(4);
  const accessibleEvidence = [expect.objectContaining({ kind: "chunk", chunkId: sources.visible.chunks[0]!.id }), sources.note, sources.github];
  for (const read of [getStoryMapSnapshot, getStoryMapData]) {
    const snapshot = read(f, agent, f.map.id);
    expect(snapshot.sourceChunks).toMatchObject(sources.visible.chunks);
    expect(snapshot.sourceLinks).toHaveLength(3);
    expect(snapshot.sourceLinks).toEqual(expect.arrayContaining(accessibleEvidence));
    expect(JSON.stringify(snapshot)).not.toContain(sources.hidden.chunks[0]!.text);
  }
  for (const name of ["GetStoryMapSnapshot", "GetStoryMapData", "ExportStoryMap"] as const) {
    await expect(f.registry.call(name, { storyMapId: f.map.id, ...(name === "ExportStoryMap" ? { format: "json" } : {}) })).rejects.toMatchObject({ code: "disabled" });
  }
  const exported = exportStoryMap(f, agent, f.map.id, "json");
  expect(JSON.parse(exported.content).snapshot).toMatchObject({ sourceChunks: sources.visible.chunks, sourceLinks: expect.arrayContaining(accessibleEvidence) });
  expect(JSON.parse(exported.content).snapshot.sourceLinks).toHaveLength(3);
  expect(exported.content).not.toContain(sources.hidden.chunks[0]!.text);
  expect(f.repository.listActivity(f.project.id).filter((event) => event.action === "exports.storyMapCreated")).toEqual([expect.objectContaining({ actor: "surface-host", actorType: "agent", mcpSessionId: "surface-session" })]);
  expect(f.repository.getGettingStartedChecklist(f.project.id).completed.export).toBe(true);
  expect(JSON.parse(exportStoryMap(f, human, f.map.id, "json").content).snapshot).toMatchObject({ sourceChunks: humanSnapshot.sourceChunks, sourceLinks: humanSnapshot.sourceLinks });
});


it("records typed origin evidence through MCP and restores the original creation origin", async () => {
  const f = fixture();
  const noteResult = await f.registry.call("CreateCardSourceLink", { cardId: f.card.id, kind: "note", note: "  /unopened/source.txt  " });
  expect(noteResult).toMatchObject({ outcome: "applied", changeSet: { status: "applied" } });
  const noteId = (noteResult as ChangeSetCommandResponse).changeSet.execution!.operationResults[0]!.entityIds.find((id) => id !== f.card.id)!;
  const note = getStoryMapSnapshot(f, human, f.map.id).sourceLinks.find((link) => link.id === noteId)!;
  expect(note).toMatchObject({ kind: "note", note: "/unopened/source.txt" });
  expect(f.repository.getCardDetails(f.card.id)).toMatchObject({ creationOrigin: "manual", provenance: "linked" });
  const before = f.repository.getCardDetails(f.card.id)!.version;
  await expect(f.registry.call("CreateCardSourceLink", { cardId: f.card.id, kind: "note", note: "   " })).rejects.toBeDefined();
  expect(f.repository.getCardDetails(f.card.id)!.version).toBe(before);
  await f.registry.call("DeleteCardSourceLink", { cardId: f.card.id, kind: "note", id: note.id });
  expect(f.repository.getCardDetails(f.card.id)).toMatchObject({ creationOrigin: "manual", provenance: "manual" });
  const event = f.repository.listActivity(f.project.id).find((entry) => entry.action === "tool_call" && (entry.after as { toolName?: string })?.toolName === "DeleteCardSourceLink");
  expect(event?.after).toMatchObject({ affectedEntityIds: expect.arrayContaining([f.card.id, note.id]) });
});

it("links existing GitHub Issue evidence without moving its owner and refuses foreign identity", async () => {
  const f = fixture();
  const identities = f.unitOfWork.run(human, ({ repository }) => ({
    local: repository.createGitHubLink({ releaseId: f.release.id, repo: "fixture/repository", issueNumber: 12, url: "https://github.com/fixture/repository/issues/12" }),
    foreign: repository.createGitHubLink({ cardId: f.disabledCard.id, repo: "fixture/private", issueNumber: 13, url: "https://github.com/fixture/private/issues/13" })
  }));
  await f.registry.call("CreateCardSourceLink", { cardId: f.card.id, kind: "github", externalRefId: identities.local.id });
  expect(f.repository.getGitHubLink(identities.local.id)).toMatchObject({ releaseId: f.release.id });
  expect(getStoryMapSnapshot(f, human, f.map.id).sourceLinks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "github", repoFullName: "fixture/repository", issueNumber: 12 })]));
  const before = f.repository.getCardDetails(f.card.id)!.version;
  await expect(f.registry.call("CreateCardSourceLink", { cardId: f.card.id, kind: "github", externalRefId: identities.foreign.id })).rejects.toMatchObject({ code: "disabled" });
  expect(f.repository.getCardDetails(f.card.id)!.version).toBe(before);
});


it("records inference for direct Agent Card creation without evidence", async () => {
  const f = fixture();
  const result = await f.registry.call("CreateStoryMapCard", { storyMapId: f.map.id, level: "story", title: "Agent origin" });
  expect(result).toMatchObject({ outcome: "applied", changeSet: { status: "applied" } });
  const id = (result as ChangeSetCommandResponse).changeSet.execution!.operationResults[0]!.entityIds[0]!;
  const card = f.repository.getCardDetails(id)!;
  expect(card).toMatchObject({ creationOrigin: "inference", provenance: "inference" });
  expect(f.repository.getCardDetails(card.id)).toMatchObject({ creationOrigin: "inference", provenance: "inference" });
});
