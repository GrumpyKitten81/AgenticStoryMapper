import * as drift from "@storymapper/server/application/report/plan-drift.use-cases";
import { mcpToolInputSchemas } from "@storymapper/contracts";
import { parseInput } from "@storymapper/server/application/http/validate";
import * as plans from "@storymapper/server/application/report/plan-state.use-cases";
import type { FastifyPluginAsync } from "fastify";
import { localHumanActor } from "@storymapper/server/application/actors";
import * as useCases from "@storymapper/server/application/report/report.use-cases";
import { registerApplicationRoute, requiredQuery, optionalQuery, routeParam } from "@storymapper/server/http/routes/application-route";
import { toApplicationDeps, type RouteDeps } from "@storymapper/server/http/routes/route-deps";

export const reportRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, drift.listPlanDriftSystemsDescriptor, (request) => drift.listPlanDriftSystems(application, actor, routeParam(request, "storyMapId")));
  registerApplicationRoute(server, drift.getPlanDriftReportDescriptor, (request) => drift.getPlanDriftReport(application, actor, routeParam(request, "storyMapId"), requiredQuery(request, "system")));
  registerApplicationRoute(server, plans.capturePlanStateDescriptor, (request) => plans.capturePlanState(application, actor, routeParam(request, "storyMapId")));
  registerApplicationRoute(server, plans.listPlanStatesDescriptor, (request) => plans.listPlanStates(application, actor, routeParam(request, "storyMapId")));
  registerApplicationRoute(server, plans.comparePlanStatesDescriptor, (request) => plans.comparePlanStates(application, actor, routeParam(request, "storyMapId"), requiredQuery(request, "beforeId"), requiredQuery(request, "afterId")));
  registerApplicationRoute(server, plans.getPlanStateDescriptor, (request) => plans.getPlanState(application, actor, routeParam(request, "storyMapId"), routeParam(request, "stateId")));
  registerApplicationRoute(server, plans.getSlicesReportDescriptor, (request) => plans.getSlicesReport(application, actor, routeParam(request, "storyMapId")));
  registerApplicationRoute(server, useCases.getBacklogHealthReportDescriptor, (request) => useCases.getBacklogHealthReport(application, actor, requiredQuery(request, "storyMapId")));
  registerApplicationRoute(server, useCases.getSourceCoverageReportDescriptor, (request) => useCases.getSourceCoverageReport(application, actor, requiredQuery(request, "projectId")));
  registerApplicationRoute(server, useCases.getReleaseTimelineReportDescriptor, (request) => useCases.getReleaseTimelineReport(application, actor, requiredQuery(request, "storyMapId")));
  registerApplicationRoute(server, useCases.getReleaseSummaryReportDescriptor, (request) => {
    const releaseId = optionalQuery(request, "releaseId");
    const includeReleased = optionalQuery(request, "includeReleased");
    const input = parseInput(mcpToolInputSchemas.GetReleaseSummaryReport, {
      storyMapId: requiredQuery(request, "storyMapId"), releaseId: releaseId === "unscheduled" ? null : releaseId,
      includeReleased: includeReleased === "true" ? true : includeReleased === "false" ? false : includeReleased
    });
    return useCases.getReleaseSummaryReport(application, actor, input.storyMapId, input.releaseId, input.includeReleased);
  });
};
