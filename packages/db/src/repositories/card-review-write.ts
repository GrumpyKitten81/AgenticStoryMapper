import { randomUUID } from "node:crypto";
import { CARD_REVIEW_CRITERIA_VERSION, CARD_REVIEW_SKILL_VERSION, DomainError, cardReviewRecordPayloadSchema, type ActorContext, type CardReviewRequest, type CardReviewRecordPayload, type CardReviewReport, type CardReviewCommand, type CardReviewDecision, type CardReviewFix } from "@storymapper/contracts";
import { agentAccessEnabled, effectiveReviewFindings, validateReviewResults } from "@storymapper/core";
import { cardReviewRecords } from "@storymapper/db/schema";
import { captureReviewContext } from "@storymapper/db/repositories/card-review-capture";
import { isReviewCurrent, readReviewRecords, reviewFingerprint, reviewInput } from "@storymapper/db/repositories/card-review-read";
import { assertAgentWriteSafety } from "@storymapper/db/repositories/projects-repository";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

type Repository = StoryMapperRepository<"transaction">;
export function appendReviewRecord(this: Repository, projectId: string, cardId: string | null, payload: CardReviewRecordPayload): string {
  this.assertWritable();
  if (this.actor.actorType !== "human") assertAgentWriteSafety(this, projectId);
  if (!this.listProjects().some((project) => project.id === projectId)) throw new DomainError("not_found", "Project not found.");
  if (cardId && (!this.getCard(cardId) || this.getStoryMapOrThrow(this.getCard(cardId)!.storyMapId).projectId !== projectId)) throw new DomainError("validation", "Card belongs to another Project.");
  const id = randomUUID();
  const value = cardReviewRecordPayloadSchema.parse(payload);
  if (["settings", "decision", "fix", "override"].includes(value.kind) && this.actor.actorType !== "human") throw new DomainError("protected", "Review settings and decisions are human-only.");
  if (["report", "start", "fixProposal"].includes(value.kind) && this.actor.actorType !== "agent") throw new DomainError("protected", "Review output requires an invoking agent.");
  this.db.insert(cardReviewRecords).values({ id, projectId, cardId, payloadJson: JSON.stringify(value), payloadSchemaVersion: 1, createdAt: new Date().toISOString() }).run();
  this.logActivity(projectId, `cardReview.${value.kind}`, "cardReview", id, undefined, { cardId, kind: value.kind, reviewRecordId: id, ...("id" in value.value ? { reviewId: value.value.id } : {}), ...("inputFingerprint" in value.value ? { inputFingerprint: value.value.inputFingerprint } : {}) });
  return id;
}

export function requestCardReview(this: Repository, projectId: string, cardId: string, purpose: CardReviewRequest["purpose"] = "manual", planId?: string, origin?: { changeSetId: string; actor: ActorContext }): CardReviewRequest {
  return this.requestCardReviews(projectId, [cardId], purpose, planId, origin)[0]!;
}

export function requestCardReviews(this: Repository, projectId: string, cardIds: string[], purpose: CardReviewRequest["purpose"] = "manual", planId?: string, origin?: { changeSetId: string; actor: ActorContext }): CardReviewRequest[] {
  this.assertWritable();
  const plan = planId ? this.getRemotePushPlan(planId)?.plan : undefined;
  if (planId && !plan) throw new DomainError("not_found", "Dry Run not found.");
  const records = readReviewRecords(this, projectId).map((row) => row.payload);
  const requestsByCard = new Map<string, CardReviewRequest[]>();
  for (const record of records) if (record.kind === "request") requestsByCard.set(record.value.cardId, [...(requestsByCard.get(record.value.cardId) ?? []), record.value]);
  const successful = new Set(records.flatMap((record) => record.kind === "report" && record.value.status === "success" ? [record.value.requestId] : []));
  const completed = new Set(records.flatMap((record) => record.kind === "report" ? [record.value.requestId] : []));
  const safety = this.getSafetySettings(projectId);
  const mapping = plan && this.getConnectorConnection(plan.connectionId)?.issueTypeMapping;
  const captures = new Map<string, ReturnType<typeof captureReviewContext>>();
  const authorizedDocuments = new Set<string>();
  return [...new Set(cardIds)].map((cardId) => {
    const card = this.getCard(cardId);
    if (!card || this.getStoryMapOrThrow(card.storyMapId).projectId !== projectId) throw new DomainError("validation", "Card belongs to another Project.");
    let capture = captures.get(card.storyMapId);
    if (!capture) { capture = captureReviewContext(this, this.getStoryMapSnapshot(card.storyMapId)!, plan); captures.set(card.storyMapId, capture); }
    const input = reviewInput(this, cardId, plan, capture.snapshot, mapping, capture);
    assertCapturedAccess(this, projectId, input, authorizedDocuments);
    const inputFingerprint = reviewFingerprint(input);
    const matching = (requestsByCard.get(cardId) ?? []).filter((request) => request.inputFingerprint === inputFingerprint && request.epoch === safety.epoch && request.criteriaVersion === CARD_REVIEW_CRITERIA_VERSION && request.skillVersion === CARD_REVIEW_SKILL_VERSION).reverse();
    const previous = matching.find((request) => successful.has(request.id)) ?? matching.find((request) => !completed.has(request.id) && request.planId === planId);
    if (previous) return previous;
    const request: CardReviewRequest = { id: randomUUID(), projectId, cardId, purpose, ...(planId ? { planId } : {}), ...(origin ? { changeSetId: origin.changeSetId, initiatedBy: origin.actor } : {}), input, inputFingerprint, epoch: safety.epoch!, criteriaVersion: CARD_REVIEW_CRITERIA_VERSION, skillVersion: CARD_REVIEW_SKILL_VERSION, actor: this.actor, createdAt: new Date().toISOString() };
    this.appendReviewRecord(projectId, cardId, { kind: "request", value: request });
    requestsByCard.set(cardId, [...(requestsByCard.get(cardId) ?? []), request]);
    return request;
  });
}

function assertCapturedAccess(repository: Repository, projectId: string, input: CardReviewRequest["input"], authorizedDocuments: Set<string>): void {
  if (repository.actor.actorType !== "agent") return;
  if (!repository.getSafetySettings(projectId).github && (input.outgoing || input.sourceLinks.some((link) => link.kind === "github") || input.prerequisiteCompletion.some((row) => row.github.length))) throw new DomainError("disabled", "Required GitHub review evidence is disabled.");
  for (const source of input.githubSources) {
    const safety = repository.getSafetySettings(source.projectId);
    if (!agentAccessEnabled(safety) || !safety.github) throw new DomainError("disabled", "Required GitHub source evidence is not authorized.");
  }
  for (const chunk of input.sourceChunks) {
    if (authorizedDocuments.has(chunk.documentId)) continue;
    const source = repository.getSourceDocumentDetails(chunk.documentId)?.document;
    if (!source || !agentAccessEnabled(repository.getSafetySettings(source.projectId))) throw new DomainError("disabled", "Required review source evidence is not authorized.");
    authorizedDocuments.add(chunk.documentId);
  }
}

export function submitCardReview(this: Repository, projectId: string, submission: Extract<CardReviewCommand, { action: "submit" }>["report"]): CardReviewReport {
  if (this.actor.actorType !== "agent") throw new DomainError("protected", "Only an invoking agent can submit a review report.");
  const records = readReviewRecords(this, projectId).map((row) => row.payload);
  const request = records.find((record) => record.kind === "request" && record.value.id === submission.requestId);
  if (request?.kind !== "request") throw new DomainError("not_found", "Review request not found in this Project.");
  if (submission.inputFingerprint !== request.value.inputFingerprint || submission.criteriaVersion !== request.value.criteriaVersion || submission.skillVersion !== request.value.skillVersion) throw new DomainError("conflict", "Report does not match the captured review input and versions.");
  const previous = records.find((record) => record.kind === "report" && record.value.requestId === submission.requestId);
  if (previous?.kind === "report") {
    const original = { ...previous.value, results: previous.value.results.map(({ id: _id, ...result }) => result) };
    const { id: _id, projectId: _project, cardId: _card, actor: _actor, createdAt: _time, ...retained } = original;
    if (JSON.stringify(retained) !== JSON.stringify(submission)) throw new DomainError("conflict", "An immutable report already exists for this request with different output.");
    return previous.value;
  }
  const report: CardReviewReport = { ...submission, id: randomUUID(), projectId, cardId: request.value.cardId, actor: this.actor, createdAt: new Date().toISOString(), results: submission.results.map((result) => ({ ...result, id: randomUUID() })) };
  validateReviewResults(request.value.input, report);
  this.appendReviewRecord(projectId, report.cardId, { kind: "report", value: report });
  return report;
}

export function decideCardReview(this: Repository, projectId: string, command: Extract<CardReviewCommand, { action: "ignore" | "revoke" }>): CardReviewDecision {
  if (this.actor.actorType !== "human") throw new DomainError("protected", "Review decisions are human-only.");
  const data = this.getCardReviews(projectId);
  const previous = command.action === "revoke" ? data.decisions.find((decision) => decision.id === command.decisionId) : undefined;
  if (command.action === "revoke" && (!previous || previous.revokedDecisionId || data.decisions.some((decision) => decision.revokedDecisionId === previous.id))) throw new DomainError("conflict", "Exception does not exist or is already revoked.");
  const report = data.reports.find((row) => row.id === (command.action === "ignore" ? command.reportId : previous!.reportId));
  const finding = report?.results.find((row) => row.id === (command.action === "ignore" ? command.findingId : previous!.findingId) && ["finding", "unknown"].includes(row.outcome));
  if (!report || !finding) throw new DomainError("validation", "Finding not found in this Project.");
  if (command.action === "ignore" && !effectiveReviewFindings(report, data.decisions).some((result) => result.id === finding.id)) throw new DomainError("conflict", "Finding is already ignored.");
  const decision: CardReviewDecision = { id: randomUUID(), projectId, cardId: report.cardId, reportId: report.id, findingId: finding.id, ruleId: finding.ruleId, inputFingerprint: report.inputFingerprint, scope: command.action === "ignore" ? command.scope : previous!.scope, reason: command.reason, actor: this.actor, createdAt: new Date().toISOString(), ...(previous ? { revokedDecisionId: previous.id } : {}) };
  this.appendReviewRecord(projectId, report.cardId, { kind: "decision", value: decision });
  return decision;
}

export function requestCardReviewFix(this: Repository, projectId: string, reportId: string, findingIds: string[]): CardReviewFix {
  if (this.actor.actorType !== "human") throw new DomainError("protected", "Correction selections are human-only.");
  const data = this.getCardReviews(projectId);
  const report = data.reports.find((row) => row.id === reportId);
  const request = data.requests.find((row) => row.id === report?.requestId);
  if (!report || !request || !isReviewCurrent(this, request)) throw new DomainError("conflict", "Correction requires a current reviewed input.");
  if (new Set(findingIds).size !== findingIds.length || findingIds.some((id) => !effectiveReviewFindings(report, data.decisions).some((row) => row.id === id && row.outcome === "finding"))) throw new DomainError("validation", "Select findings from this report.");
  const fix: CardReviewFix = { id: randomUUID(), projectId, cardId: report.cardId, reportId, findingIds, inputFingerprint: report.inputFingerprint, baseVersion: this.getCard(report.cardId)!.version, actor: this.actor, createdAt: new Date().toISOString() };
  this.appendReviewRecord(projectId, report.cardId, { kind: "fix", value: fix });
  return fix;
}
