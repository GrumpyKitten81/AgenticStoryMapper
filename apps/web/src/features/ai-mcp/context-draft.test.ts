// @vitest-environment jsdom // REQ AD11 preserves editor drafts during live updates.
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { productContextSchema, type ProductContext } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { useAiMcpPanelState, type AiMcpPanelState } from "@storymapper/web/features/ai-mcp/useAiMcpPanelState";

let context: ProductContext;
let state: AiMcpPanelState;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const projectId = randomUUID();
let storyMapId = randomUUID();

vi.mock("@storymapper/web/app/api", () => ({
  api: { upsertProductContext: vi.fn(), approveChangeSet: vi.fn(), rejectChangeSet: vi.fn(), applyChangeSet: vi.fn(), callMcpTool: vi.fn(), createAiProposal: vi.fn() },
  useMcpTools: () => ({ data: { tools: [] } }), useMcpHostConfigs: () => ({ data: undefined }),
  useChangeSets: () => ({ data: { changeSets: [] } }), useSourceDocuments: () => ({ data: { documents: [] } }),
  useProductContext: () => ({ data: { context } }), useAiFunctionTemplates: () => ({ data: { templates: [] } })
}));

function Harness() { state = useAiMcpPanelState({ projectId, storyMapId, cards: [], releases: [] }); return null; }
async function render() { await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Harness)))); }

beforeEach(() => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  storyMapId = randomUUID();
  context = productContextSchema.parse({ id: randomUUID(), projectId, storyMapId, purpose: "Initial purpose", updatedAt: "2026-10-09T10:00:00Z" });
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });

describe("Product Context live draft retention", () => {
  it("refreshes clean fields but retains dirty text across changed/transient Context IDs and resets only for another scope", testRefreshesCleanFieldsButRetainsDirtyTextAcrossChangedTransientContext);

  it("preserves text typed during a save and retains failed-save drafts", async () => {
    let resolve!: (value: { context: ProductContext }) => void;
    vi.mocked(api.upsertProductContext).mockImplementation(() => new Promise((done) => { resolve = done; }));
    await render();
    await act(async () => state.setContextDraft((draft) => ({ ...draft, purpose: "Submitted purpose" })));
    await act(async () => state.saveContext.mutate());
    await act(async () => state.setContextDraft((draft) => ({ ...draft, purpose: "Typed during Save" })));
    context = { ...context, purpose: "Submitted purpose", updatedAt: "2026-10-09T10:01:00Z" };
    await act(async () => resolve({ context }));
    await render();
    expect(state.contextDraft.purpose).toBe("Typed during Save");
    vi.mocked(api.upsertProductContext).mockRejectedValueOnce(new Error("Save failed"));
    await act(async () => state.saveContext.mutate());
    await vi.waitFor(async () => { await act(async () => {}); expect(state.saveContext.isError).toBe(true); });
    expect(state.contextDraft.purpose).toBe("Typed during Save");
    expect(state.message).toBe("Save failed");
  });

  it("advances a matching save baseline so subsequent clean changes refresh without applying an old scope's response", async () => {
    let resolve!: (value: { context: ProductContext }) => void;
    vi.mocked(api.upsertProductContext).mockImplementation(() => new Promise((done) => { resolve = done; }));
    await render();
    await act(async () => state.setContextDraft((draft) => ({ ...draft, purpose: "Matching save" })));
    await act(async () => state.saveContext.mutate());
    context = { ...context, purpose: "Matching save" };
    await act(async () => resolve({ context }));
    context = { ...context, purpose: "Next clean update" };
    await render();
    expect(state.contextDraft.purpose).toBe("Next clean update");
    await act(async () => state.saveContext.mutate());
    const oldContext = context;
    storyMapId = randomUUID(); context = { ...context, storyMapId, purpose: "New scope" };
    await render();
    await act(async () => resolve({ context: oldContext }));
    expect(state.contextDraft.purpose).toBe("New scope");
  });
});

async function testRefreshesCleanFieldsButRetainsDirtyTextAcrossChangedTransientContext() {
  await render();
  expect(state.contextDraft.purpose).toBe("Initial purpose");
  context = { ...context, id: randomUUID(), purpose: "Remote clean purpose" };
  await render();
  expect(state.contextDraft.purpose).toBe("Remote clean purpose");
  await act(async () => state.setContextDraft((draft) => ({ ...draft, purpose: "Unsaved purpose" })));
  context = { ...context, id: randomUUID(), purpose: "Incoming purpose", updatedAt: "2026-10-09T10:01:00Z" };
  await render();
  expect(state.contextDraft.purpose).toBe("Unsaved purpose");
  storyMapId = randomUUID(); context = { ...context, storyMapId, purpose: "Other Map purpose" };
  await render();
  expect(state.contextDraft.purpose).toBe("Other Map purpose");
}
