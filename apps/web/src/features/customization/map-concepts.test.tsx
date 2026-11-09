// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { storyMapSchema, storyTemplateSchema } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { TemplatePicker } from "@storymapper/web/features/customization/TemplatePicker";
import { EpicContextPanel, MapConceptGuide } from "@storymapper/web/features/story-map";

let host: HTMLDivElement, root: Root, client: QueryClient;
const map = storyMapSchema.parse({ id: "00000000-0000-4000-8000-000000000001", projectId: "00000000-0000-4000-8000-000000000002", name: "Map", version: 5, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z" });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); notifyManager.setScheduler(queueMicrotask);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const click = async (name: string) => act(async () => { getByRole(document.body, "button", { name }).click(); });
async function choose(name: string, value: string) {
  await act(async () => { const select = getByRole(document.body, "combobox", { name }) as HTMLSelectElement; select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}

it("confirms replacing existing text and applies level descriptions separately from saved defaults", async () => {
  const onApply = vi.fn(), onApplyDescription = vi.fn();
  const saved = storyTemplateSchema.parse({ id: map.id, projectId: map.projectId, storyMapId: null, name: "My template", descriptionTemplate: "Saved text", defaultStatus: "active", defaultEstimate: 8, position: 0 });
  await act(async () => root.render(<TemplatePicker level="step" dirty templates={[saved]} onApply={onApply} onApplyDescription={onApplyDescription} />));
  await choose("Apply map-level description template", "step");
  expect(onApplyDescription).not.toHaveBeenCalled();
  await click("Cancel");
  expect(onApplyDescription).not.toHaveBeenCalled();
  await choose("Apply map-level description template", "activity");
  await click("Replace draft");
  expect(onApplyDescription).toHaveBeenCalledWith(expect.stringContaining("## User goal"));
  expect(onApply).not.toHaveBeenCalled();
  await choose("Apply template", saved.id);
  await click("Replace draft");
  expect(onApply).toHaveBeenCalledWith(saved);
});

it("keeps absent context out of the map and removes only context through a versioned save", async () => {
  const context = { title: "Outcome", goal: "Goal" };
  const save = vi.spyOn(api, "updateStoryMap").mockResolvedValue({ storyMap: map });
  const render = async (contextMap: typeof map, actionOnly = false) => act(async () => root.render(<QueryClientProvider client={client}><EpicContextPanel map={contextMap} disabled={false} actionOnly={actionOnly} /></QueryClientProvider>));
  await render(map);
  expect(host.textContent).toBe("");
  await render({ ...map, epicContext: context });
  const details = host.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details.querySelector("summary")?.textContent).toBe("Epic context: Outcome");
  await click("Edit Epic context");
  await click("Remove context");
  expect(save).toHaveBeenCalledWith(map.id, { epicContext: null }, map.version);
  expect(queryByRole(document.body, "dialog")).toBeNull();
  await render(map, true);
  await click("Add Epic context");
  expect((getByRole(document.body, "button", { name: "Save context" }) as HTMLButtonElement).disabled).toBe(true);
});

it("renders the bundled guide offline with its four concepts and primary source links", async () => {
  await act(async () => root.render(<MapConceptGuide />));
  await click("Map levels, planning types and GitHub Issues");
  expect(getByRole(document.body, "table").querySelectorAll("tbody tr")).toHaveLength(4);
  expect(getByRole(document.body, "link", { name: "Jeff Patton: User Story Mapping" }).getAttribute("href")).toBe("https://jpattonassociates.com/wp-content/uploads/2015/03/story_mapping.pdf");
});
