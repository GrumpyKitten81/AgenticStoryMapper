import { reviewedPushProviderFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { stripGitHubIssueFooter } from "@storymapper/core";
import { remoteReadFixture } from "@storymapper/server/fixtures/remote-read";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changeOperationSchema, changeSetCommandResponseSchema, type SyncPlan } from "@storymapper/contracts";
import { buildGitHubIssueBody } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createWorkItemProvider, type RemoteWorkItem } from "@storymapper/github";
import { createRoutes } from "@storymapper/server/http/routes";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";
import { getWorkItemSyncHealth } from "@storymapper/server/application/sync/sync.use-cases";
import { syncBaseline, changedFieldsForRemote } from "@storymapper/server/services/sync-merge";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { hashText, importWorkItems, issueLabelsForCard, planWorkItems, pullStoryMapWorkItems, pushWorkItems, syncWorkItems } from "@storymapper/server/services/work-item-sync";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({
  resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })),
  resolveGitHubAuth: vi.fn(async (connection) => ({ connection, auth: {} })),
  githubCredentialStatuses: vi.fn(async () => [])
}));

const ACTOR = { actorType: "human", actorId: "local-user" } as const;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.clearAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-writable-sync-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const data = unitOfWork.run(ACTOR, ({ repository }) => {
    const project = repository.createProject({ name: "Writable sync" });
    repository.updateSafetySettings(project.id, { github: true, agentMode: "apply" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const cards = ["First", "Second"].map((title) => repository.createCard({ storyMapId: map.id, level: "activity", title, description: "Original body" }, "human"));
    const connection = repository.createConnectorConnection({ projectId: project.id, name: "GitHub", provider: "github", owner: "owner", repository: "repo", authMode: "token", readOnly: false });
    return { project, map, cards, connection };
  });
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "push-host", mcpSessionId: "push-session" });
  cleanup.push(async () => { await server.close(); handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const provider = { ...reviewedPushProviderFixture(), validateConnection: vi.fn(), listRemoteItems: vi.fn(), getRemoteItem: vi.fn(), createOrUpdateRemoteItem: vi.fn() };
  vi.mocked(createWorkItemProvider).mockReturnValue(provider);
  return { ...data, localOrigin: () => "http://127.0.0.1:4317", handle, repository, unitOfWork, server, registry, provider };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Payload = SyncPlan["items"][number];

function remoteFor(item: Payload, number = 1): RemoteWorkItem {
  return { remoteId: String(number), remoteNumber: number, title: item.title, body: item.body, state: item.remoteState ?? "open", labels: item.labels, url: `https://github.com/owner/repo/issues/${number}`, milestoneDescription: "", milestoneState: "open", milestone: item.milestone };
}

function rows(data: Fixture, table: string): unknown[] {
  return data.handle.current.$client.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
}

function databaseState(data: Fixture): unknown {
  const tables = data.handle.current.$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
  return tables.map(({ name }) => [name, rows(data, name)]);
}

async function callPush(data: Fixture, caller: "http" | "mcp") {
  const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: data.cards.map((card) => card.id) };
  if (caller === "http") {
    const response = await data.server.inject({ method: "POST", url: "/api/sync/work-items/push", payload: { ...input, confirm: true } });
    if (response.statusCode !== 200) throw new Error(response.json().message);
    return response.json();
  }
  return (await data.registry.call("PushCardsToGitHub", input)).data;
}

function expectRetainedFirst(data: Fixture, final = false): void {
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toMatchObject([{ cardId: data.cards[0]!.id, remoteId: "1", remoteNumber: 1, syncState: "synced" }]);
  expect(data.repository.listGitHubLinksForStoryMap(data.map.id)).toMatchObject([{ cardId: data.cards[0]!.id, issueNumber: 1 }]);
  if (!final) expect(rows(data, "sync_runs")).toEqual([]);
  expect(data.repository.listActivity(data.project.id).filter((event) => event.action === "externalRef.created")).toMatchObject([{ actorType: expect.stringMatching(/human|agent/u) }]);
}

function bodyFor(data: Fixture, card: Fixture["cards"][number]): string {
  return buildGitHubIssueBody(card, data.map.name, { origin: "http://127.0.0.1:4317", projectId: data.project.id });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function linkedFixture(readOnly = false) {
  const data = await fixture();
  const card = data.cards[0]!;
  const labels = issueLabelsForCard(data.connection, card);
  const remote: RemoteWorkItem = { remoteId: "1", remoteNumber: 1, title: card.title, body: bodyFor(data, card), state: "open", labels, url: "https://github.com/owner/repo/issues/1" };
  data.unitOfWork.run(ACTOR, ({ repository }) => {
    if (readOnly) repository.updateConnectorConnection(data.connection.id, { readOnly: true });
    repository.bindRemoteWorkItemLink({ connectionId: data.connection.id, provider: "github", cardId: card.id, remoteId: remote.remoteId, remoteNumber: 1, url: remote.url, titleHash: hashText(card.title), bodyHash: hashText(stripGitHubIssueFooter(remote.body)), remoteState: "open", labels, syncState: "synced" });
  });
  return { ...data, card: data.repository.getCardDetails(card.id)!, remote, linkedHistoryCount: data.repository.listCardHistory(card.id).length };
}

async function replaceWithCopy(data: Fixture) {
  const original = data.handle.current;
  await original.$client.backup(join(dirname(original.$client.name), "replacement.sqlite"));
  data.handle.current = openStoryMapperDb(join(dirname(original.$client.name), "replacement.sqlite"));
  cleanup.push(async () => { original.$client.close(); });
  return original;
}

describe("remote preparation database identity", () => {
  registerRejectsDeferredSResponsesAfterReplacementWithCopiedIdentifiers();

  it.each(["sync", "import", "plan-import", "pull"] as const)("rejects replacement during %s authentication before the provider call", async (mode) => {
    const data = await linkedFixture();
    const auth = await resolveProviderAuth(data.connection);
    const started = deferred<void>();
    const resumed = deferred<typeof auth>();
    vi.mocked(resolveProviderAuth).mockImplementationOnce(() => { started.resolve(); return resumed.promise; });
    const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.card.id] };
    const running = mode === "import" ? importWorkItems(data.repository, data.unitOfWork, ACTOR, input)
      : mode === "plan-import" ? planWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", ...input, mode: "import" })
      : mode === "pull" ? pullStoryMapWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id })
      : syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input, localOrigin: "http://127.0.0.1:4317" });
    await started.promise;
    await replaceWithCopy(data);
    const before = databaseState(data);
    resumed.resolve(auth);
    await expect(running).rejects.toThrow("Database changed during remote preparation");
    expect(data.provider.getRemoteItem).not.toHaveBeenCalled();
    expect(data.provider.listRemoteItems).not.toHaveBeenCalled();
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(databaseState(data)).toEqual(before);
  });
});

describe("reviewed remote-write boundary", () => {
  it("keeps Agent push as a stored proposal without remote writes", async () => {
    const data = await fixture();
    const readPushInputs = vi.fn(async () => ({ issueTypes: ["Task"], labels: ["local-story-map", `story-map:${data.map.cardKeyPrefix}`, "level:activity", "status:todo"], milestones: [], writable: true }));
    const findRemoteItemsByMarker = vi.fn(async () => ({ complete: true as const, matches: [] }));
    vi.mocked(createWorkItemProvider).mockReturnValue({ ...data.provider, readPushInputs, findRemoteItemsByMarker });
    const result = changeSetCommandResponseSchema.parse(await data.registry.call("PushCardsToGitHub", { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: data.cards.map((card) => card.id) }));
    expect(result).toMatchObject({ outcome: "proposed", plan: { mode: "push", items: [{ cardId: data.cards[0]!.id }, { cardId: data.cards[1]!.id }] } });
    expect(resolveProviderAuth).toHaveBeenCalledExactlyOnceWith(data.connection);
    expect(readPushInputs).toHaveBeenCalledTimes(1);
    expect(findRemoteItemsByMarker).toHaveBeenCalledTimes(2);
    expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
    expect(data.provider.writeMilestone).not.toHaveBeenCalled();
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(rows(data, "sync_runs")).toEqual([]);
    expect(changeOperationSchema.parse(data.repository.getChangeSet(result.changeSetId!)?.operations[0]).after).toMatchObject({ dryRunPlan: JSON.parse(JSON.stringify(result.plan)) });
  });

  it("refuses selection-plus-boolean execution through HTTP and the shared service", async () => {
    const data = await fixture();
    const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: data.cards.map((card) => card.id) };
    const before = databaseState(data);
    const response = await data.server.inject({ method: "POST", url: "/api/sync/work-items/push", payload: { ...input, confirm: true } });
    expect(response.statusCode).toBe(400);
    await expect(pushWorkItems(data.repository, data.unitOfWork, ACTOR, input)).rejects.toMatchObject({ code: "validation" });
    expect(resolveProviderAuth).not.toHaveBeenCalled();
    expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(databaseState(data)).toEqual(before);
  });
});

describe("local edits during remote sync", () => {
  it("keeps divergent local titles pending through a read-only refresh of remote state", async () => {
    const data = await linkedFixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Unsent local title" }));
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(data.remote));
    const result = await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id });
    expect(data.repository.getCardDetails(data.card.id)?.title).toBe("Unsent local title");
    expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ titleHash: hashText(data.card.title), syncState: "unsynced" });
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  });

  it("generates the title conflict with its local/remote values and run in the health report", testGeneratesTheTitleConflictWithItsLocalRemoteValuesAndRun);

  it.each([false, true])("retains edits arriving during fetch with readOnly=%s", async (readOnly) => {
    const data = await linkedFixture(readOnly);
    const started = deferred<void>();
    const fetched = deferred<RemoteWorkItem>();
    data.provider.getRemoteItem.mockImplementation(() => {
      expect(data.handle.current.$client.inTransaction).toBe(false);
      started.resolve();
      return fetched.promise.then(remoteReadFixture);
    });
    const running = syncWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id });
    await started.promise;
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Edited during fetch", description: "Unsent body" }));
    fetched.resolve(readOnly ? { ...data.remote, title: "Changed remotely", body: "Remote body" } : data.remote);
    await expect(running).rejects.toMatchObject({ code: "conflict" });
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Edited during fetch", description: "Unsent body" });
    expect(data.repository.listChangeSets(data.project.id)).toEqual([]);
    expect(data.repository.listCardHistory(data.card.id)).toHaveLength(data.linkedHistoryCount);
  });


});

describe("approved sync repairs", () => {
  it("merges incoming remote body while retaining a local title pending review", testMergesIncomingRemoteBodyWhileRetainingALocalTitlePendingReview);

  registerMergesAnIndependentRemoteBodyWhileLeavingADivergent();

  it("clears the removed remote milestone in both the Card and persisted link", testClearsTheRemovedRemoteMilestoneInBothTheCardAndPersisted);

  it("keeps unchanged read-only raw bodies healthy without extra Card versions or Activity", testKeepsUnchangedReadOnlyRawBodiesHealthyWithoutExtraCardVersions);

  registerRejectsAChangedSAfterFetchBeforeAnyOutbound();

  it("uses an idempotent reference/metadata body when an imported body already contains it", async () => {
    const data = await linkedFixture();
    const formatted = buildGitHubIssueBody({ ...data.card, estimate: 3, priority: "high" }, data.map.name, { origin: "http://127.0.0.1:4317", projectId: data.project.id });
    expect(buildGitHubIssueBody({ ...data.card, estimate: 3, priority: "high", description: formatted }, data.map.name, { origin: "http://127.0.0.1:4317", projectId: data.project.id })).toBe(formatted);
    expect(formatted.match(/<!-- storymapper:footer:start -->/gu)).toHaveLength(1);
  });

  it("records a canonical remote conflict resolution baseline that stays healthy on a no-op refresh", testRecordsACanonicalRemoteConflictResolutionBaselineThatStaysHealthyOn);

  it.each(["release-fetch", "map-fetch"] as const)("preserves a dependent %s rename arriving during remote I/O", async (mode) => {
    const data = await linkedFixture();
    const release = data.unitOfWork.run(ACTOR, ({ repository }) => {
      const release = repository.createRelease({ storyMapId: data.map.id, name: "MVP" });
      repository.updateCard(data.card.id, { releaseId: release.id, title: "Local title" });
      repository.upsertRemoteWorkItemLink({ ...repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!, milestone: release.name });
      return release;
    });
    const before = data.repository.getCardDetails(data.card.id);
    const rename = () => data.unitOfWork.run(ACTOR, ({ repository }) => mode.startsWith("release") ? repository.updateRelease(release.id, { name: "Renamed release" }) : repository.updateStoryMap(data.map.id, { name: "Renamed map" }));
    data.provider.getRemoteItem.mockImplementation(async () => { if (mode.endsWith("fetch")) rename(); return remoteReadFixture({ ...data.remote, milestoneDescription: "", milestoneState: "open", milestone: "MVP", body: "Remote body" }); });
    data.provider.createOrUpdateRemoteItem.mockImplementation(async (_connection, _auth, sent: Payload) => { rename(); return remoteFor(sent); });
    await expect(syncWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id })).rejects.toMatchObject({ code: "conflict" });
    expect(data.repository.getCardDetails(data.card.id)).toEqual(before);
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  });
});

describe("GitHub Agent local ChangeSet execution", () => {
  const agent = { actorType: "agent", actorId: "github-host", mcpSessionId: "github-session" } as const;
  registerRefusesDisabledAgentSPlanningBeforeProviderOrBookkeeping(agent);
  registerImportsAReviewedRemoteIssueWithProtectionSAnd(agent);

  it.each([{ agentMode: "off" }, { github: false }] as const)("refuses import after %o while the provider is pending", async (patch) => {
    const data = await fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "apply" }));
    const entered = deferred<void>();
    const resumed = deferred<RemoteWorkItem[]>();
    data.provider.listRemoteItems.mockImplementation(() => { entered.resolve(); return resumed.promise; });
    const pending = importWorkItems(data.repository, data.unitOfWork, agent, { storyMapId: data.map.id, connectionId: data.connection.id });
    await entered.promise;
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, patch));
    const before = databaseState(data);
    resumed.resolve([]);
    await expect(pending).rejects.toMatchObject({ code: "disabled" });
    expect(databaseState(data)).toEqual(before);
  });

  it("pulls incoming fields through one GitHub executor command while retaining outgoing edits", async () => {
    const data = await linkedFixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => { repository.updateSafetySettings(data.project.id, { agentMode: "apply" }); repository.updateCard(data.card.id, { title: "Local outgoing title" }); });
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, body: "Incoming description" }));
    const result = await syncWorkItems(data.repository, data.unitOfWork, agent, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id });
    expect(result).toMatchObject({ outcome: "applied", changeSet: { source: "github", proposedBy: agent, execution: { actor: { ...agent, actorType: "github" } } } });
    expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Local outgoing title", description: "Incoming description" });
    expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ syncState: "unsynced" });
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(rows(data, "sync_runs")).toHaveLength(1);
  });
});

it("imports mapped Agent labels as durable annotations while excluding status and default labels", async () => {
  const data = await fixture();
  const agent = { actorType: "agent", actorId: "label-host", mcpSessionId: "label-session" } as const;
  data.unitOfWork.run(ACTOR, ({ repository }) => {
    repository.updateSafetySettings(data.project.id, { agentMode: "apply" });
    repository.createAnnotation({ projectId: data.project.id, storyMapId: data.map.id, name: "risk" });
    repository.createAnnotation({ projectId: data.project.id, storyMapId: data.map.id, name: "customer" });
    repository.updateConnectorConnection(data.connection.id, { labelsAsAnnotations: true, defaultLabel: "managed", statusMapping: [{ localStatus: "active", remoteState: "open", labels: ["working"] }] });
  });
  data.provider.listRemoteItems.mockResolvedValue([{ remoteId: "42", remoteNumber: 42, title: "Mapped labels", body: "Imported body", state: "open", labels: ["working", "managed", "story-map:Map", "risk", "customer"], url: "https://github.com/owner/repo/issues/42" }]);
  const result = await importWorkItems(data.repository, data.unitOfWork, agent, { storyMapId: data.map.id, connectionId: data.connection.id });
  expect(result).toMatchObject({ outcome: "applied" });
  const command = changeSetCommandResponseSchema.parse(result);
  expect(command.changeSet.operations.filter((operation) => operation.entity === "annotation")).toHaveLength(0);
  expect(command.changeSet.operations.filter((operation) => operation.entity === "cardAnnotation")).toHaveLength(2);
  const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.remoteId === "42")!;
  const card = data.repository.getCardDetails(link.cardId!)!;
  expect(card.status).toBe("Open");
  const annotations = data.repository.listAnnotations(data.project.id, data.map.id);
  expect(annotations.map((row) => row.name).sort()).toEqual(["customer", "risk"]);
  expect(rows(data, "card_annotations")).toEqual(expect.arrayContaining(annotations.map((annotation) => expect.objectContaining({ card_id: card.id, annotation_id: annotation.id }))));
});

it.each([false, true])("combines two Agent connections with divergent=%s and one shared pending milestone", async (divergent) => {
  const data = await linkedFixture();
  const agent = { actorType: "agent", actorId: "combined-host", mcpSessionId: "combined-session" } as const;
  const connection = data.unitOfWork.run(ACTOR, ({ repository }) => {
    repository.updateSafetySettings(data.project.id, { agentMode: "apply" });
    const second = repository.createConnectorConnection({ projectId: data.project.id, provider: "github", name: "Second connection", owner: "owner", repository: "second", authMode: "token", readOnly: false });
    const card = divergent ? data.card : data.cards[1]!;
    const bind = () => repository.bindRemoteWorkItemLink({ connectionId: second.id, provider: "github", cardId: card.id, remoteId: "2", remoteNumber: 2, url: "https://github.com/owner/second/issues/2", titleHash: hashText(card.title), bodyHash: hashText(stripGitHubIssueFooter(bodyFor(data, card))), labels: issueLabelsForCard(second, card), remoteState: "open", syncState: "synced" });
    if (divergent) expect(bind).toThrow("different GitHub reference"); else bind();
    return second;
  });
  if (divergent) {
    expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toMatchObject([{ cardId: data.card.id, remoteId: "1" }]);
    expect(data.provider.getRemoteItem).not.toHaveBeenCalled();
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    return;
  }
  const beforeCards = data.repository.getStoryMapSnapshot(data.map.id)!.cards;
  const beforeLinks = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id);
  data.provider.getRemoteItem.mockImplementation(async (selected, _auth, remoteId: string) => {
    const card = selected.id === data.connection.id || divergent ? data.card : data.cards[1]!;
    return remoteReadFixture({ ...data.remote, remoteId, remoteNumber: Number(remoteId), title: divergent ? selected.id === data.connection.id ? "First remote title" : "Second remote title" : card.title, body: bodyFor(data, card), milestoneDescription: "", milestoneState: "open", milestone: "Shared new milestone", milestoneNumber: 6, url: `https://github.com/${selected.owner}/${selected.repository}/issues/${remoteId}` });
  });
  const pending = pullStoryMapWorkItems(data.repository, data.unitOfWork, agent, { storyMapId: data.map.id, connectionIds: [data.connection.id, connection.id] });
  if (divergent) {
    await expect(pending).rejects.toMatchObject({ conflicts: expect.arrayContaining([expect.objectContaining({ entity: "card", id: data.card.id, operationId: expect.any(String), index: expect.any(Number) })]) });
    expect(data.repository.getStoryMapSnapshot(data.map.id)!.cards).toEqual(beforeCards);
    expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual(beforeLinks);
    expect(rows(data, "sync_runs")).toEqual([]);
    expect(data.repository.listReleases(data.map.id)).toEqual([]);
    expect(data.repository.listChangeSets(data.project.id)).toMatchObject([{ status: "conflict" }]);
  } else {
    const result = await pending;
    expect(result).toMatchObject({ outcome: "applied" });
    if (!('changeSet' in result)) throw new Error("Expected command ChangeSet.");
    expect(result.changeSet.operations.filter((operation) => operation.entity === "syncRun")).toHaveLength(2);
    const releases = data.repository.listReleases(data.map.id);
    expect(releases.map((release) => release.name)).toEqual(["Shared new milestone", "Shared new milestone"]);
    expect(releases).toHaveLength(2);
    for (const card of data.cards) expect(releases.map((release) => release.id)).toContain(data.repository.getCardDetails(card.id)!.releaseId);
    expect(rows(data, "sync_runs")).toHaveLength(2);
    expect(data.repository.listChangeSets(data.project.id)).toHaveLength(1);
  }
  expect(data.provider.getRemoteItem).toHaveBeenCalledTimes(2);
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it("applies one Agent conflict field and durably retains the other field and baseline", async () => {
  const data = await linkedFixture();
  const conflicts = data.unitOfWork.run(ACTOR, ({ repository }) => {
    repository.updateSafetySettings(data.project.id, { agentMode: "apply" });
    const run = repository.createSyncRun({ storyMapId: data.map.id, connectionId: data.connection.id, mode: "sync", status: "applied" });
    return ["title", "description"].map((field) => repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(data.card.id)!.storyMapId).find((row) => row.cardId === data.card.id)!.externalRefId, syncRunId: run.id, connectionId: data.connection.id, cardId: data.card.id, remoteId: data.remote.remoteId, field: field as "title" | "description", localValue: field === "title" ? data.card.title : data.card.description, remoteValue: field === "title" ? "Resolved remote title" : "Unresolved remote body" }));
  });
  const beforeLink = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Resolved remote title", body: "Unresolved remote body", parentNumber: 77 }));
  const result = await data.registry.call("ResolveSyncConflict", { conflictId: conflicts[0]!.id, storyMapId: data.map.id, resolution: "remote", reviewed: { localValue: conflicts[0]!.localValue, remoteValue: conflicts[0]!.remoteValue } });
  expect(result).toMatchObject({ outcome: "applied" });
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Resolved remote title", description: data.card.description });
  expect(data.repository.getSyncConflict(conflicts[0]!.id)).toMatchObject({ status: "resolved-remote" });
  expect(data.repository.getSyncConflict(conflicts[1]!.id)).toEqual(conflicts[1]);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ syncState: "conflict", bodyHash: beforeLink.bodyHash, remoteParentNumber: beforeLink.remoteParentNumber });
  await expect(data.registry.call("UpdateStoryMapCard", { cardId: data.card.id, baseVersion: data.repository.getCardDetails(data.card.id)!.version, patch: { description: "Ordinary conflicting write" } })).rejects.toMatchObject({ conflicts: expect.arrayContaining([expect.objectContaining({ syncConflictId: conflicts[1]!.id })]) });
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it("refuses approved deferred resolution when the durable reviewed conflict value drifts", async () => {
  const data = await linkedFixture();
  const conflict = data.unitOfWork.run(ACTOR, ({ repository }) => {
    repository.updateSafetySettings(data.project.id, { agentMode: "apply" });
    const run = repository.createSyncRun({ storyMapId: data.map.id, connectionId: data.connection.id, mode: "sync", status: "applied" });
    return repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(data.card.id)!.storyMapId).find((row) => row.cardId === data.card.id)!.externalRefId, syncRunId: run.id, connectionId: data.connection.id, cardId: data.card.id, remoteId: data.remote.remoteId, field: "title", localValue: data.card.title, remoteValue: "Reviewed remote title" });
  });
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Reviewed remote title" }));
  const proposed = await data.registry.call("ResolveSyncConflict", { conflictId: conflict.id, storyMapId: data.map.id, resolution: "remote", apply: false, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } });
  const result = changeSetCommandResponseSchema.parse(proposed);
  const resolutionIndex = result.changeSet.operations.findIndex((operation) => operation.entity === "syncConflict" && operation.op === "resolve");
  expect(result.changeSet.operations[resolutionIndex]).toMatchObject({ entity: "syncConflict", before: conflict });
  const approved = await data.server.inject({ method: "POST", url: `/api/changesets/${result.changeSetId}/approve`, payload: {} });
  expect(approved.statusCode).toBe(200);
  data.handle.current.$client.prepare("UPDATE sync_conflicts SET remote_value_json = ? WHERE id = ?").run(JSON.stringify("Changed reviewed remote title"), conflict.id);
  const beforeCard = data.repository.getCardDetails(data.card.id);
  const beforeLinks = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id);
  const beforeRuns = rows(data, "sync_runs");
  const applied = await data.server.inject({ method: "POST", url: `/api/changesets/${result.changeSetId}/apply`, payload: {} });
  expect(applied.statusCode).toBe(409);
  expect(applied.json()).toMatchObject({ code: "conflict", conflicts: expect.arrayContaining([expect.objectContaining({ reason: "fingerprint", index: resolutionIndex, operationId: expect.any(String) }), expect.objectContaining({ reason: "sync", syncConflictId: conflict.id })]) });
  expect(data.repository.getCardDetails(data.card.id)).toEqual(beforeCard);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual(beforeLinks);
  expect(rows(data, "sync_runs")).toEqual(beforeRuns);
  expect(data.repository.getSyncConflict(conflict.id)).toMatchObject({ status: "open", remoteValue: "Changed reviewed remote title" });
});

it("imports child-first Agent hierarchy and reuses the imported fallback activity", async () => {
  const data = await fixture();
  const agent = { actorType: "agent", actorId: "hierarchy-host", mcpSessionId: "hierarchy-session" } as const;
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "apply" }));
  const remote = (number: number, title: string, labels: string[], parentNumber?: number): RemoteWorkItem => ({ remoteId: String(number), remoteNumber: number, title, labels, parentNumber, body: "Reviewed hierarchy", state: "open", url: `https://github.com/owner/repo/issues/${number}` });
  data.provider.listRemoteItems.mockResolvedValue([remote(3, "Imported story", [], 2), remote(2, "Imported step", ["feature"], 1), remote(4, "Fallback story", []), remote(1, "Imported backlog", ["epic"])]);
  const result = await importWorkItems(data.repository, data.unitOfWork, agent, { storyMapId: data.map.id, connectionId: data.connection.id });
  expect(result).toMatchObject({ outcome: "applied" });
  const links = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id);
  const card = (number: number) => data.repository.getCardDetails(links.find((link) => link.remoteId === String(number))!.cardId!)!;
  expect(card(1)).toMatchObject({ level: "activity", parentId: null, title: "Imported backlog" });
  expect(card(2)).toMatchObject({ level: "step", parentId: card(1).id });
  expect(card(3)).toMatchObject({ level: "story", parentId: card(2).id });
  const fallbackStep = data.repository.getCardDetails(card(4).parentId!)!;
  expect(fallbackStep).toMatchObject({ level: "step", parentId: card(1).id, title: "Imported work items" });
  expect(data.repository.getStoryMapSnapshot(data.map.id)!.cards.filter((entry) => entry.title === "Imported backlog")).toHaveLength(1);
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

function registerRejectsDeferredSResponsesAfterReplacementWithCopiedIdentifiers() {
  it.each(["sync-fetch", "import", "plan-import", "pull"] as const)("rejects deferred %s responses after replacement with copied identifiers", async (mode) => {
    const data = await linkedFixture();
    const started = deferred<Payload | undefined>();
    const resumed = deferred<RemoteWorkItem>();
    data.provider.getRemoteItem.mockImplementation(() => {
      started.resolve(undefined);
      return resumed.promise.then(remoteReadFixture);
    });
    data.provider.createOrUpdateRemoteItem.mockImplementation((_connection, _auth, sent: Payload) => { started.resolve(sent); return resumed.promise; });
    data.provider.listRemoteItems.mockImplementation(async () => { started.resolve(undefined); return [await resumed.promise]; });
    const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.card.id] };
    const running = mode === "import" ? importWorkItems(data.repository, data.unitOfWork, ACTOR, input)
      : mode === "plan-import" ? planWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", ...input, mode: "import" })
        : mode === "pull" ? pullStoryMapWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id })
          : syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input, localOrigin: "http://127.0.0.1:4317" });
    const sent = await started.promise;
    const originalState = databaseState(data);
    const original = await replaceWithCopy(data);
    const replacementState = databaseState(data);
    const writing = vi.spyOn(data.unitOfWork, "run");
    resumed.resolve(sent ? remoteFor(sent) : { ...data.remote, title: "Prepared remote title" });
    await expect(running).rejects.toThrow("Database changed during remote preparation");
    expect(writing).not.toHaveBeenCalled();
    expect(databaseState(data)).toEqual(replacementState);
    const replacement = data.handle.current;
    data.handle.current = original;
    expect(databaseState(data)).toEqual(originalState);
    data.handle.current = replacement;
    writing.mockRestore();
  });
}

function registerRejectsAChangedSAfterFetchBeforeAnyOutbound() {
  it.each(["connection", "link"] as const)("rejects a changed %s after fetch before any outbound write", async (changed) => {
    const data = await linkedFixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Local title" }));
    data.provider.getRemoteItem.mockImplementation(async () => {
      data.unitOfWork.run(ACTOR, ({ repository }) => {
        if (changed === "connection") repository.updateConnectorConnection(data.connection.id, { repository: "changed-target" });
        else repository.upsertRemoteWorkItemLink({ ...repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!, titleHash: hashText("Concurrent baseline") });
      });
      return remoteReadFixture({ ...data.remote, title: "Remote title" });
    });
    const before = data.repository.getCardDetails(data.card.id);
    await expect(syncWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id })).rejects.toMatchObject({ code: "conflict", details: { items: [{ status: "failed", code: "conflict" }] } });
    expect(data.repository.getCardDetails(data.card.id)).toEqual(before);
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  });
}

function registerMergesAnIndependentRemoteBodyWhileLeavingADivergent() {
  it("merges an independent remote body while leaving a divergent title conflict", async () => {
    const data = await linkedFixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Local title" }));
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Remote title", body: "Remote body" }));
    const result = await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id });
    expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Local title", description: "Remote body" });
    expect(data.repository.listOpenSyncConflicts(data.map.id)).toMatchObject([{ field: "title" }]);
    expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.syncState).toBe("conflict");
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  });
}

function registerImportsAReviewedRemoteIssueWithProtectionSAnd(agent: { readonly actorType: "agent"; readonly actorId: "github-host"; readonly mcpSessionId: "github-session"; }) {
  it.each([false, true])("imports a reviewed remote issue with protection=%s and records both identities", async (protectedProject) => {
    const data = await fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: protectedProject ? "propose" : "apply" }));
    data.provider.listRemoteItems.mockResolvedValue([{ remoteId: "17", remoteNumber: 17, title: "Imported issue", body: "Reviewed body", state: "open", labels: [], url: "https://github.com/owner/repo/issues/17", milestoneDescription: "", milestoneState: "open", milestone: "Imported milestone", milestoneNumber: 4 }]);
    const result = await importWorkItems(data.repository, data.unitOfWork, agent, { storyMapId: data.map.id, connectionId: data.connection.id });
    expect(result).toMatchObject({ outcome: protectedProject ? "proposed" : "applied", changeSet: { source: "github", proposedBy: agent } });
    if (!('changeSet' in result)) throw new Error("Expected canonical command response.");
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.remoteId === "17");
    if (protectedProject) {
      expect(link).toBeUndefined();
      expect(rows(data, "sync_runs")).toEqual([]);
      expect(data.repository.listReleases(data.map.id)).toEqual([]);
      expect(result.changeSet.execution).toBeUndefined();
    } else {
      const card = data.repository.getCardDetails(link!.cardId!)!;
      expect(link).toMatchObject({ bodyHash: hashText(stripGitHubIssueFooter(buildGitHubIssueBody(card, data.map.name, { origin: "http://127.0.0.1:4317", projectId: data.project.id }))), syncState: "synced" });
      expect(card).toMatchObject({ title: "Imported issue", creationOrigin: "inference", provenance: "linked" });
      expect(result.changeSet.execution).toMatchObject({ actor: { ...agent, actorType: "github" }, restorePoint: expect.any(String) });
      expect(data.repository.listCardHistory(card.id).at(-1)).toMatchObject({ actor: agent.actorId, actorType: "github", mcpSessionId: agent.mcpSessionId });
      expect(rows(data, "sync_runs")).toHaveLength(1);
    }
  });
}

function registerRefusesDisabledAgentSPlanningBeforeProviderOrBookkeeping(agent: { readonly actorType: "agent"; readonly actorId: "github-host"; readonly mcpSessionId: "github-session"; }) {
  it.each(["push", "sync", "import"] as const)("refuses disabled Agent %s planning before provider or bookkeeping effects", async (mode) => {
    const data = await fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "off" }));
    const before = databaseState(data);
    await expect(planWorkItems(data.repository, data.unitOfWork, agent, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id, mode })).rejects.toMatchObject({ code: "disabled" });
    expect(databaseState(data)).toEqual(before);
    expect(resolveProviderAuth).not.toHaveBeenCalled();
    expect(data.provider.listRemoteItems).not.toHaveBeenCalled();
  });
}

async function testGeneratesTheTitleConflictWithItsLocalRemoteValuesAndRun() {
  const data = await linkedFixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Local divergent title" }));
  const before = data.repository.getCardDetails(data.card.id)!;
  const history = data.repository.listCardHistory(data.card.id);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Remote divergent title" }));
  const result = await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id });
  const health = getWorkItemSyncHealth(data, ACTOR, data.map.id);
  expect(health.openConflicts).toMatchObject([{ syncRunId: data.repository.getWorkItemSyncHealthData(data.map.id).runs[0]!.id, connectionId: data.connection.id, cardId: data.card.id, remoteId: "1", field: "title", localValue: "Local divergent title", remoteValue: "Remote divergent title", status: "open" }]);
  expect(health.openConflicts).toHaveLength(1);
  expect(health.lastRun?.id).toBe(data.repository.getWorkItemSyncHealthData(data.map.id).runs[0]!.id);
  expect(health.stateCounts.conflict).toBe(1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.syncState).toBe("conflict");
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ ...before, status: "Open", version: before.version + 1, updatedAt: expect.any(String) });
  expect(data.repository.listCardHistory(data.card.id)).toHaveLength(history.length + 1);
  expect(data.repository.listCardHistory(data.card.id)).toEqual(expect.arrayContaining(history));
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
}

async function testMergesIncomingRemoteBodyWhileRetainingALocalTitlePendingReview() {
  const data = await linkedFixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Local title" }));
  const remote = { ...data.remote, body: "Remote body" };
  const card = data.repository.getCardDetails(data.card.id)!;
  const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
  expect(bodyFor(data, card)).toBe(data.remote.body);
  expect(changedFieldsForRemote(data.repository, data.connection, card, link, remote)).toMatchObject({ description: { local: false, remote: true } });
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote));
  data.provider.createOrUpdateRemoteItem.mockImplementation(async (_connection, _auth, sent: Payload) => remoteFor(sent));
  const result = await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id });
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Local title", description: "Remote body" });
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ titleHash: hashText(data.card.title), bodyHash: hashText("Remote body"), syncState: "unsynced" });
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
}

async function testClearsTheRemovedRemoteMilestoneInBothTheCardAndPersisted() {
  const data = await linkedFixture(true);
  data.unitOfWork.run(ACTOR, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Old milestone" });
    repository.updateCard(data.card.id, { releaseId: release.id });
    const link = repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
    repository.bindRemoteWorkItemLink({ connectionId: data.connection.id, releaseId: release.id, provider: "github", remoteId: "9", url: "https://github.com/owner/repo/milestone/9", labels: [], syncState: "synced" });
    repository.upsertRemoteWorkItemLink({ ...link, milestone: release.name, baseline: syncBaseline(repository, data.connection, repository.getCardDetails(data.card.id)!, { ...data.remote, milestoneDescription: "", milestoneState: "open", milestone: release.name, milestoneNumber: 9 }) });
  });
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(data.remote));
  await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id });
  expect(data.repository.getCardDetails(data.card.id)?.releaseId).toBeNull();
  expect(data.handle.current.$client.prepare("SELECT s.milestone FROM remote_work_item_links s JOIN external_refs r ON s.external_ref_id = r.id WHERE r.entity_type = 'card' AND r.entity_id = ?").get(data.card.id)).toEqual({ milestone: null });
}

async function testKeepsUnchangedReadOnlyRawBodiesHealthyWithoutExtraCardVersions() {
  const data = await linkedFixture(true);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, body: "Raw remote body" }));
  const input = { storyMapId: data.map.id, connectionId: data.connection.id };
  await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input, localOrigin: "http://127.0.0.1:4317" });
  const versions = data.repository.listCardHistory(data.card.id);
  const updates = data.repository.listActivity(data.project.id).filter((event) => event.action === "card.updated");
  await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input, localOrigin: "http://127.0.0.1:4317" });
  expect(data.repository.listCardHistory(data.card.id)).toEqual(versions);
  expect(data.repository.listActivity(data.project.id).filter((event) => event.action === "card.updated")).toEqual(updates);
  expect(getWorkItemSyncHealth(data, ACTOR, data.map.id).links[0]?.syncState).toBe("synced");
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
}

async function testRecordsACanonicalRemoteConflictResolutionBaselineThatStaysHealthyOn() {
  const data = await linkedFixture();
  const conflict = data.unitOfWork.run(ACTOR, ({ repository }) => {
    const run = repository.createSyncRun({ storyMapId: data.map.id, connectionId: data.connection.id, mode: "sync", status: "applied" });
    return repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(data.card.id)!.storyMapId).find((row) => row.cardId === data.card.id)!.externalRefId, syncRunId: run.id, connectionId: data.connection.id, cardId: data.card.id, remoteId: data.remote.remoteId, field: "description", localValue: data.card.description, remoteValue: "Raw resolved body" });
  });
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, body: "Raw resolved body" }));
  const response = await data.server.inject({ method: "POST", url: `/api/sync/conflicts/${conflict.id}/resolve`, payload: { storyMapId: data.map.id, resolution: "remote", reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } } });
  expect(response.statusCode).toBe(200);
  expect(getWorkItemSyncHealth(data, ACTOR, data.map.id).links[0]?.syncState).toBe("synced");
  const versions = data.repository.listCardHistory(data.card.id);
  const updates = data.repository.listActivity(data.project.id).filter((event) => event.action === "card.updated");
  await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id });
  expect(data.repository.listCardHistory(data.card.id)).toEqual(versions);
  expect(data.repository.listActivity(data.project.id).filter((event) => event.action === "card.updated")).toEqual(updates);
  expect(getWorkItemSyncHealth(data, ACTOR, data.map.id).links[0]?.syncState).toBe("synced");
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
}
