// @vitest-environment jsdom // REQ keyboard review selection retains focus across delayed canonical closure
import type { ChangeSet } from "@storymapper/contracts";
import { randomUUID } from "node:crypto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import axe from "axe-core";
import { fireEvent, getByRole, getAllByRole } from "@testing-library/dom";
import { expect, it, vi } from "vitest";
import { changeSetSchema, type ChangeSetPreviewResponse } from "@storymapper/contracts";
import { ChangeSetReview } from "@storymapper/web/features/changesets/ChangeSetReview";
import { useChangeSetReview } from "@storymapper/web/features/changesets/useChangeSetReview";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";

async function auditReview(host: HTMLElement) {
  const result = await axe.run(host, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
  expect(result.passes.length).toBeGreaterThan(0);
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))).toEqual([]);
}

it("retains focused checkbox DOM while delayed selection requests cancel safely and decisions wait for server closure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ reviewRevision: 0 });
  const id = randomUUID();
  const operations = [0, 1, 2].map((index) => ({ operationId: `op-${index}`, op: "create" as const, entity: "persona" as const, after: { projectId: randomUUID(), name: `Persona ${index}` } }));
  const changeSet = changeSetSchema.parse({ id, projectId: randomUUID(), title: "Keyboard review", source: "mcp", operations, createdAt: "2026-10-17T00:00:00.000Z" });
  const response = (selectedOperationIds: string[]): Response => Response.json({ changeSet, presentationStatus: "proposed", closed: false, selectedOperationIds, boards: [], conflicts: [], canApprove: true, canApply: false,
    operations: operations.map((operation, index) => ({ operationId: operation.operationId, index, label: operation.after.name, kind: "create persona", status: selectedOperationIds.includes(operation.operationId) ? "changed" : "excluded", dependencies: [], owners: [], changes: [], operation })) } satisfies ChangeSetPreviewResponse);
  const pending: Array<{ selection: string[]; resolve: (response: Response) => void; signal: AbortSignal | undefined }> = [];
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    expect(init?.method).not.toBe("POST");
    const requested = new URL(path, "http://localhost").searchParams.get("selectedOperationIds");
    if (!requested) return response(["op-0", "op-1", "op-2"]);
    return new Promise<Response>((resolve) => pending.push({ selection: JSON.parse(requested) as string[], resolve, signal: init?.signal ?? undefined }));
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  function Review() { return <ChangeSetReview state={useChangeSetReview(id)} />; }
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><Review /></QueryClientProvider>));
    await vi.waitFor(() => expect(getAllByRole(host, "checkbox")).toHaveLength(3));
    const [first, second] = getAllByRole(host, "checkbox") as HTMLInputElement[];
    await exerciseRetainsFocusedCheckboxDOMWhileDelayedSelectionRequestsCancel(first, pending, host, second, response);
  } finally {
    await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals();
    useLiveInteractionStore.setState({ reviewRevision: 0 });
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});

it("keeps keyboard focus through delayed Approve and moves focus to the review heading after Apply closes actions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ reviewRevision: 0 });
  const id = randomUUID();
  const operation = { operationId: "create", op: "create" as const, entity: "persona" as const, after: { projectId: randomUUID(), name: "Persona" } };
  const changeSet = changeSetSchema.parse({ id, projectId: randomUUID(), title: "Lifecycle keyboard review", source: "mcp", operations: [operation], createdAt: "2026-10-17T00:00:00.000Z" });
  let status: "proposed" | "approved" | "applied" = "proposed";
  const body = (): ChangeSetPreviewResponse => ({ changeSet: { ...changeSet, status }, presentationStatus: status, closed: status === "applied", selectedOperationIds: ["create"], boards: [], conflicts: [], canApprove: status === "proposed", canApply: status === "approved", operations: [{ operationId: "create", index: 0, label: "Persona", kind: "create persona", status: "changed", dependencies: [], owners: [], changes: [], operation }] });
  const decisions: Array<{ action: string; resolve: (response: Response) => void }> = [];
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Promise<Response>((resolve) => decisions.push({ action: path, resolve }));
    return Response.json(body());
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  function Review() { return <ChangeSetReview state={useChangeSetReview(id)} />; }
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><Review /></QueryClientProvider>));
    await vi.waitFor(() => expect(getByRole(host, "button", { name: "Approve selection" }).getAttribute("aria-disabled")).toBe("false"));
    await auditReview(host);
    const approve = getByRole(host, "button", { name: "Approve selection" }) as HTMLButtonElement;
    approve.focus();
    await act(async () => { fireEvent.keyDown(approve, { key: " " }); fireEvent.click(approve); fireEvent.click(approve); fireEvent.keyUp(approve, { key: " " }); });
    await vi.waitFor(() => expect(decisions).toHaveLength(1));
    expect(decisions[0]!.action).toBe(`/api/changesets/${id}/approve`);
    expect(document.activeElement).toBe(approve);
    expect(approve.disabled).toBe(false);
    expect(approve.getAttribute("aria-disabled")).toBe("true");
    await act(async () => { fireEvent.click(approve); fireEvent.click(getByRole(host, "button", { name: "Apply selection" })); });
    expect(decisions).toHaveLength(1);
    status = "approved";
    await act(async () => decisions[0]!.resolve(Response.json({ changeSet: { ...changeSet, status } })));
    const apply = getByRole(host, "button", { name: "Apply selection" }) as HTMLButtonElement;
    status = await exerciseKeepsKeyboardFocusThroughDelayedApproveAndMovesFocus(apply, approve, host, decisions, id, status, changeSet, (value) => { status = value; });
  } finally {
    await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals();
    useLiveInteractionStore.setState({ reviewRevision: 0 }); notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});

async function exerciseRetainsFocusedCheckboxDOMWhileDelayedSelectionRequestsCancel(first: HTMLInputElement | undefined, pending: { selection: string[]; resolve: (response: Response) => void; signal: AbortSignal | undefined; }[], host: HTMLDivElement, second: HTMLInputElement | undefined, response: (selectedOperationIds: string[]) => Response) {
  first!.focus();
  await act(async () => { fireEvent.keyDown(first!, { key: " " }); fireEvent.click(first!); fireEvent.keyUp(first!, { key: " " }); });
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(pending[0]!.selection).toEqual(["op-1", "op-2"]);
  expect(document.activeElement).toBe(first);
  expect(first!.isConnected).toBe(true);
  expect(first!.disabled).toBe(false);
  expect(first!.checked).toBe(false);
  expect(getByRole(host, "region").getAttribute("aria-busy")).toBe("true");
  expect((getByRole(host, "button", { name: "Approve selection" }) as HTMLButtonElement).getAttribute("aria-disabled")).toBe("true");
  await act(async () => fireEvent.click(second!));
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(pending[1]!.selection).toEqual(["op-2"]);
  expect(pending[0]!.signal!.aborted).toBe(true);
  await act(async () => pending[1]!.resolve(response([])));
  await vi.waitFor(() => expect(getByRole(host, "region").getAttribute("aria-busy")).toBe("false"));
  expect(document.activeElement).toBe(first);
  expect(getAllByRole(host, "checkbox")[0]).toBe(first);
  expect((getAllByRole(host, "checkbox") as HTMLInputElement[]).every((checkbox) => !checkbox.checked)).toBe(true);
  await act(async () => pending[0]!.resolve(response(["op-1", "op-2"])));
  expect(first!.checked).toBe(false);
  await act(async () => fireEvent.click(first!));
  await vi.waitFor(() => expect(pending).toHaveLength(3));
  expect(pending[2]!.selection).toEqual(["op-0"]);
  expect(document.activeElement).toBe(first);
  await act(async () => pending[2]!.resolve(response(["op-0"])));
  await vi.waitFor(() => expect((getByRole(host, "button", { name: "Approve selection" }) as HTMLButtonElement).getAttribute("aria-disabled")).toBe("false"));
  expect(document.activeElement).toBe(first);
}

async function exerciseKeepsKeyboardFocusThroughDelayedApproveAndMovesFocus(apply: HTMLButtonElement, approve: HTMLButtonElement, host: HTMLDivElement, decisions: { action: string; resolve: (response: Response) => void; }[], id: string, status: "proposed" | "approved" | "applied", changeSet: ChangeSet, setStatus: (value: "proposed" | "approved" | "applied") => void) {
  await vi.waitFor(() => expect(apply.getAttribute("aria-disabled")).toBe("false"));
  expect(document.activeElement).toBe(approve);
  expect(getByRole(host, "button", { name: "Approve selection" })).toBe(approve);
  expect(approve.getAttribute("aria-disabled")).toBe("true");
  apply.focus();
  await act(async () => { fireEvent.click(apply); fireEvent.click(apply); });
  await vi.waitFor(() => expect(decisions).toHaveLength(2));
  expect(document.activeElement).toBe(apply);
  expect(decisions[1]!.action).toBe(`/api/changesets/${id}/apply`);
  status = "applied";
  setStatus(status);
  await act(async () => decisions[1]!.resolve(Response.json({ changeSet: { ...changeSet, status } })));
  await vi.waitFor(() => expect(document.activeElement).toBe(getByRole(host, "heading", { name: "Lifecycle keyboard review" })));
  expect(host.querySelector(".changeset-actions")).toBeNull();
  expect(getByRole(host, "status").textContent).toBe("Applied");
  await auditReview(host);
  expect(decisions).toHaveLength(2);
  return status;
}

async function reviewFixture() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ reviewRevision: 0 });
  const id = randomUUID();
  const operation = { operationId: "create", op: "create" as const, entity: "persona" as const, after: { projectId: randomUUID(), name: "Persona" } };
  const data = (proposalId = id, status: "approved" | "rejected" | "applied" = "approved", selectedOperationIds = ["create"]): ChangeSetPreviewResponse => ({
    changeSet: changeSetSchema.parse({ id: proposalId, projectId: randomUUID(), title: `Review ${proposalId}`, source: "mcp", status, operations: [operation], createdAt: "2026-10-17T00:00:00.000Z" }),
    presentationStatus: status, closed: status !== "approved", selectedOperationIds, boards: [], conflicts: [], canApprove: status === "approved", canApply: status === "approved",
    operations: [{ operationId: "create", index: 0, label: "Persona", kind: "create persona", status: selectedOperationIds.includes("create") ? "changed" : "excluded", dependencies: [], owners: [], changes: [], operation }]
  });
  const pending: Array<{ path: string; resolve: (response: Response) => void; reject: (error: Error) => void }> = [];
  let initial = true;
  const fetch = vi.fn(async (path: string) => {
    if (initial) { initial = false; return Response.json(data()); }
    return new Promise<Response>((resolve, reject) => pending.push({ path, resolve, reject }));
  }); vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let review: ReturnType<typeof useChangeSetReview>;
  function Review({ proposalId }: { proposalId: string }) { review = useChangeSetReview(proposalId); return <ChangeSetReview state={review} />; }
  const render = async (proposalId = id) => { await act(async () => root.render(<QueryClientProvider client={client}><Review proposalId={proposalId} /></QueryClientProvider>)); };
  await render(); await vi.waitFor(() => expect(getAllByRole(host, "checkbox")).toHaveLength(1));
  const button = (name: string) => getByRole(host, "button", { name }) as HTMLButtonElement;
  const close = async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); useLiveInteractionStore.setState({ reviewRevision: 0 }); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); };
  return { id, data, pending, fetch, host, button, render, close, get review() { return review; } };
}

it("keeps the same focused Refresh control through a delayed refresh and refuses repeat activation", async () => {
  const fixture = await reviewFixture();
  try {
    const refresh = fixture.button("Review current state"); refresh.focus();
    await act(async () => { fireEvent.click(refresh); fireEvent.click(refresh); });
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(1));
    expect(document.activeElement).toBe(refresh); expect(refresh.disabled).toBe(false);
    expect(refresh.getAttribute("aria-disabled")).toBe("true");
    await act(async () => fireEvent.click(refresh)); expect(fixture.pending).toHaveLength(1);
    await act(async () => fixture.pending[0]!.resolve(Response.json(fixture.data())));
    await vi.waitFor(() => expect(refresh.getAttribute("aria-disabled")).toBe("false"));
    expect(document.activeElement).toBe(refresh);
    expect(fixture.button("Review current state")).toBe(refresh);
  } finally { await fixture.close(); }
});

it("moves failed selection focus to retry and recovers the retained requested selection safely", async () => {
  const fixture = await reviewFixture();
  try {
    const checkbox = getByRole(fixture.host, "checkbox") as HTMLInputElement; checkbox.focus();
    await act(async () => fireEvent.click(checkbox));
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(1));
    await act(async () => fixture.pending[0]!.reject(new TypeError("Selection preview unavailable")));
    await vi.waitFor(() => expect(getByRole(fixture.host, "alert").textContent).toContain("Selection preview unavailable"));
    const retry = fixture.button("Review current state"); expect(document.activeElement).toBe(retry);
    expect(fixture.host.querySelector('input[type="checkbox"]')).toBeNull();
    await act(async () => fireEvent.click(retry));
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(2));
    expect(new URL(fixture.pending[1]!.path, "http://localhost").searchParams.get("selectedOperationIds")).toBe("[]");
    await act(async () => fixture.pending[1]!.resolve(Response.json(fixture.data(fixture.id, "approved", []))));
    await vi.waitFor(() => expect(getByRole(fixture.host, "checkbox")).toBeDefined());
    expect(document.activeElement).toBe(retry);
    expect((getByRole(fixture.host, "checkbox") as HTMLInputElement).checked).toBe(false);
    expect(fixture.button("Approve selection").getAttribute("aria-disabled")).toBe("true");
  } finally { await fixture.close(); }
});

it("exposes live-invalidated selection as unavailable without blurring and isolates populated revision refresh", async () => {
  const fixture = await reviewFixture();
  try {
    const checkbox = getByRole(fixture.host, "checkbox") as HTMLInputElement; checkbox.focus();
    await act(async () => useLiveInteractionStore.getState().invalidateReviews());
    expect(checkbox.getAttribute("aria-disabled")).toBe("true"); expect(document.activeElement).toBe(checkbox);
    await act(async () => fireEvent.click(checkbox)); expect(fixture.pending).toHaveLength(0); expect(checkbox.checked).toBe(true);
    const refresh = fixture.button("Review current state"); refresh.focus();
    await act(async () => fireEvent.click(refresh));
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(1));
    expect(fixture.host.textContent).not.toContain(`Review ${fixture.id}`);
    expect(fixture.host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(document.activeElement).toBe(refresh);
    await act(async () => fixture.pending[0]!.resolve(Response.json(fixture.data())));
    await vi.waitFor(() => expect(getByRole(fixture.host, "checkbox").getAttribute("aria-disabled")).toBe("false"));
    expect(document.activeElement).toBe(refresh);
  } finally { await fixture.close(); }
});

it("never displays the previous proposal while a different identity has a delayed initial preview", async () => {
  const fixture = await reviewFixture();
  try {
    const nextId = randomUUID(); await fixture.render(nextId);
    await vi.waitFor(() => expect(fixture.pending.length).toBeGreaterThan(0));
    expect(fixture.host.textContent).not.toContain(`Review ${fixture.id}`);
    expect(fixture.host.querySelector('input[type="checkbox"]')).toBeNull();
    const request = fixture.pending.find(({ path }) => path.startsWith(`/api/changesets/${nextId}/preview`))!;
    await act(async () => request.resolve(Response.json(fixture.data(nextId))));
    await vi.waitFor(() => expect(fixture.host.textContent).toContain(`Review ${nextId}`));
    expect(fixture.host.textContent).not.toContain(`Review ${fixture.id}`);
  } finally { await fixture.close(); }
});

it("preserves Reject focus through delayed refusal then closes to a meaningful heading on retry", async () => {
  const fixture = await reviewFixture();
  try {
    const reject = fixture.button("Reject ChangeSet"); reject.focus();
    await act(async () => { fireEvent.click(reject); fireEvent.click(reject); });
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(1));
    expect(fixture.pending[0]!.path).toBe(`/api/changesets/${fixture.id}/reject`); expect(document.activeElement).toBe(reject);
    await act(async () => fixture.pending[0]!.resolve(Response.json({ message: "Reject refused" }, { status: 409 })));
    await vi.waitFor(() => expect(getByRole(fixture.host, "alert").textContent).toContain("Request failed: 409"));
    expect(document.activeElement).toBe(reject); expect(reject.getAttribute("aria-disabled")).toBe("false");
    await act(async () => fireEvent.click(reject)); await vi.waitFor(() => expect(fixture.pending).toHaveLength(2));
    await act(async () => fixture.pending[1]!.resolve(Response.json({ changeSet: fixture.data(fixture.id, "rejected").changeSet })));
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(3));
    await act(async () => fixture.pending[2]!.resolve(Response.json(fixture.data(fixture.id, "rejected"))));
    await vi.waitFor(() => expect(document.activeElement).toBe(getByRole(fixture.host, "heading", { name: `Review ${fixture.id}` })));
    expect(getByRole(fixture.host, "status").textContent).toBe("Rejected");
  } finally { await fixture.close(); }
});

it.each(["refused", "unknown"] as const)("preserves Apply focus and guarded recovery after a delayed %s outcome", async (mode) => {
  const fixture = await reviewFixture();
  try {
    const apply = fixture.button("Apply selection"); apply.focus();
    await act(async () => { fireEvent.click(apply); fireEvent.click(apply); });
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(1));
    if (mode === "refused") await act(async () => fixture.pending[0]!.resolve(Response.json({ message: "Root changed" }, { status: 409 })));
    else await act(async () => fixture.pending[0]!.reject(new TypeError("Connection lost")));
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(2));
    expect(document.activeElement).toBe(apply);
    await act(async () => fireEvent.click(apply)); expect(fixture.pending).toHaveLength(2);
    await act(async () => fixture.pending[1]!.resolve(Response.json(fixture.data())));
    await vi.waitFor(() => expect(getByRole(fixture.host, "alert").textContent).toContain(mode === "refused" ? "Nothing was applied" : "outcome is unknown"));
    expect(document.activeElement).toBe(apply); expect(apply.getAttribute("aria-disabled")).toBe("true");
    await act(async () => fireEvent.click(apply)); expect(fixture.pending).toHaveLength(2);
    const approve = fixture.button("Approve selection"); approve.focus();
    await act(async () => fireEvent.click(approve)); await vi.waitFor(() => expect(fixture.pending).toHaveLength(3));
    await act(async () => fixture.pending[2]!.resolve(Response.json({ changeSet: fixture.data().changeSet })));
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(4));
    await act(async () => fixture.pending[3]!.resolve(Response.json(fixture.data())));
    await vi.waitFor(() => expect(apply.getAttribute("aria-disabled")).toBe("false"));
    expect(document.activeElement).toBe(approve); expect(fixture.host.querySelector('[role="alert"]')).toBeNull();
  } finally { await fixture.close(); }
});

it("moves unknown Apply with unavailable reconciliation to retry without authorizing another Apply", async () => {
  const fixture = await reviewFixture();
  try {
    const apply = fixture.button("Apply selection"); apply.focus();
    await act(async () => fireEvent.click(apply));
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(1));
    await act(async () => fixture.pending[0]!.reject(new TypeError("Apply response lost")));
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(2));
    await act(async () => fixture.pending[1]!.reject(new TypeError("History unavailable")));
    await vi.waitFor(() => expect(fixture.host.textContent).toContain("History unavailable"));
    expect(fixture.host.textContent).toContain("outcome is unknown");
    const retry = fixture.button("Review current state"); expect(document.activeElement).toBe(retry);
    await act(async () => fireEvent.click(retry));
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(3));
    await act(async () => fixture.pending[2]!.resolve(Response.json(fixture.data())));
    await vi.waitFor(() => expect(fixture.button("Apply selection").getAttribute("aria-disabled")).toBe("true"));
    expect(document.activeElement).toBe(retry);
    expect(fixture.host.textContent).toContain("outcome is unknown");
    await act(async () => fireEvent.click(fixture.button("Apply selection")));
    expect(fixture.pending).toHaveLength(3);
  } finally { await fixture.close(); }
});


it.each(["refresh", "live invalidation"] as const)("refuses same-event %s followed by decision admission and direct mutation execution", async (boundary) => {
  const fixture = await reviewFixture();
  try {
    const captured = fixture.review;
    const approve = fixture.button("Approve selection");
    expect(approve.getAttribute("aria-disabled")).toBe("false");
    await act(async () => {
      if (boundary === "refresh") fireEvent.click(fixture.button("Review current state"));
      else useLiveInteractionStore.getState().invalidateReviews();
      fireEvent.click(approve);
      captured.decideAction("apply");
      captured.decideAction("reject");
      captured.decide.mutate("approve");
    });
    expect(fixture.pending.every(({ path }) => path.includes("/preview"))).toBe(true);
    expect(fixture.fetch.mock.calls.filter(([path]) => !path.includes("/preview"))).toEqual([]);
    expect(fixture.button("Approve selection").getAttribute("aria-disabled")).toBe("true");
    expect(fixture.host.textContent).toContain("Incoming changes invalidate this review");
    if (boundary === "live invalidation") await act(async () => fireEvent.click(fixture.button("Review current state")));
    await vi.waitFor(() => expect(fixture.pending).toHaveLength(1));
    await act(async () => fixture.pending[0]!.resolve(Response.json(fixture.data())));
    await vi.waitFor(() => expect(fixture.button("Approve selection").getAttribute("aria-disabled")).toBe("false"));
    expect(fixture.fetch.mock.calls.filter(([path]) => !path.includes("/preview"))).toEqual([]);
  } finally { await fixture.close(); }
});
