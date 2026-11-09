import { splitTextIntoChunks } from "@storymapper/importers";
import { createHash, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterEach, expect, it } from "vitest";
import { changeSetSchema, listChangeSetsResponseSchema } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

const HUMAN = { actorType: "human", actorId: "history-reader" } as const;
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
  cleanup.push(() => { handle.current.$client.close(); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const project = unitOfWork.run(HUMAN, ({ repository }) => repository.createProject({ name: "History reader" }));
  unitOfWork.run(HUMAN, ({ repository }) => repository.updateSafetySettings(project.id, { agentMode: "apply" }));
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: ":memory:" });
  cleanup.push(() => server.close());
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "history-reader" });
  const insert = (operations: unknown[], status = "applied") => {
    const id = randomUUID();
    handle.current.$client.prepare("INSERT INTO change_sets (id, project_id, title, source, status, operations_schema_version, operations_json, created_at) VALUES (?, ?, ?, 'mcp', ?, 1, ?, ?)")
      .run(id, project.id, "Historical input", status, JSON.stringify(operations), new Date().toISOString());
    return id;
  };
  return { handle, repository, unitOfWork, project, server, registry, insert };
}

it("returns tagged raw history to human HTTP readers and hides unrecognizable operations from Agents", async () => {
  const f = await fixture();
  const values = [null, 42, "opaque history", { retiredOperation: "private payload" }, { op: "future", entity: "card", entityId: randomUUID() }, { op: "update", entity: "card", selector: null }];
  const id = f.insert(values);
  const response = await f.server.inject({ method: "GET", url: `/api/changesets?projectId=${f.project.id}` });
  expect(response.statusCode).toBe(200);
  const history = listChangeSetsResponseSchema.parse(response.json()).changeSets;
  expect(history).toMatchObject([{ id, operationsSchemaVersion: 1, status: "applied", operations: values }]);
  const listed = await f.registry.call("ListChangeSets", { projectId: f.project.id });
  expect(listed.data).toEqual({ changeSets: [] });
  expect(JSON.stringify(listed)).not.toContain("private payload");
});

it("refuses stale approval/application over HTTP and MCP before touching domain rows", async () => {
  const f = await fixture();
  const id = f.insert([{ retiredOperation: "never execute" }], "stale");
  for (const action of ["approve", "reject", "apply"]) {
    const result = await f.server.inject({ method: "POST", url: `/api/changesets/${id}/${action}`, payload: {} });
    expect(result.statusCode).toBe(409);
    expect(result.json().message).toContain("resubmission and fresh approval");
  }
  await expect(f.registry.call("ApplyChangeSet", { changeSetId: id, approvalToken: "approved" })).rejects.toMatchObject({ code: "conflict" });
  expect(f.repository.getChangeSet(id)).toMatchObject({ operationsSchemaVersion: 1, status: "stale", operations: [{ retiredOperation: "never execute" }] });
  expect(f.repository.listStoryMaps(f.project.id)).toEqual([]);
});

it("authorizes recognized historical references against actual Project ownership", async () => {
  const f = await fixture();
  const rows = f.unitOfWork.run(HUMAN, ({ repository }) => {
    const other = repository.createProject({ name: "Private" });
    repository.updateSafetySettings(other.id, { agentMode: "off" });
    const map = repository.createStoryMap({ projectId: f.project.id, name: "Readable" });
    const hidden = repository.createStoryMap({ projectId: other.id, name: "Private" });
    return { card: repository.createCard({ storyMapId: map.id, level: "story", title: "Readable" }), hidden };
  });
  const visible = f.insert([{ op: "update", entity: "card", entityId: rows.card.id, after: { title: "Readable history" } }]);
  f.insert([{ op: "update", entity: "card", entityId: rows.card.id, after: { nested: { storyMapId: rows.hidden.id } } }]);
  const result = await f.registry.call("ListChangeSets", { projectId: f.project.id });
  expect(result.data).toMatchObject({ changeSets: [{ id: visible }] });
  expect(JSON.stringify(result)).not.toContain(rows.hidden.id);
});


it.each(["workflowStatus", "storyTemplate"] as const)("normalizes %s entity targets before Project privacy checks", async (entity) => {
  const f = await fixture();
  const rows = f.unitOfWork.run(HUMAN, ({ repository }) => {
    const other = repository.createProject({ name: "Disabled customization" });
    repository.updateSafetySettings(other.id, { agentMode: "off" });
    const create = (projectId: string) => entity === "workflowStatus"
      ? repository.createWorkflowStatus({ projectId, name: "Status", group: "active" })
      : repository.createStoryTemplate({ projectId, name: "Template" });
    const visible = create(f.project.id);
    const hidden = create(other.id);
    const proposals = [visible, hidden].flatMap((target) => ["update", "delete"].map((op) => repository.createChangeSet(changeSetSchema.parse({
      id: randomUUID(), projectId: f.project.id, title: "Scoped customization", source: "mcp", status: "proposed", createdAt: new Date().toISOString(),
      operations: [{ operationId: `${op}-${entity}`, op, entity, entityId: target.id, after: op === "update" ? { name: target.id === hidden.id ? "Disabled customization payload" : "Accessible customization payload" } : {} }]
    }))));
    return { proposals, hidden, other };
  });
  const hiddenBefore = entity === "workflowStatus" ? f.repository.getWorkflowStatus(rows.hidden.id) : f.repository.getStoryTemplate(rows.hidden.id);
  const result = await f.registry.call("ListChangeSets", { projectId: f.project.id });
  const listed = result.data as { changeSets: Array<{ id: string }> };
  expect(listed.changeSets.map((proposal) => proposal.id).sort()).toEqual(rows.proposals.slice(0, 2).map((proposal) => proposal.id).sort());
  expect(JSON.stringify(result)).not.toContain(rows.hidden.id);
  expect(JSON.stringify(result)).not.toContain("Disabled customization payload");
  for (const proposal of rows.proposals.slice(2)) {
    await expect(f.registry.call("ApplyChangeSet", { changeSetId: proposal.id, approvalToken: "approved" })).rejects.toMatchObject({ code: "disabled" });
    expect(f.repository.getChangeSet(proposal.id)?.status).toBe("proposed");
  }
  expect(entity === "workflowStatus" ? f.repository.getWorkflowStatus(rows.hidden.id) : f.repository.getStoryTemplate(rows.hidden.id)).toEqual(hiddenBefore);
});


it("lists an authorized Source import with a local identity while persisted foreign identities retain precedence", async () => {
  const f = await fixture();
  const fileHash = createHash("sha256").update("Source import proposal evidence.").digest("hex");
  const rows = f.unitOfWork.run(HUMAN, ({ repository }) => {
    const other = repository.createProject({ name: "Disabled Source Project" });
    repository.updateSafetySettings(other.id, { agentMode: "off" });
    const persisted = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks("Source import proposal evidence."), projectId: other.id, title: "Private source", type: "txt", content: "Source import proposal evidence.", fileHash });
    const proposals = ["local-source-document", persisted.document.id].map((entityId) => repository.createChangeSet(changeSetSchema.parse({
      id: randomUUID(), projectId: f.project.id, title: "Import source evidence", source: "mcp", createdAt: new Date().toISOString(),
      operations: [{ operationId: `source-import-${entityId}`, op: "import", entity: "sourceDocument", entityId, after: { projectId: f.project.id, title: "Source evidence", type: "txt", fileHash } }]
    })));
    return { proposals, persisted };
  });
  const result = await f.registry.call("ListChangeSets", { projectId: f.project.id });
  expect(result.data).toMatchObject({ changeSets: [{ id: rows.proposals[0]!.id }] });
  expect((result.data as { changeSets: unknown[] }).changeSets).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain(rows.persisted.document.id);
  expect(f.repository.listSourceDocumentSummaryData(f.project.id)).toEqual([]);
});

it.each(["annotation", "workflowStatus", "storyTemplate", "attachment"] as const)("recovers deleted %s ownership from repository Activity and refuses disabled or ambiguous owners", async (entity) => {
  const f = await fixture();
  const rows = f.unitOfWork.run(HUMAN, ({ repository }) => {
    const other = repository.createProject({ name: "Disabled deletion owner" });
    repository.updateSafetySettings(other.id, { agentMode: "off" });
    const create = (projectId: string) => {
      if (entity === "annotation") {
        const item = repository.createAnnotation({ projectId, name: "Deletion annotation" });
        return { id: item.id, remove: () => repository.deleteAnnotation(item.id, { definitionBefore: repository.getAnnotation(item.id), affectedCards: [] }) };
      }
      if (entity === "workflowStatus") {
        const item = repository.createWorkflowStatus({ projectId, name: "Deletion status", group: "active" });
        return { id: item.id, remove: () => repository.deleteWorkflowStatus(item.id, { definitionBefore: repository.getWorkflowStatus(item.id), affectedCards: [] }) };
      }
      if (entity === "storyTemplate") {
        const item = repository.createStoryTemplate({ projectId, name: "Deletion template" });
        return { id: item.id, remove: () => repository.deleteStoryTemplate(item.id) };
      }
      const map = repository.createStoryMap({ projectId, name: "Attachment owner" });
      const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Attachment owner" });
      const item = repository.createCardAttachment(card.id, { label: "Deletion evidence", filePath: "evidence.txt" })!;
      return { id: item.id, remove: () => repository.deleteCardAttachment(card.id, item.id) };
    };
    const visible = create(f.project.id);
    const hidden = create(other.id);
    expect(visible.remove()).toBe(true);
    expect(hidden.remove()).toBe(true);
    return { visible, hidden };
  });
  const visible = f.insert([{ op: "delete", entity, entityId: rows.visible.id, after: {}, reason: "Authorized deletion history" }]);
  f.insert([{ op: "delete", entity, entityId: rows.hidden.id, after: {}, reason: "Disabled deletion payload" }]);
  const result = await f.registry.call("ListChangeSets", { projectId: f.project.id });
  expect((result.data as { changeSets: Array<{ id: string }> }).changeSets.map((proposal) => proposal.id)).toEqual([visible]);
  expect(JSON.stringify(result)).not.toContain(rows.hidden.id);
  expect(JSON.stringify(result)).not.toContain("Disabled deletion payload");
  f.unitOfWork.run(HUMAN, ({ repository }) => {
    const secondOwner = repository.createProject({ name: "Contradictory enabled owner" });
    const eventEntity = entity === "attachment" ? "cardAttachment" : entity;
    repository.logActivity(secondOwner.id, `${eventEntity}.deleted`, eventEntity, rows.visible.id);
  });
  expect((await f.registry.call("ListChangeSets", { projectId: f.project.id })).data).toEqual({ changeSets: [] });
});

it("keeps applied update-then-delete and ExternalRef deletion history accessible from recorded changes", async () => {
  const f = await fixture();
  const rows = f.unitOfWork.run(HUMAN, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: f.project.id, name: "Deleted history" });
    const card = repository.createCard({ storyMapId: map.id, level: "activity", title: "Recorded" });
    const binding = repository.setExternalRef({ entityType: "card", entityId: card.id, system: "bmad", externalId: "recorded-card" }).ref;
    const proposal = repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Update and remove", source: "human", createdAt: new Date().toISOString(), operations: [
      { operationId: "updated", op: "update", entity: "card", entityId: card.id, after: { title: "Updated recorded" } },
      { operationId: "binding-delete", op: "delete", entity: "externalRef", entityId: binding.id, after: {} },
      { operationId: "card-delete", op: "delete", entity: "card", entityId: card.id, after: { strategy: "unassign" as const } }
    ] });
    repository.updateChangeSetStatus(proposal.id, "approved");
    return { map, card, binding, proposal };
  });
  f.unitOfWork.run(HUMAN, ({ repository }) => repository.applyChangeSet(rows.proposal.id));
  expect(f.repository.getCard(rows.card.id)).toBeUndefined();
  const listed = await f.registry.call("ListChangeSets", { projectId: f.project.id });
  expect(listed.data).toMatchObject({ changeSets: [{ id: rows.proposal.id, status: "applied" }] });
  f.unitOfWork.run(HUMAN, ({ repository }) => {
    const other = repository.createProject({ name: "Ambiguous historical ownership" });
    repository.logActivity(other.id, "card.deleted", "card", rows.card.id);
  });
  expect((await f.registry.call("ListChangeSets", { projectId: f.project.id })).data).toEqual({ changeSets: [] });
  f.unitOfWork.run(HUMAN, ({ repository }) => {
    repository.updateSafetySettings(f.project.id, { agentMode: "off" });
  });
  await expect(f.registry.call("ListChangeSets", { projectId: f.project.id })).rejects.toMatchObject({ code: "disabled" });
});
