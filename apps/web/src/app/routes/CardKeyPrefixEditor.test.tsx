// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { storyMapSchema, type StoryMap } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { ConflictError } from "@storymapper/web/app/conflicts";
import { CardKeyPrefixEditor } from "@storymapper/web/app/routes/CardKeyPrefixEditor";

vi.mock("@storymapper/web/app/api", () => ({ api: { updateStoryMap: vi.fn() } }));
let map: StoryMap;
let loading = false;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const render = (readOnly = false) => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(CardKeyPrefixEditor, { storyMap: loading ? undefined : map, readOnly }))));
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => (item.getAttribute("aria-label") ?? item.textContent) === label)!;
const click = (label: string) => act(async () => button(label).click());
const input = () => document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
const type = (value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
  input().dispatchEvent(new Event("input", { bubbles: true }));
});
const submit = () => act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const conflict = (current: StoryMap) => new ConflictError("changed", [{ entity: "storyMap", id: current.id, baseVersion: 1, currentVersion: current.version, current }]);

beforeEach(() => {
  loading = false;
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const now = new Date().toISOString();
  map = storyMapSchema.parse({ id: randomUUID(), projectId: randomUUID(), name: "Map", version: 1, createdAt: now, updatedAt: now });
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

it("saves explicitly against the captured map/version despite incoming updates and map switches", async () => {
  const captured = map;
  vi.mocked(api.updateStoryMap).mockResolvedValue({ storyMap: { ...captured, cardKeyPrefix: "NEW", version: 2 } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  await render(); await click("Edit Card Key prefix"); await type(" NEW ");
  expect(api.updateStoryMap).not.toHaveBeenCalled();
  map = { ...map, version: 7, cardKeyPrefix: "REMOTE" };
  await render();
  loading = true;
  await render();
  expect(input().value).toBe(" NEW ");
  loading = false;
  map = { ...map, id: randomUUID(), name: "Other map" };
  await render();
  expect(input().value).toBe(" NEW ");
  await submit();
  expect(api.updateStoryMap).toHaveBeenCalledWith(captured.id, { cardKeyPrefix: "NEW" }, 1);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["story-map", captured.id] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["story-maps", captured.projectId] });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("retains the draft on conflict and requires explicit Keep mine before retrying with current version", async () => {
  const remote = { ...map, version: 2, cardKeyPrefix: "REMOTE" };
  vi.mocked(api.updateStoryMap).mockRejectedValueOnce(conflict(remote)).mockResolvedValueOnce({ storyMap: { ...remote, version: 3, cardKeyPrefix: "MINE" } });
  await render(); await click("Edit Card Key prefix"); await type("MINE"); await submit();
  await vi.waitFor(() => expect(document.querySelector(".conflict-alert")).not.toBeNull());
  expect(input().value).toBe("MINE");
  expect(button("Save prefix").disabled).toBe(true);
  await submit(); expect(api.updateStoryMap).toHaveBeenCalledTimes(1);
  await click("Keep mine");
  expect(api.updateStoryMap).toHaveBeenLastCalledWith(map.id, { cardKeyPrefix: "MINE" }, 2);
});

it("reloads the conflicting prefix and baseline only on explicit Reload", async () => {
  const remote = { ...map, version: 3, cardKeyPrefix: "REMOTE" };
  vi.mocked(api.updateStoryMap).mockRejectedValueOnce(conflict(remote)).mockResolvedValueOnce({ storyMap: { ...remote, version: 4, cardKeyPrefix: "EDIT" } });
  await render(); await click("Edit Card Key prefix"); await type("MINE"); await submit();
  await vi.waitFor(() => expect(document.querySelector(".conflict-alert")).not.toBeNull());
  await click("Reload"); expect(input().value).toBe("REMOTE");
  await type("EDIT"); await submit();
  expect(api.updateStoryMap).toHaveBeenLastCalledWith(map.id, { cardKeyPrefix: "EDIT" }, 3);
});

it("refuses blank prefixes and disables all mutation paths in read-only preview", async () => {
  await render(true); expect(button("Edit Card Key prefix").disabled).toBe(true);
  await render(); await click("Edit Card Key prefix"); await type("  ");
  expect(button("Save prefix").disabled).toBe(true);
  await submit(); expect(api.updateStoryMap).not.toHaveBeenCalled();
  await type("VALID"); await render(true); await submit();
  expect(input().disabled).toBe(true);
  expect(button("Save prefix").disabled).toBe(true);
  expect(api.updateStoryMap).not.toHaveBeenCalled();
});


it("admits one delayed save, blocks dismissal and preserves an ordinary error for retry", async () => {
  let rejectSave!: (reason: Error) => void;
  vi.mocked(api.updateStoryMap).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject; }))
    .mockResolvedValueOnce({ storyMap: { ...map, version: 2, cardKeyPrefix: "RETRY" } });
  await render(); await click("Edit Card Key prefix"); await type("RETRY");
  await act(async () => {
    const form = document.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(api.updateStoryMap).toHaveBeenCalledTimes(1);
  expect(document.querySelector("form")!.getAttribute("aria-busy")).toBe("true");
  expect(button("Close").disabled).toBe(true);
  await click("Close");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(input().value).toBe("RETRY");
  await act(async () => rejectSave(new Error("Local save failed")));
  await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toBe("Local save failed"));
  expect(input().value).toBe("RETRY");
  expect(document.querySelector("form")!.getAttribute("aria-busy")).toBe("false");
  expect(button("Save prefix").disabled).toBe(false);
  await submit();
  expect(api.updateStoryMap).toHaveBeenCalledTimes(2);
  expect(api.updateStoryMap).toHaveBeenLastCalledWith(map.id, { cardKeyPrefix: "RETRY" }, 1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
