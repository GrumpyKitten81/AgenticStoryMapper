import type { FastifyPluginAsync } from "fastify";
import { createStoryMapRequestSchema, deleteStoryMapParamsSchema, updateStoryMapCommandSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { parseInput } from "@storymapper/server/application/http/validate";
import * as useCases from "@storymapper/server/application/story-map/story-map.use-cases";
import { baseVersionQuery, optionalQuery, registerApplicationRoute, routeParam } from "@storymapper/server/http/routes/application-route";
import { toApplicationDeps, type RouteDeps } from "@storymapper/server/http/routes/route-deps";

export const storyMapRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, useCases.deleteStoryMapDescriptor, (request) => useCases.deleteStoryMap(application, actor, parseInput(deleteStoryMapParamsSchema, { ...(request.params as object), baseVersion: baseVersionQuery(request) })));
  registerApplicationRoute(server, useCases.listStoryMapsDescriptor, (request) => useCases.listStoryMaps(application, actor, optionalQuery(request, "projectId")));
  registerApplicationRoute(server, useCases.createStoryMapDescriptor, (request, reply) => reply.code(201).send(useCases.createStoryMap(application, actor, parseInput(createStoryMapRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.updateStoryMapDescriptor, (request) => useCases.updateStoryMap(application, actor, routeParam(request, "storyMapId"), parseInput(updateStoryMapCommandSchema, request.body)));
  registerApplicationRoute(server, useCases.getStoryMapSnapshotDescriptor, (request) => useCases.getStoryMapSnapshot(application, actor, routeParam(request, "storyMapId")));
};
