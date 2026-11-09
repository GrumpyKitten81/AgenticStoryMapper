import { createContext, useContext, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export interface DiscoveryLocation { id: string; lane: number; column: number; columnEnd?: number; stack: number }
interface DiscoveryNavigation {
  readOnly: boolean;
  activeId: string | undefined;
  activate: (id: string) => void;
  release: (id: string) => void;
  keyDown: (id: string, event: KeyboardEvent<HTMLButtonElement>) => void;
  move: (id: string) => void;
}
export const DiscoveryNavigationContext = createContext<DiscoveryNavigation | null>(null);
export const useDiscoveryNavigation = () => useContext(DiscoveryNavigationContext);

export function discoveryDestination(locations: DiscoveryLocation[], id: string, key: string, control = false): string | undefined {
  const current = locations.find((location) => location.id === id);
  if (!current) return;
  const row = locations.filter((location) => location.lane === current.lane);
  if (key === "Home" || key === "End") return (control ? locations : row).at(key === "Home" ? 0 : -1)?.id;
  const direction = ["ArrowLeft", "ArrowUp", "PageUp"].includes(key) ? -1 : 1;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const columns = [...new Set(row.map((location) => location.column))].sort((a, b) => a - b);
    const column = columns[columns.indexOf(current.column) + direction];
    const stack = row.filter((location) => location.column === column);
    return stack[Math.min(current.stack, stack.length - 1)]?.id;
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    const stack = row.filter((location) => location.column === current.column);
    const adjacent = stack[stack.findIndex((location) => location.id === id) + direction];
    if (adjacent) return adjacent.id;
  }
  if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(key)) return;
  const lanes = [...new Set(locations.map((location) => location.lane))];
  const lane = lanes[lanes.indexOf(current.lane) + direction];
  const targetRow = locations.filter((location) => location.lane === lane);
  const column = (targetRow.find((location) => location.column <= current.column && (location.columnEnd ?? location.column) >= current.column) ?? targetRow.find((location) => location.column >= current.column) ?? targetRow.at(-1))?.column;
  const stack = targetRow.filter((location) => location.column === column);
  return (key.startsWith("Page") ? stack[Math.min(current.stack, stack.length - 1)] : direction < 0 ? stack.at(-1) : stack[0])?.id;
}

export function useDiscoveryGrid(locations: DiscoveryLocation[], onMove: (id: string) => void, onDelete: (id: string) => void, onToggle: (id: string) => void, readOnly = false) {
  const gridRef = useRef<HTMLElement>(null);
  const previous = useRef(locations);
  const focused = useRef<string | null>(null);
  const recover = useRef(false);
  const [activeId, setActiveId] = useState(locations[0]?.id);
  const visibleActiveId = locations.some((location) => location.id === activeId) ? activeId : locations[0]?.id;
  const focus = (id: string | undefined) => {
    if (id) gridRef.current?.querySelector<HTMLButtonElement>(`button[data-card-id="${id}"]`)?.focus();
    else gridRef.current?.focus();
  };
  useLayoutEffect(() => {
    const element = document.activeElement;
    const wasFocused = focused.current;
    const tile = element instanceof HTMLElement ? element.closest('[data-live-card-id]') : null;
    if (wasFocused && (recover.current || element === document.body || (tile && gridRef.current?.contains(tile)))) {
      const retained = locations.some((location) => location.id === wasFocused);
      const index = previous.current.findIndex((location) => location.id === wasFocused);
      const survives = (location: DiscoveryLocation) => locations.some((item) => item.id === location.id);
      const next = retained ? wasFocused : previous.current.slice(index + 1).find(survives)?.id ?? previous.current.slice(0, index).reverse().find(survives)?.id;
      if (!retained || element === document.body) {
        setActiveId(next); focus(next);
        queueMicrotask(() => { if (document.activeElement === document.body || document.activeElement?.hasAttribute("data-story-map-board")) focus(next); });
      }
    }
    recover.current = false;
    if (!wasFocused || locations.some((location) => location.id === wasFocused) || !document.querySelector('[role="dialog"], [role="alertdialog"]')) previous.current = locations;
  });
  function keyDown(id: string, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.altKey || event.metaKey || event.shiftKey || (event.ctrlKey && !["Home", "End"].includes(event.key))) {
      if (["Enter", " "].includes(event.key)) event.preventDefault();
      return;
    }
    if (readOnly && ["Enter", " ", "m", "Delete"].includes(event.key)) { event.preventDefault(); return; }
    const destination = discoveryDestination(locations, id, event.key, event.ctrlKey);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      event.preventDefault(); if (destination) { setActiveId(destination); focus(destination); }
    } else if (event.key === " ") { event.preventDefault(); onToggle(id); }
    else if (event.key === "m") { event.preventDefault(); onMove(id); }
    else if (event.key === "Delete") { event.preventDefault(); onDelete(id); }
  }
  return { gridRef, prepareFocusRecovery: () => { recover.current = true; }, navigation: { readOnly, activeId: visibleActiveId, activate: (id: string) => { focused.current = id; setActiveId(id); }, release: (id: string) => { if (focused.current === id) focused.current = null; }, keyDown, move: onMove } };
}
