import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, expect, it } from "vitest";
import type { ChangeOperation, DeleteCardsCommand } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";

const human = { actorType: "human", actorId: "local-user" } as const;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-delete-set-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Delete selection" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const left = repository.createCard({ storyMapId: map.id, level: "activity", title: "Left" });
    const middle = repository.createCard({ storyMapId: map.id, level: "activity", title: "Middle" });
    const right = repository.createCard({ storyMapId: map.id, level: "activity", title: "Right" });
    const step = repository.createCard({ storyMapId: map.id, parentId: middle.id, level: "step", title: "Step" });
    const sibling = repository.createCard({ storyMapId: map.id, parentId: middle.id, level: "step", title: "Sibling" });
    const story = repository.createCard({ storyMapId: map.id, parentId: step.id, level: "story", title: "Story" });
    return { project, map, left, middle, right, step, sibling, story };
  });
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath });
  cleanup.push(async () => { await server.close(); handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const command = (ids: string[], strategy: DeleteCardsCommand["strategy"] = "unassign"): DeleteCardsCommand => ({ storyMapId: rows.map.id, cards: ids.map((id) => ({ id, baseVersion: repository.getCard(id)!.version })), affectedCards: repository.getOperationSnapshot(rows.project.id).cards.map(({ id, version }) => ({ id, baseVersion: version })), strategy });
  const send = (payload: DeleteCardsCommand) => server.inject({ method: "POST", url: "/api/cards/delete-set", payload });
  return { ...rows, repository, unitOfWork, handle, server, command, send };
}

it("deletes only explicit overlapping targets and flattens every surviving descendant once", async () => {
  const f = await fixture();
  const before = f.repository.getCard(f.story.id)!;
  const response = await f.send(f.command([f.middle.id, f.step.id]));
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json()).toEqual({ ok: true, cardIds: [f.middle.id, f.step.id] });
  expect(f.repository.getCard(f.middle.id)).toBeUndefined();
  expect(f.repository.getCard(f.step.id)).toBeUndefined();
  expect(f.repository.listCardHistory(f.step.id).at(-1)?.version).toBe(f.step.version + 1);
  expect(f.repository.getCard(f.story.id)).toMatchObject({ parentId: null, version: before.version + 1 });
  expect(f.repository.getCard(f.sibling.id)).toMatchObject({ parentId: null });
  expect(f.repository.listActivity(f.project.id).filter((row) => row.action === "card.deleted").map((row) => (row.before as { id: string }).id).sort()).toEqual([f.middle.id, f.step.id].sort());
});

it("excludes all selected neighbors and computes overlapping reassignments from original parents", async () => {
  const f = await fixture();
  const response = await f.send(f.command([f.left.id, f.middle.id, f.step.id], "reassign-right"));
  expect(response.statusCode, response.body).toBe(200);
  expect(f.repository.getCard(f.sibling.id)).toMatchObject({ parentId: f.right.id });
  expect(f.repository.getCard(f.story.id)).toMatchObject({ parentId: f.sibling.id });
  expect(f.repository.listCards(f.map.id).map((row) => row.id).sort()).toEqual([f.right.id, f.sibling.id, f.story.id].sort());
  expect(f.repository.listActivity(f.project.id).filter((row) => row.action === "card.rehomed").map((row) => (row.after as { id: string }).id).sort()).toEqual([f.sibling.id, f.story.id].sort());
});

it("returns every stale selected and affected owner and preserves all state", async () => {
  const f = await fixture();
  const command = f.command([f.middle.id, f.step.id]);
  f.unitOfWork.run(human, ({ repository }) => { for (const id of [f.middle.id, f.step.id, f.story.id]) repository.updateCard(id, { title: "Changed" }); });
  const before = f.repository.getOperationSnapshot(f.project.id);
  const history = before.cards.map((card) => f.repository.listCardHistory(card.id));
  const activity = f.repository.listActivity(f.project.id);
  const live: unknown[] = [];
  f.unitOfWork.subscribe((event) => live.push(event));
  const response = await f.send(command);
  expect(response.statusCode, response.body).toBe(409);
  expect(response.json().conflicts.map((row: { id: string }) => row.id).sort()).toEqual([f.middle.id, f.step.id, f.story.id].sort());
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(before.cards.map((card) => f.repository.listCardHistory(card.id))).toEqual(history);
  expect(f.repository.listActivity(f.project.id)).toEqual(activity);
  expect(live).toEqual([]);
});

it("refuses newly affected children and invalid strategies without writes", async () => {
  const f = await fixture();
  const command = f.command([f.middle.id]);
  f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.map.id, parentId: f.middle.id, level: "step", title: "New child" }));
  const before = f.repository.getOperationSnapshot(f.project.id);
  expect((await f.send(command)).statusCode).toBe(409);
  expect((await f.send(f.command([f.left.id, f.middle.id], "reassign-left"))).statusCode).toBe(400);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
});

it("rolls back normalized persistence, history and Activity after a mid-write failure", async () => {
  const f = await fixture();
  const live: unknown[] = [];
  f.unitOfWork.subscribe((event) => live.push(event));
  const before = f.repository.getOperationSnapshot(f.project.id);
  const history = before.cards.map((card) => f.repository.listCardHistory(card.id));
  const activity = f.repository.listActivity(f.project.id);
  f.handle.current.$client.exec(`CREATE TRIGGER reject_selected_delete BEFORE DELETE ON cards WHEN OLD.id = '${f.step.id}' BEGIN SELECT RAISE(ABORT, 'Injected delete persistence failure'); END`);
  const response = await f.send(f.command([f.middle.id, f.step.id]));
  expect(response.statusCode).toBe(500);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(before.cards.map((card) => f.repository.listCardHistory(card.id))).toEqual(history);
  expect(f.repository.listActivity(f.project.id)).toEqual(activity);
  expect(live).toEqual([]);
});

it("preserves affected baselines through MCP proposal, approval and separate deferred Apply", async () => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "apply" }));
  const input = { ...f.command([f.middle.id, f.step.id]), apply: false };
  const proposed = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "DeleteCards", input } });
  expect(proposed.statusCode, proposed.body).toBe(200);
  expect(proposed.json().outcome).toBe("proposed");
  const id = proposed.json().changeSetId;
  expect(f.repository.getChangeSet(id)?.operations[0]).toMatchObject({ after: { selection: { cards: input.cards, affectedCards: input.affectedCards } } });
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${id}/approve`, payload: {} })).statusCode).toBe(200);
  f.unitOfWork.run(human, ({ repository }) => repository.updateCard(f.story.id, { title: "Changed after approval" }));
  const before = f.repository.getOperationSnapshot(f.project.id);
  const applied = await f.server.inject({ method: "POST", url: `/api/changesets/${id}/apply`, payload: {} });
  expect(applied.statusCode, applied.body).toBe(409);
  expect(applied.json().conflicts).toMatchObject([{ id: f.story.id, baseVersion: input.affectedCards.find((row) => row.id === f.story.id)!.baseVersion }]);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
});

it("refuses open sync conflicts on affected roots and missing or foreign selected Cards", async () => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => {
    const connection = repository.createConnectorConnection({ projectId: f.project.id, provider: "github", authMode: "token", name: "GitHub", owner: "fixture", repository: "repo" });
    const run = repository.createSyncRun({ storyMapId: f.map.id, connectionId: connection.id, mode: "push", status: "planned" });
    repository.bindRemoteWorkItemLink({ cardId: f.story.id, connectionId: connection.id, provider: "github", remoteId: "1", url: "https://github.com/fixture/repo/issues/1", labels: [] });
    repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(f.story.id)!.storyMapId).find((row) => row.cardId === f.story.id)!.externalRefId, syncRunId: run.id, connectionId: connection.id, cardId: f.story.id, remoteId: "1", field: "title", localValue: f.story.title, remoteValue: "Remote" });
  });
  const before = f.repository.getOperationSnapshot(f.project.id);
  const response = await f.send(f.command([f.middle.id]));
  expect(response.statusCode, response.body).toBe(409);
  expect(response.json().conflicts).toMatchObject([{ id: f.story.id, reason: "sync" }]);
  const missing = f.command([f.middle.id]);
  missing.cards = [{ id: "00000000-0000-4000-8000-000000000001", baseVersion: 1 }];
  expect((await f.send(missing)).statusCode).toBe(400);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
});

it("validates dependency and cross-map evidence owner baselines before deleting any target", async () => {
  const f = await fixture();
  const owner = f.unitOfWork.run(human, ({ repository }) => {
    repository.mutateCardDependency(f.right.id, f.middle.id, true);
    const map = repository.createStoryMap({ projectId: f.project.id, name: "Evidence owner map" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Evidence owner" });
    const identity = repository.createGitHubLink({ cardId: f.middle.id, repo: "fixture/repo", issueNumber: 1, url: "https://github.com/fixture/repo/issues/1" });
    repository.createCardSourceLink(card.id, { kind: "github", externalRefId: identity.id });
    return card;
  });
  const command = f.command([f.middle.id]);
  const incomplete = { ...command, affectedCards: command.affectedCards.filter((row) => row.id !== owner.id) };
  expect((await f.send(incomplete)).statusCode).toBe(409);
  f.unitOfWork.run(human, ({ repository }) => { repository.updateCard(f.right.id, { title: "New dependent" }); repository.updateCard(owner.id, { title: "New evidence owner" }); });
  const before = f.repository.getOperationSnapshot(f.project.id);
  const response = await f.send(command);
  expect(response.statusCode, response.body).toBe(409);
  expect(response.json().conflicts.map((row: { id: string }) => row.id).sort()).toEqual([f.right.id, owner.id].sort());
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  const ownerBefore = f.repository.getCard(owner.id)!;
  const dependentBefore = f.repository.getCard(f.right.id)!;
  expect((await f.send(f.command([f.middle.id]))).statusCode).toBe(200);
  expect(f.repository.getCard(owner.id)?.version).toBe(ownerBefore.version + 1);
  expect(f.repository.getCard(f.right.id)?.version).toBe(dependentBefore.version + 1);
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toEqual([]);
  expect(f.repository.listActivity(f.project.id).filter((row) => row.action === "card.dependency.unset")).toHaveLength(1);
  expect(f.repository.getOperationSnapshot(f.project.id).sourceLinks.filter((link) => link.cardId === owner.id)).toEqual([]);
});

it("refuses missing, duplicate and foreign-map selections and inconsistent baselines atomically", async () => {
  const f = await fixture();
  const foreign = f.unitOfWork.run(human, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: f.project.id, name: "Foreign selection" });
    return repository.createCard({ storyMapId: map.id, level: "activity", title: "Foreign" });
  });
  const valid = f.command([f.middle.id]);
  const before = f.repository.getOperationSnapshot(f.project.id);
  for (const cards of [[{ id: "00000000-0000-4000-8000-000000000001", baseVersion: 1 }], [{ id: foreign.id, baseVersion: foreign.version }], [...valid.cards, ...valid.cards]]) {
    const response = await f.send({ ...valid, cards });
    expect(response.statusCode, response.body).toBe(400);
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  }
  const inconsistent = { ...valid, affectedCards: valid.affectedCards.map((row) => row.id === f.middle.id ? { ...row, baseVersion: row.baseVersion + 1 } : row) };
  expect((await f.send(inconsistent)).statusCode).toBe(409);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
});

it.each([false, true])("keeps selection semantics across approved MCP Apply (new affected child: %s)", async (addChild) => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "apply" }));
  const command = f.command([f.left.id, f.middle.id, f.step.id], "reassign-right");
  const proposed = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "DeleteCards", input: { ...command, apply: false } } });
  expect(proposed.statusCode, proposed.body).toBe(200);
  const id = proposed.json().changeSetId;
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${id}/approve`, payload: {} })).statusCode).toBe(200);
  if (addChild) f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.map.id, parentId: f.middle.id, level: "step", title: "Late affected child" }));
  const before = f.repository.getOperationSnapshot(f.project.id);
  const applied = await f.server.inject({ method: "POST", url: `/api/changesets/${id}/apply`, payload: {} });
  expect(applied.statusCode, applied.body).toBe(addChild ? 409 : 200);
  if (addChild) expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  else {
    expect(f.repository.getCard(f.middle.id)).toBeUndefined();
    expect(f.repository.getCard(f.sibling.id)?.parentId).toBe(f.right.id);
    expect(f.repository.getCard(f.story.id)?.parentId).toBe(f.sibling.id);
  }
});

it("authorizes affected baseline scopes before an MCP selected-set proposal or write", async () => {
  const f = await fixture();
  const hidden = f.unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Disabled affected scope" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Disabled map" });
    const card = repository.createCard({ storyMapId: map.id, level: "activity", title: "Disabled owner" });
    repository.updateSafetySettings(project.id, { agentMode: "off" });
    return card;
  });
  const command = f.command([f.middle.id]);
  command.affectedCards.push({ id: hidden.id, baseVersion: hidden.version });
  const response = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "DeleteCards", input: command } });
  expect(response.statusCode, response.body).toBe(403);
  expect(response.json().code).toBe("disabled");
  expect(f.repository.getCard(f.middle.id)).toMatchObject({ id: f.middle.id });
  expect(f.repository.listChangeSets(f.project.id)).toEqual([]);
});

it.each(["edit", "delete"] as const)("ignores an unrelated captured Card %s while retaining the confirmed selection", async (change) => {
  const f = await fixture();
  const unrelated = f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "story", title: "Unrelated" }));
  const command = f.command([f.story.id]);
  f.unitOfWork.run(human, ({ repository }) => change === "edit" ? repository.updateCard(unrelated.id, { title: "Unrelated changed" }) : repository.deleteCard(unrelated.id, { strategy: "unassign" }));
  const response = await f.send(command);
  expect(response.statusCode, response.body).toBe(200);
  expect(f.repository.getCard(f.story.id)).toBeUndefined();
  expect(f.repository.getCard(f.middle.id)).toBeDefined();
  expect(f.repository.getCard(unrelated.id)?.title).toBe(change === "edit" ? "Unrelated changed" : undefined);
});

it("ignores missing unused affected baselines during deferred MCP Apply", async () => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "apply" }));
  const unrelated = f.unitOfWork.run(human, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "story", title: "Unrelated" }));
  const input = { ...f.command([f.story.id]), apply: false };
  const proposed = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "DeleteCards", input } });
  expect(proposed.statusCode, proposed.body).toBe(200);
  const id = proposed.json().changeSetId;
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${id}/approve`, payload: {} })).statusCode).toBe(200);
  f.unitOfWork.run(human, ({ repository }) => repository.deleteCard(unrelated.id, { strategy: "unassign" }));
  const applied = await f.server.inject({ method: "POST", url: "/api/mcp/call", payload: { name: "ApplyChangeSet", input: { changeSetId: id, approvalToken: "human-approved" } } });
  expect(applied.statusCode, applied.body).toBe(200);
  expect(f.repository.getCard(f.story.id)).toBeUndefined();
});

it("deletes selected ancestor dependency and shared-evidence owners without traversing removed ancestry", async () => {
  const f = await fixture();
  f.unitOfWork.run(human, ({ repository }) => {
    repository.mutateCardDependency(f.story.id, f.step.id, true);
    repository.mutateCardDependency(f.left.id, f.step.id, true);
    const identity = repository.createGitHubLink({ cardId: f.step.id, repo: "fixture/repo", issueNumber: 11, url: "https://github.com/fixture/repo/issues/11" });
    repository.createCardSourceLink(f.story.id, { kind: "github", externalRefId: identity.id });
    repository.createCardSourceLink(f.right.id, { kind: "github", externalRefId: identity.id });
  });
  const leftBefore = f.repository.getCard(f.left.id)!;
  const rightBefore = f.repository.getCard(f.right.id)!;
  const response = await f.send(f.command([f.middle.id, f.step.id, f.story.id]));
  expect(response.statusCode, response.body).toBe(200);
  for (const card of [f.middle, f.step, f.story]) expect(f.repository.getCard(card.id)).toBeUndefined();
  expect(f.repository.getCard(f.sibling.id)?.parentId).toBeNull();
  expect(f.repository.getCard(f.left.id)?.version).toBe(leftBefore.version + 1);
  expect(f.repository.getCard(f.right.id)?.version).toBe(rightBefore.version + 1);
  expect(f.repository.listCardDependenciesForStoryMap(f.map.id)).toEqual([]);
  expect(f.repository.getOperationSnapshot(f.project.id).githubLinks).toEqual([]);
});

it("reassigns multiple selected roots left past selected neighbors while retaining surviving subtrees", async () => {
  const f = await fixture();
  const nested = f.unitOfWork.run(human, ({ repository }) => {
    const step = repository.createCard({ storyMapId: f.map.id, parentId: f.right.id, level: "step", title: "Right step" });
    const story = repository.createCard({ storyMapId: f.map.id, parentId: step.id, level: "story", title: "Right story" });
    return { step, story };
  });
  const response = await f.send(f.command([f.middle.id, f.right.id], "reassign-left"));
  expect(response.statusCode, response.body).toBe(200);
  for (const card of [f.step, f.sibling, nested.step]) expect(f.repository.getCard(card.id)?.parentId).toBe(f.left.id);
  expect(f.repository.getCard(f.story.id)?.parentId).toBe(f.step.id);
  expect(f.repository.getCard(nested.story.id)?.parentId).toBe(nested.step.id);
  expect(f.repository.listCards(f.map.id).filter((card) => card.parentId === f.left.id).map((card) => card.position).sort()).toEqual([0, 1, 2]);
});

it("applies a selected deletion with local target and affected aliases", async () => {
  const f = await fixture();
  const operations: ChangeOperation[] = [
    { operationId: "activity", op: "create", entity: "card", entityId: "local-activity", after: { storyMapId: f.map.id, level: "activity", title: "Selected Activity", position: 3 } },
    { operationId: "step", op: "create", entity: "card", entityId: "local-step", after: { storyMapId: f.map.id, parentId: "local-activity", level: "step", title: "Selected Step" } },
    { operationId: "story", op: "create", entity: "card", entityId: "local-story", after: { storyMapId: f.map.id, parentId: "local-step", level: "story", title: "Selected Story" } },
    { operationId: "survivor", op: "create", entity: "card", entityId: "local-survivor", after: { storyMapId: f.map.id, level: "activity", title: "Surviving Activity", position: 4 } },
    { operationId: "delete", op: "delete", entity: "card", entityId: "local-activity", baseVersion: 1, after: { strategy: "unassign", selection: { storyMapId: f.map.id, cards: ["local-activity", "local-step", "local-story"].map((id) => ({ id, baseVersion: 1 })), affectedCards: [{ id: "local-survivor", baseVersion: 1 }] } } }
  ];
  const proposal = f.unitOfWork.run(human, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Alias deletion", source: "human", createdAt: new Date().toISOString(), operations }));
  const preview = await f.server.inject({ method: "GET", url: `/api/changesets/${proposal.id}/preview` });
  expect(preview.statusCode, preview.body).toBe(200);
  expect(preview.json().conflicts).toEqual([]);
  expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/approve`, payload: {} })).statusCode).toBe(200);
  const applied = await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/apply`, payload: {} });
  expect(applied.statusCode, applied.body).toBe(200);
  const cards = f.repository.listCards(f.map.id);
  expect(cards.find((card) => card.title === "Surviving Activity")).toMatchObject({ parentId: null, position: 3 });
  expect(cards.some((card) => card.title.startsWith("Selected"))).toBe(false);
  expect(cards).toHaveLength(7);
});
