import { projectGitHubRefs } from "@storymapper/core";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { DomainError, type OperationSnapshot } from "@storymapper/contracts";
import * as tables from "@storymapper/db/schema";
import * as rows from "@storymapper/db/repositories/row-mappers";
import { attachedGithubEvidenceForCards } from "@storymapper/db/repositories/source-evidence-repository";
import { mapFingerprint } from "@storymapper/db/repositories/map-copy-repository";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

function snapshotScope(repository: StoryMapperRepository, projectId: string) {
  const db = repository.db;
  const maps = db.select({ id: tables.storyMaps.id }).from(tables.storyMaps).where(and(eq(tables.storyMaps.projectId, projectId), eq(tables.storyMaps.deleted, false)));
  const owned = (table: { projectId: AnySQLiteColumn; storyMapId: AnySQLiteColumn }) =>
    and(eq(table.projectId, projectId), or(isNull(table.storyMapId), eq(table.storyMapId, ""), inArray(table.storyMapId, maps)));
  const cards = db.select({ id: tables.cards.id }).from(tables.cards).where(inArray(tables.cards.storyMapId, maps));
  const releases = db.select({ id: tables.releases.id }).from(tables.releases).where(inArray(tables.releases.storyMapId, maps));
  const roadmaps = db.select({ id: tables.roadmaps.id }).from(tables.roadmaps).where(owned(tables.roadmaps));
  const roadmapCards = db.select({ id: tables.roadmapCards.id }).from(tables.roadmapCards).where(inArray(tables.roadmapCards.roadmapId, roadmaps));
  const documents = db.select({ id: tables.sourceDocuments.id }).from(tables.sourceDocuments).where(eq(tables.sourceDocuments.projectId, projectId));
  const connections = db.select({ id: tables.connectorConnections.id }).from(tables.connectorConnections).where(eq(tables.connectorConnections.projectId, projectId));
  return { maps, cards, releases, roadmaps, roadmapCards, documents, connections, owned };
}

function removedMapCustomizationReferences(repository: StoryMapperRepository, projectId: string) {
  const db = repository.db;
  const personas = db.selectDistinct({ id: tables.personas.id }).from(tables.personas).innerJoin(tables.cardPersonas, eq(tables.cardPersonas.personaId, tables.personas.id)).innerJoin(tables.cards, eq(tables.cards.id, tables.cardPersonas.cardId)).innerJoin(tables.storyMaps, eq(tables.storyMaps.id, tables.cards.storyMapId)).where(and(eq(tables.personas.projectId, projectId), eq(tables.storyMaps.deleted, true))).all().map((row) => row.id);
  const annotations = db.selectDistinct({ id: tables.annotations.id }).from(tables.annotations).innerJoin(tables.cardAnnotations, eq(tables.cardAnnotations.annotationId, tables.annotations.id)).innerJoin(tables.cards, eq(tables.cards.id, tables.cardAnnotations.cardId)).innerJoin(tables.storyMaps, eq(tables.storyMaps.id, tables.cards.storyMapId)).where(and(eq(tables.annotations.projectId, projectId), eq(tables.storyMaps.deleted, true))).all().map((row) => row.id);
  return personas.length || annotations.length ? { removedMapCustomizationReferences: { personas, annotations } } : {};
}

export function getOperationSnapshot(this: StoryMapperRepository, projectId: string): OperationSnapshot {
  const projects = this.db.select().from(tables.projects).where(and(eq(tables.projects.id, projectId), eq(tables.projects.historicalStub, false))).all().map(rows.toProject);
  if (!projects.length) throw new DomainError("not_found", "Project not found.");
  const scope = snapshotScope(this, projectId);
  const storyMaps = this.listStoryMaps(projectId);
  const cards = this.db.select().from(tables.cards).where(inArray(tables.cards.storyMapId, scope.maps)).orderBy(sql`rowid`).all().map(rows.toCard);
  const releases = this.db.select().from(tables.releases).where(inArray(tables.releases.storyMapId, scope.maps)).orderBy(sql`rowid`).all().map(rows.toRelease);
  const roadmaps = this.db.select().from(tables.roadmaps).where(scope.owned(tables.roadmaps)).orderBy(sql`rowid`).all().map(rows.toRoadmap);
  const roadmapCards = this.db.select().from(tables.roadmapCards).where(inArray(tables.roadmapCards.roadmapId, scope.roadmaps)).orderBy(sql`rowid`).all().map(rows.toRoadmapCard);
  const sourceDocuments = this.db.select().from(tables.sourceDocuments).where(eq(tables.sourceDocuments.projectId, projectId)).all().map(rows.toSourceDocument);
  const connections = this.listConnectorConnections(projectId);
  const evidence = attachedGithubEvidenceForCards(this as unknown as StoryMapperRepository<"transaction">, scope.cards);
  const retainedRefs = this.db.select({ ref: tables.externalRefs, projectId: tables.storyMaps.projectId }).from(tables.externalRefs)
    .innerJoin(tables.storyMaps, eq(tables.storyMaps.id, tables.externalRefs.scopeId))
    .where(and(eq(tables.storyMaps.projectId, projectId), eq(tables.storyMaps.deleted, true), inArray(tables.externalRefs.id, evidence.map((link) => link.externalRefId)))).all();
  const scopedRefs = this.db.select().from(tables.externalRefs).where(or(eq(tables.externalRefs.scopeId, projectId), inArray(tables.externalRefs.scopeId, scope.maps), inArray(tables.externalRefs.id, retainedRefs.map(({ ref }) => ref.id)))).orderBy(sql`${tables.externalRefs}.rowid`).all();
  return {
    projectId, projects, storyMaps, cards, releases, roadmaps, roadmapCards, connections,
    retainedGithubRefProjects: Object.fromEntries(retainedRefs.map(({ ref, projectId }) => [ref.id, projectId])),
    ...removedMapCustomizationReferences(this, projectId),
    sourcePlanBaselines: storyMaps.flatMap((map) => this.listSourcePlanBaselines(map.id)),
    syncRuns: this.db.select().from(tables.syncRuns).where(inArray(tables.syncRuns.connectionId, scope.connections)).orderBy(sql`rowid`).all().map(rows.toSyncRun),
    syncConflicts: this.db.select().from(tables.syncConflicts).where(and(inArray(tables.syncConflicts.connectionId, scope.connections), inArray(tables.syncConflicts.cardId, scope.cards))).orderBy(sql`rowid`).all().map(rows.toSyncConflict),
    personas: this.db.select().from(tables.personas).where(scope.owned(tables.personas)).orderBy(sql`rowid`).all().map(rows.toPersona),
    productContexts: this.db.select().from(tables.productContexts).where(scope.owned(tables.productContexts)).orderBy(sql`rowid`).all().map(rows.toProductContext),
    workflowStatuses: this.db.select().from(tables.workflowStatuses).where(scope.owned(tables.workflowStatuses)).orderBy(sql`rowid`).all().map(rows.toWorkflowStatus),
    annotations: this.db.select().from(tables.annotations).where(scope.owned(tables.annotations)).orderBy(sql`rowid`).all().map(rows.toAnnotation),
    storyTemplates: this.db.select().from(tables.storyTemplates).where(scope.owned(tables.storyTemplates)).orderBy(sql`rowid`).all().map(rows.toStoryTemplate),
    roadmapColumns: this.db.select().from(tables.roadmapColumns).where(inArray(tables.roadmapColumns.roadmapId, scope.roadmaps)).orderBy(sql`rowid`).all().map(rows.toRoadmapColumn),
    roadmapSwimlanes: this.db.select().from(tables.roadmapSwimlanes).where(inArray(tables.roadmapSwimlanes.roadmapId, scope.roadmaps)).orderBy(sql`rowid`).all().map(rows.toRoadmapSwimlane),
    roadmapReferences: this.db.select().from(tables.roadmapReferences).where(inArray(tables.roadmapReferences.roadmapCardId, scope.roadmapCards)).orderBy(sql`rowid`).all().map(rows.toRoadmapReference),
    attachments: this.db.select().from(tables.cardAttachments).where(inArray(tables.cardAttachments.cardId, scope.cards)).orderBy(sql`rowid`).all().map(rows.toCardAttachment),
    cardPersonas: this.db.select().from(tables.cardPersonas).where(inArray(tables.cardPersonas.cardId, scope.cards)).orderBy(sql`rowid`).all().map(rows.toCardPersonaLink),
    cardDependencies: this.db.select().from(tables.cardDependencies).where(and(inArray(tables.cardDependencies.cardId, scope.cards), inArray(tables.cardDependencies.prerequisiteCardId, scope.cards))).orderBy(sql`rowid`).all(),
    cardAnnotations: this.db.select().from(tables.cardAnnotations).where(inArray(tables.cardAnnotations.cardId, scope.cards)).orderBy(sql`rowid`).all().map(rows.toCardAnnotationLink),
    sourceDocuments,
    sourceChunks: this.db.select().from(tables.sourceChunks).where(inArray(tables.sourceChunks.documentId, scope.documents)).orderBy(sql`rowid`).all().map(rows.toSourceChunk),
    // DESIGN: Keep physical attachments even when canonical ownership hides them in public projections.
    sourceLinks: [...this.db.select().from(tables.cardSourceLinks).where(inArray(tables.cardSourceLinks.cardId, scope.cards)).orderBy(sql`rowid`).all().map(rows.toCardSourceLink), ...evidence],
    githubLinks: projectGitHubRefs(scopedRefs, storyMaps.flatMap((map) => this.listRemoteWorkItemLinksForStoryMap(map.id))),
    remoteWorkItemLinks: this.db.select({ state: tables.remoteWorkItemLinks, ref: tables.externalRefs }).from(tables.remoteWorkItemLinks)
      .innerJoin(tables.externalRefs, eq(tables.remoteWorkItemLinks.externalRefId, tables.externalRefs.id))
      .where(and(inArray(tables.remoteWorkItemLinks.connectionId, scope.connections), inArray(tables.externalRefs.scopeId, scope.maps)))
      .orderBy(sql`${tables.remoteWorkItemLinks}.rowid`).all().map(({ state, ref }) => rows.toRemoteWorkItemLink(state, ref)),
    externalRefs: scopedRefs,
    mapFingerprints: Object.fromEntries(storyMaps.map((map) => [map.id, mapFingerprint.call(this, map.id)]))
  };
}
