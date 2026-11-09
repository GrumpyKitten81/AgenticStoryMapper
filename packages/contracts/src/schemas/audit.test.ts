import { expect, it } from "vitest";
import { activityCursorSchema, activityQuerySchema, activityResponseSchema, toolCallMetadataSchema } from "@storymapper/contracts/schemas/audit";

const id = "00000000-0000-4000-8000-000000000001";
it("bounds shared audit queries and rejects malformed filters and cursor coordinates", () => {
  expect(activityQuerySchema.parse({ projectId: id })).toEqual({ projectId: id, limit: 20 });
  for (const view of ["changes", "all"]) expect(activityQuerySchema.parse({ view }).view).toBe(view);
  expect(activityQuerySchema.safeParse({ view: "reads" }).success).toBe(false);
  for (const toolName of ["prompts/list", "prompts/get"]) expect(activityQuerySchema.parse({ toolName }).toolName).toBe(toolName);
  const cursor = JSON.stringify({ id, createdAt: "2026-10-08T12:00:00.000Z" });
  expect(activityQuerySchema.parse({ actorType: "agent", toolName: "ListProjects", limit: "100", cursor }).cursor).toBe(cursor);
  for (const input of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { actorType: "any" }, { toolName: "private/path" }, { cursor: "{" }, { cursor: JSON.stringify({ id, createdAt: "invalid" }) }, { before: {} }]) expect(activityQuerySchema.safeParse(input).success).toBe(false);
  expect(activityCursorSchema.safeParse({ id, createdAt: "2026-10-08T12:00:00.000Z", extra: true }).success).toBe(false);
});

it("requires complete safe call metadata and rejects payload fields", () => {
  const metadata = { toolName: "ListProjects", inputHash: "a".repeat(64), outputHash: "b".repeat(64), outcome: "rejected", rejectionReason: "validation", affectedEntityIds: [] };
  expect(toolCallMetadataSchema.parse(metadata)).toEqual(metadata);
  for (const input of [{ ...metadata, outputHash: undefined }, { ...metadata, outcome: "denied" }, { ...metadata, input: { token: "planted-secret" } }, { ...metadata, rejectionReason: "private error" }]) expect(toolCallMetadataSchema.safeParse(input).success).toBe(false);
  expect(activityResponseSchema.safeParse({ activityEvents: [], nextCursor: null }).success).toBe(true);
});
