// @vitest-environment jsdom // REQ late preview responses cannot replace a newer selection
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { changeSetSchema, type ChangeSetPreviewResponse } from "@storymapper/contracts";
import { useChangeSetReview, type ChangeSetReviewState } from "@storymapper/web/features/changesets/useChangeSetReview";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";

it("retains newer requested selection and eligibility when an older response arrives after cancellation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); notifyManager.setScheduler(queueMicrotask); useLiveInteractionStore.setState({ reviewRevision: 0 });
  const id = randomUUID();
  const operations = [0, 1, 2].map((index) => ({ operationId: `op-${index}`, op: "create" as const, entity: "persona" as const, after: { projectId: randomUUID(), name: `Persona ${index}` } }));
  const changeSet = changeSetSchema.parse({ id, projectId: randomUUID(), title: "Selection race", source: "mcp", createdAt: "2026-10-12T00:00:00.000Z", operations });
  function response(selectedOperationIds: string[]): Response { const body: ChangeSetPreviewResponse = { changeSet, presentationStatus: "proposed", closed: false, selectedOperationIds, boards: [], conflicts: [], canApprove: selectedOperationIds.length > 0, canApply: false, operations: operations.map((operation, index) => ({ operationId: operation.operationId, index, label: operation.after.name, kind: "create persona", status: selectedOperationIds.includes(operation.operationId) ? "changed" : "excluded", dependencies: [], owners: [], changes: [], operation })) }; return Response.json(body); }
  let releaseOlder: ((response: Response) => void) | undefined; let olderSignal: AbortSignal | undefined;
  const fetch = vi.fn(async (path: string, options?: RequestInit) => {
    const value = new URL(path, "http://localhost").searchParams.get("selectedOperationIds");
    const selection = value ? JSON.parse(value) as string[] : operations.map((operation) => operation.operationId);
    if (selection.join(",") === "op-1,op-2") { olderSignal = options?.signal ?? undefined; return new Promise<Response>((resolve) => { releaseOlder = resolve; }); }
    return response(selection);
  }); vi.stubGlobal("fetch", fetch);
  let state: ChangeSetReviewState | undefined;
  function Probe() { state = useChangeSetReview(id); return createElement("output", null, JSON.stringify(state.selected)); }
  const client = new QueryClient(); const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
    await vi.waitFor(() => expect(state!.selected).toEqual(["op-0", "op-1", "op-2"]));
    await act(async () => state!.select("op-0", false));
    await vi.waitFor(() => expect(releaseOlder).toBeDefined());
    await act(async () => state!.select("op-1", false));
    await vi.waitFor(() => expect(state!.selected).toEqual(["op-2"]));
    expect(olderSignal!.aborted).toBe(true);
    await act(async () => releaseOlder!(response(["op-1", "op-2"])));
    expect(state!.selected).toEqual(["op-2"]); expect(state!.canApprove).toBe(true);
    expect(host.textContent).toBe('["op-2"]');
  } finally { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); }
});
