// @vitest-environment jsdom // REQ MCP host configuration copying
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { panelStrings } from "@storymapper/ui-strings";
import { AiMcpPanel } from "@storymapper/web/features/ai-mcp/AiMcpPanel";
import { AgentSetupPanel } from "@storymapper/web/features/ai-mcp/AgentSetupPanel";

const configurations = { development: { command: "/node", args: ["/bridge.mjs", "/runtime.lsm"] }, claudeDesktop: { mcpServers: { storymapper: { command: "/node", args: ["/bridge.mjs", "/runtime.lsm"] } } }, cursor: { mcpServers: { storymapper: { command: "/node", args: ["/bridge.mjs", "/runtime.lsm"] } } }, vsCode: { servers: { storymapper: { type: "stdio", command: "/node", args: ["/bridge.mjs", "/runtime.lsm"] } } } };
const queryState = vi.hoisted(() => ({ pending: false, error: false, retry: vi.fn() }));
vi.mock("@storymapper/web/app/api", () => ({
  api: {}, useMcpTools: () => ({ data: { tools: [] } }), useMcpHostConfigs: () => ({ data: queryState.pending || queryState.error ? undefined : configurations, isError: queryState.error, error: new Error("Server unavailable"), refetch: queryState.retry }),
  useChangeSets: () => ({ data: { changeSets: [] } }), useSourceDocuments: () => ({ data: { documents: [] } }),
  useProductContext: () => ({ data: undefined }), useAiFunctionTemplates: () => ({ data: { templates: [] } })
}));

it("copies each complete configuration and reports clipboard success and failure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const host = document.createElement("div");
  const root = createRoot(host);
  const client = new QueryClient();
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(AiMcpPanel, { cards: [], releases: [] }))));
    const blocks = [...host.querySelectorAll(".mcp-config-panel details")];
    expect(blocks).toHaveLength(4);
    for (const [index, value] of Object.values(configurations).entries()) {
      await act(async () => blocks[index]!.querySelector<HTMLButtonElement>("button")!.click());
      expect(writeText).toHaveBeenLastCalledWith(JSON.stringify(value, null, 2));
      expect(blocks[index]!.querySelector('[role="status"]')?.textContent).toBe(panelStrings.configCopied);
    }
    writeText.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
    await act(async () => blocks[0]!.querySelector<HTMLButtonElement>("button")!.click());
    expect(blocks[0]!.querySelector('[role="status"]')?.textContent).toBe(panelStrings.configCopyFailed);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    Reflect.deleteProperty(navigator, "clipboard");
    vi.unstubAllGlobals();
  }
});

it("loads host-only setup without a map and exposes loading, failure and retry without empty configs", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    queryState.pending = true;
    await act(async () => root.render(createElement(AgentSetupPanel)));
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Loading generated host configurations");
    expect(host.querySelector("code")).toBeNull();
    queryState.pending = false; queryState.error = true;
    await act(async () => root.render(createElement(AgentSetupPanel)));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Server unavailable");
    expect(host.querySelector("code")).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(queryState.retry).toHaveBeenCalledOnce();
    queryState.error = false;
    await act(async () => root.render(createElement(AgentSetupPanel)));
    expect(host.querySelectorAll("code")).toHaveLength(4);
    expect(host.textContent).toContain("ListProjects and ListStoryMaps");
    expect(host.textContent).toContain("connect your coding host through MCP before map work");
    expect(host.textContent).toContain("Browser-only use needs no MCP");
    expect(host.textContent).toContain("If the tools are unavailable, reconnect the host before continuing");
    expect(host.textContent).toContain("saved settings and direct HTTP calls are not proof");
    expect(host.textContent).toContain("Configuration availability does not establish a host connection");
  } finally {
    await act(async () => root.unmount());
    queryState.pending = false; queryState.error = false; queryState.retry.mockReset();
    vi.unstubAllGlobals();
  }
});
