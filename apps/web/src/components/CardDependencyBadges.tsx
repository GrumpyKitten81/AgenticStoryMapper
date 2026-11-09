import type { StoryMapSnapshot } from "@storymapper/contracts";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export interface CardDependencyKeys {
  prerequisites: string[];
  dependents: string[];
}

export function dependencyKeysByCard(snapshot: StoryMapSnapshot): Record<string, CardDependencyKeys> {
  const keys = new Map(snapshot.cards.map((card) => [card.id, card.key]));
  const result: Record<string, CardDependencyKeys> = {};
  for (const edge of snapshot.cardDependencies) {
    const dependent = result[edge.cardId] ??= { prerequisites: [], dependents: [] };
    const prerequisite = result[edge.prerequisiteCardId] ??= { prerequisites: [], dependents: [] };
    dependent.prerequisites.push(keys.get(edge.prerequisiteCardId)!);
    prerequisite.dependents.push(keys.get(edge.cardId)!);
  }
  return result;
}

export function CardDependencyBadges({ dependencies }: CardDependencyBadgesProps) {
  if (!dependencies) return null;
  return <>
    {dependencies.prerequisites.length > 0 ? <span className="dependency-badge" title={strings.dependsOnKeys(dependencies.prerequisites)}>{strings.dependsOnKeys(dependencies.prerequisites)}</span> : null}
    {dependencies.dependents.length > 0 ? <span className="dependency-badge" title={strings.requiredByKeys(dependencies.dependents)}>{strings.requiredByKeys(dependencies.dependents)}</span> : null}
  </>;
}

interface CardDependencyBadgesProps { dependencies?: CardDependencyKeys | undefined }
