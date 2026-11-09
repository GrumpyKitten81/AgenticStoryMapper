// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { PersonasPanel } from "@storymapper/web/features/personas/PersonasPanel";

const projectId = "00000000-0000-4000-8000-000000000001";
const personaId = "00000000-0000-4000-8000-000000000002";
const host = document.createElement("div");
const root: Root = createRoot(host);
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

it("renders persona external references returned by the shared persona query", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.startsWith("/api/personas")
      ? { personas: [{ id: personaId, projectId, storyMapId: null, name: "Reader", role: "Analyst", avatar: "", version: 1, goals: [], pains: [] }], externalRefs: [{ id: "00000000-0000-4000-8000-000000000003", entityType: "persona", entityId: personaId, system: "planner", externalId: "Persona-42", scopeId: projectId, syncedVersion: 1, createdAt: "2026-10-11T00:00:00.000Z" }] }
      : { storyMaps: [] };
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  }));
  await act(async () => root.render(<QueryClientProvider client={client}><PersonasPanel projectId={projectId} selectedPersonaId={undefined} onSelect={() => undefined} /></QueryClientProvider>));
  await act(async () => { await vi.waitFor(() => expect(host.querySelector(".external-ref-badge")?.textContent).toBe("planner:Persona-42")); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.replaceChildren();
  vi.unstubAllGlobals();
});
