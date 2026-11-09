import { parseStoredJson } from "@storymapper/db/versioned-json";
import { captureInitialSourcePlanBinding } from "@storymapper/db/repositories/source-plan-baselines-repository";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { DomainError, isWorkItemProvider, workItemProviderSchema, externalRefDeletedEvidenceSchema, type ExternalRef, type ExternalRefEntityType, type ExternalRefDeletedEvidence } from "@storymapper/contracts";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { activityEvents, cards, externalRefs, personas, releases, storyMaps } from "@storymapper/db/schema";

type SetExternalRefInput = { entityType: ExternalRefEntityType; entityId: string; system: string; externalId: string };

export function setExternalRef(this: StoryMapperRepository<"transaction">, input: SetExternalRefInput): { ref: ExternalRef; status: "created" | "unchanged" } {
  this.assertWritable();
  if (isWorkItemProvider(input.system)) throw new DomainError("validation", "The github reference system is reserved.");
  const externalId = input.externalId.trim();
  if (!/^[a-z0-9-]+$/.test(input.system) || !externalId) throw new DomainError("validation", "External reference system and id are invalid.");
  const owner = resolveOwner(this, input.entityType, input.entityId);
  if (!owner) throw new DomainError("not_found", `${input.entityType} not found.`);
  const existing = this.db.select().from(externalRefs).where(and(
    eq(externalRefs.entityType, input.entityType),
    eq(externalRefs.entityId, input.entityId),
    eq(externalRefs.system, input.system)
  )).get();
  if (existing) {
    if (existing.externalId === externalId) return { ref: toExternalRef(existing), status: "unchanged" };
    throw new DomainError("conflict", "Entity already has a different external reference for this system.");
  }
  const scoped = this.db.select().from(externalRefs).where(and(
    eq(externalRefs.scopeId, owner.scopeId),
    eq(externalRefs.entityType, input.entityType),
    eq(externalRefs.system, input.system),
    eq(externalRefs.externalId, externalId)
  )).get();
  if (scoped) throw new DomainError("conflict", "External reference is already bound to another entity in this scope.");

  const ref: ExternalRef = {
    id: randomUUID(),
    entityType: input.entityType,
    entityId: input.entityId,
    system: input.system,
    externalId,
    scopeId: owner.scopeId,
    syncedVersion: owner.version,
    createdAt: new Date().toISOString()
  };
  try {
    this.db.insert(externalRefs).values(ref).run();
  } catch (error) {
    if ((error as { code?: string }).code !== "SQLITE_CONSTRAINT_UNIQUE") throw error;
    const raced = this.db.select().from(externalRefs).where(and(
      eq(externalRefs.entityType, input.entityType),
      eq(externalRefs.entityId, input.entityId),
      eq(externalRefs.system, input.system)
    )).get();
    if (raced?.externalId === externalId) return { ref: toExternalRef(raced), status: "unchanged" };
    throw new DomainError("conflict", "External reference is already bound.");
  }
  captureInitialSourcePlanBinding(this, ref);
  this.logActivity(owner.projectId, "externalRef.created", input.entityType, input.entityId, undefined, ref);
  return { ref, status: "created" };
}

export function listExternalRefsForStoryMap(this: StoryMapperRepository<"transaction">, storyMapId: string): ExternalRef[] {
  this.context.database;
  const map = this.db.select().from(storyMaps).where(eq(storyMaps.id, storyMapId)).get();
  if (!map) return [];
  const cardIds = this.db.select({ id: cards.id }).from(cards).where(eq(cards.storyMapId, storyMapId)).all().map((row) => row.id);
  const releaseIds = this.db.select({ id: releases.id }).from(releases).where(eq(releases.storyMapId, storyMapId)).all().map((row) => row.id);
  const personaIds = this.db.select({ id: personas.id }).from(personas).where(and(
    eq(personas.projectId, map.projectId),
    or(eq(personas.storyMapId, storyMapId), isNull(personas.storyMapId))
  )).all().map((row) => row.id);
  const refs = this.db.select().from(externalRefs).where(inArray(externalRefs.scopeId, [storyMapId, map.projectId])).all();
  const ids = {
    card: new Set(cardIds),
    release: new Set(releaseIds),
    persona: new Set(personaIds)
  };
  return refs.filter((ref) => ids[ref.entityType].has(ref.entityId)).map(toExternalRef);
}

export function listExternalRefsForPersonas(this: StoryMapperRepository<"transaction">, personaIds: string[]): ExternalRef[] {
  this.context.database;
  if (!personaIds.length) return [];
  return this.db.select().from(externalRefs).where(and(
    eq(externalRefs.entityType, "persona"),
    inArray(externalRefs.entityId, personaIds)
  )).all().map(toExternalRef);
}

export function deleteExternalRefsForEntity(this: StoryMapperRepository<"transaction">, entityType: ExternalRefEntityType, entityId: string): void {
  this.assertWritable();
  const refs = this.db.select().from(externalRefs).where(and(eq(externalRefs.entityType, entityType), eq(externalRefs.entityId, entityId))).all();
  for (const ref of refs) if (isWorkItemProvider(ref.system) && entityType !== "persona") {
    const owner = this.db.select().from(storyMaps).where(eq(storyMaps.id, ref.scopeId)).get()!;
    const evidence: ExternalRefDeletedEvidence = { reason: "entity-deleted", projectId: owner.projectId, storyMapId: ref.scopeId, entityType, entityId, before: ref };
    this.logActivity(owner.projectId, "externalRef.deleted", "externalRef", ref.id, ref, evidence);
  }
  this.db.delete(externalRefs).where(and(eq(externalRefs.entityType, entityType), eq(externalRefs.entityId, entityId))).run();
}

export function listDeletedGitHubRefs(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId?: string): ExternalRefDeletedEvidence[] {
  this.context.database;
  const deleted = this.db.select().from(activityEvents).where(and(eq(activityEvents.projectId, projectId), eq(activityEvents.action, "externalRef.deleted"), eq(activityEvents.undoneByRestore, false), isNotNull(activityEvents.afterJson), sql`json_extract(${activityEvents.afterJson}, '$.before.system') IN (${sql.join(workItemProviderSchema.options.map((provider) => sql`${provider}`), sql`, `)})`, ...(storyMapId ? [sql`json_extract(${activityEvents.afterJson}, '$.storyMapId') = ${storyMapId}`] : []))).all()
    .map((row) => externalRefDeletedEvidenceSchema.parse(parseStoredJson("activity_events", "after_json", row.afterJson!, row.afterSchemaVersion)))
    .filter((evidence) => !storyMapId || evidence.storyMapId === storyMapId);
  if (!deleted.length) return [];
  const live = this.db.select().from(externalRefs).where(and(inArray(externalRefs.system, workItemProviderSchema.options), inArray(externalRefs.scopeId, [...new Set(deleted.map((evidence) => evidence.before.scopeId))]))).all();
  return deleted.filter((evidence) => !live.some((ref) => ref.system === evidence.before.system && ref.scopeId === evidence.before.scopeId && ref.externalId === evidence.before.externalId));
}

function resolveOwner(repository: StoryMapperRepository<"transaction">, entityType: ExternalRefEntityType, entityId: string): { scopeId: string; projectId: string; version: number } | undefined {
  if (entityType === "persona") {
    const persona = repository.getPersona(entityId);
    return persona && { scopeId: persona.storyMapId ?? persona.projectId, projectId: persona.projectId, version: persona.version };
  }
  const entity = entityType === "card" ? repository.getCard(entityId) : repository.getRelease(entityId);
  return entity && { scopeId: entity.storyMapId, projectId: repository.getStoryMapOrThrow(entity.storyMapId).projectId, version: entity.version };
}

function toExternalRef(row: typeof externalRefs.$inferSelect): ExternalRef {
  return { ...row };
}
