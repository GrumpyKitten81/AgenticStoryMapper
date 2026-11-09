// @vitest-environment jsdom // REQ paged audit interactions
import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ActivitySummary } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { auditStrings as strings } from "@storymapper/ui-strings";
import { AuditRoute } from "@storymapper/web/app/routes/audit";

const fixture = vi.hoisted(() => ({ projectId: "" }));
vi.mock("@tanstack/react-router", () => ({ useParams: () => ({ projectId: fixture.projectId }), useSearch: () => ({}) }));
vi.mock("@storymapper/web/features/privacy/PrivacyExportPanel", () => ({ PrivacyExportPanel: () => null }));
vi.mock("@storymapper/web/features/reports/ReportsPanel", () => ({ ReportsPanel: () => null }));
vi.mock("@storymapper/web/features/restore-points/RestorePointsPanel", () => ({ RestorePointsPanel: () => null }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let events: ActivitySummary[];
let queries: URLSearchParams[];
let rejectNextPage: boolean;
let rejectFirstPage: boolean;
let releaseResponse: (() => void) | undefined;
let deferNextPage: boolean;
let releaseNextPage: (() => void) | undefined;
let nextPageSignal: AbortSignal | null | undefined;
let style: HTMLStyleElement | undefined;

function event(index: number): ActivitySummary {
  const runtime = index === 0;
  return {
    id: randomUUID(), projectId: runtime ? null : fixture.projectId, scope: runtime ? "runtime" : "project",
    actor: `host-${index}`, actorType: index % 2 ? "human" : "agent", mcpSessionId: "audit-session",
    action: "tool_call", createdAt: "2026-10-08T10:00:00.000Z",
    toolCall: { toolName: index % 3 ? "ListProjects" : "GetStoryMapCards", inputHash: "a".repeat(64), outputHash: "b".repeat(64),
      outcome: runtime ? "rejected" : "ok", affectedEntityIds: [randomUUID()], ...(runtime ? { rejectionReason: "disabled" as const } : {}) }
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent === text);
  expect(found, text).toBeDefined();
  return found!;
}

async function settled(assertion: () => void): Promise<void> {
  await vi.waitFor(async () => { await act(async () => {}); assertion(); });
}

async function mount(): Promise<void> {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(AuditRoute))));
}

async function filter(actor: string, tool: string): Promise<void> {
  await act(async () => {
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Actor type"]')!;
    select.value = actor;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, tool);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button(strings.applyFilters).click());
}

beforeEach(() => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.projectId = randomUUID();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  events = Array.from({ length: 1000 }, (_, index) => event(index));
  queries = [];
  rejectNextPage = false;
  rejectFirstPage = false;
  releaseResponse = undefined;
  deferNextPage = false;
  releaseNextPage = undefined;
  nextPageSignal = undefined;
  style = undefined;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/changesets?")) return json({ changeSets: [] });
    const query = new URL(path, "http://localhost").searchParams;
    queries.push(query);
    if (releaseResponse !== undefined) await new Promise<void>((resolve) => { releaseResponse = resolve; });
    if (query.has("cursor") && deferNextPage) {
      deferNextPage = false;
      nextPageSignal = init?.signal;
      await new Promise<void>((resolve) => { releaseNextPage = resolve; });
    }
    if ((query.has("cursor") && rejectNextPage) || (!query.has("cursor") && rejectFirstPage)) return json({ message: "Audit read refused." }, 503);
    const matching = events.filter((item) => (!query.has("actorType") || item.actorType === query.get("actorType")) && (!query.has("toolName") || item.toolCall?.toolName === query.get("toolName")));
    const cursor = query.get("cursor");
    const start = cursor ? matching.findIndex((item) => item.id === (JSON.parse(cursor) as { id: string }).id) + 1 : 0;
    const limit = Number(query.get("limit"));
    const page = matching.slice(start, start + limit);
    const last = page.at(-1);
    return json({ activityEvents: page, nextCursor: start + limit < matching.length && last ? { id: last.id, createdAt: last.createdAt } : null });
  }));
});

afterEach(async () => {
  releaseResponse?.();
  releaseNextPage?.();
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  style?.remove();
  vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

it("loads a bounded first page from 1,000 records and shows runtime identity, outcome and objects", async () => {
  await mount();
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  expect(queries).toHaveLength(1);
  expect(queries[0]!.get("limit")).toBe("20");
  expect(queries[0]!.get("view")).toBe("changes");
  expect(host.textContent).toContain(strings.runtime);
  expect(host.textContent).toContain("Agent: host-0");
  expect(host.textContent).toContain(strings.outcomes.rejected);
  expect(host.textContent).toContain("disabled");
  expect(host.textContent).toContain(events[0]!.toolCall!.affectedEntityIds[0]);
  expect(host.textContent).toContain(strings.session("audit-session"));
  expect(host.textContent).not.toContain("host-999");
});

it("pages filtered results and resets the cursor when either filter changes", async () => {
  await mount();
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  await filter("agent", "GetStoryMapCards");
  await settled(() => expect(queries.at(-1)!.get("toolName")).toBe("GetStoryMapCards"));
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  expect(queries.at(-1)!.get("actorType")).toBe("agent");
  expect(queries.at(-1)!.has("cursor")).toBe(false);
  expect([...host.querySelectorAll("ol li")].every((item) => item.textContent!.includes("Agent:") && item.textContent!.includes("GetStoryMapCards"))).toBe(true);
  await act(async () => button(strings.loadMore).click());
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(40));
  expect(queries.at(-1)!.has("cursor")).toBe(true);
  expect(new Set([...host.querySelectorAll("ol li")].map((item) => item.textContent)).size).toBe(40);
  await filter("human", "ListProjects");
  await settled(() => expect(queries.at(-1)!.get("actorType")).toBe("human"));
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  expect(queries.at(-1)!.has("cursor")).toBe(false);
  expect(host.textContent).not.toContain("Agent:");
  await filter("agent", "GetStoryMapCards");
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  expect(queries.at(-1)!.has("cursor")).toBe(false);
});

it("keeps loaded evidence after page failure and retries the same cursor", async () => {
  await mount();
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  rejectNextPage = true;
  await act(async () => button(strings.loadMore).click());
  await settled(() => expect(host.querySelector("[role=alert]")?.textContent).toContain("Request failed: 503"));
  expect(host.querySelectorAll("ol li")).toHaveLength(20);
  const cursor = queries.at(-1)!.get("cursor");
  rejectNextPage = false;
  await act(async () => button(strings.retry).click());
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(40));
  expect(queries.at(-1)!.get("cursor")).toBe(cursor);
  expect(host.querySelector("[role=alert]")).toBeNull();
});

it("announces loading and first-page errors, then shows a matching empty state after retry", async () => {
  releaseResponse = () => {};
  rejectFirstPage = true;
  await mount();
  expect(host.querySelector("[role=status]")?.textContent).toBe(strings.loading);
  await act(async () => { const release = releaseResponse; releaseResponse = undefined; release?.(); });
  await settled(() => expect(host.querySelector("[role=alert]")).not.toBeNull());
  rejectFirstPage = false;
  events = [];
  await act(async () => button(strings.retry).click());
  await settled(() => expect(host.textContent).toContain(strings.empty));
  expect(host.querySelector("[role=status]")?.textContent).toBe("");
});

it("cancels an old in-flight next page before trimming pages when filters switch away and back", async () => {
  await mount();
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  await filter("agent", "GetStoryMapCards");
  await settled(() => expect(queries.at(-1)!.get("actorType")).toBe("agent"));
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  await act(async () => button(strings.loadMore).click());
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(40));
  deferNextPage = true;
  await act(async () => button(strings.loadMore).click());
  await settled(() => expect(releaseNextPage).toBeDefined());
  await filter("human", "ListProjects");
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  expect(nextPageSignal?.aborted).toBe(true);
  const oldKey = ["activity", fixture.projectId, "agent", "GetStoryMapCards", "changes"];
  expect(client.getQueryData<{ pages: unknown[] }>(oldKey)?.pages).toHaveLength(1);
  await act(async () => releaseNextPage?.());
  await filter("agent", "GetStoryMapCards");
  await settled(() => expect(queries.at(-1)!.get("actorType")).toBe("agent"));
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  expect(queries.at(-1)!.has("cursor")).toBe(false);
  expect(client.getQueryData<{ pages: unknown[] }>(oldKey)?.pages).toHaveLength(1);
});

it.each(["List Projects", "L".repeat(101), "/private"])("retains evidence and rejects invalid tool filter %s before requesting it", async (tool) => {
  await mount();
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  const evidence = host.querySelector("ol")!.textContent;
  await filter("human", tool);
  expect(host.querySelector("#audit-tool-filter-error")?.textContent).toBe(strings.invalidToolName);
  expect(host.querySelector("input")?.getAttribute("aria-invalid")).toBe("true");
  expect(host.querySelector("input")?.getAttribute("aria-describedby")).toBe("audit-tool-filter-error");
  expect(host.querySelector("ol")!.textContent).toBe(evidence);
  expect(queries).toHaveLength(1);
  await filter("human", "ListProjects");
  await settled(() => expect(queries.at(-1)!.get("toolName")).toBe("ListProjects"));
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  expect(host.querySelector("#audit-tool-filter-error")).toBeNull();
});

it("applies wrapping to complete hashes, session and object IDs inside narrow audit panels", async () => {
  style = document.createElement("style");
  style.textContent = readStylesheet(join(process.cwd(), "src/styles/global.css"));
  document.head.append(style);
  host.style.width = "240px";
  const session = "s".repeat(200);
  events[0]!.mcpSessionId = session;
  await mount();
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  const row = host.querySelector("ol li")!;
  expect(getComputedStyle(row).overflowWrap).toBe("anywhere");
  expect(getComputedStyle(host.querySelector(".audit-panel")!).minWidth).toBe("0");
  expect(row.textContent).toContain(session);
  expect(row.textContent).toContain(events[0]!.toolCall!.inputHash);
  expect(row.textContent).toContain(events[0]!.toolCall!.outputHash);
  expect(row.textContent).toContain(events[0]!.toolCall!.affectedEntityIds[0]);
});

it("switches the activity view with a fresh first page and keeps technical identifiers collapsed", async () => {
  await mount();
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  await act(async () => button(strings.loadMore).click());
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(40));
  await act(async () => {
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Activity view"]')!;
    select.value = "all";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settled(() => expect(queries.at(-1)!.get("view")).toBe("all"));
  expect(queries.at(-1)!.has("cursor")).toBe(false);
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  await act(async () => {
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Activity view"]')!;
    select.value = "changes";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settled(() => expect(queries.at(-1)!.get("view")).toBe("changes"));
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(20));
  expect(queries.at(-1)!.has("cursor")).toBe(false);
  const row = host.querySelector("ol li")!;
  expect(row.querySelector("details")!.open).toBe(false);
  const visible = row.cloneNode(true) as HTMLElement;
  visible.querySelectorAll("details").forEach((details) => details.remove());
  expect(visible.textContent).not.toContain(events[0]!.toolCall!.inputHash);
  expect(visible.textContent).not.toContain("audit-session");
  expect(visible.textContent).not.toContain(events[0]!.toolCall!.affectedEntityIds[0]);
});

it("presents recorded historical names and changes without top-level identifier walls", async () => {
  const original = event(1);
  events = [{ ...original, action: "card.updated", toolCall: undefined,
    subject: { type: "card", id: original.id, key: "LSM-1", name: "Recorded title" },
    changes: [{ field: "title", before: "Original", after: "Recorded title" }] }];
  await mount();
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(1));
  const row = host.querySelector("ol li")!;
  expect(row.textContent).toContain("Card updated");
  expect(row.textContent).toContain("LSM-1 · Recorded title");
  expect(row.textContent).toContain("Title: Original → Recorded title");
});

it("keeps unknown prototype-property action and tool names neutral", async () => {
  const recorded = event(1);
  events = [{ ...recorded, action: "card.constructor", toolCall: undefined },
    { ...event(2), toolCall: { ...recorded.toolCall!, toolName: "toString" } }];
  await mount();
  await settled(() => expect(host.querySelectorAll("ol li")).toHaveLength(2));
  expect(host.querySelector("ol li strong")!.textContent).toBe("Activity recorded");
  expect(host.querySelectorAll("ol li strong")[1]!.textContent).toBe("Tool execution recorded");
  expect(host.textContent).not.toContain("function Object");
});
