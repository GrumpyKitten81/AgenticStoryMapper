import { useNavigate, useSearch } from "@tanstack/react-router";
import { BoardToolbar } from "../components/BoardToolbar";
import { BacklogList } from "../components/BacklogList";
import { useStoryMapBoardStateContext, useStoryMapSnapshot } from "../../../app/routes/story-map-shell";
import { ProposeButton } from "@storymapper/web/features/proposals/ProposeButton";
import { proposalStrings } from "@storymapper/web/ui-strings/proposals";

export function BacklogView() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { card?: string };
  const state = useStoryMapBoardStateContext();
  const { storyMap } = useStoryMapSnapshot();

  return (
    <section className="board-workspace">
      {!state.preview ? <BoardToolbar state={state} displayedCardIds={new Set(state.filtered.cards.filter((card) => card.level === "story").map((card) => card.id))} /> : null}
      {!state.preview ? <ProposeButton projectId={storyMap.projectId} label={proposalStrings.grooming} call={{ name: "ProposeBacklogGrooming", input: { storyMapId: storyMap.id } }} /> : null}
      <BacklogList state={state} onSelectCard={(cardId) => void (navigate as (options: unknown) => Promise<void>)({ search: { ...search, card: cardId } })} />
    </section>
  );
}
