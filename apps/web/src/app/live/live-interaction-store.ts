import { useEffect } from "react";
import { create } from "zustand";

interface LiveInteractionState {
  epoch: string | undefined;
  restoreRevision: number;
  restorePending: boolean;
  recordEpoch: (epoch: string) => void;
  finishEpoch: (epoch: string) => void;
  reviewRevision: number;
  invalidateReviews: () => void;
  manualHold: boolean;
  dragging: boolean;
  waiting: number;
  pendingChanges: Record<string, number | null>;
  setManualHold: (held: boolean) => void;
  setDragging: (dragging: boolean) => void;
  setWaiting: (waiting: number, pendingChanges?: Record<string, number | null>) => void;
}

function sameChanges(left: Record<string, number | null>, right: Record<string, number | null>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => key in right && left[key] === right[key]);
}

export const useLiveInteractionStore = create<LiveInteractionState>((set) => ({
  epoch: undefined,
  restoreRevision: 0,
  restorePending: false,
  recordEpoch: (epoch) => set((state) => state.epoch === epoch ? state : { epoch, restorePending: state.epoch !== undefined, restoreRevision: state.restoreRevision + (state.epoch !== undefined ? 1 : 0) }),
  finishEpoch: (epoch) => set((state) => state.epoch === epoch && state.restorePending ? { restorePending: false } : state),
  reviewRevision: 0,
  invalidateReviews: () => set((state) => ({ reviewRevision: state.reviewRevision + 1 })),
  manualHold: false,
  dragging: false,
  waiting: 0,
  pendingChanges: {},
  setManualHold: (manualHold) => set({ manualHold }),
  setDragging: (dragging) => set({ dragging }),
  setWaiting: (waiting, pendingChanges = {}) => set((state) => state.waiting === waiting && sameChanges(state.pendingChanges, pendingChanges) ? state : { waiting, pendingChanges })
}));

export function useLiveDrag(): { start: () => void; end: () => void } {
  const setDragging = useLiveInteractionStore((state) => state.setDragging);
  useEffect(() => () => setDragging(false), [setDragging]);
  return { start: () => setDragging(true), end: () => setDragging(false) };
}

export function liveUpdatesHeld(document: Document): boolean {
  const { manualHold, dragging } = useLiveInteractionStore.getState();
  if (manualHold || dragging || document.querySelector('[role="dialog"]:not([data-what-changed-drawer]):not([data-plan-drift-drawer]), [role="alertdialog"], dialog[open], [data-live-popover], [data-live-suspended-draft]')) return true;
  const focused = document.activeElement;
  return focused instanceof HTMLElement && Boolean(focused.closest('[data-live-card-id], button[data-card-id], textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"])'));
}
