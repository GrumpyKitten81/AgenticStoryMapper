import type { StoryMapperMcpToolDefinition } from "@storymapper/mcp/tool-definitions/tools";

export interface McpPermissionSettings {
  read: boolean;
  proposal: boolean;
  approval?: boolean;
  write: boolean;
  github: boolean;
  admin: boolean;
}

export const proposalOnlyPermissions: McpPermissionSettings = {
  read: true,
  proposal: true,
  approval: false,
  write: false,
  github: false,
  admin: false
};

export function canUseTool(tool: StoryMapperMcpToolDefinition, settings: McpPermissionSettings): boolean {
  return settings[tool.permission] ?? false;
}
