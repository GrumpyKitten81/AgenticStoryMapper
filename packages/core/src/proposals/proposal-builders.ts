import { createChangeSet } from "@storymapper/core";
import type { ChangeOperation, ChangeSet } from "@storymapper/contracts";

interface MapProposalInput {
  id: string;
  createdAt: string;
  projectId: string;
  storyMapId: string;
  documentTitle: string;
  productPurpose?: string | undefined;
  chunks: Array<{ id: string; locator: string; heading?: string | undefined; text: string }>;
}

export function buildMapProposalChangeSet(input: MapProposalInput): ChangeSet {
  const operations = mapHierarchyOperations(input);
  operations.push(...mapChunkOperations(input));
  return createChangeSet({
    id: input.id,
    createdAt: input.createdAt,
    projectId: input.projectId,
    title: "Proposed map from source document",
    source: "mcp",
    operations
  });
}

function mapHierarchyOperations(input: MapProposalInput): ChangeOperation[] {
  return [{
    op: "create",
    entity: "card",
    operationId: "create-activity-1",
    entityId: "proposed-activity-1",
    after: {
      storyMapId: input.storyMapId,
      parentId: null,
      level: "activity",
      title: input.documentTitle,
      description: input.productPurpose ? `Activity proposed from imported source material for: ${input.productPurpose}` : "Activity proposed from imported source material."
    },
    reason: "Create a top-level activity from the source document."
  }, {
    op: "create",
    entity: "card",
    operationId: "create-step-1",
    entityId: "proposed-step-1",
    after: {
      storyMapId: input.storyMapId,
      parentId: "proposed-activity-1",
      level: "step",
      title: "Validate source requirements",
      description: "Step proposed from source chunks."
    },
    reason: "Group proposed stories below a source-derived journey step."
  }];
}

function mapChunkOperations(input: MapProposalInput): ChangeOperation[] {
  const operations: ChangeOperation[] = [];
  for (const [index, chunk] of input.chunks.slice(0, 6).entries()) {
    const proposedCardId = `proposed-story-${index + 1}`;
    operations.push({
      op: "create",
      entity: "card",
      operationId: `create-story-${index + 1}`,
      entityId: proposedCardId,
      after: {
        storyMapId: input.storyMapId,
        parentId: "proposed-step-1",
        level: "story",
        title: chunk.heading ?? chunk.text.slice(0, 80),
        description: chunk.text,
        position: index
      },
      reason: `Derived from source chunk ${chunk.locator}.`
    });
    operations.push({
      op: "link",
      entity: "sourceLink",
      operationId: `link-source-${index + 1}`,
      entityId: `proposed-source-link-${index + 1}`,
      after: {
        kind: "chunk",
        cardId: proposedCardId,
        chunkId: chunk.id,
        confidence: 0.75
      },
      reason: "Preserve traceability to the imported source chunk."
    });
  }
  return operations;
}

interface BacklogGroomingInput {
  id: string;
  createdAt: string;
  projectId: string;
  issues: Array<{ cardId: string; cardKey: string; cardTitle: string; type: string }>;
  versionsByCardId: Map<string, number>;
}

export function buildBacklogGroomingChangeSet(input: BacklogGroomingInput): ChangeSet {
  const operations = input.issues.slice(0, 12).flatMap((issue, index): ChangeOperation[] => {
    if (issue.type === "missing-description") {
      return [{
        op: "update",
        entity: "card",
        operationId: `groom-card-${index + 1}`,
        entityId: issue.cardId,
        baseVersion: input.versionsByCardId.get(issue.cardId)!,
        after: { description: `Clarify ${issue.cardTitle} with user value, trigger and expected outcome.` },
        reason: `${issue.cardKey} is missing a description.`
      }];
    }
    if (issue.type === "missing-estimate") {
      return [{
        op: "update",
        entity: "card",
        operationId: `groom-card-${index + 1}`,
        entityId: issue.cardId,
        baseVersion: input.versionsByCardId.get(issue.cardId)!,
        after: { estimate: 1 },
        reason: `${issue.cardKey} is missing an initial estimate.`
      }];
    }
    if (issue.type === "missing-source") {
      return [{
        op: "update",
        entity: "card",
        operationId: `groom-card-${index + 1}`,
        entityId: issue.cardId,
        baseVersion: input.versionsByCardId.get(issue.cardId)!,
        after: { color: "#fff7df" },
        reason: `${issue.cardKey} needs source validation before implementation.`
      }];
    }
    return [];
  });

  return createChangeSet({
    id: input.id,
    createdAt: input.createdAt,
    projectId: input.projectId,
    title: "Proposed backlog grooming",
    source: "mcp",
    operations
  });
}
