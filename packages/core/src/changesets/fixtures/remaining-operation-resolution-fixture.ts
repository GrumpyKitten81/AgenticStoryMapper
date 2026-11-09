import { annotationSchema, cardSchema, changeOperationSchema, githubLinkSchema, personaSchema, productContextSchema, projectSchema, releaseSchema, roadmapSchema, storyMapSchema, storyTemplateSchema, workflowStatusSchema, type ChangeOperation, type OperationSnapshot, type OperationSupply } from "@storymapper/contracts";

export const id = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
export const createdAt = "2026-10-12T12:00:00.000Z";
export const chunkId = "a".repeat(64);
export const op = (value: object): ChangeOperation => changeOperationSchema.parse({ operationId: "test", ...value });

export function snapshot(): OperationSnapshot {
  return {
    projectId: id(1), projects: [projectSchema.parse({ id: id(1), name: "Project", localPath: "fixture.lsm", createdAt })],
    storyMaps: [storyMapSchema.parse({ id: id(2), projectId: id(1), name: "Map", version: 1, createdAt, updatedAt: createdAt })],
    cards: [cardSchema.parse({ id: id(3), storyMapId: id(2), level: "activity", version: 1, position: 0, key: "LSM-1", title: "Activity", parentId: null, releaseId: id(4), creationOrigin: "manual", provenance: "linked", createdAt, updatedAt: createdAt }), cardSchema.parse({ id: id(30), storyMapId: id(2), level: "story", version: 1, position: 0, key: "LSM-2", title: "Child", parentId: null, releaseId: null, creationOrigin: "manual", provenance: "manual", createdAt, updatedAt: createdAt })],
    releases: [releaseSchema.parse({ id: id(4), storyMapId: id(2), name: "MVP", version: 1, position: 0, startDate: null, releaseDate: null })],
    personas: [personaSchema.parse({ id: id(5), projectId: id(1), storyMapId: null, name: "Reader", version: 1, role: "User" })],
    roadmaps: [roadmapSchema.parse({ id: id(6), projectId: id(1), storyMapId: id(2), name: "Roadmap", version: 1, createdAt, updatedAt: createdAt })],
    roadmapColumns: [{ id: id(7), roadmapId: id(6), name: "Now", position: 0 }], roadmapSwimlanes: [{ id: id(8), roadmapId: id(6), name: "Default", position: 0 }],
    roadmapCards: [{ id: id(9), roadmapId: id(6), columnId: id(7), swimlaneId: id(8), title: "Goal", details: "", labels: [], reach: null, impact: null, confidence: null, effort: null, position: 0 }], roadmapReferences: [],
    annotations: [annotationSchema.parse({ id: id(10), projectId: id(1), storyMapId: null, name: "Risk", position: 0 })],
    workflowStatuses: [workflowStatusSchema.parse({ id: id(11), projectId: id(1), storyMapId: null, name: "unused", group: "todo", position: 0 })],
    storyTemplates: [storyTemplateSchema.parse({ id: id(12), projectId: id(1), storyMapId: null, name: "Story", level: "story", defaultEstimate: null, position: 0 })],
    productContexts: [productContextSchema.parse({ id: id(13), projectId: id(1), storyMapId: id(2), productType: "service", purpose: "Existing purpose", keyFeatures: ["Retained feature"], targetUsers: "Readers", platform: "Desktop", pricing: "Free", notes: "Reviewed", glossary: "Planning terms", nonGoals: "Remote hosting", complianceConstraints: "Local only", updatedAt: createdAt })],
    attachments: [{ id: id(14), cardId: id(3), label: "File", filePath: "attachments/file.txt", createdAt }],
    cardPersonas: [{ id: id(15), cardId: id(3), personaId: id(5), createdAt }], cardDependencies: [], cardAnnotations: [{ id: id(16), cardId: id(3), annotationId: id(10), createdAt }],
    externalRefs: [{ id: id(17), entityType: "card", entityId: id(3), scopeId: id(2), system: "bmad", externalId: "card", syncedVersion: 1, createdAt }, { id: id(19), entityType: "card", entityId: id(3), scopeId: id(2), system: "github", externalId: "https://github.com/org/repo/issues/1", syncedVersion: 1, createdAt }],
    sourceDocuments: [{ id: id(18), projectId: id(1), title: "Source", type: "txt", filePath: "documents/source.txt", fileHash: chunkId, importedAt: createdAt }],
    sourceChunks: [{ id: chunkId, documentId: id(18), locator: "L1", text: "Requirement" }],
    sourceLinks: [{ kind: "github", id: id(20), cardId: id(30), externalRefId: id(19), repoFullName: "org/repo", issueNumber: 1, url: "https://github.com/org/repo/issues/1" }],
    githubLinks: [githubLinkSchema.parse({ id: id(19), syncState: "unsynced", cardId: id(3), repo: "org/repo", issueNumber: 1, url: "https://github.com/org/repo/issues/1" })], connections: [], remoteWorkItemLinks: []
  };
}

export function supply(): OperationSupply {
  return { createdAt: "2026-10-12T13:00:00.000Z", creationOrigin: "inference", ids: { test: id(100) }, externalRefIds: {}, roadmapSeedIds: { test: { columns: [id(101), id(102), id(103)], swimlane: id(104) } } };
}

export const members = [
  ["create", "roadmap", undefined, { projectId: id(1), name: "New" }, "roadmap"], ["update", "roadmap", 6, { name: "Changed" }, "roadmap"],
  ["create", "roadmapColumn", undefined, { roadmapId: id(6), name: "Later" }, "roadmapColumn"], ["create", "roadmapSwimlane", undefined, { roadmapId: id(6), name: "Team" }, "roadmapSwimlane"],
  ["create", "roadmapCard", undefined, { roadmapId: id(6), columnId: id(7), title: "Next" }, "roadmapCard"], ["create", "roadmapReference", undefined, { roadmapCardId: id(9), targetType: "card", targetId: id(3) }, "roadmapReference"],
  ["create", "annotation", undefined, { projectId: id(1), name: "New" }, "annotation"], ["update", "annotation", 10, { name: "Changed" }, "annotation"], ["delete", "annotation", 10, { definitionBefore: snapshot().annotations[0]!, affectedCards: [{ id: id(3), baseVersion: 1 }], confirmUnlink: true }, "cardAnnotation"],
  ["create", "workflowStatus", undefined, { projectId: id(1), name: "New", group: "todo" }, "workflowStatus"], ["update", "workflowStatus", 11, { name: "Changed", definitionBefore: snapshot().workflowStatuses[0]!, affectedCards: [] }, "workflowStatus"], ["delete", "workflowStatus", 11, { definitionBefore: snapshot().workflowStatuses[0]!, affectedCards: [] }, "workflowStatus"],
  ["create", "storyTemplate", undefined, { projectId: id(1), name: "New" }, "storyTemplate"], ["update", "storyTemplate", 12, { name: "Changed" }, "storyTemplate"], ["delete", "storyTemplate", 12, {}, "storyTemplate"],
  ["set", "productContext", 13, { projectId: id(1), storyMapId: id(2), purpose: "Changed" }, "productContext"],
  ["create", "attachment", undefined, { cardId: id(3), label: "New", filePath: "attachments/new.txt" }, "attachment"], ["delete", "attachment", 14, {}, "attachment"],
  ["park", "card", 3, { childStrategy: "unassign" }, "card"], ["unpark", "card", 3, {}, "card"], ["archive", "card", 3, {}, "card"], ["unarchive", "card", 3, { status: "todo" }, "card"],
  ["delete", "card", 3, { strategy: "unassign" }, "card"], ["delete", "persona", 5, { definitionBefore: snapshot().personas[0]!, affectedCards: [{ id: id(3), baseVersion: 1 }], confirmUnlink: true }, "cardPersona"], ["delete", "release", 4, {}, "release"], ["delete", "storyMap", 2, {}, "storyMap"],
  ["set", "cardPersona", 15, { cardId: id(30), personaId: id(5) }, "cardPersona"], ["unset", "cardPersona", 15, { cardId: id(3), personaId: id(5) }, "cardPersona"],
  ["set", "cardAnnotation", 16, { cardId: id(30), annotationId: id(10) }, "cardAnnotation"], ["unset", "cardAnnotation", 16, { cardId: id(3), annotationId: id(10) }, "cardAnnotation"],
  ["create", "githubExternalRef", undefined, { entityType: "card", entityId: id(30), scopeId: id(2), externalId: "https://github.com/org/repo/issues/2" }, "externalRef"], ["update", "githubExternalRef", 19, { entityType: "card", entityId: id(3), scopeId: id(2), externalId: "https://github.com/org/repo/issues/2" }, "externalRef"], ["delete", "githubExternalRef", 19, {}, "externalRef"],
  ["set", "externalRef", 17, { entityType: "card", entityId: id(30), system: "bmad", externalId: "other", scopeId: id(2) }, "externalRef"], ["delete", "externalRef", 17, {}, "externalRef"],
  ["bulk", "card", 3, { storyMapId: id(2), cards: [{ id: id(3), baseVersion: 1 }, { id: id(30), baseVersion: 1 }], patch: { status: "active" } }, "card"]
] as const;

