import { agentAccessEnabled } from "@storymapper/core";
import type { ActorContext, StoryMapSnapshot } from "@storymapper/contracts";
import type { StoryMapperRepository } from "@storymapper/db";

export function visibleSnapshotSources(repository: Pick<StoryMapperRepository, "getSourceDocumentDetails" | "getSafetySettings">, actor: ActorContext, snapshot: StoryMapSnapshot): StoryMapSnapshot {
  if (actor.actorType !== "agent") return snapshot;
  const accessibleDocuments = new Set(snapshot.sourceChunks.flatMap((chunk) => [chunk.documentId]));
  for (const documentId of accessibleDocuments) {
    const document = repository.getSourceDocumentDetails(documentId)?.document;
    if (!document || !agentAccessEnabled(repository.getSafetySettings(document.projectId))) accessibleDocuments.delete(documentId);
  }
  const sourceChunks = snapshot.sourceChunks.filter((chunk) => accessibleDocuments.has(chunk.documentId));
  const chunkIds = new Set(sourceChunks.map((chunk) => chunk.id));
  return { ...snapshot, sourceChunks, sourceLinks: snapshot.sourceLinks.filter((link) => link.kind !== "chunk" || chunkIds.has(link.chunkId)) };
}
