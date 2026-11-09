import { expect, it } from "vitest";
import { createAiProposalRequestSchema, proposeReleaseSliceRequestSchema, releaseNotesRequestSchema } from "@storymapper/contracts";

const id = "00000000-0000-4000-8000-000000000001";
it("requires strict unambiguous explicit Release targets for both proposal surfaces", () => {
  for (const releaseTarget of [{ kind: "new" }, { kind: "existing", releaseId: id }]) {
    expect(proposeReleaseSliceRequestSchema.parse({ storyMapId: id, releaseTarget, rationale: "  Why  " }).rationale).toBe("Why");
    expect(createAiProposalRequestSchema.safeParse({ projectId: id, storyMapId: id, templateId: "release-slice", releaseTarget }).success).toBe(true);
  }
  for (const releaseTarget of [undefined, {}, { kind: "existing" }, { kind: "new", releaseId: id }]) {
    expect(proposeReleaseSliceRequestSchema.safeParse({ storyMapId: id, releaseTarget }).success).toBe(false);
    expect(createAiProposalRequestSchema.safeParse({ projectId: id, storyMapId: id, templateId: "release-slice", releaseTarget }).success).toBe(false);
  }
  expect(createAiProposalRequestSchema.safeParse({ projectId: id, storyMapId: id, templateId: "release-slice", releaseTarget: { kind: "new" }, strategy: "theme" }).success).toBe(false);
  expect(createAiProposalRequestSchema.safeParse({ projectId: id, storyMapId: id, templateId: "release-slice", releaseTarget: { kind: "new" }, cardIds: [id] }).success).toBe(false);
  expect(createAiProposalRequestSchema.safeParse({ projectId: id, storyMapId: id, templateId: "story-writing", releaseId: id }).success).toBe(true);
  expect(releaseNotesRequestSchema.safeParse({ storyMapId: id }).success).toBe(false);
  expect(releaseNotesRequestSchema.safeParse({ storyMapId: id, releaseId: id, apply: true }).success).toBe(false);
});
