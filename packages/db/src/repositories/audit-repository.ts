import { isCardArchived } from "@storymapper/core/story-map/github-status";
import { activityAffectedCards, activityProjectTargets } from "@storymapper/db/repositories/activity-card-evidence";
import { databaseLiveCursor } from "@storymapper/db/live-events";
import { listRestorePoints } from "@storymapper/db/restore-points";
import { DomainError, type ActivityAffectedCard, type ActivityChange, type ActivityChangesQuery, type ActivityChangesResponse } from "@storymapper/contracts";
import { randomUUID } from "node:crypto";
import type { Statement } from "better-sqlite3";
import { and, asc, desc, eq, gt, lte, ne, inArray, isNotNull, isNull, lt, not, or, sql } from "drizzle-orm";
import { activityCursorSchema, actorContextSchema, type ActorContext, type ActivityEvent, type ActivityQuery, type ActivityResponse, type ToolCallMetadata } from "@storymapper/contracts";
import { createActivityEvent, summarizeActivity } from "@storymapper/core";
import { toActivityEvent } from "@storymapper/db/repositories/row-mappers";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { activityEvents, cards, cardVersions } from "@storymapper/db/schema";
import type { SqliteDatabase } from "@storymapper/db/connection";
import { trackLiveActivity } from "@storymapper/db/live-change-tracking";

const toolCallInserts = new WeakMap<SqliteDatabase["$client"], Statement<unknown[]>>();

export function listActivity(this: StoryMapperRepository<"transaction">, projectId?: string): ActivityEvent[] {
    this.context.database;
    const query = this.db.select().from(activityEvents).orderBy(asc(activityEvents.createdAt));
    const rows = projectId ? query.where(eq(activityEvents.projectId, projectId)).all() : query.all();
    return rows.map(toActivityEvent);
  }

export function listActivityPage(this: StoryMapperRepository<"transaction">, query: ActivityQuery, visibility: { projectIds?: string[]; includeRuntime: boolean }, readToolNames: readonly string[] = []): ActivityResponse {
  this.context.database;
  const scope = query.projectId ? [eq(activityEvents.projectId, query.projectId)] : visibility.projectIds ? [inArray(activityEvents.projectId, visibility.projectIds)] : [];
  const visible = visibility.includeRuntime ? scope.length ? or(...scope, isNull(activityEvents.projectId)) : undefined : and(isNotNull(activityEvents.projectId), ...scope, ...(visibility.projectIds ? [inArray(activityEvents.projectId, visibility.projectIds)] : []));
  const cursor = query.cursor ? activityCursorSchema.parse(JSON.parse(query.cursor)) : undefined;
  const rows = this.db.select().from(activityEvents).where(and(
    visible,
    query.actorType ? eq(activityEvents.actorType, query.actorType) : undefined,
    query.toolName ? and(eq(activityEvents.action, "tool_call"), eq(activityEvents.affectedEntityType, "mcpTool"), eq(activityEvents.affectedEntityId, query.toolName)) : undefined,
    query.view === "changes" && readToolNames.length ? not(and(eq(activityEvents.action, "tool_call"), sql`coalesce(json_extract(${activityEvents.afterJson}, '$.outcome'), '') = 'ok'`, inArray(sql`coalesce(json_extract(${activityEvents.afterJson}, '$.toolName'), '')`, [...readToolNames]))!) : undefined,
    cursor ? or(lt(activityEvents.createdAt, cursor.createdAt), and(eq(activityEvents.createdAt, cursor.createdAt), lt(activityEvents.id, cursor.id))) : undefined
  )).orderBy(desc(activityEvents.createdAt), desc(activityEvents.id)).limit(query.limit + 1).all();
  const last = rows[query.limit - 1];
  return { activityEvents: rows.slice(0, query.limit).map(toActivityEvent).map(summarizeActivity), nextCursor: rows.length > query.limit && last ? { createdAt: last.createdAt, id: last.id } : null };
}

export function listAuditExportActivity(this: StoryMapperRepository<"transaction">, projectId: string, includeRuntime: boolean): ActivityEvent[] {
  this.context.database;
  return this.db.select().from(activityEvents).where(includeRuntime ? or(eq(activityEvents.projectId, projectId), isNull(activityEvents.projectId)) : eq(activityEvents.projectId, projectId)).orderBy(asc(activityEvents.createdAt), asc(activityEvents.id)).all().map(toActivityEvent);
}

export function logMcpToolCall(this: StoryMapperRepository<"transaction">, input: {
    projectId: string | null;
    metadata: ToolCallMetadata;
    initiatingActor?: ActorContext;
  }): ActivityEvent {
    this.assertWritable();
    const actor = input.initiatingActor ? actorContextSchema.parse(input.initiatingActor) : this.actor;
    const event = createActivityEvent({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      projectId: input.projectId,
      actor: actor.actorId,
      actorType: actor.actorType,
      mcpSessionId: actor.mcpSessionId,
      action: "tool_call",
      affectedEntityType: "mcpTool",
      affectedEntityId: input.metadata.toolName,
      after: input.metadata
    });

    const client = this.db.$client;
    let insert = toolCallInserts.get(client);
    if (!insert) {
      insert = client.prepare("INSERT INTO activity_events (id, project_id, actor, actor_type, mcp_session_id, action, affected_entity_type, affected_entity_id, after_json, after_schema_version, created_at, transaction_id, origin_client_id, live_entities_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)");
      toolCallInserts.set(client, insert);
    }
    const transaction = this.context.transaction!;
    const entity = { entityType: "activity", entityId: event.id, version: null, projectId: input.projectId };
    transaction.liveEntities.set(`activity:${event.id}`, entity);
    const inserted = insert.run(event.id, event.projectId, event.actor, event.actorType, event.mcpSessionId ?? null, event.action, event.affectedEntityType, event.affectedEntityId, JSON.stringify(event.after), event.createdAt, transaction.transactionId, actor.originClientId ?? null, JSON.stringify([entity]));
    event.seq = transaction.lastActivitySeq = Number(inserted.lastInsertRowid);

    return event;
  }

export function logActivity(this: StoryMapperRepository<"transaction">,
    projectId: string,
    action: string,
    affectedEntityType: string,
    affectedEntityId: string,
    before?: unknown,
    after?: unknown
  ): void {
    this.assertWritable();
    const transaction = this.context.transaction!;
    trackLiveActivity(this.db, transaction, projectId, affectedEntityType, affectedEntityId, before, after);
    const event = createActivityEvent({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      projectId,
      actor: this.actor.actorId,
      actorType: this.actor.actorType,
      mcpSessionId: this.actor.mcpSessionId,
      action,
      affectedEntityType,
      affectedEntityId,
      before,
      after
    });

    const inserted = this.db.insert(activityEvents).values({
      transactionId: transaction.transactionId,
      originClientId: this.actor.originClientId,
      id: event.id,
      projectId: event.projectId,
      actor: event.actor,
      actorType: event.actorType,
      mcpSessionId: event.mcpSessionId,
      action: event.action,
      affectedEntityType: event.affectedEntityType,
      affectedEntityId: event.affectedEntityId,
      beforeJson: before === undefined ? null : JSON.stringify(before), beforeSchemaVersion: before === undefined ? null : 1,
      afterJson: after === undefined ? null : JSON.stringify(after), afterSchemaVersion: after === undefined ? null : 1,
      externalCallId: event.externalCallId,
      createdAt: event.createdAt
    }).run();
    transaction.lastActivitySeq = Number(inserted.lastInsertRowid);
    finalizeActivityCardVersion(this, affectedEntityType, affectedEntityId, after, event.id);
  }

export function listActivityChanges(this: StoryMapperRepository<"transaction">, query: ActivityChangesQuery): ActivityChangesResponse {
  const { epoch, seq } = databaseLiveCursor(this.db);
  const boundary = this.db.$client.prepare("SELECT seq FROM activity_events WHERE action = 'project.restored' AND json_extract(after_json, '$.epoch') = ? ORDER BY seq DESC LIMIT 1").get(epoch) as { seq: number } | undefined;
  const floor = boundary?.seq ?? 0;
  const sameEpoch = !query.epoch || query.epoch === epoch;
  const highWater = sameEpoch ? query.highWater ?? seq : seq;
  if (highWater > seq || highWater < floor || sameEpoch && query.afterSeq > highWater) throw new DomainError("validation", "Invalid activity snapshot high-water.");
  const afterSeq = Math.max(floor, sameEpoch ? query.afterSeq : floor);
  const rows = this.db.select().from(activityEvents).where(and(eq(activityEvents.projectId, query.projectId), eq(activityEvents.undoneByRestore, false), gt(activityEvents.seq, afterSeq), lte(activityEvents.seq, highWater), or(isNull(activityEvents.originClientId), ne(activityEvents.originClientId, query.originClientId)))).orderBy(asc(activityEvents.seq)).limit(query.limit + 1).all();
  let points: Set<string> | undefined;
  const events: ActivityChange[] = rows.slice(0, query.limit).map((row) => {
    const raw = toActivityEvent(row);
    const { before, after, ...event } = raw;
    const { subject, changes, toolCall } = summarizeActivity(raw);
    const cards = activityAffectedCards(event, before, after).map((card) => enrichActivityCard(this, card, query.projectId));
    const projectTargets = activityProjectTargets(raw);
    const changeSetId = event.action === "changeSet.applied" ? event.affectedEntityId : event.action === "changeSet.operation.applied" && after && typeof after === "object" && "changeSetId" in after && typeof after.changeSetId === "string" ? after.changeSetId : undefined;
    const changeSet = changeSetId ? this.getChangeSet(changeSetId) : undefined;
    const fileName = changeSet?.proposedBy?.actorType === "agent" || changeSet?.execution?.actor.actorType === "agent" ? changeSet.execution?.restorePoint : undefined;
    if (fileName) points ??= new Set(listRestorePoints(this.handle).map((point) => point.fileName));
    return { ...event, subject, changes, toolCall, seq: row.seq, ...(cards.length ? { cards } : {}), ...(event.action === "changeSet.operation.applied" ? { projectTargets } : {}), ...(fileName ? { restorePoint: { fileName, available: points!.has(fileName) } } : {}) };
  });
  return { epoch, floor, highWater, events, nextAfterSeq: rows.length > query.limit ? events.at(-1)!.seq : null };
}

function enrichActivityCard(repository: StoryMapperRepository<"transaction">, evidence: ActivityAffectedCard, projectId: string): ActivityAffectedCard {
  const card = repository.getCard(evidence.id);
  if (!card) {
    const exists = repository.db.select({ id: cards.id }).from(cards).where(eq(cards.id, evidence.id)).get();
    return { ...evidence, availability: exists ? "inaccessible" : "deleted" };
  }
  const map = repository.listStoryMaps(projectId).find((item) => item.id === card.storyMapId);
  if (!map) return { ...evidence, availability: "inaccessible" };
  return { ...evidence, navigation: { key: card.key, storyMapId: map.id, mapName: map.name, availability: isCardArchived(card) ? "archived" : "available" } };
}

function finalizeActivityCardVersion(repository: StoryMapperRepository<"transaction">, affectedEntityType: string, affectedEntityId: string, after: unknown, eventId: string): void {
    if (affectedEntityType === "card" && after && typeof after === "object" && "version" in after) {
      const afterSnapshot = { ...after };
      repository.context.transaction!.beforeCommit.push(() => {
        const card = repository.db.select().from(cards).where(eq(cards.id, affectedEntityId)).get();
        const version = card?.version ?? repository.db.select().from(cardVersions).where(eq(cardVersions.cardId, affectedEntityId)).orderBy(desc(cardVersions.version)).get()!.version;
        repository.db.update(activityEvents).set({ afterSchemaVersion: 1, afterJson: JSON.stringify({ ...afterSnapshot, version }) }).where(eq(activityEvents.id, eventId)).run();
      });
    }
}
