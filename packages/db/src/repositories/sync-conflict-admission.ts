import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import type { ChangeOperation, SyncConflict } from "@storymapper/contracts";
import { cards, storyMaps, syncConflicts } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

export function hasRelevantOpenSyncConflicts(this: StoryMapperRepository, projectId: string, operations: readonly ChangeOperation[]): boolean {
  const conditions = operations.flatMap((operation) => relevantConditions(this, operation));
  if (!conditions.length) return false;
  return Boolean(this.db.select({ id: syncConflicts.id }).from(syncConflicts).innerJoin(cards, eq(cards.id, syncConflicts.cardId)).innerJoin(storyMaps, eq(storyMaps.id, cards.storyMapId)).where(and(eq(storyMaps.projectId, projectId), eq(syncConflicts.status, "open"), or(...conditions))).limit(1).get());
}

function relevantConditions(repository: StoryMapperRepository, operation: ChangeOperation): SQL[] {
  if (operation.entity === "card" || operation.entity === "cardAnnotation") {
    const ids = operation.entity === "cardAnnotation" ? [operation.after.cardId] : operation.op === "bulk" ? operation.after.cards.map((card) => card.id) : operation.entityId ? [operation.entityId] : [];
    const fields = fieldsForCard(operation);
    if (!ids.length || !fields.length) return [];
    if (operation.entity === "card" && operation.op === "delete") {
      const card = repository.getCard(operation.entityId!);
      return card ? [eq(cards.storyMapId, card.storyMapId)] : [];
    }
    return [and(inArray(syncConflicts.cardId, ids), inArray(syncConflicts.field, fields))!];
  }
  if (operation.entity === "release") {
    const release = operation.entityId && repository.getRelease(operation.entityId);
    return release ? [and(eq(cards.storyMapId, release.storyMapId), eq(syncConflicts.field, "milestone"))!] : [];
  }
  if (operation.entity === "annotation" || operation.entity === "workflowStatus") {
    const definition = operation.op === "create" ? operation.after : operation.entity === "annotation" ? repository.getAnnotation(operation.entityId!) : repository.getWorkflowStatus(operation.entityId!);
    if (!definition) return [];
    return [and(eq(syncConflicts.field, operation.entity === "annotation" ? "labels" : "status"), definition.storyMapId ? eq(cards.storyMapId, definition.storyMapId) : undefined)!];
  }
  return [];
}

function fieldsForCard(operation: ChangeOperation): SyncConflict["field"][] {
  if (operation.entity === "cardAnnotation") return ["labels"];
  if (operation.entity !== "card") return [];
  if (operation.op === "delete") return ["title", "description", "status", "labels", "milestone"];
  if (operation.op === "archive" || operation.op === "unarchive") return ["status"];
  const patch = operation.op === "bulk" ? operation.after.patch : operation.after;
  return [...(["title", "description", "status"] as const).filter((field) => field in patch), ...("releaseId" in patch ? ["milestone" as const] : []), ...("addAnnotationId" in patch || "removeAnnotationId" in patch ? ["labels" as const] : []), ...(operation.op === "upsert" ? ["status" as const] : [])];
}
