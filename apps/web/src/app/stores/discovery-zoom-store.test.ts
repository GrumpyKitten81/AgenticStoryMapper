// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { DISCOVERY_ZOOM_DEFAULT, discoveryZoomForMap, useDiscoveryZoomStore } from "./discovery-zoom-store";

const storageKey = "storymapper-discovery-zoom";

afterEach(() => {
  useDiscoveryZoomStore.setState({ zoomByMap: {} });
  localStorage.removeItem(storageKey);
});

it("restores each Story Map's zoom after rehydration and keeps reset map-specific", async () => {
  const store = useDiscoveryZoomStore;
  expect(discoveryZoomForMap(store.getState(), "map-a")).toBe(DISCOVERY_ZOOM_DEFAULT);
  store.getState().setZoom("map-a", 0.76);
  store.getState().setZoom("map-b", 1.18);
  const saved = localStorage.getItem(storageKey)!;
  store.setState({ zoomByMap: {} });
  localStorage.setItem(storageKey, saved);
  await store.persist.rehydrate();
  expect(discoveryZoomForMap(store.getState(), "map-a")).toBe(0.76);
  expect(discoveryZoomForMap(store.getState(), "map-b")).toBe(1.18);
  store.getState().resetZoom("map-a");
  expect(discoveryZoomForMap(store.getState(), "map-a")).toBe(1);
  expect(discoveryZoomForMap(store.getState(), "map-b")).toBe(1.18);
  expect(JSON.parse(localStorage.getItem(storageKey)!).state.zoomByMap["map-a"]).toBe(1);
});

it("bounds valid saved values and ignores invalid saved values", async () => {
  localStorage.setItem(storageKey, JSON.stringify({ state: { zoomByMap: { low: 0.1, high: 2, invalid: "0.8", missing: null } }, version: 0 }));
  await useDiscoveryZoomStore.persist.rehydrate();
  expect(discoveryZoomForMap(useDiscoveryZoomStore.getState(), "low")).toBe(0.5);
  expect(discoveryZoomForMap(useDiscoveryZoomStore.getState(), "high")).toBe(1.25);
  expect(discoveryZoomForMap(useDiscoveryZoomStore.getState(), "invalid")).toBe(1);
  expect(discoveryZoomForMap(useDiscoveryZoomStore.getState(), "missing")).toBe(1);
});
