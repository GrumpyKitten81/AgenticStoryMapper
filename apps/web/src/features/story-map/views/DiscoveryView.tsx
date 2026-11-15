import { useNavigate, useSearch } from "@tanstack/react-router";
import { DiscoveryMatrix } from "../components/DiscoveryMatrix";
import { discoveryZoomForMap, useDiscoveryZoomStore } from "@storymapper/web/app/stores/discovery-zoom-store";
import { useStoryMapBoardStateContext } from "../../../app/routes/story-map-shell";

export function DiscoveryView() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { card?: string };
  const state = useStoryMapBoardStateContext();
  const storyMapId = state.snapshot.storyMap.id;
  const zoom = useDiscoveryZoomStore((value) => discoveryZoomForMap(value, storyMapId));

  return (
    <section className="board-workspace discovery-workspace">
      <DiscoveryMatrix
        state={state}
        zoom={zoom}
        onSelectCard={(cardId) => {
          void (navigate as (options: unknown) => Promise<void>)({ search: { ...search, card: cardId } });
        }}
      />
    </section>
  );
}
