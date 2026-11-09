// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager, useQuery } from "@tanstack/react-query";
import { getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { storyMapSchema, type StoryMap } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { EpicContextPanel } from "@storymapper/web/features/story-map/components/EpicContextPanel";

const initial = storyMapSchema.parse({ id: "00000000-0000-4000-8000-000000000001", projectId: "00000000-0000-4000-8000-000000000002", name: "Map", version: 5, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z" });
let host: HTMLDivElement, root: Root, client: QueryClient, stored: StoryMap;
function Consumer() {
  const map = useQuery({ queryKey: ["story-map", initial.id], queryFn: async () => stored, initialData: initial }).data;
  return <EpicContextPanel map={map} disabled={false} actionOnly={!map.epicContext} />;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ epoch: "before-restore", restorePending: false });
  stored = { ...initial }; host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); useLiveInteractionStore.setState({ epoch: undefined, restorePending: false }); });
async function mount() { await act(async () => root.render(<QueryClientProvider client={client}><Consumer /></QueryClientProvider>)); }
const click = async (name: string) => act(async () => { getByRole(document.body, "button", { name }).click(); });
const input = (name: string) => getByRole(document.body, "textbox", { name }) as HTMLInputElement | HTMLTextAreaElement;
async function enter(name: string, value: string) {
  const element = input(name), prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function author() {
  await click("Add Epic context"); await enter("Epic title", "Authored title"); await enter("Goal", "Authored goal");
  await enter("GitHub Issue URL (optional)", "https://github.com/Owner/Repo/issues/12");
}

it("submits Add and Edit with map versions and refreshes the canonical context disclosure", async () => {
  const save = vi.spyOn(api, "updateStoryMap").mockImplementation(async (_id, patch, version) => {
    stored = { ...stored, epicContext: patch.epicContext!, version: version + 1 }; return { storyMap: stored };
  });
  await mount(); await author(); await click("Save context");
  expect(save).toHaveBeenLastCalledWith(initial.id, { epicContext: { title: "Authored title", goal: "Authored goal", githubIssueUrl: "https://github.com/owner/repo/issues/12" } }, 5);
  expect(queryByRole(document.body, "dialog")).toBeNull();
  expect(host.querySelector("summary")?.textContent).toBe("Epic context: Authored title");
  expect(getByRole(host, "link").getAttribute("href")).toBe("https://github.com/owner/repo/issues/12");
  await click("Edit Epic context"); await enter("Epic title", "Edited title"); await click("Save context");
  expect(save).toHaveBeenLastCalledWith(initial.id, { epicContext: { title: "Edited title", goal: "Authored goal", githubIssueUrl: "https://github.com/owner/repo/issues/12" } }, 6);
  expect(host.querySelector("summary")?.textContent).toBe("Epic context: Edited title");
});

it("preserves a rejected draft for correction and a stale draft until explicit reload and recovery", async () => {
  const save = vi.spyOn(api, "updateStoryMap").mockRejectedValueOnce(new Error("Context was refused"));
  await mount(); await author(); await click("Save context");
  expect(getByRole(document.body, "alert").textContent).toContain("Context was refused");
  expect(input("Epic title").value).toBe("Authored title"); expect(input("Goal").value).toBe("Authored goal");
  await enter("Goal", "Corrected goal");
  stored = { ...stored, version: 8 };
  save.mockRejectedValueOnce(new Error("Map version changed; reload the map"));
  await click("Save context");
  expect(save).toHaveBeenLastCalledWith(initial.id, { epicContext: { title: "Authored title", goal: "Corrected goal", githubIssueUrl: "https://github.com/owner/repo/issues/12" } }, 5);
  expect(input("Goal").value).toBe("Corrected goal");
  await click("Reload map"); expect(queryByRole(document.body, "dialog")).toBeNull();
  await author();
  save.mockImplementationOnce(async (_id, patch, version) => { stored = { ...stored, epicContext: patch.epicContext!, version: version + 1 }; return { storyMap: stored }; });
  await click("Save context");
  expect(save.mock.calls.at(-1)?.[2]).toBe(8);
  expect(host.querySelector("summary")?.textContent).toBe("Epic context: Authored title");
});

it.each(["response", "invalidation"])("ignores delayed %s completion after Restore and retains the draft until explicit reload", async (phase) => {
  let finish!: (value: { storyMap: StoryMap }) => void;
  vi.spyOn(api, "updateStoryMap").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await mount(); await author(); await click("Save context");
  const refresh = vi.spyOn(client, "invalidateQueries");
  let finishInvalidation!: () => void;
  if (phase === "invalidation") {
    const invalidation = new Promise<void>((resolve) => { finishInvalidation = resolve; });
    refresh.mockImplementation(() => invalidation);
    await act(async () => finish({ storyMap: initial }));
    expect(refresh).toHaveBeenCalledTimes(3);
  }
  await act(async () => { useLiveInteractionStore.getState().recordEpoch("after-restore"); useLiveInteractionStore.getState().finishEpoch("after-restore"); });
  await act(async () => { if (phase === "response") finish({ storyMap: initial }); else finishInvalidation(); });
  if (phase === "response") expect(refresh).not.toHaveBeenCalled();
  expect(queryByRole(document.body, "dialog")).not.toBeNull();
  expect(input("Epic title").value).toBe("Authored title"); expect(input("Goal").value).toBe("Authored goal");
  expect(getByRole(document.body, "alert").textContent).toContain("Your draft is preserved");
  expect((getByRole(document.body, "button", { name: "Save context" }) as HTMLButtonElement).disabled).toBe(true);
  await click("Reload map"); expect(queryByRole(document.body, "dialog")).toBeNull();
});
