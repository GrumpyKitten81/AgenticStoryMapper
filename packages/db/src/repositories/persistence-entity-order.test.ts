import { expect, it } from "vitest";
import { CHANGE_COLLECTIONS } from "@storymapper/core/changesets/remaining-owners";
import { PERSISTENCE_ENTITY_ORDER } from "@storymapper/db/repositories/operation-persistence-repository";

it("includes each resolver entity once while preserving the established persistence order", () => {
  expect(new Set(PERSISTENCE_ENTITY_ORDER).size).toBe(PERSISTENCE_ENTITY_ORDER.length);
  expect([...PERSISTENCE_ENTITY_ORDER].sort()).toEqual(Object.keys(CHANGE_COLLECTIONS).sort());
  expect(PERSISTENCE_ENTITY_ORDER).toEqual([
    "sourcePlanBaseline", "syncRun", "syncConflict", "connection", "storyMap", "release", "persona", "card", "productContext",
    "workflowStatus", "annotation", "storyTemplate", "roadmap", "roadmapColumn", "roadmapSwimlane", "roadmapCard", "roadmapReference",
    "sourceDocument", "sourceChunk", "externalRef", "sourceLink", "attachment", "cardPersona", "cardDependency", "cardAnnotation", "remoteWorkItemLink"
  ]);
});
