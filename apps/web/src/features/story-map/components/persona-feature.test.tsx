// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { personaSchema } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { CardTile } from "@storymapper/web/features/story-map/components/CardTile";
import { cardId, mount, state, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

const features = vi.hoisted(() => ({ personas: true }));
vi.mock("@storymapper/web/app/feature-flags", async (original) => ({
  ...await original<typeof import("@storymapper/web/app/feature-flags")>(),
  get isPersonasEnabled() { return features.personas; }
}));

function addRelationships() {
  const card = state.snapshot.cards[2]!;
  const persona = personaSchema.parse({ id: randomUUID(), projectId: state.snapshot.storyMap.projectId, storyMapId: null, version: 1, name: "Literal persona", role: "Reader" });
  const annotation = { id: randomUUID(), projectId: state.snapshot.storyMap.projectId, storyMapId: null, name: "Literal annotation", icon: "tag", color: "#ffffff", position: 0 };
  state.snapshot = { ...state.snapshot, personas: [persona], cardPersonas: [{ id: randomUUID(), cardId, personaId: persona.id, createdAt: card.createdAt }], annotations: [annotation], cardAnnotations: [{ id: randomUUID(), cardId, annotationId: annotation.id, createdAt: card.createdAt }] };
  return { persona, annotation };
}

it.each([false, true])("gates real card detail assignments while preserving annotations and snapshot data (enabled=%s)", async (enabled) => {
  features.personas = enabled;
  const { persona, annotation } = addRelationships();
  const preserved = JSON.stringify(state.snapshot);
  const remove = vi.spyOn(api, "deleteCardPersona").mockResolvedValue({ ok: true });
  await mount(`${viewUrl}?card=${cardId}`);
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain(annotation.name);
  expect(dialog.textContent?.includes(persona.name)).toBe(enabled);
  const chip = [...dialog.querySelectorAll("button")].find((button) => button.textContent?.includes(persona.name));
  if (enabled) {
    expect(chip?.classList.contains("selected")).toBe(true);
    await act(async () => chip!.click());
    expect(remove).toHaveBeenCalledWith(cardId, persona.id);
  } else expect(remove).not.toHaveBeenCalled();
  expect(JSON.stringify(state.snapshot)).toBe(preserved);
});

it.each([false, true])("gates final tile labels and accessible descriptions even when names are supplied (enabled=%s)", async (enabled) => {
  features.personas = enabled;
  const { persona } = addRelationships();
  state.root = createRoot(state.host);
  await act(async () => state.root.render(createElement(CardTile, { card: state.snapshot.cards[2]!, personaNames: [persona.name], estimationUnit: "points", bulkSelected: false, sourceLinkCount: 0, releaseName: undefined, githubIssue: undefined, onSelect: vi.fn(), onBulkToggle: vi.fn(), onUpdateCard: vi.fn() })));
  expect(state.host.textContent?.includes(persona.name)).toBe(enabled);
  expect(state.host.querySelector("[aria-description]")?.getAttribute("aria-description")?.includes(persona.name) ?? false).toBe(enabled);
});
