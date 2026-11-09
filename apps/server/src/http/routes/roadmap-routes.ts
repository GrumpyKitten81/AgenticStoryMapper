import type { FastifyPluginAsync } from "fastify";
import { createRoadmapRequestSchema, updateRoadmapCommandSchema, createRoadmapColumnRequestSchema, createRoadmapSwimlaneRequestSchema, createRoadmapCardRequestSchema, createRoadmapReferenceRequestSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { parseInput } from "@storymapper/server/application/http/validate";
import * as useCases from "@storymapper/server/application/roadmap/roadmap.use-cases";
import { registerApplicationRoute, requiredQuery, optionalQuery, routeParam } from "@storymapper/server/http/routes/application-route";
import { toApplicationDeps, type RouteDeps } from "@storymapper/server/http/routes/route-deps";

export const roadmapRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, useCases.listRoadmapsDescriptor, (request) => useCases.listRoadmaps(application, actor, requiredQuery(request, "projectId"), optionalQuery(request, "storyMapId")));
  registerApplicationRoute(server, useCases.createRoadmapDescriptor, (request, reply) => reply.code(201).send(useCases.createRoadmap(application, actor, parseInput(createRoadmapRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.getRoadmapDetailsDescriptor, (request) => useCases.getRoadmapDetails(application, actor, routeParam(request, "roadmapId")));
  registerApplicationRoute(server, useCases.updateRoadmapDescriptor, (request) => useCases.updateRoadmap(application, actor, routeParam(request, "roadmapId"), parseInput(updateRoadmapCommandSchema, request.body)));
  registerApplicationRoute(server, useCases.createRoadmapColumnDescriptor, (request, reply) => reply.code(201).send(useCases.createRoadmapColumn(application, actor, parseInput(createRoadmapColumnRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.createRoadmapSwimlaneDescriptor, (request, reply) => reply.code(201).send(useCases.createRoadmapSwimlane(application, actor, parseInput(createRoadmapSwimlaneRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.createRoadmapCardDescriptor, (request, reply) => reply.code(201).send(useCases.createRoadmapCard(application, actor, parseInput(createRoadmapCardRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.createRoadmapReferenceDescriptor, (request, reply) => reply.code(201).send(useCases.createRoadmapReference(application, actor, parseInput(createRoadmapReferenceRequestSchema, request.body))));
};
