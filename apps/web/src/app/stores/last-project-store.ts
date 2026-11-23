import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LastProjectState {
  lastOpenedProjectId: string | undefined;
  rememberProject: (projectId: string) => void;
}

export const useLastProjectStore = create<LastProjectState>()(
  persist(
    (set, get) => ({
      lastOpenedProjectId: undefined,
      rememberProject: (projectId) => {
        if (get().lastOpenedProjectId === projectId) return;
        try {
          set({ lastOpenedProjectId: projectId });
        } catch (error) {
          // HINT: the remembered project only preselects the start picker; full browser storage must not break project navigation
          if (!(error instanceof DOMException && error.name === "QuotaExceededError")) throw error;
        }
      }
    }),
    { name: "storymapper-last-project" }
  )
);
