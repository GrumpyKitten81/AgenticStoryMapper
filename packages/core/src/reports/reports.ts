import { isCardCompleted } from "@storymapper/core/story-map/github-status";
import { isoDateMilliseconds, millisecondsIsoDate } from "@storymapper/core/reports/iso-date";
import { DomainError, type BacklogHealthReport, type BacklogHealthReportInput, type Card, type Release, type ReleaseSummaryReport, type ReleaseSummaryReportInput, type ReleaseTimelineReport, type SourceCoverageReport, type SourceDocument, type SourceDocumentSummary, type SourceDocumentSummaryData } from "@storymapper/contracts";
import { calculateBacklogHealth, calculateSourceCoverage, visibleCards } from "@storymapper/core";

export function buildSourceDocumentSummary(document: SourceDocument, chunkIds: string[], linkedChunkIds: string[]): SourceDocumentSummary {
  const coverage = calculateSourceCoverage({ chunkIds, linkedChunkIds });
  return { ...document, chunkCount: coverage.totalChunks, linkedChunkCount: coverage.coveredChunks, coverageRatio: coverage.coverageRatio };
}

export function buildBacklogHealthReport(input: BacklogHealthReportInput): BacklogHealthReport {
  const cards = visibleCards(input.cards);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const issues = calculateBacklogHealth({ ...input, cards }).map((issue) => ({ ...issue, cardKey: byId.get(issue.cardId)!.key, cardTitle: byId.get(issue.cardId)!.title }));
  const issueCounts: BacklogHealthReport["issueCounts"] = { "missing-description": 0, "missing-estimate": 0, "missing-source": 0, "missing-github-link": 0 };
  for (const issue of issues) issueCounts[issue.type] = (issueCounts[issue.type] ?? 0) + 1;
  const totalStories = cards.filter((card) => card.level === "story").length;
  const healthyStories = totalStories - new Set(issues.map((issue) => issue.cardId)).size;
  return { storyMapId: input.storyMapId, totalStories, healthyStories, readinessRatio: totalStories ? healthyStories / totalStories : 0, issueCounts, issues };
}

export function buildSourceCoverageReport(projectId: string, documents: SourceDocumentSummary[]): SourceCoverageReport {
  const totalChunks = documents.reduce((sum, document) => sum + document.chunkCount, 0);
  const linkedChunks = documents.reduce((sum, document) => sum + document.linkedChunkCount, 0);
  return { projectId, documents, totalChunks, linkedChunks, coverageRatio: totalChunks ? linkedChunks / totalChunks : 0 };
}

export function buildReleaseSummaryReport(input: ReleaseSummaryReportInput): ReleaseSummaryReport {
  const release = input.releaseId ? input.releases.find((candidate) => candidate.id === input.releaseId) : undefined;
  if (input.releaseId && !release) throw new DomainError("not_found", `Release ${input.releaseId} not found.`);
  const releasedIds = new Set(input.releases.filter((candidate) => candidate.released).map((candidate) => candidate.id));
  const stories = visibleCards(input.cards).filter((card) => card.level === "story" && (input.releaseId === undefined ? input.includeReleased !== false || !card.releaseId || !releasedIds.has(card.releaseId) : card.releaseId === input.releaseId));
  const unestimatedStories = stories.filter((card) => card.estimate === undefined || card.estimate === null).map((card) => ({ cardId: card.id, cardKey: card.key, cardTitle: card.title }));
  const sourceIds = new Set(input.sourceLinkedCardIds);
  const githubIds = new Set(input.githubLinkedCardIds);
  const statusCounts: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const card of stories) statusCounts[card.status] = (statusCounts[card.status] ?? 0) + 1;
  return {
    storyMapId: input.storyMapId, scope: input.releaseId === undefined ? "all" : input.releaseId === null ? "unscheduled" : "release", releaseId: input.releaseId ?? null,
    releaseName: release?.name ?? (input.releaseId === null ? "Unscheduled" : "All releases"), totalCards: stories.length, totalStories: stories.length,
    estimateTotal: stories.reduce((sum, card) => sum + (card.estimate ?? 0), 0), unestimatedCards: unestimatedStories.length, unestimatedStories, statusCounts,
    riskCounts: { missingDescription: stories.filter((card) => !card.description.trim()).length, missingSource: stories.filter((card) => !sourceIds.has(card.id)).length, missingGitHubLink: stories.filter((card) => !githubIds.has(card.id)).length }
  };
}

function daysBetween(start: number, end: number): number {
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function buildReleaseTimelineReport(storyMapId: string, releases: Release[], cards: Card[], now: number, statusContext?: { remoteWorkItemLinks?: readonly import("@storymapper/contracts").RemoteWorkItemLink[]; workflowStatuses?: readonly import("@storymapper/contracts").WorkflowStatus[] }): ReleaseTimelineReport {
  const visible = visibleCards(cards);
  const timestamps = releases.flatMap((release) => [release.startDate, release.releaseDate].filter((date): date is string => Boolean(date)).map((date) => isoDateMilliseconds(date))).filter(Number.isFinite);
  const minTime = timestamps.length ? Math.min(...timestamps) : undefined;
  const maxTime = timestamps.length ? Math.max(...timestamps) : undefined;
  return {
    storyMapId, startDate: minTime === undefined ? null : millisecondsIsoDate(minTime), endDate: maxTime === undefined ? null : millisecondsIsoDate(maxTime),
    items: releases.map((release) => {
      const stories = visible.filter((card) => card.releaseId === release.id && card.level === "story");
      const doneStories = stories.filter((card) => isCardCompleted(card, statusContext?.remoteWorkItemLinks, statusContext?.workflowStatuses)).length;
      const start = release.startDate ? isoDateMilliseconds(release.startDate) : minTime ?? now;
      const end = release.releaseDate ? isoDateMilliseconds(release.releaseDate) : start;
      return { release, totalStories: stories.length, doneStories, estimateTotal: stories.reduce((sum, card) => sum + (card.estimate ?? 0), 0), progressRatio: stories.length ? doneStories / stories.length : 0, startOffsetDays: minTime === undefined ? 0 : daysBetween(minTime, start), durationDays: Math.max(1, daysBetween(start, end) + 1) };
    })
  };
}

export function buildSourceDocumentSummaries(data: SourceDocumentSummaryData[]): SourceDocumentSummary[] {
  return data.map(({ document, chunkIds, linkedChunkIds }) => buildSourceDocumentSummary(document, chunkIds, linkedChunkIds));
}
