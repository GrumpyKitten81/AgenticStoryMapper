import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseHandle } from "@storymapper/db";
import { installRequestOrigin } from "@storymapper/server/http/request-origin";

export const RESTORE_PROJECT_ROUTE = "/api/human/projects/:projectId/restore";

export function installRestoreRequestGate(server: FastifyInstance, handle: DatabaseHandle): void {
  installRequestOrigin(server);
  if (server.hasDecorator("restoreRequestGate")) return;
  server.decorate("restoreRequestGate", true);
  const admitted = new Set<FastifyRequest>();
  const running = new WeakSet<FastifyRequest>();
  const lifecycle = new WeakSet<FastifyRequest>();
  function finish(request: FastifyRequest): void {
    if (!admitted.delete(request)) return;
    handle.leaveRequest(lifecycle.has(request));
  }
  server.addHook("onRequest", async (request, reply) => {
    if (request.routeOptions.url === "/api/health") return;
    if (handle.stopping) return reply.code(503).send({ message: "Agentic Story Mapper is shutting down." });
    if (handle.unavailableReason) return reply.code(503).send({ message: handle.unavailableReason });
    if (handle.restoring) return reply.code(503).send({ message: "Project restore is in progress. Existing requests are draining; retry after the app reloads." });
    const isLifecycle = request.routeOptions.url === RESTORE_PROJECT_ROUTE || request.routeOptions.url === "/api/projects/import";
    if (request.method === "GET" && (request.routeOptions.url === "/mcp" || request.routeOptions.url === "/api/events")) return;
    if (!handle.enterRequest(isLifecycle)) return reply.code(503).send({ message: "Project restore is in progress. Retry after the app reloads." });
    if (isLifecycle) lifecycle.add(request);
    admitted.add(request);
  });
  server.addHook("onResponse", async (request) => { if (!running.has(request)) finish(request); });
  server.addHook("onRequestAbort", async (request) => { if (!running.has(request)) finish(request); });
  server.addHook("onRoute", (route) => {
    const handler = route.handler;
    route.handler = async function (request, reply) {
      running.add(request);
      try { return await handler.call(this, request, reply); }
      finally { running.delete(request); finish(request); }
    };
  });
  server.addHook("preClose", async () => {
    const drain = handle.drain();
    for (const request of admitted) {
      if (running.has(request) || request.raw.complete) continue;
      finish(request);
      request.raw.destroy();
    }
    await drain;
  });
}
