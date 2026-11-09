// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { roadmapSchema, type Roadmap } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { ConflictError } from "@storymapper/web/app/conflicts";
import { RoadmapEditor } from "@storymapper/web/features/roadmaps/RoadmapEditor";

vi.mock("@storymapper/web/app/api", () => ({ api: { updateRoadmap: vi.fn() } }));
let roadmap: Roadmap;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

const render = () => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(RoadmapEditor, { roadmap, onSaved: vi.fn() }))));
const nameInput = () => host.querySelector<HTMLInputElement>("input")!;
const type = (value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(nameInput(), value);
  nameInput().dispatchEvent(new Event("input", { bubbles: true }));
});
const blur = () => act(async () => nameInput().dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
const conflictFor = (current: Roadmap) => new ConflictError("changed", [{ entity: "roadmap", id: current.id, baseVersion: 1, currentVersion: current.version, current }]);
const alertButton = (label: string) => [...host.querySelectorAll<HTMLButtonElement>(".conflict-alert button")].find((item) => item.textContent === label)!;

beforeEach(() => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const now = new Date().toISOString();
  roadmap = roadmapSchema.parse({ version: 1, id: randomUUID(), projectId: randomUUID(), storyMapId: null, name: "Plan", type: "simple", createdAt: now, updatedAt: now });
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });

describe("Roadmap editor", () => {
  it("saves a renamed Roadmap with its loaded version", async () => {
    vi.mocked(api.updateRoadmap).mockResolvedValueOnce({ ...roadmap, version: 2, name: "Renamed" });
    await render();
    await type("Renamed");
    await blur();
    expect(vi.mocked(api.updateRoadmap).mock.calls[0]).toEqual([roadmap.id, { name: "Renamed" }, 1]);
  });

  it("keeps the typed name after a stale save and resubmits it on Keep mine", async () => {
    const remote = { ...roadmap, version: 2, name: "Remote plan" };
    vi.mocked(api.updateRoadmap).mockRejectedValueOnce(conflictFor(remote)).mockResolvedValueOnce({ ...remote, version: 3, name: "Local plan" });
    await render();
    await type("Local plan");
    await blur();
    expect(host.querySelector(".conflict-alert")?.textContent).toContain("changed since you loaded it");
    expect(nameInput().value).toBe("Local plan");
    await act(async () => alertButton("Keep mine").click());
    expect(vi.mocked(api.updateRoadmap).mock.calls[1]![2]).toBe(2);
  });

  it("shows the server state on Reload", async () => {
    vi.mocked(api.updateRoadmap).mockRejectedValueOnce(conflictFor({ ...roadmap, version: 2, name: "Remote plan" }));
    await render();
    await type("Local plan");
    await blur();
    await act(async () => alertButton("Reload").click());
    expect(nameInput().value).toBe("Remote plan");
  });
});
