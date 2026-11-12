import { expect, it } from "vitest";
import { CARD_COLOR_VALUES, colorCategoryNamesSchema, createStoryMapRequestSchema, updateStoryMapRequestSchema, changeOperationSchema, mcpToolInputSchemas } from "@storymapper/contracts";

const storyMapId = "00000000-0000-4000-8000-000000000001";
it("validates sparse built-in category names consistently across map commands", () => {
  const names = { "#f5a623": " Risk ", "#e5484d": "Risk" };
  const expected = { "#f5a623": "Risk", "#e5484d": "Risk" };
  expect(CARD_COLOR_VALUES).toHaveLength(10);
  expect(createStoryMapRequestSchema.parse({ projectId: storyMapId, name: "Map", colorCategoryNames: names }).colorCategoryNames).toEqual(expected);
  expect(updateStoryMapRequestSchema.parse({ colorCategoryNames: names }).colorCategoryNames).toEqual(expected);
  expect(mcpToolInputSchemas.UpdateStoryMap.parse({ storyMapId, baseVersion: 1, patch: { colorCategoryNames: names } }).patch.colorCategoryNames).toEqual(expected);
  expect(changeOperationSchema.parse({ operationId: "names", entity: "storyMap", op: "update", entityId: storyMapId, baseVersion: 1, after: { colorCategoryNames: names } }).after).toEqual({ colorCategoryNames: expected });
  expect(updateStoryMapRequestSchema.parse({ colorCategoryNames: {} })).toEqual({ colorCategoryNames: {} });
  expect(updateStoryMapRequestSchema.parse({ name: "Map" })).not.toHaveProperty("colorCategoryNames");
});
it("rejects unknown slots, missing names and names beyond sixty characters", () => {
  for (const invalid of [{ "#000000": "Risk" }, { "#f5a623": " " }, { "#f5a623": "x".repeat(61) }, null, []]) {
    expect(colorCategoryNamesSchema.safeParse(invalid).success).toBe(false);
    expect(updateStoryMapRequestSchema.safeParse({ colorCategoryNames: invalid }).success).toBe(false);
    expect(mcpToolInputSchemas.UpdateStoryMap.safeParse({ storyMapId, baseVersion: 1, patch: { colorCategoryNames: invalid } }).success).toBe(false);
  }
  expect(colorCategoryNamesSchema.parse({ "#f5a623": "x".repeat(60) })["#f5a623"]).toHaveLength(60);
});
