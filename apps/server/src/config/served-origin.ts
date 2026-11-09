import type { FastifyInstance } from "fastify";
import { DomainError } from "@storymapper/contracts";

export function servedLoopbackOrigin(server: FastifyInstance): string {
  const address = server.server.address();
  if (!address || typeof address === "string") throw new DomainError("conflict", "Agentic Story Mapper must be listening before generating an Issue deep link.");
  const host = address.address === "::1" ? "[::1]" : address.address;
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) throw new DomainError("validation", "Agentic Story Mapper Issue links require a loopback listener.");
  return `http://${host}:${address.port}`;
}
