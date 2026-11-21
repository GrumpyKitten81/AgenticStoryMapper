import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MapIdSetState {
  idsByMap: Record<string, string[]>;
  toggle: (storyMapId: string, id: string) => void;
  setIds: (storyMapId: string, ids: string[]) => void;
}

function createMapIdSetStore(persistKey: string) {
  return create<MapIdSetState>()(
    persist(
      (set) => ({
        idsByMap: {},
        toggle: (storyMapId, id) =>
          set((state) => {
            const current = state.idsByMap[storyMapId] ?? [];
            const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
            return { idsByMap: { ...state.idsByMap, [storyMapId]: next } };
          }),
        setIds: (storyMapId, ids) => set((state) => ({ idsByMap: { ...state.idsByMap, [storyMapId]: ids } }))
      }),
      { name: persistKey }
    )
  );
}

export const NOT_ASSIGNED_LANE_ID = "not-assigned";
export const useTreeCollapseStore = createMapIdSetStore("storymapper-tree-collapse");
export const useDiscoveryLaneCollapseStore = createMapIdSetStore("storymapper-discovery-lane-collapse");
export const useDiscoveryLanePinStore = createMapIdSetStore("storymapper-discovery-lane-pin");
