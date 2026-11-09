import { randomUUID } from "node:crypto";
import { cardSchema, workflowStatusSchema } from "@storymapper/contracts";
import { expect, it } from "vitest";
import { isCardCompleted } from "@storymapper/core/story-map/github-status";

it("uses explicit local groups before name inference while keeping linked closure independent", () => {
  const projectId = randomUUID(), storyMapId = randomUUID();
  const card = cardSchema.parse({ id: randomUUID(), storyMapId, version: 1, key: "MAP-1", parentId: null, releaseId: null, level: "story", title: "Story", status: "Resolved", position: 0, creationOrigin: "manual", provenance: "manual", createdAt: "2026-11-03T00:00:00Z", updatedAt: "2026-11-03T00:00:00Z" });
  const definition = workflowStatusSchema.parse({ id: randomUUID(), projectId, storyMapId, name: "Resolved", group: "active", position: 0 });
  expect(isCardCompleted(card, [], [definition])).toBe(false);
  expect(isCardCompleted(card, [], [{ ...definition, group: "done" }])).toBe(true);
  expect(isCardCompleted(card)).toBe(true);
  expect(isCardCompleted({ ...card, status: "Unclassified" })).toBe(false);
  const link = { id: randomUUID(), externalRefId: randomUUID(), connectionId: randomUUID(), cardId: card.id, provider: "github" as const, remoteId: "1", remoteNumber: 1, url: "https://github.com/owner/repo/issues/1", remoteState: "closed", labels: [], parentOverrideLocal: false, syncState: "synced" as const };
  expect(isCardCompleted(card, [link], [definition])).toBe(true);
});
