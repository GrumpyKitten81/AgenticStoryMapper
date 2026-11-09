import { describe, expect, it } from "vitest";
import { changeSetPreviewQuerySchema, changeSetPresentationStatus } from "@storymapper/contracts/schemas/changeset-preview";
import { changeSetSelectionRequestSchema } from "@storymapper/contracts/schemas/change-set-schemas";

describe("ChangeSet preview contracts", () => {
  it("preserves empty selection and rejects malformed, duplicate and unknown query fields", () => {
    expect(changeSetPreviewQuerySchema.parse({ selectedOperationIds: "[]" })).toEqual({ selectedOperationIds: [] });
    for (const query of [{ selectedOperationIds: '["a","a"]' }, { selectedOperationIds: "null" }, { selectedOperationIds: "bad" }, { unexpected: "x" }]) expect(changeSetPreviewQuerySchema.safeParse(query).success).toBe(false);
    expect(changeSetSelectionRequestSchema.safeParse({ selectedOperationIds: ["a", "a"] }).success).toBe(false);
  });
  it("derives Discarded solely from restore history and retains every persisted status", () => {
    for (const status of ["proposed", "approved", "applied", "rejected", "stale", "conflict"] as const) {
      expect(changeSetPresentationStatus({ status, operationsSchemaVersion: 4 })).toBe(status);
      expect(changeSetPresentationStatus({ status, operationsSchemaVersion: 4, undoneByRestore: true })).toBe("discarded");
    }
  });
});
