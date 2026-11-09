import { reviewedPushProviderFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { remoteReadFixture } from "@storymapper/server/fixtures/remote-read";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { FastifyInstance } from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { changeOperationSchema, type ChangeSetCommandResponse, type ConnectorConnection, type SyncPlan, type RemoteIssuePayload } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository } from "@storymapper/db";
import { createWorkItemProvider, type RemoteWorkItem } from "@storymapper/github";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { buildServer } from "@storymapper/server/server";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })), resolveGitHubAuth: vi.fn(), githubCredentialStatuses: vi.fn(async () => []) }));

let server: FastifyInstance;
let directory: string;
afterEach(async () => { await server?.close(); vi.clearAllMocks(); vi.unstubAllEnvs(); if (directory) rmSync(directory, { recursive: true, force: true }); });

async function fixture(protection = false) {
  directory = mkdtempSync(join(tmpdir(), "github-sdk-positive-"));
  const databasePath = join(directory, "storymapper.sqlite");
  vi.stubEnv("STORYMAPPER_DB_PATH", databasePath);
  vi.stubEnv("LOG_LEVEL", "error");
  server = await buildServer({ development: true });
  const origin = await server.listen({ host: "127.0.0.1", port: 0 });
  const http = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${origin}${path}`, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    expect(response.ok, `${method} ${path}: ${response.status} ${response.ok ? "" : await response.clone().text()}`).toBe(true);
    return response.json();
  };
  const projectId: string = (await http("/api/projects")).projects[0].id;
  const mapId: string = (await http("/api/story-maps", "POST", { projectId, name: "SDK GitHub map" })).id;
  const connection: ConnectorConnection = (await http("/api/connectors/connections", "POST", { projectId, provider: "github", name: "GitHub", authMode: "token", owner: "owner", repository: "repo", readOnly: false, issueTypeMapping: [{ cardType: "task", issueType: "Task" }] })).connection;
  await http(`/api/settings/safety?projectId=${projectId}`, "PATCH", { github: true, agentMode: protection ? "propose" : "apply" });
  const client = new Client({ name: "github-sdk-positive-host", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`));
  await client.connect(transport);
  const actor = { actorType: "agent", actorId: "github-sdk-positive-host", mcpSessionId: transport.sessionId! } as const;
  const call = async (name: string, input: Record<string, unknown>): Promise<ChangeSetCommandResponse> => {
    const result = await client.callTool({ name, arguments: input });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    return JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as ChangeSetCommandResponse;
  };
  return { origin, databasePath, projectId, mapId, connection, http, client, actor, call };
}

function providerFixture(remote: RemoteWorkItem) {
  const provider = { ...reviewedPushProviderFixture(),
    readPushInputs: vi.fn(async () => ({ writable: true, issueTypes: ["Task"], labels: ["local-story-map", "status:todo", "story-map:LSM", "level:activity"], milestones: [] })),
    findRemoteItemsByMarker: vi.fn(async () => ({ complete: true as const, matches: [] })),
    writeRemoteIssue: vi.fn(async (_connection, _auth, sent: RemoteIssuePayload) => ({ ...remote, title: sent.title, body: sent.body, labels: sent.labels, state: sent.remoteState, issueType: sent.issueType, milestone: undefined, milestoneNumber: undefined })),
    validateConnection: vi.fn(), listRemoteItems: vi.fn(async () => [remote]), getRemoteItem: vi.fn(async () => remoteReadFixture(remote)), createOrUpdateRemoteItem: vi.fn() };
  vi.mocked(createWorkItemProvider).mockReturnValue(provider);
  return provider;
}

async function inspectPersisted(databasePath: string, inspect: (repository: StoryMapperRepository) => void): Promise<void> {
  await server.close();
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  try { inspect(new StoryMapperRepository(handle)); } finally { handle.current.$client.close(); }
}

const remote: RemoteWorkItem = { remoteId: "17", remoteNumber: 17, title: "SDK imported issue", body: "Reviewed remote description", state: "open", labels: [], url: "https://github.com/owner/repo/issues/17", milestoneDescription: "", milestoneState: "open", milestone: "SDK milestone", milestoneNumber: 3 };

it("retains combined field/version disputes through human HTTP and actual SDK while unrelated fields remain editable", async () => {
  const f = await fixture();
  const provider = providerFixture(remote);
  try {
    await f.http("/api/sync/work-items/import", "POST", { storyMapId: f.mapId, connectionId: f.connection.id });
    const card = (await f.http(`/api/story-maps/${f.mapId}`)).cards.find((row: { title: string }) => row.title === remote.title);
    await f.http(`/api/cards/${card.id}`, "PATCH", { baseVersion: card.version, title: "Local title" });
    provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...remote, title: "Remote title" }));
    const input = { storyMapId: f.mapId, connectionId: f.connection.id, cardIds: [card.id] };
    await f.call("SyncGitHubLinks", input);
    await f.call("SyncGitHubLinks", input);
    const calls = provider.getRemoteItem.mock.calls.length;
    const report = await f.http(`/api/sync/work-items/health?storyMapId=${f.mapId}`);
    expect(provider.getRemoteItem).toHaveBeenCalledTimes(calls);
    expect(report.openConflicts).toMatchObject([{ field: "title", localValue: "Local title", remoteValue: "Remote title" }]);
    expect(report.stateCounts.conflict).toBe(1);
    const http = await fetch(`${f.origin}/api/cards/${card.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseVersion: card.version, title: "Blocked" }) });
    expect(http.status).toBe(409);
    const required = [expect.objectContaining({ reason: "sync", syncConflictId: report.openConflicts[0].id }), expect.objectContaining({ baseVersion: card.version, currentVersion: expect.any(Number) })];
    expect((await http.json()).conflicts).toEqual(expect.arrayContaining(required));
    const refused = await f.client.callTool({ name: "UpdateStoryMapCard", arguments: { cardId: card.id, baseVersion: card.version, patch: { title: "Blocked" } } });
    expect(refused.isError).toBe(true);
    expect(JSON.parse((refused.content as Array<{ text: string }>)[0]!.text).conflicts).toEqual(expect.arrayContaining(required));
    const latest = (await f.http(`/api/story-maps/${f.mapId}`)).cards.find((row: { id: string }) => row.id === card.id);
    expect(await f.call("UpdateStoryMapCard", { cardId: card.id, baseVersion: latest.version, patch: { estimate: 8 } })).toMatchObject({ outcome: "applied" });
    expect((await f.http(`/api/story-maps/${f.mapId}`)).cards.find((row: { id: string }) => row.id === card.id)).toMatchObject({ title: "Local title", estimate: 8 });
    expect(provider.writeRemoteIssue).not.toHaveBeenCalled();
  } finally { await f.client.close(); }
});

it.each([false, true])("persists SDK GitHub import with protection=%s and truthful proposal/apply identity", async (protection) => {
  const f = await fixture(protection);
  const provider = providerFixture(remote);
  try {
    const command = await f.call("ImportGitHubIssues", { storyMapId: f.mapId, connectionId: f.connection.id });
    expect(command).toMatchObject({ outcome: protection ? "proposed" : "applied", changeSetId: command.changeSet.id, previewRef: { changeSetId: command.changeSet.id }, changeSet: { source: "github", proposedBy: f.actor } });
    expect(provider.listRemoteItems).toHaveBeenCalledWith(f.connection, {}, undefined);
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    if (protection) {
      expect(command.changeSet.execution).toBeUndefined();
      expect(existsSync(join(directory, "snapshots"))).toBe(false);
    } else {
      expect(command.changeSet.execution).toMatchObject({ actor: { ...f.actor, actorType: "github" }, initiatedBy: f.actor, restorePoint: expect.any(String) });
      expect(existsSync(join(directory, "snapshots", command.changeSet.execution!.restorePoint!))).toBe(true);
    }
    await f.client.close();
    await inspectPersisted(f.databasePath, (repository) => {
      expect(repository.getChangeSet(command.changeSetId)).toMatchObject({ source: "github", status: protection ? "proposed" : "applied", proposedBy: f.actor });
      const snapshot = repository.getStoryMapSnapshot(f.mapId)!;
      if (protection) {
        for (const values of [snapshot.cards, snapshot.releases, snapshot.githubLinks, snapshot.remoteWorkItemLinks]) expect(values).toEqual([]);
        expect(repository.getWorkItemSyncHealthData(f.mapId).runs).toEqual([]);
      } else {
        const link = snapshot.remoteWorkItemLinks.find((entry) => entry.remoteId === remote.remoteId)!;
        const card = repository.getCardDetails(link.cardId!)!;
        expect(card).toMatchObject({ title: remote.title, description: remote.body, provenance: "linked", creationOrigin: "inference" });
        expect(repository.listCardHistory(card.id).at(-1)).toMatchObject({ actorType: "github", actor: f.actor.actorId, mcpSessionId: f.actor.mcpSessionId });
        expect(snapshot.githubLinks).toMatchObject([{ cardId: card.id, issueNumber: remote.remoteNumber }]);
        expect(repository.getWorkItemSyncHealthData(f.mapId).runs).toMatchObject([{ mode: "import", status: "applied" }]);
      }
      const calls = repository.listActivity(f.projectId).filter((event) => event.action === "tool_call" && event.affectedEntityId === "ImportGitHubIssues");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ actorType: "agent", actor: f.actor.actorId, mcpSessionId: f.actor.mcpSessionId, after: { outcome: "ok", toolName: "ImportGitHubIssues" } });
    });
  } finally { await f.client.close(); }
});

it.each([["SyncGitHubLinks", false], ["SyncGitHubLinks", true], ["PullStoryMapGitHubLinks", false], ["PullStoryMapGitHubLinks", true]] as const)("routes SDK %s with protection=%s while retaining outgoing local fields for human confirmation", async (tool, protection) => {
  const f = await fixture();
  const provider = providerFixture(remote);
  try {
    await f.call("ImportGitHubIssues", { storyMapId: f.mapId, connectionId: f.connection.id });
    const snapshot = await f.http(`/api/story-maps/${f.mapId}`);
    const card = snapshot.cards.find((entry: { title: string }) => entry.title === remote.title);
    await f.http(`/api/cards/${card.id}`, "PATCH", { description: "Outgoing local description", baseVersion: card.version });
    provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...remote, title: "Incoming remote title" }));
    const snapshotsBefore = readdirSync(join(directory, "snapshots"));
    if (protection) await f.http(`/api/settings/safety?projectId=${f.projectId}`, "PATCH", { agentMode: "propose" });
    const command = await f.call(tool, tool === "SyncGitHubLinks" ? { storyMapId: f.mapId, connectionId: f.connection.id, cardIds: [card.id] } : { storyMapId: f.mapId, connectionIds: [f.connection.id] });
    expect(command).toMatchObject({ outcome: protection ? "proposed" : "applied", changeSet: { source: "github", proposedBy: f.actor } });
    if (protection) {
      expect(command.changeSet.execution).toBeUndefined();
      expect(readdirSync(join(directory, "snapshots"))).toEqual(snapshotsBefore);
    } else {
      expect(command.changeSet.execution).toMatchObject({ actor: { ...f.actor, actorType: "github" }, initiatedBy: f.actor, restorePoint: expect.any(String) });
      expect(existsSync(join(directory, "snapshots", command.changeSet.execution!.restorePoint!))).toBe(true);
    }
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    await f.client.close();
    await inspectPersisted(f.databasePath, (repository) => {
      expect(repository.getCardDetails(card.id)).toMatchObject({ title: protection ? remote.title : "Incoming remote title", description: "Outgoing local description", version: card.version + (protection ? 1 : 2) });
      expect(repository.listRemoteWorkItemLinksForStoryMap(f.mapId).filter((link) => link.cardId === card.id)).toMatchObject([{ syncState: protection ? "synced" : "unsynced", remoteId: remote.remoteId }]);
      if (!protection) expect(repository.listCardHistory(card.id).at(-1)).toMatchObject({ actorType: "github", actor: f.actor.actorId, mcpSessionId: f.actor.mcpSessionId });
      expect(repository.getWorkItemSyncHealthData(f.mapId).runs).toHaveLength(protection ? 1 : 2);
      const calls = repository.listActivity(f.projectId).filter((event) => event.action === "tool_call" && event.affectedEntityId === tool);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ actorType: "agent", actor: f.actor.actorId, mcpSessionId: f.actor.mcpSessionId, after: { outcome: "ok" } });
    });
  } finally { await f.client.close(); }
});

it("keeps SDK push as a persisted Dry Run until the separate human HTTP confirmation mutates the provider", async () => {
  const f = await fixture();
  const provider = providerFixture(remote);
  try {
    const card = await f.http("/api/cards", "POST", { storyMapId: f.mapId, level: "activity", cardType: "task", title: "Human-confirmed push", description: "Reviewed outgoing body" });
    vi.mocked(resolveProviderAuth).mockClear();
    const input = { storyMapId: f.mapId, connectionId: f.connection.id, cardIds: [card.id] };
    const dryRun = await f.call("PushCardsToGitHub", input);
    expect(dryRun).toMatchObject({ outcome: "proposed", plan: { mode: "push", items: [{ cardId: card.id, title: card.title }] }, changeSet: { proposedBy: f.actor } });
    expect(dryRun.changeSet.execution).toBeUndefined();
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(resolveProviderAuth).toHaveBeenCalledWith(f.connection);
    expect(provider.writeRemoteIssue).not.toHaveBeenCalled();
    expect(existsSync(join(directory, "snapshots"))).toBe(false);
    expect((await f.http(`/api/story-maps/${f.mapId}`)).remoteWorkItemLinks).toEqual([]);
    const unconfirmed = await fetch(`${f.origin}/api/sync/work-items/push`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    expect(unconfirmed.status).toBe(400);
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    const reviewed = await f.http("/api/sync/work-items/plan", "POST", { ...input, mode: "push" });
    expect(reviewed.plan.blockers).toEqual([]);
    expect(provider.writeRemoteIssue).not.toHaveBeenCalled();
    const confirmed = await f.http("/api/sync/work-items/confirm", "POST", { planId: reviewed.plan.id });
    expect(confirmed).toMatchObject({ execution: { status: "completed", items: [{ state: "succeeded", remoteId: remote.remoteId }] } });
    expect(provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
    expect(provider.writeRemoteIssue.mock.calls[0]?.[2]).toEqual(reviewed.plan.items[0].payload);
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    await f.client.close();
    await inspectPersisted(f.databasePath, (repository) => {
      const stored = repository.getChangeSet(dryRun.changeSetId)!;
      expect(stored).toMatchObject({ status: "proposed", proposedBy: f.actor });
      expect(changeOperationSchema.parse(stored.operations[0]).after).toMatchObject({ dryRunPlan: dryRun.plan });
      expect(repository.listRemoteWorkItemLinksForStoryMap(f.mapId)).toMatchObject([{ cardId: card.id, remoteId: remote.remoteId, syncState: "synced" }]);
      expect(repository.getWorkItemSyncHealthData(f.mapId).runs).toMatchObject([{ mode: "push", status: "applied" }]);
      expect(repository.getRemotePushPlan(reviewed.plan.id)?.execution.status).toBe("completed");
      const calls = repository.listActivity(f.projectId).filter((event) => event.action === "tool_call" && event.affectedEntityId === "PushCardsToGitHub");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ actorType: "agent", actor: f.actor.actorId, mcpSessionId: f.actor.mcpSessionId, after: { outcome: "ok" } });
    });
  } finally { await f.client.close(); }
});

it.each(["sdk", "http"] as const)("refuses protected %s Agent push before credentials/provider and without a command", async (surface) => {
  const f = await fixture(true);
  const provider = providerFixture(remote);
  try {
    const card = await f.http("/api/cards", "POST", { storyMapId: f.mapId, level: "activity", title: "Protected push", description: "Local description" });
    const before = await f.http(`/api/story-maps/${f.mapId}`);
    vi.mocked(resolveProviderAuth).mockClear();
    const input = { storyMapId: f.mapId, connectionId: f.connection.id, cardIds: [card.id] };
    if (surface === "sdk") {
      const result = await f.client.callTool({ name: "PushCardsToGitHub", arguments: input });
      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text)).toMatchObject({ code: "protected" });
    } else {
      const result = await fetch(`${f.origin}/api/mcp/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "PushCardsToGitHub", input }) });
      expect(result.status).toBe(403);
      expect(await result.json()).toMatchObject({ code: "protected" });
    }
    expect(resolveProviderAuth).not.toHaveBeenCalled();
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(provider.getRemoteItem).not.toHaveBeenCalled();
    expect(provider.listRemoteItems).not.toHaveBeenCalled();
    expect(existsSync(join(directory, "snapshots"))).toBe(false);
    await f.client.close();
    await inspectPersisted(f.databasePath, (repository) => {
      const snapshot = repository.getStoryMapSnapshot(f.mapId)!;
      for (const key of ["cards", "releases", "githubLinks", "remoteWorkItemLinks"] as const) expect(snapshot[key]).toEqual(before[key]);
      expect(repository.listChangeSets(f.projectId)).toEqual([]);
      expect(repository.getWorkItemSyncHealthData(f.mapId).runs).toEqual([]);
      const calls = repository.listActivity(f.projectId).filter((event) => event.action === "tool_call" && event.affectedEntityId === "PushCardsToGitHub");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ actorType: "agent", ...(surface === "sdk" ? { actor: f.actor.actorId, mcpSessionId: f.actor.mcpSessionId } : {}), after: { outcome: "rejected", rejectionReason: "protected" } });
    });
  } finally { await f.client.close(); }
});

it("deduplicates one Issue across two connections and refuses another Card owner through HTTP and SDK", async () => {
  const f = await fixture();
  const provider = providerFixture(remote);
  try {
    await f.http("/api/sync/work-items/import", "POST", { storyMapId: f.mapId, connectionId: f.connection.id });
    const second: ConnectorConnection = (await f.http("/api/connectors/connections", "POST", { projectId: f.projectId, provider: "github", name: "Same repository", authMode: "token", owner: "owner", repository: "repo", readOnly: false, issueTypeMapping: [{ cardType: "task", issueType: "Task" }] })).connection;
    const before = await f.http(`/api/story-maps/${f.mapId}`);
    await f.call("ImportGitHubIssues", { storyMapId: f.mapId, connectionId: second.id });
    const repeated = await f.http(`/api/story-maps/${f.mapId}`);
    expect(repeated.cards).toEqual(before.cards);
    expect(repeated.externalRefs.filter((ref: { system: string }) => ref.system === "github")).toEqual(before.externalRefs.filter((ref: { system: string }) => ref.system === "github"));
    expect(repeated.githubLinks).toHaveLength(1);
    expect(repeated.remoteWorkItemLinks).toHaveLength(1);
    expect(repeated.remoteWorkItemLinks[0]).toMatchObject({ connectionId: f.connection.id, externalRefId: repeated.githubLinks[0].id });
    const other = await f.http("/api/cards", "POST", { storyMapId: f.mapId, level: "activity", title: "Different owner" });
    const input = { cardId: other.id, repo: "owner/repo", issueNumber: 17, url: remote.url };
    const response = await fetch(`${f.origin}/api/github/links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    expect(response.status).toBe(409);
    const result = await f.client.callTool({ name: "CreateGitHubLink", arguments: input });
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text)).toMatchObject({ code: "conflict" });
    const after = await f.http(`/api/story-maps/${f.mapId}`);
    expect(after.githubLinks).toEqual(repeated.githubLinks);
    expect(after.remoteWorkItemLinks).toEqual(repeated.remoteWorkItemLinks);
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  } finally { await f.client.close(); }
});

it("refuses source-only outbound ownership through HTTP and SDK before credentials or provider calls", async () => {
  const f = await fixture();
  const provider = providerFixture(remote);
  try {
    const card = await f.http("/api/cards", "POST", { storyMapId: f.mapId, level: "activity", title: "Source only" });
    await f.http("/api/github/links", "POST", { cardId: card.id, repo: "owner/repo", issueNumber: 17, url: remote.url });
    const input = { storyMapId: f.mapId, connectionId: f.connection.id, cardIds: [card.id] };
    const response = await fetch(`${f.origin}/api/sync/work-items/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, mode: "push" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "conflict", message: expect.stringContaining("source-only") });
    const result = await f.client.callTool({ name: "PushCardsToGitHub", arguments: input });
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text)).toMatchObject({ code: "conflict", message: expect.stringContaining("source-only") });
    const after = await f.http(`/api/story-maps/${f.mapId}`);
    expect(after.githubLinks).toHaveLength(1);
    expect(after.remoteWorkItemLinks).toEqual([]);
    expect(resolveProviderAuth).not.toHaveBeenCalled();
    expect(createWorkItemProvider).not.toHaveBeenCalled();
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  } finally { await f.client.close(); }
});

it.each(["http", "sdk"] as const)("refuses forged adapter authority, reserved ref deletion and canonical source unlink through %s submission", async (surface) => {
  const f = await fixture();
  providerFixture(remote);
  try {
    const card = await f.http("/api/cards", "POST", { storyMapId: f.mapId, level: "activity", title: "Reserved identity" });
    const { link } = await f.http("/api/github/links", "POST", { cardId: card.id, repo: "owner/repo", issueNumber: 17, url: remote.url });
    const before = await f.http(`/api/story-maps/${f.mapId}`);
    const submit = async (input: Record<string, unknown>) => {
      if (surface === "http") {
        const response = await fetch(`${f.origin}/api/mcp/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "SubmitChangeSet", input }) });
        return response.json();
      }
      const result = await f.client.callTool({ name: "SubmitChangeSet", arguments: input });
      expect(result.isError).toBe(true);
      return JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    };
    const adapter = { operationId: "claim-adapter", op: "create", entity: "githubExternalRef", after: { entityType: "card", entityId: card.id, scopeId: f.mapId, externalId: remote.url } };
    const input = { projectId: f.projectId, title: "Claim adapter authority", operations: [adapter] };
    expect(await submit({ ...input, source: "github" })).toMatchObject({ code: "validation" });
    expect(await submit({ ...input, sources: [{ kind: "github", externalRefId: link.id }] })).toMatchObject({ code: "protected" });
    expect(await submit({ ...input, operations: [{ operationId: "reserved-delete", op: "delete", entity: "externalRef", entityId: link.id, after: {} }] })).toMatchObject({ code: "validation", message: expect.stringContaining("reserved") });
    expect(await submit({ ...input, operations: [{ operationId: "canonical-unlink", op: "unlink", entity: "sourceLink", entityId: "source", after: { kind: "github", cardId: card.id, id: link.id } }] })).toMatchObject({ code: "protected", message: expect.stringContaining("Canonical GitHub") });
    const after = await f.http(`/api/story-maps/${f.mapId}`);
    expect(after.cards).toEqual(before.cards);
    expect(after.externalRefs).toEqual(before.externalRefs);
    expect(after.sourceLinks).toEqual(before.sourceLinks);
    expect(after.remoteWorkItemLinks).toEqual([]);
    expect(resolveProviderAuth).not.toHaveBeenCalled();
    expect(createWorkItemProvider).not.toHaveBeenCalled();
  } finally { await f.client.close(); }
});

it("refuses public human mutations of a canonical owner in a removed Map while retaining its readable source identity", async () => {
  const f = await fixture();
  try {
    const owner = await f.http("/api/cards", "POST", { storyMapId: f.mapId, level: "activity", title: "Retained owner" });
    const { link } = await f.http("/api/github/links", "POST", { cardId: owner.id, repo: "owner/repo", url: remote.url });
    const map = await f.http(`/api/story-maps/${f.mapId}`);
    await f.http(`/api/story-maps/${f.mapId}?baseVersion=${map.storyMap.version}`, "DELETE", {});
    const before = await f.http(`/api/activity?projectId=${f.projectId}`);
    for (const method of ["PATCH", "DELETE"]) {
      const response = await fetch(`${f.origin}/api/github/links/${link.id}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(method === "PATCH" ? { url: "https://github.com/owner/repo/issues/18" } : {}) });
      expect(response.status).toBe(404);
    }
    expect(await f.http(`/api/activity?projectId=${f.projectId}`)).toEqual(before);
    await f.client.close();
    await inspectPersisted(f.databasePath, (repository) => expect(repository.getGitHubLink(link.id)).toMatchObject({ cardId: owner.id, url: remote.url }));
  } finally { await f.client.close(); }
});

it.each(["human", "mcp"] as const)("imports mapped Notes as source-only identity alongside other items through %s", async (path) => {
  const f = await fixture();
  try {
    await f.http(`/api/connectors/connections/${f.connection.id}`, "PATCH", { typeMapping: [{ match: "note-label", level: "note" }] });
    const note = { ...remote, labels: ["note-label"], title: "Imported note", milestone: undefined, milestoneNumber: undefined };
    const story = { ...remote, remoteId: "18", remoteNumber: 18, url: "https://github.com/owner/repo/issues/18", title: "Imported story", milestone: undefined, milestoneNumber: undefined };
    const provider = providerFixture(note);
    provider.listRemoteItems.mockResolvedValue([note, story]);
    if (path === "human") {
      const result = await f.http("/api/sync/work-items/import", "POST", { storyMapId: f.mapId, connectionId: f.connection.id });
      expect(result).toMatchObject({ outcome: "applied" });
      expect(result.items).toEqual(expect.arrayContaining([expect.objectContaining({ remoteId: "17", status: "succeeded" }), expect.objectContaining({ remoteId: "18", status: "succeeded" })]));
    } else expect((await f.call("ImportGitHubIssues", { storyMapId: f.mapId, connectionId: f.connection.id })).outcome).toBe("applied");
    const board = await f.http(`/api/story-maps/${f.mapId}`);
    const importedNote = board.cards.find((card: { title: string }) => card.title === note.title);
    const importedStory = board.cards.find((card: { title: string }) => card.title === story.title);
    expect(importedNote).toMatchObject({ level: "note", provenance: "linked" });
    expect(importedStory).toMatchObject({ level: "story", provenance: "linked" });
    expect(board.sourceLinks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "github", cardId: importedNote.id, url: note.url })]));
    expect(board.githubLinks).toEqual(expect.arrayContaining([expect.objectContaining({ cardId: importedNote.id, url: note.url })]));
    expect(board.remoteWorkItemLinks).toEqual([expect.objectContaining({ cardId: importedStory.id })]);
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  } finally { await f.client.close(); }
});

it.each(["human", "sdk"] as const)("keeps protected %s incoming import separate from human approval and Apply", async (surface) => {
  const f = await fixture(true);
  const provider = providerFixture(remote);
  try {
    const input = { storyMapId: f.mapId, connectionId: f.connection.id, apply: false };
    const result = surface === "human" ? await f.http("/api/sync/work-items/import", "POST", input) : await f.call("ImportGitHubIssues", input);
    expect(result).toMatchObject({ outcome: "proposed", items: [{ status: "proposed", remoteId: remote.remoteId }] });
    expect((await f.http(`/api/story-maps/${f.mapId}`)).cards).toEqual([]);
    expect(existsSync(join(directory, "snapshots"))).toBe(false);
    await f.http(`/api/changesets/${result.changeSetId}/approve`, "POST", {});
    await f.http(`/api/changesets/${result.changeSetId}/apply`, "POST", {});
    const snapshot = await f.http(`/api/story-maps/${f.mapId}`);
    const imported = snapshot.cards.find((card: { title: string }) => card.title === remote.title);
    expect(imported).toMatchObject({ releaseId: null, provenance: "linked" });
    expect(snapshot.releases).toEqual([]);
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(provider.writeRemoteIssue).not.toHaveBeenCalled();
    await f.client.close();
    await inspectPersisted(f.databasePath, (repository) => {
      const applied = repository.getChangeSet(result.changeSetId)!;
      expect(applied.execution).toMatchObject({ actor: { actorType: "github", actorId: "local-user" }, restorePoint: expect.any(String) });
      expect(applied.proposedBy?.actorType).toBe(surface === "human" ? "human" : "agent");
    });
  } finally { await f.client.close(); }
});
