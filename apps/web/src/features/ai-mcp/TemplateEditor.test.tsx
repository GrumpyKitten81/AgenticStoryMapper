// @vitest-environment jsdom // REQ persisted template CRUD is exposed through the human editor.
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiFunctionTemplateSchema, type AiFunctionTemplate } from "@storymapper/contracts";
import { defaultAiFunctionTemplates } from "@storymapper/core";
import { panelStrings } from "@storymapper/ui-strings";
import { api, useAiFunctionTemplates } from "@storymapper/web/app/api";
import { TemplateEditor } from "@storymapper/web/features/ai-mcp/TemplateEditor";

const features = vi.hoisted(() => ({ personas: true }));
vi.mock("@storymapper/web/app/feature-flags", async (original) => ({
  ...await original<typeof import("@storymapper/web/app/feature-flags")>(),
  get isPersonasEnabled() { return features.personas; }
}));

vi.mock("@storymapper/web/app/api", async (original) => ({ ...await original<typeof import("@storymapper/web/app/api")>(), api: { createAiTemplate: vi.fn(), updateAiTemplate: vi.fn(), deleteAiTemplate: vi.fn() } }));

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let template: AiFunctionTemplate;

beforeEach(() => {
  features.personas = true;
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  template = { ...defaultAiFunctionTemplates[0]!, projectId: randomUUID() };
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

async function render(templates: AiFunctionTemplate[] = [template]) {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(TemplateEditor, { projectId: template.projectId, templates }))));
}
async function click(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find((element) => element.textContent === text)!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}
function field(label: string): HTMLInputElement | HTMLTextAreaElement {
  return Array.from(host.querySelectorAll("label")).find((element) => element.firstChild?.textContent === label)!.querySelector("input,textarea")!;
}
async function type(label: string, value: string) {
  const input = field(label);
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("function template editor", () => {
  it("creates, edits argument declarations and deletes a Project-owned template through the public API", async () => {
    vi.mocked(api.createAiTemplate).mockResolvedValue({ template });
    vi.mocked(api.updateAiTemplate).mockResolvedValue({ template });
    vi.mocked(api.deleteAiTemplate).mockResolvedValue({ deleted: true });
    await render([]);
    await type(panelStrings.templateId, template.id);
    await type(panelStrings.templateName, template.name);
    await type(panelStrings.templateInstructions, template.instructions);
    await click(panelStrings.saveTemplate);
    expect(api.createAiTemplate).toHaveBeenCalledWith(template);
    await render();
    await click(template.name);
    expect(field(panelStrings.templateId).disabled).toBe(true);
    await click(panelStrings.addArgument);
    await type(panelStrings.argumentName, "sourceDocumentId");
    await type(panelStrings.argumentDescription, panelStrings.sourceDocument);
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await click(panelStrings.saveTemplate);
    expect(api.updateAiTemplate).toHaveBeenCalledWith(template.projectId, template.id, expect.objectContaining({ arguments: [{ name: "sourceDocumentId", description: panelStrings.sourceDocument, required: true }] }));
    await click(panelStrings.deleteTemplate);
    expect(api.deleteAiTemplate).toHaveBeenCalledWith(template.projectId, template.id);
    expect(field(panelStrings.templateName).value).toBe("");
    expect(field(panelStrings.templateId).disabled).toBe(false);
  });

  it("keeps drafts after failed saves and text entered while saving", async () => {
    vi.mocked(api.updateAiTemplate).mockRejectedValueOnce(new Error("Save failed"));
    await render(); await click(template.name);
    await type(panelStrings.templateInstructions, template.instructions + "\n" + panelStrings.productContext);
    await click(panelStrings.saveTemplate);
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe("Save failed"));
    expect(field(panelStrings.templateInstructions).value).toContain(panelStrings.productContext);
    let resolve!: (result: { template: AiFunctionTemplate }) => void;
    vi.mocked(api.updateAiTemplate).mockImplementation(() => new Promise((done) => { resolve = done; }));
    await click(panelStrings.saveTemplate);
    await type(panelStrings.templateInstructions, template.instructions + "\n" + panelStrings.keyFeatures);
    await act(async () => resolve({ template }));
    expect(field(panelStrings.templateInstructions).value).toContain(panelStrings.keyFeatures);
  });
});

it("refreshes query-backed names after local create, rename and deletion and edits all guidance", async () => {
  let stored: AiFunctionTemplate[] = [];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ templates: stored }), { headers: { "Content-Type": "application/json" } })));
  vi.mocked(api.createAiTemplate).mockImplementation(async (input) => { const created = { ...input }; stored = [created]; return { template: created }; });
  vi.mocked(api.updateAiTemplate).mockImplementation(async (_projectId, _id, patch) => {
    const updated = aiFunctionTemplateSchema.parse({ ...stored[0]!, ...patch, outputSchemaName: patch.outputSchemaName ?? undefined });
    stored = [updated]; return { template: updated };
  });
  vi.mocked(api.deleteAiTemplate).mockImplementation(async () => { stored = []; return { deleted: true }; });
  function QueriedEditor() {
    const query = useAiFunctionTemplates(template.projectId);
    return createElement(TemplateEditor, { projectId: template.projectId, templates: query.data?.templates ?? [] });
  }
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(QueriedEditor))));
  await type(panelStrings.templateId, template.id);
  await type(panelStrings.templateName, "Created prompt");
  await type(panelStrings.templateInstructions, template.instructions);
  await type(panelStrings.templateOutputSchema, "ChangeSet");
  await click(panelStrings.addExample);
  await type(panelStrings.templateExample, 'Quoted "example"\nsecond line');
  await click(panelStrings.saveTemplate);
  await vi.waitFor(() => expect(host.querySelector(".tool-list")?.textContent).toBe("Created prompt"));
  await click("Created prompt");
  expect(field(panelStrings.templateExample).value).toBe('Quoted "example"\nsecond line');
  await type(panelStrings.templateName, "Renamed prompt");
  await type(panelStrings.templateOutputSchema, "");
  await click(panelStrings.saveTemplate);
  expect(api.updateAiTemplate).toHaveBeenCalledWith(template.projectId, template.id, expect.objectContaining({ outputSchemaName: null }));
  await vi.waitFor(() => expect(host.querySelector(".tool-list")?.textContent).toBe("Renamed prompt"));
  await click(panelStrings.deleteTemplate);
  await vi.waitFor(() => expect(host.querySelector(".tool-list")?.textContent).toBe(""));
});

it("resets unrelated mutation errors and disables every editor field during deletion", async () => {
  vi.mocked(api.deleteAiTemplate).mockRejectedValueOnce(new Error("Delete failed"));
  await render(); await click(template.name);
  await click(panelStrings.deleteTemplate);
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Delete failed");
  await click(panelStrings.newTemplate);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await click(template.name);
  let resolve!: (value: { deleted: boolean }) => void;
  vi.mocked(api.deleteAiTemplate).mockImplementation(() => new Promise((done) => { resolve = done; }));
  await click(panelStrings.addArgument); await click(panelStrings.addExample);
  await click(panelStrings.deleteTemplate);
  for (const input of host.querySelectorAll("input,textarea,fieldset")) expect(input.matches(":disabled")).toBe(true);
  await act(async () => resolve({ deleted: true }));
  expect(field(panelStrings.templateName).value).toBe("");
});

it("retains edits made during creation and subsequently updates the created ID", async () => {
  let resolve!: (result: { template: AiFunctionTemplate }) => void;
  vi.mocked(api.createAiTemplate).mockImplementation(() => new Promise((done) => { resolve = done; }));
  vi.mocked(api.updateAiTemplate).mockResolvedValue({ template });
  await render([]);
  await type(panelStrings.templateId, template.id);
  await type(panelStrings.templateName, template.name);
  await type(panelStrings.templateInstructions, template.instructions);
  await click(panelStrings.saveTemplate);
  await type(panelStrings.templateInstructions, "Later instructions");
  await click(panelStrings.addArgument);
  await type(panelStrings.argumentName, "evidence");
  await type(panelStrings.argumentDescription, "Later source");
  await click(panelStrings.addExample);
  await type(panelStrings.templateExample, "Later example");
  await type(panelStrings.templateOutputSchema, "Later schema");
  await act(async () => resolve({ template }));
  expect(field(panelStrings.templateInstructions).value).toBe("Later instructions");
  expect(field(panelStrings.argumentName).value).toBe("evidence");
  expect(field(panelStrings.templateExample).value).toBe("Later example");
  expect(field(panelStrings.templateOutputSchema).value).toBe("Later schema");
  expect(field(panelStrings.templateId).disabled).toBe(true);
  await click(panelStrings.saveTemplate);
  expect(api.createAiTemplate).toHaveBeenCalledTimes(1);
  expect(api.updateAiTemplate).toHaveBeenCalledWith(template.projectId, template.id, {
    name: template.name, instructions: "Later instructions", arguments: [{ name: "evidence", description: "Later source", required: false }],
    examples: ["Later example"], outputSchemaName: "Later schema"
  });
});

it("distinguishes duplicate template names by their existing ID titles", async () => {
  const other = { ...template, id: "same-name-other", instructions: "Other instructions" };
  await render([template, other]);
  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>(".tool-list button"));
  expect(buttons.map((button) => button.textContent)).toEqual([template.name, template.name]);
  expect(buttons.map((button) => button.title)).toEqual([template.id, other.id]);
  await act(async () => buttons[1]!.click());
  expect(field(panelStrings.templateInstructions).value).toBe(other.instructions);
});

it("uses shared field spacing and separates draft actions by purpose", async () => {
  await render();
  await click(template.name);
  await click(panelStrings.addArgument);
  await click(panelStrings.addExample);
  expect([...host.querySelectorAll("fieldset")].every((field) => field.classList.contains("form-stack"))).toBe(true);
  for (const name of [panelStrings.newTemplate, panelStrings.addArgument, panelStrings.addExample]) {
    expect([...host.querySelectorAll("button")].find((button) => button.textContent === name)?.classList.contains("secondary")).toBe(true);
  }
  for (const name of [panelStrings.removeArgument, panelStrings.removeExample, panelStrings.deleteTemplate]) {
    expect([...host.querySelectorAll("button")].find((button) => button.textContent === name)?.classList.contains("danger")).toBe(true);
  }
  expect([...host.querySelectorAll(".button-row button")].map((button) => button.textContent)).toEqual([panelStrings.saveTemplate, panelStrings.deleteTemplate]);
});

it("hides the built-in Persona template and prevents restoring it through a typed reserved ID", async () => {
  features.personas = false;
  const personaTemplate = defaultAiFunctionTemplates.find((item) => item.id === "personas")!;
  await render([template, { ...personaTemplate, projectId: template.projectId }]);
  expect(host.querySelector(".tool-list")?.textContent).not.toContain(personaTemplate.name);
  expect(host.querySelector(".tool-list")?.textContent).toContain(template.name);
  await type(panelStrings.templateId, "personas");
  await type(panelStrings.templateName, template.name);
  await type(panelStrings.templateInstructions, template.instructions);
  const save = [...host.querySelectorAll("button")].find((item) => item.textContent === panelStrings.saveTemplate)!;
  expect(save.disabled).toBe(true);
  await act(async () => save.click());
  expect(api.createAiTemplate).not.toHaveBeenCalled();
  await type(panelStrings.templateId, "custom-personas-notes");
  expect(save.disabled).toBe(false);
  vi.mocked(api.createAiTemplate).mockResolvedValue({ template: { ...template, id: "custom-personas-notes" } });
  await click(panelStrings.saveTemplate);
  expect(api.createAiTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: "custom-personas-notes" }));
});

it("refuses saving or deleting a stale selected Persona template while disabled", async () => {
  template = { ...defaultAiFunctionTemplates.find((item) => item.id === "personas")!, projectId: template.projectId };
  await render(); await click(template.name);
  features.personas = false;
  await render();
  await click(panelStrings.deleteTemplate);
  expect(api.deleteAiTemplate).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Persona feature is disabled");
  expect(api.updateAiTemplate).not.toHaveBeenCalled();
});
