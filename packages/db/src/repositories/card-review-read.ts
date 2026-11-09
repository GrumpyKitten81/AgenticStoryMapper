import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { DomainError, cardReviewInputSchema, cardReviewRequestHeaderRecordSchema, cardReviewSettingsSchema, type CardReviewQuery, type CardReviewInput, type CardReviewRequest, type CardReviewsResponse, type CardReviewRecordPayload, type CardReviewSummary, type ConnectorConnection, type RemotePushPlan, type StoryMapSnapshot } from "@storymapper/contracts";
import { canonicalReviewInput, effectiveReviewFindings } from "@storymapper/core";
import { cardReviewRecords, changeSets } from "@storymapper/db/schema";
import { parseStoredJson } from "@storymapper/db/versioned-json";
import { hashText } from "@storymapper/db/repositories/repository-values";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { captureReviewContext, capturePrerequisiteCompletion, captureGitHubSources, readReviewPlans, type ReviewCapture } from "@storymapper/db/repositories/card-review-capture";

type Repository = StoryMapperRepository<"root" | "transaction">;
export function readReviewRecords(repository: Repository, projectId: string, cardId?: string): Array<{ id: string; payload: CardReviewRecordPayload }> {
  return repository.db.select().from(cardReviewRecords).where(and(eq(cardReviewRecords.projectId, projectId), cardId ? sql`(${cardReviewRecords.cardId} = ${cardId} OR ${cardReviewRecords.cardId} IS NULL)` : undefined)).orderBy(asc(cardReviewRecords.createdAt), sql`rowid`).all().map((row) => ({ id: row.id, payload: parseStoredJson("card_review_records", "payload_json", row.payloadJson, row.payloadSchemaVersion) }));
}

type RequestHeader = Omit<CardReviewRequest, "input">;
type ReviewMetadata = Exclude<CardReviewRecordPayload, { kind: "request" }> | { kind: "request"; value: RequestHeader };
export function readReviewMetadata(repository: Repository, projectId: string, cardId?: string): ReviewMetadata[] {
  const rows = repository.db.select({ payloadJson: sql<string>`json_remove(${cardReviewRecords.payloadJson}, '$.value.input')`, version: cardReviewRecords.payloadSchemaVersion }).from(cardReviewRecords).where(and(eq(cardReviewRecords.projectId, projectId), cardId ? sql`(${cardReviewRecords.cardId} = ${cardId} OR ${cardReviewRecords.cardId} IS NULL)` : undefined)).orderBy(asc(cardReviewRecords.createdAt), sql`rowid`).all();
  return rows.map((row) => {
    const header = cardReviewRequestHeaderRecordSchema.safeParse(JSON.parse(row.payloadJson));
    if (header.success) {
      if (row.version !== 1) throw new DomainError("validation", "Unsupported review metadata version.");
      return header.data;
    }
    return parseStoredJson("card_review_records", "payload_json", row.payloadJson, row.version);
  });
}

export function reviewInput(repository: Repository, cardId: string, plan?: RemotePushPlan, snapshot?: StoryMapSnapshot, exportMapping?: ConnectorConnection["issueTypeMapping"], captured?: ReviewCapture): CardReviewInput {
  const card = snapshot?.cards.find((row) => row.id === cardId) ?? repository.getCardDetails(cardId);
  if (!card || card.level === "note") throw new DomainError("validation", "A review requires an existing non-Note Card.");
  const data = snapshot ?? repository.getStoryMapSnapshot(card.storyMapId)!;
  const capture = captured ?? captureReviewContext(repository, data, plan);
  const parents: CardReviewInput["parents"] = [];
  let parent = data.cards.find((row) => row.id === card.parentId);
  while (parent && !parents.some((row) => row.id === parent!.id)) { parents.push(parent); parent = data.cards.find((row) => row.id === parent!.parentId); }
  const prerequisites = data.cards.filter((row) => data.cardDependencies.some((link) => link.cardId === cardId && link.prerequisiteCardId === row.id)).sort((left, right) => left.id.localeCompare(right.id));
  const ids = new Set([cardId, ...parents.map((row) => row.id), ...prerequisites.map((row) => row.id)]);
  const sourceLinks = data.sourceLinks.filter((link) => ids.has(link.cardId) && !(link.kind === "github" && link.id === link.externalRefId && capture.selfProducedRefs.has(link.externalRefId))).sort((left, right) => left.id.localeCompare(right.id));
  const sourceChunks = data.sourceChunks.filter((chunk) => sourceLinks.some((link) => link.kind === "chunk" && link.chunkId === chunk.id)).sort((left, right) => left.id.localeCompare(right.id));
  const input: CardReviewInput = { card, parents, prerequisites, prerequisiteCompletion: capturePrerequisiteCompletion(prerequisites, capture), githubSources: captureGitHubSources(sourceLinks, capture), sourceLinks, sourceChunks, productContext: data.productContext ?? repository.getProductContext(data.storyMap.projectId, data.storyMap.id) };
  if (plan) {
    if (plan.projectId !== data.storyMap.projectId || plan.storyMapId !== card.storyMapId) throw new DomainError("validation", "Dry Run belongs to another Card scope.");
    input.outgoing = plan.items.flatMap((item) => item.kind === "issue" && item.entityId === cardId ? [{ title: item.payload.title, body: item.payload.body, issueType: item.payload.issueType }] : []);
    if (!input.outgoing.length) throw new DomainError("validation", "Card has no outgoing Issue in this Dry Run.");
    input.exportFingerprint = hashText(JSON.stringify({ mapping: (exportMapping ?? repository.getConnectorConnection(plan.connectionId)?.issueTypeMapping ?? []).filter((entry) => entry.cardType === card.cardType), mapName: data.storyMap.name, prefix: data.storyMap.cardKeyPrefix }));
  }
  return input;
}

export function reviewFingerprint(input: CardReviewInput): string { return hashText(JSON.stringify(canonicalReviewInput(cardReviewInputSchema.parse(input)))); }

export function isReviewCurrent(repository: Repository, request: RequestHeader, snapshot?: StoryMapSnapshot, cached?: { epoch: string | undefined; plan: RemotePushPlan | undefined; exportMapping: ConnectorConnection["issueTypeMapping"] | undefined; capture?: ReviewCapture }): boolean {
  if ((cached ? cached.epoch : repository.getSafetySettings(request.projectId).epoch) !== request.epoch) return false;
  const card = snapshot?.cards.find((row) => row.id === request.cardId) ?? repository.getCardDetails(request.cardId);
  if (!card || card.level === "note") return false;
  const plan = cached ? cached.plan : request.planId ? repository.getRemotePushPlan(request.planId)?.plan : undefined;
  if (request.planId && !plan) return false;
  return reviewFingerprint(reviewInput(repository, request.cardId, plan, snapshot, cached?.exportMapping, cached?.capture)) === request.inputFingerprint;
}

export function getCardReviews(this: Repository, projectId: string, storyMapId?: string, options: Omit<CardReviewQuery, "storyMapId" | "planId"> = {}): CardReviewsResponse {
  if (!this.listProjects().some((project) => project.id === projectId)) throw new DomainError("not_found", "Project not found.");
  const records = readReviewMetadata(this, projectId, options.cardId);
  const maps = this.listStoryMaps(projectId).filter((map) => !storyMapId || map.id === storyMapId);
  if (storyMapId && !maps.length) throw new DomainError("not_found", "Story Map not found in this Project.");
  const snapshots = maps.map((map) => this.getStoryMapSnapshot(map.id)!);
  const ids = new Set(snapshots.flatMap((snapshot) => snapshot.cards.filter((card) => !options.cardId || card.id === options.cardId).map((card) => card.id)));
  const requests = records.flatMap((record) => record.kind === "request" && ids.has(record.value.cardId) ? [record.value] : []);
  const reports = records.flatMap((record) => record.kind === "report" && ids.has(record.value.cardId) ? [record.value] : []);
  const decisions = records.flatMap((record) => record.kind === "decision" && ids.has(record.value.cardId) ? [record.value] : []);
  const fixes = records.flatMap((record) => record.kind === "fix" && ids.has(record.value.cardId) ? [{ ...record.value }] : []);
  for (const record of records) if (record.kind === "fixProposal") { const fix = fixes.find((row) => row.id === record.value.fixId); if (fix) fix.changeSetId = record.value.changeSetId; }
  const runningRequestIds = records.flatMap((record) => record.kind === "start" && requests.some((request) => request.id === record.value.requestId) ? [record.value.requestId] : []);
  const settings = [...records].reverse().find((record) => record.kind === "settings");
  const proposedFixIds = fixes.flatMap((fix) => fix.changeSetId ?? []);
  const appliedChanges = new Set(proposedFixIds.length ? this.db.select({ id: changeSets.id }).from(changeSets).where(and(inArray(changeSets.id, proposedFixIds), eq(changeSets.status, "applied"))).all().map((row) => row.id) : []);
  const appliedFixIds = new Set(fixes.filter((fix) => fix.changeSetId && appliedChanges.has(fix.changeSetId)).map((fix) => fix.id));
  const data = { appliedFixIds, settings: settings?.kind === "settings" ? settings.value : cardReviewSettingsSchema.parse({}), requests, reports, decisions, fixes, runningRequestIds };
  const epoch = this.getSafetySettings(projectId).epoch;
  const connections = new Map(this.listConnectorConnections(projectId).map((connection) => [connection.id, connection.issueTypeMapping]));
  const savedPlans = new Map(snapshots.map((snapshot) => [snapshot.storyMap.id, readReviewPlans(this, snapshot.storyMap.id)]));
  const plans = new Map([...savedPlans.values()].flatMap((rows) => rows.map(({ plan }) => [plan.id, plan] as const)));
  const captures = new Map<string, ReviewCapture>();
  const current = (request: RequestHeader, snapshot: StoryMapSnapshot) => {
    const plan = request.planId ? plans.get(request.planId) : undefined;
    const key = `${snapshot.storyMap.id}:${plan?.id ?? "manual"}`;
    let capture = captures.get(key);
    if (!capture) { capture = captureReviewContext(this, snapshot, plan, savedPlans.get(snapshot.storyMap.id)!); captures.set(key, capture); }
    return isReviewCurrent(this, request, snapshot, { epoch, plan, exportMapping: plan ? connections.get(plan.connectionId) ?? [] : undefined, capture });
  };
  const summaries = snapshots.flatMap((snapshot) => snapshot.cards.filter((card) => card.level !== "note" && ids.has(card.id)).map((card) => reviewSummary(data, card.id, snapshot, current)));
  const { appliedFixIds: _applied, ...response } = data;
  if (options.summaryOnly) return { ...response, requests: [], reports: [], decisions: [], fixes: [], summaries };
  const detailed = readReviewRecords(this, projectId, options.cardId).flatMap(({ payload }) => payload.kind === "request" && ids.has(payload.value.cardId) ? [payload.value] : []);
  return { ...response, requests: detailed, summaries };
}

export function reviewSummary(data: Omit<CardReviewsResponse, "summaries" | "requests"> & { requests: RequestHeader[]; appliedFixIds: Set<string> }, cardId: string, snapshot: StoryMapSnapshot, current: (request: RequestHeader, snapshot: StoryMapSnapshot) => boolean): CardReviewSummary {
  const requests = data.requests.filter((row) => row.cardId === cardId).reverse();
  const request = requests.find((row) => current(row, snapshot)) ?? requests[0];
  const report = request && data.reports.find((row) => row.requestId === request.id);
  const effective = report ? effectiveReviewFindings(report, data.decisions) : [];
  const summary: CardReviewSummary = { cardId, state: "missing", unresolvedCount: effective.length, highestSeverity: effective.some((row) => row.severity === "blocker") ? "blocker" : effective.length ? "warning" : null, ignoredFindingIds: report?.results.filter((row) => ["finding", "unknown"].includes(row.outcome) && !effective.includes(row)).map((row) => row.id) ?? [] };
  if (!request) return summary;
  summary.requestId = request.id;
  if (report) summary.reportId = report.id;
  summary.state = !current(request, snapshot) ? "stale" : !report ? data.runningRequestIds.includes(request.id) ? "running" : "pending" : report.status === "error" ? "error" : "reviewed";
  if (summary.state === "stale" && data.fixes.some((fix) => fix.reportId === report?.id && fix.changeSetId && data.appliedFixIds?.has(fix.id))) summary.state = "awaiting_verification";
  return summary;
}

export function getCardReviewSettings(this: Repository, projectId: string): CardReviewsResponse["settings"] {
  const row = this.db.select().from(cardReviewRecords).where(and(eq(cardReviewRecords.projectId, projectId), sql`json_extract(${cardReviewRecords.payloadJson}, '$.kind') = 'settings'`)).orderBy(sql`rowid DESC`).limit(1).get();
  const payload = row && parseStoredJson("card_review_records", "payload_json", row.payloadJson, row.payloadSchemaVersion);
  return payload?.kind === "settings" ? payload.value : cardReviewSettingsSchema.parse({});
}

export function getReviewFixForChangeSet(this: Repository, projectId: string, changeSetId: string): CardReviewsResponse["fixes"][number] | undefined {
  const row = this.db.select().from(cardReviewRecords).where(and(eq(cardReviewRecords.projectId, projectId), sql`json_extract(${cardReviewRecords.payloadJson}, '$.kind') = 'fixProposal' AND json_extract(${cardReviewRecords.payloadJson}, '$.value.changeSetId') = ${changeSetId}`)).limit(1).get();
  if (!row) return undefined;
  const proposal = parseStoredJson("card_review_records", "payload_json", row.payloadJson, row.payloadSchemaVersion);
  if (proposal.kind !== "fixProposal") throw new DomainError("validation", "Invalid correction proposal evidence.");
  const fixed = this.db.select().from(cardReviewRecords).where(and(eq(cardReviewRecords.projectId, projectId), sql`json_extract(${cardReviewRecords.payloadJson}, '$.kind') = 'fix' AND json_extract(${cardReviewRecords.payloadJson}, '$.value.id') = ${proposal.value.fixId}`)).limit(1).get();
  const fix = fixed && parseStoredJson("card_review_records", "payload_json", fixed.payloadJson, fixed.payloadSchemaVersion);
  if (fix?.kind !== "fix") throw new DomainError("validation", "Correction selection evidence is missing.");
  return { ...fix.value, changeSetId };
}
