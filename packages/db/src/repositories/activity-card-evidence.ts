import { activityAffectedCardSchema, type ActivityEvent, type ActivityAffectedCard, type ActivityProjectTarget } from "@storymapper/contracts";
import { summarizeActivity } from "@storymapper/core";

const CARD_CHILD_ENTITIES = new Set(["attachment", "cardAttachment", "sourceLink", "cardPersona", "cardAnnotation", "cardDependency", "githubLink", "remoteWorkItemLink"]);
const PROJECT_ENTITIES = new Set(["release", "storyMap", "project", "persona", "annotation", "workflowStatus", "storyTemplate", "roadmap", "roadmapColumn", "roadmapSwimlane", "roadmapCard", "roadmapReference", "productContext", "sourceDocument", "sourceChunk", "aiTemplate", "connection"]);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
export function activityAffectedCards(event: ActivityEvent, before: unknown, after: unknown): ActivityAffectedCard[] {
  if (event.affectedEntityType === "card") {
    return [cardEvidence(event, before, after)];
  }
  if (event.action !== "changeSet.operation.applied") return ownerCards(event.affectedEntityType, before, after);
  const changes = record(after).changes;
  if (!Array.isArray(changes)) throw new Error("Applied operation Activity has no committed changes.");
  const cards = new Map<string, ActivityAffectedCard>();
  for (const value of changes) {
    const change = record(value);
    if (change.entity !== "card") continue;
    const card = cardEvidence({ ...event, affectedEntityType: "card", affectedEntityId: String(change.entityId) }, change.before, change.after);
    cards.set(card.id, card);
  }
  for (const value of changes) {
    const change = record(value);
    const action = committedAction(change);
    for (const owner of ownerCards(change.entity, change.before, change.after)) {
      const card = cards.get(owner.id) ?? owner;
      cards.set(owner.id, { ...card, actions: [...new Set([...(card.actions ?? []), action])] });
    }
  }
  return [...cards.values()].filter((card) => card.changes?.length || card.actions?.length || card.action === "card.created" || card.action === "card.deleted");
}

function committedAction(change: Record<string, unknown>): string {
  return `${String(change.entity)}.${change.after ? change.before ? "updated" : "created" : "deleted"}`;
}

export function activityProjectTargets(event: ActivityEvent): ActivityProjectTarget[] {
  if (event.action !== "changeSet.operation.applied") return [];
  const changes = record(event.after).changes;
  if (!Array.isArray(changes)) throw new Error("Applied operation Activity has no committed changes.");
  return changes.flatMap((value) => {
    const change = record(value);
    if (typeof change.entity !== "string" || !PROJECT_ENTITIES.has(change.entity) || !changedDomainSnapshot(change)) return [];
    const action = committedAction(change);
    const summary = summarizeActivity({ ...event, action, affectedEntityType: change.entity, affectedEntityId: String(change.entityId), before: change.before, after: change.after });
    return summary.subject ? [{ subject: summary.subject, action, changes: action.endsWith(".updated") ? summary.changes : [] }] : [];
  });
}

function changedDomainSnapshot(change: Record<string, unknown>): boolean {
  const domainFields = (snapshot: unknown) => Object.fromEntries(Object.entries(record(snapshot)).filter(([key]) => key !== "version" && key !== "updatedAt"));
  return !isDeepStrictEqual(domainFields(change.before), domainFields(change.after));
}

function cardEvidence(event: ActivityEvent, before: unknown, after: unknown): ActivityAffectedCard {
  const summary = summarizeActivity({ ...event, before, after, action: event.action === "changeSet.operation.applied" ? "card.updated" : event.action });
  const snapshot = { ...record(before), ...record(after) };
  const action = event.action === "changeSet.operation.applied" ? `card.${after ? before ? "updated" : "created" : "deleted"}` : event.action;
  return activityAffectedCardSchema.parse({ id: event.affectedEntityId, title: summary.subject?.name, key: summary.subject?.key, storyMapId: snapshot.storyMapId, changes: action === "card.created" || action === "card.deleted" ? [] : summary.changes, action });
}

function ownerCards(entity: unknown, before: unknown, after: unknown): ActivityAffectedCard[] {
  if (typeof entity !== "string" || !CARD_CHILD_ENTITIES.has(entity) && entity !== "externalRef") return [];
  const owners = new Map<string, ActivityAffectedCard>();
  for (const snapshot of [record(before), record(after)]) {
    const id = entity === "externalRef" ? snapshot.entityType === "card" ? snapshot.entityId : undefined : snapshot.cardId;
    const ids = entity === "cardDependency" ? [id, snapshot.prerequisiteCardId] : [id];
    for (const value of ids) {
      if (value === undefined || value === null) continue;
      const owner = activityAffectedCardSchema.parse({ id: value });
      owners.set(owner.id, owner);
    }
  }
  return [...owners.values()];
}
import { isDeepStrictEqual } from "node:util";
