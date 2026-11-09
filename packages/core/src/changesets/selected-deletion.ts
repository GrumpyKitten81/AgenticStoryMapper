import type { Card, DeleteCardRequest, OperationSnapshot, ChangeOperation } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core/story-map/visibility";

export function selectedDeletionPlacement(original: readonly Card[], ids: readonly string[], strategy: DeleteCardRequest["strategy"]): { cards: Card[]; recipients: string[]; error?: string } {
  const selected = new Set(ids);
  const byId = new Map(original.map((card) => [card.id, card]));
  const cards = original.filter((card) => !selected.has(card.id)).map((card) => ({ ...card }));
  const visible = new Set(visibleCards([...original]).map((card) => card.id));
  const recipients = new Set<string>();
  const order = (a: Card, b: Card) => a.position - b.position || a.createdAt.localeCompare(b.createdAt);
  const ancestorSelected = (card: Card): boolean => {
    const seen = new Set<string>();
    let parent = card.parentId;
    while (parent && !seen.has(parent)) {
      if (selected.has(parent)) return true;
      seen.add(parent);
      parent = byId.get(parent)?.parentId ?? null;
    }
    return false;
  };
  for (const target of original.filter((card) => selected.has(card.id)).sort(order)) {
    const children = cards.filter((card) => byId.get(card.id)?.parentId === target.id).sort(order);
    if (strategy === "unassign") continue;
    if (!children.length) continue;
    const siblings = original.filter((row) => row.storyMapId === target.storyMapId && row.level === target.level && row.parentId === target.parentId && (row.id === target.id || !selected.has(row.id) && visible.has(row.id))).sort(order);
    const recipient = siblings[siblings.indexOf(target) + (strategy === "reassign-left" ? -1 : 1)];
    if (!recipient) return { cards, recipients: [...recipients], error: `No visible ${strategy === "reassign-left" ? "left" : "right"} neighbor is available.` };
    recipients.add(recipient.id);
    const base = Math.max(-1, ...cards.filter((row) => row.parentId === recipient.id).map((row) => row.position)) + 1;
    children.forEach((card, index) => { card.parentId = recipient.id; card.position = base + index; });
  }
  if (strategy === "unassign") for (const card of cards) if (ancestorSelected(card)) card.parentId = null;
  const affectedParents = new Set(original.filter((card) => selected.has(card.id)).map((card) => card.parentId));
  for (const card of cards) if (byId.get(card.id)?.parentId !== card.parentId) affectedParents.add(card.parentId);
  for (const parentId of affectedParents) cards.filter((card) => card.parentId === parentId).sort(order).forEach((card, index) => { card.position = index; });
  return { cards, recipients: [...recipients] };
}

export function selectedDeletionEffects(snapshot: Pick<OperationSnapshot, "cards" | "cardDependencies" | "githubLinks" | "sourceLinks">, storyMapId: string, ids: readonly string[], strategy: DeleteCardRequest["strategy"]): ReturnType<typeof selectedDeletionPlacement> & { requiredIds: Set<string> } {
  const selected = new Set(ids);
  const original = snapshot.cards.filter((card) => card.storyMapId === storyMapId);
  const before = new Map(original.map((card) => [card.id, card]));
  const placement = selectedDeletionPlacement(original, ids, strategy);
  const requiredIds = new Set([...selected, ...placement.recipients]);
  for (const card of placement.cards) if (card.parentId !== before.get(card.id)!.parentId || card.position !== before.get(card.id)!.position) requiredIds.add(card.id);
  for (const edge of snapshot.cardDependencies) if (selected.has(edge.prerequisiteCardId)) requiredIds.add(edge.cardId);
  const identities = new Set(snapshot.githubLinks.filter((row) => row.cardId && selected.has(row.cardId)).map((row) => row.id));
  for (const link of snapshot.sourceLinks) if (link.kind === "github" && identities.has(link.externalRefId)) requiredIds.add(link.cardId);
  return { ...placement, requiredIds };
}

type DeletionSelection = NonNullable<Extract<ChangeOperation, { entity: "card"; op: "delete" }>["after"]["selection"]>;

export function normalizeDeletionSelection(selection: DeletionSelection, reference: (entity: "card" | "storyMap", id: string) => string): DeletionSelection {
  return { storyMapId: reference("storyMap", selection.storyMapId), cards: selection.cards.map((card) => ({ ...card, id: reference("card", card.id) })), affectedCards: selection.affectedCards.map((card) => ({ ...card, id: reference("card", card.id) })) };
}
