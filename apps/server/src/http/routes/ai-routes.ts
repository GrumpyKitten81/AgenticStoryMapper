import { createAiProposalRequestSchema, createAiTemplateRequestSchema, updateAiTemplateRequestSchema, listAiTemplatesRequestSchema } from "@storymapper/contracts";
import type { FastifyPluginAsync } from "fastify";
import { localHumanActor } from "@storymapper/server/application/actors";
import * as useCases from "@storymapper/server/application/ai/ai.use-cases";
import { parseInput } from "@storymapper/server/application/http/validate";
import { registerApplicationRoute, routeParam } from "@storymapper/server/http/routes/application-route";
import { toApplicationDeps, type RouteDeps } from "@storymapper/server/http/routes/route-deps";

export const aiRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  registerApplicationRoute(server, useCases.listAiTemplatesDescriptor, (request) => useCases.listAiTemplates(application, localHumanActor, parseInput(listAiTemplatesRequestSchema, request.query).projectId));
  registerApplicationRoute(server, useCases.createAiProposalDescriptor, (request, reply) => reply.code(201).send(useCases.createAiProposal(application, localHumanActor, parseInput(createAiProposalRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.createAiTemplateDescriptor, (request, reply) => reply.code(201).send(useCases.createAiTemplate(application, localHumanActor, parseInput(createAiTemplateRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.updateAiTemplateDescriptor, (request) => useCases.updateAiTemplate(application, localHumanActor, routeParam(request, "projectId"), routeParam(request, "templateId"), parseInput(updateAiTemplateRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.deleteAiTemplateDescriptor, (request) => useCases.deleteAiTemplate(application, localHumanActor, routeParam(request, "projectId"), routeParam(request, "templateId")));
};
