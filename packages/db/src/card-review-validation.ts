import type Database from "better-sqlite3";
import { cardReviewRecordPayloadSchema, cardTypeSchema, DomainError, type CardReviewRecordPayload } from "@storymapper/contracts";
import { validateReviewResults } from "@storymapper/core";
import { reviewFingerprint } from "@storymapper/db/repositories/card-review-read";

interface ReviewRow { project_id: string; card_id: string | null; payload_json: string; }
function invalid(): never { throw new DomainError("validation", "Snapshot contains inconsistent Card review ownership or evidence."); }
export function validateCardReviewRows(database: Database.Database): void {
  for (const card of database.prepare("SELECT card_type, level FROM cards").iterate() as Iterable<{ card_type: string | null; level: string }>) {
    if (card.card_type !== null && (card.level === "note" || !cardTypeSchema.safeParse(card.card_type).success)) invalid();
  }
  const owners = new Map((database.prepare("SELECT cards.id, story_maps.project_id FROM cards JOIN story_maps ON story_maps.id = cards.story_map_id").all() as Array<{ id: string; project_id: string }>).map((row) => [row.id, row.project_id]));
  const records = (database.prepare("SELECT project_id, card_id, payload_json FROM card_review_records ORDER BY rowid").all() as ReviewRow[]).map((row) => ({ ...row, payload: cardReviewRecordPayloadSchema.parse(JSON.parse(row.payload_json)) }));
  const requests = new Map(records.flatMap(({ payload }) => payload.kind === "request" ? [[payload.value.id, payload.value] as const] : []));
  const reports = new Map(records.flatMap(({ payload }) => payload.kind === "report" ? [[payload.value.id, payload.value] as const] : []));
  const decisions = new Map(records.flatMap(({ payload }) => payload.kind === "decision" ? [[payload.value.id, payload.value] as const] : []));
  const fixes = new Map(records.flatMap(({ payload }) => payload.kind === "fix" ? [[payload.value.id, payload.value] as const] : []));
  for (const row of records) {
    const { payload, project_id: projectId, card_id: cardId } = row;
    if (cardId && owners.get(cardId) !== projectId) invalid();
    if ("projectId" in payload.value && payload.value.projectId !== projectId) invalid();
    if ("cardId" in payload.value && payload.value.cardId !== cardId) invalid();
    if (payload.kind === "request" && (payload.value.input.card.id !== cardId || reviewFingerprint(payload.value.input) !== payload.value.inputFingerprint)) invalid();
    if (payload.kind === "report") {
      const request = requests.get(payload.value.requestId);
      if (!request || request.cardId !== cardId || request.projectId !== projectId || request.inputFingerprint !== payload.value.inputFingerprint || payload.value.actor.actorType !== "agent") invalid();
      validateReviewResults(request.input, payload.value);
    }
    if (payload.kind === "decision" || payload.kind === "fix") {
      const report = reports.get(payload.value.reportId);
      if (!report || report.cardId !== cardId || report.inputFingerprint !== payload.value.inputFingerprint || payload.value.actor.actorType !== "human") invalid();
      const ids = payload.kind === "fix" ? payload.value.findingIds : [payload.value.findingId];
      if (ids.some((id) => !report.results.some((result) => result.id === id && ["finding", "unknown"].includes(result.outcome)))) invalid();
      if (payload.kind === "decision" && payload.value.revokedDecisionId && decisions.get(payload.value.revokedDecisionId)?.cardId !== cardId) invalid();
    }
    validateReviewLinks(database, payload, projectId, cardId, requests, fixes);
  }
}
function validateReviewLinks(database: Database.Database, payload: CardReviewRecordPayload, projectId: string, cardId: string | null, requests: Map<string, { cardId: string; projectId: string }>, fixes: Map<string, { cardId: string; projectId: string }>): void {
  if (payload.kind === "start" && (requests.get(payload.value.requestId)?.cardId !== cardId || requests.get(payload.value.requestId)?.projectId !== projectId)) invalid();
  if (payload.kind === "fixProposal") {
    if (fixes.get(payload.value.fixId)?.cardId !== cardId || fixes.get(payload.value.fixId)?.projectId !== projectId) invalid();
    if (!(database.prepare("SELECT id FROM change_sets WHERE id = ? AND project_id = ?").get(payload.value.changeSetId, projectId))) invalid();
  }
  if (payload.kind === "override" && (payload.value.actor.actorType !== "human" || !(database.prepare("SELECT id FROM remote_push_plans WHERE id = ? AND project_id = ?").get(payload.value.planId, projectId)))) invalid();
}
