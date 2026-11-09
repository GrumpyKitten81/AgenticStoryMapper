// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { personaSchema } from "@storymapper/contracts";
import { PersonasPanel } from "@storymapper/web/features/personas/PersonasPanel";

it("retains a removed Persona map scope and open draft, refusing implicit Project creation or editing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); notifyManager.setScheduler(queueMicrotask);
  const projectId = randomUUID(), mapId = randomUUID();
  const persona = personaSchema.parse({ id: randomUUID(), projectId, storyMapId: mapId, name: "Reader", role: "User", version: 1 });
  let maps = [{ id: mapId, projectId, name: "Selected map" }];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method) { writes.push({ path: String(path), body: JSON.parse(String(init.body)) }); return Response.json({ ...persona, storyMapId: null }); }
    if (String(path).startsWith("/api/story-maps?")) return Response.json({ storyMaps: maps });
    if (String(path).startsWith("/api/customization?")) return Response.json({ workflowStatuses: [], personas: [persona], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: [], usageCards: [] });
    return Response.json({ personas: [persona], externalRefs: [] });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.body.appendChild(document.createElement("div")), root = createRoot(host);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><PersonasPanel projectId={projectId} selectedPersonaId={persona.id} onSelect={() => undefined} /></QueryClientProvider>));
    await act(async () => { await vi.waitFor(() => expect(client.isFetching()).toBe(0)); });
    const scope = host.querySelector<HTMLSelectElement>('[aria-label="New Persona scope"]')!;
    await act(async () => { scope.value = mapId; scope.dispatchEvent(new Event("change", { bubbles: true })); });
    const name = [...host.querySelectorAll("label")].find((label) => label.querySelector("span")?.textContent === "Name")!.querySelector<HTMLInputElement>("input")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Retained Persona draft"); name.dispatchEvent(new Event("input", { bubbles: true })); });
    maps = [];
    await act(async () => { await client.invalidateQueries({ queryKey: ["story-maps", projectId] }); });
    expect(scope.value).toBe(mapId); expect(scope.selectedOptions[0]!.textContent).toContain("Selected Story Map unavailable");
    expect(name.value).toBe("Retained Persona draft"); expect(name.matches(":disabled")).toBe(true);
    const create = host.querySelector<HTMLButtonElement>(".personas-create-row button")!;
    expect(create.disabled).toBe(true);
    await act(async () => { create.click(); name.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(writes).toEqual([]);
    await act(async () => { scope.value = "project"; scope.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(create.disabled).toBe(false);
    await act(async () => create.click());
    expect(writes).toHaveLength(1); expect(writes[0]!.body).toMatchObject({ projectId }); expect(writes[0]!.body).not.toHaveProperty("storyMapId");
  } finally {
    await act(async () => root.unmount()); host.remove(); client.clear(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});

it.each(["project", "other-map"])("keeps a valid %s Persona editable and deletable after its unrelated creation scope disappears", async (selectedScope) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); notifyManager.setScheduler(queueMicrotask);
  const projectId = randomUUID(), createMapId = randomUUID(), selectedMapId = randomUUID();
  const persona = personaSchema.parse({ id: randomUUID(), projectId, storyMapId: selectedScope === "project" ? null : selectedMapId, name: "Reader", role: "User", version: 1 });
  let maps = [{ id: createMapId, projectId, name: "Creation map" }, { id: selectedMapId, projectId, name: "Persona map" }];
  const writes: { method: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method) {
      const body = JSON.parse(String(init.body)); writes.push({ method: init.method, body });
      return Response.json(init.method === "DELETE" ? { ok: true } : { ...persona, ...body, version: 2 });
    }
    if (String(path).startsWith("/api/story-maps?")) return Response.json({ storyMaps: maps });
    if (String(path).startsWith("/api/customization?")) return Response.json({ workflowStatuses: [], personas: [persona], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: [], usageCards: [] });
    return Response.json({ personas: [persona], externalRefs: [] });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.body.appendChild(document.createElement("div")), root = createRoot(host), onSelect = vi.fn();
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><PersonasPanel projectId={projectId} selectedPersonaId={persona.id} onSelect={onSelect} /></QueryClientProvider>));
    await act(async () => { await vi.waitFor(() => expect(client.isFetching()).toBe(0)); });
    const scope = host.querySelector<HTMLSelectElement>('[aria-label="New Persona scope"]')!;
    await act(async () => { scope.value = createMapId; scope.dispatchEvent(new Event("change", { bubbles: true })); });
    maps = maps.filter((map) => map.id !== createMapId);
    await act(async () => { await client.invalidateQueries({ queryKey: ["story-maps", projectId] }); });
    expect(scope.value).toBe(createMapId);
    expect(host.querySelector<HTMLButtonElement>(".personas-create-row button")!.disabled).toBe(true);
    const name = [...host.querySelectorAll("label")].find((label) => label.querySelector("span")?.textContent === "Name")!.querySelector<HTMLInputElement>("input")!;
    expect(name.matches(":disabled")).toBe(false);
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Edited Reader"); name.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => name.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(writes[0]).toMatchObject({ method: "PATCH", body: { name: "Edited Reader", baseVersion: 1 } });
    const remove = host.querySelector<HTMLButtonElement>(".persona-detail-header button")!;
    expect(remove.disabled).toBe(false);
    await act(async () => remove.click());
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].find((button) => button.textContent === "Confirm delete")!.click());
    expect(writes[1]).toMatchObject({ method: "DELETE", body: { definitionBefore: persona, affectedCards: [], confirmUnlink: false } });
    expect(onSelect).toHaveBeenCalledWith(undefined);
  } finally {
    await act(async () => root.unmount()); host.remove(); client.clear(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
