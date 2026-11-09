import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bulkUpdateCardsCommandSchema,
  deleteCardCommandSchema,
  deleteStoryMapParamsSchema,
  mcpToolInputSchemas,
  moveCardCommandSchema,
  parkCardCommandSchema,
  toErrorResponse,
  updateCardCommandSchema,
  updatePersonaCommandSchema,
  updateReleaseCommandSchema,
  updateRoadmapCommandSchema,
  updateStoryMapCommandSchema,
  DomainError
} from "./index";

const id = randomUUID();
const invalidTokens = [undefined, 0, -1, 1.5, "1", null];
const commands: Array<[string, { safeParse: (value: unknown) => { success: boolean } }, Record<string, unknown>]> = [
  ["updateCard", updateCardCommandSchema, { title: "T" }],
  ["moveCard", moveCardCommandSchema, { parentId: null, position: 0 }],
  ["deleteCard", deleteCardCommandSchema, { strategy: "unassign" }],
  ["parkCard", parkCardCommandSchema, { childStrategy: "unassign" }],
  ["updateRelease", updateReleaseCommandSchema, { name: "R" }],
  ["updatePersona", updatePersonaCommandSchema, { name: "P" }],
  ["updateRoadmap", updateRoadmapCommandSchema, { name: "M" }],
  ["updateStoryMap", updateStoryMapCommandSchema, { name: "S" }],
  ["bulkUpdateCards", bulkUpdateCardsCommandSchema, { storyMapId: id, patch: { status: "done" }, cards: [{ id }] }],
  ["deleteStoryMap", deleteStoryMapParamsSchema, { storyMapId: id }]
];

describe("required baseVersion", () => {
  it.each(commands)("%s accepts a positive integer and refuses a missing or invalid token", (_name, schema, body) => {
    const withToken = (baseVersion: unknown) => ({ ...body, ...(baseVersion === undefined ? {} : { baseVersion }), ...(body.cards ? { cards: [{ id, baseVersion }] } : {}) });
    expect(schema.safeParse(withToken(3)).success).toBe(true);
    for (const token of invalidTokens) expect(schema.safeParse(withToken(token)).success, String(token)).toBe(false);
  });

  it.each(["UpdateStoryMapCard", "MoveStoryMapCard", "DeleteOrArchiveStoryMapCard", "UpdateStoryMapRelease", "UpdateStoryMapPersona", "UpdateRoadmap", "UpdateStoryMap", "DeleteStoryMap", "DeleteCard", "DeletePersona", "DeleteRelease", "ParkCard", "UnparkCard"] as const)("MCP tool %s requires baseVersion", (tool) => {
    expect(mcpToolInputSchemas[tool].shape.baseVersion).toBeDefined();
    expect(mcpToolInputSchemas[tool].shape.baseVersion.safeParse(undefined).success).toBe(false);
  });

  it("serializes conflicts at the top level of the error response", () => {
    const conflicts = [{ entity: "card" as const, id, baseVersion: 1, currentVersion: 2, current: { id } }];
    expect(toErrorResponse(new DomainError("conflict", "stale", undefined, conflicts))).toEqual({ statusCode: 409, code: "conflict", message: "stale", conflicts });
  });
});
