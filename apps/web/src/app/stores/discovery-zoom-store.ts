import { create } from "zustand";

export const DISCOVERY_ZOOM_DEFAULT = 1;
export const DISCOVERY_ZOOM_MIN = 0.5;
export const DISCOVERY_ZOOM_MAX = 1.25;
export const DISCOVERY_ZOOM_STEP = 0.01;

interface DiscoveryZoomState {
  zoom: number;
  setZoom: (zoom: number) => void;
  resetZoom: () => void;
}

export const useDiscoveryZoomStore = create<DiscoveryZoomState>((set) => ({
  zoom: DISCOVERY_ZOOM_DEFAULT,
  setZoom: (zoom) => set({ zoom: clampDiscoveryZoom(zoom) }),
  resetZoom: () => set({ zoom: DISCOVERY_ZOOM_DEFAULT })
}));

function clampDiscoveryZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return DISCOVERY_ZOOM_DEFAULT;
  return Math.min(DISCOVERY_ZOOM_MAX, Math.max(DISCOVERY_ZOOM_MIN, zoom));
}