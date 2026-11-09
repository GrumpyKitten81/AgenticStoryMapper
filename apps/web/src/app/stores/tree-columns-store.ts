import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TreeColumnId = "changed" | "key" | "status" | "priority" | "estimate" | "release" | "assignee" | "link";

interface TreeColumnsState {
  hidden: TreeColumnId[];
  toggleColumn: (id: TreeColumnId) => void;
}

export const useTreeColumnsStore = create<TreeColumnsState>()(
  persist(
    (set) => ({
      hidden: ["changed", "status", "estimate", "assignee"],
      toggleColumn: (id) => set((state) => ({ hidden: state.hidden.includes(id) ? state.hidden.filter((column) => column !== id) : [...state.hidden, id] }))
    }),
    { name: "storymapper-tree-columns" }
  )
);
