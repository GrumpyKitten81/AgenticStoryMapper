import { initializeSampleFixture } from "@storymapper/db/fixtures/sample-story-map";
import { reviewedPushProviderFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { remoteReadFixture } from "@storymapper/server/fixtures/remote-read";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSourceDocumentSummaries } from "@storymapper/core";
import { changeSetSchema, changeOperationSchema, type ChangeSet, type StoryMapSnapshot, type RemoteIssuePayload, type ImportSourceDocumentResponse } from "@storymapper/contracts";
import { buildGitHubIssueBody } from "@storymapper/core";
import { rejectSqliteWrite } from "@storymapper/db/test-fixtures/sqlite-write-failure";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createWorkItemProvider, type RemoteWorkItem } from "@storymapper/github";
import { createRoutes } from "@storymapper/server/http/routes";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";
import { hashText, importWorkItems, syncWorkItems } from "@storymapper/server/services/work-item-sync";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({
  resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })),
  resolveGitHubAuth: vi.fn(async (connection) => ({ connection, auth: {} })),
  githubCredentialStatuses: vi.fn(async () => [])
}));

const cleanup: Array<() => Promise<void>> = [];
const actor = { actorType: "system", actorId: "fixture" } as const;
const remote: RemoteWorkItem = {
  remoteId: "19", remoteNumber: 19, title: "Remote story", body: "Remote description",
  state: "open", labels: ["status:todo"], url: "https://github.com/fixture/repo/issues/19"
};

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-actor-http-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const project = unitOfWork.run(actor, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Actor boundaries" }));
  const storyMapId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id)).sampleStoryMapId!;
  unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(project.id, { agentMode: "apply", github: true }));
  unitOfWork.run(actor, ({ repository }) => repository.upsertProductContext({ projectId: project.id, storyMapId }));
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  cleanup.push(async () => { await server.close(); handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  return { server, handle, repository, unitOfWork, project, storyMapId, databasePath };
}

function state(repository: StoryMapperRepository, storyMapId: string) {
  const snapshot = repository.getStoryMapSnapshot(storyMapId)!;
  return { snapshot, versions: snapshot.cards.map((card) => repository.listCardHistory(card.id)), activity: repository.listActivity(snapshot.storyMap.projectId) };
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe("actor-aware server transaction boundaries", () => {
  registerRejectsNonActivityParkingAsAPublicInputError();

  registerReadsAnActualSourceFileBeforeEnteringTheUnit();

  registerRejectsAnUnreadableSourceFileBeforeTheUnitOf();

  registerRejectsUnsupportedSourceFormatsWithTheSupportedFormatList();

  registerReturnsAllFiveRootCountersThroughHTTPAndMCP();

  registerProducesIntegerProposalTokensAndConflictsAtomicallyAfterA();

  registerAppliesFreshRepeatedCardTokensThroughS();

  registerExposesCurrentCardCountersInSOperations();

  registerProtectsAProposedReleaseAndAssignmentsWithCardTokens();

  it.each([0, -1, 1.5, "1", null])("rejects invalid concurrency token %s", (baseVersion) => {
    expect(changeOperationSchema.safeParse({ operationId: "fixture-operation-2", op: "update", entity: "card", entityId: "card", after: { title: "Valid patch" }, baseVersion }).success).toBe(false);
  });

  it("rejects timestamp concurrency tokens", () => {
    expect(changeOperationSchema.safeParse({ operationId: "fixture-operation-3", op: "update", entity: "card", entityId: "card", after: { title: "Valid patch" }, baseUpdatedAt: "2026-10-04T00:00:00.000Z" }).success).toBe(false);
  });

  registerAttributesHumanHTTPCardVersionsAndEventsAndRolls();


  registerAttributesAllEightHumanHTTPCardActionsIncludingThe();

  registerAttributesProtectedMCPProposalsAndCallAuditToThe();

  registerRequiresMCPIdentityAndAttributesExecutorWritesWithIts();

  registerExistingHTTPRoutesAndMCPRegistryReadAndWrite();

  registerImportsAndSyncsWithTheInitiatingActorWithReadOnly();


  registerAttributesIncomingRemoteConflictResolutionToGithubAndRolls();

  registerConfirmsTheExactLocalConflictPlanOutsideTransactionsAnd();

  registerPersistsSChangeSetConflictsSeparatelyWithoutPartialCardWrites();

});

function registerPersistsSChangeSetConflictsSeparatelyWithoutPartialCardWrites() {
  it.each(["http", "mcp"] as const)("persists %s ChangeSet conflicts separately without partial Card writes", async (caller) => {
    const { server, repository, unitOfWork, project, storyMapId } = await fixture();
    const cards = repository.listCards(storyMapId);
    const changeSet = unitOfWork.run(actor, ({ repository }) => repository.createChangeSet({
      id: randomUUID(), projectId: project.id, title: "Conflicting proposal", source: "mcp", status: "proposed", createdAt: new Date().toISOString(),
      operations: [
        { operationId: "fixture-operation-4", op: "update", entity: "card", entityId: cards[0]!.id, after: { title: "Should roll back" } },
        { operationId: "fixture-operation-5", op: "update", entity: "card", entityId: cards[1]!.id, after: { title: "Stale" }, baseVersion: 999 }
      ]
    }));
    unitOfWork.run({ actorType: "human", actorId: "fixture-reviewer" }, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"));
    const beforeCards = repository.listCards(storyMapId);
    const beforeVersions = cards.map((card) => repository.listCardHistory(card.id));
    const beforeEvents = repository.listActivity(project.id).filter((event) => event.action.startsWith("card."));
    if (caller === "http") {
      expect((await server.inject({ method: "POST", url: `/api/changesets/${changeSet.id}/apply`, payload: {} })).statusCode).toBe(409);
    } else {
      const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "conflict-host", mcpSessionId: "conflict-session" });
      await expect(registry.call("ApplyChangeSet", { changeSetId: changeSet.id, approvalToken: "local-approval" })).rejects.toThrow("conflict");
    }
    expect(repository.getChangeSet(changeSet.id)?.status).toBe("conflict");
    expect(repository.listCards(storyMapId)).toEqual(beforeCards);
    expect(cards.map((card) => repository.listCardHistory(card.id))).toEqual(beforeVersions);
    expect(repository.listActivity(project.id).filter((event) => event.action.startsWith("card."))).toEqual(beforeEvents);
    expect(repository.listActivity(project.id).find((event) => event.action === "changeSet.conflict" && event.affectedEntityId === changeSet.id)?.actor).toBe(caller === "http" ? "local-user" : "conflict-host");
  });
}

function registerConfirmsTheExactLocalConflictPlanOutsideTransactionsAnd() {
  it("confirms the exact local conflict plan outside transactions and resumes retained success after binding failure", async () => {
    const { server, handle, repository, unitOfWork, storyMapId, card, conflict, connection, url } = await conflictFixture();
    unitOfWork.run(actor, ({ repository }) => {
      repository.updateCard(card.id, { cardType: "story" });
      repository.updateConnectorConnection(connection.id, { issueTypeMapping: [{ cardType: "story", issueType: "Task" }] });
    });
    let currentRemote = { ...remote, issueType: "Task" };
    const writeRemoteIssue = vi.fn(async (_connection, _auth, payload: RemoteIssuePayload) => {
      expect(handle.current.$client.inTransaction).toBe(false);
      currentRemote = { ...currentRemote, title: payload.title, body: payload.body, labels: payload.labels, state: payload.remoteState, issueType: payload.issueType };
      return currentRemote;
    });
    vi.mocked(createWorkItemProvider).mockReturnValue({ ...reviewedPushProviderFixture(), readPushInputs: vi.fn(async () => ({ issueTypes: ["Task"], labels: ["status:todo"], writable: true, milestones: [] })), findRemoteItemsByMarker: vi.fn(async () => ({ complete: true as const, matches: [] })), writeRemoteIssue, validateConnection: vi.fn(), listRemoteItems: vi.fn(), createOrUpdateRemoteItem: vi.fn(), getRemoteItem: vi.fn(async () => remoteReadFixture(currentRemote)) });
    const beforeCard = repository.getCardDetails(card.id);
    const beforeLink = repository.listRemoteWorkItemLinksForStoryMap(storyMapId).find((link) => link.connectionId === connection.id);
    const beforeConflict = repository.getSyncConflict(conflict.id);
    const prepared = await server.inject({ method: "POST", url, payload: { storyMapId, resolution: "local", reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } } });
    expect(prepared.statusCode).toBe(200);
    const { plan } = prepared.json();
    expect(plan.blockers).toEqual([]);
    expect(writeRemoteIssue).not.toHaveBeenCalled();
    expect(repository.getSyncConflict(conflict.id)).toEqual(beforeConflict);
    handle.current.$client.exec("CREATE TRIGGER reject_local_conflict_link BEFORE UPDATE ON remote_work_item_links BEGIN SELECT RAISE(ABORT, 'Local conflict link rejected'); END");
    const confirmed = await server.inject({ method: "POST", url: "/api/sync/work-items/confirm", payload: { planId: plan.id } });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().execution).toMatchObject({ status: "interrupted", items: [{ state: "local_failed", remoteId: remote.remoteId, url: remote.url }] });
    const read = await server.inject({ method: "GET", url: `/api/sync/work-items/plans/${plan.id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(repository.getRemotePushPlan(plan.id));
    expect((await server.inject({ method: "GET", url: `/api/sync/work-items/plans/${randomUUID()}` })).statusCode).toBe(404);
    expect(repository.getCardDetails(card.id)).toEqual(beforeCard);
    expect(repository.listRemoteWorkItemLinksForStoryMap(storyMapId).find((link) => link.connectionId === connection.id)).toEqual(beforeLink);
    expect(repository.getSyncConflict(conflict.id)).toEqual(beforeConflict);
    handle.current.$client.exec("DROP TRIGGER reject_local_conflict_link");
    const resumed = await server.inject({ method: "POST", url: "/api/sync/work-items/resume", payload: { planId: plan.id } });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().execution.status).toBe("completed");
    expect(writeRemoteIssue).toHaveBeenCalledTimes(1);
    expect(writeRemoteIssue.mock.calls[0]![2]).toEqual(plan.items[0].payload);
    expect(repository.getSyncConflict(conflict.id)?.status).toBe("resolved-local");
    expect(repository.getCardDetails(card.id)?.title).toBe(card.title);
  });
}

function registerAttributesIncomingRemoteConflictResolutionToGithubAndRolls() {
  it("attributes incoming remote conflict resolution to github and rolls back Card/link/conflict together", async () => {
    const { server, handle, repository, storyMapId, card, conflict, connection, url } = await conflictFixture();
    vi.mocked(createWorkItemProvider).mockReturnValue({ ...reviewedPushProviderFixture(), validateConnection: vi.fn(), listRemoteItems: vi.fn(), createOrUpdateRemoteItem: vi.fn(), getRemoteItem: vi.fn(async () => { expect(handle.current.$client.inTransaction).toBe(false); return remoteReadFixture(remote); }) });
    const before = state(repository, storyMapId);
    const beforeConflict = repository.getSyncConflict(conflict.id);
    const restoreConflict = rejectSqliteWrite(handle.current.$client, (sql) => /^update "remote_work_item_links"/i.test(sql), "Conflict link rejected");
    const payload = { storyMapId, resolution: "remote", reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } };
    expect((await server.inject({ method: "POST", url, payload })).statusCode).toBe(500);
    expect(state(repository, storyMapId).snapshot).toEqual(before.snapshot);
    expect(state(repository, storyMapId).versions).toEqual(before.versions);
    expect(repository.listActivity(before.snapshot.storyMap.projectId).filter((event) => event.action === "card.updated")).toEqual(before.activity.filter((event) => event.action === "card.updated"));
    expect(repository.listChangeSets(before.snapshot.storyMap.projectId)).toMatchObject([{ status: "proposed" }]);
    expect(repository.getSyncConflict(conflict.id)).toEqual(beforeConflict);
    restoreConflict();
    expect((await server.inject({ method: "POST", url, payload })).statusCode).toBe(200);
    expect(repository.getCardDetails(card.id)?.title).toBe(remote.title);
    expect(repository.listCardHistory(card.id).at(-1)).toMatchObject({ actorType: "github", actor: "local-user" });
    expect(repository.getSyncConflict(conflict.id)?.status).toBe("resolved-remote");
    expect(repository.listRemoteWorkItemLinksForStoryMap(storyMapId).find((link) => link.connectionId === connection.id)?.syncState).toBe("unsynced");
  });
}

function registerImportsAndSyncsWithTheInitiatingActorWithReadOnly() {
  it.each([true, false])("imports and syncs with the initiating actor with readOnly=%s and remote I/O outside transactions", async (readOnly) => {
    const { handle, repository, unitOfWork, project, storyMapId } = await fixture();
    const connection = unitOfWork.run(actor, ({ repository }) => repository.createConnectorConnection({ projectId: project.id, name: "GitHub", provider: "github", owner: "fixture", repository: "repo", authMode: "token", readOnly }));
    const provider = {
      ...reviewedPushProviderFixture(), validateConnection: vi.fn(), createOrUpdateRemoteItem: vi.fn(),
      listRemoteItems: vi.fn(async () => { expect(handle.current.$client.inTransaction).toBe(false); return [remote]; }),
      getRemoteItem: vi.fn(async () => { expect(handle.current.$client.inTransaction).toBe(false); return remoteReadFixture({ ...remote, title: "Changed remotely" }); })
    };
    vi.mocked(createWorkItemProvider).mockReturnValue(provider);
    const domainState = () => { const value = state(repository, storyMapId); return { ...value, activity: value.activity.filter((event) => !event.action.startsWith("changeSet.")) }; };
    const before = domainState();
    const restoreImport = rejectSqliteWrite(handle.current.$client, (sql) => /^insert into "card_versions"/i.test(sql), "Import version rejected");
    await expect(importWorkItems(repository, unitOfWork, actor, { storyMapId, connectionId: connection.id })).rejects.toMatchObject({ code: "internal" });
    expect(domainState()).toEqual(before);
    restoreImport();
    const imported = await importWorkItems(repository, unitOfWork, actor, { storyMapId, connectionId: connection.id });
    expect(imported).toMatchObject({ outcome: "applied" });
    const cardId = repository.listRemoteWorkItemLinksForStoryMap(storyMapId).find((link) => link.remoteId === remote.remoteId)!.cardId!;
    expect(repository.listCardHistory(cardId).at(-1)).toMatchObject({ actorType: "github", actor: actor.actorId });
    const linked = repository.listRemoteWorkItemLinksForStoryMap(storyMapId).find((link) => link.cardId === cardId)!;
    expect(linked.titleHash).toBe(hashText(remote.title));
    const beforeSync = domainState();
    const restoreSync = rejectSqliteWrite(handle.current.$client, (sql) => /^update "remote_work_item_links"/i.test(sql), "Sync link rejected");
    await expect(syncWorkItems(repository, unitOfWork, actor, { localOrigin: "http://127.0.0.1:4317", storyMapId, connectionId: connection.id })).rejects.toMatchObject({ code: "internal" });
    expect(domainState()).toEqual(beforeSync);
    restoreSync();
    await syncWorkItems(repository, unitOfWork, actor, { localOrigin: "http://127.0.0.1:4317", storyMapId, connectionId: connection.id });
    expect(repository.getCardDetails(cardId)?.title).toBe("Changed remotely");
    expect(repository.listCardHistory(cardId).at(-1)).toMatchObject({ actorType: "github", actor: actor.actorId });
    expect(repository.listActivity(project.id).find((event) => event.action === "changeSet.operation.applied" && JSON.stringify(event.after).includes(cardId))).toMatchObject({ actorType: "github", actor: actor.actorId });
  });
}

function registerExistingHTTPRoutesAndMCPRegistryReadAndWrite() {
  it("existing HTTP routes and MCP registry read and write the replacement database", async () => {
    const { server, handle, repository, unitOfWork, project, databasePath } = await fixture();
    const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "replacement-host" });
    const old = handle.current;
    const replacement = openStoryMapperDb(join(dirname(databasePath), "replacement.sqlite"));
    handle.current = replacement;
    cleanup.push(async () => { old.$client.close(); });
    const newProject = unitOfWork.run(actor, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Replacement" }));
    unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(newProject.id, { agentMode: "apply" }));
    const storyMapId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, newProject.id)).sampleStoryMapId!;
    expect((await server.inject("/api/projects")).json().projects.map((entry: { id: string; }) => entry.id)).toEqual([newProject.id]);
    expect((await registry.call("ListProjects", {})).data).toMatchObject({ projects: [{ id: newProject.id }] });
    expect((await server.inject({ method: "POST", url: "/api/cards", payload: { storyMapId, level: "activity", title: "Replacement HTTP" } })).statusCode).toBe(201);
    await registry.call("CreateStoryMapCard", { storyMapId, level: "activity", title: "Replacement MCP" });
    expect(repository.listCards(storyMapId).map((card) => card.title)).toEqual(expect.arrayContaining(["Replacement HTTP", "Replacement MCP"]));
    expect(old.$client.prepare("SELECT name FROM projects WHERE id = ?").get(project.id)).toEqual({ name: "Actor boundaries" });
    expect(old.$client.prepare("SELECT count(*) AS count FROM cards").get()).toEqual({ count: 3 });
  });
}

function registerRequiresMCPIdentityAndAttributesExecutorWritesWithIts() {
  it("requires MCP identity and attributes executor writes with its host/session while preserving MCP provenance", async () => {
    const { handle, repository, unitOfWork, project, storyMapId } = await fixture();
    expect(() => createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: " " })).toThrow();
    const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "agent-host", mcpSessionId: "session-7" });
    const result = await registry.call("CreateStoryMapCard", { storyMapId, level: "activity", title: "Agent Card" });
    expect(result).toMatchObject({ outcome: "applied", changeSetId: result.changeSet?.id, previewRef: { changeSetId: result.changeSet?.id } });
    const card = repository.getCard(result.changeSet!.execution!.operationResults[0]!.entityIds[0]!)!;
    const expected = { actorType: "agent", actor: "agent-host", mcpSessionId: "session-7" };
    expect(repository.listCardHistory(card.id).at(-1)).toMatchObject(expected);
    expect(repository.listActivity(project.id).find((event) => event.action === "changeSet.operation.applied" && event.affectedEntityId === result.changeSet!.operations[0]!.operationId)).toMatchObject({ ...expected, after: expect.objectContaining({ changes: expect.arrayContaining([expect.objectContaining({ entity: "card", entityId: card.id })]) }) });
    expect(handle.current.$client.prepare("SELECT creation_source FROM cards WHERE id = ?").get(card.id)).toEqual({ creation_source: "changeset" });
    expect(repository.getChangeSet(result.changeSetId!)).toMatchObject({ source: "mcp", status: "applied" });
    expect(card.creationOrigin).toBe("inference");
    const beforeCards = repository.listCards(storyMapId);
    const beforeHistory = repository.listCardHistory(card.id);
    const restoreMcp = rejectSqliteWrite(handle.current.$client, (sql) => /^update "card_versions"/i.test(sql), "MCP version rejected");
    await expect(registry.call("UpdateStoryMapCard", { cardId: card.id, baseVersion: repository.getCard(card.id)!.version, patch: { title: "Rejected" } })).rejects.toMatchObject({ code: "internal", message: "An internal error occurred.", details: { errorId: expect.any(String) } });
    restoreMcp();
    expect(repository.listCards(storyMapId)).toEqual(beforeCards);
    expect(repository.listCardHistory(card.id)).toEqual(beforeHistory);
    expect(repository.listActivity(project.id).filter((event) => event.action === "changeSet.operation.applied" && (event.after as { changes: Array<{ entityId: string; }>; }).changes.some((change) => change.entityId === card.id))).toHaveLength(1);
    expect(repository.listActivity(project.id).find((event) => event.action === "tool_call" && event.affectedEntityId === "UpdateStoryMapCard")).toMatchObject({ after: expect.objectContaining({ outcome: "error" }) });
  });
}

function registerAttributesProtectedMCPProposalsAndCallAuditToThe() {
  it("attributes protected MCP proposals and call audit to the explicitly supplied host/session", async () => {
    const { repository, unitOfWork, project, storyMapId, databasePath } = await fixture();
    unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(project.id, { agentMode: "propose" }));
    const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "denied-host", mcpSessionId: "denied-session" });
    const beforeCards = repository.listCards(storyMapId);
    const beforeHistory = beforeCards.map((card) => repository.listCardHistory(card.id));
    const result = await registry.call("CreateStoryMapCard", { storyMapId, level: "activity", title: "Reviewed agent Card" });
    expect(result).toMatchObject({ outcome: "proposed", changeSetId: result.changeSet?.id, previewRef: { changeSetId: result.changeSet?.id }, changeSet: { proposedBy: { actorType: "agent", actorId: "denied-host", mcpSessionId: "denied-session" } } });
    expect(repository.getChangeSet(result.changeSetId!)).toMatchObject({ status: "proposed", proposedBy: { actorType: "agent", actorId: "denied-host", mcpSessionId: "denied-session" } });
    expect(existsSync(join(dirname(databasePath), "snapshots"))).toBe(false);
    expect(repository.listCards(storyMapId)).toEqual(beforeCards);
    expect(beforeCards.map((card) => repository.listCardHistory(card.id))).toEqual(beforeHistory);
    expect(repository.listActivity(project.id).find((event) => event.action === "tool_call" && event.affectedEntityId === "CreateStoryMapCard")).toMatchObject({ actorType: "agent", actor: "denied-host", mcpSessionId: "denied-session", after: expect.objectContaining({ outcome: "ok" }) });
  });
}

function registerAttributesAllEightHumanHTTPCardActionsIncludingThe() {
  it("attributes all eight human HTTP Card actions including the durable deletion version", async () => {
    const { server, handle, repository, project, storyMapId } = await fixture();
    const expected = { actorType: "human", actor: "local-user" };
    const created = await server.inject({ method: "POST", url: "/api/cards", payload: { storyMapId, level: "activity", title: "All human actions" } });
    expect(created.statusCode).toBe(201);
    const cardId = created.json<{ id: string; }>().id;
    const latestVersion = () => handle.current.$client.prepare("SELECT actor, actor_type AS actorType, version FROM card_versions WHERE card_id = ? ORDER BY version DESC LIMIT 1").get(cardId);
    expect(latestVersion()).toMatchObject({ ...expected, version: 1 });
    expect(repository.listActivity(project.id).find((event) => event.action === "card.created" && event.affectedEntityId === cardId)).toMatchObject(expected);
    const actions = [
      { method: "PATCH", path: `/api/cards/${cardId}`, payload: { title: "Updated human Card" }, action: "card.updated" },
      { method: "POST", path: `/api/cards/${cardId}/move`, payload: { parentId: null, position: 0 }, action: "card.moved" },
      { method: "POST", path: `/api/cards/${cardId}/park`, payload: { childStrategy: "unassign" }, action: "card.parked" },
      { method: "POST", path: `/api/cards/${cardId}/unpark`, payload: {}, action: "card.unparked" },
      { method: "PATCH", path: "/api/cards/bulk", payload: { storyMapId, patch: { color: "#eef6ff" } }, action: "card.bulkUpdated" },
      { method: "POST", path: `/api/cards/${cardId}/archive`, payload: {}, action: "card.archived" },
      { method: "PATCH", path: `/api/cards/${cardId}`, payload: { status: "active" }, action: "card.updated" },
      { method: "POST", path: `/api/cards/${cardId}/delete`, payload: { strategy: "unassign" }, action: "card.deleted" }
    ] as const;
    for (const [index, action] of actions.entries()) {
      const baseVersion = repository.getCardDetails(cardId)!.version;
      const payload = action.path === "/api/cards/bulk" ? { ...action.payload, cards: [{ id: cardId, baseVersion }] } : { ...action.payload, baseVersion };
      const response = await server.inject({ method: action.method, url: action.path, payload });
      expect(response.statusCode, action.action).toBe(200);
      expect(latestVersion(), action.action).toMatchObject({ ...expected, version: index + 2 });
      expect(repository.listActivity(project.id).find((event) => event.action === action.action && event.affectedEntityId === cardId), action.action).toMatchObject(expected);
    }
    expect(repository.getCardDetails(cardId)).toBeUndefined();
  });
}

function registerAttributesHumanHTTPCardVersionsAndEventsAndRolls() {
  it("attributes human HTTP Card versions and events and rolls back a failed audit", async () => {
    const { server, handle, repository, storyMapId } = await fixture();
    const created = await server.inject({ method: "POST", url: "/api/cards", payload: { storyMapId, level: "activity", title: "Human Card" } });
    expect(created.statusCode).toBe(201);
    const card = created.json();
    expect(repository.listCardHistory(card.id).at(-1)).toMatchObject({ actorType: "human", actor: "local-user" });
    expect(repository.listActivity().find((event) => event.affectedEntityId === card.id)).toMatchObject({ actorType: "human", actor: "local-user" });
    const before = state(repository, storyMapId);
    handle.current.$client.exec("CREATE TRIGGER reject_http_audit BEFORE INSERT ON activity_events WHEN NEW.action = 'card.updated' BEGIN SELECT RAISE(ABORT, 'HTTP audit rejected'); END");
    const rejected = await server.inject({ method: "PATCH", url: `/api/cards/${card.id}`, payload: { title: "Rejected title", baseVersion: card.version } });
    expect(rejected.statusCode).toBe(500);
    expect(state(repository, storyMapId)).toEqual(before);
  });
}

function registerProtectsAProposedReleaseAndAssignmentsWithCardTokens() {
  it("protects a proposed Release and assignments with Card tokens when the map has no Releases", async () => {
    const { server, repository, unitOfWork, project } = await fixture();
    const { map, cards } = unitOfWork.run(actor, ({ repository }) => {
      const map = repository.createStoryMap({ projectId: project.id, name: "No Releases" });
      const cards = ["First story", "Second story"].map((title) => repository.createCard({ storyMapId: map.id, level: "story", title }));
      return { map, cards };
    });
    expect(repository.listReleases(map.id)).toEqual([]);
    const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "release-proposal-host", mcpSessionId: "release-session" });
    const { changeSet } = await registry.call("ProposeReleaseSlice", { storyMapId: map.id, releaseTarget: { kind: "new" } });
    expect(changeSet!.operations.filter((operation) => operation.op === "create")).toMatchObject([{ entity: "release" }]);
    expect(changeSetSchema.parse(changeSet)).toEqual(changeSet);
    const updates = changeSet!.operations.filter((operation) => operation.op === "update");
    expect(updates).toHaveLength(cards.length);
    for (const operation of updates) {
      expect(operation.baseVersion).toBe(cards.find((card) => card.id === operation.entityId)!.version);
      expect(operation.after).toEqual({ releaseId: "proposed-release-1" });
    }
    unitOfWork.run(actor, ({ repository }) => repository.archiveCard(updates[0]!.entityId));
    const approved = await server.inject({ method: "POST", url: `/api/changesets/${changeSet!.id}/approve`, payload: {} });
    expect(approved.statusCode).toBe(200);
    const beforeCards = repository.listCards(map.id);
    const beforeHistory = cards.map((card) => repository.listCardHistory(card.id));
    const beforeReleases = repository.listActivity(project.id).filter((event) => event.action === "release.created");
    await expect(registry.call("ApplyChangeSet", { changeSetId: changeSet!.id, approvalToken: "local-approval" })).rejects.toThrow("conflict");
    expect(repository.getChangeSet(changeSet!.id)?.status).toBe("conflict");
    expect(repository.listReleases(map.id)).toEqual([]);
    expect(repository.listCards(map.id)).toEqual(beforeCards);
    expect(repository.listCards(map.id).every((card) => card.releaseId === null)).toBe(true);
    expect(cards.map((card) => repository.listCardHistory(card.id))).toEqual(beforeHistory);
    expect(repository.listActivity(project.id).filter((event) => event.action === "release.created")).toEqual(beforeReleases);
  });
}

function registerExposesCurrentCardCountersInSOperations() {
  it.each(["ProposeBacklogGrooming", "ProposeReleaseSlice"] as const)("exposes current Card counters in %s operations", async (tool) => {
    const { repository, unitOfWork, storyMapId } = await fixture();
    const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "proposal-reader" });
    const result = await registry.call(tool, tool === "ProposeReleaseSlice" ? { storyMapId, releaseTarget: { kind: "new" } } : { storyMapId });
    expect(changeSetSchema.parse(result.changeSet)).toEqual(result.changeSet);
    const operations = result.changeSet!.operations.filter((operation) => operation.op === "update");
    expect(operations.length).toBeGreaterThan(0);
    for (const operation of operations) {
      expect(operation.baseVersion).toBe(repository.getCardDetails(operation.entityId)?.version);
      expect(operation).not.toHaveProperty("baseUpdatedAt");
    }
  });
}

function registerAppliesFreshRepeatedCardTokensThroughS() {
  it.each(["http", "mcp"] as const)("applies fresh repeated Card tokens through %s", async (caller) => {
    const { server, repository, unitOfWork, project, storyMapId } = await fixture();
    const card = repository.listCards(storyMapId).find((card) => card.level === "story")!;
    const changeSet = unitOfWork.run(actor, ({ repository }) => repository.createChangeSet({
      id: randomUUID(), projectId: project.id, title: "Fresh integer tokens", source: "mcp", status: "proposed", createdAt: new Date().toISOString(),
      operations: [{ title: "First public edit" }, { description: "Second public edit" }].map((after, index) => ({ operationId: `fixture-operation-${index}`, op: "update", entity: "card", entityId: card.id, baseVersion: card.version, after }))
    }));
    unitOfWork.run({ actorType: "human", actorId: "fixture-reviewer" }, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"));
    if (caller === "http") {
      expect((await server.inject({ method: "POST", url: `/api/changesets/${changeSet.id}/apply`, payload: {} })).statusCode).toBe(200);
    } else {
      const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "fresh-token-host", mcpSessionId: "fresh-token-session" });
      await registry.call("ApplyChangeSet", { changeSetId: changeSet.id, approvalToken: "local-approval" });
    }
    expect(repository.getCardDetails(card.id)).toMatchObject({ title: "First public edit", description: "Second public edit", version: card.version + 1 });
    expect(repository.listCardHistory(card.id).at(-1)).toMatchObject({ version: card.version + 1, snapshot: { title: "First public edit", description: "Second public edit", version: card.version + 1 } });
    expect(repository.getChangeSet(changeSet.id)?.status).toBe("applied");
  });
}

function registerProducesIntegerProposalTokensAndConflictsAtomicallyAfterA() {
  it("produces integer proposal tokens and conflicts atomically after a structural Card edit", async () => {
    const { server, repository, unitOfWork, project, storyMapId } = await fixture();
    const card = repository.listCards(storyMapId).find((card) => card.level === "story")!;
    const response = await server.inject({ method: "POST", url: "/api/ai/proposals", payload: { projectId: project.id, storyMapId, templateId: "acceptance-criteria", cardIds: [card.id] } });
    expect(response.statusCode).toBe(201);
    const { changeSet } = response.json<{ changeSet: ChangeSet; }>();
    expect(changeSet.operations).toHaveLength(1);
    expect(changeSet.operations[0]?.baseVersion).toBe(card.version);
    expect(changeSet.operations[0]).not.toHaveProperty("baseUpdatedAt");
    unitOfWork.run(actor, ({ repository }) => repository.archiveCard(card.id));
    await server.inject({ method: "POST", url: `/api/changesets/${changeSet.id}/approve`, payload: {} });
    const before = state(repository, storyMapId);
    expect((await server.inject({ method: "POST", url: `/api/changesets/${changeSet.id}/apply`, payload: {} })).statusCode).toBe(409);
    expect(state(repository, storyMapId).snapshot).toEqual(before.snapshot);
    expect(state(repository, storyMapId).versions).toEqual(before.versions);
    expect(repository.getChangeSet(changeSet.id)?.status).toBe("conflict");
  });
}

function registerReturnsAllFiveRootCountersThroughHTTPAndMCP() {
  it("returns all five root counters through HTTP and MCP reads", async () => {
    const { server, repository, unitOfWork, project } = await fixture();
    const mapResponse = await server.inject({ method: "POST", url: "/api/story-maps", payload: { projectId: project.id, name: "Versioned public roots" } });
    const map = mapResponse.json<{ id: string; version: number; }>();
    expect(mapResponse.statusCode).toBe(201);
    expect(map.version).toBe(1);
    const roots = [
      ["/api/cards", { storyMapId: map.id, level: "story", title: "Public Card" }],
      ["/api/releases", { storyMapId: map.id, name: "Public Release" }],
      ["/api/personas", { projectId: project.id, storyMapId: map.id, name: "Public Persona" }],
      ["/api/roadmaps", { projectId: project.id, storyMapId: map.id, name: "Public Roadmap" }]
    ] as const;
    for (const [url, payload] of roots) {
      const response = await server.inject({ method: "POST", url, payload });
      expect(response.statusCode).toBe(201);
      expect(response.json<{ version: number; }>().version).toBe(1);
    }
    const response = await server.inject({ method: "GET", url: `/api/story-maps/${map.id}` });
    expect(response.statusCode).toBe(200);
    const snapshot = response.json<StoryMapSnapshot>();
    for (const root of [snapshot.storyMap, ...snapshot.cards, ...snapshot.releases, ...snapshot.personas, ...snapshot.roadmaps]) expect(root.version).toBe(1);
    const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "counter-reader", mcpSessionId: "read-session" });
    const mcp = await registry.call("GetStoryMapData", { storyMapId: map.id });
    expect(mcp.data).toMatchObject({ storyMap: snapshot.storyMap, cards: snapshot.cards, releases: snapshot.releases, personas: snapshot.personas, roadmaps: snapshot.roadmaps });
    expect(repository.getCardDetails(snapshot.cards[0]!.id)?.version).toBe(1);
  });
}

function registerRejectsUnsupportedSourceFormatsWithTheSupportedFormatList() {
  it("rejects unsupported source formats with the supported format list", async () => {
    const { server, repository, project } = await fixture();
    const response = await server.inject({ method: "POST", url: "/api/source-documents/import", payload: { projectId: project.id, title: "Unsupported", type: "docx", content: "Document" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation", details: { issues: [expect.objectContaining({ message: expect.stringContaining("markdown") })] } });
    expect(repository.listSourceDocumentSummaryData(project.id)).toEqual([]);
  });
}

function registerRejectsAnUnreadableSourceFileBeforeTheUnitOf() {
  it("rejects an unreadable source file before the unit of work without database changes", async () => {
    const { server, handle, repository, unitOfWork, project, storyMapId } = await fixture();
    const before = { map: state(repository, storyMapId), sources: buildSourceDocumentSummaries(repository.listSourceDocumentSummaryData(project.id)) };
    const entering = vi.spyOn(unitOfWork, "run");
    const response = await server.inject({ method: "POST", url: "/api/source-documents/import", payload: { projectId: project.id, title: "Missing file", type: "txt", filePath: join(dirname(handle.current.$client.name), "missing.txt") } });
    expect(response.statusCode).toBe(500);
    expect(response.json().message).toContain("ENOENT");
    expect(entering).not.toHaveBeenCalled();
    expect(handle.current.$client.inTransaction).toBe(false);
    expect({ map: state(repository, storyMapId), sources: buildSourceDocumentSummaries(repository.listSourceDocumentSummaryData(project.id)) }).toEqual(before);
    entering.mockRestore();
  });
}

function registerReadsAnActualSourceFileBeforeEnteringTheUnit() {
  it("reads an actual source file before entering the unit of work and preserves prepared content and file provenance", async () => {
    const { server, handle, repository, unitOfWork, project } = await fixture();
    const filePath = join(dirname(handle.current.$client.name), "source.md");
    const content = "# Imported requirement\n\nKeep local changes atomic.\n\n## Nested heading\n\nPreserve heading provenance.";
    writeFileSync(filePath, content);
    const run = unitOfWork.run.bind(unitOfWork);
    const entering = vi.spyOn(unitOfWork, "run").mockImplementation((actor, fn) => {
      expect(handle.current.$client.inTransaction).toBe(false);
      rmSync(filePath);
      return run(actor, fn);
    });
    const response = await server.inject({ method: "POST", url: "/api/source-documents/import", payload: { projectId: project.id, title: "File requirements", type: "markdown", filePath } });
    expect(response.statusCode).toBe(201);
    expect(entering).toHaveBeenCalledOnce();
    const imported = response.json<ImportSourceDocumentResponse>();
    expect(imported.status).toBe("imported");
    expect(imported.document).toMatchObject({ filePath, fileHash: createHash("sha256").update(content).digest("hex") });
    expect(imported.chunks.map((chunk) => chunk.text).join("\n")).toContain("Keep local changes atomic.");
    expect(repository.getSourceDocumentDetails(imported.document.id)).toMatchObject({ document: { filePath }, chunks: [
      { heading: "Imported requirement > Nested heading", locator: "Imported requirement > Nested heading#2", text: "Preserve heading provenance." },
      { heading: "Imported requirement", locator: "Imported requirement#1", text: "Keep local changes atomic." }
    ] });
    expect(repository.listActivity(project.id).find((event) => event.affectedEntityId === imported.document.id)).toMatchObject({ actor: "local-user", actorType: "human" });
    entering.mockRestore();
    const activityCount = repository.listActivity(project.id).filter((event) => event.action === "sourceDocument.imported").length;
    const repeated = await server.inject({ method: "POST", url: "/api/source-documents/import", payload: { projectId: project.id, title: "Same content", type: "markdown", content } });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({ document: imported.document, chunks: [...imported.chunks].sort((left, right) => left.locator < right.locator ? -1 : 1), status: "unchanged" });
    expect(repository.listActivity(project.id).filter((event) => event.action === "sourceDocument.imported")).toHaveLength(activityCount);
    const inline = await server.inject({ method: "POST", url: "/api/source-documents/import", payload: { projectId: project.id, title: "Inline precedence", type: "txt", filePath, content: "Inline content wins." } });
    expect(inline.statusCode).toBe(201);
    expect(inline.json().document).toMatchObject({ filePath, fileHash: createHash("sha256").update("Inline content wins.").digest("hex") });
  });
}

function registerRejectsNonActivityParkingAsAPublicInputError() {
  it("rejects non-Activity parking as a public input error and preserves the complete snapshot", async () => {
    const { server, repository, unitOfWork, storyMapId } = await fixture();
    const cards = unitOfWork.run(actor, ({ repository }) => (["step", "story", "note"] as const)
      .map((level) => repository.createCard({ storyMapId, level, title: `Reject ${level} parking` })));
    const before = state(repository, storyMapId);
    for (const card of cards) {
      const response = await server.inject({ method: "POST", url: `/api/cards/${card.id}/park`, payload: { childStrategy: "unassign", baseVersion: card.version } });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ code: "validation", message: "Only Activities can be parked." });
      expect(state(repository, storyMapId)).toEqual(before);
    }
    const missing = await server.inject({ method: "POST", url: `/api/cards/${randomUUID()}/unpark`, payload: { baseVersion: 1 } });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ code: "not_found", message: "Card not found." });
  });
}

async function conflictFixture() {
  const context = await fixture();
  const { repository, unitOfWork, project, storyMapId } = context;
  const card = repository.listCards(storyMapId).find((card) => card.level === "story")!;
  const { conflict, connection } = unitOfWork.run(actor, ({ repository }) => {
    const connection = repository.createConnectorConnection({ projectId: project.id, name: "Conflict GitHub", provider: "github", owner: "fixture", repository: "repo", authMode: "token", readOnly: false });
    repository.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", cardId: card.id, remoteId: remote.remoteId, remoteNumber: 19, url: remote.url, labels: remote.labels, syncState: "conflict" });
    const run = repository.createSyncRun({ storyMapId, connectionId: connection.id, mode: "sync", status: "applied" });
    const conflict = repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(card.id)!.storyMapId).find((row) => row.cardId === card.id)!.externalRefId, syncRunId: run.id, connectionId: connection.id, cardId: card.id, remoteId: remote.remoteId, field: "title", localValue: card.title, remoteValue: remote.title });
    return { conflict, connection };
  });
  return { ...context, card, conflict, connection, url: `/api/sync/conflicts/${conflict.id}/resolve` };
}
