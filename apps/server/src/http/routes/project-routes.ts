import type { FastifyPluginAsync } from "fastify";
import { createProjectRequestSchema, gettingStartedProjectParamsSchema, dismissGettingStartedRequestSchema, recordVisualExportRequestSchema, upsertProductContextRequestSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { parseInput } from "@storymapper/server/application/http/validate";
import * as useCases from "@storymapper/server/application/project/project.use-cases";
import { registerApplicationRoute, requiredQuery, optionalQuery } from "@storymapper/server/http/routes/application-route";
import { toApplicationDeps, type RouteDeps } from "@storymapper/server/http/routes/route-deps";

export const projectRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, useCases.listProjectsDescriptor, () => useCases.listProjects(application, actor));
  registerApplicationRoute(server, useCases.createProjectDescriptor, (request, reply) => reply.code(201).send(useCases.createProject(application, actor, parseInput(createProjectRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.getGettingStartedDescriptor, (request) => useCases.getGettingStarted(application, actor, parseInput(gettingStartedProjectParamsSchema, request.params).projectId));
  registerApplicationRoute(server, useCases.dismissGettingStartedDescriptor, (request) => {
    parseInput(dismissGettingStartedRequestSchema, request.body);
    return useCases.dismissGettingStarted(application, actor, parseInput(gettingStartedProjectParamsSchema, request.params).projectId);
  });
  registerApplicationRoute(server, useCases.recordVisualExportDescriptor, (request) => {
    parseInput(recordVisualExportRequestSchema, request.body);
    return useCases.recordVisualExport(application, actor, parseInput(gettingStartedProjectParamsSchema, request.params).projectId);
  });
  registerApplicationRoute(server, useCases.getProductContextDescriptor, (request) => useCases.getProductContext(application, actor, requiredQuery(request, "projectId"), optionalQuery(request, "storyMapId")));
  registerApplicationRoute(server, useCases.upsertProductContextDescriptor, (request) => useCases.upsertProductContext(application, actor, parseInput(upsertProductContextRequestSchema, request.body)));
};
