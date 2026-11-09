import { describe, expect, it } from "vitest";
import { cardSchema, changeOperationSchema, projectSchema, storyMapSchema, type ChangeOperation, type OperationSelector, type OperationSnapshot, type OperationSupply } from "@storymapper/contracts";
import { collectOperationConflicts, describeOperation, resolveOperation, resolveOperations } from "@storymapper/core";
import { copyRows } from "@storymapper/core/changesets/copy-resolution";

const id = (value: number): string => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const createdAt = "2026-10-13T12:00:00Z";
const persisted = (value: number): OperationSelector => ({ kind: "id", id: id(value) });
const op = (input: object): ChangeOperation => changeOperationSchema.parse(input);
const edge = (value: number, card: number, prerequisite: number) => ({ id: id(value), cardId: id(card), prerequisiteCardId: id(prerequisite), createdAt });
const dependency = (operationId: string, cardId: OperationSelector, prerequisiteCardId: OperationSelector, action = "set", baseVersion = 1) => op({ operationId, op: action, entity: "cardDependency", baseVersion, after: { cardId, prerequisiteCardId } });
const supply = (operations: ChangeOperation[]): OperationSupply => ({ createdAt, creationOrigin: "inference", ids: Object.fromEntries(operations.map((operation, index) => [operation.operationId, id(100 + index)])), externalRefIds: {} });

function snapshot(): OperationSnapshot {
  return {
    projectId: id(1), projects: [projectSchema.parse({ id: id(1), name: "Project", localPath: "fixture.lsm", createdAt })],
    storyMaps: [storyMapSchema.parse({ id: id(2), projectId: id(1), name: "Map", version: 1, createdAt, updatedAt: createdAt })],
    cards: (["activity", "step", "story", "note"] as const).map((level, index) => cardSchema.parse({ id: id(3 + index), storyMapId: id(2), parentId: null, releaseId: null, key: `LSM-${3 + index}`, level, title: `Card ${3 + index}`, position: index, version: 1, creationOrigin: "manual", provenance: "manual", createdAt, updatedAt: createdAt })),
    cardDependencies: [], releases: [], personas: [], sourceDocuments: [], sourceChunks: [], sourceLinks: [], githubLinks: [], externalRefs: [], connections: [],
    roadmaps: [], roadmapColumns: [], roadmapSwimlanes: [], roadmapCards: [], roadmapReferences: [], annotations: [], workflowStatuses: [], storyTemplates: [], productContexts: [], attachments: [], cardPersonas: [], cardAnnotations: [], remoteWorkItemLinks: []
  };
}

describe("Card dependency resolution", () => {
  registerKeepsDependencyEditsIndependentOfOpenGitHubSConflicts();

  registerChangesOnlyTheDependentRootAcrossLevelsPreservingInput();

  registerMakesDuplicateSetsAndAbsentUnsetsExactDomainNo();

  registerUnsetsOnceAndCoalescesTwoOwnerEdgeChangesIn();

  registerRejectsSEndpointsAtomically();

  it("rejects a named multi-edge cycle through archived Cards", () => {
    const state = snapshot(); state.cards[1]!.status = "archived"; state.cardDependencies = [edge(20, 3, 4), edge(21, 4, 5)];
    const operation = dependency("cycle", persisted(5), persisted(3));
    expect(() => resolveOperation(state, operation, supply([operation]))).toThrow(/LSM-5 -> LSM-3 -> LSM-4 -> LSM-5/);
  });

  registerRejectsCyclesAfterResolvingCreationAliasesToTheirReal();

  registerHonorsEarlierGraphUnsetsEvenWhenNeitherEndpointOwns();

  registerResolvesEarlierCreationAliasesAndScopedBindingsWithSelection();

  registerComparesResolvedIdentitiesForSelfLinksAndPrefersPersisted();

  it("deletes incident rows and increments each surviving owner once with sequential reads", () => {
    const state = snapshot(); state.cardDependencies = [edge(20, 3, 4), edge(21, 5, 4), edge(22, 4, 6)];
    const remove = op({ operationId: "delete", op: "delete", entity: "card", entityId: id(4), baseVersion: 1, after: { strategy: "unassign" } });
    const edit = dependency("add", persisted(3), persisted(6)); const result = resolveOperations(state, [remove, edit], supply([remove, edit]));
    expect(result.state.cardDependencies).toEqual([edge(101, 3, 6)]);
    expect(result.state.cards.map((card) => [card.id, card.version])).toEqual([[id(3), 2], [id(5), 2], [id(6), 2]]);
    expect(result.operations[1]!.dependencies).toContain("delete");
    expect(result.operations[0]!.owners.map((owner) => owner.entityId)).toEqual(expect.arrayContaining([id(3), id(4), id(5)]));
  });

  it("preserves archive edges and copies only internal remapped endpoints", () => {
    const state = snapshot(); state.cardDependencies = [edge(20, 3, 4), edge(21, 3, 99)];
    const archive = op({ operationId: "archive", op: "archive", entity: "card", entityId: id(3), after: {} });
    expect(resolveOperation(state, archive, supply([archive])).state.cardDependencies).toEqual(state.cardDependencies);
    expect(copyRows(state, id(2)).cardDependencies).toEqual([edge(20, 3, 4)]);
    state.cardDependencies.pop(); state.mapFingerprints = { [id(2)]: "a".repeat(64) };
    const copy = op({ operationId: "copy", op: "create", entity: "storyMapCopy", entityId: id(100), after: { input: { sourceStoryMapId: id(2), targetName: "Copy" }, expected: state.mapFingerprints, preview: { source: { id: id(2), name: "Map" }, target: { id: id(100), name: "Copy" }, inventory: {} } } });
    const copyIds = Object.fromEntries([...state.cards, ...state.cardDependencies].map((row, index) => [row.id, id(200 + index)]));
    const result = resolveOperation(state, copy, { ...supply([copy]), copyIds: { copy: copyIds } });
    expect(result.state.cardDependencies[1]).toEqual(edge(204, 200, 201));
  });
});

function registerComparesResolvedIdentitiesForSelfLinksAndPrefersPersisted() {
  it("compares resolved identities for self-links and prefers persisted IDs over aliases", () => {
    const create = op({ operationId: "create", op: "create", entity: "card", entityId: "new-local", after: { storyMapId: id(2), level: "note", title: "Created" } });
    const bind = op({ operationId: "bind", op: "set", entity: "externalRef", entityId: "binding", after: { entityType: "card", entityId: "new-local", scopeId: id(2), system: "bmad", externalId: "new" } });
    const self = dependency("self", { kind: "local", localId: "new-local" }, { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "new" });
    expect(() => resolveOperations(snapshot(), [create, bind, self], supply([create, bind, self]))).toThrow(/itself/);
    const collision = { ...create, entityId: id(3) }; const add = dependency("add", { kind: "local", localId: id(3) }, persisted(4));
    expect(resolveOperations(snapshot(), [collision, add], supply([collision, add])).state.cardDependencies[0]!.cardId).toBe(id(3));
  });
}

function registerResolvesEarlierCreationAliasesAndScopedBindingsWithSelection() {
  it("resolves earlier creation aliases and scoped bindings with selection closure", () => {
    const operations = [
      op({ operationId: "create", op: "create", entity: "card", entityId: "new-local", after: { storyMapId: id(2), level: "note", title: "Created" } }),
      op({ operationId: "bind", op: "set", entity: "externalRef", entityId: "binding", after: { entityType: "card", entityId: "new-local", scopeId: id(2), system: "bmad", externalId: "new" } }),
      dependency("add", persisted(3), { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "new" })
    ];
    const result = resolveOperations(snapshot(), operations, supply(operations));
    expect(result.state.cardDependencies).toEqual([edge(102, 3, 100)]);
    expect(result.operations[1]!.dependencies).toContain("create");
    expect(result.operations[2]!.dependencies).toContain("bind");
    expect(resolveOperations(snapshot(), operations, supply(operations), ["create", "add"]).selectedOperationIds).toEqual(["create"]);
  });
}

function registerHonorsEarlierGraphUnsetsEvenWhenNeitherEndpointOwns() {
  it("honors earlier graph unsets even when neither endpoint owns that edge", () => {
    const state = snapshot(); state.cardDependencies = [edge(20, 3, 4), edge(21, 4, 5)];
    const operations = [dependency("break-cycle", persisted(4), persisted(5), "unset"), dependency("add", persisted(5), persisted(3))];
    const inputs = supply(operations); const result = resolveOperations(state, operations, inputs);
    expect(result.operations[1]!.dependencies).toContain("break-cycle");
    expect(resolveOperations(state, operations, inputs, ["add"])).toMatchObject({ selectedOperationIds: [], state });
  });
}

function registerRejectsCyclesAfterResolvingCreationAliasesToTheirReal() {
  it("rejects cycles after resolving creation aliases to their real Card identity", () => {
    const state = snapshot(); state.cardDependencies = [edge(20, 3, 4)];
    const operations = [
      op({ operationId: "create", op: "create", entity: "card", entityId: "new-local", after: { storyMapId: id(2), level: "note", title: "Created" } }),
      dependency("first", { kind: "local", localId: "new-local" }, persisted(3)),
      dependency("cycle", persisted(4), { kind: "local", localId: "new-local" })
    ];
    const before = structuredClone(state);
    expect(() => resolveOperations(state, operations, supply(operations))).toThrow(/LSM-4 -> NEW-1 -> LSM-3 -> LSM-4/);
    expect(state).toEqual(before);
  });
}

function registerRejectsSEndpointsAtomically() {
  it.each(["self", "missing", "foreign-map", "foreign-project"])("rejects %s endpoints atomically", (scenario) => {
    const state = snapshot(); let prerequisite = persisted(3);
    if (scenario === "missing") prerequisite = persisted(99);
    if (scenario.startsWith("foreign")) {
      const projectId = scenario === "foreign-project" ? id(40) : id(1);
      if (projectId !== id(1)) state.projects.push({ ...state.projects[0]!, id: projectId });
      state.storyMaps.push({ ...state.storyMaps[0]!, id: id(41), projectId });
      state.cards.push({ ...state.cards[0]!, id: id(42), key: "OTHER-1", storyMapId: id(41) }); prerequisite = persisted(42);
    }
    const before = structuredClone(state); const operation = dependency("invalid", persisted(3), prerequisite);
    expect(() => resolveOperation(state, operation, supply([operation]))).toThrow(/itself|does not exist|different Story Maps|another Project/);
    expect(state).toEqual(before);
  });
}

function registerUnsetsOnceAndCoalescesTwoOwnerEdgeChangesIn() {
  it("unsets once and coalesces two owner edge changes in one transaction", () => {
    const state = snapshot(); state.cardDependencies = [edge(20, 3, 4)];
    const operations = [dependency("remove", persisted(3), persisted(4), "unset"), dependency("add", persisted(3), persisted(5))];
    const result = resolveOperations(state, operations, supply(operations));
    expect(result.state.cardDependencies).toEqual([edge(101, 3, 5)]);
    expect(result.state.cards[0]!.version).toBe(2);
    expect(result.operations[1]!.dependencies).toContain("remove");
  });
}

function registerMakesDuplicateSetsAndAbsentUnsetsExactDomainNo() {
  it("makes duplicate sets and absent unsets exact domain no-ops but checks baseline", () => {
    const state = snapshot(); state.cardDependencies = [edge(20, 3, 4)];
    state.externalRefs = [{ id: id(30), entityType: "card", entityId: id(3), scopeId: id(2), system: "bmad", externalId: "activity", syncedVersion: 1, createdAt }];
    const set = dependency("set", { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "activity" }, persisted(4));
    const unset = dependency("unset", persisted(3), persisted(5), "unset");
    for (const operation of [set, unset]) {
      expect(resolveOperation(state, operation, supply([operation]))).toMatchObject({ status: "unchanged", changes: [], state });
      expect(() => resolveOperation(state, { ...operation, baseVersion: 2 }, supply([operation]))).toThrow(/baseline/);
    }
    expect(collectOperationConflicts(state, [{ ...set, baseVersion: 2 }], supply([set]))).toMatchObject([{ entity: "card", id: id(3), baseVersion: 2, currentVersion: 1 }]);
  });
}

function registerChangesOnlyTheDependentRootAcrossLevelsPreservingInput() {
  it("changes only the dependent root across levels, preserving input and describe parity", () => {
    const state = snapshot(); const before = structuredClone(state);
    const operation = dependency("set", persisted(3), persisted(6));
    const result = resolveOperation(state, operation, supply([operation]));
    expect(state).toEqual(before);
    expect(result.state.cardDependencies).toEqual([edge(100, 3, 6)]);
    expect(result.state.cards.map((card) => card.version)).toEqual([2, 1, 1, 1]);
    expect(result.owners.map((owner) => owner.entityId)).toEqual([id(3)]);
    const { state: _state, ...description } = result;
    expect(describeOperation(before, operation, supply([operation]))).toEqual(description);
  });
}

function registerKeepsDependencyEditsIndependentOfOpenGitHubSConflicts() {
  it.each(["title", "description", "status", "milestone"] as const)("keeps dependency edits independent of open GitHub %s conflicts", (field) => {
    const state = snapshot();
    state.syncConflicts = [{ id: id(40), externalRefId: id(43), syncRunId: id(41), connectionId: id(42), cardId: id(3), field, status: "open", createdAt }];
    const operation = dependency("set", persisted(3), persisted(4));
    expect(collectOperationConflicts(state, [operation], supply([operation]))).toEqual([]);
    expect(resolveOperations(state, [operation], supply([operation])).state.cardDependencies).toEqual([edge(100, 3, 4)]);
    expect(collectOperationConflicts(state, [{ ...operation, baseVersion: 2 }], supply([operation]))).toMatchObject([{ baseVersion: 2, currentVersion: 1 }]);
  });
}
