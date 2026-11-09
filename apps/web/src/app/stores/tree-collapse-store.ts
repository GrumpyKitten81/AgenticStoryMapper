import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TreeCollapseState {
  collapsedByMap: Record<string, string[]>;
  toggleNode: (storyMapId: string, cardId: string) => void;
  setCollapsed: (storyMapId: string, cardIds: string[]) => void;
}

export const useTreeCollapseStore = create<TreeCollapseState>()(
  persist(
    (set) => ({
      collapsedByMap: {},
      toggleNode: (storyMapId, cardId) =>
        set((state) => {
          const current = state.collapsedByMap[storyMapId] ?? [];
          const next = current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId];
          return { collapsedByMap: { ...state.collapsedByMap, [storyMapId]: next } };
        }),
      setCollapsed: (storyMapId, cardIds) =>
        set((state) => ({ collapsedByMap: { ...state.collapsedByMap, [storyMapId]: cardIds } }))
    }),
    { name: "storymapper-tree-collapse" }
  )
);
