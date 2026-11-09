import { z } from "zod";
import { expect, it } from "vitest";
import { cardSchema, externalRefSchema } from "@storymapper/contracts/schemas/domain";

const previousTimestampSchema = z.iso.datetime({ precision: -1 }).or(z.iso.datetime());
const timestampSchemas = [cardSchema.shape.createdAt, cardSchema.shape.updatedAt, externalRefSchema.shape.createdAt];

it.each([
  ["2026-10-16T16:12Z", true],
  ["2026-10-16T16:12:00Z", true],
  ["2026-10-16T16:12:00.123456Z", true],
  ["2024-02-29T00:00:00.000Z", true],
  ["2026-10-16T16:12:00+00:00", false],
  ["2026-10-16T18:12:00+02:00", false],
  ["2026-10-16T16:12:00-05:00", false],
  ["2026-10-16T16:12:00", false],
  ["2026-10-16T16:12:00z", false],
  ["2026-10-16T24:12:00Z", false],
  ["2026-10-16T16:12:60Z", false],
  ["2026-02-29T16:12:00Z", false],
  ["2026-10-16T16:12:00Z ", false],
  ["malformed", false]
])("preserves Card and external binding timestamp acceptance for %s", (value, accepted) => {
  expect(previousTimestampSchema.safeParse(value).success).toBe(accepted);
  for (const schema of timestampSchemas) {
    const result = schema.safeParse(value);
    expect(result.success).toBe(accepted);
    if (result.success) expect(result.data).toBe(value);
  }
});
