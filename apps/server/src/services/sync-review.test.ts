import { reviewedPushProviderFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { stripGitHubIssueFooter } from "@storymapper/core";
import { remoteReadFixture } from "@storymapper/server/fixtures/remote-read";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { incomingGitHubCommandResponseSchema, importWorkItemsResponseSchema, pullStoryMapWorkItemsResponseSchema, type SyncConflict, type SyncPlan } from "@storymapper/contracts";
import { buildGitHubIssueBody } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createWorkItemProvider, type RemoteWorkItem } from "@storymapper/github";
import { resolveSyncConflict } from "@storymapper/server/application/sync/sync-conflict.use-cases";
import { getWorkItemSyncHealth } from "@storymapper/server/application/sync/sync.use-cases";
import { createRoutes } from "@storymapper/server/http/routes";
import { hashText, importWorkItems, issueLabelsForCard, planWorkItems, pullStoryMapWorkItems, pushWorkItems, syncWorkItems } from "@storymapper/server/services/work-item-sync";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { assertReviewedConflict, persistConflictResolution, prepareConflictResolution } from "@storymapper/server/services/sync-conflict-resolution";
import { changedFieldsForRemote } from "@storymapper/server/services/sync-merge";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })), githubCredentialStatuses: vi.fn(async () => []) }));
const ACTOR = { actorType: "human", actorId: "local-user" } as const;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { vi.clearAllMocks(); for (const close of cleanup.splice(0).reverse()) await close(); });
type Payload = SyncPlan["items"][number];

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-sync-review-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const data = unitOfWork.run(ACTOR, ({ repository }) => {
    const project = repository.createProject({ name: "Sync review" });
    repository.updateSafetySettings(project.id, { github: true });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const cards = ["First", "Second", "Third"].map((title) => repository.createCard({ storyMapId: map.id, level: "activity", title, description: "Original body" }, "human"));
    const connection = repository.createConnectorConnection({ projectId: project.id, name: "GitHub", provider: "github", owner: "owner", repository: "repo", authMode: "token", readOnly: false, issueTypeMapping: [{ cardType: "task", issueType: "Task" }], statusMapping: [{ localStatus: "todo", remoteState: "open", labels: ["ready"] }, { localStatus: "done", remoteState: "closed", labels: ["done-a", "done-b"] }] });
    const remotes: RemoteWorkItem[] = cards.map((card, index) => ({ remoteId: String(index + 1), remoteNumber: index + 1, title: card.title, body: buildGitHubIssueBody(card, map.name, { origin: "http://127.0.0.1:4317", projectId: project.id }), state: "open", labels: issueLabelsForCard(connection, card), url: `https://github.com/owner/repo/issues/${index + 1}` }));
    const links = cards.map((card, index) => repository.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", cardId: card.id, ...remotes[index]!, titleHash: hashText(card.title), bodyHash: hashText(stripGitHubIssueFooter(remotes[index]!.body)), remoteState: "open", syncState: "synced" }));
    return { project, map, cards, card: cards[0]!, connection, remotes, remote: remotes[0]!, links, directory };
  });
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  cleanup.push(async () => { await server.close(); if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const provider = { ...reviewedPushProviderFixture(), readPushInputs: vi.fn(async () => ({ issueTypes: ["Task"], labels: ["local-story-map", "story-map:LSM", "level:activity", "ready", "done-a", "done-b", "external", "external-new"], writable: true, milestones: [] })), validateConnection: vi.fn(), listRemoteItems: vi.fn(), getRemoteItem: vi.fn(async (_connection, _auth, id) => remoteReadFixture(data.remotes.find((remote) => remote.remoteId === id))), createOrUpdateRemoteItem: vi.fn(async (_connection, _auth, sent: Payload) => remoteFor(sent)) };
  vi.mocked(createWorkItemProvider).mockReturnValue(provider);
  return { ...data, localOrigin: () => "http://127.0.0.1:4317", handle, repository, unitOfWork, server, provider };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
function remoteFor(sent: Payload): RemoteWorkItem {
  return { remoteId: sent.remoteId ?? "73", remoteNumber: Number(sent.remoteId ?? 73), title: sent.title, body: sent.body, labels: sent.labels, state: sent.remoteState ?? "open", milestoneDescription: "", milestoneState: "open", milestone: sent.milestone, url: `https://github.com/owner/repo/issues/${sent.remoteId ?? 73}` };
}
function input(data: Fixture, all = false) {
  return { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id, cardIds: (all ? data.cards : [data.card]).map((card) => card.id) };
}
function conflict(data: Fixture, field: SyncConflict["field"], remoteValue?: string) {
  return data.unitOfWork.run(ACTOR, ({ repository }) => {
    const run = repository.createSyncRun({ storyMapId: data.map.id, connectionId: data.connection.id, mode: "sync", status: "applied" });
    return repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(data.card.id)!.storyMapId).find((row) => row.cardId === data.card.id)!.externalRefId, syncRunId: run.id, connectionId: data.connection.id, cardId: data.card.id, remoteId: "1", field, localValue: field === "title" ? repository.getCard(data.card.id)!.title : repository.getCard(data.card.id)!.description, remoteValue: remoteValue ?? (field === "title" ? data.remote.title : stripGitHubIssueFooter(data.remote.body)) });
  });
}
function resolve(data: Fixture, conflictId: string, resolution: "local" | "remote") {
  return data.server.inject({ method: "POST", url: `/api/sync/conflicts/${conflictId}/resolve`, payload: { storyMapId: data.map.id, resolution, reviewed: { localValue: data.repository.getSyncConflict(conflictId)!.localValue, remoteValue: data.repository.getSyncConflict(conflictId)!.remoteValue } } });
}
function runs(data: Fixture): unknown[] { return data.handle.current.$client.prepare("SELECT * FROM sync_runs").all(); }
function databaseState(data: Fixture): unknown {
  return ["activity_events", "cards", "remote_work_item_links", "sync_runs", "sync_conflicts"].map((table) => data.handle.current.$client.prepare(`SELECT * FROM ${table}`).all());
}
async function replaceDatabase(data: Fixture) {
  const original = data.handle.current;
  const path = join(data.directory, "replacement.sqlite");
  await original.$client.backup(path);
  data.handle.current = openStoryMapperDb(path);
  cleanup.push(async () => { if (original.$client.open) original.$client.close(); });
  return original;
}

describe("field-aware sync review regressions", () => {
  registerAcceptsEquivalentMixedCaseProviderIdentityAndRefusesAnother();

  registerAcceptsReorderedReviewedSObjectsAndRefusesRealDrift();
  registerRefusesLocalClosureWhenAPersistedProviderResultDoes();
  registerRefusesARetargetedConflictConnectionBeforeCredentialsOrProvider();

  it("reports deleted local identities with retained Issue links using local evidence only", testReportsDeletedLocalIdentitiesWithRetainedIssueLinksUsingLocalEvidence);

  registerRequiresExplicitRenewedReviewAfterDisplayedSResolutionEvidence();

  registerRefusesAConflictDryRunRequestWithoutCapturedReview();

  it("preserves original conflict evidence and health through repeated pulls and convergence", testPreservesOriginalConflictEvidenceAndHealthThroughRepeatedPullsAndConvergence);

  registerRefusesImportPlanningBeforeCredentialsUnderS();

  registerRechecksSImportPlanningAfterSuspendedSWithS();

  registerRefusesConflictFetchAfterSRevocationDuringCredentials();

  registerRechecksSSDuringPendingSConflictFetch();

  registerKeepsOutgoingAgentConflictResolutionAsADryRun();
  registerDoesNotSendALocallyDivergentUpdateThroughIncoming();

  registerMergesLocalStatusWithIndependentRemoteLabelsWithoutRemoving();

  registerKeepsIdentityAndMarksTheLinkStaleWhenThe();

  registerAcceptsEquivalentConcurrentStatusSetsInADifferentOrder();

  it("resolves only the chosen remote field while another conflict remains open through refresh", testResolvesOnlyTheChosenRemoteFieldWhileAnotherConflictRemainsOpen);

  it("keeps an independent local title pending review after remote body resolution and refresh", testKeepsAnIndependentLocalTitlePendingReviewAfterRemoteBodyResolution);

  it("local resolution prepares the chosen field while preserving unrelated remote edits and open conflict", testLocalResolutionPreparesTheChosenFieldWhilePreservingUnrelatedRemoteEdits);

  it("returns 409 when the Card endpoint edits a Card during conflict fetch and preserves its newer version", testReturns409WhenTheCardEndpointEditsACardDuringConflict);

  registerRejectsSInvalidationDuringConflictFetch();

  registerLeavesAllLocalOutboundEditsPendingThroughAnIncoming();

  registerReportsSInvalidationOfAPreparedItemDuringThe();

  it("normalizes imported remote title prefixes without hiding a legitimate local prefix edit", testNormalizesImportedRemoteTitlePrefixesWithoutHidingALegitimateLocalPrefix);

  registerReturnsItemsFromPullWithoutAResultsAlias();
});

function registerReturnsItemsFromPullWithoutAResultsAlias() {
  it("returns items from pull without a results alias", async () => {
    const data = await fixture();
    const response = await pullStoryMapWorkItems(data.repository, data.unitOfWork, ACTOR, { storyMapId: data.map.id });
    expect(response.items).toHaveLength(3);
    expect(response).not.toHaveProperty("results");
    expect(pullStoryMapWorkItemsResponseSchema.parse(response)).toEqual(response);
    expect(data.repository.getWorkItemSyncHealthData(data.map.id).runs).toHaveLength(1);
  });
}

function registerReportsSInvalidationOfAPreparedItemDuringThe() {
  it.each(["card", "link", "missing-link", "connection"] as const)("reports %s invalidation of a prepared item during the later fetch as not applied", async (dependency) => {
    const data = await fixture();
    const original = data.remote;
    data.provider.getRemoteItem.mockImplementation(async (_connection, _auth, id) => {
      if (id === "2") data.unitOfWork.run(ACTOR, ({ repository }) => {
        if (dependency === "card") repository.deleteCard(data.card.id, { strategy: "unassign" });
        else if (dependency === "connection") repository.updateConnectorConnection(data.connection.id, { name: "Changed" });
        else if (dependency === "missing-link") repository.deleteGitHubLink(data.links[0]!.externalRefId);
        else repository.upsertRemoteWorkItemLink({ ...data.links[0]!, titleHash: hashText("New baseline") });
      });
      return remoteReadFixture({ ...data.remotes.find((remote) => remote.remoteId === id)!, body: "Incoming body" });
    });
    await expect(syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input(data, true), localOrigin: "http://127.0.0.1:4317" })).rejects.toMatchObject({ code: "conflict", details: { items: expect.arrayContaining([expect.objectContaining({ status: "failed" })]) } });
    expect(data.repository.getWorkItemSyncHealthData(data.map.id).runs).toEqual([]);
    if (dependency !== "card") expect(data.repository.getCardDetails(data.card.id)?.description).toBe(data.card.description);
  });
}

function registerLeavesAllLocalOutboundEditsPendingThroughAnIncoming() {
  it("leaves all local outbound edits pending through an incoming batch", async () => {
    const data = await fixture();
    await syncWorkItems(data.repository, data.unitOfWork, ACTOR, input(data, true));
    data.unitOfWork.run(ACTOR, ({ repository }) => { for (const card of data.cards) repository.updateCard(card.id, { title: `${card.title} local` }); });
    const result = await syncWorkItems(data.repository, data.unitOfWork, ACTOR, input(data, true));
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.status === "unchanged")).toBe(true);
    expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).every((link) => link.syncState === "unsynced")).toBe(true);
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
    expect(incomingGitHubCommandResponseSchema.parse(result)).toEqual(result);
  });
}

function registerRejectsSInvalidationDuringConflictFetch() {
  it.each(["release", "map", "link", "connection"] as const)("rejects %s invalidation during conflict fetch", async (dependency) => {
    const data = await fixture();
    const release = data.unitOfWork.run(ACTOR, ({ repository }) => { const release = repository.createRelease({ storyMapId: data.map.id, name: "MVP" }); repository.updateCard(data.card.id, { releaseId: release.id }); return release; });
    const entry = conflict(data, "description");
    data.provider.getRemoteItem.mockImplementation(async () => {
      data.unitOfWork.run(ACTOR, ({ repository }) => {
        if (dependency === "release") repository.updateRelease(release.id, { name: "New release" });
        else if (dependency === "map") repository.updateStoryMap(data.map.id, { name: "New map" });
        else if (dependency === "connection") repository.updateConnectorConnection(data.connection.id, { name: "New connection" });
        else repository.upsertRemoteWorkItemLink({ ...data.links[0]!, titleHash: hashText("New baseline") });
      });
      return remoteReadFixture({ ...data.remote, body: "Prepared remote body" });
    });
    expect((await resolve(data, entry.id, "remote")).statusCode).toBe(409);
    expect(data.repository.getSyncConflict(entry.id)?.status).toBe("open");
    expect(data.repository.getCardDetails(data.card.id)?.description).toBe(data.card.description);
  });
}

function registerAcceptsEquivalentConcurrentStatusSetsInADifferentOrder() {
  it("accepts reordered remote status labels while refusing local status changes", async () => {
    const data = await fixture();
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, state: "closed", labels: ["done-a", "done-b", "external-new"] }));
    await syncWorkItems(data.repository, data.unitOfWork, ACTOR, input(data));
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { status: "done" }))).toThrow("GitHub owns this Card status");
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, state: "closed", labels: ["done-b", "external-new", "done-a"] }));
    await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input(data), localOrigin: "http://127.0.0.1:4317" });
    expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(data.repository.getCardDetails(data.card.id)?.status).toBe("Closed");
  });
}

function registerKeepsIdentityAndMarksTheLinkStaleWhenThe() {
  it("keeps identity and marks the link stale when the human sync finds the Issue unavailable", async () => {
    const data = await fixture();
    const before = data.repository.getCardDetails(data.card.id);
    const observedAt = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.lastSyncedAt;
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(undefined));
    await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input(data), localOrigin: "http://127.0.0.1:4317" });
    expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ url: data.remote.url, syncState: "stale", lastSyncedAt: observedAt });
    expect(data.repository.getCardDetails(data.card.id)).toEqual(before);
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  });
}

function registerMergesLocalStatusWithIndependentRemoteLabelsWithoutRemoving() {
  it("retains a local title with independent remote labels while refusing local status changes", async () => {
    const data = await fixture();
    await syncWorkItems(data.repository, data.unitOfWork, ACTOR, input(data));
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { status: "done" }))).toThrow("GitHub owns this Card status");
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Local title" }));
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, labels: [...data.remote.labels, "external-new"] }));
    const result = await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input(data), localOrigin: "http://127.0.0.1:4317" });
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Local title", status: "Open" });
    expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.labels).toContain("external-new");
    expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.syncState).toBe("unsynced");
    expect(data.repository.getWorkItemSyncHealthData(data.map.id).runs[0]!.status).toBe("applied");
    expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
  });
}

function registerDoesNotSendALocallyDivergentUpdateThroughIncoming() {
  it("does not send a locally divergent update through incoming sync", async () => {
    const data = await fixture();
    await syncWorkItems(data.repository, data.unitOfWork, ACTOR, input(data));
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Local title" }));
    const result = await syncWorkItems(data.repository, data.unitOfWork, ACTOR, input(data));
    expect(result.items).toMatchObject([{ status: "unchanged", remoteId: "1" }]);
    expect(data.repository.getCardDetails(data.card.id)?.title).toBe("Local title");
    expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.syncState).toBe("unsynced");
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  });
}

function registerKeepsOutgoingAgentConflictResolutionAsADryRun() {
  it("keeps outgoing Agent conflict resolution as a Dry Run without provider mutation", async () => {
    const data = await fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "apply" }));
    const entry = conflict(data, "description");
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(data.remote));
    const actor = { actorType: "agent", actorId: "safety-conflict-host", mcpSessionId: "safety-conflict-session" } as const;
    const result = await resolveSyncConflict(data, actor, entry.id, { storyMapId: data.map.id, resolution: "local", reviewed: { localValue: entry.localValue, remoteValue: entry.remoteValue } });
    expect(result).toMatchObject({ outcome: "proposed", plan: { mode: "push", items: [{ cardId: data.card.id }] } });
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(data.repository.getSyncConflict(entry.id)?.status).toBe("open");
    expect(data.repository.getCardDetails(data.card.id)?.description).toBe(data.card.description);
  });
}

function registerRechecksSSDuringPendingSConflictFetch() {
  it.each([
    ["agent", "agentAccess", "local"], ["agent", "agentProtection", "local"],
    ["agent", "agentAccess", "remote"], ["agent", "agentProtection", "remote"],
    ["human", "agentAccess", "local"], ["human", "agentProtection", "local"],
    ["human", "agentAccess", "remote"], ["human", "agentProtection", "remote"]
  ] as const)("rechecks %s %s during pending %s conflict fetch", async (actorType, safetySwitch, resolution) => {
    const data = await fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "apply" }));
    const entry = conflict(data, "description", "Fetched remote body");
    let fetched!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => { fetched = resolve; });
    const suspended = new Promise<void>((resolve) => { release = resolve; });
    data.provider.getRemoteItem.mockImplementation(async () => { fetched(); await suspended; return remoteReadFixture({ ...data.remote, body: "Fetched remote body" }); });
    const actor = { actorType, actorId: "safety-conflict-host", mcpSessionId: "safety-conflict-session" };
    const pending = resolveSyncConflict(data, actor, entry.id, { storyMapId: data.map.id, resolution, reviewed: { localValue: entry.localValue, remoteValue: entry.remoteValue } });
    await entered;
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: safetySwitch === "agentProtection" ? "propose" : "off" }));
    const before = databaseState(data);
    if (actorType === "agent" && (safetySwitch === "agentAccess" || resolution === "local") || actorType === "human" && resolution === "local") {
      const rejected = expect(pending).rejects.toMatchObject({ code: actorType === "human" ? "conflict" : safetySwitch === "agentAccess" ? "disabled" : "protected" });
      release();
      await rejected;
      expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
      expect(databaseState(data)).toEqual(before);
      expect(data.repository.getSyncConflict(entry.id)?.status).toBe("open");
    } else {
      release();
      const result = await pending;
      if ("changeSet" in result) {
        expect(result).toMatchObject({ outcome: actorType === "agent" ? "proposed" : "applied", changeSet: { proposedBy: actor } });
        expect(data.repository.getSyncConflict(entry.id)?.status).toBe(actorType === "agent" ? "open" : "resolved-remote");
        expect(data.repository.getCardDetails(data.card.id)?.description).toBe(actorType === "agent" ? data.card.description : "Fetched remote body");
        expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
        return;
      }
      if ("plan" in result) {
        expect(result.plan.selection.conflictId).toBe(entry.id);
        expect(data.repository.getSyncConflict(entry.id)?.status).toBe("open");
      } else expect(result.conflict.status).toBe(`resolved-${resolution}`);
      expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
      expect(data.repository.getCardDetails(data.card.id)?.description).toBe(resolution === "remote" ? "Fetched remote body" : data.card.description);
    }
  });
}

function registerRefusesConflictFetchAfterSRevocationDuringCredentials() {
  it.each(["agentAccess", "agentProtection"] as const)("refuses conflict fetch after %s revocation during credentials", async (safetySwitch) => {
    const data = await fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "apply" }));
    const entry = conflict(data, "description");
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const suspended = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(resolveProviderAuth).mockImplementationOnce(async (connection) => { entered(); await suspended; return { connection, auth: {} }; });
    const pending = resolveSyncConflict(data, { actorType: "agent", actorId: "conflict-host" }, entry.id, { storyMapId: data.map.id, resolution: "local", reviewed: { localValue: entry.localValue, remoteValue: entry.remoteValue } });
    await started;
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: safetySwitch === "agentProtection" ? "propose" : "off" }));
    const before = databaseState(data);
    const rejected = expect(pending).rejects.toMatchObject({ code: safetySwitch === "agentAccess" ? "disabled" : "protected" });
    release();
    await rejected;
    expect(data.provider.getRemoteItem).not.toHaveBeenCalled();
    expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(databaseState(data)).toEqual(before);
  });
}

function registerRechecksSImportPlanningAfterSuspendedSWithS() {
  it.each([
    ["agent", "credentials", "agentAccess"], ["agent", "credentials", "agentProtection"],
    ["agent", "provider", "agentAccess"], ["agent", "provider", "agentProtection"],
    ["human", "credentials", "agentAccess"], ["human", "credentials", "agentProtection"],
    ["human", "provider", "agentAccess"], ["human", "provider", "agentProtection"]
  ] as const)("rechecks %s import planning after suspended %s with %s revoked", async (actorType, stage, safetySwitch) => {
    const data = await fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "apply" }));
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const suspended = new Promise<void>((resolve) => { release = resolve; });
    if (stage === "credentials") vi.mocked(resolveProviderAuth).mockImplementationOnce(async (connection) => { entered(); await suspended; return { connection, auth: {} }; });
    data.provider.listRemoteItems.mockImplementation(async () => { if (stage === "provider") { entered(); await suspended; } return data.remotes; });
    const pending = planWorkItems(data.repository, data.unitOfWork, { actorType, actorId: "planning-host" }, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id, mode: "import" });
    await started;
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: safetySwitch === "agentProtection" ? "propose" : "off" }));
    const before = databaseState(data);
    const writing = vi.spyOn(data.unitOfWork, "run");
    try {
      if (actorType === "agent" && safetySwitch === "agentAccess") {
        const rejected = expect(pending).rejects.toMatchObject({ code: safetySwitch === "agentAccess" ? "disabled" : "protected" });
        release();
        await rejected;
        expect(data.provider.listRemoteItems).toHaveBeenCalledTimes(stage === "provider" ? 1 : 0);
        expect(writing).not.toHaveBeenCalled();
      } else {
        release();
        expect((await pending).items).toHaveLength(data.remotes.length);
        expect(data.provider.listRemoteItems).toHaveBeenCalledTimes(1);
      }
      expect(databaseState(data)).toEqual(before);
    } finally { writing.mockRestore(); }
  });
}

function registerRefusesImportPlanningBeforeCredentialsUnderS() {
  it.each(["agentAccess"] as const)("refuses import planning before credentials under %s", async (safetySwitch) => {
    const data = await fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "off" }));
    const before = databaseState(data);
    const writing = vi.spyOn(data.unitOfWork, "run");
    try {
      await expect(planWorkItems(data.repository, data.unitOfWork, { actorType: "agent", actorId: "planning-host" }, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id, mode: "import" })).rejects.toMatchObject({ code: safetySwitch === "agentAccess" ? "disabled" : "protected" });
      expect(resolveProviderAuth).not.toHaveBeenCalled();
      expect(data.provider.listRemoteItems).not.toHaveBeenCalled();
      expect(writing).not.toHaveBeenCalled();
      expect(databaseState(data)).toEqual(before);
    } finally { writing.mockRestore(); }
  });
}

function registerRefusesAConflictDryRunRequestWithoutCapturedReview() {
  it("refuses a conflict Dry Run request without captured review values before any provider call", async () => {
    const data = await fixture();
    const entry = conflict(data, "description");
    const response = await data.server.inject({ method: "POST", url: "/api/sync/work-items/plan", payload: { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.card.id], conflictId: entry.id } });
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation", message: expect.stringMatching(/captured local and remote review values/) });
    expect(data.provider.getRemoteItem).not.toHaveBeenCalled();
    expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
    expect(data.repository.getSyncConflict(entry.id)).toEqual(entry);
  });
}

function registerRequiresExplicitRenewedReviewAfterDisplayedSResolutionEvidence() {
  it.each(["local", "remote"] as const)("requires explicit renewed review after displayed %s resolution evidence drifts", async (resolution) => {
    const data = await fixture();
    const entry = conflict(data, "description");
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, body: "New remote evidence" }));
    const payload = { storyMapId: data.map.id, resolution, reviewed: { localValue: entry.localValue, remoteValue: entry.remoteValue }, apply: false };
    const response = await data.server.inject({ method: "POST", url: `/api/sync/conflicts/${entry.id}/resolve`, payload });
    expect(response.statusCode, response.body).toBe(409);
    const current = response.json().conflicts[0].current;
    expect(current).toMatchObject({ id: entry.id, localValue: data.card.description, remoteValue: "New remote evidence" });
    expect(data.repository.getSyncConflict(entry.id)).toEqual(entry);
    expect(data.repository.listChangeSets(data.project.id)).toEqual([]);
    expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
    const renewed = await data.server.inject({ method: "POST", url: `/api/sync/conflicts/${entry.id}/resolve`, payload: { ...payload, reviewed: { localValue: current.localValue, remoteValue: current.remoteValue } } });
    expect(renewed.statusCode, renewed.body).toBe(200);
    expect(data.repository.getSyncConflict(entry.id)).toEqual(entry);
    expect(renewed.json()).toMatchObject(resolution === "remote" ? { outcome: "proposed", changeSet: { source: "github" } } : { plan: { selection: { conflictId: entry.id } } });
    expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  });
}

function registerRefusesARetargetedConflictConnectionBeforeCredentialsOrProvider() {
  it("refuses a retargeted conflict connection before credentials or provider access", async () => {
    const data = await fixture();
    const entry = conflict(data, "title");
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { owner: "retargeted" }));
    const response = await resolve(data, entry.id, "remote");
    expect(response.statusCode).toBe(409);
    expect(data.repository.getSyncConflict(entry.id)).toEqual(entry);
    expect(resolveProviderAuth).not.toHaveBeenCalled();
    expect(data.provider.getRemoteItem).not.toHaveBeenCalled();
  });
}

function registerRefusesLocalClosureWhenAPersistedProviderResultDoes() {
  it("refuses local closure when a persisted provider result does not agree with the actual chosen field", async () => {
    const data = await fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Local choice" }));
    const entry = conflict(data, "title", "Other remote value");
    const context = prepareConflictResolution(data.repository, data.unitOfWork, entry.id, { storyMapId: data.map.id, resolution: "local" });
    const before = databaseState(data);
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => persistConflictResolution(repository, context, { storyMapId: data.map.id, resolution: "local" }, data.remote))).toThrow("did not persist the chosen conflict field");
    expect(databaseState(data)).toEqual(before);
    expect(data.repository.getSyncConflict(entry.id)?.status).toBe("open");
  });
}

function registerAcceptsReorderedReviewedSObjectsAndRefusesRealDrift() {
  it.each(["status", "milestone"] as const)("accepts reordered reviewed %s objects and refuses real drift", async (field) => {
    const data = await fixture();
    if (field === "milestone") data.unitOfWork.run(ACTOR, ({ repository }) => {
      repository.updateConnectorConnection(data.connection.id, { releaseSource: "milestone" });
      const release = repository.createRelease({ storyMapId: data.map.id, name: "Reviewed Release", releaseDate: "2026-11-02" });
      repository.updateCard(data.card.id, { releaseId: release.id });
      repository.bindRemoteWorkItemLink({ provider: "github", connectionId: data.connection.id, releaseId: release.id, remoteId: "2", url: "https://github.com/owner/repo/milestone/2", labels: [], syncState: "synced" });
    });
    const remote = field === "milestone" ? { ...data.remote, milestoneDescription: "", milestoneState: "open", milestone: "Reviewed Release", milestoneNumber: 2, milestoneDueOn: "2026-11-02T00:00:00Z" } : data.remote;
    const entry = conflict(data, field);
    const context = prepareConflictResolution(data.repository, data.unitOfWork, entry.id, { storyMapId: data.map.id, resolution: "remote" });
    const current = changedFieldsForRemote(data.repository, context.connection, context.card, context.link, remote)[field];
    const reorder = (value: unknown): unknown => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
    const reviewed = { localValue: reorder(current.localValue), remoteValue: reorder(current.remoteValue) };
    expect(() => assertReviewedConflict(data.repository, context, reviewed, remote)).not.toThrow();
    const drifted = field === "milestone" ? { ...remote, milestoneDueOn: "2026-11-03T00:00:00Z" } : { ...remote, state: "closed" };
    expect(() => assertReviewedConflict(data.repository, context, reviewed, drifted)).toThrow("values changed");
  });
}

function registerAcceptsEquivalentMixedCaseProviderIdentityAndRefusesAnother() {
  it("accepts equivalent mixed-case provider identity and refuses another Issue or remote id", async () => {
    const data = await fixture();
    const entry = conflict(data, "title");
    const context = prepareConflictResolution(data.repository, data.unitOfWork, entry.id, { storyMapId: data.map.id, resolution: "remote" });
    const reviewed = { localValue: entry.localValue, remoteValue: entry.remoteValue };
    expect(() => assertReviewedConflict(data.repository, context, reviewed, { ...data.remote, url: "https://github.com/Owner/RePo/issues/1" })).not.toThrow();
    for (const remote of [{ ...data.remote, url: "https://github.com/other/repo/issues/1" }, { ...data.remote, url: "https://github.com/owner/repo/issues/2" }, { ...data.remote, remoteId: "2" }]) expect(() => assertReviewedConflict(data.repository, context, reviewed, remote)).toThrow("identity changed");
  });
}

async function testReportsDeletedLocalIdentitiesWithRetainedIssueLinksUsingLocalEvidence() {
  const data = await fixture();
  const card = data.repository.getCard(data.card.id)!;
  const deleted = await data.server.inject({ method: "POST", url: `/api/cards/${card.id}/delete`, payload: { baseVersion: card.version, strategy: "unassign" } });
  expect(deleted.statusCode, deleted.body).toBe(200);
  const report = getWorkItemSyncHealth(data, ACTOR, data.map.id);
  expect(report).toMatchObject({ totalLinks: 3, stateCounts: { local_deleted: 1 }, deletedLocalLinks: [{ entityType: "card", entityId: card.id, externalRefId: data.links[0]!.externalRefId, storyMapId: data.map.id, url: data.remote.url }] });
  expect(report.links).toHaveLength(2);
  expect(report.deletedLinks).toEqual(report.deletedLocalLinks);
  expect(data.repository.getCard(card.id)).toBeUndefined();
  expect(data.provider.getRemoteItem).not.toHaveBeenCalled();
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(resolveProviderAuth).not.toHaveBeenCalled();
}

async function testPreservesOriginalConflictEvidenceAndHealthThroughRepeatedPullsAndConvergence() {
  const data = await fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Local disagreement" }));
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Remote disagreement" }));
  await syncWorkItems(data.repository, data.unitOfWork, ACTOR, input(data));
  const original = data.repository.listOpenSyncConflicts(data.map.id);
  expect(original).toMatchObject([{ externalRefId: data.links[0]!.externalRefId, field: "title", localValue: "Local disagreement", remoteValue: "Remote disagreement" }]);
  await syncWorkItems(data.repository, data.unitOfWork, ACTOR, input(data));
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Local disagreement" }));
  await syncWorkItems(data.repository, data.unitOfWork, ACTOR, input(data));
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual(original);
  expect(getWorkItemSyncHealth(data, ACTOR, data.map.id)).toMatchObject({ stateCounts: { conflict: 1 }, openConflicts: original });
  const unrelated = await data.server.inject({ method: "PATCH", url: `/api/cards/${data.card.id}`, payload: { baseVersion: data.repository.getCard(data.card.id)!.version, estimate: 13 } });
  expect(unrelated.statusCode).toBe(200);
  const refused = await data.server.inject({ method: "PATCH", url: `/api/cards/${data.card.id}`, payload: { baseVersion: data.card.version, title: "Refused" } });
  expect(refused.statusCode).toBe(409);
  expect(refused.json().conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "sync", syncConflictId: original[0]!.id }), expect.objectContaining({ baseVersion: data.card.version, currentVersion: data.repository.getCard(data.card.id)!.version })]));
  expect(data.repository.getCard(data.card.id)?.title).toBe("Local disagreement");
}

async function testResolvesOnlyTheChosenRemoteFieldWhileAnotherConflictRemainsOpen() {
  const data = await fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Local title", description: "Local body" }));
  const titleConflict = conflict(data, "title");
  const bodyConflict = conflict(data, "description", "Remote body");
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Remote title", body: "Remote body", state: "closed", labels: ["done-a", "done-b"], assignee: "remote-user" }));
  expect((await resolve(data, bodyConflict.id, "remote")).statusCode).toBe(200);
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Local title", description: "Remote body", status: "Closed" });
  expect(data.repository.getCardDetails(data.card.id)?.assignee).not.toBe("remote-user");
  expect(data.repository.getSyncConflict(titleConflict.id)?.status).toBe("open");
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ titleHash: hashText(data.card.title), remoteState: "closed", statusEvidence: { issueState: "closed", name: "Closed" }, syncState: "conflict" });
  await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input(data), localOrigin: "http://127.0.0.1:4317" });
  expect(data.repository.getCardDetails(data.card.id)?.title).toBe("Local title");
  expect(data.repository.getSyncConflict(titleConflict.id)?.status).toBe("open");
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
}

async function testKeepsAnIndependentLocalTitlePendingReviewAfterRemoteBodyResolution() {
  const data = await fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Local title", description: "Local body" }));
  const entry = conflict(data, "description", "Remote body");
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, body: "Remote body" }));
  expect((await resolve(data, entry.id, "remote")).statusCode).toBe(200);
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Local title", description: "Remote body" });
  expect(getWorkItemSyncHealth(data, ACTOR, data.map.id).links[0]?.syncState).toBe("unsynced");
  const result = await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input(data), localOrigin: "http://127.0.0.1:4317" });
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Local title", description: "Remote body" });
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]?.syncState).toBe("unsynced");
}

async function testLocalResolutionPreparesTheChosenFieldWhilePreservingUnrelatedRemoteEdits() {
  const data = await fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.card.id, { title: "Independent local title", description: "Chosen local body" }));
  const entry = conflict(data, "description", "Remote body");
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Independent remote title", body: "Remote body", state: "closed", labels: ["done-a", "done-b", "external"], milestoneDescription: "", milestoneState: "open", milestone: "Remote milestone", milestoneNumber: 99 }));
  const response = await resolve(data, entry.id, "local");
  expect(response.statusCode).toBe(200);
  expect(response.json().plan.items[0].payload).toMatchObject({ title: "Independent remote title", body: buildGitHubIssueBody({ ...data.card, description: "Chosen local body" }, data.map.name, { origin: "http://127.0.0.1:4317", projectId: data.project.id }), remoteState: "closed", labels: ["done-a", "done-b", "external"] });
  expect(data.repository.getSyncConflict(entry.id)?.status).toBe("open");
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.repository.getCardDetails(data.card.id)?.title).toBe("Independent local title");
}

async function testReturns409WhenTheCardEndpointEditsACardDuringConflict() {
  const data = await fixture();
  const entry = conflict(data, "description");
  let newerCard: unknown;
  data.provider.getRemoteItem.mockImplementation(async () => {
    const edited = await data.server.inject({ method: "PATCH", url: `/api/cards/${data.card.id}`, payload: { title: "Newer endpoint title", baseVersion: data.repository.getCard(data.card.id)!.version } });
    expect(edited.statusCode).toBe(200);
    newerCard = edited.json();
    return remoteReadFixture({ ...data.remote, body: "Prepared remote body" });
  });
  expect((await resolve(data, entry.id, "remote")).statusCode).toBe(409);
  expect(data.repository.getCardDetails(data.card.id)).toEqual(newerCard);
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Newer endpoint title", description: data.card.description });
  expect(data.repository.getSyncConflict(entry.id)?.status).toBe("open");
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
}

async function testNormalizesImportedRemoteTitlePrefixesWithoutHidingALegitimateLocalPrefix() {
  const data = await fixture();
  const imported = { ...data.remote, remoteId: "99", remoteNumber: 99, title: "EXT-99: Imported title", labels: ["ready", "level:activity"], url: "https://github.com/owner/repo/issues/99" };
  data.provider.listRemoteItems.mockResolvedValue([imported]);
  const importedResult = await importWorkItems(data.repository, data.unitOfWork, ACTOR, input(data));
  const card = data.repository.getCardDetails(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).filter((link) => link.remoteId === "99")[0]!.cardId!)!;
  expect(card.title).toBe("Imported title");
  expect(importedResult).toMatchObject({ outcome: "applied", items: [{ remoteId: "99" }] });
  expect(importedResult).not.toHaveProperty("results");
  expect(importWorkItemsResponseSchema.parse(importedResult)).toEqual(importedResult);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).filter((link) => link.remoteId === "99")[0]?.titleHash).toBe(hashText(card.title));
  expect(getWorkItemSyncHealth(data, ACTOR, data.map.id).links.find((link) => link.remoteId === "99")?.syncState).toBe("synced");
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(imported));
  await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input(data), cardIds: [card.id] });
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(card.id, { title: "CUSTOM-7: Legitimate local title" }));
  expect(getWorkItemSyncHealth(data, ACTOR, data.map.id).links.find((link) => link.remoteId === "99")?.syncState).toBe("unsynced");
  await syncWorkItems(data.repository, data.unitOfWork, ACTOR, { ...input(data), cardIds: [card.id] });
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.repository.getCardDetails(card.id)?.title).toBe("CUSTOM-7: Legitimate local title");
  expect(getWorkItemSyncHealth(data, ACTOR, data.map.id).links.find((link) => link.remoteId === "99")?.syncState).toBe("unsynced");
}
