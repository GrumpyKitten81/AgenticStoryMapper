import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DISCOVERY_ZOOM_DEFAULT = 1;
export const DISCOVERY_ZOOM_MIN = 0.5;
export const DISCOVERY_ZOOM_MAX = 1.25;
export const DISCOVERY_ZOOM_STEP = 0.01;

interface DiscoveryZoomState {
  zoomByMap: Record<string, number>;
  setZoom: (storyMapId: string, zoom: number) => void;
  resetZoom: (storyMapId: string) => void;
}

export const useDiscoveryZoomStore = create<DiscoveryZoomState>()(
  persist(
    (set) => ({
      zoomByMap: {},
      setZoom: (storyMapId, zoom) => set((state) => ({ zoomByMap: { ...state.zoomByMap, [storyMapId]: clampDiscoveryZoom(zoom) } })),
      resetZoom: (storyMapId) => set((state) => ({ zoomByMap: { ...state.zoomByMap, [storyMapId]: DISCOVERY_ZOOM_DEFAULT } }))
    }),
    {
      name: "storymapper-discovery-zoom",
      partialize: (state) => ({ zoomByMap: state.zoomByMap }),
      merge: (stored, current) => ({ ...current, zoomByMap: readZoomByMap(stored) })
    }
  )
);

export function discoveryZoomForMap(state: DiscoveryZoomState, storyMapId: string): number {
  return state.zoomByMap[storyMapId] ?? DISCOVERY_ZOOM_DEFAULT;
}

function readZoomByMap(stored: unknown): Record<string, number> {
  if (!stored || typeof stored !== "object" || !("zoomByMap" in stored)) return {};
  const values = stored.zoomByMap;
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, number] =>
    typeof entry[1] === "number" && Number.isFinite(entry[1])
  ).map(([storyMapId, zoom]) => [storyMapId, clampDiscoveryZoom(zoom)]));
}

function clampDiscoveryZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return DISCOVERY_ZOOM_DEFAULT;
  return Math.min(DISCOVERY_ZOOM_MAX, Math.max(DISCOVERY_ZOOM_MIN, zoom));
}
