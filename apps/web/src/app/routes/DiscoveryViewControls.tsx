import { ChevronDown, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { StoryMapSnapshot } from "@storymapper/contracts";
import { appStrings as strings } from "@storymapper/ui-strings";
import { DISCOVERY_ZOOM_MAX, DISCOVERY_ZOOM_MIN, DISCOVERY_ZOOM_STEP, useDiscoveryZoomStore } from "@storymapper/web/app/stores/discovery-zoom-store";
import { useDiscoveryLaneCollapseStore } from "@storymapper/web/app/stores/discovery-lane-collapse-store";

export function DiscoveryViewControls({ snapshot }: { snapshot: StoryMapSnapshot }) {
  const zoom = useDiscoveryZoomStore((state) => state.zoom);
  const setZoom = useDiscoveryZoomStore((state) => state.setZoom);
  const resetZoom = useDiscoveryZoomStore((state) => state.resetZoom);
  const storyMapId = snapshot.storyMap.id;
  const collapsedLaneIds = useDiscoveryLaneCollapseStore((state) => state.collapsedByMap[storyMapId]) ?? [];
  const setLaneCollapsed = useDiscoveryLaneCollapseStore((state) => state.setCollapsed);
  const laneIds = [...snapshot.releases.map((release) => `release:${release.id}`), "release:unscheduled"];
  const allCollapsed = laneIds.every((id) => collapsedLaneIds.includes(id));
  return <div className="topbar-zoom-controls" aria-label={strings.discoveryZoomControls}>
    <button type="button" className="secondary icon-button" aria-label={strings.zoomOut} title={strings.zoomOut} onClick={() => setZoom(zoom - DISCOVERY_ZOOM_STEP)}><ZoomOut size={16} /></button>
    <input type="range" aria-label={strings.discoveryZoom} min={DISCOVERY_ZOOM_MIN} max={DISCOVERY_ZOOM_MAX} step={DISCOVERY_ZOOM_STEP} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
    <button type="button" className="secondary icon-button" aria-label={strings.zoomIn} title={strings.zoomIn} onClick={() => setZoom(zoom + DISCOVERY_ZOOM_STEP)}><ZoomIn size={16} /></button>
    <button type="button" className="secondary icon-button" aria-label={strings.resetZoom} title={strings.resetZoom} onClick={resetZoom}><RotateCcw size={16} /></button>
    <span>{strings.percent(Math.round(zoom * 100))}</span>
    <button type="button" className="secondary icon-button" aria-pressed={allCollapsed} aria-label={allCollapsed ? strings.expandLanes : strings.collapseLanes} title={allCollapsed ? strings.expandAllLanes : strings.collapseAllLanes}
      onClick={() => setLaneCollapsed(storyMapId, allCollapsed ? [] : laneIds)}>
      {allCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
    </button>
  </div>;
}
