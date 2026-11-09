import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { Project, StoryMap, Release } from "@storymapper/contracts";
import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { createWorkItemProvider, WorkItemProvider } from "@storymapper/github";
import { reviewedPushPlanningFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn(() => { throw new Error("Unexpected provider creation."); }) }));
vi.mock("@storymapper/server/services/credentials", async (original) => ({ ...await original<typeof import("@storymapper/server/services/credentials")>(), resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

describe("createRoutes", () => {
  it("exposes an English Project with empty maps and default customizations without inventing Personas or Story Templates", testExposesEnglishProjectAndSeededDefaultsWithoutInventingPersonasOrStory);

  it("bulk updates cards through the HTTP API", testBulkUpdatesCardsThroughTheHTTPAPI);

  it("rejects empty bulk card updates", testRejectsEmptyBulkCardUpdates);

  it("serves product context and AI templates", testServesProductContextAndAITemplates);

  it("serves card history and attachment endpoints", testServesCardHistoryAndAttachmentEndpoints);

  it("serves release summary reports", testServesReleaseSummaryReports);

  it("reorders release lanes through the HTTP API", testReordersReleaseLanesThroughTheHTTPAPI);

  it("serves customization CRUD and card assignment endpoints", testServesCustomizationCRUDAndCardAssignmentEndpoints);

  it("serves release timeline and roadmap endpoints", testServesReleaseTimelineAndRoadmapEndpoints);

  it("serves safety settings and export downloads", testServesSafetySettingsAndExportDownloads);

  it("serves connector connection CRUD and blocks planning when the GitHub switch is off", testServesConnectorConnectionCRUDAndBlocksPlanningWhenTheGitHubSwitch);
});

async function testExposesEnglishProjectAndSeededDefaultsWithoutInventingPersonasOrStory() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.ensureSeedData());
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  try {
    const seedProjects = await server.inject({ method: "GET", url: "/api/projects" });
    const seed = seedProjects.json<{ projects: Array<{ id: string; name: string; description: string; defaultLanguage: string }> }>().projects[0]!;
    expect(seed).toMatchObject({ name: "Demo Local Project", description: "Seed project for local development.", defaultLanguage: "en" });
    const seedMaps = await server.inject({ method: "GET", url: `/api/story-maps?projectId=${seed.id}` });
    expect(seedMaps.json().storyMaps).toEqual([]);
    const created = await server.inject({ method: "POST", url: "/api/projects", payload: { name: "Route Customization Test" } });
    expect(created.statusCode).toBe(201);
    const project = created.json<{ id: string; defaultLanguage: string }>();
    expect(project.defaultLanguage).toBe("en");
    for (const projectId of [seed.id, project.id]) {
      const response = await server.inject({ method: "GET", url: `/api/customization?projectId=${projectId}` });
      expect(response.statusCode).toBe(200);
      const defaults = response.json<{ workflowStatuses: Array<{ name: string }>; personas: unknown[]; storyTemplates: unknown[] }>();
      expect(defaults.workflowStatuses.map((status) => status.name)).toEqual(["todo", "active", "done", "archived"]);
      expect(defaults.personas).toEqual([]);
      expect(defaults.storyTemplates).toEqual([]);
    }
    const templates = await server.inject({ method: "GET", url: `/api/ai/templates?projectId=${seed.id}` });
    expect(templates.json<{ templates: Array<{ name: string; instructions: string }> }>().templates).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "PRD to Story Map", instructions: "Create activities, steps and stories from source chunks. Return a proposed ChangeSet only." }),
      expect.objectContaining({ name: "Personas", instructions: "Brainstorm local personas from Product Context. Return a proposed ChangeSet only." })
    ]));
  } finally {
    await server.close();
  }
}

async function testBulkUpdatesCardsThroughTheHTTPAPI() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Route Bulk Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const activity = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", title: "Story" }));
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: join(directory, "storymapper.sqlite") });

  const response = await server.inject({
    method: "PATCH",
    url: "/api/cards/bulk",
    payload: {
      storyMapId: storyMap.id,
      cards: [{ id: story.id, baseVersion: story.version }],
      patch: { status: "done", estimate: 3 }
    }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json<{ cards: Array<{ status: string; estimate: number }> }>().cards[0]).toMatchObject({
    status: "done",
    estimate: 3
  });
  expect(repository.getCardDetails(story.id)?.status).toBe("done");

  await server.close();
}

async function testRejectsEmptyBulkCardUpdates() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Route Bulk Validation Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: join(directory, "storymapper.sqlite") });

  const response = await server.inject({
    method: "PATCH",
    url: "/api/cards/bulk",
    payload: {
      storyMapId: storyMap.id,
      cardIds: [],
      patch: { status: "done" }
    }
  });

  expect(response.statusCode).toBeGreaterThanOrEqual(400);

  await server.close();
}

async function testServesProductContextAndAITemplates() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Route Product Context Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: join(directory, "storymapper.sqlite") });

  const updateResponse = await server.inject({
    method: "PATCH",
    url: "/api/product-context",
    payload: {
      projectId: project.id,
      storyMapId: storyMap.id,
      productType: "Developer tool",
      purpose: "Plan work",
      keyFeatures: ["Sync health"]
    }
  });
  const getResponse = await server.inject({
    method: "GET",
    url: `/api/product-context?projectId=${project.id}&storyMapId=${storyMap.id}`
  });
  const templatesResponse = await server.inject({
    method: "GET",
    url: `/api/ai/templates?projectId=${project.id}`
  });
  await exerciseTestServesProductContextAndAITemplates(server, project, storyMap, updateResponse, getResponse, templatesResponse);

  const other = unitOfWork.run({ actorType: "human", actorId: "owner" }, ({ repository }) => repository.createProject({ name: "Template owner" }));
  const original = unitOfWork.run({ actorType: "human", actorId: "owner" }, ({ repository }) => repository.createAiTemplate({ projectId: other.id, id: "exclusive-template", name: "Original", instructions: "Private owner instructions", arguments: [], examples: ["Private example"], outputSchemaName: "ChangeSet" }));
  const before = repository.listActivity(other.id);
  for (const method of ["PATCH", "DELETE"] as const) {
    const refused = await server.inject({ method, url: `/api/projects/${project.id}/ai/templates/${original.id}`, payload: method === "PATCH" ? { name: "Foreign mutation" } : {} });
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toMatchObject({ code: "not_found" });
    expect(repository.getAiTemplate(other.id, original.id)).toEqual(original);
    expect(repository.getAiTemplate(project.id, original.id)).toBeUndefined();
    expect(repository.listActivity(other.id)).toEqual(before);
  }
  await server.close();
}

async function exerciseTestServesProductContextAndAITemplates(server: FastifyInstance, project: Project, storyMap: StoryMap, updateResponse: LightMyRequestResponse, getResponse: LightMyRequestResponse, templatesResponse: LightMyRequestResponse) {
  const proposalResponse = await server.inject({
    method: "POST",
    url: "/api/ai/proposals",
    payload: {
      projectId: project.id,
      storyMapId: storyMap.id,
      templateId: "goals-steps-stories"
    }
  });

  expect(updateResponse.statusCode).toBe(200);
  expect(getResponse.json<{ context: { purpose: string; keyFeatures: string[]; }; }>().context).toMatchObject({
    purpose: "Plan work",
    keyFeatures: ["Sync health"]
  });
  expect(templatesResponse.json<{ templates: Array<{ id: string; }>; }>().templates.some((template) => template.id === "gap-analysis")).toBe(true);
  expect(proposalResponse.statusCode).toBe(201);
  expect(proposalResponse.json<{ changeSet: { operations: unknown[]; }; }>().changeSet.operations.length).toBeGreaterThan(0);
}

async function testServesCardHistoryAndAttachmentEndpoints() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Route Card Detail Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const card = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateCard(card.id, { title: "Updated activity" }));
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: join(directory, "storymapper.sqlite") });

  const createAttachmentResponse = await server.inject({
    method: "POST",
    url: `/api/cards/${card.id}/attachments`,
    payload: {
      label: "Spec",
      filePath: "/tmp/spec.md",
      mimeType: "text/markdown"
    }
  });
  const historyResponse = await server.inject({
    method: "GET",
    url: `/api/cards/${card.id}/history`
  });
  const attachmentId = createAttachmentResponse.json<{ attachment: { id: string } }>().attachment.id;
  const deleteAttachmentResponse = await server.inject({
    method: "DELETE",
    url: `/api/cards/${card.id}/attachments/${attachmentId}`
  });

  expect(createAttachmentResponse.statusCode).toBe(201);
  expect(historyResponse.json<{ versions: Array<{ version: number; snapshot: { title: string; version: number } }> }>().versions).toMatchObject([
    { version: 3, snapshot: { title: "Updated activity", version: 3 } },
    { version: 2, snapshot: { title: "Updated activity", version: 2 } }
  ]);
  expect(deleteAttachmentResponse.json<{ ok: boolean }>().ok).toBe(true);

  await server.close();
}

async function testServesReleaseSummaryReports() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Route Release Summary Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const release = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createRelease({ storyMapId: storyMap.id, name: "MVP" }));
  const activity = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: step.id, releaseId: release.id, level: "story", title: "Story" }));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateCard(story.id, { estimate: 2, status: "active" }));
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: join(directory, "storymapper.sqlite") });

  const releaseResponse = await server.inject({
    method: "GET",
    url: `/api/reports/release-summary?storyMapId=${storyMap.id}&releaseId=${release.id}`
  });
  const unscheduledResponse = await server.inject({
    method: "GET",
    url: `/api/reports/release-summary?storyMapId=${storyMap.id}&releaseId=unscheduled`
  });

  expect(releaseResponse.statusCode).toBe(200);
  expect(releaseResponse.json<{ totalStories: number; estimateTotal: number; statusCounts: Record<string, number> }>()).toMatchObject({
    totalStories: 1,
    estimateTotal: 2,
    statusCounts: { active: 1 }
  });
  expect(unscheduledResponse.statusCode).toBe(200);
  expect(unscheduledResponse.json<{ scope: string; totalStories: number }>()).toMatchObject({
    scope: "unscheduled",
    totalStories: 0
  });

  await server.close();
}

async function testReordersReleaseLanesThroughTheHTTPAPI() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Route Release Reorder Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const first = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createRelease({ storyMapId: storyMap.id, name: "First" }));
  const middle = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createRelease({ storyMapId: storyMap.id, name: "Middle" }));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createRelease({ storyMapId: storyMap.id, name: "Last" }));
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: join(directory, "storymapper.sqlite") });

  const moveResponse = await server.inject({
    method: "PATCH",
    url: `/api/releases/${middle.id}`,
    payload: { position: 0, baseVersion: middle.version }
  });
  const invalidMoveResponse = await server.inject({
    method: "PATCH",
    url: `/api/releases/${first.id}`,
    payload: { position: 3, baseVersion: repository.getRelease(first.id)!.version }
  });

  expect(moveResponse.statusCode).toBe(200);
  expect(moveResponse.json<{ position: number }>().position).toBe(0);
  expect(repository.listReleases(storyMap.id).map((release) => release.name)).toEqual(["Middle", "First", "Last"]);
  expect(invalidMoveResponse.statusCode).toBe(400);

  await server.close();
}

async function testServesCustomizationCRUDAndCardAssignmentEndpoints() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Route Customization Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const activity = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const server = Fastify();
  const { personaResponse, statusResponse } = await exerciseTestServesCustomizationCRUDAndCardAssignmentEndpoints2(server, repository, unitOfWork, directory, project, storyMap);
  const annotationResponse = await server.inject({
    method: "POST",
    url: "/api/annotations",
    payload: {
      projectId: project.id,
      storyMapId: storyMap.id,
      name: "Risk"
    }
  });
  const templateResponse = await server.inject({
    method: "POST",
    url: "/api/story-templates",
    payload: {
      projectId: project.id,
      storyMapId: storyMap.id,
      name: "Story",
      descriptionTemplate: "As a user..."
    }
  });
  const personaId = personaResponse.json<{ id: string }>().id;
  const annotationId = annotationResponse.json<{ id: string }>().id;
  const personaLinkResponse = await server.inject({
    method: "POST",
    url: `/api/cards/${activity.id}/personas/${personaId}`
  });
  const annotationLinkResponse = await server.inject({
    method: "POST",
    url: `/api/cards/${activity.id}/annotations/${annotationId}`
  });
  const customizationResponse = await server.inject({
    method: "GET",
    url: `/api/customization?projectId=${project.id}&storyMapId=${storyMap.id}`
  });

  await exerciseTestServesCustomizationCRUDAndCardAssignmentEndpoints(statusResponse, personaResponse, annotationResponse, templateResponse, personaLinkResponse, annotationLinkResponse, customizationResponse, server);
}

async function exerciseTestServesCustomizationCRUDAndCardAssignmentEndpoints2(server: FastifyInstance, repository: StoryMapperRepository<"root">, unitOfWork: UnitOfWork, directory: string, project: Project, storyMap: StoryMap) {
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: join(directory, "storymapper.sqlite") });

  const statusResponse = await server.inject({
    method: "POST",
    url: "/api/workflow-statuses",
    payload: {
      projectId: project.id,
      storyMapId: storyMap.id,
      name: "blocked",
      group: "active"
    }
  });
  const personaResponse = await server.inject({
    method: "POST",
    url: "/api/personas",
    payload: {
      projectId: project.id,
      storyMapId: storyMap.id,
      name: "Buyer",
      role: "Decision maker"
    }
  });
  return { personaResponse, statusResponse };
}

async function exerciseTestServesCustomizationCRUDAndCardAssignmentEndpoints(statusResponse: LightMyRequestResponse, personaResponse: LightMyRequestResponse, annotationResponse: LightMyRequestResponse, templateResponse: LightMyRequestResponse, personaLinkResponse: LightMyRequestResponse, annotationLinkResponse: LightMyRequestResponse, customizationResponse: LightMyRequestResponse, server: FastifyInstance) {
  expect(statusResponse.statusCode).toBe(201);
  expect(personaResponse.statusCode).toBe(201);
  expect(annotationResponse.statusCode).toBe(201);
  expect(templateResponse.statusCode).toBe(201);
  expect(personaLinkResponse.statusCode).toBe(201);
  expect(annotationLinkResponse.statusCode).toBe(201);
  expect(customizationResponse.statusCode).toBe(200);
  expect(customizationResponse.json<{
    workflowStatuses: Array<{ name: string; }>;
    personas: Array<{ name: string; }>;
    annotations: Array<{ name: string; }>;
    cardPersonas: unknown[];
    cardAnnotations: unknown[];
    storyTemplates: Array<{ name: string; }>;
  }>()).toMatchObject({
    personas: [{ name: "Buyer" }],
    annotations: [{ name: "Risk" }],
    storyTemplates: [{ name: "Story" }]
  });
  expect(customizationResponse.json<{ workflowStatuses: Array<{ name: string; }>; }>().workflowStatuses.some((status) => status.name === "blocked")).toBe(true);
  expect(customizationResponse.json<{ cardPersonas: unknown[]; }>().cardPersonas).toHaveLength(1);
  expect(customizationResponse.json<{ cardAnnotations: unknown[]; }>().cardAnnotations).toHaveLength(1);

  await server.close();
}

async function testServesReleaseTimelineAndRoadmapEndpoints() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Route Roadmap Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const release = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createRelease({
    storyMapId: storyMap.id,
    name: "MVP",
    startDate: "2026-07-01",
    releaseDate: "2026-07-15"
  }));
  const activity = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: step.id, releaseId: release.id, level: "story", title: "Story" }));
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: join(directory, "storymapper.sqlite") });

  const timelineResponse = await server.inject({
    method: "GET",
    url: `/api/reports/release-timeline?storyMapId=${storyMap.id}`
  });
  const roadmapResponse = await server.inject({
    method: "POST",
    url: "/api/roadmaps",
    payload: {
      projectId: project.id,
      storyMapId: storyMap.id,
      name: "Release Roadmap",
      type: "release"
    }
  });
  const roadmapId = roadmapResponse.json<{ id: string }>().id;
  const detailsResponse = await server.inject({
    method: "GET",
    url: `/api/roadmaps/${roadmapId}`
  });
  const columnId = detailsResponse.json<{ columns: Array<{ id: string }> }>().columns[0]!.id;
  await exerciseTestServesReleaseTimelineAndRoadmapEndpoints2(server, roadmapId, columnId, release, timelineResponse, roadmapResponse, detailsResponse);
}

async function exerciseTestServesReleaseTimelineAndRoadmapEndpoints2(server: FastifyInstance, roadmapId: string, columnId: string, release: Release, timelineResponse: LightMyRequestResponse, roadmapResponse: LightMyRequestResponse, detailsResponse: LightMyRequestResponse) {
  const cardResponse = await server.inject({
    method: "POST",
    url: "/api/roadmap-cards",
    payload: {
      roadmapId,
      columnId,
      title: "Ship MVP"
    }
  });
  const referenceResponse = await server.inject({
    method: "POST",
    url: "/api/roadmap-references",
    payload: {
      roadmapCardId: cardResponse.json<{ id: string; }>().id,
      targetType: "release",
      targetId: release.id
    }
  });
  await exerciseTestServesReleaseTimelineAndRoadmapEndpoints(server, roadmapId, timelineResponse, roadmapResponse, detailsResponse, cardResponse, referenceResponse);
}

async function exerciseTestServesReleaseTimelineAndRoadmapEndpoints(server: FastifyInstance, roadmapId: string, timelineResponse: LightMyRequestResponse, roadmapResponse: LightMyRequestResponse, detailsResponse: LightMyRequestResponse, cardResponse: LightMyRequestResponse, referenceResponse: LightMyRequestResponse) {
  const refreshedDetailsResponse = await server.inject({
    method: "GET",
    url: `/api/roadmaps/${roadmapId}`
  });

  expect(timelineResponse.statusCode).toBe(200);
  expect(timelineResponse.json<{ startDate: string; items: Array<{ totalStories: number; }>; }>()).toMatchObject({
    startDate: "2026-07-01",
    items: [{ totalStories: 1 }]
  });
  expect(roadmapResponse.statusCode).toBe(201);
  expect(detailsResponse.statusCode).toBe(200);
  expect(cardResponse.statusCode).toBe(201);
  expect(referenceResponse.statusCode).toBe(201);
  expect(refreshedDetailsResponse.json<{ reports: Array<{ totalStories: number; }>; }>().reports[0]?.totalStories).toBe(1);

  await server.close();
}

async function testServesSafetySettingsAndExportDownloads() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Route Export Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Route Export Map" }));
  const activity = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", title: "Download Story" }));
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });

  const settingsResponse = await server.inject({
    method: "GET",
    url: `/api/settings/safety?projectId=${project.id}`
  });
  const updateResponse = await server.inject({
    method: "PATCH",
    url: `/api/settings/safety?projectId=${project.id}`,
    payload: {
      github: true
    }
  });
  const exportResponse = await server.inject({
    method: "GET",
    url: `/api/exports/story-map?storyMapId=${storyMap.id}&format=markdown`
  });
  const auditResponse = await server.inject({
    method: "GET",
    url: `/api/exports/audit?projectId=${project.id}&format=json`
  });

  await exerciseTestServesSafetySettingsAndExportDownloads(settingsResponse, updateResponse, exportResponse, auditResponse, server);
}

async function exerciseTestServesSafetySettingsAndExportDownloads(settingsResponse: LightMyRequestResponse, updateResponse: LightMyRequestResponse, exportResponse: LightMyRequestResponse, auditResponse: LightMyRequestResponse, server: FastifyInstance) {
  expect(settingsResponse.statusCode).toBe(200);
  expect(settingsResponse.json<{ settings: { agentMode: string; github: boolean; }; }>().settings).toMatchObject({
    agentMode: "apply",
    github: false
  });
  expect(updateResponse.statusCode).toBe(200);
  expect(updateResponse.json<{ settings: { github: boolean; }; }>().settings).toMatchObject({
    github: true
  });
  expect(exportResponse.statusCode).toBe(200);
  expect(exportResponse.headers["content-disposition"]).toContain("route-export-map-story-map.md");
  expect(exportResponse.body).toContain("Download Story");
  expect(auditResponse.statusCode).toBe(200);
  expect(auditResponse.headers["content-type"]).toContain("application/json");
  expect(auditResponse.body).toContain("exports.auditCreated");

  await server.close();
}

async function testServesConnectorConnectionCRUDAndBlocksPlanningWhenTheGitHubSwitch() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-routes-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);

  const project = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createProject({ name: "Route Connector Test" }));
  const storyMap = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const activity = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, level: "activity", cardType: "feature", title: "Activity" }));
  const step = unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", cardType: "task", title: "Step" }));
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", cardType: "story", title: "Story" }));
  const server = Fastify();
  const createResponse = await exerciseTestServesConnectorConnectionCRUDAndBlocksPlanningWhenTheGitHubSwitch2(server, repository, unitOfWork, databasePath, project);
  const connectionId = createResponse.json<{ connection: { id: string } }>().connection.id;
  const { blockedPlanResponse, readOnlyPlanResponse } = await exerciseTestServesConnectorConnectionCRUDAndBlocksPlanningWhenTheGitHubSwitch3(server, storyMap, connectionId, unitOfWork, project);
  const listResponse = await server.inject({
    method: "GET",
    url: `/api/connectors/connections?projectId=${project.id}`
  });
  const updateResponse = await server.inject({
    method: "PATCH",
    url: `/api/connectors/connections/${connectionId}`,
    payload: {
      readOnly: false,
      issueTypeMapping: [{ cardType: "task", issueType: "Task" }, { cardType: "feature", issueType: "Task" }, { cardType: "story", issueType: "Task" }]
    }
  });
  const provider = reviewedPushPlanningFixture({ writable: true, issueTypes: ["Task"], labels: ["local-story-map", "status:todo", `story-map:${storyMap.cardKeyPrefix}`, "level:activity", "level:step", "level:story"], milestones: [] });
  vi.mocked(createWorkItemProvider).mockReturnValueOnce(provider);
  const planResponse = await server.inject({
    method: "POST",
    url: "/api/sync/work-items/plan",
    payload: {
      storyMapId: storyMap.id,
      connectionId,
      mode: "push"
    }
  });

  await exerciseTestServesConnectorConnectionCRUDAndBlocksPlanningWhenTheGitHubSwitch(createResponse, blockedPlanResponse, readOnlyPlanResponse, listResponse, updateResponse, planResponse, repository, provider, server);
}

async function exerciseTestServesConnectorConnectionCRUDAndBlocksPlanningWhenTheGitHubSwitch3(server: FastifyInstance, storyMap: StoryMap, connectionId: string, unitOfWork: UnitOfWork, project: Project) {
  const blockedPlanResponse = await server.inject({
    method: "POST",
    url: "/api/sync/work-items/plan",
    payload: {
      storyMapId: storyMap.id,
      connectionId,
      mode: "push"
    }
  });
  unitOfWork.run({ actorType: "human", actorId: "fixture" }, ({ repository }) => repository.updateSafetySettings(project.id, { github: true }));
  const readOnlyPlanResponse = await server.inject({
    method: "POST",
    url: "/api/sync/work-items/plan",
    payload: {
      storyMapId: storyMap.id,
      connectionId,
      mode: "push"
    }
  });
  expect(resolveProviderAuth).not.toHaveBeenCalled();
  expect(createWorkItemProvider).not.toHaveBeenCalled();
  return { blockedPlanResponse, readOnlyPlanResponse };
}

async function exerciseTestServesConnectorConnectionCRUDAndBlocksPlanningWhenTheGitHubSwitch2(server: FastifyInstance, repository: StoryMapperRepository<"root">, unitOfWork: UnitOfWork, databasePath: string, project: Project) {
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });

  const createResponse = await server.inject({
    method: "POST",
    url: "/api/connectors/connections",
    payload: {
      projectId: project.id,
      provider: "github",
      authMode: "token",
      name: "Repo",
      owner: "owner",
      repository: "repo"
    }
  });
  return createResponse;
}

async function exerciseTestServesConnectorConnectionCRUDAndBlocksPlanningWhenTheGitHubSwitch(createResponse: LightMyRequestResponse, blockedPlanResponse: LightMyRequestResponse, readOnlyPlanResponse: LightMyRequestResponse, listResponse: LightMyRequestResponse, updateResponse: LightMyRequestResponse, planResponse: LightMyRequestResponse, repository: StoryMapperRepository<"root">, provider: WorkItemProvider, server: FastifyInstance) {
  expect(createResponse.statusCode).toBe(201);
  expect(createResponse.json<{ connection: { readOnly: boolean; }; }>().connection).toMatchObject({ readOnly: true });
  expect(blockedPlanResponse.statusCode).toBe(403);
  expect(readOnlyPlanResponse.statusCode).toBe(403);
  expect(listResponse.json<{ connections: Array<{ readOnly: boolean; }>; }>().connections[0]).toMatchObject({ readOnly: true });
  expect(updateResponse.json<{ connection: { readOnly: boolean; }; }>().connection).toMatchObject({ readOnly: false });
  expect(planResponse.statusCode).toBe(200);
  expect(planResponse.json<{ plan: { items: unknown[]; }; }>().plan.items).toHaveLength(3);
  expect(planResponse.json().plan.blockers).toEqual([]);
  expect(repository.getRemotePushPlan(planResponse.json().plan.id)?.plan).toEqual(planResponse.json().plan);
  expect(provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(provider.writeMilestone).not.toHaveBeenCalled();

  await server.close();
}
