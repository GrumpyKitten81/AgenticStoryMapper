import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, expect, it } from "vitest";
import { changeSetCommandResponseSchema, type LiveTransaction } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { registerMcpHttp } from "@storymapper/server/mcp/http";
import { approveChangeSet, applyChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";

const human = { actorType: "human", actorId: "delivery-fixture" } as const;
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-delivery-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const live: LiveTransaction[] = [];
  unitOfWork.subscribe((event) => { live.push(event); });
  const rows = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "Delivery" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const otherMap = repository.createStoryMap({ projectId: project.id, name: "Other" });
    const review = repository.createWorkflowStatus({ projectId: project.id, name: "Review", group: "active" });
    repository.createWorkflowStatus({ projectId: project.id, storyMapId: map.id, name: "Verified", group: "done" });
    repository.createWorkflowStatus({ projectId: project.id, storyMapId: otherMap.id, name: "Foreign", group: "done" });
    repository.updateSafetySettings(project.id, { agentMode: "apply" });
    const cards = Array.from({ length: 3 }, (_, index) => repository.createCard({ storyMapId: map.id, title: `Card ${index}`, level: "activity" }));
    repository.parkCard(cards[2]!.id, { childStrategy: "unassign" });
    for (const [index, card] of cards.entries()) for (const system of ["bmad", "other"]) repository.setExternalRef({ entityType: "card", entityId: card.id, system, externalId: `Story-${index}` });
    return { project, map, otherMap, review, cards: cards.map((card) => repository.getCard(card.id)!) };
  });
  const server = Fastify();
  cleanup.push(() => server.close());
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: path });
  registerMcpHttp(server, repository, unitOfWork);
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "delivery-sdk-host", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  await client.connect(transport);
  cleanup.push(() => client.close());
  async function call(surface: string, input: unknown, name = "UpdateDeliveryStatus") {
    if (surface === "http") return (await server.inject({ method: "POST", url: "/api/mcp/call", payload: { name, input } })).json();
    const result = await client.callTool({ name, arguments: input as Record<string, unknown> });
    return JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
  }
  live.length = 0;
  return { directory, path, handle, repository, unitOfWork, live, server, client, transport, call, ...rows };
}
function targets() { return [{ system: "bmad", externalId: "Story-0", status: "Review" }, { system: "bmad", externalId: "Story-1", status: "Verified" }, { system: "bmad", externalId: "Story-2", status: "todo" }]; }

it.each(["http", "sdk"])("applies mixed delivery atomically on %s with durable actual actor, history, isolated baselines and live updates", async (surface) => {
  const f = await fixture();
  expect((await f.client.listTools()).tools.find((tool) => tool.name === "UpdateDeliveryStatus")?.inputSchema).toMatchObject({ required: ["storyMapId", "cards"] });
  const result = changeSetCommandResponseSchema.parse(await f.call(surface, { storyMapId: f.map.id, cards: targets() }));
  expect(result).toMatchObject({ outcome: "applied", changeSet: { operations: targets().map((target, index) => ({ op: "update", entity: "card", entityId: f.cards[index]!.id, after: { status: target.status }, selector: { kind: "externalRef", scopeId: f.map.id, system: target.system, externalId: target.externalId } })) } });
  const actor = { actorType: "agent", actorId: surface === "sdk" ? "delivery-sdk-host" : "local-mcp-host", mcpSessionId: surface === "sdk" ? f.transport.sessionId : expect.any(String) };
  expect(result.changeSet.proposedBy).toMatchObject(actor);
  expect(result.changeSet.execution?.actor).toMatchObject(actor);
  for (const [index, card] of f.cards.entries()) {
    expect(f.repository.getCard(card.id)).toMatchObject({ ...card, status: targets()[index]!.status, version: card.version + 1, updatedAt: expect.any(String) });
    expect(f.repository.listCardHistory(card.id)).toHaveLength(2);
    const refs = f.repository.listExternalRefsForStoryMap(f.map.id).filter((ref) => ref.entityId === card.id);
    expect(refs.find((ref) => ref.system === "bmad")?.syncedVersion).toBe(card.version + 1);
    expect(refs.find((ref) => ref.system === "other")?.syncedVersion).toBe(card.version);
  }
  expect(readdirSync(join(f.directory, "snapshots")).filter((name) => name.endsWith(".sqlite"))).toHaveLength(1);
  const live = f.live.filter((event) => event.entities.some((entity) => entity.entityType === "card"));
  expect(live).toHaveLength(1);
  expect(live[0]!.entities.filter((entity) => entity.entityType === "card")).toHaveLength(3);
  await f.client.close(); await f.server.close(); f.handle.current.$client.close();
  const reopened = openStoryMapperDb(f.path);
  try {
    const durable = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(durable.getChangeSet(result.changeSetId)?.status).toBe("applied");
    const activity = durable.listActivity(f.project.id);
    const events = activity.filter((event) => event.action === "changeSet.operation.applied");
    expect(events).toHaveLength(3);
    for (const event of events) expect(event).toMatchObject({ actorType: actor.actorType, actor: actor.actorId, mcpSessionId: actor.mcpSessionId });
    expect(activity.filter((event) => event.action === "tool_call")).toMatchObject([{ affectedEntityId: "UpdateDeliveryStatus", actorType: actor.actorType, actor: actor.actorId, mcpSessionId: actor.mcpSessionId, after: { outcome: "ok" } }]);
  } finally { reopened.$client.close(); }
});

it.each(["http", "sdk"])("aggregates indexed invalid targets before storage on %s", async (surface) => {
  const f = await fixture();
  const before = f.repository.getOperationSnapshot(f.project.id);
  const result = await f.call(surface, { storyMapId: f.map.id, cards: [targets()[0], { ...targets()[0], system: "other" }, { ...targets()[1], externalId: "story-1" }, { ...targets()[2], status: "Foreign" }] });
  expect(result).toMatchObject({ code: "validation", details: { invalidTargets: [{ index: 1 }, { index: 2 }, { index: 3 }] } });
  for (const input of [{ cards: [] }, { cards: Array(101).fill(targets()[0]) }, { cards: [{ ...targets()[0], system: "github" }] }, { cards: [{ ...targets()[0], externalId: " " }] }, { cards: targets(), actorId: "forged" }, { storyMapId: f.otherMap.id, cards: targets() }]) {
    expect(await f.call(surface, { storyMapId: f.map.id, ...input })).toMatchObject({ code: expect.any(String) });
  }
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(f.repository.listChangeSets()).toHaveLength(0);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it.each(["http", "sdk"])("reports every stale target and preserves atomic domain state on %s", async (surface) => {
  const f = await fixture();
  for (const card of f.cards.slice(0, 2)) f.unitOfWork.run(human, ({ repository }) => repository.updateCard(card.id, { title: "Human edit" }));
  const before = f.repository.getOperationSnapshot(f.project.id);
  const history = f.cards.map((card) => f.repository.listCardHistory(card.id));
  const result = await f.call(surface, { storyMapId: f.map.id, cards: targets() });
  expect(result).toMatchObject({ code: "conflict", conflicts: [{ entity: "card", id: f.cards[0]!.id, index: 0 }, { entity: "card", id: f.cards[1]!.id, index: 1 }] });
  expect(result.conflicts).toHaveLength(2);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(f.cards.map((card) => f.repository.listCardHistory(card.id))).toEqual(history);
  expect(f.repository.listActivity().filter((event) => event.action === "changeSet.operation.applied")).toHaveLength(0);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it.each(["http", "sdk"])("stores only proposals under protection or apply=false and rejects revoked Agent access on %s", async (surface) => {
  const f = await fixture();
  const before = f.repository.getOperationSnapshot(f.project.id);
  for (const protection of [true, false]) {
    f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: protection ? "propose" : "apply" }));
    const result = changeSetCommandResponseSchema.parse(await f.call(surface, { storyMapId: f.map.id, cards: targets(), ...(protection ? {} : { apply: false }) }));
    expect(result).toMatchObject({ outcome: "proposed", previewRef: { changeSetId: result.changeSetId } });
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
    expect(readdirSync(f.directory)).not.toContain("snapshots");
  }
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "off" }));
  expect(await f.call(surface, { storyMapId: f.map.id, cards: targets() })).toMatchObject({ code: "disabled" });
  expect(f.repository.listChangeSets(f.project.id)).toHaveLength(2);
});

it.each(["status", "owner", "rebound", "baseline"])("revalidates delayed delivery %s and refuses all domain changes", async (changed) => {
  const f = await fixture();
  const proposal = changeSetCommandResponseSchema.parse(await f.call("http", { storyMapId: f.map.id, cards: targets(), apply: false }));
  approveChangeSet(f, human, proposal.changeSetId);
  f.unitOfWork.run(human, ({ repository }) => {
    if (changed === "status") repository.updateWorkflowStatus(f.review.id, { name: "Renamed", definitionBefore: f.review, affectedCards: [] });
    if (changed === "owner") repository.deleteExternalRefsForEntity("card", f.cards[0]!.id);
    if (changed === "rebound") {
      repository.deleteExternalRefsForEntity("card", f.cards[0]!.id);
      const replacement = repository.createCard({ storyMapId: f.map.id, title: "Replacement", level: "activity" });
      repository.setExternalRef({ entityType: "card", entityId: replacement.id, system: "bmad", externalId: "Story-0" });
    }
    if (changed === "baseline") repository.updateCard(f.cards[0]!.id, { title: "New human edit" });
  });
  const before = f.repository.getOperationSnapshot(f.project.id);
  expect(() => applyChangeSet(f, human, proposal.changeSetId)).toThrow();
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(f.repository.listActivity().filter((event) => event.action === "changeSet.operation.applied")).toHaveLength(0);
  expect(readdirSync(f.directory)).not.toContain("snapshots");
});

it.each(["http", "sdk"])("accepts trimmed identities but refuses the other system's stale baseline on %s", async (surface) => {
  const f = await fixture();
  const first = changeSetCommandResponseSchema.parse(await f.call(surface, { storyMapId: f.map.id, cards: [{ system: " bmad ", externalId: " Story-0 ", status: "Review" }] }));
  expect(first.outcome).toBe("applied");
  const before = f.repository.getOperationSnapshot(f.project.id);
  const result = await f.call(surface, { storyMapId: f.map.id, cards: [{ system: "other", externalId: "Story-0", status: "Verified" }] });
  expect(result).toMatchObject({ code: "conflict", conflicts: [{ entity: "card", id: f.cards[0]!.id, baseVersion: f.cards[0]!.version, currentVersion: f.cards[0]!.version + 1 }] });
  expect(result.conflicts).toHaveLength(1);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
  expect(f.repository.listActivity().filter((event) => event.action === "changeSet.operation.applied")).toHaveLength(1);
});

it.each(["http", "sdk"])("assigns method statuses created and adapted through generic Agent tools on %s", async (surface) => {
  const f = await fixture();
  const created = changeSetCommandResponseSchema.parse(await f.call(surface, { projectId: f.project.id, storyMapId: f.map.id, name: "Implementation", group: "active" }, "CreateWorkflowStatus"));
  expect(created.outcome).toBe("proposed");
  approveChangeSet(f, human, created.changeSetId);
  applyChangeSet(f, human, created.changeSetId);
  const status = f.repository.listWorkflowStatuses(f.project.id, f.map.id).find((status) => status.name === "Implementation")!;
  const adapted = changeSetCommandResponseSchema.parse(await f.call(surface, { statusId: status.id, patch: { name: "Ready for QA", definitionBefore: status, affectedCards: [] } }, "UpdateWorkflowStatus"));
  expect(adapted.outcome).toBe("proposed");
  approveChangeSet(f, human, adapted.changeSetId);
  applyChangeSet(f, human, adapted.changeSetId);
  const delivery = changeSetCommandResponseSchema.parse(await f.call(surface, { storyMapId: f.map.id, cards: [{ ...targets()[0], status: "Ready for QA" }] }));
  expect(delivery.outcome).toBe("applied");
  expect(f.repository.getCard(f.cards[0]!.id)?.status).toBe("Ready for QA");
  expect(f.repository.getStoryMapSnapshot(f.map.id)?.workflowStatuses).toContainEqual(expect.objectContaining({ id: status.id, name: "Ready for QA", group: "active" }));
});

it.each(["http", "sdk"])("preserves real Story hierarchy, Release assignment and parked subtrees on %s", async (surface) => {
  const f = await fixture();
  const rows = f.unitOfWork.run(human, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: f.map.id, name: "Delivery Release" });
    const stories = [f.cards[0]!, f.cards[2]!].map((activity, index) => {
      const step = repository.createCard({ storyMapId: f.map.id, level: "step", parentId: activity.id, title: `Step ${index}` });
      const story = repository.createCard({ storyMapId: f.map.id, level: "story", parentId: step.id, releaseId: release.id, title: `Delivery Story ${index}`, description: "Retained details" });
      repository.setExternalRef({ entityType: "card", entityId: story.id, system: "bmad", externalId: `Nested-${index}` });
      return story;
    });
    return { release, stories };
  });
  const before = f.repository.listCards(f.map.id);
  const result = changeSetCommandResponseSchema.parse(await f.call(surface, { storyMapId: f.map.id, cards: rows.stories.map((_, index) => ({ system: "bmad", externalId: `Nested-${index}`, status: "Verified" })) }));
  expect(result.outcome).toBe("applied");
  for (const card of before) expect(f.repository.getCard(card.id)).toEqual(rows.stories.some((story) => story.id === card.id)
    ? { ...card, status: "Verified", version: card.version + 1, updatedAt: expect.any(String) } : card);
  expect(f.repository.getCard(f.cards[2]!.id)?.parked).toBe(true);
  expect(f.repository.getRelease(rows.release.id)).toEqual(rows.release);
  for (const story of rows.stories) expect(f.repository.getCard(story.id)).toMatchObject({ parentId: story.parentId, releaseId: rows.release.id, parked: false, level: "story" });
});

it.each(["http", "sdk"])("refuses exact and trim-induced duplicate targets with indexed details before storage on %s", async (surface) => {
  const f = await fixture();
  const before = f.repository.getOperationSnapshot(f.project.id);
  for (const duplicate of [targets()[0]!, { ...targets()[0]!, system: " bmad ", externalId: " Story-0 " }]) {
    const response = await f.call(surface, { storyMapId: f.map.id, cards: [targets()[0], duplicate] });
    expect(response).toMatchObject({ code: "validation", details: { invalidTargets: [{ index: 1, system: "bmad", externalId: "Story-0", reasons: ["Card is addressed more than once."] }] } });
    expect(f.repository.listChangeSets(f.project.id)).toEqual([]);
    expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
    expect(readdirSync(f.directory)).not.toContain("snapshots");
  }
});
