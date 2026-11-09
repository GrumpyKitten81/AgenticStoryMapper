// @vitest-environment jsdom // REQ FR-61
import { randomUUID } from "node:crypto";
import { act } from "react";
import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import { state, cardId, viewUrl, button, mount } from "@storymapper/web/test-fixtures/card-detail";
import { dependencyKeysByCard } from "@storymapper/web/components/CardDependencyBadges";

describe("Card dependencies", () => {
  it("clears the failed dependency when selecting a different prerequisite", testClearsTheFailedDependencyWhenSelectingADifferentPrerequisite);

  registerKeepsAPendingDependencyRefusalObservableWithDirtyEditor();

  it("adds and removes with current baselines while preserving dirty canonical editor and focus", testAddsAndRemovesWithCurrentBaselinesWhilePreservingDirtyCanonicalEditor);

  registerPreservesSFocusMovedDuringPendingKeyboardRemoval();

  registerSerializesVersionedModalWritesWithSFirst();

  it("derives both directions from complete snapshot including archived prerequisites", async () => {
    const prerequisite = state.snapshot.cards[0]!;
    state.snapshot.cards = [...state.snapshot.cards, { ...prerequisite, id: randomUUID(), key: "LSM-4", level: "note", status: "archived" }];
    const archived = state.snapshot.cards.at(-1)!;
    state.snapshot.cardDependencies = [{ id: randomUUID(), cardId, prerequisiteCardId: archived.id, createdAt: archived.createdAt }];
    expect(dependencyKeysByCard(state.snapshot)[cardId]).toEqual({ prerequisites: ["LSM-4"], dependents: [] });
    expect(dependencyKeysByCard(state.snapshot)[archived.id]).toEqual({ prerequisites: [], dependents: ["LSM-3"] });
    await mount(`${viewUrl}?card=${cardId}`);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Depends on (1): LSM-4");
  });

  it("disables pending controls and displays refusal without replacing dirty fields", testDisablesPendingControlsAndDisplaysRefusalWithoutReplacingDirtyFields);


  it("reloads a restored lower dependency baseline without replacing dirty title or Tiptap drafts", testReloadsARestoredLowerDependencyBaselineWithoutReplacingDirtyTitleOr);

  it("resolves stale dependency conflict separately from unrelated dirty title", testResolvesStaleDependencyConflictSeparatelyFromUnrelatedDirtyTitle);

});

function registerSerializesVersionedModalWritesWithSFirst() {
  it.each(["dependency", "save"])("serializes versioned modal writes with %s first", async (first) => {
    const originalFetch = fetch;
    const requests: Array<{ kind: string; baseVersion: number; }> = [];
    let finish!: () => void;
    vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
      const dependency = path === `/api/cards/${cardId}/dependencies`;
      if (!dependency && !(path === `/api/cards/${cardId}` && init?.method === "PATCH")) return originalFetch(path, init);
      const input = JSON.parse(String(init?.body)) as { baseVersion: number; title?: string; };
      requests.push({ kind: dependency ? "dependency" : "save", baseVersion: input.baseVersion });
      return new Promise<Response>((resolve) => {
        finish = () => {
          const current = state.snapshot.cards.find((card) => card.id === cardId)!;
          const saved = { ...current, ...(input.title ? { title: input.title } : {}), version: current.version + 1 };
          const dependencies = dependency ? [{ id: randomUUID(), cardId, prerequisiteCardId: state.snapshot.cards[0]!.id, createdAt: current.createdAt }] : state.snapshot.cardDependencies;
          state.snapshot = { ...state.snapshot, cardDependencies: dependencies, cards: state.snapshot.cards.map((card) => card.id === cardId ? saved : card) };
          resolve(Response.json(dependency ? { card: saved, dependencies } : saved));
        };
      });
    }));
    await mount(`${viewUrl}?card=${cardId}`);
    const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    const select = [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Prerequisite Card"))!.querySelector("select")!;
    await act(async () => { select.value = state.snapshot.cards[0]!.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
    const editTitle = async () => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Serialized draft");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await exerciseSerializesVersionedModalWritesWithSFirst(first, editTitle, select, requests, () => finish, title);
    const second = first === "dependency" ? "save" : "dependency";
    await act(async () => button(second === "save" ? "Save" : "Add dependency").click());
    expect(requests).toEqual([{ kind: first, baseVersion: 1 }, { kind: second, baseVersion: 2 }]);
    await act(async () => finish());
    await vi.waitFor(() => expect(state.snapshot.cards.find((card) => card.id === cardId)!.version).toBe(3));
    expect(title.value).toBe("Serialized draft");
  });
}

async function exerciseSerializesVersionedModalWritesWithSFirst(first: string, editTitle: () => Promise<void>, select: HTMLSelectElement, requests: { kind: string; baseVersion: number; }[], readFinish: () => () => void, title: HTMLInputElement) {
  if (first === "dependency") {
    expect(button("Archive").disabled).toBe(false);
    await act(async () => button("Add dependency").click());
    expect(button("Archive").disabled).toBe(true);
    await editTitle();
    expect(button("Save").disabled).toBe(true);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
    expect(document.querySelector<HTMLButtonElement>(".card-close-confirm-actions button")!.disabled).toBe(true);
    await act(async () => document.querySelector<HTMLButtonElement>(".card-close-confirm-actions button:last-child")!.click());
  } else {
    await editTitle();
    await act(async () => button("Save").click());
    expect(select.disabled).toBe(true);
    expect(button("Add dependency").disabled).toBe(true);
  }
  expect(requests).toEqual([{ kind: first, baseVersion: 1 }]);
  await act(async () => readFinish()());
  await vi.waitFor(() => expect(select.disabled).toBe(false));
  expect(title.value).toBe("Serialized draft");
}

function registerPreservesSFocusMovedDuringPendingKeyboardRemoval() {
  it.each(["title", "description"])("preserves %s focus moved during pending keyboard removal", async (field) => {
    const prerequisite = state.snapshot.cards[0]!;
    state.snapshot.cardDependencies = [{ id: randomUUID(), cardId, prerequisiteCardId: prerequisite.id, createdAt: prerequisite.createdAt }];
    const originalFetch = fetch;
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => init?.method === "DELETE" && path.startsWith(`/api/cards/${cardId}/dependencies/`)
      ? new Promise<Response>((resolve) => { finish = resolve; }) : originalFetch(path, init)));
    await mount(`${viewUrl}?card=${cardId}`);
    const remove = document.querySelector<HTMLButtonElement>(`[aria-label="Remove prerequisite ${prerequisite.key}"]`)!;
    remove.focus();
    await act(async () => remove.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    expect(remove.disabled).toBe(true);
    const editor = document.querySelector<HTMLElement>(field === "title" ? '[role="dialog"] input' : ".tiptap")!;
    await act(async () => editor.focus());
    const saved = { ...state.snapshot.cards.find((card) => card.id === cardId)!, version: 2 };
    state.snapshot = { ...state.snapshot, cardDependencies: [], cards: state.snapshot.cards.map((card) => card.id === cardId ? saved : card) };
    await act(async () => finish(Response.json({ card: saved, dependencies: [] })));
    await vi.waitFor(() => expect(document.querySelector(`[aria-label="Remove prerequisite ${prerequisite.key}"]`)).toBeNull());
    expect(document.activeElement).toBe(editor);
  });
}

function registerKeepsAPendingDependencyRefusalObservableWithDirtyEditor() {
  it.each([false, true])("keeps a pending dependency refusal observable with dirty editor %s", async (dirty) => {
    const originalFetch = fetch;
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.endsWith("/dependencies") ? new Promise<Response>((resolve) => { finish = resolve; }) : originalFetch(path, init)));
    await mount(`${viewUrl}?card=${cardId}`);
    const select = [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Prerequisite Card"))!.querySelector("select")!;
    await act(async () => {
      if (dirty) {
        const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Pending draft");
        title.dispatchEvent(new Event("input", { bubbles: true }));
      }
      select.value = state.snapshot.cards[0]!.id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button("Add dependency").click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
    if (dirty) {
      expect(button("Discard").disabled).toBe(true);
      await act(async () => button("Cancel").click());
    }
    expect(document.querySelector(".card-detail-modal")).not.toBeNull();
    await act(async () => finish(Response.json({ code: "validation", message: "Dependency rejected" }, { status: 400 })));
    await vi.waitFor(() => expect(document.querySelector('.card-detail-modal [role="alert"]')!.textContent).toBe("Dependency rejected"));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
    if (dirty) await act(async () => button("Discard").click());
    await vi.waitFor(() => expect(document.querySelector(".card-detail-modal")).toBeNull());
  });
}

async function testClearsTheFailedDependencyWhenSelectingADifferentPrerequisite() {
  const originalFetch = fetch;
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (!path.endsWith("/dependencies")) return originalFetch(path, init);
    const input = JSON.parse(String(init?.body)) as { prerequisiteCardId: string; baseVersion: number };
    requests.push(input.prerequisiteCardId);
    return Response.json({ code: "conflict", message: "Changed", conflicts: [{ entity: "card", id: cardId, baseVersion: 1, currentVersion: 2, current: { ...state.snapshot.cards[2]!, version: 2 } }] }, { status: 409 });
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  const select = [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Prerequisite Card"))!.querySelector("select")!;
  await act(async () => { select.value = state.snapshot.cards[0]!.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button("Add dependency").click());
  await vi.waitFor(() => expect(document.querySelector(".conflict-alert")).not.toBeNull());
  await act(async () => { select.value = state.snapshot.cards[1]!.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(document.querySelector(".conflict-alert")).toBeNull();
  await act(async () => button("Add dependency").click());
  await vi.waitFor(() => expect(requests).toEqual([state.snapshot.cards[0]!.id, state.snapshot.cards[1]!.id]));
}

async function testAddsAndRemovesWithCurrentBaselinesWhilePreservingDirtyCanonicalEditor() {
  const originalFetch = fetch;
  const requests: Array<{ remove: boolean; baseVersion: number }> = [];
  const prerequisite = state.snapshot.cards[0]!;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (!path.startsWith(`/api/cards/${cardId}/dependencies`)) return originalFetch(path, init);
    const remove = init?.method === "DELETE";
    const baseVersion = remove ? Number(new URL(path, "http://localhost").searchParams.get("baseVersion")) : (JSON.parse(String(init?.body)) as { baseVersion: number }).baseVersion;
    requests.push({ remove, baseVersion });
    const card = state.snapshot.cards.find((item) => item.id === cardId)!;
    const dependencies = remove ? [] : [{ id: randomUUID(), cardId, prerequisiteCardId: prerequisite.id, createdAt: card.createdAt }];
    const saved = { ...card, version: card.version + 1 };
    state.snapshot = { ...state.snapshot, cardDependencies: dependencies, cards: state.snapshot.cards.map((item) => item.id === cardId ? saved : item) };
    return Response.json({ card: saved, dependencies });
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Unsaved dependency title");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    editor.commands.insertContent("Unsaved dependency description");
  });
  const select = [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Prerequisite Card"))!.querySelector("select")!;
  expect(select.querySelector(`option[value="${cardId}"]`)).toBeNull();
  await act(async () => { select.value = prerequisite.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  button("Add dependency").focus();
  await act(async () => button("Add dependency").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
  await vi.waitFor(() => expect(document.querySelector(`[aria-label="Remove prerequisite ${prerequisite.key}"]`)).not.toBeNull());
  expect(requests).toEqual([{ remove: false, baseVersion: 1 }]);
  expect(select.value).toBe("");
  expect(select.selectedOptions[0]!.textContent).toBe("Select prerequisite");
  expect(button("Add dependency").disabled).toBe(true);
  expect(title.value).toBe("Unsaved dependency title");
  expect(editor.storage.markdown.getMarkdown()).toContain("Unsaved dependency description");
  expect(document.activeElement).toBe(button("Add dependency"));
  expect(document.querySelector(`.tree-row[data-live-card-id="${prerequisite.id}"]`)!.textContent).toContain("Required by (1): LSM-3");
  const remove = document.querySelector<HTMLButtonElement>(`[aria-label="Remove prerequisite ${prerequisite.key}"]`)!;
  remove.focus();
  await act(async () => remove.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
  await vi.waitFor(() => expect(state.snapshot.cardDependencies).toEqual([]));
  await vi.waitFor(() => expect(document.activeElement).toBe(select));
  expect(requests).toEqual([{ remove: false, baseVersion: 1 }, { remove: true, baseVersion: 2 }]);
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(state.savedPatch).toBeDefined());
  expect(state.savedPatch).toMatchObject({ title: "Unsaved dependency title", baseVersion: 3 });
}

async function testDisablesPendingControlsAndDisplaysRefusalWithoutReplacingDirtyFields() {
  const originalFetch = fetch;
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.endsWith("/dependencies")
    ? new Promise<Response>((resolve) => { finish = resolve; }) : originalFetch(path, init)));
  await mount(`${viewUrl}?card=${cardId}`);
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  const select = [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Prerequisite Card"))!.querySelector("select")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Retained title");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    select.value = state.snapshot.cards[0]!.id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => button("Add dependency").click());
  expect(button("Add dependency").disabled).toBe(true);
  expect(select.disabled).toBe(true);
  expect(document.querySelector('[role="dialog"] [role="status"]')!.textContent).toBe("Saving dependency…");
  await act(async () => finish!(Response.json({ code: "validation", message: "Dependency cycle: LSM-3 -> LSM-1 -> LSM-3" }, { status: 400 })));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] [role="alert"]')).not.toBeNull());
  expect(document.querySelector('[role="dialog"] [role="alert"]')!.textContent).toBe("Dependency cycle: LSM-3 -> LSM-1 -> LSM-3");
  expect(state.snapshot.cardDependencies).toEqual([]);
  expect(title.value).toBe("Retained title");
  expect(button("Add dependency").disabled).toBe(false);
}

async function testReloadsARestoredLowerDependencyBaselineWithoutReplacingDirtyTitleOr() {
  state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, version: 5 } : card);
  const originalFetch = fetch;
  const versions: number[] = [];
  const prerequisite = state.snapshot.cards[0]!;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (!path.endsWith("/dependencies")) return originalFetch(path, init);
    const input = JSON.parse(String(init?.body)) as { baseVersion: number };
    versions.push(input.baseVersion);
    if (versions.length === 1) state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, version: 2 } : card) };
    const current = state.snapshot.cards.find((card) => card.id === cardId)!;
    if (input.baseVersion !== current.version) return Response.json({ code: "conflict", message: "Restored", conflicts: [{ entity: "card", id: cardId, baseVersion: input.baseVersion, currentVersion: current.version, current }] }, { status: 409 });
    const saved = { ...current, version: current.version + 1 };
    const dependencies = [{ id: randomUUID(), cardId, prerequisiteCardId: prerequisite.id, createdAt: saved.createdAt }];
    state.snapshot = { ...state.snapshot, cardDependencies: dependencies, cards: state.snapshot.cards.map((card) => card.id === cardId ? saved : card) };
    return Response.json({ card: saved, dependencies });
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  const select = [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Prerequisite Card"))!.querySelector("select")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Dirty title across Restore");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    editor.commands.insertContent("Dirty Tiptap across Restore");
    select.value = prerequisite.id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => button("Add dependency").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] .conflict-alert')).not.toBeNull());
  await act(async () => document.querySelector<HTMLButtonElement>('[role="dialog"] .conflict-alert button')!.click());
  await vi.waitFor(() => {
    expect(state.client.getQueryData<{ cards: Array<{ id: string; version: number }> }>(["story-map", state.snapshot.storyMap.id])!.cards.find((card) => card.id === cardId)!.version).toBe(2);
    expect(document.querySelector('[role="dialog"] .conflict-alert')).toBeNull();
  });
  expect(title.value).toBe("Dirty title across Restore");
  expect(editor.storage.markdown.getMarkdown()).toContain("Dirty Tiptap across Restore");
  await act(async () => button("Add dependency").click());
  await vi.waitFor(() => expect(versions).toHaveLength(2));
  expect(versions).toEqual([5, 2]);
  await vi.waitFor(() => expect(state.snapshot.cardDependencies).toHaveLength(1));
  expect(title.value).toBe("Dirty title across Restore");
  expect(editor.storage.markdown.getMarkdown()).toContain("Dirty Tiptap across Restore");
}

async function testResolvesStaleDependencyConflictSeparatelyFromUnrelatedDirtyTitle() {
  const originalFetch = fetch;
  const versions: number[] = [];
  const prerequisite = state.snapshot.cards[0]!;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (!path.endsWith("/dependencies")) return originalFetch(path, init);
    const input = JSON.parse(String(init?.body)) as { baseVersion: number };
    versions.push(input.baseVersion);
    const current = { ...state.snapshot.cards.find((item) => item.id === cardId)!, version: 2 };
    if (versions.length === 1) return Response.json({ code: "conflict", message: "Changed", conflicts: [{ entity: "card", id: cardId, baseVersion: input.baseVersion, currentVersion: 2, current }] }, { status: 409 });
    const saved = { ...current, version: 3 };
    const dependencies = [{ id: randomUUID(), cardId, prerequisiteCardId: prerequisite.id, createdAt: saved.createdAt }];
    state.snapshot = { ...state.snapshot, cardDependencies: dependencies, cards: state.snapshot.cards.map((card) => card.id === cardId ? saved : card) };
    return Response.json({ card: saved, dependencies });
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  const title = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  const select = [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Prerequisite Card"))!.querySelector("select")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Unrelated draft");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    select.value = prerequisite.id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => button("Add dependency").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] .conflict-alert')).not.toBeNull());
  const keep = document.querySelector<HTMLButtonElement>('[role="dialog"] .conflict-alert button:last-child')!;
  await act(async () => keep.click());
  await vi.waitFor(() => expect(state.snapshot.cardDependencies).toHaveLength(1));
  expect(versions).toEqual([1, 2]);
  expect(title.value).toBe("Unrelated draft");
}
