import { agentAccessEnabled } from "@storymapper/core";
import * as drift from "@storymapper/server/application/report/plan-drift.use-cases";
import * as plans from "@storymapper/server/application/report/plan-state.use-cases";
import { mcpToolInputSchemas as inputs } from "@storymapper/contracts";
import * as sources from "@storymapper/server/application/source-document/source-document.use-cases";
import { listChangeSets } from "@storymapper/server/application/changeset/changeset.use-cases";
import { getProductContext, upsertProductContext } from "@storymapper/server/application/project/project.use-cases";
import { createAiProposal, listAiTemplates } from "@storymapper/server/application/ai/ai.use-cases";
import { getReleaseNotes } from "@storymapper/server/application/release/release.use-cases";
import * as reports from "@storymapper/server/application/report/report.use-cases";
import { exportAudit, exportStoryMap } from "@storymapper/server/application/export/export.use-cases";
import { registerTool, type RegistrationContext } from "@storymapper/server/mcp/tools/register-tools";
import { canReadChangeSet } from "@storymapper/server/mcp/tools/project-scopes";
import { prepareSourceDocumentImport } from "@storymapper/server/services/prepare-source-document-import";

export function registerContentTools(context: RegistrationContext): void {
  const { application, actor, repository } = context;
  registerTool(context, "ImportSourceDocument", async (input) => {
    const parsed = inputs.ImportSourceDocument.parse(input);
    return { data: sources.importSourceDocument(application, actor, prepareSourceDocumentImport(parsed)) };
  });
  registerTool(context, "ListSourceDocuments", async (input) => {
    const { projectId } = inputs.ListSourceDocuments.parse(input);
    const projectIds = projectId ? [projectId] : repository.listProjects().filter((project) => agentAccessEnabled(repository.getSafetySettings(project.id))).map((project) => project.id);
    return { data: { documents: projectIds.flatMap((id) => sources.listSourceDocuments(application, actor, id).documents) } };
  });
  registerTool(context, "GetSourceDocument", async (input) => ({ data: sources.getSourceDocument(application, actor, inputs.GetSourceDocument.parse(input).documentId) }));
  registerTool(context, "ListChangeSets", async (input) => {
    const { projectId } = inputs.ListChangeSets.parse(input);
    return { data: { changeSets: listChangeSets(application, actor, projectId).changeSets.filter((changeSet) => canReadChangeSet(repository, changeSet)) } };
  });
  registerTool(context, "GetProductContext", async (input) => { const { projectId, storyMapId } = inputs.GetProductContext.parse(input); return { data: getProductContext(application, actor, projectId, storyMapId) }; });
  registerTool(context, "UpsertProductContext", (input) => ({ data: upsertProductContext(application, actor, inputs.UpsertProductContext.parse(input)) }), undefined, true);
  registerTool(context, "ListAiTemplates", async (input) => ({ data: listAiTemplates(application, actor, inputs.ListAiTemplates.parse(input).projectId) }));
  registerTool(context, "CreateAiProposal", (input) => createAiProposal(application, actor, inputs.CreateAiProposal.parse(input)), undefined, true);
  registerTool(context, "GetReleaseNotes", (input) => ({ data: getReleaseNotes(application, actor, inputs.GetReleaseNotes.parse(input)) }));
  registerReportTools(context);
}

function registerReportTools(context: RegistrationContext): void {
  const { application, actor } = context;
  registerTool(context, "ListPlanDriftSystems", (input) => ({ data: drift.listPlanDriftSystems(application, actor, inputs.ListPlanDriftSystems.parse(input).storyMapId) }));
  registerTool(context, "GetPlanDriftReport", (input) => { const { storyMapId, system } = inputs.GetPlanDriftReport.parse(input); return { data: drift.getPlanDriftReport(application, actor, storyMapId, system) }; });
  registerTool(context, "GetSlicesReport", (input) => ({ data: plans.getSlicesReport(application, actor, inputs.GetSlicesReport.parse(input).storyMapId) }));
  registerTool(context, "ListPlanStates", (input) => ({ data: plans.listPlanStates(application, actor, inputs.ListPlanStates.parse(input).storyMapId) }));
  registerTool(context, "GetPlanState", (input) => { const { storyMapId, stateId } = inputs.GetPlanState.parse(input); return { data: plans.getPlanState(application, actor, storyMapId, stateId) }; });
  registerTool(context, "ComparePlanStates", (input) => { const { storyMapId, beforeId, afterId } = inputs.ComparePlanStates.parse(input); return { data: plans.comparePlanStates(application, actor, storyMapId, beforeId, afterId) }; });
  registerTool(context, "GetBacklogHealthReport", async (input) => ({ data: reports.getBacklogHealthReport(application, actor, inputs.GetBacklogHealthReport.parse(input).storyMapId) }));
  registerTool(context, "GetSourceCoverageReport", async (input) => ({ data: reports.getSourceCoverageReport(application, actor, inputs.GetSourceCoverageReport.parse(input).projectId) }));
  registerTool(context, "GetReleaseSummaryReport", async (input) => { const { storyMapId, releaseId, includeReleased } = inputs.GetReleaseSummaryReport.parse(input); return { data: reports.getReleaseSummaryReport(application, actor, storyMapId, releaseId, includeReleased) }; });
  registerTool(context, "GetReleaseTimelineReport", async (input) => ({ data: reports.getReleaseTimelineReport(application, actor, inputs.GetReleaseTimelineReport.parse(input).storyMapId) }));
  registerTool(context, "ExportStoryMap", async (input) => { const { storyMapId, format } = inputs.ExportStoryMap.parse(input); return { data: exportStoryMap(application, actor, storyMapId, format) }; });
  registerTool(context, "ExportAudit", async (input) => { const { projectId, format } = inputs.ExportAudit.parse(input); return { data: exportAudit(application, actor, projectId, format) }; });
}
