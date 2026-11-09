import type { FastifyInstance, FastifyRequest, FastifyReply, HTTPMethods } from "fastify";
import { baseVersionQuerySchema, DomainError, type CapabilityDescriptor } from "@storymapper/contracts";
import { parseInput } from "@storymapper/server/application/http/validate";
import { replyWithError } from "@storymapper/server/application/errors";

export function registerApplicationRoute(server: FastifyInstance, descriptor: CapabilityDescriptor, handler: (request: FastifyRequest, reply: FastifyReply) => unknown): void {
  if (!descriptor.route) throw new Error(`Capability ${descriptor.name} has no HTTP route.`);
  const [method, url] = descriptor.route.split(" ");
  server.route({ method: method as HTTPMethods, url: url!, handler: async (request, reply) => {
    try { return await handler(request, reply); }
    catch (error) { return replyWithError(reply, error, request.log); }
  } });
}

export function requiredQuery(request: FastifyRequest, name: string): string {
  const value = (request.query as Record<string, unknown>)[name];
  if (typeof value !== "string" || !value) throw new DomainError("validation", `${name} is required.`);
  return value;
}

export function optionalQuery(request: FastifyRequest, name: string): string | undefined {
  const value = (request.query as Record<string, unknown>)[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new DomainError("validation", `${name} must be a string.`);
  return value;
}

export function routeParam(request: FastifyRequest, name: string): string {
  return (request.params as Record<string, string>)[name]!;
}

export function baseVersionQuery(request: FastifyRequest): number {
  return parseInput(baseVersionQuerySchema, request.query).baseVersion;
}
