import { initializeSampleFixture } from "@storymapper/db/fixtures/sample-story-map";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, it, vi } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import * as audit from "@storymapper/server/mcp/tools/audit-tool-call";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";
import { registerMcpHttp } from "@storymapper/server/mcp/http";
import { createRoutes } from "@storymapper/server/http/routes";

it("records one insert per read in a 100-call burst and measures paired audit overhead", async () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-tool-burst-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  try {
    const repository = new StoryMapperRepository(handle);
    const unitOfWork = new UnitOfWork(handle);
    unitOfWork.run({ actorType: "human", actorId: "burst-fixture" }, ({ repository }) => repository.ensureSeedData());
    unitOfWork.run({ actorType: "human", actorId: "burst-fixture" }, ({ repository }) => initializeSampleFixture(repository, repository.listProjects()[0]!.id));
    const storyMapId = repository.listStoryMaps()[0]!.id;
    const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "burst-host", mcpSessionId: "burst-session" });
    const original = audit.auditToolCall;
    const observer = vi.spyOn(audit, "auditToolCall");
    const burst = async (record: boolean) => {
      observer.mockImplementation(record ? original : (_context, _name, _input, invoke) => Promise.resolve(invoke()));
      const before = handle.current.$client.prepare("SELECT total_changes() AS count").get() as { count: number };
      const countBefore = repository.listActivity().filter((event) => event.action === "tool_call").length;
      const start = performance.now();
      for (let index = 0; index < 100; index++) await registry.call("GetStoryMapData", { storyMapId });
      const elapsedMs = performance.now() - start;
      const after = handle.current.$client.prepare("SELECT total_changes() AS count").get() as { count: number };
      expect(after.count - before.count).toBe(record ? 100 : 0);
      expect(repository.listActivity().filter((event) => event.action === "tool_call").length - countBefore).toBe(record ? 100 : 0);
      if (record) expect(elapsedMs).toBeLessThan(3000);
      return elapsedMs;
    };
    await burst(false);
    await burst(true);
    const baseline: number[] = [];
    const recorded: number[] = [];
    for (let pair = 0; pair < 5; pair++) {
      if (pair % 2) { recorded.push(await burst(true)); baseline.push(await burst(false)); }
      else { baseline.push(await burst(false)); recorded.push(await burst(true)); }
    }
    const median = (values: number[]) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]!;
    process.stdout.write(JSON.stringify({ workload: "100 GetStoryMapData reads", baselineMs: baseline, recordedMs: recorded, medianBaselineMs: median(baseline), medianRecordedMs: median(recorded), addedPercent: (median(recorded) / median(baseline) - 1) * 100, insertsPerBurst: 100 }) + "\n");
    } finally {
    vi.restoreAllMocks();
    handle.current.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const surface of ["http", "sdk"] as const) for (const tool of ["ListProjects", "GetSafetySettings"] as const) {
  it(`measures 100 concurrent ${tool} reads on real TCP ${surface} with durable exact audit inserts`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "storymapper-tcp-burst-"));
    const path = join(directory, "storymapper.sqlite");
    const handle = new DatabaseHandle(openStoryMapperDb(path));
    const repository = new StoryMapperRepository(handle);
    const unitOfWork = new UnitOfWork(handle);
    const server = Fastify();
    const client = new Client({ name: "tcp-benchmark", version: "1.0" });
    try {
      const project = unitOfWork.run({ actorType: "human", actorId: "tcp-fixture" }, ({ repository }) => repository.createProject({ name: "TCP fixture" }));
      await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: path });
      registerMcpHttp(server, repository, unitOfWork);
      const base = await server.listen({ host: "127.0.0.1", port: 0 });
      if (surface === "sdk") await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
      const input = tool === "ListProjects" ? {} : { projectId: project.id };
      const read = surface === "sdk" ? async () => { const result = await client.callTool({ name: tool, arguments: input }); expect(result.isError).not.toBe(true); }
        : async () => { const response = await fetch(`${base}/api/mcp/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tool, input }) }); expect(response.status).toBe(200); await response.json(); };
      await measureTcpBursts(handle, repository, read, `${surface} 100 concurrent ${tool}`);
      await client.close();
      await server.close();
      handle.current.$client.close();
      const reopened = openStoryMapperDb(path);
      try { expect(new StoryMapperRepository(new DatabaseHandle(reopened)).listActivity().filter((event) => event.action === "tool_call")).toHaveLength(600); }
      finally { reopened.$client.close(); }
    } finally {
      vi.restoreAllMocks();
      await client.close();
      await server.close();
      if (handle.current.$client.open) handle.current.$client.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
}

async function measureTcpBursts(handle: DatabaseHandle, repository: StoryMapperRepository, read: () => Promise<void>, workload: string): Promise<void> {
  const original = audit.auditToolCall;
  const observer = vi.spyOn(audit, "auditToolCall");
  const burst = async (record: boolean) => {
    observer.mockImplementation(record ? original : (_context, _name, _input, invoke) => Promise.resolve(invoke()));
    const changes = () => (handle.current.$client.prepare("SELECT total_changes() AS count").get() as { count: number }).count;
    const beforeChanges = changes();
    const beforeCalls = repository.listActivity().filter((event) => event.action === "tool_call").length;
    const start = performance.now();
    await Promise.all(Array.from({ length: 100 }, read));
    const elapsed = performance.now() - start;
    expect(changes() - beforeChanges).toBe(record ? 100 : 0);
    expect(repository.listActivity().filter((event) => event.action === "tool_call").length - beforeCalls).toBe(record ? 100 : 0);
    expect(elapsed).toBeLessThan(3000);
    return elapsed;
  };
  await burst(false);
  await burst(true);
  const baseline: number[] = [];
  const recorded: number[] = [];
  for (let pair = 0; pair < 5; pair++) {
    if (pair % 2) { recorded.push(await burst(true)); baseline.push(await burst(false)); }
    else { baseline.push(await burst(false)); recorded.push(await burst(true)); }
  }
  const median = (values: number[]) => [...values].sort((left, right) => left - right)[2]!;
  process.stdout.write(JSON.stringify({ workload, baselineMs: baseline, recordedMs: recorded, medianBaselineMs: median(baseline), medianRecordedMs: median(recorded), addedPercent: (median(recorded) / median(baseline) - 1) * 100, insertsPerBurst: 100 }) + "\n");
}
