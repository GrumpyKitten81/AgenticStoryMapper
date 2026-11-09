import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { planDriftReportSchema, type ChangeOperation, type ChangeSetInput } from "@storymapper/contracts";
import { createRoutes } from "@storymapper/server/http/routes";
import { registerMcpHttp } from "@storymapper/server/mcp/http";
import { previewChangeSet } from "@storymapper/server/application/changeset/preview-changeset.use-cases";
import { executeChangeSetCommand } from "@storymapper/server/application/changeset/changeset-command";
import { getPlanDriftReport, listPlanDriftSystems } from "@storymapper/server/application/report/plan-drift.use-cases";

const human = { actorType: "human", actorId: "drift-human" } as const;
const agent = { actorType: "agent", actorId: "drift-agent", mcpSessionId: "drift-session" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-drift-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const data = unitOfWork.run(human, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Drift transport" });
    tx.updateSafetySettings(project.id, { agentMode: "autonomous" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Plan" });
    const card = tx.createCard({ storyMapId: map.id, level: "story", title: "Original" });
    tx.setExternalRef({ entityType: "card", entityId: card.id, system: "source-plan", externalId: "story-one" });
    return { project, map, card };
  });
  unitOfWork.run(human, ({ repository: tx }) => tx.updateCard(data.card.id, { title: "Reviewed local" }));
  const baseline = repository.getSourcePlanBaseline(data.map.id, "source-plan")!;
  const current = repository.getCard(data.card.id)!;
  const binding = repository.listExternalRefsForStoryMap(data.map.id)[0]!;
  const operation: ChangeOperation = { operationId: "ack", op: "acknowledge", entity: "sourcePlan", after: { storyMapId: data.map.id, system: baseline.system, baselineId: baseline.id, baselineVersion: baseline.version, entries: [{ cardId: current.id, before: baseline.entries[0]!, current, binding, source: { title: current.title, description: current.description, status: current.status, releaseId: current.releaseId, active: true } }] } };
  const input = (): ChangeSetInput => ({ id: randomUUID(), projectId: data.project.id, title: "Accept source reconciliation", source: "mcp" as const, createdAt: new Date().toISOString(), operations: [operation] });
  return { directory, repository, unitOfWork, ...data, operation, input };
}

it("defers even apply:true commands and requires human approval transactionally while preview admits later Agent apply", () => {
  const f = fixture();
  const response = executeChangeSetCommand(f, agent, f.input(), { apply: true });
  const proposal = response.changeSet;
  expect(proposal.status).toBe("proposed");
  expect(getPlanDriftReport(f, human, f.map.id, "source-plan").changes).toHaveLength(1);
  expect(previewChangeSet(f, agent, proposal.id)).toMatchObject({ canApprove: false, canApply: false });
  expect(() => f.unitOfWork.run(agent, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"))).toThrow("human approval");
  f.unitOfWork.run(human, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
  expect(previewChangeSet(f, agent, proposal.id)).toMatchObject({ canApprove: false, canApply: true });
  expect(() => f.unitOfWork.run(agent, ({ repository }) => { const command = repository.createCommandChangeSet(f.input()); repository.applyChangeSet(command.changeSet.id, { commandReceipt: command.receipt }); })).toThrow("recorded human approval");
});

it.each([false, true])("serves report parity and refuses actual transport Agent approval with allowAgentApproval=%s", async (allowAgentApproval) => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: allowAgentApproval ? "autonomous" : "apply" }));
  const proposal = f.unitOfWork.run(agent, ({ repository }) => repository.createChangeSet(f.input()));
  const server = createMcpFastifyApp();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository: f.repository, unitOfWork: f.unitOfWork, databasePath: join(f.directory, "storymapper.sqlite") });
  registerMcpHttp(server, f.repository, f.unitOfWork);
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "drift-wire", version: "1.0" }, { capabilities: {} });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const httpReport = await server.inject({ method: "GET", url: `/api/story-maps/${f.map.id}/plan-drift?system=source-plan` });
    expect(httpReport.statusCode).toBe(200);
    const mcpReport = await client.callTool({ name: "GetPlanDriftReport", arguments: { storyMapId: f.map.id, system: "source-plan" } });
    expect(mcpReport.isError).not.toBe(true);
    expect(JSON.parse((mcpReport.content as Array<{ text: string }>)[0]!.text).data).toEqual(httpReport.json());
    const reviewed = planDriftReportSchema.parse(httpReport.json());
    const acknowledgment: ChangeOperation = { operationId: "report-ack", op: "acknowledge", entity: "sourcePlan", after: {
      storyMapId: reviewed.storyMapId, system: reviewed.system, baselineId: reviewed.baselineId, baselineVersion: reviewed.baselineVersion,
      entries: reviewed.changes.map((change) => { const current = change.after?.card ?? null; return { cardId: change.cardId, before: change.before, current, binding: change.after?.binding ?? null,
        source: current ? { title: current.title, description: current.description, status: current.status, releaseId: current.releaseId, active: change.after!.active } : null }; })
    } };
    const submitted = await client.callTool({ name: "SubmitChangeSet", arguments: { projectId: f.project.id, title: "Submitted source reconciliation", operations: [acknowledgment], apply: true } });
    expect(submitted.isError, JSON.stringify(submitted.content)).not.toBe(true);
    const submittedProposal = JSON.parse((submitted.content as Array<{ text: string }>)[0]!.text).changeSet as { id: string; status: string };
    expect(submittedProposal.status).toBe("proposed");
    const refused = await client.callTool({ name: "ApproveChangeSet", arguments: { changeSetId: proposal.id } });
    expect(refused.isError).toBe(true);
    expect(f.repository.getChangeSet(proposal.id)?.approval).toBeUndefined();
    const approved = await server.inject({ method: "POST", url: `/api/changesets/${submittedProposal.id}/approve`, payload: {} });
    expect(approved.statusCode, approved.body).toBe(200);
    const applied = await client.callTool({ name: "ApplyChangeSet", arguments: { changeSetId: submittedProposal.id, approvalToken: "discarded" } });
    expect(applied.isError, JSON.stringify(applied.content)).not.toBe(true);
    expect(getPlanDriftReport(f, human, f.map.id, "source-plan").changes).toEqual([]);
    expect(f.repository.getCard(f.card.id)?.title).toBe("Reviewed local");
    f.unitOfWork.run(human, ({ repository }) => repository.deleteCard(f.card.id, { strategy: "unassign" }));
    expect(listPlanDriftSystems(f, human, f.map.id)).toEqual({ systems: ["source-plan"] });
    expect(getPlanDriftReport(f, human, f.map.id, "source-plan").changes[0]).toMatchObject({ reason: "deleted" });
    expect(() => getPlanDriftReport(f, human, f.map.id, "unknown")).toThrow("Available systems: source-plan");
    f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "off" }));
    expect(() => listPlanDriftSystems(f, agent, f.map.id)).toThrow("Agent access is disabled");
    const disabled = await client.callTool({ name: "ListPlanDriftSystems", arguments: { storyMapId: f.map.id } });
    expect(disabled.isError).toBe(true);
  } finally { await client.close(); await server.close(); }
});

it("permits Agent approval/application when acknowledgment is excluded from the closed selection", () => {
  const f = fixture();
  const input = f.input();
  input.operations.unshift({ operationId: "ordinary", op: "update", entity: "card", entityId: f.card.id, after: { title: "Ordinary edit" } });
  const proposal = f.unitOfWork.run(agent, ({ repository }) => repository.createChangeSet(input));
  const review = previewChangeSet(f, agent, proposal.id, ["ordinary"]);
  expect(review).toMatchObject({ selectedOperationIds: ["ordinary"], canApprove: true });
  f.unitOfWork.run(agent, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved", ["ordinary"]));
  f.unitOfWork.run(agent, ({ repository }) => repository.applyChangeSet(proposal.id));
  expect(f.repository.getCard(f.card.id)?.title).toBe("Ordinary edit");
  expect(f.repository.getSourcePlanBaseline(f.map.id, "source-plan")?.entries[0]?.card?.title).toBe("Original");
});

it("discovers a referenced system without inventing durable evidence or mutating read state", () => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: f.map.id, name: "Future" });
    repository.setExternalRef({ entityType: "release", entityId: release.id, system: "release-only", externalId: "future" });
  });
  const before = { activity: f.repository.listActivity(), baselines: f.repository.listSourcePlanBaselines(f.map.id), refs: f.repository.listExternalRefsForStoryMap(f.map.id) };
  expect(listPlanDriftSystems(f, agent, f.map.id).systems).toEqual(["release-only", "source-plan"]);
  expect(() => getPlanDriftReport(f, agent, f.map.id, "release-only")).toThrow("no durable synchronization baseline");
  getPlanDriftReport(f, agent, f.map.id, "source-plan");
  expect({ activity: f.repository.listActivity(), baselines: f.repository.listSourcePlanBaselines(f.map.id), refs: f.repository.listExternalRefsForStoryMap(f.map.id) }).toEqual(before);
});

it("reads an evidenced report without scanning or parsing unrelated source baselines", () => {
  const f = fixture();
  const baselineReads = vi.spyOn(f.repository, "getSourcePlanBaseline");
  const baselineScans = vi.spyOn(f.repository, "listSourcePlanBaselines");
  const referenceScans = vi.spyOn(f.repository, "listExternalRefsForStoryMap");
  const fullSnapshots = vi.spyOn(f.repository, "getStoryMapSnapshot");
  expect(getPlanDriftReport(f, human, f.map.id, "source-plan").changes).toHaveLength(1);
  expect(baselineReads).toHaveBeenCalledOnce();
  expect(baselineReads).toHaveBeenCalledWith(f.map.id, "source-plan");
  expect(baselineScans).not.toHaveBeenCalled();
  expect(referenceScans).toHaveBeenCalledOnce();
  expect(fullSnapshots).not.toHaveBeenCalled();
});

it("discovers retained systems from metadata without parsing captured Card payloads", () => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.deleteCard(f.card.id, { strategy: "unassign" }));
  const baselineScans = vi.spyOn(f.repository, "listSourcePlanBaselines");
  const systemReads = vi.spyOn(f.repository, "listSourcePlanSystems");
  expect(listPlanDriftSystems(f, human, f.map.id)).toEqual({ systems: ["source-plan"] });
  expect(systemReads).toHaveBeenCalledWith(f.map.id);
  expect(baselineScans).not.toHaveBeenCalled();
});

it("preserves exact addressed pending and historical baseline evidence without duplicating unchanged entries", () => {
  const f = fixture();
  const extra = f.unitOfWork.run(human, ({ repository }) => {
    const untouchedRelease = repository.createRelease({ storyMapId: f.map.id, name: "Unchanged Release" });
    const addressedRelease = repository.createRelease({ storyMapId: f.map.id, name: "Addressed Release" });
    repository.updateCard(f.card.id, { releaseId: addressedRelease.id });
    const unchanged = repository.createCard({ storyMapId: f.map.id, level: "story", title: "Unchanged synchronized Story", releaseId: untouchedRelease.id });
    repository.setExternalRef({ entityType: "card", entityId: unchanged.id, system: "source-plan", externalId: "story-two" });
    const ordinary = repository.createCard({ storyMapId: f.map.id, level: "story", title: "Ordinary before" });
    return { unchanged, ordinary };
  });
  const baseline = f.repository.getSourcePlanBaseline(f.map.id, "source-plan")!;
  const current = f.repository.getCard(f.card.id)!;
  const acknowledgment: ChangeOperation = { ...f.operation, after: { ...f.operation.after, baselineVersion: baseline.version, entries: f.operation.after.entries.map((entry) => ({ ...entry, current, source: { ...entry.source!, releaseId: current.releaseId } })) } };
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ ...f.input(), operations: [acknowledgment, { operationId: "ordinary", op: "update", entity: "card", entityId: extra.ordinary.id, after: { title: "Ordinary after" } }] }));
  const pending = previewChangeSet(f, human, proposal.id);
  const pendingChanges = pending.operations.flatMap((operation) => operation.changes);
  const full = pendingChanges.find((change) => change.entity === "sourcePlanBaseline");
  if (!full || full.entity !== "sourcePlanBaseline") throw new Error("Missing pending baseline evidence.");
  expect(full).toMatchObject({ evidenceScope: "addressedEntries" });
  expect(full.before).toEqual({ ...baseline, entries: baseline.entries.filter((entry) => entry.cardId === f.card.id), releases: [] });
  expect(full.after?.entries.map((entry) => entry.cardId)).toEqual([f.card.id]);
  f.unitOfWork.run(human, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
  f.unitOfWork.run(human, ({ repository }) => repository.applyChangeSet(proposal.id));
  const historical = previewChangeSet(f, human, proposal.id);
  const recordedChanges = historical.operations.flatMap((operation) => operation.changes);
  const addressed = recordedChanges.find((change) => change.entity === "sourcePlanBaseline");
  if (!addressed || addressed.entity !== "sourcePlanBaseline") throw new Error("Missing historical baseline evidence.");
  expect(addressed).toMatchObject({ evidenceScope: "addressedEntries" });
  expect(addressed.before).toEqual({ ...full.before, entries: full.before!.entries.filter((entry) => entry.cardId === f.card.id), releases: [] });
  expect(addressed.after).toEqual({ ...full.after, entries: full.after!.entries.filter((entry) => entry.cardId === f.card.id), releases: full.after!.releases.filter((release) => release.id === current.releaseId) });
  const pendingCard = pendingChanges.find((change) => change.entity === "card")!;
  expect(recordedChanges.filter((change) => change.entity === "card")).toEqual([{ ...pendingCard, after: { ...pendingCard.after, updatedAt: f.repository.getCard(extra.ordinary.id)!.updatedAt } }]);
  const persisted = f.repository.getSourcePlanBaseline(f.map.id, "source-plan")!;
  expect(persisted.entries.map((entry) => entry.cardId).sort()).toEqual([f.card.id, extra.unchanged.id].sort());
  expect(persisted.entries.find((entry) => entry.cardId === f.card.id)).toEqual(full.after!.entries[0]);
  expect(persisted.entries.find((entry) => entry.cardId === extra.unchanged.id)).toEqual(baseline.entries.find((entry) => entry.cardId === extra.unchanged.id));
});

it("bounds multi-Card publication preview evidence to addressed entries while retaining every projected Card", () => {
  const f = fixture();
  const count = 40;
  const operations: ChangeOperation[] = Array.from({ length: count }, (_, index) => ({ operationId: `publish-${index}`, op: "upsert", entity: "card", selector: { kind: "externalRef", scopeId: f.map.id, system: "source-plan", externalId: `new-${index}` }, after: { storyMapId: f.map.id, level: "story", title: `New Story ${index}` } }));
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ ...f.input(), operations }));
  const before = f.repository.getSourcePlanBaseline(f.map.id, "source-plan");
  const preview = previewChangeSet(f, human, proposal.id);
  expect(preview.conflicts).toEqual([]);
  const changes = preview.operations.flatMap((operation) => operation.changes).filter((change) => change.entity === "sourcePlanBaseline");
  expect(changes).toHaveLength(count);
  expect(changes.every((change) => change.evidenceScope === "addressedEntries")).toBe(true);
  expect(changes.reduce((total, change) => total + (change.before?.entries.length ?? 0), 0)).toBe(0);
  expect(changes.reduce((total, change) => total + (change.after?.entries.length ?? 0), 0)).toBe(count);
  expect(Buffer.byteLength(JSON.stringify(preview))).toBeLessThan(350_000);
  expect(preview.boards[0]!.snapshot.cards).toHaveLength(count + 1);
  expect(f.repository.listCards(f.map.id)).toHaveLength(1);
  expect(f.repository.getSourcePlanBaseline(f.map.id, "source-plan")).toEqual(before);
});
