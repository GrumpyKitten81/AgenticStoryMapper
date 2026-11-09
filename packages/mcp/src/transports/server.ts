import { McpServer, ProtocolError, INVALID_PARAMS, INTERNAL_ERROR, type GetPromptResult, type ListPromptsResult, type CallToolResult } from "@modelcontextprotocol/server";
import { mcpToolInputSchemas, toErrorResponse, type McpToolResult } from "@storymapper/contracts";
import { storyMapperMcpTools } from "@storymapper/mcp/tool-definitions/tools";

export interface McpPromptHandlers {
  listPrompts: () => ListPromptsResult | Promise<ListPromptsResult>;
  getPrompt: (name: string, args: Record<string, string>) => GetPromptResult | Promise<GetPromptResult>;
}

export function createStoryMapperMcpServer(input: {
  name: string;
  version: string;
  callTool: (name: string, args: unknown) => Promise<McpToolResult>;
  prompts?: McpPromptHandlers;
}): McpServer {
  const server = new McpServer({
    name: input.name,
    version: input.version
  });

  for (const tool of storyMapperMcpTools) {
    server.registerTool(tool.name, {
      title: tool.name,
      description: tool.description,
      inputSchema: mcpToolInputSchemas[tool.name]
    }, (args: unknown) => invokeMcpTool(() => input.callTool(tool.name, args)));
  }

  // DESIGN The public request handler keeps raw arguments inside the shared audited boundary.
  server.server.setRequestHandler("tools/call", async (request) => {
    const result = await invokeMcpTool(() => input.callTool(request.params.name, request.params.arguments));
    return server.server.projectCallToolResult(result, undefined);
  });

  if (input.prompts) {
    const prompts = input.prompts;
    server.server.registerCapabilities({ prompts: {} });
    server.server.setRequestHandler("prompts/list", async () => invokeMcpPrompt(() => prompts.listPrompts()));
    server.server.setRequestHandler("prompts/get", async (request) => invokeMcpPrompt(() => prompts.getPrompt(request.params.name, request.params.arguments ?? {})));
  }
  return server;
}

export async function invokeMcpTool(callTool: () => Promise<McpToolResult>): Promise<CallToolResult> {
  try {
    const result = await callTool();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const { statusCode, ...response } = toErrorResponse(error);
    return { isError: true, content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
  }
}

async function invokeMcpPrompt<T>(handler: () => T | Promise<T>): Promise<T> {
  try { return await handler(); }
  catch (error) {
    const { statusCode, ...response } = toErrorResponse(error);
    throw new ProtocolError(statusCode >= 500 ? INTERNAL_ERROR : INVALID_PARAMS, `${response.code}: ${response.message}`, response);
  }
}
