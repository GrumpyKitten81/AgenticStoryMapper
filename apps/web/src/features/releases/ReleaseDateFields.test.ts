// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releaseSchema, type Release } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { ConflictError } from "@storymapper/web/app/conflicts";
import { useLiveInteractionStore, liveUpdatesHeld } from "@storymapper/web/app/live/live-interaction-store";
import { ReleaseDateFields } from "@storymapper/web/features/releases/ReleaseDateFields";

vi.mock("@storymapper/web/app/api", () => ({ api: { updateRelease: vi.fn() } }));
let release: Release;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

const render = () => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ReleaseDateFields, { release, storyMapId: release.storyMapId }))));
const dateInput = (index: number) => host.querySelectorAll<HTMLInputElement>('input[type="date"]')[index]!;
const setDate = (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const conflictFor = (current: Release) => new ConflictError("changed", [{ entity: "release", id: current.id, baseVersion: 1, currentVersion: current.version, current }]);
const alertButton = (label: string) => [...host.querySelectorAll<HTMLButtonElement>(".conflict-alert button")].find((item) => item.textContent === label)!;

beforeEach(() => {
  useLiveInteractionStore.setState({ epoch: undefined, restoreRevision: 0, restorePending: false });
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const now = new Date().toISOString();
  release = releaseSchema.parse({ version: 1, id: randomUUID(), storyMapId: randomUUID(), name: "Delivery", position: 0, startDate: "2026-10-01", releaseDate: "2026-10-31", createdAt: now, updatedAt: now });
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });

describe("Release date editor conflicts", () => {
  it("keeps the typed date after a stale save and resubmits it with the current version on Keep mine", async () => {
    const remote = { ...release, version: 2, releaseDate: "2026-12-31" };
    vi.mocked(api.updateRelease).mockRejectedValueOnce(conflictFor(remote)).mockResolvedValueOnce({ ...remote, version: 3, startDate: "2026-11-01" });
    await render();
    await setDate(dateInput(0), "2026-11-01");
    await vi.waitFor(() => expect(host.querySelector(".conflict-alert")).not.toBeNull());
    expect(dateInput(0).value).toBe("2026-11-01");
    expect(vi.mocked(api.updateRelease).mock.calls[0]).toEqual([release.id, { startDate: "2026-11-01", releaseDate: "2026-10-31" }, 1]);
    await act(async () => alertButton("Keep mine").click());
    await vi.waitFor(() => expect(api.updateRelease).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.updateRelease).mock.calls[1]![2]).toBe(2);
    expect(vi.mocked(api.updateRelease).mock.calls[1]![1]).toMatchObject({ startDate: "2026-11-01" });
  });

  it("shows the server dates on Reload", async () => {
    const remote = { ...release, version: 2, startDate: "2026-09-15", releaseDate: "2026-12-31" };
    vi.mocked(api.updateRelease).mockRejectedValueOnce(conflictFor(remote));
    await render();
    await setDate(dateInput(0), "2026-11-01");
    await vi.waitFor(() => expect(host.querySelector(".conflict-alert")).not.toBeNull());
    await act(async () => alertButton("Reload").click());
    expect(dateInput(0).value).toBe("2026-09-15");
    expect(dateInput(1).value).toBe("2026-12-31");
  });
});

it("holds dirty dates after a refused request and refuses duplicate pending writes", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api.updateRelease).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  await render();
  await setDate(dateInput(0), "2026-11-01");
  expect(dateInput(0).disabled).toBe(true);
  await setDate(dateInput(1), "2026-12-01");
  expect(api.updateRelease).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("Write refused")));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Write refused");
  expect(dateInput(0).value).toBe("2026-11-01");
  expect(host.querySelector('[data-live-suspended-draft]')).not.toBeNull();
});

it("persists the complete retained date draft after failure then a second-date write, clearing the live hold", async () => {
  vi.mocked(api.updateRelease).mockRejectedValueOnce(new Error("Write refused")).mockResolvedValueOnce({ ...release, version: 2, startDate: "2026-11-01", releaseDate: "2026-12-01" });
  await render();
  await setDate(dateInput(0), "2026-11-01");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Write refused");
  await setDate(dateInput(1), "2026-12-01");
  expect(vi.mocked(api.updateRelease).mock.calls[1]).toEqual([release.id, { startDate: "2026-11-01", releaseDate: "2026-12-01" }, 1]);
  expect(dateInput(0).value).toBe("2026-11-01");
  expect(dateInput(1).value).toBe("2026-12-01");
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('[data-live-suspended-draft]')).toBeNull();
  expect(liveUpdatesHeld(document)).toBe(false);
});

it.each([1, 5])("discards pre-Restore date lifetime and refuses writes until refreshed overlapping root version %s arrives", async (version) => {
  release = { ...release, version: 5 };
  vi.mocked(api.updateRelease).mockRejectedValueOnce(new Error("Write refused"));
  useLiveInteractionStore.getState().recordEpoch("old");
  await render(); await setDate(dateInput(0), "2026-11-01");
  expect(host.querySelector('[data-live-suspended-draft]')).not.toBeNull();
  await act(async () => useLiveInteractionStore.getState().recordEpoch("restored"));
  expect(dateInput(0).disabled).toBe(true);
  expect(host.querySelector('[data-live-suspended-draft]')).toBeNull();
  await setDate(dateInput(1), "2027-01-01");
  expect(api.updateRelease).toHaveBeenCalledTimes(1);
  release = { ...release, version, startDate: "2026-09-01", releaseDate: "2026-09-30" };
  await render();
  expect(dateInput(0).disabled).toBe(true);
  await act(async () => useLiveInteractionStore.getState().finishEpoch("restored"));
  expect(dateInput(0).value).toBe("2026-09-01");
  vi.mocked(api.updateRelease).mockResolvedValueOnce({ ...release, version: version + 1, releaseDate: "2026-12-31" });
  await setDate(dateInput(1), "2026-12-31");
  expect(vi.mocked(api.updateRelease).mock.calls[1]).toEqual([release.id, { startDate: "2026-09-01", releaseDate: "2026-12-31" }, version]);
});
