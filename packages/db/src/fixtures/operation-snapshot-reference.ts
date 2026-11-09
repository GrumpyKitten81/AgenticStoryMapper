import { createHash } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { DomainError, type OperationSnapshot } from "@storymapper/contracts";
import { projectGitHubRefs } from "@storymapper/core";
import * as tables from "@storymapper/db/schema";
import * as rows from "@storymapper/db/repositories/row-mappers";
import { attachedGithubEvidenceForCards } from "@storymapper/db/repositories/source-evidence-repository";
import { storyMapCopyRows } from "@storymapper/db/repositories/map-copy-repository";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

export function referenceOperationSnapshot(this: StoryMapperRepository, projectId: string): OperationSnapshot {
  const projects = this.listProjects().filter((project) => project.id === projectId);
  if (!projects.length) throw new DomainError("not_found", "Project not found.");
  const storyMaps = this.listStoryMaps(projectId);
  const mapIds = new Set(storyMaps.map((row) => row.id));
  const cards = this.db.select().from(tables.cards).orderBy(sql`rowid`).all().filter((row) => mapIds.has(row.storyMapId)).map(rows.toCard);
  const cardIds = new Set(cards.map((row) => row.id));
  const releases = this.db.select().from(tables.releases).all().filter((row) => mapIds.has(row.storyMapId)).map(rows.toRelease);
  const releaseIds = new Set(releases.map((row) => row.id));
  const roadmaps = this.db.select().from(tables.roadmaps).where(eq(tables.roadmaps.projectId, projectId)).all().filter((row) => !row.storyMapId || mapIds.has(row.storyMapId)).map(rows.toRoadmap);
  const roadmapIds = new Set(roadmaps.map((row) => row.id));
  const roadmapCards = this.db.select().from(tables.roadmapCards).all().filter((row) => roadmapIds.has(row.roadmapId)).map(rows.toRoadmapCard);
  const roadmapCardIds = new Set(roadmapCards.map((row) => row.id));
  const { sourceDocuments, documentIds } = referenceSourceDocuments(this, projectId);
  const connections = this.listConnectorConnections(projectId);
  const connectionIds = new Set(connections.map((row) => row.id));
  const externalRefs = this.db.select().from(tables.externalRefs).all();
  const ownedRefs = externalRefs.filter((ref) => ref.entityType === "card" && cardIds.has(ref.entityId) || ref.entityType === "release" && releaseIds.has(ref.entityId));
  const evidence = attachedGithubEvidenceForCards(this as unknown as StoryMapperRepository<"transaction">, cardIds);
  const allMaps = this.db.select().from(tables.storyMaps).all();
  const retainedRefs = externalRefs.filter((ref) => !mapIds.has(ref.scopeId) && evidence.some((link) => link.externalRefId === ref.id) && allMaps.some((map) => map.id === ref.scopeId && map.projectId === projectId));
  const scopedRefs = externalRefs.filter((ref) => ref.scopeId === projectId || mapIds.has(ref.scopeId) || retainedRefs.some((retained) => retained.id === ref.id));
  const allRemoteLinks = referenceRemoteLinks(this, ownedRefs);
  const remoteWorkItemLinks = allRemoteLinks.filter((link) => connectionIds.has(link.connectionId));
  const scoped = (row: { projectId: string; storyMapId: string | null }) => row.projectId === projectId && (!row.storyMapId || mapIds.has(row.storyMapId));
  return {
    projectId, projects, storyMaps, cards, releases, roadmaps, roadmapCards, connections,
    retainedGithubRefProjects: Object.fromEntries(retainedRefs.map((ref) => [ref.id, projectId])),
    sourcePlanBaselines: storyMaps.flatMap((map) => this.listSourcePlanBaselines(map.id)),
    syncRuns: this.db.select().from(tables.syncRuns).all().filter((row) => connectionIds.has(row.connectionId)).map(rows.toSyncRun),
    syncConflicts: this.db.select().from(tables.syncConflicts).all().filter((row) => connectionIds.has(row.connectionId) && Boolean(row.cardId && cardIds.has(row.cardId))).map(rows.toSyncConflict),
    personas: this.db.select().from(tables.personas).all().filter(scoped).map(rows.toPersona),
    productContexts: this.db.select().from(tables.productContexts).all().filter(scoped).map(rows.toProductContext),
    workflowStatuses: this.db.select().from(tables.workflowStatuses).all().filter(scoped).map(rows.toWorkflowStatus),
    annotations: this.db.select().from(tables.annotations).all().filter(scoped).map(rows.toAnnotation),
    storyTemplates: this.db.select().from(tables.storyTemplates).all().filter(scoped).map(rows.toStoryTemplate),
    ...referenceRoadmapRows(this, roadmapIds, roadmapCardIds),
    attachments: this.db.select().from(tables.cardAttachments).all().filter((row) => cardIds.has(row.cardId)).map(rows.toCardAttachment),
    cardPersonas: this.db.select().from(tables.cardPersonas).all().filter((row) => cardIds.has(row.cardId)).map(rows.toCardPersonaLink),
    cardDependencies: this.db.select().from(tables.cardDependencies).all().filter((row) => cardIds.has(row.cardId) && cardIds.has(row.prerequisiteCardId)),
    cardAnnotations: this.db.select().from(tables.cardAnnotations).all().filter((row) => cardIds.has(row.cardId)).map(rows.toCardAnnotationLink),
    sourceDocuments,
    sourceChunks: this.db.select().from(tables.sourceChunks).all().filter((row) => documentIds.has(row.documentId)).map(rows.toSourceChunk),
    sourceLinks: [...this.db.select().from(tables.cardSourceLinks).all().filter((row) => cardIds.has(row.cardId)).map(rows.toCardSourceLink), ...evidence],
    githubLinks: projectGitHubRefs(scopedRefs, allRemoteLinks),
    remoteWorkItemLinks,
    externalRefs: scopedRefs,
    mapFingerprints: Object.fromEntries(storyMaps.map((map) => [map.id, referenceMapFingerprint(this, map.id)]))
  };
}

function referenceMapFingerprint(repository: StoryMapperRepository, storyMapId: string): string {
  const copyRows = storyMapCopyRows.call(repository, storyMapId);
  const referencedIds = copyRows.cardGithubEvidence!.map((ref) => ref.externalRefId as string);
  const cardIds = new Set(repository.listCards(storyMapId).map(({ id }) => id));
  const releaseIds = new Set(repository.listReleases(storyMapId).map(({ id }) => id));
  const refs = repository.db.select().from(tables.externalRefs).all();
  const ownedRefs = refs.filter((ref) => ref.entityType === "card" && cardIds.has(ref.entityId) || ref.entityType === "release" && releaseIds.has(ref.entityId));
  const remoteLinks = repository.db.select().from(tables.remoteWorkItemLinks).all().flatMap((row) => {
    const ref = ownedRefs.find((ref) => ref.id === row.externalRefId);
    return ref ? [rows.toRemoteWorkItemLink(row, ref)] : [];
  });
  return createHash("sha256").update(JSON.stringify({
    rows: copyRows,
    referencedGitHubRefs: referencedIds.length ? repository.db.select().from(tables.externalRefs)
      .where(inArray(tables.externalRefs.id, referencedIds)).orderBy(asc(tables.externalRefs.id)).all() : [],
    githubLinks: projectGitHubRefs(ownedRefs, remoteLinks),
    remoteLinks
  })).digest("hex");
}

function referenceRemoteLinks(repository: StoryMapperRepository, ownedRefs: typeof tables.externalRefs.$inferSelect[]) {
  const allRemoteLinks = repository.db.select().from(tables.remoteWorkItemLinks).all().flatMap((row) => {
    const ref = ownedRefs.find((ref) => ref.id === row.externalRefId);
    return ref ? [rows.toRemoteWorkItemLink(row, ref)] : [];
  });
  return allRemoteLinks;
}

function referenceRoadmapRows(repository: StoryMapperRepository, roadmapIds: Set<string>, roadmapCardIds: Set<string>) {
  return {
    roadmapColumns: repository.db.select().from(tables.roadmapColumns).all().filter((row) => roadmapIds.has(row.roadmapId)).map(rows.toRoadmapColumn),
    roadmapSwimlanes: repository.db.select().from(tables.roadmapSwimlanes).all().filter((row) => roadmapIds.has(row.roadmapId)).map(rows.toRoadmapSwimlane),
    roadmapReferences: repository.db.select().from(tables.roadmapReferences).all().filter((row) => roadmapCardIds.has(row.roadmapCardId)).map(rows.toRoadmapReference),
  };
}

function referenceSourceDocuments(repository: StoryMapperRepository, projectId: string) {
  const sourceDocuments = repository.db.select().from(tables.sourceDocuments).where(eq(tables.sourceDocuments.projectId, projectId)).all().map(rows.toSourceDocument);
  const documentIds = new Set(sourceDocuments.map((row) => row.id));
  return { sourceDocuments, documentIds };
}
