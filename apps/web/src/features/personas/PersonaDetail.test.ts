// @vitest-environment jsdom // REQ AD11 preserves Persona editor drafts across live refreshes.
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardSchema, personaSchema, type Persona, type Card, type CardPersonaLink } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { ConflictError } from "@storymapper/web/app/conflicts";
import { PersonaDetail } from "@storymapper/web/features/personas/PersonaDetail";
import { appStrings as strings } from "@storymapper/ui-strings";

import { getByRole, within } from "@testing-library/dom";
import { auditAccessibility } from "@storymapper/web/test/audit-accessibility";

const impact = vi.hoisted(() => ({ usageCards: [] as Card[], cardPersonas: [] as CardPersonaLink[], cardAnnotations: [] }));
vi.mock("@storymapper/web/app/api", () => ({ useCustomization: () => ({ data: impact }), api: { updatePersona: vi.fn(), deletePersona: vi.fn() } }));
const projectId = randomUUID();
let persona: Persona;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

async function render() {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(PersonaDetail, { persona, projectId, onDeleted: vi.fn() }))));
}
function field(label: string): HTMLInputElement {
  return [...host.querySelectorAll("label")].find((element) => element.querySelector("span")?.textContent === label)!.querySelector("input")!;
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function blur(input: HTMLInputElement) {
  await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
}
beforeEach(() => {
  impact.usageCards = []; impact.cardPersonas = [];
  notifyManager.setScheduler(queueMicrotask); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  persona = personaSchema.parse({ id: randomUUID(), projectId, storyMapId: null, version: 1, name: "Initial reader", role: "Initial role" });
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });

describe("Persona live editor updates", () => {
  registerRefreshesCleanFieldsWhileRetainingDirtyFieldsAndSwitches();

  it("retains typing during a matching save and refreshes fields after a completed clean save", testRetainsTypingDuringAMatchingSaveAndRefreshesFieldsAfterA);

  it("preserves a failed-save draft and ignores successful responses for a different selected Persona", testPreservesAFailedSaveDraftAndIgnoresSuccessfulResponsesForA);

  registerInvalidatesCachedStoryMapAndReportQueriesAfterA();

  registerConflictingSaves();
});

it("requires explicit used-Persona unlink and closes the failed deletion so a fresh review can be captured", async () => {
  const card = cardSchema.parse({ id: randomUUID(), storyMapId: randomUUID(), key: "K-1", title: "Used", level: "story", status: "todo", version: 4, parentId: null, releaseId: null, position: 0, creationOrigin: "manual", provenance: "manual", createdAt: "2026-10-17T00:00:00Z", updatedAt: "2026-10-17T00:00:00Z" });
  impact.usageCards = [card]; impact.cardPersonas = [{ id: randomUUID(), cardId: card.id, personaId: persona.id, createdAt: card.createdAt }];
  vi.mocked(api.deletePersona).mockRejectedValue(new Error("Card changed; review again"));
  await render();
  const opener = host.querySelector<HTMLButtonElement>("button.danger")!;
  await act(async () => { opener.focus(); opener.click(); });
  const dialog = getByRole(document.body, "dialog");
  expect(document.activeElement).toBe(within(dialog).getByRole("heading"));
  expect(within(dialog).getByRole("checkbox", { name: "Confirm unlink from all affected Cards" })).toHaveProperty("checked", false);
  await auditAccessibility();
  const confirm = [...document.querySelectorAll<HTMLButtonElement>("[role=dialog] button")].find((button) => button.textContent === "Confirm delete")!;
  expect(confirm.disabled).toBe(true); expect(api.deletePersona).not.toHaveBeenCalled();
  await act(async () => document.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!.click());
  expect(within(dialog).getByRole("checkbox", { name: "Confirm unlink from all affected Cards" })).toHaveProperty("checked", true);
  await auditAccessibility();
  await act(async () => confirm.click());
  expect(api.deletePersona).toHaveBeenCalledWith(persona.id, 1, { definitionBefore: persona, affectedCards: [{ id: card.id, baseVersion: 4 }], confirmUnlink: true });
  expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(host.querySelector('[role=alert]')?.textContent).toContain("Card changed");
  expect(document.activeElement).toBe(opener);
  await auditAccessibility();
  await act(async () => host.querySelector<HTMLButtonElement>("button.danger")!.click());
  expect(document.querySelector('[role=dialog]')).not.toBeNull();
  expect(getByRole(document.body, "checkbox", { name: "Confirm unlink from all affected Cards" })).toHaveProperty("checked", false);
  await auditAccessibility();
  await act(async () => within(getByRole(document.body, "dialog")).getByRole("button", { name: "Cancel" }).click());
  expect(document.activeElement).toBe(opener);
});

function registerConflictingSaves() {
  describe("conflicting saves", () => {
    const conflictFor = (current: Persona) => new ConflictError("changed", [{ entity: "persona", id: current.id, baseVersion: 1, currentVersion: current.version, current }]);
    const alertButton = (label: string) => [...host.querySelectorAll<HTMLButtonElement>(".conflict-alert button")].find((item) => item.textContent === label)!;

    it("keeps the typed value after a stale save and resubmits it with the current version", async () => {
      const remote = { ...persona, version: 2, name: "Remote name" };
      vi.mocked(api.updatePersona).mockRejectedValueOnce(conflictFor(remote)).mockResolvedValueOnce({ ...remote, version: 3, name: "Local name" });
      await render();
      await type(field(strings.personaFields.name), "Local name");
      await blur(field(strings.personaFields.name));
      expect(host.querySelector(".conflict-alert")?.textContent).toContain("changed since you loaded it");
      expect(field(strings.personaFields.name).value).toBe("Local name");
      expect(vi.mocked(api.updatePersona).mock.calls[0]).toEqual([persona.id, { name: "Local name" }, 1]);
      await act(async () => alertButton("Keep mine").click());
      expect(vi.mocked(api.updatePersona).mock.calls[1]).toEqual([persona.id, { name: "Local name" }, 2]);
      expect(host.querySelector(".conflict-alert")).toBeNull();
    });

    it("replaces the draft with the server state on Reload", async () => {
      const remote = { ...persona, version: 2, name: "Remote name" };
      vi.mocked(api.updatePersona).mockRejectedValueOnce(conflictFor(remote));
      await render();
      await type(field(strings.personaFields.name), "Local name");
      await blur(field(strings.personaFields.name));
      await act(async () => alertButton("Reload").click());
      expect(field(strings.personaFields.name).value).toBe("Remote name");
      expect(host.querySelector(".conflict-alert")).toBeNull();
    });

    it("queues a second save behind an in-flight one and sends the version it returned", async () => {
      let finishFirst!: (value: Persona) => void;
      vi.mocked(api.updatePersona)
        .mockImplementationOnce(() => new Promise((done) => { finishFirst = done; }))
        .mockResolvedValueOnce({ ...persona, version: 3, name: "First", role: "Second" });
      await render();
      await type(field(strings.personaFields.name), "First");
      await blur(field(strings.personaFields.name));
      await type(field(strings.personaFields.role), "Second");
      await blur(field(strings.personaFields.role));
      expect(api.updatePersona).toHaveBeenCalledTimes(1);
      await act(async () => finishFirst({ ...persona, version: 2, name: "First" }));
      await vi.waitFor(() => expect(api.updatePersona).toHaveBeenCalledTimes(2));
      expect(vi.mocked(api.updatePersona).mock.calls.map((call) => call[2])).toEqual([1, 2]);
    });
  });
}

function registerInvalidatesCachedStoryMapAndReportQueriesAfterA() {
  it.each(["update", "delete"] as const)("invalidates cached Story Map and report queries after a real Persona %s", async (kind) => {
    vi.mocked(api.updatePersona).mockResolvedValue({ ...persona, version: 2, name: "Saved name" });
    vi.mocked(api.deletePersona).mockResolvedValue(undefined as never);
    client.setQueryData(["story-map", "map"], {});
    client.setQueryData(["release-summary", "map"], {});
    await render();
    if (kind === "update") {
      await type(field(strings.personaFields.name), "Saved name");
      await blur(field(strings.personaFields.name));
    } else {
      await act(async () => host.querySelector<HTMLButtonElement>("button.danger")!.click());
      await act(async () => [...document.querySelectorAll<HTMLButtonElement>("[role=dialog] button")].find((button) => button.textContent === "Confirm delete")!.click());
    }
    expect(client.getQueryState(["story-map", "map"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["release-summary", "map"])?.isInvalidated).toBe(true);
  });
}

function registerRefreshesCleanFieldsWhileRetainingDirtyFieldsAndSwitches() {
  it("refreshes clean fields while retaining dirty fields and switches selected identity cleanly", async () => {
    await render();
    await type(field(strings.personaFields.name), "Unsaved name");
    persona = { ...persona, version: 2, name: "Agent name", role: "Agent role" };
    await render();
    expect(field(strings.personaFields.name).value).toBe("Unsaved name");
    expect(field(strings.personaFields.role).value).toBe("Agent role");
    persona = { ...persona, id: randomUUID(), name: "Different Persona" };
    await render();
    expect(field(strings.personaFields.name).value).toBe("Different Persona");
  });
}

async function testRetainsTypingDuringAMatchingSaveAndRefreshesFieldsAfterA() {
  let resolve!: (value: Persona) => void;
  vi.mocked(api.updatePersona).mockImplementation(() => new Promise((done) => { resolve = done; }));
  await render();
  await type(field(strings.personaFields.name), "Submitted name");
  await blur(field(strings.personaFields.name));
  await type(field(strings.personaFields.name), "Typed during Save");
  await act(async () => resolve({ ...persona, version: 2, name: "Submitted name" }));
  expect(field(strings.personaFields.name).value).toBe("Typed during Save");
  await blur(field(strings.personaFields.name));
  persona = { ...persona, version: 3, name: "Typed during Save" };
  await act(async () => resolve(persona));
  await render();
  persona = { ...persona, version: 4, name: "Later clean update" };
  await render();
  expect(field(strings.personaFields.name).value).toBe("Later clean update");
}

async function testPreservesAFailedSaveDraftAndIgnoresSuccessfulResponsesForA() {
  vi.mocked(api.updatePersona).mockRejectedValueOnce(new Error("Persona save failed"));
  await render();
  await type(field(strings.personaFields.name), "Failed save draft");
  await blur(field(strings.personaFields.name));
  persona = { ...persona, version: 2, name: "Incoming after failure" };
  await render();
  expect(field(strings.personaFields.name).value).toBe("Failed save draft");
  let resolve!: (value: Persona) => void;
  vi.mocked(api.updatePersona).mockImplementation(() => new Promise((done) => { resolve = done; }));
  await blur(field(strings.personaFields.name));
  const previous = persona;
  persona = { ...persona, id: randomUUID(), name: "New selection" };
  await render();
  await act(async () => resolve({ ...previous, name: "Failed save draft" }));
  expect(field(strings.personaFields.name).value).toBe("New selection");
}
