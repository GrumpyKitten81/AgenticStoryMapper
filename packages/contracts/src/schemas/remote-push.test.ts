import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { confirmRemotePushRequestSchema, remoteIssuePayloadSchema, remotePushSelectionSchema } from "@storymapper/contracts/schemas/remote-push";
import { connectorConnectionSchema } from "@storymapper/contracts/schemas/domain";

it("binds confirmation only to its plan id and retains an explicit empty selection", () => {
  const planId = randomUUID();
  expect(confirmRemotePushRequestSchema.parse({ planId })).toEqual({ planId });
  expect(confirmRemotePushRequestSchema.safeParse({ planId, confirm: true, cardIds: [] }).success).toBe(false);
  expect(confirmRemotePushRequestSchema.safeParse({ confirm: true }).success).toBe(false);
  expect(remotePushSelectionSchema.parse({ cardIds: [] })).toEqual({ cardIds: [] });
});

it("requires concrete native type, explicit clearing and supported state in an exact Issue payload", () => {
  const payload = { title: "Reviewed", body: "Authored bytes", labels: ["managed", "unrelated"], issueType: "Task", remoteState: "open", milestoneNumber: null };
  expect(remoteIssuePayloadSchema.parse(payload)).toEqual(payload);
  expect(remoteIssuePayloadSchema.safeParse({ ...payload, issueType: undefined }).success).toBe(false);
  expect(remoteIssuePayloadSchema.safeParse({ ...payload, milestoneNumber: undefined }).success).toBe(false);
  expect(remoteIssuePayloadSchema.safeParse({ ...payload, remoteState: "closed-as-completed" }).success).toBe(false);
  expect(connectorConnectionSchema.shape.issueTypeMapping.parse([{ cardType: "story", issueType: "Task" }])).toEqual([{ cardType: "story", issueType: "Task" }]);
  expect(connectorConnectionSchema.shape.issueTypeMapping.safeParse([{ cardType: "note", issueType: "Task" }]).success).toBe(false);
});
