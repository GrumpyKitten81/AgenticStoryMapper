import type { FastifyPluginAsync } from "fastify";
import { createGitHubLinkRequestSchema, updateGitHubLinkRequestSchema, createGitHubIssueDryRunRequestSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { parseInput } from "@storymapper/server/application/http/validate";
import * as useCases from "@storymapper/server/application/github-link/github-link.use-cases";
import { registerApplicationRoute, requiredQuery, routeParam } from "@storymapper/server/http/routes/application-route";
import { toApplicationDeps, type RouteDeps } from "@storymapper/server/http/routes/route-deps";

export const githubLinkRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, useCases.listGitHubLinksDescriptor, (request) => ({ links: useCases.listGitHubLinks(application, actor, requiredQuery(request, "storyMapId")).links }));
  registerApplicationRoute(server, useCases.createGitHubLinkDescriptor, async (request, reply) => reply.code(201).send(await useCases.createGitHubLink(application, actor, parseInput(createGitHubLinkRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.updateGitHubLinkDescriptor, (request) => useCases.updateGitHubLink(application, actor, routeParam(request, "linkId"), parseInput(updateGitHubLinkRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.deleteGitHubLinkDescriptor, (request) => useCases.deleteGitHubLink(application, actor, routeParam(request, "linkId")));
  registerApplicationRoute(server, useCases.getGitHubSyncHealthDescriptor, (request) => useCases.getGitHubSyncHealth(application, actor, requiredQuery(request, "storyMapId")));
  registerApplicationRoute(server, useCases.createGitHubIssueDryRunDescriptor, (request) => useCases.createGitHubIssueDryRun(application, actor, parseInput(createGitHubIssueDryRunRequestSchema, request.body)));
};
