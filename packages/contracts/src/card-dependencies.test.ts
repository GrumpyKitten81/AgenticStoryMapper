import { expect, it } from "vitest";
import { cardDependencySchema, changeOperationSchema, mcpToolInputSchemas, setCardDependencyRequestSchema } from "@storymapper/contracts";

const cardId = "00000000-0000-4000-8000-000000000001";
const prerequisiteCardId = "00000000-0000-4000-8000-000000000002";
it("requires explicit baselines and strict paired endpoint selectors", () => {
  const request = { prerequisiteCardId, baseVersion: 1 };
  expect(setCardDependencyRequestSchema.parse(request)).toEqual(request);
  expect(mcpToolInputSchemas.SetCardDependency.parse({ cardId, ...request })).toEqual({ cardId, ...request });
  expect(setCardDependencyRequestSchema.safeParse({ prerequisiteCardId }).success).toBe(false);
  const operation = { operationId: "edge", op: "set", entity: "cardDependency", after: { cardId: { kind: "id", id: cardId }, prerequisiteCardId: { kind: "externalRef", scopeId: cardId, system: "bmad", externalId: "5.1" } } };
  expect(changeOperationSchema.parse(operation)).toEqual(operation);
  expect(changeOperationSchema.safeParse({ ...operation, after: { ...operation.after, cardId } }).success).toBe(false);
  expect(changeOperationSchema.safeParse({ ...operation, after: { ...operation.after, ignored: true } }).success).toBe(false);
  expect(cardDependencySchema.safeParse({ id: cardId, cardId, prerequisiteCardId, createdAt: "2026-10-13T12:00:00.000Z", storyMapId: cardId }).success).toBe(false);
});
