import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { confirmRemotePushRequestSchema, remoteIssuePayloadSchema, remotePushEffectSchema, remotePushRelationshipIntentSchema, remotePushRelationshipResultSchema, remotePushSelectionSchema } from "@storymapper/contracts/schemas/remote-push";
import { connectorConnectionSchema } from "@storymapper/contracts/schemas/domain";

it("binds confirmation only to its plan id and retains an explicit empty selection", () => {
  const planId = randomUUID();
  expect(confirmRemotePushRequestSchema.parse({ planId })).toEqual({ planId });
  expect(confirmRemotePushRequestSchema.safeParse({ planId, confirm: true, cardIds: [] }).success).toBe(false);
  expect(confirmRemotePushRequestSchema.safeParse({ confirm: true }).success).toBe(false);
  expect(remotePushSelectionSchema.parse({ cardIds: [] })).toEqual({ cardIds: [] });
});

it("requires explicit reviewed relationship states and numeric database identity", () => {
  const parent = { kind: "existing", remoteNumber: 2, url: "https://github.com/owner/repo/issues/2" };
  const effect = { id: randomUUID(), entityId: randomUUID(), kind: "relationship", action: "remove", cardKey: "US-1", cardTitle: "Child", marker: "relationship", dependencies: [], labelAdditions: [], labelRemovals: [], child: { ...parent, remoteNumber: 3, url: "https://github.com/owner/repo/issues/3" }, expectedParent: parent, resultingParent: null };
  expect(remotePushEffectSchema.safeParse(effect).success).toBe(true);
  expect(remotePushEffectSchema.safeParse({ ...effect, resultingParent: undefined }).success).toBe(false);
  expect(remotePushEffectSchema.safeParse({ ...effect, resultingParent: parent }).success).toBe(false);
  expect(remotePushEffectSchema.safeParse({ ...effect, action: "acknowledge", resultingParent: parent }).success).toBe(true);
  const intent = { operation: "remove", childNumber: 3, childDatabaseId: 12345, parentNumber: 2, expectedParent: 2, resultingParent: null };
  expect(remotePushRelationshipIntentSchema.safeParse(intent).success).toBe(true);
  expect(remotePushRelationshipIntentSchema.safeParse({ ...intent, childDatabaseId: "12345" }).success).toBe(false);
  expect(remotePushRelationshipIntentSchema.safeParse({ ...intent, parentNumber: 3 }).success).toBe(false);
  expect(remotePushRelationshipResultSchema.safeParse({ response: {}, observedParent: null }).success).toBe(true);
  expect(remotePushRelationshipResultSchema.safeParse({ response: {}, observedParent: { number: 2 } }).success).toBe(false);
  expect(remoteIssuePayloadSchema.safeParse({ title: "Issue", body: "", labels: [], issueType: "Task", remoteState: "open", milestoneNumber: null, parentIssueNumber: 2 }).success).toBe(false);
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
