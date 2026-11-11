import type { McpHostConfigsResponse } from "@storymapper/contracts";

export const agentHostIds = ["claudeCode", "codex", "cursor", "vscode", "claudeDesktop"] as const;
export type AgentHostId = typeof agentHostIds[number];

const cliPrefixes: Partial<Record<AgentHostId, string>> = {
  claudeCode: "claude mcp add --transport stdio --scope local storymapper --",
  codex: "codex mcp add storymapper --"
};

export const isCliHost = (host: AgentHostId): boolean => Boolean(cliPrefixes[host]);

export function hostRegistration(configs: McpHostConfigsResponse, host: AgentHostId): string {
  const prefix = cliPrefixes[host];
  if (prefix) return [prefix, ...[configs.development.command, ...configs.development.args].map((value) => `"${value}"`)].join(" ");
  const json = host === "cursor" ? configs.cursor : host === "vscode" ? configs.vsCode : configs.claudeDesktop;
  return JSON.stringify(json, null, 2);
}

export function buildAgentInstructionPrompt(origin: string, host: AgentHostId, configs: McpHostConfigsResponse, storyMapId: string | undefined): string {
  return [
    "Help me use Agentic Story Mapper with MCP for guided planning.",
    `App origin: ${origin}. Confirm the server is healthy at ${origin}/health.`,
    isCliHost(host) ? `Register the MCP server with: ${hostRegistration(configs, host)}` : `Add this MCP server configuration to the host settings, preserving other servers:\n${hostRegistration(configs, host)}`,
    "Reconnect if needed, then call ListProjects and ListStoryMaps through this host's MCP tools. Saved settings or direct HTTP calls are not proof of connectivity.",
    "Use MCP and ChangeSet approval for application data; never access SQLite or domain HTTP as a substitute.",
    "Check Agent mode in the app header (Safety switches) before proposing changes.",
    storyMapId ? `Work on Story Map id ${storyMapId}; read its Product Context with GetProductContext first.` : "When connected, ask me what I want to map before proposing content."
  ].join("\n");
}
