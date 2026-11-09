// @vitest-environment jsdom // REQ Story5.4
import { randomUUID } from "node:crypto";
import { act } from "react";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { changeSetSchema, type ActivityChange, type ActivityChangesResponse, type ChangeSetPreviewResponse } from "@storymapper/contracts";
import { cardId, mount, projectId, state, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";
import { liveUpdatesHeld, useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { router } from "@storymapper/web/app/router";
import { useTreeColumnsStore } from "@storymapper/web/app/stores/tree-columns-store";

function feed() {
  useTreeColumnsStore.setState({ hidden: ["status", "estimate", "assignee"] });
  const epoch = randomUUID();
  const card = { id: cardId, title: "Committed card name", key: "LSM-3", storyMapId, navigation: { key: "LSM-3", storyMapId, mapName: "PRD to Delivery Map", availability: "available" as const } };
  const events: ActivityChange[] = [20, 21, 22].map((seq) => ({ seq, id: randomUUID(), projectId, actor: seq === 21 ? "Editor B" : "Editor A", actorType: "agent", action: "card.updated", affectedEntityType: "card", affectedEntityId: cardId, cards: [{ ...card, changes: [{ field: seq === 21 ? "description" : "status", ...(seq === 21 ? {} : { before: "todo", after: "active" }) }] }], createdAt: "2026-10-15T10:00:00Z" }));
  const snapshot: ActivityChangesResponse = { epoch, floor: 0, highWater: 22, events, nextAfterSeq: null };
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => path.startsWith("/api/activity/changes?") ? Response.json(snapshot) : original(path, init)));
  return snapshot;
}

function trigger(): HTMLButtonElement { return state.host.querySelector<HTMLButtonElement>('[aria-label^="What changed"]')!; }
function drawer(): HTMLElement { return document.querySelector<HTMLElement>("[data-what-changed-drawer]")!; }
async function openDrawer() { await act(async () => { trigger().focus(); trigger().click(); }); return drawer(); }
function button(root: HTMLElement, text: string): HTMLButtonElement { return [...root.querySelectorAll("button")].find((item) => item.textContent === text)!; }
function receipts() { return JSON.parse(localStorage.getItem(`storymapper:what-changed:${projectId}`)!); }

it.each(["tree", "discovery", "slices", "graph", "tracking"])("renders the shared Changed cue on the actual %s surface with one unread Card", async (view) => {
  feed();
  await mount(viewUrl.replace(/tree$/, view));
  await vi.waitFor(() => expect(state.host.querySelectorAll(".changed-marker").length).toBeGreaterThan(0));
  expect(state.host.querySelector(".changed-marker")!.textContent).toBe("~Changed");
  expect(trigger().getAttribute("aria-label")).toBe("What changed (1)");
});

it("groups readable fields across actors, retains event-specific details and local times, and hides technical evidence", async () => {
  const snapshot = feed(); await mount(viewUrl); const panel = await openDrawer();
  expect(panel.querySelectorAll(".what-changed-affected-group")).toHaveLength(1);
  expect(panel.querySelector(".what-changed-card-link")!.textContent).toBe("LSM-3 · Committed card name");
  expect(panel.querySelector(".what-changed-summary")!.textContent).toBe("Status, Description changed · 3 changes");
  expect(panel.textContent).toContain("Editor A");
  expect(panel.textContent).not.toContain("card.updated");
  const time = panel.querySelector("time")!;
  expect(time.dateTime).toBe(snapshot.events[0]!.createdAt); expect(time.textContent).not.toBe(time.dateTime);
  await act(async () => { const details = panel.querySelector("details")!; details.open = true; details.dispatchEvent(new Event("toggle")); });
  expect(panel.textContent).toContain("Description changed"); expect(panel.textContent).toContain("Status: todo → active");
  expect(panel.querySelectorAll("time")).toHaveLength(4);
});

it("keeps previous receipts and markers after a failed save and restores keyboard focus", async () => {
  const snapshot = feed(); await mount(viewUrl); const panel = await openDrawer();
  expect(liveUpdatesHeld(document)).toBe(false); expect(document.querySelector("[inert]")).toBeNull();
  const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
  await act(async () => button(panel, "Mark seen").click());
  expect(panel.querySelector('[role="alert"]')!.textContent).toContain("previous acknowledgement is retained");
  expect(localStorage.getItem(`storymapper:what-changed:${projectId}`)).toBeNull();
  expect(state.host.querySelector(".changed-marker")).not.toBeNull(); failure.mockRestore();
  await act(async () => button(panel, "Retry").click());
  await act(async () => { const action = button(panel, "Mark seen"); action.focus(); action.click(); });
  await vi.waitFor(() => expect(document.activeElement).toBe(panel.querySelector("button")));
  expect(receipts()).toEqual({ epoch: snapshot.epoch, throughSeq: 22, acknowledgedSeqs: [], targetAcknowledgements: {} });
  await act(async () => panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(trigger()); expect(drawer()).toBeNull();
});

it("renders no closed rows and only25 initially, More and key/title search preserve the complete source feed", async () => {
  const snapshot = feed();
  snapshot.events = Array.from({ length: 1000 }, (_, index) => ({ ...snapshot.events[0]!, id: randomUUID(), seq: index + 20, cards: [{ ...snapshot.events[0]!.cards![0]!, id: randomUUID(), key: `KEY-${index}`, title: `Recorded ${index}` }] }));
  snapshot.highWater = 1019; await mount(viewUrl);
  await vi.waitFor(() => expect(trigger().getAttribute("aria-label")).toBe("What changed (1000)"));
  expect(state.host.querySelectorAll(".what-changed-affected-group")).toHaveLength(0);
  const panel = await openDrawer(); expect(panel.querySelectorAll(".what-changed-affected-group")).toHaveLength(25);
  await act(async () => button(panel, "More").click()); expect(panel.querySelectorAll(".what-changed-affected-group")).toHaveLength(50);
  await act(async () => { const input = panel.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "KEY-12"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(panel.querySelectorAll(".what-changed-affected-group")).toHaveLength(11);
  await act(async () => button(panel, "Mark displayed changes as read").click());
  expect(trigger().getAttribute("aria-label")).toBe("What changed (989)");
  expect(state.client.getQueryData<ActivityChangesResponse>(["activity-changes", projectId])!.events).toHaveLength(1000);
});

it("opens the actual Card dialog and acknowledges only its captured target of a multi-Card event", async () => {
  const snapshot = feed(), sibling = state.snapshot.cards[0]!;
  snapshot.events = [{ ...snapshot.events[0]!, action: "changeSet.operation.applied", cards: [snapshot.events[0]!.cards![0]!, { id: sibling.id, storyMapId, title: sibling.title, key: sibling.key, navigation: { key: sibling.key, storyMapId, mapName: "PRD to Delivery Map", availability: "available" } }] }];
  snapshot.highWater = 20; await mount(viewUrl); const panel = await openDrawer();
  expect(trigger().getAttribute("aria-label")).toBe("What changed (2)");
  await act(async () => button(panel, "LSM-3 · Committed card name").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"].card-detail-modal')).not.toBeNull());
  expect(drawer()).toBeNull(); expect(router.state.location.pathname).toBe(viewUrl);
  expect(router.state.location.search.card).toBe(cardId);
  expect(receipts().targetAcknowledgements[`card:${cardId}`]).toEqual([20]);
  expect(receipts().throughSeq).toBe(0); expect(trigger().getAttribute("aria-label")).toBe("What changed (1)");
});

it("keeps deleted and archived history readable without navigation or automatic acknowledgement", async () => {
  const snapshot = feed(); snapshot.events = [{ ...snapshot.events[0]!, cards: [{ id: cardId, storyMapId, key: "LSM-3", title: "Historical deleted title", availability: "deleted" }] }, { ...snapshot.events[1]!, cards: [{ ...snapshot.events[1]!.cards![0]!, id: randomUUID(), navigation: { ...snapshot.events[1]!.cards![0]!.navigation!, availability: "archived" } }] }];
  await mount(viewUrl); const panel = await openDrawer();
  expect(panel.textContent).toContain("Deleted Card"); expect(panel.textContent).toContain("Archived Card");
  expect(panel.textContent).toContain("Historical deleted title"); expect(panel.querySelector(".what-changed-card-link")).toBeNull();
  expect(localStorage.getItem(`storymapper:what-changed:${projectId}`)).toBeNull();
});

it("switches Project scope to the correct Map and waits for actual dialog mount, retaining a concurrent new event", async () => {
  const snapshot = feed(), otherCard = { ...state.snapshot.cards[0]!, id: randomUUID(), storyMapId: state.otherMapId, title: "Same title", key: "OTHER-1" };
  const otherMap = { ...state.snapshot, storyMap: { ...state.snapshot.storyMap, id: state.otherMapId, name: "Other Map" }, cards: [otherCard] };
  const target = { id: otherCard.id, storyMapId: state.otherMapId, title: "Same title", key: otherCard.key, navigation: { key: otherCard.key, storyMapId: state.otherMapId, mapName: "Other Map", availability: "available" as const } };
  snapshot.events.push({ ...snapshot.events[0]!, id: randomUUID(), seq: 23, cards: [target] }); snapshot.highWater = 23;
  let release!: (response: Response) => void; const original = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/story-maps/${state.otherMapId}` ? new Promise<Response>((resolve) => { release = resolve; }) : original(path, init)));
  await mount(viewUrl); const panel = await openDrawer();
  expect(panel.textContent).not.toContain("OTHER-1");
  await act(async () => { const scope = panel.querySelector("select")!; scope.value = "project"; scope.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(panel.textContent).toContain("Other Map");
  await act(async () => button(panel, "OTHER-1 · Same title").click());
  await vi.waitFor(() => expect(release).toBeDefined());
  expect(localStorage.getItem(`storymapper:what-changed:${projectId}`)).toBeNull();
  const future = { ...snapshot.events.at(-1)!, id: randomUUID(), seq: 24 };
  await act(async () => state.client.setQueryData(["activity-changes", projectId], { ...snapshot, highWater: 24, events: [...snapshot.events, future] }));
  await act(async () => release(Response.json(otherMap)));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"].card-detail-modal')?.textContent).toContain("Same title"));
  expect(router.state.location.pathname).toContain(`/story-maps/${state.otherMapId}/discovery`);
  expect(receipts().acknowledgedSeqs).toContain(23); expect(receipts().acknowledgedSeqs).not.toContain(24);
  expect(trigger().getAttribute("aria-label")).toBe("What changed (1)");
});

it("reports stale target navigation and retains unread changes when no Card dialog can mount", async () => {
  const snapshot = feed(); snapshot.events[0]!.cards![0]!.id = randomUUID(); snapshot.events = [snapshot.events[0]!];
  await mount(viewUrl); const panel = await openDrawer();
  await act(async () => panel.querySelector<HTMLButtonElement>(".what-changed-card-link")!.click());
  await vi.waitFor(() => expect(state.host.textContent).toContain("Card details did not open"));
  expect(localStorage.getItem(`storymapper:what-changed:${projectId}`)).toBeNull();
  expect(trigger().getAttribute("aria-label")).toBe("What changed (1) !");
  const recovery = button(state.host, "Return to changes");
  expect(document.activeElement).toBe(recovery);
  await act(async () => recovery.click());
  expect(drawer()).not.toBeNull(); expect(document.activeElement).toBe(drawer().querySelector("button"));
});

it("compacts filtered-only feeds automatically and resets receipts across Restore", async () => {
  const snapshot = feed(); snapshot.events = [{ ...snapshot.events[0]!, action: "changeSet.applied", cards: undefined }]; snapshot.highWater = 22;
  await mount(viewUrl);
  await vi.waitFor(() => expect(receipts().throughSeq).toBe(22));
  expect(trigger().getAttribute("aria-label")).toBe("What changed (0)");
  const restored = { ...snapshot, epoch: randomUUID(), floor: 50, highWater: 51, events: [{ ...snapshot.events[0]!, id: randomUUID(), seq: 51 }] };
  await act(async () => state.client.setQueryData(["activity-changes", projectId], restored));
  await vi.waitFor(() => expect(receipts()).toEqual({ epoch: restored.epoch, throughSeq: 51, acknowledgedSeqs: [], targetAcknowledgements: {} }));
});

it("keeps prior stored bytes when automatic noise compaction fails", async () => {
  const snapshot = feed(); snapshot.events = [{ ...snapshot.events[0]!, action: "changeSet.applied", cards: undefined }];
  const previous = JSON.stringify({ epoch: snapshot.epoch, throughSeq: 10, acknowledgedSeqs: [12], targetAcknowledgements: {} });
  localStorage.setItem(`storymapper:what-changed:${projectId}`, previous);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
  await mount(viewUrl); await openDrawer();
  expect(drawer().querySelector('[role="alert"]')!.textContent).toContain("previous acknowledgement is retained");
  expect(localStorage.getItem(`storymapper:what-changed:${projectId}`)).toBe(previous);
});

it("keeps preview URL, drawer and receipts unchanged when the actual Card button is pressed", async () => {
  feed();
  const changeSet = changeSetSchema.parse({ id: randomUUID(), projectId, title: "Preview restriction", source: "mcp", status: "proposed", createdAt: "2026-10-12T00:00:00.000Z", operations: [{ operationId: "edit", op: "update", entity: "card", entityId: cardId, baseVersion: 1, after: { title: "Projected title" } }] });
  const preview: ChangeSetPreviewResponse = { changeSet, presentationStatus: "proposed", closed: false, selectedOperationIds: ["edit"], conflicts: [], boards: [{ snapshot: state.snapshot, markers: [] }], canApprove: true, canApply: false, operations: [{ operationId: "edit", index: 0, label: "Review Card", kind: "update card", status: "changed", dependencies: [], owners: [], changes: [], operation: changeSet.operations[0] }] };
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith(`/api/changesets/${changeSet.id}/preview`) ? Promise.resolve(Response.json(preview)) : original(path, init)));
  await mount(`${viewUrl}?preview=${changeSet.id}`); const panel = await openDrawer();
  const before = router.state.location.href, stored = localStorage.getItem(`storymapper:what-changed:${projectId}`);
  await act(async () => panel.querySelector<HTMLButtonElement>(".what-changed-card-link")!.click());
  expect(router.state.location.href).toBe(before); expect(drawer()).toBe(panel);
  expect(panel.querySelector('[role="alert"]')!.textContent).toContain("Close the preview");
  expect(localStorage.getItem(`storymapper:what-changed:${projectId}`)).toBe(stored);
});

it("opens the actual operation Restore row from expanded details without executing Restore", async () => {
  const snapshot = feed(), fileName = "actual-agent-operation.sqlite";
  snapshot.events = [{ ...snapshot.events[0]!, action: "changeSet.operation.applied", restorePoint: { fileName, available: true } }];
  const point = { fileName, class: "pre-apply", createdAt: "2026-10-15T09:00:00Z", sizeBytes: 4096, schemaVersion: `release-sha256-${"a".repeat(64)}`, scope: "local-database" };
  const original = fetch; let restores = 0;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path === `/api/human/projects/${projectId}/restore-points`) return Response.json({ restorePoints: [point] });
    if (path === `/api/human/projects/${projectId}/restore`) { restores++; throw new Error("Restore remains explicit"); }
    return original(path, init);
  }));
  await mount(viewUrl); const panel = await openDrawer();
  await act(async () => { const details = panel.querySelector("details")!; details.open = true; details.dispatchEvent(new Event("toggle")); });
  const link = panel.querySelector<HTMLAnchorElement>("a")!;
  expect(new URL(link.href).searchParams.get("restorePoint")).toBe(fileName);
  await act(async () => link.click());
  await vi.waitFor(() => expect(document.querySelector(`[data-restore-point="${fileName}"]`)).not.toBeNull());
  expect(document.activeElement).toBe(document.querySelector(`[data-restore-point="${fileName}"]`));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull(); expect(restores).toBe(0);
});

it("does not bypass held canonical updates on window focus or reconnect", async () => {
  feed(); await mount(viewUrl);
  await vi.waitFor(() => expect(trigger().getAttribute("aria-label")).toBe("What changed (1)"));
  const calls = () => vi.mocked(fetch).mock.calls.filter(([path]) => String(path).startsWith("/api/activity/changes?")).length;
  const initial = calls(); useLiveInteractionStore.getState().setManualHold(true);
  try {
    await act(async () => { focusManager.setFocused(false); onlineManager.setOnline(false); });
    await act(async () => { focusManager.setFocused(true); onlineManager.setOnline(true); });
    expect(liveUpdatesHeld(document)).toBe(true); expect(calls()).toBe(initial);
  } finally { useLiveInteractionStore.getState().setManualHold(false); focusManager.setFocused(undefined); onlineManager.setOnline(true); }
});
