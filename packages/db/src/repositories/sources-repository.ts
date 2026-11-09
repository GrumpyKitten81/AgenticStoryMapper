import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { DomainError } from "@storymapper/contracts";
import type { CardSourceLink, ChunkCardSourceLink, DeleteCardSourceLinkRequest, CreateCardSourceLinkRequest, CreateGitHubIssueDryRunRequest, CreateGitHubLinkRequest, GitHubIssueDryRun, GitHubLink, GitHubSyncHealthReport, PreparedSourceDocumentImport, SourceChunk, SourceDocument, SourceDocumentDetails, SourceDocumentSummaryData, UpdateGitHubLinkRequest } from "@storymapper/contracts";
import { preparedSourceDocumentImportSchema, createCardSourceLinkRequestSchema } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";
import { buildGitHubIssueBody } from "@storymapper/core";
import { buildPreparedSourceImport } from "@storymapper/core/sources/prepared-source-import";
import { compact, hashText, slugify } from "@storymapper/db/repositories/repository-values";
import { toSourceDocument, toSourceChunk, toCardSourceLink } from "@storymapper/db/repositories/row-mappers";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { cardGithubEvidence, cardSourceLinks, cards, releases, sourceChunks, sourceDocuments, storyMaps } from "@storymapper/db/schema";
import { createEvidence, deleteEvidence, githubEvidenceForCards, affectedGithubCards, finalizeEvidenceCards } from "@storymapper/db/repositories/source-evidence-repository";

export function importSourceDocument(this: StoryMapperRepository<"transaction">, input: PreparedSourceDocumentImport): { document: SourceDocument; chunks: SourceChunk[]; status: "imported" | "unchanged" } {
    this.assertWritable();
    const { parsedChunks } = preparedSourceDocumentImportSchema.parse(input);
    const existing = this.db.select().from(sourceDocuments).where(and(
      eq(sourceDocuments.projectId, input.projectId),
      eq(sourceDocuments.type, input.type),
      eq(sourceDocuments.fileHash, input.fileHash)
    )).get();
    if (existing) return unchangedSourceDocument(this, toSourceDocument(existing));

    const { document, chunks } = buildPreparedSourceImport({
      metadata: { projectId: input.projectId, title: input.title, type: input.type,
        filePath: input.filePath ?? `inline://${slugify(input.title)}`, fileHash: input.fileHash },
      documentId: randomUUID(), importedAt: new Date().toISOString(), hash: hashText,
      parsedChunks
    });

    try {
      this.db.insert(sourceDocuments).values(document).run();
      if (chunks.length > 0) this.db.insert(sourceChunks).values(chunks).run();
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "SQLITE_CONSTRAINT_UNIQUE") throw error;
      const duplicate = this.db.select().from(sourceDocuments).where(and(
        eq(sourceDocuments.projectId, input.projectId),
        eq(sourceDocuments.type, input.type),
        eq(sourceDocuments.fileHash, input.fileHash)
      )).get();
      if (!duplicate) throw error;
      return unchangedSourceDocument(this, toSourceDocument(duplicate));
    }
    this.logActivity(input.projectId, "sourceDocument.imported", "sourceDocument", document.id, undefined, {
      document,
      chunkCount: chunks.length
    });

    return { document, chunks, status: "imported" };
  }

function unchangedSourceDocument(repository: StoryMapperRepository<"transaction">, document: SourceDocument) {
  return { document, chunks: repository.getSourceDocumentDetails(document.id)!.chunks, status: "unchanged" as const };
}

export function listSourceDocumentSummaryData(this: StoryMapperRepository<"transaction">, projectId: string): SourceDocumentSummaryData[] {
    this.context.database;
    return this.db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.projectId, projectId))
      .orderBy(asc(sourceDocuments.importedAt))
      .all()
      .map((row) => this.getSourceDocumentSummaryData(toSourceDocument(row)));
  }

export function getSourceDocumentDetails(this: StoryMapperRepository<"transaction">, documentId: string): SourceDocumentDetails | undefined {
    this.context.database;
    const documentRow = this.db.select().from(sourceDocuments).where(eq(sourceDocuments.id, documentId)).get();
    if (!documentRow) {
      return undefined;
    }

    const document = toSourceDocument(documentRow);
    const chunks = this.db
      .select()
      .from(sourceChunks)
      .where(eq(sourceChunks.documentId, documentId))
      .orderBy(asc(sourceChunks.locator))
      .all()
      .map(toSourceChunk);
    const chunkIds = new Set(chunks.map((chunk) => chunk.id));
    const links = visibleSourceLinks(this, chunkIds);
    const linkedCardsByChunkId: SourceDocumentDetails["linkedCardsByChunkId"] = {};

    for (const link of links) {
      const card = this.getCard(link.cardId);
      if (!card) continue;
      linkedCardsByChunkId[link.chunkId] = [
        ...(linkedCardsByChunkId[link.chunkId] ?? []),
        { id: card.id, key: card.key, title: card.title }
      ];
    }

    return {
      document,
      chunks,
      links,
      linkedCardsByChunkId
    };
  }

export function createCardSourceLink(this: StoryMapperRepository<"transaction">, cardId: string, input: CreateCardSourceLinkRequest): CardSourceLink | undefined {
    this.assertWritable();
    const card = this.getCard(cardId);
    if (!card) {
      return undefined;
    }
    input = createCardSourceLinkRequestSchema.parse(input);
    if (input.kind !== "chunk") return createEvidence(this, card, input);
    const storyMap = this.getStoryMapOrThrow(card.storyMapId);
    const chunk = this.db.select().from(sourceChunks).where(eq(sourceChunks.id, input.chunkId)).get();
    if (!chunk) {
      throw new DomainError("not_found", "Source chunk not found.");
    }
    const document = this.db.select().from(sourceDocuments).where(eq(sourceDocuments.id, chunk.documentId)).get();
    if (!document || document.projectId !== storyMap.projectId) throw new DomainError("not_found", "Source chunk not found.");

    const existing = this.db
      .select()
      .from(cardSourceLinks)
      .where(and(eq(cardSourceLinks.cardId, cardId), eq(cardSourceLinks.chunkId, input.chunkId)))
      .get();
    if (existing) {
      return toCardSourceLink(existing);
    }

    const link: ChunkCardSourceLink = {
      kind: "chunk",
      id: randomUUID(),
      cardId,
      chunkId: input.chunkId,
      confidence: input.confidence ?? null,
      createdAt: new Date().toISOString()
    };
    this.db.insert(cardSourceLinks).values(link).run();
    this.writeCardVersion(card);
    this.logActivity(storyMap.projectId, "cardSourceLink.created", "sourceLink", link.id, undefined, link);
    return link;
  }

export function deleteCardSourceLink(this: StoryMapperRepository<"transaction">, cardId: string, input: DeleteCardSourceLinkRequest): boolean {
  this.assertWritable();
  const card = this.getCard(cardId);
  if (!card) return false;
  if (input.kind !== "chunk") return deleteEvidence(this, card, input);
  const existing = this.db.select().from(cardSourceLinks).where(and(eq(cardSourceLinks.cardId, cardId), eq(cardSourceLinks.id, input.id), eq(cardSourceLinks.kind, input.kind))).get();
  if (!existing) return false;
  this.db.delete(cardSourceLinks).where(eq(cardSourceLinks.id, existing.id)).run();
  this.writeCardVersion(card);
  this.logActivity(this.getStoryMapOrThrow(card.storyMapId).projectId, "cardSourceLink.deleted", "sourceLink", existing.id, toCardSourceLink(existing), undefined);
  return true;
}

export { listGitHubLinksForStoryMap, createGitHubLink, updateGitHubLink, deleteGitHubLink, getGitHubLink } from "@storymapper/db/repositories/github-refs-repository";

export function getGitHubSyncHealthData(this: StoryMapperRepository<"transaction">, storyMapId: string): import("@storymapper/contracts").GitHubSyncHealthData | undefined {
  this.context.database;
  if (!this.isStoryMapVisible(storyMapId)) return undefined;
  return { storyMapId, cards: this.listCards(storyMapId), links: this.listGitHubLinksForStoryMap(storyMapId) };
}

export function createGitHubIssueDryRun(this: StoryMapperRepository<"transaction">, input: CreateGitHubIssueDryRunRequest & { localOrigin?: string | undefined }): GitHubIssueDryRun[] {
    this.assertWritable();
    const snapshot = this.getStoryMapSnapshot(input.storyMapId);
    if (!snapshot) {
      throw new DomainError("not_found", `Story map ${input.storyMapId} not found.`);
    }

    const selectedCardIds = input.cardIds?.length ? new Set(input.cardIds) : undefined;
    const storyCards = visibleCards(snapshot.cards)
      .filter((card) => card.level === "story")
      .filter((card) => !selectedCardIds || selectedCardIds.has(card.id))
      .filter((card) => input.releaseId === undefined || input.releaseId === null || card.releaseId === input.releaseId);
    const releaseMilestone = input.releaseId
      ? snapshot.releases.find((release) => release.id === input.releaseId)?.name
      : undefined;
    const milestone = input.milestone ?? releaseMilestone;

    const dryRuns = storyCards.map((card): GitHubIssueDryRun => ({
      cardId: card.id,
      title: card.title,
      body: buildGitHubIssueBody(card, snapshot.storyMap.name, { origin: input.localOrigin!, projectId: snapshot.storyMap.projectId }),
      labels: [input.exportLabel, `status:${card.status}`, `story-map:${snapshot.storyMap.cardKeyPrefix}`],
      repo: input.repo,
      ...(milestone ? { milestone } : {})
    }));

    this.logActivity(snapshot.storyMap.projectId, "github.dryRun.created", "githubDryRun", snapshot.storyMap.id, undefined, {
      storyMapId: input.storyMapId,
      repo: input.repo,
      dryRunCount: dryRuns.length,
      cardIds: dryRuns.map((dryRun) => dryRun.cardId)
    });
    return dryRuns;
  }

export function resolveGitHubLinkProjectId(this: StoryMapperRepository<"transaction">, cardId?: string, releaseId?: string): string {
    this.context.database;
    const card = cardId ? this.getCard(cardId) : undefined;
    const release = releaseId ? this.getRelease(releaseId) : undefined;
    if (cardId && !card) throw new DomainError("not_found", `Card ${cardId} not found.`);
    if (releaseId && !release) throw new DomainError("not_found", `Release ${releaseId} not found.`);
    const cardProject = card ? this.getStoryMapOrThrow(card.storyMapId).projectId : undefined;
    const releaseProject = release ? this.getStoryMapOrThrow(release.storyMapId).projectId : undefined;
    if (cardProject && releaseProject && cardProject !== releaseProject) throw new DomainError("validation", "GitHub link targets belong to different Projects.");
    if (cardProject || releaseProject) return (cardProject ?? releaseProject)!;
    throw new DomainError("validation", "GitHub link must reference a card or release.");
  }

export function assertGitHubLinkProjectScope(this: StoryMapperRepository<"transaction">, cardId?: string, releaseId?: string): void {
    this.context.database;
    if (!cardId || !releaseId) return;
    const cardScope = this.db.select({ projectId: storyMaps.projectId }).from(cards)
      .innerJoin(storyMaps, eq(cards.storyMapId, storyMaps.id)).where(eq(cards.id, cardId)).get();
    const releaseScope = this.db.select({ projectId: storyMaps.projectId }).from(releases)
      .innerJoin(storyMaps, eq(releases.storyMapId, storyMaps.id)).where(eq(releases.id, releaseId)).get();
    if (cardScope && releaseScope && cardScope.projectId !== releaseScope.projectId) {
      throw new DomainError("validation", "GitHub link targets belong to different Projects.");
    }
  }

export function resolveVisibleGitHubLinkProjectId(this: StoryMapperRepository<"transaction">, cardId?: string, releaseId?: string): string {
    this.context.database;
    const card = cardId ? this.getCard(cardId) : undefined;
    const release = releaseId ? this.getRelease(releaseId) : undefined;
    return this.resolveGitHubLinkProjectId(card?.id, release?.id);
  }

export function listSourceLinksForStoryMap(this: StoryMapperRepository<"transaction">, storyMapId: string): CardSourceLink[] {
  this.context.database;
  const cardIds = new Set(this.listCards(storyMapId).map((card) => card.id));
  if (!cardIds.size) return [];
  return [...this.db.select().from(cardSourceLinks).where(inArray(cardSourceLinks.cardId, [...cardIds])).all().map(toCardSourceLink),
    ...githubEvidenceForCards(this, cardIds)];
}

export function listSourceChunksForStoryMap(this: StoryMapperRepository<"transaction">, storyMapId: string): SourceChunk[] {
    this.context.database;
    const chunkIds = new Set(this.listSourceLinksForStoryMap(storyMapId).flatMap((link) => link.kind === "chunk" ? [link.chunkId] : []));
    return this.db
      .select()
      .from(sourceChunks)
      .all()
      .map(toSourceChunk)
      .filter((chunk) => chunkIds.has(chunk.id));
  }

export function getSourceDocumentSummaryData(this: StoryMapperRepository<"transaction">, document: SourceDocument): SourceDocumentSummaryData {
    this.context.database;
    const chunks = this.db
      .select()
      .from(sourceChunks)
      .where(eq(sourceChunks.documentId, document.id))
      .all()
      .map(toSourceChunk);
    const chunkIds = new Set(chunks.map((chunk) => chunk.id));
    return { document, chunkIds: [...chunkIds], linkedChunkIds: visibleSourceLinks(this, chunkIds).map((link) => link.chunkId) };
  }

function visibleSourceLinks(repository: StoryMapperRepository<"transaction">, chunkIds: Set<string>): ChunkCardSourceLink[] {
  const links = repository.db.select().from(cardSourceLinks).all().map(toCardSourceLink).filter((link): link is ChunkCardSourceLink => link.kind === "chunk" && chunkIds.has(link.chunkId));
  const storyMapIds = new Set(links.map((link) => repository.getCard(link.cardId)?.storyMapId).filter((id): id is string => Boolean(id)));
  const visibleCardIds = new Set([...storyMapIds].flatMap((id) => visibleCards(repository.listCards(id))).map((card) => card.id));
  return links.filter((link) => visibleCardIds.has(link.cardId));
}
