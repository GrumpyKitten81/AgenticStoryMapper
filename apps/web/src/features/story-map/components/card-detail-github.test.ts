import { incomingGitHubStrings } from "@storymapper/web/ui-strings/incoming-github";
// @vitest-environment jsdom // REQ Story 7.4
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import { beforeEach, expect, it, vi } from "vitest";
import { changeSetSchema, connectorConnectionSchema, storyMapSnapshotSchema, type ChangeSetPreviewResponse, type ConnectorConnection, type RemotePushPlan, type RemotePushPlanResponse } from "@storymapper/contracts";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { remotePushStrings } from "@storymapper/web/ui-strings/remote-push";
import { storyMapStrings } from "@storymapper/ui-strings";
import { state, projectId, storyMapId, cardId, viewUrl, button, mount } from "@storymapper/web/test-fixtures/card-detail";
import { fireEvent, getByLabelText, getByText } from "@testing-library/dom";
import { githubStatusStrings } from "@storymapper/web/ui-strings/github-status";
import { LifecycleDialog } from "@storymapper/web/features/story-map/components/LifecycleDialog";

let connections: ConnectorConnection[];
let plan: RemotePushPlan;
let calls: Array<{ path: string; input: unknown }>;
let incomingPreview: ChangeSetPreviewResponse | undefined;
let responses: Map<string, (input: unknown) => Promise<Response>>;

function result(status: "interrupted" | "completed"): RemotePushPlanResponse {
  return { plan, execution: { planId: plan.id, status, items: plan.items.map((item) => ({ itemId: item.id, state: status === "interrupted" ? "uncertain" : "succeeded", attempt: 1, remoteId: "7", url: "https://github.com/fixture/repo/issues/7" })) } };
}

function hold(path: string) {
  let finish!: (response: Response) => void;
  responses.set(path, () => new Promise<Response>((resolve) => { finish = resolve; }));
  return (value: unknown) => finish(Response.json(value));
}

async function editDraft(title: string) {
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, title);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    editor.commands.insertContent("Retained rich description draft");
  });
  return { input, editor };
}

beforeEach(() => {
  useLiveInteractionStore.setState({ epoch: "modal-epoch", restorePending: false, restoreRevision: 0, pendingChanges: {} });
  connections = [connectorConnectionSchema.parse({ id: randomUUID(), projectId, name: "Writable GitHub", provider: "github", owner: "fixture", repository: "repo", authMode: "token", readOnly: false, issueTypeMapping: [{ cardType: "story", issueType: "Task" }], createdAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z" })];
  const card = state.snapshot.cards.find((item) => item.id === cardId)!;
  plan = { id: randomUUID(), actor: { actorType: "human", actorId: "fixture-human" }, projectId, storyMapId, connectionId: connections[0]!.id, epoch: "modal-epoch", createdAt: "2026-10-19T00:00:00.000Z", selection: { cardIds: [cardId] }, localFingerprint: "local", connectionFingerprint: "connection", safetyFingerprint: "safety", remoteFingerprint: "remote", remoteEvidence: { issueTypes: ["Task"], labels: [], writable: true, milestones: [] }, exclusions: [], blockers: [], items: [{ id: randomUUID(), kind: "issue", entityId: cardId, action: "create", marker: `marker:${cardId}`, dependencies: [], labelAdditions: [], labelRemovals: [], managedLabels: [], payload: { title: card.title, body: card.description, labels: [], issueType: "Task", remoteState: "open", milestoneNumber: null } }] };
  calls = [];
  incomingPreview = undefined;
  responses = new Map([
    ["/api/sync/work-items/plan", async () => Response.json({ plan })],
    ["/api/sync/work-items/confirm", async () => Response.json(result("interrupted"))],
    ["/api/sync/work-items/resume", async () => Response.json(result("completed"))]
  ]);
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/connectors/connections?projectId=${projectId}`) return Promise.resolve(Response.json({ connections }));
    if (path.startsWith("/api/github/links") && responses.has(path)) {
      const input = JSON.parse(String(init?.body ?? "{}")); calls.push({ path, input }); return responses.get(path)!(input);
    }
    if (incomingPreview && path.startsWith(`/api/changesets/${incomingPreview.changeSet.id}`)) {
      if (init?.method === "POST") {
        calls.push({ path, input: JSON.parse(String(init.body)) });
        const respond = responses.get(path);
        if (respond) return respond(JSON.parse(String(init.body)));
        if (path.endsWith("/approve")) { incomingPreview.changeSet.status = "approved"; incomingPreview.presentationStatus = "approved"; incomingPreview.canApply = true; }
        else if (path.endsWith("/apply")) {
          incomingPreview.changeSet.status = "applied"; incomingPreview.presentationStatus = "applied"; incomingPreview.closed = true;
          state.snapshot = { ...state.snapshot, storyMap: { ...state.snapshot.storyMap, version: 2 }, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, version: 2, title: "Incoming remote title" } : card) };
          plan.items[0]!.payload.title = "Incoming remote title";
        } else throw new Error(`Unexpected ChangeSet mutation: ${path}`);
      }
      return Promise.resolve(Response.json(incomingPreview));
    }
    if (path.startsWith("/api/sync/work-items/")) {
      const input = JSON.parse(String(init?.body));
      calls.push({ path, input });
      const respond = responses.get(path);
      if (!respond) throw new Error(`Unexpected GitHub modal request: ${path}`);
      return respond(input);
    }
    return originalFetch(path, init);
  }));
});

it("offers current arbitrary names and archived as a valid local Restore choice", async () => {
  await mount(viewUrl);
  const card = { ...state.snapshot.cards.find((card) => card.id === cardId)!, archived: true, status: "Observed locally" };
  const snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((row) => row.id === cardId ? card : row) };
  await act(async () => state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(LifecycleDialog, { card, snapshot, action: "restore", onClose: vi.fn() }))));
  const dialog = document.querySelector('[role="alertdialog"]')!;
  const select = dialog.querySelector<HTMLSelectElement>("select")!;
  expect([...select.options].map((option) => option.value)).toEqual(expect.arrayContaining(["archived", "Observed locally"]));
  await act(async () => { select.value = "archived"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button(storyMapStrings.restore).click());
  expect(state.savedPatch).toMatchObject({ archived: false, status: "archived" });
});

async function expectPendingCloseProtection() {
  expect(state.client.isMutating({ mutationKey: ["card-owned-write", cardId], exact: true })).toBeGreaterThan(0);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(button(storyMapStrings.discard).disabled).toBe(true);
  await act(async () => button(storyMapStrings.cancel).click());
}

it("reviews binding in the actual Card dialog, protects pending navigation, and adopts refreshed source ownership", async () => {
  const card = state.snapshot.cards.find((card) => card.id === cardId)!;
  const source = { kind: "project" as const, projectId: "delivery", projectName: "Delivery", fieldId: "status" };
  connections[0]!.statusSource = source;
  const evidence = { source, issueState: "open" as const, membership: "present" as const, optionId: "review", name: "In Review" };
  const externalRefId = randomUUID();
  const link = { id: randomUUID(), externalRefId, connectionId: connections[0]!.id, provider: "github" as const, cardId, remoteId: "7", remoteNumber: 7, url: "https://github.com/fixture/repo/issues/7", labels: [], parentOverrideLocal: false, syncState: "synced" as const, statusEvidence: evidence };
  const changeSet = changeSetSchema.parse({ id: randomUUID(), projectId, source: "github", title: "Bind GitHub Issue", status: "proposed", createdAt: card.createdAt, operations: [
    { operationId: "ref", op: "create", entity: "githubExternalRef", entityId: externalRefId, after: { entityType: "card", entityId: cardId, externalId: link.url, scopeId: storyMapId } },
    { operationId: "binding", op: "set", entity: "remoteWorkItemLink", before: null, baseVersion: card.version, statusCatalog: { source, options: [{ id: "review", name: "In Review", position: 0 }] }, statusCardsBefore: [card], after: { externalRefId, connectionId: connections[0]!.id, titleHash: "title", bodyHash: "body", remoteState: "open", labels: [], syncState: "synced", statusEvidence: evidence, parentOverrideLocal: false } }
  ] });
  incomingPreview = { changeSet, presentationStatus: "proposed", closed: false, selectedOperationIds: ["ref", "binding"], conflicts: [], boards: [], canApprove: true, canApply: false, operations: changeSet.operations.map((operation, index) => ({ operationId: operation.operationId, index, label: "Bind GitHub Issue", kind: `${operation.op}:${operation.entity}`, status: "changed", dependencies: index ? ["ref"] : [], owners: [], changes: [], operation })) };
  const finishBinding = hold("/api/github/links");
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => getByText(document.body, githubStatusStrings.bind).click());
  await act(async () => { fireEvent.change(getByLabelText(document.body, githubStatusStrings.connection), { target: { value: connections[0]!.id } }); fireEvent.change(getByLabelText(document.body, githubStatusStrings.selector), { target: { value: "7" } }); });
  await act(async () => button(githubStatusStrings.previewBinding).click());
  await expectPendingCloseProtection();
  await act(async () => finishBinding({ changeSet, changeSetId: changeSet.id, outcome: "proposed", previewRef: { changeSetId: changeSet.id }, items: [{ status: "proposed", cardId, remoteId: "7" }] }));
  await vi.waitFor(() => expect(button("Approve selection")).toBeDefined());
  await act(async () => button("Approve selection").click());
  const finishApply = hold(`/api/changesets/${changeSet.id}/apply`);
  await act(async () => button("Apply selection").click());
  await expectPendingCloseProtection();
  changeSet.status = "applied"; incomingPreview.presentationStatus = "applied"; incomingPreview.closed = true;
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((row) => row.id === cardId ? { ...row, status: "In Review", version: row.version + 1 } : row), remoteWorkItemLinks: [link] };
  await act(async () => finishApply({ changeSet }));
  await vi.waitFor(() => expect(button(githubStatusStrings.detach)).toBeDefined());
  expect(document.querySelector<HTMLSelectElement>('select[title*="Status is owned by GitHub"]')?.value).toBe("In Review");
  expect(document.querySelector('option[value="In Review"]')).not.toBeNull();
  const finishDetach = hold(`/api/github/links/${externalRefId}`);
  await act(async () => button(githubStatusStrings.detach).click());
  await expectPendingCloseProtection();
  state.snapshot = { ...state.snapshot, remoteWorkItemLinks: [] };
  await act(async () => finishDetach({ ok: true }));
});

it("routes modal preview, exact confirmation, interruption and same-plan resume while retaining pending dirty drafts", async () => {
  const finishPreview = hold("/api/sync/work-items/plan");
  const finishConfirm = hold("/api/sync/work-items/confirm");
  await mount(`${viewUrl}?card=${cardId}`);
  const { input, editor } = await editDraft("Unsaved title before preview");
  await act(async () => { button(storyMapStrings.previewGitHubTicket).click(); button(storyMapStrings.previewGitHubTicket).click(); });
  expect(calls).toEqual([{ path: "/api/sync/work-items/plan", input: { storyMapId, connectionId: connections[0]!.id, cardIds: [cardId], mode: "push" } }]);
  await act(async () => finishPreview({ plan }));
  expect(document.querySelector('[aria-label="GitHub Dry Run"]')?.textContent).toContain(plan.items[0]!.payload.title);
  await act(async () => { button(remotePushStrings.confirm).click(); button(remotePushStrings.confirm).click(); });
  expect(calls.filter((call) => call.path.endsWith("/confirm"))).toEqual([{ path: "/api/sync/work-items/confirm", input: { planId: plan.id } }]);
  await editDraft("Unsaved text during remote call");
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(button(storyMapStrings.discard).disabled).toBe(true);
  await act(async () => button(storyMapStrings.cancel).click());
  await act(async () => finishConfirm(result("interrupted")));
  expect(input.value).toBe("Unsaved text during remote call");
  expect(editor.storage.markdown.getMarkdown()).toContain("Retained rich description draft");
  expect(document.querySelector('[aria-label="Remote effect results"]')?.textContent).toContain(remotePushStrings.executionStates.uncertain);
  expect(document.querySelector<HTMLAnchorElement>('[aria-label="Remote effect results"] a')?.href).toBe("https://github.com/fixture/repo/issues/7");
  await act(async () => button(remotePushStrings.resume).click());
  expect(calls.filter((call) => call.path.endsWith("/resume"))).toEqual([{ path: "/api/sync/work-items/resume", input: { planId: plan.id } }]);
  expect(calls.filter((call) => call.path.endsWith("/confirm"))).toHaveLength(1);
  expect(input.value).toBe("Unsaved text during remote call");
});

it.each(["epoch", "connection"])("ignores a pending modal preview after its %s changes and retains the draft", async (changed) => {
  const finishPreview = hold("/api/sync/work-items/plan");
  connections.push({ ...connections[0]!, id: randomUUID(), name: "Other repository" });
  await mount(`${viewUrl}?card=${cardId}`);
  const { input } = await editDraft("Keep this pending draft");
  await act(async () => button(storyMapStrings.previewGitHubTicket).click());
  await act(async () => {
    if (changed === "epoch") useLiveInteractionStore.setState({ epoch: "replacement-epoch", restorePending: false });
    else {
      const select = document.querySelector<HTMLSelectElement>(`select[title="${storyMapStrings.targetRepository}"]`)!;
      select.value = connections[1]!.id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await act(async () => finishPreview({ plan }));
  expect(document.querySelector('[aria-label="GitHub Dry Run"]')).toBeNull();
  expect(input.value).toBe("Keep this pending draft");
  expect(calls.filter((call) => call.path.endsWith("/confirm") || call.path.endsWith("/resume"))).toEqual([]);
});

it("ignores late modal execution results from the previous database epoch", async () => {
  const finishConfirm = hold("/api/sync/work-items/confirm");
  await mount(`${viewUrl}?card=${cardId}`);
  const { input } = await editDraft("Retained execution draft");
  await act(async () => button(storyMapStrings.previewGitHubTicket).click());
  await act(async () => button(remotePushStrings.confirm).click());
  await act(async () => useLiveInteractionStore.setState({ epoch: "new-epoch", restorePending: false }));
  await act(async () => finishConfirm(result("interrupted")));
  expect(document.querySelector('[aria-label="Remote effect results"]')).toBeNull();
  expect(document.body.textContent).not.toContain(remotePushStrings.resume);
  expect(input.value).toBe("Retained execution draft");
});

it("reviews linked Card incoming changes before a separate outgoing plan and preserves the dirty editor", async () => {
  state.snapshot = storyMapSnapshotSchema.parse({ ...state.snapshot, remoteWorkItemLinks: [{ id: randomUUID(), externalRefId: randomUUID(), connectionId: connections[0]!.id, provider: "github", cardId, remoteId: "7", remoteNumber: 7, url: "https://github.com/fixture/repo/issues/7", labels: [], syncState: "unsynced" }] });
  const operation = { operationId: "incoming", op: "update" as const, entity: "card" as const, entityId: cardId, after: { title: "Incoming remote title" } };
  const changeSet = changeSetSchema.parse({ id: randomUUID(), projectId, source: "github", title: "Incoming Card update", status: "proposed", createdAt: "2026-10-19T00:00:00.000Z", operations: [operation] });
  incomingPreview = { changeSet, presentationStatus: "proposed", closed: false, selectedOperationIds: ["incoming"], conflicts: [], boards: [], canApprove: true, canApply: false, operations: [{ operationId: "incoming", index: 0, label: "Update Card", kind: "update:card", status: "changed", dependencies: [], owners: [], changes: [], operation }] };
  responses.set("/api/sync/work-items/sync", async () => Response.json({ changeSet, changeSetId: changeSet.id, outcome: "proposed", previewRef: { changeSetId: changeSet.id }, items: [{ status: "proposed", cardId, remoteId: "7" }] }));
  await mount(`${viewUrl}?card=${cardId}`);
  const { input } = await editDraft("Keep dirty local title");
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === storyMapStrings.syncWithGitHub)!.click());
  await vi.waitFor(() => expect(document.querySelector('[aria-label="Incoming GitHub changes"]')).not.toBeNull());
  expect(calls[0]).toEqual({ path: "/api/sync/work-items/sync", input: { storyMapId, connectionId: connections[0]!.id, cardIds: [cardId], confirm: true, apply: false } });
  expect(document.querySelector('[aria-label="GitHub Dry Run"]')).toBeNull();
  await vi.waitFor(() => expect(button("Approve selection")).toBeDefined());
  const approvePath = `/api/changesets/${changeSet.id}/approve`;
  const finishApprove = hold(approvePath);
  const syncButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === storyMapStrings.syncWithGitHub)!;
  await act(async () => { button("Approve selection").click(); syncButton.click(); button(storyMapStrings.save).click(); });
  expect(calls.filter((call) => call.path.endsWith("/sync"))).toHaveLength(1);
  expect(syncButton.disabled).toBe(true);
  expect(button(storyMapStrings.save).disabled).toBe(true);
  incomingPreview.changeSet.status = "approved"; incomingPreview.presentationStatus = "approved"; incomingPreview.canApply = true;
  await act(async () => finishApprove({ changeSet }));
  await vi.waitFor(() => expect(button("Apply selection").getAttribute("aria-disabled")).toBe("false"));
  await act(async () => button("Apply selection").click());
  await vi.waitFor(() => expect(button(incomingGitHubStrings.outgoing)).toBeDefined());
  expect(calls.some((call) => call.path.endsWith("/plan") || call.path.endsWith("/confirm"))).toBe(false);
  expect(input.value).toBe("Keep dirty local title");
  responses.set("/api/sync/work-items/plan", async () => Response.json({ code: "validation", message: "Refresh the GitHub session." }, { status: 400 }));
  await act(async () => button(incomingGitHubStrings.outgoing).click());
  await vi.waitFor(() => expect([...document.querySelectorAll('[role="alert"]')].some((item) => item.textContent === "Refresh the GitHub session.")).toBe(true));
  expect(input.value).toBe("Keep dirty local title");
  expect(document.querySelector('[aria-label="GitHub Dry Run"]')).toBeNull();
  expect(calls.some((call) => call.path.endsWith("/confirm"))).toBe(false);
  responses.set("/api/sync/work-items/plan", async () => Response.json({ plan }));
  await act(async () => button(incomingGitHubStrings.outgoing).click());
  await vi.waitFor(() => expect(document.querySelector('[aria-label="GitHub Dry Run"]')).not.toBeNull());
  expect(document.body.textContent).not.toContain("Refresh the GitHub session.");
  expect(calls.find((call) => call.path.endsWith("/plan"))?.input).toEqual({ storyMapId, connectionId: connections[0]!.id, cardIds: [cardId], mode: "sync" });
  expect(input.value).toBe("Keep dirty local title");
  await act(async () => button(remotePushStrings.confirm).click());
  expect(calls.filter((call) => call.path.endsWith("/confirm"))).toEqual([{ path: "/api/sync/work-items/confirm", input: { planId: plan.id } }]);
});

it("refuses modal confirmation when the selected connection changes in the same event", async () => {
  connections.push({ ...connections[0]!, id: randomUUID(), name: "Other repository" });
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => button(storyMapStrings.previewGitHubTicket).click());
  const confirm = button(remotePushStrings.confirm);
  const select = document.querySelector<HTMLSelectElement>(`select[title="${storyMapStrings.targetRepository}"]`)!;
  await act(async () => { select.value = connections[1]!.id; select.dispatchEvent(new Event("change", { bubbles: true })); confirm.click(); });
  expect(calls.filter((call) => call.path.endsWith("/confirm") || call.path.endsWith("/resume"))).toEqual([]);
});

it("renders linked incoming failure results and retains the dirty Card draft for retry", async () => {
  state.snapshot = storyMapSnapshotSchema.parse({ ...state.snapshot, remoteWorkItemLinks: [{ id: randomUUID(), externalRefId: randomUUID(), connectionId: connections[0]!.id, provider: "github", cardId, remoteId: "7", remoteNumber: 7, url: "https://github.com/fixture/repo/issues/7", labels: [], syncState: "unsynced" }] });
  responses.set("/api/sync/work-items/sync", async () => Response.json({ code: "validation", message: "Provider preparation failed.", details: { items: [{ status: "failed", cardId, remoteId: "7", code: "validation", message: "Issue could not be read.", details: { phase: "prepare" } }] } }, { status: 400 }));
  await mount(`${viewUrl}?card=${cardId}`);
  const { input } = await editDraft("Retain failed incoming draft");
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === storyMapStrings.syncWithGitHub)!.click());
  await vi.waitFor(() => expect(document.querySelector('[aria-label="Preparation results"]')?.textContent).toContain("Issue could not be read."));
  expect(document.body.textContent).toContain("Provider preparation failed.");
  expect(input.value).toBe("Retain failed incoming draft");
  expect(calls.filter((call) => call.path.endsWith("/plan") || call.path.endsWith("/confirm"))).toEqual([]);
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === storyMapStrings.syncWithGitHub)!.disabled).toBe(false);
});
