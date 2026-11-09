import type { FastifyPluginAsync } from "fastify";
import { connectGitHubConnectionRequestSchema, createConnectorConnectionRequestSchema, updateConnectorConnectionRequestSchema, validateConnectorConnectionRequestSchema, verifyGitHubConnectionRequestSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { parseInput } from "@storymapper/server/application/http/validate";
import * as useCases from "@storymapper/server/application/connector/connector.use-cases";
import * as connectUseCases from "@storymapper/server/application/connector/github-connect.use-cases";
import { registerApplicationRoute, requiredQuery, routeParam } from "@storymapper/server/http/routes/application-route";
import { toApplicationDeps, type RouteDeps } from "@storymapper/server/http/routes/route-deps";

export const connectorRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, useCases.listGitHubStatusProjectsDescriptor, (request) => useCases.listGitHubStatusProjects(application, actor, parseInput(validateConnectorConnectionRequestSchema, request.body)));
  registerApplicationRoute(server, connectUseCases.verifyGitHubConnectionDescriptor, (request) => connectUseCases.verifyGitHubConnection(application, actor, parseInput(verifyGitHubConnectionRequestSchema, request.body)));
  registerApplicationRoute(server, connectUseCases.connectGitHubConnectionDescriptor, (request) => connectUseCases.connectGitHubConnection(application, actor, parseInput(connectGitHubConnectionRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.listConnectorConnectionsDescriptor, (request) => useCases.listConnectorConnections(application, actor, requiredQuery(request, "projectId")));
  registerApplicationRoute(server, useCases.createConnectorConnectionDescriptor, (request, reply) => reply.code(201).send(useCases.createConnectorConnection(application, actor, parseInput(createConnectorConnectionRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.updateConnectorConnectionDescriptor, (request) => useCases.updateConnectorConnection(application, actor, routeParam(request, "connectionId"), parseInput(updateConnectorConnectionRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.deleteConnectorConnectionDescriptor, (request) => useCases.deleteConnectorConnection(application, actor, routeParam(request, "connectionId")));
  registerApplicationRoute(server, useCases.validateConnectorConnectionDescriptor, (request) => useCases.validateConnectorConnection(application, actor, parseInput(validateConnectorConnectionRequestSchema, request.body)));
};
