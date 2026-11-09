import { useRef } from "react";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";

export function useLatestVersions(): { resolve: (id: string, loadedVersion: number) => number; record: (id: string, savedVersion: number) => void } {
  const epoch = useLiveInteractionStore((state) => state.epoch);
  const saved = useRef(new Map<string, number>());
  const savedEpoch = useRef(epoch);
  if (savedEpoch.current !== epoch) { saved.current.clear(); savedEpoch.current = epoch; }
  return {
    resolve: (id, loadedVersion) => Math.max(loadedVersion, saved.current.get(id) ?? 0),
    record: (id, savedVersion) => { if (epoch !== useLiveInteractionStore.getState().epoch) return; saved.current.set(id, Math.max(savedVersion, saved.current.get(id) ?? 0)); }
  };
}
