import type { Card, Release } from "@storymapper/contracts";
import type { ResolutionContext } from "@storymapper/core/changesets/resolution-context";
import { cardOwner, readDependency, referenceId, refuse, resolvedRootVersion } from "@storymapper/core/changesets/resolution-context";

export type CardPlacement = Pick<Card, "id" | "storyMapId" | "parentId" | "level" | "position" | "createdAt">;
export type ReleasePlacement = Pick<Release, "id" | "storyMapId" | "position">;

const ALLOWED_PARENTS: Record<Card["level"], Array<Card["level"] | null>> = { activity: [null], step: ["activity", null], story: ["step", null], note: [null, "activity", "step"] };

export function cardParentError(mapId: string, level: Card["level"], parent?: Pick<Card, "storyMapId" | "level">): string | undefined {
  if (parent && parent.storyMapId !== mapId) return "Parent Card belongs to another Story Map.";
  if (!ALLOWED_PARENTS[level].includes(parent?.level ?? null)) return `${level} cannot be nested below ${parent?.level ?? "root"}.`;
  return undefined;
}

export function parentReference(context: ResolutionContext, mapId: string, level: Card["level"], requested: string | null, cardId?: string): string | null {
  const id = requested === null ? null : referenceId(context, "card", requested);
  const parent = id ? context.state.cards.find((entry) => entry.id === id) : undefined;
  if (id) cardOwner(context, id);
  if (parent && parent.storyMapId !== mapId) refuse(context, "Parent Card belongs to another Story Map.");
  const hierarchyError = cardParentError(mapId, level, parent);
  if (hierarchyError) refuse(context, hierarchyError);
  if (id === cardId) refuse(context, "Card cannot be its own parent.");
  return id;
}

export function releaseReference(context: ResolutionContext, mapId: string, requested: string | null): string | null {
  if (requested === null) return null;
  const id = referenceId(context, "release", requested);
  const release = context.state.releases.find((entry) => entry.id === id)!;
  if (release.storyMapId !== mapId) refuse(context, "Release belongs to another Story Map.");
  return id;
}

function siblings<T extends CardPlacement>(cards: readonly T[], mapId: string, parentId: string | null): T[] {
  return cards.filter((entry) => entry.storyMapId === mapId && entry.parentId === parentId)
    .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
}

export function reindexCardPositions(cards: readonly CardPlacement[], mapId: string, parentId: string | null): void {
  siblings(cards, mapId, parentId).forEach((entry, position) => { entry.position = position; });
}

export function moveCardPosition(context: ResolutionContext, card: Card, oldParent: string | null, requested: number): void {
  placeCard(context.state.cards, card, oldParent, requested);
}

export function placeCard(cards: readonly CardPlacement[], card: CardPlacement, oldParent: string | null, requested: number): void {
  if (card.level === "story") {
    card.position = requested;
    reindexCardPositions(cards, card.storyMapId, oldParent);
    reindexCardPositions(cards, card.storyMapId, card.parentId);
    return;
  }
  const sameLevel = siblings(cards, card.storyMapId, card.parentId).filter((entry) => entry.level === card.level && entry.id !== card.id);
  sameLevel.splice(Math.min(requested, sameLevel.length), 0, card);
  sameLevel.forEach((entry, position) => { entry.position = position; });
  if (oldParent !== card.parentId) reindexCardPositions(cards, card.storyMapId, oldParent);
}

export function placeRelease<T extends ReleasePlacement>(releases: readonly T[], release: T, requested: number): T[] {
  const lanes = releases.filter((entry) => entry.storyMapId === release.storyMapId && entry.id !== release.id).sort((a, b) => a.position - b.position);
  lanes.splice(requested, 0, release);
  const changed = lanes.filter((entry, position) => entry.position !== position);
  lanes.forEach((entry, position) => { entry.position = position; });
  return changed;
}

export function moveReleasePosition(context: ResolutionContext, release: Release, requested: number): void {
  const lanes = context.state.releases.filter((entry) => entry.storyMapId === release.storyMapId && entry.id !== release.id);
  lanes.forEach((entry) => readDependency(context, "release", entry.id));
  if (requested > lanes.length) refuse(context, "Release position is outside the release lanes.");
  for (const entry of placeRelease(context.state.releases, release, requested)) if (entry.id !== release.id) entry.version = resolvedRootVersion(context, entry.id);
}
