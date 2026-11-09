import type { ChangeOperation, StoryMapSnapshot } from "@storymapper/contracts";
import type { RecordedFile, SourceRecording } from "@storymapper/server/fixtures/bmad-round-trip/composer";

export function requestedEvidenceIds(snapshot: StoryMapSnapshot, documents: SourceRecording[], files: RecordedFile[], operations: ChangeOperation[]): Set<string> {
  const ids = new Set<string>();
  for (const operation of operations) {
    if (operation.op !== "link" || operation.entity !== "sourceLink" || operation.after.kind !== "chunk" || !("chunk" in operation.after) || operation.after.chunk.kind !== "import") continue;
    const file = files[Number(operation.after.chunk.operationId.split("-")[1])];
    if (!file) throw new Error(`Missing requested file for ${operation.operationId}.`);
    const document = documents.find((doc) => doc.document.projectId === snapshot.storyMap.projectId && doc.document.type === file.type && doc.document.fileHash === file.hash);
    if (!document) throw new Error(`Missing applied document for ${operation.operationId}.`);
    const locator = operation.after.chunk.locator;
    const chunk = document.chunks.find((chunk) => chunk.locator === locator);
    if (!chunk) throw new Error(`Missing applied chunk for ${operation.operationId}.`);
    const externalId = operation.after.cardId.replace(/^local-/, "");
    const cardId = snapshot.externalRefs.find((ref) => ref.entityType === "card" && ref.system === "bmad" && ref.scopeId === snapshot.storyMap.id && ref.externalId === externalId)?.entityId;
    if (!cardId || !snapshot.cards.some((card) => card.id === cardId)) throw new Error(`Missing applied Card for ${operation.operationId}.`);
    const link = snapshot.sourceLinks.find((link) => link.kind === "chunk" && link.cardId === cardId && link.chunkId === chunk.id);
    if (!link) throw new Error(`Missing applied link for ${operation.operationId}.`);
    ids.add(link.id);
  }
  return ids;
}
