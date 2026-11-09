import { expect, it } from "vitest";
import { syncReleaseMetadataSchema } from "@storymapper/contracts";

it("requires explicit authored goal and released evidence in the strict Release metadata contract", () => {
  const metadata = { name: "Release", goal: "Authored goal", released: true, startDate: null, releaseDate: "2026-11-01" };
  expect(syncReleaseMetadataSchema.parse(metadata)).toEqual(metadata);
  for (const field of ["goal", "released"] as const) {
    const incomplete: Partial<typeof metadata> = { ...metadata };
    delete incomplete[field];
    expect(syncReleaseMetadataSchema.safeParse(incomplete).success).toBe(false);
  }
  expect(syncReleaseMetadataSchema.parse({ ...metadata, goal: "", released: false })).toMatchObject({ goal: "", released: false });
  expect(syncReleaseMetadataSchema.parse({ ...metadata, goal: null, released: null, startDate: "2026-10-19" })).toMatchObject({ goal: null, released: null });
});
