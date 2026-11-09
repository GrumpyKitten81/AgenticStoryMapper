import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { FastifyInstance } from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { changeSetCommandToolNames, importGitHubTicketResponseSchema, lookupGitHubTicketResponseSchema, type McpHostConfigsResponse } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository } from "@storymapper/db";
import { createWorkItemProvider } from "@storymapper/github";
import { installRuntimePort } from "@storymapper/server/config/runtime-port";
import { reviewedPushProviderFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { buildServer } from "@storymapper/server/server";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })), resolveGitHubAuth: vi.fn(), githubCredentialStatuses: vi.fn(async () => []) }));
let server: FastifyInstance;
let directory: string;
afterEach(async () => { await server?.close(); vi.clearAllMocks(); vi.unstubAllEnvs(); if (directory) rmSync(directory, { recursive: true, force: true }); });
const remote = { remoteId: "17", remoteNumber: 17, url: "https://github.com/owner/repo/issues/17", title: "Transport ticket", body: "Reviewed Markdown", labels: [], state: "open", issueType: "Bug" };

async function fixture() {
  directory = mkdtempSync(join(tmpdir(), "github-ticket-transports-"));
  const path = join(directory, "storymapper.sqlite");
  vi.stubEnv("STORYMAPPER_DB_PATH", path);
  vi.stubEnv("LOG_LEVEL", "error");
  server = await buildServer({ development: true });
  const publish = installRuntimePort(server, path, "127.0.0.1");
  const origin = await server.listen({ host: "127.0.0.1", port: 0 });
  publish();
  const request = (url: string, body: unknown, method = "POST") => fetch(`${origin}${url}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const http = async (url: string, body?: unknown, method = "POST") => {
    const response = body === undefined ? await fetch(`${origin}${url}`) : await request(url, body, method);
    expect(response.ok, await response.clone().text()).toBe(true);
    return response.json();
  };
  const projectId: string = (await http("/api/projects")).projects[0].id;
  const mapId: string = (await http("/api/story-maps", { projectId, name: "Ticket transport map" })).id;
  const connectionId: string = (await http("/api/connectors/connections", { projectId, name: "Read-only GitHub", provider: "github", owner: "owner", repository: "repo", authMode: "token" })).connection.id;
  await http(`/api/settings/safety?projectId=${projectId}`, { github: true, agentMode: "propose" }, "PATCH");
  const provider = { ...reviewedPushProviderFixture(), validateConnection: vi.fn(), listRemoteItems: vi.fn(), getRemoteItem: vi.fn(async () => ({ status: "found" as const, item: remote })), createOrUpdateRemoteItem: vi.fn() };
  vi.mocked(createWorkItemProvider).mockReturnValue(provider);
  const input = { storyMapId: mapId, connectionId, selector: "owner/repo#17", placement: { level: "activity", parentId: null, releaseId: null, position: 0 } };
  return { path, origin, http, request, projectId, mapId, connectionId, provider, input };
}

async function connect(f: Awaited<ReturnType<typeof fixture>>, surface: "human" | "http" | "sdk" | "stdio") {
  const client = new Client({ name: "ticket-wire-host", version: "1.0" });
  if (surface === "sdk") await client.connect(new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`)));
  if (surface === "stdio") {
    const configs = await f.http("/api/mcp/host-configs") as McpHostConfigsResponse;
    await client.connect(new StdioClientTransport({ ...configs.production, cwd: directory, env: { PATH: process.env.PATH! }, stderr: "pipe" }));
  }
  const call = async (name: "LookupGitHubTicket" | "ImportGitHubTicket", input: Record<string, unknown>) => {
    if (surface === "human") {
      const response = await f.request(`/api/sync/work-items/${name === "LookupGitHubTicket" ? "lookup-ticket" : "import-ticket"}`, input);
      return { error: !response.ok, data: await response.json() };
    }
    if (surface === "http") {
      const response = await f.request("/api/mcp/call", { name, input });
      const result = await response.json();
      return { error: !response.ok, data: response.ok ? result.data : result, envelope: result };
    }
    const response = await client.callTool({ name, arguments: input });
    const result = JSON.parse((response.content as Array<{ text: string }>)[0]!.text);
    return { error: !!response.isError, data: response.isError ? result : result.data, envelope: result };
  };
  return { client, call };
}

it.each(["human", "http", "sdk", "stdio"] as const)("retains protected %s ticket proposal then human-applies one durable attributed Card", async (surface) => {
  const f = await fixture();
  const c = await connect(f, surface);
  try {
    if (surface !== "human") {
      expect(changeSetCommandToolNames.has("ImportGitHubTicket")).toBe(true);
      expect((await f.http(`/api/mcp/tools?projectId=${f.projectId}`)).tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "ImportGitHubTicket", enabled: true })]));
      if (surface !== "http") expect((await c.client.listTools()).tools.map((tool) => tool.name)).toContain("ImportGitHubTicket");
    }
    const lookup = await c.call("LookupGitHubTicket", f.input);
    expect(lookup.error, JSON.stringify(lookup.data)).toBe(false);
    const reviewed = lookupGitHubTicketResponseSchema.parse(lookup.data);
    expect((await f.http(`/api/story-maps/${f.mapId}`)).cards).toEqual([]);
    const response = await c.call("ImportGitHubTicket", { ...f.input, reviewEvidence: reviewed.reviewEvidence, title: "Human final title", description: "Final Markdown" });
    expect(response.error, JSON.stringify(response.data)).toBe(false);
    if (surface !== "human") expect(response).toMatchObject({ envelope: { data: { outcome: "proposed" } } });
    const proposed = importGitHubTicketResponseSchema.parse(response.data);
    expect(proposed.outcome).toBe("proposed");
    if (proposed.outcome === "already_linked") throw new Error("Expected proposed import");
    expect(proposed.changeSet).toMatchObject({ source: "github", proposedBy: { actorType: surface === "human" ? "human" : "agent" } });
    expect((await f.http(`/api/story-maps/${f.mapId}`)).cards).toEqual([]);
    await f.http(`/api/changesets/${proposed.changeSetId}/approve`, {});
    await f.http(`/api/changesets/${proposed.changeSetId}/apply`, {});
    const repeated = await c.call("ImportGitHubTicket", { ...f.input, reviewEvidence: reviewed.reviewEvidence, title: "Duplicate ignored", description: "Duplicate ignored" });
    expect(repeated).toMatchObject({ error: false, data: { outcome: "already_linked", url: remote.url } });
    expect(f.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
    expect(f.provider.writeRemoteIssue).not.toHaveBeenCalled();
    await c.client.close();
    await server.close();
    const reopened = new DatabaseHandle(openStoryMapperDb(f.path));
    try {
      const repository = new StoryMapperRepository(reopened);
      const snapshot = repository.getStoryMapSnapshot(f.mapId)!;
      expect(snapshot.cards).toMatchObject([{ title: "Human final title", description: "Final Markdown", provenance: "linked" }]);
      expect(snapshot.githubLinks).toMatchObject([{ issueNumber: 17, url: remote.url }]);
      expect(snapshot.sourceLinks).toMatchObject([{ kind: "github", url: remote.url }]);
      expect(repository.getChangeSet(proposed.changeSetId)?.execution).toMatchObject({ actor: { actorType: "github", actorId: "local-user" }, restorePoint: expect.any(String) });
      if (surface !== "human") expect(repository.listActivity(f.projectId).filter((event) => event.action === "tool_call" && event.affectedEntityId === "ImportGitHubTicket")).toHaveLength(2);
    } finally { reopened.current.$client.close(); }
  } finally { await c.client.close(); }
});

for (const surface of ["http", "sdk"] as const) for (const tool of ["LookupGitHubTicket", "ImportGitHubTicket"] as const) for (const denied of ["github", "agentAccess", "foreign", "foreignParent", "foreignRelease"] as const) {
  it(`authorizes actual owning Project before ${surface} ${tool} ${denied} access`, async () => {
    const f = await fixture();
    const reviewed = await f.http("/api/sync/work-items/lookup-ticket", f.input);
    let input: Record<string, unknown> = f.input;
    if (denied === "foreign" || denied === "foreignParent" || denied === "foreignRelease") {
      const project = await f.http("/api/projects", { name: "Foreign disabled Project" });
      if (denied === "foreign") input = { ...f.input, connectionId: (await f.http("/api/connectors/connections", { projectId: project.id, name: "Foreign GitHub", provider: "github", owner: "owner", repository: "repo", authMode: "token" })).connection.id };
      else {
        const map = await f.http("/api/story-maps", { projectId: project.id, name: "Foreign placement Map" });
        const target = denied === "foreignParent" ? await f.http("/api/cards", { storyMapId: map.id, level: "activity", title: "Foreign parent" }) : await f.http("/api/releases", { storyMapId: map.id, name: "Foreign Release" });
        input = { ...f.input, placement: denied === "foreignParent" ? { ...f.input.placement, level: "step", parentId: target.id } : { ...f.input.placement, releaseId: target.id } };
      }
    } else {
      if (denied === "agentAccess") {
        const project = await f.http("/api/projects", { name: "Separate accessible Project" });
        await f.http(`/api/settings/safety?projectId=${project.id}`, { github: true, agentMode: "apply" }, "PATCH");
      }
      await f.http(`/api/settings/safety?projectId=${f.projectId}`, denied === "agentAccess" ? { agentMode: "off" } : { github: false }, "PATCH");
    }
    vi.mocked(resolveProviderAuth).mockClear();
    vi.mocked(createWorkItemProvider).mockClear();
    f.provider.getRemoteItem.mockClear();
    const c = await connect(f, surface);
    try {
      const response = await c.call(tool, tool === "LookupGitHubTicket" ? input : { ...input, reviewEvidence: reviewed.reviewEvidence, title: "Refused", description: "Refused" });
      expect(response).toMatchObject({ error: true, data: { code: "disabled" } });
      expect(resolveProviderAuth).not.toHaveBeenCalled();
      expect(createWorkItemProvider).not.toHaveBeenCalled();
      expect(f.provider.getRemoteItem).not.toHaveBeenCalled();
      expect((await f.http(`/api/story-maps/${f.mapId}`)).cards).toEqual([]);
      expect((await f.http(`/api/changesets?projectId=${f.projectId}`)).changeSets).toEqual([]);
    } finally { await c.client.close(); }
  });
}

it.each(["human", "http", "sdk"] as const)("rejects forged fields and Note import at the actual %s shared-schema boundary", async (surface) => {
  const f = await fixture();
  const c = await connect(f, surface);
  try {
    const inputs = [
      { name: "LookupGitHubTicket" as const, input: { ...f.input, projectId: f.projectId } },
      { name: "LookupGitHubTicket" as const, input: { ...f.input, placement: { ...f.input.placement, level: "note" } } },
      { name: "ImportGitHubTicket" as const, input: { ...f.input, reviewEvidence: { epoch: "forged", scopeHash: "a".repeat(64), remoteHash: "b".repeat(64) }, title: "Forged", description: "Forged", remote: remote } }
    ];
    for (const row of inputs) expect(await c.call(row.name, row.input)).toMatchObject({ error: true, data: { code: "validation" } });
    expect(resolveProviderAuth).not.toHaveBeenCalled();
    expect(createWorkItemProvider).not.toHaveBeenCalled();
    expect((await f.http(`/api/story-maps/${f.mapId}`)).cards).toEqual([]);
  } finally { await c.client.close(); }
});
