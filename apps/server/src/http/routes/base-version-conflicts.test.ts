import { splitTextIntoChunks } from "@storymapper/importers";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as snapshotActions from "@storymapper/db/repositories/operation-snapshot-repository";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";

const cleanup: Array<() => Promise<void>> = [];
const human = { actorType: "human", actorId: "local-user" } as const;
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-base-version-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Base versions" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const cards = [1, 2, 3].map((index) => repository.createCard({ storyMapId: map.id, level: "story", title: `Story ${index}` }));
    const release = repository.createRelease({ storyMapId: map.id, name: "Release" });
    const persona = repository.createPersona({ projectId: project.id, name: "Persona" });
    const roadmap = repository.createRoadmap({ projectId: project.id, name: "Roadmap" });
    repository.updateSafetySettings(project.id, { agentMode: "apply" });
    return { project, map, cards, release, persona, roadmap };
  });
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  cleanup.push(async () => { await server.close(); handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const mcp = (name: string, input: unknown) => server.inject({ method: "POST", url: "/api/mcp/call", payload: { name, input } });
  return { server, repository, unitOfWork, handle, mcp, ...rows };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

function addSyncConflict(f: Fixture, field: "title" | "description" | "status" | "labels" | "milestone") {
  return f.unitOfWork.run(human, ({ repository }) => {
    const card = f.cards[0]!;
    repository.updateCard(card.id, { releaseId: f.release.id });
    const connection = repository.createConnectorConnection({ projectId: f.project.id, name: "GitHub", provider: "github", authMode: "github-cli", owner: "org", repository: "repo", releaseSource: "milestone", labelsAsAnnotations: true });
    const link = repository.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", cardId: card.id, remoteId: "1", url: "https://github.com/org/repo/issues/1", labels: [], syncState: "conflict" });
    const run = repository.createSyncRun({ storyMapId: f.map.id, connectionId: connection.id, mode: "sync", status: "applied", summary: "Disagreement" });
    const conflict = repository.createSyncConflict({ externalRefId: link.externalRefId, syncRunId: run.id, connectionId: connection.id, cardId: card.id, remoteId: "1", field, localValue: "Local", remoteValue: "Remote" });
    return { conflict, connection };
  });
}

type Annotations = { assigned: { id: string }; fresh: { id: string } };
type CardRow = { id: string; version: number };
type SyncRoute = [field: "title" | "description" | "status" | "labels" | "milestone", name: string, request: (card: CardRow, f: Fixture, annotation: Annotations) => { method: "POST" | "PATCH" | "DELETE"; url: string; payload: object }];

describe("human sync conflict admission", () => {
  it("refuses managed Annotation POST and DELETE atomically while allowing unmanaged and idempotent assignments", testRefusesManagedAnnotationPOSTAndDELETEAtomicallyWhileAllowingUnmanagedAnd);

  it("refuses fresh Release PATCH and Delete with the actual dependent Card envelope and no persisted effects", testRefusesFreshReleasePATCHAndDeleteWithTheActualDependentCard);

  it.each<SyncRoute>([
    ["status", "bulk status", (card: CardRow, f: Fixture) => ({ method: "PATCH", url: "/api/cards/bulk", payload: { storyMapId: f.map.id, patch: { status: "archived" }, cards: [{ id: card.id, baseVersion: card.version }] } })],
    ["status", "card status", (card: CardRow) => ({ method: "PATCH", url: `/api/cards/${card.id}`, payload: { status: "archived", baseVersion: card.version } })],
    ["description", "card description", (card: CardRow) => ({ method: "PATCH", url: `/api/cards/${card.id}`, payload: { description: "Changed", baseVersion: card.version } })],
    ["milestone", "card release", (card: CardRow) => ({ method: "PATCH", url: `/api/cards/${card.id}`, payload: { releaseId: null, baseVersion: card.version } })],
    ["milestone", "move", (card: CardRow) => ({ method: "POST", url: `/api/cards/${card.id}/move`, payload: { parentId: null, position: 0, releaseId: null, baseVersion: card.version } })],
    ["milestone", "bulk release", (card: CardRow, f: Fixture) => ({ method: "PATCH", url: "/api/cards/bulk", payload: { storyMapId: f.map.id, patch: { releaseId: null }, cards: [{ id: card.id, baseVersion: card.version }] } })],
    ["labels", "bulk Annotation add", (card: CardRow, f: Fixture, annotation: Annotations) => ({ method: "PATCH", url: "/api/cards/bulk", payload: { storyMapId: f.map.id, patch: { addAnnotationId: annotation.fresh.id }, cards: [{ id: card.id, baseVersion: card.version }] } })],
    ["labels", "Annotation delete", (card: CardRow, _f: Fixture, annotation: Annotations) => ({ method: "DELETE", url: `/api/annotations/${annotation.assigned.id}`, payload: { definitionBefore: annotation.assigned, confirmUnlink: true, affectedCards: [{ id: card.id, baseVersion: card.version }] } })],
    ["title", "delete", (card: CardRow) => ({ method: "POST", url: `/api/cards/${card.id}/delete`, payload: { strategy: "unassign", baseVersion: card.version } })]
  ])("refuses %s conflict on %s through the actual human route and persists nothing", async (field, _name, request) => {
    const f = await fixture();
    const annotation = f.unitOfWork.run(human, ({ repository }) => {
      const assigned = repository.createAnnotation({ projectId: f.project.id, name: "managed" });
      repository.setCardAnnotation(f.cards[0]!.id, assigned.id);
      return { assigned, fresh: repository.createAnnotation({ projectId: f.project.id, name: "managed-fresh" }) };
    });
    const { conflict } = addSyncConflict(f, field);
    const card = f.repository.getCard(f.cards[0]!.id)!;
    const before = f.repository.getOperationSnapshot(f.project.id);
    const activity = f.repository.listActivity(f.project.id);
    const response = await f.server.inject(request(card, f, annotation));
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "sync", syncConflictId: conflict.id })]));
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
    expect(f.repository.listActivity(f.project.id)).toEqual(activity);
    expect(f.repository.getSyncConflict(conflict.id)?.status).toBe("open");
  });

  it("archives locally while retaining a disputed GitHub-owned status and its open conflict", async () => {
    const f = await fixture();
    const { conflict } = addSyncConflict(f, "status");
    const card = f.repository.getCard(f.cards[0]!.id)!;
    const links = f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id);
    const response = await f.server.inject({ method: "POST", url: `/api/cards/${card.id}/archive`, payload: { baseVersion: card.version } });
    expect(response.statusCode, response.body).toBe(200);
    expect(f.repository.getCard(card.id)).toMatchObject({ archived: true, status: card.status });
    expect(f.repository.getSyncConflict(conflict.id)?.status).toBe("open");
    expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toEqual(links);
  });

  it("guards human managed-definition creation and duplicate-name rename while allowing metadata", testGuardsHumanManagedDefinitionCreationAndDuplicateNameRenameWhileAllowing);

  it("does not materialize a project snapshot on ordinary HTTP edits or unrelated fields with open conflicts", testDoesNotMaterializeAProjectSnapshotOnOrdinaryHTTPEditsOr);
});

const versions = (f: Fixture) => ({
  cards: f.cards.map((card) => f.repository.getCard(card.id)!.version),
  release: f.repository.getRelease(f.release.id)!.version,
  persona: f.repository.getPersona(f.persona.id)!.version,
  roadmap: f.repository.getRoadmap(f.roadmap.id)!.version,
  map: f.repository.getStoryMapOrThrow(f.map.id).version
});

function commands(f: Fixture): Array<{ name: string; entity: string; id: string; method: "PATCH" | "POST" | "DELETE"; url: string; body: (baseVersion?: number) => Record<string, unknown> | undefined; query?: boolean }> {
  const token = (baseVersion?: number) => (baseVersion === undefined ? {} : { baseVersion });
  const card = f.cards[0]!.id;
  return [
    { name: "updateCard", entity: "card", id: card, method: "PATCH", url: `/api/cards/${card}`, body: (v) => ({ title: "New", ...token(v) }) },
    { name: "moveCard", entity: "card", id: card, method: "POST", url: `/api/cards/${card}/move`, body: (v) => ({ parentId: null, position: 1, ...token(v) }) },
    { name: "archiveCard", entity: "card", id: card, method: "POST", url: `/api/cards/${card}/archive`, body: (v) => token(v) },
    { name: "parkCard", entity: "card", id: card, method: "POST", url: `/api/cards/${card}/park`, body: (v) => ({ childStrategy: "unassign", ...token(v) }) },
    { name: "unparkCard", entity: "card", id: card, method: "POST", url: `/api/cards/${card}/unpark`, body: (v) => token(v) },
    { name: "deleteCard", entity: "card", id: card, method: "POST", url: `/api/cards/${card}/delete`, body: (v) => ({ strategy: "unassign", ...token(v) }) },
    { name: "updateRelease", entity: "release", id: f.release.id, method: "PATCH", url: `/api/releases/${f.release.id}`, body: (v) => ({ name: "New", ...token(v) }) },
    { name: "deleteRelease", entity: "release", id: f.release.id, method: "POST", url: `/api/releases/${f.release.id}/delete`, body: (v) => token(v) },
    { name: "updatePersona", entity: "persona", id: f.persona.id, method: "PATCH", url: `/api/personas/${f.persona.id}`, body: (v) => ({ name: "New", ...token(v) }) },
    { name: "deletePersona", entity: "persona", id: f.persona.id, method: "DELETE", url: `/api/personas/${f.persona.id}`, body: () => undefined, query: true },
    { name: "updateRoadmap", entity: "roadmap", id: f.roadmap.id, method: "PATCH", url: `/api/roadmaps/${f.roadmap.id}`, body: (v) => ({ name: "New", ...token(v) }) },
    { name: "updateStoryMap", entity: "storyMap", id: f.map.id, method: "PATCH", url: `/api/story-maps/${f.map.id}`, body: (v) => ({ name: "New", ...token(v) }) },
    { name: "deleteStoryMap", entity: "storyMap", id: f.map.id, method: "DELETE", url: `/api/story-maps/${f.map.id}`, body: () => undefined, query: true }
  ];
}

function send(f: Fixture, command: ReturnType<typeof commands>[number], baseVersion?: number) {
  const url = command.query && baseVersion !== undefined ? `${command.url}?baseVersion=${baseVersion}` : command.url;
  const payload = command.body(baseVersion);
  return f.server.inject({ method: command.method, url, ...(payload ? { payload } : {}) });
}

describe("required baseVersion over HTTP", () => {
  registerRefusesEveryRootCommandWithoutATokenAndChanges();

  it("returns 409 with the current state of the stale object and applies nothing", async () => {
    const f = await fixture();
    const before = versions(f);
    for (const command of commands(f)) {
      const response = await send(f, command, 99);
      expect(response.statusCode, command.name).toBe(409);
      expect(response.json(), command.name).toMatchObject({ code: "conflict", conflicts: [{ entity: command.entity, id: command.id, baseVersion: 99, currentVersion: expect.any(Number), current: { id: command.id } }] });
    }
    expect(versions(f)).toEqual(before);
  });

  it("applies a fresh token and the next token is the returned version", async () => {
    const f = await fixture();
    const first = await f.server.inject({ method: "PATCH", url: `/api/cards/${f.cards[0]!.id}`, payload: { title: "First", baseVersion: f.cards[0]!.version } });
    expect(first.statusCode).toBe(200);
    const returned = first.json<{ version: number }>().version;
    expect(returned).toBeGreaterThan(f.cards[0]!.version);
    const second = await f.server.inject({ method: "PATCH", url: `/api/cards/${f.cards[0]!.id}`, payload: { title: "Second", baseVersion: returned } });
    expect(second.statusCode).toBe(200);
    expect(second.json<{ version: number }>().version).toBeGreaterThan(returned);
    expect(f.repository.getRelease(f.release.id)!.version).toBe(f.release.version);
  });

  it.each([{ estimate: 5 }, { status: "archived" }])("aborts bulk patch %j listing every stale Card and applies nothing", async (patch) => {
    const f = await fixture();
    const [a, b, c] = f.cards;
    f.unitOfWork.run(human, ({ repository }) => { repository.updateCard(a!.id, { title: "Moved on A" }); repository.updateCard(c!.id, { title: "Moved on C" }); });
    const before = versions(f);
    const beforeCards = f.repository.listCards(f.map.id);
    const history = f.cards.map((card) => f.repository.listCardHistory(card.id));
    const activity = f.repository.listActivity(f.project.id);
    const live: unknown[] = [];
    f.unitOfWork.subscribe((event) => live.push(event));
    expect(beforeCards.find((card) => card.id === b!.id)).not.toHaveProperty("estimate");
    const response = await f.server.inject({ method: "PATCH", url: "/api/cards/bulk", payload: { storyMapId: f.map.id, patch, cards: [a, b, c].map((card) => ({ id: card!.id, baseVersion: card!.version })) } });
    expect(response.statusCode).toBe(409);
    expect(response.json().conflicts.map((entry: { id: string }) => entry.id)).toEqual([a!.id, c!.id]);
    expect(versions(f)).toEqual(before);
    expect(f.repository.listCards(f.map.id)).toEqual(beforeCards);
    expect(f.repository.getCard(b!.id)).not.toHaveProperty("estimate");
    expect(f.cards.map((card) => f.repository.listCardHistory(card.id))).toEqual(history);
    expect(f.repository.listActivity(f.project.id)).toEqual(activity);
    expect(live).toEqual([]);
  });

  it("rolls back bulk persistence, all root histories and Activity after a mid-write failure", testRollsBackBulkPersistenceAllRootHistoriesAndActivityAfterA);
});

describe("delete responses", () => {
  it("return the final version, equal to the version of the committed live event", async () => {
    const f = await fixture();
    const events: Array<{ entityId: string; version: number | null }> = [];
    f.unitOfWork.subscribe((event) => events.push(...event.entities.map(({ entityId, version }) => ({ entityId, version }))));
    const deletes = [
      { id: f.cards[0]!.id, response: () => f.server.inject({ method: "POST", url: `/api/cards/${f.cards[0]!.id}/delete`, payload: { strategy: "unassign", baseVersion: f.cards[0]!.version } }), key: "ok" },
      { id: f.release.id, response: () => f.server.inject({ method: "POST", url: `/api/releases/${f.release.id}/delete`, payload: { baseVersion: f.release.version } }), key: "ok" },
      { id: f.persona.id, response: () => f.server.inject({ method: "DELETE", url: `/api/personas/${f.persona.id}?baseVersion=${f.persona.version}`, payload: { definitionBefore: f.persona, affectedCards: [] } }), key: "ok" },
      { id: f.map.id, response: () => f.server.inject({ method: "DELETE", url: `/api/story-maps/${f.map.id}?baseVersion=${f.repository.getStoryMapOrThrow(f.map.id).version}` }), key: "deleted" }
    ];
    for (const { id, response, key } of deletes) {
      const result = await response();
      expect(result.statusCode, id).toBe(200);
      const body = result.json<Record<string, unknown>>();
      expect(body[key], id).toBe(true);
      expect(events.filter((event) => event.entityId === id).at(-1)?.version, id).toBe(body.version);
    }
  });

  it("returns executor application over MCP with the final deletion version in its committed event", async () => {
    const f = await fixture();
    const events: Array<{ entityId: string; version: number | null }> = [];
    f.unitOfWork.subscribe((event) => events.push(...event.entities));
    const result = await f.mcp("DeletePersona", { personaId: f.persona.id, baseVersion: f.persona.version, definitionBefore: f.persona, affectedCards: [] });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ outcome: "proposed", changeSet: { status: "proposed" } });
    const id = result.json().changeSetId;
    expect(f.repository.getPersona(f.persona.id)).toBeDefined();
    expect((await f.server.inject({ method: "POST", url: `/api/changesets/${id}/approve`, payload: {} })).statusCode).toBe(200);
    const applied = await f.server.inject({ method: "POST", url: `/api/changesets/${id}/apply`, payload: {} });
    expect(applied.statusCode, applied.body).toBe(200);
    expect(applied.json()).toMatchObject({ changeSet: { status: "applied", execution: { operationResults: [{ entityIds: expect.arrayContaining([f.persona.id]) }] } } });
    expect(f.repository.getPersona(f.persona.id)).toBeUndefined();
    expect(events.filter((event) => event.entityId === f.persona.id).at(-1)?.version).toBe(f.persona.version + 1);
  });
});

describe("one writer wins", () => {
  const readAt = (f: Fixture) => f.repository.getCard(f.cards[0]!.id)!;

  it.each(["human first", "agent first"] as const)("lets exactly one of a human and an Agent save from the same version (%s)", async (order) => {
    const f = await fixture();
    f.unitOfWork.run({ actorType: "agent", actorId: "agent-host", mcpSessionId: "s" }, ({ repository }) => repository.updateCard(f.cards[0]!.id, { title: "Seed by agent" }));
    f.unitOfWork.run(human, ({ repository }) => repository.updateCard(f.cards[0]!.id, { title: "Seed by human" }));
    const base = readAt(f).version;
    const saveHuman = () => f.server.inject({ method: "PATCH", url: `/api/cards/${f.cards[0]!.id}`, payload: { title: "Human", baseVersion: base } });
    const saveAgent = () => f.mcp("UpdateStoryMapCard", { cardId: f.cards[0]!.id, baseVersion: base, patch: { title: "Agent" } });
    const [first, second] = order === "human first" ? [await saveHuman(), await saveAgent()] : [await saveAgent(), await saveHuman()];
    expect([first.statusCode, second.statusCode]).toEqual([200, 409]);
    expect(second.json()).toMatchObject({ code: "conflict", conflicts: [{ entity: "card", baseVersion: base, current: { title: order === "human first" ? "Human" : "Agent" } }] });
  });

  it("lets exactly one of two human clients save when the first save coalesces with its previous save", async () => {
    const f = await fixture();
    f.unitOfWork.run(human, ({ repository }) => repository.updateCard(f.cards[0]!.id, { title: "Seed" }));
    const base = readAt(f).version;
    const tab = (title: string) => f.server.inject({ method: "PATCH", url: `/api/cards/${f.cards[0]!.id}`, payload: { title, baseVersion: base } });
    expect((await tab("Tab one")).statusCode).toBe(200);
    expect((await tab("Tab two")).statusCode).toBe(409);
    expect(readAt(f).title).toBe("Tab one");
  });

  it("returns the same conflicting state over MCP and HTTP with executor operation coordinates", async () => {
    const f = await fixture();
    const http = await f.server.inject({ method: "PATCH", url: `/api/cards/${f.cards[0]!.id}`, payload: { title: "X", baseVersion: 99 } });
    const mcp = await f.mcp("UpdateStoryMapCard", { cardId: f.cards[0]!.id, baseVersion: 99, patch: { title: "X" } });
    expect(mcp.statusCode).toBe(409);
    expect(mcp.json()).toMatchObject({ code: "conflict", conflicts: [{ ...http.json().conflicts[0], operationId: expect.any(String), index: 0 }], details: { changeSetId: expect.any(String) } });
    expect(f.repository.getChangeSet(mcp.json().details.changeSetId)).toMatchObject({ status: "conflict" });
  });
});

function registerRefusesEveryRootCommandWithoutATokenAndChanges() {
  it("refuses every root command without a token and changes nothing", async () => {
    const f = await fixture();
    const before = versions(f);
    for (const command of commands(f)) {
      const response = await send(f, command);
      expect(response.statusCode, command.name).toBe(400);
      expect(response.json().code, command.name).toBe("validation");
    }
    expect(versions(f)).toEqual(before);
  });
}

async function moveFixture() {
  const f = await fixture();
  const hierarchy = f.unitOfWork.run(human, ({ repository }) => {
    const activity = repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Activity" });
    const source = repository.createCard({ storyMapId: f.map.id, level: "step", parentId: activity.id, title: "Source", position: 0 });
    const target = repository.createCard({ storyMapId: f.map.id, level: "step", parentId: activity.id, title: "Target", position: 1 });
    const story = repository.createCard({ storyMapId: f.map.id, level: "story", parentId: source.id, title: "Moving Story", position: 0 });
    const first = repository.createCard({ storyMapId: f.map.id, level: "story", parentId: target.id, title: "First", position: 0 });
    const last = repository.createCard({ storyMapId: f.map.id, level: "story", parentId: target.id, title: "Last", position: 2 });
    return { activity, source, target, story, first, last };
  });
  const state = () => {
    const cards = f.repository.listCards(f.map.id);
    return { cards, history: cards.map((card) => ({ id: card.id, versions: f.repository.listCardHistory(card.id) })), activity: f.repository.listActivity(f.project.id) };
  };
  return { ...f, ...hierarchy, state };
}

describe("versioned HTTP move acceptance", () => {
  it("persists legal parent, position and Release with sibling order, history and card.moved Activity", async () => {
    const f = await moveFixture();
    const before = f.state();
    const response = await f.server.inject({ method: "POST", url: `/api/cards/${f.story.id}/move`, payload: { parentId: f.target.id, position: 1, releaseId: f.release.id, baseVersion: f.story.version } });
    expect(response.statusCode).toBe(200);
    const saved = response.json();
    expect(saved).toMatchObject({ id: f.story.id, parentId: f.target.id, position: 1, releaseId: f.release.id, version: f.story.version + 1 });
    expect(f.repository.getCard(f.story.id)).toEqual(saved);
    const siblings = f.repository.listCards(f.map.id).filter((card) => card.parentId === f.target.id).sort((a, b) => a.position - b.position);
    expect(siblings.map((card) => [card.id, card.position])).toEqual([[f.first.id, 0], [f.story.id, 1], [f.last.id, 2]]);
    expect(f.repository.listCardHistory(f.story.id).at(-1)?.version).toBe(saved.version);
    const moved = f.repository.listActivity(f.project.id).filter((event) => event.action === "card.moved");
    expect(moved).toHaveLength(before.activity.filter((event) => event.action === "card.moved").length + 1);
    expect(moved.at(-1)).toMatchObject({ affectedEntityId: f.story.id, before: { parentId: f.source.id, releaseId: null }, after: { parentId: f.target.id, position: 1, releaseId: f.release.id } });
  });

  it.each(["Story under Activity", "Step under Step"] as const)("refuses %s with a typed reason and no state, history, Activity or publication changes", async (illegal) => {
    const f = await moveFixture();
    const card = illegal === "Story under Activity" ? f.story : f.source;
    const parentId = illegal === "Story under Activity" ? f.activity.id : f.target.id;
    const before = f.state();
    let publications = 0;
    f.unitOfWork.subscribe(() => { publications += 1; });
    const response = await f.server.inject({ method: "POST", url: `/api/cards/${card.id}/move`, payload: { parentId, position: 0, releaseId: f.release.id, baseVersion: card.version } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation", message: expect.stringMatching(illegal === "Story under Activity" ? /story.*activity/i : /step.*step/i) });
    expect(f.state()).toEqual(before);
    expect(publications).toBe(0);
  });

  it("accepts the first of two captured client baselines and refuses the second without changing the accepted move", async () => {
    const f = await moveFixture();
    const baseline = f.story.version;
    const first = await f.server.inject({ method: "POST", url: `/api/cards/${f.story.id}/move`, payload: { parentId: f.target.id, position: 1, releaseId: f.release.id, baseVersion: baseline } });
    expect(first.statusCode).toBe(200);
    const accepted = f.state();
    let publications = 0;
    f.unitOfWork.subscribe(() => { publications += 1; });
    const second = await f.server.inject({ method: "POST", url: `/api/cards/${f.story.id}/move`, payload: { parentId: f.source.id, position: 0, releaseId: null, baseVersion: baseline } });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: "conflict", conflicts: [{ entity: "card", id: f.story.id, baseVersion: baseline, currentVersion: first.json().version, current: { parentId: f.target.id, position: 1, releaseId: f.release.id } }] });
    expect(f.state()).toEqual(accepted);
    expect(publications).toBe(0);
  });
});

async function testRefusesManagedAnnotationPOSTAndDELETEAtomicallyWhileAllowingUnmanagedAnd() {
  const f = await fixture();
  const cardId = f.cards[0]!.id;
  const annotations = f.unitOfWork.run(human, ({ repository }) => {
    const present = repository.createAnnotation({ projectId: f.project.id, name: "managed-present" });
    const absent = repository.createAnnotation({ projectId: f.project.id, name: "managed-absent" });
    const unmanaged = repository.createAnnotation({ projectId: f.project.id, name: "story-map:unmanaged" });
    repository.setCardAnnotation(cardId, present.id);
    return { present, absent, unmanaged };
  });
  const { conflict } = addSyncConflict(f, "labels");
  const before = f.repository.getOperationSnapshot(f.project.id);
  const history = f.repository.listCardHistory(cardId);
  const activity = f.repository.listActivity(f.project.id);
  for (const [method, annotationId] of [["POST", annotations.absent.id], ["DELETE", annotations.present.id]] as const) {
    const response = await f.server.inject({ method, url: `/api/cards/${cardId}/annotations/${annotationId}` });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json()).toMatchObject({ code: "conflict", conflicts: [{ entity: "card", id: cardId, baseVersion: f.repository.getCard(cardId)!.version, currentVersion: f.repository.getCard(cardId)!.version, reason: "sync", syncConflictId: conflict.id, current: conflict }] });
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
    expect(f.repository.listCardHistory(cardId)).toEqual(history);
    expect(f.repository.listActivity(f.project.id)).toEqual(activity);
  }
  for (const [method, annotationId, expected] of [["POST", annotations.present.id, 201], ["DELETE", annotations.absent.id, 200]] as const) {
    const response = await f.server.inject({ method, url: `/api/cards/${cardId}/annotations/${annotationId}` });
    expect(response.statusCode, response.body).toBe(expected);
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
    expect(f.repository.listCardHistory(cardId)).toEqual(history);
    expect(f.repository.listActivity(f.project.id)).toEqual(activity);
  }
  for (const [method, expected] of [["POST", 201], ["DELETE", 200]] as const) {
    const response = await f.server.inject({ method, url: `/api/cards/${cardId}/annotations/${annotations.unmanaged.id}` });
    expect(response.statusCode, response.body).toBe(expected);
    expect(f.repository.listCardAnnotationsForStoryMap(f.map.id).some((row) => row.cardId === cardId && row.annotationId === annotations.unmanaged.id)).toBe(method === "POST");
  }
  expect(f.repository.getSyncConflict(conflict.id)?.status).toBe("open");
}

async function testRefusesFreshReleasePATCHAndDeleteWithTheActualDependentCard() {
  const f = await fixture();
  const { conflict } = addSyncConflict(f, "milestone");
  const before = f.repository.getOperationSnapshot(f.project.id);
  const activity = f.repository.listActivity(f.project.id);
  for (const request of [{ method: "PATCH" as const, url: `/api/releases/${f.release.id}`, payload: { name: "Blocked", baseVersion: f.release.version } }, { method: "POST" as const, url: `/api/releases/${f.release.id}/delete`, payload: { baseVersion: f.release.version } }]) {
    const response = await f.server.inject(request);
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json()).toMatchObject({ code: "conflict", conflicts: [{ entity: "card", id: f.cards[0]!.id, reason: "sync", syncConflictId: conflict.id, current: conflict }] });
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
    expect(f.repository.listActivity(f.project.id)).toEqual(activity);
  }
  const allowed = await f.server.inject({ method: "PATCH", url: `/api/releases/${f.release.id}`, payload: { startDate: "2026-10-20", baseVersion: f.release.version } });
  expect(allowed.statusCode, allowed.body).toBe(200);
  expect(f.repository.getRelease(f.release.id)).toMatchObject({ startDate: "2026-10-20", name: f.release.name });
  expect(f.repository.getSyncConflict(conflict.id)?.status).toBe("open");
}

async function testGuardsHumanManagedDefinitionCreationAndDuplicateNameRenameWhileAllowing() {
  const f = await fixture();
  const annotation = f.unitOfWork.run(human, ({ repository }) => {
    const annotation = repository.createAnnotation({ projectId: f.project.id, name: "managed" });
    repository.setCardAnnotation(f.cards[0]!.id, annotation.id);
    return annotation;
  });
  const { conflict } = addSyncConflict(f, "labels");
  const create = await f.server.inject({ method: "POST", url: "/api/annotations", payload: { projectId: f.project.id, name: "managed" } });
  expect(create.statusCode, create.body).toBe(409);
  expect(create.json().conflicts).toMatchObject([{ reason: "sync", syncConflictId: conflict.id }]);
  const duplicate = f.unitOfWork.run(human, ({ repository }) => repository.createAnnotation({ projectId: f.project.id, name: "managed" }));
  const rename = await f.server.inject({ method: "PATCH", url: `/api/annotations/${duplicate.id}`, payload: { name: "other" } });
  expect(rename.statusCode, rename.body).toBe(409);
  const metadata = await f.server.inject({ method: "PATCH", url: `/api/annotations/${annotation.id}`, payload: { color: "#ff0000" } });
  expect(metadata.statusCode, metadata.body).toBe(200);
  expect(f.repository.getAnnotation(duplicate.id)?.name).toBe("managed");
}

async function testDoesNotMaterializeAProjectSnapshotOnOrdinaryHTTPEditsOr() {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => {
    for (let index = 0; index < 5; index++) {
      const map = repository.createStoryMap({ projectId: f.project.id, name: `Other ${index}` });
      for (let card = 0; card < 10; card++) repository.createCard({ storyMapId: map.id, level: "story", title: `Other ${index}/${card}` });
    }
    repository.importSourceDocument({ parsedChunks: splitTextIntoChunks("One requirement.\n\nAnother requirement."), projectId: f.project.id, title: "Evidence", type: "txt", content: "One requirement.\n\nAnother requirement.", fileHash: "a".repeat(64) });
  });
  const snapshot = vi.spyOn(snapshotActions, "getOperationSnapshot");
  try {
    const started = performance.now();
    const first = await f.server.inject({ method: "PATCH", url: `/api/cards/${f.cards[0]!.id}`, payload: { title: "Ordinary", baseVersion: f.cards[0]!.version } });
    expect(first.statusCode, first.body).toBe(200);
    addSyncConflict(f, "title");
    const second = await f.server.inject({ method: "PATCH", url: `/api/cards/${f.cards[0]!.id}`, payload: { estimate: 3, baseVersion: f.repository.getCard(f.cards[0]!.id)!.version } });
    expect(second.statusCode, second.body).toBe(200);
    expect(snapshot).not.toHaveBeenCalled();
    const unrelatedWritesMs = performance.now() - started;
    const blocked = await f.server.inject({ method: "PATCH", url: `/api/cards/${f.cards[0]!.id}`, payload: { title: "Locked", baseVersion: f.repository.getCard(f.cards[0]!.id)!.version } });
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(snapshot).toHaveBeenCalledTimes(1);
    console.info("Human write snapshot diagnostic", { maps: 6, cards: 53, sourceDocuments: 1, unrelatedWrites: 2, unrelatedSnapshotLoads: 0, disputedWrites: 1, disputedSnapshotLoads: snapshot.mock.calls.length, unrelatedWritesMs });
  } finally { snapshot.mockRestore(); }
}

async function testRollsBackBulkPersistenceAllRootHistoriesAndActivityAfterA() {
  const f = await fixture();
  const before = f.repository.getOperationSnapshot(f.project.id);
  const history = f.cards.map((card) => f.repository.listCardHistory(card.id));
  const activity = f.repository.listActivity(f.project.id);
  const live: unknown[] = [];
  f.unitOfWork.subscribe((event) => live.push(event));
  f.handle.current.$client.exec(`CREATE TRIGGER reject_bulk_update BEFORE UPDATE ON cards WHEN OLD.id = '${f.cards[1]!.id}' BEGIN SELECT RAISE(ABORT, 'Injected bulk persistence failure'); END`);
  const response = await f.server.inject({ method: "PATCH", url: "/api/cards/bulk", payload: { storyMapId: f.map.id, patch: { status: "archived" }, cards: f.cards.map(({ id, version }) => ({ id, baseVersion: version })) } });
  expect(response.statusCode).toBe(500);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(f.cards.map((card) => f.repository.listCardHistory(card.id))).toEqual(history);
  expect(f.repository.listActivity(f.project.id)).toEqual(activity);
  expect(live).toEqual([]);
}
