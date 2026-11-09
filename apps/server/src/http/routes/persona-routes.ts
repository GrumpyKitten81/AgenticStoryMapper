import type { FastifyPluginAsync } from "fastify";
import { deletePersonaCommandSchema, createPersonaRequestSchema, setExternalRefRequestSchema, updatePersonaCommandSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { replyWithError } from "@storymapper/server/application/errors";
import { baseVersionQuery } from "@storymapper/server/http/routes/application-route";
import { parseInput } from "@storymapper/server/application/http/validate";
import { createPersona, deletePersona, listPersonas, updatePersona } from "@storymapper/server/application/persona/persona.use-cases";
import { setPersonaExternalRef, setPersonaExternalRefDescriptor } from "@storymapper/server/application/external-ref/external-ref.use-cases";
import { registerApplicationRoute, routeParam } from "@storymapper/server/http/routes/application-route";
import type { RouteDeps } from "@storymapper/server/http/routes/route-deps";
import { toApplicationDeps } from "@storymapper/server/http/routes/route-deps";

export const personaRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;

  registerApplicationRoute(server, setPersonaExternalRefDescriptor, (request, reply) => {
    const result = setPersonaExternalRef(application, actor, routeParam(request, "personaId"), parseInput(setExternalRefRequestSchema, request.body));
    return reply.code(result.status === "created" ? 201 : 200).send(result);
  });

  server.get("/api/personas", async (request, reply) => {
    try {
      const query = request.query as { projectId: string; storyMapId?: string };
      return listPersonas(application, actor, query.projectId, query.storyMapId);
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });

  server.post("/api/personas", async (request, reply) => {
    try {
      const body = parseInput(createPersonaRequestSchema, request.body);
      return reply.code(201).send(createPersona(application, actor, body).persona);
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });

  server.patch("/api/personas/:personaId", async (request, reply) => {
    try {
      const { personaId } = request.params as { personaId: string };
      const body = parseInput(updatePersonaCommandSchema, request.body);
      return updatePersona(application, actor, personaId, body).persona;
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });

  server.delete("/api/personas/:personaId", async (request, reply) => {
    try {
      const { personaId } = request.params as { personaId: string };
      return deletePersona(application, actor, personaId, parseInput(deletePersonaCommandSchema, { ...request.body as object, baseVersion: baseVersionQuery(request) }));
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });
};
