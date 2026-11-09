import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { DomainError, type CardDependency, type CardDependencyResponse } from "@storymapper/contracts";
import { dependencyCycle } from "@storymapper/core";
import { cardDependencies, cards } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

export function listCardDependenciesForStoryMap(this: StoryMapperRepository, storyMapId: string): CardDependency[] {
  const ids = this.listCards(storyMapId).map((card) => card.id);
  return ids.length ? this.db.select().from(cardDependencies).where(and(inArray(cardDependencies.cardId, ids), inArray(cardDependencies.prerequisiteCardId, ids))).all() : [];
}

export function mutateCardDependency(this: StoryMapperRepository<"transaction">, cardId: string, prerequisiteCardId: string, set: boolean): CardDependencyResponse {
  this.assertWritable();
  const card = this.getCard(cardId);
  const prerequisite = this.getCard(prerequisiteCardId);
  if (!card) throw new DomainError("not_found", `Dependent Card ${cardId} not found.`);
  if (!prerequisite) throw new DomainError("not_found", `Prerequisite Card ${prerequisiteCardId} not found.`);
  if (card.id === prerequisite.id) throw new DomainError("validation", `Card ${card.key} cannot depend on itself.`);
  if (card.storyMapId !== prerequisite.storyMapId) throw new DomainError("validation", `Cards ${card.key} and ${prerequisite.key} belong to different Story Maps.`);
  const edges = this.listCardDependenciesForStoryMap(card.storyMapId);
  const existing = edges.find((edge) => edge.cardId === cardId && edge.prerequisiteCardId === prerequisiteCardId);
  if (set && !existing) {
    const cycle = dependencyCycle(edges, cardId, prerequisiteCardId);
    if (cycle) {
      const keys = new Map(this.listCards(card.storyMapId).map((row) => [row.id, row.key]));
      throw new DomainError("validation", `Dependency cycle: ${cycle.map((id) => keys.get(id)!).join(" -> ")}.`);
    }
  }
  if (set === Boolean(existing)) return { card, dependencies: edges.filter((edge) => edge.cardId === cardId) };
  const after = set ? { id: randomUUID(), cardId, prerequisiteCardId, createdAt: new Date().toISOString() } : undefined;
  if (after) this.db.insert(cardDependencies).values(after).run();
  else this.db.delete(cardDependencies).where(eq(cardDependencies.id, existing!.id)).run();
  this.db.update(cards).set({ updatedAt: new Date().toISOString() }).where(eq(cards.id, cardId)).run();
  this.writeCardVersion(card, false, true);
  this.logActivity(this.getStoryMapOrThrow(card.storyMapId).projectId, set ? "card.dependency.set" : "card.dependency.unset", "cardDependency", after?.id ?? existing!.id, existing, after);
  return { card, dependencies: this.listCardDependenciesForStoryMap(card.storyMapId).filter((edge) => edge.cardId === cardId) };
}

export function removeIncidentCardDependencies(this: StoryMapperRepository<"transaction">, cardId: string): void {
  this.assertWritable();
  const incident = this.db.select().from(cardDependencies).where(or(eq(cardDependencies.cardId, cardId), eq(cardDependencies.prerequisiteCardId, cardId))).all();
  if (!incident.length) return;
  const dependentIds = new Set(incident.filter((edge) => edge.cardId !== cardId).map((edge) => edge.cardId));
  this.db.delete(cardDependencies).where(inArray(cardDependencies.id, incident.map((edge) => edge.id))).run();
  for (const id of dependentIds) {
    const card = this.getCard(id)!;
    this.db.update(cards).set({ updatedAt: new Date().toISOString() }).where(eq(cards.id, id)).run();
    this.writeCardVersion(card, false, true);
  }
  for (const edge of incident) {
    const owner = this.getCard(edge.cardId)!;
    this.logActivity(this.getStoryMapOrThrow(owner.storyMapId).projectId, "card.dependency.unset", "cardDependency", edge.id, edge, undefined);
  }
}
