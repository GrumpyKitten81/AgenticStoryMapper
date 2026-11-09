// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { releaseSchema, type Release } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { ConflictError } from "@storymapper/web/app/conflicts";
import { liveUpdatesHeld } from "@storymapper/web/app/live/live-interaction-store";
import { ReleaseEditor } from "@storymapper/web/features/releases/ReleaseEditor";

import { getByRole, within } from "@testing-library/dom";
import { auditAccessibility } from "@storymapper/web/test/audit-accessibility";

vi.mock("@storymapper/web/app/api", () => ({ api: { createRelease: vi.fn(), updateRelease: vi.fn() } }));
const mapId = "00000000-0000-4000-8000-000000000001";
const releaseId = "00000000-0000-4000-8000-000000000002";
let release: Release;
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let close: ReturnType<typeof vi.fn<() => void>>;
const render = (current?: Release, suspended = false) => act(async () => root.render(<QueryClientProvider client={client}><ReleaseEditor storyMapId={mapId} release={current} suspended={suspended} onClose={close} /></QueryClientProvider>));
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === text)!;
const field = (label: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
const setField = (label: string, value: string) => act(async () => {
  const input = field(label);
  Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const conflict = (current: Release) => new ConflictError("changed", [{ entity: "release", id: current.id, baseVersion: 1, currentVersion: current.version, current }]);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  close = vi.fn();
  release = releaseSchema.parse({ id: releaseId, storyMapId: mapId, version: 1, name: "Delivery", goal: "Initial", startDate: null, releaseDate: null, released: false, position: 0 });
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

it("creates every supported field once and keeps all fields on a refused submission", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(api.createRelease).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  await render();
  await setField("Release name", "Full delivery");
  await setField("Release goal", "Complete scope");
  await setField("Start date", "2026-10-17");
  await setField("Release date", "2026-11-17");
  await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => { const form = document.querySelector("form")!; form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(api.createRelease).toHaveBeenCalledTimes(1);
  expect(api.createRelease).toHaveBeenCalledWith({ storyMapId: mapId, name: "Full delivery", goal: "Complete scope", startDate: "2026-10-17", releaseDate: "2026-11-17", released: true });
  expect(field("Release name").matches(":disabled")).toBe(true);
  expect(liveUpdatesHeld(document)).toBe(true);
  await act(async () => reject(new Error("Write refused")));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("Write refused");
  expect(field("Release goal").value).toBe("Complete scope");
  expect(button("Save").disabled).toBe(false);
  expect(close).not.toHaveBeenCalled();
});

it("visibly refuses an invalid name without clearing the draft", async () => {
  await render(); await setField("Release name", "   "); await setField("Release goal", "Keep this goal");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(api.createRelease).not.toHaveBeenCalled();
  expect(field("Release goal").value).toBe("Keep this goal");
});

it("captures the root version across remote refresh, then requires Keep mine and chains acknowledged writes", async () => {
  const remote = { ...release, version: 2, goal: "Remote goal" };
  vi.mocked(api.updateRelease).mockRejectedValueOnce(conflict(remote)).mockResolvedValueOnce({ ...remote, version: 3, name: "My delivery", goal: "Initial" }).mockResolvedValueOnce({ ...remote, version: 4, name: "My delivery", goal: "Next" });
  await render(release); await setField("Release name", "My delivery"); await render(remote);
  await act(async () => button("Save").click());
  expect(vi.mocked(api.updateRelease).mock.calls[0]![2]).toBe(1);
  expect(field("Release name").value).toBe("My delivery");
  expect(button("Save").disabled).toBe(true);
  await act(async () => button("Keep mine").click());
  expect(vi.mocked(api.updateRelease).mock.calls[1]).toEqual([releaseId, { name: "My delivery", goal: "Initial", startDate: null, releaseDate: null, released: false }, 2]);
  await setField("Release goal", "Next"); await act(async () => button("Save").click());
  expect(vi.mocked(api.updateRelease).mock.calls[2]![2]).toBe(3);
});

it("Reload accepts the conflicting root without applying the retained draft", async () => {
  const remote = { ...release, version: 4, name: "Remote delivery", goal: "Remote goal", released: true };
  vi.mocked(api.updateRelease).mockRejectedValueOnce(conflict(remote));
  await render(release); await setField("Release goal", "My goal"); await act(async () => button("Save").click());
  await act(async () => button("Reload").click());
  expect(field("Release goal").value).toBe("Remote goal");
  expect(field("Release name").value).toBe("Remote delivery");
  expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  expect(button("Save").disabled).toBe(true);
  expect(api.updateRelease).toHaveBeenCalledTimes(1);
});

it("retains a suspended dirty draft and live hold through readonly preview", async () => {
  await render(release); await setField("Release goal", "Suspended goal");
  await render(release, true);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(liveUpdatesHeld(document)).toBe(true);
  await render(release);
  expect(field("Release goal").value).toBe("Suspended goal");
  await act(async () => button("Cancel").click());
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((item) => item.textContent === "Cancel")!.click());
  expect(field("Release goal").value).toBe("Suspended goal");
});

it("audits populated Release editing, failed Save and dirty-discard confirmation while retaining keyboard focus", async () => {
  vi.mocked(api.updateRelease).mockRejectedValueOnce(new Error("Write refused"));
  await render(release);
  const dialog = getByRole(document.body, "dialog");
  expect(document.activeElement).toBe(within(dialog).getByRole("heading"));
  expect(within(dialog).getByRole("textbox", { name: "Release name" })).toBe(field("Release name"));
  expect(field("Release name").closest("fieldset")?.classList.contains("form-stack")).toBe(true);
  expect(within(dialog).getByRole("checkbox").closest("label")?.classList.contains("checkbox-row")).toBe(true);
  await auditAccessibility();
  await setField("Release goal", "Remote goal");
  const save = within(dialog).getByRole("button", { name: "Save" });
  await act(async () => { save.focus(); save.click(); });
  expect(getByRole(document.body, "alert").textContent).toBe("Write refused");
  expect(field("Release goal").value).toBe("Remote goal");
  await auditAccessibility();
  const cancel = within(dialog).getByRole("button", { name: "Cancel" });
  expect(cancel.classList.contains("secondary")).toBe(true);
  expect(cancel.parentElement).toBe(save.parentElement);
  expect(cancel.parentElement?.classList.contains("button-row")).toBe(true);
  await act(async () => { cancel.focus(); cancel.click(); });
  const confirmation = getByRole(document.body, "alertdialog", { name: "Discard release changes?" });
  const keep = within(confirmation).getByRole("button", { name: "Cancel" });
  expect(keep.classList.contains("secondary")).toBe(true);
  expect(within(confirmation).getByRole("button", { name: "Discard" }).classList.contains("danger")).toBe(true);
  expect(document.activeElement).toBe(keep);
  await auditAccessibility();
  await act(async () => keep.click());
  expect(document.activeElement).toBe(cancel);
  expect(field("Release goal").value).toBe("Remote goal");
  await act(async () => cancel.click());
  await act(async () => within(getByRole(document.body, "alertdialog")).getByRole("button", { name: "Discard" }).click());
  expect(close).toHaveBeenCalledOnce();
});
