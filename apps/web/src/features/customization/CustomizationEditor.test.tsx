// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { annotationSchema, cardSchema, storyTemplateSchema, workflowStatusSchema } from "@storymapper/contracts";
import { CustomizationEditor, type CustomizationSelection } from "@storymapper/web/features/customization/CustomizationEditor";
import type { CustomizationData } from "@storymapper/web/features/customization/customization-impact";

import { getByRole, getByText, within } from "@testing-library/dom";
import { auditAccessibility } from "@storymapper/web/test/audit-accessibility";

const projectId = randomUUID(), mapId = randomUUID();
let root: Root, host: HTMLDivElement, client: QueryClient, data: CustomizationData;
let writes: { path: string; method: string; body: Record<string, unknown> }[];
const status = workflowStatusSchema.parse({ id: randomUUID(), projectId, storyMapId: null, name: "Ready", group: "todo", position: 0 });
const replacement = { ...status, id: randomUUID(), name: "Doing", group: "active" as const };
const annotation = annotationSchema.parse({ id: randomUUID(), projectId, storyMapId: mapId, name: "Risk", position: 0 });
const template = storyTemplateSchema.parse({ id: randomUUID(), projectId, storyMapId: null, name: "Skeleton", defaultEstimate: 2, position: 0 });
const card = cardSchema.parse({ id: randomUUID(), storyMapId: mapId, key: "K-1", title: "Used Card", level: "story", status: "Ready", version: 7, parentId: null, releaseId: null, position: 0, creationOrigin: "manual", provenance: "manual", createdAt: "2026-10-17T00:00:00Z", updatedAt: "2026-10-17T00:00:00Z" });
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("[role=dialog] button")].find((element) => element.textContent === name)!;
const input = (name: string) => [...document.querySelectorAll<HTMLLabelElement>("[role=dialog] label")].find((element) => element.firstChild?.textContent === name)!.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select")!;
async function enter(name: string, value: string) {
  const element = input(name);
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
async function mount(selection: CustomizationSelection, onClose = vi.fn()) {
  await act(async () => root.render(<QueryClientProvider client={client}><CustomizationEditor projectId={projectId} storyMapId={mapId} selection={selection} data={data} onClose={onClose} /></QueryClientProvider>));
  return onClose;
}
beforeEach(() => {
  notifyManager.setScheduler(queueMicrotask); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  data = { workflowStatuses: [status, replacement], annotations: [annotation], storyTemplates: [template], personas: [], cardPersonas: [], cardAnnotations: [{ id: randomUUID(), cardId: card.id, annotationId: annotation.id, createdAt: card.createdAt }], usageCards: [card] };
  writes = []; client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.stubGlobal("fetch", vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return Response.json(data);
    writes.push({ path: String(path), method: init!.method!, body: JSON.parse(String(init!.body)) });
    return Response.json({ ...status, ...JSON.parse(String(init!.body)) });
  }));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });

it.each(["status", "annotation", "template"] as const)("creates every supported %s field in the selected map scope", async (kind) => {
  const close = await mount({ kind });
  await enter("Name", "Authored"); await enter("Position", "3");
  if (kind !== "template") await enter("Color", "#123456");
  if (kind === "status") await enter("Group", "done");
  if (kind === "annotation") await enter("Icon", "flag");
  if (kind === "template") { await enter("Description skeleton", "## Required"); await enter("Default status", "Doing"); await enter("Default estimate", "0"); }
  const dialog = getByRole(document.body, "dialog");
  expect(within(dialog).getByRole("textbox", { name: "Name" })).toBe(input("Name"));
  expect(document.activeElement).toBe(within(dialog).getByRole("heading"));
  await auditAccessibility();
  await act(async () => button("Save").click());
  expect(writes[0]?.method).toBe("POST");
  expect(writes[0]?.body).toMatchObject({ projectId, storyMapId: mapId, name: "Authored", position: 3, ...(kind === "status" ? { color: "#123456", group: "done" } : kind === "annotation" ? { color: "#123456", icon: "flag" } : { descriptionTemplate: "## Required", defaultStatus: "Doing", defaultEstimate: 0 }) });
  expect(close).toHaveBeenCalledOnce();
});

it.each(["status", "annotation", "template"] as const)("edits %s and invalidates affected maps and reports", async (kind) => {
  const item = kind === "status" ? status : kind === "annotation" ? annotation : template;
  client.setQueryData(["story-map", mapId], {}); client.setQueryData(["release-summary", mapId], {});
  await mount({ kind, item }); await enter("Name", "Edited");
  await auditAccessibility();
  await act(async () => button("Save").click());
  expect(writes[0]).toMatchObject({ method: "PATCH", body: { name: "Edited" } });
  if (kind === "status") expect(writes[0]!.body).toMatchObject({ definitionBefore: status, affectedCards: [{ id: card.id, baseVersion: 7 }] });
  expect(client.getQueryState(["story-map", mapId])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["release-summary", mapId])?.isInvalidated).toBe(true);
});

it("requires a distinct replacement and sends the captured used-status evidence on deletion", async () => {
  await mount({ kind: "status", item: status });
  await act(async () => button("Delete").click());
  expect(button("Confirm delete").disabled).toBe(true); expect(writes).toHaveLength(0);
  expect(getByRole(document.body, "combobox", { name: "Replacement status" })).toBe(input("Replacement status"));
  await auditAccessibility();
  expect([...input("Replacement status").querySelectorAll("option")].map((option) => option.value)).not.toContain(status.id);
  await enter("Replacement status", replacement.id);
  await auditAccessibility();
  await act(async () => button("Confirm delete").click());
  expect(writes[0]).toMatchObject({ method: "DELETE", body: { definitionBefore: status, replacementBefore: replacement, affectedCards: [{ id: card.id, baseVersion: 7 }] } });
});

it("requires confirmed Annotation unlink and keeps a refused draft available", async () => {
  vi.mocked(fetch).mockImplementation(async (_path, init) => init?.method === "DELETE"
    ? Response.json({ code: "conflict", message: "Affected Card changed", conflicts: [{ entity: "card", id: card.id, baseVersion: 7, currentVersion: 8, current: { ...card, version: 8 } }] }, { status: 409 })
    : Response.json(data));
  await mount({ kind: "annotation", item: annotation }); await enter("Name", "Retained draft");
  await act(async () => button("Delete").click());
  expect(button("Confirm delete").disabled).toBe(true);
  await auditAccessibility();
  await act(async () => document.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!.click());
  await act(async () => button("Confirm delete").click());
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls.find((call) => call[1]?.method === "DELETE")![1]!.body))).toMatchObject({ definitionBefore: annotation, confirmUnlink: true, affectedCards: [{ id: card.id, baseVersion: 7 }] });
  expect(document.querySelector('[role=alert]')?.textContent).toBe("Affected Card changed");
  expect(getByRole(document.body, "button", { name: "Review current usage again" })).toBe(button("Review current usage again"));
  await auditAccessibility();
  await act(async () => button("Cancel").click());
  expect(input("Name").value).toBe("Retained draft");
});

it("blocks repeated saves and closing while a customization write is pending", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const close = await mount({ kind: "template", item: template });
  await enter("Name", "Pending"); await act(async () => { button("Save").click(); button("Save").click(); });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(button("Save").disabled).toBe(true); expect(button("Cancel").disabled).toBe(true);
  expect(close).not.toHaveBeenCalled();
  await act(async () => finish(Response.json(template)));
  expect(close).toHaveBeenCalledOnce();
});

it("deletes a confirmed template without rewriting any copied Card", async () => {
  await mount({ kind: "template", item: template });
  await act(async () => button("Delete").click());
  expect(writes).toHaveLength(0);
  await auditAccessibility();
  await act(async () => button("Confirm delete").click());
  expect(writes).toEqual([{ path: `/api/story-templates/${template.id}`, method: "DELETE", body: {} }]);
  expect(data.usageCards).toEqual([card]);
});

it("offers map-local replacements and excludes another map's status", async () => {
  const local = { ...status, storyMapId: mapId };
  const localReplacement = { ...replacement, storyMapId: mapId };
  const foreign = { ...replacement, id: randomUUID(), storyMapId: randomUUID(), name: "Other map" };
  data.workflowStatuses = [local, localReplacement, foreign];
  await mount({ kind: "status", item: local });
  await act(async () => button("Delete").click());
  const options = [...input("Replacement status").querySelectorAll("option")].map((option) => option.value);
  expect(options).toContain(localReplacement.id); expect(options).not.toContain(foreign.id);
  await enter("Replacement status", localReplacement.id);
  await act(async () => button("Confirm delete").click());
  expect(writes[0]?.body).toMatchObject({ replacementBefore: localReplacement, affectedCards: [{ id: card.id, baseVersion: 7 }] });
});

it("uses actual affected-map coverage when offering a local replacement for a Project status", async () => {
  const localReplacement = { ...replacement, id: randomUUID(), storyMapId: mapId };
  const foreign = { ...replacement, id: randomUUID(), storyMapId: randomUUID(), name: "Insufficient scope" };
  data.workflowStatuses.push(localReplacement, foreign);
  await mount({ kind: "status", item: status });
  await act(async () => button("Delete").click());
  const options = [...input("Replacement status").querySelectorAll("option")].map((option) => option.value);
  expect(options).toContain(localReplacement.id); expect(options).not.toContain(foreign.id);
  await enter("Replacement status", localReplacement.id);
  await act(async () => button("Confirm delete").click());
  expect(writes[0]?.body).toMatchObject({ replacementBefore: localReplacement });
});

it("excludes a local replacement that does not cover every affected map", async () => {
  data.workflowStatuses.push({ ...replacement, id: randomUUID(), storyMapId: mapId });
  data.usageCards.push({ ...card, id: randomUUID(), storyMapId: randomUUID() });
  await mount({ kind: "status", item: status });
  await act(async () => button("Delete").click());
  expect([...input("Replacement status").querySelectorAll("option")].map((option) => option.value)).not.toContain(data.workflowStatuses.at(-1)!.id);
});

it("explicitly refetches definition and usage after conflict without discarding edited fields", async () => {
  const current = { ...status, color: "#abcdef" };
  const fresh = { ...data, workflowStatuses: [current, replacement], usageCards: [{ ...card, version: 8 }] };
  let first = true;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (!init?.method) return Response.json(fresh);
    const body = JSON.parse(String(init.body));
    writes.push({ path: String(path), method: init.method, body });
    if (first) { first = false; return Response.json({ code: "conflict", message: "Review current usage", conflicts: [{ entity: "card", id: card.id, baseVersion: 7, currentVersion: 8, current: fresh.usageCards[0] }] }, { status: 409 }); }
    return Response.json({ ...current, ...body });
  });
  await mount({ kind: "status", item: status });
  await enter("Name", "Kept rename"); await enter("Color", "#123456");
  await act(async () => button("Save").click());
  expect(input("Name").value).toBe("Kept rename");
  expect(writes[0]?.body).toMatchObject({ definitionBefore: status, affectedCards: [{ id: card.id, baseVersion: 7 }] });
  await act(async () => button("Review current usage again").click());
  expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).startsWith("/api/customization?"))).toBe(true);
  expect(input("Name").value).toBe("Kept rename"); expect(input("Color").value).toBe("#123456");
  await auditAccessibility();
  await act(async () => button("Save").click());
  expect(writes[1]?.body).toMatchObject({ name: "Kept rename", color: "#123456", definitionBefore: current, affectedCards: [{ id: card.id, baseVersion: 8 }] });
});

it("renews unlink confirmation after explicitly refreshing a refused delete", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, init) => init?.method === "DELETE" ? Response.json({ code: "conflict", message: "Card changed", conflicts: [{ entity: "card", id: card.id, baseVersion: 7, currentVersion: 8, current: { ...card, version: 8 } }] }, { status: 409 }) : original(path, init));
  await mount({ kind: "annotation", item: annotation });
  await act(async () => button("Delete").click());
  await act(async () => document.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!.click());
  await act(async () => button("Confirm delete").click());
  data = { ...data, usageCards: [{ ...card, version: 8 }] };
  await act(async () => button("Review current usage again").click());
  expect(document.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!.checked).toBe(false);
  expect(button("Confirm delete").disabled).toBe(true);
});

it("renames the reviewed concurrent status back to the retained opening name with fresh usage evidence", async () => {
  const current = { ...status, name: "Concurrent name" };
  const currentCard = { ...card, status: current.name, version: 8 };
  const fresh = { ...data, workflowStatuses: [current, replacement], usageCards: [currentCard] };
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (!init?.method) return Response.json(fresh);
    const body = JSON.parse(String(init.body));
    writes.push({ path: String(path), method: init.method, body });
    if (JSON.stringify(body.definitionBefore) !== JSON.stringify(current) || JSON.stringify(body.affectedCards) !== JSON.stringify([{ id: card.id, baseVersion: 8 }])) {
      return Response.json({ code: "conflict", message: "Review current definition and usage" }, { status: 409 });
    }
    return Response.json({ ...current, ...body });
  });
  const close = await mount({ kind: "status", item: status });
  await enter("Color", "#123456");
  await act(async () => button("Save").click());
  expect(close).not.toHaveBeenCalled();
  expect(input("Name").value).toBe(status.name);
  await act(async () => button("Review current usage again").click());
  expect(input("Name").value).toBe(status.name);
  expect(input("Color").value).toBe("#123456");
  expect(getByText(document.body, "Reviewed status: Concurrent name")).toBeDefined();
  expect(getByRole(document.body, "dialog", { name: "Edit Ready" })).toBeDefined();
  await auditAccessibility();
  await act(async () => button("Save").click());
  expect(writes[1]?.body).toMatchObject({ name: status.name, color: "#123456", definitionBefore: current, affectedCards: [{ id: card.id, baseVersion: 8 }] });
  expect(close).toHaveBeenCalledOnce();
});
