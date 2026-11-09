import { agentAccessEnabled } from "@storymapper/core";
import { randomUUID } from "node:crypto";
import { DomainError, cardReviewCommandSchema, type ActorContext, type CapabilityDescriptor, type CardReviewCommand, type CardReviewQuery, type CardReviewRequest, type CardReviewsResponse } from "@storymapper/contracts";
import { isReviewCurrent } from "@storymapper/db";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireActor, requireHumanActor } from "@storymapper/server/application/actors";

export const getCardReviewsDescriptor: CapabilityDescriptor = { name: "getCardReviews", kind: "read", tool: "GetCardReviews", route: "GET /api/projects/:projectId/card-reviews" };
export const commandCardReviewDescriptor: CapabilityDescriptor = { name: "commandCardReview", kind: "write", tool: "CardReview", route: "POST /api/projects/:projectId/card-reviews" };

export function getCardReviews(deps: ApplicationDeps, actor: ActorContext, projectId: string, storyMapId?: string, query: Omit<CardReviewQuery, "storyMapId"> = {}): CardReviewsResponse {
  requireActor(actor);
  assertProjectAccess(deps.repository, actor, projectId);
  const data = deps.repository.getCardReviews(projectId, storyMapId, { ...(query.cardId ? { cardId: query.cardId } : {}), summaryOnly: actor.actorType !== "agent" && query.summaryOnly });
  const authorized = authorizedResponse(deps.repository, actor, projectId, data);
  if (query.planId) {
    const plan = deps.repository.getRemotePushPlan(query.planId)?.plan;
    if (!plan || plan.projectId !== projectId || storyMapId && plan.storyMapId !== storyMapId) throw new DomainError("not_found", "Dry Run not found in this scope.");
    if (actor.actorType === "agent" && !deps.repository.getSafetySettings(projectId).github) throw new DomainError("disabled", "Required GitHub review evidence is disabled.");
    authorized.pushReadiness = deps.repository.getCardPushReadiness(plan);
  }
  return query.summaryOnly ? { ...authorized, requests: [], reports: [], decisions: [], fixes: [] } : authorized;
}

export function commandCardReview(deps: ApplicationDeps, actor: ActorContext, projectId: string, input: CardReviewCommand): CardReviewsResponse {
  requireActor(actor);
  const command = cardReviewCommandSchema.parse(input);
  assertProjectAccess(deps.repository, actor, projectId);
  deps.unitOfWork.run(actor, ({ repository }) => {
    assertCommandEvidenceAccess(repository, actor, projectId, command);
    if (command.action === "request") {
      repository.requestCardReviews(projectId, command.cardIds, command.planId ? "push" : "manual", command.planId);
    } else if (command.action === "submit") repository.submitCardReview(projectId, command.report);
    else if (command.action === "ignore" || command.action === "revoke") repository.decideCardReview(projectId, command);
    else if (command.action === "fix") repository.requestCardReviewFix(projectId, command.reportId, command.findingIds);
    else if (command.action === "proposeFix") proposeFix(repository, actor, projectId, command);
    else if (command.action === "settings") {
      requireHumanActor(actor);
      repository.appendReviewRecord(projectId, null, { kind: "settings", value: command.settings });
    } else if (command.action === "start") {
      if (actor.actorType !== "agent") throw new DomainError("protected", "Only an invoking agent can start a review.");
      const data = repository.getCardReviews(projectId);
      const request = data.requests.find((row) => row.id === command.requestId);
      if (!request || data.reports.some((report) => report.requestId === request.id)) throw new DomainError("conflict", "Review request is missing or completed.");
      if (!data.runningRequestIds.includes(request.id)) repository.appendReviewRecord(projectId, request.cardId, { kind: "start", value: { requestId: request.id, actor } });
    }
  });
  return getCardReviews(deps, actor, projectId);
}

type TransactionRepository = Parameters<Parameters<ApplicationDeps["unitOfWork"]["run"]>[1]>[0]["repository"];
function proposeFix(repository: TransactionRepository, actor: ActorContext, projectId: string, command: Extract<CardReviewCommand, { action: "proposeFix" }>): void {
  if (actor.actorType !== "agent") throw new DomainError("protected", "An invoking agent must propose the selected correction.");
  const data = repository.getCardReviews(projectId);
  const fix = data.fixes.find((row) => row.id === command.fixId);
  const report = data.reports.find((row) => row.id === fix?.reportId);
  const request = data.requests.find((row) => row.id === report?.requestId);
  if (!fix || !request || !isReviewCurrent(repository, request) || repository.getCard(fix.cardId)?.version !== fix.baseVersion) throw new DomainError("conflict", "Correction request is stale.");
  if (fix.changeSetId) throw new DomainError("conflict", "A correction proposal already exists for this selection.");
  const changeSet = repository.createChangeSet({ id: randomUUID(), projectId, title: `DoR corrections for ${request.input.card.key}`, source: "ai", proposedBy: actor, createdAt: new Date().toISOString(), operations: [{ operationId: randomUUID(), entity: "card", op: "update", entityId: fix.cardId, baseVersion: fix.baseVersion, after: command.patch }] });
  repository.appendReviewRecord(projectId, fix.cardId, { kind: "fixProposal", value: { fixId: fix.id, changeSetId: changeSet.id } });
}

type EvidenceRepository = Pick<ApplicationDeps["repository"], "getSafetySettings" | "getSourceDocumentDetails" | "getGitHubLink" | "getCard" | "getStoryMapOrThrow">;
function assertProjectAccess(repository: EvidenceRepository, actor: ActorContext, projectId: string): void {
  if (actor.actorType === "agent" && !agentAccessEnabled(repository.getSafetySettings(projectId))) throw new DomainError("disabled", "Agent access is disabled for this Project.");
}
function inaccessibleEvidence(repository: EvidenceRepository, projectId: string, request: CardReviewRequest): string | undefined {
  if (!repository.getSafetySettings(projectId).github && (request.planId || request.input.sourceLinks.some((link) => link.kind === "github") || request.input.prerequisiteCompletion.some((row) => row.github.length))) return "Review evidence includes GitHub data while GitHub access is disabled.";
  for (const source of request.input.githubSources) {
    const identity = repository.getGitHubLink(source.externalRefId), card = identity?.cardId ? repository.getCard(identity.cardId) : undefined;
    const owner = card && repository.getStoryMapOrThrow(card.storyMapId).projectId;
    if (!owner || !agentAccessEnabled(repository.getSafetySettings(owner)) || !repository.getSafetySettings(owner).github) return "Review requires GitHub source evidence that this agent cannot access.";
  }
  for (const documentId of new Set(request.input.sourceChunks.map((chunk) => chunk.documentId))) {
    const document = repository.getSourceDocumentDetails(documentId)?.document;
    if (!document || !agentAccessEnabled(repository.getSafetySettings(document.projectId))) return "Review requires source evidence that this agent cannot access.";
  }
}
function authorizedResponse(repository: EvidenceRepository, actor: ActorContext, projectId: string, data: CardReviewsResponse): CardReviewsResponse {
  if (actor.actorType !== "agent") return data;
  const inaccessibleRequestIds = data.requests.filter((request) => inaccessibleEvidence(repository, projectId, request)).map((request) => request.id);
  const denied = new Set(inaccessibleRequestIds);
  const reports = data.reports.filter((report) => !denied.has(report.requestId));
  const reportIds = new Set(reports.map((report) => report.id));
  return { ...data, inaccessibleRequestIds, requests: data.requests.filter((request) => !denied.has(request.id)), reports, decisions: data.decisions.filter((decision) => reportIds.has(decision.reportId)), fixes: data.fixes.filter((fix) => reportIds.has(fix.reportId)), runningRequestIds: data.runningRequestIds.filter((id) => !denied.has(id)), summaries: data.summaries.map((summary) => summary.requestId && denied.has(summary.requestId) ? { cardId: summary.cardId, state: "missing", unresolvedCount: 0, highestSeverity: null, ignoredFindingIds: [] } : summary) };
}
function assertCommandEvidenceAccess(repository: TransactionRepository, actor: ActorContext, projectId: string, command: CardReviewCommand): void {
  if (actor.actorType !== "agent" || !["start", "submit", "proposeFix"].includes(command.action)) return;
  const data = repository.getCardReviews(projectId);
  const requestId = command.action === "start" ? command.requestId : command.action === "submit" ? command.report.requestId : command.action === "proposeFix" ? data.reports.find((report) => report.id === data.fixes.find((fix) => fix.id === command.fixId)?.reportId)?.requestId : undefined;
  const request = data.requests.find((row) => row.id === requestId);
  if (!request) throw new DomainError("not_found", "Review request not found in this Project.");
  const reason = inaccessibleEvidence(repository, projectId, request);
  if (reason) throw new DomainError("disabled", reason, { requestId });
}
