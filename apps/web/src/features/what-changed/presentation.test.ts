import { expect, it } from "vitest";
import type { ActivityChange } from "@storymapper/contracts";
import { changeDescription, groupDescription } from "@storymapper/web/features/what-changed/presentation";

const event: ActivityChange = { id: "00000000-0000-4000-8000-000000000001", seq: 1, projectId: null, action: "changeSet.operation.applied", actor: "Agent", actorType: "agent", createdAt: "2026-10-31T10:00:00Z" };
const card = { id: "00000000-0000-4000-8000-000000000002", action: "card.updated", changes: [{ field: "status", before: "todo", after: "active" }], actions: ["cardPersona.created", "cardDependency.created"] };

it("retains simultaneous field and distinct child actions without relation UUIDs", () => {
  expect(changeDescription(event, card)).toBe("Status: todo → active; Persona assignment created; Dependency added");
  expect(changeDescription(event, { ...card, changes: [] })).toBe("Persona assignment created; Dependency added");
});

it("presents lifecycle directly and omits initialization fields from later aggregate edits", () => {
  const created = { ...card, action: "card.created", actions: [], changes: [{ field: "title", after: "Card" }, { field: "status", after: "todo" }, { field: "description" }] };
  const creation = { ...event, cards: [created] };
  expect(groupDescription({ target: `card:${card.id}`, card: created, events: [creation] })).toBe("Card created");
  expect(groupDescription({ target: `card:${card.id}`, card, events: [{ ...event, cards: [{ ...card, changes: [{ field: "description" }, { field: "status", after: "active" }] }] }, creation] })).toBe("Description, Status changed · 2 changes");
  expect(groupDescription({ target: `card:${card.id}`, card, events: [{ ...event, cards: [{ ...card, changes: [{ field: "description" }, { field: "status", after: "active" }] }] }] })).toBe("Description, Status changed · 1 change");
  expect(changeDescription(event, { ...created, action: "card.deleted" })).toBe("Card deleted");
});
