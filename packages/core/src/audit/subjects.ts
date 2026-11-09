import type { ActivityEvent, ActivitySummary } from "@storymapper/contracts";

const SUBJECT_FIELDS: Record<string, readonly string[]> = {
  card: ["cardType", "title", "description", "status", "archived", "assignee", "estimate", "parked", "priority", "businessValue", "effort", "color", "position", "parentId", "releaseId"],
  release: ["name", "goal", "startDate", "releaseDate", "released"],
  project: ["name"], storyMap: ["name"], persona: ["name"], workflowStatus: ["name"],
  annotation: ["name"], storyTemplate: ["name"], roadmap: ["name"], roadmapColumn: ["name"],
  roadmapSwimlane: ["name"], roadmapCard: ["title"], changeSet: ["title", "status"],
  sourceDocument: ["title"], aiTemplate: ["name"]
};
type ChangeValue = string | number | boolean | null;
type Snapshot = Record<string, unknown>;

function object(value: unknown): Snapshot | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Snapshot : undefined;
}

function entitySnapshot(event: ActivityEvent, value: unknown): Snapshot | undefined {
  const snapshot = object(value);
  if (!snapshot) return undefined;
  const nested = event.affectedEntityType === "sourceDocument" ? object(snapshot.document)
    : event.affectedEntityType === "roadmap" ? object(snapshot.roadmap)
      : event.affectedEntityType === "storyMap" ? object(snapshot.storyMap) : undefined;
  const entity = nested ?? snapshot;
  const identity = event.affectedEntityType === "aiTemplate" ? `${entity.projectId}:${entity.id}` : entity.id;
  return identity === event.affectedEntityId ? entity : undefined;
}

function fieldValue(snapshot: Snapshot | undefined, field: string): ChangeValue | undefined {
  const value = snapshot?.[field];
  if (["estimate", "businessValue", "effort", "position"].includes(field)) return value === null || typeof value === "number" && Number.isFinite(value) ? value : undefined;
  if (field === "parked" || field === "released") return typeof value === "boolean" ? value : undefined;
  if (value === null && ["assignee", "startDate", "releaseDate"].includes(field)) return null;
  return typeof value === "string" ? value : undefined;
}

function operationSubjectEvent(event: ActivityEvent): ActivityEvent | undefined {
  if (event.action !== "changeSet.operation.applied") return event;
  const changes = object(event.after)?.changes;
  const change = Array.isArray(changes) && changes.length === 1 ? object(changes[0]) : undefined;
  if (!change || typeof change.entity !== "string" || typeof change.entityId !== "string") return undefined;
  return { ...event, affectedEntityType: change.entity, affectedEntityId: change.entityId, before: change.before, after: change.after };
}

export function summarizeActivitySubject(event: ActivityEvent): Pick<ActivitySummary, "subject" | "changes"> {
  const historicalEvent = operationSubjectEvent(event);
  return historicalEvent ? summarizeEntitySubject(historicalEvent) : {};
}

function summarizeEntitySubject(event: ActivityEvent): Pick<ActivitySummary, "subject" | "changes"> {
  const type = event.affectedEntityType;
  const id = event.affectedEntityId;
  if (!type || !id) return {};
  const fields = Object.hasOwn(SUBJECT_FIELDS, type) ? SUBJECT_FIELDS[type] : undefined;
  const before = fields ? entitySnapshot(event, event.before) : undefined;
  const after = fields ? entitySnapshot(event, event.after) : undefined;
  const nameField = fields?.includes("title") ? "title" : "name";
  const name = fieldValue(after, nameField) ?? fieldValue(before, nameField);
  const key = type === "card" ? after?.key ?? before?.key : undefined;
  const subject = { type, id, ...(typeof name === "string" ? { name } : {}), ...(typeof key === "string" ? { key } : {}) };
  const changes = (fields ?? []).flatMap((field) => {
    if (["description", "parentId", "releaseId"].includes(field)) return before?.[field] === after?.[field] ? [] : [{ field }];
    const oldValue = fieldValue(before, field);
    const newValue = fieldValue(after, field);
    return oldValue === newValue ? [] : [{ field, ...(oldValue !== undefined ? { before: oldValue } : {}), ...(newValue !== undefined ? { after: newValue } : {}) }];
  });
  return { subject, ...(changes.length ? { changes } : {}) };
}
