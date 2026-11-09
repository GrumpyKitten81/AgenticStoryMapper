// @vitest-environment jsdom // REQ current executable proposals retain enabled review and apply actions
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { changeSetSchema, productContextSchema } from "@storymapper/contracts";
import { changeSetStrings } from "@storymapper/ui-strings";
import { AiMcpPanel } from "@storymapper/web/features/ai-mcp/AiMcpPanel";

it.each(["approve", "reject", "apply"] as const)("enables the current %s action and sends its HTTP request", async (action) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const projectId = randomUUID();
  const changeSet = changeSetSchema.parse({
    id: randomUUID(), projectId, title: "Executable current proposal", source: "mcp", status: action === "apply" ? "approved" : "proposed", createdAt: "2026-10-04T12:00:00.000Z",
    operations: [{ operationId: "create-current-card", op: "create", entity: "card", after: { storyMapId: randomUUID(), level: "story", title: "Reviewed Story" } }]
  });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const changeSets = { changeSets: [changeSet] };
  client.setQueryData(["changesets", projectId], changeSets);
  client.setQueryData(["mcp-tools", projectId], { tools: [] });
  client.setQueryData(["mcp-host-configs"], {});
  client.setQueryData(["source-documents", projectId], { documents: [] });
  client.setQueryData(["product-context", projectId, undefined], { context: productContextSchema.parse({ id: randomUUID(), projectId, storyMapId: null, createdAt: "2026-10-04T12:00:00.000Z", updatedAt: "2026-10-04T12:00:00.000Z" }) });
  client.setQueryData(["ai-function-templates", projectId], { templates: [] });
  client.setQueryData(["changeset-preview", changeSet.id, undefined, 0], {
    changeSet, presentationStatus: changeSet.status, closed: false, selectedOperationIds: ["create-current-card"], conflicts: [], boards: [], canApprove: action !== "apply", canApply: action === "apply",
    operations: [{ operationId: "create-current-card", index: 0, label: "Create reviewed Story", kind: "create card", status: "changed", dependencies: [], owners: [], changes: [], operation: changeSet.operations[0] }]
  });
  const fetch = vi.fn(async (path: string, options?: RequestInit) => Response.json(options?.method === "POST" ? { changeSet } : path.startsWith("/api/changesets?") ? changeSets : path.includes("/preview") ? client.getQueryData(["changeset-preview", changeSet.id, undefined, 0]) : { tools: [] }));
  vi.stubGlobal("fetch", fetch);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(AiMcpPanel, { projectId, cards: [], releases: [] }))));
    const title = changeSetStrings[action];
    const button = [...host.querySelectorAll<HTMLButtonElement>(".changeset-actions button")].find((control) => control.textContent === title);
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(false);
    await act(async () => { button!.click(); });
    const requests = fetch.mock.calls.filter(([path, options]) => path === `/api/changesets/${changeSet.id}/${action}` && options?.method === "POST");
    expect(requests).toHaveLength(1);
    expect(requests[0]![1]?.body).toBe(JSON.stringify(action === "reject" ? {} : { selectedOperationIds: ["create-current-card"] }));
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    vi.unstubAllGlobals();
  }
});
