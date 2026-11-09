// @vitest-environment jsdom // REQ Story 7.5 incoming Apply never confirms outgoing effects
import { randomUUID } from "node:crypto";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { changeSetSchema, type ChangeSetPreviewResponse, type IncomingGitHubCommandResponse } from "@storymapper/contracts";
import { IncomingGitHubReview } from "@storymapper/web/features/github-sync/IncomingGitHubReview";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { incomingGitHubStrings } from "@storymapper/web/ui-strings/incoming-github";
import { changeSetStrings } from "@storymapper/ui-strings";

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ reviewRevision: 0, restorePending: false });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

function fixture() {
  const operation = { operationId: "incoming", op: "update" as const, entity: "card" as const, entityId: randomUUID(), after: { title: "Remote edit" } };
  const changeSet = changeSetSchema.parse({ id: randomUUID(), projectId: randomUUID(), title: "GitHub local update", source: "github", status: "proposed", createdAt: "2026-10-19T00:00:00.000Z", operations: [operation] });
  const preview: ChangeSetPreviewResponse = { changeSet, presentationStatus: "proposed", closed: false, selectedOperationIds: ["incoming"], conflicts: [], boards: [], canApprove: true, canApply: false, operations: [{ operationId: "incoming", index: 0, label: "Update Card", kind: "update:card", status: "changed", dependencies: [], owners: [], changes: [], operation }] };
  const command: IncomingGitHubCommandResponse = { changeSet, changeSetId: changeSet.id, outcome: "proposed", previewRef: { changeSetId: changeSet.id }, items: [{ status: "proposed", remoteId: "7", url: "https://github.com/fixture/repo/issues/7" }, { status: "already_linked", remoteId: "8" }, { status: "not_attempted", remoteId: "9" }] };
  return { command, preview };
}
function button(text: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === text); }

it.each([false, true])("reviews local operations, refreshes health and releases the live hold after Apply (lost response=%s), then separately prepares outgoing", async (lostResponse) => {
  const { command, preview } = fixture();
  const outgoing = vi.fn();
  const healthKeys = ["work-item-sync-health", "github-sync-health", "backlog-health"];
  function HealthReport({ name }: { name: string }) {
    const query = useQuery({ queryKey: [name], queryFn: async () => (await fetch(`/health/${name}`)).json() as Promise<{ version: number }> });
    return createElement("output", { "data-health": name }, query.data?.version);
  }
  let finishApply!: () => void;
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/health/")) return Response.json({ version: preview.closed ? 2 : 1 });
    if (init?.method === "POST") {
      if (path.endsWith("/approve")) { preview.changeSet.status = "approved"; preview.presentationStatus = "approved"; preview.canApply = true; }
      else if (path.endsWith("/apply")) { await new Promise<void>((resolve) => { finishApply = resolve; }); preview.changeSet.status = "applied"; preview.presentationStatus = "applied"; preview.closed = true; preview.canApply = false; if (lostResponse) throw new TypeError("Lost Apply response"); }
      else throw new Error(`Unexpected mutation: ${path}`);
      return Response.json({ changeSet: preview.changeSet });
    }
    return Response.json(preview);
  });
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Fragment, null, createElement(IncomingGitHubReview, { command, mutationKey: ["incoming", command.changeSetId], isCurrent: () => true, onPrepareOutgoing: outgoing }), ...healthKeys.map((name) => createElement(HealthReport, { key: name, name }))))));
  await vi.waitFor(() => expect(button("Approve selection")).toBeDefined());
  await vi.waitFor(() => expect([...host.querySelectorAll("output")].map((item) => item.textContent)).toEqual(["1", "1", "1"]));
  expect(host.querySelector("[data-live-suspended-draft]")).not.toBeNull();
  expect(host.textContent).toContain("Already linked");
  expect(host.textContent).toContain("Not attempted");
  expect(button(incomingGitHubStrings.outgoing)).toBeUndefined();
  await act(async () => button("Approve selection")!.click());
  await vi.waitFor(() => expect(button("Apply selection")!.getAttribute("aria-disabled")).toBe("false"));
  expect(button(incomingGitHubStrings.outgoing)).toBeUndefined();
  await act(async () => button("Apply selection")!.click());
  expect(client.isMutating({ mutationKey: ["incoming", command.changeSetId], exact: true })).toBe(1);
  expect(host.querySelector("[data-live-suspended-draft]")).not.toBeNull();
  expect(button(incomingGitHubStrings.outgoing)).toBeUndefined();
  await act(async () => finishApply());
  await vi.waitFor(() => expect(button(incomingGitHubStrings.outgoing)).toBeDefined());
  await vi.waitFor(() => expect(host.querySelector("[data-live-suspended-draft]")).toBeNull());
  await vi.waitFor(() => expect([...host.querySelectorAll("output")].map((item) => item.textContent)).toEqual(["2", "2", "2"]));
  expect(outgoing).not.toHaveBeenCalled();
  await act(async () => button(incomingGitHubStrings.outgoing)!.click());
  expect(outgoing).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([path]) => path)).toEqual([`/api/changesets/${command.changeSetId}/approve`, `/api/changesets/${command.changeSetId}/apply`]);
});

it("refuses same-event Apply when scope becomes inactive", async () => {
  const { command, preview } = fixture(); preview.canApply = true;
  let current = true;
  const fetch = vi.fn(async () => Response.json(preview)); vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(IncomingGitHubReview, { command, isCurrent: () => current }))));
  await vi.waitFor(() => expect(button("Apply selection")).toBeDefined());
  await act(async () => { current = false; button("Apply selection")!.click(); });
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(IncomingGitHubReview, { command, isCurrent: () => current }))));
  expect(host.querySelector("[data-live-suspended-draft]")).toBeNull();
});

it("releases the live hold after rejection while retaining its review result", async () => {
  const { command, preview } = fixture();
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.method === "POST") { preview.changeSet.status = "rejected"; preview.presentationStatus = "rejected"; preview.closed = true; }
    return Response.json(preview);
  }));
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(IncomingGitHubReview, { command, isCurrent: () => true }))));
  await vi.waitFor(() => expect(button(changeSetStrings.reject)).toBeDefined());
  await act(async () => button(changeSetStrings.reject)!.click());
  await vi.waitFor(() => expect(host.querySelector("[data-live-suspended-draft]")).toBeNull());
  expect(host.querySelector('[aria-label="Incoming GitHub changes"]')).not.toBeNull();
});

it("excludes same-event sibling decisions sharing one Card mutation key", async () => {
  const fixtures = [fixture(), fixture()];
  let finish!: () => void;
  const posts: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    const entry = fixtures.find(({ command }) => path.includes(command.changeSetId))!;
    if (init?.method === "POST") {
      posts.push(path);
      if (entry === fixtures[0]) await new Promise<void>((resolve) => { finish = resolve; });
      entry.preview.changeSet.status = "approved"; entry.preview.presentationStatus = "approved"; entry.preview.canApply = true;
    }
    return Response.json(entry.preview);
  }));
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Fragment, null, ...fixtures.map(({ command }) => createElement(IncomingGitHubReview, { key: command.changeSetId, command, mutationKey: ["card-owned-write", "card"], isCurrent: () => true }))))));
  const approvals = () => [...host.querySelectorAll<HTMLButtonElement>("button")].filter((item) => item.textContent === "Approve selection");
  await vi.waitFor(() => expect(approvals()).toHaveLength(2));
  await act(async () => { approvals()[0]!.click(); approvals()[1]!.click(); });
  expect(posts).toEqual([`/api/changesets/${fixtures[0]!.command.changeSetId}/approve`]);
  expect(approvals()[1]!.getAttribute("aria-disabled")).toBe("true");
  const rejects = [...host.querySelectorAll<HTMLButtonElement>("button")].filter((item) => item.textContent === changeSetStrings.reject);
  expect(rejects[1]!.getAttribute("aria-disabled")).toBe("true");
  await act(async () => rejects[1]!.click());
  expect(posts).toHaveLength(1);
  await act(async () => finish());
  await vi.waitFor(() => expect(approvals()[1]!.getAttribute("aria-disabled")).toBe("false"));
  await act(async () => approvals()[1]!.click());
  expect(posts).toHaveLength(2);
});
