// @vitest-environment jsdom // REQ actual shell query closure and held Card editor preview invalidation
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import type { Editor } from "@tiptap/react";
import { expect, it, vi } from "vitest";
import { changeSetSchema, remoteWorkItemLinkSchema, incomingGitHubCommandResponseSchema, cardReviewSettingsSchema, type ChangeSetPreviewResponse } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { router } from "@storymapper/web/app/router";
import { useLiveUpdates } from "@storymapper/web/app/live/useLiveUpdates";
import { liveUpdatesHeld, useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import type { LiveMessage } from "@storymapper/web/app/live/live-stream-reader";
import { state, projectId, cardId, viewUrl, mount } from "@storymapper/web/test-fixtures/card-detail";

const transport = vi.hoisted(() => ({ receive: undefined as ((message: LiveMessage) => void) | undefined }));
vi.mock("@storymapper/web/app/live/live-stream", () => ({ startLiveStream: (callbacks: { receive: (message: LiveMessage) => void; state: (value: string) => void }) => { transport.receive = callbacks.receive; callbacks.state("connected"); return () => { transport.receive = undefined; }; } }));

function previewResponse(status: "proposed" | "applied" = "proposed"): ChangeSetPreviewResponse {
  const changeSet = changeSetSchema.parse({ id: randomUUID(), projectId, title: "Shell proposal", source: "mcp", status, createdAt: "2026-10-12T00:00:00.000Z", operations: [{ operationId: "edit", op: "update", entity: "card", entityId: cardId, baseVersion: 1, after: { title: "Projected title" } }] });
  return { changeSet, presentationStatus: status, closed: status === "applied", ...(status === "applied" ? { explanation: "Applied results are retained in Activity." } : {}), selectedOperationIds: ["edit"], conflicts: [], boards: [{ snapshot: state.snapshot, markers: [] }], canApprove: status === "proposed", canApply: false, operations: [{ operationId: "edit", index: 0, label: "Review Card", kind: "update card", status: "changed", dependencies: [], owners: [], changes: [], operation: changeSet.operations[0] }] };
}

it.each(["applied", "missing"] as const)("removes only %s preview search and retains selected Card, Tree navigation and Activity explanation", async (mode) => {
  useLiveInteractionStore.setState({ reviewRevision: 0 });
  const preview = previewResponse("applied"); const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith(`/api/changesets/${preview.changeSet.id}/preview`) ? Promise.resolve(mode === "missing" ? Response.json({ message: "ChangeSet not found" }, { status: 404 }) : Response.json(preview)) : originalFetch(path, init)));
  await mount(`${viewUrl}?card=${cardId}&preview=${preview.changeSet.id}`);
  await vi.waitFor(() => expect(router.state.location.search).toEqual({ card: cardId }));
  expect(router.state.location.pathname).toBe(viewUrl);
  expect(document.querySelector('[role="dialog"] input')).not.toBeNull();
  const notice = [...state.host.querySelectorAll('[role="status"]')].find((node) => node.textContent?.includes(mode === "missing" ? "unavailable" : "Applied results"));
  expect(notice).toBeDefined();
  expect(notice!.querySelector("a")?.getAttribute("href")).toBe(`/projects/${projectId}/audit`);
  expect(state.host.querySelector('a[href*="/tree?card="]')).not.toBeNull();
});

it.each([false, true])("settles delayed connected Apply focus with an open Card: %s", async (openCard) => {
  useLiveInteractionStore.setState({ reviewRevision: 0, manualHold: false });
  const preview = previewResponse(), originalFetch = fetch;
  let applied = false;
  let finish!: (response: Response) => void;
  const requests = vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/changesets/${preview.changeSet.id}/apply`) return new Promise<Response>((resolve) => { finish = resolve; });
    if (path.startsWith(`/api/changesets/${preview.changeSet.id}/preview`)) return Promise.resolve(Response.json({
      ...preview, changeSet: { ...preview.changeSet, status: applied ? "applied" : "approved" }, presentationStatus: applied ? "applied" : "approved", closed: applied,
      canApprove: false, canApply: !applied, ...(applied ? { explanation: "Applied results are retained in Activity." } : {})
    }));
    return originalFetch(path, init);
  });
  vi.stubGlobal("fetch", requests);
  await mount(`${viewUrl}${openCard ? `?card=${cardId}` : ""}`);
  let markdown = "";
  if (openCard) {
    const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Apply-held title");
      title.dispatchEvent(new Event("input", { bubbles: true }));
      editor.commands.insertContent("Apply-held Markdown");
    });
    markdown = editor.storage.markdown.getMarkdown();
  }
  const writes = vi.spyOn(api, "updateCard");
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { ...(openCard ? { card: cardId } : {}), preview: preview.changeSet.id } }); });
  await vi.waitFor(() => expect(state.host.querySelector('.changeset-actions')).not.toBeNull());
  const apply = [...state.host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === "Apply selection")!;
  applied = await exerciseSettlesDelayedConnectedApplyFocusWithAnOpenCard(apply, () => finish, preview, openCard, applied, requests, writes, markdown, (value) => { applied = value; });
});

it.each(["transaction", "reset"] as const)("invalidates review immediately through real %s stream while suspending and restoring the held dirty Card editor", async (kind) => {
  useLiveInteractionStore.setState({ reviewRevision: 0, manualHold: false });
  const preview = previewResponse(); const originalFetch = fetch;
  const requests = vi.fn((path: string, init?: RequestInit) => path.startsWith(`/api/changesets/${preview.changeSet.id}/preview`) ? Promise.resolve(Response.json(preview)) : originalFetch(path, init));
  vi.stubGlobal("fetch", requests);
  function Live() { useLiveUpdates(projectId); return null; }
  await mount(`${viewUrl}?card=${cardId}`, "Create traceable story cards", createElement(Live));
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Unsaved title"); title.dispatchEvent(new Event("input", { bubbles: true })); editor.commands.insertContent("Unsaved rich description"); title.focus(); });
  const markdown = editor.storage.markdown.getMarkdown();
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { card: cardId, preview: preview.changeSet.id } }); });
  await vi.waitFor(() => expect(state.host.textContent).toContain("Shell proposal"));
  const approvalBefore = [...state.host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Approve selection")!;
  expect(approvalBefore.getAttribute("aria-disabled")).toBe("false");
  await act(async () => approvalBefore.focus());
  expect(document.activeElement).toBe(approvalBefore);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(state.host.querySelector('[data-live-suspended-draft]')).not.toBeNull();
  const writes = vi.spyOn(api, "updateCard");
  const beforeSnapshot = state.client.getQueryData(["story-map", state.snapshot.storyMap.id]);
  const reads = requests.mock.calls.filter(([path]) => path === `/api/story-maps/${state.snapshot.storyMap.id}`).length;
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, title: "Incoming title", version: 2 } : card) };
  const epoch = randomUUID();
  await act(async () => transport.receive!(kind === "reset" ? { kind: "reset", value: { id: `${epoch}:0`, epoch, seq: 0 } } : { kind: "transaction", value: { id: `${epoch}:1`, epoch, seq: 1, actor: { actorType: "agent", actorId: "incoming-reviewer" }, originClientId: null, entities: [{ entityType: "card", entityId: cardId, projectId, version: 2 }] } }));
  const approve = [...state.host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Approve selection")!;
  expect(approve.getAttribute("aria-disabled")).toBe("true");
  expect(state.host.textContent).toContain("Incoming changes invalidate this review");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  expect(useLiveInteractionStore.getState().waiting).toBe(1);
  expect(state.client.getQueryData(["story-map", state.snapshot.storyMap.id])).toBe(beforeSnapshot);
  expect(requests.mock.calls.filter(([path]) => path === `/api/story-maps/${state.snapshot.storyMap.id}`)).toHaveLength(reads);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(state.host.querySelector('[data-live-suspended-draft]')).not.toBeNull();
  expect(useLiveInteractionStore.getState().manualHold).toBe(false);
  expect(writes).not.toHaveBeenCalled();
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { card: cardId } }); });
  const restored = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  expect(restored.value).toBe("Unsaved title");
  const restoredEditor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  expect(restoredEditor.storage.markdown.getMarkdown()).toBe(markdown);
  expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
  expect(writes).not.toHaveBeenCalled();
});

it("preserves the existing Planning Card search when a closed preview removes its own search parameter", async () => {
  useLiveInteractionStore.setState({ reviewRevision: 0 });
  const preview = previewResponse("applied"); const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith(`/api/changesets/${preview.changeSet.id}/preview`) ? Promise.resolve(Response.json(preview)) : originalFetch(path, init)));
  const planningUrl = viewUrl.replace(/tree$/, "planning");
  await mount(planningUrl);
  const search = state.host.querySelector<HTMLInputElement>('input[placeholder="Search cards, sources, GitHub"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "traceable"); search.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(search.value).toBe("traceable");
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { card: cardId, preview: preview.changeSet.id } }); });
  await vi.waitFor(() => expect(router.state.location.search).toEqual({ card: cardId }));
  expect(router.state.location.pathname).toBe(planningUrl);
  expect(state.host.querySelector<HTMLInputElement>('input[placeholder="Search cards, sources, GitHub"]')!.value).toBe("traceable");
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] input')).not.toBeNull());
});

it.each(["tree", "planning", "slices"] as const)("renders server projection in the actual %s route and updates it after deselection", async (view) => {
  useLiveInteractionStore.setState({ reviewRevision: 0 });
  const preview = previewResponse();
  const liveTitle = state.snapshot.cards.find((card) => card.id === cardId)!.title;
  const projectedSnapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, title: "Projected title" } : card) };
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path.endsWith("/plan-states")) return Promise.resolve(Response.json({ states: [] }));
    if (!path.startsWith(`/api/changesets/${preview.changeSet.id}/preview`)) return originalFetch(path, init);
    const selection = new URL(path, "http://localhost").searchParams.get("selectedOperationIds");
    const selected = selection === null || (JSON.parse(selection) as string[]).includes("edit");
    return Promise.resolve(Response.json({
      ...preview, selectedOperationIds: selected ? ["edit"] : [],
      operations: preview.operations.map((operation) => ({ ...operation, status: selected ? "changed" : "excluded" })),
      boards: [{ snapshot: selected ? projectedSnapshot : state.snapshot, markers: selected ? [{ entity: "card", entityId: cardId, kind: "changed", operationIds: ["edit"] }] : [] }]
    }));
  }));
  await mount(`${viewUrl.replace(/tree$/, view)}?preview=${preview.changeSet.id}`, "Shell proposal");
  const board = () => state.host.querySelector(`[data-story-map-export-target="${view}"]`)!;
  await vi.waitFor(() => {
    expect(board().textContent).toContain("Projected title");
    expect(board().textContent).not.toContain(liveTitle);
    expect(board().querySelector(".preview-marker.preview-changed")?.textContent).toContain("Changed");
  });
  expect(state.client.getQueryData(["story-map", state.snapshot.storyMap.id])).toEqual(state.snapshot);
  const selection = state.host.querySelector<HTMLInputElement>('.changeset-review input[type="checkbox"]')!;
  expect(selection.checked).toBe(true);
  await act(async () => selection.click());
  await vi.waitFor(() => {
    expect(board().textContent).toContain(liveTitle);
    expect(board().textContent).not.toContain("Projected title");
    expect(board().querySelector(".preview-marker")).toBeNull();
    const currentSelection = state.host.querySelector<HTMLInputElement>('.changeset-review input[type="checkbox"]')!;
    expect(currentSelection.checked).toBe(false);
    expect(currentSelection.disabled).toBe(false);
  });
  expect(router.state.location.search).toEqual({ preview: preview.changeSet.id });
});

it("retains the preview query when an already admitted Save-and-close finishes during suspension", async () => {
  useLiveInteractionStore.setState({ reviewRevision: 0, manualHold: false });
  const preview = previewResponse(), original = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith(`/api/changesets/${preview.changeSet.id}/preview`) ? Promise.resolve(Response.json(preview)) : original(path, init)));
  await mount(`${viewUrl}?card=${cardId}`);
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Submitted title");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    editor.commands.insertContent("Submitted Markdown");
  });
  const markdown = editor.storage.markdown.getMarkdown();
  let finish!: (card: typeof state.snapshot.cards[number]) => void;
  const writes = vi.spyOn(api, "updateCard").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  await act(async () => document.querySelector<HTMLButtonElement>('.card-close-confirm button')!.click());
  expect(writes).toHaveBeenCalledTimes(1);
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { card: cardId, preview: preview.changeSet.id } }); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(state.host.querySelector('[data-live-suspended-draft]')).not.toBeNull();
  const saved = { ...state.snapshot.cards.find((card) => card.id === cardId)!, title: "Submitted title", description: markdown, version: 2 };
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? saved : card) };
  await act(async () => finish(saved));
  await vi.waitFor(() => expect(state.client.isMutating()).toBe(0));
  expect(router.state.location.search).toEqual({ card: cardId, preview: preview.changeSet.id });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(state.host.querySelector('[data-live-suspended-draft]')).toBeNull();
  expect(writes).toHaveBeenCalledTimes(1);
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { card: cardId } }); });
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')!.value).toBe("Submitted title");
  expect(document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor.storage.markdown.getMarkdown()).toBe(markdown);
});

it("holds a clean Card dependency request through preview suspension and disables remounted edits until its saved version arrives", async () => {
  useLiveInteractionStore.setState({ reviewRevision: 0, manualHold: false });
  const preview = previewResponse(), original = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith(`/api/changesets/${preview.changeSet.id}/preview`) ? Promise.resolve(Response.json(preview)) : original(path, init)));
  await mount(`${viewUrl}?card=${cardId}`);
  const dependencySection = () => [...document.querySelectorAll('section')].find((section) => section.querySelector('h2')?.textContent === "Dependencies")!;
  const select = dependencySection().querySelector<HTMLSelectElement>('select')!;
  const prerequisiteId = state.snapshot.cards[0]!.id;
  let finish!: (result: Awaited<ReturnType<typeof api.setCardDependency>>) => void;
  const write = vi.spyOn(api, "setCardDependency").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { select.value = prerequisiteId; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => [...dependencySection().querySelectorAll('button')].find((button) => button.textContent === "Add dependency")!.click());
  expect(write).toHaveBeenCalledWith(cardId, { prerequisiteCardId: prerequisiteId, baseVersion: 1 });
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { card: cardId, preview: preview.changeSet.id } }); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  const approve = [...state.host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === "Approve selection")!;
  await act(async () => approve.focus());
  expect(state.host.querySelector('[data-live-suspended-draft]')).not.toBeNull();
  expect(liveUpdatesHeld(document)).toBe(true);
  expect(useLiveInteractionStore.getState().manualHold).toBe(false);
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { card: cardId } }); });
  expect(dependencySection().querySelector<HTMLSelectElement>('select')!.disabled).toBe(true);
  expect([...dependencySection().querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === "Add dependency")!.disabled).toBe(true);
  const saved = { ...state.snapshot.cards.find((card) => card.id === cardId)!, version: 2 };
  const edge = { id: randomUUID(), cardId, prerequisiteCardId: prerequisiteId, createdAt: saved.updatedAt };
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? saved : card), cardDependencies: [edge] };
  await act(async () => finish({ card: saved, dependencies: [edge] }));
  await vi.waitFor(() => expect(state.client.isMutating({ mutationKey: ["card-dependencies", cardId] })).toBe(0));
  expect(dependencySection().querySelector<HTMLSelectElement>('select')!.disabled).toBe(false);
  expect(dependencySection().textContent).toContain(state.snapshot.cards[0]!.title);
  const update = vi.spyOn(api, "updateCard");
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "After dependency"); title.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.modal-heading-actions button')].find((button) => button.textContent === "Save")!.click());
  await vi.waitFor(() => expect(update).toHaveBeenCalled());
  expect(update.mock.calls[0]![2]).toBe(2);
  expect(write).toHaveBeenCalledTimes(1);
});

it("keeps dirty dependency ownership while preview navigation is blocked and the request is refused", async () => {
  const preview = previewResponse(), original = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith(`/api/changesets/${preview.changeSet.id}/preview`) ? Promise.resolve(Response.json(preview)) : original(path, init)));
  await mount(`${viewUrl}?card=${cardId}`);
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => editor.commands.insertContent("Dependency preview draft"));
  const section = [...document.querySelectorAll('section')].find((item) => item.querySelector('h2')?.textContent === "Dependencies")!;
  const select = section.querySelector<HTMLSelectElement>('select')!;
  let refuse!: (error: Error) => void;
  vi.spyOn(api, "setCardDependency").mockImplementationOnce(() => new Promise((_, reject) => { refuse = reject; }));
  await act(async () => { select.value = state.snapshot.cards[0]!.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => [...section.querySelectorAll('button')].find((item) => item.textContent === "Add dependency")!.click());
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { card: cardId, preview: preview.changeSet.id } }); });
  const canonicalSnapshot = state.client.getQueryData(["story-map", state.snapshot.storyMap.id]);
  const reads = () => vi.mocked(fetch).mock.calls.filter(([path]) => path === `/api/story-maps/${state.snapshot.storyMap.id}`).length;
  const canonicalReads = reads();
  await act(async () => { void (router.navigate as (options: unknown) => Promise<void>)({ search: {} }); });
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { card: "refused-second-card" } }); });
  expect(state.client.getQueryData(["story-map", state.snapshot.storyMap.id])).toBe(canonicalSnapshot);
  expect(reads()).toBe(canonicalReads);
  const confirmation = () => document.querySelector('.card-close-confirm')!;
  const action = (name: string) => [...confirmation().querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === name)!;
  expect(action("Save").disabled).toBe(true);
  expect(action("Discard").disabled).toBe(true);
  expect(router.state.location.search).toEqual({ card: cardId, preview: preview.changeSet.id });
  expect(liveUpdatesHeld(document)).toBe(true);
  await act(async () => refuse(new Error("Dependency refused")));
  await vi.waitFor(() => expect(action("Discard").disabled).toBe(false));
  expect(action("Save").disabled).toBe(true);
  await act(async () => action("Cancel").click());
  expect(router.state.location.search).toEqual({ card: cardId, preview: preview.changeSet.id });
  expect(state.client.getQueryData(["story-map", state.snapshot.storyMap.id])).toBe(canonicalSnapshot);
  expect(reads()).toBe(canonicalReads);
  expect(document.querySelector('[data-live-suspended-draft]')).not.toBeNull();
  await act(async () => { await (router.navigate as (options: unknown) => Promise<void>)({ search: { card: cardId } }); });
  expect(document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor.storage.markdown.getMarkdown()).toBe("Dependency preview draft");
});

async function exerciseSettlesDelayedConnectedApplyFocusWithAnOpenCard(apply: HTMLButtonElement, readFinish: () => (response: Response) => void, preview: ChangeSetPreviewResponse, openCard: boolean, applied: boolean, requests: ReturnType<typeof vi.fn<(path: string, init?: RequestInit) => Promise<Response>>>, writes: ReturnType<typeof vi.fn>, markdown: string, setApplied: (value: boolean) => void) {
  await vi.waitFor(() => expect(apply.getAttribute("aria-disabled")).toBe("false"));
  await act(async () => { apply.focus(); apply.click(); apply.click(); });
  await vi.waitFor(() => expect(readFinish()).toBeDefined());
  expect(document.activeElement).toBe(apply);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(router.state.location.search.preview).toBe(preview.changeSet.id);
  if (openCard) expect(state.host.querySelector('[data-live-suspended-draft]')).not.toBeNull();
  applied = true;
  setApplied(applied);
  await act(async () => readFinish()(Response.json({ changeSet: { ...preview.changeSet, status: "applied" } })));
  await vi.waitFor(() => {
    expect(router.state.location.search).toEqual(openCard ? { card: cardId } : {});
    expect(state.host.querySelector('.changeset-review')).toBeNull();
    expect(state.client.isMutating()).toBe(0);
    if (openCard) expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
    else expect(document.activeElement?.textContent).toContain("Applied results are retained in Activity.");
  });
  expect(document.activeElement).not.toBe(document.body);
  expect(requests.mock.calls.filter(([path]) => path.endsWith('/apply'))).toHaveLength(1);
  expect(writes).not.toHaveBeenCalled();
  if (openCard) {
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')!.value).toBe("Apply-held title");
    expect(document.querySelector<HTMLDivElement & { editor: Editor; }>(".tiptap")!.editor.storage.markdown.getMarkdown()).toBe(markdown);
  }
  return applied;
}

it("refreshes active review metadata after the header's own-client GitHub pull", async () => {
  const link = remoteWorkItemLinkSchema.parse({ id: randomUUID(), connectionId: randomUUID(), externalRefId: randomUUID(), cardId, provider: "github", remoteId: "1", remoteNumber: 1, url: "https://github.com/owner/repo/issues/1", syncState: "synced", labels: [] });
  state.snapshot = { ...state.snapshot, remoteWorkItemLinks: [link] };
  const metadata = { settings: cardReviewSettingsSchema.parse({}), requests: [], reports: [], decisions: [], fixes: [], summaries: [], runningRequestIds: [] };
  const reviews = vi.spyOn(api, "getCardReviews").mockResolvedValue(metadata);
  const changeSet = previewResponse("applied").changeSet;
  vi.spyOn(api, "pullStoryMapWorkItems").mockResolvedValue(incomingGitHubCommandResponseSchema.parse({ changeSet, changeSetId: changeSet.id, outcome: "applied", previewRef: { changeSetId: changeSet.id }, items: [] }));
  await mount(viewUrl);
  await vi.waitFor(() => expect(reviews).toHaveBeenCalledTimes(1));
  const pull = state.host.querySelector<HTMLButtonElement>('button[aria-label="Pull GitHub"]')!;
  expect(pull).not.toBeNull();
  await act(async () => pull.click());
  await vi.waitFor(() => expect(reviews).toHaveBeenCalledTimes(2));
  expect(api.pullStoryMapWorkItems).toHaveBeenCalledWith({ storyMapId: state.snapshot.storyMap.id, confirm: true });
});
