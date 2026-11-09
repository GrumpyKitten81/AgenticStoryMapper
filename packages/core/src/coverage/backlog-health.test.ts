import { describe, expect, it } from "vitest";
import type { Card } from "@storymapper/contracts";
import { calculateBacklogHealth } from "./backlog-health";

const now = new Date().toISOString();

function story(input: Partial<Card> & Pick<Card, "id">): Card {
  return {
    version: 1,
    creationOrigin: "manual",
    provenance: "manual",
    id: input.id,
    storyMapId: "00000000-0000-4000-8000-000000000001",
    parentId: "00000000-0000-4000-8000-000000000002",
    releaseId: null,
    key: input.key ?? input.id,
    level: "story",
    title: input.title ?? input.id,
    description: input.description ?? "",
    position: input.position ?? 0,
    status: input.status ?? "todo",
    parked: input.parked ?? false,
    estimate: input.estimate,
    createdAt: now,
    updatedAt: now
  };
}

describe("calculateBacklogHealth", () => {
  it("reports missing description, estimate, source and GitHub link", () => {
    const issues = calculateBacklogHealth({
      cards: [story({ id: "story-1" })],
      sourceLinkedCardIds: [],
      githubLinkedCardIds: []
    });

    expect(issues.map((issue) => issue.type)).toEqual([
      "missing-description",
      "missing-estimate",
      "missing-source",
      "missing-github-link"
    ]);
  });

  it("does not report source and estimate issues when values exist", () => {
    const issues = calculateBacklogHealth({
      cards: [story({ id: "story-1", description: "Ready to build.", estimate: 3 })],
      sourceLinkedCardIds: ["story-1"],
      githubLinkedCardIds: []
    });

    expect(issues.map((issue) => issue.type)).toEqual(["missing-github-link"]);
  });

  it("ignores archived stories", () => {
    const issues = calculateBacklogHealth({
      cards: [story({ id: "story-1", status: "archived" })],
      sourceLinkedCardIds: [],
      githubLinkedCardIds: []
    });

    expect(issues).toEqual([]);
  });
});
