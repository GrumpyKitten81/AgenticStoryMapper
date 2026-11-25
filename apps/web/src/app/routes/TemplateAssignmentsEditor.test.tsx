// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { storyMapSchema, storyTemplateSchema, type StoryMap, type StoryTemplate } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { TemplateAssignmentsEditor } from "@storymapper/web/app/routes/TemplateAssignmentsEditor";

vi.mock("@storymapper/web/app/api", () => ({ api: { updateStoryMap: vi.fn() } }));
let map: StoryMap;
let template: StoryTemplate;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const render = (readOnly = false) => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(TemplateAssignmentsEditor, { storyMap: map, templates: [template], readOnly }))));
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => (item.getAttribute("aria-label") ?? item.textContent) === label)!;
const click = (label: string) => act(async () => button(label).click());
const select = (cardType: string) => {
  const label = [...document.querySelectorAll<HTMLLabelElement>('[role="dialog"] label')].find((element) => element.textContent?.startsWith(cardType))!;
  return label.querySelector("select")!;
};
const choose = (cardType: string, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select(cardType), value);
  select(cardType).dispatchEvent(new Event("change", { bubbles: true }));
});
const submit = () => act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

beforeEach(() => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const now = new Date().toISOString();
  const projectId = randomUUID();
  map = storyMapSchema.parse({ id: randomUUID(), projectId, name: "Map", version: 1, createdAt: now, updatedAt: now });
  template = storyTemplateSchema.parse({ id: randomUUID(), projectId, storyMapId: null, name: "Story skeleton", descriptionTemplate: "## Value", defaultEstimate: null, position: 0 });
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(api.updateStoryMap).mockResolvedValue(undefined as never);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.clearAllMocks();
});

it("saves one Story Template per Card type through the versioned map update", async () => {
  await render();
  await click("Edit Story Template assignments");
  expect(document.querySelectorAll('[role="dialog"] select')).toHaveLength(7);
  await choose("Bug", template.id);
  await submit();
  await vi.waitFor(() => expect(api.updateStoryMap).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.updateStoryMap).mock.calls[0]).toEqual([map.id, { templateAssignments: [{ cardType: "bug", storyTemplateId: template.id }] }, 1]);
});

it("prefers the current assignments, submits an empty list to clear them and keeps unset Card types unassigned", async () => {
  map = storyMapSchema.parse({ ...map, templateAssignments: [{ cardType: "story", storyTemplateId: template.id }] });
  await render();
  await click("Edit Story Template assignments");
  expect(select("User Story").value).toBe(template.id);
  await choose("User Story", "");
  await submit();
  await vi.waitFor(() => expect(api.updateStoryMap).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.updateStoryMap).mock.calls[0]).toEqual([map.id, { templateAssignments: [] }, 1]);
});

it("offers only map-scoped and shared templates and keeps the trigger read-only", async () => {
  const foreign = storyTemplateSchema.parse({ ...template, id: randomUUID(), storyMapId: randomUUID(), name: "Other map" });
  const own = storyTemplateSchema.parse({ ...template, id: randomUUID(), storyMapId: map.id, name: "Map template" });
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(TemplateAssignmentsEditor, { storyMap: map, templates: [template, foreign, own] }))));
  await click("Edit Story Template assignments");
  const optionTexts = [...document.querySelectorAll<HTMLSelectElement>('[role="dialog"] select')].flatMap((element) => [...element.options].map((option) => option.textContent));
  expect(optionTexts).toContain("Story skeleton");
  expect(optionTexts).toContain("Map template");
  expect(optionTexts).not.toContain("Other map");
  await act(async () => root.unmount());
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await render(true);
  expect(button("Edit Story Template assignments").disabled).toBe(true);
});
