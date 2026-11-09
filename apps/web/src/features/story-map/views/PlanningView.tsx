import { useNavigate, useSearch } from "@tanstack/react-router";
import { BoardToolbar } from "../components/BoardToolbar";
import { SwimlaneGrid } from "../components/SwimlaneGrid";
import { useStoryMapBoardStateContext } from "../../../app/routes/story-map-shell";

import { planningDisplayedCardIds } from "@storymapper/web/features/story-map/components/discovery-visibility";

export function PlanningView() {

  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { card?: string };
  const state = useStoryMapBoardStateContext();

  return (
    <section className="board-workspace">
      {!state.preview ? <BoardToolbar state={state} displayedCardIds={planningDisplayedCardIds(state.filtered.cards, state.snapshot.releases, state.planningShowAllReleases)} /> : null}
      <SwimlaneGrid state={state} onSelectCard={(cardId) => void (navigate as (options: unknown) => Promise<void>)({ search: { ...search, card: cardId } })} />
    </section>
  );
}
