import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { CustomizationResponse, WorkflowStatus } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

const human = { actorType: "human", actorId: "customization-reviewer" } as const;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-customization-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Customization" });
    const other = repository.createProject({ name: "Other" });
    const maps = ["First", "Second"].map((name) => repository.createStoryMap({ projectId: project.id, name }));
    const foreignMap = repository.createStoryMap({ projectId: other.id, name: "Foreign" });
    const status = repository.createWorkflowStatus({ projectId: project.id, name: "Reviewed", group: "todo" });
    const replacement = repository.createWorkflowStatus({ projectId: project.id, name: "Accepted", group: "done" });
    const cards = maps.map((map) => repository.createCard({ storyMapId: map.id, level: "story", title: map.name, status: status.name }));
    const foreign = repository.createCard({ storyMapId: foreignMap.id, level: "story", title: "Foreign", status: status.name });
    const persona = repository.createPersona({ projectId: project.id, name: "Reader" });
    const annotation = repository.createAnnotation({ projectId: project.id, name: "Question" });
    repository.setCardPersona(cards[0]!.id, persona.id);
    repository.setCardAnnotation(cards[0]!.id, annotation.id);
    return { project, maps, foreignMap, status, replacement, cards, foreign, persona, annotation };
  });
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "customization-agent", mcpSessionId: "customization-session" });
  cleanup.push(async () => { await server.close(); handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const read = async () => (await server.inject({ url: `/api/customization?projectId=${rows.project.id}` })).json<CustomizationResponse>();
  return { ...rows, databasePath, server, repository, unitOfWork, registry, read };
}

function statusEvidence(read: CustomizationResponse, status: WorkflowStatus) {
  return { definitionBefore: status, affectedCards: read.usageCards.filter((card) => card.status === status.name).map(({ id, version }) => ({ id, baseVersion: version })) };
}

describe("reviewed customization commands", () => {
  it("refuses workflow review evidence that includes GitHub-owned Cards while allowing metadata", testRefusesFreshlyReviewedWorkflowRenameAndReplacementWithAnOpenStatus);

  it("reads Project-wide usage and atomically renames and replaces only owned Cards", testReadsProjectWideUsageAndAtomicallyRenamesAndReplacesOnlyOwned);

  it("retries a retained original status name only after refreshing a concurrent rename and its Card evidence", testRetriesARetainedOriginalStatusNameOnlyAfterRefreshingAConcurrent);

  it("refuses foreign scope and stale or unconfirmed unlink without removing roots or links", testRefusesForeignScopeAndStaleOrUnconfirmedUnlinkWithoutRemovingRoots);

  it("keeps Agent rename proposed until human approval and separate Apply, then rejects drift", async () => {
    const f = await fixture();
    const read = await f.read();
    await expect(f.registry.call("UpdateWorkflowStatus", { statusId: f.status.id, patch: { name: "Rejected inline", ...statusEvidence(read, f.status) }, apply: true })).rejects.toMatchObject({ code: "validation" });
    const proposal = await f.registry.call("UpdateWorkflowStatus", { statusId: f.status.id, patch: { name: "Agent reviewed", ...statusEvidence(read, f.status) } }) as { changeSet: { id: string } };
    expect(f.repository.getWorkflowStatus(f.status.id)?.name).toBe(f.status.name);
    const approved = await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.changeSet.id}/approve`, payload: {} });
    expect(approved.statusCode, approved.body).toBe(200);
    f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.maps[0]!.id, level: "story", title: "New usage", status: f.status.name }));
    const applied = await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.changeSet.id}/apply`, payload: {} });
    expect(applied.statusCode, applied.body).toBe(409);
    expect(f.repository.getWorkflowStatus(f.status.id)?.name).toBe(f.status.name);
    for (const card of f.cards) expect(f.repository.getCard(card.id)?.status).toBe(f.status.name);
    const fresh = await f.registry.call("UpdateWorkflowStatus", { statusId: f.status.id, patch: { name: "Agent reviewed", ...statusEvidence(await f.read(), f.status) } }) as { changeSet: { id: string } };
    expect((await f.server.inject({ method: "POST", url: `/api/changesets/${fresh.changeSet.id}/approve`, payload: {} })).statusCode).toBe(200);
    const success = await f.server.inject({ method: "POST", url: `/api/changesets/${fresh.changeSet.id}/apply`, payload: {} });
    expect(success.statusCode, success.body).toBe(200);
    expect(f.repository.getWorkflowStatus(f.status.id)?.name).toBe("Agent reviewed");
    for (const card of f.cards) expect(f.repository.getCard(card.id)?.status).toBe("Agent reviewed");
  });

  it("refuses Persona lists for foreign scope and persists zero or template estimates on Card creation", async () => {
    const f = await fixture();
    expect((await f.server.inject({ url: `/api/personas?projectId=${f.project.id}&storyMapId=${f.foreignMap.id}` })).statusCode).toBe(400);
    expect((await f.server.inject({ url: `/api/personas?projectId=00000000-0000-4000-8000-000000000000` })).statusCode).toBe(404);
    for (const estimate of [0, 5]) {
      const response = await f.server.inject({ method: "POST", url: "/api/cards", payload: { storyMapId: f.maps[0]!.id, level: "story", title: `Estimate ${estimate}`, estimate } });
      expect(response.statusCode, response.body).toBe(201);
      expect(f.repository.getCard(response.json<{ id: string }>().id)?.estimate).toBe(estimate);
    }
  });
});

async function testRefusesFreshlyReviewedWorkflowRenameAndReplacementWithAnOpenStatus() {
  const f = await fixture();
  const conflict = f.unitOfWork.run(human, ({ repository }) => {
    const connection = repository.createConnectorConnection({ projectId: f.project.id, name: "GitHub", provider: "github", authMode: "github-cli", owner: "org", repository: "repo", statusMapping: [{ localStatus: f.status.name, remoteState: "open", labels: ["reviewed"] }] });
    const link = repository.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", cardId: f.cards[0]!.id, remoteId: "1", url: "https://github.com/org/repo/issues/1", labels: ["reviewed"], syncState: "conflict" });
    const run = repository.createSyncRun({ storyMapId: f.maps[0]!.id, connectionId: connection.id, mode: "sync", status: "applied" });
    return repository.createSyncConflict({ externalRefId: link.externalRefId, syncRunId: run.id, connectionId: connection.id, cardId: f.cards[0]!.id, remoteId: "1", field: "status", localValue: { state: "open", labels: ["reviewed"] }, remoteValue: { state: "closed", labels: [] } });
  });
  const before = f.repository.getOperationSnapshot(f.project.id);
  const histories = f.cards.map((card) => f.repository.listCardHistory(card.id));
  const activity = f.repository.listActivity(f.project.id);
  const evidence = statusEvidence(await f.read(), f.repository.getWorkflowStatus(f.status.id)!);
  for (const request of [{ method: "PATCH" as const, payload: { name: "Renamed", ...evidence } }, { method: "DELETE" as const, payload: { ...evidence, replacementBefore: f.repository.getWorkflowStatus(f.replacement.id)! } }]) {
    const response = await f.server.inject({ ...request, url: `/api/workflow-statuses/${f.status.id}` });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json()).toMatchObject({ code: "conflict", message: "Customization Card usage or versions changed; review its current usage again." });
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
    expect(f.cards.map((card) => f.repository.listCardHistory(card.id))).toEqual(histories);
    expect(f.repository.listActivity(f.project.id)).toEqual(activity);
  }
  const owned = f.repository.getCard(f.cards[0]!.id)!;
  expect(() => f.unitOfWork.run(human, ({ repository }) => repository.updateCard(owned.id, { status: f.replacement.name }))).toThrow("GitHub owns this Card status");
  const metadata = await f.server.inject({ method: "PATCH", url: `/api/workflow-statuses/${f.status.id}`, payload: { color: "#123456", ...evidence, affectedCards: evidence.affectedCards.filter((card) => card.id !== owned.id) } });
  expect(metadata.statusCode, metadata.body).toBe(200);
  expect(f.repository.getWorkflowStatus(f.status.id)).toMatchObject({ name: f.status.name, color: "#123456" });
  expect(f.cards.map((card) => f.repository.getCard(card.id))).toEqual(before.cards.filter((card) => f.cards.some((row) => row.id === card.id)));
  expect(f.cards.map((card) => f.repository.listCardHistory(card.id))).toEqual(histories);
  expect(f.repository.getSyncConflict(conflict.id)?.status).toBe("open");
}

async function testReadsProjectWideUsageAndAtomicallyRenamesAndReplacesOnlyOwned() {
  const f = await fixture();
  const read = await f.read();
  expect(read.usageCards.map(({ id }) => id)).toEqual(expect.arrayContaining(f.cards.map(({ id }) => id)));
  expect(read.usageCards.some(({ id }) => id === f.foreign.id)).toBe(false);
  expect(read.cardPersonas).toEqual(expect.arrayContaining([expect.objectContaining({ personaId: f.persona.id })]));
  const renamed = await f.server.inject({ method: "PATCH", url: `/api/workflow-statuses/${f.status.id}`, payload: { name: "Renamed", ...statusEvidence(read, f.status) } });
  expect(renamed.statusCode, renamed.body).toBe(200);
  for (const card of f.cards) expect(f.repository.getCard(card.id)).toMatchObject({ status: "Renamed", version: read.usageCards.find(({ id }) => id === card.id)!.version + 1 });
  expect(f.repository.getCard(f.foreign.id)?.status).toBe(f.status.name);
  const current = renamed.json<WorkflowStatus>();
  const deleted = await f.server.inject({ method: "DELETE", url: `/api/workflow-statuses/${f.status.id}`, payload: { ...statusEvidence(await f.read(), current), replacementBefore: f.replacement } });
  expect(deleted.statusCode, deleted.body).toBe(200);
  for (const card of f.cards) expect(f.repository.getCard(card.id)?.status).toBe(f.replacement.name);
  expect(f.repository.getWorkflowStatus(f.status.id)).toBeUndefined();
  const reopened = openStoryMapperDb(f.databasePath);
  try {
    const persisted = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(persisted.getWorkflowStatus(f.status.id)).toBeUndefined();
    for (const card of f.cards) expect(persisted.getCard(card.id)?.status).toBe(f.replacement.name);
  } finally { reopened.$client.close(); }
}

async function testRetriesARetainedOriginalStatusNameOnlyAfterRefreshingAConcurrent() {
  const f = await fixture();
  const opening = await f.read();
  const renamed = await f.server.inject({ method: "PATCH", url: `/api/workflow-statuses/${f.status.id}`, payload: { name: "Concurrent name", ...statusEvidence(opening, f.status) } });
  expect(renamed.statusCode, renamed.body).toBe(200);
  const beforeRetry = f.repository.getOperationSnapshot(f.project.id);
  for (const evidence of [{}, statusEvidence(opening, f.status)]) {
    const refused = await f.server.inject({ method: "PATCH", url: `/api/workflow-statuses/${f.status.id}`, payload: { name: f.status.name, color: "#123456", ...evidence } });
    expect(refused.statusCode, refused.body).toBe(409);
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(beforeRetry);
  }
  const refreshed = await f.read();
  const current = refreshed.workflowStatuses.find((status) => status.id === f.status.id)!;
  expect(current.name).toBe("Concurrent name");
  const retry = await f.server.inject({ method: "PATCH", url: `/api/workflow-statuses/${f.status.id}`, payload: { name: f.status.name, color: "#123456", ...statusEvidence(refreshed, current) } });
  expect(retry.statusCode, retry.body).toBe(200);
  expect(f.repository.getWorkflowStatus(f.status.id)).toMatchObject({ name: f.status.name, color: "#123456" });
  for (const card of f.cards) expect(f.repository.getCard(card.id)).toMatchObject({ status: f.status.name, version: card.version + 2 });
  expect(f.repository.getCard(f.foreign.id)).toEqual(f.foreign);
  const reopened = openStoryMapperDb(f.databasePath);
  try {
    const persisted = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(persisted.getWorkflowStatus(f.status.id)).toMatchObject({ name: f.status.name, color: "#123456" });
    for (const card of f.cards) expect(persisted.getCard(card.id)).toMatchObject({ status: f.status.name, version: card.version + 2 });
  } finally { reopened.$client.close(); }
}

async function testRefusesForeignScopeAndStaleOrUnconfirmedUnlinkWithoutRemovingRoots() {
  const f = await fixture();
  expect((await f.server.inject({ url: `/api/customization?projectId=${f.project.id}&storyMapId=${f.foreignMap.id}` })).statusCode).toBe(400);
  const read = await f.read();
  const affectedCards = read.usageCards.filter(({ id }) => read.cardPersonas.some((link) => link.cardId === id && link.personaId === f.persona.id)).map(({ id, version }) => ({ id, baseVersion: version }));
  const evidence = { baseVersion: f.persona.version, definitionBefore: f.persona, affectedCards };
  const refused = await f.server.inject({ method: "DELETE", url: `/api/personas/${f.persona.id}?baseVersion=${f.persona.version}`, payload: evidence });
  expect(refused.statusCode, refused.body).toBe(409);
  f.unitOfWork.run(human, ({ repository }) => repository.updateCard(f.cards[0]!.id, { title: "Changed after review" }));
  const stale = await f.server.inject({ method: "DELETE", url: `/api/personas/${f.persona.id}?baseVersion=${f.persona.version}`, payload: { ...evidence, confirmUnlink: true } });
  expect(stale.statusCode, stale.body).toBe(409);
  expect(f.repository.getPersona(f.persona.id)).toBeDefined();
  expect((await f.read()).cardPersonas).toHaveLength(1);
  const current = await f.read();
  const removed = await f.server.inject({ method: "DELETE", url: `/api/annotations/${f.annotation.id}`, payload: { definitionBefore: f.annotation, confirmUnlink: true, affectedCards: current.usageCards.filter(({ id }) => current.cardAnnotations.some((link) => link.cardId === id && link.annotationId === f.annotation.id)).map(({ id, version }) => ({ id, baseVersion: version })) } });
  expect(removed.statusCode, removed.body).toBe(200);
  expect((await f.read()).cardAnnotations).toEqual([]);
}
