import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardResponse, CapabilityDescriptor, ChangeSetCommandResponse } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import * as operationActions from "@storymapper/db/repositories/operation-persistence-repository";
import * as cardActions from "@storymapper/db/repositories/cards-repository";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import * as ai from "@storymapper/server/application/ai/ai.use-cases";
import * as card from "@storymapper/server/application/card/card.use-cases";
import * as cardChildren from "@storymapper/server/application/card/card-children.use-cases";
import * as changeSet from "@storymapper/server/application/changeset/changeset.use-cases";
import * as connector from "@storymapper/server/application/connector/connector.use-cases";
import * as customization from "@storymapper/server/application/customization/customization.use-cases";
import * as externalRef from "@storymapper/server/application/external-ref/external-ref.use-cases";
import * as publishing from "@storymapper/server/application/export/export.use-cases";
import * as githubLink from "@storymapper/server/application/github-link/github-link.use-cases";
import * as persona from "@storymapper/server/application/persona/persona.use-cases";
import * as project from "@storymapper/server/application/project/project.use-cases";
import * as release from "@storymapper/server/application/release/release.use-cases";
import * as report from "@storymapper/server/application/report/report.use-cases";
import * as restore from "@storymapper/server/application/restore/restore.use-cases";
import * as roadmap from "@storymapper/server/application/roadmap/roadmap.use-cases";
import * as source from "@storymapper/server/application/source-document/source-document.use-cases";
import * as storyMap from "@storymapper/server/application/story-map/story-map.use-cases";
import * as sync from "@storymapper/server/application/sync/sync.use-cases";
import * as syncConflict from "@storymapper/server/application/sync/sync-conflict.use-cases";
import { createRoutes } from "@storymapper/server/http/routes";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

const human = { actorType: "human", actorId: "fixture" } as const;
const agent = { actorType: "agent", actorId: "parity-host", mcpSessionId: "parity-session" } as const;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-parity-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Parity Project" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Parity Map" });
    const release = repository.createRelease({ storyMapId: map.id, name: "Parity Release" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Parity Story", releaseId: release.id });
    repository.updateSafetySettings(project.id, { agentMode: "apply" });
    return { project, map, release, card };
  });
  const server = Fastify();
  cleanup.push(async () => { await server.close(); handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: agent.actorId, mcpSessionId: agent.mcpSessionId });
  return { ...rows, repository, unitOfWork, server, registry };
}

function cardFields(response: CardResponse): Omit<CardResponse["card"], "version" | "updatedAt"> {
  const { version, updatedAt, ...fields } = response.card;
  return fields;
}

const modules: Array<Record<string, unknown>> = [ai, card, cardChildren, changeSet, connector, customization, externalRef, publishing, githubLink, persona, project, release, report, restore, roadmap, source, storyMap, sync, syncConflict];
const capabilities = modules.flatMap((module) => Object.values(module).filter((value): value is CapabilityDescriptor => typeof value === "object" && value !== null && "kind" in value && "name" in value).map((descriptor) => ({ descriptor, run: module[descriptor.name] })));

describe("MCP and HTTP shared application parity", () => {
  it("sets scoped references over entity-specific HTTP routes and the unified MCP tool", testSetsScopedReferencesOverEntitySpecificHTTPRoutesAndTheUnified);

  registerCreatesAStableSessionForMCPCallersWithoutAn();
  registerReturnsATyped404ForMissingProjectSafetySettings();

  it("rejects /api/mcp/call with disabled when agent access is off and logs the denial", testRejectsApiMcpCallWithDisabledWhenAgentAccessIsOff);
  it("returns the same project and story-map reads after unwrapping MCP data", async () => {
    const f = await fixture();
    expect((await f.server.inject("/api/projects")).json()).toEqual((await f.registry.call("ListProjects", {})).data);
    expect((await f.server.inject("/api/story-maps?projectId=" + f.project.id)).json()).toEqual((await f.registry.call("ListStoryMaps", { projectId: f.project.id })).data);
  });

  registerAppliesTheSameDomainWritesThroughChangeSetsAndAttributes();

  registerUsesBothStoryMapAndReleaseIdsForThe();

  it("returns shared customization, Roadmap, Source Document and report reads through both surfaces", testReturnsSharedCustomizationRoadmapSourceDocumentAndReportReadsThroughBoth);

  it("requires an ActorContext before every read touches repository state", async () => {
    const f = await fixture();
    const deps: ApplicationDeps = { repository: f.repository, unitOfWork: f.unitOfWork };
    const reads = capabilities.filter(({ descriptor }) => descriptor.kind === "read");
    expect(reads.length).toBeGreaterThan(20);
    for (const { descriptor, run } of reads) {
      expect(typeof run, descriptor.name).toBe("function");
      await expect(Promise.resolve().then(() => Reflect.apply(run as Function, undefined, [deps, undefined, "missing"])), descriptor.name).rejects.toMatchObject({ name: "ZodError" });
    }
  });

  it("rejects agent actors in every human-only use case before any mutation", async () => {
    const f = await fixture();
    const deps: ApplicationDeps = { repository: f.repository, unitOfWork: f.unitOfWork };
    const before = f.repository.listActivity();
    const humanOnly = capabilities.filter(({ descriptor }) => descriptor.kind === "human-only");
    expect(humanOnly.length).toBeGreaterThan(10);
    for (const { descriptor, run } of humanOnly) {
      await expect(Promise.resolve().then(() => Reflect.apply(run as Function, undefined, [deps, agent, f.project.id, {}])), descriptor.name).rejects.toMatchObject({ code: "protected" });
    }
    expect(f.repository.listActivity()).toEqual(before);
  });

  it("returns generic correlated internal errors through HTTP and MCP and sanitizes MCP audit", testReturnsGenericCorrelatedInternalErrorsThroughHTTPAndMCPAndSanitizes);
});


it("updates Card Key prefix through versioned HTTP and separately applied MCP proposals", async () => {
  const f = await fixture();
  const patch = (cardKeyPrefix: string, baseVersion: number) => f.server.inject({ method: "PATCH", url: `/api/story-maps/${f.map.id}`, payload: { cardKeyPrefix, baseVersion } });
  expect((await patch("  ", f.map.version)).statusCode).toBe(400);
  const http = await patch(" HTTP ", f.map.version);
  expect(http.statusCode).toBe(200);
  expect(http.json()).toMatchObject({ storyMap: { cardKeyPrefix: "HTTP", version: f.map.version + 1 } });
  const stale = await patch("STALE", f.map.version);
  expect(stale.statusCode).toBe(409);
  expect(stale.json().conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ entity: "storyMap", id: f.map.id, currentVersion: f.map.version + 1 })]));
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.cardKeyPrefix).toBe("HTTP");
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  const proposed = await f.registry.call("UpdateStoryMap", { storyMapId: f.map.id, baseVersion: f.map.version + 1, patch: { cardKeyPrefix: " MCP " }, apply: false }) as ChangeSetCommandResponse;
  expect(proposed).toMatchObject({ outcome: "proposed", changeSet: { proposedBy: agent, operations: [expect.objectContaining({ entity: "storyMap", after: { cardKeyPrefix: "MCP" } })] } });
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.cardKeyPrefix).toBe("HTTP");
  const approved = await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/approve`, payload: {} });
  expect(approved.statusCode).toBe(200);
  const applied = await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/apply`, payload: {} });
  expect(applied.statusCode).toBe(200);
  expect(applied.json()).toMatchObject({ changeSet: { status: "applied" } });
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap).toMatchObject({ cardKeyPrefix: "MCP", version: f.map.version + 2 });
  expect(f.repository.getCard(f.card.id)).toEqual(f.card);
  const created = await f.server.inject({ method: "POST", url: "/api/cards", payload: { storyMapId: f.map.id, level: "activity", title: "Future key" } });
  expect(created.statusCode).toBe(201);
  expect(created.json().key).toBe("MCP-2");
});

function registerUsesBothStoryMapAndReleaseIdsForThe() {
  it("uses both Story Map and Release ids for the shared Release summary", async () => {
    const f = await fixture();
    const http = await f.server.inject("/api/reports/release-summary?storyMapId=" + f.map.id + "&releaseId=" + f.release.id);
    const mcp = await f.registry.call("GetStoryMapReleaseDetails", { storyMapId: f.map.id, releaseId: f.release.id });
    expect(http.statusCode).toBe(200);
    expect(mcp.data).toMatchObject({ summary: { storyMapId: f.map.id, releaseId: f.release.id, totalStories: 1 } });
    expect((mcp.data as { summary: unknown; }).summary).toEqual(http.json());
  });
}

function registerAppliesTheSameDomainWritesThroughChangeSetsAndAttributes() {
  it("applies the same domain writes through ChangeSets and attributes the MCP actor and session", async () => {
    const f = await fixture();
    const patch = { title: "Shared patch", description: "", status: "done", releaseId: null };
    const http = await f.server.inject({ method: "PATCH", url: "/api/cards/" + f.card.id, payload: { ...patch, baseVersion: f.repository.getCard(f.card.id)!.version } });
    const mcp = await f.registry.call("UpdateStoryMapCard", { cardId: f.card.id, baseVersion: f.repository.getCard(f.card.id)!.version, patch });
    expect(http.statusCode).toBe(200);
    expect(mcp).toMatchObject({ outcome: "applied", changeSet: { status: "applied", proposedBy: agent } });
    expect(cardFields({ card: http.json() })).toEqual(cardFields({ card: f.repository.getCardDetails(f.card.id)! }));
    expect(f.repository.listCardHistory(f.card.id).at(-1)).toMatchObject({ actor: agent.actorId, actorType: "agent", mcpSessionId: agent.mcpSessionId });
  });
}

function registerReturnsATyped404ForMissingProjectSafetySettings() {
  it("returns a typed 404 for missing Project safety settings", async () => {
    const f = await fixture();
    const response = await f.server.inject("/api/settings/safety?projectId=00000000-0000-0000-0000-000000000001");
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found", message: "Project not found." });
  });
}

function registerCreatesAStableSessionForMCPCallersWithoutAn() {
  it("creates a stable session for MCP callers without an explicitly supplied session", async () => {
    const f = await fixture();
    const registry = createMcpRegistry(f.repository, f.unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "default-host" });
    await registry.call("UpdateStoryMapCard", { cardId: f.card.id, baseVersion: f.repository.getCard(f.card.id)!.version, patch: { title: "Session write" } });
    await registry.call("UpdateStoryMapCard", { cardId: f.card.id, baseVersion: f.repository.getCard(f.card.id)!.version, patch: { description: "Same session" } });
    const events = f.repository.listActivity(f.project.id).filter((event) => event.action === "tool_call" && event.affectedEntityId === "UpdateStoryMapCard");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ actor: "default-host", actorType: "agent", mcpSessionId: expect.any(String) });
    expect(events[1]?.mcpSessionId).toBe(events[0]?.mcpSessionId);
    expect(f.repository.listCardHistory(f.card.id).at(-1)?.mcpSessionId).toBe(events[0]?.mcpSessionId);
  });
}

async function testSetsScopedReferencesOverEntitySpecificHTTPRoutesAndTheUnified() {
  const f = await fixture();
  const created = await f.server.inject({ method: "POST", url: `/api/cards/${f.card.id}/external-refs`, payload: { system: "agent", externalId: " Card-42 " } });
  expect(created.statusCode).toBe(201);
  expect(created.json()).toMatchObject({ status: "created", ref: { entityType: "card", entityId: f.card.id, scopeId: f.map.id, syncedVersion: f.card.version, externalId: "Card-42" } });
  const repeated = await f.server.inject({ method: "POST", url: `/api/cards/${f.card.id}/external-refs`, payload: { system: "agent", externalId: "Card-42" } });
  expect(repeated.statusCode).toBe(200);
  expect(repeated.json()).toMatchObject({ status: "unchanged", ref: created.json().ref });
  const conflict = await f.server.inject({ method: "POST", url: `/api/cards/${f.card.id}/external-refs`, payload: { system: "agent", externalId: "other" } });
  expect(conflict.statusCode).toBe(409);
  const invalid = await f.server.inject({ method: "POST", url: `/api/cards/${f.card.id}/external-refs`, payload: { system: "github", externalId: "42" } });
  expect(invalid.statusCode).toBe(400);
  await expect(f.registry.call("SetExternalRef", { entityType: "card", entityId: f.card.id, system: "github", externalId: "42" })).rejects.toMatchObject({ code: "validation" });
  const missing = await f.server.inject({ method: "POST", url: "/api/cards/00000000-0000-4000-8000-000000000001/external-refs", payload: { system: "agent", externalId: "missing" } });
  expect(missing.statusCode).toBe(404);
  const mcp = await f.registry.call("SetExternalRef", { entityType: "release", entityId: f.release.id, system: "planner", externalId: "release-9" });
  expect(mcp).toMatchObject({ outcome: "applied", changeSet: { status: "applied" } });
  expect(f.repository.listExternalRefsForStoryMap(f.map.id)).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "release", entityId: f.release.id, scopeId: f.map.id, externalId: "release-9" })]));
  const release = await f.server.inject({ method: "POST", url: `/api/releases/${f.release.id}/external-refs`, payload: { system: "manual", externalId: "release-10" } });
  expect(release.statusCode).toBe(201);
  expect((await f.server.inject({ method: "POST", url: `/api/releases/${f.release.id}/external-refs`, payload: { system: "manual", externalId: "release-10" } })).statusCode).toBe(200);
  expect((await f.server.inject({ method: "POST", url: `/api/releases/${f.release.id}/external-refs`, payload: { system: "manual", externalId: "release-other" } })).statusCode).toBe(409);
  const persona = f.unitOfWork.run(human, ({ repository }) => repository.createPersona({ projectId: f.project.id, storyMapId: f.map.id, name: "Reference persona", role: "Reader" }));
  const personaRef = await f.server.inject({ method: "POST", url: `/api/personas/${persona.id}/external-refs`, payload: { system: "planner", externalId: "persona-9" } });
  expect(personaRef.statusCode).toBe(201);
  expect((await f.server.inject({ method: "POST", url: `/api/personas/${persona.id}/external-refs`, payload: { system: "planner", externalId: "persona-9" } })).statusCode).toBe(200);
  expect((await f.server.inject({ method: "POST", url: `/api/personas/${persona.id}/external-refs`, payload: { system: "planner", externalId: "persona-other" } })).statusCode).toBe(409);
  expect(await f.registry.call("SetExternalRef", { entityType: "persona", entityId: persona.id, system: "agent", externalId: "persona-mcp" })).toMatchObject({ outcome: "applied" });
  expect(f.repository.listExternalRefsForPersonas([persona.id])).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "persona", entityId: persona.id, scopeId: f.map.id, externalId: "persona-mcp" })]));
  await expect(f.registry.call("SetExternalRef", { entityType: "persona", entityId: "00000000-0000-4000-8000-000000000001", system: "agent", externalId: "missing" })).rejects.toMatchObject({ code: "not_found" });
  const otherMapPersona = f.unitOfWork.run(human, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: f.project.id, name: "Other map" });
    const other = repository.createPersona({ projectId: f.project.id, storyMapId: map.id, name: "Other map persona", role: "Reader" });
    repository.setExternalRef({ entityType: "persona", entityId: other.id, system: "planner", externalId: "other-map" });
    return other;
  });
  const projectPersona = f.unitOfWork.run(human, ({ repository }) => repository.createPersona({ projectId: f.project.id, name: "Project persona", role: "Reader" }));
  await f.server.inject({ method: "POST", url: `/api/personas/${projectPersona.id}/external-refs`, payload: { system: "planner", externalId: "project-persona" } });
  const personaList = await f.server.inject(`/api/personas?projectId=${f.project.id}&storyMapId=${f.map.id}`);
  expect(personaList.json().externalRefs.map(({ entityId }: { entityId: string }) => entityId).sort()).toEqual([persona.id, persona.id, projectPersona.id].sort());
  expect(personaList.json().personas.map(({ id }: { id: string }) => id)).not.toContain(otherMapPersona.id);
  const snapshot = await f.server.inject(`/api/story-maps/${f.map.id}`);
  expect(snapshot.json().externalRefs).toHaveLength(6);
}

async function testRejectsApiMcpCallWithDisabledWhenAgentAccessIsOff() {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "off" }));
  const response = await f.server.inject({
    method: "POST",
    url: "/api/mcp/call",
    payload: { name: "GetStoryMapCards", input: { storyMapId: f.map.id } }
  });
  expect(response.statusCode).toBe(403);
  expect(response.json()).toMatchObject({ code: "disabled", message: expect.stringContaining("Agent access") });
  expect(f.repository.listActivity(f.project.id).find((event) => event.action === "tool_call" && event.affectedEntityId === "GetStoryMapCards")).toMatchObject({
    actor: "local-mcp-host",
    actorType: "agent"
  });
}

async function testReturnsSharedCustomizationRoadmapSourceDocumentAndReportReadsThroughBoth() {
  const f = await fixture();
  const createdRoadmap = await f.registry.call("CreateRoadmap", { projectId: f.project.id, storyMapId: f.map.id, name: "Parity roadmap" });
  const roadmapId = (createdRoadmap as ChangeSetCommandResponse).changeSet.execution!.operationResults[0]!.entityIds[0]!;
  const imported = await f.registry.call("ImportSourceDocument", { projectId: f.project.id, title: "Parity source", type: "txt", content: "The HTTP and MCP surfaces share use cases." });
  const documentId = (imported as ChangeSetCommandResponse).changeSet.execution!.operationResults[0]!.entityIds[0]!;
  await f.registry.call("CreateAnnotation", { projectId: f.project.id, storyMapId: f.map.id, name: "Parity annotation" });
  const reads = [
    ["GetCustomization", "/api/customization?projectId=" + f.project.id + "&storyMapId=" + f.map.id, { projectId: f.project.id, storyMapId: f.map.id }],
    ["GetRoadmapDetails", "/api/roadmaps/" + roadmapId, { roadmapId }],
    ["GetSourceDocument", "/api/source-documents/" + documentId, { documentId }],
    ["GetBacklogHealthReport", "/api/reports/backlog-health?storyMapId=" + f.map.id, { storyMapId: f.map.id }],
    ["GetReleaseSummaryReport", "/api/reports/release-summary?storyMapId=" + f.map.id + "&releaseId=" + f.release.id, { storyMapId: f.map.id, releaseId: f.release.id }]
  ] as const;
  for (const [name, url, input] of reads) {
    const http = await f.server.inject(url);
    expect(http.statusCode, name).toBe(200);
    expect((await f.registry.call(name, input)).data, name).toEqual(http.json());
  }
}

async function testReturnsGenericCorrelatedInternalErrorsThroughHTTPAndMCPAndSanitizes() {
  const f = await fixture();
  vi.spyOn(cardActions, "updateCard").mockImplementation(() => { throw new Error("private database diagnostic"); });
  vi.spyOn(operationActions, "persistOperationResolution").mockImplementation(() => { throw new Error("private database diagnostic"); });
  const http = await f.server.inject({ method: "PATCH", url: "/api/cards/" + f.card.id, payload: { title: "Fail", baseVersion: f.card.version } });
  const mcp = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "UpdateStoryMapCard", input: { cardId: f.card.id, baseVersion: f.card.version, patch: { title: "Fail" } } } });
  for (const response of [http, mcp]) {
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: "internal", message: "An internal error occurred.", details: { errorId: expect.any(String) } });
    expect(response.body).not.toContain("private database diagnostic");
  }
  const failed = f.repository.listActivity(f.project.id).find((event) => event.action === "tool_call" && event.affectedEntityId === "UpdateStoryMapCard");
  expect(JSON.stringify(failed?.after)).toContain(mcp.json<{ details: { errorId: string } }>().details.errorId);
  expect(JSON.stringify(failed?.after)).not.toContain("private database diagnostic");
}

it("keeps Epic context local through versioned HTTP saves and separately applied MCP proposals", async () => {
  const f = await fixture();
  const remote = vi.spyOn(globalThis, "fetch");
  const context = { title: "Shared outcome", goal: "Frame this map", githubIssueUrl: "https://github.com/fixture/repo/issues/9" };
  const patch = (epicContext: unknown, baseVersion: number) => f.server.inject({ method: "PATCH", url: `/api/story-maps/${f.map.id}`, payload: { epicContext, baseVersion } });
  for (const invalid of [{ ...context, title: " " }, { ...context, goal: " " }, { ...context, githubIssueUrl: "https://github.com/fixture/repo/milestone/9" }]) expect((await patch(invalid, f.map.version)).statusCode).toBe(400);
  expect((await patch(context, f.map.version)).json()).toMatchObject({ storyMap: { epicContext: context, version: f.map.version + 1 } });
  expect((await patch(null, f.map.version)).statusCode).toBe(409);
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "off" }));
  await expect(f.registry.call("UpdateStoryMap", { storyMapId: f.map.id, baseVersion: f.map.version + 1, patch: { epicContext: null } })).rejects.toMatchObject({ code: "disabled" });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  for (const [index, nextContext] of [null, context].entries()) {
    const proposed = await f.registry.call("UpdateStoryMap", { storyMapId: f.map.id, baseVersion: f.map.version + index + 1, patch: { epicContext: nextContext }, apply: false }) as ChangeSetCommandResponse;
    expect(proposed).toMatchObject({ outcome: "proposed", changeSet: { operations: [expect.objectContaining({ entity: "storyMap", after: { epicContext: nextContext } })] } });
    expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.epicContext).toEqual(index === 0 ? context : undefined);
    expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/apply`, payload: {} })).statusCode).toBe(409);
    expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/approve`, payload: {} })).statusCode).toBe(200);
    expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/apply`, payload: {} })).statusCode).toBe(200);
    expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.epicContext).toEqual(nextContext ?? undefined);
  }
  expect((await patch(null, f.map.version + 3)).statusCode).toBe(200);
  const snapshot = f.repository.getStoryMapSnapshot(f.map.id)!;
  expect(snapshot.storyMap.epicContext).toBeUndefined();
  expect(snapshot.cards).toEqual([f.card]);
  expect(snapshot.externalRefs).toEqual([]);
  expect(snapshot.remoteWorkItemLinks).toEqual([]);
  expect(remote).not.toHaveBeenCalled();
});

it("versions local category names and requires approval for MCP map metadata changes", async () => {
  const f = await fixture();
  const remote = vi.spyOn(globalThis, "fetch");
  const names = { "#f5a623": "Risk" };
  const patch = (colorCategoryNames: unknown, baseVersion: number) => f.server.inject({ method: "PATCH", url: `/api/story-maps/${f.map.id}`, payload: { colorCategoryNames, baseVersion } });
  for (const invalid of [{ "#000000": "Risk" }, { "#f5a623": " " }, { "#f5a623": "x".repeat(61) }]) expect((await patch(invalid, f.map.version)).statusCode).toBe(400);
  expect((await patch(names, f.map.version)).json()).toMatchObject({ storyMap: { colorCategoryNames: names, version: f.map.version + 1 } });
  expect((await patch({}, f.map.version)).statusCode).toBe(409);
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "off" }));
  await expect(f.registry.call("UpdateStoryMap", { storyMapId: f.map.id, baseVersion: f.map.version + 1, patch: { colorCategoryNames: {} } })).rejects.toMatchObject({ code: "disabled" });
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  for (const [index, nextNames] of [{}, names].entries()) {
    const proposed = await f.registry.call("UpdateStoryMap", { storyMapId: f.map.id, baseVersion: f.map.version + index + 1, patch: { colorCategoryNames: nextNames }, apply: false }) as ChangeSetCommandResponse;
    expect(proposed).toMatchObject({ outcome: "proposed", changeSet: { operations: [expect.objectContaining({ entity: "storyMap", after: { colorCategoryNames: nextNames } })] } });
    expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.colorCategoryNames).toEqual(index === 0 ? names : undefined);
    expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/apply`, payload: {} })).statusCode).toBe(409);
    expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/approve`, payload: {} })).statusCode).toBe(200);
    expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/apply`, payload: {} })).statusCode).toBe(200);
    expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.colorCategoryNames).toEqual(index === 0 ? undefined : names);
  }
  const proposed = await f.registry.call("UpdateStoryMap", { storyMapId: f.map.id, baseVersion: f.map.version + 3, patch: { colorCategoryNames: {} }, apply: false }) as ChangeSetCommandResponse;
  expect((await patch({ "#f5a623": "Spike" }, f.map.version + 3)).statusCode).toBe(200);
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/approve`, payload: {} })).statusCode).toBe(200);
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/apply`, payload: {} })).statusCode).toBe(409);
  const snapshot = f.repository.getStoryMapSnapshot(f.map.id)!;
  expect(snapshot.storyMap.colorCategoryNames).toEqual({ "#f5a623": "Spike" });
  expect(snapshot.cards).toEqual([f.card]);
  expect(snapshot.externalRefs).toEqual([]);
  expect(snapshot.remoteWorkItemLinks).toEqual([]);
  expect(remote).not.toHaveBeenCalled();
});
