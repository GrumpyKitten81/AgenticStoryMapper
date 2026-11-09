import { describe, expect, it } from "vitest";
import { changeOperationSchema, updateStoryMapRequestSchema } from "@storymapper/contracts";

describe("Card Key prefix patches", () => {
  it("trims a nonblank prefix at HTTP and operation boundaries", () => {
    expect(changeOperationSchema.parse({ operationId: "rename", entity: "storyMap", op: "update", entityId: "map", after: { name: "Renamed" } }).after).toEqual({ name: "Renamed" });
    expect(updateStoryMapRequestSchema.parse({ cardKeyPrefix: " NEW " })).toEqual({ cardKeyPrefix: "NEW" });
    expect(changeOperationSchema.parse({ operationId: "prefix", entity: "storyMap", op: "update", entityId: "map", after: { cardKeyPrefix: " NEXT " } }).after).toEqual({ cardKeyPrefix: "NEXT" });
  });
  it("rejects blank prefixes and keeps map creation scope unchanged", () => {
    for (const prefix of ["", "  "]) {
      expect(updateStoryMapRequestSchema.safeParse({ cardKeyPrefix: prefix }).success).toBe(false);
      expect(changeOperationSchema.safeParse({ operationId: "prefix", entity: "storyMap", op: "update", entityId: "map", after: { cardKeyPrefix: prefix } }).success).toBe(false);
    }
    expect(changeOperationSchema.safeParse({ operationId: "prefix", entity: "storyMap", op: "create", after: { projectId: "00000000-0000-4000-8000-000000000001", name: "Map", cardKeyPrefix: "NEW" } }).success).toBe(false);
  });
});
