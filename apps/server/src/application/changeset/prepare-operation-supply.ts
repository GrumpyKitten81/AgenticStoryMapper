import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DomainError, type ChangeOperation, type ConflictEntry, type OperationSnapshot, type OperationSupply } from "@storymapper/contracts";
import { splitMarkdownIntoChunks, splitTextIntoChunks } from "@storymapper/importers";
import { ownValue, ownString } from "@storymapper/core/changesets/supply-values";
import { buildPreparedSourceImport } from "@storymapper/core/sources/prepared-source-import";

export function prepareSourceOperations(operations: readonly ChangeOperation[], snapshot: OperationSnapshot, supply: OperationSupply, selectedOperationIds: readonly string[]): { supply: OperationSupply; conflicts: ConflictEntry[] } {
  const imports: Record<string, NonNullable<OperationSupply["preparedSourceImports"]>[string]> = Object.assign(Object.create(null), supply.preparedSourceImports);
  const conflicts: ConflictEntry[] = [];
  for (const [index, operation] of operations.entries()) {
    if (!selectedOperationIds.includes(operation.operationId) || operation.entity !== "sourceDocument") continue;
    const after = operation.after;
    const existing = snapshot.sourceDocuments.find((document) => document.projectId === after.projectId && document.type === after.type && document.fileHash === after.fileHash);
    if (after.inlineContent === undefined && (!after.filePath || after.filePath.startsWith("inline://"))) {
      if (ownValue(imports, operation.operationId)) continue;
      if (existing) { imports[operation.operationId] = { document: { ...existing, title: after.title, ...(after.filePath !== undefined ? { filePath: after.filePath } : {}) }, chunks: snapshot.sourceChunks.filter((chunk) => chunk.documentId === existing.id) }; continue; }
      throw new DomainError("validation", "Source import requires its prepared document and chunks or a reviewed local source path.");
    }
    let content: string;
    try { content = after.inlineContent ?? readFileSync(after.filePath!, "utf8"); }
    catch (error) {
      if (error instanceof Error && "code" in error && ["ENOENT", "ENOTDIR", "EISDIR", "EACCES", "EPERM"].includes(String(error.code))) { conflicts.push(sourceConflict(operation, index, supply, "Reviewed source content is no longer available; create a new proposal.")); continue; }
      throw error;
    }
    if (hash(content) !== after.fileHash) { conflicts.push(sourceConflict(operation, index, supply, "Reviewed source content changed before applying.")); continue; }
    if (existing) { imports[operation.operationId] = { document: { ...existing, title: after.title, ...(after.filePath !== undefined ? { filePath: after.filePath } : {}) }, chunks: snapshot.sourceChunks.filter((chunk) => chunk.documentId === existing.id) }; continue; }
    const { inlineContent: _inlineContent, ...fields } = after;
    imports[operation.operationId] = buildPreparedSourceImport({
      metadata: { ...fields, filePath: after.filePath ?? "inline://reviewed-source" },
      documentId: sourceId(supply, operation.operationId), importedAt: supply.createdAt, hash,
      parsedChunks: after.type === "markdown" ? splitMarkdownIntoChunks(content) : splitTextIntoChunks(content)
    });
  }
  return { supply: { ...supply, preparedSourceImports: imports }, conflicts };
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function sourceConflict(operation: Extract<ChangeOperation, { entity: "sourceDocument" }>, index: number, supply: OperationSupply, message: string): ConflictEntry {
  return { entity: "sourceDocument", id: sourceId(supply, operation.operationId), operationId: operation.operationId, index, reason: "source", current: null, message };
}

function sourceId(supply: OperationSupply, operationId: string): string {
  const id = ownString(supply.ids, operationId);
  if (!id) throw new DomainError("validation", "Application must supply an allocated source id.", { operationId });
  return id;
}
