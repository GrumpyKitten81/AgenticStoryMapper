import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import { createRoutes } from "@storymapper/server/http/routes";
import { registerMcpHttp } from "@storymapper/server/mcp/http";
import { afterEach, expect, it } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createMcpRegistry, listMcpToolStates } from "@storymapper/server/mcp/tools/register-tools";

const cleanup: Array<() => void> = [];
const human = { actorType: "human", actorId: "fixture" } as const;
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-approval-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const project = unitOfWork.run(human, ({ repository }) => repository.createProject({ name: "Approval policy" }));
  const map = unitOfWork.run(human, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const card = unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: map.id, level: "activity", title: "Unchanged" }));
  const agent = { actorType: "agent", actorId: "actual-host", mcpSessionId: "actual-session" } as const;
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: agent.actorId, mcpSessionId: agent.mcpSessionId });
  const propose = (own: boolean) => unitOfWork.run(own ? agent : human, ({ repository }) => repository.createChangeSet({
    id: randomUUID(), projectId: project.id, title: "Approval", source: own ? "mcp" : "human", status: "proposed",
    operations: [{ operationId: "update-card", op: "update", entity: "card", entityId: card.id, baseVersion: card.version, after: { title: "Applied" } }], createdAt: new Date().toISOString()
  }));
  return { directory, repository, unitOfWork, project, card, registry, propose, agent };
}

it.each((["propose", "apply", "autonomous"] as const).flatMap((agentMode) => [false, true].map((own) => ({ agentMode, own }))))
("enforces approval in agent mode $agentMode own=$own", async ({ agentMode, own }) => {
  const f = fixture();
  expect(f.repository.getSafetySettings(f.project.id).agentMode).toBe("apply");
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode }));
  const allowAgentApproval = agentMode === "autonomous";
  const proposal = f.propose(own);
  const beforeFiles = readdirSync(f.directory, { recursive: true });
  expect(listMcpToolStates(f.repository, f.project.id).find((tool) => tool.name === "ApproveChangeSet")?.enabled).toBe(allowAgentApproval);
  if (allowAgentApproval) {
    const approved = await f.registry.call("ApproveChangeSet", { changeSetId: proposal.id, selectedOperationIds: ["update-card"] });
    expect(approved.changeSet?.approval?.actor).toEqual(f.agent);
    expect(approved.changeSet?.approval?.selectedOperationIds).toEqual(["update-card"]);
    f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
    expect(f.repository.getChangeSet(proposal.id)?.approval).toEqual(approved.changeSet?.approval);
    await expect(f.registry.call("ApplyChangeSet", { changeSetId: proposal.id, approvalToken: "discarded" })).rejects.toThrow("protection");
  } else {
    await expect(f.registry.call("ApproveChangeSet", { changeSetId: proposal.id })).rejects.toThrow("approval is disabled");
    expect(f.repository.getChangeSet(proposal.id)?.status).toBe("proposed");
  }
  expect(f.repository.getCardDetails(f.card.id)?.title).toBe("Unchanged");
  expect(readdirSync(f.directory, { recursive: true })).toEqual(beforeFiles);
  const audit = f.repository.listActivity(f.project.id).filter((event) => event.action === "tool_call");
  expect(audit).toHaveLength(allowAgentApproval ? 2 : 1);
});

it("refuses inaccessible approval and prevents Agents changing the human setting", async () => {
  const f = fixture();
  const proposal = f.propose(false);
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "off" }));
  await expect(f.registry.call("ApproveChangeSet", { changeSetId: proposal.id })).rejects.toThrow("access is disabled");
  expect(() => f.unitOfWork.run(f.agent, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "autonomous" }))).toThrow("human-controlled");
  expect(f.repository.getChangeSet(proposal.id)?.approval).toBeUndefined();
});

it.each(["propose", "apply", "autonomous"] as const)("enforces actual HTTP and MCP approval in agent mode %s", async (agentMode) => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode }));
  const allowAgentApproval = agentMode === "autonomous";
  const server = createMcpFastifyApp();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository: f.repository, unitOfWork: f.unitOfWork, databasePath: join(f.directory, "storymapper.sqlite") });
  registerMcpHttp(server, f.repository, f.unitOfWork);
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "approval-wire-host", version: "1.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  try {
    await client.connect(transport);
    const adapterProposal = f.propose(false);
    const adapter = await server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "ApproveChangeSet", input: { changeSetId: adapterProposal.id } } });
    const wireProposal = f.propose(false);
    const wire = await client.callTool({ name: "ApproveChangeSet", arguments: { changeSetId: wireProposal.id } });
    if (allowAgentApproval) {
      expect(adapter.statusCode).toBe(200);
      expect(wire.isError).not.toBe(true);
      expect(f.repository.getChangeSet(adapterProposal.id)?.approval?.actor).toMatchObject({ actorType: "agent", actorId: "local-mcp-host", mcpSessionId: expect.any(String) });
      expect(f.repository.getChangeSet(wireProposal.id)?.approval?.actor).toEqual({ actorType: "agent", actorId: "approval-wire-host", mcpSessionId: transport.sessionId });
    } else {
      expect(adapter.json()).toMatchObject({ code: "disabled" });
      expect(wire.isError).toBe(true);
      expect(f.repository.getChangeSet(adapterProposal.id)?.approval).toBeUndefined();
      expect(f.repository.getChangeSet(wireProposal.id)?.approval).toBeUndefined();
    }
    expect(f.repository.getCardDetails(f.card.id)?.title).toBe("Unchanged");
    const rows = f.repository.listActivity(f.project.id).filter((event) => event.action === "tool_call");
    expect(rows).toHaveLength(2);
    expect(rows.map((event) => event.actor).sort()).toEqual(["approval-wire-host", "local-mcp-host"]);
  } finally {
    await client.close();
    await server.close();
  }
});

it.each(["adapter", "mcp"] as const)("binds actual %s apply requests to the approved selection", async (surface) => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "apply" }));
  const other = f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.card.storyMapId, level: "activity", title: "Excluded" }));
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({
    id: randomUUID(), projectId: f.project.id, title: "Selected changes", source: "human", createdAt: new Date().toISOString(),
    operations: [f.card, other].map((card, index) => ({ operationId: index === 0 ? "chosen" : "excluded", entity: "card", op: "update", entityId: card.id, baseVersion: card.version, after: { title: "Applied" } }))
  }));
  f.unitOfWork.run(human, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved", ["chosen"]));
  const server = createMcpFastifyApp();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository: f.repository, unitOfWork: f.unitOfWork, databasePath: join(f.directory, "storymapper.sqlite") });
  registerMcpHttp(server, f.repository, f.unitOfWork);
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "selection-wire-host", version: "1.0" }, { capabilities: {} });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const call = async (selectedOperationIds: string[]) => {
      const input = { changeSetId: proposal.id, approvalToken: "discarded", selectedOperationIds };
      if (surface === "adapter") {
        const response = await server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "ApplyChangeSet", input } });
        return { error: response.statusCode >= 400, body: response.json() as unknown };
      }
      const response = await client.callTool({ name: "ApplyChangeSet", arguments: input });
      return { error: response.isError === true, body: JSON.parse((response.content as Array<{ text: string }>)[0]!.text) as unknown };
    };
    const beforeFiles = readdirSync(f.directory, { recursive: true });
    for (const selection of [["unknown"], ["excluded"]]) {
      const response = await call(selection);
      expect(response.error).toBe(true);
      expect(response.body).toMatchObject({ code: "conflict", message: "ChangeSet selection requires fresh approval." });
      expect(f.repository.getChangeSet(proposal.id)?.status).toBe("approved");
      expect(f.repository.getCard(f.card.id)?.title).toBe("Unchanged");
      expect(f.repository.getCard(other.id)?.title).toBe("Excluded");
      expect(readdirSync(f.directory, { recursive: true })).toEqual(beforeFiles);
    }
    const applied = await call(["chosen"]);
    expect(applied.error).toBe(false);
    expect(applied.body).toMatchObject({ changeSet: { status: "applied", execution: { selectedOperationIds: ["chosen"], operationResults: [{ operationId: "chosen", index: 0 }], restorePoint: expect.any(String) } } });
    expect(f.repository.getCard(f.card.id)?.title).toBe("Applied");
    expect(f.repository.getCard(other.id)?.title).toBe("Excluded");
    expect(f.repository.listActivity(f.project.id).filter((event) => event.action === "tool_call")).toHaveLength(3);
  } finally {
    await client.close();
    await server.close();
  }
});

it.each(["adapter", "mcp"] as const)("authorizes only closed approval and apply selections on %s", async (surface) => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "autonomous" }));
  const deleted = f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.card.storyMapId, level: "activity", title: "Deleted excluded target" }));
  const makeProposal = () => f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({
    id: randomUUID(), projectId: f.project.id, title: "Closed scopes", source: "human", createdAt: new Date().toISOString(), operations: [
      { operationId: "chosen", entity: "card", op: "update", entityId: f.card.id, after: { title: "Selected" } },
      { operationId: "deleted", entity: "card", op: "update", entityId: deleted.id, after: { title: "Excluded" } },
      { operationId: "create", entity: "card", op: "create", entityId: "new-parent", after: { storyMapId: f.card.storyMapId, title: "Excluded parent", level: "activity" } },
      { operationId: "dependent", entity: "card", op: "create", after: { storyMapId: f.card.storyMapId, title: "Excluded dependent", level: "step", parentId: "new-parent" } }
    ]
  }));
  const chosen = makeProposal();
  const empty = makeProposal();
  f.unitOfWork.run(human, ({ repository }) => repository.deleteCard(deleted.id, { strategy: "unassign" }));
  const server = createMcpFastifyApp();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository: f.repository, unitOfWork: f.unitOfWork, databasePath: join(f.directory, "storymapper.sqlite") });
  registerMcpHttp(server, f.repository, f.unitOfWork);
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "closed-scope-host", version: "1.0" }, { capabilities: {} });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const call = async (name: string, input: Record<string, unknown>) => {
      if (surface === "adapter") {
        const response = await server.inject({ method: "POST", url: "/api/mcp/call", payload: { name, input } });
        expect(response.statusCode, response.body).toBe(200);
        return response.json();
      }
      const response = await client.callTool({ name, arguments: input });
      expect(response.isError, JSON.stringify(response.content)).not.toBe(true);
      return JSON.parse((response.content as Array<{ text: string }>)[0]!.text);
    };
    const beforeFiles = readdirSync(f.directory, { recursive: true });
    const approved = await call("ApproveChangeSet", { changeSetId: chosen.id, selectedOperationIds: ["chosen", "dependent"] });
    expect(approved.changeSet.approval.selectedOperationIds).toEqual(["chosen"]);
    expect(readdirSync(f.directory, { recursive: true })).toEqual(beforeFiles);
    const applied = await call("ApplyChangeSet", { changeSetId: chosen.id, approvalToken: "discarded" });
    expect(applied.changeSet.execution.operationResults).toMatchObject([{ operationId: "chosen", index: 0 }]);
    expect(f.repository.listCards(f.card.storyMapId).map((card) => card.title)).toEqual(["Selected"]);
    await call("ApproveChangeSet", { changeSetId: empty.id, selectedOperationIds: [] });
    const files = readdirSync(f.directory, { recursive: true });
    const noEffects = await call("ApplyChangeSet", { changeSetId: empty.id, approvalToken: "discarded" });
    expect(noEffects.changeSet.execution).toMatchObject({ selectedOperationIds: [], operationResults: [] });
    expect(noEffects.changeSet.execution.restorePoint).toBeUndefined();
    expect(readdirSync(f.directory, { recursive: true })).toEqual(files);
  } finally { await client.close(); await server.close(); }
});

it("forwards Human HTTP selection and refuses changed selection before a snapshot", async () => {
  const f = fixture();
  const excluded = f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.card.storyMapId, level: "activity", title: "Excluded" }));
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "HTTP selection", source: "human", createdAt: new Date().toISOString(), operations: [
    { operationId: "parent", op: "create", entity: "card", entityId: "local-parent", after: { storyMapId: f.card.storyMapId, level: "activity", title: "Parent" } },
    { operationId: "child", op: "create", entity: "card", after: { storyMapId: f.card.storyMapId, level: "step", title: "Child", parentId: "local-parent" } },
    { operationId: "chosen", op: "update", entity: "card", entityId: f.card.id, after: { title: "Chosen" } },
    { operationId: "excluded", op: "update", entity: "card", entityId: excluded.id, after: { title: "Must remain" } }
  ] }));
  const server = createMcpFastifyApp();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository: f.repository, unitOfWork: f.unitOfWork, databasePath: join(f.directory, "storymapper.sqlite") });
  try {
    const approved = await server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/approve`, payload: { selectedOperationIds: ["child", "chosen"] } });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json().changeSet.approval.selectedOperationIds).toEqual(["chosen"]);
    const files = readdirSync(f.directory, { recursive: true });
    const refused = await server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/apply`, payload: { selectedOperationIds: ["excluded"] } });
    expect(refused.statusCode).toBe(409);
    expect(readdirSync(f.directory, { recursive: true })).toEqual(files);
    expect(f.repository.getChangeSet(proposal.id)?.status).toBe("approved");
    const applied = await server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/apply`, payload: { selectedOperationIds: ["chosen"] } });
    expect(applied.statusCode, applied.body).toBe(200);
    expect(f.repository.listCards(f.card.storyMapId).map((card) => card.title).sort()).toEqual(["Chosen", "Excluded"]);
    expect(f.repository.getChangeSet(proposal.id)?.operations).toEqual(proposal.operations);
  } finally { await server.close(); }
});

it("authorizes registered Annotation and Roadmap aliases through approved persisted execution", async () => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "autonomous" }));
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Registered aliases", source: "human", createdAt: new Date().toISOString(), operations: [
    { operationId: "annotation-create", op: "create", entity: "annotation", entityId: "new-tag", after: { projectId: f.project.id, name: "Tag" } },
    { operationId: "annotation-link", op: "set", entity: "cardAnnotation", entityId: "new-tag-link", after: { cardId: f.card.id, annotationId: "new-tag" } },
    { operationId: "roadmap-create", op: "create", entity: "roadmap", entityId: "new-roadmap", after: { projectId: f.project.id, name: "Plan" } },
    { operationId: "column-create", op: "create", entity: "roadmapColumn", entityId: "new-column", after: { roadmapId: "new-roadmap", name: "Reviewed" } },
    { operationId: "lane-create", op: "create", entity: "roadmapSwimlane", entityId: "new-lane", after: { roadmapId: "new-roadmap", name: "Team" } },
    { operationId: "planned-card-create", op: "create", entity: "roadmapCard", entityId: "new-planned-card", after: { roadmapId: "new-roadmap", columnId: "new-column", swimlaneId: "new-lane", title: "Planned work" } },
    { operationId: "reference-create", op: "create", entity: "roadmapReference", after: { roadmapCardId: "new-planned-card", targetType: "card", targetId: f.card.id } }
  ] }));
  const approved = await f.registry.call("ApproveChangeSet", { changeSetId: proposal.id });
  expect(approved.changeSet?.approval?.selectedOperationIds).toHaveLength(7);
  const result = await f.registry.call("ApplyChangeSet", { changeSetId: proposal.id, approvalToken: "discarded" });
  expect(result.changeSet?.status).toBe("applied");
  const snapshot = f.repository.getOperationSnapshot(f.project.id);
  expect(snapshot.cardAnnotations).toMatchObject([{ cardId: f.card.id, annotationId: snapshot.annotations[0]!.id }]);
  expect(snapshot.roadmapCards).toMatchObject([{ roadmapId: snapshot.roadmaps[0]!.id, title: "Planned work" }]);
  expect(snapshot.roadmapReferences).toMatchObject([{ roadmapCardId: snapshot.roadmapCards[0]!.id, targetId: f.card.id }]);
});


it("applies an existing Agent approval after the Human disables new approval", async () => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "autonomous" }));
  const proposal = f.propose(true);
  const approved = await f.registry.call("ApproveChangeSet", { changeSetId: proposal.id });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "apply" }));
  const applied = await f.registry.call("ApplyChangeSet", { changeSetId: proposal.id, approvalToken: "discarded" });
  expect(applied.changeSet?.status).toBe("applied");
  expect(f.repository.getCard(f.card.id)?.title).toBe("Applied");
  expect(f.repository.getChangeSet(proposal.id)?.approval).toEqual(approved.changeSet?.approval);
  expect(f.repository.getChangeSet(proposal.id)?.approval?.actor).toEqual(f.agent);
});

it("approves and applies registered Status, Template and attachment local targets", async () => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "autonomous" }));
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Remaining aliases", source: "human", createdAt: new Date().toISOString(), operations: [
    { operationId: "status-create", op: "create", entity: "workflowStatus", entityId: "local-status", after: { projectId: f.project.id, name: "Initial", group: "active" } },
    { operationId: "status-update", op: "update", entity: "workflowStatus", entityId: "unused-status", selector: { kind: "local", localId: "local-status" }, after: { group: "done" } },
    { operationId: "template-create", op: "create", entity: "storyTemplate", entityId: "local-template", after: { projectId: f.project.id, name: "Temporary" } },
    { operationId: "template-update", op: "update", entity: "storyTemplate", entityId: "unused-template", selector: { kind: "local", localId: "local-template" }, after: { name: "Reviewed template" } },
    { operationId: "template-delete", op: "delete", entity: "storyTemplate", entityId: "local-template", after: {} },
    { operationId: "attachment-create", op: "create", entity: "attachment", entityId: "local-attachment", after: { cardId: f.card.id, label: "Temporary evidence", filePath: "reviewed.txt" } },
    { operationId: "attachment-delete", op: "delete", entity: "attachment", entityId: "unused-attachment", selector: { kind: "local", localId: "local-attachment" }, after: {} }
  ] }));
  expect((await f.registry.call("ApproveChangeSet", { changeSetId: proposal.id })).changeSet?.approval?.selectedOperationIds).toHaveLength(7);
  expect((await f.registry.call("ApplyChangeSet", { changeSetId: proposal.id, approvalToken: "discarded" })).changeSet?.status).toBe("applied");
  const state = f.repository.getOperationSnapshot(f.project.id);
  expect(state.workflowStatuses.some((status) => status.name === "Initial" && status.group === "done")).toBe(true);
  expect(state.storyTemplates).toEqual([]);
  expect(state.attachments).toEqual([]);
});
