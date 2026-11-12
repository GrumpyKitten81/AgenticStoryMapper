import { isCardArchived } from "@storymapper/core/story-map/github-status";
import { isWorkItemProvider } from "@storymapper/contracts";
import { affectedGithubCards, finalizeEvidenceCards } from "@storymapper/db/repositories/source-evidence-repository";
import { toCard } from "@storymapper/db/repositories/row-mappers";
import { createHash } from "node:crypto";
import { stripGitHubIssueFooter } from "@storymapper/core";
import { and, eq, getTableColumns } from "drizzle-orm";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import type { Card, ChangeSetResolution, ResolvedEntityChange } from "@storymapper/contracts";
import * as tables from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { operationAuditChanges } from "@storymapper/db/repositories/operation-audit-projection";
import { trackLiveActivity, trackLiveRoot, type LiveRoot } from "@storymapper/db/live-change-tracking";

const ENTITY_TABLES = {
  sourcePlanBaseline: tables.sourcePlanBaselines, syncRun: tables.syncRuns, syncConflict: tables.syncConflicts, connection: tables.connectorConnections, storyMap: tables.storyMaps, release: tables.releases, persona: tables.personas,
  card: tables.cards, productContext: tables.productContexts, workflowStatus: tables.workflowStatuses, annotation: tables.annotations,
  storyTemplate: tables.storyTemplates, roadmap: tables.roadmaps, roadmapColumn: tables.roadmapColumns,
  roadmapSwimlane: tables.roadmapSwimlanes, roadmapCard: tables.roadmapCards, roadmapReference: tables.roadmapReferences,
  sourceDocument: tables.sourceDocuments, sourceChunk: tables.sourceChunks,
  sourceLink: tables.cardSourceLinks, attachment: tables.cardAttachments, cardPersona: tables.cardPersonas,
  cardDependency: tables.cardDependencies, cardAnnotation: tables.cardAnnotations, remoteWorkItemLink: tables.remoteWorkItemLinks, externalRef: tables.externalRefs
} satisfies Record<ResolvedEntityChange["entity"], AnySQLiteTable>;
export const PERSISTENCE_ENTITY_ORDER = [
  "sourcePlanBaseline", "syncRun", "syncConflict", "connection", "storyMap", "release", "persona", "card", "productContext",
  "workflowStatus", "annotation", "storyTemplate", "roadmap", "roadmapColumn", "roadmapSwimlane", "roadmapCard", "roadmapReference",
  "sourceDocument", "sourceChunk", "externalRef", "sourceLink", "attachment", "cardPersona", "cardDependency", "cardAnnotation", "remoteWorkItemLink"
] as const satisfies readonly ResolvedEntityChange["entity"][];
const ENTITY_ORDER_RANKS = new Map<ResolvedEntityChange["entity"], number>(PERSISTENCE_ENTITY_ORDER.map((entity, index) => [entity, index]));
if (ENTITY_ORDER_RANKS.size !== PERSISTENCE_ENTITY_ORDER.length || ENTITY_ORDER_RANKS.size !== Object.keys(ENTITY_TABLES).length) throw new Error("Persistence order must contain every entity exactly once.");
export const OPERATION_ROOTS = { storyMap: "storyMaps", card: "cards", release: "releases", persona: "personas", roadmap: "roadmaps" } as const;
const JSON_FIELDS: Record<string, readonly string[]> = { storyMap: ["epicContext", "colorCategoryNames"], sourcePlanBaseline: ["entries", "releases"], syncConflict: ["localValue", "remoteValue"], persona: ["goals", "pains"], productContext: ["keyFeatures"], roadmapCard: ["labels"], connection: ["statusSource", "statusCatalogs", "statusMapping", "typeMapping", "issueTypeMapping"], remoteWorkItemLink: ["statusEvidence", "labels", "managedLabels", "baseline"] };

export function persistOperationResolution(this: StoryMapperRepository<"transaction">, resolution: ChangeSetResolution, projectId: string, changeSetId?: string): void {
  this.assertWritable();
  const { keys, counters } = allocateCardKeys(this, resolution);
  for (const operation of resolution.operations) {
    for (const change of operation.changes) if (change.entity === "card" && keys.has(change.entityId)) {
      if (change.before) change.before.key = keys.get(change.entityId)!;
      if (change.after) change.after.key = keys.get(change.entityId)!;
    }
    for (const change of operation.changes) if (operation.kind === "set:remoteWorkItemLink" && change.entity === "remoteWorkItemLink" && change.after?.cardId && !change.before && keys.has(change.after.cardId)) {
      const card = resolution.state.cards.find((row) => row.id === change.after!.cardId)!;
      const map = resolution.state.storyMaps.find((row) => row.id === card.storyMapId)!;
      change.after.bodyHash = createHash("sha256").update(stripGitHubIssueFooter(card.description)).digest("hex");
    }
    for (const change of operation.changes) if (change.entity === "sourcePlanBaseline") {
      for (const baseline of [change.before, change.after]) if (baseline) for (const entry of baseline.entries) if (keys.has(entry.cardId)) {
        entry.identity.key = keys.get(entry.cardId)!;
        if (entry.card) entry.card.key = keys.get(entry.cardId)!;
      }
    }
    const references = operation.changes.filter((change) => change.entity === "externalRef" && isWorkItemProvider(change.before?.system));
    const retainedEvidenceCards = new Map(references.flatMap((change) => affectedGithubCards(this, change.entityId)).filter((id) => !resolution.state.cards.some((card) => card.id === id)).flatMap((id) => {
      const row = this.db.select().from(tables.cards).where(eq(tables.cards.id, id)).get();
      return row && !operation.changes.some((change) => change.entity === "card" && change.entityId === id && !change.after) ? [[id, toCard(row)] as const] : [];
    }));
    for (const change of references) if (!change.after && change.entity === "externalRef" && change.before!.entityType !== "persona" && operation.changes.some((owner) => owner.entity === change.before!.entityType && owner.entityId === change.before!.entityId && !owner.after)) {
      const ref = change.before!;
      this.logActivity(projectId, "externalRef.deleted", "externalRef", ref.id, ref, { reason: "entity-deleted", projectId, storyMapId: ref.scopeId, entityType: ref.entityType, entityId: ref.entityId, before: ref });
    }
    persistChanges(this, operation.changes);
    for (const change of operation.changes) if (change.entity === "syncConflict" && !change.after && change.before?.status === "open") {
      const conflict = change.before;
      const membership = operation.changes.find((entry) => entry.entity === "remoteWorkItemLink" && !entry.after && entry.before?.cardId === conflict.cardId && entry.before?.connectionId === conflict.connectionId && entry.before?.remoteId === conflict.remoteId);
      if (membership?.entity === "remoteWorkItemLink" && membership.before) this.logActivity(projectId, "syncConflict.retired", "syncConflict", change.entityId, conflict, { reason: "identity-changed", externalRefId: membership.before.externalRefId });
    }
    finalizeEvidenceCards(this, [...retainedEvidenceCards.keys()]);
    for (const change of operation.changes) trackLiveActivity(this.db, this.context.transaction!, projectId, change.entity === "attachment" ? "cardAttachment" : change.entity, change.entityId, change.before, change.after);
    if (changeSetId) this.logActivity(projectId, "changeSet.operation.applied", "changeSet", operation.operationId, undefined, { changeSetId, operationId: operation.operationId, index: operation.index, kind: operation.kind, status: operation.status, changes: operationAuditChanges(operation.changes) });
    else for (const change of operation.changes) {
      if (change.entity === "card") this.logActivity(projectId, !change.after ? "card.deleted" : change.before?.parentId !== change.after.parentId ? "card.rehomed" : "card.updated", "card", change.entityId, change.before, change.after);
      if (change.entity === "cardDependency" && !change.after) this.logActivity(projectId, "card.dependency.unset", "cardDependency", change.entityId, change.before);
    }
  }
  for (const [mapId, nextCardNumber] of counters) this.db.update(tables.storyMaps).set({ nextCardNumber }).where(eq(tables.storyMaps.id, mapId)).run();
  for (const card of resolution.state.cards) if (keys.has(card.id)) card.key = keys.get(card.id)!;
  for (const baseline of resolution.state.sourcePlanBaselines ?? []) for (const entry of baseline.entries) if (keys.has(entry.cardId)) {
    entry.identity.key = keys.get(entry.cardId)!;
    if (entry.card) entry.card.key = keys.get(entry.cardId)!;
  }
}

function allocateCardKeys(repository: StoryMapperRepository<"transaction">, resolution: ChangeSetResolution) {
  const changes = resolution.operations.flatMap((operation) => operation.changes);
  const maps = new Map(repository.db.select({ id: tables.storyMaps.id, cardKeyPrefix: tables.storyMaps.cardKeyPrefix, nextCardNumber: tables.storyMaps.nextCardNumber }).from(tables.storyMaps).all().map((map) => [map.id, map]));
  const counters = new Map<string, number>();
  const keys = new Map<string, string>();
  for (const change of changes) if (change.entity === "storyMap") {
    const map = change.after ?? change.before!;
    if (!maps.has(map.id)) maps.set(map.id, { id: map.id, cardKeyPrefix: map.cardKeyPrefix, nextCardNumber: 1 });
  }
  for (const change of changes) {
    if (change.entity !== "card" || !change.after || change.before || change.after.key.startsWith("NEW-")) continue;
    const number = Number.parseInt(change.after.key.split("-").at(-1)!, 10);
    if (Number.isFinite(number)) counters.set(change.after.storyMapId, Math.max(counters.get(change.after.storyMapId) ?? maps.get(change.after.storyMapId)!.nextCardNumber, number + 1));
  }
  for (const change of changes) {
    if (change.entity === "storyMap" && change.after) {
      const map = maps.get(change.entityId)!;
      maps.set(change.entityId, { ...map, cardKeyPrefix: change.after.cardKeyPrefix });
    }
    if (change.entity !== "card" || !change.after || change.before || !change.after.key.startsWith("NEW-")) continue;
    const map = maps.get(change.after.storyMapId)!;
    const number = counters.get(map.id) ?? map.nextCardNumber;
    counters.set(map.id, number + 1);
    keys.set(change.entityId, `${map.cardKeyPrefix}-${number}`);
  }
  return { keys, counters };
}

function persistChanges(repository: StoryMapperRepository<"transaction">, changes: ResolvedEntityChange[]): void {
  const removedMaps = new Set(changes.filter((change) => change.entity === "storyMap" && !change.after).map((change) => change.entityId));
  const retainedByMap = (change: ResolvedEntityChange) => change.before && "storyMapId" in change.before && Boolean(change.before.storyMapId && removedMaps.has(change.before.storyMapId));
  const deletes = changes.filter((change) => !change.after && !retainedByMap(change));
  for (const change of deletes) if (change.entity === "card") {
    repository.writeCardVersion({ ...change.before! });
    repository.db.delete(tables.cardReviewRecords).where(eq(tables.cardReviewRecords.cardId, change.entityId)).run();
    repository.db.delete(tables.syncConflicts).where(eq(tables.syncConflicts.cardId, change.entityId)).run();
    repository.db.delete(tables.cardGithubEvidence).where(eq(tables.cardGithubEvidence.cardId, change.entityId)).run();
  }
  for (const change of changes.filter((change) => change.after && !change.before).sort((a, b) => entityOrder(a.entity) - entityOrder(b.entity))) persistEntity(repository, change);
  for (const change of changes.filter((change) => change.after && change.before).sort((a, b) => entityOrder(a.entity) - entityOrder(b.entity))) persistEntity(repository, change);
  for (const change of deletes.sort((a, b) => entityOrder(b.entity) - entityOrder(a.entity))) persistEntity(repository, change);
  const dependencyOwners = new Set(changes.flatMap((change) => change.entity === "cardDependency" ? [(change.after ?? change.before!).cardId] : []));
  for (const change of changes) if (change.entity === "card" && change.after && (!change.before || change.after.version !== change.before.version)) repository.writeCardVersion(change.after, Boolean(change.before && !dependencyOwners.has(change.entityId) && canCoalesceCardSave(change.before, change.after)), dependencyOwners.has(change.entityId));
  for (const cardId of dependencyOwners) {
    const card = repository.getCard(cardId);
    if (card) repository.db.update(tables.cardVersions).set({ dependencyChange: true }).where(and(eq(tables.cardVersions.cardId, cardId), eq(tables.cardVersions.version, card.version))).run();
  }
}

function canCoalesceCardSave(before: Card, after: Card): boolean {
  const structuralFields = ["storyMapId", "parentId", "releaseId", "level", "parked", "position"] as const;
  return isCardArchived(before) === isCardArchived(after)
    && structuralFields.every((key) => before[key] === after[key]);
}

function entityOrder(entity: ResolvedEntityChange["entity"]): number {
  const rank = ENTITY_ORDER_RANKS.get(entity);
  if (rank === undefined) throw new Error(`Persistence order is missing entity ${entity}.`);
  return rank;
}

function persistEntity(repository: StoryMapperRepository<"transaction">, change: ResolvedEntityChange): void {
  if (change.entity === "sourceLink") { persistSourceLink(repository, change); return; }
  const table = ENTITY_TABLES[change.entity];
  const columns = getTableColumns(table);
  if (!change.after) {
    if (change.entity in OPERATION_ROOTS) repository.bumpRootVersion(OPERATION_ROOTS[change.entity as keyof typeof OPERATION_ROOTS], change.entityId);
    if (change.entity === "storyMap") repository.db.update(tables.storyMaps).set({ deleted: true }).where(eq(tables.storyMaps.id, change.entityId)).run();
    else repository.db.delete(table).where(eq(columns.id!, change.entityId)).run();
    return;
  }
  const value = encodeRow(change);
  if (change.before) repository.db.update(table).set(value).where(eq(columns.id!, change.entityId)).run();
  else repository.db.insert(table).values(value).run();
  if (change.entity in OPERATION_ROOTS) {
    const root = change.entity as keyof typeof OPERATION_ROOTS;
    const transaction = repository.context.transaction!;
    (change.before ? transaction.bumpedRoots : transaction.createdRoots).add(`${OPERATION_ROOTS[root]}:${change.entityId}`);
    trackLiveRoot(repository.db, transaction, root as LiveRoot, change.entityId);
  }
}

function encodeRow(change: ResolvedEntityChange): Record<string, unknown> & { id: string } {
  const row: Record<string, unknown> = { ...change.after };
  for (const field of JSON_FIELDS[change.entity] ?? []) {
    if (field === "colorCategoryNames" && row[field] && !Object.keys(row[field] as object).length) delete row[field];
    row[`${field}Json`] = JSON.stringify(field === "managedLabels" ? row[field] ?? [] : field === "epicContext" ? row[field] ?? undefined : row[field]) ?? null;
    if (change.entity !== "sourcePlanBaseline") row[`${field}SchemaVersion`] = row[`${field}Json`] === null ? null : 1;
    delete row[field];
  }
  if (change.entity === "card" && !change.before) { row.creationSource = "changeset"; row.archived ??= false; }
  const columns = getTableColumns(ENTITY_TABLES[change.entity]);
  return Object.fromEntries(Object.keys(columns).filter((key) => key in row || Boolean(change.before && !["deleted", "creationSource", "nextCardNumber"].includes(key))).map((key) => [key, row[key] ?? null])) as Record<string, unknown> & { id: string };
}

function persistSourceLink(repository: StoryMapperRepository<"transaction">, change: Extract<ResolvedEntityChange, { entity: "sourceLink" }>): void {
  const link = change.after ?? change.before!;
  if (link.kind === "github") {
    if (link.id === link.externalRefId) return;
    if (!change.after) repository.db.delete(tables.cardGithubEvidence).where(eq(tables.cardGithubEvidence.id, link.id)).run();
    else if (!change.before) repository.db.insert(tables.cardGithubEvidence).values({ id: link.id, cardId: link.cardId, externalRefId: link.externalRefId }).run();
    return;
  }
  if (!change.after) repository.db.delete(tables.cardSourceLinks).where(eq(tables.cardSourceLinks.id, link.id)).run();
  else {
    const row = { id: link.id, cardId: link.cardId, kind: link.kind, chunkId: link.kind === "chunk" ? link.chunkId : null, confidence: link.kind === "chunk" ? link.confidence : null, note: link.kind === "note" ? link.note : null, createdAt: link.createdAt };
    if (change.before) repository.db.update(tables.cardSourceLinks).set(row).where(eq(tables.cardSourceLinks.id, link.id)).run();
    else repository.db.insert(tables.cardSourceLinks).values(row).run();
  }
}
