import { describe, expect, it } from "vitest";
import { CARD_REVIEW_CRITERIA, CARD_REVIEW_CRITERIA_VERSION, cardReviewCriteriaFor, cardReviewInputSchema, cardSchema, cardTypeSchema, productContextSchema, type CardReviewReport } from "@storymapper/contracts";
import { validateReviewResults } from "@storymapper/core/card-review/review";

const id = "11111111-1111-4111-8111-111111111111";
const time = "2026-11-04T12:00:00.000Z";
function input(cardType: typeof cardTypeSchema._output | null) {
  return cardReviewInputSchema.parse({ card: cardSchema.parse({ id, storyMapId: id, parentId: null, releaseId: null, key: "TEST-1", level: "story", cardType, title: "Concrete outcome", position: 0, version: 1, creationOrigin: "manual", provenance: "manual", createdAt: time, updatedAt: time }), parents: [], prerequisites: [], sourceLinks: [], sourceChunks: [], productContext: productContextSchema.parse({ id, projectId: id, storyMapId: id, updatedAt: time }) });
}
describe("authoritative review criteria", () => {
  it.each(cardTypeSchema.options)("requires exact applicability for %s", (type) => {
    const results = CARD_REVIEW_CRITERIA.map((rule) => ({ id, ruleId: rule.id, severity: rule.severity, outcome: (rule.types as readonly string[]).includes(type) ? "pass" as const : "not_applicable" as const, evidence: [], advice: "" }));
    expect(() => validateReviewResults(input(type), { criteriaVersion: CARD_REVIEW_CRITERIA_VERSION, status: "success", results })).not.toThrow();
    expect(() => validateReviewResults(input(type), { criteriaVersion: CARD_REVIEW_CRITERIA_VERSION, status: "success", results: results.slice(1) })).toThrow("every rule");
  });
  it("adds goal and traceability warnings in version 2 and validates stored version 1 reports against their own rules", () => {
    expect(CARD_REVIEW_CRITERIA.filter((rule) => rule.since === "2").map(({ id, severity, types }) => ({ id, severity, types }))).toEqual([
      { id: "DOR-11", severity: "warning", types: ["story", "feature", "task"] },
      { id: "DOR-12", severity: "warning", types: ["story", "bug", "feature", "epic", "task"] },
      { id: "DOR-13", severity: "warning", types: cardTypeSchema.options },
      { id: "DOR-14", severity: "warning", types: ["story"] }
    ]);
    const results = (version: "1" | "2") => cardReviewCriteriaFor(version).map((rule) => ({ id, ruleId: rule.id, severity: rule.severity, outcome: (rule.types as readonly string[]).includes("story") ? "pass" as const : "not_applicable" as const, evidence: [], advice: "" }));
    expect(results("1")).toHaveLength(10);
    expect(() => validateReviewResults(input("story"), { criteriaVersion: "1", status: "success", results: results("1") })).not.toThrow();
    expect(() => validateReviewResults(input("story"), { criteriaVersion: "2", status: "success", results: results("1") })).toThrow("every rule");
    expect(() => validateReviewResults(input("story"), { criteriaVersion: "1", status: "success", results: results("2") })).toThrow("every rule");
    const story = results("2");
    Object.assign(story.find((result) => result.ruleId === "DOR-14")!, { outcome: "finding", evidence: ["Step 1: add a database column."], advice: "Move implementation steps into a derived Task." });
    expect(() => validateReviewResults(input("story"), { criteriaVersion: "2", status: "success", results: story })).not.toThrow();
  });
  it("never passes a missing explicit type and only escalates DOR-03 when work cannot start", () => {
    const results: CardReviewReport["results"] = CARD_REVIEW_CRITERIA.map((rule) => ({ id, ruleId: rule.id, severity: rule.severity, outcome: "pass", evidence: [], advice: "" }));
    expect(() => validateReviewResults(input(null), { criteriaVersion: CARD_REVIEW_CRITERIA_VERSION, status: "success", results })).toThrow("Missing Card type");
    const scope = results.find((result) => result.ruleId === "DOR-03")!;
    Object.assign(scope, { preventsStart: true, severity: "warning" });
    expect(() => validateReviewResults(input("story"), { criteriaVersion: CARD_REVIEW_CRITERIA_VERSION, status: "success", results })).toThrow("incorrect severity");
  });
});
