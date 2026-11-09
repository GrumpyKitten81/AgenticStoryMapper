import { create } from "zustand";

interface ActiveStoryMapState {
  activeProjectId: string | undefined;
  activeStoryMapId: string | undefined;
  lastActiveProjectId: string | undefined;
  lastActiveStoryMapId: string | undefined;
  setActiveStoryMap: (input: { projectId: string | undefined; storyMapId: string | undefined }) => void;
}

export const useActiveStoryMapStore = create<ActiveStoryMapState>((set) => ({
  activeProjectId: undefined,
  activeStoryMapId: undefined,
  lastActiveProjectId: undefined,
  lastActiveStoryMapId: undefined,
  setActiveStoryMap: ({ projectId, storyMapId }) => set((state) => ({
    activeProjectId: projectId,
    activeStoryMapId: storyMapId,
    lastActiveProjectId: storyMapId ? projectId : state.lastActiveProjectId,
    lastActiveStoryMapId: storyMapId ?? state.lastActiveStoryMapId
  }))
}));
