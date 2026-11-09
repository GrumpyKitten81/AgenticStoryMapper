// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { appStrings as strings } from "@storymapper/ui-strings";
import { SafetySwitchStrip } from "@storymapper/web/features/safety/SafetySwitchStrip";

it("shows the agent mode and persists a human mode selection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const settings = { projectId: "00000000-0000-4000-8000-000000000001", agentMode: "propose", github: false, updatedAt: "2026-10-12T00:00:00.000Z" };
  const patches: unknown[] = [];
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      const patch = JSON.parse(String(init.body));
      patches.push(patch);
      Object.assign(settings, patch);
    }
    return Response.json({ settings });
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
  const host = document.createElement("div");
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidation = vi.spyOn(client, "invalidateQueries");
  const pillLabel = () => host.querySelector(".safety-pill")?.getAttribute("aria-label");
  const modeLabel = (mode: keyof typeof strings.agentModes) => strings.safetySwitchState(strings.agentMode, strings.agentModes[mode].label);
  const radio = (mode: keyof typeof strings.agentModes) => [...host.querySelectorAll("label")].find((item) => item.textContent?.includes(strings.agentModes[mode].consequence))!.querySelector("input")!;
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><SafetySwitchStrip projectId={settings.projectId} /></QueryClientProvider>));
    await act(async () => { await vi.waitFor(() => expect(pillLabel()).toContain(modeLabel("propose"))); });
    await act(async () => host.querySelector<HTMLButtonElement>(".safety-pill")!.click());
    expect(radio("propose").checked).toBe(true);
    await act(async () => radio("autonomous").click());
    await act(async () => { await vi.waitFor(() => expect(pillLabel()).toContain(modeLabel("autonomous"))); });
    expect(patches).toEqual([{ agentMode: "autonomous" }]);
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["safety-settings", settings.projectId] });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["activity", settings.projectId] });
    await act(async () => radio("off").click());
    await act(async () => { await vi.waitFor(() => expect(pillLabel()).toContain(modeLabel("off"))); });
    expect(patches).toEqual([{ agentMode: "autonomous" }, { agentMode: "off" }]);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
