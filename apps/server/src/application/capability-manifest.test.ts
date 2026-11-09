import { readFileSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import { changeOperationSchema } from "@storymapper/contracts";
import { operationRegistry } from "@storymapper/core";
import { describe, expect, it, vi } from "vitest";
import { applicationCapabilityDescriptors } from "@storymapper/server/application/descriptors";
import { storyMapperMcpTools } from "@storymapper/mcp/tool-definitions/tools";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";
import { McpToolRegistry } from "@storymapper/mcp";

function documentedTools(): Array<{ name: string; permission: string; description: string }> {
  const source = readFileSync(join(process.cwd(), "../../docs/mcp-tools.md"), "utf8");
  return [...source.matchAll(/^\| `([^`]+)` \| (read|proposal|approval|write|github|admin) \| `[^`]+` \| ([^\n]+) \|$/gm)]
    .map((match) => ({ name: match[1]!, permission: match[2]!, description: match[3]! }));
}

describe("capability manifest", () => {
  it("matches scanned descriptors and MCP tool mappings", testMatchesScannedDescriptorsAndMCPToolMappings);

  it("classifies every exposed write and requires implemented operation handlers", testClassifiesEveryExposedWriteAndRequiresImplementedOperationHandlers);

  it("pins every tool permission class to its capability kind", () => {
    const proposals = ["CreateAiProposal", "ProposeMapFromSourceDocument", "ProposeBacklogGrooming", "ProposeReleaseSlice", "CardReview"];
    const github = ["LookupGitHubTicket", "ImportGitHubTicket", "ResolveSyncConflict", "ImportGitHubIssues", "PlanWorkItems", "PullStoryMapGitHubLinks", "PushCardsToGitHub", "SyncGitHubLinks"];
    const expected = (tool: string, kind: string) => tool === "ApproveChangeSet" ? "approval" : proposals.includes(tool) ? "proposal" : github.includes(tool) ? "github" : kind;
    for (const entry of applicationCapabilityDescriptors) {
      if (!entry.tool) continue;
      expect(storyMapperMcpTools.find((tool) => tool.name === entry.tool)?.permission, entry.tool).toBe(expected(entry.tool, entry.kind));
    }
  });

  it("covers exactly the actual domain routes and registered tools in both directions", testCoversExactlyTheActualDomainRoutesAndRegisteredToolsInBoth);
});

function testMatchesScannedDescriptorsAndMCPToolMappings() {
  const manifestPath = join(process.cwd(), "src/application/capability-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    capabilities: Array<{ name: string; tool?: string; route?: string }>;
  };

  expect(manifest.capabilities.map((entry) => entry.name).sort()).toEqual(
    applicationCapabilityDescriptors.map((entry) => entry.name).sort()
  );

  const tools = applicationCapabilityDescriptors.flatMap((entry) => entry.tool ? [entry.tool] : []);
  expect(applicationCapabilityDescriptors.filter((entry) => !entry.tool && entry.kind !== "human-only").every((entry) => entry.kind === "read" && entry.route?.startsWith("GET "))).toBe(true);
  expect(applicationCapabilityDescriptors.find((entry) => entry.name === "previewChangeSet")).toMatchObject({ kind: "read", route: "GET /api/changesets/:changeSetId/preview" });
  expect(applicationCapabilityDescriptors.filter((entry) => entry.kind === "human-only").every((entry) => !entry.tool)).toBe(true);
  expect(new Set(tools).size).toBe(tools.length);
  expect(tools.sort()).toEqual(storyMapperMcpTools.map((tool) => tool.name).sort());
  expect(documentedTools()).toEqual(storyMapperMcpTools.map(({ name, permission, description }) => ({ name, permission, description })));
  const routes = applicationCapabilityDescriptors.flatMap((entry) => entry.route ? [entry.route] : []);
  expect(new Set(routes).size).toBe(routes.length);
}

function testClassifiesEveryExposedWriteAndRequiresImplementedOperationHandlers() {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "src/application/capability-manifest.json"), "utf8")) as {
    operationCoverage: Array<{ name: string; operations: string[]; exceptions: string[] }>;
    excludedOperationFamilies: Record<string, string>;
  };
  expect(manifest.operationCoverage.map((entry) => entry.name).sort()).toEqual(applicationCapabilityDescriptors.filter((entry) => entry.kind !== "read" || ["getGettingStarted", "getProjectArchiveCapabilities", "getRestorePointCapabilities", "listRestorePoints", "readRestoreActivity"].includes(entry.name)).map((entry) => entry.name).sort());
  const members = changeOperationSchema.options.map((member) => `${member.shape.op.value}:${member.shape.entity.value}`);
  expect(new Set(members).size).toBe(members.length);
  expect(Object.keys(operationRegistry).sort()).toEqual(members.sort());
  for (const [pair, handler] of Object.entries(operationRegistry)) {
    expect(handler.describe, pair).toBeTypeOf("function");
    expect(handler.resolve, pair).toBeTypeOf("function");
  }
  for (const entry of manifest.operationCoverage) {
    expect(entry.operations.length + entry.exceptions.length, entry.name).toBeGreaterThan(0);
    expect(new Set(entry.operations).size, entry.name).toBe(entry.operations.length);
    for (const pair of entry.operations) expect(members, `${entry.name}: ${pair}`).toContain(pair);
    for (const exception of entry.exceptions) expect([
      "human-only-administration", "changeset-lifecycle", "restore-archive-lifecycle",
      "audit-checklist-bookkeeping", "confirmed-remote-write", "sync-baseline-run-conflict-bookkeeping", "immutable-card-review-metadata"
    ], entry.name).toContain(exception);
  }
  for (const name of ["createGitHubLink", "updateGitHubLink", "deleteGitHubLink"]) expect(manifest.operationCoverage.find((entry) => entry.name === name)?.exceptions).toEqual([]);
  expect(manifest.operationCoverage.filter((entry) => entry.exceptions.includes("immutable-card-review-metadata")).map((entry) => entry.name)).toEqual(["commandCardReview"]);
  expect(manifest.excludedOperationFamilies.view_settings).toBe("planned-only-outside-exposed-write-catalog");
  expect(manifest.excludedOperationFamilies.ai_function_templates).toBe("human-only-administration");
}

async function testCoversExactlyTheActualDomainRoutesAndRegisteredToolsInBoth() {
  const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const server = Fastify();
  const routes: string[] = [];
  server.addHook("onRoute", (options) => {
    const methods = Array.isArray(options.method) ? options.method : [options.method];
    for (const method of methods) if (method !== "HEAD" && method !== "OPTIONS") routes.push(`${method} ${options.url}`);
  });
  try {
    await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: ":memory:" });
    await server.ready();
    const infrastructure = ["GET /health", "GET /api/health", "GET /api/credentials/status", "GET /api/mcp/tools", "GET /api/mcp/host-configs", "POST /api/mcp/call"];
    expect(routes.filter((route) => infrastructure.includes(route)).sort()).toEqual(infrastructure.sort());
    const domainRoutes = routes.filter((route) => !infrastructure.includes(route));
    expect(new Set(domainRoutes).size).toBe(domainRoutes.length);
    expect(domainRoutes.sort()).toEqual(applicationCapabilityDescriptors.flatMap((entry) => entry.route ? [entry.route] : []).sort());
    const registered = vi.spyOn(McpToolRegistry.prototype, "register");
    try {
      createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "capability-parity" });
      const names = registered.mock.calls.map(([name]) => name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.sort()).toEqual(applicationCapabilityDescriptors.flatMap((entry) => entry.tool ? [entry.tool] : []).sort());
      expect(documentedTools().map((tool) => tool.name).sort()).toEqual(names.sort());
    } finally {
      registered.mockRestore();
    }
  } finally {
    await server.close();
    handle.current.$client.close();
  }
}
