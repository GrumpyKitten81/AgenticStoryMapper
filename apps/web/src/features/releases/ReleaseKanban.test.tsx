// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cardSchema, releaseSchema } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@storymapper/web/app/api";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { ReleaseKanban } from "@storymapper/web/features/releases/ReleaseKanban";

vi.mock("@storymapper/web/app/api", () => ({ api: { updateCard: vi.fn() } }));
const now = "2026-10-10T00:00:00.000Z";
const storyMapId = randomUUID();
const projectId = randomUUID();
const workflowStatuses = (["todo", "active", "done", "archived"] as const).map((name, position) => ({ id: randomUUID(), projectId, storyMapId: null, name, group: name === "archived" ? "done" as const : name, position }));
const card = cardSchema.parse({ creationOrigin: "manual", provenance: "manual", version: 1, id: randomUUID(), storyMapId, parentId: null, releaseId: null, key: "MAP-1", level: "story", title: "Story", position: 0, createdAt: now, updatedAt: now });
const release = releaseSchema.parse({ version: 1, id: randomUUID(), storyMapId, name: "Release", position: 0, startDate: "2026-10-10", releaseDate: "2026-10-10", createdAt: now, updatedAt: now });
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });

it("uses a saved version for a chained edit while the loaded Card snapshot is stale", async () => {
  vi.mocked(api.updateCard).mockResolvedValueOnce({ ...card, version: 2, status: "active" }).mockResolvedValueOnce({ ...card, version: 3, releaseId: release.id });
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseKanban, { cards: [card], dependencyKeys: {}, releases: [release], workflowStatuses, storyMapId, estimationUnit: "hours" }))));
  const selects = host.querySelectorAll<HTMLSelectElement>("select");
  await act(async () => { selects[1]!.value = "active"; selects[1]!.dispatchEvent(new Event("change", { bubbles: true })); });
  await vi.waitFor(() => expect(api.updateCard).toHaveBeenCalledTimes(1));
  await act(async () => { selects[2]!.value = release.id; selects[2]!.dispatchEvent(new Event("change", { bubbles: true })); });
  await vi.waitFor(() => expect(api.updateCard).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.updateCard).mock.calls.map(([, , baseVersion]) => baseVersion)).toEqual([1, 2]);
});

it("renders zero with the configured map unit", async () => {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseKanban, { cards: [{ ...card, estimate: 0 }], dependencyKeys: {}, releases: [], workflowStatuses, storyMapId, estimationUnit: "hours" }))));
  expect(host.textContent).toContain("0 hours");
  expect(host.textContent).not.toContain("pts");
});

it("offers both arbitrary existing Card names locally while keeping linked status selects locked", async () => {
  const first = { ...card, status: "First arbitrary status" };
  const second = { ...card, id: randomUUID(), key: "MAP-2", status: "Second arbitrary status" };
  const props = { cards: [first], canonicalCards: [first, second], dependencyKeys: {}, releases: [], workflowStatuses: [], storyMapId, estimationUnit: "hours" };
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseKanban, props))));
  const status = host.querySelector<HTMLSelectElement>(".release-card-actions select")!;
  expect([...status.options].map((option) => option.value)).toEqual([first.status, second.status]);
  expect(status.disabled).toBe(false);
  const link = { id: randomUUID(), externalRefId: randomUUID(), connectionId: randomUUID(), provider: "github" as const, cardId: first.id, remoteId: "1", remoteNumber: 1, url: "https://github.com/owner/repo/issues/1", labels: [], parentOverrideLocal: false, syncState: "synced" as const };
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseKanban, { ...props, remoteWorkItemLinks: [link] }))));
  expect(host.querySelector<HTMLSelectElement>(".release-card-actions select")!.disabled).toBe(true);
});

it("uses actual source and GitHub links in shared risks and exposes mutation refusal", async () => {
  vi.mocked(api.updateCard).mockRejectedValue(new Error("Edit refused"));
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseKanban, { cards: [{ ...card, description: "Delivery" }], dependencyKeys: {}, releases: [], workflowStatuses, storyMapId, estimationUnit: "hours", sourceLinkedCardIds: [card.id], githubLinkedCardIds: [card.id] }))));
  expect([...host.querySelectorAll('.release-risk-strip span')].map((element) => element.textContent)).toEqual(["0 descriptions", "0 sources", "0 GitHub"]);
  const status = host.querySelector<HTMLSelectElement>(`[aria-label="Status for ${card.key}"]`)!;
  await act(async () => { status.value = "active"; status.dispatchEvent(new Event("change", { bubbles: true })); });
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe("Edit refused"));
});

it("retains removed parked/archived Story and ancestor/Release ghosts without counting them in delivery totals", async () => {
  const ancestor = { ...card, id: randomUUID(), level: "activity" as const, key: "MAP-2", parked: true, title: "Removed ancestor" };
  const removed = { ...card, id: randomUUID(), key: "MAP-3", title: "Removed Story", status: "archived", parentId: ancestor.id, releaseId: release.id, estimate: 30 };
  const own = { ...card, title: "Removed parked Story", parked: true, estimate: 20 };
  const cards = [ancestor, removed, own];
  const { storyMapSnapshotSchema } = await import("@storymapper/contracts");
  const snapshot = storyMapSnapshotSchema.parse({ storyMap: { id: storyMapId, projectId, name: "Removed preview", version: 1, createdAt: now, updatedAt: now }, cards, cardDependencies: [], releases: [{ ...release, released: true }] });
  const preview = { snapshot, markers: [...cards.map((card) => ({ entity: "card", entityId: card.id, kind: "removed" as const, operationIds: [] })), { entity: "release", entityId: release.id, kind: "removed" as const, operationIds: [] }] };
  const render = (currentPreview: typeof preview) => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseKanban, { cards, dependencyKeys: {}, releases: snapshot.releases, workflowStatuses, storyMapId, estimationUnit: "hours", preview: currentPreview }))));
  await render({ ...preview, markers: preview.markers.filter((marker) => marker.entity !== "release") });
  expect(host.querySelectorAll('article')).toHaveLength(2);
  await render(preview);
  expect([...host.querySelectorAll('article')].map((element) => element.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Removed Story"), expect.stringContaining("Removed parked Story")]));
  expect(host.querySelectorAll('article.preview-removed .preview-marker')).toHaveLength(2);
  expect(host.querySelector('.preview-removed .preview-marker')).not.toBeNull();
  expect([...host.querySelectorAll('.release-summary-grid strong')].map((element) => element.textContent)).toEqual(["0", "0", "0 hours", "0"]);
  expect(host.querySelector<HTMLSelectElement>('.release-kanban-scope select')!.querySelector(`option[value="${release.id}"]`)).not.toBeNull();
  expect([...host.querySelectorAll<HTMLSelectElement>('.release-card-actions select')].every((element) => element.disabled)).toBe(true);
});


it("recovers a focused Card control when a status move reparents it and when Release scope removes it", async () => {
  const render = (cards: typeof card[]) => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseKanban, { cards, dependencyKeys: {}, releases: [release], workflowStatuses, storyMapId, estimationUnit: "hours" }))));
  await render([{ ...card, releaseId: release.id }]);
  const selector = `[aria-label="Status for ${card.key}"]`;
  const original = host.querySelector<HTMLSelectElement>(selector)!;
  original.focus();
  await render([{ ...card, releaseId: release.id, status: "active" }]);
  expect(document.activeElement).toBe(host.querySelector(selector));
  const scope = host.querySelector<HTMLSelectElement>('.release-kanban-scope select')!;
  await act(async () => { scope.value = release.id; scope.dispatchEvent(new Event("change", { bubbles: true })); });
  host.querySelector<HTMLSelectElement>(selector)!.focus();
  await render([{ ...card, releaseId: null, status: "active" }]);
  expect(document.activeElement).toBe(scope);
});

it("drops acknowledged pre-Restore versions only when the live epoch changes", async () => {
  useLiveInteractionStore.setState({ epoch: "before", restoreRevision: 0, restorePending: false });
  const render = (version: number) => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseKanban, { cards: [{ ...card, version }], dependencyKeys: {}, releases: [], workflowStatuses, storyMapId, estimationUnit: "hours" }))));
  vi.mocked(api.updateCard).mockResolvedValue({ ...card, version: 10 });
  await render(9);
  const edit = () => act(async () => { const control = host.querySelector<HTMLSelectElement>(`[aria-label="Status for ${card.key}"]`)!; control.value = "active"; control.dispatchEvent(new Event("change", { bubbles: true })); });
  await edit();
  await render(4);
  await edit();
  expect(vi.mocked(api.updateCard).mock.lastCall![2]).toBe(10);
  await act(async () => useLiveInteractionStore.getState().recordEpoch("restored"));
  await render(4);
  await act(async () => useLiveInteractionStore.getState().finishEpoch("restored"));
  await edit();
  expect(vi.mocked(api.updateCard).mock.lastCall![2]).toBe(4);
});


it("ignores a pending pre-Restore acknowledgement and refuses a queued pre-Restore intent", async () => {
  useLiveInteractionStore.setState({ epoch: "before", restorePending: false });
  const render = (version: number) => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseKanban, { cards: [{ ...card, version }], dependencyKeys: {}, releases: [release], workflowStatuses, storyMapId, estimationUnit: "hours" }))));
  let finish!: (value: typeof card) => void;
  vi.mocked(api.updateCard).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue({ ...card, version: 5 });
  await render(9);
  const status = host.querySelector<HTMLSelectElement>(`[aria-label="Status for ${card.key}"]`)!;
  const scope = host.querySelector<HTMLSelectElement>(`[aria-label="Release for ${card.key}"]`)!;
  await act(async () => { status.value = "active"; status.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => { scope.value = release.id; scope.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(api.updateCard).toHaveBeenCalledTimes(1);
  await act(async () => useLiveInteractionStore.getState().recordEpoch("after"));
  await render(4);
  await act(async () => { useLiveInteractionStore.getState().finishEpoch("after"); finish({ ...card, version: 10 }); });
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain("changed since you loaded it"));
  expect(api.updateCard).toHaveBeenCalledTimes(1);
  await act(async () => { status.value = "done"; status.dispatchEvent(new Event("change", { bubbles: true })); });
  await vi.waitFor(() => expect(api.updateCard).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.updateCard).mock.lastCall![2]).toBe(4);
});

it.each(["release", "detail", "unscope", "moved"])("recovers %s focus without stealing deliberate focus", async (control) => {
  const render = (releaseId: string | null, status = "todo") => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseKanban, { cards: [{ ...card, releaseId, status }], dependencyKeys: {}, releases: [release], workflowStatuses, storyMapId, estimationUnit: "hours" }))));
  await render(release.id);
  const controls = host.querySelectorAll<HTMLElement>('.release-card-actions select, .release-card-actions button');
  const focused = controls[control === "release" ? 1 : control === "unscope" ? 3 : 2]!;
  focused.focus();
  const label = focused.getAttribute("aria-label");
  const scope = host.querySelector<HTMLSelectElement>('.release-kanban-scope select')!;
  if (control === "moved") scope.focus();
  await render(null, "active");
  if (control === "moved") expect(document.activeElement).toBe(scope);
  else if (control === "unscope") expect(document.activeElement).toBe(host.querySelector('.release-card-actions select'));
  else expect(document.activeElement?.getAttribute("aria-label")).toBe(label);
});
