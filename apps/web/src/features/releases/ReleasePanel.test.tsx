// @vitest-environment jsdom // REQ mounted Release notes remain scoped.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { appStrings, panelStrings } from "@storymapper/ui-strings";
import { ReleasePanel } from "@storymapper/web/features/releases/ReleasePanel";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";

const releaseId = "00000000-0000-4000-8000-000000000001";
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
beforeEach(() => {
  useLiveInteractionStore.setState({ epoch: undefined, restoreRevision: 0, restorePending: false });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

it("renders release external references in the Releases panel", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel
    releases={[{ id: releaseId, version: 1, storyMapId: "map", name: "Delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false }]}
    cards={[]}
    externalRefs={[{ id: "00000000-0000-4000-8000-000000000002", entityType: "release", entityId: releaseId, system: "planner", externalId: "Release-42", scopeId: "map", syncedVersion: 1, createdAt: "2026-10-11T00:00:00.000Z" }]}
  /></QueryClientProvider>));
  expect(host.querySelector(".external-ref-badge")?.textContent).toBe("planner:Release-42");
  expect(host.querySelector(".release-tracking-panel")?.classList.contains("form-stack")).toBe(true);
  expect(host.querySelector(".release-external-refs > .button-row strong")?.textContent).toBe("Delivery");
  expect(host.querySelector(".release-external-refs button")?.classList.contains("secondary")).toBe(true);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.unstubAllGlobals();
});

it("generates read-only notes only for a real Release and ignores delayed previous scope results", async () => {
  const storyMapId = "00000000-0000-4000-8000-000000000003";
  const secondId = "00000000-0000-4000-8000-000000000004";
  let completeFirst!: (response: Response) => void;
  const fetchMock = vi.fn((path: string) => {
    if (path.endsWith(`/${releaseId}/notes`)) return new Promise<Response>((resolve) => { completeFirst = resolve; });
    if (path.endsWith(`/${secondId}/notes`)) return Promise.resolve(Response.json({ markdown: "# Second release" }));
    return Promise.resolve(Response.json({ totalCards: 0, totalStories: 0, estimateTotal: 0, unestimatedCards: 0, unestimatedStories: [], statusCounts: {}, riskCounts: { missingDescription: 0, missingSource: 0, missingGitHubLink: 0 } }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const releases = [releaseId, secondId].map((id) => ({ id, version: 1, storyMapId, name: id, goal: "", position: 0, startDate: null, releaseDate: null, released: false }));
  await act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel storyMapId={storyMapId} releases={releases} cards={[]} externalRefs={[]} /></QueryClientProvider>));
  const generate = () => Array.from(host.querySelectorAll("button")).find((item) => item.textContent === panelStrings.generateReleaseNotes);
  const change = async (scope: string) => { await act(async () => { const select = host.querySelector("select")!; select.value = scope; select.dispatchEvent(new Event("change", { bubbles: true })); }); };
  expect(generate()).toBeUndefined();
  await change("unscheduled"); expect(generate()).toBeUndefined();
  await change(releaseId);
  expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/notes"))).toHaveLength(0);
  await act(async () => generate()!.click());
  expect(generate()!.disabled).toBe(true);
  expect(host.querySelector('[role="status"]')?.textContent).toBe(panelStrings.releaseNotesLoading);
  await change(secondId);
  expect(host.querySelector("textarea")).toBeNull();
  await act(async () => generate()!.click());
  await act(async () => completeFirst(Response.json({ markdown: "# Stale first release" })));
  const notes = host.querySelector("textarea")!;
  expect(notes.value).toBe("# Second release");
  expect(notes.readOnly).toBe(true);
  expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/notes")).map(([path]) => path)).toEqual([
    `/api/story-maps/${storyMapId}/releases/${releaseId}/notes`, `/api/story-maps/${storyMapId}/releases/${secondId}/notes`
  ]);
  await change("all"); expect(host.querySelector("textarea")).toBeNull();
});

it("shows notes errors and removes them when the Story Map changes", async () => {
  const storyMapId = "00000000-0000-4000-8000-000000000005";
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path.endsWith("/notes") ? Response.json({ message: "Notes refused" }, { status: 403 }) : Response.json({ totalCards: 0, totalStories: 0, estimateTotal: 0, unestimatedCards: 0, unestimatedStories: [], statusCounts: {}, riskCounts: { missingDescription: 0, missingSource: 0, missingGitHubLink: 0 } })));
  const releases = [{ id: releaseId, version: 1, storyMapId, name: "Delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false }];
  const render = async (mapId: string) => { await act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel storyMapId={mapId} releases={releases} cards={[]} externalRefs={[]} /></QueryClientProvider>)); };
  await render(storyMapId);
  await act(async () => { const select = host.querySelector("select")!; select.value = releaseId; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => Array.from(host.querySelectorAll("button")).find((item) => item.textContent === panelStrings.generateReleaseNotes)!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(appStrings.requestFailed(403));
  expect(host.querySelector("textarea")).toBeNull();
  await render("00000000-0000-4000-8000-000000000006");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("reconciles a removed selected Release before reading delivery totals", async () => {
  const releases = [{ id: releaseId, version: 1, storyMapId: "map", name: "Delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false }];
  const render = async (items: typeof releases) => act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel releases={items} cards={[]} externalRefs={[]} /></QueryClientProvider>));
  await render(releases);
  await act(async () => { const select = host.querySelector("select")!; select.value = releaseId; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await render([]);
  expect(host.querySelector("select")!.value).toBe("all");
  expect(host.querySelector(".release-summary-grid")).toBeNull();
});

it.each(["pending", "error"])("shows explicit report %s without substituting numeric totals", async (state) => {
  const { cardSchema } = await import("@storymapper/contracts");
  const card = cardSchema.parse({ id: releaseId, storyMapId: releaseId, version: 1, key: "MAP-1", level: "story", parentId: null, releaseId: null, title: "Linked delivery", description: "Linked source and GitHub", estimate: 0, position: 0, creationOrigin: "manual", provenance: "linked", createdAt: "2026-10-17T00:00:00Z", updatedAt: "2026-10-17T00:00:00Z" });
  vi.stubGlobal("fetch", vi.fn(() => state === "pending" ? new Promise<Response>(() => {}) : Promise.resolve(Response.json({ message: "Report unavailable" }, { status: 503 }))));
  await act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel storyMapId={releaseId} releases={[]} cards={[card]} externalRefs={[]} /></QueryClientProvider>));
  expect(host.querySelector(".release-summary-grid")).toBeNull();
  expect(host.querySelector('.release-risk-strip')).toBeNull();
  if (state === "error") await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain(panelStrings.releaseSummaryUnavailable));
  else expect(host.querySelector('[role="status"]')?.textContent).toBe(panelStrings.releaseSummaryLoading);
  expect(host.querySelector('.release-risk-strip')).toBeNull();
});

it("defaults to open Releases and exposes show-all and Unscheduled without changing assignments", async () => {
  const releases = [
    { id: releaseId, version: 1, storyMapId: "map", name: "Open delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false },
    { id: "released", version: 3, storyMapId: "map", name: "Completed delivery", goal: "Completed goal", position: 1, startDate: null, releaseDate: null, released: true }
  ];
  const before = structuredClone(releases);
  const fetchMock = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal("fetch", fetchMock);
  await act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel storyMapId="map" releases={releases} cards={[]} externalRefs={[]} /></QueryClientProvider>));
  expect(host.querySelector('option[value="all"]')?.textContent).toBe(panelStrings.openReleases);
  expect(host.querySelector('option[value="released"]')).toBeNull();
  expect(host.textContent).not.toContain("Completed delivery");
  expect(host.querySelector('option[value="unscheduled"]')).not.toBeNull();
  expect(fetchMock.mock.calls[0]).toEqual(expect.arrayContaining([expect.stringContaining("includeReleased=false")]));
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(host.querySelector('option[value="released"]')?.textContent).toBe("Completed delivery");
  expect(host.textContent).toContain("Completed goal");
  expect(fetchMock.mock.calls[1]).toEqual(expect.arrayContaining([expect.stringContaining("includeReleased=true")]));
  expect(releases).toEqual(before);
});

it("presents the authoritative status distribution and every unestimated Story with the map unit", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    totalCards: 3, totalStories: 3, estimateTotal: 5, unestimatedCards: 2,
    statusCounts: { todo: 1, "Ready for review": 2 },
    unestimatedStories: [{ cardId: "missing1", cardKey: "MAP-1", cardTitle: "First missing estimate" }, { cardId: "missing2", cardKey: "MAP-2", cardTitle: "Second missing estimate" }],
    riskCounts: { missingDescription: 0, missingSource: 0, missingGitHubLink: 0 }
  })));
  await act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel storyMapId="map" releases={[]} cards={[]} externalRefs={[]} estimationUnit="hours" /></QueryClientProvider>));
  expect(host.querySelector('.release-summary-grid')?.textContent).toContain("5 hours");
  expect(host.querySelector('.release-status-distribution')?.textContent).toContain("Ready for review2");
  expect([...host.querySelectorAll('.release-unestimated-stories li')].map((item) => [item.getAttribute("data-card-id"), item.textContent])).toEqual([["missing1", "MAP-1 First missing estimate"], ["missing2", "MAP-2 Second missing estimate"]]);
});

it("uses readonly projected summaries without canonical report reads or editable controls", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel storyMapId="map" releases={[]} cards={[]} externalRefs={[]} preview previewReady /></QueryClientProvider>));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(host.querySelector('.release-summary-grid')?.textContent).toContain("0");
  expect([...host.querySelectorAll('button')].every((item) => item.disabled)).toBe(true);
  expect(host.querySelector('.release-risk-strip')).toBeNull();
});

it("resets editor drafts at Story Map and Restore revision boundaries", async () => {
  const { useLiveInteractionStore } = await import("@storymapper/web/app/live/live-interaction-store");
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  const render = (map: string) => act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel storyMapId={map} releases={[]} cards={[]} externalRefs={[]} /></QueryClientProvider>));
  const open = () => act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === panelStrings.newRelease)!.click());
  await render("first"); await open();
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>('[aria-label="Release name"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Old map draft"); input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await render("second");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await open();
  expect(document.querySelector<HTMLInputElement>('[aria-label="Release name"]')!.value).toBe("");
  await act(async () => useLiveInteractionStore.getState().invalidateReviews());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => {
    useLiveInteractionStore.getState().recordEpoch("before-restore");
    useLiveInteractionStore.getState().recordEpoch("after-restore");
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("exposes delayed summary refresh while retaining cached numbers, then adopts new canonical data", async () => {
  const report = (count: number) => ({ totalCards: count, totalStories: count, estimateTotal: 0, unestimatedCards: 0, unestimatedStories: [], statusCounts: {}, riskCounts: { missingDescription: 0, missingSource: 0, missingGitHubLink: 0 } });
  let resolve!: (response: Response) => void;
  let reads = 0;
  vi.stubGlobal("fetch", vi.fn(() => ++reads === 1 ? Promise.resolve(Response.json(report(1))) : new Promise<Response>((done) => { resolve = done; })));
  await act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel storyMapId="map" releases={[]} cards={[]} externalRefs={[]} /></QueryClientProvider>));
  expect(host.querySelector('.release-summary-grid strong')?.textContent).toBe("1");
  let refreshing!: Promise<unknown>;
  await act(async () => { refreshing = client.invalidateQueries({ queryKey: ["release-summary", "map"] }); });
  expect(host.textContent).toContain(panelStrings.releaseSummaryRefreshing);
  expect(host.querySelector('.release-summary-grid strong')?.textContent).toBe("1");
  await act(async () => { resolve(Response.json(report(2))); await refreshing; });
  expect(host.querySelector('.release-summary-grid strong')?.textContent).toBe("2");
  expect(host.textContent).not.toContain(panelStrings.releaseSummaryRefreshing);
});

it("retries the current failed scope explicitly and adopts its canonical response", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(Response.json({ totalCards: 2, totalStories: 2, estimateTotal: 0, unestimatedCards: 0, unestimatedStories: [], statusCounts: {}, riskCounts: { missingDescription: 0, missingSource: 0, missingGitHubLink: 0 } }));
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => root.render(<QueryClientProvider client={client}><ReleasePanel storyMapId="map" releases={[]} cards={[]} externalRefs={[]} /></QueryClientProvider>));
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain(panelStrings.releaseSummaryUnavailable));
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === panelStrings.retryReleaseSummary)!.click());
  expect(fetchMock.mock.calls[0]![0]).toBe(fetchMock.mock.calls[1]![0]);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('.release-summary-grid strong')?.textContent).toBe("2");
});
