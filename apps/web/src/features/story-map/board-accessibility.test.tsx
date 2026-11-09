// @vitest-environment jsdom // REQ WCAG 2.1 AA desktop
import { randomUUID } from "node:crypto";
import { act } from "react";
import type { Editor } from "@tiptap/react";
import { auditAccessibility as audit } from "@storymapper/web/test/audit-accessibility";
import { fireEvent, getByRole, getAllByRole, within } from "@testing-library/dom";
import { beforeEach, expect, it, vi } from "vitest";
import { releaseSchema } from "@storymapper/contracts";
import { state, cardId, storyMapId, viewUrl, mount } from "@storymapper/web/test-fixtures/card-detail";

beforeEach(() => {
  const now = state.snapshot.storyMap.createdAt;
  const release = releaseSchema.parse({ id: randomUUID(), storyMapId, name: "Delivery", position: 0, version: 1, startDate: null, releaseDate: null, createdAt: now, updatedAt: now });
  const prerequisite = { ...state.snapshot.cards[2]!, id: randomUUID(), key: "LSM-4", title: "Review source", position: 1, releaseId: release.id };
  state.snapshot.releases.push(release);
  state.snapshot.cards[2]!.releaseId = release.id;
  state.snapshot.cards.push(prerequisite);
  state.snapshot.cardDependencies.push({ id: randomUUID(), cardId, prerequisiteCardId: prerequisite.id, createdAt: now });
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/story-maps/${storyMapId}/plan-states`
    ? Promise.resolve(Response.json({ states: [] })) : original(path, init)));
});

it.each(["discovery", "planning", "tracking", "tree", "backlog", "slices", "graph"])("audits actual %s controls and status with populated hierarchy", async (view) => {
  await mount(viewUrl.replace(/tree$/u, view));
  expect(getAllByRole(document.body, "button").length).toBeGreaterThan(3);
  expect(getAllByRole(document.body, "status").length).toBeGreaterThan(0);
  await audit();
  if (view === "graph") {
    await act(async () => fireEvent.click(getByRole(document.body, "button", { name: "Graph table" })));
    expect(getByRole(document.body, "table")).toBeDefined();
    await audit();
  }
});

it("audits the open Card and active dirty-close alertdialog including portal content", async () => {
  await mount(`${viewUrl}?card=${cardId}`);
  const dialog = getByRole(document.body, "dialog");
  expect(within(dialog).getByRole("textbox", { name: "Description" })).toBeDefined();
  await audit();
  const editor = document.querySelector<HTMLDivElement & { editor: Editor }>(".tiptap")!.editor;
  await act(async () => editor.commands.insertContent("Accessibility draft"));
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Close card detail" })));
  const confirmation = getByRole(document.body, "alertdialog");
  expect(within(confirmation).getByRole("button", { name: "Cancel" })).toBe(document.activeElement);
  await audit();
  await act(async () => fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" })));
  expect(getByRole(document.body, "dialog").contains(document.activeElement)).toBe(true);
  expect(editor.storage.markdown.getMarkdown()).toBe("Accessibility draft");
});

it("audits the equivalent Move controls and selected-set Delete confirmation", async () => {
  await mount(viewUrl.replace(/tree$/u, "discovery"));
  await act(async () => fireEvent.keyDown(document.querySelector<HTMLButtonElement>('button[data-card-id][aria-label^="LSM-3 "]')!, { key: "m" }));
  const move = getByRole(document.body, "dialog");
  expect(within(move).getByRole("combobox", { name: "Parent Card" })).toBeDefined();
  await audit();
  await act(async () => fireEvent.click(within(move).getByRole("button", { name: "Cancel" })));
  const checkbox = getByRole(document.body, "checkbox", { name: /LSM-3/ });
  await act(async () => fireEvent.click(checkbox));
  await act(async () => fireEvent.click(getByRole(document.body, "button", { name: "Delete selected Cards" })));
  const confirmation = getByRole(document.body, "alertdialog");
  await audit();
  await act(async () => fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" })));
  expect(document.activeElement).toBe(getByRole(document.body, "button", { name: "Delete selected Cards" }));
});
