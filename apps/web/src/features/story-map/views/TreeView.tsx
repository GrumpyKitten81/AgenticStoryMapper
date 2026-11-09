import { useNavigate, useSearch } from "@tanstack/react-router";
import { BoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { TreeGrid } from "../components/TreeGrid";
import { TreeColumnPicker } from "../components/TreeColumnPicker";
import { useStoryMapBoardStateContext } from "../../../app/routes/story-map-shell";

export function TreeView() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { card?: string };
  const state = useStoryMapBoardStateContext();

  return (
    <section className="board-workspace tree-workspace">
      {!state.preview ? <BoardToolbar state={state} /> : null}
      <TreeColumnPicker estimationUnit={state.snapshot.storyMap.estimationUnit} />
      <TreeGrid
        state={state}
        onSelectCard={(cardId) => {
          void (navigate as (options: unknown) => Promise<void>)({ search: { ...search, card: cardId } });
        }}
      />
    </section>
  );
}
