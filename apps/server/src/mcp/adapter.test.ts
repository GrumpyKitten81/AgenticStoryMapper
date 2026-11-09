import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import { afterEach, expect, it } from "vitest";
import type { McpToolName } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

const cleanup: Array<() => Promise<void>> = [];
const actor = { actorType: "system", actorId: "fixture" } as const;

afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-adapter-"));
  cleanup.push(async () => { rmSync(directory, { recursive: true, force: true }); });
  const databasePath = join(directory, "storymapper.sqlite");
  const db = openStoryMapperDb(databasePath);
  cleanup.push(async () => { db.$client.close(); });
  const handle = new DatabaseHandle(db);
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const project = unitOfWork.run(actor, ({ repository }) => repository.createProject({ name: "Migration" }));
  const storyMap = unitOfWork.run(actor, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  const roots = unitOfWork.run(actor, ({ repository }) => ({
    card: repository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity", description: "Retained description", status: "active" }),
    release: repository.createRelease({ storyMapId: storyMap.id, name: "Release", goal: "Retained goal" }),
    persona: repository.createPersona({ projectId: project.id, name: "Persona", role: "Role", description: "Retained persona", goals: ["Goal"], pains: ["Pain"] }),
    annotation: repository.createAnnotation({ projectId: project.id, name: "Annotation", icon: "star", color: "#123456" }),
    template: repository.createStoryTemplate({ projectId: project.id, name: "Template", descriptionTemplate: "Retained template", defaultStatus: "active" }),
    context: repository.upsertProductContext({ projectId: project.id, storyMapId: storyMap.id, purpose: "Retained purpose", keyFeatures: ["Feature"], notes: "Retained notes" })
  }));
  unitOfWork.run(actor, ({ repository }) => repository.updateRelease(roots.release.id, { released: true }));
  roots.release = repository.listReleases(storyMap.id).find((release) => release.id === roots.release.id)!;
  const server = createMcpFastifyApp();
  cleanup.push(async () => { await server.close(); });
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  const request = async (url: string, payload: unknown, method = "POST") => {
    const response = await fetch(`${address}${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5_000) });
    return { status: response.status, body: await response.json() };
  };
  const call = async (name: McpToolName, input: unknown) => {
    const result = await request("/api/mcp/call", { name, input });
    if (result.body.outcome === "proposed" && name === "UpdateStoryMapPersona") {
      expect((await request(`/api/changesets/${result.body.changeSetId}/approve`, {})).status).toBe(200);
      const applied = await request(`/api/changesets/${result.body.changeSetId}/apply`, {});
      expect(applied.status).toBe(200);
      return { status: applied.status, body: { ...result.body, ...applied.body, outcome: "applied" } };
    }
    return result;
  };
  const enableWrites = () => unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(project.id, { agentMode: "apply" }));
  return { repository, unitOfWork, project, storyMap, ...roots, request, call, enableWrites };
}

it("retains nondefault safety settings and connector mappings after sparse public updates", async () => {
  const f = await fixture();
  const before = f.unitOfWork.run(actor, ({ repository }) => ({
    settings: repository.updateSafetySettings(f.project.id, { github: true, agentMode: "apply" }),
    connection: repository.createConnectorConnection({ projectId: f.project.id, provider: "github", name: "Mapped", authMode: "token", owner: "owner", repository: "repo", defaultLabel: "custom-label", readOnly: false, statusMapping: [{ localStatus: "active", remoteState: "open", labels: ["in-progress"] }], typeMapping: [{ match: "custom-story", level: "story" }], releaseSource: "iteration", iterationFieldName: "Custom iteration", labelsAsAnnotations: true })
  }));
  const settings = await f.request(`/api/settings/safety?projectId=${f.project.id}`, { agentMode: "apply" }, "PATCH");
  expect(settings.status).toBe(200);
  expect(settings.body.settings).toMatchObject({ ...before.settings, updatedAt: expect.any(String) });
  expect(f.repository.getSafetySettings(f.project.id)).toEqual(settings.body.settings);
  const connection = await f.request(`/api/connectors/connections/${before.connection.id}`, { name: "Renamed connection" }, "PATCH");
  expect(connection.status).toBe(200);
  expect(connection.body.connection).toMatchObject({ ...before.connection, name: "Renamed connection", updatedAt: expect.any(String) });
  expect(f.repository.listConnectorConnections(f.project.id).find((row) => row.id === before.connection.id)).toMatchObject(connection.body.connection);
});

it("runs MCP read, protected proposal, validation and attributed application routes on the SDK2 adapter", async () => {
  const f = await fixture();
  expect((await f.call("GetStoryMapCards", { storyMapId: f.storyMap.id })).body.data.cards).toMatchObject([f.card]);
  const input = { cardId: f.card.id, baseVersion: f.card.version, patch: { title: "Agent title" } };
  f.unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  const proposed = await f.call("UpdateStoryMapCard", input);
  expect(proposed).toMatchObject({ status: 200, body: { outcome: "proposed", changeSet: { status: "proposed" }, changeSetId: expect.any(String) } });
  expect(f.repository.getChangeSet(proposed.body.changeSetId)).toMatchObject({ status: "proposed", proposedBy: { actorType: "agent", actorId: "local-mcp-host" } });
  expect(f.repository.getCardDetails(f.card.id)?.title).toBe(f.card.title);
  f.enableWrites();
  expect((await f.call("UpdateStoryMapCard", { cardId: f.card.id, baseVersion: f.card.version, patch: { title: "" } })).status).toBe(400);
  expect((await f.call("UpdateStoryMapCard", input)).status).toBe(200);
  expect(f.repository.getCardDetails(f.card.id)).toMatchObject({ title: "Agent title", description: f.card.description, status: f.card.status });
  expect(f.repository.listActivity(f.project.id)).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "tool_call", actor: "local-mcp-host", actorType: "agent", after: expect.objectContaining({ toolName: "UpdateStoryMapCard", outcome: "ok" }) }),
    expect.objectContaining({ action: "tool_call", actor: "local-mcp-host", actorType: "agent", after: expect.objectContaining({ toolName: "UpdateStoryMapCard", outcome: "ok" }) })
  ]));
  const registry = createMcpRegistry(f.repository, f.unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "migration-host", mcpSessionId: "migration-session" });
  await registry.call("UpdateStoryMapCard", { cardId: f.card.id, baseVersion: f.repository.getCard(f.card.id)!.version, patch: { title: "Session title" } });
  expect(f.repository.listCardHistory(f.card.id).at(-1)).toMatchObject({ actor: "migration-host", actorType: "agent", mcpSessionId: "migration-session" });
});

it("preserves persisted unrelated Card, Release and Persona fields through empty and sparse MCP patches", async () => {
  const f = await fixture();
  f.enableWrites();
  const cases = [
    { name: "UpdateStoryMapCard", input: { cardId: f.card.id }, before: f.card, read: () => f.repository.getCardDetails(f.card.id), version: () => f.repository.getCard(f.card.id)!.version, patch: { title: "Renamed" } },
    { name: "UpdateStoryMapRelease", input: { storyMapId: f.storyMap.id, releaseId: f.release.id }, before: f.release, read: () => f.repository.listReleases(f.storyMap.id).find((release) => release.id === f.release.id), version: () => f.repository.getRelease(f.release.id)!.version, patch: { name: "Renamed" } },
    { name: "UpdateStoryMapPersona", input: { projectId: f.project.id, personaId: f.persona.id }, before: f.persona, read: () => f.repository.listPersonasForProject(f.project.id).find((persona) => persona.id === f.persona.id), version: () => f.repository.getPersona(f.persona.id)!.version, patch: { name: "Renamed" } }
  ] as const;
  for (const row of cases) {
    for (const patch of [{}, row.patch]) {
      const persistedBefore = row.read();
      const response = await f.call(row.name, { ...row.input, baseVersion: row.version(), patch });
      if (Object.keys(patch).length === 0) {
        expect(response).toMatchObject({ status: 400, body: { message: "At least one patch field is required." } });
        expect(row.read()).toEqual(persistedBefore);
      } else expect(response.status, JSON.stringify({ name: row.name, body: response.body })).toBe(200);
      const { version, ...fields } = row.before;
      expect(row.read()).toMatchObject({ ...fields, ...patch, ...(row.name === "UpdateStoryMapCard" ? { updatedAt: expect.any(String) } : {}) });
    }
  }
  expect((await f.call("UpdateStoryMapCard", { cardId: f.card.id, baseVersion: f.repository.getCard(f.card.id)!.version, patch: { description: "", status: "done", releaseId: null } })).status).toBe(200);
  expect(f.repository.getCardDetails(f.card.id)).toMatchObject({ description: "", status: "done", releaseId: null });
  expect((await f.call("UpdateStoryMapRelease", { storyMapId: f.storyMap.id, releaseId: f.release.id, baseVersion: f.repository.getRelease(f.release.id)!.version, patch: { goal: "", released: false, startDate: null } })).status).toBe(200);
  expect(f.repository.listReleases(f.storyMap.id).find((release) => release.id === f.release.id)).toMatchObject({ goal: "", released: false, startDate: null });
  expect((await f.call("UpdateStoryMapPersona", { projectId: f.project.id, personaId: f.persona.id, baseVersion: f.repository.getPersona(f.persona.id)!.version, patch: { goals: [], pains: ["New pain"] } })).status).toBe(200);
  expect(f.repository.listPersonasForProject(f.project.id).find((persona) => persona.id === f.persona.id)).toMatchObject({ goals: [], pains: ["New pain"], description: f.persona.description });
});

it("keeps HTTP root and customization patches sparse and honors explicit supplied values", async () => {
  const f = await fixture();
  const cases = [
    { path: `/api/cards/${f.card.id}`, before: f.card, read: () => f.repository.getCardDetails(f.card.id), version: () => f.repository.getCard(f.card.id)!.version, patch: { title: "Renamed" } },
    { path: `/api/releases/${f.release.id}`, before: f.release, read: () => f.repository.listReleases(f.storyMap.id).find((release) => release.id === f.release.id), version: () => f.repository.getRelease(f.release.id)!.version, patch: { name: "Renamed" } },
    { path: `/api/personas/${f.persona.id}`, before: f.persona, read: () => f.repository.getPersona(f.persona.id), version: () => f.repository.getPersona(f.persona.id)!.version, patch: { name: "Renamed" } },
    { path: `/api/annotations/${f.annotation.id}`, before: f.annotation, read: () => f.repository.getAnnotation(f.annotation.id), patch: { name: "Renamed" } },
    { path: `/api/story-templates/${f.template.id}`, before: f.template, read: () => f.repository.getStoryTemplate(f.template.id), patch: { name: "Renamed" } }
  ];
  for (const row of cases) {
    for (const patch of [{}, row.patch]) {
      const response = await f.request(row.path, "version" in row ? { ...patch, baseVersion: row.version() } : patch, "PATCH");
      if (Object.keys(patch).length === 0) {
        expect(response).toMatchObject({ status: 400, body: { code: "validation", message: "At least one patch field is required." } });
        expect(row.read()).toMatchObject(row.before);
      } else {
        expect(response.status, JSON.stringify({ path: row.path, body: response.body })).toBe(200);
        expect(response.body).toMatchObject({ ...row.before, ...patch, ...("version" in row.before ? { version: expect.any(Number) } : {}), ...(row.path.includes("/cards/") ? { updatedAt: expect.any(String) } : {}) });
        expect(row.read()).toMatchObject(response.body);
      }
    }
  }
  const contextInput = { projectId: f.project.id, storyMapId: f.storyMap.id };
  for (const patch of [{}, { notes: "Changed notes" }]) {
    const response = await f.request("/api/product-context", { ...contextInput, ...patch }, "PATCH");
    expect(response.status).toBe(200);
    expect(response.body.context).toMatchObject({ ...f.context, ...patch, updatedAt: expect.any(String) });
    expect(f.repository.getProductContext(f.project.id, f.storyMap.id)).toEqual(response.body.context);
  }
  expect((await f.request(`/api/releases/${f.release.id}`, { released: false, goal: "", startDate: null, baseVersion: f.repository.getRelease(f.release.id)!.version }, "PATCH")).body).toMatchObject({ released: false, goal: "", startDate: null });
  expect((await f.request(`/api/personas/${f.persona.id}`, { goals: [], pains: [], baseVersion: f.repository.getPersona(f.persona.id)!.version }, "PATCH")).body).toMatchObject({ goals: [], pains: [], description: f.persona.description });
  expect((await f.request("/api/product-context", { ...contextInput, keyFeatures: [], purpose: "" }, "PATCH")).body.context).toMatchObject({ keyFeatures: [], purpose: "", notes: "Changed notes" });
  expect((await f.request("/api/cards/bulk", { storyMapId: f.storyMap.id, cards: [{ id: f.card.id, baseVersion: f.card.version }], patch: {} }, "PATCH")).status).toBeGreaterThanOrEqual(400);
});
