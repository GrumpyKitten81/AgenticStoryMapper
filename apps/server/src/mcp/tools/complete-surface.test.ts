import { exerciseExecutesTheRemainingLocalMCPAdaptersWithValidArguments } from "@storymapper/server/fixtures/mcp-surface-assertions";
import type { Project, StoryMap, Card, Release, Persona, Roadmap, RoadmapColumn, Annotation, CardAttachment, GitHubLink, ConnectorConnection } from "@storymapper/contracts";
import { splitTextIntoChunks } from "@storymapper/importers";
import { reviewedPushProviderFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { seedHistoricalChangeSet, seedLegacySourceLink } from "@storymapper/server/fixtures/mcp-scope-evidence";
import { remoteReadFixture } from "@storymapper/server/fixtures/remote-read";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { DomainError, lookupGitHubTicketResponseSchema, changeSetCommandToolNames, changeSetSchema, OPERATIONS_SCHEMA_VERSION, type McpToolName, type McpToolResult } from "@storymapper/contracts";
import type { ChangeSet, SourceDocument, SourceChunk } from "@storymapper/contracts";
import { createRestorePoint, DatabaseHandle, openStoryMapperDb, restoreProject, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createWorkItemProvider, type RemoteWorkItem } from "@storymapper/github";
import { createRoutes } from "@storymapper/server/http/routes";
import * as credentials from "@storymapper/server/services/credentials";
import { createReviewedCall } from "@storymapper/server/fixtures/reviewed-mcp-call";
vi.mock("@storymapper/github", async (importOriginal) => ({ ...await importOriginal<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
const human = { actorType: "human", actorId: "fixture" } as const;
const cleanup: Array<() => void | Promise<void>> = [];
const exercisedCommands = new Set<McpToolName>();
const sourceHash = (content: string) => createHash("sha256").update(content).digest("hex");
beforeEach(() => { vi.spyOn(credentials, "resolveProviderAuth").mockRejectedValue(new Error("Unexpected credential resolution.")); vi.mocked(createWorkItemProvider).mockReset().mockImplementation(() => { throw new Error("Unexpected provider resolution."); }); });
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close(); });
afterAll(() => { expect([...exercisedCommands].sort()).toEqual([...changeSetCommandToolNames].sort()); });

async function fixture(databasePath?: string) {
  if (!databasePath) {
    const directory = mkdtempSync(join(tmpdir(), "storymapper-mcp-surface-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    databasePath = join(directory, "storymapper.sqlite");
  }
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  cleanup.push(() => { handle.current.$client.close(); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Accessible" });
    const disabled = repository.createProject({ name: "Disabled" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Accessible Map" });
    const hiddenMap = repository.createStoryMap({ projectId: disabled.id, name: "Disabled Map" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Accessible Story" });
    const hiddenCard = repository.createCard({ storyMapId: hiddenMap.id, level: "story", title: "Disabled Story" });
    const hiddenRelease = repository.createRelease({ storyMapId: hiddenMap.id, name: "Disabled Release" });
    const hiddenPersona = repository.createPersona({ projectId: disabled.id, name: "Disabled Persona" });
    const hiddenRoadmap = repository.createRoadmap({ projectId: disabled.id, name: "Disabled Roadmap" });
    const hiddenSwimlane = repository.createRoadmapSwimlane({ roadmapId: hiddenRoadmap.id, name: "Disabled lane" });
    const hiddenText = "Disabled text";
    const hiddenSource = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(hiddenText), projectId: disabled.id, title: "Disabled source", type: "txt", content: hiddenText, fileHash: sourceHash(hiddenText) });
    repository.updateSafetySettings(project.id, { agentMode: "apply" });
    repository.updateSafetySettings(disabled.id, { agentMode: "off" });
    return { project, disabled, map, hiddenMap, card, hiddenCard, hiddenRelease, hiddenPersona, hiddenRoadmap, hiddenSwimlane, hiddenSource };
  });
  const server = Fastify();
  await server.register(createRoutes, { repository, unitOfWork, databasePath });
  const origin = await server.listen({ host: "127.0.0.1", port: 0 });
  cleanup.push(() => server.close());
  const call = async (name: McpToolName, input: unknown): Promise<McpToolResult> => {
    const response = await fetch(`${origin}/api/mcp/call`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, input }) });
    const result = await response.json();
    if (!response.ok) throw new DomainError(result.code, result.message, result.details, result.conflicts);
    if (changeSetCommandToolNames.has(name)) {
      const command = name === "ImportGitHubTicket" ? result.data : result;
      expect(command).toMatchObject({ changeSetId: command.changeSet.id, previewRef: { changeSetId: command.changeSet.id } });
      expect(repository.getChangeSet(command.changeSetId)).toMatchObject({ status: command.outcome === "applied" ? "applied" : "proposed" });
      exercisedCommands.add(name);
    }
    return result;
  };
  return { ...rows, handle, repository, unitOfWork, origin, call, reviewedCall: createReviewedCall(server, call) };
}
function data<T>(result: McpToolResult): T { return result.data as T; }
function created(f: Awaited<ReturnType<typeof fixture>>, result: McpToolResult): { id: string } {
  expect(result).toMatchObject({ outcome: "applied", changeSetId: result.changeSet?.id, previewRef: { changeSetId: result.changeSet?.id } });
  const entity = result.changeSet!.operations[0]!.entity;
  const snapshot = f.repository.getOperationSnapshot(result.changeSet!.projectId);
  const collections = { storyMap: snapshot.storyMaps, roadmap: snapshot.roadmaps, roadmapColumn: snapshot.roadmapColumns, roadmapSwimlane: snapshot.roadmapSwimlanes, roadmapCard: snapshot.roadmapCards, annotation: snapshot.annotations, workflowStatus: snapshot.workflowStatuses, storyTemplate: snapshot.storyTemplates, release: snapshot.releases, sourceDocument: snapshot.sourceDocuments, card: snapshot.cards, persona: snapshot.personas };
  const rows = collections[entity as keyof typeof collections];
  return { id: result.changeSet!.execution!.operationResults[0]!.entityIds.find((id) => rows.some((row) => row.id === id))! };
}

it("rejects map proposals using source documents from a different agent-enabled Project", async () => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.disabled.id, { agentMode: "apply" }));
  const before = f.repository.listChangeSets(f.project.id);
  await expect(f.call("ProposeMapFromSourceDocument", { projectId: f.project.id, storyMapId: f.map.id, sourceDocumentId: f.hiddenSource.document.id })).rejects.toMatchObject({ code: "not_found" });
  expect(f.repository.listChangeSets(f.project.id)).toEqual(before);
});

it.each([false, true])("refuses attachment deletion with another Card's identity before proposing/applying (apply=%s)", async (apply) => {
  const f = await fixture();
  const other = f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "story", title: "Attachment owner" }));
  const rows = f.unitOfWork.run(human, ({ repository }) => {
    const attachment = repository.createCardAttachment(other.id, { label: "Owned evidence", filePath: "evidence.txt" })!;
    repository.createCardAttachment(f.card.id, { label: "Matching root version", filePath: "other.txt" });
    return { other, attachment };
  });
  const before = [f.repository.getCard(f.card.id), f.repository.getCard(rows.other.id)];
  const attachmentsBefore = f.repository.listCardAttachments(rows.other.id);
  expect(before[0]!.version).toBe(before[1]!.version);
  await expect(f.call("DeleteCardAttachment", { cardId: f.card.id, attachmentId: rows.attachment.id, apply })).rejects.toMatchObject({ code: "validation" });
  expect(f.repository.listCardAttachments(rows.other.id)).toEqual(attachmentsBefore);
  expect([f.repository.getCard(f.card.id), f.repository.getCard(rows.other.id)]).toEqual(before);
  expect(f.repository.listChangeSets(f.project.id)).toEqual([]);
  const audits = f.repository.listActivity(f.project.id).filter((event) => event.action === "tool_call" && event.affectedEntityId === "DeleteCardAttachment");
  expect(audits).toHaveLength(1);
  expect(audits[0]!.after).toMatchObject({ outcome: "rejected", rejectionReason: "validation" });
});

it("executes Story Map, Roadmap children, customization, source, report and export capabilities", async () => {
  const f = await fixture();
  const call = (name: McpToolName, input: unknown) => f.reviewedCall(name, input);
  const map = created(f, await call("CreateStoryMap", { projectId: f.project.id, name: "Created through MCP" }));
  await call("UpdateStoryMap", { storyMapId: map.id, baseVersion: f.repository.getStoryMapOrThrow(map.id).version, patch: { name: "Updated through MCP" } });
  expect(data<{ storyMap: { name: string } }>(await call("GetStoryMapSnapshot", { storyMapId: map.id })).storyMap.name).toBe("Updated through MCP");
  const roadmap = created(f, await call("CreateRoadmap", { projectId: f.project.id, storyMapId: map.id, name: "Plan" }));
  const column = created(f, await call("CreateRoadmapColumn", { roadmapId: roadmap.id, name: "Next" }));
  const swimlane = created(f, await call("CreateRoadmapSwimlane", { roadmapId: roadmap.id, name: "Team" }));
  const roadmapCard = created(f, await call("CreateRoadmapCard", { roadmapId: roadmap.id, columnId: column.id, swimlaneId: swimlane.id, title: "Planned story" }));
  await call("CreateRoadmapReference", { roadmapCardId: roadmapCard.id, targetType: "card", targetId: f.card.id });
  expect(data<{ references: unknown[] }>(await call("GetRoadmapDetails", { roadmapId: roadmap.id })).references).toHaveLength(1);
  const annotation = created(f, await call("CreateAnnotation", { projectId: f.project.id, name: "Review" }));
  await call("UpdateAnnotation", { annotationId: annotation.id, patch: { name: "Reviewed" } });
  const status = created(f, await call("CreateWorkflowStatus", { projectId: f.project.id, name: "review", group: "active" }));
  await call("UpdateWorkflowStatus", { statusId: status.id, patch: { name: "reviewed", definitionBefore: f.repository.getWorkflowStatus(status.id), affectedCards: [] } });
  const template = created(f, await call("CreateStoryTemplate", { projectId: f.project.id, name: "Template" }));
  await call("UpdateStoryTemplate", { templateId: template.id, patch: { name: "Updated template" } });
  await call("SetCardAnnotation", { cardId: f.card.id, annotationId: annotation.id });
  const sourceImport = created(f, await call("ImportSourceDocument", { projectId: f.project.id, title: "Source", type: "markdown", content: "# Requirement\n\nA complete MCP surface." }));
  const source = f.repository.getSourceDocumentDetails(sourceImport.id)!;
  expect(source.document.filePath).toBe("inline://source");
  await call("CreateCardSourceLink", { cardId: f.card.id, kind: "chunk", chunkId: source.chunks[0]!.id });
  expect(data<{ document: { id: string } }>(await call("GetSourceDocument", { documentId: source.document.id })).document.id).toBe(source.document.id);
  expect(data<{ storyMapId: string }>(await call("GetBacklogHealthReport", { storyMapId: f.map.id })).storyMapId).toBe(f.map.id);
  expect(data<{ content: string }>(await call("ExportStoryMap", { storyMapId: f.map.id, format: "markdown" })).content).toContain("Accessible Story");
  expect(data<{ content: string }>(await call("ExportAudit", { projectId: f.project.id, format: "json" })).content).toContain("local-mcp-host");
  await call("DeleteAnnotation", { annotationId: annotation.id, definitionBefore: f.repository.getAnnotation(annotation.id), confirmUnlink: true, affectedCards: [{ id: f.card.id, baseVersion: f.repository.getCard(f.card.id)!.version }] });
  await call("DeleteStoryTemplate", { templateId: template.id });
  await call("DeleteWorkflowStatus", { statusId: status.id, definitionBefore: f.repository.getWorkflowStatus(status.id), affectedCards: [] });
  expect(f.repository.listActivity(f.project.id).filter((event) => event.action === "tool_call" && event.affectedEntityId === "CreateRoadmap")[0]).toMatchObject({ actor: "local-mcp-host", actorType: "agent", mcpSessionId: expect.any(String), after: expect.objectContaining({ outcome: "ok" }) });
});

it("authorizes actual owners and every supplied target before writes", async () => {
  const f = await fixture();
  const inputs: Array<[McpToolName, unknown]> = [
    ["UpdateStoryMapRelease", { storyMapId: f.map.id, releaseId: f.hiddenRelease.id, baseVersion: 1, patch: { name: "Attack" } }],
    ["UpdateStoryMapPersona", { projectId: f.project.id, personaId: f.hiddenPersona.id, baseVersion: 1, patch: { name: "Attack" } }],
    ["BulkUpdateCards", { storyMapId: f.map.id, cards: [f.card, f.hiddenCard].map(({ id }) => ({ id, baseVersion: 1 })), patch: { estimate: 9 } }],
    ["CreateStoryMapCard", { storyMapId: f.map.id, level: "story", title: "Attack", parentId: f.hiddenCard.id }],
    ["UpdateStoryMapCard", { cardId: f.card.id, baseVersion: 1, patch: { releaseId: f.hiddenRelease.id } }],
    ["SetCardPersona", { cardId: f.card.id, personaId: f.hiddenPersona.id }],
    ["CreateCardSourceLink", { cardId: f.card.id, kind: "chunk", chunkId: f.hiddenSource.chunks[0]!.id }],
    ["ProposeMapFromSourceDocument", { projectId: f.project.id, storyMapId: f.map.id, sourceDocumentId: f.hiddenSource.document.id }]
  ];
  const before = f.repository.getCardDetails(f.card.id);
  for (const [name, input] of inputs) await expect(f.call(name, input), name).rejects.toMatchObject({ code: "disabled" });
  const roadmap = created(f, await f.call("CreateRoadmap", { projectId: f.project.id, name: "Plan" }));
  const column = f.repository.listRoadmapColumns(roadmap.id)[0]!;
  await expect(f.call("CreateRoadmapCard", { roadmapId: roadmap.id, columnId: column.id, swimlaneId: f.hiddenSwimlane.id, title: "Attack" })).rejects.toMatchObject({ code: "disabled" });
  const roadmapCard = created(f, await f.call("CreateRoadmapCard", { roadmapId: roadmap.id, columnId: column.id, title: "Allowed" }));
  await expect(f.call("CreateRoadmapReference", { roadmapCardId: roadmapCard.id, targetType: "card", targetId: f.hiddenCard.id })).rejects.toMatchObject({ code: "disabled" });
  expect(f.repository.getCardDetails(f.card.id)).toEqual(before);
  expect(f.repository.getRelease(f.hiddenRelease.id)?.name).toBe("Disabled Release");
  expect(f.repository.getPersona(f.hiddenPersona.id)?.name).toBe("Disabled Persona");
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  expect(await f.call("CreateAnnotation", { projectId: f.project.id, name: "Reviewed" })).toMatchObject({ outcome: "proposed" });
  expect(f.repository.listAnnotations(f.project.id).some((item) => item.name === "Reviewed")).toBe(false);
  await expect(f.call("GetCustomization", { projectId: f.project.id, storyMapId: f.hiddenMap.id })).rejects.toMatchObject({ code: "disabled" });
  f.unitOfWork.run(human, ({ repository }) => {
    repository.updateSafetySettings(f.project.id, { agentMode: "apply" });
    repository.updateSafetySettings(f.disabled.id, { agentMode: "propose" });
  });
  await expect(f.call("UpdateStoryMapRelease", inputs[0]![1])).rejects.toMatchObject({ code: "validation" });
  await expect(f.call("UpdateStoryMapPersona", inputs[1]![1])).rejects.toMatchObject({ code: "validation" });
});

it("blocks snapshot, export and Roadmap reads whose linked data belongs to disabled Projects", async () => {
  const f = await fixture();
  const roadmap = f.unitOfWork.run(human, ({ repository }) => {
    seedLegacySourceLink(f.handle, f.card.id, f.hiddenSource.chunks[0]!.id);
    const roadmap = repository.createRoadmap({ projectId: f.project.id, name: "Accessible plan" });
    const card = repository.createRoadmapCard({ roadmapId: roadmap.id, columnId: repository.listRoadmapColumns(roadmap.id)[0]!.id, title: "Linked plan" });
    repository.createRoadmapReference({ roadmapCardId: card.id, targetType: "card", targetId: f.hiddenCard.id });
    return roadmap;
  });
  for (const name of ["GetStoryMapSnapshot", "GetStoryMapData", "ExportStoryMap"] as const) {
    await expect(f.call(name, { storyMapId: f.map.id }), name).rejects.toMatchObject({ code: "disabled" });
  }
  await expect(f.call("GetRoadmapDetails", { roadmapId: roadmap.id })).rejects.toMatchObject({ code: "disabled" });
});

it("refuses empty Agent patches before proposing or applying", async () => {
  const f = await fixture();
  const annotation = f.unitOfWork.run(human, ({ repository }) => repository.createAnnotation({ projectId: f.project.id, name: "Plain" }));
  await expect(f.call("UpdateAnnotation", { annotationId: annotation.id, patch: {} })).rejects.toMatchObject({ code: "validation" });
  await expect(f.call("BulkUpdateCards", { storyMapId: f.map.id, cards: [{ id: f.card.id, baseVersion: 1 }], patch: {} })).rejects.toMatchObject({ code: "validation" });
  expect(f.repository.listChangeSets(f.project.id).filter((changeSet) => changeSet.title.includes("Annotation") || changeSet.title.includes("Cards"))).toEqual([]);
});

it("filters runtime reads and refuses proposed, rejected and cross-Project approved ChangeSets", async () => {
  const f = await fixture();
  const changeSet = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: "00000000-0000-4000-8000-000000000507", projectId: f.project.id, title: "Cross Project", source: "mcp", status: "proposed", operations: [{ operationId: "fixture-operation-1", op: "update", entity: "card", entityId: f.card.id, after: { estimate: 9 } }], createdAt: new Date().toISOString() }));
  const apply = () => f.call("ApplyChangeSet", { changeSetId: changeSet.id, approvalToken: "approved-by-human" });
  await expect(apply()).rejects.toMatchObject({ code: "conflict" });
  f.unitOfWork.run(human, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "rejected"));
  await expect(apply()).rejects.toMatchObject({ code: "conflict" });
  f.unitOfWork.run(human, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"));
  expect((await apply()).changeSet?.status).toBe("applied");
  const hostile = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ ...changeSet, id: "00000000-0000-4000-8000-000000000508", status: "proposed", operations: [{ operationId: "fixture-operation-2", op: "update", entity: "card", entityId: f.hiddenCard.id, after: { estimate: 9 } }] }));
  await expect(f.call("ApplyChangeSet", { changeSetId: hostile.id, approvalToken: "approved-by-human" })).rejects.toMatchObject({ code: "disabled" });
  f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ ...changeSet, id: "00000000-0000-4000-8000-000000000509", projectId: f.disabled.id }));
  for (const name of ["ListProjects", "ListStoryMaps", "ListActivity", "ListChangeSets", "ListSourceDocuments"] as const) {
    expect(JSON.stringify(await f.call(name, {})), name).not.toContain(f.disabled.id);
  }
  expect(f.repository.getCardDetails(f.hiddenCard.id)?.estimate).not.toBe(9);
  await expect(f.call("GetSourceDocument", { documentId: f.hiddenSource.document.id })).rejects.toMatchObject({ code: "disabled" });
});

it("returns successful paginated Card history without leaking its envelope into the strict query", async () => {
  const f = await fixture();
  for (const actorId of ["first-editor", "second-editor"]) f.unitOfWork.run({ ...human, actorId }, ({ repository }) => repository.updateCard(f.card.id, { title: actorId }));
  const first = data<{ versions: Array<{ version: number }>; nextCursor: number }>(await f.call("GetCardHistory", { cardId: f.card.id, limit: 1 }));
  expect(first.versions).toHaveLength(1);
  expect(first.nextCursor).toBe(first.versions[0]!.version);
  const next = data<{ versions: Array<{ version: number }> }>(await f.call("GetCardHistory", { cardId: f.card.id, limit: 1, beforeVersion: first.nextCursor }));
  expect(next.versions).toHaveLength(1);
  expect(next.versions[0]!.version).toBeLessThan(first.versions[0]!.version);
});

it("checks default connectors and every bulk Persona and Annotation target before mutation", async () => {
  const f = await fixture();
  const targets = f.unitOfWork.run(human, ({ repository }) => ({
    annotation: repository.createAnnotation({ projectId: f.disabled.id, name: "Disabled annotation" }),
    connection: repository.createConnectorConnection({ projectId: f.disabled.id, provider: "github", authMode: "token", name: "Disabled connection", owner: "fixture", repository: "fixture" })
  }));
  const calls: Array<[McpToolName, unknown]> = [
    ["UpdateStoryMap", { storyMapId: f.map.id, baseVersion: 1, patch: { defaultConnectionId: targets.connection.id } }],
    ...["addPersonaId", "removePersonaId"].map((key): [McpToolName, unknown] => ["BulkUpdateCards", { storyMapId: f.map.id, cards: [{ id: f.card.id, baseVersion: 1 }], patch: { [key]: f.hiddenPersona.id } }]),
    ...["addAnnotationId", "removeAnnotationId"].map((key): [McpToolName, unknown] => ["BulkUpdateCards", { storyMapId: f.map.id, cards: [{ id: f.card.id, baseVersion: 1 }], patch: { [key]: targets.annotation.id } }])
  ];
  const card = f.repository.getCardDetails(f.card.id);
  const map = f.repository.getStoryMapSnapshot(f.map.id)!.storyMap;
  for (const [name, input] of calls) await expect(f.call(name, input)).rejects.toMatchObject({ code: "disabled" });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.disabled.id, { agentMode: "propose" }));
  for (const [name, input] of calls) await expect(f.call(name, input)).rejects.toMatchObject({ code: "validation" });
  expect(f.repository.getCardDetails(f.card.id)).toEqual(card);
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap).toEqual(map);
  expect(f.repository.listCardPersonasForStoryMap(f.map.id)).toEqual([]);
  expect(f.repository.listCardAnnotationsForStoryMap(f.map.id)).toEqual([]);
});

it("excludes inaccessible ChangeSet targets and nested before/after/context dependencies without hiding permitted proposals", async () => {
  const f = await fixture();
  const persisted = await exerciseExcludesInaccessibleChangeSetTargetsAndNestedBeforeAfterContext(f);
  const masked = persisted.hidden.find((changeSet) => changeSet.operations.some((operation) => operation.op === "create"))!;
  const cardsBefore = f.repository.listCards(f.map.id);
  const hiddenCardBefore = f.repository.getCardDetails(f.hiddenCard.id);
  f.unitOfWork.run(human, ({ repository }) => repository.updateChangeSetStatus(masked.id, "approved"));
  await expect(f.call("ApplyChangeSet", { changeSetId: masked.id, approvalToken: "human-approved" })).rejects.toMatchObject({ code: "disabled" });
  expect(f.repository.listCards(f.map.id)).toEqual(cardsBefore);
  expect(f.repository.getCardDetails(f.hiddenCard.id)).toEqual(hiddenCardBefore);
  expect(f.repository.listSourceLinksForStoryMap(f.map.id)).toEqual([]);
  expect(f.repository.listSourceLinksForStoryMap(f.hiddenMap.id)).toEqual([]);
  expect(f.repository.getChangeSet(masked.id)?.status).toBe("approved");
  const aiProposal = await f.call("CreateAiProposal", { projectId: f.project.id, storyMapId: f.map.id, templateId: "effort-estimate" });
  const sourceImport = created(f, await f.call("ImportSourceDocument", { projectId: f.project.id, title: "Accessible proposal source", type: "txt", content: "Create an accessible proposal." }));
  const source = f.repository.getSourceDocumentDetails(sourceImport.id)!;
  const mapProposal = await f.call("ProposeMapFromSourceDocument", { projectId: f.project.id, storyMapId: f.map.id, sourceDocumentId: source.document.id });
  expect(changeSetSchema.parse(mapProposal.changeSet)).toEqual(mapProposal.changeSet);
  const listed = JSON.stringify(await f.call("ListChangeSets", {}));
  expect(listed).toContain(aiProposal.changeSet!.id);
  expect(listed).toContain(mapProposal.changeSet!.id);
  f.unitOfWork.run(human, ({ repository }) => repository.updateChangeSetStatus(mapProposal.changeSet!.id, "approved"));
  expect((await f.call("ApplyChangeSet", { changeSetId: mapProposal.changeSet!.id, approvalToken: "human-approved" })).changeSet?.status).toBe("applied");
  expect(f.repository.listSourceLinksForStoryMap(f.map.id).length).toBeGreaterThan(0);
});
it.each(["id", "local"] as const)("authorizes the effective %s selector independently of an unused target id", async (kind) => {
  const f = await fixture();
  const selector = kind === "id" ? { kind, id: f.card.id } : { kind, localId: f.card.id };
  const changeSet = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, source: "mcp", title: "Effective selector", status: "proposed", createdAt: new Date().toISOString(), operations: [{ operationId: "selected", op: "update", entity: "card", entityId: "unused-target", selector, after: { title: "Selected target" } }] }));
  f.unitOfWork.run(human, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"));
  const listed = data<{ changeSets: ChangeSet[] }>(await f.call("ListChangeSets", { projectId: f.project.id }));
  expect(listed.changeSets.map((entry) => entry.id)).toContain(changeSet.id);
  expect((await f.call("ApplyChangeSet", { changeSetId: changeSet.id, approvalToken: "human-approved" })).changeSet?.status).toBe("applied");
  expect(f.repository.getCardDetails(f.card.id)?.title).toBe("Selected target");
  const hiddenBefore = f.repository.getCardDetails(f.hiddenCard.id);
  const foreignSelector = kind === "id" ? { kind, id: f.hiddenCard.id } : { kind, localId: f.hiddenCard.id };
  const foreign = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ ...changeSet, id: randomUUID(), status: "proposed", operations: [{ operationId: "foreign-selected", op: "update", entity: "card", entityId: "descriptive-target", selector: foreignSelector, after: { title: "Must not save" } }] }));
  await expect(f.call("ApplyChangeSet", { changeSetId: foreign.id, approvalToken: "human-approved" })).rejects.toMatchObject({ code: "disabled" });
  expect(f.repository.getCardDetails(f.hiddenCard.id)).toEqual(hiddenBefore);
  expect(f.repository.getChangeSet(foreign.id)!.status).toBe("proposed");
});

it("refuses implicit pull and sync health dependencies owned by disabled connections before network work", async () => {
  const auth = vi.spyOn(credentials, "resolveProviderAuth").mockRejectedValue(new Error("Unexpected credential resolution."));
  for (const dependency of ["link", "run", "conflict"]) {
    const f = await fixture();
    f.unitOfWork.run(human, ({ repository }) => {
      const connection = repository.createConnectorConnection({ projectId: f.disabled.id, provider: "github", authMode: "token", name: "Foreign connection", owner: "fixture", repository: "fixture" });
      if (dependency === "link") {
        const identity = repository.createGitHubLink({ cardId: f.card.id, repo: "fixture/fixture", issueNumber: 7, url: "https://github.com/fixture/fixture/issues/7" });
        expect(() => repository.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", cardId: f.card.id, remoteId: "7", remoteNumber: 7, url: "https://github.com/fixture/fixture/issues/7", labels: [] })).toThrow("scope and connection disagree");
        f.handle.current.$client.prepare("INSERT INTO remote_work_item_links (id, external_ref_id, connection_id) VALUES (?, ?, ?)").run(randomUUID(), identity.id, connection.id);
      }
      else {
        const run = repository.createSyncRun({ storyMapId: dependency === "run" ? f.map.id : f.hiddenMap.id, connectionId: connection.id, mode: "sync", status: "applied" });
        if (dependency === "conflict") {
          const identity = repository.createGitHubLink({ cardId: f.card.id, repo: "fixture/fixture", issueNumber: 7, url: "https://github.com/fixture/fixture/issues/7" });
          f.handle.current.$client.prepare("INSERT INTO sync_conflicts (id, external_ref_id, sync_run_id, connection_id, card_id, remote_id, field, local_value_json, remote_value_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), identity.id, run.id, connection.id, f.card.id, "7", "title", JSON.stringify("Visible"), JSON.stringify("Disabled remote"), new Date().toISOString());
        }
      }
      repository.updateSafetySettings(f.project.id, { github: true });
    });
    await expect(f.call("GetWorkItemSyncHealth", { storyMapId: f.map.id }), dependency).rejects.toMatchObject({ code: "disabled" });
    if (dependency === "link") {
      await expect(f.call("PullStoryMapGitHubLinks", { storyMapId: f.map.id })).rejects.toMatchObject({ code: "disabled" });
      f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.disabled.id, { agentMode: "propose", github: true }));
      await expect(f.call("PullStoryMapGitHubLinks", { storyMapId: f.map.id })).rejects.toMatchObject({ code: "validation" });
    }
  }
  expect(auth).not.toHaveBeenCalled();
});

it.each(["DeleteCard", "DeleteCards"] as const)("%s retains dangling Roadmap reads after target deletion and rejects a lane from another accessible Roadmap", async (command) => {
  const f = await fixture();
  const roadmap = created(f, await f.call("CreateRoadmap", { projectId: f.project.id, name: "Plan" }));
  const other = created(f, await f.call("CreateRoadmap", { projectId: f.project.id, name: "Other" }));
  const columnId = f.repository.listRoadmapColumns(roadmap.id)[0]!.id;
  const swimlaneId = f.repository.listRoadmapSwimlanes(other.id)[0]!.id;
  await expect(f.call("CreateRoadmapCard", { roadmapId: roadmap.id, columnId, swimlaneId, title: "Invalid lane" })).rejects.toMatchObject({ code: "validation" });
  expect(f.repository.listRoadmapCards(roadmap.id)).toEqual([]);
  const roadmapCard = created(f, await f.call("CreateRoadmapCard", { roadmapId: roadmap.id, columnId, title: "References" }));
  const release = created(f, await f.call("CreateStoryMapRelease", { storyMapId: f.map.id, name: "Release" }));
  for (const [targetType, targetId] of [["card", f.card.id], ["release", release.id]]) await f.call("CreateRoadmapReference", { roadmapCardId: roadmapCard.id, targetType, targetId });
  await f.call(command, command === "DeleteCard" ? { cardId: f.card.id, baseVersion: f.repository.getCard(f.card.id)!.version, strategy: "unassign" } : { storyMapId: f.map.id, cards: [{ id: f.card.id, baseVersion: f.repository.getCard(f.card.id)!.version }], affectedCards: f.repository.listCards(f.map.id).map((card) => ({ id: card.id, baseVersion: card.version })), strategy: "unassign" });
  await f.call("DeleteRelease", { releaseId: release.id, baseVersion: f.repository.getRelease(release.id)!.version });
  expect(data<{ references: unknown[] }>(await f.call("GetRoadmapDetails", { roadmapId: roadmap.id })).references).toHaveLength(2);
  await expect(f.call("CreateRoadmapReference", { roadmapCardId: roadmapCard.id, targetType: "card", targetId: f.card.id })).rejects.toMatchObject({ code: "not_found" });
});

it("imports inline sources with persisted provenance and filters runtime documents", async () => {
  const f = await fixture();
  const content = "# File requirement\n\nImport the complete source.\n";
  const input = { projectId: f.project.id, title: "Inline source", type: "markdown", content } as const;
  const firstImport = created(f, await f.call("ImportSourceDocument", input));
  const result = f.repository.getSourceDocumentDetails(firstImport.id)!;
  const repeated = await f.call("ImportSourceDocument", input);
  expect(repeated).toMatchObject({ outcome: "applied", changeSet: { execution: { operationResults: [{ entityIds: [] }] } } });
  expect(f.repository.getSourceDocumentDetails(result.document.id)).toEqual(result);
  expect(f.repository.listSourceDocumentSummaryData(f.project.id).filter((item) => item.document.fileHash === sourceHash(content))).toHaveLength(1);
  const stored = f.repository.getSourceDocumentDetails(result.document.id)!;
  expect(stored.document).toMatchObject({ fileHash: createHash("sha256").update(content).digest("hex") });
  expect(stored.document.filePath).toBe("inline://inline-source");
  expect(stored.chunks).toMatchObject(result.chunks);
  expect(stored.chunks.length).toBeGreaterThan(0);
  for (const input of [{}, { projectId: f.project.id }]) {
    const listed = await f.call("ListSourceDocuments", input);
    expect(JSON.stringify(listed)).toContain(result.document.id);
    expect(JSON.stringify(listed)).not.toContain(f.hiddenSource.document.id);
  }
  seedLegacySourceLink(f.handle, f.hiddenCard.id, stored.chunks[0]!.id);
  await expect(f.call("GetSourceDocument", { documentId: stored.document.id })).rejects.toMatchObject({ code: "disabled" });
});

it("proves historical deletion ownership and rejects foreign, unknown and unrelated dependencies", async () => {
  const f = await fixture();
  const records = f.unitOfWork.run(human, ({ repository }) => {
    const base = { projectId: f.project.id, title: "Deletion history", source: "mcp" as const, createdAt: new Date().toISOString() };
    const operation = { operationId: "fixture-operation-10", op: "delete" as const, entity: "card" as const, entityId: f.card.id, before: { storyMapId: f.map.id, title: f.card.title } };
    const visible = seedHistoricalChangeSet(f.handle, { ...base, id: randomUUID(), status: "applied", operations: [operation] as unknown as ChangeSet["operations"] });
    const hidden = seedHistoricalChangeSet(f.handle, { ...base, id: randomUUID(), status: "applied", operations: [{ ...operation, entityId: f.hiddenCard.id }] as unknown as ChangeSet["operations"] });
    const titleOnlyForeign = seedHistoricalChangeSet(f.handle, { ...base, id: randomUUID(), status: "applied", operations: [{ ...operation, entityId: f.hiddenCard.id, before: { title: f.hiddenCard.title } }] as unknown as ChangeSet["operations"] });
    const foreignMap = seedHistoricalChangeSet(f.handle, { ...base, id: randomUUID(), status: "applied", operations: [{ ...operation, before: { storyMapId: f.hiddenMap.id } }] as unknown as ChangeSet["operations"] });
    const unknownTarget = seedHistoricalChangeSet(f.handle, { ...base, id: randomUUID(), status: "applied", operations: [{ ...operation, entityId: randomUUID() }] as unknown as ChangeSet["operations"] });
    const unknownMap = seedHistoricalChangeSet(f.handle, { ...base, id: randomUUID(), status: "applied", operations: [{ ...operation, before: { storyMapId: randomUUID() } }] as unknown as ChangeSet["operations"] });
    const unrelatedDependency = seedHistoricalChangeSet(f.handle, { ...base, id: randomUUID(), status: "applied", operations: [{ ...operation, before: { documentId: f.card.id } }] as unknown as ChangeSet["operations"] });
    const unresolved = seedHistoricalChangeSet(f.handle, { ...base, id: randomUUID(), status: "proposed", operations: [{ ...operation, entityId: randomUUID() }] as unknown as ChangeSet["operations"] });
    const foreignDependency = seedHistoricalChangeSet(f.handle, { ...base, id: randomUUID(), status: "applied", operations: [{ ...operation, context: { cardId: f.hiddenCard.id } }] as unknown as ChangeSet["operations"] });
    repository.deleteCard(f.card.id, { strategy: "unassign" });
    repository.deleteCard(f.hiddenCard.id, { strategy: "unassign" });
    return { visible, hidden, titleOnlyForeign, foreignMap, unknownTarget, unknownMap, unrelatedDependency, unresolved, foreignDependency };
  });
  expect(f.repository.getCardDetails(f.card.id)).toBeUndefined();
  expect(f.repository.getCardDetails(f.hiddenCard.id)).toBeUndefined();
  for (const mapsDeleted of [false, true]) {
    if (mapsDeleted) f.unitOfWork.run(human, ({ repository }) => {
      repository.deleteStoryMap(f.map.id);
      repository.deleteStoryMap(f.hiddenMap.id);
    });
    for (const input of [{}, { projectId: f.project.id }]) {
      const result = data<{ changeSets: Array<{ id: string }> }>(await f.call("ListChangeSets", input));
      expect(result.changeSets.map((item) => item.id), `Deleted maps: ${mapsDeleted}`).toEqual([records.visible.id]);
      expect(JSON.stringify(result)).not.toContain(f.hiddenCard.id);
    }
  }
});

it("resolves historical ownership of deleted releases, personas, GitHub links, source links and parents", async () => {
  const f = await fixture();
  const records = f.unitOfWork.run(human, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: f.map.id, name: "Visible release" });
    const persona = repository.createPersona({ projectId: f.project.id, name: "Visible persona" });
    const githubLink = repository.createGitHubLink({ cardId: f.card.id, repo: "fixture/fixture", url: "https://github.com/fixture/fixture/issues/2", issueNumber: 2 });
    const hiddenGithubLink = repository.createGitHubLink({ cardId: f.hiddenCard.id, repo: "fixture/fixture", url: "https://github.com/fixture/fixture/issues/3", issueNumber: 3 });
    const visibleText = "Visible text";
    const visibleSource = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(visibleText), projectId: f.project.id, title: "Visible source", type: "txt", content: visibleText, fileHash: sourceHash(visibleText) });
    const sourceLink = repository.createCardSourceLink(f.card.id, { kind: "chunk", chunkId: visibleSource.chunks[0]!.id })!;
    const hiddenSourceLink = repository.createCardSourceLink(f.hiddenCard.id, { kind: "chunk", chunkId: f.hiddenSource.chunks[0]!.id })!;
    const operations = {
      release: { entity: "release" as const, entityId: release.id },
      hiddenRelease: { entity: "release" as const, entityId: f.hiddenRelease.id },
      persona: { entity: "persona" as const, entityId: persona.id },
      hiddenPersona: { entity: "persona" as const, entityId: f.hiddenPersona.id },
      githubLink: { entity: "githubExternalRef" as const, entityId: githubLink.id },
      hiddenGithubLink: { entity: "githubExternalRef" as const, entityId: hiddenGithubLink.id },
      sourceLink: { entity: "sourceLink" as const, entityId: sourceLink.id },
      hiddenSourceLink: { entity: "sourceLink" as const, entityId: hiddenSourceLink.id },
      hiddenParent: { entity: "card" as const, entityId: f.card.id, before: { parentId: f.hiddenCard.id } }
    };
    const changeSets = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, seedHistoricalChangeSet(f.handle, { id: randomUUID(), projectId: f.project.id, title: name, source: "mcp", status: "applied", createdAt: new Date().toISOString(), operations: [{ operationId: "fixture-operation-11", op: "delete", ...operation }] as unknown as ChangeSet["operations"] })]));
    repository.deleteCardSourceLink(f.card.id, { kind: "chunk", id: sourceLink.id });
    repository.deleteCardSourceLink(f.hiddenCard.id, { kind: "chunk", id: hiddenSourceLink.id });
    repository.deleteGitHubLink(githubLink.id);
    repository.deleteGitHubLink(hiddenGithubLink.id);
    repository.deleteRelease(release.id);
    repository.deleteRelease(f.hiddenRelease.id);
    repository.deletePersona(persona.id, { definitionBefore: repository.getPersona(persona.id), affectedCards: [] });
    repository.deletePersona(f.hiddenPersona.id, { definitionBefore: repository.getPersona(f.hiddenPersona.id), affectedCards: [] });
    repository.deleteCard(f.hiddenCard.id, { strategy: "unassign" });
    return changeSets;
  });
  const listed = data<{ changeSets: Array<{ id: string }> }>(await f.call("ListChangeSets", {})).changeSets.map((item) => item.id);
  expect(listed.sort()).toEqual(["release", "persona", "githubLink", "sourceLink"].map((name) => records[name]!.id).sort());
});

it("refuses ownership evidence from persisted deletion Activity undone by an actual restore", async () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-mcp-history-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(join(directory, "storymapper.sqlite"));
  const point = createRestorePoint(f.handle, "manual");
  const rows = f.unitOfWork.run(human, ({ repository }) => {
    const card = repository.createCard({ storyMapId: f.map.id, level: "story", title: f.card.title });
    const changeSet = seedHistoricalChangeSet(f.handle, { id: randomUUID(), projectId: f.project.id, title: "Later deletion", source: "mcp", status: "applied", createdAt: new Date().toISOString(), operations: [{ operationId: "fixture-operation-12", op: "delete", entity: "card", entityId: card.id, before: { title: card.title } }] as unknown as ChangeSet["operations"] });
    repository.deleteCard(card.id, { strategy: "unassign" });
    return { card, changeSet };
  });
  expect(data<{ changeSets: Array<{ id: string }> }>(await f.call("ListChangeSets", {})).changeSets.map((item) => item.id)).toContain(rows.changeSet.id);
  await restoreProject(f.handle, f.project.id, point.fileName, human);
  expect(f.repository.getCardDetails(rows.card.id)).toBeUndefined();
  expect(f.repository.getChangeSet(rows.changeSet.id)).toMatchObject({ status: "applied", undoneByRestore: true });
  expect(f.repository.listActivity().filter((event) => event.action === "card.deleted" && event.affectedEntityId === rows.card.id)).toMatchObject([{ projectId: f.project.id, undoneByRestore: true }]);
  for (const input of [{}, { projectId: f.project.id }]) {
    expect(data<{ changeSets: unknown[] }>(await f.call("ListChangeSets", input)).changeSets).toEqual([]);
  }
});

it("refuses contradictory persisted deletion ownership even when both Projects allow agent access", async () => {
  const f = await fixture();
  const changeSet = f.unitOfWork.run(human, ({ repository }) => {
    repository.updateSafetySettings(f.disabled.id, { agentMode: "apply" });
    const changeSet = seedHistoricalChangeSet(f.handle, { id: randomUUID(), projectId: f.project.id, title: "Ambiguous deletion", source: "mcp", status: "applied", createdAt: new Date().toISOString(), operations: [{ operationId: "fixture-operation-13", op: "delete", entity: "card", entityId: f.card.id, before: { title: f.card.title } }] as unknown as ChangeSet["operations"] });
    repository.deleteCard(f.card.id, { strategy: "unassign" });
    return changeSet;
  });
  expect(data<{ changeSets: Array<{ id: string }> }>(await f.call("ListChangeSets", {})).changeSets.map((item) => item.id)).toContain(changeSet.id);
  f.unitOfWork.run(human, ({ repository }) => repository.logActivity(f.disabled.id, "card.deleted", "card", f.card.id, { ...f.card, storyMapId: f.hiddenMap.id }));
  expect(f.repository.getCardDetails(f.card.id)).toBeUndefined();
  const events = f.repository.listActivity().filter((event) => event.action === "card.deleted" && event.affectedEntityId === f.card.id);
  expect(events).toHaveLength(2);
  expect(new Set(events.map((event) => event.projectId))).toEqual(new Set([f.project.id, f.disabled.id]));
  expect(events.every((event) => !event.undoneByRestore)).toBe(true);
  for (const input of [{}, { projectId: f.project.id }]) {
    expect(data<{ changeSets: unknown[] }>(await f.call("ListChangeSets", input)).changeSets).toEqual([]);
  }
});

it("pins GitHub tool refusals and proposal availability under protection and GitHub switches", async () => {
  const f = await fixture();
  const auth = vi.spyOn(credentials, "resolveProviderAuth").mockRejectedValue(new Error("Unexpected credential resolution."));
  const targets = f.unitOfWork.run(human, ({ repository }) => {
    const connection = repository.createConnectorConnection({ projectId: f.project.id, provider: "github", authMode: "token", name: "Local connection", owner: "fixture", repository: "fixture" });
    repository.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", cardId: f.card.id, remoteId: "1", url: "https://github.com/fixture/fixture/issues/1", labels: [] });
    const run = repository.createSyncRun({ storyMapId: f.map.id, connectionId: connection.id, mode: "sync", status: "applied" });
    const conflict = repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(f.card.id)!.storyMapId).find((row) => row.cardId === f.card.id)!.externalRefId, syncRunId: run.id, connectionId: connection.id, cardId: f.card.id, remoteId: "1", field: "title", localValue: f.card.title, remoteValue: "Remote title" });
    return { connection, conflict };
  });
  const calls: Array<[McpToolName, unknown]> = [
    ["PlanWorkItems", { storyMapId: f.map.id, connectionId: targets.connection.id, cardIds: [f.card.id] }],
    ["ResolveSyncConflict", { storyMapId: f.map.id, conflictId: targets.conflict.id, resolution: "remote", reviewed: { localValue: targets.conflict.localValue, remoteValue: targets.conflict.remoteValue } }]
  ];
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { github: false, agentMode: "apply" }));
  for (const [name, input] of calls) await expect(f.call(name, input), name).rejects.toMatchObject({ code: "disabled" });
  expect(auth).not.toHaveBeenCalled();
  const before = f.repository.getCardDetails(f.card.id);
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { github: true, agentMode: "propose" }));
  const remote = { remoteId: "1", title: "Remote title", body: f.card.description, state: "open", labels: [], url: "https://github.com/fixture/fixture/issues/1" };
  auth.mockResolvedValue({ connection: targets.connection, auth: {} });
  vi.mocked(createWorkItemProvider).mockReturnValue({ ...reviewedPushProviderFixture(), validateConnection: vi.fn(), listRemoteItems: vi.fn(), getRemoteItem: vi.fn(async () => remoteReadFixture(remote)), createOrUpdateRemoteItem: vi.fn() });
  expect(await f.call("ResolveSyncConflict", calls[1]![1])).toMatchObject({ outcome: "proposed", changeSet: { source: "github", proposedBy: { actorType: "agent", actorId: "local-mcp-host" } } });
  expect(f.repository.getSyncConflict(targets.conflict.id)).toMatchObject({ status: "open" });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { github: false, agentMode: "propose" }));
  const input = { projectId: f.project.id, storyMapId: f.map.id, templateId: "effort-estimate" };
  const proposal = (await f.call("CreateAiProposal", input)).changeSet!;
  expect(proposal).toMatchObject({ projectId: f.project.id, status: "proposed", source: "ai", operations: [{ operationId: `update-card-${f.card.id}`, op: "update", entity: "card", entityId: f.card.id, after: { estimate: 1 }, context: { templateId: "effort-estimate", cardIds: [f.card.id] } }] });
  const persisted = { ...proposal, undoneByRestore: false };
  expect(f.repository.getChangeSet(proposal.id)).toEqual(persisted);
  expect(data<{ changeSets: unknown[] }>(await f.call("ListChangeSets", { projectId: f.project.id })).changeSets).toContainEqual(persisted);
  expect(f.repository.getCardDetails(f.card.id)).toEqual(before);
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "off" }));
  await expect(f.call("CreateAiProposal", input)).rejects.toMatchObject({ code: "disabled" });
});

it("authorizes every remaining owner resolver before cross-Project writes", async () => {
  const f = await fixture();
  const targets = f.unitOfWork.run(human, ({ repository }) => {
    const status = repository.createWorkflowStatus({ projectId: f.disabled.id, name: "Hidden status", group: "active" });
    const template = repository.createStoryTemplate({ projectId: f.disabled.id, name: "Hidden template" });
    const link = repository.createGitHubLink({ cardId: f.hiddenCard.id, repo: "fixture/fixture", url: "https://github.com/fixture/fixture/issues/1", issueNumber: 1 });
    const attachment = repository.createCardAttachment(f.hiddenCard.id, { label: "Hidden attachment", filePath: "evidence.txt" })!;
    const connection = repository.createConnectorConnection({ projectId: f.disabled.id, provider: "github", authMode: "token", name: "Hidden connection", owner: "fixture", repository: "fixture" });
    const run = repository.createSyncRun({ storyMapId: f.hiddenMap.id, connectionId: connection.id, mode: "sync", status: "applied" });
    repository.upsertRemoteWorkItemLink({ externalRefId: link.id, connectionId: connection.id, labels: [] });
    const conflict = repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(f.hiddenCard.id)!.storyMapId).find((row) => row.cardId === f.hiddenCard.id)!.externalRefId, syncRunId: run.id, connectionId: connection.id, cardId: f.hiddenCard.id, remoteId: "1", field: "title", localValue: f.hiddenCard.title, remoteValue: f.hiddenCard.title });
    const roadmap = repository.createRoadmap({ projectId: f.project.id, name: "Accessible plan" });
    const column = repository.listRoadmapColumns(f.hiddenRoadmap.id)[0]!;
    const roadmapCard = repository.createRoadmapCard({ roadmapId: f.hiddenRoadmap.id, columnId: column.id, title: "Hidden planned card" });
    repository.updateSafetySettings(f.project.id, { github: true });
    return { status, template, link, attachment, conflict, roadmap, column, roadmapCard };
  });
  const calls: Array<[McpToolName, unknown]> = [
    ["UpdateWorkflowStatus", { statusId: targets.status.id, patch: { name: "Attack" } }],
    ["UpdateStoryTemplate", { templateId: targets.template.id, patch: { name: "Attack" } }],
    ["UpdateGitHubLink", { linkId: targets.link.id, patch: { repo: "attack/attack", url: "https://github.com/attack/attack/issues/1" } }],
    ["ResolveSyncConflict", { storyMapId: f.map.id, conflictId: targets.conflict.id, resolution: "remote", reviewed: { localValue: targets.conflict.localValue, remoteValue: targets.conflict.remoteValue } }],
    ["DeleteCardAttachment", { cardId: f.card.id, attachmentId: targets.attachment.id }],
    ["CreateRoadmapReference", { roadmapCardId: targets.roadmapCard.id, targetType: "card", targetId: f.card.id }],
    ["CreateRoadmapCard", { roadmapId: targets.roadmap.id, columnId: targets.column.id, title: "Attack" }],
    ["UpdateRoadmap", { roadmapId: f.hiddenRoadmap.id, baseVersion: 1, patch: { name: "Attack" } }]
  ];
  const readState = () => ({ status: f.repository.getWorkflowStatus(targets.status.id), template: f.repository.getStoryTemplate(targets.template.id), link: f.repository.getGitHubLink(targets.link.id), attachments: f.repository.listCardAttachments(f.hiddenCard.id), conflict: f.repository.getSyncConflict(targets.conflict.id), references: f.repository.listRoadmapReferences(f.hiddenRoadmap.id), cards: f.repository.listRoadmapCards(targets.roadmap.id), roadmap: f.repository.getRoadmap(f.hiddenRoadmap.id) });
  const before = readState();
  for (const [name, input] of calls) await expect(f.call(name, input), name).rejects.toMatchObject({ code: "disabled" });
  expect(readState()).toEqual(before);
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.disabled.id, { agentMode: "propose", github: true }));
  for (const [name, input] of calls.filter(([name]) => ["UpdateWorkflowStatus", "UpdateStoryTemplate", "UpdateGitHubLink", "UpdateRoadmap"].includes(name))) expect(await f.call(name, input), name).toMatchObject({ outcome: "proposed" });
  expect(readState()).toEqual(before);
});

it("executes the remaining local MCP adapters with valid arguments and persisted effects", async () => {
  const f = await fixture();
  const rows = f.unitOfWork.run(human, ({ repository }) => {
    const persona = repository.createPersona({ projectId: f.project.id, name: "Surface persona" });
    const annotation = repository.createAnnotation({ projectId: f.project.id, name: "Surface annotation" });
    repository.setCardAnnotation(f.card.id, annotation.id);
    const attachment = repository.createCardAttachment(f.card.id, { label: "Initial attachment", filePath: "evidence.txt" })!;
    const sourceText = "Surface requirement.";
    const source = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(sourceText), projectId: f.project.id, title: "Surface source", type: "txt", content: sourceText, fileHash: sourceHash(sourceText) });
    repository.createCardSourceLink(f.card.id, { kind: "chunk", chunkId: source.chunks[0]!.id });
    const activity = repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Surface activity" });
    const roadmap = repository.createRoadmap({ projectId: f.project.id, name: "Surface plan" });
    const removableMap = repository.createStoryMap({ projectId: f.project.id, name: "Removable map" });
    const link = repository.createGitHubLink({ cardId: f.card.id, repo: "fixture/fixture", issueNumber: 1, url: "https://github.com/fixture/fixture/issues/1" });
    const connection = repository.createConnectorConnection({ projectId: f.project.id, provider: "github", authMode: "token", name: "Surface connection", owner: "fixture", repository: "fixture", readOnly: false });
    repository.updateSafetySettings(f.project.id, { github: true });
    return { persona, annotation, attachment, source, activity, roadmap, removableMap, link, connection };
  });
  const version = { card: (id: string) => f.repository.getCard(id)!.version, roadmap: (id: string) => f.repository.getRoadmap(id)!.version, persona: (id: string) => f.repository.getPersona(id)!.version, map: (id: string) => f.repository.getStoryMapOrThrow(id).version };
  await exerciseExecutesTheRemainingLocalMCPAdaptersWithValidArguments2(f, rows, version);
});

it("forwards conflict resolution arguments and persists the remote field through the shared use case", async () => {
  const f = await fixture();
  const rows = f.unitOfWork.run(human, ({ repository }) => {
    const connection = repository.createConnectorConnection({ projectId: f.project.id, provider: "github", authMode: "token", name: "Surface connection", owner: "fixture", repository: "fixture" });
    const remote: RemoteWorkItem = { remoteId: "1", remoteNumber: 1, title: f.map.name, body: f.card.description, state: "open", labels: [], url: "https://github.com/fixture/fixture/issues/1" };
    repository.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", cardId: f.card.id, ...remote });
    const run = repository.createSyncRun({ storyMapId: f.map.id, connectionId: connection.id, mode: "sync", status: "applied" });
    const conflict = repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(f.card.id)!.storyMapId).find((row) => row.cardId === f.card.id)!.externalRefId, syncRunId: run.id, connectionId: connection.id, cardId: f.card.id, remoteId: remote.remoteId, field: "title", localValue: f.card.title, remoteValue: remote.title });
    repository.updateSafetySettings(f.project.id, { github: true });
    return { connection, remote, conflict };
  });
  vi.spyOn(credentials, "resolveProviderAuth").mockResolvedValue({ connection: rows.connection, auth: {} });
  const provider = { ...reviewedPushProviderFixture(), validateConnection: vi.fn(), listRemoteItems: vi.fn(), getRemoteItem: vi.fn(async () => remoteReadFixture(rows.remote)), createOrUpdateRemoteItem: vi.fn() };
  vi.mocked(createWorkItemProvider).mockReturnValue(provider);
  const result = await f.call("ResolveSyncConflict", { storyMapId: f.map.id, conflictId: rows.conflict.id, resolution: "remote", reviewed: { localValue: rows.conflict.localValue, remoteValue: rows.conflict.remoteValue } });
  expect(result).toMatchObject({ outcome: "applied", changeSet: { source: "github", proposedBy: { actorType: "agent", actorId: "local-mcp-host", mcpSessionId: expect.any(String) }, execution: { actor: { actorType: "github", actorId: "local-mcp-host", mcpSessionId: expect.any(String) } } } });
  expect(provider.getRemoteItem).toHaveBeenCalledWith(rows.connection, {}, rows.remote.remoteId);
  expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  expect(f.repository.getCardDetails(f.card.id)?.title).toBe(rows.remote.title);
  expect(f.repository.getSyncConflict(rows.conflict.id)?.status).toBe("resolved-remote");
  expect(f.repository.listCardHistory(f.card.id).at(-1)).toMatchObject({ actor: "local-mcp-host", actorType: "github", mcpSessionId: expect.any(String) });
  expect(f.repository.listActivity(f.project.id).filter((event) => event.action === "tool_call" && event.affectedEntityId === "ResolveSyncConflict")).toEqual([expect.objectContaining({ actor: "local-mcp-host", actorType: "agent", mcpSessionId: expect.any(String), after: expect.objectContaining({ outcome: "ok" }) })]);
});

it("keeps template authoring human-only while exposing scoped Agent reads", async () => {
  const f = await fixture();
  const template = { projectId: f.project.id, id: "surface-template", name: "Surface template", instructions: "Propose changes based on evidence.", arguments: [{ name: "evidence", required: true }] };
  f.unitOfWork.run(human, ({ repository }) => repository.createAiTemplate({ ...template, examples: [] }));
  expect(data(await f.call("ListAiTemplates", { projectId: f.project.id }))).toMatchObject({ templates: expect.arrayContaining([expect.objectContaining(template)]) });
  await expect(f.call("ListAiTemplates", { projectId: f.disabled.id })).rejects.toMatchObject({ code: "disabled" });
  for (const name of ["CreateAiTemplate", "UpdateAiTemplate", "DeleteAiTemplate"]) {
    await expect(f.call(name as McpToolName, template)).rejects.toThrow();
  }
  expect(f.repository.getAiTemplate(f.project.id, template.id)).toMatchObject(template);
});

it("executes every remaining core command over real HTTP with persisted target effects", async () => {
  const f = await fixture();
  const activity = created(f, await f.call("CreateStoryMapCard", { storyMapId: f.map.id, level: "activity", title: "Transport Activity" }));
  await f.call("UpdateStoryMapCard", { cardId: activity.id, baseVersion: f.repository.getCard(activity.id)!.version, patch: { title: "Updated Transport Activity" } });
  expect(f.repository.getCard(activity.id)?.title).toBe("Updated Transport Activity");
  await f.call("MoveStoryMapCard", { cardId: activity.id, baseVersion: f.repository.getCard(activity.id)!.version, parentId: null, position: 0 });
  expect(f.repository.getCard(activity.id)?.position).toBe(0);
  await f.call("DeleteOrArchiveStoryMapCard", { cardId: activity.id, baseVersion: f.repository.getCard(activity.id)!.version });
  expect(f.repository.getCard(activity.id)).toMatchObject({ archived: true, status: "todo" });
  const release = created(f, await f.call("CreateStoryMapRelease", { storyMapId: f.map.id, name: "Transport Release" }));
  await f.call("UpdateStoryMapRelease", { storyMapId: f.map.id, releaseId: release.id, baseVersion: f.repository.getRelease(release.id)!.version, patch: { name: "Updated Transport Release" } });
  expect(f.repository.getRelease(release.id)?.name).toBe("Updated Transport Release");
  const persona = created(f, await f.reviewedCall("CreateStoryMapPersona", { projectId: f.project.id, name: "Transport Persona" }));
  await f.reviewedCall("UpdateStoryMapPersona", { projectId: f.project.id, personaId: persona.id, baseVersion: f.repository.getPersona(persona.id)!.version, patch: { name: "Updated Transport Persona" } });
  expect(f.repository.getPersona(persona.id)?.name).toBe("Updated Transport Persona");
  await f.call("SetExternalRef", { entityType: "card", entityId: f.card.id, system: "bmad", externalId: "transport-card" });
  expect((await f.call("UpdateDeliveryStatus", { storyMapId: f.map.id, cards: [{ system: "bmad", externalId: "transport-card", status: "active" }] })).outcome).toBe("applied");
  expect(f.repository.getCard(f.card.id)?.status).toBe("active");
  expect(f.repository.listExternalRefsForStoryMap(f.map.id)).toMatchObject([{ entityType: "card", entityId: f.card.id, system: "bmad", externalId: "transport-card" }]);
});
it("routes real HTTP GitHub import sync pull and Dry Run commands through durable ChangeSets", async () => {
  const f = await fixture();
  const connection = f.unitOfWork.run(human, ({ repository }) => {
    repository.updateSafetySettings(f.project.id, { github: true });
    return repository.createConnectorConnection({ projectId: f.project.id, provider: "github", authMode: "token", name: "Transport connection", owner: "fixture", repository: "fixture", readOnly: false });
  });
  vi.spyOn(credentials, "resolveProviderAuth").mockResolvedValue({ connection, auth: {} });
  let remote: RemoteWorkItem = { remoteId: "19", remoteNumber: 19, title: "Transport remote story", body: "Transport source", state: "open", labels: [], url: "https://github.com/fixture/fixture/issues/19" };
  const provider = { ...reviewedPushProviderFixture(), readPushInputs: vi.fn(async () => ({ issueTypes: ["Task"], labels: ["local-story-map", "story-map:LSM", "level:activity", "level:story", "status:todo"], milestones: [], writable: true })), validateConnection: vi.fn(), listRemoteItems: vi.fn(async () => [remote]), getRemoteItem: vi.fn(async () => remoteReadFixture(remote)), createOrUpdateRemoteItem: vi.fn() };
  vi.mocked(createWorkItemProvider).mockReturnValue(provider);
  const ticketInput = { storyMapId: f.map.id, connectionId: connection.id, selector: "19", placement: { level: "activity", parentId: null, releaseId: null, position: 0 } };
  const lookup = lookupGitHubTicketResponseSchema.parse((await f.call("LookupGitHubTicket", ticketInput)).data);
  await f.call("ImportGitHubTicket", { ...ticketInput, reviewEvidence: lookup.reviewEvidence, title: remote.title, description: remote.body });
  const imported = await f.call("ImportGitHubIssues", { storyMapId: f.map.id, connectionId: connection.id });
  expect(imported.outcome).toBe("applied");
  const linked = f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id).find((link) => link.remoteId === remote.remoteId)!;
  expect(f.repository.getCard(linked.cardId!)?.title).toBe(remote.title);
  remote = { ...remote, title: "Updated transport remote story" };
  expect((await f.call("SyncGitHubLinks", { storyMapId: f.map.id, connectionId: connection.id })).outcome).toBe("applied");
  expect(f.repository.getCard(linked.cardId!)?.title).toBe(remote.title);
  expect((await f.call("PullStoryMapGitHubLinks", { storyMapId: f.map.id, connectionIds: [connection.id] })).outcome).toBe("applied");
  const push = await f.call("PushCardsToGitHub", { storyMapId: f.map.id, connectionId: connection.id, cardIds: [linked.cardId] });
  expect(push).toMatchObject({ outcome: "proposed", plan: { items: expect.arrayContaining([expect.objectContaining({ cardId: linked.cardId, body: expect.stringContaining(`${f.origin}/projects/${f.project.id}/story-maps/${f.map.id}/discovery?card=${linked.cardId}`) })]) } });
  expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  const commands = f.repository.listChangeSets(f.project.id);
  expect(commands).toHaveLength(5);
  expect(commands.every((command) => command.source === "github" && command.proposedBy?.actorType === "agent")).toBe(true);
  expect(commands.filter((command) => command.status === "applied").every((command) => command.execution?.actor.actorType === "github")).toBe(true);
});
it("routes a submitted planning cut through the canonical command response", async () => {
  const f = await fixture();
  const result = await f.call("SubmitChangeSet", { projectId: f.project.id, title: "Submitted cut", operations: [{ operationId: "submitted-update", op: "update", entity: "card", entityId: f.card.id, after: { title: "Submitted" } }] });
  expect(result.outcome).toBe("applied");
  expect(f.repository.getCardDetails(f.card.id)?.title).toBe("Submitted");
});
it("runs dependency commands through the shared catalog", async () => {
  const f = await fixture(), prerequisite = f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Prerequisite" }));
  await expect(f.call("SetCardDependency", { cardId: f.card.id, prerequisiteCardId: prerequisite.id, baseVersion: f.card.version })).resolves.toMatchObject({ outcome: "applied" });
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toMatchObject([{ cardId: f.card.id, prerequisiteCardId: prerequisite.id }]);
  await expect(f.call("DeleteCardDependency", { cardId: f.card.id, prerequisiteCardId: prerequisite.id, baseVersion: f.repository.getCard(f.card.id)!.version })).resolves.toMatchObject({ outcome: "applied" });
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toEqual([]);
});

async function exerciseExcludesInaccessibleChangeSetTargetsAndNestedBeforeAfterContext(f: Awaited<ReturnType<typeof fixture>>) {
  const persisted = f.unitOfWork.run(human, ({ repository }) => {
    const base = { projectId: f.project.id, title: "Visible", source: "mcp" as const, status: "proposed" as const, createdAt: new Date().toISOString() };
    const maskText = "Source for a masked Card reference.";
    const maskSource = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(maskText), projectId: f.project.id, title: "Mask source", type: "txt", content: maskText, fileHash: sourceHash(maskText) });
    const permitted = ["proposed", "approved"].map((status) => {
      const proposal = repository.createChangeSet({ ...base, id: randomUUID(), operations: [{ operationId: "fixture-operation-3", op: "update", entity: "card", entityId: f.card.id, after: { estimate: 2 } }] });
      return status === "approved" ? changeSetSchema.parse(repository.updateChangeSetStatus(proposal.id, "approved")) : proposal;
    });
    const hidden = [
      [{ operationId: "fixture-operation-4", op: "update", entity: "card", entityId: f.hiddenCard.id, after: { description: "Disabled target payload" } }],
      ...["before", "after", "context"].map((key) => [{ operationId: "fixture-operation-5", op: "update", entity: "card", entityId: f.card.id, [key]: { nested: { cardIds: [f.hiddenCard.id], description: "Disabled dependency payload" } } }]),
      [{ operationId: "fixture-operation-6", op: "link", entity: "sourceLink", entityId: "masked-source-link", after: { kind: "chunk", cardId: f.hiddenCard.id, chunkId: maskSource.chunks[0]!.id } }, { operationId: "fixture-operation-7", op: "create", entity: "card", entityId: f.hiddenCard.id, after: { storyMapId: f.map.id, level: "story", title: "Mask" } }, { operationId: "fixture-operation-8", op: "update", entity: "card", entityId: f.hiddenCard.id, after: { estimate: 3 } }],
      [{ operationId: "fixture-operation-9", op: "update", entity: "card", entityId: randomUUID(), after: { estimate: 3 } }],
      [{ operationId: "hidden-selector", op: "update", entity: "card", entityId: f.card.id, selector: { kind: "id", id: f.hiddenCard.id }, after: { estimate: 3 } }],
      [{ operationId: "hidden-selector-alias", op: "create", entity: "card", entityId: f.hiddenCard.id, after: { storyMapId: f.map.id, level: "story", title: "Alias" } }, { operationId: "hidden-selector-local", op: "update", entity: "card", entityId: f.card.id, selector: { kind: "local", localId: f.hiddenCard.id }, after: { estimate: 3 } }],
      [{ operationId: "hidden-external-scope", op: "upsert", entity: "card", entityId: "new-upsert", selector: { kind: "externalRef", scopeId: f.hiddenMap.id, system: "bmad", externalId: "story-1" }, after: { storyMapId: f.map.id, level: "story", title: "Foreign scope" } }],
      [{ operationId: "forward-update", op: "update", entity: "card", entityId: "future-card", after: { estimate: 3 } }, { operationId: "future-create", op: "create", entity: "card", entityId: "future-card", after: { storyMapId: f.map.id, level: "story", title: "Future" } }],
      [{ operationId: "chunk-alias-create", op: "create", entity: "card", entityId: f.hiddenSource.chunks[0]!.id, after: { storyMapId: f.map.id, level: "story", title: "Chunk alias" } }, { operationId: "literal-chunk-link", op: "link", entity: "sourceLink", entityId: "literal-link", after: { kind: "chunk", cardId: f.card.id, chunkId: f.hiddenSource.chunks[0]!.id } }]
    ].map((operations) => {
      const historicalNested = operations.some((operation) => Object.values(operation).some((value) => value !== null && typeof value === "object" && "nested" in value));
      if (!historicalNested) changeSetSchema.shape.operations.parse(operations);
      return seedHistoricalChangeSet(f.handle, { ...base, status: historicalNested ? "stale" : base.status, id: randomUUID(), operations: operations as typeof permitted[0]["operations"] }, historicalNested ? 1 : OPERATIONS_SCHEMA_VERSION);
    });
    return { permitted, hidden };
  });
  for (const input of [{}, { projectId: f.project.id }]) {
    const result = data<{ changeSets: Array<{ id: string; status: string; }>; }>(await f.call("ListChangeSets", input));
    expect(result.changeSets.map((item) => item.id).sort()).toEqual(persisted.permitted.map((item) => item.id).sort());
    expect(result.changeSets.map((item) => item.status).sort()).toEqual(["approved", "proposed"]);
    expect(JSON.stringify(result)).not.toContain(f.hiddenCard.id);
    expect(JSON.stringify(result)).not.toContain("Disabled dependency payload");
  }
  return persisted;
}

async function exerciseExecutesTheRemainingLocalMCPAdaptersWithValidArguments2(f: Awaited<ReturnType<typeof fixture>>, rows: { persona: Persona; annotation: Annotation; attachment: CardAttachment; source: { document: SourceDocument; chunks: SourceChunk[]; status: "imported" | "unchanged"; }; activity: Card; roadmap: Roadmap; removableMap: StoryMap; link: GitHubLink; connection: ConnectorConnection; }, version: { card: (id: string) => number; roadmap: (id: string) => number; persona: (id: string) => number; map: (id: string) => number; }) {
  const cases: Array<[McpToolName, unknown | (() => unknown), Record<string, unknown>]> = [
    ["ListAiTemplates", { projectId: f.project.id }, { templates: expect.arrayContaining([expect.objectContaining({ id: "effort-estimate" })]) }],
    ["CreateCardAttachment", { cardId: f.card.id, label: "Surface attachment", filePath: "surface.txt" }, { attachment: { label: "Surface attachment", filePath: "surface.txt" } }],
    ["ListCardAttachments", { cardId: f.card.id }, { attachments: expect.arrayContaining([expect.objectContaining({ id: rows.attachment.id }), expect.objectContaining({ label: "Surface attachment" })]) }],
    ["DeleteCardAttachment", { cardId: f.card.id, attachmentId: rows.attachment.id }, { ok: true }],
    ["SetCardPersona", { cardId: f.card.id, personaId: rows.persona.id }, { link: { cardId: f.card.id, personaId: rows.persona.id } }],
    ["DeleteCardPersona", { cardId: f.card.id, personaId: rows.persona.id }, { ok: true }],
    ["DeleteCardAnnotation", { cardId: f.card.id, annotationId: rows.annotation.id }, { ok: true }],
    ["DeleteCardSourceLink", { cardId: f.card.id, kind: "chunk", id: f.repository.listSourceLinksForStoryMap(f.map.id).find((link) => link.kind === "chunk" && link.chunkId === rows.source.chunks[0]!.id)!.id }, { ok: true }],
    ["ParkCard", () => ({ cardId: rows.activity.id, baseVersion: version.card(rows.activity.id), childStrategy: "unassign" }), { id: rows.activity.id, parked: true }],
    ["UnparkCard", () => ({ cardId: rows.activity.id, baseVersion: version.card(rows.activity.id) }), { id: rows.activity.id, parked: false }],
    ["ListConnectorConnections", { projectId: f.project.id }, { connections: expect.arrayContaining([expect.objectContaining({ id: rows.connection.id })]) }],
    ["GetSafetySettings", { projectId: f.project.id }, { settings: { agentMode: "apply", github: true } }],
    ["ListActivity", { projectId: f.project.id, toolName: "CreateCardAttachment" }, { activityEvents: expect.arrayContaining([expect.objectContaining({ action: "tool_call", actor: "local-mcp-host", toolCall: expect.objectContaining({ outcome: "ok" }) })]) }],
    ["CreateGitHubIssueDryRun", { storyMapId: f.map.id, cardIds: [f.card.id], repo: "fixture/fixture" }, { dryRuns: expect.arrayContaining([expect.objectContaining({ cardId: f.card.id, body: expect.stringContaining(`${f.origin}/projects/${f.project.id}/story-maps/${f.map.id}/discovery?card=${f.card.id}`) })]) }],
    ["CreateGitHubLink", { cardId: rows.activity.id, repo: "fixture/fixture", issueNumber: 2, url: "https://github.com/fixture/fixture/issues/2" }, { link: { cardId: rows.activity.id, issueNumber: 2 } }],
    ["UpdateGitHubLink", { linkId: rows.link.id, patch: { issueNumber: 3, url: "https://github.com/fixture/fixture/issues/3" } }, { link: { id: rows.link.id, issueNumber: 3 } }],
    ["GetGitHubSyncHealth", { storyMapId: f.map.id }, { storyMapId: f.map.id, totalLinks: 2 }],
    ["DeleteGitHubLink", { linkId: rows.link.id }, { ok: true }],
    ["UpsertProductContext", { projectId: f.project.id, purpose: "Complete MCP surface" }, { context: { projectId: f.project.id, purpose: "Complete MCP surface" } }],
    ["GetProductContext", { projectId: f.project.id }, { context: { purpose: "Complete MCP surface" } }],
    ["GetReleaseSummaryReport", { storyMapId: f.map.id }, { storyMapId: f.map.id, totalStories: 1 }],
    ["GetReleaseTimelineReport", { storyMapId: f.map.id }, { storyMapId: f.map.id, items: [] }],
    ["GetSourceCoverageReport", { projectId: f.project.id }, { projectId: f.project.id, documents: expect.arrayContaining([expect.objectContaining({ id: rows.source.document.id })]) }],
    ["ListRoadmaps", { projectId: f.project.id }, { roadmaps: expect.arrayContaining([expect.objectContaining({ id: rows.roadmap.id })]) }],
    ["UpdateRoadmap", () => ({ roadmapId: rows.roadmap.id, baseVersion: version.roadmap(rows.roadmap.id), patch: { name: "Updated plan" } }), { id: rows.roadmap.id, name: "Updated plan" }],
    ["PlanWorkItems", { storyMapId: f.map.id, connectionId: rows.connection.id, cardIds: [f.card.id] }, { storyMapId: f.map.id, connectionId: rows.connection.id, mode: "push", items: expect.arrayContaining([expect.objectContaining({ cardId: f.card.id, body: expect.stringContaining(`${f.origin}/projects/${f.project.id}/story-maps/${f.map.id}/discovery?card=${f.card.id}`) })]) }],
    ["BulkUpdateCards", () => ({ storyMapId: f.map.id, cards: [{ id: f.card.id, baseVersion: version.card(f.card.id) }], patch: { estimate: 7 } }), { cards: expect.arrayContaining([expect.objectContaining({ id: f.card.id, estimate: 7 })]) }],
    ["DeletePersona", () => ({ personaId: rows.persona.id, baseVersion: version.persona(rows.persona.id), definitionBefore: f.repository.getPersona(rows.persona.id), affectedCards: [] }), { ok: true }],
    ["DeleteStoryMap", () => ({ storyMapId: rows.removableMap.id, baseVersion: version.map(rows.removableMap.id) }), { deleted: true }]
  ];
  await exerciseExecutesTheRemainingLocalMCPAdaptersWithValidArguments(cases, f, rows);
}



export type CompleteSurfaceFixture = Awaited<ReturnType<typeof fixture>>;
