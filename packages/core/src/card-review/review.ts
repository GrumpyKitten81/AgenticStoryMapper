import { CARD_REVIEW_CRITERIA, DomainError, type CardReviewInput, type CardReviewReport, type CardReviewDecision } from "@storymapper/contracts";

export function canonicalReviewInput(input: CardReviewInput): unknown {
  const content = (card: CardReviewInput["card"]) => ({ id: card.id, level: card.level, cardType: card.cardType ?? null, title: card.title, description: card.description, parentId: card.parentId });
  const { id: _id, updatedAt: _time, ...productContext } = input.productContext;
  return { card: content(input.card), parents: input.parents.map(content), prerequisites: input.prerequisites.map((card) => ({ ...content(card), status: card.status, archived: card.archived ?? false })),
    prerequisiteCompletion: input.prerequisiteCompletion, githubSources: input.githubSources, productContext, sourceLinks: input.sourceLinks, sourceChunks: input.sourceChunks, outgoing: input.outgoing, exportFingerprint: input.exportFingerprint };
}

export function validateReviewResults(input: CardReviewInput, report: Pick<CardReviewReport, "status" | "results" | "error">): void {
  if (report.status === "error") {
    if (!report.error) throw new DomainError("validation", "Failed reviews require an error.");
    return;
  }
  if (report.error || report.results.length !== CARD_REVIEW_CRITERIA.length || new Set(report.results.map((result) => result.ruleId)).size !== CARD_REVIEW_CRITERIA.length) throw new DomainError("validation", "A successful review must contain every rule exactly once.");
  for (const rule of CARD_REVIEW_CRITERIA) {
    const result = report.results.find((entry) => entry.ruleId === rule.id)!;
    const applicable = rule.id === "DOR-01" || !input.card.cardType || (rule.types as readonly string[]).includes(input.card.cardType);
    if (applicable === (result.outcome === "not_applicable")) throw new DomainError("validation", `${rule.id} has incorrect applicability.`);
    const severity = rule.id === "DOR-03" && result.preventsStart ? "blocker" : rule.severity;
    if (result.severity !== severity) throw new DomainError("validation", `${rule.id} has incorrect severity.`);
    if (["finding", "unknown"].includes(result.outcome) && (!result.evidence.length || !result.advice.trim())) throw new DomainError("validation", `${rule.id} requires evidence and advice.`);
    if (rule.id === "DOR-01" && !input.card.cardType && result.outcome !== "finding") throw new DomainError("validation", "Missing Card type is a blocker.");
  }
}

export function effectiveReviewFindings(report: CardReviewReport, decisions: CardReviewDecision[]): CardReviewReport["results"] {
  const revoked = new Set(decisions.flatMap((decision) => decision.revokedDecisionId ?? []));
  const active = decisions.filter((decision) => !decision.revokedDecisionId && !revoked.has(decision.id) && decision.cardId === report.cardId);
  return report.results.filter((result) => ["finding", "unknown"].includes(result.outcome) && !active.some((decision) => decision.ruleId === result.ruleId && (decision.scope === "rule" || decision.inputFingerprint === report.inputFingerprint)));
}
