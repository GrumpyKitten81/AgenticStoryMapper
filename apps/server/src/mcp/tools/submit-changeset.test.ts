import type { Card, Release, Persona, ChangeSetCommandResponse } from "@storymapper/contracts";
import { splitTextIntoChunks } from "@storymapper/importers";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, expect, it, vi } from "vitest";
import { changeSetCommandResponseSchema, type ChangeOperation, type LiveTransaction } from "@storymapper/contracts";
import { rejectSqliteWrite } from "@storymapper/db/test-fixtures/sqlite-write-failure";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { canReadChangeSet, resolveToolProjectIds } from "@storymapper/server/mcp/tools/project-scopes";
import { registerMcpHttp } from "@storymapper/server/mcp/http";
import { executeChangeSetCommand } from "@storymapper/server/application/changeset/changeset-command";
import { approveChangeSet, applyChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";

const human = { actorType: "human", actorId: "submission-fixture" } as const;
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-submission-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const live: LiveTransaction[] = [];
  const unitOfWork = new UnitOfWork(handle);
  unitOfWork.subscribe((event) => { live.push(event); });
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Submission" });
    const other = repository.createProject({ name: "Other" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const otherMap = repository.createStoryMap({ projectId: other.id, name: "Other Map" });
    const foreign = repository.createCard({ storyMapId: otherMap.id, level: "story", title: "Foreign" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Existing" });
    repository.updateSafetySettings(project.id, { agentMode: "apply" });
    return { project, map, other, otherMap, foreign, card };
  });
  live.length = 0;
  const server = Fastify();
  cleanup.push(() => server.close());
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: path });
  registerMcpHttp(server, repository, unitOfWork);
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "submission-sdk-host", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  await client.connect(transport);
  cleanup.push(() => client.close());
  async function call(surface: string, input: unknown, name = "SubmitChangeSet") {
    if (surface === "http") {
      const response = await server.inject({ method: "POST", url: "/api/mcp/call", payload: { name, input } });
      return response.json();
    }
    const result = await client.callTool({ name, arguments: input as Record<string, unknown> });
    return JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
  }
  return { directory, path, handle, repository, unitOfWork, live, server, client, transport, call, ...rows };
}

function cut(storyMapId: string, projectId: string): ChangeOperation[] {
  const operations: ChangeOperation[] = [
    { operationId: "release", op: "create", entity: "release", entityId: "release-local", after: { storyMapId, name: "Release" } },
    { operationId: "persona", op: "create", entity: "persona", entityId: "persona-local", after: { projectId, name: "Persona" } },
    { operationId: "activity", op: "create", entity: "card", entityId: "activity-local", after: { storyMapId, level: "activity", title: "Activity" } },
    { operationId: "step", op: "create", entity: "card", entityId: "step-local", after: { storyMapId, level: "step", title: "Step", parentId: "activity-local" } }
  ];
  for (let index = 0; index < 198; index++) operations.push({ operationId: `card-${index}`, op: "create", entity: "card", entityId: `local-${index}`, rationale: index === 0 ? "Explicit rationale" : undefined, after: { storyMapId, level: index === 197 ? "note" : "story", title: `Card ${index}`, parentId: "step-local", releaseId: "release-local" } });
  operations.push({ operationId: "relation", op: "set", entity: "cardPersona", entityId: "relation-local", after: { cardId: "local-0", personaId: "persona-local" } });
  operations.push({ operationId: "note", op: "link", entity: "sourceLink", entityId: "note-local", after: { cardId: "local-0", kind: "note", note: "Reviewed evidence" } });
  return operations;
}

it.each(["http", "sdk"])("submits one 200-Card cut with real %s actor and retained metadata", async (surface) => {
  const f = await fixture();
  const advertised = await f.client.listTools();
  expect(advertised.tools.some((tool) => tool.name === "SubmitChangeSet")).toBe(true);
  const proposed = changeSetCommandResponseSchema.parse(await f.call(surface, { projectId: f.project.id, title: "Whole cut", operations: cut(f.map.id, f.project.id), context: { projectId: f.project.id, storyMapId: f.map.id }, sources: [{ kind: "note", note: "Shared evidence" }], rationale: "Shared rationale" }));
  expect(proposed.outcome).toBe("proposed");
  expect(f.repository.listCards(f.map.id)).toHaveLength(1);
  approveChangeSet(f, human, proposed.changeSetId);
  const application = await f.call(surface, { changeSetId: proposed.changeSetId, approvalToken: "recorded" }, "ApplyChangeSet");
  const result = changeSetCommandResponseSchema.parse({ ...proposed, outcome: "applied", changeSet: application.changeSet });
  expect(result.outcome).toBe("applied");
  expect(f.repository.listChangeSets(f.project.id)).toHaveLength(1);
  expect(f.repository.listCards(f.map.id)).toHaveLength(201);
  const cards = f.repository.listCards(f.map.id);
  const activity = cards.find((card) => card.title === "Activity")!;
  const step = cards.find((card) => card.title === "Step")!;
  const stories = cards.filter((card) => card.title.startsWith("Card "));
  const release = f.repository.listReleases(f.map.id)[0]!;
  const persona = f.repository.listPersonas(f.project.id)[0]!;
  const first = stories.find((card) => card.title === "Card 0")!;
  await exerciseSubmitsOne200CardCutWithRealSActor(activity, step, release, f, stories, persona, first, result, surface, cards);
  const reopened = openStoryMapperDb(f.path);
  try {
    const durable = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(durable.listChangeSets(f.project.id)).toHaveLength(1);
    expect(durable.listCards(f.map.id)).toHaveLength(201);
    expect(durable.listActivity().filter((event) => event.action === "tool_call")).toHaveLength(2);
  } finally { reopened.$client.close(); }
});

it.each(["http", "sdk"])("defers protected and explicit proposal cuts on %s with no domain writes or snapshots", async (surface) => {
  const f = await fixture();
  for (const protection of [true, false]) {
    f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: protection ? "propose" : "apply" }));
    f.live.length = 0;
    const before = f.repository.getOperationSnapshot(f.project.id);
    const result = changeSetCommandResponseSchema.parse(await f.call(surface, { projectId: f.project.id, title: "Proposed cut", operations: cut(f.map.id, f.project.id), ...(protection ? {} : { apply: false }) }));
    expect(result).toMatchObject({ outcome: "proposed", previewRef: { changeSetId: result.changeSetId } });
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
    expect(f.live.flatMap((event) => event.entities).filter((entity) => ["card", "release", "persona", "sourceDocument"].includes(entity.entityType))).toEqual([]);
    expect(readdirSync(f.directory)).not.toContain("snapshots");
  }
  expect(f.repository.listChangeSets(f.project.id)).toHaveLength(2);
  expect(f.repository.listActivity().filter((event) => event.action === "tool_call")).toHaveLength(2);
});

it.each(["http", "sdk"])("rejects invalid references, schema claims and foreign aliases before storage on %s", async (surface) => {
  const f = await fixture();
  const base = { projectId: f.project.id, title: "Invalid", apply: false };
  const card: ChangeOperation = { operationId: "create", entityId: "local", op: "create", entity: "card", after: { storyMapId: f.map.id, level: "story", title: "Created" } };
  const inputs = [
    { ...base, operations: [{ ...card, after: { ...card.after, parentId: "future" } }, { ...card, operationId: "future-op", entityId: "future" }] },
    { ...base, operations: [{ ...card, after: { ...card.after, releaseId: randomUUID() } }] },
    { ...base, operations: [{ ...card, after: { ...card.after, parentId: randomUUID() } }] },
    { ...base, operations: [{ ...card, after: { ...card.after, releaseId: "future-release" } }, { operationId: "future-release-op", op: "create", entity: "release", entityId: "future-release", after: { storyMapId: f.map.id, name: "Future" } }] },
    { ...base, operations: [{ operationId: "missing-persona", op: "set", entity: "cardPersona", entityId: "relation", after: { cardId: f.card.id, personaId: randomUUID() } }] },
    { ...base, operations: [card, card] },
    { ...base, operations: [card, { ...card, operationId: "second" }] },
    { ...base, operations: [{ ...card, entityId: f.foreign.id }, { ...card, operationId: "child", entityId: "child-local", after: { ...card.after, parentId: f.foreign.id } }] },
    { ...base, operations: [{ ...card, after: { ...card.after, title: 123 } }] },
    { ...base, operations: [{ ...card, op: "invented" }] }
  ];
  const expectedErrors = [[0, "create"], [0, "create"], [0, "create"], [0, "create"], [0, "missing-persona"], [1, "create"], [1, "second"], [0, "create"], [0, "create"], [0, "create"]] as const;
  for (const [caseIndex, input] of inputs.entries()) {
    const result = await f.call(surface, input);
    const [index, operationId] = expectedErrors[caseIndex]!;
    expect(result).toMatchObject({ details: { index, operationId } });
    expect(f.repository.listChangeSets(f.project.id)).toHaveLength(0);
    expect(f.repository.listCards(f.map.id)).toHaveLength(1);
  }
  for (const field of ["proposedBy", "approval", "execution", "status", "id", "source", "actorId", "operationsSchemaVersion"]) {
    expect(await f.call(surface, { ...base, operations: [card], [field]: "forged" })).toMatchObject({ code: expect.any(String) });
  }
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  expect(f.repository.listActivity().filter((event) => event.action === "tool_call")).toHaveLength(inputs.length + 8);
});

it.each(["http", "sdk"])("simulates inline imports and dependent locators before protected proposal storage on %s", async (surface) => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  const content = "Initial requirements";
  const source: ChangeOperation = { operationId: "import", op: "import", entity: "sourceDocument", entityId: "source-local", after: { projectId: f.project.id, title: "Inline", type: "txt", inlineContent: content, fileHash: createHash("sha256").update(content).digest("hex") } };
  const newCard: ChangeOperation = { operationId: "evidence-card", op: "create", entity: "card", entityId: "evidence-local", after: { storyMapId: f.map.id, level: "story", title: "Initial source Card" } };
  const operations: ChangeOperation[] = [source, newCard, { operationId: "link", op: "link", entity: "sourceLink", entityId: "link-local", after: { kind: "chunk", cardId: "evidence-local", chunk: { kind: "import", operationId: "import", locator: "paragraph#1" } } }];
  const input = { projectId: f.project.id, title: "Initial evidence", operations };
  for (const [caseIndex, invalid] of [
    [{ ...source, after: { ...source.after, inlineContent: undefined, filePath: "/private/never-read.txt" } }, newCard, operations[2]],
    [{ ...source, after: { ...source.after, fileHash: "a".repeat(64) } }, newCard, operations[2]],
    [source, newCard, { ...operations[2], after: { kind: "chunk", cardId: "evidence-local", chunk: { kind: "import", operationId: "import", locator: "missing" } } }]
  ].entries()) expect(await f.call(surface, { ...input, operations: invalid })).toMatchObject({ details: caseIndex === 2 ? { index: 2, operationId: "link" } : { index: 0, operationId: "import" } });
  expect(await f.call(surface, { ...input, operations: [{ ...source, after: { ...source.after, fileHash: "a".repeat(64) } }, newCard, operations[2]] })).toMatchObject({ code: "conflict", conflicts: [expect.objectContaining({ reason: "source", operationId: "import", index: 0, message: expect.stringMatching(/Reviewed source content/) })] });
  const result = changeSetCommandResponseSchema.parse(await f.call(surface, input));
  expect(result.outcome).toBe("proposed");
  expect(f.repository.listSourceDocumentSummaryData(f.project.id)).toHaveLength(0);
  expect(f.repository.listCards(f.map.id)).toHaveLength(1);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  approveChangeSet(f, human, result.changeSetId);
  applyChangeSet(f, human, result.changeSetId);
  expect(f.repository.listSourceDocumentSummaryData(f.project.id)).toHaveLength(1);
  const createdCard = f.repository.listCards(f.map.id).find((card) => card.title === "Initial source Card")!;
  expect(f.repository.listCards(f.map.id)).toHaveLength(2);
  expect(f.repository.listSourceLinksForStoryMap(f.map.id)).toMatchObject([{ kind: "chunk", cardId: createdCard.id }]);
});

it.each(["http", "sdk"])("rejects an import aliasing a foreign persisted source document on %s", async (surface) => {
  const f = await fixture();
  const foreignSource = f.unitOfWork.run(human, ({ repository }) => repository.importSourceDocument({ parsedChunks: splitTextIntoChunks("Foreign"), projectId: f.other.id, title: "Foreign evidence", type: "txt", content: "Foreign", fileHash: createHash("sha256").update("Foreign").digest("hex") }));
  const content = "Alias";
  const operation: ChangeOperation = { operationId: "foreign-import", op: "import", entity: "sourceDocument", entityId: foreignSource.document.id, after: { projectId: f.project.id, title: "Alias", type: "txt", inlineContent: content, fileHash: createHash("sha256").update(content).digest("hex") } };
  expect(await f.call(surface, { projectId: f.project.id, title: "Alias", operations: [operation] })).toMatchObject({ details: { index: 0, operationId: "foreign-import" } });
  expect(f.repository.listChangeSets(f.project.id)).toHaveLength(0);
});

it.each(["http", "sdk"].flatMap((surface) => ["roadmapColumn", "roadmapSwimlane", "storyMapCopy", "githubBoardImport"].map((entity) => ({ surface, entity }))))("rejects foreign $entity target aliases on $surface", async ({ surface, entity }) => {
  const f = await fixture();
  const own = f.unitOfWork.run(human, ({ repository }) => repository.createRoadmap({ projectId: f.project.id, name: "Own roadmap" }));
  const foreign = f.unitOfWork.run(human, ({ repository }) => repository.createRoadmap({ projectId: f.other.id, name: "Foreign roadmap" }));
  const operations: ChangeOperation[] = [
    { operationId: "foreign-column", op: "create", entity: "roadmapColumn", entityId: f.repository.listRoadmapColumns(foreign.id)[0]!.id, after: { roadmapId: own.id, name: "Alias" } },
    { operationId: "foreign-swimlane", op: "create", entity: "roadmapSwimlane", entityId: f.repository.listRoadmapSwimlanes(foreign.id)[0]!.id, after: { roadmapId: own.id, name: "Alias" } },
    { operationId: "foreign-copy", op: "create", entity: "storyMapCopy", entityId: f.otherMap.id, after: { input: { sourceStoryMapId: f.map.id, targetName: "Alias" }, expected: { [f.map.id]: f.repository.getOperationSnapshot(f.project.id).mapFingerprints![f.map.id]! }, preview: { source: { id: f.map.id, name: f.map.name }, target: { id: f.otherMap.id, name: "Alias" }, inventory: {} } } },
    { operationId: "foreign-board", op: "create", entity: "githubBoardImport", entityId: f.otherMap.id, after: { input: { projectId: f.project.id, storyMapName: "Alias", boardUrl: "https://github.com/orgs/org/projects/1", cleanup: false, removeCardIds: [], issues: [] }, expected: {}, preview: { connectors: [], sync: { removals: [], overwrites: [] }, cleanup: [] } } }
  ];
  const before = f.repository.getOperationSnapshot(f.project.id);
  const foreignBefore = f.repository.getOperationSnapshot(f.other.id);
  for (const operation of operations.filter((operation) => operation.entity === entity)) {
    expect(await f.call(surface, { projectId: f.project.id, title: "Foreign target alias", apply: false, operations: [operation] })).toMatchObject({ code: "validation", message: "Operation references a foreign Project.", details: { index: 0, operationId: operation.operationId } });
    expect(f.repository.listChangeSets(f.project.id)).toHaveLength(0);
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
    expect(f.repository.getOperationSnapshot(f.other.id)).toEqual(foreignBefore);
  }
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it.each(["http", "sdk"])("reads, approves and applies backward Story Map scoped references on %s", async (surface) => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "autonomous" }));
  const operations: ChangeOperation[] = [
    { operationId: "map", op: "create", entity: "storyMap", entityId: "map-local", after: { projectId: f.project.id, name: "Scoped map" } },
    { operationId: "roadmap", op: "create", entity: "roadmap", entityId: "roadmap-local", after: { projectId: f.project.id, storyMapId: "map-local", name: "Scoped roadmap" } },
    { operationId: "status", op: "create", entity: "workflowStatus", entityId: "status-local", after: { projectId: f.project.id, storyMapId: "map-local", name: "Review", group: "active" } },
    { operationId: "template", op: "create", entity: "storyTemplate", entityId: "template-local", after: { projectId: f.project.id, storyMapId: "map-local", name: "Scoped template" } }
  ];
  const proposal = changeSetCommandResponseSchema.parse(await f.call(surface, { projectId: f.project.id, title: "Scoped cut", operations, apply: false }));
  expect(proposal.outcome).toBe("proposed");
  expect(f.repository.listStoryMaps(f.project.id)).toHaveLength(1);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  expect(await f.call(surface, { projectId: f.project.id }, "ListChangeSets")).toMatchObject({ data: { changeSets: [{ id: proposal.changeSetId, status: "proposed" }] } });
  expect(await f.call(surface, { changeSetId: proposal.changeSetId }, "ApproveChangeSet")).toMatchObject({ changeSet: { status: "approved" } });
  expect(await f.call(surface, { changeSetId: proposal.changeSetId, approvalToken: "reviewed" }, "ApplyChangeSet")).toMatchObject({ changeSet: { status: "applied" } });
  const map = f.repository.listStoryMaps(f.project.id).find((map) => map.name === "Scoped map")!;
  expect(f.repository.listRoadmaps(f.project.id, map.id)).toMatchObject([{ storyMapId: map.id, name: "Scoped roadmap" }]);
  expect(f.repository.listWorkflowStatuses(f.project.id, map.id)).toContainEqual(expect.objectContaining({ storyMapId: map.id, name: "Review" }));
  expect(f.repository.listStoryTemplates(f.project.id, map.id)).toContainEqual(expect.objectContaining({ storyMapId: map.id, name: "Scoped template" }));
  expect(await f.call(surface, { projectId: f.project.id }, "ListChangeSets")).toMatchObject({ data: { changeSets: [{ id: proposal.changeSetId, status: "applied" }] } });
});

it("refuses already-invalid baselines, disabled access and later stored drift", async () => {
  const f = await fixture();
  const input = { projectId: f.project.id, title: "Baseline", apply: false, operations: [{ operationId: "update", op: "update", entity: "card", entityId: f.card.id, baseVersion: f.card.version, after: { title: "Reviewed" } }] };
  expect(await f.call("http", { ...input, operations: [{ ...input.operations[0], baseVersion: 99 }] })).toMatchObject({ code: "conflict", details: { index: 0, operationId: "update" } });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "off" }));
  expect(await f.call("http", input)).toMatchObject({ code: "disabled" });
  expect(f.repository.listChangeSets()).toHaveLength(0);
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "apply" }));
  const proposal = changeSetCommandResponseSchema.parse(await f.call("http", input));
  approveChangeSet(f, human, proposal.changeSetId);
  f.unitOfWork.run(human, ({ repository }) => repository.updateCard(f.card.id, { title: "Human edit" }));
  expect(() => applyChangeSet(f, human, proposal.changeSetId)).toThrow();
  expect(f.repository.getCardDetails(f.card.id)?.title).toBe("Human edit");
  expect(f.repository.getChangeSet(proposal.changeSetId)?.status).toBe("conflict");
});

it.each(["http", "sdk"])("rolls application back if the %s success audit cannot persist", async (surface) => {
  const f = await fixture();
  const history = f.repository.listCardHistory(f.card.id);
  const rejectedAudit = rejectSuccessfulAudit(f.handle.current.$client, "SubmitChangeSet");
  const result = await f.call(surface, { projectId: f.project.id, title: "Atomic", operations: [{ operationId: "update", op: "update", entity: "card", entityId: f.card.id, after: { title: "Must rollback" } }] });
  expect(result).toMatchObject({ code: expect.any(String) });
  expect(rejectedAudit()).toBe(1);
  expect(f.repository.getCardDetails(f.card.id)?.title).toBe("Existing");
  expect(f.repository.listCardHistory(f.card.id)).toEqual(history);
  expect(f.repository.listChangeSets(f.project.id)).toHaveLength(1);
  expect(f.repository.listChangeSets(f.project.id)[0]?.status).toBe("proposed");
  const audit = f.repository.listActivity().filter((event) => event.action === "tool_call");
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({ affectedEntityId: "SubmitChangeSet", actor: surface === "sdk" ? "submission-sdk-host" : "local-mcp-host", after: { outcome: "error", errorId: result.details.errorId } });
  expect(f.repository.listActivity().filter((event) => event.action === "changeSet.applied")).toHaveLength(0);
  expect(f.live.flatMap((event) => event.entities).filter((entity) => entity.entityType === "card")).toEqual([]);
  expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
});

it.each(["http", "sdk"])("keeps stored approval and protected apply authority on %s", async (surface) => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  const proposal = changeSetCommandResponseSchema.parse(await f.call(surface, { projectId: f.project.id, title: "Approval boundary", operations: [{ operationId: "update", op: "update", entity: "card", entityId: f.card.id, after: { title: "Approved" } }] }));
  expect(await f.call(surface, { changeSetId: proposal.changeSetId }, "ApproveChangeSet")).toMatchObject({ code: "disabled" });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "autonomous" }));
  expect(await f.call(surface, { changeSetId: proposal.changeSetId }, "ApproveChangeSet")).toMatchObject({ changeSet: { status: "approved", approval: { actor: proposal.changeSet.proposedBy } } });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  expect(await f.call(surface, { changeSetId: proposal.changeSetId, approvalToken: "reviewed" }, "ApplyChangeSet")).toMatchObject({ code: "protected" });
  expect(f.repository.getCardDetails(f.card.id)?.title).toBe("Existing");
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "apply" }));
  expect(await f.call(surface, { changeSetId: proposal.changeSetId, approvalToken: "reviewed" }, "ApplyChangeSet")).toMatchObject({ changeSet: { status: "applied" } });
  expect(f.repository.getCardDetails(f.card.id)?.title).toBe("Approved");
});

it.each(["http", "sdk"])("authorizes effective inherited metadata and attributes its errors on %s", async (surface) => {
  const f = await fixture();
  const foreignSource = f.unitOfWork.run(human, ({ repository }) => repository.importSourceDocument({ parsedChunks: splitTextIntoChunks("Foreign"), projectId: f.other.id, title: "Foreign evidence", type: "txt", content: "Foreign", fileHash: createHash("sha256").update("Foreign").digest("hex") }));
  const foreignChunk = f.repository.getSourceDocumentDetails(foreignSource.document.id)!.chunks[0]!.id;
  const operation: ChangeOperation = { operationId: "override", op: "update", entity: "card", entityId: f.card.id, after: { title: "Reviewed" }, context: { projectId: f.project.id, storyMapId: f.map.id, cardIds: [] } };
  const input = { projectId: f.project.id, title: "Metadata", apply: false, context: { projectId: f.other.id, storyMapId: f.otherMap.id, cardIds: [f.foreign.id] }, sources: [{ kind: "chunk", chunkId: foreignChunk }], operations: [{ ...operation, sources: [{ kind: "note", note: "Explicit evidence" }] }, { ...operation, operationId: "empty", sources: [] }] };
  const result = changeSetCommandResponseSchema.parse(await f.call(surface, input));
  expect(result.changeSet.operations[0]).toMatchObject({ context: operation.context, sources: [{ kind: "note", note: "Explicit evidence" }] });
  expect(result.changeSet.operations[1]).toMatchObject({ context: operation.context, sources: [] });
  const valid = { ...operation, operationId: "valid", sources: [] };
  for (const invalid of [
    { ...input, operations: [valid, { ...operation, operationId: "inherited-source" }] },
    { ...input, sources: [], context: { cardIds: [randomUUID()] }, operations: [valid, { ...operation, operationId: "inherited-context", context: undefined, sources: [] }] }
  ]) {
    const expectedId = invalid.operations[1]!.operationId;
    expect(await f.call(surface, invalid)).toMatchObject({ details: { index: 1, operationId: expectedId } });
    expect(f.repository.listChangeSets(f.project.id)).toHaveLength(1);
  }
});

it.each(["http", "sdk"])("honors explicit selectors and validates local/external targets and repeated upserts on %s", async (surface) => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => {
    repository.setExternalRef({ entityType: "card", entityId: f.card.id, system: "agent", externalId: "owned" });
    repository.setExternalRef({ entityType: "card", entityId: f.foreign.id, system: "agent", externalId: "foreign" });
  });
  const update: ChangeOperation = { operationId: "selector", op: "update", entity: "card", entityId: f.foreign.id, selector: { kind: "id", id: f.card.id }, after: { title: "Selector target" } };
  const create: ChangeOperation = { operationId: "create-local", op: "create", entity: "card", entityId: "created-local", after: { storyMapId: f.map.id, level: "story", title: "Local" } };
  const external = { kind: "externalRef", scopeId: f.map.id, system: "agent", externalId: "owned" } as const;
  const publication: ChangeOperation = { operationId: "upsert-first", op: "upsert", entity: "card", entityId: "publication-first", selector: { ...external, externalId: "new" }, after: { storyMapId: f.map.id, level: "story", title: "First publication" } };
  const operations: ChangeOperation[] = [
    update,
    { ...update, operationId: "external-owned", selector: external, after: { title: "External target" } },
    create,
    { ...update, operationId: "local-owned", selector: { kind: "local", localId: "created-local" }, after: { title: "Local target" } },
    publication,
    { ...publication, operationId: "upsert-second", entityId: "publication-second", after: { ...publication.after, title: "Second publication" } }
  ];
  const result = changeSetCommandResponseSchema.parse(await f.call(surface, { projectId: f.project.id, title: "Selectors", operations }));
  expect(result.outcome).toBe("applied");
  expect(f.repository.getCardDetails(f.card.id)?.title).toBe("External target");
  expect(f.repository.getCardDetails(f.foreign.id)?.title).toBe("Foreign");
  expect(f.repository.listCards(f.map.id).map((card) => card.title).sort()).toEqual(["External target", "Local target", "Second publication"]);
  expect(f.repository.listExternalRefsForStoryMap(f.map.id).filter((ref) => ref.externalId === "new")).toHaveLength(1);
  const bad: ChangeOperation[] = [
    { ...update, operationId: "foreign-id", selector: { kind: "id", id: f.foreign.id } },
    { ...update, operationId: "foreign-local", selector: { kind: "local", localId: f.foreign.id } },
    { ...update, operationId: "foreign-external", selector: { ...external, scopeId: f.otherMap.id, externalId: "foreign" } },
    { ...update, operationId: "unknown-local", selector: { kind: "local", localId: "missing" } },
    { ...update, operationId: "unknown-external", selector: { ...external, externalId: "missing" } },
    { ...publication, operationId: "foreign-upsert-alias", entityId: f.foreign.id }
  ];
  for (const operation of bad) {
    expect(await f.call(surface, { projectId: f.project.id, title: "Rejected selector", operations: [operation] })).toMatchObject({ details: { index: 0, operationId: operation.operationId } });
    expect(f.repository.listChangeSets(f.project.id)).toHaveLength(1);
  }
});

it.each(["http", "sdk"])("audits unresolved dependency external scopes without replacing the typed refusal on %s", async (surface) => {
  const f = await fixture();
  const before = f.repository.getOperationSnapshot(f.project.id);
  const result = await f.call(surface, { projectId: f.project.id, title: "Invalid dependency scope", operations: [{ operationId: "dependency", op: "set", entity: "cardDependency", after: { cardId: { kind: "id", id: f.card.id }, prerequisiteCardId: { kind: "externalRef", scopeId: randomUUID(), system: "bmad", externalId: "missing" } } }] });
  expect(result).toMatchObject({ code: "validation", details: { index: 0, operationId: "dependency" } });
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  const audits = f.repository.listActivity(f.project.id).filter((event) => event.action === "tool_call");
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({ affectedEntityId: "SubmitChangeSet", after: { outcome: "rejected", rejectionReason: "validation" } });
});

it.each(["http", "sdk"])("protects, reads, approves and applies dependency endpoints bound earlier in the cut on %s", async (surface) => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  const operations: ChangeOperation[] = [
    { operationId: "dependent", op: "create", entity: "card", entityId: "dependent-local", after: { storyMapId: f.map.id, level: "story", title: "Dependent" } },
    { operationId: "prerequisite", op: "create", entity: "card", entityId: "prerequisite-local", after: { storyMapId: f.map.id, level: "activity", title: "Prerequisite" } },
    { operationId: "bind-dependent", op: "set", entity: "externalRef", entityId: "dependent-binding", after: { entityType: "card", entityId: "dependent-local", scopeId: f.map.id, system: "bmad", externalId: "dependent" } },
    { operationId: "bind-prerequisite", op: "set", entity: "externalRef", entityId: "prerequisite-binding", after: { entityType: "card", entityId: "prerequisite-local", scopeId: f.map.id, system: "bmad", externalId: "prerequisite" } },
    { operationId: "dependency", op: "set", entity: "cardDependency", after: { cardId: { kind: "externalRef", scopeId: f.map.id, system: "bmad", externalId: "dependent" }, prerequisiteCardId: { kind: "externalRef", scopeId: f.map.id, system: "bmad", externalId: "prerequisite" } } }
  ];
  const submitted = await f.call(surface, { projectId: f.project.id, title: "Bound dependency", operations });
  expect(submitted).toMatchObject({ outcome: "proposed" });
  const proposal = changeSetCommandResponseSchema.parse(submitted);
  expect(proposal.outcome).toBe("proposed");
  expect(f.repository.listStoryMaps(f.project.id)).toHaveLength(1);
  expect(await f.call(surface, { projectId: f.project.id }, "ListChangeSets")).toMatchObject({ data: { changeSets: [{ id: proposal.changeSetId }] } });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "autonomous" }));
  expect(await f.call(surface, { changeSetId: proposal.changeSetId }, "ApproveChangeSet")).toMatchObject({ changeSet: { status: "approved" } });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  expect(await f.call(surface, { changeSetId: proposal.changeSetId, approvalToken: "reviewed" }, "ApplyChangeSet")).toMatchObject({ code: "protected" });
  const approval = await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.changeSetId}/approve`, payload: {} });
  expect(approval.statusCode).toBe(200);
  const applied = await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.changeSetId}/apply`, payload: {} });
  expect(applied.statusCode).toBe(200);
  const map = f.map;
  const cards = f.repository.listCards(map.id);
  expect(f.repository.listCardDependenciesForStoryMap(map.id)).toMatchObject([{ cardId: cards.find((row) => row.title === "Dependent")!.id, prerequisiteCardId: cards.find((row) => row.title === "Prerequisite")!.id }]);
  expect(await f.call(surface, { projectId: f.project.id }, "ListChangeSets")).toMatchObject({ data: { changeSets: [{ id: proposal.changeSetId, status: "applied" }] } });
});

it("persists separate consecutive dependency ChangeSets at fixed time for one SDK actor and session", async () => {
  const f = await fixture();
  const prerequisite = f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Prerequisite" }));
  const history = f.repository.listCardHistory(f.card.id);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T12:00:00.000Z"));
  const added = changeSetCommandResponseSchema.parse(await f.call("sdk", { cardId: f.card.id, prerequisiteCardId: prerequisite.id, baseVersion: f.card.version }, "SetCardDependency"));
  expect(f.repository.getCard(f.card.id)!.version).toBe(f.card.version + 1);
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toMatchObject([{ cardId: f.card.id, prerequisiteCardId: prerequisite.id }]);
  const removed = changeSetCommandResponseSchema.parse(await f.call("sdk", { cardId: f.card.id, prerequisiteCardId: prerequisite.id, baseVersion: f.card.version + 1 }, "DeleteCardDependency"));
  expect(f.repository.getCard(f.card.id)!.version).toBe(f.card.version + 2);
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toEqual([]);
  const versions = f.repository.listCardHistory(f.card.id);
  expect(versions.map((row) => row.version)).toEqual([...history.map((row) => row.version), f.card.version + 1, f.card.version + 2]);
  expect(versions.slice(-2).map((row) => row.createdAt)).toEqual(["2026-10-13T12:00:00.000Z", "2026-10-13T12:00:00.000Z"]);
  expect(added.changeSetId).not.toBe(removed.changeSetId);
  expect(added.changeSet.execution!.actor).toEqual(removed.changeSet.execution!.actor);
  expect(added.changeSet.execution!.actor).toMatchObject({ actorType: "agent", actorId: "submission-sdk-host", mcpSessionId: f.transport.sessionId });
});

it("authorizes dependency selector scopes created by an earlier map operation", async () => {
  const f = await fixture();
  const mapLocal = randomUUID();
  const operations: ChangeOperation[] = [
    { operationId: "map", op: "create", entity: "storyMap", entityId: mapLocal, after: { projectId: f.project.id, name: "Earlier map" } },
    { operationId: "dependency", op: "set", entity: "cardDependency", after: { cardId: { kind: "externalRef", scopeId: mapLocal, system: "bmad", externalId: "dependent" }, prerequisiteCardId: { kind: "externalRef", scopeId: mapLocal, system: "bmad", externalId: "prerequisite" } } }
  ];
  const input = { projectId: f.project.id, title: "Scope boundary", operations };
  expect(resolveToolProjectIds(f.repository, "SubmitChangeSet", input)).toEqual([f.project.id]);
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ ...input, id: randomUUID(), source: "mcp", createdAt: new Date().toISOString() }));
  expect(canReadChangeSet(f.repository, proposal)).toBe(true);
  expect(resolveToolProjectIds(f.repository, "ApproveChangeSet", { changeSetId: proposal.id })).toEqual([f.project.id]);
  expect(resolveToolProjectIds(f.repository, "ApplyChangeSet", { changeSetId: proposal.id })).toEqual([f.project.id]);
  expect(f.repository.listStoryMaps(f.project.id)).toHaveLength(1);
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toEqual([]);
});


it.each(["http", "sdk"].flatMap((surface) => ["persona", "annotation", "workflowStatus", "storyTemplate"].map((entity) => ({ surface, entity }))))
("requires separate review for mixed $entity submissions on $surface with protection disabled", async ({ surface, entity }) => {
  const f = await fixture();
  const operations = [
    { operationId: "card", entity: "card", op: "update", entityId: f.card.id, baseVersion: f.card.version, after: { title: "Reviewed card" } },
    { operationId: "customization", entity, op: "create", after: { projectId: f.project.id, name: "Reviewed customization", ...(entity === "workflowStatus" ? { group: "active" } : {}) } }
  ];
  const input = { projectId: f.project.id, title: "Mixed review", operations };
  const before = f.repository.getOperationSnapshot(f.project.id);
  const refused = await f.call(surface, { ...input, apply: true });
  expect(refused).toMatchObject({ code: "validation", message: expect.stringContaining("separate approval and Apply") });
  expect(f.repository.listChangeSets(f.project.id)).toEqual([]);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  const proposed = changeSetCommandResponseSchema.parse(await f.call(surface, input));
  expect(proposed.outcome).toBe("proposed");
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  approveChangeSet(f, human, proposed.changeSetId);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  const applied = await f.call(surface, { changeSetId: proposed.changeSetId, approvalToken: "recorded" }, "ApplyChangeSet");
  expect(applied.changeSet.status).toBe("applied");
  expect(f.repository.getCard(f.card.id)?.title).toBe("Reviewed card");
  const state = f.repository.getOperationSnapshot(f.project.id);
  const rows = entity === "persona" ? state.personas : entity === "annotation" ? state.annotations : entity === "workflowStatus" ? state.workflowStatuses : state.storyTemplates;
  expect(rows).toContainEqual(expect.objectContaining({ name: "Reviewed customization" }));
});


it("requires separate customization review for provider writes initiated by a human", async () => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { github: true }));
  const before = f.repository.getOperationSnapshot(f.project.id);
  const input = { id: randomUUID(), projectId: f.project.id, title: "Provider customization", source: "github" as const, createdAt: new Date().toISOString(), operations: [{ operationId: "annotation", entity: "annotation" as const, op: "create" as const, after: { projectId: f.project.id, name: "Provider label" } }] };
  const provider = { actorType: "github", actorId: "provider" } as const;
  expect(() => executeChangeSetCommand(f, provider, input, { initiatingActor: human, apply: true })).toThrow("separate approval and Apply");
  expect(f.repository.listChangeSets(f.project.id)).toEqual([]);
  expect(executeChangeSetCommand(f, provider, input, { initiatingActor: human }).outcome).toBe("proposed");
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
});

async function exerciseSubmitsOne200CardCutWithRealSActor(activity: Card, step: Card, release: Release, f: Awaited<ReturnType<typeof fixture>>, stories: Card[], persona: Persona, first: Card, result: ChangeSetCommandResponse, surface: string, cards: Card[]) {
  expect(activity).toMatchObject({ level: "activity", parentId: null });
  expect(step).toMatchObject({ level: "step", parentId: activity.id });
  expect(release).toMatchObject({ storyMapId: f.map.id, name: "Release" });
  expect(stories).toHaveLength(198);
  for (const card of stories) expect(card).toMatchObject({ parentId: step.id, releaseId: release.id, level: card.title === "Card 197" ? "note" : "story" });
  expect(persona).toMatchObject({ projectId: f.project.id, name: "Persona" });
  expect(f.repository.listCardPersonasForStoryMap(f.map.id)).toMatchObject([{ cardId: first.id, personaId: persona.id }]);
  expect(f.repository.listSourceLinksForStoryMap(f.map.id)).toMatchObject([{ cardId: first.id, kind: "note", note: "Reviewed evidence" }]);
  expect(result.changeSet.proposedBy).toMatchObject({ actorType: "agent", actorId: surface === "sdk" ? "submission-sdk-host" : "local-mcp-host", mcpSessionId: surface === "sdk" ? f.transport.sessionId : expect.any(String) });
  expect(result.changeSet.operations[4]).toMatchObject({ rationale: "Explicit rationale", context: { storyMapId: f.map.id }, sources: [{ kind: "note", note: "Shared evidence" }] });
  expect(result.changeSet.operations[5]).toMatchObject({ rationale: "Shared rationale" });
  expect(f.repository.listActivity().filter((event) => event.action === "tool_call")).toHaveLength(2);
  expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
  const applied = f.live.filter((event) => event.entities.some((entity) => entity.entityType === "card"));
  expect(applied).toHaveLength(1);
  expect(applied[0]!.actor).toEqual(result.changeSet.proposedBy);
  expect(applied[0]!.entities.filter((entity) => entity.entityType === "card")).toHaveLength(200);
  for (const card of cards.filter((card) => card.id !== f.card.id)) expect(applied[0]!.entities).toContainEqual({ entityType: "card", entityId: card.id, projectId: f.project.id, version: card.version });
  expect(applied[0]!.entities).toContainEqual({ entityType: "release", entityId: release.id, projectId: f.project.id, version: release.version });
  expect(applied[0]!.entities).toContainEqual({ entityType: "persona", entityId: persona.id, projectId: f.project.id, version: persona.version });
  await f.client.close();
  await f.server.close();
  f.handle.current.$client.close();
}

function rejectSuccessfulAudit(database: Parameters<typeof rejectSqliteWrite>[0], toolName: string) {
  let rejected = 0;
  cleanup.push(rejectSqliteWrite(database, (sql, bindings) => {
    if (!sql.startsWith("INSERT INTO activity_events ") || bindings[5] !== "tool_call" || bindings[7] !== toolName || JSON.parse(String(bindings[8])).outcome !== "ok") return false;
    rejected++;
    return true;
  }, "Successful tool audit refused"));
  return () => rejected;
}
