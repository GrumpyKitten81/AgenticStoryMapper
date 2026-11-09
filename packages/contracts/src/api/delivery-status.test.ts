import { expect, it } from "vitest";
import { mcpToolInputSchemas, updateDeliveryStatusRequestSchema } from "@storymapper/contracts";

const input = { storyMapId: "00000000-0000-4000-8000-000000000001", cards: [{ system: " bmad ", externalId: " Story-A ", status: "In Review" }] };
it("shares the strict delivery request with MCP and trims case-sensitive external identities", () => {
  expect(mcpToolInputSchemas.UpdateDeliveryStatus).toBe(updateDeliveryStatusRequestSchema);
  expect(updateDeliveryStatusRequestSchema.parse(input)).toEqual({ ...input, cards: [{ system: "bmad", externalId: "Story-A", status: "In Review" }] });
});
it.each([
  { ...input, cards: [] }, { ...input, cards: Array(101).fill(input.cards[0]) },
  { ...input, actorId: "forged" }, { ...input, cards: [{ ...input.cards[0], cardId: "forged" }] },
  ...["", " ", "github", "BMAD", "bad/system"].map((system) => ({ ...input, cards: [{ ...input.cards[0], system }] })),
  { ...input, cards: [{ ...input.cards[0], externalId: " " }] }, { ...input, cards: [{ ...input.cards[0], status: "" }] }
])("refuses invalid delivery shape %#", (request) => { expect(updateDeliveryStatusRequestSchema.safeParse(request).success).toBe(false); });
