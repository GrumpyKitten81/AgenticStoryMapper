import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRestorePointResponseSchema, listRestorePointsResponseSchema, restoreActivityResponseSchema, restorePointCapabilitiesResponseSchema, mcpToolNameSchema, type McpToolName } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { createMcpRegistry, listMcpToolStates } from "@storymapper/server/mcp/tools/register-tools";
import { installRestoreRequestGate } from "@storymapper/server/http/restore-request-gate";
import { readRestoreActivity } from "@storymapper/server/application/restore/restore.use-cases";

const cleanup: Array<() => Promise<void>> = [];
const ACTOR = { actorType: "human", actorId: "restore-http-fixture" } as const;

async function fixture(slow?: (uow: UnitOfWork, projectId: string) => Promise<unknown>) {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-restore-http-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const project = unitOfWork.run(ACTOR, ({ repository }) => repository.createProject({ name: "Human restore points", localPath: join(directory, "metadata-path") }));
  const server = Fastify();
  installRestoreRequestGate(server, handle);
  if (slow) server.post("/api/fixture/slow", async () => slow(unitOfWork, project.id));
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  cleanup.push(async () => { await server.close(); handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  return { server, handle, unitOfWork, repository, directory, project, url: `/api/human/projects/${project.id}/restore-points` };
}

afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

describe("human restore point HTTP surface", () => {
  it("publishes and lists manual points from the runtime database with persisted metadata", async () => {
    const data = await fixture();
    expect(listRestorePointsResponseSchema.parse((await data.server.inject(data.url)).json()).restorePoints).toEqual([]);
    const created = await data.server.inject({ method: "POST", url: data.url, payload: { class: "manual" } });
    expect(created.statusCode).toBe(201);
    const point = createRestorePointResponseSchema.parse(created.json()).restorePoint;
    expect(point).toMatchObject({ class: "manual", scope: "local-database" });
    expect(readdirSync(join(data.directory, "snapshots"))).toContain(point.fileName);
    data.handle.current.$client.close();
    data.handle.current = openStoryMapperDb(join(data.directory, "storymapper.sqlite"));
    expect(listRestorePointsResponseSchema.parse((await data.server.inject(data.url)).json()).restorePoints).toEqual([point]);
  });

  it("preserves the concrete filesystem cause over HTTP and never lists partial files", async () => {
    const data = await fixture();
    mkdirSync(join(data.directory, "snapshots"));
    mkdirSync(join(data.directory, "snapshots/.gitignore"));
    const response = await data.server.inject({ method: "POST", url: data.url, payload: { class: "manual" } });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: "internal", message: "An internal error occurred.", details: { errorId: expect.any(String) } });
    expect(listRestorePointsResponseSchema.parse((await data.server.inject(data.url)).json()).restorePoints).toEqual([]);
    writeFileSync(join(data.directory, "snapshots/incomplete.tmp"), "unfinished");
    expect(listRestorePointsResponseSchema.parse((await data.server.inject(data.url)).json()).restorePoints).toEqual([]);
  });

  it("rejects malformed bodies, nonmanual classes, missing Projects and malformed Project IDs", async () => {
    const data = await fixture();
    for (const payload of [{}, { class: "pre-migration" }, { class: "manual", extra: true }, { class: 1 }]) {
      expect((await data.server.inject({ method: "POST", url: data.url, payload })).statusCode).toBe(400);
    }
    for (const method of ["GET", "POST"] as const) {
      expect((await data.server.inject({ method, url: "/api/human/projects/not-a-project/restore-points", ...(method === "POST" ? { payload: { class: "manual" } } : {}) })).statusCode).toBe(400);
      expect((await data.server.inject({ method, url: `/api/human/projects/${randomUUID()}/restore-points`, ...(method === "POST" ? { payload: { class: "manual" } } : {}) })).statusCode).toBe(404);
    }
    expect(readdirSync(data.directory)).not.toContain("snapshots");
  });

  it("declares human-only capabilities and advertises/calls no restore-point MCP tools or agent endpoint", testDeclaresHumanOnlyCapabilitiesAndAdvertisesCallsNoRestorePointMCP);

  it("uses replacement holder existence and storage even when registered databasePath is stale", testUsesReplacementHolderExistenceAndStorageEvenWhenRegisteredDatabasePathIs);
});

describe("human project restore execution", () => {
  it("exposes only typed restore evidence for lost-response recovery and refuses agents", testExposesOnlyTypedRestoreEvidenceForLostResponseRecoveryAndRefuses);

  it("releases admitted requests that never reach a route handler so a later restore completes", async () => {
    const data = await fixture();
    const point = (await data.server.inject({ method: "POST", url: data.url, payload: { class: "manual" } })).json().restorePoint;
    expect((await data.server.inject("/api/no-such-route")).statusCode).toBe(404);
    const restored = await data.server.inject({ method: "POST", url: `/api/human/projects/${data.project.id}/restore`, payload: { fileName: point.fileName, confirm: true } });
    expect(restored.statusCode).toBe(200);
    expect(data.handle.restoring).toBe(false);
  });

  it("drains the whole asynchronous use case, rejects new requests and duplicate restores, and retains its final history", testDrainsTheWholeAsynchronousUseCaseRejectsNewRequestsAndDuplicate);

  it("requires explicit human confirmation, refuses malformed/unrecognized candidates, and explains MCP denial", testRequiresExplicitHumanConfirmationRefusesMalformedUnrecognizedCandidatesAndExplainsMCP);

  it("returns concrete corruption/schema errors while keeping the database available", async () => {
    const data = await fixture();
    const point = (await data.server.inject({ method: "POST", url: data.url, payload: { class: "manual" } })).json().restorePoint;
    writeFileSync(join(data.directory, "snapshots", point.fileName), Buffer.alloc(point.sizeBytes));
    const response = await data.server.inject({ method: "POST", url: `/api/human/projects/${data.project.id}/restore`, payload: { fileName: point.fileName, confirm: true } });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("could not be read");
    expect((await data.server.inject("/api/projects")).statusCode).toBe(200);
    expect(data.handle.current.$client.open).toBe(true);
  });

  it("keeps historical Projects out of inventories and agent reads, and refuses undone ChangeSet approve/reject/apply", testKeepsHistoricalProjectsOutOfInventoriesAndAgentReadsAndRefuses);

  it("responds with explanatory 503s on every surface while a failed rollback has stopped database access", async () => {
    const data = await fixture();
    const reason = "Project restore and rollback failed. Database access is stopped; restart to recover.";
    data.handle.markUnavailable(reason);
    for (const url of ["/health", "/api/projects", data.url, "/api/mcp/tools"]) {
      const response = await data.server.inject(url);
      expect(response.statusCode).toBe(503);
      expect(response.json().message).toBe(reason);
    }
  });
});

async function testDeclaresHumanOnlyCapabilitiesAndAdvertisesCallsNoRestorePointMCP() {
  const data = await fixture();
  const capabilities = restorePointCapabilitiesResponseSchema.parse((await data.server.inject("/api/human/restore-point-capabilities")).json()).capabilities;
  expect(capabilities).toEqual([
    { name: "restore-points.list", audience: "human", mcp: false },
    { name: "restore-points.create", audience: "human", mcp: false },
    { name: "restore-points.restore", audience: "human", mcp: false }
  ]);
  const registry = createMcpRegistry(data.repository, data.unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "restore-agent-fixture" });
  const humanOnlyNames = [...capabilities.map((capability) => capability.name), "GetRestorePointCapabilities", "CreateRestorePoint", "ListRestorePoints", "RestoreProject"];
  const registryNames = listMcpToolStates(data.repository).map((tool) => tool.name);
  const advertisedNames = (await data.server.inject("/api/mcp/tools")).json().tools.map((tool: { name: string }) => tool.name);
  expect(registryNames).toContain("GetStoryMapSnapshot");
  expect(advertisedNames).toContain("GetStoryMapSnapshot");
  for (const name of humanOnlyNames) {
    expect(registryNames).not.toContain(name);
    expect(advertisedNames).not.toContain(name);
    expect(mcpToolNameSchema.safeParse(name).success).toBe(false);
    await expect(registry.call(name as McpToolName, {})).rejects.toThrow();
  }
  expect((await data.server.inject(`/api/agent/projects/${data.project.id}/restore-points`)).statusCode).toBe(404);
}

async function testUsesReplacementHolderExistenceAndStorageEvenWhenRegisteredDatabasePathIs() {
  const data = await fixture();
  const directory = mkdtempSync(join(tmpdir(), "storymapper-restore-replacement-"));
  const old = data.handle.current;
  data.handle.current = openStoryMapperDb(join(directory, "replacement.sqlite"));
  cleanup.push(async () => { data.handle.current.$client.close(); data.handle.current = old; rmSync(directory, { recursive: true, force: true }); });
  const project = data.unitOfWork.run(ACTOR, ({ repository }) => repository.createProject({ name: "Current Project" }));
  expect((await data.server.inject(data.url)).statusCode).toBe(404);
  const url = `/api/human/projects/${project.id}/restore-points`;
  expect((await data.server.inject({ method: "POST", url, payload: { class: "manual" } })).statusCode).toBe(201);
  expect(readdirSync(directory)).toContain("snapshots");
  expect(readdirSync(data.directory)).not.toContain("snapshots");
  expect(listRestorePointsResponseSchema.parse((await data.server.inject(url)).json()).restorePoints).toHaveLength(1);
}

async function testExposesOnlyTypedRestoreEvidenceForLostResponseRecoveryAndRefuses() {
  const data = await fixture();
  const recoveryUrl = `/api/human/projects/${data.project.id}/restore-activity`;
  expect((await data.server.inject(recoveryUrl)).json()).toEqual({ activityEvents: [] });
  const point = (await data.server.inject({ method: "POST", url: data.url, payload: { class: "manual" } })).json().restorePoint;
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.logActivity(data.project.id, "card.updated", "card", randomUUID(), undefined, { description: "private entity body" }));
  const restored = await data.server.inject({ method: "POST", url: `/api/human/projects/${data.project.id}/restore`, payload: { fileName: point.fileName, confirm: true } });
  expect(restored.statusCode).toBe(200);
  const response = await data.server.inject(recoveryUrl);
  expect(response.statusCode).toBe(200);
  const recovery = restoreActivityResponseSchema.parse(response.json());
  expect(recovery.activityEvents).toHaveLength(1);
  expect(recovery.activityEvents[0]).toMatchObject({ action: "project.restored", after: restored.json() });
  expect(response.body).not.toContain("private entity body");
  expect(() => readRestoreActivity(data, { actorType: "agent", actorId: "recovery-agent" }, data.project.id)).toThrow("human");
  expect((await data.server.inject("/api/human/projects/invalid/restore-activity")).statusCode).toBe(400);
}

async function testDrainsTheWholeAsynchronousUseCaseRejectsNewRequestsAndDuplicate() {
  let start!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const data = await fixture(async (uow, projectId) => {
    start();
    await pending;
    return uow.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId, title: "Slow completed proposal", source: "mcp", status: "proposed", operations: [], createdAt: new Date().toISOString() }));
  });
  const point = (await data.server.inject({ method: "POST", url: data.url, payload: { class: "manual" } })).json().restorePoint;
  const inFlight = data.server.inject({ method: "POST", url: "/api/fixture/slow" }).then((response) => response);
  await started;
  const url = `/api/human/projects/${data.project.id}/restore`;
  const restoring = data.server.inject({ method: "POST", url, payload: { fileName: point.fileName, confirm: true } }).then((response) => response);
  await vi.waitFor(() => expect(data.handle.restoring).toBe(true));
  expect(data.handle.current.$client.open).toBe(true);
  for (const request of [
    { method: "GET" as const, url: "/health" },
    { method: "GET" as const, url: "/api/projects" },
    { method: "POST" as const, url, payload: { fileName: point.fileName, confirm: true } },
    { method: "POST" as const, url: "/api/projects", payload: { name: "Must not execute" } }
  ]) {
    const response = await data.server.inject(request);
    expect(response.statusCode).toBe(503);
    expect(response.json().message).toContain("restore is in progress");
  }
  release();
  const completed = await inFlight;
  expect(completed.statusCode).toBe(200);
  const restored = await restoring;
  expect(restored.statusCode).toBe(200);
  expect(data.repository.getChangeSet(completed.json().id)).toMatchObject({ title: "Slow completed proposal", undoneByRestore: true });
  expect(data.handle.restoring).toBe(false);
  expect((await data.server.inject({ method: "POST", url: "/api/projects", payload: { name: "After restore" } })).statusCode).toBe(201);
  expect((await data.server.inject("/health")).statusCode).toBe(200);
}

async function testRequiresExplicitHumanConfirmationRefusesMalformedUnrecognizedCandidatesAndExplainsMCP() {
  const data = await fixture();
  const point = (await data.server.inject({ method: "POST", url: data.url, payload: { class: "manual" } })).json().restorePoint;
  const url = `/api/human/projects/${data.project.id}/restore`;
  for (const payload of [{ fileName: point.fileName }, { fileName: point.fileName, confirm: false }, { fileName: "../escape", confirm: true }, { fileName: point.fileName, confirm: true, extra: true }]) {
    expect((await data.server.inject({ method: "POST", url, payload })).statusCode).toBe(400);
  }
  expect((await data.server.inject({ method: "POST", url, payload: { fileName: "unknown.sqlite", confirm: true } })).json().message).toContain("not recognized");
  for (const name of ["RestoreProject", "restore-points.restore", "RestoreRestorePoint"]) {
    const response = await data.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name, input: { projectId: data.project.id, fileName: point.fileName } } });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain("human-only");
  }
  expect((await data.server.inject(data.url)).json().restorePoints).toHaveLength(1);
}

async function testKeepsHistoricalProjectsOutOfInventoriesAndAgentReadsAndRefuses() {
  const data = await fixture();
  const point = (await data.server.inject({ method: "POST", url: data.url, payload: { class: "manual" } })).json().restorePoint;
  const later = data.unitOfWork.run(ACTOR, ({ repository }) => repository.createProject({ name: "Later Project" }));
  const changeSet = data.unitOfWork.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: later.id, title: "Historical proposal", source: "mcp", status: "proposed", operations: [], createdAt: new Date().toISOString() }));
  expect((await data.server.inject({ method: "POST", url: `/api/human/projects/${data.project.id}/restore`, payload: { fileName: point.fileName, confirm: true } })).statusCode).toBe(200);
  expect((await data.server.inject("/api/projects")).json().projects.map((project: { id: string }) => project.id)).toEqual([data.project.id]);
  const registry = createMcpRegistry(data.repository, data.unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "restore-agent", permissions: { read: true, proposal: true, write: true, github: true, admin: true } });
  await expect(registry.call("ListStoryMaps", { projectId: later.id })).rejects.toMatchObject({ code: "disabled", message: "Project is not available for agent access." });
  for (const action of ["approve", "reject", "apply"]) {
    const response = await data.server.inject({ method: "POST", url: `/api/changesets/${changeSet.id}/${action}`, payload: {} });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.json().message).toContain("permanently historical");
  }
  expect(data.repository.getChangeSet(changeSet.id)).toMatchObject({ status: "proposed", undoneByRestore: true });
}
