import { isCardArchived } from "@storymapper/core/story-map/github-status";
import { parseStoredJson } from "@storymapper/db/versioned-json";
import { workItemProviderSchema } from "@storymapper/contracts";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DomainError } from "@storymapper/contracts";
import type { BulkUpdateCardsRequest, Card, CardAttachment, CardLevel, CardVersionSummary, CreateCardAttachmentRequest, CreateCardRequest, DeleteCardRequest, MoveCardRequest, ParkCardRequest, UpdateCardRequest } from "@storymapper/contracts";
import { visibleCards, cardParentError, placeCard, reindexCardPositions, rehomeChildPositions } from "@storymapper/core";
import { cardReviewRecords, cardGithubEvidence, cardAnnotations, cardAttachments, cardPersonas, cardSourceLinks, cardVersions, cards, storyMaps, externalRefs, remoteWorkItemLinks, syncConflicts } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { assertAgentWriteSafety } from "@storymapper/db/repositories/projects-repository";
import { toCard, toCardAttachment } from "@storymapper/db/repositories/row-mappers";
import { compact, changedCardFields } from "@storymapper/db/repositories/repository-values";
import { reconcileCardProvenance, affectedGithubCards, finalizeEvidenceCards } from "@storymapper/db/repositories/source-evidence-repository";
import { trackLiveRoot } from "@storymapper/db/live-change-tracking";

export function listCards(this: StoryMapperRepository<"transaction">, storyMapId: string): Card[] {
    this.context.database;
    if (!this.isStoryMapVisible(storyMapId)) return [];
    return this.db
      .select()
      .from(cards)
      .where(eq(cards.storyMapId, storyMapId))
      .orderBy(asc(cards.parentId), asc(cards.position), asc(cards.createdAt))
      .all()
      .map(toCard);
  }

export function getCardDetails(this: StoryMapperRepository<"transaction">, cardId: string): Card | undefined {
    this.context.database;
    return this.getCard(cardId);
  }

export function listCardsInInsertionOrder(this: StoryMapperRepository<"transaction">, storyMapId: string): Card[] {
  this.context.database;
  if (!this.isStoryMapVisible(storyMapId)) return [];
  return this.db.select().from(cards).where(eq(cards.storyMapId, storyMapId)).orderBy(sql`rowid`).all().map(toCard);
}

export function createCard(this: StoryMapperRepository<"transaction">, input: CreateCardRequest, creationSource: "human" | "template" | "import" | "ai" | "mcp" | "unknown" = "unknown"): Card {
    this.assertWritable();
      const storyMap = this.getStoryMapOrThrow(input.storyMapId);
      assertAgentWriteSafety(this, storyMap.projectId);
      if (input.level === "note" && input.cardType) throw new DomainError("validation", "Notes cannot have a Card type.");
      this.assertParentAllowed(input.storyMapId, input.level, input.parentId ?? null);
      this.assertReleaseAllowed(input.storyMapId, input.releaseId);

      const now = new Date().toISOString();
      const nextNumber = this.nextCardNumber(input.storyMapId);
      this.db.update(storyMaps).set({ nextCardNumber: nextNumber + 1 }).where(eq(storyMaps.id, input.storyMapId)).run();
      const position = input.position ?? this.nextSiblingPosition(input.storyMapId, input.parentId ?? null);
      const creationOrigin = this.actor.actorType === "human" && (creationSource === "human" || creationSource === "unknown") ? "manual" : "inference";
      const card: Card = {
        creationOrigin,
        provenance: creationOrigin,
        version: 1,
        id: randomUUID(),
        storyMapId: input.storyMapId,
        parentId: input.parentId ?? null,
        releaseId: input.releaseId ?? null,
        key: `${storyMap.cardKeyPrefix}-${nextNumber}`,
        level: input.level,
        cardType: input.level === "note" ? null : input.cardType ?? null,
      title: input.title,
        description: input.description ?? "",
        position,
        status: input.status ?? "todo",
        parked: false,
        archived: false,
        ...(input.estimate !== undefined ? { estimate: input.estimate } : {}),
        ...(input.assignee ? { assignee: input.assignee } : {}),
        createdAt: now,
        updatedAt: now
      };

      this.db.insert(cards).values({ ...card, creationSource }).run();
      this.createRootVersion("cards", card.id);
      if (creationSource === "human") this.gettingStarted.complete(storyMap.projectId, "addCards");
      this.writeCardVersion(card);
      this.logActivity(storyMap.projectId, "card.created", "card", card.id, undefined, card);
      return card;
    }

export function updateCard(this: StoryMapperRepository<"transaction">, cardId: string, input: UpdateCardRequest): Card | undefined {
    this.assertWritable();
    const before = this.getCard(cardId);
    if (!before) {
      return undefined;
    }
    assertAgentWriteSafety(this, this.getStoryMapOrThrow(before.storyMapId).projectId);
    if (input.status !== undefined && this.listRemoteWorkItemLinksForStoryMap(before.storyMapId).some((link) => link.cardId === cardId)) throw new DomainError("validation", "GitHub owns this Card status. Detach its sync link before editing status.");

    if (before.level === "note" && input.cardType) throw new DomainError("validation", "Notes cannot have a Card type.");
    this.assertReleaseAllowed(before.storyMapId, input.releaseId);
    const now = new Date().toISOString();
    const updateValues = compact({
      cardType: input.cardType,
      title: input.title,
      description: input.description,
      status: input.status,
      archived: input.archived,
      priority: input.priority,
      businessValue: input.businessValue,
      effort: input.effort,
      estimate: input.estimate,
      color: input.color,
      assignee: input.assignee,
      releaseId: input.releaseId,
      updatedAt: now
    });

    this.db.update(cards).set(updateValues).where(eq(cards.id, cardId)).run();
    const after = this.getCard(cardId);
    if (!after) {
      return undefined;
    }

    const storyMap = this.getStoryMapOrThrow(after.storyMapId);
    this.writeCardVersion(after, isCardArchived(before) === isCardArchived(after));
    this.logActivity(storyMap.projectId, "card.updated", "card", cardId, before, after);
    return after;
  }

export function bulkUpdateCards(this: StoryMapperRepository<"transaction">, input: BulkUpdateCardsRequest): Card[] {
    this.assertWritable();
    const storyMap = this.getStoryMapOrThrow(input.storyMapId);
    const uniqueCardIds = [...new Set(input.cardIds)];
    const beforeCards = uniqueCardIds.map((cardId) => this.getCard(cardId));
    const missingCardId = uniqueCardIds.find((_, index) => !beforeCards[index]);
    if (missingCardId) {
      throw new DomainError("not_found", `Card ${missingCardId} not found.`);
    }
    const cardsToUpdate = beforeCards as Card[];
    if (input.patch.cardType && cardsToUpdate.some((card) => card.level === "note")) throw new DomainError("validation", "Notes cannot have a Card type.");
    if (input.patch.status !== undefined && this.listRemoteWorkItemLinksForStoryMap(input.storyMapId).some((link) => link.cardId && uniqueCardIds.includes(link.cardId))) throw new DomainError("validation", "GitHub owns the selected Card status.");
    const foreignCard = cardsToUpdate.find((card) => card.storyMapId !== input.storyMapId);
    if (foreignCard) {
      throw new DomainError("validation", `Card ${foreignCard.id} belongs to another story map.`);
    }
    if (input.patch.releaseId) {
      const release = this.getRelease(input.patch.releaseId);
      if (!release) {
        throw new DomainError("not_found", `Release ${input.patch.releaseId} not found.`);
      }
      if (release.storyMapId !== input.storyMapId) {
        throw new DomainError("validation", `Release ${release.id} belongs to another story map.`);
      }
    }
    const now = new Date().toISOString();
    const updateValues = compact({
      cardType: input.patch.cardType,
      status: input.patch.status,
      archived: input.patch.archived,
      releaseId: input.patch.releaseId,
      estimate: input.patch.estimate,
      color: input.patch.color,
      updatedAt: now
    });
    for (const card of cardsToUpdate) {
      this.db.update(cards).set(updateValues).where(eq(cards.id, card.id)).run();
      if (input.patch.addPersonaId) this.setCardPersona(card.id, input.patch.addPersonaId);
      if (input.patch.removePersonaId) this.deleteCardPersona(card.id, input.patch.removePersonaId);
      if (input.patch.addAnnotationId) this.setCardAnnotation(card.id, input.patch.addAnnotationId);
      if (input.patch.removeAnnotationId) this.deleteCardAnnotation(card.id, input.patch.removeAnnotationId);
    }
    const afterCards = uniqueCardIds.map((cardId) => this.getCard(cardId)).filter((card): card is Card => Boolean(card));
    for (const card of afterCards) {
      this.writeCardVersion(card);
      this.logActivity(storyMap.projectId, "card.bulkUpdated", "card", card.id, cardsToUpdate.find((before) => before.id === card.id), card);
    }

    return afterCards;
  }

export function moveCard(this: StoryMapperRepository<"transaction">, cardId: string, input: MoveCardRequest): Card | undefined {
    this.assertWritable();
    const before = this.getCard(cardId);
    if (!before) {
      return undefined;
    }

    this.assertParentAllowed(before.storyMapId, before.level, input.parentId);
    this.assertReleaseAllowed(before.storyMapId, input.releaseId);
    const now = new Date().toISOString();
    const releaseId = input.releaseId === undefined ? before.releaseId : input.releaseId;

    this.db
      .update(cards)
      .set({ parentId: input.parentId, releaseId, updatedAt: now })
      .where(eq(cards.id, cardId))
      .run();

    if (before.level === "story") {
      this.db.update(cards).set({ position: input.position }).where(eq(cards.id, cardId)).run();
      this.reindexSiblings(before.storyMapId, before.parentId);
      this.reindexSiblings(before.storyMapId, input.parentId);
    } else {
      this.placeSameLevelAtIndex(before.storyMapId, cardId, before.level, input.parentId, input.position);
      if (before.parentId !== input.parentId) {
        this.reindexSiblings(before.storyMapId, before.parentId);
      }
    }

    const after = this.getCard(cardId);
    if (!after) {
      return undefined;
    }

    if (before.parentId !== after.parentId) {
      this.db.update(remoteWorkItemLinks).set({ parentOverrideLocal: true }).where(inArray(remoteWorkItemLinks.externalRefId, this.db.select({ id: externalRefs.id }).from(externalRefs).where(and(eq(externalRefs.entityType, "card"), eq(externalRefs.entityId, cardId))))).run();
    }

    const storyMap = this.getStoryMapOrThrow(after.storyMapId);
    this.writeCardVersion(after);
    this.logActivity(storyMap.projectId, "card.moved", "card", cardId, before, after);
    return after;
  }

export function archiveCard(this: StoryMapperRepository<"transaction">, cardId: string): Card | undefined {
    this.assertWritable();
    const before = this.getCard(cardId);
    if (!before) return undefined;
    this.db.update(cards).set({ archived: true, updatedAt: new Date().toISOString() }).where(eq(cards.id, cardId)).run();
    const after = this.getCard(cardId)!;
    this.writeCardVersion(after);
    this.logActivity(this.getStoryMapOrThrow(after.storyMapId).projectId, "card.archived", "card", cardId, before, after);
    return after;
}

export function deleteCard(this: StoryMapperRepository<"transaction">, cardId: string, input: DeleteCardRequest): boolean {
    this.assertWritable();
    const card = this.getCard(cardId);
    if (!card) {
      return false;
    }
    const storyMap = this.getStoryMapOrThrow(card.storyMapId);
    const now = new Date().toISOString();
    this.rehomeChildren(card, input.strategy, now);
    this.removeIncidentCardDependencies(cardId);

    const referencingCards = this.db.select().from(externalRefs).where(and(eq(externalRefs.entityType, "card"), eq(externalRefs.entityId, cardId), inArray(externalRefs.system, workItemProviderSchema.options))).all().flatMap((link) => affectedGithubCards(this, link.id)).filter((id) => id !== cardId);
    this.writeCardVersion(card);
    this.deleteExternalRefsForEntity("card", cardId);
    for (const table of [cardGithubEvidence, cardAnnotations, cardAttachments, cardPersonas, cardSourceLinks, syncConflicts]) {
      this.db.delete(table).where(eq(table.cardId, cardId)).run();
    }
    this.db.delete(cardReviewRecords).where(eq(cardReviewRecords.cardId, cardId)).run();
    this.db.delete(cards).where(eq(cards.id, cardId)).run();
    finalizeEvidenceCards(this, referencingCards);
    this.reindexSiblings(card.storyMapId, card.parentId);
    this.logActivity(storyMap.projectId, "card.deleted", "card", cardId, card, undefined);
    return true;
  }

export function parkCard(this: StoryMapperRepository<"transaction">, cardId: string, input: ParkCardRequest): Card | undefined {
    this.assertWritable();
    const card = this.getCard(cardId);
    if (!card) {
      return undefined;
    }
    if (card.level !== "activity") {
      throw new DomainError("validation", "Only Activities can be parked.");
    }
    const storyMap = this.getStoryMapOrThrow(card.storyMapId);
    const now = new Date().toISOString();
    this.rehomeChildren(card, input.childStrategy, now);
    this.db.update(cards).set({ parked: true, updatedAt: now }).where(eq(cards.id, cardId)).run();
    const updated = this.getCard(cardId) as Card;
    this.writeCardVersion(updated);
    this.logActivity(storyMap.projectId, "card.parked", "card", cardId, card, updated);
    return updated;
  }

export function unparkCard(this: StoryMapperRepository<"transaction">, cardId: string): Card | undefined {
    this.assertWritable();
    const card = this.getCard(cardId);
    if (!card) {
      return undefined;
    }
    const storyMap = this.getStoryMapOrThrow(card.storyMapId);
    const now = new Date().toISOString();
    const activeActivities = visibleCards(this.listCards(card.storyMapId)).filter((sibling) => sibling.level === "activity" && sibling.id !== cardId);
    const position = Math.max(-1, ...activeActivities.map((sibling) => sibling.position)) + 1;
    this.db.update(cards).set({ parked: false, parentId: null, position, updatedAt: now }).where(eq(cards.id, cardId)).run();
    const updated = this.getCard(cardId) as Card;
    this.writeCardVersion(updated);
    this.logActivity(storyMap.projectId, "card.unparked", "card", cardId, card, updated);
    return updated;
  }

export function rehomeChildren(this: StoryMapperRepository<"transaction">, card: Card, strategy: DeleteCardRequest["strategy"], now: string): void {
    this.assertWritable();
    const all = this.listCardsInInsertionOrder(card.storyMapId);
    const before = new Map(all.map((row) => [row.id, { ...row }]));
    const result = rehomeChildPositions(all, card, strategy);
    if (result.error) throw new DomainError("validation", result.error);
    const projectId = this.getStoryMapOrThrow(card.storyMapId).projectId;
    for (const after of all) {
      const previous = before.get(after.id)!;
      if (previous.parentId === after.parentId && previous.position === after.position) continue;
      this.db.update(cards).set({ parentId: after.parentId, position: after.position, ...(result.moved.includes(after) ? { updatedAt: now } : {}) }).where(eq(cards.id, after.id)).run();
      trackLiveRoot(this.db, this.context.transaction!, "card", after.id);
      if (previous.parentId === after.parentId) continue;
      const persisted = this.getCard(after.id)!;
      this.writeCardVersion(persisted);
      this.logActivity(projectId, "card.rehomed", "card", after.id, previous, persisted);
    }
  }

export function placeSameLevelAtIndex(this: StoryMapperRepository<"transaction">, storyMapId: string, cardId: string, level: CardLevel, parentId: string | null, index: number): void {
    this.assertWritable();
    const siblings = this.listCardsInInsertionOrder(storyMapId);
    const previous = new Map(siblings.map((card) => [card.id, card.position]));
    const card = siblings.find((card) => card.id === cardId)!;
    placeCard(siblings, card, parentId, index);
    for (const sibling of siblings) if (previous.get(sibling.id) !== sibling.position) {
      trackLiveRoot(this.db, this.context.transaction!, "card", sibling.id);
      this.db.update(cards).set({ position: sibling.position }).where(eq(cards.id, sibling.id)).run();
    }
  }

export function childRows(this: StoryMapperRepository<"transaction">, storyMapId: string, parentId: string | null): Card[] {
    this.context.database;
    const rows = parentId === null
      ? this.db.select().from(cards).where(and(eq(cards.storyMapId, storyMapId), isNull(cards.parentId))).orderBy(asc(cards.position), asc(cards.createdAt)).all()
      : this.db.select().from(cards).where(and(eq(cards.storyMapId, storyMapId), eq(cards.parentId, parentId))).orderBy(asc(cards.position), asc(cards.createdAt)).all();
    return rows.map(toCard);
  }

export function collectDescendantIds(this: StoryMapperRepository<"transaction">, storyMapId: string, cardId: string): string[] {
    this.context.database;
    const result: string[] = [];
    const stack = this.childRows(storyMapId, cardId).map((child) => child.id);
    while (stack.length > 0) {
      const currentId = stack.pop() as string;
      result.push(currentId);
      for (const child of this.childRows(storyMapId, currentId)) {
        stack.push(child.id);
      }
    }
    return result;
  }

export function listCardHistory(this: StoryMapperRepository<"transaction">, cardId: string): CardVersionSummary[] {
    this.context.database;
    const card = this.db.select().from(cards).where(eq(cards.id, cardId)).get();
    const rows = this.db
      .select()
      .from(cardVersions)
      .where(eq(cardVersions.cardId, cardId))
      .orderBy(asc(cardVersions.version))
      .all();
    const storyMapId = card?.storyMapId ?? (rows[0] ? (parseStoredJson("card_versions", "snapshot_json", rows[0].snapshotJson, rows[0].snapshotSchemaVersion) as Card).storyMapId : undefined);
    if (storyMapId && !this.isStoryMapVisible(storyMapId)) return [];
    let previous: Card | undefined;
    return rows.map((row) => {
      const snapshot = parseStoredJson("card_versions", "snapshot_json", row.snapshotJson, row.snapshotSchemaVersion) as Card;
      const summary: CardVersionSummary = {
        id: row.id,
        cardId: row.cardId,
        version: row.version,
        actor: row.actor,
        actorType: row.actorType as CardVersionSummary["actorType"],
        ...(row.mcpSessionId === null ? {} : { mcpSessionId: row.mcpSessionId }),
        createdAt: row.createdAt,
        snapshot,
        changedFields: previous ? changedCardFields(previous, snapshot) : ["created"]
      };
      previous = snapshot;
      return summary;
    });
  }

export function getCard(this: StoryMapperRepository<"transaction">, cardId: string): Card | undefined {
    this.context.database;
    const row = this.db.select().from(cards).where(eq(cards.id, cardId)).get();
    return row && this.isStoryMapVisible(row.storyMapId) ? toCard(row) : undefined;
  }

export function nextCardNumber(this: StoryMapperRepository<"transaction">, storyMapId: string): number {
    this.context.database;
    const row = this.db.select({ nextCardNumber: storyMaps.nextCardNumber }).from(storyMaps).where(eq(storyMaps.id, storyMapId)).get();
    if (!row) throw new DomainError("not_found", "Story Map not found.");
    return row.nextCardNumber;
  }

export function nextSiblingPosition(this: StoryMapperRepository<"transaction">, storyMapId: string, parentId: string | null): number {
    this.context.database;
    return this.db.select({ siblings: sql<number>`count(*)` }).from(cards)
      .where(and(eq(cards.storyMapId, storyMapId), parentId === null ? isNull(cards.parentId) : eq(cards.parentId, parentId))).get()!.siblings;
  }

export function assertParentAllowed(this: StoryMapperRepository<"transaction">, storyMapId: string, level: CardLevel, parentId: string | null): void {
    this.context.database;
    const parent = parentId ? this.getCard(parentId) : undefined;
    if (parentId && !parent) {
      throw new DomainError("not_found", "Parent card not found.");
    }
    if (parent && parent.storyMapId !== storyMapId) {
      throw new DomainError("validation", "Parent card belongs to another story map.");
    }

    const error = cardParentError(storyMapId, level, parent);
    if (error) throw new DomainError("validation", error);
  }

export function reindexSiblings(this: StoryMapperRepository<"transaction">, storyMapId: string, parentId: string | null): void {
    this.assertWritable();
    const siblings = this.childRows(storyMapId, parentId);
    const previous = new Map(siblings.map((card) => [card.id, card.position]));
    reindexCardPositions(siblings, storyMapId, parentId);
    for (const sibling of siblings) if (previous.get(sibling.id) !== sibling.position) {
      trackLiveRoot(this.db, this.context.transaction!, "card", sibling.id);
      this.db.update(cards).set({ position: sibling.position }).where(eq(cards.id, sibling.id)).run();
    }
  }

export function writeCardVersion(this: StoryMapperRepository<"transaction">, card: Card, coalesceSave = false, dependencyChange = false): void {
    this.assertWritable();
    card.provenance = reconcileCardProvenance(this, card.id);
    const now = new Date().toISOString();
    const latest = this.db.select().from(cardVersions).where(eq(cardVersions.cardId, card.id)).orderBy(desc(cardVersions.version)).get();
    const elapsed = latest ? Date.parse(now) - Date.parse(latest.createdAt) : -1;
    const coalesce = coalesceSave && !dependencyChange && latest && !latest.dependencyChange && latest.actor === this.actor.actorId
      && latest.actorType === this.actor.actorType && latest.mcpSessionId === (this.actor.mcpSessionId ?? null)
      && elapsed >= 0 && elapsed <= 60_000;
    this.bumpRootVersion("cards", card.id);
    trackLiveRoot(this.db, this.context.transaction!, "card", card.id);
    this.context.transaction!.beforeCommit.push(() => {
      const final = this.db.select().from(cards).where(eq(cards.id, card.id)).get();
      const latest = this.db.select().from(cardVersions).where(eq(cardVersions.cardId, card.id)).orderBy(desc(cardVersions.version)).get()!;
      const finalCard = final ? toCard(final) : parseStoredJson("card_versions", "snapshot_json", latest.snapshotJson, latest.snapshotSchemaVersion) as Card;
      Object.assign(card, Object.fromEntries(Object.entries(finalCard).filter(([key, value]) => value !== null || key in card)));
      const snapshotJson = JSON.stringify(card);
      const history = this.db.select().from(cardVersions).where(and(eq(cardVersions.cardId, card.id), eq(cardVersions.version, card.version))).get()!;
      if (history.snapshotJson !== snapshotJson) this.db.update(cardVersions).set({ snapshotJson, snapshotSchemaVersion: 1 }).where(eq(cardVersions.id, history.id)).run();
    });
    const committed = this.db.select().from(cards).where(eq(cards.id, card.id)).get()!;
    card.version = committed.version;
    const existing = this.db.select().from(cardVersions).where(and(eq(cardVersions.cardId, card.id), eq(cardVersions.version, card.version))).get() ?? (coalesce ? latest : undefined);
    if (existing) {
      this.db.update(cardVersions).set({ version: card.version, snapshotSchemaVersion: 1, snapshotJson: JSON.stringify(card), createdAt: now, dependencyChange: dependencyChange || existing.dependencyChange }).where(eq(cardVersions.id, existing.id)).run();
    } else {
      this.db.insert(cardVersions).values({
        id: randomUUID(), cardId: card.id, actor: this.actor.actorId, actorType: this.actor.actorType,
        mcpSessionId: this.actor.mcpSessionId, version: card.version, snapshotSchemaVersion: 1, snapshotJson: JSON.stringify(card), createdAt: now, dependencyChange
      }).run();
    }
  }

export function createCardAttachment(this: StoryMapperRepository<"transaction">, cardId: string, input: CreateCardAttachmentRequest): CardAttachment | undefined {
    this.assertWritable();
    const card = this.getCard(cardId);
    if (!card) return undefined;
    const attachment: CardAttachment = {
      id: randomUUID(),
      cardId,
      label: input.label,
      filePath: input.filePath,
      mimeType: input.mimeType,
      createdAt: new Date().toISOString()
    };
    this.db.insert(cardAttachments).values({
      id: attachment.id,
      cardId: attachment.cardId,
      label: attachment.label,
      filePath: attachment.filePath,
      mimeType: attachment.mimeType ?? null,
      createdAt: attachment.createdAt
    }).run();
    this.writeCardVersion(card);
    const storyMap = this.getStoryMapOrThrow(card.storyMapId);
    this.logActivity(storyMap.projectId, "cardAttachment.created", "cardAttachment", attachment.id, undefined, attachment);
    return attachment;
  }

export function deleteCardAttachment(this: StoryMapperRepository<"transaction">, cardId: string, attachmentId: string): boolean {
    this.assertWritable();
    const attachment = this.db.select().from(cardAttachments).where(eq(cardAttachments.id, attachmentId)).get();
    const card = this.getCard(cardId);
    if (!card || !attachment || attachment.cardId !== cardId) return false;
    this.db.delete(cardAttachments).where(eq(cardAttachments.id, attachmentId)).run();
    this.writeCardVersion(card);
    const storyMap = this.getStoryMapOrThrow(card.storyMapId);
    this.logActivity(storyMap.projectId, "cardAttachment.deleted", "cardAttachment", attachmentId, toCardAttachment(attachment), undefined);
    return true;
  }
