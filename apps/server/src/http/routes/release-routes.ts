import type { FastifyPluginAsync } from "fastify";
import { createReleaseRequestSchema, baseVersionBodySchema, setExternalRefRequestSchema, updateReleaseCommandSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { replyWithError } from "@storymapper/server/application/errors";
import { parseInput } from "@storymapper/server/application/http/validate";
import { getReleaseNotes, getReleaseNotesDescriptor, createRelease, deleteRelease, updateRelease } from "@storymapper/server/application/release/release.use-cases";
import { setReleaseExternalRef, setReleaseExternalRefDescriptor } from "@storymapper/server/application/external-ref/external-ref.use-cases";
import { registerApplicationRoute, routeParam } from "@storymapper/server/http/routes/application-route";
import type { RouteDeps } from "@storymapper/server/http/routes/route-deps";
import { toApplicationDeps } from "@storymapper/server/http/routes/route-deps";

export const releaseRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;

  registerApplicationRoute(server, getReleaseNotesDescriptor, (request) => getReleaseNotes(application, actor, {
    storyMapId: routeParam(request, "storyMapId"), releaseId: routeParam(request, "releaseId")
  }));

  registerApplicationRoute(server, setReleaseExternalRefDescriptor, (request, reply) => {
    const result = setReleaseExternalRef(application, actor, routeParam(request, "releaseId"), parseInput(setExternalRefRequestSchema, request.body));
    return reply.code(result.status === "created" ? 201 : 200).send(result);
  });

  server.post("/api/releases", async (request, reply) => {
    try {
      const body = parseInput(createReleaseRequestSchema, request.body);
      return reply.code(201).send(createRelease(application, actor, body).release);
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });

  server.patch("/api/releases/:releaseId", async (request, reply) => {
    try {
      const { releaseId } = request.params as { releaseId: string };
      const body = parseInput(updateReleaseCommandSchema, request.body);
      return updateRelease(application, actor, releaseId, body).release;
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });

  server.post("/api/releases/:releaseId/delete", async (request, reply) => {
    try {
      const { releaseId } = request.params as { releaseId: string };
      return deleteRelease(application, actor, releaseId, parseInput(baseVersionBodySchema, request.body).baseVersion);
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });
};
