// @vitest-environment jsdom // REQ review refusals, unavailable effects and uncertain apply outcomes
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { changeSetSchema, type ChangeSetPreviewResponse } from "@storymapper/contracts";
import { ChangeSetReview } from "@storymapper/web/features/changesets/ChangeSetReview";
import { useChangeSetReview } from "@storymapper/web/features/changesets/useChangeSetReview";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ reviewRevision: 0 });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

function response(): ChangeSetPreviewResponse {
  const operation = { operationId: "edit", op: "update" as const, entity: "card" as const, entityId: randomUUID(), after: { title: "Submitted title" } };
  const changeSet = changeSetSchema.parse({ id: randomUUID(), projectId: randomUUID(), title: "Outcome review", source: "human", status: "approved", createdAt: "2026-10-12T00:00:00.000Z", operations: [operation] });
  return { changeSet, presentationStatus: "approved", closed: false, selectedOperationIds: ["edit"], conflicts: [], boards: [], canApprove: true, canApply: true,
    operations: [{ operationId: "edit", index: 0, label: "update", kind: "update:card", status: "unchanged", dependencies: [], owners: [], changes: [], operation }] };
}
function button(text: string): HTMLButtonElement { return [...host.querySelectorAll<HTMLButtonElement>("button")].find((control) => control.textContent === text)!; }
async function mount(id: string): Promise<void> {
  function Review() { return createElement(ChangeSetReview, { state: useChangeSetReview(id) }); }
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Review))));
}

it("keeps an explicit retry after a preview error and recovers the operation review", async () => {
  const preview = response(); let unavailable = true;
  const fetch = vi.fn(async () => { if (unavailable) throw new TypeError("Preview connection lost"); return Response.json(preview); });
  vi.stubGlobal("fetch", fetch);
  await mount(preview.changeSet.id);
  await vi.waitFor(() => expect(host.textContent).toContain("Preview connection lost"));
  expect(button("Review current state").getAttribute("aria-disabled")).toBe("false");
  unavailable = false;
  await act(async () => button("Review current state").click());
  await vi.waitFor(() => expect(host.textContent).toContain("Outcome review"));
  expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("allows explicit recovery when live invalidation cancels the initial preview without data", async () => {
  const preview = response();
  const fetch = vi.fn(async () => fetch.mock.calls.length === 1 ? new Promise<Response>(() => {}) : Response.json(preview));
  vi.stubGlobal("fetch", fetch);
  await mount(preview.changeSet.id);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await act(async () => {
    useLiveInteractionStore.getState().invalidateReviews();
    await client.cancelQueries({ queryKey: ["changeset-preview"] });
    await client.invalidateQueries({ queryKey: ["changeset-preview"], refetchType: "none" });
  });
  expect(host.textContent).toContain("Loading ChangeSet preview");
  expect(button("Review current state").getAttribute("aria-disabled")).toBe("false");
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => button("Review current state").click());
  await vi.waitFor(() => expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1));
  expect(button("Approve selection").getAttribute("aria-disabled")).toBe("false");
});

it("keeps stale submitted intent reviewable while disabling every lifecycle and selection control", async () => {
  const preview = response();
  preview.presentationStatus = "stale"; preview.changeSet.status = "stale";
  preview.canApprove = false; preview.canApply = false; preview.operations[0]!.status = "stale";
  const fetch = vi.fn(async () => Response.json(preview)); vi.stubGlobal("fetch", fetch);
  await mount(preview.changeSet.id);
  await vi.waitFor(() => expect(host.querySelector('input[type="checkbox"]')).not.toBeNull());
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.getAttribute("aria-disabled")).toBe("true");
  for (const action of ["Approve selection", "Apply selection", "Reject ChangeSet"]) {
    expect(button(action).getAttribute("aria-disabled")).toBe("true");
    await act(async () => button(action).click());
  }
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(host.querySelector("details pre")!.textContent).toContain("Submitted title");
  expect(host.querySelector(".changeset-before-after")!.textContent).toContain("unavailable for this stale ChangeSet");
});

it.each([
  ["unchanged", "No changes resolved."], ["excluded", "Excluded from this projection."],
  ["conflict", "Resolved effects are unavailable because projection conflicts."], ["changed", "Resolved effects are unavailable."]
] as const)("labels absent %s effects without presenting submitted patches as resolved snapshots", async (status, message) => {
  const preview = response(); preview.operations[0]!.status = status;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(preview)));
  await mount(preview.changeSet.id);
  await vi.waitFor(() => expect(host.querySelector(".changeset-before-after")).not.toBeNull());
  const effects = host.querySelector(".changeset-before-after")!;
  expect(effects.textContent).toContain(message); expect(effects.textContent).not.toContain("Submitted title");
  expect([...effects.querySelectorAll("h4")].map((heading) => heading.textContent)).toEqual(["Before", "After"]);
  expect(host.querySelector("details pre")!.textContent).toContain("Submitted title");
});

it.each([
  ["transport", "applied"], ["json", "applied"], ["server", "applied"],
  ["transport", "approved"], ["json", "approved"], ["server", "unavailable"]
] as const)("reconciles %s apply failure with %s history without claiming rollback", async (failure, outcome) => {
  const preview = response(); let submitted = false; let previewReads = 0;
  vi.stubGlobal("fetch", vi.fn(async (_path: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      submitted = true;
      if (failure === "transport") throw new TypeError("Apply connection lost");
      if (failure === "json") return new Response("unreadable response", { status: 200 });
      return Response.json({ message: "Apply response unavailable" }, { status: 500 });
    }
    previewReads++;
    if (submitted && outcome === "unavailable") throw new TypeError("History connection lost");
    if (submitted && outcome === "applied") {
      preview.changeSet.status = "applied"; preview.presentationStatus = "applied";
      preview.closed = true; preview.canApprove = false; preview.canApply = false;
    }
    return Response.json(preview);
  }));
  await mount(preview.changeSet.id);
  await vi.waitFor(() => expect(button("Apply selection").getAttribute("aria-disabled")).toBe("false"));
  await act(async () => button("Apply selection").click());
  await vi.waitFor(() => expect(host.textContent).toContain(outcome === "applied" ? "history confirms it was applied" : "Apply outcome is unknown"));
  expect(previewReads).toBe(2); expect(host.textContent).not.toContain("Nothing was applied");
  if (outcome === "approved") expect(button("Apply selection").getAttribute("aria-disabled")).toBe("true");
  if (outcome === "unavailable") expect(button("Review current state").getAttribute("aria-disabled")).toBe("false");
});
