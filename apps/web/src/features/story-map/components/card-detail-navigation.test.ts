// @vitest-environment jsdom // REQ FR-15
import { randomUUID } from "node:crypto";
import { act } from "react";
import type { Editor } from "@tiptap/react";
import { personaSchema } from "@storymapper/contracts";
import { describe, expect, it, vi } from "vitest";
import { createBrowserHistory } from "@tanstack/react-router";
import { api } from "@storymapper/web/app/api";
import { router } from "@storymapper/web/app/router";
import { state, cardId, projectId, storyMapId, viewUrl, mount, button } from "@storymapper/web/test-fixtures/card-detail";

function editor() {
  return document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
}

function confirmButton(name: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((item) => item.textContent === name)!;
}

async function navigate(search: { card?: string; preview?: string }) {
  let navigation!: Promise<void>;
  await act(async () => { navigation = router.navigate({ to: viewUrl, search }); });
  return { settled: navigation };
}

describe("Card editor navigation and accessibility", () => {
  registerGuardsQueryNavigationToSAndCancelRetainsExact();

  registerGuardsLeavingThePageMapForS();

  it("Save reaches a blocked destination only after successful persistence; failure retains confirmation", testSaveReachesABlockedDestinationOnlyAfterSuccessfulPersistenceFailureRetains);

  it("guards Back and Forward while retaining history destination", testGuardsBackAndForwardWhileRetainingHistoryDestination);

  it("guards Forward to a different Card and restores the intended entry after Discard", testGuardsForwardToADifferentCardAndRestoresTheIntendedEntry);

  registerSettlesRepeatedRouterAttemptsWhileRetainingTheFirstDestination();

  registerSettlesRepeatedNativeBackForwardBeforeSWhileRetaining();

  it("restores and resumes non-adjacent go(-2)/go(2) entries exactly", testRestoresAndResumesNonAdjacentGo2Go2EntriesExactly);

  it("protects real beforeunload for dirty/pending states, including Back then Cancel", testProtectsRealBeforeunloadForDirtyPendingStatesIncludingBackThenCancel);

  registerKeepsSaveDisabledAfterACleanPendingWriteSettles();

  it("counts repeated ancillary writes through reverse completion and preview suspension", testCountsRepeatedAncillaryWritesThroughReverseCompletionAndPreviewSuspension);

  registerHoldsADelayedRefusedOriginLinkSAndRetains();

  registerHoldsNavigationDuringARefusedSRequestWithoutDiscarding();

  registerSettlesLifecycleCompletionWhilePreservingDraftsTypedInFlight();

  it("retains the editor across core views and suspended preview then guards abandoning it", testRetainsTheEditorAcrossCoreViewsAndSuspendedPreviewThenGuards);

  it("retains pending and refused Save drafts while navigation is blocked inside preview", testRetainsPendingAndRefusedSaveDraftsWhileNavigationIsBlockedInside);

  it("tracks all formatting states when moving selection between formatted and plain text and toggling off", testTracksAllFormattingStatesWhenMovingSelectionBetweenFormattedAndPlain);

  it("exposes named formatting states and moves Escape from formatted content to the dialog heading", testExposesNamedFormattingStatesAndMovesEscapeFromFormattedContentTo);
});

function registerSettlesLifecycleCompletionWhilePreservingDraftsTypedInFlight() {
  it.each([false, true])("settles lifecycle completion while preserving drafts typed in flight: %s", async (lateDraft) => {
    const original = fetch;
    let finish!: () => void;
    vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/cards/${cardId}/archive` && init?.method === "POST"
      ? new Promise<Response>((resolve) => { finish = () => resolve(Response.json({ ok: true })); }) : original(path, init)));
    await mount(`${viewUrl}?card=${cardId}`);
    await act(async () => button("Archive").click());
    const lifecycle = document.querySelector('[role="alertdialog"]')!;
    await act(async () => [...lifecycle.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Archive")!.click());
    const attempt = await navigate({ card: state.snapshot.cards[1]!.id });
    if (lateDraft) await act(async () => editor().commands.insertContent("Typed during lifecycle"));
    await act(async () => finish());
    await vi.waitFor(() => expect(state.client.isMutating()).toBe(0));
    if (lateDraft) {
      expect(router.state.location.search.card).toBe(cardId);
      expect(editor().storage.markdown.getMarkdown()).toBe("Typed during lifecycle");
      await act(async () => confirmButton("Cancel").click());
      await attempt.settled;
      expect(editor().storage.markdown.getMarkdown()).toBe("Typed during lifecycle");
    } else {
      await attempt.settled;
      expect(router.state.location.search.card).toBe(state.snapshot.cards[1]!.id);
      await act(async () => { await router.navigate({ to: viewUrl, search: { card: state.snapshot.cards[0]!.id } }); });
      expect(router.state.location.search.card).toBe(state.snapshot.cards[0]!.id);
    }
  });
}

function registerHoldsNavigationDuringARefusedSRequestWithoutDiscarding() {
  it.each(["Archive", "Park", "Delete permanently"])("holds navigation during a refused %s request without discarding another Card draft", async (action) => {
    const selectedId = action === "Park" ? state.snapshot.cards[0]!.id : cardId;
    const original = fetch;
    let refuse!: () => void;
    vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith(`/api/cards/${selectedId}`) && (init?.method === "POST" || init?.method === "DELETE")
      ? new Promise<Response>((resolve) => { refuse = () => resolve(Response.json({ message: "Lifecycle refused" }, { status: 503 })); }) : original(path, init)));
    window.history.replaceState(null, "", viewUrl);
    const history = createBrowserHistory({ window });
    await mount(viewUrl, undefined, undefined, history);
    await act(async () => { await router.navigate({ to: viewUrl, search: { card: selectedId } }); });
    await act(async () => button(action).click());
    const lifecycle = document.querySelector('[role="alertdialog"]')!;
    await act(async () => [...lifecycle.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === action)!.click());
    await act(async () => editor().commands.insertContent("Retained lifecycle draft"));
    await act(async () => history.back());
    await vi.waitFor(() => expect(document.querySelector('.card-close-confirm')).not.toBeNull());
    const confirm = document.querySelector('.card-close-confirm')!;
    expect([...confirm.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Discard")!.disabled).toBe(true);
    await act(async () => refuse());
    await vi.waitFor(() => expect([...confirm.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Discard")!.disabled).toBe(false));
    await act(async () => [...confirm.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Cancel")!.click());
    expect(router.state.location.search.card).toBe(selectedId);
    expect(lifecycle.textContent).toContain("Request failed: 503");
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get("card")).toBe(selectedId));
    expect(editor().storage.markdown.getMarkdown()).toBe("Retained lifecycle draft");
    history.destroy();
  });
}

function registerHoldsADelayedRefusedOriginLinkSAndRetains() {
  it.each(["create", "delete"] as const)("holds a delayed refused origin-link %s and retains the unrelated draft", async (operation) => {
    const noteId = randomUUID();
    state.snapshot.sourceLinks = [{ kind: "note", id: noteId, cardId, note: "Existing origin", createdAt: state.snapshot.cards[0]!.createdAt }];
    let refuse!: (error: Error) => void;
    vi.spyOn(api, operation === "create" ? "createCardSourceLink" : "deleteCardSourceLink").mockImplementationOnce(() => new Promise<never>((_, reject) => { refuse = reject; }));
    await mount(`${viewUrl}?card=${cardId}`);
    await act(async () => editor().commands.insertContent("Unrelated retained text"));
    if (operation === "create") {
      const note = document.querySelector<HTMLTextAreaElement>('.source-link-section textarea')!;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "New origin"); note.dispatchEvent(new Event("input", { bubbles: true })); });
      await act(async () => button("Link origin note").click());
    } else await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Unlink Existing origin"]')!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
    expect(confirmButton("Discard").disabled).toBe(true);
    await act(async () => confirmButton("Cancel").click());
    await navigate({});
    expect(confirmButton("Discard").disabled).toBe(true);
    await act(async () => refuse(new Error("Origin write refused")));
    await vi.waitFor(() => expect(confirmButton("Discard").disabled).toBe(false));
    await act(async () => confirmButton("Cancel").click());
    expect(router.state.location.search).toEqual({ card: cardId });
    expect(editor().storage.markdown.getMarkdown()).toBe("Unrelated retained text");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Origin write refused");
  });
}

function registerKeepsSaveDisabledAfterACleanPendingWriteSettles() {
  it.each(["Cancel", "Discard"])("keeps Save disabled after a clean pending write settles while %s remains usable", async (action) => {
    state.snapshot.personas = [personaSchema.parse({ id: randomUUID(), name: "Pending buyer", role: "Buyer", projectId, storyMapId, version: 1 })];
    let finish!: (value: Awaited<ReturnType<typeof api.setCardPersona>>) => void;
    vi.spyOn(api, "setCardPersona").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const update = vi.spyOn(api, "updateCard");
    await mount(`${viewUrl}?card=${cardId}`);
    await act(async () => button("Pending buyer").click());
    const departure = await navigate({});
    expect(confirmButton("Save").disabled).toBe(true);
    expect(confirmButton("Discard").disabled).toBe(true);
    await act(async () => finish({ link: { id: randomUUID(), createdAt: state.snapshot.cards[0]!.createdAt, cardId, personaId: state.snapshot.personas[0]!.id } }));
    await vi.waitFor(() => expect(confirmButton("Discard").disabled).toBe(false));
    expect(confirmButton("Save").disabled).toBe(true);
    expect(confirmButton("Cancel").disabled).toBe(false);
    await act(async () => confirmButton("Save").click());
    expect(update).not.toHaveBeenCalled();
    await act(async () => confirmButton(action).click());
    await departure.settled;
    expect(router.state.location.search).toEqual(action === "Cancel" ? { card: cardId } : {});
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
}

function registerSettlesRepeatedNativeBackForwardBeforeSWhileRetaining() {
  it.each(["Cancel", "Discard"])("settles repeated native Back/Forward before %s while retaining the first destination", async (action) => {
    const firstId = state.snapshot.cards[0]!.id;
    const lastId = state.snapshot.cards[1]!.id;
    window.history.replaceState(null, "", `${viewUrl}?card=${firstId}`);
    const history = createBrowserHistory({ window });
    const originalBlock = history.block.bind(history);
    const decisions: boolean[] = [];
    history.block = (options) => originalBlock({
      ...options, blockerFn: async (args) => {
        const refused = await options.blockerFn(args);
        decisions.push(Boolean(refused));
        return refused;
      }
    });
    await mount(window.location.pathname + window.location.search, undefined, undefined, history);
    await act(async () => { await router.navigate({ to: viewUrl, search: { card: cardId } }); });
    await act(async () => { await router.navigate({ to: viewUrl, search: { card: state.snapshot.cards[1]!.id } }); });
    await act(async () => history.back());
    await vi.waitFor(() => expect(router.state.location.search.card).toBe(cardId));
    await act(async () => editor().commands.insertContent("Two traversal draft"));
    decisions.length = 0;
    await act(async () => history.back());
    await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
    const confirmation = document.querySelector('[role="alertdialog"]');
    await act(async () => history.forward());
    await vi.waitFor(() => expect(decisions).toEqual([true]));
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get("card")).toBe(cardId));
    expect(document.querySelector('[role="alertdialog"]')).toBe(confirmation);
    expect(editor().storage.markdown.getMarkdown()).toBe("Two traversal draft");
    await act(async () => confirmButton(action).click());
    await vi.waitFor(() => expect(decisions).toEqual([true, action === "Cancel"]));
    const expectedId = action === "Cancel" ? cardId : firstId;
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get("card")).toBe(expectedId));
    expect(router.state.location.search.card).toBe(expectedId);
    if (action === "Cancel") expect(editor().storage.markdown.getMarkdown()).toBe("Two traversal draft");
    else {
      for (const [direction, destination] of [["forward", cardId], ["forward", lastId], ["back", cardId], ["back", firstId]] as const) {
        await act(async () => history[direction]());
        await vi.waitFor(() => expect(router.state.location.search.card).toBe(destination));
        expect(new URLSearchParams(window.location.search).get("card")).toBe(destination);
        expect(editor().storage.markdown.getMarkdown()).toBe("");
      }
    }
    history.destroy();
  });
}

function registerSettlesRepeatedRouterAttemptsWhileRetainingTheFirstDestination() {
  it("settles repeated router attempts while retaining the first destination and exact draft", async () => {
    await mount(`${viewUrl}?card=${cardId}`);
    await act(async () => editor().commands.insertContent("One destination"));
    const first = await navigate({});
    const second = await navigate({ card: state.snapshot.cards[1]!.id });
    await second.settled;
    expect(editor().storage.markdown.getMarkdown()).toBe("One destination");
    expect(router.state.location.search).toEqual({ card: cardId });
    await act(async () => confirmButton("Discard").click());
    await first.settled;
    expect(router.state.location.search).toEqual({});
  });
}

function registerGuardsLeavingThePageMapForS() {
  it.each(["/onboarding", viewUrl.replace(/story-maps\/[^/]+/, "story-maps/another-map")])("guards leaving the page/map for %s", async (destination) => {
    await mount(`${viewUrl}?card=${cardId}`);
    await act(async () => editor().commands.insertContent("Retained across page intent"));
    await act(async () => { void router.navigate({ to: destination }); });
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => confirmButton("Cancel").click());
    expect(router.state.location.pathname).toBe(viewUrl);
    expect(editor().storage.markdown.getMarkdown()).toBe("Retained across page intent");
  });
}

function registerGuardsQueryNavigationToSAndCancelRetainsExact() {
  it.each([undefined, "another-card"])("guards query navigation to %s and Cancel retains exact draft and URL", async (destination) => {
    await mount(`${viewUrl}?card=${cardId}`);
    await act(async () => editor().commands.insertContent("Unsaved Markdown"));
    await navigate(destination ? { card: destination } : {});
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(router.state.location.search).toEqual({ card: cardId });
    await act(async () => confirmButton("Cancel").click());
    expect(router.state.location.search.card).toBe(cardId);
    expect(editor().storage.markdown.getMarkdown()).toBe("Unsaved Markdown");
    expect(router.state.location.search).toEqual({ card: cardId });
    const discard = await navigate({});
    await act(async () => confirmButton("Discard").click());
    await discard.settled;
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
}

async function testSaveReachesABlockedDestinationOnlyAfterSuccessfulPersistenceFailureRetains() {
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => editor().commands.insertContent("Saved on navigation"));
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => init?.method === "PATCH"
    ? Promise.resolve(Response.json({ message: "Save refused" }, { status: 503 })) : original(path, init)));
  const attempt = await navigate({});
  await act(async () => confirmButton("Save").click());
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Request failed: 503"));
  expect(editor().storage.markdown.getMarkdown()).toBe("Saved on navigation");
  expect(router.state.location.search).toEqual({ card: cardId });
  vi.stubGlobal("fetch", original);
  await act(async () => confirmButton("Save").click());
  await attempt.settled;
  expect(state.savedPatch?.description).toBe("Saved on navigation");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
}

async function testGuardsBackAndForwardWhileRetainingHistoryDestination() {
  window.history.replaceState(null, "", viewUrl);
  const history = createBrowserHistory({ window });
  await mount(viewUrl, undefined, undefined, history);
  await act(async () => { await router.navigate({ to: viewUrl, search: { card: cardId } }); });
  await act(async () => editor().commands.insertContent("History draft"));
  await act(async () => router.history.back());
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
  await act(async () => confirmButton("Cancel").click());
  expect(router.state.location.search).toEqual({ card: cardId });
  await act(async () => router.history.back());
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
  await act(async () => confirmButton("Discard").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  await act(async () => router.history.forward());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  expect(editor().storage.markdown.getMarkdown()).toBe("");
  history.destroy();
}

async function testGuardsForwardToADifferentCardAndRestoresTheIntendedEntry() {
  window.history.replaceState(null, "", `${viewUrl}?card=${cardId}`);
  const history = createBrowserHistory({ window });
  await mount(`${viewUrl}?card=${cardId}`, undefined, undefined, history);
  const nextCard = state.snapshot.cards[1]!;
  await act(async () => { await router.navigate({ to: viewUrl, search: { card: nextCard.id } }); });
  await act(async () => router.history.back());
  await vi.waitFor(() => expect(router.state.location.search.card).toBe(cardId));
  await act(async () => editor().commands.insertContent("Forward draft"));
  await act(async () => router.history.forward());
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
  expect(editor().storage.markdown.getMarkdown()).toBe("Forward draft");
  await act(async () => confirmButton("Cancel").click());
  await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get("card")).toBe(cardId));
  await act(async () => router.history.forward());
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
  await act(async () => confirmButton("Discard").click());
  await vi.waitFor(() => expect(router.state.location.search.card).toBe(nextCard.id));
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe(nextCard.title);
  history.destroy();
}

async function testRestoresAndResumesNonAdjacentGo2Go2EntriesExactly() {
  const firstId = state.snapshot.cards[0]!.id;
  window.history.replaceState(null, "", `${viewUrl}?card=${firstId}`);
  const history = createBrowserHistory({ window });
  await mount(`${viewUrl}?card=${firstId}`, undefined, undefined, history);
  for (const id of [state.snapshot.cards[1]!.id, cardId]) {
    await act(async () => { await router.navigate({ to: viewUrl, search: { card: id } }); });
  }
  for (const [delta, currentId, destinationId] of [[-2, cardId, firstId], [2, firstId, cardId]] as const) {
    await act(async () => editor().commands.insertContent(`Draft ${delta}`));
    const markdown = editor().storage.markdown.getMarkdown();
    await act(async () => history.go(delta));
    await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
    await act(async () => confirmButton("Cancel").click());
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get("card")).toBe(currentId));
    expect(router.state.location.search.card).toBe(currentId);
    expect(editor().storage.markdown.getMarkdown()).toBe(markdown);
    await act(async () => history.go(delta));
    await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
    await act(async () => confirmButton("Discard").click());
    await vi.waitFor(() => expect(router.state.location.search.card).toBe(destinationId));
    expect(new URLSearchParams(window.location.search).get("card")).toBe(destinationId);
  }
  history.destroy();
}

async function testProtectsRealBeforeunloadForDirtyPendingStatesIncludingBackThenCancel() {
  state.snapshot.personas = [personaSchema.parse({ id: randomUUID(), name: "Unload buyer", role: "Buyer", projectId, storyMapId, version: 1 })];
  window.history.replaceState(null, "", viewUrl);
  const history = createBrowserHistory({ window });
  await mount(viewUrl, undefined, undefined, history);
  await act(async () => { await router.navigate({ to: viewUrl, search: { card: cardId } }); });
  const unload = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(unload()).toBe(false);
  let finishPersona!: (value: Awaited<ReturnType<typeof api.setCardPersona>>) => void;
  vi.spyOn(api, "setCardPersona").mockImplementationOnce(() => new Promise((resolve) => { finishPersona = resolve; }));
  await act(async () => button("Unload buyer").click());
  expect(unload()).toBe(true);
  await act(async () => finishPersona({ link: { id: randomUUID(), createdAt: state.snapshot.cards[0]!.createdAt, cardId, personaId: state.snapshot.personas[0]!.id } }));
  await vi.waitFor(() => expect(state.client.isMutating()).toBe(0));
  expect(unload()).toBe(false);
  await act(async () => editor().commands.insertContent("Unload draft"));
  expect(unload()).toBe(true);
  let finish!: (value: Awaited<ReturnType<typeof api.updateCard>>) => void;
  vi.spyOn(api, "updateCard").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => button("Save").click());
  expect(unload()).toBe(true);
  const saved = { ...state.snapshot.cards.find((card) => card.id === cardId)!, description: "Unload draft", version: 2 };
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? saved : card) };
  await act(async () => finish(saved));
  await vi.waitFor(() => expect(state.client.isMutating()).toBe(0));
  expect(unload()).toBe(false);
  await act(async () => editor().commands.insertContent(" after settlement"));
  await act(async () => history.back());
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
  await act(async () => confirmButton("Cancel").click());
  await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get("card")).toBe(cardId));
  expect(unload()).toBe(true);
  history.destroy();
}

async function testCountsRepeatedAncillaryWritesThroughReverseCompletionAndPreviewSuspension() {
  state.snapshot.personas = ["Buyer A", "Buyer B"].map((name) => personaSchema.parse({ id: randomUUID(), name, role: "Buyer", projectId, storyMapId, version: 1 }));
  const completions: Array<(value: Awaited<ReturnType<typeof api.setCardPersona>>) => void> = [];
  vi.spyOn(api, "setCardPersona").mockImplementation(() => new Promise((resolve) => { completions.push(resolve); }));
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => { button("Buyer A").click(); button("Buyer B").click(); });
  expect(completions).toHaveLength(2);
  await act(async () => completions[1]!({ link: { id: randomUUID(), createdAt: state.snapshot.cards[0]!.createdAt, cardId, personaId: state.snapshot.personas[1]!.id } }));
  expect(state.client.isMutating({ mutationKey: ["card-owned-write", cardId] })).toBe(1);
  await act(async () => { await router.navigate({ to: viewUrl, search: { card: cardId, preview: "unavailable-preview" } }); });
  await navigate({});
  expect(confirmButton("Discard").disabled).toBe(true);
  expect(confirmButton("Save").disabled).toBe(true);
  expect(router.state.location.search).toEqual({ card: cardId, preview: "unavailable-preview" });
  await act(async () => completions[0]!({ link: { id: randomUUID(), createdAt: state.snapshot.cards[0]!.createdAt, cardId, personaId: state.snapshot.personas[0]!.id } }));
  await vi.waitFor(() => expect(confirmButton("Discard").disabled).toBe(false));
  await act(async () => confirmButton("Cancel").click());
  await act(async () => { await router.navigate({ to: viewUrl, search: { card: cardId } }); });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
}

async function testRetainsTheEditorAcrossCoreViewsAndSuspendedPreviewThenGuards() {
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => editor().commands.insertContent("Exact retained draft"));
  for (const view of ["planning", "tracking", "backlog", "discovery", "tree"]) {
    await act(async () => { await router.navigate({ to: viewUrl.replace(/tree$/, view), search: { card: cardId } }); });
    expect(editor().storage.markdown.getMarkdown()).toBe("Exact retained draft");
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  }
  await act(async () => { await router.navigate({ to: viewUrl, search: { card: cardId, preview: "unavailable-preview" } }); });
  expect(document.querySelector(".tiptap")).toBeNull();
  expect(document.querySelector("[data-live-suspended-draft]")).not.toBeNull();
  await navigate({});
  expect(confirmButton("Save").disabled).toBe(true);
  await act(async () => confirmButton("Cancel").click());
  await act(async () => { await router.navigate({ to: viewUrl, search: { card: cardId } }); });
  expect(editor().storage.markdown.getMarkdown()).toBe("Exact retained draft");
}

async function testRetainsPendingAndRefusedSaveDraftsWhileNavigationIsBlockedInside() {
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => editor().commands.insertContent("Preview save draft"));
  let refuse!: (error: Error) => void;
  vi.spyOn(api, "updateCard").mockImplementationOnce(() => new Promise<never>((_, reject) => { refuse = reject; }));
  await act(async () => button("Save").click());
  await act(async () => { await router.navigate({ to: viewUrl, search: { card: cardId, preview: "pending-save-preview" } }); });
  await navigate({});
  expect(confirmButton("Save").disabled).toBe(true);
  expect(confirmButton("Discard").disabled).toBe(true);
  expect(router.state.location.search).toEqual({ card: cardId, preview: "pending-save-preview" });
  expect(document.querySelector("[data-live-suspended-draft]")).not.toBeNull();
  await act(async () => refuse(new Error("Save refused during preview")));
  await vi.waitFor(() => expect(confirmButton("Discard").disabled).toBe(false));
  expect(confirmButton("Save").disabled).toBe(true);
  await act(async () => confirmButton("Cancel").click());
  expect(router.state.location.search).toEqual({ card: cardId, preview: "pending-save-preview" });
  await act(async () => { await router.navigate({ to: viewUrl, search: { card: cardId } }); });
  expect(editor().storage.markdown.getMarkdown()).toBe("Preview save draft");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Save refused during preview");
}

async function testTracksAllFormattingStatesWhenMovingSelectionBetweenFormattedAndPlain() {
  await mount(`${viewUrl}?card=${cardId}`);
  const activeEditor = editor();
  await act(async () => {
    activeEditor.commands.setContent({ type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", marks: [{ type: "bold" }, { type: "italic" }], text: "Formatted" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Listed" }] }] }] },
      { type: "paragraph", content: [{ type: "text", text: "Plain" }] }
    ] });
  });
  const names = ["Bold", "Italic", "Bullet list", "Heading 2"];
  const pressed = () => names.map((name) => button(name).getAttribute("aria-pressed"));
  const selectText = async (text: string) => {
    let position = -1;
    activeEditor.state.doc.descendants((node, pos) => { if (node.isText && node.text === text) position = pos; });
    expect(position).toBeGreaterThan(0);
    await act(async () => activeEditor.commands.setTextSelection({ from: position, to: position + text.length }));
  };
  await selectText("Formatted");
  expect(pressed()).toEqual(["true", "true", "false", "true"]);
  await selectText("Plain");
  expect(pressed()).toEqual(["false", "false", "false", "false"]);
  await selectText("Formatted");
  for (const name of ["Bold", "Italic", "Heading 2"]) await act(async () => button(name).click());
  expect(pressed()).toEqual(["false", "false", "false", "false"]);
  await selectText("Listed");
  expect(pressed()).toEqual(["false", "false", "true", "false"]);
  await act(async () => button("Bullet list").click());
  expect(pressed()).toEqual(["false", "false", "false", "false"]);
  await selectText("Plain");
  expect(pressed()).toEqual(["false", "false", "false", "false"]);
  await selectText("Formatted");
  expect(pressed()).toEqual(["false", "false", "false", "false"]);
}

async function testExposesNamedFormattingStatesAndMovesEscapeFromFormattedContentTo() {
  await mount(`${viewUrl}?card=${cardId}`);
  const content = document.querySelector<HTMLElement>('[role="textbox"][aria-label="Description"]')!;
  expect(content.getAttribute("aria-multiline")).toBe("true");
  expect(content.closest("label")).toBeNull();
  for (const name of ["Bold", "Italic", "Bullet list", "Heading 2"]) expect(button(name).getAttribute("aria-label")).toBe(name);
  await act(async () => { editor().commands.insertContent("Formatted text"); editor().commands.selectAll(); });
  for (const name of ["Bold", "Italic", "Heading 2"]) {
    expect(button(name).getAttribute("aria-pressed")).toBe("false");
    await act(async () => button(name).click());
    expect(button(name).getAttribute("aria-pressed")).toBe("true");
  }
  await act(async () => { await new Promise(requestAnimationFrame); content.focus(); });
  await act(async () => content.querySelector("strong")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"] [data-dialog-heading]'));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => editor().setEditable(false));
  expect(button("Bold").disabled).toBe(true);
  const markdown = editor().storage.markdown.getMarkdown();
  await act(async () => button("Bold").click());
  expect(editor().storage.markdown.getMarkdown()).toBe(markdown);
}
