import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DiscoveryLaneCollapseState {
  collapsedByMap: Record<string, string[]>;
  toggleLane: (storyMapId: string, laneId: string) => void;
  setCollapsed: (storyMapId: string, laneIds: string[]) => void;
}

export const useDiscoveryLaneCollapseStore = create<DiscoveryLaneCollapseState>()(
  persist(
    (set) => ({
      collapsedByMap: {},
      toggleLane: (storyMapId, laneId) =>
        set((state) => {
          const current = state.collapsedByMap[storyMapId] ?? [];
          const next = current.includes(laneId) ? current.filter((id) => id !== laneId) : [...current, laneId];
          return { collapsedByMap: { ...state.collapsedByMap, [storyMapId]: next } };
        }),
      setCollapsed: (storyMapId, laneIds) =>
        set((state) => ({ collapsedByMap: { ...state.collapsedByMap, [storyMapId]: laneIds } }))
    }),
    { name: "storymapper-discovery-lane-collapse" }
  )
);
