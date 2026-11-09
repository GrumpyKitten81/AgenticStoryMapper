import { expect, it, vi } from "vitest";
import { buildPreparedSourceImport } from "@storymapper/core/sources/prepared-source-import";

it("constructs independent document/chunk values from supplied identity, time, parsed chunks and hash", () => {
  const metadata = { projectId: "00000000-0000-4000-8000-000000000001", title: "Source", type: "markdown" as const,
    filePath: "inline://caller-path", fileHash: "a".repeat(64) };
  const parsedChunks = [{ locator: "Parent#1", heading: "Parent", text: "First requirement" }, { locator: "paragraph#2", text: "Second requirement" }];
  const documentId = "00000000-0000-4000-8000-000000000002";
  const importedAt = "2026-10-17T12:00:00.000Z";
  const hash = vi.fn().mockReturnValueOnce("b".repeat(64)).mockReturnValueOnce("c".repeat(64));
  const original = structuredClone({ metadata, parsedChunks });
  const result = buildPreparedSourceImport({ metadata, documentId, importedAt, parsedChunks, hash });
  expect(result.document).toEqual({ ...metadata, id: documentId, importedAt });
  expect(result.chunks).toEqual([{ id: "b".repeat(64), documentId, locator: "Parent#1", heading: "Parent", text: "First requirement" },
    { id: "c".repeat(64), documentId, locator: "paragraph#2", text: "Second requirement" }]);
  expect(hash.mock.calls).toEqual([[`${documentId}:Parent#1`], [`${documentId}:paragraph#2`]]);
  expect({ metadata, parsedChunks }).toEqual(original);
  result.document.title = "Returned document";
  result.chunks[0]!.text = "Returned chunk";
  expect({ metadata, parsedChunks }).toEqual(original);
  metadata.filePath = "inline://changed-input";
  parsedChunks[1]!.text = "Input chunk";
  expect(result.document.filePath).toBe("inline://caller-path");
  expect(result.chunks[1]!.text).toBe("Second requirement");
});
