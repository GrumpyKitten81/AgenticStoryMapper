// @vitest-environment jsdom // REQ MCP host registration and Agent prompt copying
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { agentGuideStrings } from "@storymapper/web/ui-strings/agent-guide";
import { copyStrings } from "@storymapper/web/ui-strings/copy";
import { AgentGuidePanel } from "@storymapper/web/features/ai-mcp/AgentGuidePanel";

const bridge = { command: "/Program Files/node", args: ["/bridge.mjs", "/runtime.lsm"] };
const configurations = {
  workspaceRoot: "/ws", databasePath: "/ws/db", runtimeDirectory: "/runtime", bridgePath: "/bridge.mjs",
  development: bridge, production: bridge,
  claudeDesktop: { mcpServers: { storymapper: bridge } },
  cursor: { mcpServers: { storymapper: { ...bridge, cursor: true } } },
  vsCode: { servers: { storymapper: { type: "stdio" as const, ...bridge } } }
};
const query = vi.hoisted(() => ({ pending: false, error: false, retry: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children) }));
vi.mock("@storymapper/web/app/api", () => ({
  useMcpHostConfigs: () => ({ data: query.pending || query.error ? undefined : configurations, isError: query.error, error: new Error("Server unavailable"), isFetching: false, refetch: query.retry }),
  useApiHealth: () => ({ data: { ok: true } })
}));

let host: HTMLDivElement; let root: Root;
const render = () => act(async () => root.render(createElement(AgentGuidePanel)));
const pick = async (label: string) => act(async () => [...host.querySelectorAll("label")].find((entry) => entry.textContent === label)!.querySelector("input")!.click());
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); Object.assign(query, { pending: false, error: false }); query.retry.mockReset(); vi.unstubAllGlobals(); });

it("defaults to a quoted Claude Code CLI registration and switches to host JSON", async () => {
  await render();
  expect(host.querySelector(".config-code")?.textContent).toBe('claude mcp add --transport stdio --scope local storymapper -- "/Program Files/node" "/bridge.mjs" "/runtime.lsm"');
  await pick("Codex");
  expect(host.querySelector(".config-code")?.textContent).toContain('codex mcp add storymapper -- "/Program Files/node"');
  await pick("Cursor");
  expect(JSON.parse(host.querySelector(".config-code")!.textContent!)).toEqual(configurations.cursor);
  expect(host.querySelector("textarea")?.value).toContain(JSON.stringify(configurations.cursor, null, 2));
});

it("copies the Agent prompt and reports success", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await render();
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes(agentGuideStrings.copyPrompt))!.click());
  expect(writeText.mock.calls[0]![0]).toContain("ListStoryMaps");
  expect(host.textContent).toContain(copyStrings.copied);
});

it("shows loading, failure with retry and no registration before configurations load", async () => {
  query.pending = true;
  await render();
  expect(host.querySelector('[role="status"]')?.textContent).toBe(agentGuideStrings.loading);
  query.pending = false; query.error = true;
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Server unavailable");
  expect(host.querySelector(".config-code")).toBeNull();
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === agentGuideStrings.retry)!.click());
  expect(query.retry).toHaveBeenCalledOnce();
});
