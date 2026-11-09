import { describe, expect, it } from "vitest";
import { CARD_REVIEW_CRITERIA, cardReviewInputSchema, cardSchema, cardTypeSchema, productContextSchema, type CardReviewReport } from "@storymapper/contracts";
import { validateReviewResults } from "@storymapper/core/card-review/review";

const id = "11111111-1111-4111-8111-111111111111";
const time = "2026-11-04T12:00:00.000Z";
function input(cardType: typeof cardTypeSchema._output | null) {
  return cardReviewInputSchema.parse({ card: cardSchema.parse({ id, storyMapId: id, parentId: null, releaseId: null, key: "TEST-1", level: "story", cardType, title: "Concrete outcome", position: 0, version: 1, creationOrigin: "manual", provenance: "manual", createdAt: time, updatedAt: time }), parents: [], prerequisites: [], sourceLinks: [], sourceChunks: [], productContext: productContextSchema.parse({ id, projectId: id, storyMapId: id, updatedAt: time }) });
}
describe("authoritative review criteria", () => {
  it.each(cardTypeSchema.options)("requires exact applicability for %s", (type) => {
    const results = CARD_REVIEW_CRITERIA.map((rule) => ({ id, ruleId: rule.id, severity: rule.severity, outcome: (rule.types as readonly string[]).includes(type) ? "pass" as const : "not_applicable" as const, evidence: [], advice: "" }));
    expect(() => validateReviewResults(input(type), { status: "success", results })).not.toThrow();
    expect(() => validateReviewResults(input(type), { status: "success", results: results.slice(1) })).toThrow("every rule");
  });
  it("never passes a missing explicit type and only escalates DOR-03 when work cannot start", () => {
    const results: CardReviewReport["results"] = CARD_REVIEW_CRITERIA.map((rule) => ({ id, ruleId: rule.id, severity: rule.severity, outcome: "pass", evidence: [], advice: "" }));
    expect(() => validateReviewResults(input(null), { status: "success", results })).toThrow("Missing Card type");
    const scope = results.find((result) => result.ruleId === "DOR-03")!;
    Object.assign(scope, { preventsStart: true, severity: "warning" });
    expect(() => validateReviewResults(input("story"), { status: "success", results })).toThrow("incorrect severity");
  });
});
