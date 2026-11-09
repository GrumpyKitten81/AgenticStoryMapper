import { CARD_REVIEW_CRITERIA_VERSION, CARD_REVIEW_SKILL_VERSION, DomainError, type CardReviewsResponse, type CardReviewSummary, type RemotePushPlan } from "@storymapper/contracts";
import { effectiveReviewFindings } from "@storymapper/core";
import { readReviewMetadata, readReviewRecords, reviewFingerprint, reviewInput } from "@storymapper/db/repositories/card-review-read";
import { captureReviewContext } from "@storymapper/db/repositories/card-review-capture";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

type Repository = StoryMapperRepository<"root" | "transaction">;
export function getCardPushReadiness(this: Repository, plan: RemotePushPlan): NonNullable<CardReviewsResponse["pushReadiness"]> {
  const records = readReviewMetadata(this, plan.projectId);
  const requests = records.flatMap((row) => row.kind === "request" ? [row.value] : []);
  const reports = records.flatMap((row) => row.kind === "report" ? [row.value] : []);
  const decisions = records.flatMap((row) => row.kind === "decision" ? [row.value] : []);
  const running = new Set(records.flatMap((row) => row.kind === "start" ? [row.value.requestId] : []));
  const settings = this.getCardReviewSettings(plan.projectId);
  const epoch = this.getSafetySettings(plan.projectId).epoch;
  const execution = this.getRemotePushPlan(plan.id)?.execution;
  const capture = captureReviewContext(this, this.getStoryMapSnapshot(plan.storyMapId)!, plan);
  const mapping = this.getConnectorConnection(plan.connectionId)?.issueTypeMapping;
  const cardIds = [...new Set(plan.items.flatMap((item) => item.kind === "issue" ? [item.entityId] : []))];
  const fingerprints = cardIds.map((id) => reviewFingerprint(reviewInput(this, id, plan, capture.snapshot, mapping, capture)));
  const overridden = settings.allowHumanPushOverride && readReviewRecords(this, plan.projectId).some(({ payload }) => payload.kind === "override" && payload.value.actor.actorType === "human" && payload.value.planId === plan.id && JSON.stringify(payload.value.inputFingerprints) === JSON.stringify(fingerprints));
  const cards = cardIds.map((cardId, index) => {
    const matching = requests.filter((row) => row.cardId === cardId && row.epoch === epoch && row.inputFingerprint === fingerprints[index] && row.criteriaVersion === CARD_REVIEW_CRITERIA_VERSION && row.skillVersion === CARD_REVIEW_SKILL_VERSION).reverse();
    const matchingIds = new Set(matching.map((request) => request.id));
    const report = [...reports].reverse().find((row) => matchingIds.has(row.requestId) && row.status === "success") ?? reports.find((row) => row.requestId === matching[0]?.id);
    const request = report ? matching.find((row) => row.id === report.requestId) : matching[0];
    const effective = report ? effectiveReviewFindings(report, decisions) : [];
    const summary: CardReviewSummary = { cardId, state: report ? report.status === "error" ? "error" : "reviewed" : request ? running.has(request.id) ? "running" : "pending" : "missing", unresolvedCount: effective.length, highestSeverity: effective.some((row) => row.severity === "blocker") ? "blocker" : effective.length ? "warning" : null, ignoredFindingIds: report?.results.filter((row) => ["finding", "unknown"].includes(row.outcome) && !effective.includes(row)).map((row) => row.id) ?? [], ...(request ? { requestId: request.id } : {}), ...(report ? { reportId: report.id } : {}) };
    const completed = plan.items.filter((item) => item.kind === "issue" && item.entityId === cardId).every((item) => execution?.items.some((result) => result.itemId === item.id && result.state === "succeeded"));
    return { cardId, key: capture.snapshot.cards.find((card) => card.id === cardId)!.key, ready: completed || report?.status === "success" && !effective.some((result) => result.severity === "blocker" || result.outcome === "unknown"), summary };
  });
  const required = plan.actor.actorType === "agent" && settings.reviewBeforeAgentPush;
  return { planId: plan.id, required, overridden, ready: !required || overridden || cards.every((card) => card.ready), cards };
}

export function assertCardReviewsForPush(this: Repository, plan: RemotePushPlan): void {
  if (plan.actor.actorType !== "agent" || !this.getCardReviewSettings(plan.projectId).reviewBeforeAgentPush) return;
  const readiness = this.getCardPushReadiness(plan);
  if (!readiness.ready) throw new DomainError("protected", "Agent-origin outgoing Issues require a current successful DoR review with no effective blockers. Run card-dor-review against the captured Dry Run, or use an enabled human override.", { planId: plan.id, cardId: readiness.cards.find((card) => !card.ready)?.cardId });
}
