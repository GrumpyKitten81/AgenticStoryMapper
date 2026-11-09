import { describe, expect, it } from "vitest";
import type { Card } from "@storymapper/contracts";
import { validateCardHierarchy } from "./hierarchy";

const now = new Date().toISOString();

function card(input: Partial<Card> & Pick<Card, "id" | "level" | "parentId">): Card {
  return {
    version: 1,
    creationOrigin: "manual",
    provenance: "manual",
    id: input.id,
    storyMapId: "00000000-0000-4000-8000-000000000001",
    parentId: input.parentId,
    releaseId: null,
    key: input.key ?? input.id,
    level: input.level,
    title: input.title ?? input.id,
    description: "",
    position: input.position ?? 0,
    status: "todo",
    parked: input.parked ?? false,
    createdAt: now,
    updatedAt: now
  };
}

describe("validateCardHierarchy", () => {
  it("accepts activity to step to story hierarchy", () => {
    const issues = validateCardHierarchy([
      card({ id: "a", level: "activity", parentId: null }),
      card({ id: "s", level: "step", parentId: "a" }),
      card({ id: "u", level: "story", parentId: "s" })
    ]);

    expect(issues).toEqual([]);
  });

  it("rejects stories directly below activities", () => {
    const issues = validateCardHierarchy([
      card({ id: "a", level: "activity", parentId: null }),
      card({ id: "u", level: "story", parentId: "a" })
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("story cannot be nested below activity");
  });
});
