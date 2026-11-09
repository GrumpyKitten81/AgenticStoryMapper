import type { FastifyInstance } from "fastify";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import Fastify, { type FastifyRequest } from "fastify";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { importProjectArchiveResponseSchema, mcpToolInputSchemas, mcpToolNameSchema, type Card, type ChangeSetCommandResponse, type McpHostConfigsResponse } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { McpToolRegistry } from "@storymapper/mcp";
import { installRuntimePort } from "@storymapper/server/config/runtime-port";
import { installRestoreRequestGate } from "@storymapper/server/http/restore-request-gate";
import { registerMcpHttp } from "@storymapper/server/mcp/http";
import { buildServer } from "@storymapper/server/server";

interface ProtocolResponse {
  id: number;
  result?: { prompts?: Array<{ name: string; arguments?: Array<{ name: string; required?: boolean }> }>; messages?: Array<{ content: { type: string; text?: string } }>; tools?: Array<{ name: string; inputSchema: unknown }>; content?: Array<{ type: string; text?: string }>; isError?: boolean };
  error?: unknown;
}

function protocol(child: ChildProcessWithoutNullStreams, timeout = 10_000) {
  const lines = createInterface({ input: child.stdout });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4096).replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g, "[REDACTED]");
  });
  const pending = new Map<number, { resolve: (response: ProtocolResponse) => void; reject: (error: Error) => void }>();
  const diagnosticError = (message: string) => new Error(`${message}${stderr ? `\n${stderr}` : ""}`);
  const fail = (error: Error) => { for (const request of pending.values()) request.reject(diagnosticError(error.message)); };
  child.once("error", fail);
  child.once("close", (code, signal) => fail(new Error(`Stdio exited: ${code ?? signal}`)));
  lines.on("line", (line) => {
    try {
      const response = JSON.parse(line) as ProtocolResponse;
      if (response.error) pending.get(response.id)?.reject(diagnosticError(JSON.stringify(response.error)));
      else pending.get(response.id)?.resolve(response);
    } catch (error) {
      if (error instanceof SyntaxError) fail(error);
      else throw error;
    }
  });
  return async (id: number, method: string, params: unknown): Promise<ProtocolResponse> => {
    const response = new Promise<ProtocolResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    const timer = setTimeout(() => pending.get(id)?.reject(diagnosticError(`Stdio ${method} timed out`)), timeout);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    try { return await response; }
    finally { clearTimeout(timer); pending.delete(id); }
  };
}

async function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  try { await exited; }
  finally { clearTimeout(timer); }
}

function toolResult<T>(response: ProtocolResponse): T {
  expect(response.result?.content?.[0]?.type).toBe("text");
  return JSON.parse(response.result!.content![0]!.text!) as T;
}

async function createBridgeCard(request: ReturnType<typeof protocol>, projectId: string): Promise<string> {
  const map = await request(20, "tools/call", { name: "CreateStoryMap", arguments: { projectId, name: "Bridge-created Map" } });
  expect(map.result?.isError).not.toBe(true);
  const storyMapId = toolResult<ChangeSetCommandResponse>(map).changeSet.execution!.operationResults[0]!.entityIds[0]!;
  const card = await request(21, "tools/call", { name: "CreateStoryMapCard", arguments: { storyMapId, level: "story", title: "Bridge-created Story" } });
  expect(card.result?.isError).not.toBe(true);
  return toolResult<ChangeSetCommandResponse>(card).changeSet.execution!.operationResults[0]!.entityIds[0]!;
}

async function rejectReplacementInitialization(child: ChildProcessWithoutNullStreams): Promise<void> {
  const lines = createInterface({ input: child.stdout });
  const received = once(lines, "line");
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 28, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "rejected-replacement-host", version: "1.0.0" } } })}\n`);
  try {
    expect(JSON.parse((await received)[0])).toMatchObject({ error: { code: expect.any(Number), message: expect.any(String) } });
  } finally { lines.close(); child.stdout.resume(); }
}

async function verifyBridgeSafety(base: string, request: ReturnType<typeof protocol>, projectId: string, cardId: string): Promise<void> {
  const settings = async (patch: Record<string, string | boolean>) => expect((await fetch(`${base}/api/settings/safety?projectId=${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })).status).toBe(200);
  await settings({ agentMode: "propose" });
  const protectedWrite = await request(22, "tools/call", { name: "UpdateStoryMapCard", arguments: { cardId, baseVersion: 1, patch: { title: "Protected bridge title" } } });
  expect(protectedWrite.result?.isError).not.toBe(true);
  expect(toolResult(protectedWrite)).toMatchObject({ outcome: "proposed", changeSet: { status: "proposed" } });
  await settings({ agentMode: "off" });
  const disabledRead = await request(23, "tools/call", { name: "GetStoryMapCardDetails", arguments: { cardId } });
  expect(disabledRead.result?.isError).toBe(true);
  expect(toolResult(disabledRead)).toMatchObject({ code: "disabled" });
  const disabledWrite = await request(24, "tools/call", { name: "CreateStoryMap", arguments: { projectId, name: "Disabled bridge Map" } });
  expect(disabledWrite.result?.isError).toBe(true);
  expect(toolResult(disabledWrite)).toMatchObject({ code: "disabled" });
  await settings({ agentMode: "apply" });
  const card = await request(25, "tools/call", { name: "GetStoryMapCardDetails", arguments: { cardId } });
  expect(toolResult<{ data: { card: Card } }>(card).data.card.title).toBe("Bridge-updated Story");
}

function verifyPersistedBridgeAudit(databasePath: string, projectId: string, cardId: string, sessions: string[]): void {
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  try {
    const repository = new StoryMapperRepository(handle);
    const events = repository.listActivity(projectId).filter((event) => event.action === "tool_call" && (event.after as { outcome: string }).outcome === "ok");
    for (const mcpSessionId of sessions) {
      expect(events.some((event) => event.mcpSessionId === mcpSessionId)).toBe(true);
      for (const event of events.filter((event) => event.mcpSessionId === mcpSessionId)) expect(event).toMatchObject({ actor: "inventory-test", actorType: "agent" });
    }
    const promptReads = repository.listActivity().filter((event) => event.action === "tool_call" && sessions.includes(event.mcpSessionId ?? "") && ["prompts/list", "prompts/get"].includes(event.affectedEntityId ?? ""));
    expect(promptReads.map((event) => event.affectedEntityId)).toEqual(expect.arrayContaining(["prompts/list", "prompts/get"]));
    expect(promptReads.every((event) => typeof (event.after as { outputHash?: unknown }).outputHash === "string")).toBe(true);
    expect(repository.getCardDetails(cardId)).toMatchObject({ title: "Bridge-restarted Story" });
    expect(repository.listCardHistory(cardId).at(-1)).toMatchObject({ actor: "inventory-test", actorType: "agent", mcpSessionId: sessions.at(-1) });
  } finally { handle.current.$client.close(); }
}

async function verifyArchiveSwitch(base: string, directory: string, projectId: string, request: ReturnType<typeof protocol>): Promise<void> {
  const exported = await fetch(`${base}/api/projects/export?projectId=${projectId}`);
  expect(exported.status).toBe(200);
  const archive = new FormData();
  archive.append("archive", new Blob([await exported.arrayBuffer()], { type: "application/zip" }), "runtime.zip");
  const response = await fetch(`${base}/api/projects/import`, { method: "POST", body: archive });
  expect(response.status).toBe(200);
  const imported = importProjectArchiveResponseSchema.parse(await response.json());
  const health = await (await fetch(`${base}/health`)).json();
  expect(health).toMatchObject({ runtimeDirectory: directory, databasePath: join(imported.localPath, "storymapper.sqlite") });
  const configurations = await (await fetch(`${base}/api/mcp/host-configs`)).json() as McpHostConfigsResponse;
  expect(configurations).toMatchObject({ runtimeDirectory: directory, databasePath: health.databasePath });
  expect(configurations.production.args[1]).toBe(directory);
  const existing = await request(6, "tools/call", { name: "ListProjects", arguments: {} });
  expect(JSON.parse(existing.result!.content![0]!.text!).data.projects.map((project: { id: string }) => project.id)).toEqual([projectId]);
  const command = configurations.cursor.mcpServers.storymapper;
  const child = spawn(command.command, command.args, { cwd: directory, env: { PATH: process.env.PATH }, stdio: "pipe" });
  const reopened = protocol(child);
  try {
    await reopened(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "archive-bridge-test", version: "1.0.0" } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const projects = await reopened(2, "tools/call", { name: "ListProjects", arguments: {} });
    expect(JSON.parse(projects.result!.content![0]!.text!).data.projects.map((project: { id: string }) => project.id)).toEqual([projectId]);
    const closed = once(child, "close");
    child.stdin.end();
    expect((await closed)[0]).toBe(0);
  } finally { await stop(child); }
  expect(existsSync(join(directory, ".port"))).toBe(true);
  expect(existsSync(join(imported.localPath, ".port"))).toBe(false);
}

it("forwards generated commands to the running writer through session expiry and archive hot-switch", async () => {
  const root = mkdtempSync(join(tmpdir(), "storymapper-stdio-"));
  const directory = join(root, "runtime.lsm");
  const originalPath = process.env.STORYMAPPER_DB_PATH;
  const originalLogLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "error";
  process.env.STORYMAPPER_DB_PATH = join(directory, "storymapper.sqlite");
  let server = await buildServer({ development: true });
  const publish = installRuntimePort(server, process.env.STORYMAPPER_DB_PATH, "127.0.0.1");
  let sessionId: string | undefined;
  const observeSession = async (request: FastifyRequest) => { if (typeof request.headers["mcp-session-id"] === "string") sessionId = request.headers["mcp-session-id"]; };
  var { request, child, base } = await exerciseForwardsGeneratedCommandsToTheRunningWriterThroughSession(server, observeSession, publish, directory);
  try {
    await exerciseForwardsGeneratedCommandsToTheRunningWriterThroughSession2(request, child);
    const created = await (await fetch(`${base}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Created by running app" }) })).json();
    const promptContext = { projectId: created.id, purpose: "Bridge context", keyFeatures: ["Bridge evidence"], glossary: "Bridge glossary", nonGoals: "Cloud", complianceConstraints: "Local" };
    expect((await fetch(`${base}/api/product-context`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(promptContext) })).status).toBe(200);
    const prompts = await request(40, "prompts/list", {});
    const promptName = `${created.id}:prd-to-map`;
    expect(prompts.result?.prompts).toEqual(expect.arrayContaining([expect.objectContaining({ name: promptName })]));
    const prompt = await request(41, "prompts/get", { name: promptName });
    await exerciseForwardsGeneratedCommandsToTheRunningWriterThroughSession5(prompt, base, created, promptContext, request);
    const cardId = await createBridgeCard(request, created.id);
    await rejectReplacementInitialization(child);
    const expiredSession = sessionId!;
    const recoveredSession = await exerciseForwardsGeneratedCommandsToTheRunningWriterThroughSession4(base, expiredSession, request, created, () => sessionId, cardId, directory);
    const previousAddress = base;
    const previousSession = sessionId;
    ({ server, base } = await exerciseForwardsGeneratedCommandsToTheRunningWriterThroughSession3(server, directory, observeSession, base, previousAddress, request, created, () => sessionId, previousSession, cardId, child, expiredSession, recoveredSession));
  } finally {
    await stop(child);
    await server.close();
    expect(existsSync(join(directory, ".port"))).toBe(false);
    if (originalPath === undefined) delete process.env.STORYMAPPER_DB_PATH;
    else process.env.STORYMAPPER_DB_PATH = originalPath;
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);

it("returns a correlated forward error during restore and processes the next request afterward", async () => {
  const root = mkdtempSync(join(tmpdir(), "storymapper-stdio-restore-gate-"));
  const directory = join(root, "runtime.lsm");
  mkdirSync(directory);
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  unitOfWork.run({ actorType: "human", actorId: "restore-bridge-test" }, ({ repository: transaction }) => transaction.createProjectWithGettingStarted({ name: "Restore bridge test" }));
  const server = Fastify();
  installRestoreRequestGate(server, handle);
  server.get("/health", async () => ({ ok: true, mode: "local", databasePath: path, runtimeDirectory: directory }));
  registerMcpHttp(server, repository, unitOfWork);
  const publish = installRuntimePort(server, path, "127.0.0.1");
  await server.listen({ host: "127.0.0.1", port: 0 });
  publish();
  const child = spawn(process.execPath, [join(process.cwd(), "../../scripts/mcp-bridge.mjs"), directory], { cwd: process.cwd(), env: { PATH: process.env.PATH }, stdio: "pipe" });
  const lines = createInterface({ input: child.stdout });
  const responses = new Map<number, { resolve: (response: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  lines.on("line", (line) => {
    const response = JSON.parse(line) as Record<string, unknown>;
    if (typeof response.id === "number") responses.get(response.id)?.resolve(response);
  });
  const rejectPending = (error: Error) => { for (const pending of responses.values()) pending.reject(error); };
  child.once("error", rejectPending);
  child.once("close", (code, signal) => rejectPending(new Error(`Bridge exited: ${code ?? signal}.`)));
  const exchange = (id: number, method: string, params: unknown) => new Promise<Record<string, unknown>>((resolve, reject) => {
    responses.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
  const release = (() => { let finish!: () => void; const promise = new Promise<void>((resolve) => { finish = resolve; }); return { promise, finish }; })();
  try {
    expect(await exchange(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "restore-gate", version: "1" } })).toMatchObject({ id: 1, result: expect.any(Object) });
    child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    const restoring = handle.restore(() => release.promise);
    expect(await exchange(2, "tools/list", {})).toMatchObject({ jsonrpc: "2.0", id: 2, error: { code: -32000 } });
    release.finish();
    await restoring;
    expect(await exchange(3, "tools/list", {})).toMatchObject({ jsonrpc: "2.0", id: 3, result: { tools: expect.any(Array) } });
    child.stdin.end();
    expect((await once(child, "close"))[0]).toBe(0);
  } finally {
    release.finish();
    lines.close();
    await stop(child);
    await server.close();
    handle.current.$client.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 10_000);

it("forwards concurrent messages during a read exceeding ten seconds and cleans up malformed input", async () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-bridge-concurrent-"));
  const previousPath = process.env.STORYMAPPER_DB_PATH;
  const previousLog = process.env.LOG_LEVEL;
  const { child, request, observe, base, server } = await exerciseForwardsConcurrentMessagesDuringAReadExceedingTenSeconds(directory);
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const original = McpToolRegistry.prototype.call;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const call = vi.spyOn(McpToolRegistry.prototype, "call").mockImplementationOnce(async function (this: McpToolRegistry, name, args) {
    entered();
    await new Promise((resolve) => setTimeout(resolve, 10_100));
    return original.call(this, name, args);
  });
  try {
    await request(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "concurrent-test", version: "1.0" } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const pending = request(2, "tools/call", { name: "ListProjects", arguments: {} });
    await started;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 999, reason: "delivery-test" } })}\n`);
    await vi.waitFor(() => expect(observe().notified).toBe(true), { timeout: 2000 });
    expect((await request(3, "tools/list", {})).result?.tools).toHaveLength(mcpToolNameSchema.options.length);
    expect((await pending).result?.isError).not.toBe(true);
    const wire = createInterface({ input: child.stdout });
    const invalid = once(wire, "line");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "invalid", id: 4, method: "ping" })}\n`);
    expect(JSON.parse((await invalid)[0])).toMatchObject({ jsonrpc: "2.0", error: expect.any(Object) });
    wire.close();
    child.stdout.resume();
    expect((await request(5, "tools/list", {})).result?.tools).toHaveLength(mcpToolNameSchema.options.length);
    const closed = once(child, "close");
    child.stdin.write("{malformed-private-marker\n");
    expect((await closed)[0]).toBe(1);
    expect(stderr).toContain("Invalid JSON-RPC input.");
    expect(stderr).not.toContain("malformed-private-marker");
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", "Mcp-Session-Id": observe().sessionId }, body: JSON.stringify({ jsonrpc: "2.0", id: 6, method: "tools/list" }) })).status).toBe(404);
  } finally {
    call.mockRestore();
    await stop(child);
    await server.close();
    if (previousPath === undefined) delete process.env.STORYMAPPER_DB_PATH; else process.env.STORYMAPPER_DB_PATH = previousPath;
    if (previousLog === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = previousLog;
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);

async function exerciseForwardsGeneratedCommandsToTheRunningWriterThroughSession5(prompt: ProtocolResponse, base: string, created: { id: string }, promptContext: { projectId: string; purpose: string; keyFeatures: string[]; glossary: string; nonGoals: string; complianceConstraints: string; }, request: (id: number, method: string, params: unknown) => Promise<ProtocolResponse>) {
  expect(prompt.result?.messages?.[1]?.content.text).toContain('"purpose": "Bridge context"');
  expect(prompt.result?.messages?.[2]?.content.text).toContain("Return a proposed Agentic Story Mapper ChangeSet only");
  const map = await (await fetch(`${base}/api/story-maps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: created.id, name: "Scoped prompt map" }) })).json();
  const scopedContext = { ...promptContext, storyMapId: map.id, purpose: "Exact bridge map context" };
  expect((await fetch(`${base}/api/product-context`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scopedContext) })).status).toBe(200);
  const custom = { projectId: created.id, id: "bridge-custom", name: "Bridge custom", instructions: "Inspect supplied evidence", arguments: [{ name: "evidence", required: true }] };
  expect((await fetch(`${base}/api/ai/templates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(custom) })).status).toBe(201);
  const customName = `${created.id}:${custom.id}`;
  expect((await request(42, "prompts/list", {})).result?.prompts).toEqual(expect.arrayContaining([expect.objectContaining({ name: customName, arguments: expect.arrayContaining([{ name: "evidence", required: true }]) })]));
  await expect(request(43, "prompts/get", { name: customName })).rejects.toThrow("Missing required prompt argument: evidence");
  const supplied = { evidence: 'Required "quoted"\nsecond line', storyMapId: map.id };
  const customPrompt = await request(44, "prompts/get", { name: customName, arguments: supplied });
  const populated = customPrompt.result!.messages![1]!.content.text!;
  expect(JSON.parse(populated.split("Supplied arguments:\n")[1]!.split("\nProduct Context")[0]!)).toEqual(supplied);
  expect(JSON.parse(populated.split("Product Context (Story Map scope):\n")[1]!)).toMatchObject(scopedContext);
}

async function exerciseForwardsGeneratedCommandsToTheRunningWriterThroughSession4(base: string, expiredSession: string, request: (id: number, method: string, params: unknown) => Promise<ProtocolResponse>, created: { id: string }, readSessionId: () => string | undefined, cardId: string, directory: string) {
  expect((await fetch(`${base}/mcp`, { method: "DELETE", headers: { "Mcp-Session-Id": expiredSession } })).status).toBe(200);
  const refreshed = await request(5, "tools/call", { name: "ListProjects", arguments: {} });
  expect(refreshed.result?.content?.[0]?.text).toContain(created.id);
  expect(readSessionId()).not.toBe(expiredSession);
  const recoveredSession = readSessionId()!;
  const updated = await request(26, "tools/call", { name: "UpdateStoryMapCard", arguments: { cardId, baseVersion: 1, patch: { title: "Bridge-updated Story" } } });
  expect(updated.result?.isError).not.toBe(true);
  expect(toolResult<ChangeSetCommandResponse>(updated)).toMatchObject({ outcome: "applied", changeSet: { operations: [expect.objectContaining({ after: { title: "Bridge-updated Story" } })] } });
  await verifyBridgeSafety(base, request, created.id, cardId);
  const rejected = await request(4, "tools/call", { name: "GetStoryMapCards", arguments: { storyMapId: "00000000-0000-0000-0000-000000000001" } });
  expect(rejected.result?.isError).toBe(true);
  const rejectionText = rejected.result?.content?.find((content) => content.type === "text")?.text;
  expect(JSON.parse(rejectionText!)).toMatchObject({ code: "not_found" });
  await verifyArchiveSwitch(base, directory, created.id, request);
  return recoveredSession;
}

async function exerciseForwardsGeneratedCommandsToTheRunningWriterThroughSession3(server: FastifyInstance, directory: string, observeSession: (request: FastifyRequest) => Promise<void>, base: string, previousAddress: string, request: (id: number, method: string, params: unknown) => Promise<ProtocolResponse>, created: { id: string }, readSessionId: () => string | undefined, previousSession: string | undefined, cardId: string, child: ChildProcessWithoutNullStreams, expiredSession: string, recoveredSession: string) {
  await server.close();
  expect(existsSync(join(directory, ".port"))).toBe(false);
  server = await buildServer({ development: true });
  const publishRestart = installRuntimePort(server, process.env.STORYMAPPER_DB_PATH!, "127.0.0.1");
  server.addHook("onRequest", observeSession);
  base = await server.listen({ host: "127.0.0.1", port: 0 });
  expect(base).not.toBe(previousAddress);
  publishRestart();
  const restarted = await request(7, "tools/call", { name: "ListProjects", arguments: {} });
  expect(restarted.result?.content?.[0]?.text).toContain(created.id);
  expect(readSessionId()).not.toBe(previousSession);
  const restartedSession = readSessionId()!;
  const restartedWrite = await request(27, "tools/call", { name: "UpdateStoryMapCard", arguments: { cardId, baseVersion: 2, patch: { title: "Bridge-restarted Story" } } });
  expect(restartedWrite.result?.isError).not.toBe(true);
  await stop(child);
  await server.close();
  verifyPersistedBridgeAudit(join(directory, "storymapper.sqlite"), created.id, cardId, [expiredSession, recoveredSession, restartedSession]);
  return { server, base };
}

async function exerciseForwardsGeneratedCommandsToTheRunningWriterThroughSession2(request: (id: number, method: string, params: unknown) => Promise<ProtocolResponse>, child: ChildProcessWithoutNullStreams) {
  await request(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "inventory-test", version: "1.0.0" } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const response = await request(2, "tools/list", {});
  expect(response.result?.tools).toHaveLength(mcpToolNameSchema.options.length);
  expect(response.result?.tools?.map(({ name }) => name).sort()).toEqual([...mcpToolNameSchema.options].sort());
  for (const tool of response.result!.tools!) {
    const schema = z.toJSONSchema(mcpToolInputSchemas[mcpToolNameSchema.parse(tool.name)], { io: "input" });
    expect(tool.inputSchema, tool.name).toEqual({ type: "object", ...schema });
  }
  const projects = await request(3, "tools/call", { name: "ListProjects", arguments: {} });
  expect(projects.result?.isError).not.toBe(true);
  const projectText = projects.result?.content?.find((content) => content.type === "text")?.text;
  expect(typeof projectText).toBe("string");
  expect(JSON.parse(projectText!).data.projects).toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.any(String), name: expect.any(String) })]));
}

async function exerciseForwardsGeneratedCommandsToTheRunningWriterThroughSession(server: FastifyInstance, observeSession: (request: FastifyRequest) => Promise<void>, publish: () => void, directory: string) {
  server.addHook("onRequest", observeSession);
  let base = await server.listen({ host: "127.0.0.1", port: 0 });
  publish();
  const configurations = await (await fetch(`${base}/api/mcp/host-configs`)).json() as McpHostConfigsResponse;
  expect(configurations.runtimeDirectory).toBe(directory);
  expect(configurations.cursor.mcpServers.storymapper).toEqual(configurations.claudeDesktop.mcpServers.storymapper);
  expect(configurations.vsCode.servers.storymapper).toEqual({ type: "stdio", ...configurations.production });
  const command = configurations.claudeDesktop.mcpServers.storymapper;
  const child = spawn(command.command, command.args, {
    cwd: directory,
    env: { PATH: process.env.PATH },
    stdio: "pipe"
  });

  const request = protocol(child);
  return { request, child, base };
}

async function exerciseForwardsConcurrentMessagesDuringAReadExceedingTenSeconds(directory: string) {
  process.env.STORYMAPPER_DB_PATH = join(directory, "storymapper.sqlite");
  process.env.LOG_LEVEL = "error";
  const server = await buildServer({ development: true });
  const publish = installRuntimePort(server, process.env.STORYMAPPER_DB_PATH, "127.0.0.1");
  let sessionId = "", notified = false;
  server.addHook("preHandler", async (request) => {
    if (typeof request.headers["mcp-session-id"] === "string") sessionId = request.headers["mcp-session-id"];
    if ((request.body as { method?: string; } | null)?.method === "notifications/cancelled") notified = true;
  });
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  publish();
  const configurations = await (await fetch(`${base}/api/mcp/host-configs`)).json() as McpHostConfigsResponse;
  const child = spawn(configurations.production.command, configurations.production.args, { cwd: directory, env: { PATH: process.env.PATH }, stdio: "pipe" });
  const request = protocol(child, 15000);
  return { child, request, observe: () => ({ notified, sessionId }), base, server };
}
