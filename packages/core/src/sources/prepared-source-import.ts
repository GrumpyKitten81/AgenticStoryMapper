import type { SourceChunk, SourceDocument } from "@storymapper/contracts";

interface SourceImportConstruction {
  metadata: Omit<SourceDocument, "id" | "importedAt">;
  documentId: string;
  importedAt: string;
  parsedChunks: readonly Pick<SourceChunk, "locator" | "text" | "heading">[];
  hash(value: string): string;
}

export function buildPreparedSourceImport(input: SourceImportConstruction): { document: SourceDocument; chunks: SourceChunk[] } {
  const document: SourceDocument = { ...input.metadata, id: input.documentId, importedAt: input.importedAt };
  const chunks = input.parsedChunks.map((chunk) => ({
    id: input.hash(`${document.id}:${chunk.locator}`), documentId: document.id, text: chunk.text, locator: chunk.locator,
    ...(typeof chunk.heading === "string" ? { heading: chunk.heading } : {})
  }));
  return { document, chunks };
}
