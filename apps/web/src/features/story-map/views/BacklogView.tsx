import { useNavigate, useSearch } from "@tanstack/react-router";
import { BoardToolbar } from "../components/BoardToolbar";
import { BacklogList } from "../components/BacklogList";
import { useStoryMapBoardStateContext } from "../../../app/routes/story-map-shell";

export function BacklogView() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { card?: string };
  const state = useStoryMapBoardStateContext();

  return (
    <section className="board-workspace">
      {!state.preview ? <BoardToolbar state={state} displayedCardIds={new Set(state.filtered.cards.filter((card) => card.level === "story").map((card) => card.id))} /> : null}
      <BacklogList state={state} onSelectCard={(cardId) => void (navigate as (options: unknown) => Promise<void>)({ search: { ...search, card: cardId } })} />
    </section>
  );
}
