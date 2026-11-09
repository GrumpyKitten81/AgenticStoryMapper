import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { ChangeOperation, WorkflowStatus } from "@storymapper/contracts";
import { collectOperationConflicts, resolveOperations } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork, publishRestorePoint } from "@storymapper/db";

const ACTOR = { actorType: "human", actorId: "customization-reviewer" } as const;
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).reverse().forEach((close) => close()));

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-customization-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  const repository = new StoryMapperRepository(handle);
  const uow = new UnitOfWork(handle);
  cleanups.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const roots = uow.run(ACTOR, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Scoped customization" });
    const maps = ["First", "Second"].map((name) => tx.createStoryMap({ projectId: project.id, name }));
    const foreign = tx.createProject({ name: "Other Project" });
    const foreignMap = tx.createStoryMap({ projectId: foreign.id, name: "Foreign" });
    const status = tx.createWorkflowStatus({ projectId: project.id, name: "review", group: "active" });
    const replacement = tx.createWorkflowStatus({ projectId: project.id, name: "accepted", group: "done" });
    tx.createWorkflowStatus({ projectId: foreign.id, name: "review", group: "active" });
    const cards = [...maps, foreignMap].map((map) => tx.createCard({ storyMapId: map.id, title: map.name, level: "activity", status: "review" }));
    return { project, maps, foreign, foreignMap, status, replacement, cards };
  });
  const snapshot = () => repository.getOperationSnapshot(roots.project.id);
  const review = (status: WorkflowStatus) => ({ definitionBefore: status, affectedCards: repository.getCustomization(roots.project.id).usageCards.filter((card) => card.status === status.name && (!status.storyMapId || status.storyMapId === card.storyMapId)).map((card) => ({ id: card.id, baseVersion: card.version })) });
  return { ...roots, handle, repository, uow, snapshot, review };
}

it("renames a Project status across parked Cards and maps with exact persisted ChangeSet parity", () => {
  const f = fixture();
  f.uow.run(ACTOR, ({ repository }) => repository.parkCard(f.cards[1]!.id, { childStrategy: "unassign" }));
  const evidence = f.review(f.status);
  const before = f.snapshot();
  const operations: ChangeOperation[] = [{ operationId: "rename", entity: "workflowStatus", op: "update", entityId: f.status.id, after: { ...evidence, name: "ready" } }];
  const supply = f.repository.prepareOperationSupply(operations, before);
  const projected = resolveOperations(before, operations, supply);
  const changeSet = f.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Reviewed rename", source: "human", createdAt: supply.createdAt, operations }));
  f.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"));
  f.uow.runPrepared(ACTOR, (database) => ({ supply, restorePoint: publishRestorePoint(database, "pre-apply").fileName }), ({ repository }, prepared) => repository.applyChangeSet(changeSet.id, prepared));
  expect(f.snapshot().cards).toEqual(projected.state.cards);
  for (const baseline of evidence.affectedCards) expect(f.repository.getCardDetails(baseline.id)).toMatchObject({ status: "ready", version: baseline.baseVersion + 1 });
  expect(f.repository.getCardDetails(f.cards[2]!.id)!.status).toBe("review");
  expect(f.repository.listCardHistoryPage(f.cards[0]!.id, { limit: 20 }).versions[0]!.snapshot.status).toBe("ready");
});

it.each(["new usage", "removed usage", "stale Card", "definition drift"])("refuses %s before a status rename and preserves all rows", (drift) => {
  const f = fixture();
  const evidence = f.review(f.status);
  f.uow.run(ACTOR, ({ repository }) => {
    if (drift === "new usage") repository.createCard({ storyMapId: f.maps[0]!.id, title: "New", level: "activity", status: "review" });
    if (drift === "removed usage") repository.updateCard(f.cards[0]!.id, { status: "todo" });
    if (drift === "stale Card") repository.updateCard(f.cards[0]!.id, { title: "Changed" });
    if (drift === "definition drift") repository.updateWorkflowStatus(f.status.id, { color: "red" });
  });
  const before = f.snapshot();
  const operations: ChangeOperation[] = [{ operationId: "rename", entity: "workflowStatus", op: "update", entityId: f.status.id, after: { ...evidence, name: "ready" } }];
  expect(() => resolveOperations(before, operations, f.repository.prepareOperationSupply(operations, before))).toThrow(/changed/);
  expect(() => f.uow.run(ACTOR, ({ repository }) => repository.updateWorkflowStatus(f.status.id, { ...evidence, name: "ready" }))).toThrow(/changed/);
  expect(f.snapshot()).toEqual(before);
});

it("reports every captured Card version conflict independently in ChangeSet review", () => {
  const f = fixture();
  const evidence = f.review(f.status);
  f.uow.run(ACTOR, ({ repository }) => { for (const card of f.cards.slice(0, 2)) repository.updateCard(card.id, { title: "Changed" }); });
  const operations: ChangeOperation[] = [{ operationId: "rename", entity: "workflowStatus", op: "update", entityId: f.status.id, after: { ...evidence, name: "ready" } }];
  const state = f.snapshot();
  expect(collectOperationConflicts(state, operations, f.repository.prepareOperationSupply(operations, state)).map((entry) => entry.id).sort()).toEqual(evidence.affectedCards.map((card) => card.id).sort());
});

it("rejects effective map collisions while unrelated Project and map names remain legal", () => {
  const f = fixture();
  const local = f.uow.run(ACTOR, ({ repository }) => repository.createWorkflowStatus({ projectId: f.project.id, storyMapId: f.maps[0]!.id, name: "local", group: "active" }));
  expect(() => f.uow.run(ACTOR, ({ repository }) => repository.updateWorkflowStatus(f.status.id, { ...f.review(f.status), name: local.name }))).toThrow(/collides/);
  expect(() => f.uow.run(ACTOR, ({ repository }) => repository.createWorkflowStatus({ projectId: f.project.id, storyMapId: f.maps[0]!.id, name: "review", group: "active" }))).toThrow(/ambiguous/);
  expect(f.uow.run(ACTOR, ({ repository }) => repository.createWorkflowStatus({ projectId: f.project.id, storyMapId: f.maps[1]!.id, name: "local", group: "active" })).name).toBe("local");
  expect(() => f.repository.getCustomization(f.project.id, f.foreignMap.id)).toThrow(/Project/);
});

it("replaces a used status atomically and refuses replacement drift or a narrower scope", () => {
  const f = fixture();
  const evidence = f.review(f.status);
  const local = f.uow.run(ACTOR, ({ repository }) => repository.createWorkflowStatus({ projectId: f.project.id, storyMapId: f.maps[0]!.id, name: "local", group: "active" }));
  for (const replacementBefore of [f.status, local]) {
    const before = f.snapshot();
    const operations: ChangeOperation[] = [{ operationId: "replace", entity: "workflowStatus", op: "delete", entityId: f.status.id, after: { ...evidence, replacementBefore } }];
    expect(() => resolveOperations(before, operations, f.repository.prepareOperationSupply(operations, before))).toThrow(/Replacement/);
    expect(() => f.uow.run(ACTOR, ({ repository }) => repository.deleteWorkflowStatus(f.status.id, { ...evidence, replacementBefore }))).toThrow(/Replacement/);
    expect(f.snapshot()).toEqual(before);
  }
  f.uow.run(ACTOR, ({ repository }) => repository.updateWorkflowStatus(f.replacement.id, { color: "red" }));
  expect(() => f.uow.run(ACTOR, ({ repository }) => repository.deleteWorkflowStatus(f.status.id, { ...evidence, replacementBefore: f.replacement }))).toThrow(/changed/);
  const replacementBefore = f.repository.getWorkflowStatus(f.replacement.id)!;
  f.uow.run(ACTOR, ({ repository }) => repository.deleteWorkflowStatus(f.status.id, { ...evidence, replacementBefore }));
  expect(f.repository.getWorkflowStatus(f.status.id)).toBeUndefined();
  for (const card of f.cards.slice(0, 2)) expect(f.repository.getCardDetails(card.id)).toMatchObject({ status: "accepted", version: card.version + 1 });
  expect(f.repository.getCardDetails(f.cards[2]!.id)!.status).toBe("review");
});

it.each(["persona", "annotation"] as const)("requires reviewed %s unlink confirmation and refuses newly linked Cards", (kind) => {
  const f = fixture();
  const definition = f.uow.run(ACTOR, ({ repository }) => kind === "persona" ? repository.createPersona({ projectId: f.project.id, name: "Reader" }) : repository.createAnnotation({ projectId: f.project.id, name: "Risk" }));
  const link = (cardId: string) => f.uow.run(ACTOR, ({ repository }) => kind === "persona" ? repository.setCardPersona(cardId, definition.id) : repository.setCardAnnotation(cardId, definition.id));
  link(f.cards[0]!.id);
  const evidence = { definitionBefore: definition, affectedCards: [{ id: f.cards[0]!.id, baseVersion: f.repository.getCardDetails(f.cards[0]!.id)!.version }] };
  const remove = (confirmUnlink: boolean) => f.uow.run(ACTOR, ({ repository }) => kind === "persona" ? repository.deletePersona(definition.id, { ...evidence, definitionBefore: repository.getPersona(definition.id)!, confirmUnlink }) : repository.deleteAnnotation(definition.id, { ...evidence, definitionBefore: repository.getAnnotation(definition.id)!, confirmUnlink }));
  expect(() => remove(false)).toThrow(/Confirm/);
  link(f.cards[1]!.id);
  const before = f.snapshot();
  expect(() => remove(true)).toThrow(/usage/);
  expect(f.snapshot()).toEqual(before);
  const read = f.repository.getCustomization(f.project.id, f.maps[0]!.id);
  expect((kind === "persona" ? read.cardPersonas : read.cardAnnotations)).toHaveLength(2);
});

it("creates independent template copies with zero estimate in a single Card version", () => {
  const f = fixture();
  const result = f.uow.run(ACTOR, ({ repository }) => {
    const template = repository.createStoryTemplate({ projectId: f.project.id, name: "Zero", descriptionTemplate: "Copied skeleton", defaultStatus: "review", defaultEstimate: 0 });
    const card = repository.createCard({ storyMapId: f.maps[0]!.id, title: "Copy", level: "activity", description: template.descriptionTemplate, status: template.defaultStatus, estimate: template.defaultEstimate! }, "template");
    repository.deleteStoryTemplate(template.id);
    return card;
  });
  expect(f.repository.getCardDetails(result.id)).toMatchObject({ version: 1, description: "Copied skeleton", status: "review", estimate: 0 });
});

it.each(["persona", "annotation"] as const)("refuses %s deletion in human, preview and approved Apply when a removed map retains links", (kind) => {
  const f = fixture();
  const definition = f.uow.run(ACTOR, ({ repository }) => {
    const root = kind === "persona" ? repository.createPersona({ projectId: f.project.id, name: "Retained" }) : repository.createAnnotation({ projectId: f.project.id, name: "Retained" });
    for (const card of f.cards.slice(0, 2)) {
      if (kind === "persona") repository.setCardPersona(card.id, root.id);
      else repository.setCardAnnotation(card.id, root.id);
    }
    return root;
  });
  const evidence = { definitionBefore: definition, affectedCards: f.cards.slice(0, 2).map((card) => ({ id: card.id, baseVersion: f.repository.getCardDetails(card.id)!.version })), confirmUnlink: true };
  const operations = [{ operationId: "unlink", entity: kind, op: "delete", entityId: definition.id, ...(kind === "persona" ? { baseVersion: 1 } : {}), after: evidence }] as ChangeOperation[];
  const supply = f.repository.prepareOperationSupply(operations, f.snapshot());
  const proposal = f.uow.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Reviewed unlink", source: "human", createdAt: supply.createdAt, operations }));
  f.uow.run(ACTOR, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
  f.uow.run(ACTOR, ({ repository }) => repository.deleteStoryMap(f.maps[0]!.id));
  const rows = () => Object.fromEntries(["cards", "card_versions", "personas", "annotations", "card_personas", "card_annotations", "activity_events", "change_sets"].map((table) => [table, f.handle.current.$client.prepare(`SELECT * FROM ${table}`).all()]));
  const before = rows();
  expect(() => f.uow.run(ACTOR, ({ repository }) => kind === "persona" ? repository.deletePersona(definition.id, { ...evidence, definitionBefore: repository.getPersona(definition.id)! }) : repository.deleteAnnotation(definition.id, { ...evidence, definitionBefore: repository.getAnnotation(definition.id)! }))).toThrow(/removed Story Map/);
  expect(() => resolveOperations(f.snapshot(), operations, supply)).toThrow(/removed Story Map/);
  expect(() => f.uow.run(ACTOR, ({ repository }) => repository.applyChangeSet(proposal.id, { supply }))).toThrow(/removed Story Map/);
  expect(rows()).toEqual(before);
  expect(kind === "persona" ? f.repository.getPersona(definition.id) : f.repository.getAnnotation(definition.id)).toEqual(definition);
  f.uow.run(ACTOR, ({ repository }) => kind === "persona" ? repository.updatePersona(definition.id, { name: "Still editable" }) : repository.updateAnnotation(definition.id, { name: "Still editable" }));
  expect(kind === "persona" ? f.repository.getPersona(definition.id)?.name : f.repository.getAnnotation(definition.id)?.name).toBe("Still editable");
});

it("honors supplied status evidence for metadata edits while allowing sparse metadata commands", () => {
  const f = fixture();
  const evidence = f.review(f.status);
  const sparseBefore = f.snapshot();
  const sparse: ChangeOperation[] = [{ operationId: "sparse", entity: "workflowStatus", op: "update", entityId: f.status.id, after: { color: "red" } }];
  expect(resolveOperations(sparseBefore, sparse, f.repository.prepareOperationSupply(sparse, sparseBefore)).state.cards).toEqual(sparseBefore.cards);
  f.uow.run(ACTOR, ({ repository }) => repository.updateWorkflowStatus(f.status.id, { color: "red" }));
  const before = f.snapshot();
  const operations: ChangeOperation[] = [{ operationId: "metadata", entity: "workflowStatus", op: "update", entityId: f.status.id, after: { ...evidence, group: "done" } }];
  expect(() => resolveOperations(before, operations, f.repository.prepareOperationSupply(operations, before))).toThrow(/definition changed/);
  expect(() => f.uow.run(ACTOR, ({ repository }) => repository.updateWorkflowStatus(f.status.id, { ...evidence, group: "done" }))).toThrow(/definition changed/);
  expect(f.snapshot()).toEqual(before);
  const current = f.review(f.repository.getWorkflowStatus(f.status.id)!);
  const reviewed: ChangeOperation[] = [{ ...operations[0]!, after: { ...current, group: "done" } } as ChangeOperation];
  const resolved = resolveOperations(before, reviewed, f.repository.prepareOperationSupply(reviewed, before));
  f.uow.run(ACTOR, ({ repository }) => repository.updateWorkflowStatus(f.status.id, { ...current, group: "done" }));
  expect(f.repository.getWorkflowStatus(f.status.id)!.group).toBe("done");
  expect(f.snapshot().cards).toEqual(before.cards);
  expect(resolved.state.cards).toEqual(before.cards);
});

it.each(["duplicate", "foreign id", "wrong version"])("refuses %s in indexed customization Card evidence", (kind) => {
  const f = fixture();
  const evidence = f.review(f.status);
  if (kind === "duplicate") evidence.affectedCards[1] = { ...evidence.affectedCards[0]! };
  if (kind === "foreign id") evidence.affectedCards[1] = { id: f.cards[2]!.id, baseVersion: f.cards[2]!.version };
  if (kind === "wrong version") evidence.affectedCards[1]!.baseVersion += 1;
  const before = f.snapshot();
  const operations: ChangeOperation[] = [{ operationId: "rename", entity: "workflowStatus", op: "update", entityId: f.status.id, after: { ...evidence, name: "ready" } }];
  expect(() => resolveOperations(before, operations, f.repository.prepareOperationSupply(operations, before))).toThrow(/usage or versions changed/);
  expect(() => f.uow.run(ACTOR, ({ repository }) => repository.updateWorkflowStatus(f.status.id, { ...evidence, name: "ready" }))).toThrow(/usage or versions changed/);
  expect(f.snapshot()).toEqual(before);
});

it.each([
  ["workflow status", (r: StoryMapperRepository<"transaction">, scope: { projectId: string; storyMapId?: string }) => r.createWorkflowStatus({ ...scope, name: "scoped", group: "todo" })],
  ["persona", (r: StoryMapperRepository<"transaction">, scope: { projectId: string; storyMapId?: string }) => r.createPersona({ ...scope, name: "scoped" })],
  ["annotation", (r: StoryMapperRepository<"transaction">, scope: { projectId: string; storyMapId?: string }) => r.createAnnotation({ ...scope, name: "scoped" })],
  ["story template", (r: StoryMapperRepository<"transaction">, scope: { projectId: string; storyMapId?: string }) => r.createStoryTemplate({ ...scope, name: "scoped" })]
])("refuses a %s created in a foreign Story Map or unknown Project", (_name, create) => {
  const f = fixture();
  const before = f.repository.getCustomization(f.project.id);
  expect(() => f.uow.run(ACTOR, ({ repository }) => create(repository, { projectId: f.project.id, storyMapId: f.foreignMap.id }))).toThrow(/does not belong/);
  expect(() => f.uow.run(ACTOR, ({ repository }) => create(repository, { projectId: randomUUID() }))).toThrow(/Project not found/);
  expect(f.repository.getCustomization(f.project.id)).toEqual(before);
});

it("keeps colour-only edits possible for legacy overlapping status names while refusing their rename", () => {
  const f = fixture();
  f.handle.current.$client.prepare('INSERT INTO workflow_statuses (id, project_id, story_map_id, name, "group", position, color) VALUES (?, ?, ?, ?, ?, 9, NULL)').run(randomUUID(), f.project.id, f.maps[0]!.id, "review", "active");
  expect(f.uow.run(ACTOR, ({ repository }) => repository.updateWorkflowStatus(f.status.id, { color: "#123456" }))?.color).toBe("#123456");
  expect(() => f.uow.run(ACTOR, ({ repository }) => repository.updateWorkflowStatus(f.status.id, { name: "ready", ...f.review(f.status) }))).toThrow(/ambiguous/);
});
