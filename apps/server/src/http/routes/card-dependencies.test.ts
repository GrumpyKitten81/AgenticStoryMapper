import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterEach, expect, it } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { installRequestSecurity } from "@storymapper/server/http/request-security";
import { cardDependencyRequest } from "@storymapper/web/app/card-dependency-api";

const human = { actorType: "human", actorId: "dependency-fixture" } as const;
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture(secureHttp = false) {
  const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
  cleanup.push(() => { handle.current.$client.close(); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const roots = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Dependencies" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const a = repository.createCard({ storyMapId: map.id, level: "activity", title: "A" });
    const b = repository.createCard({ storyMapId: map.id, level: "activity", title: "B" });
    const foreign = repository.createStoryMap({ projectId: project.id, name: "Foreign map" });
    const foreignCard = repository.createCard({ storyMapId: foreign.id, level: "activity", title: "Foreign" });
    return { project, map, a, b, foreignCard };
  });
  const server = Fastify();
  if (secureHttp) installRequestSecurity(server, 0, false);
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: ":memory:" });
  cleanup.push(() => server.close());
  return { server, repository, unitOfWork, ...roots };
}
it("requires current dependent baseline even for no-ops and preserves typed endpoint evidence", async () => {
  const f = await fixture();
  const set = (cardId: string, prerequisiteCardId: string, baseVersion: number) => f.server.inject({ method: "POST", url: `/api/cards/${cardId}/dependencies`, payload: { prerequisiteCardId, baseVersion } });
  const response = await set(f.a.id, f.b.id, f.a.version);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ card: { id: f.a.id, version: f.a.version + 1 }, dependencies: [{ cardId: f.a.id, prerequisiteCardId: f.b.id }] });
  expect((await set(f.a.id, f.b.id, f.a.version)).statusCode).toBe(409);
  expect((await set(f.a.id, f.b.id, f.a.version + 1)).json().card.version).toBe(f.a.version + 1);
  const before = f.repository.getOperationSnapshot(f.project.id);
  for (const target of [f.a.id, f.foreignCard.id, randomUUID()]) {
    const refused = await set(f.a.id, target, f.a.version + 1);
    expect(refused.statusCode).toBe(target === f.a.id || target === f.foreignCard.id ? 400 : 404);
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  }
  const cycle = await set(f.b.id, f.a.id, f.b.version);
  expect(cycle.statusCode).toBe(400);
  expect(cycle.json().message).toContain(`${f.b.key} -> ${f.a.key} -> ${f.b.key}`);
  const remove = await f.server.inject({ method: "DELETE", url: `/api/cards/${f.a.id}/dependencies/${f.b.id}?baseVersion=${f.a.version + 1}` });
  expect(remove.statusCode).toBe(200);
  expect(remove.json()).toMatchObject({ card: { version: f.a.version + 2 }, dependencies: [] });
});
it("proposes external dependency writes and projects immutable preview adjacency", async () => {
  const f = await fixture();
  const result = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "SetCardDependency", input: { cardId: f.a.id, prerequisiteCardId: f.b.id, baseVersion: f.a.version, apply: false } } });
  expect(result.statusCode).toBe(200);
  expect(result.json().outcome).toBe("proposed");
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toEqual([]);
  const id = result.json().changeSetId;
  const preview = await f.server.inject({ method: "GET", url: `/api/changesets/${id}/preview` });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().boards[0].snapshot.cardDependencies).toMatchObject([{ cardId: f.a.id, prerequisiteCardId: f.b.id }]);
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toEqual([]);
});

it("refuses an approved dependency when another owner creates a cycle before Apply", async () => {
  const f = await fixture();
  const c = f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "C" }));
  const set = (cardId: string, prerequisiteCardId: string, baseVersion: number) => f.server.inject({ method: "POST", url: `/api/cards/${cardId}/dependencies`, payload: { prerequisiteCardId, baseVersion } });
  expect((await set(f.a.id, f.b.id, f.a.version)).statusCode).toBe(200);
  const proposed = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "SetCardDependency", input: { cardId: c.id, prerequisiteCardId: f.a.id, baseVersion: c.version, apply: false } } });
  expect(proposed.statusCode).toBe(200);
  const changeSetId: string = proposed.json().changeSetId;
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${changeSetId}/approve`, payload: {} })).statusCode).toBe(200);
  expect(f.repository.getChangeSet(changeSetId)).toMatchObject({ status: "approved" });
  expect((await set(f.b.id, c.id, f.b.version)).statusCode).toBe(200);
  const before = f.repository.getOperationSnapshot(f.project.id);
  const histories = before.cards.map((card) => f.repository.listCardHistory(card.id));
  const approval = f.repository.getChangeSet(changeSetId);
  const applied = await f.server.inject({ method: "POST", url: `/api/changesets/${changeSetId}/apply`, payload: {} });
  expect(applied.statusCode).toBe(400);
  expect(applied.json().message).toContain(`${c.key} -> ${f.a.key} -> ${f.b.key} -> ${c.key}`);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(before.cards.map((card) => f.repository.listCardHistory(card.id))).toEqual(histories);
  expect(f.repository.getChangeSet(changeSetId)).toEqual(approval);
});

it("serializes dependency add/remove through the production client, security hook and real HTTP parser", async () => {
  const f = await fixture(true);
  const requests: Array<{ method: string; contentType: string | undefined; clientId: string | undefined }> = [];
  f.server.addHook("onRequest", async (request) => {
    requests.push({ method: request.method, contentType: request.headers["content-type"], clientId: request.headers["x-storymapper-client-id"] as string | undefined });
  });
  let deleteBody: unknown;
  f.server.addHook("preHandler", async (request) => {
    if (request.method === "DELETE") deleteBody = request.body;
  });
  const origin = await f.server.listen({ host: "127.0.0.1", port: 0 });
  const endpoint = `${origin}/api/cards/${f.a.id}/dependencies`;
  const set = await cardDependencyRequest(endpoint, "POST", { prerequisiteCardId: f.b.id, baseVersion: f.a.version });
  expect(set.card.version).toBe(f.a.version + 1);
  const removed = await cardDependencyRequest(`${endpoint}/${f.b.id}?baseVersion=${set.card.version}`, "DELETE");
  expect(removed).toMatchObject({ card: { version: f.a.version + 2 }, dependencies: [] });
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toEqual([]);
  expect(f.repository.listCardHistory(f.a.id)).toHaveLength(3);
  expect(requests.map(({ method, contentType }) => ({ method, contentType }))).toEqual([
    { method: "POST", contentType: "application/json" }, { method: "DELETE", contentType: "application/json" }
  ]);
  expect(requests[1]!.clientId).toBe(requests[0]!.clientId);
  expect(requests[0]!.clientId).toMatch(/^[0-9a-f-]{36}$/);
  expect(deleteBody).toEqual({});
});
