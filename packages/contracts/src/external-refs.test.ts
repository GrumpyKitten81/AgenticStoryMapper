import { expect, it } from "vitest";
import { mcpToolInputSchemas, setExternalRefRequestSchema, setExternalRefResponseSchema, storyMapSnapshotSchema } from "@storymapper/contracts";

const id = "00000000-0000-4000-8000-000000000001";

it("trims external ids, validates systems, and rejects caller-supplied scopes", () => {
  expect(setExternalRefRequestSchema.parse({ system: "agent-v1", externalId: "  Card-9  " })).toEqual({ system: "agent-v1", externalId: "Card-9" });
  expect(setExternalRefRequestSchema.safeParse({ system: "Bad_System", externalId: "valid" }).success).toBe(false);
  expect(setExternalRefRequestSchema.safeParse({ system: "agent", externalId: "   " }).success).toBe(false);
  expect(mcpToolInputSchemas.SetExternalRef.safeParse({ entityType: "card", entityId: id, system: "agent", externalId: "x", scopeId: id }).success).toBe(false);
});

it("parses created and unchanged responses and defaults snapshot references", () => {
  const ref = { id, entityType: "card", entityId: id, system: "agent", externalId: "Card-9", scopeId: id, syncedVersion: 1, createdAt: "2026-10-11T00:00:00.000Z" };
  expect(setExternalRefResponseSchema.parse({ ref, status: "created" }).status).toBe("created");
  expect(setExternalRefResponseSchema.parse({ ref, status: "unchanged" }).status).toBe("unchanged");
  expect(storyMapSnapshotSchema.parse({
    storyMap: { id, version: 1, projectId: id, name: "Map", createdAt: ref.createdAt, updatedAt: ref.createdAt },
    cards: [], releases: [], cardDependencies: []
  }).externalRefs).toEqual([]);
});
