import { randomUUID } from "node:crypto";
import { DomainError, type ChangeSet, type CreateAiProposalRequest } from "@storymapper/contracts";
import { createChangeSet, proposalOperations, selectedStoryCards } from "@storymapper/core";
import type { StoryMapperRepository } from "@storymapper/db";

export function buildAiProposalChangeSet(repository: StoryMapperRepository<"root" | "transaction">, input: CreateAiProposalRequest): ChangeSet {
  const snapshot = repository.getStoryMapSnapshot(input.storyMapId);
  if (!snapshot || snapshot.storyMap.projectId !== input.projectId) {
    throw new DomainError("not_found", "Story map not found.");
  }
  if (input.templateId === "release-slice" && input.releaseTarget.kind === "existing") {
    const releaseId = input.releaseTarget.releaseId;
    if (!snapshot.releases.some((release) => release.id === releaseId)) throw new DomainError("not_found", "Release not found in the supplied Story Map.");
  }
  const selectedCards = selectedStoryCards(snapshot, "cardIds" in input ? input.cardIds : undefined);
  const context = repository.getProductContext(input.projectId, input.storyMapId);
  const sourceDocument = input.sourceDocumentId ? repository.getSourceDocumentDetails(input.sourceDocumentId) : undefined;
  if (input.sourceDocumentId && (!sourceDocument || sourceDocument.document.projectId !== input.projectId)) throw new DomainError("not_found", "Source document not found.");
  const sourceChunks = sourceDocument?.chunks ?? snapshot.sourceChunks;
  const operationContext = {
    templateId: input.templateId,
    ...(repository.getOperationSnapshot(input.projectId).productContexts.some((row) => row.id === context.id) ? { productContextId: context.id } : {}),
    sourceChunkIds: sourceChunks.slice(0, 8).map((chunk) => chunk.id),
    cardIds: selectedCards.map((card) => card.id)
  };
  const proposal = { input, snapshot, selectedCards, context, sourceChunks, operationContext };
  const operations = proposalOperations(proposal);
  if (operations.length === 0) throw new DomainError("validation", "No proposal operations could be generated.");
  return createChangeSet({ id: randomUUID(), projectId: input.projectId, title: `AI proposal: ${input.templateId}`, source: "ai", operations, createdAt: new Date().toISOString() });
}
