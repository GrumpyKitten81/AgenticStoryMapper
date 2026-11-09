// @vitest-environment jsdom // REQ exact server selection and incoming-edit eligibility
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { changeSetSchema, type ChangeSetPreviewResponse } from "@storymapper/contracts";
import { ChangeSetReview } from "@storymapper/web/features/changesets/ChangeSetReview";
import { useChangeSetReview } from "@storymapper/web/features/changesets/useChangeSetReview";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";

const features = vi.hoisted(() => ({ personas: true }));
vi.mock("@storymapper/web/app/feature-flags", async (original) => ({
  ...await original<typeof import("@storymapper/web/app/feature-flags")>(),
  get isPersonasEnabled() { return features.personas; }
}));

it("renders every effect, obeys server closure and reapproval, retains failed apply and dirty focus on invalidation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ reviewRevision: 0 });
  const id = randomUUID();
  const operations = Array.from({ length: 8 }, (_, index) => ({ operationId: `op-${index}`, op: "create" as const, entity: "card" as const, after: { storyMapId: randomUUID(), level: "story" as const, title: `Story ${index}` } }));
  const changeSet = changeSetSchema.parse({ id, projectId: randomUUID(), title: "Complete review", source: "mcp", status: "approved", operations, createdAt: "2026-10-12T00:00:00.000Z" });
  let approved = true;
  const fetch = vi.fn(async (path: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      if (path.endsWith("/apply")) return Response.json({ message: "Root version changed" }, { status: 409 });
      expect(path.endsWith("/approve")).toBe(true);
      expect(JSON.parse(String(options.body))).toEqual({ selectedOperationIds: operations.slice(2).map((operation) => operation.operationId) });
      approved = true;
      return Response.json({ changeSet });
    }
    expect(path.startsWith(`/api/changesets/${id}/preview`)).toBe(true);
    const requested = new URL(path, "http://localhost").searchParams.get("selectedOperationIds");
    const selected = requested ? (JSON.parse(requested) as string[]).filter((item) => item !== "op-1") : operations.map((operation) => operation.operationId);
    const response: ChangeSetPreviewResponse = { changeSet, presentationStatus: "approved", closed: false, selectedOperationIds: selected, boards: [], conflicts: [], canApprove: true, canApply: approved,
      operations: operations.map((operation, index) => ({ operationId: operation.operationId, index, label: operation.after.title, kind: "create card", status: selected.includes(operation.operationId) ? "changed" : "excluded", dependencies: index === 1 ? ["op-0"] : [], owners: [], changes: [], operation })) };
    return Response.json(response);
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  function Review() { return createElement(ChangeSetReview, { state: useChangeSetReview(id) }); }
  const control = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === text)!;
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Review))));
    await vi.waitFor(() => expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(8));
    expect(host.querySelectorAll("h4")).toHaveLength(16);
    await act(async () => { approved = false; host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    await vi.waitFor(() => expect(host.querySelectorAll('input:checked')).toHaveLength(6));
    expect(control("Apply selection").getAttribute("aria-disabled")).toBe("true");
    await act(async () => control("Approve selection").click());
    await vi.waitFor(() => expect(control("Apply selection").getAttribute("aria-disabled")).toBe("false"));
    await act(async () => control("Apply selection").click());
    await vi.waitFor(() => expect(host.textContent).toContain("Apply failed: Root version changed. Nothing was applied."));
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(8);
    const draft = document.createElement("textarea"); draft.value = "Unsaved text"; host.append(draft); draft.focus();
    await act(async () => useLiveInteractionStore.getState().invalidateReviews());
    expect(control("Approve selection").getAttribute("aria-disabled")).toBe("true"); expect(control("Apply selection").getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(draft); expect(draft.value).toBe("Unsaved text");
  } finally { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); useLiveInteractionStore.setState({ reviewRevision: 0 }); }
});

async function expectDisabledPersonaGateKeepsUnrelatedEffects(host: HTMLElement, control: (text: string) => HTMLButtonElement, fetch: ReturnType<typeof vi.fn>): Promise<void> {
  const posted = () => fetch.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === "POST");
  expect(host.textContent).toContain("Persona feature is disabled");
  await act(async () => control("Approve selection").click());
  expect(posted()).toBe(false);
  for (let index = 0; index < 5; index++) {
    await act(async () => host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index]!.click());
    await vi.waitFor(() => expect(host.querySelectorAll('input:checked')).toHaveLength(5 - index));
    if (index === 2) {
      expect(control("Approve selection").getAttribute("aria-disabled")).toBe("true");
      expect(control("Apply selection").getAttribute("aria-disabled")).toBe("true");
      await act(async () => { control("Approve selection").click(); control("Apply selection").click(); });
      expect(posted()).toBe(false);
    }
  }
  expect(control("Approve selection").getAttribute("aria-disabled")).toBe("false");
  await act(async () => control("Approve selection").click());
  await vi.waitFor(() => expect(control("Apply selection").getAttribute("aria-disabled")).toBe("false"));
  await act(async () => control("Apply selection").click());
  const posts = fetch.mock.calls.filter(([, options]) => (options as RequestInit | undefined)?.method === "POST");
  expect(posts).toHaveLength(2);
  for (const [, options] of posts) expect(JSON.parse(String((options as RequestInit).body))).toEqual({ selectedOperationIds: ["op-5"] });
}

it.each([false, true])("gates explicit Persona ChangeSet writes, retaining review, rejection and unrelated effects (enabled=%s)", async (enabled) => {
  features.personas = enabled;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  const id = randomUUID();
  const entities = ["persona", "persona", "persona", "cardPersona", "cardPersona", "card"];
  const operations = entities.map((entity, index) => ({ operationId: `op-${index}`, op: ["create", "update", "delete", "set", "unset", "delete"][index], entity }));
  const changeSet = { id, projectId: randomUUID(), title: "Persona proposal", source: "mcp", status: "approved", operations, createdAt: "2026-10-31T00:00:00.000Z" };
  const fetch = vi.fn(async (path: string, options?: RequestInit) => {
    if (options?.method === "POST") return Response.json({ changeSet });
    const requested = new URL(path, "http://localhost").searchParams.get("selectedOperationIds");
    const selected = requested ? JSON.parse(requested) as string[] : operations.map((operation) => operation.operationId);
    return Response.json({ changeSet, presentationStatus: "approved", closed: false, selectedOperationIds: selected, boards: [], conflicts: [], canApprove: true, canApply: true,
      operations: operations.map((operation, index) => ({ operationId: operation.operationId, index, label: `${operation.entity} ${operation.op}`, kind: operation.op, status: selected.includes(operation.operationId) ? "changed" : "excluded", dependencies: [], owners: [], changes: operation.entity === "card" ? [{ entity: "cardPersona", entityId: "implicit-link", before: {}, after: null, implicit: true }] : [], operation })) });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  function Review() { return createElement(ChangeSetReview, { state: useChangeSetReview(id) }); }
  const control = (text: string) => [...host.querySelectorAll("button")].find((button) => button.textContent === text)!;
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Review))));
    await vi.waitFor(() => expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(6));
    expect(host.textContent).toContain("Persona proposal");
    expect(control("Approve selection").getAttribute("aria-disabled")).toBe(String(!enabled));
    expect(control("Apply selection").getAttribute("aria-disabled")).toBe(String(!enabled));
    await act(async () => control("Apply selection").click());
    expect(fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(enabled);
    if (!enabled) await expectDisabledPersonaGateKeepsUnrelatedEffects(host, control, fetch);
    await act(async () => control("Reject ChangeSet").click());
    expect(fetch.mock.calls.some(([path]) => path.endsWith("/reject"))).toBe(true);
  } finally {
    features.personas = true;
    await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
