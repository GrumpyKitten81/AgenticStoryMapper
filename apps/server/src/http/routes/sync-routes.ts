import type { FastifyPluginAsync } from "fastify";
import {
  applyWorkItemSyncRequestSchema, confirmRemotePushRequestSchema, resumeRemotePushRequestSchema,
  importWorkItemsRequestSchema, lookupGitHubTicketRequestSchema, importGitHubTicketRequestSchema,
  planWorkItemSyncRequestSchema,
  pullStoryMapWorkItemsRequestSchema,
  resolveSyncConflictRequestSchema,
  syncWorkItemsRequestSchema
} from "@storymapper/contracts";
import type { RouteDeps } from "@storymapper/server/http/routes/route-deps";
import { toApplicationDeps } from "@storymapper/server/http/routes/route-deps";
import { localHumanActor } from "@storymapper/server/application/actors";
import { parseInput } from "@storymapper/server/application/http/validate";
import * as remotePush from "@storymapper/server/application/sync/remote-push.use-cases";
import * as useCases from "@storymapper/server/application/sync/sync.use-cases";
import { resolveSyncConflict, resolveSyncConflictDescriptor } from "@storymapper/server/application/sync/sync-conflict.use-cases";
import { registerApplicationRoute, requiredQuery, routeParam } from "@storymapper/server/http/routes/application-route";

export const syncRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, useCases.lookupGitHubTicketDescriptor, (request) => useCases.lookupGitHubTicket(application, actor, parseInput(lookupGitHubTicketRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.importGitHubTicketDescriptor, (request) => useCases.importGitHubTicket(application, actor, parseInput(importGitHubTicketRequestSchema, request.body)));
  registerApplicationRoute(server, remotePush.getRemotePushPlanDescriptor, (request) => remotePush.getRemotePushPlan(application, actor, routeParam(request, "planId")));
  registerApplicationRoute(server, remotePush.confirmRemotePushPlanDescriptor, (request) => remotePush.confirmRemotePushPlan(application, actor, parseInput(confirmRemotePushRequestSchema, request.body)));
  registerApplicationRoute(server, remotePush.resumeRemotePushPlanDescriptor, (request) => remotePush.resumeRemotePushPlan(application, actor, parseInput(resumeRemotePushRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.planWorkItemsDescriptor, async (request) => ({ plan: await useCases.planWorkItems(application, actor, parseInput(planWorkItemSyncRequestSchema, request.body)) }));
  registerApplicationRoute(server, useCases.pushWorkItemsDescriptor, (request) => useCases.pushWorkItems(application, actor, parseInput(applyWorkItemSyncRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.importWorkItemsDescriptor, (request) => useCases.importWorkItems(application, actor, parseInput(importWorkItemsRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.syncWorkItemsDescriptor, (request) => useCases.syncWorkItems(application, actor, parseInput(syncWorkItemsRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.pullStoryMapWorkItemsDescriptor, (request) => useCases.pullStoryMapWorkItems(application, actor, parseInput(pullStoryMapWorkItemsRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.getWorkItemSyncHealthDescriptor, (request) => useCases.getWorkItemSyncHealth(application, actor, requiredQuery(request, "storyMapId")));
  registerApplicationRoute(server, resolveSyncConflictDescriptor, (request) => resolveSyncConflict(application, actor, routeParam(request, "conflictId"), parseInput(resolveSyncConflictRequestSchema, request.body)));
};
