import { expect, it } from "vitest";
import { annotationSchema, connectorConnectionSchema, syncConflictSchema, type ChangeOperation, type OperationSnapshot, type OperationSupply, type SyncConflict } from "@storymapper/contracts";
import { collectOperationConflicts, resolveOperations } from "@storymapper/core";
import { createdAt, id, op, snapshot, supply } from "@storymapper/core/changesets/fixtures/remaining-operation-resolution-fixture";

function state(field: SyncConflict["field"]): OperationSnapshot {
  const value = snapshot();
  value.connections = [connectorConnectionSchema.parse({ id: id(50), projectId: id(1), provider: "github", name: "GitHub", authMode: "github-cli", owner: "org", repository: "repo", labelsAsAnnotations: true, createdAt, updatedAt: createdAt })];
  value.remoteWorkItemLinks = [{ id: id(60), externalRefId: id(19), remoteNumber: 1, connectionId: id(50), provider: "github", cardId: id(3), remoteId: "1", url: "https://github.com/org/repo/issues/1", syncState: "conflict", parentOverrideLocal: false, labels: [] }];
  value.externalRefs.push({ ...value.externalRefs[0]!, id: id(70), system: "planning", externalId: "activity" });
  value.syncConflicts = [{ id: id(62), externalRefId: id(19), syncRunId: id(61), connectionId: id(50), cardId: id(3), remoteId: "1", field, localValue: "Local", remoteValue: "Remote", status: "open", createdAt }];
  return value;
}

function locks(value: OperationSnapshot, operations: ChangeOperation[], inputs: OperationSupply = supply()) {
  return collectOperationConflicts(value, operations, inputs).filter((entry) => entry.reason === "sync");
}

function publish(value: OperationSnapshot, after: object = {}): ChangeOperation {
  return op({ op: "upsert", entity: "card", selector: { kind: "externalRef", scopeId: id(2), system: "planning", externalId: "activity" }, after: { storyMapId: id(2), level: "activity", title: value.cards[0]!.title, ...after } });
}

it("keeps GitHub-owned status during external lifecycle restoration and refuses explicit publication status", () => {
  const value = state("status");
  const card = value.cards[0]!;
  card.archived = true;
  value.sourcePlanBaselines = [{ id: id(70), projectId: id(1), storyMapId: id(2), system: "planning", version: 1, schemaVersion: 1, releases: [], entries: [{ cardId: card.id, identity: { id: card.id, key: card.key, title: card.title }, card: structuredClone(card), binding: structuredClone(value.externalRefs.at(-1)!), active: false, releaseName: "MVP" }] }];
  const result = resolveOperations(value, [publish(value)], supply());
  expect(result.state.cards[0]).toMatchObject({ archived: false, status: "todo" });
  expect(locks(value, [publish(value)])).toEqual([]);
  expect(() => resolveOperations(value, [publish(value, { status: "archived" })], supply())).toThrow(/GitHub owns/);
});

it("restores a linked Card with readable status archived while retaining ownership guards", () => {
  const value = state("status");
  const card = value.cards[0]!;
  Object.assign(card, { archived: true, status: "archived" });
  const restore = op({ op: "unarchive", entity: "card", entityId: card.id, baseVersion: card.version, after: { status: "archived" } });
  expect(locks(value, [restore])).toEqual([]);
  expect(resolveOperations(value, [restore], supply()).state.cards[0]).toMatchObject({ archived: false, status: "archived" });
  expect(locks(value, [op({ ...restore, after: { status: "done" } })])).not.toEqual([]);
});

it("compares each selected write against effective state while retaining transaction-start versions and evidence", () => {
  const value = state("title");
  value.cards[0]!.version = 3;
  const operations = [op({ operationId: "first", entity: "card", op: "update", entityId: id(3), baseVersion: 1, after: { title: "Changed" } }), op({ operationId: "second", entity: "card", op: "update", entityId: id(3), baseVersion: 3, after: { title: value.cards[0]!.title } })];
  const original = structuredClone(value);
  const conflicts = collectOperationConflicts(value, operations, supply());
  expect(conflicts.filter((entry) => entry.reason === "sync")).toMatchObject([{ operationId: "first", baseVersion: 1, currentVersion: 3 }, { operationId: "second", baseVersion: 3, currentVersion: 3 }]);
  expect(conflicts.filter((entry) => entry.reason !== "sync")).toMatchObject([{ operationId: "first", baseVersion: 1, currentVersion: 3, current: original.cards[0] }]);
  for (const conflict of conflicts.filter((entry) => entry.reason === "sync")) expect(syncConflictSchema.parse(conflict.current)).toEqual(value.syncConflicts![0]);
  expect(value).toEqual(original);
});

it("resolves a newly created managed Annotation alias before testing assignment", () => {
  const value = state("labels");
  const operations = [op({ operationId: "create", entity: "annotation", op: "create", entityId: "new-managed", after: { projectId: id(1), storyMapId: id(2), name: "Managed" } }), op({ operationId: "assign", entity: "cardAnnotation", entityId: id(3), op: "set", after: { cardId: id(3), annotationId: "new-managed" } })];
  const inputs = { ...supply(), ids: { create: id(101), assign: id(102) } };
  expect(locks(value, operations, inputs)).toMatchObject([{ operationId: "assign", syncConflictId: id(62) }]);
  expect(resolveOperations(value, operations, inputs).state.cardAnnotations).toContainEqual({ id: id(102), cardId: id(3), annotationId: id(101), createdAt: inputs.createdAt });
  expect(collectOperationConflicts(value, operations, inputs, ["assign"])).toEqual([]);
});

it.each(["create", "rename", "delete"] as const)("locks effective managed-label ambiguity changed by an unassigned definition %s", (action) => {
  const value = state("labels");
  value.annotations.push(annotationSchema.parse({ id: id(71), projectId: id(1), storyMapId: id(2), name: action === "delete" ? "Risk" : "Unassigned", position: 1 }));
  const operation = action === "create" ? op({ entity: "annotation", op: "create", after: { projectId: id(1), name: "Risk" } }) : action === "rename" ? op({ entity: "annotation", op: "update", entityId: id(71), after: { name: "Risk" } }) : op({ entity: "annotation", op: "delete", entityId: id(71), after: { definitionBefore: value.annotations[1], affectedCards: [] } });
  expect(locks(value, [operation])).toMatchObject([{ syncConflictId: id(62), current: value.syncConflicts![0] }]);
  expect(resolveOperations(value, [operation], supply()).state.annotations).not.toEqual(value.annotations);
});

it("keeps unrelated definition metadata and other-map collisions editable", () => {
  const value = state("labels");
  for (const operation of [op({ entity: "annotation", op: "update", entityId: id(10), after: { color: "#ffffff" } }), op({ entity: "annotation", op: "create", after: { projectId: id(1), storyMapId: id(99), name: "Risk" } }), op({ entity: "annotation", op: "create", after: { projectId: id(1), storyMapId: id(2), name: "Unassigned" } })]) expect(locks(value, [operation])).toEqual([]);
});

it("admits set-present and unset-absent while locking actual managed assignment changes", () => {
  const value = state("labels");
  value.annotations.push(annotationSchema.parse({ id: id(71), projectId: id(1), storyMapId: id(2), name: "New", position: 1 }));
  for (const [operationType, annotationId, expected] of [["set", id(10), false], ["unset", id(71), false], ["set", id(71), true], ["unset", id(10), true]] as const) {
    const operation = op({ entity: "cardAnnotation", entityId: id(3), op: operationType, after: { cardId: id(3), annotationId } });
    expect(locks(value, [operation]).length).toBe(expected ? 1 : 0);
    expect(resolveOperations(value, [operation], supply()).state.cardAnnotations.length).toBe(value.cardAnnotations.length + (expected ? operationType === "set" ? 1 : -1 : 0));
  }
});

it("only locks changed bulk members and permits independent edits alongside idempotent assignments", () => {
  const value = state("labels");
  value.syncConflicts!.push({ ...value.syncConflicts![0]!, id: id(63), cardId: id(30) });
  const operation = op({ entity: "card", entityId: id(2), op: "bulk", after: { storyMapId: id(2), cards: [{ id: id(3), baseVersion: 1 }, { id: id(30), baseVersion: 1 }], patch: { addAnnotationId: id(10), estimate: 8 } } });
  expect(locks(value, [operation])).toMatchObject([{ id: id(30), syncConflictId: id(63) }]);
  value.syncConflicts!.pop();
  expect(locks(value, [operation])).toEqual([]);
  expect(resolveOperations(value, [operation], { ...supply(), bulkRelationshipIds: { test: { [id(3)]: { annotation: id(100) }, [id(30)]: { annotation: id(101) } } } }).state.cards.map((card) => card.estimate)).toEqual([8, 8]);
});

it("recognizes an assignment restored later in the same ChangeSet as a second delta", () => {
  const value = state("labels");
  const operations = [op({ operationId: "remove", entity: "cardAnnotation", entityId: id(3), op: "unset", after: { cardId: id(3), annotationId: id(10) } }), op({ operationId: "restore", entity: "cardAnnotation", entityId: id(3), op: "set", after: { cardId: id(3), annotationId: id(10) } })];
  expect(locks(value, operations, { ...supply(), ids: { restore: id(100) } })).toMatchObject([{ operationId: "remove" }, { operationId: "restore" }]);
});

it.each([{ color: "#ffffff" }, { position: 1 }, { name: "todo" }])("does not lock status for metadata-only reviewed workflow changes %j", (patch) => {
  const value = state("status");
  value.workflowStatuses[0]!.name = "todo";
  const operation = op({ entity: "workflowStatus", op: "update", entityId: id(11), after: { ...patch, definitionBefore: value.workflowStatuses[0], affectedCards: [{ id: id(30), baseVersion: 1 }] } });
  expect(locks(value, [operation])).toEqual([]);
  expect(resolveOperations(value, [operation], supply()).state.cards).toEqual(value.cards);
});

it("locks actual workflow rename/deletion effects and retains stale review-version conflicts", () => {
  const value = state("status");
  value.workflowStatuses[0]!.name = "todo";
  value.workflowStatuses.push({ ...value.workflowStatuses[0]!, id: id(71), name: "Ready" });
  const evidence = { definitionBefore: value.workflowStatuses[0], affectedCards: [{ id: id(30), baseVersion: 1 }] };
  for (const operation of [op({ entity: "workflowStatus", op: "update", entityId: id(11), after: { ...evidence, name: "Doing" } }), op({ entity: "workflowStatus", op: "delete", entityId: id(11), after: { ...evidence, replacementBefore: value.workflowStatuses[1] } })]) expect(locks(value, [operation])).toEqual([]);
  value.cards[1]!.version = 3;
  const metadata = op({ entity: "workflowStatus", op: "update", entityId: id(11), after: { ...evidence, color: "#ffffff" } });
  expect(collectOperationConflicts(value, [metadata], supply())).toMatchObject([{ id: id(30), baseVersion: 1, currentVersion: 3 }]);
  expect(() => resolveOperations(value, [metadata], supply())).toThrow(/usage or versions changed/);
});

it("projects a new canonical Issue binding alongside an unrelated existing conflict", () => {
  const value = state("title");
  const operations = [op({ operationId: "issue", entity: "githubExternalRef", op: "create", entityId: "new-issue", after: { entityType: "card", entityId: id(30), scopeId: id(2), externalId: "https://github.com/org/repo/issues/2" } }), op({ operationId: "link", entity: "remoteWorkItemLink", op: "set", after: { externalRefId: "new-issue", connectionId: id(50), syncState: "unsynced", labels: [], parentOverrideLocal: false } })];
  const inputs = { ...supply(), ids: { issue: id(101), link: id(102) } };
  expect(collectOperationConflicts(value, operations, inputs)).toEqual([]);
  expect(resolveOperations(value, operations, inputs).state.remoteWorkItemLinks).toEqual(expect.arrayContaining([expect.objectContaining({ externalRefId: id(101), cardId: id(30), remoteId: "2" })]));
});

it("resolves a new Workflow Status alias before a later effective rename", () => {
  const value = state("status");
  value.workflowStatuses = [];
  const definition = { id: id(101), projectId: id(1), storyMapId: null, name: "todo", group: "todo", position: 0 };
  const operations = [op({ operationId: "create", entity: "workflowStatus", op: "create", entityId: "new-status", after: { projectId: id(1), name: "todo", group: "todo", position: 0 } }), op({ operationId: "rename", entity: "workflowStatus", op: "update", entityId: "new-status", after: { name: "Doing", definitionBefore: definition, affectedCards: [{ id: id(30), baseVersion: 1 }] } })];
  const inputs = { ...supply(), ids: { create: id(101) } };
  expect(locks(value, operations, inputs)).toEqual([]);
  expect(resolveOperations(value, operations, inputs).state.cards.map((card) => card.status)).toEqual(["todo", "Doing"]);
});
