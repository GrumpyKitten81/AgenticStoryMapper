import type { AgentHostId } from "@storymapper/web/features/ai-mcp/agent-prompts";

export const agentGuideStrings = {
  intro: "For agent-guided planning, connect your coding host through MCP before map work. Browser-only use needs no MCP. Agentic Story Mapper has no embedded language model.",
  prerequisites: "Install an MCP-compatible host and complete its sign-in yourself; Agentic Story Mapper does not install a host or manage its account.",
  chooseHost: "Choose your coding host",
  hosts: { claudeCode: "Claude Code", codex: "Codex", cursor: "Cursor", vscode: "VS Code", claudeDesktop: "Claude Desktop" } satisfies Record<AgentHostId, string>,
  cliRegistration: "Run in a terminal",
  jsonRegistration: "Add to the host's MCP settings",
  instructionHeading: "Prompt for your Agent",
  copyPrompt: "Copy Agent prompt",
  copyRegistration: "Copy",
  verify: "The connection works when ListProjects and ListStoryMaps succeed in your host (empty lists are fine). Saved settings and direct HTTP calls are not proof.",
  serverHealthy: "Server is healthy.",
  safety: "Check Agent mode in the header's Safety switches before use. Changes follow the ChangeSet and approval rules; review them in Activity.",
  linkActivity: "Open Activity",
  docsHint: "Details: docs/RUNBOOK.md#connect-codex-or-claude-code and docs/mcp-tools.md in the repository.",
  loading: "Loading generated host configurations...",
  loadFailed: (message: string): string => `Could not load host configurations: ${message}`,
  retry: "Retry loading configurations"
} as const;
