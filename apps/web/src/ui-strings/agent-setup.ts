export const agentSetupStrings = {
  intro: "For agent-guided planning, connect your coding host through MCP before map work. Browser-only use needs no MCP. Agentic Story Mapper has no embedded language model.",
  prerequisites: "Install an MCP-compatible host such as Codex, Claude Code, Claude Desktop, Cursor or VS Code. Complete that host's provider setup or sign-in yourself; Agentic Story Mapper does not install a host or manage its account.",
  configure: "Keep Agentic Story Mapper running. Copy the generated configuration for your host into its MCP settings. It uses absolute paths to Node 24, the bridge and the stable startup directory; do not replace the directory with the current Project path.",
  restart: "Save the host settings, then restart or reconnect its MCP server. Restart Agentic Story Mapper with node scripts/start.mjs for later sessions.",
  verify: "Before planning, use read-only ListProjects and ListStoryMaps in your host and confirm successful responses. An empty map list is valid. If the tools are unavailable, reconnect the host before continuing. Then tell the Agent what you want to map.",
  connectionStatus: "Configuration availability does not establish a host connection. Verify successful MCP tool responses in your host; saved settings and direct HTTP calls are not proof.",
  safety: "Review Agent mode in the header's Safety switches before use. Changes follow Agentic Story Mapper's ChangeSet and approval rules. GitHub is independent and optional; copying this configuration enables no permissions.",
  loading: "Loading generated host configurations...",
  loadFailed: (message: string): string => `Could not load host configurations: ${message}`,
  retry: "Retry loading configurations",
  claudeDesktop: "Claude Desktop",
  cursor: "Cursor"
} as const;
