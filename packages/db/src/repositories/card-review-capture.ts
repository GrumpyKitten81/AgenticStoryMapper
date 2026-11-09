import { and, eq, inArray, sql } from "drizzle-orm";
import { DomainError, cardReviewInputSchema, type CardReviewInput, type RemotePushPlan, type RemotePushPlanResponse, type RemotePushEffect, type StoryMapSnapshot } from "@storymapper/contracts";
import { isCardCompleted, stripGitHubIssueFooter } from "@storymapper/core";
import { remotePushPlans, remotePushExecutions, externalRefs, remoteWorkItemLinks, storyMaps, cardReviewRecords } from "@storymapper/db/schema";
import { hashText } from "@storymapper/db/repositories/repository-values";
import { parseStoredJson } from "@storymapper/db/versioned-json";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

type Repository = StoryMapperRepository<"root" | "transaction">;
export interface ReviewCapture { snapshot: StoryMapSnapshot; observed: Map<string, { title: string; body: string }>; selfProducedRefs: Set<string>; completionLinks: StoryMapSnapshot["remoteWorkItemLinks"]; sources: Map<string, { projectId: string; url: string; titleHash: string | null; bodyHash: string | null }> }
function linkedSourceRevisions(repository: Repository, snapshot: StoryMapSnapshot) {
  const ids = snapshot.sourceLinks.flatMap((source) => source.kind === "github" ? [source.externalRefId] : []);
  if (!ids.length) return [];
  return repository.db.select({ ref: externalRefs, link: remoteWorkItemLinks, projectId: storyMaps.projectId }).from(externalRefs).innerJoin(storyMaps, eq(storyMaps.id, externalRefs.scopeId)).leftJoin(remoteWorkItemLinks, eq(remoteWorkItemLinks.externalRefId, externalRefs.id)).where(inArray(externalRefs.id, ids)).all();
}
export function readReviewPlans(repository: Repository, storyMapId: string): RemotePushPlanResponse[] {
  return repository.db.select({ plan: remotePushPlans, execution: remotePushExecutions }).from(remotePushPlans).innerJoin(remotePushExecutions, eq(remotePushExecutions.planId, remotePushPlans.id)).where(eq(remotePushPlans.storyMapId, storyMapId)).orderBy(sql`${remotePushPlans}.rowid DESC`).all().map(({ plan, execution }) => ({ plan: parseStoredJson("remote_push_plans", "plan_json", plan.planJson, plan.planSchemaVersion), execution: parseStoredJson("remote_push_executions", "execution_json", execution.executionJson, execution.executionSchemaVersion) }));
}
interface IssueObservation { url: string; title: string; body: string; state: string | undefined }
function issueObservation(value: unknown): IssueObservation | undefined {
  if (!value || typeof value !== "object" || !("url" in value) || typeof value.url !== "string" || !("title" in value) || typeof value.title !== "string" || !("body" in value) || typeof value.body !== "string") return undefined;
  return { url: value.url, title: value.title, body: value.body, state: "state" in value && typeof value.state === "string" ? value.state : undefined };
}
function observedIssues(plans: RemotePushPlanResponse[]): ReviewCapture["observed"] {
  const observations = plans.flatMap(({ plan, execution }) => plan.items.flatMap((item) => {
    if (item.kind !== "issue") return [];
    const before = issueObservation(item.remoteBefore), outcome = execution.items.find((row) => row.itemId === item.id);
    const after = issueObservation(outcome?.remoteResult);
    return [...(after && outcome?.completedAt ? [{ at: outcome.completedAt, value: after }] : []), ...(before ? [{ at: plan.createdAt, value: before }] : [])];
  })).sort((left, right) => right.at.localeCompare(left.at));
  const observed: ReviewCapture["observed"] = new Map();
  for (const { value } of observations) if (!observed.has(value.url)) observed.set(value.url, { title: value.title, body: value.body });
  return observed;
}
function producedIssue(link: StoryMapSnapshot["remoteWorkItemLinks"][number], plan: RemotePushPlan, execution: RemotePushPlanResponse["execution"] | undefined): Extract<RemotePushEffect, { kind: "issue" }> | undefined {
  if (link.connectionId !== plan.connectionId) return undefined;
  return plan.items.find((item): item is Extract<RemotePushEffect, { kind: "issue" }> => {
    if (item.kind !== "issue" || item.entityId !== link.cardId || item.action === "create" && link.remoteState !== item.payload.remoteState) return false;
    const remoteId = item.payload.remoteId ?? execution?.items.find((outcome) => outcome.itemId === item.issueItemId)?.remoteId;
    if (item.action === "update" && remoteId !== link.remoteId) return false;
    const outcome = execution?.items.find((result) => result.itemId === item.id), remote = issueObservation(outcome?.remoteResult);
    return !!outcome && ["remote_succeeded", "local_failed", "succeeded"].includes(outcome.state) && outcome.remoteId === link.remoteId && outcome.url === link.url && remote?.url === link.url && remote.title === item.payload.title && remote.body === item.payload.body && remote.state === item.payload.remoteState;
  });
}
function matchesPlanBinding(link: StoryMapSnapshot["remoteWorkItemLinks"][number], item: Extract<RemotePushEffect, { kind: "issue" }>, inputs: Array<Pick<CardReviewInput, "githubSources" | "prerequisiteCompletion">>, observation: { title: string; body: string } | undefined, createdByPlan: boolean): boolean {
  const after = link.titleHash === hashText(item.payload.title) && link.bodyHash === hashText(stripGitHubIssueFooter(item.payload.body));
  const observesAfter = observation?.title === item.payload.title && observation.body === item.payload.body;
  if (createdByPlan) return after && link.remoteState === item.payload.remoteState && observesAfter;
  const before = issueObservation(item.remoteBefore);
  if (!before || !observesAfter && !(observation?.title === before.title && observation.body === before.body)) return false;
  const source = inputs.flatMap((input) => input.githubSources).find((row) => row.externalRefId === link.externalRefId);
  const originalHashes = source ? link.titleHash === (source.titleHash ?? undefined) && link.bodyHash === (source.bodyHash ?? undefined) : link.titleHash === hashText(before.title) && link.bodyHash === hashText(stripGitHubIssueFooter(before.body));
  const prerequisite = inputs.flatMap((input) => input.prerequisiteCompletion.flatMap((completion) => completion.github)).find((row) => row.externalRefId === link.externalRefId);
  const stateMatches = !prerequisite || (link.remoteState ?? null) === prerequisite.remoteState || link.remoteState === item.payload.remoteState;
  return (after || originalHashes) && stateMatches;
}

const planBaselineSchema = cardReviewInputSchema.pick({ githubSources: true, prerequisiteCompletion: true });
function capturedPlanBaselines(repository: Repository, plan: RemotePushPlan): Array<Pick<CardReviewInput, "githubSources" | "prerequisiteCompletion">> {
  return repository.db.select({ version: cardReviewRecords.payloadSchemaVersion, evidence: sql<string>`json_object('githubSources', json_extract(${cardReviewRecords.payloadJson}, '$.value.input.githubSources'), 'prerequisiteCompletion', json_extract(${cardReviewRecords.payloadJson}, '$.value.input.prerequisiteCompletion'))` }).from(cardReviewRecords).where(and(eq(cardReviewRecords.projectId, plan.projectId), sql`json_extract(${cardReviewRecords.payloadJson}, '$.kind') = 'request' AND json_extract(${cardReviewRecords.payloadJson}, '$.value.planId') = ${plan.id}`)).orderBy(sql`rowid`).all().map((row) => {
    if (row.version !== 1) throw new DomainError("validation", "Unsupported review evidence version.");
    return planBaselineSchema.parse(JSON.parse(row.evidence));
  });
}

export function captureReviewContext(repository: Repository, snapshot: StoryMapSnapshot, plan?: RemotePushPlan, savedPlans = readReviewPlans(repository, snapshot.storyMap.id)): ReviewCapture {
  const revisions = linkedSourceRevisions(repository, snapshot);
  const sourceMaps = [...new Set(revisions.map((row) => row.ref.scopeId))].filter((id) => id !== snapshot.storyMap.id);
  const sourcePlans = sourceMaps.flatMap((id) => readReviewPlans(repository, id));
  const observed = observedIssues([...savedPlans, ...sourcePlans]);
  if (plan && !savedPlans.some((saved) => saved.plan.id === plan.id)) for (const item of plan.items) { const before = issueObservation(item.remoteBefore); if (before) observed.set(before.url, { title: before.title, body: before.body }); }
  const execution = plan && savedPlans.find((row) => row.plan.id === plan.id)?.execution;
  const candidates = snapshot.remoteWorkItemLinks.flatMap((link) => { const item = plan && producedIssue(link, plan, execution); return item ? [{ link, item }] : []; });
  const inputs = plan && candidates.some(({ item }) => item.action === "update") ? capturedPlanBaselines(repository, plan) : [];
  const produced = new Map(candidates.filter(({ link, item }) => matchesPlanBinding(link, item, inputs, observed.get(link.url), !!plan?.items.some((effect) => effect.kind === "issue" && effect.entityId === item.entityId && effect.action === "create"))).map(({ link, item }) => [link.externalRefId, item] as const));
  const selfProducedRefs = new Set([...produced].flatMap(([id, item]) => plan?.items.some((effect) => effect.kind === "issue" && effect.entityId === item.entityId && effect.action === "create") ? [id] : []));
  const sources = new Map(revisions.map(({ ref, link, projectId }) => [ref.id, { projectId, url: ref.externalId, titleHash: link?.titleHash ?? null, bodyHash: link?.bodyHash ?? null }]));
  for (const [id, item] of produced) {
    if (item.action !== "update" || selfProducedRefs.has(id)) continue;
    const before = issueObservation(item.remoteBefore), revision = sources.get(id);
    if (!before || !revision) continue;
    const captured = inputs.flatMap((input) => input.githubSources).find((source) => source.externalRefId === id);
    sources.set(id, { ...revision, titleHash: captured ? captured.titleHash : hashText(before.title), bodyHash: captured ? captured.bodyHash : hashText(stripGitHubIssueFooter(before.body)) });
    observed.set(revision.url, { title: before.title, body: before.body });
  }
  const completionLinks = snapshot.remoteWorkItemLinks.filter((link) => !selfProducedRefs.has(link.externalRefId)).map((link) => {
    const item = produced.get(link.externalRefId), before = item?.action === "update" && issueObservation(item.remoteBefore);
    if (!before) return link;
    const captured = inputs.flatMap((input) => input.prerequisiteCompletion.flatMap((completion) => completion.github)).find((evidence) => evidence.externalRefId === link.externalRefId);
    return { ...link, remoteState: captured ? captured.remoteState ?? undefined : before.state };
  });
  return { snapshot, observed, selfProducedRefs, completionLinks, sources };
}

export function capturePrerequisiteCompletion(cards: CardReviewInput["prerequisites"], capture: ReviewCapture): CardReviewInput["prerequisiteCompletion"] {
  const links = capture.completionLinks;
  return cards.map((card) => {
    const owned = links.filter((link) => link.cardId === card.id);
    const definition = capture.snapshot.workflowStatuses.find((status) => status.name === card.status && status.storyMapId === card.storyMapId) ?? capture.snapshot.workflowStatuses.find((status) => status.name === card.status && status.storyMapId === null);
    return { cardId: card.id, completed: isCardCompleted(card, links, capture.snapshot.workflowStatuses), status: card.status, workflowGroup: owned.length ? null : definition?.group ?? null, github: owned.map((link) => ({ connectionId: link.connectionId, externalRefId: link.externalRefId, remoteState: link.remoteState ?? null, issueState: link.statusEvidence?.issueState ?? null })).sort((a, b) => a.externalRefId.localeCompare(b.externalRefId)) };
  });
}

export function captureGitHubSources(sourceLinks: CardReviewInput["sourceLinks"], capture: ReviewCapture): CardReviewInput["githubSources"] {
  return sourceLinks.flatMap((source) => {
    if (source.kind !== "github") return [];
    const revision = capture.sources.get(source.externalRefId);
    if (!revision) throw new DomainError("not_found", "Linked GitHub source identity is unavailable.");
    const url = revision.url;
    const observation = capture.observed.get(url);
    const matchesRevision = observation && (!revision.titleHash || revision.titleHash === hashText(observation.title)) && (!revision.bodyHash || revision.bodyHash === hashText(stripGitHubIssueFooter(observation.body)));
    const remoteBefore = matchesRevision ? observation : null;
    return [{ sourceLinkId: source.id, externalRefId: source.externalRefId, projectId: revision.projectId, url, titleHash: revision.titleHash, bodyHash: revision.bodyHash, remoteBefore, contentAvailability: remoteBefore ? "exact" as const : revision.titleHash || revision.bodyHash ? "hash_only" as const : "unavailable" as const }];
  });
}
