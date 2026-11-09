import { expect, it } from "vitest";
import { activitySummarySchema, projectSchema, safetySettingsSchema, type ActivityEvent } from "@storymapper/contracts";
import { buildAuditExport, summarizeActivity } from "@storymapper/core";

const projectId = "00000000-0000-4000-8000-000000000001";
const event: ActivityEvent = { id: "00000000-0000-4000-8000-000000000002", projectId, actor: "github-fixture", actorType: "github", action: "githubLink.created", affectedEntityType: "githubLink", affectedEntityId: "00000000-0000-4000-8000-000000000003", createdAt: "2026-10-08T12:00:00.000Z", before: { token: "fixture-secret" }, after: { content: "fixture-secret", filePath: "C:/private/fixture-path" } };

it("retains identity, time and affected object metadata while omitting all internal snapshots", () => {
  const summary = summarizeActivity(event);
  expect(activitySummarySchema.parse(summary)).toEqual(summary);
  expect(summary).toMatchObject({ scope: "project", actor: event.actor, createdAt: event.createdAt, affectedEntityId: event.affectedEntityId });
  expect(summary).not.toHaveProperty("before");
  expect(summary).not.toHaveProperty("after");
  expect(summarizeActivity({ ...event, projectId: null }).scope).toBe("runtime");
});

it("exports the same safe scope and tool metadata in both formats without Project paths or entity payloads", () => {
  const tool: ActivityEvent = { ...event, actor: "agent-fixture", actorType: "agent", mcpSessionId: "fixture-session", action: "tool_call", projectId: null, before: undefined, after: { toolName: "ListProjects", inputHash: "a".repeat(64), outputHash: "b".repeat(64), outcome: "rejected", rejectionReason: "disabled", affectedEntityIds: [projectId] } };
  const project = projectSchema.parse({ id: projectId, name: "Project fixture", localPath: "C:/private/fixture-path", createdAt: event.createdAt });
  const settings = safetySettingsSchema.parse({ projectId, agentMode: "apply", github: true, updatedAt: event.createdAt });
  for (const format of ["json", "markdown"] as const) {
    const file = buildAuditExport(project, settings, [event, tool], format, event.createdAt);
    for (const safe of ["github-fixture", "agent-fixture", "fixture-session", projectId, "runtime", "ListProjects", "rejected", "disabled", "a".repeat(64), "b".repeat(64)]) expect(file.content).toContain(safe);
    for (const privateValue of ["fixture-secret", "C:/private/fixture-path", '"before"', '"after"', '"localPath"']) expect(file.content).not.toContain(privateValue);
  }
});

it("summarizes recorded Card identity and allowlisted changes without exposing arbitrary snapshot data", () => {
  const before = { id: event.affectedEntityId, key: "LSM-1", title: "Recorded title", status: "todo", estimate: 2, assignee: "Owner", parked: false, description: "fixture-secret", token: "fixture-secret" };
  const after = { ...before, title: "Updated title", status: "done", estimate: 3, assignee: undefined, parked: true, privatePayload: { name: "fixture-secret" } };
  const summary = summarizeActivity({ ...event, action: "card.updated", affectedEntityType: "card", before, after });
  expect(summary.subject).toEqual({ type: "card", id: event.affectedEntityId, key: "LSM-1", name: "Updated title" });
  expect(summary.changes).toEqual([
    { field: "title", before: "Recorded title", after: "Updated title" },
    { field: "status", before: "todo", after: "done" },
    { field: "assignee", before: "Owner" },
    { field: "estimate", before: 2, after: 3 },
    { field: "parked", before: false, after: true }
  ]);
  expect(activitySummarySchema.parse(summary)).toEqual(summary);
  expect(JSON.stringify(summary)).not.toContain("fixture-secret");
});

it("uses deletion and supported wrapper snapshots while preserving unknown or mismatched historical subjects", () => {
  const identity = { id: event.affectedEntityId, name: "Historical name" };
  const deleted = summarizeActivity({ ...event, affectedEntityType: "release", before: { ...identity, goal: "Goal", startDate: null, released: false }, after: undefined });
  expect(deleted.subject?.name).toBe("Historical name");
  expect(deleted.changes).toContainEqual({ field: "released", before: false });
  for (const [type, wrapper, entity] of [["sourceDocument", "document", { id: identity.id, title: "Historical source" }], ["roadmap", "roadmap", identity], ["storyMap", "storyMap", identity]] as const) {
    const summary = summarizeActivity({ ...event, affectedEntityType: type, before: undefined, after: { [wrapper]: entity, content: "fixture-secret" } });
    expect(summary.subject?.name).toBe("title" in entity ? entity.title : entity.name);
    expect(JSON.stringify(summary)).not.toContain("fixture-secret");
  }
  for (const historical of [
    { ...event, affectedEntityType: "card", before: undefined, after: { id: projectId, title: "Wrong owner" } },
    { ...event, affectedEntityType: "unknown", before: undefined, after: { ...identity, title: "Unknown payload" } },
    { ...event, affectedEntityType: "card", before: undefined, after: { id: identity.id, title: { content: "fixture-secret" }, status: ["fixture-secret"], estimate: Infinity } }
  ]) {
    const summary = summarizeActivity(historical);
    expect(summary.subject).toEqual({ type: historical.affectedEntityType, id: identity.id });
    expect(summary.changes).toBeUndefined();
  }
});

it("summarizes one canonical operation change without replacing event identity or exposing nested payloads", () => {
  const before = { id: event.affectedEntityId, key: "LSM-1", title: "Recorded title", status: "todo", description: "fixture-secret", token: "fixture-secret" };
  const after = { ...before, title: "Updated title", status: "done" };
  const operation = { ...event, action: "changeSet.operation.applied", affectedEntityType: "changeSet", affectedEntityId: "recorded-operation", before: undefined, after: { operationId: "recorded-operation", kind: "update:card", changes: [{ entity: "card", entityId: before.id, before, after }], payload: "fixture-secret" } };
  const summary = summarizeActivity(operation);
  expect(summary).toMatchObject({ id: event.id, action: operation.action, affectedEntityType: "changeSet", affectedEntityId: "recorded-operation" });
  expect(summary.subject).toEqual({ type: "card", id: before.id, key: "LSM-1", name: "Updated title" });
  expect(summary.changes).toEqual([{ field: "title", before: "Recorded title", after: "Updated title" }, { field: "status", before: "todo", after: "done" }]);
  expect(activitySummarySchema.parse(summary)).toEqual(summary);
  expect(JSON.stringify(summary)).not.toContain("fixture-secret");
  expect(operation.after.changes[0]?.after.description).toBe("fixture-secret");
});

it("does not claim one domain subject for multiple or malformed operation changes", () => {
  const change = { entity: "card", entityId: event.affectedEntityId, after: { id: event.affectedEntityId, title: "Recorded title" } };
  const operation = { ...event, action: "changeSet.operation.applied", affectedEntityType: "changeSet", affectedEntityId: "recorded-operation", before: undefined };
  for (const changes of [[change, { ...change, entityId: projectId, after: { id: projectId, title: "Other title" } }], [], [{ ...change, entity: undefined }], "fixture-secret"]) {
    const summary = summarizeActivity({ ...operation, after: { changes } });
    expect(summary.subject).toBeUndefined();
    expect(summary.changes).toBeUndefined();
    expect(JSON.stringify(summary)).not.toContain("Recorded title");
  }
  const mismatch = summarizeActivity({ ...operation, after: { changes: [{ ...change, entityId: projectId }] } });
  expect(mismatch.subject).toEqual({ type: "card", id: projectId });
  expect(mismatch.changes).toBeUndefined();
  const unknown = summarizeActivity({ ...operation, after: { changes: [{ ...change, entity: "unknown" }] } });
  expect(unknown.subject).toEqual({ type: "unknown", id: change.entityId });
  expect(unknown.changes).toBeUndefined();
});

it("records description and relationship changes without leaking content or technical IDs", () => {
  const before = { id: event.affectedEntityId, description: "Previous private content", parentId: projectId, releaseId: null };
  const after = { ...before, description: "Updated private content", parentId: event.id, releaseId: projectId };
  const summary = summarizeActivity({ ...event, affectedEntityType: "card", before, after });
  expect(summary.changes).toEqual([{ field: "description" }, { field: "parentId" }, { field: "releaseId" }]);
  expect(JSON.stringify(summary.changes)).not.toContain("private content");
  expect(JSON.stringify(summary.changes)).not.toContain(projectId);
});
