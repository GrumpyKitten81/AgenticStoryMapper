import { expect, it } from "vitest";
import type { McpHostConfigsResponse } from "@storymapper/contracts";
import { buildAgentInstructionPrompt } from "@storymapper/web/features/ai-mcp/agent-prompts";

it("asks for map context after selection when setup starts without a map", () => {
  const command = { command: "node", args: ["bridge.mjs"] };
  const configs: McpHostConfigsResponse = {
    workspaceRoot: "/workspace", databasePath: "/workspace/storymapper.sqlite", runtimeDirectory: "/runtime", bridgePath: "/runtime/bridge.mjs",
    development: command, production: command,
    claudeDesktop: { mcpServers: { storymapper: command } }, cursor: { mcpServers: { storymapper: command } },
    vsCode: { servers: { storymapper: { ...command, type: "stdio" } } }
  };
  expect(buildAgentInstructionPrompt("http://127.0.0.1:4317", "codex", configs, undefined)).toContain("Once a map is selected, read its Product Context, including advisory workingRules, with GetProductContext before proposing content.");
});
