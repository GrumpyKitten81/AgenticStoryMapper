import type { McpToolName } from "@storymapper/contracts";
import { generatedMcpToolDefinitions } from "@storymapper/mcp/tool-definitions/capabilities";

export interface StoryMapperMcpToolDefinition {
  name: McpToolName;
  description: string;
  permission: "read" | "proposal" | "approval" | "write" | "github" | "admin";
}

export const storyMapperMcpTools: StoryMapperMcpToolDefinition[] = [...generatedMcpToolDefinitions];
