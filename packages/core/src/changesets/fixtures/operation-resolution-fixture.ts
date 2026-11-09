import { cardSchema, changeOperationSchema, personaSchema, projectSchema, releaseSchema, storyMapSchema, type ChangeOperation, type OperationSnapshot, type OperationSupply } from "@storymapper/contracts";

export const id = (number: number): string => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
export const createdAt = "2026-10-11T12:00:00Z";
export const chunkId = "a".repeat(64);
export const card = (number: number, level: "activity" | "step" | "story" | "note", parentId: string | null, position = 0) => cardSchema.parse({ id: id(number), storyMapId: id(2), parentId, releaseId: null, key: `LSM-${number}`, level, title: `Card ${number}`, position, version: 1, creationOrigin: "manual", provenance: "manual", createdAt, updatedAt: createdAt });
export const operation = (value: object): ChangeOperation => changeOperationSchema.parse(value);
export const update = (operationId: string, cardId: string, title: string): ChangeOperation => operation({ operationId, op: "update", entity: "card", entityId: cardId, after: { title } });

export function snapshot(): OperationSnapshot {
  return {
    roadmaps: [], roadmapColumns: [], roadmapSwimlanes: [], roadmapCards: [], roadmapReferences: [], annotations: [], workflowStatuses: [], storyTemplates: [], attachments: [], cardPersonas: [], cardDependencies: [], cardAnnotations: [], remoteWorkItemLinks: [], projectId: id(1), projects: [projectSchema.parse({ id: id(1), name: "Project", localPath: "fixture.lsm", createdAt })],
    storyMaps: [storyMapSchema.parse({ id: id(2), projectId: id(1), name: "Map", version: 1, createdAt, updatedAt: createdAt })],
    cards: [card(3, "activity", null), card(4, "step", id(3)), card(5, "story", id(4))],
    releases: [releaseSchema.parse({ id: id(6), storyMapId: id(2), name: "MVP", position: 0, startDate: null, releaseDate: null, version: 1 })],
    personas: [personaSchema.parse({ id: id(7), projectId: id(1), storyMapId: null, name: "Reader", role: "User", version: 1 })],
    externalRefs: [], productContexts: [], sourceDocuments: [{ id: id(8), projectId: id(1), title: "Source", type: "txt", filePath: "documents/source.txt", fileHash: chunkId, importedAt: createdAt }],
    sourceChunks: [{ id: chunkId, documentId: id(8), locator: "L1", text: "Requirement" }], sourceLinks: [], githubLinks: [], connections: []
  };
}

export function supply(operations: ChangeOperation[]): OperationSupply {
  return { createdAt, creationOrigin: "inference", ids: Object.fromEntries(operations.map((entry, index) => [entry.operationId, id(100 + index)])),
    externalRefIds: Object.fromEntries(operations.map((entry, index) => [entry.operationId, id(200 + index)])) };
}

export function upsert(entity: "card" | "release" | "persona", operationId = "publish"): ChangeOperation {
  const after = entity === "card" ? { storyMapId: id(2), level: "story", parentId: id(4), title: "Published" } : entity === "release" ? { storyMapId: id(2), name: "Published" } : { projectId: id(1), name: "Published" };
  return operation({ operationId, op: "upsert", entity, selector: { kind: "externalRef", scopeId: entity === "persona" ? id(1) : id(2), system: "bmad", externalId: "published" }, after });
}

export const coreMembers = [
  { op: "create", entity: "storyMap", after: { projectId: id(1), name: "Next" } },
  { op: "update", entity: "storyMap", entityId: id(2), after: { name: "Changed" } },
  { op: "create", entity: "card", after: { storyMapId: id(2), level: "story", parentId: id(4), title: "New" } },
  { op: "update", entity: "card", entityId: id(5), after: { title: "Changed" } },
  { op: "move", entity: "card", entityId: id(5), after: { parentId: null, position: 0 } },
  { op: "create", entity: "release", after: { storyMapId: id(2), name: "Next" } },
  { op: "update", entity: "release", entityId: id(6), after: { goal: "Changed" } },
  { op: "create", entity: "persona", after: { projectId: id(1), name: "Next" } },
  { op: "update", entity: "persona", entityId: id(7), after: { name: "Changed" } },
  { op: "link", entity: "sourceLink", entityId: "source", after: { kind: "chunk", cardId: id(5), chunkId } },
  { op: "unlink", entity: "sourceLink", entityId: "source", after: { kind: "note", cardId: id(5), id: id(9) } }
];

