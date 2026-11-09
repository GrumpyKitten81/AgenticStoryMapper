// @vitest-environment jsdom // REQ explicit slice targeting uses mounted controls.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cardSchema, builtinProposalTemplateSchema, type AiFunctionTemplate, type Card, releaseSchema } from "@storymapper/contracts";
import { defaultAiFunctionTemplates } from "@storymapper/core";
import { panelStrings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { AiMcpPanel } from "@storymapper/web/features/ai-mcp/AiMcpPanel";

const templateState = vi.hoisted(() => ({ templates: [] as AiFunctionTemplate[] }));

const features = vi.hoisted(() => ({ personas: true }));
vi.mock("@storymapper/web/app/feature-flags", async (original) => ({
  ...await original<typeof import("@storymapper/web/app/feature-flags")>(),
  get isPersonasEnabled() { return features.personas; }
}));
afterEach(() => { features.personas = true; templateState.templates = []; });

vi.mock("@storymapper/web/app/api", () => ({
  api: { approveChangeSet: vi.fn(), rejectChangeSet: vi.fn(), applyChangeSet: vi.fn(), callMcpTool: vi.fn(), upsertProductContext: vi.fn(), createAiProposal: vi.fn() },
  useMcpTools: () => ({ data: { tools: [] } }),
  useMcpHostConfigs: () => ({ data: undefined }),
  useChangeSets: () => ({ data: { changeSets: [] } }),
  useSourceDocuments: () => ({ data: { documents: [] } }),
  useProductContext: () => ({ data: undefined }),
  useAiFunctionTemplates: () => ({ data: { templates: templateState.templates } })
}));

function card(title: string, level: Card["level"], parentId: string | null = null, patch: Partial<Card> = {}): Card {
  return cardSchema.parse({ creationOrigin: "manual", provenance: "manual", id: randomUUID(), key: title, storyMapId: "00000000-0000-0000-0000-000000000001", version: 1, level, parentId, releaseId: null, position: 0, title, createdAt: "2026-10-07T12:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z", ...patch });
}

describe("AI proposal Story picker", () => {
  it("renders visible Stories and excludes Stories beneath archived or parked ancestors", () => {
    const archived = card("Archived", "activity", null, { status: "archived" });
    const parked = card("Parked", "activity", null, { parked: true });
    const cards = [archived, card("ArchivedChild", "story", archived.id), parked, card("ParkedChild", "story", parked.id), card("Visible", "story")];
    const client = new QueryClient();
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(AiMcpPanel, { cards, releases: [] })));
    expect(html).toContain("Visible");
    expect(html).not.toContain("ArchivedChild");
    expect(html).not.toContain("ParkedChild");
    expect(html).toContain('type="checkbox"');
    client.clear();
  });
});
import { randomUUID } from "node:crypto";

it("mounts the persisted template editor with the Project's templates", () => {
  templateState.templates = [{ ...defaultAiFunctionTemplates[0]!, projectId: randomUUID(), id: "custom-prompt", name: "Custom prompt" }];
  const client = new QueryClient();
  try {
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(AiMcpPanel, { projectId: randomUUID(), cards: [], releases: [] })));
    expect(html).toContain(panelStrings.functionTemplates);
    expect(html).toContain("Custom prompt");
    expect(renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(AiMcpPanel, { cards: [], releases: [] })))).not.toContain(panelStrings.functionTemplates);
  } finally { client.clear(); templateState.templates = []; }
});

it("keeps exactly the supported deterministic actions independent of persisted prompt templates", () => {
  for (const templates of [[], [{ ...defaultAiFunctionTemplates[0]!, projectId: randomUUID(), id: "custom-prompt", name: "Custom prompt" }]]) {
    templateState.templates = templates;
    const client = new QueryClient();
    try {
      const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(AiMcpPanel, { projectId: randomUUID(), cards: [], releases: [] })));
      const actionSelector = html.split(panelStrings.proposalAction)[1]!.split("</select>")[0]!;
      const values = [...actionSelector.matchAll(/<option[^>]*value="([^"]+)"/gu)].map((match) => match[1]);
      expect(values.sort()).toEqual([...builtinProposalTemplateSchema.options].sort());
      expect(values).not.toContain("custom-prompt");
      for (const template of defaultAiFunctionTemplates.filter((item) => !builtinProposalTemplateSchema.safeParse(item.id).success)) expect(values).not.toContain(template.id);
    } finally { client.clear(); }
  }
  templateState.templates = [];
});

it("requires an explicit target and submits existing/new targets on both slice surfaces", async () => {
  const { select, root, client, projectId, storyMapId, selected, release, host, button } = exerciseRequiresAnExplicitTargetAndSubmitsExistingNewTargets();
  const change = async (text: string, value: string) => { await act(async () => { const input = select(text); input.value = value; input.dispatchEvent(new Event("change", { bubbles: true })); }); };
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiMcpPanel projectId={projectId} storyMapId={storyMapId} cards={[selected]} releases={[release]} /></QueryClientProvider>));
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await change(panelStrings.proposalAction, "release-slice");
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(button(panelStrings.createProposal).disabled).toBe(true);
    expect(button(panelStrings.slice).disabled).toBe(true);
    expect(host.textContent).not.toContain("Slice strategy");
    for (const target of [release.id, "new"]) {
      await change(panelStrings.releaseTarget, target);
      const releaseTarget = target === "new" ? { kind: "new" } : { kind: "existing", releaseId: release.id };
      await act(async () => button(panelStrings.createProposal).click());
      expect(api.createAiProposal).toHaveBeenLastCalledWith(expect.objectContaining({ projectId, storyMapId, templateId: "release-slice", releaseTarget }));
      expect(vi.mocked(api.createAiProposal).mock.lastCall![0]).not.toHaveProperty("strategy");
      expect(vi.mocked(api.createAiProposal).mock.lastCall![0]).not.toHaveProperty("cardIds");
      await act(async () => button(panelStrings.slice).click());
      expect(api.callMcpTool).toHaveBeenLastCalledWith({ name: "ProposeReleaseSlice", input: { storyMapId, releaseTarget } });
      expect(host.querySelector('[role="alert"]')?.textContent).toBe("Slice refused");
    }
    await change(panelStrings.proposalAction, "acceptance-criteria");
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    await act(async () => button(panelStrings.createProposal).click());
    expect(api.createAiProposal).toHaveBeenLastCalledWith(expect.objectContaining({ templateId: "acceptance-criteria", cardIds: [selected.id] }));
    await change(panelStrings.proposalAction, "release-slice");
    await change(panelStrings.releaseTarget, release.id);
    let failOldSlice!: (error: Error) => void;
    vi.mocked(api.callMcpTool).mockImplementationOnce(() => new Promise((_resolve, reject) => { failOldSlice = reject; }));
    await act(async () => button(panelStrings.slice).click());
    await act(async () => root.render(<QueryClientProvider client={client}><AiMcpPanel projectId={projectId} storyMapId={randomUUID()} cards={[]} releases={[release]} /></QueryClientProvider>));
    await act(async () => failOldSlice(new Error("Old map delayed slice failure")));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).not.toContain("Old map delayed slice failure");
    expect(button(panelStrings.slice).disabled).toBe(true);
    expect(button(panelStrings.createProposal).disabled).toBe(true);
  } finally {
    await act(async () => root.unmount()); client.clear(); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});

function exerciseRequiresAnExplicitTargetAndSubmitsExistingNewTargets() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const projectId = randomUUID();
  const storyMapId = randomUUID();
  const selected = card("Selected Story", "story", null, { storyMapId });
  const release = releaseSchema.parse({ id: randomUUID(), version: 1, storyMapId, name: "Delivery", position: 0, startDate: null, releaseDate: null });
  vi.mocked(api.createAiProposal).mockRejectedValue(new Error("Proposal refused"));
  vi.mocked(api.callMcpTool).mockRejectedValue(new Error("Slice refused"));
  const button = (text: string) => Array.from(host.querySelectorAll("button")).find((item) => item.textContent?.trim() === text)!;
  const select = (text: string) => Array.from(host.querySelectorAll("label")).find((item) => item.firstChild?.textContent === text)!.querySelector("select")!;
  return { select, root, client, projectId, storyMapId, selected, release, host, button };
}

it("uses shared form grids and wraps source proposal actions without stretching them", () => {
  const client = new QueryClient();
  const host = document.createElement("div");
  try {
    host.innerHTML = renderToStaticMarkup(<QueryClientProvider client={client}><AiMcpPanel projectId={randomUUID()} cards={[]} releases={[]} /></QueryClientProvider>);
    for (const panel of host.querySelectorAll(".product-context-panel, .mcp-config-panel")) expect(panel.classList.contains("form-stack")).toBe(true);
    const sourceAction = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes(panelStrings.sourceMap))!;
    expect(sourceAction.parentElement?.classList.contains("button-row")).toBe(true);
    expect(sourceAction.parentElement?.querySelectorAll("button")).toHaveLength(3);
  } finally { client.clear(); }
});

it("hides Persona template choices and blocks a stale selected Persona proposal", async () => {
  const { select, root, client, projectId, storyMapId, host, button } = exerciseRequiresAnExplicitTargetAndSubmitsExistingNewTargets();
  const personaTemplate = defaultAiFunctionTemplates.find((template) => template.id === "personas")!;
  templateState.templates = [{ ...personaTemplate, projectId }, { ...defaultAiFunctionTemplates[0]!, projectId, id: "custom-personas-notes", name: "Custom persona notes" }];
  const render = async () => { await act(async () => root.render(<QueryClientProvider client={client}><AiMcpPanel projectId={projectId} storyMapId={storyMapId} cards={[]} releases={[]} /></QueryClientProvider>)); };
  try {
    await render();
    await act(async () => { const control = select(panelStrings.proposalAction); control.value = "personas"; control.dispatchEvent(new Event("change", { bubbles: true })); });
    features.personas = false;
    await render();
    expect([...select(panelStrings.proposalAction).options].map((option) => option.value)).not.toContain("personas");
    expect(host.querySelector(".tool-list")?.textContent).not.toContain(personaTemplate.name);
    expect(host.textContent).toContain("Custom persona notes");
    expect(button(panelStrings.createProposal).disabled).toBe(true);
    await act(async () => button(panelStrings.createProposal).click());
    expect(api.createAiProposal).not.toHaveBeenCalled();
    await act(async () => { const control = select(panelStrings.proposalAction); control.value = "acceptance-criteria"; control.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => button(panelStrings.createProposal).click());
    expect(api.createAiProposal).toHaveBeenCalledWith(expect.objectContaining({ templateId: "acceptance-criteria" }));
    expect(templateState.templates).toHaveLength(2);
  } finally {
    await act(async () => root.unmount()); client.clear(); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
