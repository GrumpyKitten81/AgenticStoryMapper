import { githubStatusStrings as strings } from "@storymapper/web/ui-strings/github-status";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useStoryMapBoardStateContext } from "@storymapper/web/app/routes/story-map-shell";
import type { Card } from "@storymapper/contracts";

export function FilterAncestors() {
  const state = useStoryMapBoardStateContext();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const ancestors = state.filtered.cards.filter((card) => !state.filtered.matchingCardIds.has(card.id));
  return <FilterAncestorCards ancestors={ancestors} onSelectCard={(cardId) => void (navigate as (options: unknown) => Promise<void>)({ search: { ...search, card: cardId } })} />;
}

export function FilterAncestorCards({ ancestors, onSelectCard }: { ancestors: readonly Card[]; onSelectCard: (cardId: string) => void }) {
  if (!ancestors.length) return null;
  return <nav className="button-row filter-context" aria-label={strings.ancestorContext}>{ancestors.map((card) => <button type="button" className="secondary" key={card.id} onClick={() => onSelectCard(card.id)}>{card.key} {card.title}</button>)}</nav>;
}
