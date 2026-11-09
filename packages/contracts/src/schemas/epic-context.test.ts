import { expect, it } from "vitest";
import { epicContextSchema, createStoryMapRequestSchema, updateStoryMapRequestSchema, changeOperationSchema, mcpToolInputSchemas } from "@storymapper/contracts";

const projectId = "00000000-0000-4000-8000-000000000001";
it("shares optional nullable Epic context validation across map commands, operations and MCP", () => {
  const context = { title: " Outcome ", goal: " Goal ", githubIssueUrl: "https://github.com/owner/repo/issues/12" };
  expect(epicContextSchema.parse(context)).toEqual({ ...context, title: "Outcome", goal: "Goal" });
  expect(createStoryMapRequestSchema.parse({ projectId, name: "Map", epicContext: context }).epicContext?.title).toBe("Outcome");
  expect(epicContextSchema.parse({ ...context, githubIssueUrl: "https://github.com/Owner/Repo/issues/12" }).githubIssueUrl).toBe(context.githubIssueUrl);
  expect(updateStoryMapRequestSchema.parse({ epicContext: null })).toEqual({ epicContext: null });
  expect(changeOperationSchema.safeParse({ operationId: "context", entity: "storyMap", op: "create", after: { projectId, name: "Map", epicContext: context } }).success).toBe(true);
  expect(mcpToolInputSchemas.UpdateStoryMap.safeParse({ storyMapId: projectId, baseVersion: 1, patch: { epicContext: context } }).success).toBe(true);
  for (const invalid of [{ ...context, title: " " }, { ...context, goal: "\n" }, { ...context, githubIssueUrl: "https://github.com/owner/repo/milestone/12" }, { ...context, githubIssueUrl: "https://github.com/owner/repo/issues/12?x=1" }]) expect(epicContextSchema.safeParse(invalid).success).toBe(false);
});
