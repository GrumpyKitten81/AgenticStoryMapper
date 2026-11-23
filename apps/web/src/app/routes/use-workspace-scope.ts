import { useEffect } from "react";
import { useLocation, useParams, useSearch } from "@tanstack/react-router";
import { useStoryMap, useStoryMaps } from "@storymapper/web/app/api";
import { useActiveStoryMapStore } from "@storymapper/web/app/stores/active-story-map-store";
import { useLastProjectStore } from "@storymapper/web/app/stores/last-project-store";

export function useWorkspaceScope(fallbackProjectId?: string) {
  const params = useParams({ strict: false }) as { projectId?: string; storyMapId?: string };
  const location = useLocation();
  const search = useSearch({ strict: false }) as { storyMapId?: string };
  const rememberProject = useLastProjectStore((state) => state.rememberProject);
  useEffect(() => { if (params.projectId) rememberProject(params.projectId); }, [params.projectId, rememberProject]);
  const activeProjectId = useActiveStoryMapStore((state) => state.activeProjectId);
  const rememberedProjectId = useActiveStoryMapStore((state) => state.lastActiveProjectId);
  const rememberedMapId = useActiveStoryMapStore((state) => state.lastActiveStoryMapId);
  const projectId = params.projectId ?? activeProjectId ?? fallbackProjectId;
  const urlStoryMapId = params.storyMapId ?? (params.projectId && location.pathname === `/projects/${params.projectId}/github` ? search.storyMapId : undefined);
  const candidateId = urlStoryMapId ?? (rememberedProjectId === projectId ? rememberedMapId : undefined);
  const maps = useStoryMaps(projectId, Boolean(candidateId));
  const availableMap = maps.data?.storyMaps.find((map) => map.id === candidateId && map.projectId === projectId);
  const snapshot = useStoryMap(availableMap?.id);
  const storyMap = snapshot.data?.storyMap.id === availableMap?.id && snapshot.data?.storyMap.projectId === projectId ? snapshot.data : undefined;
  return { projectId, storyMapId: storyMap?.storyMap.id, storyMap, urlStoryMapId: params.storyMapId,
    isLoading: Boolean(candidateId && maps.isPending) || Boolean(availableMap && snapshot.isPending),
    error: candidateId ? maps.error ?? (availableMap ? snapshot.error : null) : null };
}
