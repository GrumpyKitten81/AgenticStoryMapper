// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { storyMapSchema, type StoryMap } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { liveUpdatesHeld, useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { useAnnouncementStore } from "@storymapper/web/app/stores/announcement-store";
import { ColorNamesEditor } from "@storymapper/web/features/story-map/components/ColorNamesEditor";
import { ColorNames } from "@storymapper/web/features/story-map/components/ColorNames";

const initial = storyMapSchema.parse({ id: "00000000-0000-4000-8000-000000000001", projectId: "00000000-0000-4000-8000-000000000002", name: "Map", version: 5, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z" });
let host: HTMLDivElement, root: Root, client: QueryClient;
const close = vi.fn();
const titleId = "color-names-heading";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ epoch: "before-restore", restorePending: false });
  useAnnouncementStore.setState({ status: "", alert: "" });
  close.mockReset(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); useLiveInteractionStore.setState({ epoch: undefined, restorePending: false }); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });
async function mount(map = initial) { await act(async () => root.render(<QueryClientProvider client={client}><ColorNamesEditor map={map} titleId={titleId} onClose={close} /></QueryClientProvider>)); }
const button = (name: string) => getByRole(host, "button", { name }) as HTMLButtonElement;
const input = (name: string) => getByRole(host, "textbox", { name }) as HTMLInputElement;
async function enter(name: string, value: string) {
  const element = input(name);
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
}
const click = async (name: string) => act(async () => { button(name).click(); });

it("saves all renamed categories in one versioned map command, refreshes consumers and announces success", async () => {
  const save = vi.spyOn(api, "updateStoryMap").mockResolvedValue({ storyMap: initial });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  await mount(); expect(host.querySelectorAll("input")).toHaveLength(10); expect(button("Save").disabled).toBe(true);
  await enter("Orange", " Risk "); await enter("Red", "Risk"); await click("Save");
  expect(save).toHaveBeenCalledExactlyOnceWith(initial.id, { colorCategoryNames: { "#f5a623": "Risk", "#e5484d": "Risk" } }, 5);
  expect(invalidate.mock.calls.map(([query]) => query?.queryKey)).toEqual([["story-map", initial.id], ["story-maps"], ["activity"]]);
  expect(close).toHaveBeenCalledOnce(); expect(useAnnouncementStore.getState().status).toBe("Color names saved.");
});

it("resets only the chosen override and sends an empty object when the last override is removed", async () => {
  const save = vi.spyOn(api, "updateStoryMap").mockResolvedValue({ storyMap: initial });
  await mount({ ...initial, colorCategoryNames: { "#f5a623": "Risk", "#e5484d": "Blocker" } });
  await click("Reset Orange to its default name"); expect(input("Orange").value).toBe("Orange");
  expect(input("Red").value).toBe("Blocker"); await click("Save");
  expect(save).toHaveBeenLastCalledWith(initial.id, { colorCategoryNames: { "#e5484d": "Blocker" } }, 5);
  await click("Reset Red to its default name"); await click("Save");
  expect(save).toHaveBeenLastCalledWith(initial.id, { colorCategoryNames: {} }, 5);
});

it("keeps unchanged and invalid names from writing and cancels without a command", async () => {
  const save = vi.spyOn(api, "updateStoryMap"); await mount();
  await enter("Orange", " Orange "); expect(button("Save").disabled).toBe(true);
  await enter("Orange", "   "); expect(button("Save").disabled).toBe(true);
  expect(getByRole(host, "status").textContent).toContain("1 and 60");
  await enter("Orange", "x".repeat(61)); expect(button("Save").disabled).toBe(true);
  await enter("Orange", "Risk"); await click("Cancel"); expect(close).toHaveBeenCalledOnce(); expect(save).not.toHaveBeenCalled();
});

it("retains a conflicting draft and its original version until explicit reload", async () => {
  const save = vi.spyOn(api, "updateStoryMap").mockRejectedValue(new Error("Map version changed; reload the map"));
  await mount(); await enter("Orange", "Risk");
  await mount({ ...initial, version: 8, colorCategoryNames: { "#e5484d": "Blocker" } });
  await click("Save");
  expect(save).toHaveBeenLastCalledWith(initial.id, { colorCategoryNames: { "#f5a623": "Risk" } }, 5);
  expect(getByRole(host, "alert").textContent).toContain("Map version changed"); expect(input("Orange").value).toBe("Risk");
  expect(close).not.toHaveBeenCalled(); await click("Reload map"); expect(close).toHaveBeenCalledOnce();
});

it.each(["response", "invalidation"])("does not accept delayed %s success after Restore", async (phase) => {
  let finish!: (value: { storyMap: StoryMap }) => void;
  vi.spyOn(api, "updateStoryMap").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await mount(); await enter("Orange", "Risk"); await click("Save");
  const refresh = vi.spyOn(client, "invalidateQueries"); let finishInvalidation!: () => void;
  if (phase === "invalidation") {
    const invalidation = new Promise<void>((resolve) => { finishInvalidation = resolve; }); refresh.mockImplementation(() => invalidation);
    await act(async () => finish({ storyMap: initial })); expect(refresh).toHaveBeenCalledTimes(3);
  }
  await act(async () => { useLiveInteractionStore.getState().recordEpoch("after-restore"); useLiveInteractionStore.getState().finishEpoch("after-restore"); });
  await act(async () => { if (phase === "response") finish({ storyMap: initial }); else finishInvalidation(); });
  if (phase === "response") expect(refresh).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled(); expect(useAnnouncementStore.getState().status).toBe("");
  expect(input("Orange").value).toBe("Risk"); expect(button("Save").disabled).toBe(true);
  expect(queryByRole(host, "alert")?.textContent).toContain("project was restored");
});

it("only exposes a dialog and suspends live updates while the native popover is open", async () => {
  await act(async () => root.render(<QueryClientProvider client={client}><ColorNames map={initial} /></QueryClientProvider>));
  const popup = document.querySelector<HTMLElement>("[popover]")!;
  const trigger = button("Color names");
  expect(popup.hasAttribute("role")).toBe(false); expect(popup.hasAttribute("data-live-popover")).toBe(false);
  expect(liveUpdatesHeld(document)).toBe(false);
  async function toggle(newState: string) {
    const event = new Event("toggle"); Object.defineProperty(event, "newState", { value: newState });
    await act(async () => popup.dispatchEvent(event));
  }
  await toggle("open");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(popup.getAttribute("role")).toBe("dialog");
  expect(document.getElementById(popup.getAttribute("aria-labelledby")!)?.textContent).toBe("Color names");
  expect(popup.hasAttribute("data-live-popover")).toBe(true); expect(liveUpdatesHeld(document)).toBe(true);
  await toggle("closed");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(queryByRole(document.body, "dialog")).toBeNull(); expect(popup.hasAttribute("data-live-popover")).toBe(false);
  expect(liveUpdatesHeld(document)).toBe(false);
});

it.each(["response", "invalidation"])("does not close a reopened draft when an unmounted editor finishes its delayed %s", async (phase) => {
  let finish!: (value: { storyMap: StoryMap }) => void;
  vi.spyOn(api, "updateStoryMap").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await mount(); await enter("Orange", "Risk"); await click("Save");
  const refresh = vi.spyOn(client, "invalidateQueries"); let finishInvalidation!: () => void;
  if (phase === "invalidation") {
    const invalidation = new Promise<void>((resolve) => { finishInvalidation = resolve; }); refresh.mockImplementation(() => invalidation);
    await act(async () => finish({ storyMap: initial })); expect(refresh).toHaveBeenCalledTimes(3);
  }
  await act(async () => root.render(null)); await mount(); await enter("Red", "Blocker");
  await act(async () => { if (phase === "response") finish({ storyMap: initial }); else finishInvalidation(); });
  expect(close).not.toHaveBeenCalled(); expect(input("Red").value).toBe("Blocker");
  expect(input("Orange").value).toBe("Orange"); expect(button("Save").disabled).toBe(false);
  expect(useAnnouncementStore.getState().status).toBe("Color names saved.");
});
