import { eq } from "drizzle-orm";
import { externalRefs } from "@storymapper/db/schema";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { ChangeOperation, OperationSnapshot } from "@storymapper/contracts";
import { resolveOperations } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork, publishRestorePoint } from "@storymapper/db";

const ACTOR = { actorType: "human", actorId: "executor-human" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach((close) => close()));
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "executor-persistence-"));
  const database = openStoryMapperDb(join(directory, "storymapper.sqlite"));
  const handle = new DatabaseHandle(database);
  const uow = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  cleanup.push(() => { if (database.$client.open) database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const project = uow.run(ACTOR, ({ repository }) => repository.createProject({ name: "Executor persistence" }));
  const map = uow.run(ACTOR, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "Map" }));
  return { database, handle, repository, uow, project, map };
}
function comparable(snapshot: OperationSnapshot) {
  const { mapFingerprints: _fingerprints, ...rest } = snapshot;
  const state = { ...rest, cards: rest.cards.filter((card) => rest.storyMaps.some((map) => map.id === card.storyMapId)).map((card) => ({ ...card, assignee: card.assignee ?? null, businessValue: card.businessValue ?? null, color: card.color ?? null, effort: card.effort ?? null, estimate: card.estimate ?? null, priority: card.priority ?? null })) };
  const normalized = { ...state, attachments: state.attachments.map((row) => ({ ...row, mimeType: row.mimeType ?? null })), workflowStatuses: state.workflowStatuses.map((row) => ({ ...row, color: row.color ?? null })) };
  for (const link of state.githubLinks) if (link.cardId && link.issueNumber && !state.sourceLinks.some((source) => source.kind === "github" && source.cardId === link.cardId && source.externalRefId === link.id)) state.sourceLinks.push({ kind: "github", id: link.id, cardId: link.cardId, externalRefId: link.id, repoFullName: link.repo, issueNumber: link.issueNumber, url: link.url });
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, Array.isArray(value) ? [...value].sort((a, b) => a.id.localeCompare(b.id)) : value]))));
}
function execute(f: ReturnType<typeof fixture>, operations: ChangeOperation[]) {
  const before = f.repository.getOperationSnapshot(f.project.id);
  const supply = f.repository.prepareOperationSupply(operations, before);
  const resolution = resolveOperations(before, operations, supply);
  const proposal = f.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Registry parity", source: "human", createdAt: new Date().toISOString(), operations }));
  const immutableInput = JSON.stringify(proposal.operations);
  f.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
  const applied = f.uow.runPrepared(ACTOR, (database) => ({ supply, restorePoint: publishRestorePoint(database, "pre-apply").fileName }), ({ repository }, prepared) => repository.applyChangeSet(proposal.id, prepared))!;
  expect(JSON.stringify(applied.operations)).toBe(immutableInput);
  expect(applied.status).toBe("applied");
  expect(applied.execution?.operationResults).toHaveLength(operations.length);
  const canonicalCards = (f.handle.current.$client.prepare("SELECT snapshot_json FROM card_versions").all() as Array<{ snapshot_json: string }>).map((row) => JSON.parse(row.snapshot_json) as OperationSnapshot["cards"][number]);
  for (const operation of resolution.operations) for (const change of operation.changes) if (change.entity === "card") {
    for (const card of [change.before, change.after]) if (card?.key.startsWith("NEW-")) card.key = canonicalCards.find((row) => row.id === card.id)!.key;
  }
  for (const card of resolution.state.cards) if (card.key.startsWith("NEW-")) card.key = canonicalCards.find((row) => row.id === card.id)!.key;
  for (const baseline of resolution.state.sourcePlanBaselines ?? []) for (const entry of baseline.entries) {
    if (!entry.card?.key.startsWith("NEW-")) continue;
    entry.card.key = canonicalCards.find((row) => row.id === entry.cardId)!.key;
    entry.identity.key = entry.card.key;
  }
  expect(comparable(f.repository.getOperationSnapshot(f.project.id))).toEqual(comparable(resolution.state));
  return resolution;
}
it("persists complete local roots, relationship arrays, Roadmap seeds and physical evidence encodings", () => {
  const f = fixture();
  const result = execute(f, [
    { operationId: "create-release", entity: "release", op: "create", entityId: "release", after: { storyMapId: f.map.id, name: "First" } },
    { operationId: "create-persona", entity: "persona", op: "create", entityId: "persona", after: { projectId: f.project.id, name: "User", goals: ["Finish"], pains: ["Wait"] } },
    { operationId: "create-annotation", entity: "annotation", op: "create", entityId: "annotation", after: { projectId: f.project.id, name: "Tag" } },
    { operationId: "create-card", entity: "card", op: "create", entityId: "card", after: { storyMapId: f.map.id, title: "Activity", level: "activity", releaseId: "release" } },
    { operationId: "persona-link", entityId: "local-persona-link", entity: "cardPersona", op: "set", after: { cardId: "card", personaId: "persona" } },
    { operationId: "annotation-link", entityId: "local-annotation-link", entity: "cardAnnotation", op: "set", after: { cardId: "card", annotationId: "annotation" } },
    { operationId: "note", entityId: "local-note", entity: "sourceLink", op: "link", after: { cardId: "card", kind: "note", note: "Supplied requirement" } },
    { operationId: "product", entityId: "local-product", entity: "productContext", op: "set", after: { projectId: f.project.id, storyMapId: f.map.id, keyFeatures: ["Planner"] } },
    { operationId: "roadmap", entity: "roadmap", op: "create", entityId: "local-roadmap", after: { projectId: f.project.id, name: "Goals" } },
    { operationId: "column", entity: "roadmapColumn", op: "create", entityId: "local-column", after: { roadmapId: "local-roadmap", name: "Review" } },
    { operationId: "swimlane", entity: "roadmapSwimlane", op: "create", entityId: "local-swimlane", after: { roadmapId: "local-roadmap", name: "Team" } },
    { operationId: "goal", entity: "roadmapCard", op: "create", entityId: "local-goal", after: { roadmapId: "local-roadmap", columnId: "local-column", swimlaneId: "local-swimlane", title: "Deliver", labels: ["Reviewed"] } },
    { operationId: "reference", entity: "roadmapReference", op: "create", after: { roadmapCardId: "local-goal", targetType: "card", targetId: "card" } },
    { operationId: "template", entity: "storyTemplate", op: "create", after: { projectId: f.project.id, name: "Story", descriptionTemplate: "Supplied template" } },
    { operationId: "status", entity: "workflowStatus", op: "create", after: { projectId: f.project.id, name: "review", group: "active" } },
    { operationId: "attachment", entity: "attachment", op: "create", after: { cardId: "card", label: "Source", filePath: "reviewed.txt" } }
  ]);
  const card = result.state.cards[0]!;
  expect(f.repository.listCardHistory(card.id)).toHaveLength(1);
  expect(f.repository.listActivity(f.project.id).filter((event) => event.action === "changeSet.operation.applied")).toHaveLength(16);
});
it("keeps Card keys monotonic after deletion and reopening", () => {
  const f = fixture();
  const created = execute(f, [{ operationId: "first", entity: "card", op: "create", after: { storyMapId: f.map.id, title: "First", level: "activity" } }]).state.cards[0]!;
  execute(f, [{ operationId: "delete", entity: "card", op: "delete", entityId: created.id, after: { strategy: "unassign" } }]);
  const databasePath = f.database.$client.name;
  f.database.$client.close();
  f.handle.current = openStoryMapperDb(databasePath);
  cleanup.push(() => f.handle.current.$client.close());
  const next = execute(f, [{ operationId: "second", entity: "card", op: "create", after: { storyMapId: f.map.id, title: "Second", level: "activity" } }]).state.cards[0]!;
  expect(next.key).toBe("LSM-2");
});
it("preserves approved copy operations and all owned copied identities", () => {
  const f = fixture();
  f.uow.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: f.map.id, title: "Source", level: "activity" }, "human"));
  const proposal = f.uow.run(ACTOR, ({ repository }) => repository.proposeStoryMapCopy({ sourceStoryMapId: f.map.id, targetName: "Copy" }));
  const input = JSON.stringify(proposal.operations);
  execute(f, proposal.operations);
  expect(JSON.stringify(proposal.operations)).toBe(input);
});
it("persists 200 selected operations on 1,000 Cards with snapshot, history and audit", () => {
  const f = fixture();
  const cards = f.uow.run(ACTOR, ({ repository }) => Array.from({ length: 1000 }, (_, index) => repository.createCard({ storyMapId: f.map.id, title: `Card ${index}`, level: "activity" }, "human")));
  const proposal = f.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Budget", source: "human", createdAt: new Date().toISOString(), operations: cards.slice(0, 200).map((card, index) => ({ operationId: `save-${index}`, entity: "card", op: "update", entityId: card.id, baseVersion: card.version, after: { title: `Updated ${index}` } })) }));
  f.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
  const result = f.uow.runPrepared(ACTOR, (database) => ({ restorePoint: publishRestorePoint(database, "pre-apply").fileName }), ({ repository }, prepared) => {
    const result = repository.applyChangeSet(proposal.id, prepared)!;
    repository.logActivity(f.project.id, "tool_call", "tool", "ApplyChangeSet", undefined, { outcome: "success" });
    return result;
  });
  expect(result.execution?.operationResults).toHaveLength(200);
  expect(f.repository.listActivity(f.project.id).filter((event) => event.action === "tool_call")).toHaveLength(1);
}, 15000);
it("persists updates, park/unpark, addressed upserts and deletion history without resetting other external baselines", () => {
  const f = fixture();
  const first = execute(f, [{ operationId: "upsert", entity: "card", op: "upsert", entityId: "local-card", selector: { kind: "externalRef", scopeId: f.map.id, system: "bmad", externalId: "story" }, after: { storyMapId: f.map.id, level: "activity", title: "Published" } }]);
  const card = first.state.cards[0]!;
  const refs = execute(f, [{ operationId: "second-ref", entity: "externalRef", op: "set", entityId: "local-ref", after: { entityType: "card", entityId: card.id, system: "other", externalId: "story", scopeId: f.map.id } }]);
  const ref = refs.state.externalRefs.find((ref) => ref.system === "bmad")!;
  const other = refs.state.externalRefs.find((ref) => ref.system === "other")!;
  f.uow.run(ACTOR, ({ repository }) => repository.db.update(externalRefs).set({ syncedVersion: repository.getCard(card.id)!.version }).where(eq(externalRefs.id, ref.id)).run());
  const publish: ChangeOperation = { operationId: "republish", entity: "card", op: "upsert", selector: { kind: "externalRef", scopeId: f.map.id, system: "bmad", externalId: "story" }, after: { storyMapId: f.map.id, level: "activity", title: "Updated" } };
  const published = execute(f, [publish]);
  expect(published.state.externalRefs.find((row) => row.system === "other")?.syncedVersion).toBe(other.syncedVersion);
  expect(published.state.externalRefs.find((row) => row.system === "bmad")?.syncedVersion).toBe(published.state.cards[0]!.version);
  const version = published.state.cards[0]!.version;
  execute(f, [publish]);
  expect(f.repository.getCard(card.id)?.version).toBe(version);
  execute(f, [
    { operationId: "park", entity: "card", op: "park", entityId: card.id, after: { childStrategy: "unassign" } },
    { operationId: "unpark", entity: "card", op: "unpark", entityId: card.id, after: {} },
    { operationId: "archive", entity: "card", op: "archive", entityId: card.id, after: {} },
    { operationId: "unarchive", entity: "card", op: "unarchive", entityId: card.id, after: { status: "todo" } }
  ]);
  execute(f, [{ operationId: "remove", entity: "card", op: "delete", entityId: card.id, after: { strategy: "unassign" } }]);
  expect(f.repository.listCardHistory(card.id).at(-1)?.snapshot.title).toBe("Updated");
});
it("persists prepared board connector and GitHub/remote identity graphs atomically", () => {
  const f = fixture();
  const proposal = f.uow.run(ACTOR, ({ repository }) => repository.proposeGitHubBoard({ projectId: f.project.id, storyMapName: "Imported", cleanup: false, removeCardIds: [], boardUrl: "https://github.com/orgs/example/projects/1", issues: [{ repository: "example/repo", number: 1, title: "Issue", body: "Reviewed issue body", url: "https://github.com/example/repo/issues/1", state: "open", labels: [], assignee: null, milestone: null, parentRepository: null, parentNumber: null, issueType: null }] }));
  const result = execute(f, proposal.operations);
  expect(result.state.connections).toHaveLength(1);
  expect(result.state.remoteWorkItemLinks).toHaveLength(1);
  expect(result.state.githubLinks).toHaveLength(1);
  expect(result.state.sourceLinks.filter((link) => link.kind === "github")).toHaveLength(1);
});
it("compares repeated publications to transaction-start roots and keeps one final history row", () => {
  const f = fixture();
  const selector = { kind: "externalRef", scopeId: f.map.id, system: "bmad", externalId: "repeat" } as const;
  const initial = execute(f, [{ operationId: "initial", entity: "card", op: "upsert", selector, after: { storyMapId: f.map.id, level: "activity", title: "Initial" } }]);
  const card = initial.state.cards[0]!;
  const result = execute(f, [
    { operationId: "first-publication", entity: "card", op: "upsert", selector, baseVersion: card.version, after: { storyMapId: f.map.id, level: "activity", title: "First" } },
    { operationId: "last-publication", entity: "card", op: "upsert", selector, baseVersion: card.version, after: { storyMapId: f.map.id, level: "activity", title: "Last" } }
  ]);
  expect(result.state.cards[0]).toMatchObject({ title: "Last", version: card.version + 1 });
  expect(result.state.externalRefs[0]?.syncedVersion).toBe(card.version + 1);
  expect(f.repository.listCardHistory(card.id).at(-1)?.snapshot.title).toBe("Last");
});

it("clears assigned Card and Release canonical identity while retaining the Card identity on Release deletion", () => {
  const f = fixture();
  const seeded = execute(f, [
    { operationId: "seed-release", entity: "release", op: "create", entityId: "release", after: { storyMapId: f.map.id, name: "Release" } },
    { operationId: "seed-card", entity: "card", op: "create", entityId: "card", after: { storyMapId: f.map.id, title: "Assigned", level: "activity", releaseId: "release" } },
    { operationId: "github", entity: "githubExternalRef", op: "create", after: { entityType: "release", entityId: "release", scopeId: f.map.id, externalId: "https://github.com/example/repo/issues/1" } },
    { operationId: "surviving-github", entity: "githubExternalRef", op: "create", after: { entityType: "card", entityId: "card", scopeId: f.map.id, externalId: "https://github.com/example/repo/issues/2" } }
  ]);
  const release = seeded.state.releases[0]!;
  const removed = execute(f, [{ operationId: "delete-release", entity: "release", op: "delete", entityId: release.id, after: {} }]);
  expect(removed.state.cards[0]?.releaseId).toBeNull();
  expect(removed.state.githubLinks).toHaveLength(1);
  expect(removed.state.githubLinks[0]?.issueNumber).toBe(2);
});

it("reserves copied keys before allocating additional Cards in the copied Map", () => {
  const f = fixture();
  f.uow.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: f.map.id, title: "Source", level: "activity" }, "human"));
  const proposal = f.uow.run(ACTOR, ({ repository }) => repository.proposeStoryMapCopy({ sourceStoryMapId: f.map.id, targetName: "Copy" }));
  const copy = proposal.operations[0]!;
  const result = execute(f, [...proposal.operations, { operationId: "extra", entity: "card", op: "create", after: { storyMapId: copy.entityId!, title: "Extra", level: "activity" } }]);
  const copiedMap = result.state.storyMaps.find((map) => map.name === "Copy")!;
  expect(result.state.cards.filter((card) => card.storyMapId === copiedMap.id).map((card) => card.key)).toEqual(["LSM-1", "LSM-2"]);
});

it.each(["update", "delete", "map-delete"] as const)("canonicalizes every snapshot for create followed by %s", (following) => {
  const f = fixture();
  const next: ChangeOperation = following === "update"
    ? { operationId: "next", entity: "card", op: "update", entityId: "new-card", after: { title: "Updated" } }
    : following === "delete" ? { operationId: "next", entity: "card", op: "delete", entityId: "new-card", after: { strategy: "unassign" } }
      : { operationId: "next", entity: "storyMap", op: "delete", entityId: f.map.id, after: {} };
  const result = execute(f, [{ operationId: "create", entity: "card", op: "create", entityId: "new-card", after: { storyMapId: f.map.id, title: "Created", level: "activity" } }, next]);
  const snapshots = result.operations.flatMap((operation) => operation.changes.flatMap((change) => change.entity === "card" ? [change.before, change.after].filter(Boolean) : []));
  expect(snapshots.map((card) => card!.key)).toEqual(snapshots.map(() => "LSM-1"));
  const history = f.handle.current.$client.prepare("SELECT snapshot_json FROM card_versions").all() as Array<{ snapshot_json: string }>;
  expect(history.length).toBeGreaterThan(0);
  expect(history.every((row) => JSON.parse(row.snapshot_json).key === "LSM-1")).toBe(true);
  const events = f.repository.listActivity(f.project.id).filter((event) => event.action === "changeSet.operation.applied");
  expect(events).toHaveLength(2);
  expect(JSON.stringify(events)).not.toContain("NEW-");
  expect(f.database.$client.prepare("SELECT next_card_number FROM story_maps WHERE id = ?").get(f.map.id)).toEqual({ next_card_number: 2 });
});

it("preserves resolver pre-delete Card metadata in operation Activity while finalizing deleted history", () => {
  const f = fixture();
  const initial = execute(f, [
    { operationId: "new-card", op: "create", entity: "card", entityId: "reviewed-card", after: { storyMapId: f.map.id, level: "activity", title: "Deletion evidence" } },
    { operationId: "link-note", op: "link", entity: "sourceLink", entityId: "reviewed-note", after: { cardId: "reviewed-card", kind: "note", note: "Reviewed provenance" } }
  ]).state.cards[0]!;
  const resolution = execute(f, [{ operationId: "remove-card", op: "delete", entity: "card", entityId: initial.id, after: { strategy: "unassign" } }]);
  const expected = resolution.operations[0]!.changes.find((change) => change.entity === "card")!.before!;
  const event = f.repository.listActivity(f.project.id).find((event) => event.action === "changeSet.operation.applied" && event.affectedEntityId === "remove-card")!;
  const cardChange = (event.after as { changes: Array<{ entity: string; before: { version: number; provenance: string } }> }).changes.find((change) => change.entity === "card")!;
  expect(cardChange.before).toMatchObject({ version: expected.version, provenance: expected.provenance });
  expect(cardChange.before).toMatchObject({ version: initial.version, provenance: "linked" });
});

it("publishes concrete Project-scoped customization identities only after commit without extra Activity", () => {
  const f = fixture();
  const events: Array<import("@storymapper/contracts").LiveTransaction> = [];
  f.uow.subscribe((event) => {
    expect(f.database.$client.inTransaction).toBe(false);
    events.push(event);
  });
  const result = execute(f, [
    { operationId: "workflow-create", op: "create", entity: "workflowStatus", after: { projectId: f.project.id, name: "Review", group: "active" } },
    { operationId: "template-create", op: "create", entity: "storyTemplate", after: { projectId: f.project.id, name: "Reviewed template" } }
  ]);
  const application = events.at(-1)!;
  expect(application.entities).toEqual(expect.arrayContaining([
    { entityType: "workflowStatus", entityId: result.state.workflowStatuses.find((row) => row.name === "Review")!.id, projectId: f.project.id, version: null },
    { entityType: "storyTemplate", entityId: result.state.storyTemplates[0]!.id, projectId: f.project.id, version: null }
  ]));
  expect(f.repository.listActivity(f.project.id).filter((event) => event.action === "changeSet.operation.applied")).toHaveLength(2);
  expect(f.repository.listActivity(f.project.id).filter((event) => event.action === "workflowStatus.created" || event.action === "storyTemplate.created")).toEqual([]);
});

it.each(["created", "updated"] as const)("rolls back direct %s root mutation composed with application", (mode) => {
  const f = fixture();
  const card = f.uow.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Existing" }));
  const localId = randomUUID();
  const targetId = mode === "created" ? localId : card.id;
  const proposal = f.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Mixed composition", source: "human", createdAt: new Date().toISOString(), operations: [
    { operationId: "application-update", op: "update", entity: "card", entityId: targetId, after: { title: "Executor update" } }
  ] }));
  f.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
  const before = { snapshot: f.repository.getOperationSnapshot(f.project.id), history: f.repository.listCardHistory(card.id), events: f.repository.listActivity(f.project.id), proposal: f.repository.getChangeSet(proposal.id) };
  const published: unknown[] = [];
  f.uow.subscribe((event) => published.push(event));
  expect(() => f.uow.run(ACTOR, ({ repository }) => {
    if (mode === "created") {
      const created = repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Direct new root" });
      const composed = repository.createChangeSet({ ...proposal, id: randomUUID(), operations: [{ operationId: "created-root-update", op: "update", entity: "card", entityId: created.id, after: { title: "Executor update" } }] });
      repository.updateChangeSetStatus(composed.id, "approved");
      repository.applyChangeSet(composed.id);
    } else {
      repository.updateCard(card.id, { title: "Direct update" });
      repository.applyChangeSet(proposal.id);
    }
  })).toThrow("already mutated in this UnitOfWork");
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before.snapshot);
  expect(f.repository.listCardHistory(card.id)).toEqual(before.history);
  expect(f.repository.listActivity(f.project.id)).toEqual(before.events);
  expect(f.repository.getChangeSet(proposal.id)).toEqual(before.proposal);
  expect(published).toEqual([]);
});

it("allows an independently mutated root alongside a fresh executor root", () => {
  const f = fixture();
  const cards = f.uow.run(ACTOR, ({ repository }) => ["Direct", "Executor"].map((title) => repository.createCard({ storyMapId: f.map.id, level: "activity", title })));
  const proposal = f.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Independent roots", source: "human", createdAt: new Date().toISOString(), operations: [
    { operationId: "independent-update", op: "update", entity: "card", entityId: cards[1]!.id, after: { title: "Executor saved" } }
  ] }));
  f.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
  f.uow.run(ACTOR, ({ repository }) => {
    repository.updateCard(cards[0]!.id, { title: "Direct saved" });
    repository.applyChangeSet(proposal.id);
  });
  expect(f.repository.getCard(cards[0]!.id)).toMatchObject({ title: "Direct saved", version: cards[0]!.version + 1 });
  expect(f.repository.getCard(cards[1]!.id)).toMatchObject({ title: "Executor saved", version: cards[1]!.version + 1 });
});

it("persists status-only external delivery with same-value save semantics and isolated addressed baselines", () => {
  const f = fixture();
  const card = f.uow.run(ACTOR, ({ repository }) => {
    const card = repository.createCard({ storyMapId: f.map.id, title: "Parked", level: "activity" });
    repository.parkCard(card.id, { childStrategy: "unassign" });
    repository.createWorkflowStatus({ projectId: f.project.id, name: "Review", group: "active" });
    for (const system of ["bmad", "other"]) repository.setExternalRef({ entityType: "card", entityId: card.id, system, externalId: "Story-A" });
    return repository.getCard(card.id)!;
  });
  const delivery = (version: number): ChangeOperation => ({ operationId: "delivery", entity: "card", entityId: card.id, op: "update", selector: { kind: "externalRef", scopeId: f.map.id, system: "bmad", externalId: "Story-A" }, baseVersion: version, after: { status: "Review" } });
  execute(f, [delivery(card.version)]);
  execute(f, [delivery(card.version + 1)]);
  expect(f.repository.getCard(card.id)).toMatchObject({ title: "Parked", parked: true, status: "Review", version: card.version + 2, parentId: card.parentId, releaseId: card.releaseId });
  expect(f.repository.listExternalRefsForStoryMap(f.map.id).map((ref) => [ref.system, ref.syncedVersion]).sort()).toEqual([["bmad", card.version + 2], ["other", card.version]]);
  expect(f.repository.listCardHistoryPage(card.id, { limit: 10 }).versions).toMatchObject([{ version: card.version + 2, snapshot: { status: "Review", parked: true } }]);
  expect(f.repository.listActivity(f.project.id).filter((event) => event.action === "changeSet.operation.applied")).toHaveLength(2);
});

it("persists source-only publication baselines through per-operation changes and repeats without version bumps", () => {
  const f = fixture();
  const root = f.uow.run(ACTOR, ({ repository }) => {
    const card = repository.createCard({ storyMapId: f.map.id, level: "story", title: "Existing publication" });
    repository.setExternalRef({ entityType: "card", entityId: card.id, system: "publisher", externalId: "stable" });
    repository.setExternalRef({ entityType: "card", entityId: card.id, system: "other", externalId: "stable" });
    return card;
  });
  const operations: ChangeOperation[] = [
    { operationId: "publish", op: "upsert", entity: "card", selector: { kind: "externalRef", scopeId: f.map.id, system: "publisher", externalId: "stable" }, after: { storyMapId: f.map.id, level: "story", title: root.title } },
    { operationId: "evidence", entityId: "evidence-local", op: "link", entity: "sourceLink", after: { cardId: root.id, kind: "note", note: "Recorded unchanged scalar publication evidence" } }
  ];
  const resolved = execute(f, operations);
  expect(resolved.operations[0]!.status).toBe("unchanged");
  expect(f.repository.getCard(root.id)?.version).toBe(2);
  expect(f.repository.listExternalRefsForStoryMap(f.map.id).map((ref) => [ref.system, ref.syncedVersion]).sort()).toEqual([["other", 1], ["publisher", 2]]);
  expect(execute(f, operations).operations.every((operation) => operation.status === "unchanged")).toBe(true);
  expect(f.repository.getCard(root.id)?.version).toBe(2);
});

it("persists scoped external archives and stable-ID returns without advancing another system", () => {
  const f = fixture();
  const root = f.uow.run(ACTOR, ({ repository }) => {
    const card = repository.createCard({ storyMapId: f.map.id, level: "story", title: "Returning stable story" });
    for (const system of ["publisher", "other"]) repository.setExternalRef({ entityType: "card", entityId: card.id, system, externalId: "stable" });
    return card;
  });
  const selector = { kind: "externalRef" as const, scopeId: f.map.id, system: "publisher", externalId: "stable" };
  execute(f, [{ operationId: "archive", entityId: root.id, op: "archive", entity: "card", selector, baseVersion: root.version, after: {} }]);
  expect(f.repository.listExternalRefsForStoryMap(f.map.id).map((ref) => [ref.system, ref.syncedVersion]).sort()).toEqual([["other", 1], ["publisher", 2]]);
  const restore: ChangeOperation = { operationId: "restore", op: "upsert", entity: "card", selector, after: { storyMapId: f.map.id, level: "story", title: root.title } };
  execute(f, [restore]);
  expect(f.repository.getCard(root.id)).toMatchObject({ status: "todo", version: 3 });
  expect(f.repository.listExternalRefsForStoryMap(f.map.id).map((ref) => [ref.system, ref.syncedVersion]).sort()).toEqual([["other", 1], ["publisher", 3]]);
  f.uow.run(ACTOR, ({ repository }) => repository.updateCard(root.id, { title: "Human edit" }));
  const before = f.repository.getOperationSnapshot(f.project.id);
  expect(() => execute(f, [restore])).toThrow(/human changes/);
  expect(f.repository.getOperationSnapshot(f.project.id)).toEqual(before);
});

it("preserves mixed FK inserts, owner updates, reverse deletions and deleted Card history", () => {
  const f = fixture();
  const seeded = execute(f, [
    { operationId: "create-release", op: "create", entity: "release", entityId: "release", after: { storyMapId: f.map.id, name: "Release" } },
    { operationId: "create-persona", op: "create", entity: "persona", entityId: "persona", after: { projectId: f.project.id, name: "User" } },
    { operationId: "create-annotation", op: "create", entity: "annotation", entityId: "annotation", after: { projectId: f.project.id, name: "Risk" } },
    { operationId: "roadmap", op: "create", entity: "roadmap", after: { projectId: f.project.id, storyMapId: f.map.id, name: "Roadmap" } },
    { operationId: "create-parent", op: "create", entity: "card", entityId: "parent", after: { storyMapId: f.map.id, title: "Parent", level: "activity", releaseId: "release" } },
    { operationId: "create-neighbor", op: "create", entity: "card", entityId: "neighbor", after: { storyMapId: f.map.id, title: "Neighbor", level: "activity", releaseId: "release" } },
    { operationId: "create-step", op: "create", entity: "card", entityId: "step", after: { storyMapId: f.map.id, title: "Step", level: "step", parentId: "parent", releaseId: "release" } },
    { operationId: "create-story", op: "create", entity: "card", entityId: "story", after: { storyMapId: f.map.id, title: "Story", level: "story", parentId: "step", releaseId: "release" } },
    { operationId: "persona-set", entityId: "local-persona-link", op: "set", entity: "cardPersona", after: { cardId: "parent", personaId: "persona" } },
    { operationId: "annotation-set", entityId: "local-annotation-link", op: "set", entity: "cardAnnotation", after: { cardId: "parent", annotationId: "annotation" } },
    { operationId: "create-note", op: "link", entity: "sourceLink", entityId: "note", after: { cardId: "parent", kind: "note", note: "Supplied requirement" } },
    { operationId: "attachment", op: "create", entity: "attachment", after: { cardId: "parent", label: "Source", filePath: "reviewed.txt" } },
    { operationId: "github", op: "create", entity: "githubExternalRef", after: { entityType: "card", entityId: "parent", scopeId: f.map.id, externalId: "https://github.com/example/repo/issues/1" } },
    { operationId: "dependency", op: "set", entity: "cardDependency", baseVersion: 1, after: { cardId: { kind: "local", localId: "story" }, prerequisiteCardId: { kind: "local", localId: "parent" } } }
  ]).state;
  const parent = seeded.cards.find((card) => card.title === "Parent")!;
  const story = seeded.cards.find((card) => card.title === "Story")!;
  const neighbor = seeded.cards.find((card) => card.title === "Neighbor")!;
  execute(f, [{ operationId: "shared-evidence", op: "link", entity: "sourceLink", entityId: "shared", after: { cardId: story.id, kind: "github", externalRefId: seeded.githubLinks[0]!.id } }]);
  const removed = execute(f, [
    { operationId: "detach", op: "update", entity: "card", entityId: story.id, after: { releaseId: null } },
    { operationId: "remove-parent", op: "delete", entity: "card", entityId: parent.id, after: { strategy: "reassign-right" } },
    { operationId: "remove-release", op: "delete", entity: "release", entityId: seeded.releases[0]!.id, after: {} },
    { operationId: "remove-persona", op: "delete", entity: "persona", entityId: seeded.personas[0]!.id, after: { definitionBefore: seeded.personas[0]!, affectedCards: [] } },
    { operationId: "remove-annotation", op: "delete", entity: "annotation", entityId: seeded.annotations[0]!.id, after: { definitionBefore: seeded.annotations[0]!, affectedCards: [] } }
  ]).state;
  expect(removed.cards.find((card) => card.title === "Step")?.parentId).toBe(neighbor.id);
  expect(removed.cards.find((card) => card.id === story.id)).toMatchObject({ releaseId: null, provenance: "inference" });
  for (const rows of [removed.cardDependencies, removed.cardPersonas, removed.cardAnnotations, removed.attachments, removed.githubLinks, removed.sourceLinks, removed.releases, removed.personas, removed.annotations]) expect(rows).toEqual([]);
  expect(f.repository.listCardHistory(parent.id).at(-1)?.snapshot).toMatchObject({ id: parent.id, title: "Parent" });
  expect(f.database.$client.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("changes only future Card prefixes, preserving linked keys and allocation after delete/reopen", () => {
  const f = fixture();
  const original = f.uow.run(ACTOR, ({ repository }) => {
    const card = repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Linked" });
    repository.createCardSourceLink(card.id, { kind: "note", note: "Preserve provenance" });
    repository.createGitHubLink({ cardId: card.id, repo: "owner/repo", issueNumber: 17, url: "https://github.com/owner/repo/issues/17" });
    repository.setExternalRef({ entityType: "card", entityId: card.id, system: "publisher", externalId: "existing-card" });
    return repository.getCard(card.id)!;
  });
  const { sourceLinks: sources, githubLinks: github, externalRefs: refs } = f.repository.getStoryMapSnapshot(f.map.id)!;
  const ordered = execute(f, [
    { operationId: "before-prefix", entity: "card", op: "create", after: { storyMapId: f.map.id, level: "activity", title: "Before prefix" } },
    { operationId: "prefix", entity: "storyMap", op: "update", entityId: f.map.id, baseVersion: f.map.version, after: { cardKeyPrefix: "NEXT" } },
    { operationId: "after-prefix", entity: "card", op: "create", after: { storyMapId: f.map.id, level: "activity", title: "Highest" } }
  ]).state;
  expect(ordered.cards.find((card) => card.title === "Before prefix")?.key).toBe("LSM-2");
  const highest = f.repository.listCards(f.map.id).find((card) => card.title === "Highest")!;
  expect(highest.key).toBe("NEXT-3");
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap).toMatchObject({ cardKeyPrefix: "NEXT", version: f.map.version + 1 });
  expect(f.repository.getCard(original.id)).toEqual(original);
  expect(f.repository.getStoryMapSnapshot(f.map.id)!).toMatchObject({ sourceLinks: sources, githubLinks: github, externalRefs: refs });
  execute(f, [{ operationId: "delete-highest", entity: "card", op: "delete", entityId: highest.id, baseVersion: highest.version, after: { strategy: "unassign" } }]);
  const path = f.handle.current.$client.name;
  f.handle.current.$client.close();
  f.handle.current = openStoryMapperDb(path);
  cleanup.push(() => f.handle.current.$client.close());
  const next = f.uow.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: "After reopen" }));
  expect(next.key).toBe("NEXT-4");
  expect(f.repository.getCard(original.id)).toEqual(original);
  expect(f.repository.getStoryMapSnapshot(f.map.id)!).toMatchObject({ sourceLinks: sources, githubLinks: github, externalRefs: refs });
});
