// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { changeSetSchema, type ChangeSetPreviewBoard, type ChangeSetPreviewResponse } from "@storymapper/contracts";
import { getAllByRole, getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vitest";
import { cardId, mount, openBoardSearch, state, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";
import { ColorNamesContext } from "@storymapper/web/features/story-map/color-names-context";
import { CardTile } from "@storymapper/web/features/story-map/components/CardTile";
import { BoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { CardDetailModal } from "@storymapper/web/features/story-map/components/CardDetailModal";
import { useStoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";

const tile = () => document.querySelector<HTMLElement>(`[data-live-card-id="${cardId}"]`)!;
const click = async (element: HTMLElement) => act(async () => element.click());

it("uses map names in tile accessible names, choices, filters, bulk selectors and the detail modal without changing color values", async () => {
  state.snapshot.storyMap.colorCategoryNames = { "#f5a623": "Risk" };
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, color: "#f5a623" };
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const trigger = getByRole(tile(), "button", { name: "Color: Risk. Change color" });
  expect(trigger.style.background).toBe("rgb(245, 166, 35)");
  await click(trigger);
  const choice = getByRole(tile(), "option", { name: "Risk" });
  expect(choice.getAttribute("aria-selected")).toBe("true");
  await act(async () => choice.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await openBoardSearch(); await click(getByRole(state.host, "button", { name: "Filters" }));
  const filter = getByRole(state.host, "combobox", { name: "Color category" });
  expect(getByRole(filter, "option", { name: "Risk" }).getAttribute("value")).toContain("#f5a623");
  await click(getByRole(tile(), "checkbox"));
  const bulk = getAllByRole(state.host, "combobox", { name: "Color category" }).find((select) => select !== filter)!;
  expect(getByRole(bulk, "option", { name: "Risk" }).getAttribute("value")).toBe("#f5a623");
  await click(tile().querySelector<HTMLElement>("[data-card-id]")!);
  const modal = getByRole(document.body, "dialog");
  expect(getByRole(modal, "button", { name: "Risk" }).getAttribute("aria-pressed")).toBe("true");
  expect(state.snapshot.cards[2]!.color).toBe("#f5a623"); expect(state.savedPatch).toBeUndefined();
});

it("refreshes displayed map names and restores defaults when overrides disappear", async () => {
  state.snapshot.storyMap.colorCategoryNames = { "#f5a623": "Risk" };
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, color: "#f5a623" };
  await mount(viewUrl.replace(/tree$/, "discovery"));
  expect(getByRole(tile(), "button", { name: "Color: Risk. Change color" })).toBeDefined();
  const { colorCategoryNames: _, ...withoutOverrides } = state.snapshot.storyMap;
  state.snapshot = { ...state.snapshot, storyMap: { ...withoutOverrides, version: 2 } };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  await vi.waitFor(() => expect(getByRole(tile(), "button", { name: "Color: Orange. Change color" })).toBeDefined());
  expect(queryByRole(tile(), "button", { name: "Color: Risk. Change color" })).toBeNull();
  expect(state.snapshot.cards[2]!.color).toBe("#f5a623");
});

it("keeps map-specific and default category names isolated across simultaneous card consumers", async () => {
  const card = { ...state.snapshot.cards[2]!, color: "#f5a623" };
  const props = { card, estimationUnit: "points", bulkSelected: false, sourceLinkCount: 0, githubIssue: undefined, releaseName: undefined, onSelect: vi.fn(), onBulkToggle: vi.fn(), onUpdateCard: vi.fn() };
  state.root = createRoot(state.host);
  await act(async () => state.root.render(createElement("div", null,
    createElement(ColorNamesContext.Provider, { value: { "#f5a623": "Risk" } }, createElement(CardTile, props)),
    createElement(ColorNamesContext.Provider, { value: undefined }, createElement(CardTile, props))
  )));
  expect(getByRole(state.host, "button", { name: "Color: Risk. Change color" })).toBeDefined();
  expect(getByRole(state.host, "button", { name: "Color: Orange. Change color" })).toBeDefined();
  expect(card.color).toBe("#f5a623");
});

it("uses projected map names and reset defaults in preview filters instead of persisted metadata", async () => {
  state.snapshot.storyMap.colorCategoryNames = { "#f5a623": "Blocker" };
  let preview: ChangeSetPreviewBoard = { snapshot: { ...state.snapshot, storyMap: { ...state.snapshot.storyMap, colorCategoryNames: { "#f5a623": "Risk" } } }, markers: [] };
  function Fixture() { return createElement(BoardToolbar, { state: useStoryMapBoardState(state.snapshot, undefined, preview) }); }
  state.client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  state.root = createRoot(state.host);
  const render = async () => act(async () => state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(Fixture))));
  await render(); await click(getByRole(state.host, "button", { name: "Filters" }));
  const filter = () => getByRole(state.host, "combobox", { name: "Color category" });
  expect(getByRole(filter(), "option", { name: "Risk" })).toBeDefined();
  const { colorCategoryNames: _, ...defaults } = preview.snapshot.storyMap;
  preview = { snapshot: { ...preview.snapshot, storyMap: defaults }, markers: [] }; await render();
  expect(getByRole(filter(), "option", { name: "Orange" })).toBeDefined();
  expect(queryByRole(filter(), "option", { name: "Risk" })).toBeNull();
  expect(state.snapshot.storyMap.colorCategoryNames).toEqual({ "#f5a623": "Blocker" });
});

it.each(["rename", "reset"])("shows %s projected names in the real shell and hides Color names editing", async (mode) => {
  state.snapshot.storyMap.colorCategoryNames = { "#f5a623": "Blocker" };
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, color: "#f5a623" };
  const projected = { ...state.snapshot, storyMap: { ...state.snapshot.storyMap, colorCategoryNames: mode === "rename" ? { "#f5a623": "Risk" } : {} } };
  const changeSet = changeSetSchema.parse({ id: "00000000-0000-4000-8000-000000000009", projectId: state.snapshot.storyMap.projectId, title: "Color-name proposal", source: "mcp", status: "proposed", createdAt: "2026-10-12T00:00:00.000Z", operations: [{ operationId: "edit", op: "update", entity: "storyMap", entityId: storyMapId, baseVersion: 1, after: { colorCategoryNames: projected.storyMap.colorCategoryNames } }] });
  const preview: ChangeSetPreviewResponse = { changeSet, presentationStatus: "proposed", closed: false, selectedOperationIds: ["edit"], conflicts: [], boards: [{ snapshot: projected, markers: [] }], canApprove: true, canApply: false, operations: [{ operationId: "edit", index: 0, label: "Review map colors", kind: "update storyMap", status: "changed", dependencies: [], owners: [], changes: [], operation: changeSet.operations[0] }] };
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith(`/api/changesets/${changeSet.id}/preview`) ? Promise.resolve(Response.json(preview)) : originalFetch(path, init)));
  await mount(`${viewUrl.replace(/tree$/, "discovery")}?preview=${changeSet.id}`);
  await vi.waitFor(() => expect(state.host.textContent).toContain("Color-name proposal"));
  expect(queryByRole(state.host, "button", { name: "Color names" })).toBeNull();
  const expectedName = mode === "rename" ? "Risk" : "Orange";
  await vi.waitFor(() => expect(getByRole(tile(), "button", { name: `Color: ${expectedName}. Change color` })).toBeDefined());
  expect(state.snapshot.storyMap.colorCategoryNames).toEqual({ "#f5a623": "Blocker" });
});

it("uses explicit projected defaults in the detail modal even when its retained snapshot has names", async () => {
  state.snapshot.storyMap.colorCategoryNames = { "#f5a623": "Risk" };
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, color: "#f5a623" };
  const route = createRootRoute({ component: () => createElement(ColorNamesContext.Provider, { value: undefined }, createElement(CardDetailModal, { cardId, snapshot: state.snapshot, projectId: state.snapshot.storyMap.projectId })) });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ["/"] }) });
  state.client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  state.root = createRoot(state.host);
  await act(async () => { state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(RouterProvider, { router }))); await router.load(); });
  const modal = getByRole(document.body, "dialog");
  expect(getByRole(modal, "button", { name: "Orange" }).getAttribute("aria-pressed")).toBe("true");
  expect(queryByRole(modal, "button", { name: "Risk" })).toBeNull();
});
