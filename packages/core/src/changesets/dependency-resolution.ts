import type { CardDependency, ChangeOperation } from "@storymapper/contracts";
import { selectedEntityId } from "@storymapper/core/changesets/entity-resolution";
import { allocatedId, assertBaseline, bumpVersion, cardOwner, readDependency, refuse, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";

export function dependencyCycle(edges: readonly Pick<CardDependency, "cardId" | "prerequisiteCardId">[], cardId: string, prerequisiteCardId: string): string[] | undefined {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) adjacency.set(edge.cardId, [...(adjacency.get(edge.cardId) ?? []), edge.prerequisiteCardId]);
  const pending = [[prerequisiteCardId]];
  const visited = new Set<string>();
  while (pending.length) {
    const path = pending.pop()!;
    const current = path.at(-1)!;
    if (current === cardId) return [cardId, ...path];
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of [...(adjacency.get(current) ?? [])].sort().reverse()) pending.push([...path, next]);
  }
  return undefined;
}

export function resolveCardDependency(context: ResolutionContext): void {
  const operation = context.operation as Extract<ChangeOperation, { entity: "cardDependency" }>;
  const cardId = selectedEntityId(context, "card", operation.after.cardId);
  const prerequisiteCardId = selectedEntityId(context, "card", operation.after.prerequisiteCardId);
  cardOwner(context, cardId);
  cardOwner(context, prerequisiteCardId);
  const card = context.state.cards.find((row) => row.id === cardId)!;
  const prerequisite = context.state.cards.find((row) => row.id === prerequisiteCardId)!;
  assertBaseline(context, card.version, card.id);
  if (cardId === prerequisiteCardId) refuse(context, `Card ${card.key} cannot depend on itself.`);
  if (card.storyMapId !== prerequisite.storyMapId) refuse(context, `Cards ${card.key} and ${prerequisite.key} belong to different Story Maps.`);
  readDependency(context, "cardDependencyGraph", card.storyMapId);
  const existing = context.state.cardDependencies.find((edge) => edge.cardId === cardId && edge.prerequisiteCardId === prerequisiteCardId);
  if (operation.op === "set") {
    const cycle = dependencyCycle(context.state.cardDependencies, cardId, prerequisiteCardId);
    if (cycle) refuse(context, `Dependency cycle: ${cycle.map((id) => context.state.cards.find((row) => row.id === id)?.key ?? id).join(" -> ")}.`);
    if (existing) return;
    context.state.cardDependencies.push({ id: allocatedId(context), cardId, prerequisiteCardId, createdAt: context.supply.createdAt });
  } else {
    if (!existing) return;
    context.state.cardDependencies = context.state.cardDependencies.filter((edge) => edge.id !== existing.id);
  }
  bumpVersion(context, card);
  card.updatedAt = context.supply.createdAt;
}
