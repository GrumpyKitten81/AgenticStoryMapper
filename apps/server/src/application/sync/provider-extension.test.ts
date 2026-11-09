import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DomainError, canonicalWorkItemId, projectArchiveManifestSchema, remoteWorkItemIdentity, workItemProviderSchema, type ChangeOperation, type ConnectorConnection, type CredentialStatus, type RemoteIssuePayload, type RemoteMilestonePayload } from "@storymapper/contracts";
import { DatabaseHandle, createRedactedSnapshot, createRestorePoint, openStoryMapperDb, restoreProject, StoryMapperRepository, UnitOfWork, validateArchiveDatabase } from "@storymapper/db";
import { createWorkItemProvider, workItemProviderFactories, type RemoteWorkItem, type WorkItemProvider } from "@storymapper/github";
import { applyChangeSet, approveChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";
import { proposeStoryMapCopy } from "@storymapper/server/application/changeset/tool-proposals.use-cases";
import { validateConnectorConnection } from "@storymapper/server/application/connector/connector.use-cases";
import { extensionIdentity, extensionIssue, extensionMilestone, extensionProviderFixture, extensionProviderId } from "@storymapper/server/application/sync/extension-provider-fixture";
import { resolveSyncConflict } from "@storymapper/server/application/sync/sync-conflict.use-cases";
import { getWorkItemSyncHealth, importWorkItems, pullStoryMapWorkItems, pushWorkItems } from "@storymapper/server/application/sync/sync.use-cases";
import { readUserGitHubToken } from "@storymapper/server/services/credential-file";
import { providerCredentials, providerCredentialStatuses, resolveProviderAuth } from "@storymapper/server/services/credentials";
import { executeRemotePush } from "@storymapper/server/services/remote-push-execution";
import { prepareRemotePush } from "@storymapper/server/services/remote-push-plan";

const registration = vi.hoisted(() => ({
  id: "extension-fixture", nextId: "extension-next", adapter: undefined as WorkItemProvider | undefined,
  factory: vi.fn(), status: vi.fn<() => Promise<CredentialStatus[]>>(),
  auth: vi.fn(async (connection: ConnectorConnection) => ({ connection, auth: { source: "env" as const } }))
}));

vi.mock("@storymapper/contracts/schemas/work-item-provider", async (original) => {
  const actual = await original<typeof import("@storymapper/contracts/schemas/work-item-provider")>();
  const { z } = await import("zod");
  return { ...actual, workItemProviderSchema: z.enum(["github", registration.id, registration.nextId]), providerRegistration: (ids: readonly string[], handlers: Record<string, unknown>) => {
    const extension = typeof handlers.github === "function" ? () => {
      registration.factory();
      if (!registration.adapter) throw new Error("Extension adapter was not installed in the fixture.");
      return registration.adapter;
    } : { status: registration.status, auth: registration.auth };
    return actual.providerRegistration(ids, { ...handlers, [registration.id]: extension, [registration.nextId]: extension });
  } };
});
vi.mock("node:child_process", () => ({ execFile: vi.fn(() => { throw new Error("Unexpected GitHub CLI invocation."); }) }));
vi.mock("@storymapper/server/services/credential-file", async (original) => ({
  ...await original<typeof import("@storymapper/server/services/credential-file")>(),
  readUserGitHubToken: vi.fn(async () => { throw new Error("Unexpected GitHub credential file read."); })
}));

const human = { actorType: "human", actorId: "extension-reviewer" } as const;
const agent = { actorType: "agent", actorId: "extension-host", mcpSessionId: "extension-session" } as const;
const cleanup: Array<() => void> = [];
beforeEach(() => {
  vi.clearAllMocks();
  registration.status.mockResolvedValue([{ provider: workItemProviderSchema.parse(extensionProviderId), source: "env", configured: true, message: "Disposable extension credentials are configured." }]);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected live provider request."));
});
afterEach(() => {
  try {
    expect(execFile).not.toHaveBeenCalled();
    expect(readUserGitHubToken).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    for (const close of cleanup.splice(0).reverse()) close();
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-provider-extension-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const unitOfWork = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const entities = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Provider extension exercise" });
    repository.updateSafetySettings(project.id, { github: true, agentMode: "apply" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Extension map" });
    const connection = repository.createConnectorConnection({ projectId: project.id, provider: workItemProviderSchema.parse(extensionProviderId), owner: "extension", repository: "fixture", name: "Extension adapter", authMode: "token", readOnly: false, issueTypeMapping: [{ cardType: "task", issueType: "Task" }] });
    return { project, map, connection };
  });
  const adapter = extensionProviderFixture();
  registration.adapter = adapter.provider;
  return { ...entities, ...adapter, path, handle, unitOfWork, repository, localOrigin: () => "http://127.0.0.1:4317" };
}

type Fixture = ReturnType<typeof fixture>;
function request(data: Fixture) { return { storyMapId: data.map.id, connectionId: data.connection.id }; }
function accept(data: Fixture, changeSetId: string): void {
  approveChangeSet(data, human, changeSetId);
  expect(applyChangeSet(data, human, changeSetId).changeSet.status).toBe("applied");
}
async function importOne(data: Fixture): Promise<string> {
  data.issues.push(extensionIssue());
  const proposed = await importWorkItems(data, agent, { ...request(data), apply: false });
  expect(proposed.outcome).toBe("proposed");
  accept(data, proposed.changeSetId);
  return data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.cardId!;
}
function reopen(data: Fixture): void {
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
}
function assertIntent(data: Fixture, planId: string, payload: RemoteIssuePayload | RemoteMilestonePayload): void {
  expect(data.handle.current.$client.inTransaction).toBe(false);
  const intent = data.repository.getRemotePushPlan(planId)!.execution.items.find((item) => item.state === "intent");
  expect(intent?.intentPayload).toEqual(payload);
  expect(intent?.attempt).toBeGreaterThan(0);
}

function applyOperations(data: Fixture, operations: ChangeOperation[]): void {
  const proposal = data.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: data.project.id, source: "human", title: "Reviewed extension identity edit", operations, createdAt: new Date().toISOString() }));
  accept(data, proposal.id);
}

async function titleConflict(data: Fixture): Promise<{ cardId: string; conflictId: string }> {
  const cardId = await importOne(data);
  data.unitOfWork.run(human, ({ repository }) => repository.updateCard(cardId, { title: "Local reviewed choice" }));
  data.issues[0]!.title = "Remote conflicting choice";
  const incoming = await pullStoryMapWorkItems(data, agent, { storyMapId: data.map.id, apply: false });
  accept(data, incoming.changeSetId);
  return { cardId, conflictId: data.repository.listOpenSyncConflicts(data.map.id)[0]!.id };
}

it("integrates an isolated enum, real factory registration and paired credentials with no GitHub probes", async () => {
  const data = fixture();
  expect(workItemProviderSchema.options).toEqual(["github", extensionProviderId, registration.nextId]);
  expect(Object.keys(workItemProviderFactories)).toEqual(workItemProviderSchema.options);
  expect(Object.keys(providerCredentials)).toEqual(workItemProviderSchema.options);
  expect(createWorkItemProvider(data.connection.provider)).toBe(data.provider);
  const result = await validateConnectorConnection(data, human, data.connection);
  expect(result).toMatchObject({ ok: true, provider: extensionProviderId, credentials: [{ selected: true, configured: true, source: "env" }] });
  expect(registration.status).toHaveBeenCalledTimes(1);
  expect(registration.auth).toHaveBeenCalledWith(expect.objectContaining({ provider: extensionProviderId }));
  expect(data.provider.validateConnection).toHaveBeenCalledWith(expect.objectContaining({ provider: extensionProviderId }), { source: "env" });
  expect(await providerCredentialStatuses(data.connection.provider)).toHaveLength(1);
  expect((await resolveProviderAuth(data.connection)).connection.provider).toBe(extensionProviderId);
});

it("persists reviewed incoming identity, attributed audit and baselines and resolves a real pull conflict", async () => {
  const data = fixture();
  const cardId = await importOne(data);
  const ref = data.repository.listExternalRefsForStoryMap(data.map.id).find((row) => row.entityId === cardId)!;
  expect(ref).toMatchObject({ system: extensionProviderId, externalId: canonicalWorkItemId(data.connection.provider, data.issues[0]!.identity!) });
  expect(data.repository.getCardDetails(cardId)).toMatchObject({ title: "Extension item 1", releaseId: null });
  reopen(data);
  expect(data.repository.getCardDetails(cardId)).toMatchObject({ provenance: "linked" });
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ provider: extensionProviderId, remoteId: "issues-1", remoteNumber: 1, url: data.issues[0]!.url, baseline: { acknowledgedLocal: { releaseId: null }, observedRemote: { remoteState: "open" } } });
  expect(data.repository.listActivity(data.project.id).some((event) => event.action === "changeSet.proposed" && event.actorType === "agent" && event.actor === agent.actorId)).toBe(true);
  expect(data.repository.listActivity(data.project.id).filter((event) => event.action === "changeSet.applied").map(({ actorType, actor }) => ({ actorType, actor }))).toEqual([{ actorType: "github", actor: human.actorId }]);
  data.unitOfWork.run(human, ({ repository }) => repository.updateCard(cardId, { title: "Local divergence" }));
  data.issues[0]!.title = "Remote divergence";
  const pulled = await pullStoryMapWorkItems(data, agent, { storyMapId: data.map.id, apply: false });
  accept(data, pulled.changeSetId);
  const conflict = data.repository.listOpenSyncConflicts(data.map.id)[0]!;
  expect(conflict).toMatchObject({ cardId, remoteId: "issues-1", field: "title", localValue: "Local divergence", remoteValue: "Remote divergence" });
  const reads = data.provider.getRemoteItem.mock.calls.length;
  expect(getWorkItemSyncHealth(data, human, data.map.id).stateCounts.conflict).toBe(1);
  expect(data.provider.getRemoteItem).toHaveBeenCalledTimes(reads);
  const resolved = await resolveSyncConflict(data, agent, conflict.id, { storyMapId: data.map.id, resolution: "remote", apply: false, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } });
  expect(resolved).toHaveProperty("changeSetId");
  if (!("changeSetId" in resolved)) throw new Error("Expected incoming conflict proposal.");
  accept(data, resolved.changeSetId);
  expect(data.repository.getSyncConflict(conflict.id)).toMatchObject({ status: "resolved-remote" });
  expect(data.repository.getCardDetails(cardId)?.title).toBe("Remote divergence");
  expect(getWorkItemSyncHealth(data, human, data.map.id)).toMatchObject({ stateCounts: { synced: 1, conflict: 0 }, openConflicts: [] });
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
});

it("keeps protected incoming changes proposed until human approval and preserves atomicity after audit failure", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "propose" }));
  data.issues.push(extensionIssue());
  const proposed = await importWorkItems(data, agent, { ...request(data), apply: true });
  expect(proposed.outcome).toBe("proposed");
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([]);
  expect(data.repository.getStoryMapSnapshot(data.map.id)!.cards).toEqual([]);
  approveChangeSet(data, human, proposed.changeSetId);
  data.handle.current.$client.exec("CREATE TRIGGER refuse_extension_audit BEFORE INSERT ON activity_events WHEN NEW.action = 'changeSet.operation.applied' BEGIN SELECT RAISE(ABORT, 'extension audit refused'); END");
  expect(() => applyChangeSet(data, human, proposed.changeSetId)).toThrow();
  expect(data.repository.getStoryMapSnapshot(data.map.id)!.cards).toEqual([]);
  expect(data.repository.listExternalRefsForStoryMap(data.map.id)).toEqual([]);
  data.handle.current.$client.exec("DROP TRIGGER refuse_extension_audit");
  const retry = await importWorkItems(data, agent, { ...request(data), apply: false });
  accept(data, retry.changeSetId);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toHaveLength(1);
});

it("executes exact human-confirmed Issue and Milestone effects with durable intents and reopening", async () => {
  const data = fixture();
  const release = data.unitOfWork.run(human, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Extension release", goal: "Reviewed milestone goal", releaseDate: "2026-11-20" });
    repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Reviewed extension", description: "Reviewed body", releaseId: release.id });
    return release;
  });
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), mode: "push", localOrigin: data.localOrigin() });
  expect(reviewed.plan.blockers).toEqual([]);
  expect(reviewed.plan.items.map((item) => item.kind)).toEqual(["milestone", "issue"]);
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  await expect(pushWorkItems(data, human, { ...request(data), cardIds: [] })).rejects.toMatchObject({ code: "validation" });
  await expect(executeRemotePush(data.repository, data.unitOfWork, agent, reviewed.plan.id)).rejects.toMatchObject({ code: "protected" });
  const writeMilestone = data.provider.writeMilestone.getMockImplementation()!;
  const writeIssue = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeMilestone.mockImplementation(async (connection, auth, payload) => { assertIntent(data, reviewed.plan.id, payload); return writeMilestone(connection, auth, payload); });
  data.provider.writeRemoteIssue.mockImplementation(async (connection, auth, payload) => { assertIntent(data, reviewed.plan.id, payload); expect(payload.milestoneNumber).toBe(1); return writeIssue(connection, auth, payload); });
  reopen(data);
  const completed = await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, false, data.localOrigin);
  expect(completed.execution.status, JSON.stringify(completed.execution)).toBe("completed");
  expect(data.provider.writeMilestone).toHaveBeenCalledTimes(1);
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(completed.plan).toEqual(reviewed.plan);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual(expect.arrayContaining([expect.objectContaining({ provider: extensionProviderId, releaseId: release.id, remoteId: "milestone-1", url: data.milestones[0]!.url }), expect.objectContaining({ provider: extensionProviderId, remoteId: "issues-1", url: data.issues[0]!.url })]));
});

it("reconciles an interrupted create by its stable marker after reopening without duplicate writes", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Uncertain extension write" }));
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), mode: "push", localOrigin: data.localOrigin() });
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => {
    assertIntent(data, reviewed.plan.id, payload);
    await write(connection, auth, payload);
    throw new DomainError("internal", "Extension create response was lost.");
  });
  const interrupted = await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, false, data.localOrigin);
  expect(interrupted.execution).toMatchObject({ status: "interrupted", items: [{ state: "uncertain", attempt: 1 }] });
  expect(data.issues).toHaveLength(1);
  reopen(data);
  const recovered = await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, true, data.localOrigin);
  expect(recovered.execution).toMatchObject({ status: "completed", items: [{ state: "succeeded", remoteId: "issues-1", url: data.issues[0]!.url, attempt: 1 }] });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.issues).toHaveLength(1);
});

it("rejects foreign identities and read-only or drifted plans before remote effects", async () => {
  const data = fixture();
  const foreign = extensionIssue();
  foreign.identity = { ...foreign.identity!, owner: "foreign" };
  data.issues.push(foreign);
  await expect(importWorkItems(data, agent, { ...request(data), apply: false })).rejects.toMatchObject({ code: "validation" });
  expect(data.repository.getStoryMapSnapshot(data.map.id)!.cards).toEqual([]);
  data.issues.splice(0);
  const card = data.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Reviewed" }));
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), mode: "push", localOrigin: data.localOrigin() });
  data.unitOfWork.run(human, ({ repository }) => repository.updateCard(card.id, { title: "Changed since review" }));
  await expect(executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, false, data.localOrigin)).rejects.toMatchObject({ code: "conflict" });
  data.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { readOnly: true }));
  await expect(prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), mode: "push", localOrigin: data.localOrigin() })).rejects.toMatchObject({ code: "disabled" });
  await expect(executeRemotePush(data.repository, data.unitOfWork, human, randomUUID(), false, data.localOrigin)).rejects.toMatchObject({ code: "not_found" });
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
});

it("retains unavailable identities and reports adapter failures without implying remote deletion", async () => {
  const data = fixture();
  const cardId = await importOne(data);
  const url = data.issues[0]!.url;
  data.issues.splice(0);
  const unavailable = await pullStoryMapWorkItems(data, agent, { storyMapId: data.map.id, apply: false });
  expect(unavailable.items).toEqual([expect.objectContaining({ status: "failed", cardId, code: "not_found", url })]);
  accept(data, unavailable.changeSetId);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ syncState: "stale", url, remoteId: "issues-1" });
  expect(getWorkItemSyncHealth(data, human, data.map.id).stateCounts.remote_deleted).toBe(0);
  data.provider.getRemoteItem.mockRejectedValueOnce(new DomainError("disabled", "Extension permission denied."));
  await expect(pullStoryMapWorkItems(data, agent, { storyMapId: data.map.id, apply: false })).rejects.toMatchObject({ code: "disabled", details: { items: [expect.objectContaining({ status: "failed", cardId, remoteId: "issues-1" })] } });
  expect(data.repository.getCardDetails(cardId)).toBeDefined();
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
});

it("refuses renewed conflict evidence after remote drift and permits a fresh reviewed choice", async () => {
  const data = fixture();
  const cardId = await importOne(data);
  data.unitOfWork.run(human, ({ repository }) => repository.updateCard(cardId, { title: "Local choice" }));
  data.issues[0]!.title = "First remote choice";
  const incoming = await pullStoryMapWorkItems(data, agent, { storyMapId: data.map.id, apply: false });
  accept(data, incoming.changeSetId);
  const conflict = data.repository.listOpenSyncConflicts(data.map.id)[0]!;
  data.issues[0]!.title = "New remote choice";
  await expect(resolveSyncConflict(data, agent, conflict.id, { storyMapId: data.map.id, resolution: "remote", apply: false, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } })).rejects.toMatchObject({ code: "conflict" });
  expect(data.repository.getSyncConflict(conflict.id)?.status).toBe("open");
  expect(data.repository.getCardDetails(cardId)?.title).toBe("Local choice");
  const renewed = await resolveSyncConflict(data, agent, conflict.id, { storyMapId: data.map.id, resolution: "remote", apply: false, reviewed: { localValue: "Local choice", remoteValue: "New remote choice" } });
  if (!("changeSetId" in renewed)) throw new Error("Expected renewed incoming conflict proposal.");
  accept(data, renewed.changeSetId);
  expect(data.repository.getCardDetails(cardId)?.title).toBe("New remote choice");
});

it("stops ambiguous reconciliation after an uncertain create without granting another write", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Ambiguous extension effect" }));
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), mode: "push", localOrigin: data.localOrigin() });
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => { await write(connection, auth, payload); throw new DomainError("internal", "Extension response lost."); });
  expect((await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, false, data.localOrigin)).execution.status).toBe("interrupted");
  data.provider.findRemoteItemsByMarker.mockResolvedValueOnce({ complete: true, matches: [data.issues[0]!, { ...extensionIssue(2), body: data.issues[0]!.body }] });
  const refused = await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, true, data.localOrigin);
  expect(refused.execution).toMatchObject({ status: "interrupted", items: [{ state: "uncertain" }] });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([]);
});

it("refuses a database replacement while alternate-provider preparation is awaiting a read", async () => {
  const data = fixture();
  await importOne(data);
  const original = data.handle.current;
  const replacementPath = join(data.path, "..", "replacement.sqlite");
  await original.$client.backup(replacementPath);
  const replacement = openStoryMapperDb(replacementPath);
  cleanup.push(() => { if (original.$client.open) original.$client.close(); });
  const read = data.provider.getRemoteItem.getMockImplementation()!;
  data.provider.getRemoteItem.mockImplementationOnce(async (connection, auth, remoteId) => { data.handle.current = replacement; return read(connection, auth, remoteId); });
  await expect(pullStoryMapWorkItems(data, agent, { storyMapId: data.map.id, apply: false })).rejects.toMatchObject({ code: "conflict" });
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ syncState: "synced" });
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
});

it("reports alternate canonical links created after a Restore Point", async () => {
  const data = fixture();
  const point = createRestorePoint(data.handle, "manual");
  await importOne(data);
  const restored = await restoreProject(data.handle, data.project.id, point.fileName, human);
  expect(restored.githubLinks).toEqual([{ kind: "canonical", provider: extensionProviderId, url: data.issues[0]!.url }]);
});

it("retains alternate identity history through deletion and actual Restore while invalidating prior consent", async () => {
  const data = fixture();
  const card = data.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Restore extension identity" }));
  const point = createRestorePoint(data.handle, "manual");
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), mode: "push", localOrigin: data.localOrigin() });
  expect((await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, false, data.localOrigin)).execution.status).toBe("completed");
  data.unitOfWork.run(human, ({ repository }) => repository.deleteCard(card.id, { strategy: "unassign" }));
  expect(getWorkItemSyncHealth(data, human, data.map.id)).toMatchObject({ stateCounts: { local_deleted: 1 }, deletedLocalLinks: [{ entityId: card.id, url: data.issues[0]!.url }] });
  await restoreProject(data.handle, data.project.id, point.fileName, human);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([]);
  expect(data.repository.getRemotePushPlan(reviewed.plan.id)).toMatchObject({ execution: { status: "completed", items: [{ remoteId: "issues-1", state: "succeeded" }] } });
  await expect(executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, true, data.localOrigin)).rejects.toMatchObject({ code: "conflict" });
  const renewed = await prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), mode: "push", localOrigin: data.localOrigin() });
  expect(renewed.plan.items[0]).toMatchObject({ action: "update", marker: reviewed.plan.items[0]!.marker, payload: { remoteId: "issues-1" } });
  expect((await executeRemotePush(data.repository, data.unitOfWork, human, renewed.plan.id, false, data.localOrigin)).execution.status).toBe("completed");
  expect(data.issues).toHaveLength(1);
});

it("redacts alternate operational references, credentials and remote plans from portable snapshots", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Portable extension data" }));
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), mode: "push", localOrigin: data.localOrigin() });
  expect((await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, false, data.localOrigin)).execution.status).toBe("completed");
  const snapshot = createRedactedSnapshot(data.path, data.project.id);
  const portable = openStoryMapperDb(snapshot.snapshotPath);
  try {
    for (const table of ["remote_work_item_links", "remote_push_plans", "remote_push_executions", "connector_connections"]) expect(portable.$client.prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
    expect(portable.$client.prepare("SELECT * FROM external_refs WHERE system = ?").all(extensionProviderId)).toEqual([]);
    expect(portable.$client.pragma("foreign_key_check")).toEqual([]);
  } finally { portable.$client.close(); rmSync(snapshot.snapshotPath); }
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toHaveLength(1);
});

it("preserves exact alternate scope casing while canonicalizing GitHub scope and refusing inconsistent numbers", async () => {
  const data = fixture();
  const connection = data.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { owner: "Extension", repository: "Fixture" }))!;
  const remote = extensionIssue(1, { owner: "Extension", repository: "Fixture" });
  expect(remoteWorkItemIdentity(connection, remote)).toMatchObject({ owner: "Extension", repository: "Fixture" });
  expect(() => remoteWorkItemIdentity(connection, extensionIssue())).toThrow(expect.objectContaining({ code: "validation" }));
  expect(() => remoteWorkItemIdentity(connection, { ...remote, remoteNumber: 2 })).toThrow(expect.objectContaining({ code: "validation" }));
  const github = { provider: "github" as const, owner: "Extension", repository: "Fixture" };
  const issue = { remoteId: "1", remoteNumber: 1, url: "https://github.com/Extension/Fixture/issues/1" };
  expect(remoteWorkItemIdentity(github, issue)).toMatchObject({ owner: "extension", repository: "fixture", url: "https://github.com/extension/fixture/issues/1" });
  expect(() => remoteWorkItemIdentity(github, { ...issue, remoteNumber: 2 })).toThrow(expect.objectContaining({ code: "validation" }));
  data.issues.push(remote);
  const incoming = await importWorkItems(data, agent, { ...request(data), apply: false });
  accept(data, incoming.changeSetId);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.url).toBe(remote.url);
});

it.each(["scope", "canonical-url", "requested-id", "marker", "milestone"] as const)("refuses invalid %s identity during plan preparation before remote effects", async (surface) => {
  const data = fixture();
  const cardId = await importOne(data);
  const original = data.issues[0]!;
  const invalid = structuredClone(original);
  if (surface === "canonical-url") { invalid.identity!.url += "/different"; invalid.url = invalid.identity!.url; }
  else invalid.identity!.owner = "foreign";
  if (surface === "requested-id") Object.assign(invalid, extensionIssue(2));
  if (surface === "marker") {
    data.unitOfWork.run(human, ({ repository }) => repository.deleteGitHubLink(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.externalRefId));
    data.provider.findRemoteItemsByMarker.mockResolvedValueOnce({ complete: true, matches: [invalid] });
  } else if (surface === "milestone") {
    const milestone = extensionMilestone(); milestone.identity!.owner = "foreign";
    data.milestones.push(milestone);
  } else data.provider.getRemoteItem.mockResolvedValueOnce({ status: "found", item: invalid });
  await expect(prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), cardIds: [cardId], mode: "push", localOrigin: data.localOrigin() })).rejects.toMatchObject({ code: expect.stringMatching(/^(validation|conflict)$/) });
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
});

it.each(["scope", "canonical-url", "requested-id", "marker"] as const)("refuses invalid %s identity after human confirmation before any write", async (surface) => {
  const data = fixture();
  const cardId = await importOne(data);
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), cardIds: [cardId], mode: "push", localOrigin: data.localOrigin() });
  expect(reviewed.plan.blockers).toEqual([]);
  const invalid = structuredClone(data.issues[0]!);
  if (surface === "canonical-url") { invalid.identity!.url += "/different"; invalid.url = invalid.identity!.url; }
  else invalid.identity!.owner = "foreign";
  if (surface === "requested-id") Object.assign(invalid, extensionIssue(2));
  if (surface === "marker") data.provider.findRemoteItemsByMarker.mockResolvedValueOnce({ complete: true, matches: [invalid] });
  else data.provider.getRemoteItem.mockResolvedValueOnce({ status: "found", item: invalid });
  const stopped = await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, false, data.localOrigin);
  expect(stopped.execution.status).toBe("interrupted");
  expect(stopped.execution.items[0]?.state).toBe("failed");
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.url).toBe(data.issues[0]!.url);
});

it("refuses foreign Milestone evidence at confirmation before any dependent effect", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Local release" });
    repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Milestone review", releaseId: release.id });
  });
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), mode: "push", localOrigin: data.localOrigin() });
  const foreign = extensionMilestone(); foreign.identity!.repository = "foreign";
  data.milestones.push(foreign);
  await expect(executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, false, data.localOrigin)).rejects.toMatchObject({ code: expect.stringMatching(/^(validation|conflict)$/) });
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
});

it.each(["preparation", "confirmation"] as const)("refuses a valid Issue with a foreign nested Milestone identity during %s", async (phase) => {
  const data = fixture();
  const cardId = await importOne(data);
  const invalid = structuredClone(data.issues[0]!);
  const milestone = extensionMilestone(); milestone.identity!.repository = "foreign";
  Object.assign(invalid, { milestoneDescription: milestone.description, milestoneState: milestone.state, milestone: milestone.title, milestoneNumber: milestone.remoteNumber, milestoneIdentity: milestone.identity });
  const prepare = () => prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), cardIds: [cardId], mode: "push", localOrigin: data.localOrigin() });
  if (phase === "preparation") {
    data.provider.getRemoteItem.mockResolvedValueOnce({ status: "found", item: invalid });
    await expect(prepare()).rejects.toMatchObject({ code: "validation" });
  } else {
    const reviewed = await prepare();
    data.provider.getRemoteItem.mockResolvedValueOnce({ status: "found", item: invalid });
    expect((await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, false, data.localOrigin)).execution).toMatchObject({ status: "interrupted", items: [{ state: "failed" }] });
  }
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
});

it.each(["uncertain", "local_failed"] as const)("retains %s evidence when resumed detail changes the canonical identity without changing content", async (failure) => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Retained canonical effect" }));
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, human, { ...request(data), mode: "push", localOrigin: data.localOrigin() });
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  if (failure === "uncertain") data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => { await write(connection, auth, payload); throw new DomainError("internal", "Extension response lost."); });
  else data.handle.current.$client.exec("CREATE TRIGGER refuse_extension_binding BEFORE INSERT ON external_refs BEGIN SELECT RAISE(ABORT, 'extension binding refused'); END");
  expect((await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, false, data.localOrigin)).execution.items[0]?.state).toBe(failure);
  if (failure === "local_failed") data.handle.current.$client.exec("DROP TRIGGER refuse_extension_binding");
  const invalid = structuredClone(data.issues[0]!);
  invalid.identity!.url += "/other";
  invalid.url = invalid.identity!.url;
  data.provider.getRemoteItem.mockResolvedValueOnce({ status: "found", item: invalid });
  const stopped = await executeRemotePush(data.repository, data.unitOfWork, human, reviewed.plan.id, true, data.localOrigin);
  expect(stopped.execution).toMatchObject({ status: "interrupted", items: [{ state: failure }] });
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([]);
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.issues).toHaveLength(1);
});

it("associates colliding parent numbers within each canonical alternate repository", async () => {
  const data = fixture();
  const broad = data.unitOfWork.run(human, ({ repository }) => repository.createConnectorConnection({ projectId: data.project.id, provider: data.connection.provider, owner: "extension", name: "Multiple alternate repositories", authMode: "token", readOnly: false, typeMapping: [{ match: "epic", level: "activity" }, { match: "feature", level: "step" }] }));
  const remote = (repository: string, number: number, title: string, issueType: string, parentNumber?: number): RemoteWorkItem => ({ ...extensionIssue(number, { owner: "extension", repository }), title, issueType, parentNumber });
  data.issues.push(remote("alpha", 1, "Alpha parent", "epic"), remote("beta", 1, "Beta parent", "epic"), remote("alpha", 2, "Alpha child", "feature", 1), remote("beta", 2, "Beta child", "feature", 1));
  const incoming = await importWorkItems(data, agent, { storyMapId: data.map.id, connectionId: broad.id, apply: false });
  accept(data, incoming.changeSetId);
  const cards = data.repository.getStoryMapSnapshot(data.map.id)!.cards;
  expect(cards.find((card) => card.title === "Alpha child")?.parentId).toBe(cards.find((card) => card.title === "Alpha parent")!.id);
  expect(cards.find((card) => card.title === "Beta child")?.parentId).toBe(cards.find((card) => card.title === "Beta parent")!.id);
});

it("retires sync and conflicts for a provider-only identity transition and replaces attached provider metadata", async () => {
  const data = fixture();
  const { cardId, conflictId } = await titleConflict(data);
  const ref = data.repository.listExternalRefsForStoryMap(data.map.id).find((row) => row.entityId === cardId)!;
  const citing = data.unitOfWork.run(human, ({ repository }) => {
    const card = repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Attached alternate evidence" });
    repository.createCardSourceLink(card.id, { kind: "github", externalRefId: ref.id });
    return card;
  });
  const update = (provider: ConnectorConnection["provider"] | undefined, externalId: string) => applyOperations(data, [{ operationId: randomUUID(), entity: "githubExternalRef", op: "update", entityId: ref.id, baseVersion: data.repository.getCardDetails(cardId)!.version, after: { entityType: "card", entityId: cardId, scopeId: data.map.id, ...(provider ? { provider } : {}), externalId } }]);
  update(workItemProviderSchema.parse(registration.nextId), ref.externalId);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([]);
  expect(data.repository.getSyncConflict(conflictId)).toBeUndefined();
  expect(data.repository.listSourceLinksForStoryMap(data.map.id).find((link) => link.cardId === citing.id)).toMatchObject({ provider: registration.nextId, url: data.issues[0]!.url });
  update(undefined, "https://github.com/extension/fixture/issues/1");
  const githubEvidence = data.repository.listSourceLinksForStoryMap(data.map.id).find((link) => link.cardId === citing.id)!;
  if (githubEvidence.kind !== "github") throw new Error("Expected canonical attached source evidence.");
  expect(githubEvidence.url).toBe("https://github.com/extension/fixture/issues/1");
  expect(githubEvidence).not.toHaveProperty("provider");
});

it("refuses the GitHub-specific update API for an alternate canonical reference without mutating it", async () => {
  const data = fixture();
  await importOne(data);
  const before = data.repository.listExternalRefsForStoryMap(data.map.id)[0]!;
  expect(() => data.unitOfWork.run(human, ({ repository }) => repository.updateGitHubLink(before.id, { url: "https://github.com/extension/fixture/issues/1" }))).toThrow(expect.objectContaining({ code: "validation" }));
  expect(data.repository.listExternalRefsForStoryMap(data.map.id)).toContainEqual(before);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.provider).toBe(extensionProviderId);
});

it("persists and closes a local alternate conflict choice only through its confirmed plan", async () => {
  const data = fixture();
  const { cardId, conflictId } = await titleConflict(data);
  const conflict = data.repository.getSyncConflict(conflictId)!;
  const result = await resolveSyncConflict(data, human, conflictId, { storyMapId: data.map.id, resolution: "local", reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } });
  if (!("plan" in result) || !result.plan || !("id" in result.plan)) throw new Error("Expected a reviewed remote conflict plan.");
  expect(result.plan.items).toHaveLength(1);
  expect(result.plan.blockers).toEqual([]);
  expect(data.repository.getSyncConflict(conflictId)?.status).toBe("open");
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  const completed = await executeRemotePush(data.repository, data.unitOfWork, human, result.plan.id, false, data.localOrigin);
  expect(completed.execution.status).toBe("completed");
  expect(data.repository.getSyncConflict(conflictId)?.status).toBe("resolved-local");
  expect(data.issues[0]?.title).toBe("Local reviewed choice");
  expect(data.repository.getCardDetails(cardId)?.title).toBe("Local reviewed choice");
  expect(getWorkItemSyncHealth(data, human, data.map.id).openConflicts).toEqual([]);
});

it("advances alternate Release baselines after incoming Milestone rename and date changes", async () => {
  const data = fixture();
  const cardId = await importOne(data);
  const milestone = extensionMilestone();
  Object.assign(data.issues[0]!, { milestoneIdentity: milestone.identity, milestoneDescription: milestone.description, milestoneState: milestone.state, milestone: milestone.title, milestoneNumber: milestone.remoteNumber, milestoneDueOn: milestone.dueOn });
  const first = await pullStoryMapWorkItems(data, agent, { storyMapId: data.map.id, apply: false });
  accept(data, first.changeSetId);
  const releaseId = data.repository.getCardDetails(cardId)!.releaseId!;
  data.issues[0]!.milestone = "Renamed alternate release";
  data.issues[0]!.milestoneDueOn = "2026-12-14T00:00:00.000Z";
  const changed = await pullStoryMapWorkItems(data, agent, { storyMapId: data.map.id, apply: false });
  accept(data, changed.changeSetId);
  expect(data.repository.getRelease(releaseId)).toMatchObject({ name: "Renamed alternate release", releaseDate: "2026-12-14" });
  const binding = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.releaseId === releaseId)!;
  expect(binding.baseline?.acknowledgedLocal.releaseMetadata).toMatchObject({ name: "Renamed alternate release", releaseDate: "2026-12-14" });
  expect(binding.baseline?.observedRemote.releaseMetadata).toMatchObject({ name: "Renamed alternate release", releaseDate: "2026-12-14" });
  expect(getWorkItemSyncHealth(data, human, data.map.id).stateCounts.unsynced).toBe(0);
  const unchanged = await pullStoryMapWorkItems(data, agent, { storyMapId: data.map.id, apply: false });
  expect(unchanged.items).toEqual([expect.objectContaining({ cardId, status: "unchanged" })]);
});

it("copies reviewed alternate source identity and linked provenance without granting outbound ownership", async () => {
  const data = fixture();
  const cardId = await importOne(data);
  const source = data.repository.listExternalRefsForStoryMap(data.map.id).find((row) => row.entityId === cardId)!;
  const proposed = proposeStoryMapCopy(data, human, { sourceStoryMapId: data.map.id, targetName: "Reviewed alternate copy" });
  const operation = proposed.changeSet.operations.find((row) => row.entity === "storyMapCopy")!;
  accept(data, proposed.changeSet.id);
  const copied = data.repository.getStoryMapSnapshot(operation.entityId!)!;
  const card = copied.cards.find((row) => row.title === "Extension item 1")!;
  expect(card).toMatchObject({ creationOrigin: "inference", provenance: "linked" });
  const ref = copied.externalRefs.find((row) => row.entityId === card.id)!;
  expect(ref).toMatchObject({ system: extensionProviderId, externalId: source.externalId });
  expect(ref.id).not.toBe(source.id);
  expect(copied.sourceLinks).toContainEqual(expect.objectContaining({ cardId: card.id, externalRefId: ref.id, provider: extensionProviderId, url: data.issues[0]!.url }));
  expect(copied.remoteWorkItemLinks).toEqual([]);
  await expect(prepareRemotePush(data.repository, data.unitOfWork, human, { storyMapId: copied.storyMap.id, connectionId: data.connection.id, cardIds: [card.id], mode: "push", localOrigin: data.localOrigin() })).rejects.toMatchObject({ code: "conflict" });
});

it("recursively removes alternate identities and plans from portable Activity, ChangeSet and history JSON", async () => {
  const data = fixture();
  const cardId = await importOne(data);
  const externalId = data.repository.listExternalRefsForStoryMap(data.map.id)[0]!.externalId;
  const payload = { business: "Retained business evidence", nested: [{ system: extensionProviderId, externalId }, { provider: extensionProviderId, remoteId: "issues-1" }], remotePushPlans: [{ provider: extensionProviderId, remoteId: "issues-1" }] };
  data.unitOfWork.run(human, ({ repository }) => repository.logActivity(data.project.id, "extension.fixture", "project", data.project.id, payload, payload));
  data.handle.current.$client.prepare("INSERT INTO change_sets (id, project_id, title, source, status, operations_schema_version, operations_json, created_at) VALUES (?, ?, 'Retained historical operation', 'human', 'applied', 1, ?, ?)").run(randomUUID(), data.project.id, JSON.stringify([{ operationId: "historical", op: "create", entity: "card", after: payload }]), new Date().toISOString());
  const history = data.handle.current.$client.prepare("SELECT id,snapshot_json FROM card_versions WHERE card_id = ? LIMIT 1").get(cardId) as { id: string; snapshot_json: string };
  data.handle.current.$client.prepare("UPDATE card_versions SET snapshot_json = ? WHERE id = ?").run(JSON.stringify({ ...JSON.parse(history.snapshot_json), evidence: payload }), history.id);
  const snapshot = createRedactedSnapshot(data.path, data.project.id);
  const portable = openStoryMapperDb(snapshot.snapshotPath);
  try {
    const columns = [portable.$client.prepare("SELECT before_json,after_json FROM activity_events").all(), portable.$client.prepare("SELECT operations_json,execution_json FROM change_sets").all(), portable.$client.prepare("SELECT snapshot_json FROM card_versions").all()];
    for (const rows of columns) {
      const json = JSON.stringify(rows);
      expect(json).not.toContain(extensionProviderId);
      expect(json).not.toContain("work-items.example.test");
      expect(json).toContain("Retained business evidence");
    }
  } finally { portable.$client.close(); rmSync(snapshot.snapshotPath); }
});

it("rejects otherwise valid portable archives containing an alternate canonical reference", async () => {
  const data = fixture();
  const release = data.unitOfWork.run(human, ({ repository }) => repository.createRelease({ storyMapId: data.map.id, name: "Archive reference owner" }));
  const snapshot = createRedactedSnapshot(data.path, data.project.id);
  const manifest = projectArchiveManifestSchema.parse({ schemaVersion: snapshot.schemaVersion, databaseSha256: snapshot.databaseSha256, redactedTables: snapshot.redactedTables, redactedRowCount: snapshot.redactedRowCount, counts: snapshot.counts, formatVersion: 1, exportedAt: new Date().toISOString(), appVersion: "test", databaseFileName: "storymapper.sqlite", dataClassification: "business-data", includedFolders: [] });
  expect(validateArchiveDatabase(snapshot.snapshotPath, manifest)).toBe(data.project.id);
  const portable = openStoryMapperDb(snapshot.snapshotPath);
  try {
    portable.$client.prepare("INSERT INTO external_refs (id, entity_type, entity_id, system, external_id, scope_id, synced_version, created_at) VALUES (?, 'release', ?, ?, ?, ?, 1, ?)").run(randomUUID(), release.id, extensionProviderId, canonicalWorkItemId(data.connection.provider, extensionIdentity("milestone", 1)), data.map.id, new Date().toISOString());
    expect(() => validateArchiveDatabase(snapshot.snapshotPath, manifest)).toThrow("unredacted GitHub external references");
  } finally { portable.$client.close(); rmSync(snapshot.snapshotPath); }
});
