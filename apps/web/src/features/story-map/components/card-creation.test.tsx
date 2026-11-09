// @vitest-environment jsdom // REQ persisted card creation
import { randomUUID } from "node:crypto";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { cardSchema, type CardLevel, type CreateCardRequest } from "@storymapper/contracts";
import { button, mount, state, projectId, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

async function field(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
const dialog = () => document.querySelector('[role="dialog"]')!;
const openComposer = (level: CardLevel) => document.querySelector<HTMLButtonElement>(`[aria-label^="${{ activity: "New activity", step: "New step for ", story: "New story for ", note: "Add Note to " }[level]}"]`)!.click();
const input = (label: string) => [...dialog().querySelectorAll("label")].find((element) => element.textContent?.startsWith(label))!.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")!;

it.each<[CardLevel, "root" | "activity" | "step"]>([["activity", "root"], ["step", "root"], ["step", "activity"], ["story", "root"], ["story", "step"], ["note", "root"], ["note", "activity"], ["note", "step"]])("creates %s under %s atomically with actual title, placement and Release and retains it after refetch", async (level, parent) => {
  const parentId = parent === "root" ? null : state.snapshot.cards.find((card) => card.level === parent)!.id;
  const releaseId = randomUUID();
  state.snapshot.releases.push({ id: releaseId, version: 1, storyMapId, name: "Delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false });
  const original = vi.mocked(fetch).getMockImplementation()!;
  const writes: CreateCardRequest[] = [];
  let createdId = "";
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path !== "/api/cards" || init?.method !== "POST") return original(path, init);
    const request = JSON.parse(String(init.body)) as CreateCardRequest;
    writes.push(request); createdId = randomUUID();
    const now = new Date().toISOString();
    const card = cardSchema.parse({ ...request, creationOrigin: "manual", provenance: "manual", id: createdId, key: "LSM-4", version: 1, createdAt: now, updatedAt: now });
    state.snapshot.cards.push(card);
    return new Response(JSON.stringify(card), { headers: { "content-type": "application/json" } });
  });
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => openComposer(level));
  await field(input("Title"), `Actual ${level} title`);
  if (level !== "activity") await field(input("Parent"), parentId ?? "");
  await field(input("Release"), releaseId);
  await field(input("Position"), "0");
  await act(async () => button("Create Card").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(writes).toEqual([{ storyMapId, level, title: `Actual ${level} title`, parentId, releaseId, position: 0 }]);
  const rendered = document.querySelector(`[data-live-card-id="${createdId}"]`)!;
  expect(rendered).not.toBeNull(); expect(rendered.closest("[hidden]")).toBeNull();
  await act(async () => state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }));
  expect(document.querySelector(`[data-live-card-id="${createdId}"]`)!.textContent).toContain(`Actual ${level} title`);
});

it("retains a failed Card draft and displays the authoritative refusal without any partial Card", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, init) => path === "/api/cards" ? new Response(JSON.stringify({ message: "Hierarchy changed; choose another parent." }), { status: 409, headers: { "content-type": "application/json" } }) : original(path, init));
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => openComposer("note"));
  await field(input("Title"), "Retained draft");
  await act(async () => button("Create Card").click());
  await vi.waitFor(() => expect(dialog().textContent).toContain("Hierarchy changed; choose another parent."));
  expect(input("Title").value).toBe("Retained draft"); expect(state.snapshot.cards).toHaveLength(3);
});

it("shows root Notes without any Activity and uses zero hours on Discovery and Tree without effort substitution", async () => {
  const card = state.snapshot.cards[2]!;
  state.snapshot.storyMap.estimationUnit = "hours";
  state.snapshot.cards = [{ ...card, parentId: null, level: "note", estimate: 0, effort: 8 }];
  await mount(viewUrl.replace(/tree$/, "discovery"));
  expect(document.querySelector(`[data-live-card-id="${card.id}"]`)!.textContent).toContain("0 hours");
  expect(document.querySelector('.discovery-matrix-scroll')!.hasAttribute("hidden")).toBe(false);
});

it.each(["step", "story"] as const)("retains contextual %s default parent, Release and append position with title entry alone", async (level) => {
  const parent = state.snapshot.cards.find((card) => card.level === (level === "step" ? "activity" : "step"))!;
  const releaseId = level === "story" ? randomUUID() : null;
  if (releaseId) {
    state.snapshot.releases.push({ id: releaseId, version: 1, storyMapId, name: "Named Delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false });
    state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, releaseId, position: 6 };
  }
  state.snapshot.cards.push({ ...state.snapshot.cards[2]!, id: randomUUID(), key: "LSM-5", parentId: parent.id, level: "note", releaseId: null, title: "Existing sibling Note" });
  if (level === "story") state.snapshot.cards.push({ ...state.snapshot.cards[2]!, id: randomUUID(), key: "LSM-6", releaseId: null, title: "Other Release sibling" });
  const expectedPosition = level === "story" ? 7 : 1;
  const original = vi.mocked(fetch).getMockImplementation()!;
  const writes: CreateCardRequest[] = [];
  const id = randomUUID();
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path !== "/api/cards") return original(path, init);
    const request = JSON.parse(String(init?.body)) as CreateCardRequest; writes.push(request);
    const card = cardSchema.parse({ ...state.snapshot.cards[2]!, ...request, id, key: "LSM-4" });
    state.snapshot.cards.push(card);
    return new Response(JSON.stringify(card), { headers: { "content-type": "application/json" } });
  });
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const label = level === "step" ? `New step for ${parent.title}` : `New story for ${parent.title} in Named Delivery`;
  await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
  await field(input("Title"), `Contextual ${level}`);
  await act(async () => button("Create Card").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(writes).toEqual([{ storyMapId, parentId: parent.id, releaseId, level, title: `Contextual ${level}`, position: expectedPosition }]);
  const card = document.querySelector(`[data-live-card-id="${id}"]`)!;
  expect(card.textContent).toContain(`Contextual ${level}`); expect(card.closest("[hidden]")).toBeNull();
});

it("disables all draft fields during delayed creation until the submitted values are accepted", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let finish!: (response: Response) => void;
  let submitted!: CreateCardRequest;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path !== "/api/cards") return original(path, init);
    submitted = JSON.parse(String(init?.body)) as CreateCardRequest;
    return new Promise<Response>((resolve) => { finish = resolve; });
  });
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => openComposer("note"));
  await field(input("Title"), "Submitted draft");
  await act(async () => button("Create Card").click());
  for (const control of dialog().querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) expect(control.disabled).toBe(true);
  expect(button("Creating Card…").disabled).toBe(true); expect(input("Title").value).toBe("Submitted draft");
  await act(async () => {
    const card = cardSchema.parse({ ...state.snapshot.cards[2]!, ...submitted, id: randomUUID(), key: "LSM-4" });
    state.snapshot.cards.push(card);
    finish(new Response(JSON.stringify(card), { headers: { "content-type": "application/json" } }));
  });
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(state.snapshot.cards.at(-1)!.title).toBe("Submitted draft");
});

it("renders Activity child Note integration metadata and opens its lifecycle deletion action", async () => {
  const activityId = state.snapshot.cards[0]!.id;
  const story = state.snapshot.cards[2]!;
  const note = { ...story, id: randomUUID(), key: "LSM-4", level: "note" as const, parentId: activityId, title: "Activity evidence" };
  state.snapshot.cards.push(note);
  state.snapshot.externalRefs.push({ id: randomUUID(), entityType: "card", entityId: note.id, system: "bmad", externalId: "6.2-note", scopeId: storyMapId, syncedVersion: 1, createdAt: story.createdAt });
  state.snapshot.cardDependencies.push({ id: randomUUID(), cardId: note.id, prerequisiteCardId: story.id, createdAt: story.createdAt });
  state.snapshot.githubLinks.push({ id: randomUUID(), cardId: note.id, repo: "example/project", issueNumber: 42, url: "https://github.com/example/project/issues/42", syncState: "conflict" });
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, init) => path === `/api/story-maps/${state.otherMapId}` ? new Response(JSON.stringify({ ...state.snapshot, storyMap: { ...state.snapshot.storyMap, id: state.otherMapId }, cards: [], sourceLinks: [] }), { headers: { "content-type": "application/json" } }) : original(path, init));
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const noteTile = document.querySelector(`[data-live-card-id="${note.id}"]`)!;
  expect(noteTile.querySelector("button[data-card-id]")!.getAttribute("aria-description")).toContain(`Depends on (1): ${story.key}`);
  expect(noteTile.querySelector("button[data-card-id]")!.getAttribute("aria-description")).toContain("conflict");
  expect(noteTile.textContent).not.toContain("bmad:6.2-note"); expect(noteTile.textContent).toContain(`Depends on (1): ${story.key}`);
  expect(noteTile.querySelector('.card-provider-icon')!.getAttribute("title")).toContain("GitHub #42");
  expect(noteTile.querySelector('.card-provider-icon')!.getAttribute("title")).toContain("conflict");
  await act(async () => noteTile.querySelector<HTMLButtonElement>('[aria-label="Delete Activity evidence"]')!.click());
  expect(document.querySelector('[role="alertdialog"]')!.textContent).toContain("Delete 1 Card");
});

it("recomputes the append position when the Release changes in the Story composer", async () => {
  const step = state.snapshot.cards.find((card) => card.level === "step")!;
  const releaseId = randomUUID();
  state.snapshot.releases.push({ id: releaseId, version: 1, storyMapId, name: "Delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false });
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, parentId: step.id, releaseId, position: 6 };
  state.snapshot.cards.push({ ...state.snapshot.cards[2]!, id: randomUUID(), key: "LSM-8", releaseId: null, position: 3 });
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => openComposer("story"));
  await field(input("Release"), "");
  await field(input("Parent"), step.id);
  expect(input("Position").value).toBe("4");
  await field(input("Release"), releaseId);
  expect(input("Position").value).toBe("7");
  await field(input("Release"), "");
  expect(input("Position").value).toBe("4");
});

it("copies saved template Markdown, status and zero estimate into the atomic Card create request", async () => {
  const templateId = randomUUID();
  state.snapshot.storyTemplates = [{ id: templateId, projectId, storyMapId: null, name: "Creation template", descriptionTemplate: "## Scope\n\nCopy this", defaultStatus: "active", defaultEstimate: 0, position: 0 }];
  const original = vi.mocked(fetch).getMockImplementation()!;
  let request: CreateCardRequest | undefined;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path !== "/api/cards" || init?.method !== "POST") return original(path, init);
    request = JSON.parse(String(init.body)) as CreateCardRequest;
    const now = new Date().toISOString();
    const card = cardSchema.parse({ ...request, creationOrigin: "manual", provenance: "manual", id: randomUUID(), key: "LSM-4", version: 1, createdAt: now, updatedAt: now });
    state.snapshot.cards.push(card);
    return Response.json(card);
  });
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => openComposer("story"));
  await field(input("Title"), "Template Card");
  await field(document.querySelector<HTMLSelectElement>('[aria-label="Apply template"]')!, templateId);
  expect(dialog().querySelector("textarea")!.value).toBe("## Scope\n\nCopy this");
  await act(async () => button("Create Card").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(request).toMatchObject({ title: "Template Card", description: "## Scope\n\nCopy this", status: "active", estimate: 0 });
  state.snapshot.storyTemplates = [];
  await act(async () => state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }));
  expect(state.snapshot.cards.at(-1)).toMatchObject({ description: "## Scope\n\nCopy this", status: "active", estimate: 0 });
});

it("keeps authored composer text and defaults on template Cancel and replaces them only deliberately", async () => {
  const first = { id: randomUUID(), projectId, storyMapId: null, name: "First", descriptionTemplate: "First text", defaultStatus: "active", defaultEstimate: 3, position: 0 };
  const second = { ...first, id: randomUUID(), name: "Second", descriptionTemplate: "Second text", defaultStatus: "done", defaultEstimate: 0 };
  state.snapshot.storyTemplates = [first, second];
  const original = vi.mocked(fetch).getMockImplementation()!;
  let request: CreateCardRequest | undefined;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path !== "/api/cards" || init?.method !== "POST") return original(path, init);
    request = JSON.parse(String(init.body)) as CreateCardRequest;
    const now = new Date().toISOString();
    return Response.json(cardSchema.parse({ ...request, creationOrigin: "manual", provenance: "manual", id: randomUUID(), key: "LSM-4", version: 1, createdAt: now, updatedAt: now }));
  });
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => openComposer("story"));
  await field(input("Title"), "Authored Card");
  const picker = document.querySelector<HTMLSelectElement>('[aria-label="Apply template"]')!;
  await field(picker, first.id);
  const description = document.querySelector<HTMLTextAreaElement>('[role=dialog] textarea')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(description, "Authored text"); description.dispatchEvent(new Event("input", { bubbles: true })); });
  await field(picker, second.id);
  await act(async () => button("Cancel").click());
  expect(description.value).toBe("Authored text");
  expect(request).toBeUndefined();
  await field(picker, second.id);
  await act(async () => button("Replace draft").click());
  expect(description.value).toBe("Second text");
  await act(async () => button("Create Card").click());
  await vi.waitFor(() => expect(request).toBeDefined());
  expect(request).toMatchObject({ title: "Authored Card", description: "Second text", status: "done", estimate: 0 });
});

it.each(["discovery", "tree"])("keeps guided %s creation pending until its canonical snapshot arrives", async (view) => {
  const activity = state.snapshot.cards[0]!;
  state.snapshot = { ...state.snapshot, cards: [] };
  const original = vi.mocked(fetch).getMockImplementation()!;
  let refetchPending = false;
  let finishRefetch: (() => void) | undefined;
  const writes: CreateCardRequest[] = [];
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path === "/api/cards" && init?.method === "POST") {
      const request = JSON.parse(String(init.body)) as CreateCardRequest;
      writes.push(request);
      const card = cardSchema.parse({ ...activity, ...request });
      state.snapshot = { ...state.snapshot, cards: [card] };
      refetchPending = true;
      return Response.json(card);
    }
    if (path === `/api/story-maps/${storyMapId}` && refetchPending) await new Promise<void>((resolve) => { finishRefetch = resolve; });
    return original(path, init);
  });
  await mount(viewUrl.replace(/tree$/, view), "Discovery");
  const help = document.querySelector<HTMLButtonElement>('[aria-label="Story Map help"]')!;
  await act(async () => help.click());
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  await act(async () => button("Create your first Activity").click());
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  await field(input("Title"), activity.title);
  await act(async () => button("Create Card").click());
  await vi.waitFor(() => expect(finishRefetch).toBeDefined());
  expect(button("Creating Card…").disabled).toBe(true);
  expect(input("Title").disabled).toBe(true);
  await act(async () => {
    dialog().querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(writes).toHaveLength(1);
  expect(dialog()).not.toBeNull();
  expect(state.host.textContent).not.toContain("Create a Step in your Activity");
  await act(async () => { refetchPending = false; finishRefetch!(); });
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  await act(async () => help.click());
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(button("Create a Step in your Activity").disabled).toBe(false);
  expect(state.client.getQueryData(["story-map", storyMapId])).toMatchObject({ cards: [{ id: activity.id, title: activity.title }] });
});

it("submits a neutral description without changing saved defaults or the authored type and placement", async () => {
  const saved = { id: randomUUID(), projectId, storyMapId, name: "Saved defaults", descriptionTemplate: "Seed description", defaultStatus: "active", defaultEstimate: 3, position: 0 };
  state.snapshot.storyTemplates = [saved];
  const parentId = state.snapshot.cards.find((card) => card.level === "step")!.id, releaseId = randomUUID();
  state.snapshot.releases.push({ id: releaseId, storyMapId, version: 1, name: "Delivery", goal: "", position: 0, released: false, startDate: null, releaseDate: null });
  const original = vi.mocked(fetch).getMockImplementation()!;
  let request: CreateCardRequest | undefined;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path !== "/api/cards" || init?.method !== "POST") return original(path, init);
    request = JSON.parse(String(init.body)) as CreateCardRequest;
    const now = new Date().toISOString();
    const card = cardSchema.parse({ ...request, creationOrigin: "manual", provenance: "manual", id: randomUUID(), key: "LSM-4", version: 1, createdAt: now, updatedAt: now });
    state.snapshot.cards.push(card); return Response.json(card);
  });
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => openComposer("story"));
  await field(input("Title"), "Authored story"); await field(input("Planning type"), "bug");
  await field(input("Parent"), parentId); await field(input("Release"), releaseId); await field(input("Position"), "7");
  await field(document.querySelector<HTMLSelectElement>('[aria-label="Apply template"]')!, saved.id);
  const neutral = document.querySelector<HTMLSelectElement>('[aria-label="Apply map-level description template"]')!;
  await field(neutral, "activity"); await act(async () => button("Cancel").click());
  expect(document.querySelector<HTMLTextAreaElement>('[role=dialog] textarea')!.value).toBe("Seed description");
  await field(neutral, "activity"); await act(async () => button("Replace draft").click());
  expect(request).toBeUndefined();
  await act(async () => button("Create Card").click());
  await vi.waitFor(() => expect(request).toBeDefined());
  expect(request).toEqual({ storyMapId, level: "story", cardType: "bug", title: "Authored story", parentId, releaseId, position: 7, status: "active", estimate: 3, description: "## User goal\n\n\n## Scope and boundaries\n\n\n## Observable outcome\n\n" });
});
