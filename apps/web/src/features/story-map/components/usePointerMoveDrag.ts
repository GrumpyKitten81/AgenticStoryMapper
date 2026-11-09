import { PointerSensor, useSensor, useSensors, type DragStartEvent } from "@dnd-kit/core";
import { useRef } from "react";
import { useLiveDrag } from "@storymapper/web/app/live/live-interaction-store";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";

export function usePointerMoveDrag(state: StoryMapBoardState) {
  const liveDrag = useLiveDrag();
  const sensors = useSensors(useSensor(PointerSensor));
  const version = useRef<number | undefined>(undefined);
  return {
    sensors,
    start: (event: DragStartEvent) => { version.current = state.captureMoveVersion(String(event.active.id)); liveDrag.start(); },
    end: liveDrag.end,
    baseVersion: () => {
      if (version.current === undefined) throw new Error("Move drag has no captured version.");
      return version.current;
    }
  };
}
