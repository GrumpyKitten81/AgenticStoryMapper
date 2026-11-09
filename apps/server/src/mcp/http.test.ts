import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { FastifyInstance } from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { mcpToolInputSchemas, mcpToolNameSchema, type Card, type ChangeSetCommandResponse, type Project, type StoryMap } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository } from "@storymapper/db";
import { McpToolRegistry } from "@storymapper/mcp";
import { installRuntimePort } from "@storymapper/server/config/runtime-port";
import * as promptHandlers from "@storymapper/server/application/ai/prompts";
import { buildServer } from "@storymapper/server/server";

let server: FastifyInstance;
let directory: string;
let rootDirectory: string;
let base: string;
afterEach(async () => { await server?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); if (rootDirectory) rmSync(rootDirectory, { recursive: true, force: true }); });

async function fixture(publishPort = false): Promise<Project> {
  rootDirectory = mkdtempSync(join(tmpdir(), "storymapper-http-mcp-"));
  directory = join(rootDirectory, "runtime.lsm");
  vi.stubEnv("STORYMAPPER_DB_PATH", join(directory, "storymapper.sqlite"));
  vi.stubEnv("LOG_LEVEL", "error");
  server = await buildServer({ development: true });
  const publish = publishPort ? installRuntimePort(server, join(directory, "storymapper.sqlite"), "127.0.0.1") : undefined;
  base = await server.listen({ host: "127.0.0.1", port: 0 });
  publish?.();
  return (await (await fetch(`${base}/api/projects`)).json()).projects[0];
}

async function request(body: unknown, sessionId?: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}), ...headers }, body: JSON.stringify(body) });
}

const INITIALIZE = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "http-test", version: "1.0" } } };

function toolResult<T>(result: { content?: unknown }): T {
  expect(Array.isArray(result.content)).toBe(true);
  const content = result.content as Array<{ type: string; text: string }>;
  expect(content[0]?.type).toBe("text");
  return JSON.parse(content[0]!.text) as T;
}

async function changeSafety(projectId: string, patch: Record<string, string | boolean>): Promise<void> {
  const response = await fetch(`${base}/api/settings/safety?projectId=${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  expect(response.status).toBe(200);
}

it("serves SDK discovery and calls with stateful runtime sessions and the manifest inventory", async () => {
  const project = await fixture();
  const client = new Client({ name: "sdk-test", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  try {
    await client.connect(transport);
    expect(transport.sessionId).toEqual(expect.any(String));
    const result = await client.listTools();
    expect(result.tools).toHaveLength(mcpToolNameSchema.options.length);
    expect(result.tools.map((tool) => tool.name).sort()).toEqual([...mcpToolNameSchema.options].sort());
    expect(result.tools.find((tool) => tool.name === "ImportSourceDocument")?.inputSchema).toMatchObject({ required: expect.arrayContaining(["content"]), properties: { content: { type: "string", pattern: "\\S" } } });
    for (const tool of result.tools) {
      const schema = mcpToolInputSchemas[mcpToolNameSchema.parse(tool.name)];
      expect(tool.inputSchema, tool.name).toEqual({ type: "object", ...z.toJSONSchema(schema, { io: "input" }) });
    }
    const call = await client.callTool({ name: "ListProjects", arguments: {} });
    expect(call.isError).not.toBe(true);
    expect(call.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining(project.id) })]));
    const sessionId = transport.sessionId!;
    await transport.terminateSession();
    expect((await request({ jsonrpc: "2.0", id: 2, method: "tools/list" }, sessionId)).status).toBe(404);
  } finally { await client.close(); }
});

it("requires non-empty inline Source content on the wire and preserves human HTTP file imports", async () => {
  const project = await fixture();
  const filePath = join(rootDirectory, "human-requirements.txt");
  const fileContent = "Human file requirement.";
  writeFileSync(filePath, fileContent);
  const client = new Client({ name: "inline-source-host", version: "1.0" });
  const input = { projectId: project.id, title: "Agent source", type: "txt" };
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    for (const fields of [{}, { content: "" }, { content: " \n " }, { filePath }, { content: "Agent inline content", filePath }]) {
      const result = await client.callTool({ name: "ImportSourceDocument", arguments: { ...input, ...fields } });
      expect(result.isError).toBe(true);
      expect(toolResult(result)).toMatchObject({ code: "validation" });
    }
    const unsupported = await client.callTool({ name: "ImportSourceDocument", arguments: { ...input, type: "docx", content: "Document" } });
    expect(unsupported.isError).toBe(true);
    expect(toolResult(unsupported)).toMatchObject({ code: "validation" });
    expect(toolResult<{ data: { documents: unknown[] } }>(await client.callTool({ name: "ListSourceDocuments", arguments: { projectId: project.id } })).data.documents).toEqual([]);
    for (const type of ["markdown", "txt"]) {
      const content = " \n# Inline requirement\n\nPreserve the supplied source content.\n ";
      const result = await client.callTool({ name: "ImportSourceDocument", arguments: { ...input, type, content } });
      expect(result.isError).not.toBe(true);
      const command = toolResult<ChangeSetCommandResponse>(result);
      expect(command).toMatchObject({ outcome: "applied", changeSetId: command.changeSet.id, previewRef: { changeSetId: command.changeSet.id } });
      const documentId = command.changeSet.execution!.operationResults[0]!.entityIds[0]!;
      const stored = await (await fetch(`${base}/api/source-documents/${documentId}`)).json();
      expect(stored.document.filePath).toBe("inline://agent-source");
      expect(stored.document.fileHash).toBe(createHash("sha256").update(content).digest("hex"));
      expect(stored.chunks.map((chunk: { text: string }) => chunk.text).join("\n")).toContain("Preserve the supplied source content.");
      expect(command.changeSet.operations[0]).toMatchObject({ after: { inlineContent: content } });
    }
    const humanImport = await fetch(`${base}/api/source-documents/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, title: "Human source", filePath }) });
    expect(humanImport.status).toBe(201);
    expect((await humanImport.json()).document).toMatchObject({ filePath, fileHash: createHash("sha256").update(fileContent).digest("hex") });
  } finally { await client.close(); }
});

it("forwards existing and new SDK write arguments and persists the host and session", async () => {
  const project = await fixture();
  const client = new Client({ name: "persisted-http-host", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  let cardId = "";
  try {
    await client.connect(transport);
    const createdMap = await client.callTool({ name: "CreateStoryMap", arguments: { projectId: project.id, name: "Wire-created Map" } });
    expect(createdMap.isError).not.toBe(true);
    const mapId = toolResult<ChangeSetCommandResponse>(createdMap).changeSet.execution!.operationResults[0]!.entityIds[0]!;
    const createdCard = await client.callTool({ name: "CreateStoryMapCard", arguments: { storyMapId: mapId, level: "story", title: "Wire-created Story" } });
    expect(createdCard.isError).not.toBe(true);
    cardId = toolResult<ChangeSetCommandResponse>(createdCard).changeSet.execution!.operationResults[0]!.entityIds[0]!;
    const updated = await client.callTool({ name: "UpdateStoryMapCard", arguments: { cardId, baseVersion: 1, patch: { title: "Wire-updated Story" } } });
    expect(updated.isError).not.toBe(true);
    const status = await client.callTool({ name: "CreateWorkflowStatus", arguments: { projectId: project.id, storyMapId: mapId, name: "Wire status", group: "todo" } });
    expect(status.isError).not.toBe(true);
    const read = await client.callTool({ name: "GetStoryMapCardDetails", arguments: { cardId } });
    expect(toolResult<{ data: { card: Card } }>(read).data.card).toMatchObject({ id: cardId, title: "Wire-updated Story" });
    const malformed = await client.callTool({ name: "CreateStoryMap", arguments: { projectId: project.id, name: "" } });
    expect(malformed.isError).toBe(true);
    expect(toolResult(malformed)).toMatchObject({ code: "validation", details: { issues: expect.arrayContaining([expect.objectContaining({ path: ["name"] })]) } });
    const missing = await client.callTool({ name: "GetStoryMapCards", arguments: { storyMapId: "00000000-0000-0000-0000-000000000001" } });
    expect(toolResult(missing)).toMatchObject({ code: "not_found" });
    const sessionId = transport.sessionId;
    await client.close();
    await server.close();
    const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
    try {
      const repository = new StoryMapperRepository(handle);
      expect(repository.getCardDetails(cardId)).toMatchObject({ title: "Wire-updated Story" });
      expect(repository.listCardHistory(cardId).at(-1)).toMatchObject({ actor: "persisted-http-host", actorType: "agent", mcpSessionId: sessionId });
      for (const name of ["CreateStoryMap", "CreateStoryMapCard", "UpdateStoryMapCard", "CreateWorkflowStatus"]) {
        expect(repository.listActivity(project.id).find((event) => event.action === "tool_call" && event.affectedEntityId === name)).toMatchObject({ actor: "persisted-http-host", actorType: "agent", mcpSessionId: sessionId, after: expect.objectContaining({ outcome: "ok" }) });
      }
    } finally { handle.current.$client.close(); }
  } finally { await client.close(); }
});

it("retains protected SDK proposals and refuses disabled targets before mutations", async () => {
  const project = await fixture();
  const client = new Client({ name: "safety-wire-host", version: "1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    await changeSafety(project.id, { agentMode: "propose" });
    const protectedCall = await client.callTool({ name: "CreateStoryMap", arguments: { projectId: project.id, name: "Protected wire Map" } });
    expect(protectedCall.isError).not.toBe(true);
    expect(toolResult(protectedCall)).toMatchObject({ outcome: "proposed", changeSet: { status: "proposed" } });
    await changeSafety(project.id, { agentMode: "off" });
    for (const name of ["ListStoryMaps", "CreateStoryMap"]) {
      const call = await client.callTool({ name, arguments: { projectId: project.id, name: "Disabled wire Map" } });
      expect(call.isError).toBe(true);
      expect(toolResult(call)).toMatchObject({ code: "disabled" });
    }
    const maps = await (await fetch(`${base}/api/story-maps?projectId=${project.id}`)).json();
    expect(JSON.stringify(maps)).not.toContain("Protected wire Map");
    expect(JSON.stringify(maps)).not.toContain("Disabled wire Map");
    const activity = await (await fetch(`${base}/api/activity?projectId=${project.id}`)).json();
    expect(activity.activityEvents).toEqual(expect.arrayContaining([expect.objectContaining({ actor: "safety-wire-host", actorType: "agent", action: "tool_call", toolCall: expect.objectContaining({ toolName: "CreateStoryMap", outcome: "rejected" }) })]));
  } finally { await client.close(); }
});

it("imports a real archive while the SDK's passive SSE connection remains open", async () => {
  const project = await fixture();
  const exported = await fetch(`${base}/api/projects/export?projectId=${project.id}`);
  const archive = new FormData();
  archive.append("archive", new Blob([await exported.arrayBuffer()], { type: "application/zip" }), "project.zip");
  let streamOpen = false;
  server.server.on("request", (request) => { if (request.method === "GET" && request.url === "/mcp") streamOpen = true; });
  const client = new Client({ name: "sse-import-test", version: "1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    await vi.waitFor(() => expect(streamOpen).toBe(true));
    const imported = await fetch(`${base}/api/projects/import`, { method: "POST", body: archive, signal: AbortSignal.timeout(2000) });
    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({ projectId: project.id, opened: true });
    expect((await client.callTool({ name: "ListProjects", arguments: {} })).isError).not.toBe(true);
  } finally { await client.close(); }
});

it("keeps the session usable after a DELETE with an unsupported protocol version", async () => {
  await fixture();
  const client = new Client({ name: "delete-test", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  try {
    await client.connect(transport);
    const rejected = await fetch(`${base}/mcp`, { method: "DELETE", headers: { "Mcp-Session-Id": transport.sessionId!, "MCP-Protocol-Version": "unsupported" } });
    expect(rejected.status).toBe(400);
    expect((await client.callTool({ name: "ListProjects", arguments: {} })).isError).not.toBe(true);
    await transport.terminateSession();
  } finally { await client.close(); }
});

it("drains executing POST calls before importing an archive", async () => {
  const project = await fixture();
  const exported = await fetch(`${base}/api/projects/export?projectId=${project.id}`);
  const archive = new FormData();
  archive.append("archive", new Blob([await exported.arrayBuffer()], { type: "application/zip" }), "project.zip");
  const original = McpToolRegistry.prototype.call;
  let release!: () => void, entered!: () => void;
  const suspended = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  vi.spyOn(McpToolRegistry.prototype, "call").mockImplementationOnce(async function (this: McpToolRegistry, name, args) { entered(); await suspended; return original.call(this, name, args); });
  const client = new Client({ name: "drain-import-test", version: "1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const call = client.callTool({ name: "ListProjects", arguments: {} });
    await started;
    let imported = false;
    const importing = fetch(`${base}/api/projects/import`, { method: "POST", body: archive }).then((response) => { imported = true; return response; });
    await vi.waitFor(async () => expect((await fetch(`${base}/health`)).status).toBe(503));
    expect(imported).toBe(false);
    release();
    expect((await call).isError).not.toBe(true);
    expect((await importing).status).toBe(200);
  } finally { release(); await client.close(); }
});

it("drains an outstanding SDK call before closing transports and removing the owned port file", async () => {
  const project = await fixture(true);
  const original = McpToolRegistry.prototype.call;
  let release!: () => void;
  const suspended = new Promise<void>((resolve) => { release = resolve; });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  vi.spyOn(McpToolRegistry.prototype, "call").mockImplementationOnce(async function (this: McpToolRegistry, name, args) { entered(); await suspended; return original.call(this, name, args); });
  const client = new Client({ name: "shutdown-test", version: "1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const call = client.callTool({ name: "ListProjects", arguments: {} });
    await started;
    const closed = server.close();
    expect(existsSync(join(directory, ".port"))).toBe(true);
    release();
    const result = await call;
    expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining(project.id) })]));
    await closed;
    expect(existsSync(join(directory, ".port"))).toBe(false);
  } finally { release(); await client.close(); }
});

it("rejects missing/unknown sessions and foreign Host/Origin on every MCP method", async () => {
  await fixture();
  expect((await request({ jsonrpc: "2.0", id: 2, method: "tools/list" })).status).toBe(400);
  expect((await request(null)).status).toBe(400);
  expect((await request(INITIALIZE, "unknown")).status).toBe(404);
  for (const method of ["GET", "POST", "DELETE"]) {
    for (const headers of [{ host: "foreign.example" }, { origin: "https://foreign.example" }]) {
      const response = await server.inject({ url: "/mcp", method: method as "GET" | "POST" | "DELETE", headers: { host: new URL(base).host, ...headers }, ...(method === "POST" ? { payload: INITIALIZE } : {}) });
      expect(response.statusCode).toBe(403);
    }
  }
  const initialized = await request(INITIALIZE);
  expect(initialized.status).toBe(200);
  const sessionId = initialized.headers.get("mcp-session-id")!;
  expect((await request({ jsonrpc: "2.0", id: 4, method: "missing-method" }, sessionId)).status).toBe(200);
  expect(await (await request({ jsonrpc: "2.0", id: 5, method: "missing-method" }, sessionId)).json()).toHaveProperty("error");
});

it("filters mixed Projects and refuses calls and new sessions as access switches change", async () => {
  const enabled = await fixture();
  const disabled = await (await fetch(`${base}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Disabled Project" }) })).json();
  const hiddenMap = await (await fetch(`${base}/api/story-maps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: disabled.id, name: "Disabled Map" }) })).json();
  expect((await fetch(`${base}/api/settings/safety?projectId=${disabled.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentMode: "off" }) })).status).toBe(200);
  const initialized = await request(INITIALIZE);
  const sessionId = initialized.headers.get("mcp-session-id")!;
  const list = await (await request({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ListProjects", arguments: {} } }, sessionId)).json();
  expect(JSON.stringify(list)).toContain(enabled.id);
  expect(JSON.stringify(list)).not.toContain(disabled.id);
  const maps = await (await request({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "ListStoryMaps", arguments: {} } }, sessionId)).json();
  expect(JSON.stringify(maps)).not.toContain(hiddenMap.id);
  const denied = await fetch(`${base}/api/mcp/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "ListStoryMaps", input: { projectId: disabled.id } }) });
  expect(denied.status).toBe(403);
  expect(await denied.json()).toMatchObject({ code: "disabled" });
  expect((await fetch(`${base}/api/settings/safety?projectId=${enabled.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentMode: "off" }) })).status).toBe(200);
  const empty = await (await request({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ListProjects", arguments: {} } }, sessionId)).json();
  expect(JSON.parse(empty.result.content[0].text).data.projects).toEqual([]);
  expect((await request(INITIALIZE)).status).toBe(403);
});

it("populates persisted Project prompts with exact context and rechecks access and declared arguments", async () => {
  const project = await fixture();
  const { template, http, other, map, values, foreignMap } = await exercisePopulatesPersistedProjectPromptsWithExactContextAndRechecks(project);
  const client = new Client({ name: "prompt-sdk-host", version: "1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const name = `${project.id}:custom-prompt`;
    const sessionTemplate = { ...template, id: "session-authored", name: "Created in session" };
    const sessionName = `${project.id}:${sessionTemplate.id}`;
    expect((await client.listPrompts()).prompts.some((prompt) => prompt.name === sessionName)).toBe(false);
    await http("/api/ai/templates", "POST", sessionTemplate);
    expect((await client.listPrompts()).prompts).toEqual(expect.arrayContaining([expect.objectContaining({ name: sessionName, title: `${project.name}: Created in session` })]));
    await http(`/api/projects/${project.id}/ai/templates/${sessionTemplate.id}`, "PATCH", { name: "Renamed in session", instructions: "Updated session instructions" });
    expect((await client.listPrompts()).prompts).toEqual(expect.arrayContaining([expect.objectContaining({ name: sessionName, title: `${project.name}: Renamed in session`, description: "Updated session instructions" })]));
    const sessionPrompt = await client.getPrompt({ name: sessionName, arguments: { evidence: "Evidence" } });
    expect(sessionPrompt.description).toBe("Renamed in session");
    expect(sessionPrompt.messages[0]!.content).toMatchObject({ text: expect.stringContaining("Updated session instructions") });
    await http(`/api/projects/${project.id}/ai/templates/${sessionTemplate.id}`, "DELETE", {});
    expect((await client.listPrompts()).prompts.some((prompt) => prompt.name === sessionName)).toBe(false);
    await expect(client.getPrompt({ name: sessionName, arguments: { evidence: "Evidence" } })).rejects.toThrow("not_found");
    const listed = await client.listPrompts();
    expect(listed.prompts.filter((prompt) => prompt.name.endsWith(":custom-prompt")).map((prompt) => prompt.name).sort()).toEqual([name, `${other.id}:custom-prompt`].sort());
    expect(listed.prompts.find((prompt) => prompt.name === name)?.arguments).toEqual(expect.arrayContaining([{ name: "evidence", description: "Source evidence", required: true }, expect.objectContaining({ name: "storyMapId", required: false })]));
    const evidence = 'Source "quoted"\nsecond line';
    const filled = await client.getPrompt({ name, arguments: { evidence, storyMapId: map.id } });
    const texts = filled.messages.map((message) => message.content.type === "text" ? message.content.text : "");
    expect(texts[0]).toContain(template.instructions);
    expect(texts[0]).toContain(JSON.stringify(template.examples, null, 2));
    expect(texts[0]).toContain(JSON.stringify(template.outputSchemaName));
    expect(JSON.parse(texts[1]!.split("Supplied arguments:\n")[1]!.split("\nProduct Context")[0]!)).toEqual({ evidence, storyMapId: map.id });
    expect(texts[1]).toContain('"purpose": "Map purpose"');
    expect(JSON.parse(texts[1]!.split("Product Context (Story Map scope):\n")[1]!)).toMatchObject({ ...values, purpose: "Map purpose" });
    const emptyMap = await http("/api/story-maps", "POST", { projectId: project.id, name: "Independent empty context" }) as StoryMap;
    const emptyScope = await client.getPrompt({ name, arguments: { evidence: "Evidence", storyMapId: emptyMap.id } });
    await exercisePopulatesPersistedProjectPromptsWithExactContextAndRechecks2(emptyScope, texts, client, name, foreignMap, project, other, map, http);
  } finally { await client.close(); }
});

it("retains complete Product Context and HTTP template edits and deletion across runtime reopen", async () => {
  const project = await fixture();
  const context = { projectId: project.id, productType: "Developer tool", purpose: "Persisted purpose", keyFeatures: ["Saved feature"], targetUsers: "Teams", platform: "Local", pricing: "Free", notes: "Saved notes", glossary: "Saved terms", nonGoals: "Cloud", complianceConstraints: "Private" };
  const template = { projectId: project.id, id: "reopen-template", name: "Original", instructions: "Propose changes.", arguments: [{ name: "evidence", required: true }], examples: ["Persisted guidance"], outputSchemaName: "ChangeSet" };
  const headers = { "Content-Type": "application/json" };
  expect((await fetch(`${base}/api/product-context`, { method: "PATCH", headers, body: JSON.stringify(context) })).status).toBe(200);
  expect((await fetch(`${base}/api/ai/templates`, { method: "POST", headers, body: JSON.stringify(template) })).status).toBe(201);
  expect((await fetch(`${base}/api/projects/${project.id}/ai/templates/${template.id}`, { method: "PATCH", headers, body: JSON.stringify({ name: "Persisted edit", outputSchemaName: null }) })).status).toBe(200);
  expect((await fetch(`${base}/api/projects/${project.id}/ai/templates/personas`, { method: "DELETE", headers, body: "{}" })).status).toBe(200);
  await server.close();
  server = await buildServer({ development: true });
  base = await server.listen({ host: "127.0.0.1", port: 0 });
  expect(await (await fetch(`${base}/api/product-context?projectId=${project.id}`)).json()).toMatchObject({ context });
  const saved = await (await fetch(`${base}/api/ai/templates?projectId=${project.id}`)).json();
  const { outputSchemaName, ...retainedTemplate } = template;
  const savedTemplate = saved.templates.find((item: { id: string }) => item.id === template.id);
  expect(savedTemplate).toMatchObject({ ...retainedTemplate, name: "Persisted edit" });
  expect(savedTemplate).not.toHaveProperty("outputSchemaName");
  expect(saved.templates.some((item: { id: string }) => item.id === "personas")).toBe(false);
  const client = new Client({ name: "reopen-host", version: "1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    expect(toolResult(await client.callTool({ name: "GetProductContext", arguments: { projectId: project.id } }))).toMatchObject({ data: { context } });
    expect((await client.getPrompt({ name: `${project.id}:${template.id}`, arguments: { evidence: "Source" } })).description).toBe("Persisted edit");
  } finally { await client.close(); }
});

it("maps prompt server failures to internal RPC errors and argument refusals to invalid params", async () => {
  const createHandlers = promptHandlers.createAiPromptHandlers;
  const failure = vi.spyOn(promptHandlers, "createAiPromptHandlers").mockImplementation((deps, actor) => ({ ...createHandlers(deps, actor), listPrompts: () => { throw new Error("Private template failure"); } }));
  const project = await fixture();
  const client = new Client({ name: "prompt-errors", version: "1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    await expect(client.getPrompt({ name: `${project.id}:missing` })).rejects.toMatchObject({ code: -32602, data: { code: "not_found" } });
    await expect(client.listPrompts()).rejects.toMatchObject({ code: -32603, data: { code: "internal", message: "An internal error occurred.", details: { errorId: expect.any(String) } } });
  } finally { failure.mockRestore(); await client.close(); }
});

async function exercisePopulatesPersistedProjectPromptsWithExactContextAndRechecks2(emptyScope: Awaited<ReturnType<Client["getPrompt"]>>, texts: string[], client: Client, name: string, foreignMap: StoryMap, project: Project, other: Project, map: StoryMap, http: (path: string, method: string, body: unknown) => Promise<unknown>) {
  expect(emptyScope.messages[1]!.content).toMatchObject({ text: expect.stringContaining('"purpose": ""') });
  expect(texts[2]).toContain("Never apply changes or directly write domain data");
  expect((await client.getPrompt({ name, arguments: { evidence: "Evidence" } })).messages[1]!.content).toMatchObject({ type: "text", text: expect.stringContaining('"purpose": "Project purpose"') });
  for (const arguments_ of [{}, { evidence: "Evidence", unknown: "Refused" }, { evidence: "Evidence", storyMapId: foreignMap.id }]) await expect(client.getPrompt({ name, arguments: arguments_ })).rejects.toThrow("validation");
  await expect(client.getPrompt({ name: `${project.id}:unknown` })).rejects.toThrow("not_found");
  await changeSafety(other.id, { agentMode: "off" });
  expect((await client.listPrompts()).prompts.some((prompt) => prompt.name.startsWith(`${other.id}:`))).toBe(false);
  await expect(client.getPrompt({ name: `${other.id}:custom-prompt`, arguments: { evidence: "Evidence" } })).rejects.toThrow("disabled");
  const before = await (await fetch(`${base}/api/story-maps/${map.id}`)).json();
  await client.getPrompt({ name, arguments: { evidence: "Evidence" } });
  expect(await (await fetch(`${base}/api/story-maps/${map.id}`)).json()).toEqual(before);
  await http(`/api/projects/${project.id}/ai/templates/custom-prompt`, "PATCH", { arguments: [{ name: "constructor", required: true }] });
  await expect(client.getPrompt({ name })).rejects.toThrow("Missing required prompt argument");
  await expect(client.getPrompt({ name, arguments: { constructor: "  " } })).rejects.toThrow("Missing required prompt argument");
  await changeSafety(project.id, { agentMode: "off" });
  expect((await client.listPrompts()).prompts).toEqual([]);
  await expect(client.getPrompt({ name, arguments: { evidence: "Evidence" } })).rejects.toThrow("disabled");
}

async function exercisePopulatesPersistedProjectPromptsWithExactContextAndRechecks(project: Project) {
  const http = async (path: string, method: string, body: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(response.ok).toBe(true);
    return response.json();
  };
  const other = await http("/api/projects", "POST", { name: "Other prompt Project" }) as Project;
  const map = await http("/api/story-maps", "POST", { projectId: project.id, name: "Prompt scope" }) as StoryMap;
  const foreignMap = await http("/api/story-maps", "POST", { projectId: other.id, name: "Foreign scope" }) as StoryMap;
  const values = { productType: "Developer tool", purpose: "Project purpose", keyFeatures: ["Traceability"], targetUsers: "Developers", platform: "Desktop", pricing: "Local", notes: "Notes", glossary: "Terms", nonGoals: "Cloud", complianceConstraints: "Local storage" };
  await http("/api/product-context", "PATCH", { projectId: project.id, ...values });
  await http("/api/product-context", "PATCH", { projectId: project.id, storyMapId: map.id, ...values, purpose: "Map purpose" });
  const template = { projectId: project.id, id: "custom-prompt", name: "Custom prompt", instructions: "Inspect evidence for proposed stories.", arguments: [{ name: "evidence", description: "Source evidence", required: true }], examples: ["Example \"quoted\"\nline"], outputSchemaName: "ChangeSet" };
  await http("/api/ai/templates", "POST", template);
  await http("/api/ai/templates", "POST", { ...template, projectId: other.id, instructions: "Other instructions" });
  return { template, http, other, map, values, foreignMap };
}
