import { expect, it } from "vitest";
import { connectorConnectionSchema, changeOperationSchema, cardSchema, githubLinkSchema, personaSchema, projectSchema, releaseSchema, storyMapSchema, type ChangeOperation, type OperationSnapshot } from "@storymapper/contracts";
import { resolveOperations } from "@storymapper/core";

const id = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const createdAt = "2026-10-11T12:00:00.000Z";

it("deselects work on every Card and identity affected by a canonical GitHub unlink", () => {
  const cards = [3, 4, 5].map((number) => cardSchema.parse({ id: id(number), storyMapId: id(2), parentId: null, releaseId: null, key: `LSM-${number}`, level: "story", title: "Story", position: number, version: 1, creationOrigin: "manual", provenance: number < 5 ? "linked" : "manual", createdAt, updatedAt: createdAt }));
  const snapshot: OperationSnapshot = { roadmaps: [], roadmapColumns: [], roadmapSwimlanes: [], roadmapCards: [], roadmapReferences: [], annotations: [], workflowStatuses: [], storyTemplates: [], attachments: [], cardPersonas: [], cardDependencies: [], cardAnnotations: [], remoteWorkItemLinks: [], projectId: id(1), projects: [projectSchema.parse({ id: id(1), name: "Project", localPath: "fixture.lsm", createdAt })], storyMaps: [storyMapSchema.parse({ id: id(2), projectId: id(1), name: "Map", version: 1, createdAt, updatedAt: createdAt })], cards,
    releases: [], personas: [], connections: [], externalRefs: [{ id: id(6), entityType: "card", entityId: id(3), scopeId: id(2), system: "github", externalId: "https://github.com/org/repo/issues/7", syncedVersion: 1, createdAt }], productContexts: [], sourceDocuments: [], sourceChunks: [],
    githubLinks: [githubLinkSchema.parse({ id: id(6), cardId: id(3), repo: "org/repo", issueNumber: 7, url: "https://github.com/org/repo/issues/7", syncState: "unsynced" })],
    sourceLinks: [{ kind: "github", id: id(7), cardId: id(4), externalRefId: id(6), repoFullName: "org/repo", issueNumber: 7, url: "https://github.com/org/repo/issues/7" }] };
  const operations: ChangeOperation[] = [
    { operationId: "unlink", op: "unlink", entity: "sourceLink", entityId: "source", after: { kind: "github", cardId: id(3), id: id(6) } },
    { operationId: "attached-edit", op: "update", entity: "card", entityId: id(4), after: { title: "Attached edit" } },
    { operationId: "attached-chain", op: "update", entity: "card", entityId: id(4), after: { description: "Later edit" } },
    { operationId: "identity-link", op: "link", entity: "sourceLink", entityId: "link", after: { kind: "github", cardId: id(5), externalRefId: id(6) } },
    { operationId: "independent", op: "update", entity: "card", entityId: id(5), after: { title: "Independent" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { "identity-link": id(8) }, externalRefIds: {} };
  const selected = resolveOperations(snapshot, operations, supply, ["attached-edit", "attached-chain", "identity-link"]);
  expect(selected.selectedOperationIds).toEqual([]);
  expect(selected.state).toEqual(snapshot);
  const unlinkAndEdits = resolveOperations(snapshot, operations.slice(0, 3), supply);
  expect(unlinkAndEdits.operations[1]!.dependencies).toContain("unlink");
  expect(unlinkAndEdits.operations[2]!.dependencies).toContain("attached-edit");
  const prior: ChangeOperation = { operationId: "prior", op: "update", entity: "card", entityId: id(4), after: { title: "Prior attached edit" } };
  const sequence = [prior, ...operations.slice(0, 3)];
  expect(resolveOperations(snapshot, sequence, supply).operations[1]!.dependencies).toContain("prior");
  expect(resolveOperations(snapshot, sequence, supply, ["unlink", "attached-edit", "attached-chain"]).selectedOperationIds).toEqual([]);
});

it("matches runtime map-owner dependencies for scoped Personas", () => {
  const snapshot = placementSnapshot();
  snapshot.personas.push(personaSchema.parse({ id: id(17), projectId: id(1), storyMapId: id(2), name: "Reader", role: "User", version: 1 }));
  const operations: ChangeOperation[] = [
    { operationId: "map", op: "update", entity: "storyMap", entityId: id(2), after: { name: "Changed" } },
    { operationId: "persona", op: "update", entity: "persona", entityId: id(17), after: { name: "Changed reader" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: {}, externalRefIds: {} };
  expect(resolveOperations(snapshot, operations, supply).operations[1]!.dependencies).toContain("map");
  expect(resolveOperations(snapshot, operations, supply, ["persona"]).selectedOperationIds).toEqual([]);
});

it.each(["card", "release"] as const)("retains independent default-position %s creation and recomputes its position", (entity) => {
  const snapshot = placementSnapshot();
  const after = entity === "card" ? { storyMapId: id(2), level: "activity" as const, title: "Created" } : { storyMapId: id(2), name: "Created" };
  const operations = ["first", "second"].map((operationId) => ({ operationId, op: "create", entity, after })) as ChangeOperation[];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { first: id(90), second: id(91) }, externalRefIds: {} };
  const all = resolveOperations(snapshot, operations, supply);
  expect(all.operations[1]!.dependencies).not.toContain("first");
  const selected = resolveOperations(snapshot, operations, supply, ["second"]);
  expect(selected.selectedOperationIds).toEqual(["second"]);
  expect((entity === "card" ? all.state.cards : all.state.releases).find((entry) => entry.id === id(91))!.position).toBe(5);
  expect((entity === "card" ? selected.state.cards : selected.state.releases).find((entry) => entry.id === id(91))!.position).toBe(4);
});

function placementSnapshot(level: "story" | "activity" = "story"): OperationSnapshot {
  return { roadmaps: [], roadmapColumns: [], roadmapSwimlanes: [], roadmapCards: [], roadmapReferences: [], annotations: [], workflowStatuses: [], storyTemplates: [], attachments: [], cardPersonas: [], cardDependencies: [], cardAnnotations: [], remoteWorkItemLinks: [], projectId: id(1), projects: [projectSchema.parse({ id: id(1), name: "Project", localPath: "fixture.lsm", createdAt })], storyMaps: [storyMapSchema.parse({ id: id(2), projectId: id(1), name: "Map", version: 1, createdAt, updatedAt: createdAt })],
    cards: [3, 4, 5, 6].map((number, position) => cardSchema.parse({ id: id(number), storyMapId: id(2), parentId: null, releaseId: null, key: `LSM-${number}`, level, title: "Card", position, version: 1, creationOrigin: "manual", provenance: "manual", createdAt, updatedAt: createdAt })),
    releases: [13, 14, 15, 16].map((number, position) => releaseSchema.parse({ id: id(number), storyMapId: id(2), name: "Release", position, version: 1, startDate: null, releaseDate: null })),
    personas: [], connections: [], externalRefs: [], productContexts: [], sourceDocuments: [], sourceChunks: [], sourceLinks: [], githubLinks: [] };
}

it.each(["story", "activity"] as const)("matches runtime dependencies for changed and unchanged %s siblings", (level) => {
  const snapshot = placementSnapshot(level);
  const original = structuredClone(snapshot);
  const operations: ChangeOperation[] = [
    { operationId: "move", op: "move", entity: "card", entityId: id(6), after: { parentId: null, position: 1 } },
    { operationId: "shifted", op: "update", entity: "card", entityId: id(5), after: { title: "Shifted edit" } },
    { operationId: "chain", op: "update", entity: "card", entityId: id(5), after: { description: "Chained edit" } },
    { operationId: "untouched", op: "update", entity: "card", entityId: id(3), after: { title: "Independent edit" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: {}, externalRefIds: {} };
  const runtime = resolveOperations(snapshot, operations, supply);
  expect(runtime.operations[1]!.dependencies).toContain("move");
  expect(runtime.operations[3]!.dependencies).not.toContain("move");
  const selected = resolveOperations(snapshot, operations, supply, ["shifted", "chain", "untouched"]);
  expect(selected.selectedOperationIds).toEqual(["untouched"]);
  expect(selected.state.cards.find((card) => card.id === id(5))).toEqual(snapshot.cards[2]);
  expect(selected.state.cards[0]!.title).toBe("Independent edit");
  expect(snapshot).toEqual(original);
});

it("matches runtime dependencies for shifted and unchanged Release lanes", () => {
  const snapshot = placementSnapshot();
  const operations: ChangeOperation[] = [
    { operationId: "move", op: "update", entity: "release", entityId: id(16), after: { position: 1 } },
    { operationId: "shifted", op: "update", entity: "release", entityId: id(15), after: { name: "Shifted edit" } },
    { operationId: "chain", op: "update", entity: "release", entityId: id(15), after: { goal: "Chained edit" } },
    { operationId: "untouched", op: "update", entity: "release", entityId: id(13), after: { name: "Independent edit" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: {}, externalRefIds: {} };
  const runtime = resolveOperations(snapshot, operations, supply);
  expect(runtime.operations[1]!.dependencies).toContain("move");
  expect(runtime.operations[3]!.dependencies).not.toContain("move");
  const selected = resolveOperations(snapshot, operations, supply, ["shifted", "chain", "untouched"]);
  expect(selected.selectedOperationIds).toEqual(["untouched"]);
  expect(selected.state.releases[2]).toEqual(snapshot.releases[2]);
  expect(selected.state.releases[0]!.name).toBe("Independent edit");
});

it("skips an excluded out-of-range movement while retaining independent work", () => {
  const snapshot = placementSnapshot();
  const operations: ChangeOperation[] = [
    { operationId: "invalid", op: "update", entity: "release", entityId: id(16), after: { position: 99 } },
    { operationId: "independent", op: "update", entity: "release", entityId: id(13), after: { name: "Independent edit" } }
  ];
  expect(resolveOperations(snapshot, operations, { createdAt, creationOrigin: "manual", ids: {}, externalRefIds: {} }, ["independent"]).selectedOperationIds).toEqual(["independent"]);
});

it.each(["archive", "park", "unpark"] as const)("deselects child reassignment that depends on an earlier %s neighbor change", (op) => {
  const snapshot = placementSnapshot("activity");
  snapshot.cards.push(cardSchema.parse({ ...snapshot.cards[0], id: id(80), key: "LSM-80", parentId: id(3), level: "step", position: 0 }));
  if (op === "unpark") snapshot.cards[1]!.parked = true;
  const operations: ChangeOperation[] = [
    changeOperationSchema.parse({ operationId: "visibility", op, entity: "card", entityId: id(4), after: op === "park" ? { childStrategy: "unassign" } : {} }),
    { operationId: "rehome", op: "park", entity: "card", entityId: id(3), after: { childStrategy: "reassign-right" } },
    { operationId: "child", op: "update", entity: "card", entityId: id(80), after: { title: "Edited child" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: {}, externalRefIds: {} };
  const all = resolveOperations(snapshot, operations, supply);
  expect(all.state.cards.find((card) => card.id === id(80))!.parentId).toBe(id(5));
  expect(resolveOperations(snapshot, operations, supply, ["rehome", "child"]).selectedOperationIds).toEqual([]);
});

it("deselects nested bulk Release and relationship references with their prerequisites", () => {
  const snapshot = placementSnapshot();
  const operations: ChangeOperation[] = [
    { operationId: "release", op: "create", entity: "release", entityId: "new-release", after: { storyMapId: id(2), name: "Release" } },
    { operationId: "persona", op: "create", entity: "persona", entityId: "new-persona", after: { projectId: id(1), name: "Reader", role: "User" } },
    { operationId: "bulk", op: "bulk", entity: "card", entityId: id(3), after: { storyMapId: id(2), cards: [{ id: id(3), baseVersion: 1 }], patch: { releaseId: "new-release", addPersonaId: "new-persona" } } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { release: id(90), persona: id(91) }, externalRefIds: {}, bulkRelationshipIds: { bulk: { [id(3)]: { persona: id(92) } } } };
  expect(resolveOperations(snapshot, operations, supply).state.cardPersonas).toEqual([{ id: id(92), cardId: id(3), personaId: id(91), createdAt }]);
  expect(resolveOperations(snapshot, operations, supply, ["release", "bulk"]).selectedOperationIds).toEqual(["release"]);
  expect(resolveOperations(snapshot, operations, supply, ["persona", "bulk"]).selectedOperationIds).toEqual(["persona"]);
});

it("deselects reads of the new GitHub owner after an excluded ownership update", () => {
  const snapshot = placementSnapshot();
  snapshot.externalRefs.push({ id: id(70), entityType: "card", entityId: id(3), scopeId: id(2), system: "github", externalId: "https://github.com/org/repo/issues/1", syncedVersion: 1, createdAt });
  snapshot.githubLinks.push(githubLinkSchema.parse({ id: id(70), syncState: "unsynced", cardId: id(3), repo: "org/repo", issueNumber: 1, url: "https://github.com/org/repo/issues/1" }));
  const operations: ChangeOperation[] = [
    { operationId: "owner", op: "update", entity: "githubExternalRef", entityId: id(70), after: { entityType: "card", entityId: id(4), scopeId: id(2), externalId: "https://github.com/org/repo/issues/1" } },
    { operationId: "delete", op: "delete", entity: "card", entityId: id(4), after: { strategy: "unassign" } },
    { operationId: "later", op: "update", entity: "card", entityId: id(3), after: { title: "Later" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: {}, externalRefIds: {} };
  expect(resolveOperations(snapshot, operations, supply).state.githubLinks).toEqual([]);
  expect(resolveOperations(snapshot, operations, supply, ["delete", "later"]).selectedOperationIds).toEqual([]);
});

it("deselects Annotation deletion after a bulk addition and preserves the original relationship state", () => {
  const snapshot = placementSnapshot();
  snapshot.annotations.push({ id: id(70), projectId: id(1), storyMapId: null, name: "Risk", icon: "", color: "", position: 0 });
  const operations: ChangeOperation[] = [
    { operationId: "bulk", op: "bulk", entity: "card", entityId: id(3), after: { storyMapId: id(2), cards: [{ id: id(3), baseVersion: 1 }], patch: { addAnnotationId: id(70) } } },
    { operationId: "delete", op: "delete", entity: "annotation", entityId: id(70), after: { definitionBefore: snapshot.annotations[0]!, affectedCards: [{ id: id(3), baseVersion: 1 }], confirmUnlink: true } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: {}, externalRefIds: {}, bulkRelationshipIds: { bulk: { [id(3)]: { annotation: id(71) } } } };
  expect(resolveOperations(snapshot, operations, supply).operations[1]!.dependencies).toContain("bulk");
  const selected = resolveOperations(snapshot, operations, supply, ["delete"]);
  expect(selected.selectedOperationIds).toEqual([]);
  expect(selected.state).toEqual(snapshot);
});

it("deselects structural neighbor choice after excluded bulk archival", () => {
  const snapshot = placementSnapshot("activity");
  snapshot.cards.push(cardSchema.parse({ ...snapshot.cards[0], id: id(80), key: "LSM-80", parentId: id(3), level: "step", position: 0 }));
  const operations: ChangeOperation[] = [
    { operationId: "bulk", op: "bulk", entity: "card", entityId: id(4), after: { storyMapId: id(2), cards: [{ id: id(4), baseVersion: 1 }], patch: { status: "archived" } } },
    { operationId: "rehome", op: "park", entity: "card", entityId: id(3), after: { childStrategy: "reassign-right" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: {}, externalRefIds: {} };
  expect(resolveOperations(snapshot, operations, supply).state.cards.find((row) => row.id === id(80))!.parentId).toBe(id(5));
  expect(resolveOperations(snapshot, operations, supply, ["rehome"]).selectedOperationIds).toEqual([]);
});

it("keeps collateral Card baselines independent of the directly deleted Persona", () => {
  const snapshot = placementSnapshot();
  snapshot.cards[0]!.version = 3;
  snapshot.personas.push(personaSchema.parse({ id: id(70), projectId: id(1), storyMapId: null, name: "Reader", role: "User", version: 1 }));
  snapshot.cardPersonas.push({ id: id(71), cardId: id(3), personaId: id(70), createdAt });
  const operation: ChangeOperation = { operationId: "delete", op: "delete", entity: "persona", entityId: id(70), baseVersion: 1, after: { definitionBefore: snapshot.personas[0]!, affectedCards: [{ id: id(3), baseVersion: 3 }], confirmUnlink: true } };
  const result = resolveOperations(snapshot, [operation], { createdAt, creationOrigin: "manual", ids: {}, externalRefIds: {} });
  expect(result.state.cards[0]!.version).toBe(4);
  expect(result.state.cardPersonas).toEqual([]);
  expect(result.operations[0]!.owners).toContainEqual({ entity: "card", entityId: id(3), projectId: id(1) });
  expect(snapshot.cards[0]!.version).toBe(3);
});

it("parks an Activity using its own baseline while rehoming differently versioned descendants", () => {
  const snapshot = placementSnapshot("activity");
  snapshot.cards.push(cardSchema.parse({ ...snapshot.cards[0], id: id(80), key: "LSM-80", parentId: id(3), level: "step", version: 3 }));
  const operation: ChangeOperation = { operationId: "park", op: "park", entity: "card", entityId: id(3), baseVersion: 1, after: { childStrategy: "reassign-right" } };
  const result = resolveOperations(snapshot, [operation], { createdAt, creationOrigin: "manual", ids: {}, externalRefIds: {} });
  expect(result.state.cards[0]!.version).toBe(2);
  expect(result.state.cards.find((row) => row.id === id(80))).toMatchObject({ parentId: id(4), version: 4 });
});

it("tracks new external bindings before selectors and their transitive edits", () => {
  const snapshot = placementSnapshot();
  const operations: ChangeOperation[] = [
    { operationId: "bind", op: "set", entity: "externalRef", entityId: "binding", after: { entityType: "card", entityId: id(3), scopeId: id(2), system: "bmad", externalId: "story" } },
    { operationId: "select", op: "update", entity: "card", entityId: "unused", selector: { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "story" }, after: { title: "Selected" } },
    { operationId: "later", op: "update", entity: "card", entityId: id(3), after: { description: "Later" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { bind: id(90) }, externalRefIds: {} };
  expect(resolveOperations(snapshot, operations, supply).state.cards[0]!.title).toBe("Selected");
  expect(resolveOperations(snapshot, operations, supply, ["select", "later"]).selectedOperationIds).toEqual([]);
});

it("tracks deleted external bindings before upserts so deselection cannot select another entity", () => {
  const snapshot = placementSnapshot();
  snapshot.externalRefs.push({ id: id(70), entityType: "card", entityId: id(3), scopeId: id(2), system: "bmad", externalId: "story", syncedVersion: 1, createdAt });
  const operations: ChangeOperation[] = [
    { operationId: "unbind", op: "delete", entity: "externalRef", entityId: id(70), after: {} },
    { operationId: "upsert", op: "upsert", entity: "card", entityId: "new", selector: { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "story" }, after: { storyMapId: id(2), level: "story", title: "New" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { upsert: id(90) }, externalRefIds: { upsert: id(91) } };
  expect(resolveOperations(snapshot, operations, supply).state.cards).toHaveLength(5);
  expect(resolveOperations(snapshot, operations, supply, ["upsert"]).selectedOperationIds).toEqual([]);
});

it.each(["archive", "update", "bulk"] as const)("retains %s prerequisites that make Workflow Status deletion permissible", (op) => {
  const snapshot = placementSnapshot();
  snapshot.cards[0]!.status = "review";
  snapshot.workflowStatuses.push({ id: id(70), projectId: id(1), storyMapId: null, name: "review", group: "active", position: 0 });
  const operations: ChangeOperation[] = [changeOperationSchema.parse({ operationId: "status", op, entity: "card", entityId: id(3), after: op === "archive" ? {} : op === "bulk" ? { storyMapId: id(2), cards: [{ id: id(3), baseVersion: 1 }], patch: { status: "done" } } : { status: "done" } }),
    { operationId: "delete", op: "delete", entity: "workflowStatus", entityId: id(70), after: { definitionBefore: snapshot.workflowStatuses.find((row) => row.id === id(70))!, affectedCards: [] } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: {}, externalRefIds: {} };
  expect(resolveOperations(snapshot, operations, supply).state.workflowStatuses).toEqual([]);
  expect(resolveOperations(snapshot, operations, supply, ["delete"]).selectedOperationIds).toEqual([]);
});

it.each(["archive", "status"])("resolves a local Map scope through binding and external %s delivery", (action) => {
  const snapshot = placementSnapshot();
  snapshot.workflowStatuses.push({ id: id(95), projectId: id(1), storyMapId: null, name: "done", group: "done", position: 1 });
  const operations: ChangeOperation[] = [
    { operationId: "map", op: "create", entity: "storyMap", entityId: id(98), after: { projectId: id(1), name: "New" } },
    { operationId: "card", op: "create", entity: "card", entityId: id(99), after: { storyMapId: id(90), level: "story", title: "New" } },
    { operationId: "bind", op: "set", entity: "externalRef", entityId: "new-binding", after: { entityType: "card", entityId: id(99), scopeId: id(98), system: "bmad", externalId: "story" } },
    changeOperationSchema.parse({ operationId: "delivery", op: action === "archive" ? "archive" : "update", entity: "card", entityId: "unused", selector: { kind: "externalRef", scopeId: id(98), system: "bmad", externalId: "story" }, after: action === "archive" ? {} : { status: "done" } })
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { map: id(90), card: id(91), bind: id(92) }, externalRefIds: {} };
  const result = resolveOperations(snapshot, operations, supply);
  expect(result.state.cards.find((card) => card.id === id(91))).toMatchObject(action === "archive" ? { archived: true, status: "todo" } : { status: "done" });
  expect(result.state.externalRefs[0]!.syncedVersion).toBe(result.state.cards.find((card) => card.id === id(91))!.version);
  expect(result.operations[3]!.dependencies).toContain("bind");
  expect(resolveOperations(snapshot, operations, supply, ["map", "card", "delivery"]).selectedOperationIds).toEqual(["map", "card"]);
});

it("resolves a local Map scope in a full Map/Card/external binding chain", () => {
  const snapshot = placementSnapshot();
  const operations: ChangeOperation[] = [
    { operationId: "map", op: "create", entity: "storyMap", entityId: id(98), after: { projectId: id(1), name: "New" } },
    { operationId: "card", op: "create", entity: "card", entityId: id(99), after: { storyMapId: id(90), level: "story", title: "New" } },
    { operationId: "bind", op: "set", entity: "externalRef", entityId: "new-binding", after: { entityType: "card", entityId: id(99), scopeId: id(98), system: "bmad", externalId: "story" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { map: id(90), card: id(91), bind: id(92) }, externalRefIds: {} };
  expect(resolveOperations(snapshot, operations, supply).state.externalRefs).toEqual([{ id: id(92), entityType: "card", entityId: id(91), scopeId: id(90), system: "bmad", externalId: "story", syncedVersion: 1, createdAt }]);
  expect(resolveOperations(snapshot, operations, supply, ["card", "bind"]).selectedOperationIds).toEqual([]);
});

it.each(["document-id", "document-type", "timestamp", "chunk-id"])("rejects malformed prepared %s before inserting source rows", (field) => {
  const snapshot = placementSnapshot();
  const operation: ChangeOperation = { operationId: "import", op: "import", entity: "sourceDocument", after: { projectId: id(1), title: "Source", type: "txt", fileHash: "a".repeat(64) } };
  const prepared = { document: { id: id(90), projectId: id(1), title: "Source", type: "txt" as const, fileHash: "a".repeat(64), filePath: "documents/source.txt", importedAt: createdAt }, chunks: [{ id: "b".repeat(64), documentId: id(90), locator: "L1", text: "Requirement" }] };
  const malformed = structuredClone(prepared);
  if (field === "document-id") malformed.document.id = "bad";
  if (field === "document-type") Object.assign(malformed.document, { type: "pdf" });
  if (field === "timestamp") malformed.document.importedAt = "yesterday";
  if (field === "chunk-id") malformed.chunks[0]!.id = "bad";
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { import: id(90) }, externalRefIds: {}, preparedSourceImports: { import: malformed } };
  const before = structuredClone({ snapshot, operation, supply });
  expect(() => resolveOperations(snapshot, [operation], supply)).toThrow("Prepared source document or chunks violate domain schemas");
  expect({ snapshot, operation, supply }).toEqual(before);
});

it.each([id(1), id(71), id(72), "b".repeat(64), id(73)])("rejects Roadmap seed collision with any persisted identity %s", (collision) => {
  const snapshot = placementSnapshot();
  snapshot.connections.push(connectorConnectionSchema.parse({ id: id(71), projectId: id(1), provider: "github", name: "Repo", authMode: "token", owner: "org", repository: "repo", readOnly: false, createdAt, updatedAt: createdAt }));
  snapshot.sourceDocuments.push({ id: id(72), projectId: id(1), title: "Source", type: "txt", fileHash: "a".repeat(64), filePath: "documents/source.txt", importedAt: createdAt });
  snapshot.sourceChunks.push({ id: "b".repeat(64), documentId: id(72), locator: "L1", text: "Requirement" });
  snapshot.sourceLinks.push({ id: id(73), kind: "note", cardId: id(3), note: "Evidence", createdAt });
  const operation: ChangeOperation = { operationId: "roadmap", op: "create", entity: "roadmap", after: { projectId: id(1), name: "Roadmap" } };
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { roadmap: id(90) }, externalRefIds: {}, roadmapSeedIds: { roadmap: { columns: [collision, id(91), id(92)] as const, swimlane: id(93) } } };
  const before = structuredClone(snapshot);
  expect(() => resolveOperations(snapshot, [operation], supply)).toThrow("already exists");
  expect(snapshot).toEqual(before);
});

it("ignores undefined fields when applying a direct-object Product Context patch", () => {
  const snapshot = placementSnapshot();
  snapshot.productContexts.push({ id: id(70), projectId: id(1), storyMapId: null, productType: "Type", purpose: "Old", keyFeatures: ["Feature"], targetUsers: "User", platform: "Local", pricing: "Free", notes: "Keep", glossary: "Terms", nonGoals: "Outside", complianceConstraints: "Constraint", updatedAt: createdAt });
  const operation: ChangeOperation = { operationId: "context", op: "set", entity: "productContext", entityId: id(70), after: { projectId: id(1), purpose: "New", notes: undefined } };
  const result = resolveOperations(snapshot, [operation], { createdAt, creationOrigin: "manual", ids: {}, externalRefIds: {} });
  expect(result.state.productContexts[0]).toEqual({ ...snapshot.productContexts[0], purpose: "New" });
});

it("updates GitHub evidence Cards without borrowing the direct owner baseline", () => {
  const snapshot = placementSnapshot();
  snapshot.cards[1]!.version = 3;
  snapshot.externalRefs.push({ id: id(70), entityType: "card", entityId: id(3), scopeId: id(2), system: "github", externalId: "https://github.com/org/repo/issues/1", syncedVersion: 1, createdAt });
  snapshot.githubLinks.push(githubLinkSchema.parse({ id: id(70), cardId: id(3), repo: "org/repo", issueNumber: 1, url: "https://github.com/org/repo/issues/1", syncState: "unsynced" }));
  snapshot.sourceLinks.push({ id: id(71), kind: "github", cardId: id(4), externalRefId: id(70), repoFullName: "org/repo", issueNumber: 1, url: "https://github.com/org/repo/issues/1" });
  const operation = changeOperationSchema.parse({ operationId: "github", op: "update", entity: "githubExternalRef", entityId: id(70), baseVersion: 1, after: { entityType: "card", entityId: id(3), scopeId: id(2), externalId: "https://github.com/org/repo/issues/2" } });
  const supply = { createdAt, creationOrigin: "manual" as const, ids: {}, externalRefIds: {} };
  const result = resolveOperations(snapshot, [operation], supply);
  expect(result.state.cards[0]!.version).toBe(2);
  expect(result.state.cards[1]!.version).toBe(4);
  expect(() => resolveOperations(snapshot, [{ ...operation, baseVersion: 2 }], supply)).toThrow("baseline");
});

it.each(["card", "release", "persona"] as const)("tracks deleted %s bindings through replacement upserts and new literal-id edits", (entity) => {
  const snapshot = placementSnapshot();
  snapshot.personas.push(personaSchema.parse({ id: id(70), projectId: id(1), storyMapId: id(2), name: "Reader", role: "User", version: 1 }));
  const targetId = entity === "card" ? id(3) : entity === "release" ? id(13) : id(70);
  snapshot.externalRefs.push({ id: id(80), entityType: entity, entityId: targetId, scopeId: id(2), system: "bmad", externalId: "replaced", syncedVersion: 1, createdAt });
  const operations = [
    { operationId: "delete", op: "delete", entity, entityId: targetId, baseVersion: 1, after: entity === "card" ? { strategy: "unassign" } : entity === "persona" ? { definitionBefore: snapshot.personas[0]!, affectedCards: [] } : {} },
    { operationId: "upsert", op: "upsert", entity, entityId: "replacement", selector: { kind: "externalRef", scopeId: id(2), system: "bmad", externalId: "replaced" }, after: entity === "card" ? { storyMapId: id(2), level: "story", title: "Replacement" } : entity === "release" ? { storyMapId: id(2), name: "Replacement" } : { projectId: id(1), storyMapId: id(2), name: "Replacement" } },
    { operationId: "edit", op: "update", entity, entityId: id(90), baseVersion: 1, after: entity === "card" ? { title: "Edited" } : { name: "Edited" } }
  ].map((operation) => changeOperationSchema.parse(operation));
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { upsert: id(90) }, externalRefIds: { upsert: id(91) } };
  const before = structuredClone({ snapshot, operations, supply });
  const result = resolveOperations(snapshot, operations, supply);
  const rows = entity === "card" ? result.state.cards : entity === "release" ? result.state.releases : result.state.personas;
  expect(rows.find((row) => row.id === id(90))?.version).toBe(1);
  expect(result.state.externalRefs).toEqual([{ id: id(91), entityType: entity, entityId: id(90), scopeId: id(2), system: "bmad", externalId: "replaced", syncedVersion: 1, createdAt }]);
  expect(resolveOperations(snapshot, operations, supply, ["delete", "edit"]).selectedOperationIds).toEqual(["delete"]);
  expect(resolveOperations(snapshot, operations, supply, ["upsert", "edit"]).selectedOperationIds).toEqual([]);
  expect({ snapshot, operations, supply }).toEqual(before);
});

it("permits scope-only Product Context creation and preserves populated existing fields", () => {
  const snapshot = placementSnapshot();
  const operation: ChangeOperation = { operationId: "context", op: "set", entity: "productContext", entityId: "product-context", after: { projectId: id(1), purpose: undefined } };
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { context: id(70) }, externalRefIds: {} };
  const created = resolveOperations(snapshot, [operation], supply);
  expect(created.state.productContexts[0]).toMatchObject({ id: id(70), projectId: id(1), storyMapId: null, purpose: "", keyFeatures: [] });
  created.state.productContexts[0]!.purpose = "Keep";
  created.state.productContexts[0]!.notes = "Populated";
  const before = structuredClone(created.state);
  expect(resolveOperations(created.state, [operation], supply).state.productContexts).toEqual(before.productContexts);
  expect(created.state).toEqual(before);
});

it("reports the Project owner of a deduplicated prepared source import without changes", () => {
  const snapshot = placementSnapshot();
  const document = { id: id(70), projectId: id(1), title: "Source", type: "txt" as const, fileHash: "a".repeat(64), filePath: "documents/source.txt", importedAt: createdAt };
  snapshot.sourceDocuments.push(document);
  const operation: ChangeOperation = { operationId: "import", op: "import", entity: "sourceDocument", after: { projectId: id(1), title: "Source", type: "txt", fileHash: document.fileHash } };
  const before = structuredClone(snapshot);
  const result = resolveOperations(snapshot, [operation], { createdAt, creationOrigin: "manual", ids: {}, externalRefIds: {}, preparedSourceImports: { import: { document, chunks: [] } } });
  expect(result.operations[0]).toMatchObject({ status: "unchanged", changes: [], owners: [{ entity: "project", entityId: id(1), projectId: id(1) }] });
  expect(result.state).toEqual(before);
  expect(snapshot).toEqual(before);
});

it("reports the Project owner of a repeated scope-only Product Context set", () => {
  const snapshot = placementSnapshot();
  snapshot.productContexts.push({ id: id(70), projectId: id(1), storyMapId: null, productType: "Type", purpose: "Purpose", keyFeatures: [], targetUsers: "Users", platform: "Local", pricing: "Free", notes: "Notes", glossary: "Terms", nonGoals: "Outside", complianceConstraints: "Constraints", updatedAt: createdAt });
  const operation: ChangeOperation = { operationId: "context", op: "set", entity: "productContext", entityId: id(70), after: { projectId: id(1) } };
  const result = resolveOperations(snapshot, [operation], { createdAt, creationOrigin: "manual", ids: {}, externalRefIds: {} });
  expect(result.operations[0]).toMatchObject({ status: "unchanged", changes: [], owners: [{ entity: "project", entityId: id(1), projectId: id(1) }] });
  expect(result.state).toEqual(snapshot);
});

it("reports the Roadmap owner of an existing reference without effects or version changes", () => {
  const snapshot = placementSnapshot();
  snapshot.roadmaps.push({ id: id(70), projectId: id(1), storyMapId: id(2), name: "Roadmap", type: "simple", version: 3, createdAt, updatedAt: createdAt });
  snapshot.roadmapCards.push({ id: id(71), roadmapId: id(70), columnId: id(72), swimlaneId: null, title: "Goal", details: "", labels: [], reach: null, impact: null, confidence: null, effort: null, position: 0 });
  snapshot.roadmapReferences.push({ id: id(73), roadmapCardId: id(71), targetType: "card", targetId: id(3) });
  const operation: ChangeOperation = { operationId: "reference", op: "create", entity: "roadmapReference", after: { roadmapCardId: id(71), targetType: "card", targetId: id(3) } };
  const result = resolveOperations(snapshot, [operation], { createdAt, creationOrigin: "manual", ids: {}, externalRefIds: {} });
  expect(result.operations[0]).toMatchObject({ status: "unchanged", changes: [], owners: [{ entity: "roadmap", entityId: id(70), projectId: id(1) }] });
  expect(result.state).toEqual(snapshot);
});

it("deselects a Roadmap reference to an excluded Release or Card creation", () => {
  const snapshot = placementSnapshot();
  snapshot.roadmaps.push({ id: id(70), projectId: id(1), storyMapId: id(2), name: "Roadmap", type: "simple", version: 3, createdAt, updatedAt: createdAt });
  snapshot.roadmapCards.push({ id: id(71), roadmapId: id(70), columnId: id(72), swimlaneId: null, title: "Goal", details: "", labels: [], reach: null, impact: null, confidence: null, effort: null, position: 0 });
  const operations: ChangeOperation[] = [
    { operationId: "release", op: "create", entity: "release", entityId: "new-release", after: { storyMapId: id(2), name: "Release" } },
    { operationId: "reference", op: "create", entity: "roadmapReference", after: { roadmapCardId: id(71), targetType: "release", targetId: "new-release" } }
  ];
  const supply = { createdAt, creationOrigin: "manual" as const, ids: { release: id(90), reference: id(91) }, externalRefIds: {} };
  expect(resolveOperations(snapshot, operations, supply).state.roadmapReferences).toEqual([{ id: id(91), roadmapCardId: id(71), targetType: "release", targetId: id(90) }]);
  expect(resolveOperations(snapshot, operations, supply, ["reference"]).selectedOperationIds).toEqual([]);
});

it("reports every addressed Card owner for unchanged bulk on roots created earlier in the cut", () => {
  const snapshot = placementSnapshot();
  const operations: ChangeOperation[] = [
    { operationId: "first", op: "create", entity: "card", entityId: "first-card", after: { storyMapId: id(2), level: "story", title: "First", status: "done" } },
    { operationId: "second", op: "create", entity: "card", entityId: "second-card", after: { storyMapId: id(2), level: "story", title: "Second", status: "done" } },
    { operationId: "bulk", op: "bulk", entity: "card", entityId: "bulk-target", after: { storyMapId: id(2), cards: [{ id: "first-card", baseVersion: 1 }, { id: "second-card", baseVersion: 1 }], patch: { status: "done" } } }
  ];
  const before = structuredClone(snapshot);
  const result = resolveOperations(snapshot, operations, { createdAt, creationOrigin: "manual", ids: { first: id(90), second: id(91) }, externalRefIds: {} });
  expect(result.operations[2]).toMatchObject({ status: "unchanged", changes: [], owners: [{ entity: "card", entityId: id(90), projectId: id(1) }, { entity: "card", entityId: id(91), projectId: id(1) }] });
  expect(result.operations[2]!.state).toEqual(result.operations[1]!.state);
  expect(snapshot).toEqual(before);
});
