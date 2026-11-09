import { workItemProviderSchema } from "@storymapper/contracts";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { DomainError } from "@storymapper/contracts";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import * as tables from "@storymapper/db/schema";

const MAP_TABLES = {
  releases: tables.releases, cards: tables.cards, personas: tables.personas,
  workflowStatuses: tables.workflowStatuses, annotations: tables.annotations,
  storyTemplates: tables.storyTemplates, productContexts: tables.productContexts,
  roadmaps: tables.roadmaps
};
const CARD_TABLES = {
  cardDependencies: tables.cardDependencies, cardPersonas: tables.cardPersonas, cardAnnotations: tables.cardAnnotations,
  cardSourceLinks: tables.cardSourceLinks, cardAttachments: tables.cardAttachments,
  cardGithubEvidence: tables.cardGithubEvidence
};
const ROADMAP_TABLES = {
  roadmapColumns: tables.roadmapColumns, roadmapSwimlanes: tables.roadmapSwimlanes,
  roadmapCards: tables.roadmapCards
};
const ROOT_TABLES = new Set(["storyMaps", "cards", "releases", "personas", "roadmaps"]);
type StoredRow = Record<string, unknown> & { id: string };
type CopyRows = Record<string, StoredRow[]>;

export function storyMapCopyRows(this: StoryMapperRepository, storyMapId: string): CopyRows {
  this.getStoryMapOrThrow(storyMapId);
  const rows: CopyRows = { storyMaps: this.db.select().from(tables.storyMaps).where(eq(tables.storyMaps.id, storyMapId)).all() };
  for (const [name, table] of Object.entries(MAP_TABLES)) {
    rows[name] = this.db.select().from(table).where(eq(table.storyMapId, storyMapId)).orderBy(asc(table.id)).all();
  }
  const cardIds = rows.cards!.map((card) => card.id);
  rows.externalRefs = this.db.select().from(tables.externalRefs).where(and(eq(tables.externalRefs.scopeId, storyMapId), inArray(tables.externalRefs.system, workItemProviderSchema.options))).orderBy(asc(tables.externalRefs.id)).all();
  for (const [name, table] of Object.entries(CARD_TABLES)) {
    rows[name] = cardIds.length ? this.db.select().from(table).where(inArray(table.cardId, cardIds)).orderBy(asc(table.id)).all() : [];
  }
  const roadmapIds = rows.roadmaps!.map((roadmap) => roadmap.id);
  for (const [name, table] of Object.entries(ROADMAP_TABLES)) {
    rows[name] = roadmapIds.length ? this.db.select().from(table).where(inArray(table.roadmapId, roadmapIds)).orderBy(asc(table.id)).all() : [];
  }
  const roadmapCardIds = rows.roadmapCards!.map((card) => card.id);
  rows.roadmapReferences = roadmapCardIds.length ? this.db.select().from(tables.roadmapReferences).where(inArray(tables.roadmapReferences.roadmapCardId, roadmapCardIds)).orderBy(asc(tables.roadmapReferences.id)).all() : [];
  return rows;
}

export function mapFingerprint(this: StoryMapperRepository, storyMapId: string): string {
  const rows = storyMapCopyRows.call(this, storyMapId);
  const referencedIds = rows.cardGithubEvidence!.map((ref) => ref.externalRefId as string);
  return createHash("sha256").update(JSON.stringify({
    rows,
    referencedGitHubRefs: referencedIds.length ? this.db.select().from(tables.externalRefs)
      .where(inArray(tables.externalRefs.id, referencedIds)).orderBy(asc(tables.externalRefs.id)).all() : [],
    githubLinks: this.listGitHubLinksForStoryMap(storyMapId),
    remoteLinks: this.listRemoteWorkItemLinksForStoryMap(storyMapId)
  })).digest("hex");
}

export function storyMapInventory(this: StoryMapperRepository, storyMapId: string): Record<string, number> {
  return Object.fromEntries(Object.entries(storyMapCopyRows.call(this, storyMapId)).map(([name, rows]) => [name, rows.length]));
}

export function copyStoryMap(this: StoryMapperRepository<"transaction">, sourceStoryMapId: string, targetName: string, targetStoryMapId: string): void {
  this.assertWritable();
  const rows = storyMapCopyRows.call(this as unknown as StoryMapperRepository, sourceStoryMapId);
  const ids = new Map<string, string>(Object.values(rows).flat().map((row) => [row.id, randomUUID()]));
  ids.set(sourceStoryMapId, targetStoryMapId);
  const now = new Date().toISOString();
  const allTables: Record<string, AnySQLiteTable> = { storyMaps: tables.storyMaps, ...MAP_TABLES, externalRefs: tables.externalRefs, ...CARD_TABLES, ...ROADMAP_TABLES, roadmapReferences: tables.roadmapReferences };
  for (const [name, entries] of Object.entries(rows)) {
    for (const source of entries) {
      const row = cloneRow(source, ids, now);
      if (name === "storyMaps") row.name = targetName;
      if (name === "cards") { row.creationSource = "import"; row.creationOrigin = "inference"; row.provenance = "inference"; }
      this.db.insert(allTables[name]!).values(row).run();
      if (ROOT_TABLES.has(name)) this.createRootVersion(name as "storyMaps" | "cards" | "releases" | "personas" | "roadmaps", row.id);
    }
  }
  for (const source of rows.cards!) {
    const card = this.getCard(ids.get(source.id)!);
    if (!card) throw new DomainError("internal", "Copied Card is missing.");
    this.writeCardVersion(card);
    this.logActivity(rows.storyMaps![0]!.projectId as string, "card.created", "card", card.id, undefined, card);
  }
  this.logActivity(rows.storyMaps![0]!.projectId as string, "storyMap.copied", "storyMap", targetStoryMapId, { sourceStoryMapId }, this.getStoryMapSnapshot(targetStoryMapId));
}

function cloneRow(source: StoredRow, ids: Map<string, string>, now: string): StoredRow {
  const row: StoredRow = { ...source, id: ids.get(source.id)! };
  for (const [key, value] of Object.entries(row)) {
    if ((key.endsWith("Id") || key === "targetId") && typeof value === "string" && ids.has(value)) row[key] = ids.get(value)!;
  }
  if ("version" in row) row.version = 1;
  if ("syncedVersion" in row) row.syncedVersion = 1;
  if ("createdAt" in row) row.createdAt = now;
  if ("updatedAt" in row) row.updatedAt = now;
  return row;
}
