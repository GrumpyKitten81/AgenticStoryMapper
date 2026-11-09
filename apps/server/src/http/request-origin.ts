import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyInstance } from "fastify";
import { liveClientIdSchema, LIVE_CLIENT_ID_HEADER, type ActorContext } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";

const requestOrigins = new AsyncLocalStorage<string | undefined>();

export function requestActor(actor: ActorContext): ActorContext {
  const originClientId = requestOrigins.getStore();
  return originClientId ? { ...actor, originClientId } : actor;
}

export function requestHumanActor(): ActorContext { return requestActor(localHumanActor); }

export function installRequestOrigin(server: FastifyInstance): void {
  if (server.hasDecorator("requestOrigin")) return;
  server.decorate("requestOrigin", true);
  server.addHook("onRequest", async (request, reply) => {
    const origin = request.headers[LIVE_CLIENT_ID_HEADER];
    if (origin !== undefined && !liveClientIdSchema.safeParse(origin).success) {
      return reply.code(400).send({ code: "validation", message: "Invalid client origin header." });
    }
  });
  server.addHook("onRoute", (route) => {
    const handler = route.handler;
    route.handler = function (request, reply) {
      const origin = request.headers[LIVE_CLIENT_ID_HEADER];
      return requestOrigins.run(typeof origin === "string" ? origin : undefined, () => handler.call(this, request, reply));
    };
  });
}
