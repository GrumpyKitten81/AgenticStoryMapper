// @vitest-environment jsdom // REQ FR-15
import { testRefreshesOpenHistoryAfterAttachmentCreationAndDeletionWithOwnedOnly } from "@storymapper/web/test-fixtures/card-detail-history";
import { randomUUID } from "node:crypto";
import { buildReleaseSummaryReport } from "@storymapper/core";
import { act } from "react";
import type { Editor } from "@tiptap/react";
import { storyMapSnapshotSchema, type StoryMapSnapshot, type UpdateCardRequest } from "@storymapper/contracts";
import { describe, expect, it, vi } from "vitest";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { router } from "@storymapper/web/app/router";

import { state, projectId, storyMapId, cardId, viewUrl, roadmapId, savedHistory, button, mount, openBoardSearch } from "@storymapper/web/test-fixtures/card-detail";

describe("FR-15 Card detail", () => {
  registerFR15CardDetail();

  it("routes Escape and backdrop on the Card modal through the dirty check and closes a clean Card", testRoutesEscapeAndBackdropOnTheCardModalThroughTheDirty);

  registerClosesACleanCardOnEscapeAndClearsThe();

  it("loads history only when opened, compares fields, safely expands long values and pages to creation", testLoadsHistoryOnlyWhenOpenedComparesFieldsSafelyExpandsLongValues);

  it("announces errors, retains existing rows on page failure, retries and refreshes after saving", testAnnouncesErrorsRetainsExistingRowsOnPageFailureRetriesAndRefreshes);

  registerShowsEmptyHistoryAfterASuccessfulBoundedPage();

  it("announces a pending first page without claiming history is empty", testAnnouncesAPendingFirstPageWithoutClaimingHistoryIsEmpty);

  it("retains only one bounded page when closed and remounted", testRetainsOnlyOneBoundedPageWhenClosedAndRemounted);

  it("bounds many short lines and shows exact false, zero and cleared scalar values", testBoundsManyShortLinesAndShowsExactFalseZeroAndCleared);

  it("holds navigation to Card B until delayed Card A save refreshes history", testHoldsNavigationToCardBUntilDelayedCardASaveRefreshes);

  it("refreshes open history after attachment creation and deletion with owned-only versions", testRefreshesOpenHistoryAfterAttachmentCreationAndDeletionWithOwnedOnly);

  it("opens the real modal from a Card, reloads its deep link and follows close/back/forward", testOpensTheRealModalFromACardReloadsItsDeepLink);

  it("keeps the existing rich description out of a title-only Save", testKeepsTheExistingRichDescriptionOutOfATitleOnlySave);

  it("saves real rich-editor changes as Markdown and reloads the stored formatting", testSavesRealRichEditorChangesAsMarkdownAndReloadsTheStored);
});

function registerFR15CardDetail() {
  registerRetainsMountedDirtyCardContentAfterABackgroundS();

  it("retains the selected editor and unsaved text when a same-origin snapshot removes its Card, preserving errors and explicit close", testRetainsTheSelectedEditorAndUnsavedTextWhenASameOrigin);

  it("preserves dirty title and rich description across an incoming snapshot and own unrelated link refetch", testPreservesDirtyTitleAndRichDescriptionAcrossAnIncomingSnapshotAnd);

  it("keeps text typed while Save and its refetch are in flight dirty after the matching save completes", testKeepsTextTypedWhileSaveAndItsRefetchAreInFlight);

  it("disables Activity lifecycle actions for dirty drafts and until Save refetch completes", testDisablesActivityLifecycleActionsForDirtyDraftsAndUntilSaveRefetch);

  it("refetches ordinary archived-status Save and inventory Restore into the real board", testRefetchesOrdinaryArchivedStatusSaveAndInventoryRestoreIntoTheReal);

  it("archives from a Discovery tile through routed Card confirmation and GET refetch", testArchivesFromADiscoveryTileThroughRoutedCardConfirmationAndGET);

  it("renders Tracking with exact visible Story titles and counts, excluding archived and parked ancestry", testRendersTrackingWithExactVisibleStoryTitlesAndCountsExcludingArchived);

  it("excludes archived and parked ancestry from Story-only Releases totals and Roadmap references", testExcludesArchivedAndParkedAncestryFromStoryOnlyReleasesTotalsAnd);

  it("contains dirty-close confirmation, cancels only that layer and retains failed saves", testContainsDirtyCloseConfirmationCancelsOnlyThatLayerAndRetainsFailed);

  registerConflictingSaves();

  registerLiveChangeWhileTheCardIsBeingEdited();
}

function registerShowsEmptyHistoryAfterASuccessfulBoundedPage() {
  it("shows empty history after a successful bounded page", async () => {
    await mount(`${viewUrl}?card=${cardId}`);
    await act(async () => button("History").click());
    await vi.waitFor(() => expect(document.querySelector(".card-history")?.textContent).toContain("No history yet."));
    expect(document.querySelector('.card-history [role="alert"]')).toBeNull();
  });
}

function registerClosesACleanCardOnEscapeAndClearsThe() {
  it("closes a clean Card on Escape and clears the deep link", async () => {
    await mount(`${viewUrl}?card=${cardId}`);
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(router.state.location.search).toEqual({});
  });
}

function registerLiveChangeWhileTheCardIsBeingEdited() {
  describe("live change while the Card is being edited", () => {
    const setTitle = (value: string) => act(async () => {
      const titleInput = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(titleInput, value);
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const remoteChange = (version: number) => act(async () => useLiveInteractionStore.getState().setWaiting(1, { [`card:${cardId}`]: version }));
    const liveAlert = () => document.querySelector(".conflict-alert");

    it("alerts a dirty editor, keeps its text and unsaved-changes dialog, and resubmits on Keep mine", async () => {
      await mount(`${viewUrl}?card=${cardId}`);
      await setTitle("My local title");
      await remoteChange(2);
      expect(liveAlert()?.textContent).toContain("This Card changed.");
      expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')!.value).toBe("My local title");
      await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
      expect(document.querySelector('[role="alertdialog"] .conflict-alert')?.textContent).toContain("This Card changed.");
      await act(async () => button("Cancel").click());
      state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, version: 2 } : card) };
      await act(async () => button("Keep mine").click());
      expect(liveAlert()).toBeNull();
      await act(async () => button("Save").click());
      await vi.waitFor(() => expect(state.savedPatch).toMatchObject({ title: "My local title", baseVersion: 2 }));
    });

    it("discards the draft and shows the server state on Reload", async () => {
      await mount(`${viewUrl}?card=${cardId}`);
      await setTitle("My local title");
      state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, title: "Remote title", version: 2 } : card) };
      await remoteChange(2);
      await act(async () => button("Reload").click());
      await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')!.value).toBe("Remote title"));
      expect(liveAlert()).toBeNull();
    });

    it("stays silent for a clean editor and for changes that are not newer than the editor's version", async () => {
      await mount(`${viewUrl}?card=${cardId}`);
      await remoteChange(2);
      expect(liveAlert()).toBeNull();
      await setTitle("My local title");
      expect(liveAlert()).not.toBeNull();
      await remoteChange(1);
      expect(liveAlert()).toBeNull();
    });
  });
}

function registerConflictingSaves() {
  describe("conflicting saves", () => {




    it("keeps the typed text after a stale save and resubmits with the current version on Keep mine", async () => {
      const titleInput = await mountConflicted();
      expect(patches).toMatchObject([{ baseVersion: 1, title: "My local title" }]);
      expect(titleInput.value).toBe("My local title");
      await act(async () => button("Keep mine").click());
      await vi.waitFor(() => expect(patches).toHaveLength(2));
      expect(patches[1]).toMatchObject({ baseVersion: 2, title: "My local title" });
      await vi.waitFor(() => expect(document.querySelector(".conflict-alert")).toBeNull());
      expect(state.snapshot.cards.find((card) => card.id === cardId)?.title).toBe("My local title");
    });

    it("keeps a blocked navigation and draft after conflict, then resumes it with the acknowledged version on Keep mine", async () => {
      const titleInput = await mountConflicted();
      await act(async () => { void router.navigate({ to: viewUrl, search: {} }); });
      const confirmation = document.querySelector('[role="alertdialog"]')!;
      expect(confirmation.textContent).toContain("changed since you loaded it");
      expect(titleInput.value).toBe("My local title");
      expect(router.state.location.search.card).toBe(cardId);
      await act(async () => [...confirmation.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Keep mine")!.click());
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
      expect(patches[1]).toMatchObject({ baseVersion: 2, title: "My local title" });
      expect(router.state.location.search).toEqual({});
    });

    it("replaces the draft with the server state on Reload", async () => {
      const titleInput = await mountConflicted();
      await act(async () => button("Reload").click());
      expect(document.querySelector(".conflict-alert")).toBeNull();
      expect(titleInput.value).toBe("Remote title");
      expect(patches).toHaveLength(1);
    });
  });
}

function registerRetainsMountedDirtyCardContentAfterABackgroundS() {
  it.each(["inventory", "snapshot"])("retains mounted dirty Card content after a background %s error", async (kind) => {
    await mount(`${viewUrl}?card=${cardId}`);
    const shell = document.querySelector(".story-map-shell");
    const dialog = document.querySelector('[role="dialog"]');
    const titleInput = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    const editor = document.querySelector<HTMLDivElement & { editor: Editor; }>(".tiptap")!.editor;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(titleInput, "Unsaved during read failure");
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      editor.commands.insertContent("Retained description during read failure");
    });
    const originalFetch = fetch;
    const failedPath = kind === "inventory" ? `/api/story-maps?projectId=${projectId}` : `/api/story-maps/${storyMapId}`;
    vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === failedPath
      ? Promise.resolve(Response.json({ message: "Read temporarily failed" }, { status: 503 })) : originalFetch(path, init)));
    await act(async () => { await state.client.invalidateQueries({ queryKey: kind === "inventory" ? ["story-maps", projectId] : ["story-map", storyMapId] }); });
    await vi.waitFor(() => expect([...document.querySelectorAll('[role="alert"]')].map((alert) => alert.textContent)).toContain("Request failed: 503"));
    expect(document.querySelector(".story-map-shell")).toBe(shell);
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);
    expect(document.querySelector('[role="dialog"] input')).toBe(titleInput);
    expect(titleInput.value).toBe("Unsaved during read failure");
    expect(editor.storage.markdown.getMarkdown()).toContain("Retained description during read failure");
  });
}

async function testRetainsTheSelectedEditorAndUnsavedTextWhenASameOrigin() {
  await mount(`${viewUrl}?card=${cardId}`);
  const titleInput = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(titleInput, "Retained deletion draft");
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    editor.commands.insertContent("Unsaved deletion description");
  });
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.filter((card) => card.id !== cardId) };
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }); });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(titleInput.value).toBe("Retained deletion draft");
  expect(editor.storage.markdown.getMarkdown()).toContain("Unsaved deletion description");
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/cards/${cardId}` && init?.method === "PATCH"
    ? Promise.resolve(new Response(JSON.stringify({ code: "not_found", message: "Selected Card no longer exists" }), { status: 404, headers: { "content-type": "application/json" } })) : originalFetch(path, init)));
  await act(async () => button("Save").click());
  await vi.waitFor(async () => { await act(async () => {}); expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe("Request failed: 404"); });
  expect(titleInput.value).toBe("Retained deletion draft");
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await act(async () => button("Discard").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
}

async function testPreservesDirtyTitleAndRichDescriptionAcrossAnIncomingSnapshotAnd() {
  await mount(`${viewUrl}?card=${cardId}`);
  const titleInput = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(titleInput, "Unsaved title");
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    editor.commands.insertContent("Unsaved description");
  });
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, title: "Agent title", description: "Agent description" } : card) };
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }); });
  expect(titleInput.value).toBe("Unsaved title");
  expect(editor.storage.markdown.getMarkdown()).toContain("Unsaved description");
  const originalFetch = fetch;
  const personaId = randomUUID();
  state.snapshot = storyMapSnapshotSchema.parse({ ...state.snapshot, personas: [{ id: personaId, projectId, storyMapId, version: 1, name: "Buyer", role: "Decision maker" }] });
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }); });
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/cards/${cardId}/personas/${personaId}`
    ? Promise.resolve(Response.json({ link: {} })) : originalFetch(path, init)));
  await act(async () => button("Buyer").click());
  await vi.waitFor(() => expect(titleInput.value).toBe("Unsaved title"));
  expect(editor.storage.markdown.getMarkdown()).toContain("Unsaved description");
}

async function testKeepsTextTypedWhileSaveAndItsRefetchAreInFlight() {
  const originalFetch = fetch;
  let completeSave: (() => Promise<void>) | undefined;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/cards/${cardId}` && init?.method === "PATCH"
    ? new Promise<Response>((resolve) => { completeSave = async () => resolve(await originalFetch(path, init)); }) : originalFetch(path, init)));
  await mount(`${viewUrl}?card=${cardId}`);
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => editor.commands.insertContent("Submitted text"));
  await act(async () => button("Save").click());
  expect(completeSave).toBeDefined();
  await act(async () => editor.commands.insertContent("Text typed during Save"));
  await act(async () => completeSave!());
  await vi.waitFor(() => expect(button("Save").disabled).toBe(false));
  expect(state.savedPatch?.description).toContain("Submitted text");
  expect(state.savedPatch?.description).not.toContain("Text typed during Save");
  expect(editor.storage.markdown.getMarkdown()).toContain("Text typed during Save");
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
}

async function testDisablesActivityLifecycleActionsForDirtyDraftsAndUntilSaveRefetch() {
  const activityId = state.snapshot.cards[0]!.id;
  const originalFetch = fetch;
  let completeSave!: () => Promise<void>;
  let completeRefetch!: () => Promise<void>;
  let holdRefetch = false;
  const requestedRefetch = vi.fn();
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/cards/${activityId}` && init?.method === "PATCH") return new Promise<Response>((resolve) => { completeSave = async () => resolve(await originalFetch(path, init)); });
    if (path === `/api/story-maps/${storyMapId}` && holdRefetch) {
      requestedRefetch();
      return new Promise<Response>((resolve) => { completeRefetch = async () => resolve(await originalFetch(path, init)); });
    }
    return originalFetch(path, init);
  }));
  await mount(`${viewUrl}?card=${activityId}`);
  const reportPrefixes = ["backlog-health", "github-sync-health", "work-item-sync-health", "release-summary", "release-timeline", "roadmap", "roadmaps", "source-documents", "source-document", "source-coverage", "activity", "card-history"];
  for (const prefix of reportPrefixes) state.client.setQueryData([prefix, "cached-report"], {});
  const actions = [button("Park"), button("Archive"), button("Delete permanently")];
  expect(actions.every((action) => !action.disabled)).toBe(true);
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => editor.commands.insertContent("Unsaved Activity edit"));
  expect(actions.every((action) => action.disabled)).toBe(true);
  await act(async () => actions.forEach((action) => action.click()));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await act(async () => button("Save").click());
  expect(actions.every((action) => action.disabled)).toBe(true);
  holdRefetch = true;
  await act(async () => completeSave());
  await vi.waitFor(() => expect(requestedRefetch).toHaveBeenCalledOnce());
  expect(button("Save").disabled).toBe(true);
  expect(actions.every((action) => action.disabled)).toBe(true);
  for (const prefix of reportPrefixes) expect(state.client.getQueryState([prefix, "cached-report"])?.isInvalidated, prefix).toBe(true);
  holdRefetch = false;
  await act(async () => completeRefetch());
  await vi.waitFor(() => expect(actions.every((action) => !action.disabled)).toBe(true));
  expect(state.savedPatch?.description).toBe("Unsaved Activity edit");
  expect(state.client.getQueryData<StoryMapSnapshot>(["story-map", storyMapId])?.cards.find((card) => card.id === activityId)?.description).toBe("Unsaved Activity edit");
}

async function testRefetchesOrdinaryArchivedStatusSaveAndInventoryRestoreIntoTheReal() {
  const originalFetch = fetch;
  const mapReads: string[] = [];
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/story-maps/${storyMapId}`) mapReads.push(path);
    return originalFetch(path, init);
  }));
  const discoveryUrl = viewUrl.replace(/tree$/, "discovery");
  await mount(`${discoveryUrl}?card=${cardId}`);
  const status = [...document.querySelectorAll<HTMLSelectElement>('[role="dialog"] select')].find((select) => select.parentElement!.textContent!.startsWith("Status"))!;
  await act(async () => { status.value = "archived"; status.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(state.host.querySelector(`button[data-card-id="${cardId}"]`)).toBeNull());
  expect(mapReads.length).toBeGreaterThanOrEqual(2);
  expect(state.savedPatch?.status).toBe("archived");
  await vi.waitFor(() => expect(button("Save").disabled).toBe(true));
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  await openBoardSearch(); await act(async () => button("Archived").click());
  expect(document.querySelector(".lifecycle-inventory li")?.textContent).toContain("Create traceable story cards");
  await act(async () => button("Restore").click());
  const restore = document.querySelector('[role="alertdialog"]')!;
  await act(async () => { const select = restore.querySelector("select")!; select.value = "active"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => restore.querySelectorAll<HTMLButtonElement>("button")[1]!.click());
  await vi.waitFor(() => expect(document.querySelector(".lifecycle-inventory li")).toBeNull());
  expect(state.savedPatch).toEqual({ archived: false, status: "active", baseVersion: 1 });
  expect(mapReads.length).toBeGreaterThanOrEqual(3);
  await act(async () => button("Close").click());
  expect(state.host.querySelector(`button[data-card-id="${cardId}"]`)).not.toBeNull();
  expect(state.client.getQueryData<StoryMapSnapshot>(["story-map", storyMapId])?.cards.find((card) => card.id === cardId)?.status).toBe("active");
}

async function testArchivesFromADiscoveryTileThroughRoutedCardConfirmationAndGET() {
  const originalFetch = fetch;
  const mapReads: string[] = [];
  const archives: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path === `/api/story-maps/${storyMapId}`) mapReads.push(path);
    if (path === `/api/cards/${cardId}/archive` && init?.method === "POST") {
      archives.push(path);
      state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, status: "archived" } : card) };
      return new Response(JSON.stringify(state.snapshot.cards.find((card) => card.id === cardId)), { headers: { "content-type": "application/json" } });
    }
    return originalFetch(path, init);
  }));
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const tile = state.host.querySelector<HTMLButtonElement>(`button[data-card-id="${cardId}"]`)!;
  tile.focus();
  await act(async () => tile.click());
  expect(router.state.location.search).toEqual({ card: cardId });
  expect(document.querySelector('[role="dialog"] [data-dialog-heading]')?.textContent).toBe("Create traceable story cards");
  await act(async () => button("Archive").click());
  const confirmation = document.querySelector('[role="alertdialog"]')!;
  expect(confirmation.textContent).toContain("Create traceable story cards");
  expect(archives).toHaveLength(0);
  await act(async () => confirmation.querySelectorAll<HTMLButtonElement>("button")[1]!.click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(archives).toEqual([`/api/cards/${cardId}/archive`]);
  expect(mapReads.length).toBeGreaterThanOrEqual(2);
  expect(router.state.location.search).toEqual({});
  expect(state.host.querySelector(`button[data-card-id="${cardId}"]`)).toBeNull();
  expect(document.activeElement).toBe(state.host.querySelector(`button[data-card-id="${state.snapshot.cards.find((card) => card.level === "step")!.id}"]`));
  await openBoardSearch(); await act(async () => button("Archived").click());
  expect([...document.querySelectorAll(".lifecycle-inventory li > span")].map((row) => row.textContent)).toEqual(["LSM-3 Create traceable story cards"]);
  expect(state.client.getQueryData<StoryMapSnapshot>(["story-map", storyMapId])?.cards.find((card) => card.id === cardId)?.status).toBe("archived");
}

async function testRendersTrackingWithExactVisibleStoryTitlesAndCountsExcludingArchived() {
  const activity = state.snapshot.cards[0]!;
  const step = state.snapshot.cards[1]!;
  const story = state.snapshot.cards[2]!;
  const parkedActivity = { ...activity, id: randomUUID(), key: "LSM-4", title: "Parked Activity", parked: true };
  const parkedStep = { ...step, id: randomUUID(), key: "LSM-5", parentId: parkedActivity.id };
  state.snapshot = storyMapSnapshotSchema.parse({ ...state.snapshot, cards: [
    ...state.snapshot.cards,
    { ...story, id: randomUUID(), key: "LSM-6", title: "Visible active Story", status: "active" },
    { ...story, id: randomUUID(), key: "LSM-7", title: "Archived Story", status: "archived" },
    parkedActivity, parkedStep,
    { ...story, id: randomUUID(), key: "LSM-8", title: "Story under parked Activity", parentId: parkedStep.id }
  ] });
  await mount(viewUrl.replace(/tree$/, "tracking"));
  const cards = state.host.querySelectorAll(".release-kanban-card");
  expect([...cards].map((card) => card.querySelector("p")!.textContent)).toEqual(["Create traceable story cards", "Visible active Story"]);
  expect([...state.host.querySelectorAll(".release-kanban-heading > span")].map((count) => count.textContent)).toEqual(["1", "1", "0", "0"]);
  expect(state.host.textContent).not.toContain("Archived Story");
  expect(state.host.textContent).not.toContain("Story under parked Activity");
}

async function testExcludesArchivedAndParkedAncestryFromStoryOnlyReleasesTotalsAnd() {
  const activity = state.snapshot.cards[0]!;
  const step = state.snapshot.cards[1]!;
  const story = state.snapshot.cards[2]!;
  const parkedActivity = { ...activity, id: randomUUID(), key: "LSM-4", title: "Parked Activity", parked: true };
  const parkedStep = { ...step, id: randomUUID(), key: "LSM-5", parentId: parkedActivity.id };
  const hiddenStory = { ...story, id: randomUUID(), key: "LSM-6", title: "Story under parked Activity", parentId: parkedStep.id };
  state.snapshot = storyMapSnapshotSchema.parse({ ...state.snapshot, cards: [...state.snapshot.cards, { ...story, id: randomUUID(), key: "LSM-7", title: "Archived Story", status: "archived" }, parkedActivity, parkedStep, hiddenStory] });
  const originalFetch = fetch;
  let completeReport: (() => void) | undefined;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith("/api/reports/release-summary?")
    ? new Promise<Response>((resolve) => { completeReport = () => resolve(Response.json(buildReleaseSummaryReport({ storyMapId, cards: state.snapshot.cards, releases: state.snapshot.releases, sourceLinkedCardIds: [], githubLinkedCardIds: [], includeReleased: false }))); })
    : originalFetch(path, init)));
  await mount(viewUrl.replace(/tree$/, "releases"), "Release Tracking");
  await vi.waitFor(() => expect(completeReport).toBeDefined());
  expect(state.host.querySelector(".release-summary-grid")).toBeNull();
  expect(state.host.textContent).toContain("Loading release summary...");
  await act(async () => completeReport!());
  await vi.waitFor(() => expect(state.host.querySelector(".release-summary-grid")).not.toBeNull());
  expect([...state.host.querySelectorAll(".release-summary-grid strong")].slice(0, 2).map((count) => count.textContent)).toEqual(["1", "1"]);
  await act(async () => state.root.unmount());
  state.host.replaceChildren();
  await mount(viewUrl.replace(/tree$/, "roadmaps"), "Delivery roadmap");
  await vi.waitFor(() => expect(state.host.textContent).toContain("LSM-3: Create traceable story cards"));
  expect(state.host.textContent).not.toContain("LSM-6:");
  expect(state.host.textContent).not.toContain("LSM-7:");
}

async function testContainsDirtyCloseConfirmationCancelsOnlyThatLayerAndRetainsFailed() {
  await mount(`${viewUrl}?card=${cardId}`);
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => editor.commands.insertContent("Unsaved description"));
  const close = document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!;
  close.focus();
  await act(async () => close.click());
  const confirm = document.querySelector('[role="alertdialog"]')!;
  expect(confirm.textContent).toContain("Would you like to save or discard your changes?");
  expect(document.activeElement).toBe(button("Cancel"));
  expect(document.querySelector('[role="dialog"]')!.closest<HTMLElement>(".dialog-layer")!.inert).toBe(true);
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(router.state.location.search).toEqual({ card: cardId });
  expect(document.activeElement).toBe(close);
  await act(async () => close.click());
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/cards/${cardId}` && init?.method === "PATCH"
    ? Promise.resolve(new Response(JSON.stringify({ message: "Save failed" }), { status: 500 })) : originalFetch(path, init)));
  await act(async () => document.querySelector('[role="alertdialog"]')!.querySelector<HTMLButtonElement>("button")!.click());
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toContain("Request failed: 500"));
  expect(button("Cancel").disabled).toBe(false);
  expect(state.savedPatch).toBeUndefined();
  await act(async () => button("Cancel").click());
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
}

async function testRoutesEscapeAndBackdropOnTheCardModalThroughTheDirty() {
  await mount(`${viewUrl}?card=${cardId}`);
  const backdrop = () => document.querySelector<HTMLElement>('[role="dialog"]')!.parentElement!;
  const pressEscape = () => act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => editor.commands.insertContent("Unsaved description"));
  await pressEscape();
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(router.state.location.search).toEqual({ card: cardId });
  await act(async () => button("Cancel").click());
  await act(async () => backdrop().dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(router.state.location.search).toEqual({ card: cardId });
  expect(state.savedPatch).toBeUndefined();
}

async function testLoadsHistoryOnlyWhenOpenedComparesFieldsSafelyExpandsLongValues() {
  state.historyPages = savedHistory();
  await mount(`${viewUrl}?card=${cardId}`);
  expect(state.historyRequests).toEqual([]);
  await act(async () => button("History").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(2));
  expect(state.historyRequests).toEqual([`/api/cards/${cardId}/history?limit=20`]);
  const panel = document.querySelector(".card-history")!;
  expect([...panel.querySelectorAll("h3")].map((item) => item.textContent)).toEqual(["Version 3", "Version 2"]);
  expect(panel.textContent).toContain("Agent: agent-host");
  expect(panel.querySelector('.card-history-attribution svg[aria-hidden="true"]')).not.toBeNull();
  expect(panel.textContent).toContain("MCP session: detail-session");
  expect(panel.textContent).toContain("No Card field changes.");
  expect(panel.textContent).toContain("Before");
  expect(panel.textContent).toContain("After");
  expect(panel.textContent).toContain("Agent title");
  expect(panel.querySelectorAll("script")).toHaveLength(0);
  const expansion = panel.querySelector<HTMLButtonElement>('[aria-label="Show full value for Version 2, Description, before"]')!;
  expansion.focus();
  expect(document.activeElement).toBe(expansion);
  await act(async () => expansion.click());
  expect(expansion.getAttribute("aria-expanded")).toBe("true");
  expect(expansion.previousElementSibling!.textContent).toBe(state.historyPages[0]!.versions[1]!.previousSnapshot!.description);
  await act(async () => expansion.click());
  expect(expansion.previousElementSibling!.textContent!.length).toBe(241);
  const afterExpansion = panel.querySelector<HTMLButtonElement>('[aria-label="Show full value for Version 2, Description, after"]')!;
  expect(afterExpansion.previousElementSibling!.textContent!.length).toBe(241);
  await act(async () => afterExpansion.click());
  expect(afterExpansion.previousElementSibling!.textContent).toBe(state.historyPages[0]!.versions[1]!.snapshot.description);
  expect(panel.querySelectorAll("script")).toHaveLength(0);
  button("Load older versions").focus();
  await act(async () => button("Load older versions").click());
  await vi.waitFor(() => expect(panel.querySelectorAll(".card-history-entry")).toHaveLength(3));
  expect(document.activeElement).toBe(button("History"));
  expect(state.historyRequests[1]).toBe(`/api/cards/${cardId}/history?limit=20&beforeVersion=2`);
  expect(panel.textContent).toContain("Card created. No previous saved version.");
  const creation = [...panel.querySelectorAll(".card-history-entry")].at(-1)!;
  expect(creation.textContent).toContain("Create traceable story cards");
  expect(creation.textContent).toContain("Before description");
  const initialDescription = creation.querySelector<HTMLButtonElement>('[aria-label="Show full value for Version 1, Description, after"]')!;
  await act(async () => initialDescription.click());
  expect(initialDescription.previousElementSibling!.textContent).toBe(state.historyPages[1]!.versions[0]!.snapshot.description);
  const expansionNames = [...panel.querySelectorAll('button[aria-expanded]')].map((control) => control.getAttribute("aria-label"));
  expect(new Set(expansionNames).size).toBe(expansionNames.length);
  expect([...panel.querySelectorAll("button")].some((item) => /restore/i.test(item.textContent!))).toBe(false);
}

async function testAnnouncesErrorsRetainsExistingRowsOnPageFailureRetriesAndRefreshes() {
  state.historyPages = savedHistory();
  state.historyFailure = 0;
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => button("History").click());
  await vi.waitFor(() => expect(document.querySelector('.card-history [role="alert"]')?.textContent).toContain("Request failed: 500"));
  expect(document.querySelector(".card-history")?.textContent).not.toContain("No history yet.");
  state.historyFailure = undefined;
  button("Retry history").focus();
  await act(async () => button("Retry history").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(2));
  expect(document.activeElement).toBe(button("History"));
  state.historyFailure = 1;
  await act(async () => button("Load older versions").click());
  await vi.waitFor(() => expect(document.querySelector('.card-history [role="alert"]')).not.toBeNull());
  expect(document.querySelectorAll(".card-history-entry")).toHaveLength(2);
  state.historyFailure = undefined;
  button("Retry history").focus();
  await act(async () => button("Retry history").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(3));
  expect(document.activeElement).toBe(button("History"));
  state.historyPages[0]!.versions[0]!.actor = "updated-agent-host";
  const count = state.historyRequests.length;
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => editor.commands.insertContent("Save to refresh history"));
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(state.historyRequests.length).toBeGreaterThan(count));
  await vi.waitFor(() => expect(document.querySelector(".card-history")?.textContent).toContain("Agent: updated-agent-host"));
}

async function testAnnouncesAPendingFirstPageWithoutClaimingHistoryIsEmpty() {
  const originalFetch = fetch;
  let resolvePage!: (response: Response) => void;
  const pendingPage = new Promise<Response>((resolve) => { resolvePage = resolve; });
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith(`/api/cards/${cardId}/history?`) ? pendingPage : originalFetch(path, init)));
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => button("History").click());
  expect(document.querySelector('.card-history [role="status"]')?.textContent).toBe("Loading history…");
  expect(document.querySelector('.card-history [role="status"]')?.closest('[aria-busy]')).toBeNull();
  expect(document.querySelector(".card-history")?.textContent).not.toContain("No history yet.");
  await act(async () => resolvePage(new Response(JSON.stringify({ versions: [], nextCursor: null }), { headers: { "content-type": "application/json" } })));
  await vi.waitFor(() => expect(document.querySelector(".card-history")?.textContent).toContain("No history yet."));
}

async function testRetainsOnlyOneBoundedPageWhenClosedAndRemounted() {
  state.historyPages = savedHistory();
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => button("History").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(2));
  await act(async () => button("Load older versions").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(3));
  await act(async () => button("History").click());
  expect(state.client.getQueryData<{ pages: unknown[] }>(["card-history", cardId])?.pages).toHaveLength(1);
  const beforeReopen = state.historyRequests.length;
  await act(async () => button("History").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(2));
  expect(state.historyRequests.slice(beforeReopen)).toEqual([`/api/cards/${cardId}/history?limit=20`]);
  await act(async () => button("Load older versions").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(3));
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  expect(state.client.getQueryData<{ pages: unknown[] }>(["card-history", cardId])?.pages).toHaveLength(1);
  await act(async () => button("Create traceable story cards").click());
  const beforeRemountOpen = state.historyRequests.length;
  await act(async () => button("History").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(2));
  expect(state.historyRequests.slice(beforeRemountOpen)).toEqual([`/api/cards/${cardId}/history?limit=20`]);
}

async function testBoundsManyShortLinesAndShowsExactFalseZeroAndCleared() {
  state.historyPages = savedHistory();
  const edited = state.historyPages[0]!.versions[1]!;
  edited.previousSnapshot = { ...edited.previousSnapshot!, parked: true, estimate: 5, assignee: "reader" };
  edited.snapshot = { ...edited.snapshot, parked: false, estimate: 0, assignee: null, description: "x\n".repeat(80) };
  edited.changedFields = ["parked", "estimate", "assignee", "description"];
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => button("History").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(2));
  const entry = document.querySelectorAll(".card-history-entry")[1]!;
  const field = (label: string) => [...entry.querySelectorAll("dt")].find((node) => node.textContent === label)!.parentElement!;
  expect([...field("Parked").querySelectorAll("pre")].map((node) => node.textContent)).toEqual(["Yes", "No"]);
  expect([...field("Estimate").querySelectorAll("pre")].map((node) => node.textContent)).toEqual(["5", "0"]);
  expect([...field("Assignee").querySelectorAll("pre")].map((node) => node.textContent)).toEqual(["reader", "(empty)"]);
  const after = field("Description").querySelector<HTMLButtonElement>('[aria-label="Show full value for Version 2, Description, after"]')!;
  expect(after.previousElementSibling!.textContent!.split("\n")).toHaveLength(6);
  await act(async () => after.click());
  expect(after.previousElementSibling!.textContent).toBe(edited.snapshot.description);
  expect(after.getAttribute("aria-label")).toBe("Collapse value for Version 2, Description, after");
}

async function testHoldsNavigationToCardBUntilDelayedCardASaveRefreshes() {
  state.historyPages = savedHistory();
  const originalFetch = fetch;
  let completeSave!: () => Promise<void>;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/cards/${cardId}` && init?.method === "PATCH") return new Promise<Response>((resolve) => { completeSave = async () => resolve(await originalFetch(path, init)); });
    return originalFetch(path, init);
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => button("History").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(2));
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => editor.commands.insertContent("Delayed save"));
  await act(async () => button("Save").click());
  const secondCard = state.snapshot.cards[1]!;
  await act(async () => { void router.navigate({ to: "/projects/$projectId/story-maps/$storyMapId/tree", params: { projectId, storyMapId }, search: { card: secondCard.id } }); });
  const confirmation = document.querySelector('[role="alertdialog"]')!;
  const discard = [...confirmation.querySelectorAll("button")].find((item) => item.textContent === "Discard")!;
  expect(discard.disabled).toBe(true);
  expect(router.state.location.search.card).toBe(cardId);
  expect(state.client.getQueryState(["card-history", cardId])?.isInvalidated).toBe(false);
  await act(async () => completeSave());
  await vi.waitFor(() => expect(discard.disabled).toBe(false));
  expect(state.historyRequests.length).toBeGreaterThan(1);
  await act(async () => discard.click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe(secondCard.title));
}



async function testOpensTheRealModalFromACardReloadsItsDeepLink() {
  await mount(viewUrl);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => button("Create traceable story cards").click());
  expect(router.state.location.search).toEqual({ card: cardId });
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("LSM-3");
  const deepLink = router.state.location.href;
  await act(async () => state.root.unmount());
  state.client.clear();
  await mount(deepLink);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Create traceable story cards");
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  expect(router.state.location.search).toEqual({});
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => { router.history.back(); });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => { router.history.forward(); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
}

async function testKeepsTheExistingRichDescriptionOutOfATitleOnlySave() {
  const description = "## ***Existing heading***\n\n- One\n- Two";
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, description } : card) };
  await mount(`${viewUrl}?card=${cardId}`);
  expect(document.querySelector(".tiptap h2 strong em")?.textContent).toBe("Existing heading");
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Title changed only");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Save").click());
  expect(state.savedPatch).toEqual({ title: "Title changed only", baseVersion: 1 });
  expect(state.snapshot.cards.find((card) => card.id === cardId)?.description).toBe(description);
}

async function testSavesRealRichEditorChangesAsMarkdownAndReloadsTheStored() {
  await mount(`${viewUrl}?card=${cardId}`);
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => {
    editor.commands.insertContent("Create traceable story cards");
    editor.commands.selectAll();
    button("Bold").click();
    button("Italic").click();
    button("Heading 2").click();
  });
  await act(async () => button("Save").click());
  expect(state.savedPatch?.description).toBe("## ***Create traceable story cards***");
  expect(state.savedPatch?.description).not.toContain("<");
  const deepLink = router.state.location.href;
  await act(async () => state.root.unmount());
  state.client.clear();
  await mount(deepLink);
  expect(document.querySelector(".tiptap h2 strong em")?.textContent).toBe("Create traceable story cards");
  await act(async () => {
    document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor.commands.selectAll();
    button("Bullet list").click();
  });
  await act(async () => button("Save").click());
  expect(state.savedPatch?.description).toBe("- ***Create traceable story cards***");
  await act(async () => state.root.unmount());
  state.client.clear();
  await mount(deepLink);
  expect(document.querySelector(".tiptap ul li strong em")?.textContent).toBe("Create traceable story cards");
  expect(document.querySelector(".tiptap h2")).toBeNull();
}

const patches: Array<{ baseVersion: number; title?: string }> = [];

async function mountConflicted(): Promise<HTMLInputElement> {
  patches.length = 0;
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path !== `/api/cards/${cardId}` || init?.method !== "PATCH") return originalFetch(path, init);
    const body = JSON.parse(String(init.body)) as { baseVersion: number; title?: string };
    patches.push(body);
    const current = state.snapshot.cards.find((card) => card.id === cardId)!;
    if (body.baseVersion === current.version) {
      state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, title: body.title ?? card.title, version: card.version + 1 } : card) };
      return Promise.resolve(Response.json(state.snapshot.cards.find((card) => card.id === cardId)));
    }
    return Promise.resolve(Response.json({ code: "conflict", message: "1 object(s) changed since they were read.", conflicts: [{ entity: "card", id: cardId, baseVersion: body.baseVersion, currentVersion: current.version, current }] }, { status: 409 }));
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  const titleInput = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(titleInput, "My local title");
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, title: "Remote title", version: 2 } : card) };
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }); });
  expect(titleInput.value).toBe("My local title");
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(document.querySelector(".conflict-alert")?.textContent).toContain("changed since you loaded it"));
  return titleInput;
}
