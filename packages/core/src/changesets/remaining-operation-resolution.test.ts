import { expect, it } from "vitest";
import { changeOperationSchema, connectorConnectionSchema, remoteWorkItemSyncStateSchema, type ChangeOperation, type OperationOwner, type OperationSnapshot, type ResolvedEntityChange } from "@storymapper/contracts";
import { collectOperationConflicts, describeOperation, OperationResolutionError, resolveOperation, resolveOperations } from "@storymapper/core";

import { id, createdAt, chunkId, op, snapshot, supply, members } from "@storymapper/core/changesets/fixtures/remaining-operation-resolution-fixture";

type Oracle = { edit(state: OperationSnapshot): void; effects: ReadonlyArray<readonly [ResolvedEntityChange["entity"], number]>; owners: ReadonlyArray<readonly [OperationOwner["entity"], number]> };
const changedAt = "2026-10-12T13:00:00.000Z";
const oracles: Record<string, Oracle> = {
  "create:roadmap": { edit: (state) => {
    state.roadmaps.push({ id: id(100), projectId: id(1), storyMapId: null, name: "New", type: "simple", version: 1, createdAt: changedAt, updatedAt: changedAt });
    state.roadmapColumns.push({ id: id(101), roadmapId: id(100), name: "Now", position: 0 }, { id: id(102), roadmapId: id(100), name: "Next", position: 1 }, { id: id(103), roadmapId: id(100), name: "Later", position: 2 });
    state.roadmapSwimlanes.push({ id: id(104), roadmapId: id(100), name: "Default", position: 0 });
  }, effects: [["roadmap", 100], ["roadmapColumn", 101], ["roadmapColumn", 102], ["roadmapColumn", 103], ["roadmapSwimlane", 104]], owners: [["roadmap", 100]] },
  "update:roadmap": { edit: (state) => { Object.assign(state.roadmaps[0]!, { name: "Changed", version: 2, updatedAt: changedAt }); }, effects: [["roadmap", 6]], owners: [["roadmap", 6]] },
  "create:roadmapColumn": { edit: (state) => { state.roadmaps[0]!.version = 2; state.roadmapColumns.push({ id: id(100), roadmapId: id(6), name: "Later", position: 1 }); }, effects: [["roadmap", 6], ["roadmapColumn", 100]], owners: [["roadmap", 6]] },
  "create:roadmapSwimlane": { edit: (state) => { state.roadmaps[0]!.version = 2; state.roadmapSwimlanes.push({ id: id(100), roadmapId: id(6), name: "Team", position: 1 }); }, effects: [["roadmap", 6], ["roadmapSwimlane", 100]], owners: [["roadmap", 6]] },
  "create:roadmapCard": { edit: (state) => { state.roadmaps[0]!.version = 2; state.roadmapCards.push({ id: id(100), roadmapId: id(6), columnId: id(7), swimlaneId: null, title: "Next", details: "", labels: [], reach: null, impact: null, confidence: null, effort: null, position: 1 }); }, effects: [["roadmap", 6], ["roadmapCard", 100]], owners: [["roadmap", 6]] },
  "create:roadmapReference": { edit: (state) => { state.roadmaps[0]!.version = 2; state.roadmapReferences.push({ id: id(100), roadmapCardId: id(9), targetType: "card", targetId: id(3) }); }, effects: [["roadmap", 6], ["roadmapReference", 100]], owners: [["roadmap", 6]] },
  "create:annotation": { edit: (state) => { state.annotations.push({ id: id(100), projectId: id(1), storyMapId: null, name: "New", icon: "tag", color: "#eef2ff", position: 1 }); }, effects: [["annotation", 100]], owners: [["project", 1]] },
  "update:annotation": { edit: (state) => { state.annotations[0]!.name = "Changed"; }, effects: [["annotation", 10]], owners: [["project", 1]] },
  "delete:annotation": { edit: (state) => { state.annotations = []; state.cardAnnotations = []; state.cards[0]!.version = 2; }, effects: [["annotation", 10], ["cardAnnotation", 16], ["card", 3]], owners: [["project", 1], ["card", 3]] },
  "create:workflowStatus": { edit: (state) => { state.workflowStatuses.push({ id: id(100), projectId: id(1), storyMapId: null, name: "New", group: "todo", position: 1 }); }, effects: [["workflowStatus", 100]], owners: [["project", 1]] },
  "update:workflowStatus": { edit: (state) => { state.workflowStatuses[0]!.name = "Changed"; }, effects: [["workflowStatus", 11]], owners: [["project", 1]] },
  "delete:workflowStatus": { edit: (state) => { state.workflowStatuses = []; }, effects: [["workflowStatus", 11]], owners: [["project", 1]] },
  "create:storyTemplate": { edit: (state) => { state.storyTemplates.push({ id: id(100), projectId: id(1), storyMapId: null, name: "New", descriptionTemplate: "", defaultStatus: "todo", defaultEstimate: null, position: 1 }); }, effects: [["storyTemplate", 100]], owners: [["project", 1]] },
  "update:storyTemplate": { edit: (state) => { state.storyTemplates[0]!.name = "Changed"; }, effects: [["storyTemplate", 12]], owners: [["project", 1]] },
  "delete:storyTemplate": { edit: (state) => { state.storyTemplates = []; }, effects: [["storyTemplate", 12]], owners: [["project", 1]] },
  "set:productContext": { edit: (state) => { state.storyMaps[0]!.version = 2; Object.assign(state.productContexts[0]!, { purpose: "Changed", updatedAt: changedAt }); }, effects: [["storyMap", 2], ["productContext", 13]], owners: [["storyMap", 2]] },
  "create:attachment": { edit: (state) => { state.cards[0]!.version = 2; state.attachments.push({ id: id(100), cardId: id(3), label: "New", filePath: "attachments/new.txt", createdAt: changedAt }); }, effects: [["card", 3], ["attachment", 100]], owners: [["card", 3]] },
  "delete:attachment": { edit: (state) => { state.cards[0]!.version = 2; state.attachments = []; }, effects: [["card", 3], ["attachment", 14]], owners: [["card", 3]] },
  "park:card": { edit: (state) => { Object.assign(state.cards[0]!, { parked: true, version: 2, updatedAt: changedAt }); }, effects: [["card", 3]], owners: [["card", 3]] },
  "unpark:card": { edit: (state) => { Object.assign(state.cards[0]!, { parked: false, parentId: null, position: 0, version: 2, updatedAt: changedAt }); }, effects: [["card", 3]], owners: [["card", 3]] },
  "archive:card": { edit: (state) => { Object.assign(state.cards[0]!, { archived: true, version: 2, updatedAt: changedAt }); }, effects: [["card", 3]], owners: [["card", 3]] },
  "unarchive:card": { edit: (state) => { Object.assign(state.cards[0]!, { archived: false, status: "todo", version: 2, updatedAt: changedAt }); }, effects: [["card", 3]], owners: [["card", 3]] },
  "delete:card": { edit: (state) => { state.cards.shift(); Object.assign(state.cards[0]!, { provenance: "manual", version: 2 }); state.githubLinks = []; state.sourceLinks = []; state.cardPersonas = []; state.cardAnnotations = []; state.attachments = []; state.externalRefs = []; }, effects: [["card", 3], ["card", 30], ["cardPersona", 15], ["cardAnnotation", 16], ["attachment", 14], ["externalRef", 17], ["externalRef", 19], ["sourceLink", 20]], owners: [["card", 3], ["card", 30]] },
  "delete:persona": { edit: (state) => { state.personas = []; state.cardPersonas = []; state.cards[0]!.version = 2; }, effects: [["card", 3], ["persona", 5], ["cardPersona", 15]], owners: [["card", 3], ["persona", 5]] },
  "delete:release": { edit: (state) => { state.releases = []; Object.assign(state.cards[0]!, { releaseId: null, version: 2, updatedAt: changedAt }); }, effects: [["card", 3], ["release", 4]], owners: [["card", 3], ["release", 4]] },
  "delete:storyMap": { edit: (state) => { state.storyMaps = []; }, effects: [["storyMap", 2]], owners: [["storyMap", 2]] },
  "set:cardPersona": { edit: (state) => { state.cards[1]!.version = 2; state.cardPersonas.push({ id: id(100), cardId: id(30), personaId: id(5), createdAt: changedAt }); }, effects: [["card", 30], ["cardPersona", 100]], owners: [["card", 30]] },
  "unset:cardPersona": { edit: (state) => { state.cards[0]!.version = 2; state.cardPersonas = []; }, effects: [["card", 3], ["cardPersona", 15]], owners: [["card", 3]] },
  "set:cardAnnotation": { edit: (state) => { state.cards[1]!.version = 2; state.cardAnnotations.push({ id: id(100), cardId: id(30), annotationId: id(10), createdAt: changedAt }); }, effects: [["card", 30], ["cardAnnotation", 100]], owners: [["card", 30]] },
  "unset:cardAnnotation": { edit: (state) => { state.cards[0]!.version = 2; state.cardAnnotations = []; }, effects: [["card", 3], ["cardAnnotation", 16]], owners: [["card", 3]] },
  "create:githubExternalRef": { edit: (state) => { Object.assign(state.cards[1]!, { provenance: "linked", version: 2 }); state.externalRefs.push({ id: id(100), entityType: "card", entityId: id(30), scopeId: id(2), system: "github", externalId: "https://github.com/org/repo/issues/2", syncedVersion: 1, createdAt: changedAt }); state.githubLinks.push({ id: id(100), cardId: id(30), repo: "org/repo", issueNumber: 2, url: "https://github.com/org/repo/issues/2", syncState: "unsynced" }); }, effects: [["card", 30], ["externalRef", 100]], owners: [["card", 30]] },
  "update:githubExternalRef": { edit: (state) => { state.cards.forEach((card) => Object.assign(card, { provenance: "linked", version: 2 })); state.externalRefs.find((ref) => ref.id === id(19))!.externalId = "https://github.com/org/repo/issues/2"; Object.assign(state.githubLinks[0]!, { url: "https://github.com/org/repo/issues/2", issueNumber: 2 }); if (state.sourceLinks[0]!.kind === "github") Object.assign(state.sourceLinks[0]!, { url: "https://github.com/org/repo/issues/2", issueNumber: 2 }); }, effects: [["card", 3], ["card", 30], ["externalRef", 19], ["sourceLink", 20]], owners: [["card", 3], ["card", 30]] },
  "delete:githubExternalRef": { edit: (state) => { state.cards.forEach((card) => Object.assign(card, { provenance: "manual", version: 2 })); state.externalRefs = state.externalRefs.filter((ref) => ref.id !== id(19)); state.githubLinks = []; state.sourceLinks = []; }, effects: [["card", 3], ["card", 30], ["externalRef", 19], ["sourceLink", 20]], owners: [["card", 3], ["card", 30]] },
  "set:externalRef": { edit: (state) => { state.externalRefs.push({ id: id(100), entityType: "card", entityId: id(30), scopeId: id(2), system: "bmad", externalId: "other", syncedVersion: 1, createdAt: changedAt }); const card = state.cards[1]!; state.sourcePlanBaselines = [{ id: id(100), projectId: id(1), storyMapId: id(2), system: "bmad", version: 1, schemaVersion: 1, releases: [], entries: [{ cardId: card.id, identity: { id: card.id, key: card.key, title: card.title }, card: structuredClone(card), active: true, binding: structuredClone(state.externalRefs.at(-1)!), releaseName: null }] }]; }, effects: [["externalRef", 100], ["sourcePlanBaseline", 100]], owners: [["card", 30], ["storyMap", 2]] },
  "delete:externalRef": { edit: (state) => { state.externalRefs = state.externalRefs.filter((ref) => ref.id !== id(17)); }, effects: [["externalRef", 17]], owners: [["card", 3]] },
  "bulk:card": { edit: (state) => { state.cards.forEach((card) => Object.assign(card, { status: "active", version: 2, updatedAt: changedAt })); }, effects: [["card", 3], ["card", 30]], owners: [["card", 3], ["card", 30]] }
};

const collections = { sourcePlanBaseline: "sourcePlanBaselines", storyMap: "storyMaps", card: "cards", release: "releases", persona: "personas", roadmap: "roadmaps", roadmapColumn: "roadmapColumns", roadmapSwimlane: "roadmapSwimlanes", roadmapCard: "roadmapCards", roadmapReference: "roadmapReferences", annotation: "annotations", workflowStatus: "workflowStatuses", storyTemplate: "storyTemplates", productContext: "productContexts", attachment: "attachments", cardPersona: "cardPersonas", cardAnnotation: "cardAnnotations", externalRef: "externalRefs", githubLink: "githubLinks", sourceLink: "sourceLinks" } as const;
const sorted = <T extends { entity: string; entityId: string }>(values: readonly T[]) => [...values].sort((a, b) => `${a.entity}:${a.entityId}`.localeCompare(`${b.entity}:${b.entityId}`));

function exactEffects(before: OperationSnapshot, after: OperationSnapshot, effects: Oracle["effects"]): ResolvedEntityChange[] {
  return effects.map(([entity, number]) => {
    const collection = collections[entity as keyof typeof collections];
    const previous = (before[collection] ?? []).find((row) => row.id === id(number));
    const next = (after[collection] ?? []).find((row) => row.id === id(number));
    return { entity, entityId: id(number), ...(previous ? { before: previous } : {}), ...(next ? { after: next } : {}) } as ResolvedEntityChange;
  });
}

it.each(members)("resolves %s:%s with exact pure deterministic state/effects/owners", (operationType, entity, number, after) => {
  const operation = op({ op: operationType, entity, ...(number ? { entityId: id(number) } : {}), after });
  const state = snapshot();
  if (operationType === "unpark") state.cards[0]!.parked = true;
  if (operationType === "unarchive") state.cards[0]!.status = "archived";
  const inputs = supply();
  const before = structuredClone({ state, operation, inputs });
  const oracle = oracles[`${operationType}:${entity}`]!;
  const expected = structuredClone(state);
  oracle.edit(expected);
  const result = resolveOperation(state, operation, inputs);
  expect(result.state).toEqual(expected);
  const changes = exactEffects(state, expected, oracle.effects);
  const owners = oracle.owners.map(([entity, number]) => ({ entity, entityId: id(number), projectId: id(1) }));
  expect(sorted(result.changes)).toEqual(sorted(changes));
  expect(sorted(result.owners)).toEqual(sorted(owners));
  expect(result).toMatchObject({ operationId: "test", index: 0, kind: `${operationType}:${entity}`, label: operationType, status: "changed", dependencies: [] });
  expect(resolveOperation(state, operation, inputs)).toEqual(result);
  expect(describeOperation(state, operation, inputs)).toEqual({ operationId: "test", index: 0, kind: `${operationType}:${entity}`, label: operationType, status: "changed", dependencies: [], owners: result.owners, changes: result.changes });
  expect({ state, operation, inputs }).toEqual(before);
  expect(changeOperationSchema.safeParse({ ...operation, after: { ...after, unexpected: true } }).success).toBe(false);
});

it.each(["park", "archive"] as const)("retains standalone %s state and describes its complete changes", (command) => {
  const state = snapshot();
  const operation = op({ op: command, entity: "card", entityId: id(3), after: command === "park" ? { childStrategy: "unassign" } : {} });
  const expected = structuredClone(state);
  Object.assign(expected.cards[0]!, command === "park" ? { parked: true, version: 2, updatedAt: changedAt } : { archived: true, version: 2, updatedAt: changedAt });
  const change = { entity: "card", entityId: id(3), before: state.cards[0], after: expected.cards[0] };
  const description = { operationId: "test", index: 0, kind: `${command}:card`, label: command, status: "changed", dependencies: [], owners: [{ entity: "card", entityId: id(3), projectId: id(1) }], changes: [change] };
  expect(resolveOperation(state, operation, supply())).toEqual({ ...description, state: expected });
  expect(describeOperation(state, operation, supply())).toEqual(description);
});

it.each([
  { entity: "cardPersona", op: "set", after: { cardId: id(3), personaId: id(5) } },
  { entity: "cardPersona", op: "unset", after: { cardId: id(30), personaId: id(5) } },
  { entity: "cardAnnotation", op: "set", after: { cardId: id(3), annotationId: id(10) } },
  { entity: "cardAnnotation", op: "unset", after: { cardId: id(30), annotationId: id(10) } },
  { entity: "externalRef", op: "set", after: { entityType: "card", entityId: id(3), scopeId: id(2), system: "bmad", externalId: "card" } }
])("preserves exact state and addressed owner for idempotent $op:$entity", (input) => {
  const state = snapshot();
  const operation = op({ ...input, entityId: "addressed" });
  const cardId = "cardId" in input.after ? input.after.cardId : input.after.entityId;
  const expected = { operationId: "test", index: 0, kind: `${input.op}:${input.entity}`, label: input.op, status: "unchanged", dependencies: [], owners: [{ entity: "card", entityId: cardId, projectId: id(1) }], changes: [] };
  expect(resolveOperation(state, operation, supply())).toEqual({ ...expected, state });
  expect(describeOperation(state, operation, supply())).toEqual(expected);
});

it("refuses non-Issue and non-Milestone GitHub identity locators", () => {
  expect(changeOperationSchema.safeParse({ operationId: "invalid", op: "create", entity: "githubExternalRef", after: { entityType: "card", entityId: id(30), scopeId: id(2), externalId: "https://github.com/org/repo" } }).success).toBe(false);
});

it("refuses deleting an in-use Workflow Status with indexed conflicts and immutable inputs", () => {
  const state = snapshot();
  state.cards[1]!.status = state.workflowStatuses[0]!.name;
  const operation = op({ operationId: "delete-used-status", op: "delete", entity: "workflowStatus", entityId: id(11), after: {} });
  const inputs = supply();
  const before = structuredClone({ state, operation, inputs });
  for (const resolve of [resolveOperation, describeOperation]) {
    expect(() => resolve(state, operation, inputs, 7)).toThrowError(expect.objectContaining({ operationId: "delete-used-status", index: 7, code: "conflict", message: "Operation delete-used-status at index 7: Workflow status is still used by Cards." }));
    expect({ state, operation, inputs }).toEqual(before);
  }
});

it("applies all four bulk relationship fields and individual baselines with exact coalesced effects", () => {
  const state = snapshot();
  state.cards[0]!.version = 3; state.cards[1]!.version = 7;
  state.personas.push({ ...state.personas[0]!, id: id(31), name: "New reader" });
  state.annotations.push({ ...state.annotations[0]!, id: id(32), name: "New risk" });
  const operation = op({ op: "bulk", entity: "card", entityId: "batch", after: { storyMapId: id(2), cards: [{ id: id(3), baseVersion: 3 }, { id: id(30), baseVersion: 7 }], patch: { status: "active", releaseId: null, estimate: 7, color: "#123456", addPersonaId: id(31), removePersonaId: id(5), addAnnotationId: id(32), removeAnnotationId: id(10) } } });
  const inputs = { ...supply(), bulkRelationshipIds: { test: { [id(3)]: { persona: id(100), annotation: id(101) }, [id(30)]: { persona: id(102), annotation: id(103) } } } };
  const expected = structuredClone(state);
  expected.cards.forEach((card) => Object.assign(card, { status: "active", releaseId: null, estimate: 7, color: "#123456", version: card.version + 1, updatedAt: changedAt }));
  expected.cardPersonas = [{ id: id(100), cardId: id(3), personaId: id(31), createdAt: changedAt }, { id: id(102), cardId: id(30), personaId: id(31), createdAt: changedAt }];
  expected.cardAnnotations = [{ id: id(101), cardId: id(3), annotationId: id(32), createdAt: changedAt }, { id: id(103), cardId: id(30), annotationId: id(32), createdAt: changedAt }];
  const effects: Oracle["effects"] = [["card", 3], ["card", 30], ["cardPersona", 15], ["cardPersona", 100], ["cardPersona", 102], ["cardAnnotation", 16], ["cardAnnotation", 101], ["cardAnnotation", 103]];
  const before = structuredClone({ state, operation, inputs });
  const result = resolveOperation(state, operation, inputs);
  expect(result.state).toEqual(expected);
  expect(sorted(result.changes)).toEqual(sorted(exactEffects(state, expected, effects)));
  expect(sorted(result.owners)).toEqual([{ entity: "card", entityId: id(3), projectId: id(1) }, { entity: "card", entityId: id(30), projectId: id(1) }]);
  const { state: _resolvedState, ...description } = result;
  expect(describeOperation(state, operation, inputs)).toEqual(description);
  expect(resolveOperation(state, operation, inputs)).toEqual(result);
  expect({ state, operation, inputs }).toEqual(before);
  const invalid = structuredClone(operation) as Extract<ChangeOperation, { op: "bulk" }>;
  invalid.after.cards[1]!.baseVersion = 6;
  expect(() => resolveOperation(state, invalid, inputs)).toThrow("baseline");
  expect({ state, operation, inputs }).toEqual(before);
});

it("describes the exact composite copy graph and its real owning roots", () => {
  const state = snapshot();
  state.mapFingerprints = { [id(2)]: chunkId };
  const operation = op({ op: "create", entity: "storyMapCopy", entityId: id(100), after: { input: { sourceStoryMapId: id(2), targetName: "Copy" }, expected: { [id(2)]: chunkId }, preview: { source: { id: id(2), name: "Map" }, target: { id: id(100), name: "Copy" }, inventory: {} } } });
  const identities = Object.fromEntries([3, 30, 4, 6, 7, 8, 9, 13, 14, 15, 16, 19, 20].map((number) => [id(number), id(number + 400)]));
  const inputs = { ...supply(), copyIds: { test: identities } };
  const original = structuredClone({ state, operation, inputs });
  const expected = structuredClone(state);
  expected.storyMaps.push({ ...state.storyMaps[0]!, id: id(100), name: "Copy", version: 1, createdAt: changedAt, updatedAt: changedAt });
  expected.cards.push({ ...state.cards[0]!, id: id(403), storyMapId: id(100), releaseId: id(404), creationOrigin: "inference", provenance: "linked", version: 1, createdAt: changedAt, updatedAt: changedAt }, { ...state.cards[1]!, id: id(430), storyMapId: id(100), creationOrigin: "inference", provenance: "linked", version: 1, createdAt: changedAt, updatedAt: changedAt });
  expected.releases.push({ ...state.releases[0]!, id: id(404), storyMapId: id(100), version: 1 });
  expected.roadmaps.push({ ...state.roadmaps[0]!, id: id(406), storyMapId: id(100), version: 1, createdAt: changedAt, updatedAt: changedAt });
  expected.roadmapColumns.push({ ...state.roadmapColumns[0]!, id: id(407), roadmapId: id(406) });
  expected.roadmapSwimlanes.push({ ...state.roadmapSwimlanes[0]!, id: id(408), roadmapId: id(406) });
  expected.roadmapCards.push({ ...state.roadmapCards[0]!, id: id(409), roadmapId: id(406), columnId: id(407), swimlaneId: id(408) });
  expected.productContexts.push({ ...state.productContexts[0]!, id: id(413), storyMapId: id(100), updatedAt: changedAt });
  expected.attachments.push({ ...state.attachments[0]!, id: id(414), cardId: id(403), createdAt: changedAt });
  expected.cardPersonas.push({ ...state.cardPersonas[0]!, id: id(415), cardId: id(403), createdAt: changedAt });
  expected.cardAnnotations.push({ ...state.cardAnnotations[0]!, id: id(416), cardId: id(403), createdAt: changedAt });
  expected.externalRefs.push({ ...state.externalRefs.find((ref) => ref.id === id(19))!, id: id(419), entityId: id(403), scopeId: id(100), createdAt: changedAt });
  expected.githubLinks.push({ ...state.githubLinks[0]!, id: id(419), cardId: id(403) });
  const evidence = state.sourceLinks[0]!;
  if (evidence.kind !== "github") throw new Error("Expected GitHub fixture evidence.");
  expected.sourceLinks.push({ ...evidence, id: id(420), cardId: id(430), externalRefId: id(419) });
  const effects: Oracle["effects"] = [["storyMap", 100], ["card", 403], ["card", 430], ["release", 404], ["roadmap", 406], ["roadmapColumn", 407], ["roadmapSwimlane", 408], ["roadmapCard", 409], ["productContext", 413], ["attachment", 414], ["cardPersona", 415], ["cardAnnotation", 416], ["externalRef", 419], ["sourceLink", 420]];
  const result = resolveOperation(state, operation, inputs);
  expect(result.state).toEqual(expected);
  expect(sorted(result.changes)).toEqual(sorted(exactEffects(state, expected, effects)));
  expect(sorted(result.owners)).toEqual(sorted([{ entity: "card", entityId: id(403), projectId: id(1) }, { entity: "card", entityId: id(430), projectId: id(1) }, { entity: "storyMap", entityId: id(100), projectId: id(1) }, { entity: "release", entityId: id(404), projectId: id(1) }, { entity: "roadmap", entityId: id(406), projectId: id(1) }]));
  const { state: _resultState, ...description } = result;
  expect(description).toMatchObject({ operationId: "test", index: 0, kind: "create:storyMapCopy", label: "create", status: "changed", dependencies: [] });
  expect(describeOperation(state, operation, inputs)).toEqual(description);
  expect(resolveOperation(state, operation, inputs)).toEqual(result);
  expect({ state, operation, inputs }).toEqual(original);
});

it("describes an empty-board import with an exact new Map and no unrelated effects", () => {
  const state = snapshot();
  const operation = op({ op: "create", entity: "githubBoardImport", entityId: "board", after: { input: { projectId: id(1), storyMapName: "Imported", boardUrl: "https://github.com/orgs/org/projects/1", issues: [] }, expected: {}, preview: { connectors: [], sync: { removals: [], overwrites: [] }, cleanup: [] } } });
  const expected = structuredClone(state);
  const map = { id: id(100), projectId: id(1), name: "Imported", description: "Imported from https://github.com/orgs/org/projects/1", version: 1, estimationUnit: "points", cardKeyPrefix: "LSM", createdAt: changedAt, updatedAt: changedAt };
  expected.storyMaps.push(map);
  const description = { operationId: "test", index: 0, kind: "create:githubBoardImport", label: "create", status: "changed", dependencies: [], owners: [{ entity: "storyMap", entityId: id(100), projectId: id(1) }], changes: [{ entity: "storyMap", entityId: id(100), after: map }] };
  const inputs = supply();
  const original = structuredClone({ state, operation, inputs });
  expect(resolveOperation(state, operation, inputs)).toEqual({ ...description, state: expected });
  expect(describeOperation(state, operation, inputs)).toEqual(description);
  expect(resolveOperation(state, operation, inputs)).toEqual({ ...description, state: expected });
  expect({ state, operation, inputs }).toEqual(original);
});

it("seeds Roadmaps and coalesces every child write under its real root", () => {
  const operation = op({ op: "create", entity: "roadmap", after: { projectId: id(1), name: "New" } });
  const result = resolveOperation(snapshot(), operation, supply());
  expect(result.state.roadmapColumns.slice(1).map((row) => row.name)).toEqual(["Now", "Next", "Later"]);
  expect(result.state.roadmapSwimlanes.at(-1)).toMatchObject({ name: "Default", roadmapId: id(100) });
  expect(result.owners).toEqual([{ entity: "roadmap", entityId: id(100), projectId: id(1) }]);
  const operations = [op({ operationId: "column", op: "create", entity: "roadmapColumn", entityId: "column-local", after: { roadmapId: id(6), name: "Later" }, baseVersion: 1 }), op({ operationId: "card", op: "create", entity: "roadmapCard", after: { roadmapId: id(6), columnId: "column-local", title: "Goal" }, baseVersion: 1 })];
  const inputs = { ...supply(), ids: { column: id(101), card: id(102) } };
  const folded = resolveOperations(snapshot(), operations, inputs);
  expect(folded.state.roadmaps[0]!.version).toBe(2);
  expect(folded.operations[1]!.dependencies).toContain("column");
  expect(resolveOperations(snapshot(), operations, inputs, ["card"]).selectedOperationIds).toEqual([]);
});

it("previews prepared source imports and locator links with transitive deselection", () => {
  const state = snapshot();
  const operations = [op({ operationId: "import", op: "import", entity: "sourceDocument", after: { projectId: id(1), title: "New", type: "txt", fileHash: "b".repeat(64) } }), op({ operationId: "link", op: "link", entity: "sourceLink", entityId: "evidence", after: { kind: "chunk", cardId: id(30), chunk: { kind: "import", operationId: "import", locator: "L1" } } })];
  const inputs = { ...supply(), ids: { import: id(101), link: id(102) }, preparedSourceImports: { import: { document: { ...state.sourceDocuments[0]!, id: id(101), title: "New", fileHash: "b".repeat(64) }, chunks: [{ id: "c".repeat(64), documentId: id(101), locator: "L1", text: "New requirement" }] } } };
  const original = structuredClone({ state, operations, inputs });
  const result = resolveOperations(state, operations, inputs);
  const imported = structuredClone(state);
  imported.sourceDocuments.push(inputs.preparedSourceImports.import.document);
  imported.sourceChunks.push(...inputs.preparedSourceImports.import.chunks);
  const importDescription = { operationId: "import", index: 0, kind: "import:sourceDocument", label: "import", status: "changed", dependencies: [], owners: [{ entity: "project", entityId: id(1), projectId: id(1) }], changes: [{ entity: "sourceDocument", entityId: id(101), after: inputs.preparedSourceImports.import.document }, { entity: "sourceChunk", entityId: "c".repeat(64), after: inputs.preparedSourceImports.import.chunks[0] }] };
  expect(result.operations[0]).toEqual({ ...importDescription, state: imported });
  expect(describeOperation(state, operations[0]!, inputs)).toEqual(importDescription);
  const linked = structuredClone(imported);
  linked.cards[1]!.version = 2; linked.cards[1]!.provenance = "linked";
  const link = { id: id(102), kind: "chunk" as const, cardId: id(30), chunkId: "c".repeat(64), confidence: null, createdAt: changedAt };
  linked.sourceLinks.push(link);
  expect(result.operations[1]).toEqual({ operationId: "link", index: 1, kind: "link:sourceLink", label: "link", status: "changed", dependencies: ["import"], owners: [{ entity: "card", entityId: id(30), projectId: id(1) }], changes: [{ entity: "card", entityId: id(30), before: imported.cards[1], after: linked.cards[1] }, { entity: "sourceLink", entityId: id(102), after: link }], state: linked });
  expect(result.state).toEqual(linked);
  expect(resolveOperations(state, operations, inputs)).toEqual(result);
  expect({ state, operations, inputs }).toEqual(original);
  expect(resolveOperations(state, operations, inputs, ["link"]).selectedOperationIds).toEqual([]);
  const invalid = op({ ...operations[1], after: { kind: "chunk", cardId: id(30), chunk: { kind: "import", operationId: "import", locator: "unknown" } } });
  expect(() => resolveOperations(state, [operations[0]!, invalid], inputs)).toThrow(/Unknown source-import locator/);
  expect(() => resolveOperations(state, [operations[1]!, operations[0]!], inputs)).toThrow(/forward source-import/);
});

it("uses persisted owner scope before alias collisions for relationships and Roadmap children", () => {
  const state = snapshot();
  state.projects.push({ ...state.projects[0]!, id: id(40) });
  state.annotations.push({ ...state.annotations[0]!, id: id(41), projectId: id(40) });
  const operations = [op({ operationId: "annotation", op: "create", entity: "annotation", entityId: id(41), after: { projectId: id(1), name: "Alias" } }), op({ operationId: "link", op: "set", entity: "cardAnnotation", entityId: "link-local", after: { cardId: id(30), annotationId: id(41) } })];
  expect(() => resolveOperations(state, operations, { ...supply(), ids: { annotation: id(100), link: id(101) } })).toThrow(/foreign/);
  state.roadmaps.push({ ...state.roadmaps[0]!, id: id(42), projectId: id(40), storyMapId: null });
  const child = op({ op: "create", entity: "roadmapColumn", after: { roadmapId: id(42), name: "Foreign" } });
  expect(() => resolveOperation(state, child, supply())).toThrow(/foreign/);
});

it("deleting roots reports before-state owners and all existing relationship effects", () => {
  const result = resolveOperation(snapshot(), op({ op: "delete", entity: "card", entityId: id(3), after: { strategy: "unassign" } }), supply());
  expect(result.owners).toContainEqual({ entity: "card", entityId: id(3), projectId: id(1) });
  expect(result.state.sourceLinks).toEqual([]);
  expect(result.state.cards.find((card) => card.id === id(30))).toMatchObject({ provenance: "manual", version: 2 });
  expect(result.state.cardPersonas).toEqual([]);
  expect(result.state.attachments).toEqual([]);
  expect(result.state.externalRefs).toEqual([]);
});

it("retains dependencies for indirect deletion effects, including earlier relationships", () => {
  const operations = [op({ operationId: "link", op: "set", entity: "cardAnnotation", entityId: "link-local", after: { cardId: id(30), annotationId: id(10) } }), op({ operationId: "remove", op: "delete", entity: "annotation", entityId: id(10), after: { definitionBefore: snapshot().annotations[0]!, affectedCards: [{ id: id(3), baseVersion: 1 }, { id: id(30), baseVersion: 1 }], confirmUnlink: true } }), op({ operationId: "edit", op: "update", entity: "card", entityId: id(30), after: { title: "Later" } })];
  const inputs = { ...supply(), ids: { link: id(101) } };
  const result = resolveOperations(snapshot(), operations, inputs);
  expect(result.operations[1]!.dependencies).toContain("link");
  expect(result.operations[2]!.dependencies).toContain("remove");
  expect(resolveOperations(snapshot(), operations, inputs, ["remove", "edit"]).selectedOperationIds).toEqual([]);
});

it("refuses literal prepared chunk IDs and preserves persisted deduplication", () => {
  const state = snapshot();
  const imported = op({ operationId: "import", op: "import", entity: "sourceDocument", after: { projectId: id(1), title: "New", type: "txt", fileHash: "b".repeat(64) } });
  const literal = op({ operationId: "link", op: "link", entity: "sourceLink", entityId: "link-local", after: { kind: "chunk", cardId: id(30), chunkId: "c".repeat(64) } });
  const inputs = { ...supply(), ids: { import: id(101), link: id(102) }, preparedSourceImports: { import: { document: { ...state.sourceDocuments[0]!, id: id(101), title: "New", fileHash: "b".repeat(64) }, chunks: [{ id: "c".repeat(64), documentId: id(101), locator: "L1", text: "New" }] } } };
  expect(() => resolveOperations(state, [imported, literal], inputs)).toThrow(/Literal source chunk requires persisted ownership/);
  const duplicate = op({ operationId: "import", op: "import", entity: "sourceDocument", after: { projectId: id(1), title: "Source", type: "txt", fileHash: chunkId } });
  const link = op({ operationId: "link", op: "link", entity: "sourceLink", entityId: "link-local", after: { kind: "chunk", cardId: id(30), chunk: { kind: "import", operationId: "import", locator: "L1" } } });
  const reused = resolveOperations(state, [duplicate, link], { ...inputs, preparedSourceImports: { import: { document: state.sourceDocuments[0]!, chunks: state.sourceChunks } } });
  expect(reused.state.sourceDocuments).toHaveLength(1);
  expect(reused.operations[0]!.status).toBe("unchanged");
  expect(reused.state.sourceLinks.at(-1)).toMatchObject({ chunkId });
});

it("refuses copy fingerprints after an earlier simulated source edit", () => {
  const state = snapshot();
  state.mapFingerprints = { [id(2)]: chunkId };
  const edit = op({ operationId: "edit", op: "update", entity: "card", entityId: id(3), after: { title: "Changed" } });
  const copy = op({ operationId: "copy", op: "create", entity: "storyMapCopy", entityId: id(100), after: { input: { sourceStoryMapId: id(2), targetName: "Copy" }, expected: { [id(2)]: chunkId }, preview: { source: { id: id(2), name: "Map" }, target: { id: id(100), name: "Copy" }, inventory: {} } } });
  expect(() => resolveOperations(state, [edit, copy], { ...supply(), ids: { copy: id(100) }, copyIds: { copy: {} } })).toThrow(/Story Map changed after the proposal/);
  expect(state.mapFingerprints).toEqual({ [id(2)]: chunkId });
});

it("resolves earlier Map and Card aliases in bulk and deselects their dependent batch", () => {
  const operations = [op({ operationId: "map", op: "create", entity: "storyMap", entityId: "map-local", after: { projectId: id(1), name: "New Map" } }), op({ operationId: "card", op: "create", entity: "card", entityId: "card-local", after: { storyMapId: id(100), level: "activity", title: "New Card" } }), op({ operationId: "bulk", op: "bulk", entity: "card", entityId: "batch", after: { storyMapId: "map-local", cards: [{ id: "card-local", baseVersion: 1 }], patch: { status: "active" } } })];
  const inputs = { ...supply(), ids: { map: id(100), card: id(101) } };
  const result = resolveOperations(snapshot(), operations, inputs);
  expect(result.state.cards.at(-1)).toMatchObject({ storyMapId: id(100), status: "active", version: 1 });
  expect(result.operations[2]!.dependencies).toContain("map");
  expect(result.operations[2]!.dependencies).toContain("card");
  expect(resolveOperations(snapshot(), operations, inputs, ["bulk"]).selectedOperationIds).toEqual([]);
  expect(resolveOperations(snapshot(), operations, inputs, ["card", "bulk"]).selectedOperationIds).toEqual([]);
});


it.each(["remoteWorkItemLink", "syncRun"] as const)("reports deleted reviewed connections as indexed conflicts for %s", (entity) => {
  const connectionBefore = connectorConnectionSchema.parse({ id: id(50), projectId: id(1), provider: "github", name: "Reviewed connection", authMode: "github-cli", owner: "org", repository: "repo", createdAt, updatedAt: createdAt });
  const after = entity === "syncRun" ? { projectId: id(1), storyMapId: id(2), connectionId: id(50), provider: "github", mode: "sync", status: "applied" } : { connectionId: id(50), externalRefId: id(19), syncState: "synced" };
  const operation = op({ entity, op: entity === "syncRun" ? "create" : "set", entityId: "reviewed-local", connectionBefore, after });
  const state = snapshot();
  const before = structuredClone(state);
  expect(() => resolveOperation(state, operation, supply(), 7)).toThrow(OperationResolutionError);
  expect(() => resolveOperation(state, operation, supply(), 7)).toThrow(expect.objectContaining({ code: "conflict", operationId: "test", index: 7 }));
  expect(state).toEqual(before);
});


it("collects Release baseline conflicts for newly created remote work item links", () => {
  const state = snapshot();
  state.releases[0]!.version = 3;
  state.externalRefs.push({ id: id(69), entityType: "release", entityId: id(4), scopeId: id(2), system: "github", externalId: "https://github.com/org/repo/milestone/1", syncedVersion: 1, createdAt });
  const operation = op({ op: "set", entity: "remoteWorkItemLink", baseVersion: 2, after: { connectionId: id(50), externalRefId: id(69), syncState: "synced" } });
  expect(collectOperationConflicts(state, [operation], supply())).toEqual([{ entity: "release", id: id(4), baseVersion: 2, currentVersion: 3, current: state.releases[0], operationId: "test", index: 0 }]);
  expect(collectOperationConflicts(state, [{ ...operation, baseVersion: 3 }], supply())).toEqual([]);
});

function syncSnapshot(): OperationSnapshot {
  const state = snapshot();
  state.connections = [connectorConnectionSchema.parse({ id: id(50), projectId: id(1), provider: "github", name: "GitHub", authMode: "github-cli", owner: "org", repository: "repo", createdAt, updatedAt: createdAt })];
  state.remoteWorkItemLinks = [{ id: id(60), externalRefId: id(19), remoteNumber: 1, connectionId: id(50), provider: "github", cardId: id(3), remoteId: "1", url: "https://github.com/org/repo/issues/1", syncState: "conflict", parentOverrideLocal: false, labels: [] }];
  state.syncRuns = [{ id: id(61), projectId: id(1), storyMapId: id(2), connectionId: id(50), provider: "github", mode: "sync", status: "applied", summary: "Reviewed", createdAt }];
  state.syncConflicts = [{ id: id(62), externalRefId: id(19), syncRunId: id(61), connectionId: id(50), cardId: id(3), remoteId: "1", field: "title", localValue: "Activity", remoteValue: "Remote", status: "open", createdAt }, { id: id(63), externalRefId: id(19), syncRunId: id(61), connectionId: id(50), cardId: id(3), remoteId: "1", field: "description", localValue: "Local body", remoteValue: "Remote body", status: "open", createdAt }];
  return state;
}

it("locks only changed disputed fields across upsert, move, bulk and unrelated child writes", () => {
  const state = syncSnapshot();
  state.syncConflicts = [state.syncConflicts![0]!];
  state.externalRefs.push({ id: id(70), entityType: "card", entityId: id(3), scopeId: id(2), system: "planning", externalId: "activity", syncedVersion: 1, createdAt });
  const upsert = op({ op: "upsert", entity: "card", selector: { kind: "externalRef", system: "planning", externalId: "activity", scopeId: id(2) }, after: { storyMapId: id(2), level: "activity", title: state.cards[0]!.title, description: "Independent" } });
  expect(collectOperationConflicts(state, [upsert], supply())).toEqual([]);
  expect(collectOperationConflicts(state, [op({ ...upsert, after: { ...upsert.after, title: "Blocked" } })], supply())).toMatchObject([{ reason: "sync", syncConflictId: id(62) }]);
  for (const operation of [op({ op: "move", entity: "card", entityId: id(3), after: { parentId: null, position: 0 } }), op({ op: "update", entity: "card", entityId: id(3), after: { estimate: 8 } }), op({ op: "create", entity: "attachment", after: { cardId: id(3), label: "Evidence", filePath: "evidence.txt" } })]) expect(collectOperationConflicts(state, [operation], supply())).toEqual([]);
  state.cards[0]!.version = 3;
  const mixed = collectOperationConflicts(state, [op({ op: "update", entity: "card", entityId: id(3), baseVersion: 1, after: { title: "Blocked" } })], supply());
  expect(mixed).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "sync", syncConflictId: id(62) }), expect.objectContaining({ baseVersion: 1, currentVersion: 3 })]));
  const evidence = { titleHash: "acknowledged", bodyHash: "body", statusLabels: [], annotationLabels: [], milestone: null, releaseMetadata: null };
  state.remoteWorkItemLinks[0]!.baseline = { pendingReleaseAssignment: false, acknowledgedLocal: { ...evidence, releaseId: null }, observedRemote: evidence };
  const after = remoteWorkItemSyncStateSchema.omit({ id: true }).parse(state.remoteWorkItemLinks[0]);
  after.baseline!.acknowledgedLocal.titleHash = "Unreviewed substitution";
  expect(collectOperationConflicts(state, [op({ op: "set", entity: "remoteWorkItemLink", after })], supply())).toMatchObject([{ reason: "sync", syncConflictId: id(62) }]);
});

it("locks shared Release metadata and managed Annotation assignments without blocking unrelated fields", () => {
  const state = syncSnapshot();
  state.connections[0]!.labelsAsAnnotations = true;
  state.annotations.push({ id: id(71), projectId: id(1), storyMapId: id(2), name: "managed", icon: "tag", color: "#eef2ff", position: 0 });
  state.cardAnnotations.push({ id: id(72), cardId: id(3), annotationId: id(71), createdAt });
  state.cards[0]!.releaseId = id(4);
  state.syncConflicts = [{ ...state.syncConflicts![0]!, field: "milestone" }, { ...state.syncConflicts![1]!, field: "labels" }];
  const release = (after: object) => op({ op: "update", entity: "release", entityId: id(4), after });
  expect(collectOperationConflicts(state, [release({ name: "Blocked" })], supply())).toMatchObject([{ id: id(3), syncConflictId: id(62), reason: "sync" }]);
  expect(collectOperationConflicts(state, [release({ position: 0, startDate: "2026-10-20" })], supply())).toEqual([]);
  expect(collectOperationConflicts(state, [op({ op: "move", entity: "card", entityId: id(3), after: { parentId: null, position: 0, releaseId: null } })], supply())).toMatchObject([{ syncConflictId: id(62) }]);
  expect(collectOperationConflicts(state, [op({ op: "bulk", entity: "card", entityId: id(2), after: { storyMapId: id(2), cards: [{ id: id(3), baseVersion: 1 }], patch: { removeAnnotationId: id(71) } } })], supply())).toMatchObject([{ syncConflictId: id(63) }]);
  expect(collectOperationConflicts(state, [op({ op: "update", entity: "annotation", entityId: id(71), after: { name: "Renamed" } })], supply())).toMatchObject([{ syncConflictId: id(63) }]);
  expect(collectOperationConflicts(state, [op({ op: "update", entity: "annotation", entityId: id(71), after: { color: "#ffffff" } })], supply())).toEqual([]);
});

it("resolves one reviewed field while preserving unrelated open conflicts", () => {
  const state = syncSnapshot();
  const operations = [op({ operationId: "resolve", op: "resolve", entity: "syncConflict", entityId: id(62), before: state.syncConflicts![0], after: { resolution: "remote", reviewed: { localValue: "Activity", remoteValue: "Remote" } } }), op({ operationId: "edit", op: "update", entity: "card", entityId: id(3), baseVersion: 1, after: { title: "Remote" } })];
  expect(collectOperationConflicts(state, operations, supply())).toEqual([]);
  const link = state.remoteWorkItemLinks[0]!;
  const evidence = { titleHash: "remote-title", bodyHash: "body", statusLabels: [], annotationLabels: [], milestone: null, releaseMetadata: null };
  const baseline = op({ operationId: "baseline", op: "set", entity: "remoteWorkItemLink", before: link, after: { externalRefId: link.externalRefId, connectionId: link.connectionId, labels: [], syncState: "conflict", parentOverrideLocal: false, baseline: { pendingReleaseAssignment: false, acknowledgedLocal: { ...evidence, releaseId: id(4) }, observedRemote: evidence } } });
  const prepared = { ...supply(), syncTextHashes: { Remote: "remote-title", Activity: "local-title" } };
  expect(() => resolveOperations(state, [operations[0]!], supply())).toThrow("baseline effect before closure");
  expect(() => resolveOperations(state, [baseline, operations[0]!], prepared)).toThrow("chosen field and canonical baseline do not agree");
  const result = resolveOperations(state, [operations[1]!, baseline, operations[0]!], prepared);
  expect(result.state.cards[0]!.title).toBe("Remote");
  expect(result.state.syncConflicts![0]!.status).toBe("resolved-remote");
  expect(result.state.syncConflicts![1]).toEqual(state.syncConflicts![1]);
  const unrelated = op({ operationId: "edit", op: "update", entity: "card", entityId: id(3), after: { description: "Forbidden" } });
  expect(collectOperationConflicts(state, [operations[0]!, unrelated], supply())).toMatchObject([{ operationId: "edit", index: 1, syncConflictId: id(63) }]);
  expect(collectOperationConflicts(state, [operations[1]!], supply())).toMatchObject([{ operationId: "edit", index: 0, syncConflictId: id(62) }]);
  const converged = structuredClone(state); converged.cards[0]!.title = "Remote";
  expect(resolveOperations(converged, [baseline, operations[0]!], prepared).state.syncConflicts![0]!.status).toBe("resolved-remote");
});

it.each(["field", "cardId", "connectionId", "remoteId", "localValue", "remoteValue"] as const)("rejects deferred reviewed conflict %s drift with its operation index", (field) => {
  const state = syncSnapshot();
  const operation = op({ op: "resolve", entity: "syncConflict", entityId: id(62), before: structuredClone(state.syncConflicts![0]), after: { resolution: "remote", reviewed: { localValue: "Activity", remoteValue: "Remote" } } });
  Object.assign(state.syncConflicts![0]!, { [field]: field === "cardId" ? id(30) : field === "connectionId" ? id(51) : field === "field" ? "description" : "Drift" });
  expect(() => resolveOperation(state, operation, supply(), 4)).toThrow(expect.objectContaining({ code: "conflict", operationId: "test", index: 4 }));
});

it.each(["remoteWorkItemLink", "syncRun", "syncConflict"] as const)("rejects unsupported selectors for %s", (entity) => {
  const state = syncSnapshot();
  const { id: _linkId, provider: _provider, cardId: _cardId, releaseId: _releaseId, remoteId: _remoteId, remoteNumber: _number, url: _url, ...link } = state.remoteWorkItemLinks[0]!;
  const { id: _runId, createdAt: _createdAt, ...run } = state.syncRuns![0]!;
  const value = entity === "remoteWorkItemLink" ? { op: "set", after: link } : entity === "syncRun" ? { op: "create", after: run } : { op: "resolve", before: state.syncConflicts![0], after: { resolution: "remote", reviewed: { localValue: "Activity", remoteValue: "Remote" } } };
  const operation = { operationId: "test", entityId: id(62), entity, ...value };
  expect(changeOperationSchema.safeParse(operation).success).toBe(true);
  expect(changeOperationSchema.safeParse({ ...operation, selector: { kind: "id", id: id(63) } }).success).toBe(false);
});

it("rejects SyncRun provider drift and incoherent conflict relationships", () => {
  const state = syncSnapshot();
  const { id: _id, createdAt: _date, ...run } = state.syncRuns![0]!;
  const providerDrift = structuredClone(state); Object.assign(providerDrift.connections[0]!, { provider: "unsupported" });
  expect(() => resolveOperation(providerDrift, op({ op: "create", entity: "syncRun", entityId: "run-local", after: run }), supply(), 2)).toThrow(expect.objectContaining({ code: "validation", index: 2 }));
  for (const patch of [{ connectionId: id(51) }, { cardId: id(30) }, { remoteId: "wrong" }]) {
    const before = { ...state.syncConflicts![0]!, ...patch };
    const changed = structuredClone(state); changed.syncConflicts![0] = before;
    expect(() => resolveOperation(changed, op({ op: "resolve", entity: "syncConflict", entityId: before.id, before, after: { resolution: "remote", reviewed: { localValue: "Activity", remoteValue: "Remote" } } }), supply(), 3)).toThrow(expect.objectContaining({ code: "validation", index: 3 }));
  }
});

it.each(["syncRun", "syncConflict"] as const)("rejects persisted and earlier allocated %s collisions", (entity) => {
  const state = syncSnapshot();
  const source = entity === "syncRun" ? state.syncRuns![0]! : state.syncConflicts![0]!;
  const { id: existingId, createdAt: _created, ...after } = source;
  const first = op({ op: "create", entity, entityId: "first-local", after: entity === "syncConflict" ? { ...after, field: "status" } : after });
  expect(() => resolveOperation(state, first, { ...supply(), ids: { test: existingId } }, 5)).toThrow(expect.objectContaining({ code: "validation", index: 5 }));
  const second = op({ ...first, operationId: "second", entityId: "second-local", ...(entity === "syncConflict" ? { after: { ...after, field: "labels" } } : {}) });
  expect(() => resolveOperations(state, [first, second], { ...supply(), ids: { test: id(100), second: id(100) } })).toThrow(expect.objectContaining({ code: "validation", operationId: "second", index: 1 }));
});

it("reports combined divergent Card fields even when stored selection omits both runs", () => {
  const state = syncSnapshot(); state.syncConflicts = [];
  const { id: _id, createdAt: _created, ...run } = state.syncRuns![0]!;
  const operations = [op({ operationId: "run-one", op: "create", entity: "syncRun", entityId: "run-one-local", after: run }), op({ operationId: "first", op: "update", entity: "card", entityId: id(3), baseVersion: 1, after: { title: "First" } }), op({ operationId: "run-two", op: "create", entity: "syncRun", entityId: "run-two-local", after: { ...run, connectionId: id(51) } }), op({ operationId: "second", op: "update", entity: "card", entityId: id(3), baseVersion: 1, after: { title: "Second" } })];
  expect(collectOperationConflicts(state, operations, supply(), ["first", "second"])).toMatchObject([{ operationId: "first", index: 1, reason: "fingerprint" }, { operationId: "second", index: 3, reason: "fingerprint" }]);
});

it("refuses generic deletion of an adapter-owned canonical reference", () => {
  const state = snapshot();
  const before = structuredClone(state);
  expect(() => resolveOperation(state, op({ op: "delete", entity: "externalRef", entityId: id(19), after: {} }), supply())).toThrow("reserved");
  expect(state).toEqual(before);
});

it("detaches previous sync membership when rebinding the canonical remote locator", () => {
  const state = syncSnapshot();
  const operation = op({ op: "update", entity: "githubExternalRef", entityId: id(19), baseVersion: 1, after: { entityType: "card", entityId: id(3), scopeId: id(2), externalId: "https://github.com/org/repo/issues/2" } });
  const result = resolveOperation(state, operation, supply());
  expect(result.state.externalRefs.find((ref) => ref.id === id(19))?.externalId).toBe("https://github.com/org/repo/issues/2");
  expect(result.state.remoteWorkItemLinks).toEqual([]);
});

it("reports divergent shared Release metadata even when selected operations omit both sync runs", () => {
  const state = syncSnapshot(); state.syncConflicts = [];
  const { id: _id, createdAt: _created, ...run } = state.syncRuns![0]!;
  const release = state.releases[0]!;
  const operations = [op({ operationId: "release-run-one", op: "create", entity: "syncRun", entityId: "release-run-one-local", after: run }), op({ operationId: "release-first", op: "update", entity: "release", entityId: release.id, baseVersion: release.version, after: { name: "First", releaseDate: "2026-11-01" } }), op({ operationId: "release-run-two", op: "create", entity: "syncRun", entityId: "release-run-two-local", after: { ...run, connectionId: id(51) } }), op({ operationId: "release-second", op: "update", entity: "release", entityId: release.id, baseVersion: release.version, after: { name: "Second", releaseDate: "2026-11-02" } })];
  expect(collectOperationConflicts(state, operations, supply(), ["release-first", "release-second"])).toEqual(expect.arrayContaining([expect.objectContaining({ entity: "storyMap", id: release.storyMapId, operationId: "release-first", reason: "fingerprint" }), expect.objectContaining({ entity: "storyMap", id: release.storyMapId, operationId: "release-second", reason: "fingerprint" })]));
});

it("refuses a sync baseline that acknowledges a Release of another Story Map", () => {
  const state = syncSnapshot();
  const foreignMap = { ...structuredClone(state.storyMaps[0]!), id: id(110) };
  state.storyMaps.push(foreignMap);
  state.releases.push({ ...structuredClone(state.releases[0]!), id: id(111), storyMapId: foreignMap.id });
  const { id: _id, provider: _provider, cardId: _cardId, releaseId: _releaseId, remoteId: _remoteId, remoteNumber: _number, url: _url, ...link } = state.remoteWorkItemLinks[0]!;
  const values = { titleHash: "title", bodyHash: "body", remoteState: "open", statusLabels: [], annotationLabels: [], releaseMetadata: null, milestone: null };
  const baseline = (releaseId: string) => ({ pendingReleaseAssignment: false, acknowledgedLocal: { ...values, releaseId }, observedRemote: values });
  const operation = (releaseId: string) => op({ op: "set", entity: "remoteWorkItemLink", entityId: id(60), before: state.remoteWorkItemLinks![0]!, after: { ...link, baseline: baseline(releaseId) } });
  expect(() => resolveOperation(state, operation(id(111)), supply(), 0)).toThrow(expect.objectContaining({ message: expect.stringContaining("another Story Map") }));
  expect(() => resolveOperation(state, operation(id(4)), supply(), 0)).not.toThrow();
});
