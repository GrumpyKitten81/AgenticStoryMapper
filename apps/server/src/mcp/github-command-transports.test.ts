import type { StoryMap, ConnectorConnection, Project, StoryMapSnapshot } from "@storymapper/contracts";
import type { WorkItemProvider } from "@storymapper/github";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { IncomingGitHubCommandResponse, McpHostConfigsResponse } from "@storymapper/contracts";
import { installRuntimePort } from "@storymapper/server/config/runtime-port";
import { reviewedPushProviderFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { FastifyInstance } from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository } from "@storymapper/db";
import { createWorkItemProvider } from "@storymapper/github";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { buildServer } from "@storymapper/server/server";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(), resolveGitHubAuth: vi.fn(), githubCredentialStatuses: vi.fn(async () => []) }));

let server: FastifyInstance;
let directory: string;
afterEach(async () => { await server?.close(); vi.clearAllMocks(); vi.unstubAllEnvs(); if (directory) rmSync(directory, { recursive: true, force: true }); });

for (const surface of ["sdk", "http"] as const) for (const stage of ["credentials", "provider"] as const) for (const flag of ["agentAccess", "github"] as const) {
  it(`refuses ${surface} GitHub application when ${flag} changes during ${stage}`, async () => {
    directory = mkdtempSync(join(tmpdir(), "github-command-transport-"));
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
    const project = (await http("/api/projects")).projects[0];
    const map = await http("/api/story-maps", "POST", { projectId: project.id, name: "Transport reviewed map" });
    const { connection } = await http("/api/connectors/connections", "POST", { projectId: project.id, provider: "github", name: "Reviewed connection", authMode: "token", owner: "owner", repository: "repo" });
    await http(`/api/settings/safety?projectId=${project.id}`, "PATCH", { github: true, agentMode: "apply" });
    const before = await http(`/api/story-maps/${map.id}`);
    let entered!: () => void;
    let resume!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const suspended = new Promise<void>((resolve) => { resume = resolve; });
    vi.mocked(resolveProviderAuth).mockImplementation(async (value) => { if (stage === "credentials") { entered(); await suspended; } return { connection: value, auth: {} }; });
    const provider = { ...reviewedPushProviderFixture(), validateConnection: vi.fn(), listRemoteItems: vi.fn(async () => { if (stage === "provider") { entered(); await suspended; } return []; }), getRemoteItem: vi.fn(), createOrUpdateRemoteItem: vi.fn() };
    vi.mocked(createWorkItemProvider).mockReturnValue(provider);
    const client = new Client({ name: "github-wire-host", version: "1.0" });
    await assertDisabledGitHubTransport(origin, surface, client, map, connection, started, http, project, flag, resume, provider, stage, before, databasePath);
  });
}

it("imports and pulls through the actual stdio bridge with separate local approval and no remote writes", async () => {
  const { http, project, databasePath } = await exerciseImportsAndPullsThroughTheActualStdioBridgeWith();
  const map = await http("/api/story-maps", "POST", { projectId: project.id, name: "Stdio incoming map" });
  const { connection } = await http("/api/connectors/connections", "POST", { projectId: project.id, provider: "github", name: "Read-only fixture", authMode: "token", owner: "owner", repository: "repo" });
  const { client, transport, call, apply, remote, provider } = await exerciseImportsAndPullsThroughTheActualStdioBridgeWith2(http, project);
  try {
    await client.connect(transport);
    const imported = await call("ImportGitHubIssues", { storyMapId: map.id, connectionId: connection.id, apply: false });
    expect(imported).toMatchObject({ outcome: "proposed", items: [{ status: "proposed", remoteId: "7" }] });
    expect((await http(`/api/story-maps/${map.id}`)).cards).toEqual([]);
    await apply(imported.changeSetId);
    const snapshot = await http(`/api/story-maps/${map.id}`);
    const card = snapshot.cards.find((row: { title: string }) => row.title === remote.title);
    expect(card).toMatchObject({ releaseId: null, description: remote.body });
    expect(snapshot.releases).toEqual([]);
    const pulled = await call("SyncGitHubLinks", { storyMapId: map.id, connectionId: connection.id, cardIds: [card.id], apply: false });
    expect(pulled.outcome).toBe("proposed");
    expect((await http(`/api/story-maps/${map.id}`)).cards.find((row: { id: string }) => row.id === card.id).description).toBe(remote.body);
    await apply(pulled.changeSetId);
    expect((await http(`/api/story-maps/${map.id}`)).cards.find((row: { id: string }) => row.id === card.id).description).toBe("Reviewed incoming Markdown");
    const beforeConflict = (await http(`/api/story-maps/${map.id}`)).cards.find((row: { id: string }) => row.id === card.id);
    await http(`/api/cards/${card.id}`, "PATCH", { baseVersion: beforeConflict.version, title: "Local stdio title" });
    provider.getRemoteItem.mockResolvedValue({ status: "found", item: { ...remote, title: "Remote stdio title", body: "Reviewed incoming Markdown" } });
    const conflicted = await call("SyncGitHubLinks", { storyMapId: map.id, connectionId: connection.id, cardIds: [card.id], apply: false });
    await apply(conflicted.changeSetId);
    const health = await http(`/api/sync/work-items/health?storyMapId=${map.id}`);
    expect(health.openConflicts).toMatchObject([{ field: "title", localValue: "Local stdio title", remoteValue: "Remote stdio title" }]);
    await http(`/api/settings/safety?projectId=${project.id}`, "PATCH", { agentMode: "apply" });
    const refused = await client.callTool({ name: "UpdateStoryMapCard", arguments: { cardId: card.id, baseVersion: beforeConflict.version, patch: { title: "Blocked" } } });
    expect(refused.isError).toBe(true);
    expect(JSON.parse((refused.content as Array<{ text: string }>)[0]!.text).conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "sync", syncConflictId: health.openConflicts[0].id }), expect.objectContaining({ baseVersion: beforeConflict.version, currentVersion: expect.any(Number) })]));
    const live = (await http(`/api/story-maps/${map.id}`)).cards.find((row: { id: string }) => row.id === card.id);
    await call("UpdateStoryMapCard", { cardId: card.id, baseVersion: live.version, patch: { estimate: 5 } });
    expect((await http(`/api/story-maps/${map.id}`)).cards.find((row: { id: string }) => row.id === card.id)).toMatchObject({ title: "Local stdio title", estimate: 5 });
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(provider.writeRemoteIssue).not.toHaveBeenCalled();
    await client.close();
    await server.close();
    verifyStdioIncomingAudit(databasePath, imported.changeSetId, pulled.changeSetId);
  } finally { await client.close(); }
});

async function assertDisabledGitHubTransport(origin: string, surface: string, client: Client, map: StoryMap, connection: ConnectorConnection, started: Promise<void>, http: <Result>(path: string, method?: string, body?: unknown) => Promise<Result>, project: Project, flag: string, resume: () => void, provider: WorkItemProvider, stage: string, before: StoryMapSnapshot, databasePath: string) {
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`));
  try {
    if (surface === "sdk") await client.connect(transport);
    const input = { storyMapId: map.id, connectionId: connection.id };
    const pending = surface === "sdk" ? client.callTool({ name: "ImportGitHubIssues", arguments: input }) : fetch(`${origin}/api/mcp/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "ImportGitHubIssues", input }) });
    await started;
    await http(`/api/settings/safety?projectId=${project.id}`, "PATCH", flag === "agentAccess" ? { agentMode: "off" } : { github: false });
    resume();
    const result = await pending;
    if (result instanceof Response) { expect(result.status).toBe(403); expect(await result.json()).toMatchObject({ code: "disabled" }); }
    else { expect(result.isError).toBe(true); expect(JSON.parse((result.content as Array<{ text: string; }>)[0]!.text)).toMatchObject({ code: "disabled" }); }
    expect(provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(provider.listRemoteItems).toHaveBeenCalledTimes(stage === "provider" ? 1 : 0);
    const after = await http<StoryMapSnapshot>(`/api/story-maps/${map.id}`);
    for (const key of ["cards", "releases", "githubLinks", "remoteWorkItemLinks"] as const) expect(after[key]).toEqual(before[key]);
    expect((await http<{ changeSets: unknown[] }>(`/api/changesets?projectId=${project.id}`)).changeSets).toEqual([]);
    expect(existsSync(join(directory, "snapshots"))).toBe(false);
    await server.close();
    const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
    try {
      const calls = new StoryMapperRepository(handle).listActivity(project.id).filter((event) => event.action === "tool_call" && event.affectedEntityId === "ImportGitHubIssues");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ actorType: "agent", ...(surface === "sdk" ? { actor: "github-wire-host", mcpSessionId: transport.sessionId } : {}), after: { outcome: "rejected", rejectionReason: "disabled" } });
    } finally { handle.current.$client.close(); }
  } finally { resume(); await client.close(); }
}

async function exerciseImportsAndPullsThroughTheActualStdioBridgeWith2(http: <Result>(path: string, method?: string, body?: unknown) => Promise<Result>, project: Project) {
  await http(`/api/settings/safety?projectId=${project.id}`, "PATCH", { github: true, agentMode: "propose" });
  vi.mocked(resolveProviderAuth).mockImplementation(async (value) => ({ connection: value, auth: {} }));
  const remote = { remoteId: "7", remoteNumber: 7, url: "https://github.com/owner/repo/issues/7", title: "Imported via stdio", body: "Authored Markdown", state: "open", labels: [], milestoneDescription: "", milestoneState: "open", milestone: "Remote milestone", milestoneNumber: 9 };
  const provider = { ...reviewedPushProviderFixture(), validateConnection: vi.fn(), listRemoteItems: vi.fn(async () => [remote]), getRemoteItem: vi.fn(async () => ({ status: "found" as const, item: { ...remote, body: "Reviewed incoming Markdown" } })), createOrUpdateRemoteItem: vi.fn() };
  vi.mocked(createWorkItemProvider).mockReturnValue(provider);
  const configs = await http("/api/mcp/host-configs") as McpHostConfigsResponse;
  const transport = new StdioClientTransport({ ...configs.production, cwd: directory, env: { PATH: process.env.PATH! }, stderr: "pipe" });
  const client = new Client({ name: "github-stdio-host", version: "1.0" });
  const call = async (name: string, input: Record<string, unknown>): Promise<IncomingGitHubCommandResponse> => {
    const response = await client.callTool({ name, arguments: input });
    expect(response.isError).not.toBe(true);
    return JSON.parse((response.content as Array<{ text: string; }>)[0]!.text);
  };
  const apply = async (id: string) => { await http(`/api/changesets/${id}/approve`, "POST", {}); await http(`/api/changesets/${id}/apply`, "POST", {}); };
  return { client, transport, call, apply, remote, provider };
}

async function exerciseImportsAndPullsThroughTheActualStdioBridgeWith() {
  directory = mkdtempSync(join(tmpdir(), "github-incoming-stdio-"));
  const databasePath = join(directory, "storymapper.sqlite");
  vi.stubEnv("STORYMAPPER_DB_PATH", databasePath);
  vi.stubEnv("LOG_LEVEL", "error");
  server = await buildServer({ development: true });
  const publish = installRuntimePort(server, databasePath, "127.0.0.1");
  const origin = await server.listen({ host: "127.0.0.1", port: 0 });
  publish();
  const http = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${origin}${path}`, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
    return response.json();
  };
  const project = (await http("/api/projects")).projects[0];
  return { http, project, databasePath };
}

function verifyStdioIncomingAudit(databasePath: string, importId: string, pullId: string): void {
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  try {
    const repository = new StoryMapperRepository(handle);
    expect(repository.getChangeSet(importId)?.proposedBy).toMatchObject({ actorType: "agent", actorId: "github-stdio-host", mcpSessionId: expect.any(String) });
    expect(repository.getChangeSet(pullId)?.execution?.actor).toMatchObject({ actorType: "github", actorId: "local-user" });
  } finally { handle.current.$client.close(); }
}
