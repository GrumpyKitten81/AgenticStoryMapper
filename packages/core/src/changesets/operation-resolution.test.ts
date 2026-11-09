import { testValidatesProductContextMetadataAgainstActualProjectAndMapOwnership } from "@storymapper/core/changesets/fixtures/operation-context-cases";
import { describe, expect, it } from "vitest";
import { changeOperationSchema, connectorConnectionSchema, githubLinkSchema, productContextSchema, projectSchema, storyMapSchema, type ChangeOperation } from "@storymapper/contracts";
import { collectOperationConflicts, describeOperation, deselectOperationDependents, operationRegistry, resolveOperation, resolveOperations } from "@storymapper/core";

import { id, createdAt, chunkId, card, operation, update, snapshot, supply, upsert, coreMembers } from "@storymapper/core/changesets/fixtures/operation-resolution-fixture";

describe("pure operation registry", () => {
  registerPreservesEverySupportedReleaseFieldInProposedCreation();
  registerDescribesAndResolvesOpEntityDeterministically();

  registerCreatesAndRepeatsExternalSPublicationWithoutResettingBaselines();

  it("covers exactly the supported catalog", () => {
    expect(Object.keys(operationRegistry).sort()).toEqual(changeOperationSchema.options.map((member) => `${member.shape.op.value}:${member.shape.entity.value}`).sort());
    for (const entry of Object.values(operationRegistry)) {
      expect(typeof entry.describe).toBe("function");
      expect(typeof entry.resolve).toBe("function");
    }
  });

  it("folds earlier aliases sequentially with NEW keys and transitive deselection", testFoldsEarlierAliasesSequentiallyWithNEWKeysAndTransitiveDeselection);

  it("refuses indexed forward references and foreign persisted alias collisions", () => {
    const state = snapshot();
    state.projects.push(projectSchema.parse({ id: id(10), name: "Foreign", localPath: "foreign.lsm", createdAt }));
    state.storyMaps.push(storyMapSchema.parse({ id: id(11), projectId: id(10), name: "Foreign", version: 1, createdAt, updatedAt: createdAt }));
    state.cards.push({ ...card(12, "activity", null), storyMapId: id(11) });
    const forward = operation({ operationId: "forward", op: "create", entity: "card", after: { storyMapId: id(2), level: "step", parentId: "later", title: "Forward" } });
    expect(() => resolveOperation(state, forward, supply([forward]), 3)).toThrow(/forward.*index 3/i);
    const operations = [operation({ operationId: "collision", op: "create", entity: "card", entityId: id(12), after: { storyMapId: id(2), level: "activity", title: "Alias" } }),
      operation({ operationId: "dependent", op: "create", entity: "card", after: { storyMapId: id(2), level: "step", parentId: id(12), title: "Must refuse" } })];
    expect(() => resolveOperations(state, operations, supply(operations))).toThrow(/foreign|another Project/i);
  });

  it("collects same-target and ancestor write dependencies", () => {
    const operations = [update("ancestor", id(3), "Updated parent"), update("child", id(5), "Updated descendant"), update("repeat", id(5), "Second edit"), update("independent", id(4), "Step")];
    const result = resolveOperations(snapshot(), operations, supply(operations));
    expect(result.operations[1]!.dependencies).toContain("ancestor");
    expect(result.operations[2]!.dependencies).toContain("child");
    expect(deselectOperationDependents(result.operations, operations.map((entry) => entry.operationId), ["child"])).toEqual(["ancestor", "independent"]);
  });

  it("checks hierarchy, owning release, literal map and source-import references", () => {
    const invalid = [
      { op: "create", entity: "card", after: { storyMapId: id(2), level: "story", parentId: id(3), title: "Wrong hierarchy" } },
      { op: "update", entity: "card", entityId: id(5), after: { releaseId: id(90) } },
      { op: "create", entity: "card", after: { storyMapId: id(90), level: "activity", title: "Unknown map" } },
      { op: "link", entity: "sourceLink", entityId: "source", after: { kind: "chunk", cardId: id(5), chunk: { kind: "import", operationId: "import", locator: "L1" } } }
    ];
    for (const member of invalid) {
      const op = operation({ operationId: "invalid", ...member });
      expect(() => resolveOperation(snapshot(), op, supply([op]))).toThrow(/Operation invalid at index 0/);
    }
  });
});

describe("registry domain golden effects", () => {
  registerOrdersMixedStorySiblingsByPositionAndCreationTime();

  registerCountsHiddenMixedSiblingsWhenAssigningDefaultCreationPositions();

  registerMovesReleaseLanesAndPreservesAssignmentsWhileRejectingOut();

  it.each(["chunk", "note"] as const)("treats repeated %s evidence as no-op and restores immutable origin on last unlink", (kind) => {
    const link = operation({ operationId: "link", op: "link", entity: "sourceLink", entityId: "link-local", after: kind === "chunk" ? { kind, cardId: id(5), chunkId } : { kind, cardId: id(5), note: "Source note" } });
    const first = resolveOperation(snapshot(), link, supply([link]));
    expect(first.state.cards[2]).toMatchObject({ creationOrigin: "manual", provenance: "linked", version: 2 });
    expect(resolveOperation(first.state, link, supply([link]))).toMatchObject({ status: "unchanged", changes: [], state: first.state });
    const unlink = operation({ operationId: "unlink", op: "unlink", entity: "sourceLink", entityId: "unlink-target", after: { kind, cardId: id(5), id: id(100) } });
    const removed = resolveOperation(first.state, unlink, supply([unlink]));
    expect(removed.state.cards[2]).toMatchObject({ creationOrigin: "manual", provenance: "manual", version: 3 });
    expect(removed.state.sourceLinks).toEqual([]);
    expect(() => resolveOperation(removed.state, unlink, supply([unlink]))).toThrow(/Operation unlink at index 0: Source evidence is unknown/);
  });

  it("distinguishes shared GitHub detach from direct canonical unlink and includes every affected Card", testDistinguishesSharedGitHubDetachFromDirectCanonicalUnlinkAndIncludesEvery);

  it("rejects foreign source chunks and mismatched unlink ownership", () => {
    const state = snapshot();
    state.sourceDocuments[0]!.projectId = id(90);
    const link = operation({ operationId: "foreign", op: "link", entity: "sourceLink", entityId: "source", after: { kind: "chunk", cardId: id(5), chunkId } });
    expect(() => resolveOperation(state, link, supply([link]))).toThrow(/another Project/);
    state.sourceLinks.push({ kind: "note", id: id(17), cardId: id(4), note: "Note", createdAt });
    const unlink = operation({ operationId: "mismatch", op: "unlink", entity: "sourceLink", entityId: "source", after: { kind: "note", cardId: id(5), id: id(17) } });
    expect(() => resolveOperation(state, unlink, supply([unlink]))).toThrow(/does not match/);
  });

  it("conflicts even on unchanged publication after human edits and preserves other systems' baselines", testConflictsEvenOnUnchangedPublicationAfterHumanEditsAndPreservesOther);

  it("previews archived external Cards as update plus implicit unarchive", () => {
    const op = upsert("card");
    const first = resolveOperation(snapshot(), op, supply([op]));
    first.state.cards.at(-1)!.archived = true;
    const result = resolveOperation(first.state, op, supply([op]));
    expect(result.changes.find((entry) => entry.entity === "card")).toMatchObject({ implicit: "unarchive", before: { archived: true }, after: { archived: false, status: "todo", version: 2 } });
  });

  it("rejects external identity scope drift and conflicting bindings", () => {
    const op = upsert("card");
    const wrongScope = operation({ ...op, selector: { kind: "externalRef", scopeId: id(1), system: "bmad", externalId: "published" } });
    expect(() => resolveOperation(snapshot(), wrongScope, supply([wrongScope]))).toThrow(/scope disagrees/);
    const first = resolveOperation(snapshot(), op, supply([op]));
    first.state.externalRefs.push({ ...first.state.externalRefs[0]!, id: id(50) });
    expect(() => resolveOperation(first.state, op, supply([op]))).toThrow(/conflicting bindings/);
  });
});

describe("registry admission and composite operations", () => {
  it("resolves copy and board-import effects from prepared identities", testResolvesCopyAndBoardImportEffectsFromPreparedIdentities);

  it("rejects duplicate identities and requires supplied creation IDs", () => {
    const first = operation({ operationId: "create", op: "create", entity: "card", entityId: "local", after: { storyMapId: id(2), level: "activity", title: "Created" } });
    expect(() => resolveOperations(snapshot(), [first, first], supply([first]))).toThrow(/Duplicate operation/);
    const duplicateAlias = operation({ ...first, operationId: "second" });
    expect(() => resolveOperations(snapshot(), [first, duplicateAlias], supply([first, duplicateAlias]))).toThrow(/Duplicate creation-local/);
    const publication = operation({ ...upsert("card", "publication"), entityId: first.entityId });
    expect(() => resolveOperations(snapshot(), [first, publication], supply([first, publication]))).toThrow(/Operation publication at index 1: Duplicate creation-local/);
    expect(() => resolveOperation(snapshot(), first, { ...supply([]), ids: {} })).toThrow(/supply an allocated id/);
    expect(() => resolveOperation(snapshot(), first, { ...supply([first]), ids: { create: id(5) } })).toThrow(/already exists/);
  });

  it("honors explicit persisted and local selectors without letting literal map IDs become aliases", () => {
    const operations = [operation({ operationId: "create", op: "create", entity: "card", entityId: "local", after: { storyMapId: id(2), level: "activity", title: "Created" } }),
      operation({ operationId: "edit", op: "update", entity: "card", entityId: "ignored", selector: { kind: "local", localId: "local" }, after: { title: "Edited" } })];
    expect(resolveOperations(snapshot(), operations, supply(operations)).state.cards.at(-1)).toMatchObject({ title: "Edited", version: 1 });
    const existing = operation({ operationId: "persisted", op: "update", entity: "card", entityId: "ignored", selector: { kind: "id", id: id(5) }, after: { title: "Persisted" } });
    expect(resolveOperation(snapshot(), existing, supply([existing])).state.cards[2]).toMatchObject({ title: "Persisted" });
    const literal = [operation({ operationId: "map", op: "create", entity: "storyMap", entityId: id(90), after: { projectId: id(1), name: "New map" } }),
      operation({ operationId: "card", op: "create", entity: "card", after: { storyMapId: id(90), level: "activity", title: "Invalid literal" } })];
    expect(() => resolveOperations(snapshot(), literal, supply(literal))).toThrow(/Story map.*unknown/);
  });

  it("refuses foreign parents and releases even inside one accessible Project", () => {
    const state = snapshot();
    state.storyMaps.push({ ...state.storyMaps[0]!, id: id(30), name: "Other map" });
    state.cards.push({ ...card(31, "step", null), storyMapId: id(30) });
    state.releases.push({ ...state.releases[0]!, id: id(32), storyMapId: id(30) });
    const invalid = [
      operation({ operationId: "parent", op: "create", entity: "card", after: { storyMapId: id(2), level: "story", parentId: id(31), title: "Foreign parent" } }),
      operation({ operationId: "release", op: "update", entity: "card", entityId: id(5), after: { releaseId: id(32) } })
    ];
    for (const op of invalid) expect(() => resolveOperation(state, op, supply([op]))).toThrow(/another Story Map/);
  });
});

describe("transaction-start registry baselines", () => {
  registerRegistersSUpsertsAsAliasesAndDependencyRoots();

  it.each(["release", "persona"] as const)("keeps unchanged %s publication aliases usable by later work", (entity) => {
    const publish = operation({ ...upsert(entity), entityId: "published-local" });
    const initial = resolveOperation(snapshot(), publish, supply([publish])).state;
    const edit = operation({ operationId: "edit", op: "update", entity, entityId: "unused", selector: { kind: "local", localId: "published-local" }, after: { name: "Later edit" } });
    const operations = [publish, edit];
    const result = resolveOperations(initial, operations, supply(operations));
    expect(result.operations[0]!.status).toBe("unchanged");
    expect(result.operations[1]!.dependencies).toContain("publish");
    expect(result.operations[1]!.changes.find((change) => change.entity === entity)?.after).toMatchObject({ name: "Later edit", version: 2 });
    expect(resolveOperations(initial, operations, supply(operations), ["edit"]).selectedOperationIds).toEqual([]);
  });

  it("normalizes operations before reporting indexed duplicate identities", () => {
    const first = update("same", id(5), "First");
    const second = { ...first, operationId: " same " };
    expect(() => resolveOperations(snapshot(), [first, second], supply([first]))).toThrow("Operation same at index 1: Duplicate operation id.");
    const create = operation({ operationId: "first", op: "create", entity: "card", entityId: "local", after: { storyMapId: id(2), level: "activity", title: "First" } });
    expect(() => resolveOperations(snapshot(), [create, { ...create, operationId: "second", entityId: " local " }], supply([create]))).toThrow("Operation second at index 1: Duplicate creation-local id.");
  });

  it("resolves two writes to one existing root against its transaction-start version", () => {
    const operations = [operation({ ...update("first", id(5), "First"), baseVersion: 1 }), operation({ ...update("second", id(5), "Second"), baseVersion: 1 })];
    const result = resolveOperations(snapshot(), operations, supply(operations));
    expect(result.state.cards[2]).toMatchObject({ title: "Second", version: 2 });
    expect(result.operations[1]!.dependencies).toContain("first");
    const stale = operation({ ...operations[1]!, baseVersion: 2 });
    expect(() => resolveOperations(snapshot(), [operations[0]!, stale], supply(operations))).toThrow(/baseline/);
  });

  it("rejects an external selector whose persisted binding contradicts the actual owner's map scope", () => {
    const state = snapshot();
    state.storyMaps.push({ ...state.storyMaps[0]!, id: id(30), name: "Other map" });
    state.cards.push({ ...card(31, "story", null), storyMapId: id(30) });
    state.externalRefs.push({ id: id(50), entityType: "card", entityId: id(31), system: "bmad", externalId: "bad-binding", scopeId: id(2), syncedVersion: 1, createdAt });
    const op = operation({ operationId: "scope-binding", op: "update", entity: "card", entityId: "ignored", selector: { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "bad-binding" }, after: { title: "Cannot cross scope" } });
    expect(() => resolveOperation(state, op, supply([op]))).toThrow(/scope|binding/i);
  });
});

describe("additional placement and GitHub identity goldens", () => {
  it("clamps non-story movement among the same-level siblings", () => {
    const state = snapshot();
    state.cards.push(card(13, "activity", null, 1), card(14, "note", null, 9));
    const op = operation({ operationId: "move", op: "move", entity: "card", entityId: id(3), after: { parentId: null, position: 99 } });
    const result = resolveOperation(state, op, supply([op]));
    expect(result.state.cards.find((entry) => entry.id === id(3))).toMatchObject({ position: 1, version: 2 });
    expect(result.state.cards.find((entry) => entry.id === id(13))).toMatchObject({ position: 0, version: 1 });
    expect(result.state.cards.find((entry) => entry.id === id(14))).toMatchObject({ position: 9, version: 1 });
  });

  it("reuses direct and attached GitHub evidence without duplicate links or version writes", () => {
    const state = snapshot();
    state.githubLinks.push(githubLinkSchema.parse({ id: id(16), cardId: id(5), repo: "org/repo", issueNumber: 42, url: "https://github.com/org/repo/issues/42", syncState: "unsynced" }));
    state.externalRefs.push({ id: id(16), entityType: "card", entityId: id(5), system: "github", externalId: "https://github.com/org/repo/issues/42", scopeId: id(2), syncedVersion: 1, createdAt });
    state.cards[2]!.provenance = "linked";
    const direct = operation({ operationId: "direct-link", op: "link", entity: "sourceLink", entityId: "direct", after: { kind: "github", cardId: id(5), externalRefId: id(16) } });
    expect(resolveOperation(state, direct, supply([direct]))).toMatchObject({ status: "unchanged", changes: [], state });
    state.cards.push(card(13, "story", id(4), 1));
    const attached = operation({ operationId: "attached-link", op: "link", entity: "sourceLink", entityId: "attached", after: { kind: "github", cardId: id(13), externalRefId: id(16) } });
    const first = resolveOperation(state, attached, supply([attached]));
    expect(first.state.sourceLinks).toHaveLength(1);
    expect(first.state.cards.at(-1)).toMatchObject({ provenance: "linked", version: 2 });
    expect(resolveOperation(first.state, attached, supply([attached]))).toMatchObject({ status: "unchanged", changes: [], state: first.state });
  });
});

describe("Map and Persona root review state", () => {
  it("validates real Map connection ownership on updates without mutating input", testValidatesRealMapConnectionOwnershipOnUpdatesWithoutMutatingInput);

  registerResolvesSExternalSelectorsWithEffectiveIdentityAndActual();

  registerHonorsEffectiveSSelectorsAndPersistedIdentityOverForeign();

  it("validates Product Context metadata against actual Project and map ownership", testValidatesProductContextMetadataAgainstActualProjectAndMapOwnership);
  it("labels Map creation and update with real owner and before/after names", () => {
    const create = operation({ operationId: "create-map", op: "create", entity: "storyMap", after: { projectId: id(1), name: "New Map", description: "Purpose" } });
    const created = resolveOperation(snapshot(), create, supply([create]));
    expect(created.owners).toEqual([{ entity: "storyMap", entityId: id(100), projectId: id(1) }]);
    expect(created.changes).toEqual([{ entity: "storyMap", entityId: id(100), after: expect.objectContaining({ name: "New Map", description: "Purpose", version: 1 }) }]);
    const change = operation({ operationId: "update-map", op: "update", entity: "storyMap", entityId: id(2), baseVersion: 1, after: { name: "Updated Map" } });
    const updated = resolveOperation(snapshot(), change, supply([change]));
    expect(updated.owners).toEqual([{ entity: "storyMap", entityId: id(2), projectId: id(1) }]);
    expect(updated.changes).toEqual([{ entity: "storyMap", entityId: id(2), before: expect.objectContaining({ name: "Map", version: 1 }), after: expect.objectContaining({ name: "Updated Map", version: 2 }) }]);
  });

  it("labels Persona creation and update with real owner and before/after names", () => {
    const create = operation({ operationId: "create-persona", op: "create", entity: "persona", after: { projectId: id(1), storyMapId: id(2), name: "Operator", role: "Reviewer" } });
    const created = resolveOperation(snapshot(), create, supply([create]));
    expect(created.owners).toEqual([{ entity: "persona", entityId: id(100), projectId: id(1) }]);
    expect(created.changes).toEqual([{ entity: "persona", entityId: id(100), after: expect.objectContaining({ name: "Operator", role: "Reviewer", storyMapId: id(2), version: 1 }) }]);
    const change = operation({ operationId: "update-persona", op: "update", entity: "persona", entityId: id(7), baseVersion: 1, after: { name: "Updated Reader", role: "Reviewer" } });
    const updated = resolveOperation(snapshot(), change, supply([change]));
    expect(updated.owners).toEqual([{ entity: "persona", entityId: id(7), projectId: id(1) }]);
    expect(updated.changes).toEqual([{ entity: "persona", entityId: id(7), before: expect.objectContaining({ name: "Reader", version: 1 }), after: expect.objectContaining({ name: "Updated Reader", role: "Reviewer", version: 2 }) }]);
  });

  it("increments existing Map and Persona roots once across a batch and keeps new roots at version one", testIncrementsExistingMapAndPersonaRootsOnceAcrossABatchAnd);
});

describe("existing Release external publication placement", () => {
  it("reorders lanes with complete changed roots and preserves Card assignments", () => {
    const state = snapshot();
    state.releases.push({ ...state.releases[0]!, id: id(15), name: "Next", position: 1 });
    state.cards[2]!.releaseId = id(6);
    state.externalRefs.push({ id: id(50), entityType: "release", entityId: id(6), system: "bmad", externalId: "mvp", scopeId: id(2), syncedVersion: 1, createdAt });
    const publish = operation({ operationId: "publish-release", op: "upsert", entity: "release", selector: { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "mvp" }, after: { storyMapId: id(2), name: "MVP revised", position: 1 } });
    const result = resolveOperation(state, publish, supply([publish]));
    expect(result.state.releases.map((entry) => [entry.id, entry.position, entry.version])).toEqual([[id(6), 1, 2], [id(15), 0, 2]]);
    expect(result.state.cards).toEqual(state.cards);
    expect(result.changes.filter((entry) => entry.entity === "release").map((entry) => entry.entityId).sort()).toEqual([id(6), id(15)].sort());
    expect(result.state.externalRefs[0]).toMatchObject({ syncedVersion: 2 });
    expect(result.label).toContain("may change");
    expect(resolveOperation(result.state, publish, supply([publish]))).toMatchObject({ status: "unchanged", changes: [], state: result.state });
  });

  it("rejects external Release position beyond the remaining lanes without changing input", () => {
    const state = snapshot();
    state.externalRefs.push({ id: id(50), entityType: "release", entityId: id(6), system: "bmad", externalId: "mvp", scopeId: id(2), syncedVersion: 1, createdAt });
    const original = structuredClone(state);
    const publish = operation({ operationId: "invalid-release", op: "upsert", entity: "release", selector: { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "mvp" }, after: { storyMapId: id(2), name: "MVP", position: 1 } });
    expect(() => resolveOperation(state, publish, supply([publish]))).toThrow(/outside the release lanes/);
    expect(state).toEqual(original);
  });
});

describe("selection without excluded execution", () => {
  registerExecutesIndependentSelectedWorkWhileExcludedTargetsAreUnknown();

  it("closes local, same-target and descendant dependencies without resolving excluded work", () => {
    const operations = [
      operation({ operationId: "new", op: "create", entity: "card", entityId: "local", after: { storyMapId: id(2), level: "activity", title: "Excluded" } }),
      operation({ operationId: "local-dependent", op: "create", entity: "card", after: { storyMapId: id(2), level: "step", parentId: "local", title: "Dependent" } }),
      operation({ ...update("stale", id(3), "Excluded stale ancestor"), baseVersion: 99 }),
      update("descendant", id(5), "Must exclude"), update("same-target", id(3), "Must exclude"),
      operation({ operationId: "independent", op: "update", entity: "persona", entityId: id(7), after: { name: "Retained" } })
    ];
    const result = resolveOperations(snapshot(), operations, supply(operations), ["local-dependent", "descendant", "same-target", "independent"]);
    expect(result.selectedOperationIds).toEqual(["independent"]);
    expect(result.state.personas[0]!.name).toBe("Retained");
  });

  it("excludes a move requiring a deselected earlier created Release lane", () => {
    const operations = [operation({ operationId: "lane", op: "create", entity: "release", after: { storyMapId: id(2), name: "New lane" } }),
      operation({ operationId: "move", op: "update", entity: "release", entityId: id(6), after: { position: 1 } })];
    const full = resolveOperations(snapshot(), operations, supply(operations));
    expect(full.operations[1]!.dependencies).toContain("lane");
    const selected = resolveOperations(snapshot(), operations, supply(operations), ["move"]);
    expect(selected.operations).toEqual([]);
    expect(selected.state).toEqual(snapshot());
  });

  it("binds a repeated existing upsert alias and retains addressed no-op owners", () => {
    const publication = upsert("card", "publish");
    const initial = resolveOperation(snapshot(), publication, supply([publication]));
    const repeated = operation({ ...publication, operationId: "repeat", entityId: "published-local" });
    const edit = operation({ operationId: "edit", op: "update", entity: "card", entityId: "display", selector: { kind: "local", localId: "published-local" }, after: { title: "Edited" } });
    const operations = [repeated, edit];
    const result = resolveOperations(initial.state, operations, supply(operations));
    expect(result.operations[0]).toMatchObject({ status: "unchanged", changes: [], owners: [{ entity: "card", entityId: id(100), projectId: id(1) }] });
    expect(result.operations[1]!.dependencies).toContain("repeat");
    expect(result.state.cards.at(-1)).toMatchObject({ title: "Edited", version: 2 });
    expect(resolveOperations(initial.state, operations, supply(operations), ["edit"]).operations).toEqual([]);
  });

  it("normalizes operation and local IDs before duplicate checks, selections and alias chains", () => {
    const created = { operationId: " create ", op: "create", entity: "card", entityId: " local ", after: { storyMapId: id(2), level: "activity", title: "Created" } } as ChangeOperation;
    const edit = { operationId: " edit ", op: "update", entity: "card", entityId: " local ", after: { title: "Edited" } } as ChangeOperation;
    const normalized = supply([operation(created), operation(edit)]);
    const result = resolveOperations(snapshot(), [created, edit], normalized, [" create ", " edit "]);
    expect(result.selectedOperationIds).toEqual(["create", "edit"]);
    expect(result.state.cards.at(-1)).toMatchObject({ title: "Edited", version: 1 });
    expect(() => resolveOperations(snapshot(), [created, { ...created, operationId: "create" }], normalized)).toThrow(/index 1: Duplicate operation/);
    expect(() => resolveOperations(snapshot(), [created, { ...created, operationId: "other", entityId: "local" }], normalized)).toThrow(/index 1: Duplicate creation-local/);
  });
});

describe("addressed owners and lane dependencies", () => {
  it("retains duplicate-link owner and makes later same-target work depend on it", () => {
    const link = operation({ operationId: "link", op: "link", entity: "sourceLink", entityId: "evidence", after: { kind: "note", cardId: id(5), note: "Evidence" } });
    const initial = resolveOperation(snapshot(), link, supply([link]));
    const repeat = operation({ ...link, operationId: "repeat" });
    const edit = update("edit", id(5), "After repeated evidence");
    const operations = [repeat, edit];
    const result = resolveOperations(initial.state, operations, supply(operations));
    expect(result.operations[0]).toMatchObject({ status: "unchanged", changes: [], owners: [{ entity: "card", entityId: id(5), projectId: id(1) }] });
    expect(result.operations[1]!.dependencies).toContain("repeat");
    expect(resolveOperations(initial.state, operations, supply(operations), ["edit"]).selectedOperationIds).toEqual([]);
  });

  it("records Release upsert movement reads of a newly-created lane", () => {
    const state = snapshot();
    state.externalRefs.push({ id: id(99), entityType: "release", entityId: id(6), system: "bmad", externalId: "mvp", scopeId: id(2), syncedVersion: 1, createdAt });
    const create = operation({ operationId: "lane", op: "create", entity: "release", after: { storyMapId: id(2), name: "Next" } });
    const move = operation({ operationId: "move", op: "upsert", entity: "release", selector: { kind: "externalRef", system: "bmad", externalId: "mvp", scopeId: id(2) }, after: { storyMapId: id(2), name: "MVP", position: 1 } });
    const operations = [create, move];
    const result = resolveOperations(state, operations, supply(operations));
    expect(result.operations[1]!.dependencies).toContain("lane");
    expect(result.state.releases.map((entry) => [entry.position, entry.version])).toEqual([[1, 2], [0, 1]]);
    expect(resolveOperations(state, operations, supply(operations), ["move"]).operations).toEqual([]);
  });
});

it("keeps preview descriptions immutable when intermediate states are not retained", () => {
  const state = snapshot();
  const original = structuredClone(state);
  const operations = [update("first", id(5), "First title"), update("second", id(5), "Second title")];
  const inputs = supply(operations);
  const retained = resolveOperations(state, operations, inputs);
  const preview = resolveOperations(state, operations, inputs, undefined, { retainOperationStates: false });
  const descriptions = (result: ReturnType<typeof resolveOperations>) => result.operations.map(({ state: _state, ...row }) => row);
  expect(descriptions(preview)).toEqual(descriptions(retained));
  expect(preview.state).toEqual(retained.state);
  expect(preview.operations[0]!.changes.find((change) => change.entity === "card")!.after).toMatchObject({ title: "First title" });
  expect(state).toEqual(original);
});

it("validates scoped delivery states and initial baselines across sequential operations, advancing only addressed systems", () => {
  const state = snapshot();
  state.cards[2]!.parked = true;
  state.workflowStatuses.push({ id: id(300), projectId: id(1), storyMapId: null, name: "In Review", group: "active", position: 0 });
  state.externalRefs.push(...["bmad", "other"].map((system, index) => ({ id: id(301 + index), entityType: "card" as const, entityId: id(5), scopeId: id(2), system, externalId: "Story-A", syncedVersion: 1, createdAt })));
  state.sourcePlanBaselines = state.externalRefs.map((binding) => ({ id: binding.id, projectId: id(1), storyMapId: id(2), system: binding.system, version: 1, schemaVersion: 1, releases: [], entries: [{ cardId: id(5), identity: { id: id(5), key: state.cards[2]!.key, title: state.cards[2]!.title }, card: structuredClone(state.cards[2]!), binding: structuredClone(binding), active: false, releaseName: null }] }));
  const delivery = operation({ operationId: "delivery", op: "update", entity: "card", entityId: id(5), selector: { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "Story-A" }, before: state.cards[2], baseVersion: 1, after: { status: "In Review" } });
  const operations = [update("title", id(5), "Changed"), delivery, { ...delivery, operationId: "again" }];
  const result = resolveOperations(state, operations, supply(operations));
  expect(result.state.cards[2]).toMatchObject({ version: 2, title: "Changed", status: "In Review", parked: true, parentId: id(4) });
  expect(result.state.externalRefs.map((ref) => ref.syncedVersion)).toEqual([2, 1]);
  const invalid = structuredClone(state);
  invalid.workflowStatuses[0]!.storyMapId = id(99);
  expect(() => resolveOperation(invalid, delivery, supply([delivery]))).toThrow(/Workflow Status/);
  invalid.workflowStatuses = state.workflowStatuses;
  invalid.cards[2]!.version = 2;
  const withoutBase = { ...delivery, baseVersion: undefined };
  expect(() => resolveOperation(invalid, withoutBase, supply([withoutBase]))).toThrow(/baseline/i);
  const changedOwner = structuredClone(state);
  changedOwner.externalRefs[0]!.entityId = id(3);
  expect(() => resolveOperation(changedOwner, delivery, supply([delivery]))).toThrow(/owner changed/);
});

it("applies mixed-field external status updates with isolated baselines while preserving unrelated Story state", () => {
  const state = snapshot();
  Object.assign(state.cards[2]!, { releaseId: id(6), parked: true, assignee: "Owner", estimate: 8, priority: "high" });
  state.workflowStatuses.push({ id: id(300), projectId: id(1), storyMapId: id(2), name: "In Review", group: "active", position: 0 });
  state.externalRefs.push(...["bmad", "other"].map((system, index) => ({ id: id(301 + index), entityType: "card" as const, entityId: id(5), scopeId: id(2), system, externalId: "Story-A", syncedVersion: 1, createdAt })));
  state.sourcePlanBaselines = state.externalRefs.map((binding) => ({ id: binding.id, projectId: id(1), storyMapId: id(2), system: binding.system, version: 1, schemaVersion: 1, releases: [{ id: id(6), name: "MVP" }], entries: [{ cardId: id(5), identity: { id: id(5), key: state.cards[2]!.key, title: state.cards[2]!.title }, card: structuredClone(state.cards[2]!), binding: structuredClone(binding), active: false, releaseName: "MVP" }] }));
  const mixed = operation({ operationId: "mixed", op: "update", entity: "card", entityId: id(5), selector: { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "Story-A" }, baseVersion: 1, after: { title: "Delivery title", description: "Delivery description", status: "In Review", effort: 3 } });
  const before = structuredClone(state);
  const result = resolveOperation(state, mixed, supply([mixed]));
  expect(result.state.cards[2]).toEqual({ ...before.cards[2], title: "Delivery title", description: "Delivery description", status: "In Review", effort: 3, version: 2, updatedAt: createdAt });
  expect(result.state.externalRefs.map((ref) => [ref.system, ref.syncedVersion])).toEqual([["bmad", 2], ["other", 1]]);
  expect(state).toEqual(before);
  const stale = structuredClone(state);
  stale.cards[2]!.version = 2;
  const freshCaptured = { ...mixed, baseVersion: 2 };
  expect(() => resolveOperation(stale, freshCaptured, supply([freshCaptured]))).toThrow(/External reference baseline/);
  const invalid = operation({ ...mixed, after: { title: "Must not apply", status: "Unconfigured" } });
  expect(() => resolveOperation(state, invalid, supply([invalid]))).toThrow(/Workflow Status/);
  expect(state).toEqual(before);
});

it("keeps non-status external updates independent of configured states and addressed baseline advancement", () => {
  const state = snapshot();
  Object.assign(state.cards[2]!, { version: 2, status: "Legacy unconfigured", releaseId: id(6), parked: true });
  state.externalRefs.push({ id: id(301), entityType: "card", entityId: id(5), scopeId: id(2), system: "bmad", externalId: "Story-A", syncedVersion: 1, createdAt });
  const edit = operation({ operationId: "title-only", op: "update", entity: "card", entityId: id(5), selector: { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "Story-A" }, baseVersion: 2, after: { title: "Ordinary edit" } });
  const result = resolveOperation(state, edit, supply([edit]));
  expect(result.state.cards[2]).toEqual({ ...state.cards[2], title: "Ordinary edit", version: 3, updatedAt: createdAt });
  expect(result.state.externalRefs).toEqual(state.externalRefs);
  const staleCaptured = { ...edit, baseVersion: 1 };
  expect(() => resolveOperation(state, staleCaptured, supply([staleCaptured]))).toThrow(/supplied baseline/);
});

it("records addressed publication baselines in resolved evidence changes while preserving unrelated systems and selection", () => {
  const state = snapshot();
  const root = state.cards[2]!;
  state.externalRefs.push({ id: id(20), entityType: "card", entityId: root.id, scopeId: id(2), system: "publisher", externalId: "story", syncedVersion: 1, createdAt }, { id: id(21), entityType: "card", entityId: root.id, scopeId: id(2), system: "other", externalId: "story", syncedVersion: 1, createdAt });
  state.sourcePlanBaselines = [{ id: id(20), projectId: id(1), storyMapId: id(2), system: "publisher", version: 1, schemaVersion: 1, releases: [], entries: [{ cardId: root.id, identity: { id: root.id, key: root.key, title: root.title }, card: structuredClone(root), binding: structuredClone(state.externalRefs[0]!), active: true, releaseName: null }] }];
  const publish = operation({ operationId: "publish-evidence", op: "upsert", entity: "card", selector: { kind: "externalRef", scopeId: id(2), system: "publisher", externalId: "story" }, after: { storyMapId: id(2), level: "story", title: root.title } });
  const evidence = operation({ operationId: "evidence-only", entityId: "evidence-local", op: "link", entity: "sourceLink", after: { cardId: root.id, kind: "chunk", chunkId } });
  const operations = [publish, evidence];
  const resolved = resolveOperations(state, operations, supply(operations));
  expect(resolved.operations[0]!.status).toBe("unchanged");
  expect(resolved.state.cards[2]!.version).toBe(2);
  expect(resolved.state.externalRefs.map((ref) => ref.syncedVersion)).toEqual([2, 1]);
  expect(resolved.operations[1]!.changes).toContainEqual({ entity: "externalRef", entityId: id(20), before: state.externalRefs[0], after: { ...state.externalRefs[0]!, syncedVersion: 2 } });
  expect(resolveOperations(resolved.state, operations, supply(operations)).state).toEqual(resolved.state);
  expect(resolveOperations(state, [evidence, publish], supply(operations)).state.externalRefs.map((ref) => ref.syncedVersion)).toEqual([2, 1]);
  const unselectedEvidence = resolveOperations(state, operations, supply(operations), [publish.operationId]);
  expect(unselectedEvidence.state).toEqual(state);
  const evidenceWithoutPublication = resolveOperations(state, [evidence], supply([evidence]));
  expect(evidenceWithoutPublication.state.externalRefs).toEqual(state.externalRefs);
  const imported = operation({ operationId: "import-evidence", op: "import", entity: "sourceDocument", after: { projectId: id(1), title: "Source", type: "txt", fileHash: chunkId } });
  const importedEvidence = operation({ operationId: "imported-evidence", entityId: "imported-link-local", op: "link", entity: "sourceLink", after: { cardId: root.id, kind: "chunk", chunk: { kind: "import", operationId: imported.operationId, locator: "L1" } } });
  const importedCut = [imported, publish, importedEvidence];
  const supplied = { ...supply(importedCut), preparedSourceImports: { [imported.operationId]: { document: state.sourceDocuments[0]!, chunks: state.sourceChunks } } };
  const selectedPublication = resolveOperations(state, importedCut, supplied, [publish.operationId, importedEvidence.operationId]);
  expect(selectedPublication.selectedOperationIds).toEqual([publish.operationId]);
  expect(selectedPublication.state).toEqual(state);
  const humanState = structuredClone(state); humanState.cards[2]!.version = 2;
  expect(() => resolveOperations(humanState, operations, supply(operations))).toThrow(/human changes/);
});

it("advances only the addressed selected external archive baseline so stable IDs can return", () => {
  const state = snapshot();
  const root = state.cards[2]!;
  for (const [index, system] of ["publisher", "other"].entries()) state.externalRefs.push({ id: id(20 + index), entityType: "card", entityId: root.id, scopeId: id(2), system, externalId: "stable", syncedVersion: 1, createdAt });
  state.sourcePlanBaselines = state.externalRefs.map((binding) => ({ id: binding.id, projectId: id(1), storyMapId: id(2), system: binding.system, version: 1, schemaVersion: 1, releases: [], entries: [{ cardId: root.id, identity: { id: root.id, key: root.key, title: root.title }, card: structuredClone(root), binding: structuredClone(binding), active: true, releaseName: null }] }));
  const selector = { kind: "externalRef", scopeId: id(2), system: "publisher", externalId: "stable" };
  const archive = operation({ operationId: "external-archive", entityId: root.id, entity: "card", op: "archive", selector, baseVersion: 1, after: {} });
  expect(resolveOperations(state, [archive], supply([archive]), []).state).toEqual(state);
  const archived = resolveOperations(state, [archive], supply([archive]));
  expect(archived.state.cards[2]).toMatchObject({ id: root.id, archived: true, version: 2 });
  expect(archived.state.externalRefs.map((ref) => ref.syncedVersion)).toEqual([2, 1]);
  expect(archived.operations[0]!.changes.some((change) => change.entity === "externalRef" && change.entityId === id(20))).toBe(true);
  const restore = operation({ operationId: "return-stable", op: "upsert", entity: "card", selector, after: { storyMapId: id(2), level: "story", title: root.title } });
  const returned = resolveOperations(archived.state, [restore], supply([restore]));
  expect(returned.state.cards[2]).toMatchObject({ id: root.id, status: "todo", version: 3 });
  expect(returned.state.externalRefs.map((ref) => ref.syncedVersion)).toEqual([3, 1]);
  const human = structuredClone(archived.state); human.cards[2]!.version = 3;
  expect(() => resolveOperations(human, [restore], supply([restore]))).toThrow(/human changes/);
  const archiveCurrentVersion = { ...archive, baseVersion: 3 };
  expect(collectOperationConflicts(human, [archiveCurrentVersion], supply([archiveCurrentVersion]))).toMatchObject([{ id: root.id, baseVersion: 2, currentVersion: 3, index: 0, operationId: archive.operationId }]);
  expect(() => resolveOperations(human, [archiveCurrentVersion], supply([archiveCurrentVersion]))).toThrow(/human changes/);
});

it("accepts an existing Card binding followed by scoped archive while enforcing the explicit root baseline", () => {
  const state = snapshot();
  const root = state.cards[2]!;
  const bind = operation({ operationId: "bind-before-archive", entityId: "bind-before-archive-local", op: "set", entity: "externalRef", after: { entityType: "card", entityId: root.id, scopeId: id(2), system: "publisher", externalId: "stable" } });
  const archive = operation({ operationId: "archive-after-bind", entityId: root.id, op: "archive", entity: "card", selector: { kind: "externalRef", scopeId: id(2), system: "publisher", externalId: "stable" }, baseVersion: root.version, after: {} });
  const cut = [bind, archive];
  const archived = resolveOperations(state, cut, supply(cut));
  expect(archived.state.cards[2]).toMatchObject({ id: root.id, archived: true, version: 2 });
  expect(archived.state.externalRefs[0]).toMatchObject({ entityId: root.id, syncedVersion: 2 });
  expect(archived.operations[1]!.dependencies).toContain(bind.operationId);
  const human = structuredClone(state); human.cards[2]!.version = 2;
  expect(() => resolveOperations(human, cut, supply(cut))).toThrow(/supplied baseline/);
});

function registerCreatesAndRepeatsExternalSPublicationWithoutResettingBaselines() {
  it.each(["card", "release", "persona"] as const)("creates and repeats external %s publication without resetting baselines", (entity) => {
    const op = upsert(entity);
    const first = resolveOperation(snapshot(), op, supply([op]));
    expect(first.status).toBe("changed");
    expect(first.label).toContain("may change");
    expect(first.state.externalRefs[0]).toMatchObject({ entityType: entity, syncedVersion: 1, system: "bmad" });
    const second = resolveOperation(first.state, op, supply([op]));
    expect(second.status).toBe("unchanged");
    expect(second.state).toEqual(first.state);
  });
}

function registerDescribesAndResolvesOpEntityDeterministically() {
  it.each(coreMembers)("describes and resolves $op $entity deterministically", (member) => {
    const op = operation({ operationId: "test", ...member });
    const state = snapshot();
    const original = structuredClone({ state, op });
    const inputs = supply([op]);
    if (op.op === "unlink") state.sourceLinks.push({ kind: "note", id: id(9), cardId: id(5), note: "Evidence", createdAt });
    const originalState = structuredClone(state);
    const result = resolveOperation(state, op, inputs);
    expect(resolveOperation(state, op, inputs)).toEqual(result);
    expect(describeOperation(state, op, inputs)).toMatchObject({ operationId: "test", kind: `${op.op}:${op.entity}`, status: result.status });
    expect(op).toEqual(original.op);
    expect(state).toEqual(originalState);
  });
}

function registerPreservesEverySupportedReleaseFieldInProposedCreation() {
  it("preserves every supported Release field in proposed creation", () => {
    const after = { storyMapId: id(2), name: "Shipped", goal: "Delivery", startDate: "2026-10-01", releaseDate: "2026-10-17", released: true };
    const op = operation({ operationId: "release-fields", op: "create", entity: "release", after });
    const result = resolveOperation(snapshot(), op, supply([op]));
    expect(result.status).toBe("changed");
    expect(result.state.releases.at(-1)).toMatchObject({ ...after, version: 1 });
  });
}

function registerMovesReleaseLanesAndPreservesAssignmentsWhileRejectingOut() {
  it("moves Release lanes and preserves assignments while rejecting out-of-range indices", () => {
    const state = snapshot();
    state.releases.push({ ...state.releases[0]!, id: id(15), name: "Next", position: 1 });
    state.cards[2]!.releaseId = id(6);
    const op = operation({ operationId: "move-release", op: "update", entity: "release", entityId: id(6), after: { position: 1 } });
    const result = resolveOperation(state, op, supply([op]));
    expect(result.state.releases.map((entry) => [entry.id, entry.position, entry.version])).toEqual([[id(6), 1, 2], [id(15), 0, 2]]);
    expect(result.state.cards).toEqual(state.cards);
    expect(result.changes).toHaveLength(2);
    const invalid = operation({ ...op, after: { position: 2 } });
    expect(() => resolveOperation(state, invalid, supply([invalid]))).toThrow(/outside/);
  });
}

function registerCountsHiddenMixedSiblingsWhenAssigningDefaultCreationPositions() {
  it("counts hidden mixed siblings when assigning default creation positions", () => {
    const state = snapshot();
    state.cards.push({ ...card(13, "note", id(4), 1), status: "archived", parked: true });
    const op = operation({ operationId: "create", op: "create", entity: "card", after: { storyMapId: id(2), parentId: id(4), level: "story", title: "Next" } });
    expect(resolveOperation(state, op, supply([op])).state.cards.at(-1)).toMatchObject({ position: 2, key: "NEW-1", creationOrigin: "inference", provenance: "inference" });
  });
}

function registerOrdersMixedStorySiblingsByPositionAndCreationTime() {
  it("orders mixed story siblings by position and creation time without bumping sibling versions", () => {
    const state = snapshot();
    state.cards[2]!.position = 2;
    state.cards.push({ ...card(13, "note", id(4), 0), title: "Z title", createdAt: "2026-10-11T10:00:00Z" },
      { ...card(14, "story", id(4), 1), title: "A title", createdAt: "2026-10-11T11:00:00Z" });
    const op = operation({ operationId: "move", op: "move", entity: "card", entityId: id(5), after: { parentId: id(4), position: 0 } });
    const result = resolveOperation(state, op, supply([op]));
    expect(result.state.cards.filter((entry) => entry.parentId === id(4)).sort((a, b) => a.position - b.position).map((entry) => [entry.id, entry.position, entry.version])).toEqual([[id(13), 0, 1], [id(5), 1, 2], [id(14), 2, 1]]);
    expect(result.changes.filter((entry) => entry.entity === "card").map((entry) => entry.entityId)).toContain(id(14));
  });
}

function registerRegistersSUpsertsAsAliasesAndDependencyRoots() {
  it.each(["new", "existing", "unchanged"] as const)("registers %s upserts as aliases and dependency roots", (mode) => {
    const publish = operation({ ...upsert("card"), entityId: "published-local", after: { storyMapId: id(2), level: "activity", title: "Published" } });
    const initial = mode === "new" ? snapshot() : resolveOperation(snapshot(), publish, supply([publish])).state;
    const first = mode === "existing" ? operation({ ...publish, after: { ...publish.after, title: "Updated publication" } }) : publish;
    const target = mode === "new" ? id(100) : initial.externalRefs[0]!.entityId;
    const operations = [first,
      operation({ operationId: "descendant", op: "create", entity: "card", entityId: "child-local", after: { storyMapId: id(2), level: "step", parentId: "published-local", title: "Child" } }),
      operation({ operationId: "chain", op: "create", entity: "card", after: { storyMapId: id(2), level: "story", parentId: "child-local", title: "Grandchild" } }),
      update("same-target", target, "Later edit"), update("independent", id(4), "Independent")];
    const result = resolveOperations(initial, operations, supply(operations));
    expect(result.operations[0]!.status).toBe(mode === "unchanged" ? "unchanged" : "changed");
    expect(result.operations[1]!.dependencies).toContain("publish");
    expect(result.operations[2]!.dependencies).toContain("descendant");
    expect(result.operations[3]!.dependencies).toContain("publish");
    expect(resolveOperations(initial, operations, supply(operations), ["descendant", "chain", "same-target", "independent"]).selectedOperationIds).toEqual(["independent"]);
  });
}

function registerHonorsEffectiveSSelectorsAndPersistedIdentityOverForeign() {
  it.each(["storyMap", "release", "persona"] as const)("honors effective %s selectors and persisted identity over foreign aliases", (entity) => {
    const state = snapshot();
    const target = entity === "storyMap" ? id(2) : entity === "release" ? id(6) : id(7);
    for (const selector of [{ kind: "id", id: target }, { kind: "local", localId: target }]) {
      const op = operation({ operationId: "select", op: "update", entity, entityId: "unused", selector, after: { name: "Selected" } });
      const result = resolveOperation(state, op, supply([op]));
      expect(result.changes.find((change) => change.entity === entity)?.after).toMatchObject({ id: target, name: "Selected" });
    }
    state.projects.push(projectSchema.parse({ id: id(30), name: "Foreign", localPath: "foreign.lsm", createdAt }));
    state.storyMaps.push({ ...state.storyMaps[0]!, id: id(31), projectId: id(30) });
    const foreignId = entity === "storyMap" ? id(31) : id(32);
    if (entity === "release") state.releases.push({ ...state.releases[0]!, id: foreignId, storyMapId: id(31) });
    if (entity === "persona") state.personas.push({ ...state.personas[0]!, id: foreignId, projectId: id(30) });
    const original = structuredClone(state);
    const after = entity === "storyMap" || entity === "persona" ? { projectId: id(1), name: "Alias" } : { storyMapId: id(2), name: "Alias" };
    const operations = [operation({ operationId: "alias", op: "create", entity, entityId: foreignId, after }), operation({ operationId: "edit", op: "update", entity, entityId: "unused", selector: { kind: "local", localId: foreignId }, after: { name: "Foreign edit" } })];
    expect(() => resolveOperations(state, operations, supply(operations))).toThrow(/foreign|another Project/);
    const unknown = operation({ operationId: "unknown", op: "update", entity, entityId: "unused", selector: { kind: "id", id: id(99) }, after: { name: "Unknown" } });
    expect(() => resolveOperation(state, unknown, supply([unknown]))).toThrow(/Persisted target does not exist/);
    expect(state).toEqual(original);
  });
}

function registerResolvesSExternalSelectorsWithEffectiveIdentityAndActual() {
  it.each(["release", "persona"] as const)("resolves %s external selectors with effective identity and actual ownership", (entity) => {
    const state = snapshot();
    const target = entity === "release" ? id(6) : id(7);
    const scope = entity === "release" ? id(2) : id(1);
    state.externalRefs.push({ id: id(40), entityType: entity, entityId: target, scopeId: scope, system: "bmad", externalId: "ref", syncedVersion: 1, createdAt });
    const op = operation({ operationId: "external", op: "update", entity, entityId: "unused", selector: { kind: "externalRef", scopeId: scope, system: "bmad", externalId: "ref" }, after: { name: "Selected" } });
    const original = structuredClone(state);
    expect(resolveOperation(state, op, supply([op])).changes.find((change) => change.entity === entity)?.after).toMatchObject({ id: target, name: "Selected" });
    expect(state).toEqual(original);
    state.projects.push(projectSchema.parse({ id: id(30), name: "Foreign", localPath: "foreign.lsm", createdAt }));
    state.storyMaps.push({ ...state.storyMaps[0]!, id: id(31), projectId: id(30) });
    if (entity === "release") state.releases.push({ ...state.releases[0]!, id: id(32), storyMapId: id(31) });
    else state.personas.push({ ...state.personas[0]!, id: id(32), projectId: id(30) });
    state.externalRefs[0]!.entityId = id(32);
    const foreign = structuredClone(state);
    expect(() => resolveOperation(state, op, supply([op]))).toThrow(/scope|foreign|another Project/);
    expect(state).toEqual(foreign);
  });
}

function registerExecutesIndependentSelectedWorkWhileExcludedTargetsAreUnknown() {
  it("executes independent selected work while excluded targets are unknown or stale", () => {
    const stale = operation({ operationId: "stale", op: "update", entity: "persona", entityId: id(7), after: { name: "Excluded" }, baseVersion: 99 });
    const unknown = update("unknown", id(90), "Excluded missing target");
    const independent = update("selected", id(5), "Selected");
    const operations = [stale, unknown, independent];
    const selected = resolveOperations(snapshot(), operations, supply(operations), ["selected"]);
    expect(selected.operations.map((entry) => [entry.operationId, entry.index])).toEqual([["selected", 2]]);
    expect(selected.state.cards[2]).toMatchObject({ title: "Selected", version: 2 });
  });
}

function testFoldsEarlierAliasesSequentiallyWithNEWKeysAndTransitiveDeselection() {
  const operations = [
    operation({ operationId: "activity", op: "create", entity: "card", entityId: "activity-local", after: { storyMapId: id(2), level: "activity", title: "New activity" } }),
    operation({ operationId: "step", op: "create", entity: "card", entityId: "step-local", after: { storyMapId: id(2), level: "step", parentId: "activity-local", title: "New step" } }),
    operation({ operationId: "story", op: "create", entity: "card", entityId: "story-local", after: { storyMapId: id(2), level: "story", parentId: "step-local", title: "New story" } }),
    update("independent", id(5), "Independent")
  ];
  const result = resolveOperations(snapshot(), operations, supply(operations));
  expect(result.state.cards.slice(3).map((entry) => [entry.key, entry.parentId])).toEqual([["NEW-1", null], ["NEW-2", id(100)], ["NEW-3", id(101)]]);
  expect(result.operations[1]!.dependencies).toContain("activity");
  expect(result.operations[2]!.dependencies).toContain("step");
  expect(deselectOperationDependents(result.operations, operations.map((entry) => entry.operationId), ["activity"])).toEqual(["independent"]);
  const selected = resolveOperations(snapshot(), operations, supply(operations), ["independent"]);
  expect(selected.state.cards).toHaveLength(3);
  expect(selected.state.cards[2]!.title).toBe("Independent");
}

function testDistinguishesSharedGitHubDetachFromDirectCanonicalUnlinkAndIncludesEvery() {
  const state = snapshot();
  state.cards.push({ ...card(13, "story", id(4), 1), provenance: "linked" });
  state.cards[2]!.provenance = "linked";
  state.githubLinks.push(githubLinkSchema.parse({ id: id(16), cardId: id(5), repo: "org/repo", issueNumber: 42, url: "https://github.com/org/repo/issues/42", syncState: "unsynced" }));
  state.externalRefs.push({ id: id(16), entityType: "card", entityId: id(5), system: "github", externalId: "https://github.com/org/repo/issues/42", scopeId: id(2), syncedVersion: 1, createdAt });
  state.sourceLinks.push({ kind: "github", id: id(17), cardId: id(13), externalRefId: id(16), repoFullName: "org/repo", issueNumber: 42, url: "https://github.com/org/repo/issues/42" });
  const shared = operation({ operationId: "shared", op: "unlink", entity: "sourceLink", entityId: "shared-id", after: { kind: "github", cardId: id(13), id: id(17) } });
  const detached = resolveOperation(state, shared, supply([shared]));
  expect(detached.state.githubLinks).toEqual(state.githubLinks);
  expect(detached.state.cards.find((entry) => entry.id === id(5))).toMatchObject({ provenance: "linked", version: 1 });
  const direct = operation({ operationId: "direct", op: "unlink", entity: "sourceLink", entityId: "direct-id", after: { kind: "github", cardId: id(5), id: id(16) } });
  const removed = resolveOperation(state, direct, supply([direct]));
  expect(removed.state.githubLinks).toEqual([]);
  expect(removed.state.sourceLinks).toEqual([]);
  expect(removed.changes.filter((entry) => entry.entity === "card").map((entry) => entry.entityId).sort()).toEqual([id(5), id(13)].sort());
  expect(removed.state.cards.filter((entry) => [id(5), id(13)].includes(entry.id)).every((entry) => entry.provenance === "manual" && entry.version === 2)).toBe(true);
}

function testConflictsEvenOnUnchangedPublicationAfterHumanEditsAndPreservesOther() {
  const op = upsert("card");
  const created = resolveOperation(snapshot(), op, supply([op]));
  const state = structuredClone(created.state);
  state.cards.at(-1)!.version = 2;
  expect(() => resolveOperation(state, op, supply([op]))).toThrow(/baseline conflicts/);
  const fresh = structuredClone(created.state);
  fresh.externalRefs.push({ ...fresh.externalRefs[0]!, id: id(50), system: "other" });
  const changed = operation({ ...op, after: { ...op.after, title: "Changed publication" } });
  const result = resolveOperation(fresh, changed, supply([changed]));
  expect(result.state.externalRefs.map((entry) => [entry.system, entry.syncedVersion])).toEqual([["bmad", 2], ["other", 1]]);
  expect(fresh.externalRefs.map((entry) => entry.syncedVersion)).toEqual([1, 1]);
}

function testResolvesCopyAndBoardImportEffectsFromPreparedIdentities() {
  const operations = [
    operation({ operationId: "copy", op: "create", entity: "storyMapCopy", entityId: id(70), after: { input: { sourceStoryMapId: id(2), targetName: "Copy" }, expected: { [id(2)]: chunkId }, preview: { source: { id: id(2), name: "Map" }, target: { id: id(70), name: "Copy" }, inventory: { cards: 3 } } } }),
    operation({ operationId: "import", op: "create", entity: "githubBoardImport", entityId: id(71), after: { input: { projectId: id(1), storyMapName: "Board", boardUrl: "https://github.com/orgs/org/projects/1", issues: [] }, expected: {}, preview: { connectors: [], sync: { removals: [], overwrites: [] }, cleanup: [] } } })
  ];
  const state = snapshot();
  state.mapFingerprints = { [id(2)]: chunkId };
  const inputs = { ...supply(operations), ids: { copy: id(70), import: id(71) }, boardIds: { import: {} }, boardHashes: { import: {} }, copyIds: { copy: Object.fromEntries([3, 4, 5, 6].map((number) => [id(number), id(number + 300)])) } };
  const original = structuredClone({ state, operations, inputs });
  const result = resolveOperations(state, operations, inputs);
  expect(result.operations.map((entry) => entry.status)).toEqual(["changed", "changed"]);
  expect(result.state.storyMaps.map((map) => map.name)).toEqual(["Map", "Copy", "Board"]);
  expect(result.state.cards.filter((card) => card.storyMapId === id(70)).map((card) => card.creationOrigin)).toEqual(["inference", "inference", "inference"]);
  expect(resolveOperations(state, operations, inputs)).toEqual(result);
  expect({ state, operations, inputs }).toEqual(original);
}

function testValidatesRealMapConnectionOwnershipOnUpdatesWithoutMutatingInput() {
  const state = snapshot();
  state.connections.push(connectorConnectionSchema.parse({ id: id(40), projectId: id(1), provider: "github", name: "Connection", authMode: "token", owner: "org", createdAt, updatedAt: createdAt }));
  const original = structuredClone(state);
  const op = operation({ operationId: "connection", op: "update", entity: "storyMap", entityId: id(2), after: { defaultConnectionId: id(40) } });
  expect(resolveOperation(state, op, supply([op])).state.storyMaps[0]!.defaultConnectionId).toBe(id(40));
  const unknown = operation({ ...op, after: { defaultConnectionId: id(41) } });
  expect(() => resolveOperation(state, unknown, supply([unknown]))).toThrow(/unknown or foreign/);
  const foreign = structuredClone(state);
  foreign.connections[0]!.projectId = id(90);
  const originalForeign = structuredClone(foreign);
  expect(() => resolveOperation(foreign, op, supply([op]))).toThrow(/unknown or foreign/);
  expect(state).toEqual(original);
  expect(foreign).toEqual(originalForeign);
  expect(changeOperationSchema.safeParse({ operationId: "create-connection", op: "create", entity: "storyMap", after: { projectId: id(1), name: "Map", defaultConnectionId: id(40) } }).success).toBe(false);
}



function testIncrementsExistingMapAndPersonaRootsOnceAcrossABatchAnd() {
  const operations = [
    operation({ operationId: "map-first", op: "update", entity: "storyMap", entityId: id(2), baseVersion: 1, after: { name: "First" } }),
    operation({ operationId: "map-second", op: "update", entity: "storyMap", entityId: id(2), baseVersion: 1, after: { name: "Second" } }),
    operation({ operationId: "persona-first", op: "update", entity: "persona", entityId: id(7), baseVersion: 1, after: { name: "First" } }),
    operation({ operationId: "persona-second", op: "update", entity: "persona", entityId: id(7), baseVersion: 1, after: { name: "Second" } }),
    operation({ operationId: "new-persona", op: "create", entity: "persona", entityId: "local-persona", after: { projectId: id(1), name: "New" } }),
    operation({ operationId: "new-persona-update", op: "update", entity: "persona", entityId: "local-persona", after: { name: "New updated" } })
  ];
  const result = resolveOperations(snapshot(), operations, supply(operations));
  expect(result.state.storyMaps[0]).toMatchObject({ name: "Second", version: 2 });
  expect(result.state.personas[0]).toMatchObject({ name: "Second", version: 2 });
  expect(result.state.personas[1]).toMatchObject({ name: "New updated", version: 1 });
}
