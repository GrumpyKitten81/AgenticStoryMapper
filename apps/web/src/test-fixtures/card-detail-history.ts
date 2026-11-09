import { randomUUID } from "node:crypto";
import { act } from "react";
import { expect, vi } from "vitest";
import { state, cardId, viewUrl, savedHistory, button, mount } from "@storymapper/web/test-fixtures/card-detail";

export async function testRefreshesOpenHistoryAfterAttachmentCreationAndDeletionWithOwnedOnly(): Promise<void> {
  state.historyPages = savedHistory();
  const originalFetch = fetch;
  const card = state.snapshot.cards.find((item) => item.id === cardId)!;
  const attachment = { id: randomUUID(), cardId, label: "Spec", filePath: "spec.md", createdAt: card.createdAt };
  let attached = false;
  const addOwnedVersion = () => {
    const previous = state.historyPages[0]!.versions[0]!;
    const version = previous.version + 1;
    state.historyPages[0]!.versions.unshift({ ...previous, id: randomUUID(), version, snapshot: { ...previous.snapshot, version }, previousSnapshot: previous.snapshot, changedFields: [] });
  };
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path === `/api/cards/${cardId}/attachments` && init?.method === "POST") { attached = true; addOwnedVersion(); return new Response(JSON.stringify({ attachment })); }
    if (path === `/api/cards/${cardId}/attachments/${attachment.id}` && init?.method === "DELETE") { attached = false; addOwnedVersion(); return new Response(JSON.stringify({ ok: true })); }
    if (path === `/api/cards/${cardId}/attachments`) return new Response(JSON.stringify({ attachments: attached ? [attachment] : [] }));
    return originalFetch(path, init);
  }));
  await mount(`${viewUrl}?card=${cardId}`);
  await act(async () => button("History").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".card-history-entry")).toHaveLength(2));
  const setInput = (placeholder: string, value: string) => {
    const input = document.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  await act(async () => { setInput("Label", "Spec"); setInput("/local/path/file.md", "spec.md"); });
  await act(async () => button("Add attachment").click());
  await vi.waitFor(() => expect(document.querySelector(".card-history-entry h3")?.textContent).toBe("Version 4"));
  expect(document.querySelector(".card-history-entry")?.textContent).toContain("No Card field changes.");
  expect(document.querySelector(".card-history-entry")?.querySelector("dl")).toBeNull();
  await act(async () => button("Remove").click());
  await vi.waitFor(() => expect(document.querySelector(".card-history-entry h3")?.textContent).toBe("Version 5"));
  expect(document.querySelector(".card-history-entry")?.textContent).toContain("No Card field changes.");
  expect(document.querySelector(".card-history-entry")?.querySelector("dl")).toBeNull();
}
