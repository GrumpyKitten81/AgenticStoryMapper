import { describe, expect, it } from "vitest";
import { createStoryMapFromTemplate, sampleStoryMapTemplate } from "./template";

describe("template planning", () => {
  it("orders logical parents before children without changing template data", () => {
    const template = structuredClone(sampleStoryMapTemplate);
    template.cards.reverse();
    const before = structuredClone(template);
    const plan = createStoryMapFromTemplate(template);
    expect(plan.cards.map((card) => card.level)).toEqual(["activity", "step", "story"]);
    expect(plan.cards[2]?.releaseRef).toBe(plan.releases[0]?.ref);
    expect(template).toEqual(before);
  });

  it("rejects duplicate, missing and cyclic logical references", () => {
    const duplicate = structuredClone(sampleStoryMapTemplate);
    duplicate.cards.push(duplicate.cards[0]!);
    expect(() => createStoryMapFromTemplate(duplicate)).toThrow("unique");
    const missingParent = structuredClone(sampleStoryMapTemplate);
    missingParent.cards[1]!.parentRef = "missing";
    expect(() => createStoryMapFromTemplate(missingParent)).toThrow("missing references or a cycle");
    const cycle = structuredClone(sampleStoryMapTemplate);
    cycle.cards[0]!.parentRef = cycle.cards[1]!.ref;
    expect(() => createStoryMapFromTemplate(cycle)).toThrow("cycle");
    const missingRelease = structuredClone(sampleStoryMapTemplate);
    missingRelease.cards[2]!.releaseRef = "missing";
    expect(() => createStoryMapFromTemplate(missingRelease)).toThrow("release reference");
  });

  it("rejects invalid hierarchy before persistence can begin", () => {
    const template = structuredClone(sampleStoryMapTemplate);
    template.cards[2]!.parentRef = template.cards[0]!.ref;
    expect(() => createStoryMapFromTemplate(template)).toThrow("hierarchy");
  });
  it.each([undefined, "activity", "step"])("accepts a Note under %s", (parentRef) => {
    const template = structuredClone(sampleStoryMapTemplate);
    template.cards.push({ ref: "note", level: "note", title: "Valid Note", description: "", ...(parentRef ? { parentRef } : {}) });
    expect(createStoryMapFromTemplate(template).cards.find((card) => card.ref === "note")).toMatchObject({ level: "note" });
  });

  it.each(["story", "parent-note"])("rejects a Note under %s before persistence", (parentRef) => {
    const template = structuredClone(sampleStoryMapTemplate);
    template.cards.push({ ref: "parent-note", level: "note", title: "Parent Note", description: "" });
    template.cards.push({ ref: "note", parentRef, level: "note", title: "Invalid Note", description: "" });
    expect(() => createStoryMapFromTemplate(template)).toThrow("hierarchy");
  });

});
