import { initializeSampleFixture } from "@storymapper/db/fixtures/sample-story-map";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import * as credentials from "@storymapper/server/services/credentials";
import { importWorkItems, planWorkItems, syncWorkItems } from "@storymapper/server/services/work-item-sync";

const cleanup: Array<() => Promise<void>> = [];

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-checklist-http-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const db = openStoryMapperDb(databasePath);
  const handle = new DatabaseHandle(db);
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const server = Fastify();
  cleanup.push(async () => { await server.close(); db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  return { server, repository, unitOfWork, db };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe("getting-started HTTP boundaries", () => {
  it("creates an empty Project atomically, then exposes only controlled progress actions", testCreatesAProjectAndSampleAtomicallyThenExposesOnlyControlledProgress);

  it("keeps actual MCP and AI proposal Cards pending before a human Card is saved", testKeepsActualMCPAndAIProposalCardsPendingBeforeAHuman);

  it("rejects invalid and unknown Projects and missing/deleted maps without mutation", testRejectsInvalidAndUnknownProjectsAndMissingDeletedMapsWithoutMutation);

  it("keeps removed-map customizations readable and editable through the scoped HTTP surface", testKeepsRemovedMapCustomizationsReadableAndEditableThroughTheScopedHTTP);

  it("leaves removed-map attachments and audit unchanged through public deletion", testLeavesRemovedMapAttachmentsAndAuditUnchangedThroughPublicDeletion);

  registerHidesRemovedMapsWhilePreservingSurvivingAvailabilityAtS();

  it("rolls back visual export completion and sample data if returning the checklist cannot initialize", testRollsBackVisualExportCompletionAndSampleDataIfReturningThe);

  it("checks disabled and removed sync targets without creating statuses or entering authentication", testChecksDisabledAndRemovedSyncTargetsWithoutCreatingStatusesOrEntering);

  it("rolls back the entire HTTP Project creation on failed sample initialization and permits one retry", async () => {
    const { server, repository, unitOfWork, db } = await fixture();
    db.$client.exec("CREATE TRIGGER reject_sample BEFORE UPDATE OF getting_started_initialized ON project_settings BEGIN SELECT RAISE(ABORT, 'sample failed'); END");
    expect((await server.inject({ method: "POST", url: "/api/projects", payload: { name: "Atomic Project" } })).statusCode).toBe(500);
    expect(repository.listProjects()).toEqual([]);
    expect(db.$client.prepare("SELECT count(*) AS count FROM activity_events").get()).toEqual({ count: 0 });
    db.$client.exec("DROP TRIGGER reject_sample");
    expect((await server.inject({ method: "POST", url: "/api/projects", payload: { name: "Atomic Project" } })).statusCode).toBe(201);
    expect(repository.listProjects()).toHaveLength(1);
    expect(repository.listStoryMaps()).toHaveLength(0);
  });

  it("exports only the selected Project and completes only its checklist", testExportsOnlyTheSelectedProjectAndCompletesOnlyItsChecklist);

  it("keeps failed server exports pending and persists successful story-map and audit generation", testKeepsFailedServerExportsPendingAndPersistsSuccessfulStoryMapAnd);

  it("rejects a removed import target before checking credentials or invoking a provider", async () => {
    const { server, repository, unitOfWork } = await fixture();
    const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Removed import target" }));
    const sampleId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id)).sampleStoryMapId!;
    unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.deleteStoryMap(sampleId));
    const input = { storyMapId: sampleId, connectionId: randomUUID() };
    await expect(planWorkItems(repository, unitOfWork, { actorType: "human", actorId: "fixture" }, { localOrigin: "http://127.0.0.1:4317", ...input, mode: "import" })).rejects.toMatchObject({ code: "not_found" });
    await expect(importWorkItems(repository, unitOfWork, { actorType: "human", actorId: "fixture" }, input)).rejects.toMatchObject({ code: "not_found" });
    expect((await server.inject({ method: "POST", url: "/api/sync/work-items/import", payload: input })).statusCode).toBe(404);
  });
});

function registerHidesRemovedMapsWhilePreservingSurvivingAvailabilityAtS() {
  it.each(["/api/github/sync-health", "/api/reports/release-timeline", "/api/reports/backlog-health", "/api/reports/release-summary"])("hides removed maps while preserving surviving availability at %s", async (path) => {
    const { server, repository, unitOfWork } = await fixture();
    const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Removed report target" }));
    const sampleId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id)).sampleStoryMapId!;
    const survivor = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Surviving report map" }));
    for (const storyMapId of [sampleId, survivor.id]) {
      const response = await server.inject(`${path}?storyMapId=${storyMapId}`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ storyMapId });
    }
    unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.deleteStoryMap(sampleId));
    expect((await server.inject(`${path}?storyMapId=${sampleId}`)).statusCode).toBe(404);
    const surviving = await server.inject(`${path}?storyMapId=${survivor.id}`);
    expect(surviving.statusCode).toBe(200);
    expect(surviving.json()).toMatchObject({ storyMapId: survivor.id });
  });
}

async function testCreatesAProjectAndSampleAtomicallyThenExposesOnlyControlledProgress() {
  const { server, repository, unitOfWork } = await fixture();
  const created = await server.inject({ method: "POST", url: "/api/projects", payload: { name: "Checklist HTTP" } });
  expect(created.statusCode).toBe(201);
  const projectId = created.json<{ id: string }>().id;
  const base = `/api/projects/${projectId}/getting-started`;
  const checklist = (await server.inject(base)).json().checklist;
  expect(checklist).toMatchObject({ initialized: true, dismissed: false, completed: { createStoryMap: false, addCards: false, connectGitHub: false, export: false } });
  expect(checklist.sampleStoryMapId).toBeNull();
  expect(repository.listStoryMaps(projectId)).toEqual([]);
  const map = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId, name: "First map" }));
  const snapshot = repository.getStoryMapSnapshot(map.id)!;
  expect(snapshot.cards).toEqual([]);
  const card = await server.inject({ method: "POST", url: "/api/cards", payload: { storyMapId: snapshot.storyMap.id, level: "activity", title: "Human activity", creationSource: "mcp" } });
  expect(card.statusCode).toBe(201);
  expect((await server.inject(base)).json().checklist.completed.addCards).toBe(true);
  expect((await server.inject({ method: "POST", url: `${base}/dismiss`, payload: { completed: { export: true } } })).statusCode).toBe(400);
  expect((await server.inject({ method: "POST", url: `${base}/export-success`, payload: { format: "html", completed: true } })).statusCode).toBe(400);
  expect(repository.getGettingStartedChecklist(projectId).completed.export).toBe(false);
  expect((await server.inject({ method: "POST", url: `${base}/export-success`, payload: { format: "html" } })).statusCode).toBe(200);
  expect((await server.inject({ method: "POST", url: `${base}/dismiss`, payload: {} })).json().checklist.dismissed).toBe(true);
}

async function testKeepsActualMCPAndAIProposalCardsPendingBeforeAHuman() {
  const { server, repository, unitOfWork } = await fixture();
  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Generated HTTP provenance" }));
  const storyMapId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id)).sampleStoryMapId!;
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateSafetySettings(project.id, { agentMode: "apply" }));
  const mcp = await server.inject({ method: "POST", url: "/api/mcp/call", payload: {
    name: "CreateStoryMapCard", input: { storyMapId, level: "activity", title: "MCP activity" }
  } });
  expect(mcp.statusCode).toBe(200);
  expect(repository.getGettingStartedChecklist(project.id).completed.addCards).toBe(false);
  const proposal = await server.inject({ method: "POST", url: "/api/ai/proposals", payload: {
    projectId: project.id, storyMapId, templateId: "goals-steps-stories"
  } });
  expect(proposal.statusCode).toBe(201);
  const changeSetId = proposal.json().changeSet.id;
  expect((await server.inject({ method: "POST", url: `/api/changesets/${changeSetId}/approve`, payload: {} })).statusCode).toBe(200);
  const applied = await server.inject({ method: "POST", url: `/api/changesets/${changeSetId}/apply`, payload: {} });
  expect(applied.statusCode, applied.body).toBe(200);
  expect(repository.getGettingStartedChecklist(project.id).completed.addCards).toBe(false);
  expect((await server.inject({ method: "POST", url: "/api/cards", payload: { storyMapId, level: "activity", title: "Human activity" } })).statusCode).toBe(201);
  expect(repository.getGettingStartedChecklist(project.id).completed.addCards).toBe(true);
}

async function testRejectsInvalidAndUnknownProjectsAndMissingDeletedMapsWithoutMutation() {
  const { server, repository, unitOfWork } = await fixture();
  for (const [projectId, expected] of [["invalid", 400], [randomUUID(), 404]] as const) {
    const base = `/api/projects/${projectId}/getting-started`;
    expect((await server.inject(base)).statusCode).toBe(expected);
    expect((await server.inject({ method: "POST", url: `${base}/dismiss`, payload: {} })).statusCode).toBe(expected);
    expect((await server.inject({ method: "POST", url: `${base}/export-success`, payload: { format: "png" } })).statusCode).toBe(expected);
  }
  expect(repository.listProjects()).toEqual([]);
  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Delete HTTP" }));
  const sampleId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id)).sampleStoryMapId!;
  const sampleUrl = `/api/story-maps/${sampleId}?baseVersion=${repository.getStoryMapOrThrow(sampleId).version}`;
  expect((await server.inject({ method: "DELETE", url: sampleUrl })).statusCode).toBe(200);
  expect((await server.inject(`/api/story-maps/${sampleId}`)).statusCode).toBe(404);
  expect((await server.inject({ method: "DELETE", url: sampleUrl })).statusCode).toBe(404);
  expect((await server.inject({ method: "DELETE", url: "/api/story-maps/invalid" })).statusCode).toBe(400);
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.ensureSeedData());
  expect(repository.listStoryMaps(project.id)).toEqual([]);
}

async function testKeepsRemovedMapCustomizationsReadableAndEditableThroughTheScopedHTTP() {
  const { server, repository, unitOfWork } = await fixture();
  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Retained HTTP customization" }));
  const sampleId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id)).sampleStoryMapId!;
  const persona = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createPersona({ projectId: project.id, storyMapId: sampleId, name: "Sample Persona", role: "Reader" }));
  const status = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createWorkflowStatus({ projectId: project.id, storyMapId: sampleId, name: "Sample review", group: "active" }));
  const path = `/api/customization?projectId=${project.id}&storyMapId=${sampleId}`;
  const before = await server.inject(path);
  expect(before.statusCode).toBe(200);
  expect((await server.inject({ method: "DELETE", url: `/api/story-maps/${sampleId}?baseVersion=${repository.getStoryMapOrThrow(sampleId).version}` })).statusCode).toBe(200);
  const after = await server.inject(path);
  expect(after.statusCode).toBe(200);
  expect(after.json()).toEqual({ ...before.json(), usageCards: [] });
  expect(after.json().personas).toEqual(expect.arrayContaining([expect.objectContaining({ id: persona.id, storyMapId: sampleId })]));
  expect(after.json().workflowStatuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: status.id, storyMapId: sampleId })]));
  const updatedPersona = await server.inject({ method: "PATCH", url: `/api/personas/${persona.id}`, payload: { name: "Retained Persona", baseVersion: persona.version } });
  expect(updatedPersona.statusCode).toBe(200);
  expect(updatedPersona.json()).toMatchObject({ id: persona.id, storyMapId: sampleId, name: "Retained Persona" });
  const updatedStatus = await server.inject({ method: "PATCH", url: `/api/workflow-statuses/${status.id}`, payload: { name: "Retained review", definitionBefore: status, affectedCards: [] } });
  expect(updatedStatus.statusCode).toBe(200);
  expect(updatedStatus.json()).toMatchObject({ id: status.id, storyMapId: sampleId, name: "Retained review" });
  expect((await server.inject({ method: "DELETE", url: `/api/personas/${persona.id}?baseVersion=${repository.getPersona(persona.id)!.version}`, payload: { definitionBefore: repository.getPersona(persona.id), affectedCards: [] } })).json()).toEqual({ ok: true, version: expect.any(Number) });
  expect((await server.inject({ method: "DELETE", url: `/api/workflow-statuses/${status.id}`, payload: { definitionBefore: repository.getWorkflowStatus(status.id), affectedCards: [] } })).json()).toEqual({ ok: true });
  expect((await server.inject(path)).statusCode).toBe(200);
}

async function testLeavesRemovedMapAttachmentsAndAuditUnchangedThroughPublicDeletion() {
  const { server, repository, unitOfWork, db } = await fixture();
  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Removed attachment" }));
  const sampleId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id)).sampleStoryMapId!;
  const card = repository.listCards(sampleId)[0]!;
  const attachment = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCardAttachment(card.id, { label: "Evidence", filePath: "/tmp/evidence.txt" }))!;
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.deleteStoryMap(sampleId));
  const beforeAttachment = db.$client.prepare("SELECT * FROM card_attachments WHERE id = ?").get(attachment.id);
  const beforeAudit = repository.listActivity(project.id);
  const response = await server.inject({ method: "DELETE", url: `/api/cards/${card.id}/attachments/${attachment.id}` });
  expect(response.json()).toEqual({ ok: false });
  expect(db.$client.prepare("SELECT * FROM card_attachments WHERE id = ?").get(attachment.id)).toEqual(beforeAttachment);
  expect(repository.listActivity(project.id)).toEqual(beforeAudit);
}

async function testRollsBackVisualExportCompletionAndSampleDataIfReturningThe() {
  const { server, repository, unitOfWork, db } = await fixture();
  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Visual export initialization rollback" }));
  const state = () => Object.fromEntries(["project_settings", "story_maps", "cards", "releases", "card_versions", "activity_events"]
    .map((table) => [table, db.$client.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
  const before = state();
  db.$client.exec("CREATE TRIGGER reject_visual_sample BEFORE UPDATE OF getting_started_initialized ON project_settings BEGIN SELECT RAISE(ABORT, 'initialization failed'); END");
  const url = `/api/projects/${project.id}/getting-started/export-success`;
  expect((await server.inject({ method: "POST", url, payload: { format: "html" } })).statusCode).toBe(500);
  expect(state()).toEqual(before);
  db.$client.exec("DROP TRIGGER reject_visual_sample");
  const success = await server.inject({ method: "POST", url, payload: { format: "html" } });
  expect(success.statusCode).toBe(200);
  expect(success.json().checklist).toMatchObject({ initialized: true, completed: { export: true } });
  expect(repository.listStoryMaps(project.id)).toHaveLength(0);
}

async function testChecksDisabledAndRemovedSyncTargetsWithoutCreatingStatusesOrEntering() {
  const { server, repository, unitOfWork, db } = await fixture();
  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Early sync guards" }));
  const storyMapId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id)).sampleStoryMapId!;
  const connection = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createConnectorConnection({ projectId: project.id, provider: "github", name: "Disabled GitHub", owner: "owner", repository: "repo", authMode: "token" }));
  const input = { storyMapId, connectionId: connection.id };
  const auth = vi.spyOn(credentials, "resolveProviderAuth").mockRejectedValue(new Error("Authentication must not run."));
  db.$client.exec("DELETE FROM workflow_statuses");
  const state = () => Object.fromEntries(["project_settings", "story_maps", "cards", "workflow_statuses", "connector_connections", "activity_events", "sync_runs"]
    .map((table) => [table, db.$client.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
  for (const removed of [false, true]) {
    if (removed) {
      unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateSafetySettings(project.id, { github: true }));
      unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.deleteStoryMap(storyMapId));
    }
    const before = state();
    const statusCode = removed ? 404 : 403;
    await expect(planWorkItems(repository, unitOfWork, { actorType: "human", actorId: "fixture" }, { localOrigin: "http://127.0.0.1:4317", ...input, mode: "import" })).rejects.toMatchObject({ code: removed ? "not_found" : "disabled" });
    await expect(importWorkItems(repository, unitOfWork, { actorType: "human", actorId: "fixture" }, input)).rejects.toMatchObject({ code: removed ? "not_found" : "disabled" });
    await expect(syncWorkItems(repository, unitOfWork, { actorType: "human", actorId: "fixture" }, { ...input, localOrigin: "http://127.0.0.1:4317" })).rejects.toMatchObject({ code: removed ? "not_found" : "disabled" });
    for (const [path, payload] of [
      ["plan", { ...input, mode: "import" }], ["import", input], ["sync", { ...input, confirm: true }]
    ] as const) {
      expect((await server.inject({ method: "POST", url: `/api/sync/work-items/${path}`, payload })).statusCode).toBe(statusCode);
    }
    expect(auth).not.toHaveBeenCalled();
    expect(state()).toEqual(before);
  }
}

async function testExportsOnlyTheSelectedProjectAndCompletesOnlyItsChecklist() {
  const { server, repository, unitOfWork, db } = await fixture();
  const first = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProjectWithGettingStarted({ name: "First archive Project" }));
  const second = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Second archive Project" }));
  db.$client.exec(`CREATE TRIGGER reject_export BEFORE UPDATE OF completed_export ON project_settings WHEN NEW.project_id = '${first.id}' BEGIN SELECT RAISE(ABORT, 'later completion failed'); END`);
  expect((await server.inject(`/api/projects/export?projectId=${first.id}`)).statusCode).toBe(400);
  expect(repository.getGettingStartedChecklist(first.id).completed.export).toBe(false);
  expect(repository.getGettingStartedChecklist(second.id).completed.export).toBe(false);
  db.$client.exec("DROP TRIGGER reject_export");
  const response = await server.inject(`/api/projects/export?projectId=${first.id}`);
  expect(response.statusCode).toBe(200);
  const archive = await JSZip.loadAsync(response.rawPayload);
  expect(archive.file("manifest.json")).not.toBeNull();
  expect(archive.file("storymapper.sqlite")).not.toBeNull();
  expect(repository.getGettingStartedChecklist(first.id).completed.export).toBe(true);
  expect(repository.getGettingStartedChecklist(second.id).completed.export).toBe(false);
}

async function testKeepsFailedServerExportsPendingAndPersistsSuccessfulStoryMapAnd() {
  const { server, repository, unitOfWork, db } = await fixture();
  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Exports HTTP" }));
  const sampleId = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => initializeSampleFixture(repository, project.id)).sampleStoryMapId!;
  db.$client.exec("CREATE TRIGGER reject_export_event BEFORE INSERT ON activity_events WHEN NEW.action = 'exports.storyMapCreated' BEGIN SELECT RAISE(ABORT, 'Generation failed.'); END");
  expect((await server.inject(`/api/exports/story-map?storyMapId=${sampleId}&format=json`)).statusCode).toBe(500);
  expect(repository.getGettingStartedChecklist(project.id).completed.export).toBe(false);
  db.$client.exec("DROP TRIGGER reject_export_event");
  const success = await server.inject(`/api/exports/story-map?storyMapId=${sampleId}&format=json`);
  expect(success.statusCode).toBe(200);
  expect(success.json().snapshot.cards).toHaveLength(3);
  expect(repository.getGettingStartedChecklist(project.id).completed.export).toBe(true);
  const other = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Audit HTTP" }));
  const audit = await server.inject(`/api/exports/audit?projectId=${other.id}&format=json`);
  expect(audit.statusCode).toBe(200);
  expect(audit.json().events).toEqual(expect.arrayContaining([expect.objectContaining({ action: "exports.auditCreated" })]));
  expect(repository.getGettingStartedChecklist(other.id).completed.export).toBe(true);
}
