// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { router } from "@storymapper/web/app/router";
import { state, projectId, storyMapId, cardId, viewUrl, button, mount } from "@storymapper/web/test-fixtures/card-detail";

function field(label: string): HTMLInputElement | HTMLSelectElement {
  const wrapper = [...document.querySelectorAll(".card-detail-modal label")].find((item) => item.firstChild?.textContent === label);
  expect(wrapper, label).toBeDefined();
  return wrapper!.querySelector<HTMLInputElement | HTMLSelectElement>("input, select")!;
}

async function enter(label: string, value: string) {
  const input = field(label);
  await act(async () => {
    const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

it("saves scalar fields, custom priority/color and zero in the map unit, then reloads supported clears", async () => {
  state.snapshot.storyMap.estimationUnit = "hours";
  const releaseId = randomUUID();
  state.snapshot.releases = [{ id: releaseId, storyMapId, version: 1, name: "Delivery", position: 0, released: false, goal: "", startDate: null, releaseDate: null }];
  state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, priority: "urgent", color: "#123456" } : card);
  await mount(`${viewUrl}?card=${cardId}`);
  expect(field("Priority").value).toBe("urgent");
  expect(document.querySelector(".detail-color-field")?.textContent).toContain("#123456");
  for (const [name, value] of [["Title", "Edited Card"], ["Status", "active"], ["Assignee", "Reader"], ["Estimate (hours)", "0"], ["Business value", "7"], ["Effort", "3"], ["Release", releaseId]]) await enter(name!, value!);
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(state.savedPatch).toMatchObject({ title: "Edited Card", status: "active", assignee: "Reader", estimate: 0, businessValue: 7, effort: 3, releaseId }));
  expect(state.savedPatch).not.toHaveProperty("color");
  expect(state.snapshot.cards.find((card) => card.id === cardId)).toMatchObject({ title: "Edited Card", status: "active", assignee: "Reader", estimate: 0, businessValue: 7, effort: 3, releaseId, priority: "urgent", color: "#123456" });
  await vi.waitFor(() => expect(button("Save").disabled).toBe(true));
  for (const label of ["Assignee", "Release", "Priority"]) await enter(label, "");
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(state.savedPatch).toMatchObject({ assignee: "", releaseId: null, priority: "" }));
  expect(state.savedPatch).not.toHaveProperty("estimate");
  expect(state.snapshot.cards.find((card) => card.id === cardId)).toMatchObject({ estimate: 0, color: "#123456", assignee: "", releaseId: null, priority: "" });
  await vi.waitFor(() => expect(button("Save").disabled).toBe(true));
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  await act(async () => { await router.navigate({ to: `${viewUrl}?card=${cardId}` }); });
  await vi.waitFor(() => expect(field("Estimate (hours)").value).toBe("0"));
  expect(field("Priority").value).toBe("");
  expect(field("Release").value).toBe("");
  expect(field("Assignee").value).toBe("");
  expect(document.querySelector(".detail-color-field")?.textContent).toContain("#123456");
  expect(field("Title").value).toBe("Edited Card");
  expect(field("Status").value).toBe("active");
  expect(field("Business value").value).toBe("7");
  expect(field("Effort").value).toBe("3");
});

it.each([
  ["Estimate (hours)", "", "cannot be cleared"],
  ["Business value", "", "cannot be cleared"],
  ["Effort", "", "cannot be cleared"],
  ["Estimate (hours)", "NaN", "finite number"],
  ["Estimate (hours)", "Infinity", "finite number"],
  ["Business value", "1.2", "whole number"],
  ["Effort", "1.2", "whole number"]
])("refuses unsupported numeric input %s=%s without discarding the draft", async (label, value, reason) => {
  state.snapshot.storyMap.estimationUnit = "hours";
  state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, estimate: 2, businessValue: 3, effort: 4 } : card);
  await mount(`${viewUrl}?card=${cardId}`);
  await enter(label!, value!);
  await act(async () => button("Save").click());
  expect(state.savedPatch).toBeUndefined();
  expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(reason);
  expect(field(label!).value).toBe(value);
  await enter(label!, "0");
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(state.savedPatch).toBeDefined());
  expect(document.querySelector('[role="dialog"] [role="alert"]')).toBeNull();
});

it("applies a saved template's Markdown, status and zero estimate through one explicit Save", async () => {
  state.snapshot.storyTemplates = [{ id: randomUUID(), projectId, storyMapId, name: "Zero template", descriptionTemplate: "## Acceptance\n\nRequired behavior", defaultStatus: "active", defaultEstimate: 0, position: 0 }];
  await mount(`${viewUrl}?card=${cardId}`);
  const template = document.querySelector<HTMLSelectElement>('[aria-label="Apply template"]')!;
  await act(async () => { template.value = state.snapshot.storyTemplates[0]!.id; template.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(state.savedPatch).toBeUndefined();
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(state.savedPatch).toMatchObject({ description: "## Acceptance\n\nRequired behavior", status: "active", estimate: 0 }));
});

it("does not write priority when the Card has none and it is left unchanged", async () => {
  await mount(`${viewUrl}?card=${cardId}`);
  await enter("Title", "Edited only title");
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(state.savedPatch).toMatchObject({ title: "Edited only title" }));
  expect(state.savedPatch).not.toHaveProperty("priority");
});

it("requires deliberate replacement before applying template defaults over a dirty Card draft", async () => {
  state.snapshot.storyTemplates = [{ id: randomUUID(), projectId, storyMapId, name: "Replacement", descriptionTemplate: "Template text", defaultStatus: "done", defaultEstimate: 0, position: 0 }];
  await mount(`${viewUrl}?card=${cardId}`);
  await enter("Title", "Unsaved title");
  const select = document.querySelector<HTMLSelectElement>('[aria-label="Apply template"]')!;
  const choose = async () => { await act(async () => { select.value = state.snapshot.storyTemplates[0]!.id; select.dispatchEvent(new Event("change", { bubbles: true })); }); };
  await choose();
  expect(document.body.textContent).toContain("Replace draft with template?");
  await act(async () => button("Cancel").click());
  expect(state.savedPatch).toBeUndefined();
  expect(field("Title").value).toBe("Unsaved title");
  await choose(); await act(async () => button("Replace draft").click());
  expect(field("Title").value).toBe("Unsaved title");
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(state.savedPatch).toMatchObject({ title: "Unsaved title", description: "Template text", status: "done", estimate: 0 }));
});


it("renders one map-wide Epic context disclosure outside the view action toolbar", async () => {
  state.snapshot.storyMap.epicContext = { title: "Shared goal", goal: "Frame the complete map" };
  await mount(viewUrl);
  const contexts = document.querySelectorAll('details[aria-label="Epic context"]');
  expect(contexts).toHaveLength(1);
  expect(contexts[0]!.closest(".view-toolbar-actions")).toBeNull();
  expect(contexts[0]!.querySelector("summary")?.textContent).toBe("Epic context: Shared goal");
});

it("saves only the neutral description and prior saved defaults while retaining independent Card fields", async () => {
  const original = state.snapshot.cards.find((card) => card.id === cardId)!;
  const releaseId = randomUUID();
  state.snapshot.releases = [{ id: releaseId, storyMapId, version: 1, name: "Delivery", goal: "", position: 0, released: false, startDate: null, releaseDate: null }];
  Object.assign(original, { cardType: "bug", releaseId, position: 7 });
  const before = { ...original };
  const saved = { id: randomUUID(), projectId, storyMapId, name: "Saved defaults", descriptionTemplate: "Seed description", defaultStatus: "active", defaultEstimate: 3, position: 0 };
  state.snapshot.storyTemplates = [saved];
  await mount(`${viewUrl}?card=${cardId}`);
  const choose = async (label: string, value: string) => act(async () => { const picker = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!; picker.value = value; picker.dispatchEvent(new Event("change", { bubbles: true })); });
  await choose("Apply template", saved.id);
  await choose("Apply map-level description template", "step"); await act(async () => button("Cancel").click());
  expect(document.querySelector(".tiptap")?.textContent).toBe("Seed description");
  await choose("Apply map-level description template", "step"); await act(async () => button("Replace draft").click());
  expect(state.savedPatch).toBeUndefined();
  await act(async () => button("Save").click());
  await vi.waitFor(() => expect(state.savedPatch).toBeDefined());
  expect(state.savedPatch).toEqual({ description: "## User action\n\n\n## Context in the journey\n\n\n## Observable result\n\n", status: "active", estimate: 3, baseVersion: before.version });
  expect(state.snapshot.cards.find((card) => card.id === cardId)).toMatchObject({ level: before.level, cardType: "bug", parentId: before.parentId, releaseId, position: 7, title: before.title });
});
