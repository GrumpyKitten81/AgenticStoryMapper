import type { LiveEntity } from "@storymapper/contracts";
import type { SqliteDatabase } from "@storymapper/db/connection";
import type { LiveTransactionState } from "@storymapper/db/live-events";

const ROOT_TABLES = { card: "cards", storyMap: "story_maps", release: "releases", persona: "personas", roadmap: "roadmaps" } as const;
export type LiveRoot = keyof typeof ROOT_TABLES;

interface RootRow { version: number; project_id: string; }

function readRoot(database: SqliteDatabase, entityType: LiveRoot, entityId: string): RootRow | undefined {
  const table = ROOT_TABLES[entityType];
  const project = entityType === "card" || entityType === "release" ? "(SELECT project_id FROM story_maps WHERE story_maps.id = root.story_map_id)" : "root.project_id";
  return database.$client.prepare(`SELECT version, ${project} AS project_id FROM ${table} root WHERE id = ?`).get(entityId) as RootRow | undefined;
}

export function trackLiveRoot(database: SqliteDatabase, state: LiveTransactionState, entityType: LiveRoot, entityId: string): void {
  const root = readRoot(database, entityType, entityId);
  if (!root) return;
  state.hasBusinessActivity = true;
  state.liveEntities.set(`${entityType}:${entityId}`, { entityType, entityId, version: root.version, projectId: root.project_id });
}

export function finalizeLiveRoots(database: SqliteDatabase, state: LiveTransactionState): void {
  for (const entity of state.liveEntities.values()) {
    if (!Object.hasOwn(ROOT_TABLES, entity.entityType)) continue;
    const root = readRoot(database, entity.entityType as LiveRoot, entity.entityId);
    if (root) { entity.version = root.version; entity.projectId = root.project_id; }
  }
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function trackLiveActivity(database: SqliteDatabase, state: LiveTransactionState, projectId: string, entityType: string, entityId: string, before: unknown, after: unknown): void {
  state.hasBusinessActivity = true;
  if (Object.hasOwn(ROOT_TABLES, entityType)) {
    trackLiveRoot(database, state, entityType as LiveRoot, entityId);
    if (!state.liveEntities.has(`${entityType}:${entityId}`)) {
      const version = object(before).version;
      state.liveEntities.set(`${entityType}:${entityId}`, { entityType, entityId, projectId, version: typeof version === "number" ? version : null });
    }
    return;
  }
  const owner = { ...object(before), ...object(after) };
  let root: LiveRoot | undefined;
  let rootId: unknown;
  if (["cardDependency", "cardPersona", "cardAnnotation", "cardAttachment", "sourceLink"].includes(entityType)) { root = "card"; rootId = owner.cardId; }
  if (["productContext", "sourcePlanBaseline"].includes(entityType) && owner.storyMapId) { root = "storyMap"; rootId = owner.storyMapId; }
  if (["roadmapColumn", "roadmapSwimlane", "roadmapCard"].includes(entityType)) { root = "roadmap"; rootId = owner.roadmapId; }
  if (entityType === "roadmapReference" && typeof owner.roadmapCardId === "string") {
    root = "roadmap";
    rootId = (database.$client.prepare("SELECT roadmap_id FROM roadmap_cards WHERE id = ?").get(owner.roadmapCardId) as { roadmap_id: string } | undefined)?.roadmap_id;
  }
  if (root && typeof rootId === "string") { trackLiveRoot(database, state, root, rootId); return; }
  state.liveEntities.set(`${entityType}:${entityId}`, { entityType, entityId, projectId, version: null });
  if (["githubLink", "remoteWorkItemLink"].includes(entityType)) {
    for (const record of [object(before), object(after)]) {
      if (typeof record.cardId === "string") trackLiveRoot(database, state, "card", record.cardId);
      if (typeof record.releaseId === "string") trackLiveRoot(database, state, "release", record.releaseId);
    }
  }
}
