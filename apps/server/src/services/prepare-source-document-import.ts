import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { splitMarkdownIntoChunks, splitTextIntoChunks } from "@storymapper/importers";
import type { ImportSourceDocumentRequest, PreparedSourceDocumentImport } from "@storymapper/contracts";

export function prepareSourceDocumentImport(input: ImportSourceDocumentRequest): PreparedSourceDocumentImport {
  const content = input.content ?? readFileSync(input.filePath ?? "", "utf8");
  return { ...input, content, parsedChunks: input.type === "markdown" ? splitMarkdownIntoChunks(content) : splitTextIntoChunks(content), fileHash: createHash("sha256").update(content).digest("hex") };
}
