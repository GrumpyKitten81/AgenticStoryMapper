import { ListFilter } from "lucide-react";
import { visibleCards } from "@storymapper/core";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import { activeBoardFilterKeys } from "@storymapper/web/features/story-map/board-filters";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";

export function BoardFilterIndicator({ state }: { state: StoryMapBoardState }) {
  if (state.filtered.matchingCardIds.size >= visibleCards(state.snapshot.cards).length) return null;
  const label = strings.filteredIndicator(activeBoardFilterKeys(state.filters).map((key) => strings.filterNames[key]));
  return <span role="img" className="icon-button filter-indicator" aria-label={label} title={label}><ListFilter size={16} /></span>;
}
