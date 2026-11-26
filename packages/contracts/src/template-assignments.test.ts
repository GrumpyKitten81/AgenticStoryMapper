import { describe, expect, it } from "vitest";
import { changeOperationSchema, storyMapSchema, storyTemplateSchema, updateStoryMapRequestSchema, updateStoryTemplateRequestSchema } from "@storymapper/contracts";

const templateId = "00000000-0000-4000-8000-000000000001";
const map = {
  id: "00000000-0000-4000-8000-000000000002",
  version: 1,
  projectId: "00000000-0000-4000-8000-000000000003",
  name: "Map",
  createdAt: "2026-11-25T12:00:00.000Z",
  updatedAt: "2026-11-25T12:00:00.000Z"
};

describe("per-map template assignments", () => {
  it("stores one Story Template per Card type on the Story Map", () => {
    const assignments = [{ cardType: "story", storyTemplateId: templateId }, { cardType: "bug", storyTemplateId: templateId }];
    expect(storyMapSchema.parse({ ...map, templateAssignments: assignments }).templateAssignments).toEqual(assignments);
    expect(storyMapSchema.parse(map).templateAssignments).toBeUndefined();
    expect(storyMapSchema.safeParse({ ...map, templateAssignments: [{ cardType: "story", storyTemplateId: templateId }, { cardType: "story", storyTemplateId: templateId }] }).success).toBe(false);
    expect(storyMapSchema.safeParse({ ...map, templateAssignments: [{ cardType: "story", storyTemplateId: "not-a-uuid" }] }).success).toBe(false);
  });
  it("is writable through the map update request and the set:map operation", () => {
    const after = { templateAssignments: [{ cardType: "task", storyTemplateId: templateId }] };
    expect(updateStoryMapRequestSchema.parse(after)).toEqual(after);
    expect(changeOperationSchema.parse({ operationId: "assign", entity: "storyMap", op: "update", entityId: "map", after }).after).toEqual(after);
    expect(updateStoryMapRequestSchema.parse({ templateAssignments: [] })).toEqual({ templateAssignments: [] });
  });
  it("lets a Story Template require a language and clear it again", () => {
    const template = { id: templateId, projectId: map.projectId, storyMapId: null, name: "Template", defaultEstimate: null, position: 0 };
    expect(storyTemplateSchema.parse({ ...template, requiredLanguage: "en" }).requiredLanguage).toBe("en");
    expect(storyTemplateSchema.parse(template).requiredLanguage).toBeUndefined();
    expect(storyTemplateSchema.safeParse({ ...template, requiredLanguage: " " }).success).toBe(false);
    expect(updateStoryTemplateRequestSchema.parse({ requiredLanguage: null })).toEqual({ requiredLanguage: null });
  });
});
