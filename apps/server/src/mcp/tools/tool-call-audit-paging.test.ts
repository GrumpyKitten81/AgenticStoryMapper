import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { activityResponseSchema, type ActivityEvent, type ActivityResponse, type ActorContext } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

const HUMAN = { actorType: "human", actorId: "paging-fixture" } as const;
const AGENT = { actorType: "agent", actorId: "permitted-paging-host", mcpSessionId: "paging-session" } as const;
const TOOL_NAME = "GetStoryMapCards";
const PAGE_LIMIT = 7;
const cleanup: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-audit-paging-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const projects = unitOfWork.run(HUMAN, ({ repository }) => {
    const project = repository.createProject({ name: "Paged Project" });
    const other = repository.createProject({ name: "Other permitted Project" });
    const disabled = repository.createProject({ name: "Disabled Project" });
    repository.updateSafetySettings(disabled.id, { agentMode: "off" });
    return { project, other, disabled };
  });
  const server = Fastify();
  cleanup.push(() => server.close());
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository, unitOfWork, databasePath: path });
  const base = await server.listen({ host: "127.0.0.1", port: 0 });
  return { repository, unitOfWork, base, ...projects };
}

function recordCalls(data: Awaited<ReturnType<typeof fixture>>, options: {
  projectId: string | null; count: number; createdAt: string; actor?: ActorContext; toolName?: string; outcome?: "ok" | "error" | "rejected";
}): ActivityEvent[] {
  vi.spyOn(Date.prototype, "toISOString").mockReturnValue(options.createdAt);
  const metadata = {
    toolName: options.toolName ?? TOOL_NAME, inputHash: "a".repeat(64), outputHash: "b".repeat(64),
    outcome: options.outcome ?? "ok", affectedEntityIds: options.projectId ? [options.projectId] : []
  };
  return data.unitOfWork.run(options.actor ?? AGENT, ({ repository }) =>
    Array.from({ length: options.count }, () => repository.logMcpToolCall({ projectId: options.projectId, metadata })));
}

function newestFirst(events: ActivityEvent[]): ActivityEvent[] {
  return [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

function expectPage(page: ActivityResponse, remaining: ActivityEvent[]): void {
  const expected = remaining.slice(0, PAGE_LIMIT);
  expect(page.activityEvents.map((event) => event.id)).toEqual(expected.map((event) => event.id));
  expect(page.activityEvents).toHaveLength(Math.min(PAGE_LIMIT, remaining.length));
  expect(page.activityEvents.every((event) => event.actorType === "agent" && event.toolCall?.toolName === TOOL_NAME)).toBe(true);
  expect(page.activityEvents.every((event) => !("before" in event) && !("after" in event))).toBe(true);
  expect(page.activityEvents.every((event) => event.scope === (event.projectId === null ? "runtime" : "project"))).toBe(true);
  const last = expected.at(-1)!;
  expect(page.nextCursor).toEqual(remaining.length > PAGE_LIMIT ? { id: last.id, createdAt: last.createdAt } : null);
}

it("traverses combined HTTP actor/tool/limit/cursor filters with stable tied-timestamp pages", async () => {
  const data = await fixture();
  const projectRows = recordCalls(data, { projectId: data.project.id, count: 19, createdAt: "2026-10-08T10:00:00.000Z" });
  const runtimeRows = recordCalls(data, { projectId: null, count: 4, createdAt: "2026-10-08T11:00:00.000Z" });
  recordCalls(data, { projectId: data.other.id, count: 25, createdAt: "2026-10-08T12:00:00.000Z" });
  recordCalls(data, { projectId: data.project.id, count: 25, createdAt: "2026-10-08T12:00:00.000Z", actor: HUMAN });
  recordCalls(data, { projectId: data.project.id, count: 25, createdAt: "2026-10-08T12:00:00.000Z", toolName: "ListProjects" });
  const expected = newestFirst([...projectRows, ...runtimeRows]);
  const seen: string[] = [];
  let cursor: ActivityResponse["nextCursor"] = null;
  for (let offset = 0; offset < expected.length; offset += PAGE_LIMIT) {
    const query = new URLSearchParams({ projectId: data.project.id, actorType: "agent", toolName: TOOL_NAME, limit: String(PAGE_LIMIT) });
    if (offset) { expect(cursor).not.toBeNull(); query.set("cursor", JSON.stringify(cursor)); }
    const response = await fetch(`${data.base}/api/activity?${query}`);
    expect(response.status).toBe(200);
    const page = activityResponseSchema.parse(await response.json());
    expectPage(page, expected.slice(offset));
    const repeated = await fetch(`${data.base}/api/activity?${query}`);
    expect(repeated.status).toBe(200);
    expect(activityResponseSchema.parse(await repeated.json())).toEqual(page);
    expect(page.activityEvents.every((event) => event.projectId === data.project.id || event.projectId === null)).toBe(true);
    seen.push(...page.activityEvents.map((event) => event.id));
    cursor = page.nextCursor;
  }
  expect(seen).toEqual(expected.map((event) => event.id));
  expect(new Set(seen).size).toBe(expected.length);
  expect(cursor).toBeNull();
});

it("rejects malformed HTTP audit filters and cursor coordinates without writes", async () => {
  const data = await fixture();
  const before = data.repository.listActivity();
  const malformed: Record<string, string>[] = [
    { limit: "0" }, { limit: "101" }, { limit: "1.5" }, { actorType: "any" },
    { toolName: "invalid tool" }, { toolName: "X".repeat(101) }, { projectId: "invalid" },
    { cursor: "{" }, { cursor: JSON.stringify({ id: data.project.id, createdAt: "invalid" }) },
    { cursor: JSON.stringify({ id: "invalid", createdAt: "2026-10-08T10:00:00.000Z" }) },
    { cursor: JSON.stringify({ id: data.project.id, createdAt: "2026-10-08T10:00:00.000Z", extra: true }) },
    { before: "unsupported" }
  ];
  for (const invalid of malformed) {
    const query = new URLSearchParams({ projectId: data.project.id, actorType: "agent", toolName: TOOL_NAME, limit: String(PAGE_LIMIT), ...invalid });
    const response = await fetch(`${data.base}/api/activity?${query}`);
    expect(response.status, query.toString()).toBe(400);
    expect(await response.json()).toMatchObject({ code: "validation", message: "Request validation failed." });
  }
  expect(data.repository.listActivity()).toEqual(before);
});

it("pages unscoped agent evidence before newer disabled/runtime rows without omissions or leaks", async () => {
  const data = await fixture();
  const permitted = [
    ...recordCalls(data, { projectId: data.project.id, count: 23, createdAt: "2026-10-08T10:00:00.000Z" }),
    ...recordCalls(data, { projectId: data.other.id, count: 19, createdAt: "2026-10-08T10:00:00.000Z" })
  ];
  recordCalls(data, { projectId: data.disabled.id, count: 35, createdAt: "2026-10-08T12:00:00.000Z", actor: { actorType: "agent", actorId: "disabled-paging-host" } });
  recordCalls(data, { projectId: null, count: 35, createdAt: "2026-10-08T12:00:00.000Z", actor: { actorType: "agent", actorId: "runtime-paging-host" } });
  recordCalls(data, { projectId: data.project.id, count: 21, createdAt: "2026-10-08T12:00:00.000Z", actor: HUMAN });
  recordCalls(data, { projectId: data.other.id, count: 21, createdAt: "2026-10-08T12:00:00.000Z", toolName: "ListProjects" });
  const expected = newestFirst(permitted);
  const registry = createMcpRegistry(data.repository, data.unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "paging-reader", mcpSessionId: "paging-reader-session" });
  const seen: string[] = [];
  let cursor: ActivityResponse["nextCursor"] = null;
  for (let offset = 0; offset < expected.length; offset += PAGE_LIMIT) {
    if (offset) expect(cursor).not.toBeNull();
    const query = { actorType: "agent", toolName: TOOL_NAME, limit: PAGE_LIMIT, ...(cursor ? { cursor: JSON.stringify(cursor) } : {}) };
    const page = activityResponseSchema.parse((await registry.call("ListActivity", query)).data);
    expectPage(page, expected.slice(offset));
    expect(activityResponseSchema.parse((await registry.call("ListActivity", query)).data)).toEqual(page);
    expect(page.activityEvents.every((event) => event.scope === "project" && [data.project.id, data.other.id].includes(event.projectId!))).toBe(true);
    for (const excluded of [data.disabled.id, "disabled-paging-host", "runtime-paging-host"]) expect(JSON.stringify(page)).not.toContain(excluded);
    seen.push(...page.activityEvents.map((event) => event.id));
    cursor = page.nextCursor;
  }
  expect(seen).toEqual(expected.map((event) => event.id));
  expect(new Set(seen).size).toBe(permitted.length);
  expect(cursor).toBeNull();
});

it("filters only known successful read tools before HTTP paging while retaining problems and unknown calls", async () => {
  const data = await fixture();
  const projectId = data.project.id;
  const retained = [
    ...recordCalls(data, { projectId, count: 2, createdAt: "2026-10-08T10:00:00.000Z", outcome: "error" }),
    ...recordCalls(data, { projectId, count: 2, createdAt: "2026-10-08T10:00:00.000Z", outcome: "rejected" }),
    ...recordCalls(data, { projectId, count: 2, createdAt: "2026-10-08T10:00:00.000Z", toolName: "UnknownReadTool" }),
    ...recordCalls(data, { projectId, count: 2, createdAt: "2026-10-08T10:00:00.000Z", toolName: "ApplyChangeSet" }),
    ...recordCalls(data, { projectId, count: 2, createdAt: "2026-10-08T10:00:00.000Z", toolName: "PlanWorkItems" })
  ];
  data.unitOfWork.run(AGENT, ({ repository }) => repository.logActivity(projectId, "project.updated", "project", projectId, { id: projectId, name: "Recorded name" }, { id: projectId, name: "Updated name" }));
  retained.push(data.repository.listActivity(projectId).find((event) => event.action === "project.updated")!);
  const reads = recordCalls(data, { projectId, count: 40, createdAt: "2026-10-08T12:00:00.000Z" });
  const expected = newestFirst(retained);
  const seen: string[] = [];
  let cursor: ActivityResponse["nextCursor"] = null;
  do {
    const query = new URLSearchParams({ projectId, actorType: "agent", view: "changes", limit: "3", ...(cursor ? { cursor: JSON.stringify(cursor) } : {}) });
    const response = await fetch(`${data.base}/api/activity?${query}`);
    expect(response.status).toBe(200);
    const page = activityResponseSchema.parse(await response.json());
    const remaining = expected.slice(seen.length);
    expect(page.activityEvents.map((event) => event.id)).toEqual(remaining.slice(0, 3).map((event) => event.id));
    const last = remaining.slice(0, 3).at(-1)!;
    expect(page.nextCursor).toEqual(remaining.length > 3 ? { id: last.id, createdAt: last.createdAt } : null);
    seen.push(...page.activityEvents.map((event) => event.id));
    cursor = page.nextCursor;
  } while (cursor);
  expect(seen).toEqual(expected.map((event) => event.id));
  for (const view of [undefined, "all"]) {
    const query = new URLSearchParams({ projectId, actorType: "agent", limit: "100", ...(view ? { view } : {}) });
    const page = activityResponseSchema.parse(await (await fetch(`${data.base}/api/activity?${query}`)).json());
    expect(page.activityEvents.map((event) => event.id)).toEqual(newestFirst([...retained, ...reads]).map((event) => event.id));
  }
  const toolQuery = new URLSearchParams({ projectId, view: "changes", toolName: TOOL_NAME, actorType: "agent" });
  const problems = activityResponseSchema.parse(await (await fetch(`${data.base}/api/activity?${toolQuery}`)).json());
  expect(problems.activityEvents.map((event) => event.id)).toEqual(expected.filter((event) => event.action === "tool_call" && (event.after as { toolName: string }).toolName === TOOL_NAME).map((event) => event.id));
  const registry = createMcpRegistry(data.repository, data.unitOfWork, { hostName: "changes-reader", mcpSessionId: "changes-reader-session" });
  const agentPage = activityResponseSchema.parse((await registry.call("ListActivity", { projectId, actorType: "agent", view: "changes", limit: 100 })).data);
  expect(agentPage.activityEvents.map((event) => event.id)).toEqual(expected.map((event) => event.id));
});
