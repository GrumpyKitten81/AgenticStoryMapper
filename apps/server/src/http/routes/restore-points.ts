import type { FastifyPluginAsync } from "fastify";
import { createRestorePointRequestSchema, restorePointProjectParamsSchema, restoreProjectRequestSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { requestHumanActor } from "@storymapper/server/http/request-origin";
import { parseInput } from "@storymapper/server/application/http/validate";
import * as useCases from "@storymapper/server/application/restore/restore.use-cases";
import { registerApplicationRoute } from "@storymapper/server/http/routes/application-route";
import type { ApplicationDeps } from "@storymapper/server/application/deps";

export const restorePointRoutes: FastifyPluginAsync<ApplicationDeps> = async (server, application) => {
  const actor = localHumanActor;
  registerApplicationRoute(server, useCases.getRestorePointCapabilitiesDescriptor, () => useCases.getRestorePointCapabilities(application, actor));
  registerApplicationRoute(server, useCases.readRestoreActivityDescriptor, (request) => useCases.readRestoreActivity(application, actor, parseInput(restorePointProjectParamsSchema, request.params).projectId));
  registerApplicationRoute(server, useCases.listRestorePointsDescriptor, (request) => useCases.listRestorePoints(application, actor, parseInput(restorePointProjectParamsSchema, request.params).projectId));
  registerApplicationRoute(server, useCases.createRestorePointDescriptor, (request, reply) => reply.code(201).send(useCases.createRestorePoint(application, actor, parseInput(restorePointProjectParamsSchema, request.params).projectId, parseInput(createRestorePointRequestSchema, request.body).class)));
  registerApplicationRoute(server, useCases.restoreProjectDescriptor, (request) => useCases.restoreProject(application, requestHumanActor(), parseInput(restorePointProjectParamsSchema, request.params).projectId, parseInput(restoreProjectRequestSchema, request.body).fileName));
};
