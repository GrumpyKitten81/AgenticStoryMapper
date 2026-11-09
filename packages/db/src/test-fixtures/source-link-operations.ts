import type { ChangeOperation } from "@storymapper/contracts";

export function sourceLinkOperations(storyMapId: string, sourceChunkId: string): ChangeOperation[] {
  return [{
  operationId: "fixture-operation-2", op: "create",
  entity: "card",
  entityId: "proposed-activity-1",
  after: {
    storyMapId: storyMapId,
    level: "activity",
    title: "Activity"
  }
}, {
  operationId: "fixture-operation-3", op: "create",
  entity: "card",
  entityId: "proposed-step-1",
  after: {
    storyMapId: storyMapId,
    parentId: "proposed-activity-1",
    level: "step",
    title: "Step"
  }
}, {
  operationId: "fixture-operation-4", op: "create",
  entity: "card",
  entityId: "proposed-story-1",
  after: {
    storyMapId: storyMapId,
    parentId: "proposed-step-1",
    level: "story",
    title: "Story",
    description: "Applied story"
  }
}, {
  operationId: "fixture-operation-5", op: "link",
  entity: "sourceLink",
  entityId: "proposed-link-1",
  after: {
    kind: "chunk", cardId: "proposed-story-1",
    chunkId: sourceChunkId,
    confidence: 0.75
  }
}];
}
