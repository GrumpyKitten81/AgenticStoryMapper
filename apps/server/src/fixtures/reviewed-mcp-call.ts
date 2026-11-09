import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import type { McpToolName, McpToolResult } from "@storymapper/contracts";

export function createReviewedCall(server: FastifyInstance, call: (name: McpToolName, input: unknown) => Promise<McpToolResult>) {
  return async (name: McpToolName, input: unknown): Promise<McpToolResult> => {
    const proposed = await call(name, input);
    if (proposed.outcome !== "proposed") return proposed;
    const approval = await server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSetId}/approve`, payload: {} });
    expect(approval.statusCode, approval.body).toBe(200);
    const applied = await server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSetId}/apply`, payload: {} });
    expect(applied.statusCode, applied.body).toBe(200);
    return { ...proposed, outcome: "applied", changeSet: applied.json().changeSet };
  };
}
