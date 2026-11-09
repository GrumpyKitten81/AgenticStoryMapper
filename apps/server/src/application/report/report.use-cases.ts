import { buildSourceDocumentSummaries } from "@storymapper/core";
import type { ActorContext, CapabilityDescriptor, BacklogHealthReport, SourceCoverageReport, ReleaseSummaryReport, ReleaseTimelineReport } from "@storymapper/contracts";
import { buildBacklogHealthReport, buildSourceCoverageReport, buildReleaseSummaryReport, buildReleaseTimelineReport } from "@storymapper/core";
import { requireActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireEntity } from "@storymapper/server/application/validation";

export const getBacklogHealthReportDescriptor: CapabilityDescriptor = { name: "getBacklogHealthReport", kind: "read", route: "GET /api/reports/backlog-health", tool: "GetBacklogHealthReport" };
export function getBacklogHealthReport(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): BacklogHealthReport {
  requireActor(actor);
  return buildBacklogHealthReport(requireEntity(deps.repository.getStoryMapReportData(storyMapId), "Story map"));
}

export const getSourceCoverageReportDescriptor: CapabilityDescriptor = { name: "getSourceCoverageReport", kind: "read", route: "GET /api/reports/source-coverage", tool: "GetSourceCoverageReport" };
export function getSourceCoverageReport(deps: ApplicationDeps, actor: ActorContext, projectId: string): SourceCoverageReport {
  requireActor(actor);
  return buildSourceCoverageReport(projectId, buildSourceDocumentSummaries(deps.repository.listSourceDocumentSummaryData(projectId)));
}

export const getReleaseSummaryReportDescriptor: CapabilityDescriptor = { name: "getReleaseSummaryReport", kind: "read", route: "GET /api/reports/release-summary", tool: "GetReleaseSummaryReport" };
export function getReleaseSummaryReport(deps: ApplicationDeps, actor: ActorContext, storyMapId: string, releaseId?: string | null, includeReleased?: boolean): ReleaseSummaryReport {
  requireActor(actor);
  const data = requireEntity(deps.repository.getStoryMapReportData(storyMapId), "Story map");
  return buildReleaseSummaryReport({ ...data, ...(releaseId !== undefined ? { releaseId } : {}), ...(includeReleased !== undefined ? { includeReleased } : {}) });
}

export const getReleaseTimelineReportDescriptor: CapabilityDescriptor = { name: "getReleaseTimelineReport", kind: "read", route: "GET /api/reports/release-timeline", tool: "GetReleaseTimelineReport" };
export function getReleaseTimelineReport(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): ReleaseTimelineReport {
  requireActor(actor);
  const data = requireEntity(deps.repository.getStoryMapReportData(storyMapId), "Story map");
  return buildReleaseTimelineReport(storyMapId, data.releases, data.cards, Date.now(), deps.repository.getStoryMapSnapshot(storyMapId));
}
