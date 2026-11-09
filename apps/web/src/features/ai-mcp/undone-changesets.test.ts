// @vitest-environment jsdom // REQ historical undone ChangeSets cannot mutate the map
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { OPERATIONS_SCHEMA_VERSION, productContextSchema, type StoredChangeSet } from "@storymapper/contracts";
import { changeSetStrings } from "@storymapper/ui-strings";
import { AiMcpPanel } from "@storymapper/web/features/ai-mcp/AiMcpPanel";

it("renders raw historical and stale ChangeSets and disables incompatible and restore-undone mutation controls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const projectId = randomUUID();
  const changeSets: StoredChangeSet[] = ["proposed", "approved", "applied"].map((status) => ({
    id: randomUUID(), operationsSchemaVersion: OPERATIONS_SCHEMA_VERSION, projectId, title: status, source: "mcp", status: status as StoredChangeSet["status"],
    operations: [], createdAt: "2026-10-04T12:00:00.000Z", undoneByRestore: true
  }));
  changeSets.push(
    { id: randomUUID(), operationsSchemaVersion: 1, projectId, title: "Old approved", source: "mcp", status: "approved", operations: [null, { retiredOperation: "preserved payload" }], createdAt: "2026-10-04T12:00:00.000Z" },
    { id: randomUUID(), operationsSchemaVersion: 1, projectId, title: "Old proposed", source: "mcp", status: "proposed", operations: ["raw historical value"], createdAt: "2026-10-04T12:00:00.000Z" },
    { id: randomUUID(), operationsSchemaVersion: 1, projectId, title: "Stale proposal", source: "mcp", status: "stale", operations: [], createdAt: "2026-10-04T12:00:00.000Z" },
    { id: randomUUID(), operationsSchemaVersion: OPERATIONS_SCHEMA_VERSION, projectId, title: "Current-version history", source: "mcp", status: "applied", operations: [{ retiredOperation: "current-tag raw history" }], createdAt: "2026-10-04T12:00:00.000Z" }
  );
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  exerciseRendersRawHistoricalAndStaleChangeSetsAndDisablesIncompatible(client, projectId, changeSets);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client },
      createElement(AiMcpPanel, { projectId, cards: [], releases: [] }))));
    const items = [...host.querySelectorAll(".changeset-item")];
    expect(items).toHaveLength(6);
    expect(host.textContent).toContain(changeSetStrings.statuses.discarded);
    expect(host.textContent).toContain("Undone by restore");
    expect(host.querySelectorAll(".changeset-actions button")).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Submit a new proposal");
    expect(host.textContent).toContain("preserved payload");
    expect(host.textContent).toContain("raw historical value");
    expect([...host.querySelectorAll(".changeset-operation pre")].map((element) => element.textContent)).toContain("null");
    expect(host.textContent).toContain("current-tag raw history");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    vi.unstubAllGlobals();
  }
});

function exerciseRendersRawHistoricalAndStaleChangeSetsAndDisablesIncompatible(client: QueryClient, projectId: string, changeSets: StoredChangeSet[]) {
  client.setQueryData(["changesets", projectId], { changeSets });
  client.setQueryData(["mcp-tools", projectId], { tools: [] });
  client.setQueryData(["mcp-host-configs"], {});
  client.setQueryData(["source-documents", projectId], { documents: [] });
  client.setQueryData(["product-context", projectId, undefined], {
    context: productContextSchema.parse({
      id: randomUUID(), projectId, storyMapId: null, createdAt: "2026-10-04T12:00:00.000Z", updatedAt: "2026-10-04T12:00:00.000Z"
    })
  });
  client.setQueryData(["ai-function-templates", projectId], { templates: [] });
  for (const changeSet of changeSets) client.setQueryData(["changeset-preview", changeSet.id, undefined, 0], {
    changeSet, presentationStatus: changeSet.undoneByRestore ? "discarded" : changeSet.operationsSchemaVersion !== OPERATIONS_SCHEMA_VERSION && changeSet.status !== "applied" ? "stale" : changeSet.status,
    explanation: changeSet.undoneByRestore ? "Undone by restore" : changeSet.status === "stale" ? "Submit a new proposal" : undefined,
    closed: true, selectedOperationIds: [], conflicts: [], boards: [], canApprove: false, canApply: false,
    operations: changeSet.operations.map((operation, index) => ({ operationId: `historical-${index}`, index, label: "Historical operation", kind: "historical", status: "stale", dependencies: [], owners: [], changes: [], operation }))
  });
}
