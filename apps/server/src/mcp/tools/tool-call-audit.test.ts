import { splitTextIntoChunks } from "@storymapper/importers";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import Fastify from "fastify";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, expect, it, vi } from "vitest";
import { DomainError, toErrorResponse, activityQuerySchema, activityResponseSchema, toolCallMetadataSchema, type ActivityEvent, type LiveTransaction, type McpToolResult } from "@storymapper/contracts";
import { rejectSqliteWrite } from "@storymapper/db/test-fixtures/sqlite-write-failure";
import { DatabaseHandle, openExistingStoryMapperDb, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { registerMcpHttp } from "@storymapper/server/mcp/http";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";
import { exportAudit } from "@storymapper/server/application/export/export.use-cases";
import * as restorePointFiles from "@storymapper/db/restore-point-files";
import * as audit from "@storymapper/server/mcp/tools/audit-tool-call";

const human = { actorType: "human", actorId: "audit-fixture" } as const;
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close(); });

function fixture(afterCommit?: () => void, reportPublicationFailure?: (error: unknown) => void) {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-tool-audit-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle, afterCommit, undefined, reportPublicationFailure);
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Audit Project", localPath: "C:/private/audit-fixture.lsm" });
    const other = repository.createProject({ name: "Other Project" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Audit Map" });
    const otherMap = repository.createStoryMap({ projectId: other.id, name: "Other Map" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Audit Story" });
    const otherCard = repository.createCard({ storyMapId: otherMap.id, level: "story", title: "Other Story" });
    repository.updateSafetySettings(project.id, { agentMode: "apply" });
    return { project, other, map, card, otherCard };
  });
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "audit-host", mcpSessionId: "audit-session" });
  return { directory, path, handle, repository, unitOfWork, registry, ...rows };
}

function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex"); }
function calls(repository: StoryMapperRepository): ActivityEvent[] { return repository.listActivity().filter((event) => event.action === "tool_call"); }
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function seedLegacySourceLink(handle: DatabaseHandle, cardId: string, chunkId: string): void {
  handle.current.$client.prepare("INSERT INTO card_source_links (id, card_id, kind, chunk_id, created_at) VALUES (?, ?, 'chunk', ?, ?)").run(randomUUID(), cardId, chunkId, new Date().toISOString());
}

async function wireFixture(afterCommit?: () => void, reportPublicationFailure?: (error: unknown) => void) {
  const f = fixture(afterCommit, reportPublicationFailure);
  const server = Fastify();
  cleanup.push(() => server.close());
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository: f.repository, unitOfWork: f.unitOfWork, databasePath: f.path });
  registerMcpHttp(server, f.repository, f.unitOfWork);
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "regression-sdk-host", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  await client.connect(transport);
  cleanup.push(() => client.close());
  return { ...f, server, base, client, transport };
}

it("hashes deeply nested JSON arguments stack-safely on HTTP and initialized SDK sessions and persists each once", async () => {
  const f = await wireFixture();
  const argumentsJson = [
    '{"ignored":' + '{"nested":'.repeat(8000) + 'null' + '}'.repeat(8000) + '}',
    '{"ignored":' + '['.repeat(10000) + 'null' + ']'.repeat(10000) + '}'
  ];
  for (const [index, inputJson] of argumentsJson.entries()) for (const surface of ["http", "sdk"]) {
    const before = calls(f.repository).length;
    const response = await fetch(`${f.base}${surface === "http" ? "/api/mcp/call" : "/mcp"}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(surface === "sdk" ? { Accept: "application/json, text/event-stream", "Mcp-Session-Id": f.transport.sessionId! } : {}) },
      body: surface === "http" ? '{"name":"ListProjects","input":' + inputJson + '}' : '{"jsonrpc":"2.0","id":' + (900 + index) + ',"method":"tools/call","params":{"name":"ListProjects","arguments":' + inputJson + '}}'
    });
    expect(response.status).toBe(200);
    const wire = await response.json();
    const result = surface === "sdk" ? JSON.parse(wire.result.content[0].text) : wire;
    expect(calls(f.repository)).toHaveLength(before + 1);
    expect(calls(f.repository).at(-1)).toMatchObject({ after: expect.objectContaining({ outcome: "ok", inputHash: createHash("sha256").update(inputJson).digest("hex"), outputHash: hash(result) }) });
  }
  await f.client.close();
  await f.server.close();
  f.handle.current.$client.close();
  const reopened = openStoryMapperDb(f.path);
  try { expect(calls(new StoryMapperRepository(new DatabaseHandle(reopened)))).toHaveLength(4); }
  finally { reopened.$client.close(); }
});

it("records a correlated runtime error without repeating an unexpectedly failed owner lookup", async () => {
  const f = fixture();
  const owner = vi.spyOn(f.repository, "getCardDetails").mockImplementation(() => { throw new Error("private-owner-failure"); });
  let failure: { code: string; message: string; details: { errorId: string } } | undefined;
  try { await f.registry.call("GetStoryMapCardDetails", { cardId: f.card.id }); }
  catch (error) { failure = error as typeof failure; }
  expect(owner).toHaveBeenCalledTimes(1);
  expect(failure).toMatchObject({ code: "internal", message: "An internal error occurred.", details: { errorId: expect.any(String) } });
  expect(calls(f.repository)).toHaveLength(1);
  expect(calls(f.repository)[0]).toMatchObject({ projectId: null, after: expect.objectContaining({ outcome: "error", outputHash: hash({ code: failure!.code, message: failure!.message, details: failure!.details }), errorId: failure!.details.errorId }) });
  expect(JSON.stringify(calls(f.repository))).not.toContain("private-owner-failure");
});

it("hashes exact unexpected-handler response envelopes and matching correlations on both real agent surfaces", async () => {
  const f = await wireFixture();
  vi.spyOn(f.repository, "listCards").mockImplementation(() => { throw new Error("private-wire-handler-failure"); });
  for (const surface of ["http", "sdk"]) {
    const before = calls(f.repository).length;
    const input = { storyMapId: f.map.id };
    const wire = surface === "http" ? await (await fetch(`${f.base}/api/mcp/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "GetStoryMapCards", input }) })).json()
      : await f.client.callTool({ name: "GetStoryMapCards", arguments: input });
    const envelope = surface === "http" ? wire : JSON.parse(wire.content[0].text);
    expect(envelope).toMatchObject({ code: "internal", message: "An internal error occurred.", details: { errorId: expect.any(String) } });
    expect(calls(f.repository)).toHaveLength(before + 1);
    expect(calls(f.repository).at(-1)).toMatchObject({ projectId: f.project.id, after: expect.objectContaining({ outcome: "error", inputHash: hash(input), outputHash: hash(envelope), errorId: envelope.details.errorId }) });
    expect(JSON.stringify(envelope)).not.toContain("private-wire-handler-failure");
  }
});

it("rolls back a synchronous MCP card write when its audit insert fails", async () => {
  const f = fixture();
  f.handle.current.$client.exec("CREATE TRIGGER reject_mutating_batch BEFORE INSERT ON activity_events WHEN NEW.action = 'tool_call' AND NEW.affected_entity_id = 'CreateStoryMapCard' BEGIN SELECT RAISE(ABORT, 'Mutating audit batch rejected'); END");
  await expect(f.registry.call("CreateStoryMapCard", { storyMapId: f.map.id, level: "story", title: "Must roll back" })).rejects.toMatchObject({ code: "internal", details: { errorId: expect.any(String) } });
  expect(f.handle.current.$client.inTransaction).toBe(false);
  expect(f.repository.listCards(f.map.id).filter((card) => card.title === "Must roll back")).toHaveLength(0);
  expect(f.repository.listActivity().filter((event) => event.action === "card.created" && (event.after as { title?: string })?.title === "Must roll back")).toHaveLength(0);
  expect(calls(f.repository)).toHaveLength(0);
  f.handle.current.$client.exec("DROP TRIGGER reject_mutating_batch");
  const result = await f.registry.call("CreateStoryMapCard", { storyMapId: f.map.id, level: "story", title: "Committed with audit" });
  const createdId = result.changeSet!.execution!.operationResults[0]!.entityIds[0]!;
  expect(f.repository.getCardDetails(createdId)).toMatchObject({ title: "Committed with audit" });
  expect(calls(f.repository)).toHaveLength(1);
});

it("rolls back MCP updates including version history and domain activity when terminal audit insertion fails", async () => {
  const f = fixture();
  const before = f.repository.getCardDetails(f.card.id);
  const history = f.repository.listCardHistoryPage(f.card.id, { limit: 100 });
  const activity = f.repository.listActivity();
  f.handle.current.$client.exec("CREATE TRIGGER reject_update_audit BEFORE INSERT ON activity_events WHEN NEW.action = 'tool_call' AND NEW.affected_entity_id = 'UpdateStoryMapCard' BEGIN SELECT RAISE(ABORT, 'Update audit rejected'); END");
  await expect(f.registry.call("UpdateStoryMapCard", { cardId: f.card.id, baseVersion: before!.version, patch: { title: "Must roll back" } })).rejects.toMatchObject({ code: "internal" });
  expect(f.repository.getCardDetails(f.card.id)).toEqual(before);
  expect(f.repository.listCardHistoryPage(f.card.id, { limit: 100 })).toEqual(history);
  expect(f.repository.listActivity().filter((event) => event.action !== "changeSet.proposed")).toEqual(activity);
  expect(f.repository.listChangeSets(f.project.id)).toHaveLength(1);
});

it("rolls back generic conflicts after a nested write instead of committing a rejected mutation", async () => {
  const f = fixture();
  f.registry.register("UpdateStoryMapCard", () => {
    f.unitOfWork.run({ actorType: "agent", actorId: "audit-host", mcpSessionId: "audit-session" }, ({ repository }) => repository.updateCard(f.card.id, { title: "Rejected mutation" }));
    throw new DomainError("conflict", "Operation rejected after writing.");
  }, { atomic: true });
  const before = f.repository.getCardDetails(f.card.id);
  const history = f.repository.listCardHistoryPage(f.card.id, { limit: 100 });
  await expect(f.registry.call("UpdateStoryMapCard", { cardId: f.card.id, baseVersion: f.card.version, patch: { title: "Rejected mutation" } })).rejects.toMatchObject({ code: "conflict" });
  expect(f.repository.getCardDetails(f.card.id)).toEqual(before);
  expect(f.repository.listCardHistoryPage(f.card.id, { limit: 100 })).toEqual(history);
  expect(calls(f.repository)).toEqual([expect.objectContaining({ after: expect.objectContaining({ outcome: "rejected", rejectionReason: "conflict" }) })]);
});

it("audits rejected SDK prompt reads and supports prompt filters through the HTTP activity route", async () => {
  const f = await wireFixture();
  await f.client.listPrompts();
  await expect(f.client.getPrompt({ name: `${f.project.id}:missing` })).rejects.toMatchObject({ data: { code: "not_found" } });
  for (const toolName of ["prompts/list", "prompts/get"]) {
    const response = await f.server.inject({ method: "GET", url: `/api/activity?toolName=${encodeURIComponent(toolName)}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().activityEvents).toEqual([expect.objectContaining({ toolCall: expect.objectContaining({ toolName, outcome: toolName === "prompts/get" ? "rejected" : "ok" }) })]);
  }
  const event = calls(f.repository).find((event) => event.affectedEntityId === "prompts/get")!;
  expect(event).toMatchObject({ projectId: null, actor: "regression-sdk-host", after: expect.objectContaining({ rejectionReason: "not_found" }) });
});

for (const surface of ["http", "sdk"] as const) it(`retains pending ${surface} audit after actual client disconnect while draining ${surface === "http" ? "restore" : "shutdown"}`, async () => {
  const f = await wireFixture();
  const pending = deferred();
  const release = deferred();
  const original = audit.auditToolCall;
  vi.spyOn(audit, "auditToolCall").mockImplementation((context, ...args) => {
    const record = context.recordToolCall;
    context.recordToolCall = async (input) => { pending.resolve(); await release.promise; await record(input); };
    return original(context, ...args);
  });
  const request = httpRequest(`${f.base}${surface === "http" ? "/api/mcp/call" : "/mcp"}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(surface === "sdk" ? { Accept: "application/json, text/event-stream", "Mcp-Session-Id": f.transport.sessionId! } : {}) }
  });
  const disconnected = new Promise<void>((resolve) => { request.once("close", resolve); });
  request.on("error", (error: NodeJS.ErrnoException) => { expect(error.code).toBe("ECONNRESET"); });
  request.end(JSON.stringify(surface === "http" ? { name: "ListProjects", input: {} } : { jsonrpc: "2.0", id: 999, method: "tools/call", params: { name: "ListProjects", arguments: {} } }));
  await pending.promise;
  request.destroy();
  await disconnected;
  await f.client.close();
  expect(calls(f.repository)).toHaveLength(0);
  let drained = false;
  const drain = surface === "http" ? f.handle.restore(() => { expect(calls(f.repository)).toHaveLength(1); drained = true; }) : f.server.close().then(() => { drained = true; expect(calls(f.repository)).toHaveLength(1); });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(drained).toBe(false);
  release.resolve();
  await drain;
  expect(calls(f.repository)).toHaveLength(1);
  expect(calls(f.repository)[0]).toMatchObject({ after: expect.objectContaining({ outcome: "ok" }), actor: surface === "http" ? "local-mcp-host" : "regression-sdk-host" });
});

it("records exactly one metadata-only event for reads, creations and every refusal before reopening SQLite", async () => {
  const f = fixture();
  const matrix = [
    ["ListProjects", {}, null, undefined],
    ["GetStoryMapCardDetails", { cardId: f.card.id }, f.project.id, undefined],
    ["CreateStoryMapCard", { storyMapId: f.map.id, level: "story", title: "Created Story" }, f.project.id, undefined],
    ["ProposeBacklogGrooming", { storyMapId: f.map.id }, f.project.id, undefined],
    ["CreateStoryMapCard", { storyMapId: f.map.id, level: "invalid", title: "private-payload" }, f.project.id, "validation"],
    ["GetStoryMapCardDetails", { cardId: randomUUID() }, null, "not_found"],
    ["UnknownTool", { projectId: f.project.id, secret: "private-payload" }, null, "not_found"],
    ["RestoreProject", { projectId: f.project.id }, null, "disabled"],
    ["UpdateStoryMapPersona", { projectId: f.other.id, personaId: "invalid-id", baseVersion: 1, patch: { name: "private-payload" } }, f.other.id, "validation"],
    ["BulkUpdateCards", { storyMapId: f.map.id, cards: [f.card, f.otherCard].map(({ id }) => ({ id, baseVersion: 1 })), patch: { estimate: 2 } }, null, "validation"]
  ] as const;
  for (const [name, input, projectId, code] of matrix) {
    const before = calls(f.repository).length;
    let result: McpToolResult | undefined;
    if (code) await expect(f.registry.call(name, input)).rejects.toMatchObject({ code });
    else result = await f.registry.call(name, input);
    const event = calls(f.repository).at(-1)!;
    expect(calls(f.repository)).toHaveLength(before + 1);
    expect(event).toMatchObject({ projectId, actor: "audit-host", actorType: "agent", mcpSessionId: "audit-session" });
    expect(event).not.toHaveProperty("before");
    const metadata = toolCallMetadataSchema.parse(event.after);
    expect(metadata).toMatchObject({ toolName: name === "UnknownTool" ? "UnrecognizedTool" : name, inputHash: hash(input), outcome: code ? "rejected" : "ok", ...(code ? { rejectionReason: code } : { outputHash: hash(result) }) });
    if (name === "CreateStoryMapCard" && !code) expect(metadata.affectedEntityIds).toContain(result!.changeSet!.execution!.operationResults[0]!.entityIds[0]!);
    if (name === "ProposeBacklogGrooming") expect(metadata.affectedEntityIds).toContain(result!.changeSet!.id);
    expect(JSON.stringify(event)).not.toContain("private-payload");
  }
  f.handle.current.$client.close();
  const reopened = openStoryMapperDb(f.path);
  try { expect(calls(new StoryMapperRepository(new DatabaseHandle(reopened)))).toHaveLength(matrix.length); }
  finally { reopened.$client.close(); }
});

it("uses actual owners on scope mismatches and records disabled/protected calls without mutation", async () => {
  const f = fixture();
  const persona = f.unitOfWork.run(human, ({ repository }) => repository.createPersona({ projectId: f.other.id, name: "Actual owner" }));
  await expect(f.registry.call("UpdateStoryMapPersona", { projectId: f.project.id, personaId: persona.id, baseVersion: persona.version, patch: { name: "Denied" } })).rejects.toMatchObject({ code: "validation" });
  expect(calls(f.repository).at(-1)).toMatchObject({ projectId: f.other.id, after: expect.objectContaining({ rejectionReason: "validation" }) });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.other.id, { agentMode: "propose" }));
  const protectedProposal = await f.registry.call("UpdateStoryMapCard", { cardId: f.otherCard.id, baseVersion: f.otherCard.version, patch: { title: "Reviewed" } });
  expect(protectedProposal.outcome).toBe("proposed");
  expect(f.repository.getCard(f.otherCard.id)?.title).toBe(f.otherCard.title);
  expect(calls(f.repository).at(-1)).toMatchObject({ projectId: f.other.id, after: expect.objectContaining({ outcome: "ok" }) });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.other.id, { agentMode: "off" }));
  await expect(f.registry.call("GetStoryMapCardDetails", { cardId: f.otherCard.id })).rejects.toMatchObject({ code: "disabled" });
  expect(calls(f.repository).at(-1)).toMatchObject({ projectId: f.other.id, after: expect.objectContaining({ rejectionReason: "disabled" }) });
  expect(f.repository.getPersona(persona.id)?.name).toBe("Actual owner");
});

it("uses only declared fields for HTTP audit identity and never persists unrecognized tool payload text", async () => {
  const f = fixture();
  const server = Fastify();
  cleanup.push(() => server.close());
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository: f.repository, unitOfWork: f.unitOfWork, databasePath: f.path });
  const cases = [
    { name: "ListProjects", input: { ignoredId: f.otherCard.id }, code: 200, projectId: null, ids: [] },
    { name: "GetStoryMapCardDetails", input: { cardId: randomUUID(), projectId: f.project.id }, code: 404, projectId: null },
    { name: "ListActivity", input: { arbitrary: { storyMapId: f.map.id } }, code: 400, projectId: null, ids: [] },
    { name: "UpdateStoryMapCard", input: { cardId: f.card.id, baseVersion: f.card.version, patch: { title: 1, arbitrary: { cardId: f.otherCard.id } } }, code: 400, projectId: f.project.id, ids: [f.card.id] },
    { name: "planted-payload-secret", input: { projectId: f.project.id }, code: 404, projectId: null, ids: [] }
  ];
  for (const item of cases) {
    const before = calls(f.repository).length;
    const response = await server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: item.name, input: item.input } });
    expect(response.statusCode).toBe(item.code);
    expect(calls(f.repository)).toHaveLength(before + 1);
    const event = calls(f.repository).at(-1)!;
    expect(event.projectId).toBe(item.projectId);
    const metadata = toolCallMetadataSchema.parse(event.after);
    expect(metadata.inputHash).toBe(hash(item.input));
    if (item.ids && item.code !== 200) expect(metadata.affectedEntityIds).toEqual(item.ids);
    if (item.name === "ListProjects") expect(metadata.affectedEntityIds).not.toContain(f.otherCard.id);
    if (item.name === "planted-payload-secret") expect(metadata.toolName).toBe("UnrecognizedTool");
  }
  expect(JSON.stringify(calls(f.repository))).not.toContain("planted-payload-secret");
  expect(exportAudit({ repository: f.repository, unitOfWork: f.unitOfWork }, human, f.project.id, "json").content).not.toContain("planted-payload-secret");
});

it("coalesces only identical registry contexts and resolves after commit with failure propagated to every caller", async () => {
  const f = fixture();
  const other = createMcpRegistry(f.repository, f.unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "other-batch-host", mcpSessionId: "other-batch-session" });
  const writes = vi.spyOn(f.unitOfWork, "run");
  await Promise.all([f.registry.call("ListProjects", {}), f.registry.call("ListProjects", {}), other.call("ListProjects", {})]);
  expect(writes).toHaveBeenCalledTimes(2);
  expect(calls(f.repository).map((event) => [event.actor, event.mcpSessionId])).toEqual([["audit-host", "audit-session"], ["audit-host", "audit-session"], ["other-batch-host", "other-batch-session"]]);
  f.handle.current.$client.exec("CREATE TRIGGER reject_batched_call BEFORE INSERT ON activity_events WHEN NEW.action = 'tool_call' AND NEW.affected_entity_id = 'GetSafetySettings' BEGIN SELECT RAISE(ABORT, 'Batch audit persistence rejected'); END");
  writes.mockClear();
  const rejected = await Promise.allSettled([f.registry.call("ListProjects", {}), f.registry.call("GetSafetySettings", { projectId: f.project.id })]);
  expect(writes).toHaveBeenCalledTimes(1);
  for (const result of rejected) expect(result).toMatchObject({ status: "rejected", reason: expect.objectContaining({ code: "internal", message: "An internal error occurred.", details: { errorId: expect.any(String) } }) });
  expect(calls(f.repository)).toHaveLength(3);
  f.handle.current.$client.exec("DROP TRIGGER reject_batched_call");
  await f.registry.call("ListProjects", {});
  expect(calls(f.repository)).toHaveLength(4);
});

it("drains pending HTTP audit commits before restore and pending SDK commits before shutdown", async () => {
  const f = fixture();
  const server = Fastify();
  cleanup.push(() => server.close());
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository: f.repository, unitOfWork: f.unitOfWork, databasePath: f.path });
  registerMcpHttp(server, f.repository, f.unitOfWork);
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const original = audit.auditToolCall;
  let entered = deferred();
  vi.spyOn(audit, "auditToolCall").mockImplementation((...args) => { const pending = original(...args); entered.resolve(); return pending; });
  const pendingHttp = fetch(`${base}/api/mcp/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "ListProjects", input: {} }) });
  await entered.promise;
  const restored = f.handle.restore(() => { expect(calls(f.repository)).toHaveLength(1); });
  expect((await pendingHttp).status).toBe(200);
  await restored;
  const client = new Client({ name: "drain-sdk-host", version: "1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    entered = deferred();
    const pendingSdk = client.callTool({ name: "ListProjects", arguments: {} });
    await entered.promise;
    const closed = server.close();
    expect((await pendingSdk).isError).not.toBe(true);
    await closed;
    expect(calls(f.repository)).toHaveLength(2);
    expect(calls(f.repository).at(-1)?.actor).toBe("drain-sdk-host");
  } finally { await client.close(); }
});

it("records one runtime call when actual read dependencies span multiple Projects", async () => {
  const f = fixture();
  const source = f.unitOfWork.run(human, ({ repository }) => {
    const sourceText = "Relevant source content";
    const source = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks(sourceText), projectId: f.other.id, title: "Cross Project source", type: "txt", content: sourceText, fileHash: createHash("sha256").update(sourceText).digest("hex") });
    seedLegacySourceLink(f.handle, f.card.id, source.chunks[0]!.id);
    return source;
  });
  const before = calls(f.repository).length;
  await f.registry.call("GetStoryMapData", { storyMapId: f.map.id });
  expect(calls(f.repository)).toHaveLength(before + 1);
  expect(calls(f.repository).at(-1)).toMatchObject({ projectId: null, after: expect.objectContaining({ outcome: "ok", affectedEntityIds: expect.arrayContaining([f.card.id, source.chunks[0]!.id]) }) });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.other.id, { agentMode: "off" }));
  await expect(f.registry.call("GetStoryMapData", { storyMapId: f.map.id })).rejects.toMatchObject({ code: "disabled" });
  expect(calls(f.repository).at(-1)).toMatchObject({ projectId: null, after: expect.objectContaining({ outcome: "rejected" }) });
});

it("hashes the shared correlated internal envelope and reports audit persistence failure explicitly", async () => {
  const f = fixture();
  f.registry.register("GetStoryMapCards", async () => { throw new Error("private-exception C:/private/fixture"); });
  let envelope: unknown;
  try { await f.registry.call("GetStoryMapCards", { storyMapId: f.map.id }); }
  catch (error) { const failure = error as { code: string; message: string; details: unknown }; envelope = { code: failure.code, message: failure.message, details: failure.details }; }
  const event = calls(f.repository).at(-1)!;
  expect(toolCallMetadataSchema.parse(event.after)).toMatchObject({ outcome: "error", outputHash: hash(envelope), errorId: expect.any(String) });
  expect(JSON.stringify(event)).not.toContain("private-exception");
  f.handle.current.$client.exec("CREATE TRIGGER reject_tool_call BEFORE INSERT ON activity_events WHEN NEW.action = 'tool_call' BEGIN SELECT RAISE(ABORT, 'Audit persistence rejected'); END");
  await expect(f.registry.call("ListProjects", {})).rejects.toMatchObject({ code: "internal", message: "An internal error occurred.", details: { errorId: expect.any(String) } });
  expect(calls(f.repository)).toHaveLength(1);
});

it("audits invalid HTTP envelopes, arguments, unknown names and human-only names before returning typed errors", async () => {
  const f = fixture();
  const server = Fastify();
  cleanup.push(() => server.close());
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository: f.repository, unitOfWork: f.unitOfWork, databasePath: f.path });
  const payloads = [
    [{ name: 1, input: { secret: "private-http-payload" } }, "validation"],
    [{ name: "ListProjects", extra: "private-http-payload" }, "validation"],
    [{ name: "CreateStoryMapCard", input: { storyMapId: f.map.id } }, "validation"],
    [{ name: "UnknownTool", input: {} }, "not_found"],
    [{ name: "RestoreProject", input: {} }, "disabled"]
  ] as const;
  for (const [payload, code] of payloads) {
    const response = await server.inject({ method: "POST", url: "/api/mcp/call", payload });
    expect(response.json()).toMatchObject({ code });
    const event = calls(f.repository).at(-1)!;
    expect(event).toMatchObject({ actor: "local-mcp-host", actorType: "agent", mcpSessionId: expect.any(String) });
    expect(toolCallMetadataSchema.parse(event.after)).toMatchObject({ outcome: "rejected", rejectionReason: code, outputHash: hash(response.json()) });
  }
  expect(calls(f.repository)).toHaveLength(payloads.length);
  expect(JSON.stringify(calls(f.repository))).not.toContain("private-http-payload");
});

it("records real SDK raw calls and typed refusals once with actual initialization identity", async () => {
  const f = fixture();
  const server = Fastify();
  cleanup.push(() => server.close());
  registerMcpHttp(server, f.repository, f.unitOfWork);
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "actual-sdk-audit", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  await client.connect(transport);
  try {
    for (const [name, args] of [["ListProjects", { ignored: "raw-argument" }], ["GetStoryMapCardDetails", { cardId: f.card.id }], ["GetStoryMapCardDetails", { cardId: "invalid" }], ["UnknownTool", {}], ["RestoreProject", {}]] as const) {
      const result = await client.callTool({ name, arguments: args });
      const data = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
      const event = calls(f.repository).at(-1)!;
      expect(event).toMatchObject({ actor: "actual-sdk-audit", mcpSessionId: transport.sessionId });
      expect(toolCallMetadataSchema.parse(event.after)).toMatchObject({ toolName: name === "UnknownTool" ? "UnrecognizedTool" : name, inputHash: hash(args), outputHash: hash(data), outcome: result.isError ? "rejected" : "ok" });
    }
    const malformedParams = [
      ...[null, [], "private-invalid-arguments"].map((arguments_) => ({ name: "ListProjects", arguments: arguments_ })),
      {}, { name: null }, { name: 1 },
      { name: "ListProjects", arguments: {}, task: { ttl: "private-invalid-task" } },
      { name: "ListProjects", arguments: {}, _meta: { progressToken: [] } }
    ];
    for (const [index, params] of malformedParams.entries()) {
      const before = calls(f.repository).length;
      const response = await fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Session-Id": transport.sessionId! }, body: JSON.stringify({ jsonrpc: "2.0", id: 100 + index, method: "tools/call", params }) });
      const envelope = await response.json();
      expect(envelope, JSON.stringify(params)).toHaveProperty("result");
      const result = JSON.parse(envelope.result.content[0].text);
      expect(result).toMatchObject({ code: "validation" });
      expect(calls(f.repository)).toHaveLength(before + 1);
      expect(calls(f.repository).at(-1)).toMatchObject({ actor: "actual-sdk-audit", mcpSessionId: transport.sessionId, after: expect.objectContaining({ inputHash: hash("arguments" in params ? params.arguments : undefined), outputHash: hash(result), outcome: "rejected" }) });
    }
    expect(calls(f.repository)).toHaveLength(5 + malformedParams.length);
  } finally { await client.close(); }
});

it("pages 1000 same-time matching rows after Project visibility and keeps runtime evidence human-only", async () => {
  const f = fixture();
  vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-10-08T12:00:00.000Z");
  const metadata = { toolName: "GetStoryMapCards", inputHash: hash({}), outputHash: hash({}), outcome: "ok" as const, affectedEntityIds: [f.card.id] };
  f.unitOfWork.run({ actorType: "agent", actorId: "paged-host" }, ({ repository }) => {
    for (let index = 0; index < 1000; index++) repository.logMcpToolCall({ projectId: f.project.id, metadata });
    for (let index = 0; index < 40; index++) repository.logMcpToolCall({ projectId: f.other.id, metadata });
    for (let index = 0; index < 40; index++) repository.logMcpToolCall({ projectId: f.project.id, metadata: { ...metadata, toolName: "ListProjects" } });
    repository.logMcpToolCall({ projectId: null, metadata });
  });
  f.unitOfWork.run(human, ({ repository }) => repository.logActivity(f.project.id, "card.updated", "card", f.card.id, undefined, { token: "not-public" }));
  const visibleIds: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await f.registry.call("ListActivity", { projectId: f.project.id, actorType: "agent", toolName: "GetStoryMapCards", limit: 37, ...(cursor ? { cursor } : {}) });
    const page = activityResponseSchema.parse(result.data);
    expect(page.activityEvents).toHaveLength(page.nextCursor ? 37 : 1);
    expect(page.activityEvents.every((event) => event.projectId === f.project.id && !("before" in event) && !("after" in event))).toBe(true);
    visibleIds.push(...page.activityEvents.map((event) => event.id));
    cursor = page.nextCursor ? JSON.stringify(page.nextCursor) : undefined;
  } while (cursor);
  expect(visibleIds).toHaveLength(1000);
  expect(new Set(visibleIds).size).toBe(1000);
  expect(visibleIds).toEqual([...visibleIds].sort().reverse());
  const humanPage = f.repository.listActivityPage(activityQuerySchema.parse({ projectId: f.project.id, actorType: "agent", toolName: "GetStoryMapCards", limit: 100 }), { includeRuntime: true });
  expect(humanPage.activityEvents.some((event) => event.scope === "runtime")).toBe(calls(f.repository).find((event) => event.projectId === null)!.id >= humanPage.activityEvents.at(-1)!.id);
  await expect(f.registry.call("ListActivity", { projectId: f.project.id, cursor: "invalid" })).rejects.toMatchObject({ code: "validation" });
});

it("exports safe shared JSON and Markdown summaries including self-audit while restricting agents to Project rows", async () => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateCard(f.card.id, { description: "planted-payload-secret C:/private/local-file" }));
  f.unitOfWork.run({ actorType: "github", actorId: "github-fixture" }, ({ repository }) => repository.logActivity(f.project.id, "githubLink.created", "githubLink", randomUUID(), { token: "planted-payload-secret" }, { url: "C:/private/local-file" }));
  await f.registry.call("GetStoryMapCardDetails", { cardId: f.card.id });
  await f.registry.call("ListProjects", {});
  for (const format of ["json", "markdown"] as const) {
    const file = exportAudit({ repository: f.repository, unitOfWork: f.unitOfWork }, human, f.project.id, format);
    for (const prohibited of ["planted-payload-secret", "C:/private", '"localPath"']) expect(file.content).not.toContain(prohibited);
    if (format === "json") for (const summary of (JSON.parse(file.content) as { events: unknown[] }).events) {
      expect(summary).not.toHaveProperty("before");
      expect(summary).not.toHaveProperty("after");
    }
    for (const expected of ["exports.auditCreated", "GetStoryMapCardDetails", "ListProjects", "runtime", "github-fixture", "audit-session", f.card.id]) expect(file.content).toContain(expected);
    const agent = await f.registry.call("ExportAudit", { projectId: f.project.id, format });
    expect((agent.data as { content: string }).content).not.toContain("runtime");
  }
  expect((f.repository.listActivity(f.project.id).find((event) => event.action === "card.updated")!.after as { description: string }).description).toContain("planted-payload-secret");
});

it.each(["http", "sdk"] as const)("rolls ApplyChangeSet and history back after success-audit refusal on actual %s transport", async (surface) => {
  const f = await wireFixture();
  const proposal = f.unitOfWork.run(human, ({ repository }) => {
    const value = repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Atomic executor audit", source: "mcp", createdAt: new Date().toISOString(), operations: [
      { operationId: "update-existing", op: "update", entity: "card", entityId: f.card.id, baseVersion: f.card.version, after: { title: "Must roll back" } },
      { operationId: "create-new", op: "create", entity: "card", entityId: "new-local-card", after: { storyMapId: f.map.id, level: "story", title: "Must disappear" } }
    ] });
    return repository.updateChangeSetStatus(value.id, "approved")!;
  });
  const state = (repository: StoryMapperRepository) => ({
    snapshot: repository.getOperationSnapshot(f.project.id), history: repository.listCardHistory(f.card.id), proposal: repository.getChangeSet(proposal.id),
    events: repository.listActivity(f.project.id).filter((event) => event.action !== "tool_call")
  });
  const before = state(f.repository);
  const published: LiveTransaction[] = [];
  const unsubscribe = f.unitOfWork.subscribe((event) => published.push(event));
  cleanup.push(unsubscribe);
  const rejectedAudit = rejectSuccessfulAudit(f.handle.current.$client, "ApplyChangeSet");
  const input = { changeSetId: proposal.id, approvalToken: "discarded" };
  let envelope: { code: string; details: { errorId: string; retainedRestorePoint: string } };
  if (surface === "http") {
    const response = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "ApplyChangeSet", input } });
    expect(response.statusCode).toBe(500);
    envelope = response.json();
  } else {
    const response = await f.client.callTool({ name: "ApplyChangeSet", arguments: input });
    expect(response.isError).toBe(true);
    envelope = JSON.parse((response.content as Array<{ type: string; text: string }>)[0]!.text);
  }
  expect(envelope).toMatchObject({ code: "internal", details: { errorId: expect.any(String), retainedRestorePoint: expect.any(String), retainedPreparedEffects: [] } });
  expect(rejectedAudit()).toBe(1);
  expect(state(f.repository)).toEqual(before);
  expect(published.flatMap((event) => event.entities).filter((entity) => ["card", "storyMap", "changeSet"].includes(entity.entityType))).toEqual([]);
  const auditRows = calls(f.repository);
  expect(auditRows).toHaveLength(1);
  expect(auditRows[0]).toMatchObject({ affectedEntityId: "ApplyChangeSet", actor: surface === "http" ? "local-mcp-host" : "regression-sdk-host", after: expect.objectContaining({ outcome: "error", errorId: envelope.details.errorId, outputHash: hash(envelope) }) });
  expect(readdirSync(join(f.directory, "snapshots"))).toContain(envelope.details.retainedRestorePoint);
  expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
  await f.client.close();
  await f.server.close();
  f.handle.current.$client.close();
  const reopened = openExistingStoryMapperDb(f.path);
  try {
    const repository = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(state(repository)).toEqual(before);
    expect(calls(repository)).toEqual(auditRows);
  } finally { reopened.$client.close(); }
});

it.each(["http", "sdk"] as const)("returns committed %s apply after listener/hook failure with one durable successful audit", async (surface) => {
  for (const phase of ["listener", "hook"] as const) {
    let applying = false;
    const diagnostic = vi.fn();
    const f = await wireFixture(() => { if (applying && phase === "hook") throw new Error("Publication hook refused"); }, diagnostic);
    const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Committed apply", source: "human", createdAt: new Date().toISOString(), operations: [{ operationId: "save", entity: "card", op: "update", entityId: f.card.id, baseVersion: f.card.version, after: { title: "Committed title" } }] }));
    f.unitOfWork.run(human, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
    const unsubscribe = f.unitOfWork.subscribe(() => { if (applying && phase === "listener") throw new Error("Publication listener refused"); });
    cleanup.push(unsubscribe);
    applying = true;
    const input = { changeSetId: proposal.id, approvalToken: "discarded" };
    let result: McpToolResult;
    if (surface === "http") {
      const response = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "ApplyChangeSet", input } });
      expect(response.statusCode).toBe(200);
      result = response.json();
    } else {
      const response = await f.client.callTool({ name: "ApplyChangeSet", arguments: input });
      expect(response.isError).not.toBe(true);
      result = JSON.parse((response.content as Array<{ text: string }>)[0]!.text);
    }
    expect(result.changeSet?.status).toBe("applied");
    expect(diagnostic).toHaveBeenCalledTimes(1);
    expect(f.repository.getCard(f.card.id)).toMatchObject({ title: "Committed title", version: f.card.version + 1 });
    const evidence = calls(f.repository);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.after).toMatchObject({ outcome: "ok", outputHash: hash(result) });
    expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
    await f.client.close();
    await f.server.close();
    f.handle.current.$client.close();
    const reopened = openExistingStoryMapperDb(f.path);
    try {
      const repository = new StoryMapperRepository(new DatabaseHandle(reopened));
      expect(repository.getChangeSet(proposal.id)?.status).toBe("applied");
      expect(repository.getCard(f.card.id)?.title).toBe("Committed title");
      expect(calls(repository)).toEqual(evidence);
    } finally { reopened.$client.close(); }
  }
});


it.each(["publication", "retention"] as const)("records exactly one registered executor error after snapshot %s failure", async (phase) => {
  const f = fixture();
  const proposal = f.unitOfWork.run(human, ({ repository }) => {
    const created = repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Snapshot failure", source: "human", createdAt: new Date().toISOString(), operations: [
      { operationId: "snapshot-update", op: "update", entity: "card", entityId: f.card.id, after: { title: "Must remain unchanged" } }
    ] });
    return repository.updateChangeSetStatus(created.id, "approved")!;
  });
  const state = (repository: StoryMapperRepository) => ({ card: repository.getCard(f.card.id), history: repository.listCardHistory(f.card.id), proposal: repository.getChangeSet(proposal.id), events: repository.listActivity(f.project.id).filter((event) => event.action !== "tool_call") });
  const before = state(f.repository);
  const published: LiveTransaction[] = [];
  f.unitOfWork.subscribe((event) => published.push(event));
  if (phase === "publication") writeFileSync(join(f.directory, "snapshots"), "Publication blocked by existing file");
  else vi.spyOn(restorePointFiles, "retainRestorePointFiles").mockImplementationOnce(() => { throw new Error("Retention refused"); });
  let failure: unknown;
  try { await f.registry.call("ApplyChangeSet", { changeSetId: proposal.id, approvalToken: "discarded" }); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: "internal", details: { errorId: expect.any(String) } });
  const error = failure as DomainError;
  if (phase === "retention") {
    expect(error.details).toMatchObject({ retainedRestorePoint: expect.any(String), retainedPreparedEffects: [] });
    expect(readdirSync(join(f.directory, "snapshots"))).toContain(error.details!.retainedRestorePoint);
    expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
  } else {
    expect(error.details).not.toHaveProperty("retainedRestorePoint");
    expect(error.details).not.toHaveProperty("retainedPreparedEffects");
    expect(readdirSync(f.directory).filter((name) => name.endsWith(".sqlite"))).toEqual(["storymapper.sqlite"]);
  }
  expect(state(f.repository)).toEqual(before);
  expect(published.flatMap((event) => event.entities).filter((entity) => entity.entityType !== "activity")).toEqual([]);
  const audits = calls(f.repository);
  expect(audits).toHaveLength(1);
  const { statusCode: _status, ...envelope } = toErrorResponse(error);
  expect(audits[0]).toMatchObject({ affectedEntityId: "ApplyChangeSet", after: expect.objectContaining({ outcome: "error", errorId: error.details!.errorId, outputHash: hash(envelope) }) });
  const reopened = openExistingStoryMapperDb(f.path);
  try {
    const repository = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(state(repository)).toEqual(before);
    expect(calls(repository)).toEqual(audits);
  } finally { reopened.$client.close(); }
});

it.each(["http", "sdk"] as const)("persists protected and explicit %s proposals then atomically audits default command application", async (surface) => {
  const f = await wireFixture();
  const call = async (input: Record<string, unknown>): Promise<McpToolResult> => {
    if (surface === "http") {
      const response = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "UpdateStoryMapCard", input } });
      expect(response.statusCode).toBe(200);
      return response.json();
    }
    const response = await f.client.callTool({ name: "UpdateStoryMapCard", arguments: input });
    expect(response.isError).not.toBe(true);
    return JSON.parse((response.content as Array<{ text: string }>)[0]!.text);
  };
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  const baseline = f.repository.getCard(f.card.id)!;
  const protectedProposal = await call({ cardId: baseline.id, baseVersion: baseline.version, patch: { title: "Protected review" } });
  expect(protectedProposal).toMatchObject({ outcome: "proposed", previewRef: { changeSetId: protectedProposal.changeSetId } });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "apply" }));
  const explicitProposal = await call({ cardId: baseline.id, baseVersion: baseline.version, patch: { title: "Explicit review" }, apply: false });
  expect(explicitProposal.outcome).toBe("proposed");
  expect(f.repository.getCard(f.card.id)).toEqual(baseline);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
  expect(protectedProposal.changeSet?.proposedBy).toMatchObject({ actorType: "agent", actorId: surface === "sdk" ? "regression-sdk-host" : expect.any(String), mcpSessionId: expect.any(String) });
  const applied = await call({ cardId: baseline.id, baseVersion: baseline.version, patch: { title: "Applied command" } });
  expect(applied).toMatchObject({ outcome: "applied", changeSetId: applied.changeSet?.id, previewRef: { changeSetId: applied.changeSet?.id } });
  expect(f.repository.getCard(f.card.id)).toMatchObject({ title: "Applied command", version: baseline.version + 1 });
  expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
  expect(calls(f.repository)).toHaveLength(3);
  expect(calls(f.repository).map((event) => (event.after as { outputHash: string }).outputHash)).toEqual([hash(protectedProposal), hash(explicitProposal), hash(applied)]);
});

it.each(["http", "sdk"] as const)("rolls back %s command effects when its successful executor audit fails", async (surface) => {
  const f = await wireFixture();
  const before = f.repository.getCard(f.card.id)!;
  const history = f.repository.listCardHistory(f.card.id);
  const domainEvents: LiveTransaction[] = [];
  cleanup.push(f.unitOfWork.subscribe((event) => { if (event.entities.some((change) => change.entityType === "card")) domainEvents.push(event); }));
  const rejectedAudit = rejectSuccessfulAudit(f.handle.current.$client, "UpdateStoryMapCard");
  const input = { cardId: before.id, baseVersion: before.version, patch: { title: "Must roll back command" } };
  let envelope: Record<string, unknown>;
  if (surface === "http") {
    const response = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "UpdateStoryMapCard", input } });
    expect(response.statusCode).toBe(500);
    envelope = response.json();
  } else {
    const response = await f.client.callTool({ name: "UpdateStoryMapCard", arguments: input });
    expect(response.isError).toBe(true);
    envelope = JSON.parse((response.content as Array<{ text: string }>)[0]!.text);
  }
  expect(envelope).toMatchObject({ code: "internal", details: { errorId: expect.any(String), retainedRestorePoint: expect.any(String) } });
  expect(rejectedAudit()).toBe(1);
  expect(f.repository.getCard(f.card.id)).toEqual(before);
  expect(f.repository.listCardHistory(f.card.id)).toEqual(history);
  expect(domainEvents).toHaveLength(0);
  expect(calls(f.repository)).toHaveLength(1);
  expect(calls(f.repository)[0]?.after).toMatchObject({ outcome: "error", outputHash: hash(envelope) });
  expect(f.repository.listChangeSets(f.project.id)).toHaveLength(1);
  expect(f.repository.listChangeSets(f.project.id)[0]?.status).toBe("proposed");
  expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
});

function rejectSuccessfulAudit(database: Parameters<typeof rejectSqliteWrite>[0], toolName: string) {
  let rejected = 0;
  cleanup.push(rejectSqliteWrite(database, (sql, bindings) => {
    if (!sql.startsWith("INSERT INTO activity_events ") || bindings[5] !== "tool_call" || bindings[7] !== toolName || JSON.parse(String(bindings[8])).outcome !== "ok") return false;
    rejected++;
    return true;
  }, "Successful tool audit refused"));
  return () => rejected;
}
