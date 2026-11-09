import { expect, it } from "vitest";
import { changeSetSchema, storedChangeSetSchema, OPERATIONS_SCHEMA_VERSION } from "@storymapper/contracts";

const proposal = {
  id: "11111111-1111-4111-8111-111111111111", projectId: "22222222-2222-4222-8222-222222222222",
  title: "Versioned proposal", source: "mcp", status: "proposed", operations: [], createdAt: "2026-10-12T00:00:00Z"
};

it("separates strict executable submissions from version-tagged historical reads", () => {
  expect(changeSetSchema.parse(proposal).operationsSchemaVersion).toBe(OPERATIONS_SCHEMA_VERSION);
  const historical = { ...proposal, status: "applied", operationsSchemaVersion: 1, operations: [{ retiredOperation: "original payload" }] };
  expect(storedChangeSetSchema.parse(historical)).toEqual(historical);
  expect(changeSetSchema.safeParse(historical).success).toBe(false);
  expect(changeSetSchema.safeParse({ ...proposal, operationsSchemaVersion: OPERATIONS_SCHEMA_VERSION + 1 }).success).toBe(false);
  expect(changeSetSchema.safeParse({ ...proposal, executableAdapter: {} }).success).toBe(false);
  expect(storedChangeSetSchema.safeParse({ ...historical, operationsSchemaVersion: 0 }).success).toBe(false);
  expect(storedChangeSetSchema.safeParse({ ...historical, status: "retired" }).success).toBe(false);
});

it("retains prior GitHub operations only as versioned history", () => {
  expect(OPERATIONS_SCHEMA_VERSION).toBeGreaterThan(4);
  const historical = { ...proposal, operationsSchemaVersion: 4, operations: [{ operationId: "legacy", op: "create", entity: "githubLink", after: { cardId: proposal.projectId, repo: "owner/repo", issueNumber: 7, url: "https://github.com/owner/repo/issues/7" } }] };
  expect(storedChangeSetSchema.parse(historical)).toEqual(historical);
  expect(changeSetSchema.safeParse(historical).success).toBe(false);
  expect(changeSetSchema.safeParse({ ...historical, operationsSchemaVersion: OPERATIONS_SCHEMA_VERSION }).success).toBe(false);
});
