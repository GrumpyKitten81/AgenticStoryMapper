import { agentAccessEnabled } from "@storymapper/core";
import { servedLoopbackOrigin } from "@storymapper/server/config/served-origin";
import { randomUUID } from "node:crypto";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { isInitializeRequest, isJsonContentType, specTypeSchemas, SUPPORTED_PROTOCOL_VERSIONS, type JSONRPCMessage, type McpServer } from "@modelcontextprotocol/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { DomainError } from "@storymapper/contracts";
import { createStoryMapperMcpServer, invokeMcpTool, type McpToolRegistry } from "@storymapper/mcp";
import { createAiPromptHandlers } from "@storymapper/server/application/ai/prompts";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";
import { APP_VERSION } from "@storymapper/server/app-version";

interface Session { transport: NodeStreamableHTTPServerTransport; server: McpServer; registry: McpToolRegistry }

async function auditInvalidCallEnvelope(request: FastifyRequest, reply: FastifyReply, session: Session): Promise<boolean> {
  const message = request.body;
  const accept = request.headers.accept;
  const protocol = request.headers["mcp-protocol-version"];
  if (!accept?.includes("application/json") || !accept.includes("text/event-stream") || !isJsonContentType(request.headers["content-type"] ?? null) || protocol !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.includes(protocol as string)) return false;
  if (request.method !== "POST" || !message || typeof message !== "object" || !("method" in message) || message.method !== "tools/call" || !("id" in message) || !(typeof message.id === "string" || typeof message.id === "number")) return false;
  if (!("jsonrpc" in message) || message.jsonrpc !== "2.0") return false;
  if (!specTypeSchemas.CallToolRequest["~standard"].validate(message).issues) return false;
  const params = ("params" in message ? message.params : undefined) as { name?: unknown; arguments?: unknown } | undefined;
  const result = await invokeMcpTool(() => session.registry.call(params?.name, params?.arguments, () => { throw new DomainError("validation", "Request validation failed."); }));
  await reply.send({ jsonrpc: "2.0", id: message.id, result: session.server.server.projectCallToolResult(result, undefined) });
  return true;
}

function rejectRequest(reply: FastifyReply, status: number, message: string): void {
  void reply.code(status).send({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

async function createSession(request: FastifyRequest, repository: StoryMapperRepository, unitOfWork: UnitOfWork, sessions: Map<string, Session>, localOrigin: () => string): Promise<Session> {
  const sessionId = randomUUID();
  const body = request.body as { params?: { clientInfo?: { name?: string } } };
  const name = body.params?.clientInfo?.name;
  const hostName = typeof name === "string" && name.trim() ? name.trim() : "local-mcp-host";
  const registry = createMcpRegistry(repository, unitOfWork, { hostName, mcpSessionId: sessionId, localOrigin });
  const mcpServer = createStoryMapperMcpServer({ name: "storymapper", version: APP_VERSION, callTool: (name, args) => registry.call(name, args), prompts: createAiPromptHandlers({ repository, unitOfWork }, { actorType: "agent", actorId: hostName, mcpSessionId: sessionId }) });
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
    enableJsonResponse: true,
    onsessioninitialized: () => { sessions.set(sessionId, { transport, server: mcpServer, registry }); },
    onsessionclosed: () => { sessions.delete(sessionId); }
  });
  await mcpServer.connect(transport);
  return { transport, server: mcpServer, registry };
}

export function registerMcpHttp(server: FastifyInstance, repository: StoryMapperRepository, unitOfWork: UnitOfWork): void {
  const sessions = new Map<string, Session>();
  const activeRequests = new Set<Promise<void>>();
  let closing = false;
  const handleRequest = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const sessionId = request.headers["mcp-session-id"];
    let session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
    if (sessionId !== undefined && !session) return rejectRequest(reply, 404, "Unknown MCP session.");
    if (!session) {
      if (request.method !== "POST" || !request.body || typeof request.body !== "object" || !isInitializeRequest(request.body as JSONRPCMessage)) return rejectRequest(reply, 400, "Mcp-Session-Id is required.");
      if (!repository.listProjects().some((project) => agentAccessEnabled(repository.getSafetySettings(project.id)))) return rejectRequest(reply, 403, "disabled: Agent access is disabled.");
      session = await createSession(request, repository, unitOfWork, sessions, () => servedLoopbackOrigin(server));
    }
    if (sessionId !== undefined && await auditInvalidCallEnvelope(request, reply, session)) return;
    reply.hijack();
    await session.transport.handleRequest(request.raw, reply.raw, request.body);
    if (!session.transport.sessionId || (request.method === "DELETE" && reply.raw.statusCode < 300)) await session.server.close();
  };
  server.route({ method: ["GET", "POST", "DELETE"], url: "/mcp", handler: async (request, reply) => {
    if (closing) return rejectRequest(reply, 503, "Agentic Story Mapper is shutting down.");
    if (request.method === "GET") return handleRequest(request, reply);
    let finish!: () => void;
    const active = new Promise<void>((resolve) => { finish = resolve; });
    activeRequests.add(active);
    try { await handleRequest(request, reply); }
    finally { activeRequests.delete(active); finish(); }
  } });
  server.addHook("preClose", async () => {
    closing = true;
    await Promise.all(activeRequests);
    await Promise.all([...sessions.values()].map((session) => session.server.close()));
    sessions.clear();
  });
}
