import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, type SQLWrapper } from "drizzle-orm";
import { DomainError, parseWorkItemLocator, workItemProviderSchema, type Card, type CardSourceLink, type CreateCardSourceLinkRequest, type DeleteCardSourceLinkRequest } from "@storymapper/contracts";
import { cards, cardSourceLinks, cardGithubEvidence, externalRefs, storyMaps } from "@storymapper/db/schema";
import { toCard, toCardSourceLink } from "@storymapper/db/repositories/row-mappers";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

type Repository = StoryMapperRepository<"transaction">;

export function githubEvidenceForCards(repository: Repository, cardIds: Set<string> | SQLWrapper): CardSourceLink[] {
  if (cardIds instanceof Set && !cardIds.size) return [];
  const requestedIds = cardIds instanceof Set ? [...cardIds] : cardIds;
  const direct = repository.db.select().from(externalRefs).where(and(eq(externalRefs.entityType, "card"), inArray(externalRefs.system, workItemProviderSchema.options), inArray(externalRefs.entityId, requestedIds))).all();
  const attached = attachedGithubEvidenceForCards(repository, cardIds);
  const canonical = direct.flatMap((identity) => {
    const locator = parseWorkItemLocator(identity.system, identity.externalId);
    return locator?.resource === "issues" ? [{ kind: "github" as const, ...(identity.system === "github" ? {} : { provider: identity.system as import("@storymapper/contracts").WorkItemProvider }), id: identity.id, cardId: identity.entityId, externalRefId: identity.id, repoFullName: locator.repo, issueNumber: locator.number, url: locator.url }] : [];
  });
  const directOwners = new Map(canonical.map((identity) => [identity.externalRefId, identity.cardId]));
  return [...canonical, ...attached.filter((ref) => directOwners.get(ref.externalRefId) !== ref.cardId)];
}

export function attachedGithubEvidenceForCards(repository: Repository, cardIds: Set<string> | SQLWrapper): Extract<CardSourceLink, { kind: "github" }>[] {
  if (cardIds instanceof Set && !cardIds.size) return [];
  const requestedIds = cardIds instanceof Set ? [...cardIds] : cardIds;
  return repository.db.select({ ref: cardGithubEvidence, identity: externalRefs }).from(cardGithubEvidence)
    .innerJoin(externalRefs, eq(cardGithubEvidence.externalRefId, externalRefs.id))
    .where(and(inArray(cardGithubEvidence.cardId, requestedIds), inArray(externalRefs.system, workItemProviderSchema.options))).all()
    .flatMap(({ ref, identity }) => {
      const locator = parseWorkItemLocator(identity.system, identity.externalId);
      return locator?.resource === "issues" ? [{ kind: "github" as const, ...(identity.system === "github" ? {} : { provider: identity.system as import("@storymapper/contracts").WorkItemProvider }), id: ref.id, cardId: ref.cardId, externalRefId: identity.id, repoFullName: locator.repo, issueNumber: locator.number, url: locator.url }] : [];
    });
}

export function createEvidence(repository: Repository, card: Card, input: Exclude<CreateCardSourceLinkRequest, { kind: "chunk" }>): CardSourceLink {
  const projectId = repository.getStoryMapOrThrow(card.storyMapId).projectId;
  if (input.kind === "github") {
    const identity = repository.getGitHubLink(input.externalRefId);
    if (!identity || identity.issueNumber == null || repository.db.select().from(storyMaps).where(eq(storyMaps.id, repository.db.select().from(externalRefs).where(eq(externalRefs.id, identity.id)).get()!.scopeId)).get()?.projectId !== projectId) {
      throw new DomainError("not_found", "GitHub Issue not found.");
    }
    const existing = githubEvidenceForCards(repository, new Set([card.id])).find((link) => link.kind === "github" && link.externalRefId === identity.id);
    if (existing) return existing;
    const ref = { id: randomUUID(), cardId: card.id, externalRefId: identity.id };
    repository.db.insert(cardGithubEvidence).values(ref).run();
    const link = githubEvidenceForCards(repository, new Set([card.id])).find((link) => link.id === ref.id)!;
    recordEvidenceCreation(repository, card, link);
    return link;
  }
  const existing = repository.db.select().from(cardSourceLinks).where(and(eq(cardSourceLinks.cardId, card.id), eq(cardSourceLinks.kind, "note"), eq(cardSourceLinks.note, input.note))).get();
  if (existing) return toCardSourceLink(existing);
  const row = { kind: "note" as const, id: randomUUID(), cardId: card.id, note: input.note, createdAt: new Date().toISOString() };
  repository.db.insert(cardSourceLinks).values(row).run();
  const link: CardSourceLink = row;
  recordEvidenceCreation(repository, card, link);
  return link;
}

function recordEvidenceCreation(repository: Repository, card: Card, link: CardSourceLink): void {
  repository.writeCardVersion(card);
  repository.logActivity(repository.getStoryMapOrThrow(card.storyMapId).projectId, "cardSourceLink.created", "sourceLink", link.id, undefined, link);
}

export function deleteEvidence(repository: Repository, card: Card, input: DeleteCardSourceLinkRequest): boolean {
  const note = input.kind === "note" ? repository.db.select().from(cardSourceLinks)
    .where(and(eq(cardSourceLinks.cardId, card.id), eq(cardSourceLinks.id, input.id), eq(cardSourceLinks.kind, "note"))).get() : undefined;
  const link = note ? toCardSourceLink(note) : githubEvidenceForCards(repository, new Set([card.id]))
    .find((link) => link.kind === input.kind && link.id === input.id);
  if (!link) return false;
  if (link.kind === "github") {
    if (link.externalRefId === input.id) return repository.deleteGitHubLink(link.externalRefId);
    repository.db.delete(cardGithubEvidence).where(and(eq(cardGithubEvidence.id, input.id), eq(cardGithubEvidence.cardId, card.id))).run();
  } else repository.db.delete(cardSourceLinks).where(eq(cardSourceLinks.id, input.id)).run();
  repository.writeCardVersion(card);
  repository.logActivity(repository.getStoryMapOrThrow(card.storyMapId).projectId, "cardSourceLink.deleted", "sourceLink", link.id, link, undefined);
  return true;
}

export function reconcileCardProvenance(repository: Repository, cardId: string): Card["provenance"] {
  const card = repository.db.select().from(cards).where(eq(cards.id, cardId)).get()!;
  const linked = repository.db.select({ id: cardSourceLinks.id }).from(cardSourceLinks).where(eq(cardSourceLinks.cardId, cardId)).get()
    || githubEvidenceForCards(repository, new Set([cardId])).length;
  const provenance = linked ? "linked" : card.creationOrigin;
  if (provenance !== card.provenance) repository.db.update(cards).set({ provenance }).where(eq(cards.id, cardId)).run();
  return provenance;
}

export function affectedGithubCards(repository: Repository, externalRefId: string): string[] {
  const link = repository.db.select().from(externalRefs).where(eq(externalRefs.id, externalRefId)).get();
  const refs = repository.db.select().from(cardGithubEvidence).where(eq(cardGithubEvidence.externalRefId, externalRefId)).all();
  return [...new Set([...(link?.entityType === "card" ? [link.entityId] : []), ...refs.map((ref) => ref.cardId)])];
}

export function finalizeEvidenceCards(repository: Repository, cardIds: string[]): void {
  for (const id of new Set(cardIds)) {
    const card = repository.db.select().from(cards).where(eq(cards.id, id)).get();
    if (card) {
      const before = toCard(card);
      repository.writeCardVersion({ ...before });
      const after = toCard(repository.db.select().from(cards).where(eq(cards.id, id)).get()!);
      const projectId = repository.db.select().from(storyMaps).where(eq(storyMaps.id, card.storyMapId)).get()!.projectId;
      repository.logActivity(projectId, "card.sourceEvidence.updated", "card", id, before, after);
    }
  }
}
