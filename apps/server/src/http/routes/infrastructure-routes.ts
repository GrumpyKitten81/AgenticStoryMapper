import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { credentialStatusesResponseSchema, mcpCallRequestSchema, mcpHostConfigsResponseSchema, operationalHealthSchema, type McpHostConfigsResponse } from "@storymapper/contracts";
import { developmentSchemaVersion, readLiveCursor, type UnitOfWork } from "@storymapper/db";
import type { FastifyPluginAsync } from "fastify";
import { replyWithError } from "@storymapper/server/application/errors";
import { parseInput } from "@storymapper/server/application/http/validate";
import type { RouteDeps } from "@storymapper/server/http/routes/route-deps";
import { createMcpRegistry, listMcpToolStates } from "@storymapper/server/mcp/tools/register-tools";
import { githubCredentialStatuses } from "@storymapper/server/services/credentials";
import { APP_VERSION } from "@storymapper/server/app-version";

function hostConfigs(unitOfWork: UnitOfWork, startupDatabasePath: string): McpHostConfigsResponse {
  let workspaceRoot = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(workspaceRoot, "scripts", "mcp-bridge.mjs"))) {
    const parent = dirname(workspaceRoot);
    if (parent === workspaceRoot) throw new Error("Agentic Story Mapper MCP bridge script is missing.");
    workspaceRoot = parent;
  }
  const databasePath = resolve(unitOfWork.handle.current.$client.name);
  const runtimeDirectory = dirname(resolve(startupDatabasePath));
  const bridgePath = join(workspaceRoot, "scripts", "mcp-bridge.mjs");
  const command = { command: process.execPath, args: [bridgePath, runtimeDirectory] };
  return mcpHostConfigsResponseSchema.parse({ workspaceRoot, databasePath, runtimeDirectory, bridgePath, development: command, production: command, claudeDesktop: { mcpServers: { storymapper: command } }, cursor: { mcpServers: { storymapper: command } }, vsCode: { servers: { storymapper: { type: "stdio", ...command } } } });
}

export const infrastructureRoutes: FastifyPluginAsync<RouteDeps> = async (server, { repository, unitOfWork, databasePath, localOrigin }) => {
  const registry = createMcpRegistry(repository, unitOfWork, { hostName: "local-mcp-host", ...(localOrigin ? { localOrigin } : {}) });
  server.get("/api/credentials/status", async (_request, reply) => {
    try { return credentialStatusesResponseSchema.parse({ credentials: await githubCredentialStatuses() }); }
    catch (error) { return replyWithError(reply, error, server.log); }
  });
  server.get("/health", async () => ({ ok: true, mode: "local", databasePath: unitOfWork.handle.current.$client.name, runtimeDirectory: dirname(resolve(databasePath)), outboundNetwork: "disabled-by-default" }));
  server.get("/api/health", async () => {
    const handle = unitOfWork.handle;
    const readable = handle.current.$client.open && !handle.unavailableReason;
    return operationalHealthSchema.parse({ version: APP_VERSION, schemaVersion: readable ? developmentSchemaVersion(handle.current) : null, epoch: readable ? readLiveCursor(handle).epoch : null, writeGate: handle.writeGate, pendingMigration: null });
  });
  server.get("/api/mcp/tools", async (request) => ({ tools: listMcpToolStates(repository, (request.query as { projectId?: string }).projectId) }));
  server.get("/api/mcp/host-configs", async () => hostConfigs(unitOfWork, databasePath));
  server.post("/api/mcp/call", async (request, reply) => {
    const name = (request.body as { name?: unknown } | null)?.name;
    try {
      const input = (request.body as { input?: unknown } | null)?.input;
      return await registry.call(name, input, () => { parseInput(mcpCallRequestSchema, request.body); });
    } catch (error) {
      return replyWithError(reply, error, server.log);
    }
  });
};
