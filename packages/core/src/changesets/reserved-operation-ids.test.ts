import { expect, it } from "vitest";
import { cardSchema, changeOperationSchema, projectSchema, storyMapSchema, type OperationSnapshot, type OperationSupply } from "@storymapper/contracts";
import { resolveOperation } from "@storymapper/core";
import { ownString, ownValue } from "@storymapper/core/changesets/supply-values";

const id = (number: number): string => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const createdAt = "2026-10-11T12:00:00Z";
const chunkId = "a".repeat(64);

function snapshot(): OperationSnapshot {
  return {
    roadmaps: [], roadmapColumns: [], roadmapSwimlanes: [], roadmapCards: [], roadmapReferences: [], annotations: [], workflowStatuses: [], storyTemplates: [], attachments: [], cardPersonas: [], cardDependencies: [], cardAnnotations: [], remoteWorkItemLinks: [], projectId: id(1), projects: [projectSchema.parse({ id: id(1), name: "Project", localPath: "fixture.lsm", createdAt })],
    storyMaps: [storyMapSchema.parse({ id: id(2), projectId: id(1), name: "Map", version: 1, createdAt, updatedAt: createdAt })],
    cards: [],
    releases: [],
    personas: [],
    externalRefs: [], productContexts: [], sourceDocuments: [{ id: id(8), projectId: id(1), title: "Source", type: "txt", filePath: "documents/source.txt", fileHash: chunkId, importedAt: createdAt }],
    sourceChunks: [{ id: chunkId, documentId: id(8), locator: "L1", text: "Requirement" }], sourceLinks: [], githubLinks: [], connections: []
  };
}

it.each(["__proto__", "constructor", "toString"])("resolves own allocated strings for schema-valid %s", (operationId) => {
  const operation = changeOperationSchema.parse({ operationId, op: "create", entity: "card", after: { storyMapId: id(2), level: "activity", title: "Reserved" } });
  const inputs: OperationSupply = { createdAt, creationOrigin: "manual", ids: { [operationId]: id(100) }, externalRefIds: {} };
  expect(resolveOperation(snapshot(), operation, inputs).state.cards[0]!.id).toBe(id(100));
  for (const ids of [{}, Object.create({ [operationId]: id(100) }), { [operationId]: "" }, { [operationId]: "  " }, { [operationId]: 42 }, { [operationId]: {} }]) {
    expect(() => resolveOperation(snapshot(), operation, { ...inputs, ids })).toThrow("Application must supply an allocated id.");
  }
});

it("reads only own dictionary values including nested allocations", () => {
  const inherited = Object.create({ constructor: { toString: id(100) } }) as Record<string, Record<string, string>>;
  expect(ownValue(inherited, "constructor")).toBeUndefined();
  expect(ownString({}, "__proto__")).toBeUndefined();
  expect(ownString({ ["__proto__"]: id(100) }, "__proto__")).toBe(id(100));
});

it.each(["__proto__", "constructor", "toString"])("refuses inherited prepared imports for %s", (operationId) => {
  const state = snapshot();
  const document = { ...state.sourceDocuments[0]!, id: id(100), fileHash: "b".repeat(64) };
  const operation = changeOperationSchema.parse({ operationId, op: "import", entity: "sourceDocument", after: { projectId: id(1), title: document.title, type: document.type, filePath: document.filePath, fileHash: document.fileHash } });
  const preparedSourceImports = Object.create({ [operationId]: { document, chunks: [] } });
  const inputs: OperationSupply = { createdAt, creationOrigin: "manual", ids: { [operationId]: id(100) }, externalRefIds: {}, preparedSourceImports };
  expect(() => resolveOperation(state, operation, inputs)).toThrow("Application must supply prepared source document and chunks.");
  expect(resolveOperation(state, operation, { ...inputs, preparedSourceImports: { [operationId]: { document, chunks: [] } } }).state.sourceDocuments).toHaveLength(2);
});

it.each(["__proto__", "constructor", "toString"])("rejects inherited copy and Roadmap allocations for %s", (operationId) => {
  const state = snapshot();
  state.cards.push(cardSchema.parse({ id: id(3), storyMapId: id(2), level: "activity", key: "LSM-3", title: "Activity", parentId: null, releaseId: null, creationOrigin: "manual", provenance: "manual", position: 0, version: 1, createdAt, updatedAt: createdAt }));
  state.mapFingerprints = { [id(2)]: chunkId };
  const copy = changeOperationSchema.parse({ operationId, op: "create", entity: "storyMapCopy", entityId: id(100), after: { input: { sourceStoryMapId: id(2), targetName: "Copy" }, expected: { [id(2)]: chunkId }, preview: { source: { id: id(2), name: "Map" }, target: { id: id(100), name: "Copy" }, inventory: {} } } });
  const inputs: OperationSupply = { createdAt, creationOrigin: "manual", ids: { [operationId]: id(100) }, externalRefIds: {} };
  const ids = { [id(3)]: id(103) };
  expect(() => resolveOperation(state, copy, { ...inputs, copyIds: Object.create({ [operationId]: ids }) })).toThrow("Application must supply all copied identities.");
  expect(() => resolveOperation(state, copy, { ...inputs, copyIds: { [operationId]: Object.create(ids) } })).toThrow("Copied identity is absent");
  expect(resolveOperation(state, copy, { ...inputs, copyIds: { [operationId]: ids } }).state.cards.at(-1)!.id).toBe(id(103));
  const roadmap = changeOperationSchema.parse({ operationId, op: "create", entity: "roadmap", after: { projectId: id(1), name: "Roadmap" } });
  const seed = { columns: [id(101), id(102), id(103)], swimlane: id(104) };
  expect(() => resolveOperation(state, roadmap, { ...inputs, roadmapSeedIds: Object.create({ [operationId]: seed }) })).toThrow("Application must supply all Roadmap seed identities.");
  expect(() => resolveOperation(state, roadmap, { ...inputs, roadmapSeedIds: { [operationId]: {} } as unknown as NonNullable<OperationSupply["roadmapSeedIds"]> })).toThrow("Application must supply all Roadmap seed identities.");
});

it.each(["__proto__", "constructor", "toString"])("refuses inherited or malformed nested board IDs for %s", (operationId) => {
  const state = snapshot();
  state.mapFingerprints = { [id(2)]: chunkId };
  const operation = changeOperationSchema.parse({ operationId, op: "create", entity: "githubBoardImport", entityId: "board", after: {
    input: { projectId: id(1), storyMapId: id(2), storyMapName: "Map", boardUrl: "https://github.com/orgs/org/projects/1", issues: [{ repository: "org/repo", number: 1, title: "Activity", body: "", state: "open", url: "https://github.com/org/repo/issues/1", labels: [], assignee: null, milestone: null, issueType: "epic", parentRepository: null, parentNumber: null }] },
    expected: { [id(2)]: chunkId }, preview: { connectors: [{ repository: "org/repo", existingId: null, before: null, after: { readOnly: true } }], sync: { removals: [], overwrites: [] }, cleanup: [] }
  } });
  const inputs: OperationSupply = { createdAt, creationOrigin: "inference", ids: { [operationId]: id(100) }, externalRefIds: {} };
  const ids = { "parking:activity": id(101) };
  for (const boardIds of [Object.create({ [operationId]: ids }), { [operationId]: Object.create(ids) }, { [operationId]: { "parking:activity": 42 } }]) {
    expect(() => resolveOperation(state, operation, { ...inputs, boardIds })).toThrow("Prepared board identity parking:activity is absent");
  }
});
