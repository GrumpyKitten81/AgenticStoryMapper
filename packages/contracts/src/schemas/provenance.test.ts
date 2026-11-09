import { expect, it } from "vitest";
import { createCardSourceLinkRequestSchema, deleteCardSourceLinkRequestSchema } from "@storymapper/contracts/api/http";
import { mcpToolInputSchemas } from "@storymapper/contracts/mcp/tool-inputs";
import { cardSchema, cardSourceLinkSchema } from "@storymapper/contracts/schemas/domain";

const id = "00000000-0000-4000-8000-000000000001";
const chunkId = "a".repeat(64);
const createdAt = "2026-10-11T00:00:00.000Z";
const card = { id, storyMapId: id, parentId: null, releaseId: null, version: 1, key: "LSM-1", level: "story", title: "Origin", position: 0, createdAt, updatedAt: createdAt };

it("requires recorded creation origin and effective provenance on every Card", () => {
  expect(cardSchema.safeParse(card).success).toBe(false);
  for (const creationOrigin of ["manual", "inference", "unknown"]) {
    for (const provenance of [creationOrigin, "linked"]) expect(cardSchema.parse({ ...card, creationOrigin, provenance })).toMatchObject({ creationOrigin, provenance });
  }
  expect(cardSchema.safeParse({ ...card, creationOrigin: "human", provenance: "manual" }).success).toBe(false);
});

it("validates mixed chunk, canonical GitHub Issue and note evidence", () => {
  const base = { id, cardId: id };
  const evidence = [
    { ...base, kind: "chunk", chunkId, confidence: null, createdAt },
    { ...base, kind: "github", externalRefId: id, repoFullName: "fixture/repository", issueNumber: 1, url: "https://github.com/fixture/repository/issues/1" },
    { ...base, kind: "note", note: "/unopened/source.txt", createdAt }
  ];
  expect(evidence.map((link) => cardSourceLinkSchema.parse(link).kind)).toEqual(["chunk", "github", "note"]);
  expect(cardSourceLinkSchema.safeParse({ ...evidence[1], issueNumber: null }).success).toBe(false);
  expect(cardSourceLinkSchema.safeParse({ ...evidence[2], note: "   " }).success).toBe(false);
});

it("requires typed strict evidence requests and typed deletion identities in HTTP and MCP", () => {
  const inputs = [{ kind: "chunk", chunkId, confidence: 0.5 }, { kind: "github", externalRefId: id }, { kind: "note", note: "  /unopened/source.txt  " }];
  for (const input of inputs) {
    expect(createCardSourceLinkRequestSchema.parse(input).kind).toBe(input.kind);
    expect(mcpToolInputSchemas.CreateCardSourceLink.parse({ cardId: id, ...input }).kind).toBe(input.kind);
    expect(deleteCardSourceLinkRequestSchema.parse({ kind: input.kind, id })).toEqual({ kind: input.kind, id });
    expect(mcpToolInputSchemas.DeleteCardSourceLink.parse({ cardId: id, kind: input.kind, id })).toEqual({ cardId: id, kind: input.kind, id });
  }
  expect(createCardSourceLinkRequestSchema.parse(inputs[2])).toEqual({ kind: "note", note: "/unopened/source.txt" });
  for (const input of [{ chunkId }, { kind: "chunk", chunkId: id }, { kind: "chunk", chunkId, confidence: 2 }, { kind: "github", externalRefId: "missing" }, { kind: "github", externalRefId: id, issueNumber: 2 }, { kind: "note", note: "\u00a0\ufeff" }, { kind: "note", note: "Text", filePath: "/source.txt" }]) {
    expect(createCardSourceLinkRequestSchema.safeParse(input).success).toBe(false);
    expect(mcpToolInputSchemas.CreateCardSourceLink.safeParse({ cardId: id, ...input }).success).toBe(false);
  }
  for (const input of [{ chunkId }, { kind: "chunk", id: chunkId }, { kind: "other", id }, { kind: "note", id, note: "Text" }]) expect(deleteCardSourceLinkRequestSchema.safeParse(input).success).toBe(false);
});
