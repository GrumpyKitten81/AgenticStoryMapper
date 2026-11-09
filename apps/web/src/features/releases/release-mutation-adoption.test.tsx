// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { releaseSchema, storyMapSnapshotSchema, type Card, type StoryMapSnapshot } from "@storymapper/contracts";
import { buildReleaseSummaryReport } from "@storymapper/core";
import { useStoryMap } from "@storymapper/web/app/api";
import { liveUpdatesHeld } from "@storymapper/web/app/live/live-interaction-store";
import { ReleasePanel } from "@storymapper/web/features/releases/ReleasePanel";
import { ReleaseKanban } from "@storymapper/web/features/releases/ReleaseKanban";
import { useStoryMapBoardState } from "@storymapper/web/features/story-map";

const mapId = randomUUID(), projectId = randomUUID(), releaseId = randomUUID();
const now = "2026-10-17T00:00:00Z";
const actions = { move: "Move second Story", bulk: "Unassign both Stories" };
let snapshot: StoryMapSnapshot;
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

function Consumer({ value }: { value: StoryMapSnapshot }) {
  const board = useStoryMapBoardState(value, projectId);
  return <>
    <ReleasePanel storyMapId={mapId} releases={value.releases} cards={value.cards} externalRefs={[]} estimationUnit="hours" />
    <ReleaseKanban storyMapId={mapId} releases={value.releases} cards={value.cards} workflowStatuses={[]} dependencyKeys={{}} estimationUnit="hours" />
    <button onClick={() => board.moveCard.mutate({ cardId: value.cards[1]!.id, patch: { parentId: null, position: 1, releaseId } })}>{actions.move}</button>
    <button onClick={() => board.bulkUpdateCards.mutate({ storyMapId: mapId, cardIds: value.cards.map((card) => card.id), patch: { releaseId: null } })}>{actions.bulk}</button>
  </>;
}

function Probe() {
  const query = useStoryMap(mapId);
  return query.data ? <Consumer value={query.data} /> : null;
}

function report(path: string) {
  const query = new URL(path, "http://localhost").searchParams;
  const scope = query.get("releaseId");
  return buildReleaseSummaryReport({ storyMapId: mapId, cards: snapshot.cards, releases: snapshot.releases,
    sourceLinkedCardIds: [], githubLinkedCardIds: [], includeReleased: query.get("includeReleased") !== "false",
    ...(scope ? { releaseId: scope === "unscheduled" ? null : scope } : {}) });
}

function updateCard(id: string, patch: Partial<Card> & { baseVersion?: number }) {
  const current = snapshot.cards.find((card) => card.id === id)!;
  expect(patch.baseVersion).toBe(current.version);
  const { baseVersion: _version, ...fields } = patch;
  const saved = { ...current, ...fields, version: current.version + 1 };
  snapshot = { ...snapshot, cards: snapshot.cards.map((card) => card.id === id ? saved : card) };
  return saved;
}

async function transport(path: string, init?: RequestInit) {
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  if (path === `/api/story-maps/${mapId}`) return Response.json(snapshot);
  if (path.startsWith("/api/reports/release-summary?")) return Response.json(report(path));
  if (path === "/api/releases" && init?.method === "POST") {
    const saved = releaseSchema.parse({ ...body, id: randomUUID(), version: 1, position: snapshot.releases.length });
    snapshot = { ...snapshot, releases: [...snapshot.releases, saved] };
    return Response.json(saved, { status: 201 });
  }
  if (path === `/api/releases/${releaseId}` && init?.method === "PATCH") {
    const current = snapshot.releases.find((release) => release.id === releaseId)!;
    expect(body.baseVersion).toBe(current.version);
    const saved = releaseSchema.parse({ ...current, ...body, version: current.version + 1 });
    snapshot = { ...snapshot, releases: snapshot.releases.map((release) => release.id === releaseId ? saved : release) };
    return Response.json(saved);
  }
  if (path === "/api/cards/bulk" && init?.method === "PATCH") return Response.json({ cards: body.cards.map((card: { id: string; baseVersion: number }) => updateCard(card.id, { ...body.patch, baseVersion: card.baseVersion })) });
  const card = snapshot.cards.find((candidate) => path === `/api/cards/${candidate.id}` || path === `/api/cards/${candidate.id}/move`);
  if (card) return Response.json(updateCard(card.id, body));
  throw new Error(`Unexpected request: ${path}`);
}

const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label)!;
const field = (label: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
async function setField(label: string, value: string) {
  await act(async () => {
    const input = field(label);
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function select(element: HTMLSelectElement, value: string) {
  await act(async () => { element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function totals(expected: string[], missingIds: string[]) {
  await vi.waitFor(() => {
    const summaries = [...host.querySelectorAll(".release-summary-grid")];
    expect(summaries).toHaveLength(2);
    for (const summary of summaries) expect([...summary.querySelectorAll("strong")].map((item) => item.textContent)).toEqual(expected);
    for (const list of host.querySelectorAll(".release-unestimated-stories")) expect([...list.querySelectorAll("li")].map((item) => item.getAttribute("data-card-id"))).toEqual(missingIds);
  });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  notifyManager.setScheduler(queueMicrotask);
  snapshot = storyMapSnapshotSchema.parse({ storyMap: { id: mapId, projectId, name: "Delivery", version: 1, createdAt: now, updatedAt: now },
    cardDependencies: [], releases: [{ id: releaseId, storyMapId: mapId, name: "Current", goal: "Initial goal", version: 1, position: 0, startDate: null, releaseDate: null }],
    cards: [0, 1].map((index) => ({ id: randomUUID(), storyMapId: mapId, key: `MAP-${index + 1}`, title: `Story ${index + 1}`, level: "story", parentId: null, releaseId: null,
      ...(index ? {} : { estimate: 0 }), status: "todo", position: index, version: 1, creationOrigin: "manual", provenance: "manual", createdAt: now, updatedAt: now })) });
  vi.stubGlobal("fetch", vi.fn(transport));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  await totals(["2", "2", "0 hours", "1"], [snapshot.cards[1]!.id]);
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

it("adopts successful creation into the mounted list and closes the dialog and live hold", async () => {
  await act(async () => button("New release").click());
  await setField("Release name", "Next delivery"); await setField("Release goal", "Created goal");
  await setField("Start date", "2026-10-17"); await setField("Release date", "2026-11-17");
  expect(liveUpdatesHeld(document)).toBe(true);
  await act(async () => button("Save").click());
  await vi.waitFor(() => {
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector(".release-external-refs")!.textContent).toContain("Next deliveryCreated goal");
    expect(host.querySelector(".release-external-refs")!.textContent).toContain("2026-11-17");
  });
  expect(liveUpdatesHeld(document)).toBe(false);
  await totals(["2", "2", "0 hours", "1"], [snapshot.cards[1]!.id]);
});

it("adopts a saved released flag into open lists and both summaries and shows persisted fields in history", async () => {
  snapshot = { ...snapshot, cards: snapshot.cards.map((card) => ({ ...card, releaseId })) };
  await act(async () => { await client.invalidateQueries({ queryKey: ["story-map", mapId] }); await client.invalidateQueries({ queryKey: ["release-summary", mapId] }); });
  await act(async () => button("Edit release Current").click());
  await setField("Release name", "Shipped delivery"); await setField("Release goal", "Saved delivery goal");
  await setField("Start date", "2026-10-01"); await setField("Release date", "2026-10-17");
  await act(async () => document.querySelector<HTMLInputElement>('[role="dialog"] input[type="checkbox"]')!.click());
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(host.querySelector(".release-external-refs")!.textContent).not.toContain("Current"));
  expect(host.querySelector(".release-external-refs")!.textContent).not.toContain("Shipped delivery");
  await totals(["0", "0", "0 hours", "0"], []);
  await act(async () => button("Cancel").click());
  for (const checkbox of host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) await act(async () => checkbox.click());
  await totals(["2", "2", "0 hours", "1"], [snapshot.cards[1]!.id]);
  const listing = host.querySelector(".release-external-refs")!.textContent;
  expect(listing).toContain("Shipped deliverySaved delivery goal"); expect(listing).toContain("2026-10-01"); expect(listing).toContain("2026-10-17");
});

it("consumes form, move and bulk assignment invalidations in both mounted summaries", async () => {
  const missing = snapshot.cards[1]!;
  await select(host.querySelector<HTMLSelectElement>(`[aria-label="Release for ${snapshot.cards[0]!.key}"]`)!, releaseId);
  await select(host.querySelector<HTMLSelectElement>(".release-tracking-panel > label select")!, releaseId);
  await select(host.querySelector<HTMLSelectElement>(".release-kanban-scope select")!, releaseId);
  await totals(["1", "1", "0 hours", "0"], []);
  await act(async () => button(actions.move).click());
  await totals(["2", "2", "0 hours", "1"], [missing.id]);
  await act(async () => button(actions.bulk).click());
  await totals(["0", "0", "0 hours", "0"], []);
  expect(snapshot.cards.map((card) => [card.releaseId, card.version])).toEqual([[null, 3], [null, 3]]);
});
