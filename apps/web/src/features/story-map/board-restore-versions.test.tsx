// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { storyMapSnapshotSchema, type StoryMapSnapshot } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@storymapper/web/app/api";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { useStoryMapBoardState, type StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";

const mapId = randomUUID();
const storyId = randomUUID();
const stepId = randomUUID();
const releaseId = randomUUID();
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let snapshot: StoryMapSnapshot;
let currentBoard: StoryMapBoardState;

function Fixture() {
  currentBoard = useStoryMapBoardState(snapshot, snapshot.storyMap.projectId);
  return null;
}
async function refreshServer(next: StoryMapSnapshot) {
  snapshot = next;
  await act(async () => root.render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>));
}
beforeEach(async () => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useLiveInteractionStore.setState({ epoch: undefined, restorePending: false, restoreRevision: 0 });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const now = "2026-10-10T00:00:00.000Z";
  const card = { creationOrigin: "manual", provenance: "manual", version: 1, storyMapId: mapId, releaseId: null, status: "todo", parked: false, createdAt: now, updatedAt: now };
  snapshot = storyMapSnapshotSchema.parse({
    storyMap: { id: mapId, projectId: randomUUID(), name: "Lifecycle acceptance", version: 1, createdAt: now, updatedAt: now },
    cards: [{ ...card, id: stepId, key: "LSM-2", parentId: null, position: 0, level: "step", title: "Retained step" }, { ...card, id: storyId, key: "LSM-3", parentId: stepId, releaseId, position: 0, level: "story", title: "Retained story" }],
    cardDependencies: [],
    releases: [{ id: releaseId, storyMapId: mapId, name: "Delivery", version: 1, position: 0, startDate: "2026-10-01", releaseDate: "2026-10-31", createdAt: now, updatedAt: now }]
  });
  await refreshServer(snapshot);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

it("refuses queued board edits and ignores late save acknowledgements across Restore", async () => {
  await act(async () => useLiveInteractionStore.setState({ epoch: "before", restorePending: false }));
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === storyId ? { ...card, version: 9 } : card) });
  let finish!: (card: StoryMapSnapshot["cards"][number]) => void;
  const writes = vi.spyOn(api, "updateCard").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue({ ...snapshot.cards.find((card) => card.id === storyId)!, version: 5 });
  await act(async () => currentBoard.updateCard.mutate({ cardId: storyId, patch: { priority: "2" } }));
  await act(async () => currentBoard.updateCard.mutate({ cardId: storyId, patch: { priority: "3" } }));
  expect(writes).toHaveBeenCalledTimes(1);
  await act(async () => useLiveInteractionStore.getState().recordEpoch("after"));
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === storyId ? { ...card, version: 4 } : card) });
  await act(async () => {
    useLiveInteractionStore.getState().finishEpoch("after");
    finish({ ...snapshot.cards.find((card) => card.id === storyId)!, version: 10 });
  });
  await vi.waitFor(() => expect(currentBoard.updateCard.error?.message).toContain("changed since you loaded it"));
  expect(writes).toHaveBeenCalledTimes(1);
  await act(async () => currentBoard.updateCard.mutate({ cardId: storyId, patch: { priority: "4" } }));
  await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(2));
  expect(writes).toHaveBeenLastCalledWith(storyId, { priority: "4" }, 4);
});


it.each(["archiveCard", "moveCard", "updateRelease", "parkCard", "unparkCard", "bulkUpdateCards"] as const)("ignores a late %s acknowledgement after Restore lowers the persisted version", async (method) => {
  await act(async () => useLiveInteractionStore.setState({ epoch: "before", restorePending: false }));
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === storyId ? { ...card, version: 9 } : card), releases: snapshot.releases.map((release) => ({ ...release, version: 9 })) });
  const savedCard = { ...snapshot.cards.find((card) => card.id === storyId)!, version: 10 };
  const savedRelease = { ...snapshot.releases[0]!, version: 10 };
  let finish!: () => void;
  const pending = new Promise<never>((resolve) => { finish = () => resolve((method === "bulkUpdateCards" ? { cards: [savedCard] } : method === "updateRelease" ? savedRelease : savedCard) as never); });
  vi.spyOn(api, method).mockReturnValueOnce(pending);
  await act(async () => {
    if (method === "archiveCard" || method === "unparkCard") currentBoard[method].mutate({ cardId: storyId });
    else if (method === "moveCard") currentBoard.moveCard.mutate({ cardId: storyId, patch: { parentId: stepId, position: 0 } });
    else if (method === "updateRelease") currentBoard.updateRelease.mutate({ releaseId, patch: { name: "Saved release" } });
    else if (method === "parkCard") currentBoard.parkCard.mutate({ cardId: storyId, childStrategy: "unassign" });
    else currentBoard.bulkUpdateCards.mutate({ storyMapId: mapId, cardIds: [storyId], patch: { status: "active" } });
  });
  await act(async () => useLiveInteractionStore.getState().recordEpoch("after"));
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === storyId ? { ...card, version: 4 } : card), releases: snapshot.releases.map((release) => ({ ...release, version: 4 })) });
  await act(async () => { useLiveInteractionStore.getState().finishEpoch("after"); finish(); });
  await vi.waitFor(() => expect(currentBoard[method].isSuccess).toBe(true));
  if (method === "updateRelease") {
    const writes = vi.mocked(api.updateRelease).mockResolvedValue({ ...savedRelease, version: 5 });
    await act(async () => currentBoard.updateRelease.mutate({ releaseId, patch: { name: "After Restore" } }));
    expect(writes).toHaveBeenLastCalledWith(releaseId, { name: "After Restore" }, 4);
  } else {
    const writes = vi.spyOn(api, "updateCard").mockResolvedValue({ ...savedCard, version: 5 });
    await act(async () => currentBoard.updateCard.mutate({ cardId: storyId, patch: { priority: "4" } }));
    expect(writes).toHaveBeenLastCalledWith(storyId, { priority: "4" }, 4);
  }
});

it.each(["archiveCard", "moveCard", "updateRelease", "parkCard", "unparkCard", "bulkUpdateCards", "deleteRelease", "deleteCard", "deleteCards"] as const)("refuses a queued %s intent before any post-Restore API call", async (method) => {
  await act(async () => useLiveInteractionStore.setState({ epoch: "before", restorePending: false }));
  let finish!: (card: StoryMapSnapshot["cards"][number]) => void;
  vi.spyOn(api, "updateCard").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const writes = vi.spyOn(api, method).mockRejectedValue(new Error("Unexpected API call"));
  await act(async () => currentBoard.updateCard.mutate({ cardId: storyId, patch: { priority: "2" } }));
  await act(async () => {
    if (method === "archiveCard" || method === "unparkCard") currentBoard[method].mutate({ cardId: storyId });
    else if (method === "moveCard") currentBoard.moveCard.mutate({ cardId: storyId, patch: { parentId: stepId, position: 0 } });
    else if (method === "updateRelease") currentBoard.updateRelease.mutate({ releaseId, patch: { name: "Queued release" } });
    else if (method === "parkCard") currentBoard.parkCard.mutate({ cardId: storyId, childStrategy: "unassign" });
    else if (method === "bulkUpdateCards") currentBoard.bulkUpdateCards.mutate({ storyMapId: mapId, cardIds: [storyId], patch: { status: "active" } });
    else if (method === "deleteRelease") currentBoard.deleteRelease.mutate({ releaseId });
    else if (method === "deleteCard") currentBoard.deleteCard.mutate({ cardId: storyId, strategy: "unassign" });
    else currentBoard.deleteCards.mutate({ storyMapId: mapId, cards: [{ id: storyId, baseVersion: 1 }], affectedCards: [{ id: storyId, baseVersion: 1 }], strategy: "unassign" });
  });
  expect(writes).not.toHaveBeenCalled();
  await act(async () => useLiveInteractionStore.getState().recordEpoch("after"));
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => ({ ...card, version: 4 })) });
  await act(async () => { useLiveInteractionStore.getState().finishEpoch("after"); finish({ ...snapshot.cards.find((card) => card.id === storyId)!, version: 10 }); });
  await vi.waitFor(() => expect(currentBoard[method].error?.message).toContain("changed since you loaded it"));
  expect(writes).not.toHaveBeenCalled();
});
