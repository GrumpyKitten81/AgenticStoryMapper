// @vitest-environment jsdom // REQ Story7.7 mounted ticket composer requests and stale draft guards
import { randomUUID } from "node:crypto";
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { changeSetSchema, connectorConnectionSchema, type ImportGitHubTicketRequest, type LookupGitHubTicketRequest, type LookupGitHubTicketResponse, type ChangeSetPreviewResponse } from "@storymapper/contracts";
import { button, mount, state, projectId, storyMapId, cardId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";
import { router } from "@storymapper/web/app/router";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";

const lookupPath = "/api/sync/work-items/lookup-ticket";
const importPath = "/api/sync/work-items/import-ticket";
const ticket: LookupGitHubTicketResponse = { ticket: { locator: "https://github.com/fixture/repo/issues/42", number: 42, title: "Remote Issue", description: "Remote body", issueType: "Bug" }, reviewEvidence: { epoch: "initial", scopeHash: "a".repeat(64), remoteHash: "b".repeat(64) } };
const composer = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
function input(label: string) { return [...composer().querySelectorAll("label")].find((node) => node.textContent?.startsWith(label))!.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")!; }
async function field(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
function mockRequests(handler: (path: string, init?: RequestInit) => Promise<Response | undefined> | undefined) {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, init) => (await handler(String(path), init)) ?? original(path, init));
}
async function open() {
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label^="New story for "]')!.click());
  await vi.waitFor(() => expect(input("Ticket connection").value).toBe(state.connections[0]!.id));
}
async function lookup() {
  await field(input("GitHub ticket"), "#42");
  await act(async () => button("Look up ticket").click());
  await vi.waitFor(() => expect(composer().textContent).toContain("Remote Issue"));
}
function incoming(outcome: "proposed" | "applied") {
  const changeSet = changeSetSchema.parse({ id: randomUUID(), projectId, title: "Import ticket", source: "github", status: outcome === "applied" ? "applied" : "proposed", createdAt: "2026-10-19T00:00:00.000Z", operations: [{ operationId: "ticket", op: "create", entity: "card", entityId: randomUUID(), after: { storyMapId, level: "story", title: "Remote Issue" } }] });
  return { changeSet, changeSetId: changeSet.id, previewRef: { changeSetId: changeSet.id }, outcome, items: [{ status: outcome === "applied" ? "succeeded" as const : "proposed" as const, cardId, remoteId: "42" }] };
}
beforeEach(() => {
  useLiveInteractionStore.setState({ epoch: "initial", restoreRevision: 0, restorePending: false, reviewRevision: 0 });
  state.connections = [connectorConnectionSchema.parse({ id: randomUUID(), projectId, provider: "github", name: "Repository", owner: "fixture", repository: "repo", authMode: "github-cli", createdAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z" })];
});

it("looks up without domain writes, deliberately replaces text, and submits one atomic linked command with exact placement and template defaults", async () => {
  const releaseId = randomUUID();
  state.snapshot.releases.push({ id: releaseId, version: 1, storyMapId, name: "Delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false });
  const templateId = randomUUID();
  state.snapshot.storyTemplates = [{ id: templateId, projectId, storyMapId: null, name: "Draft template", descriptionTemplate: "Authored body", defaultStatus: "active", defaultEstimate: 0, position: 0 }];
  const lookups: LookupGitHubTicketRequest[] = [], writes: ImportGitHubTicketRequest[] = [];
  let finish!: (response: Response) => void;
  mockRequests(async (path, init) => {
    if (path === lookupPath) { lookups.push(JSON.parse(String(init?.body))); return Response.json(ticket); }
    if (path === importPath) { writes.push(JSON.parse(String(init?.body))); return new Promise((resolve) => { finish = resolve; }); }
    return undefined;
  });
  await open();
  await field(input("Title"), "Authored title");
  await field(document.querySelector<HTMLSelectElement>('[aria-label="Apply template"]')!, templateId);
  await field(input("Parent"), state.snapshot.cards[1]!.id);
  await field(input("Release"), releaseId);
  await field(input("Position"), "4");
  await lookup();
  expect(input("Title").value).toBe("Authored title"); expect(writes).toHaveLength(0);
  await act(async () => button("Use ticket title and description").click());
  await act(async () => button("Cancel").click());
  expect(input("Title").value).toBe("Authored title"); expect(composer().querySelector("textarea")!.value).toBe("Authored body");
  await act(async () => button("Use ticket title and description").click());
  await act(async () => button("Replace draft").click());
  expect(input("Title").value).toBe("Remote Issue");
  await act(async () => { button("Create linked Card").click(); button("Create linked Card").click(); });
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({ ...lookups[0], reviewEvidence: ticket.reviewEvidence, title: "Remote Issue", description: "Remote body", status: "active", estimate: 0, apply: true });
  expect(lookups[0]?.placement).toEqual({ level: "story", parentId: state.snapshot.cards[1]!.id, releaseId, position: 4 });
  expect(input("Title").disabled).toBe(true);
  await act(async () => finish(Response.json(incoming("applied"))));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(vi.mocked(fetch).mock.calls.some(([path, init]) => path === "/api/cards" && init?.method === "POST")).toBe(false);
});

it("cancels a pending lookup with AbortSignal and ignores its late response while retaining the draft", async () => {
  let finish!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  mockRequests((path, init) => path === lookupPath ? new Promise((resolve) => { finish = resolve; signal = init?.signal ?? undefined; }) : undefined);
  await open(); await field(input("Title"), "Retained draft"); await field(input("GitHub ticket"), "42");
  await act(async () => button("Look up ticket").click());
  await act(async () => button("Cancel lookup").click());
  expect(signal?.aborted).toBe(true); expect(document.activeElement).toBe(input("GitHub ticket"));
  await act(async () => finish(Response.json(ticket)));
  expect(input("Title").value).toBe("Retained draft");
  expect(composer().textContent).not.toContain("Remote Issue");
  expect(composer().textContent).toContain("Lookup cancelled");
});

it.each(["selector", "placement", "restore", "parent", "release"])("refuses late lookup adoption after %s changes", async (change) => {
  const releaseId = randomUUID();
  state.snapshot.releases.push({ id: releaseId, version: 1, storyMapId, name: "Delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false });
  let finish!: (response: Response) => void;
  mockRequests((path) => path === lookupPath ? new Promise((resolve) => { finish = resolve; }) : undefined);
  await open(); await field(input("Title"), "Retained draft");
  await field(input("Parent"), state.snapshot.cards[1]!.id); await field(input("Release"), releaseId);
  await field(input("GitHub ticket"), "42"); await act(async () => button("Look up ticket").click());
  if (change === "selector") await field(input("GitHub ticket"), "43");
  if (change === "placement") await field(input("Position"), "7");
  if (change === "restore") await act(async () => useLiveInteractionStore.getState().recordEpoch("restored"));
  if (change === "parent" || change === "release") {
    if (change === "parent") state.snapshot.cards = state.snapshot.cards.filter((card) => card.level !== "step");
    else state.snapshot.releases = [];
    await act(async () => state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }));
  }
  await act(async () => finish(Response.json(ticket)));
  expect(input("Title").value).toBe("Retained draft"); expect(composer().textContent).not.toContain("Remote Issue");
});

it("opens an existing scoped Card rather than creating or reassigning it", async () => {
  mockRequests((path) => path === lookupPath ? Promise.resolve(Response.json({ ...ticket, existingCardId: cardId })) : undefined);
  await open(); await lookup();
  expect(composer().querySelector('[role="status"]')?.textContent).toContain("already linked");
  await act(async () => button("Open existing Card").click());
  await vi.waitFor(() => {
    expect(document.querySelector('[aria-label="Import a GitHub ticket"]')).toBeNull();
    expect((router.state.location.search as { card?: string }).card).toBe(cardId);
    const detail = document.querySelector<HTMLElement>('[role="dialog"].card-detail-modal');
    expect(detail?.querySelector("h2")?.textContent).toBe(state.snapshot.cards.find((card) => card.id === cardId)!.title);
    expect(detail?.closest("[inert], [hidden]")).toBeNull();
  });
  expect(vi.mocked(fetch).mock.calls.some(([path]) => path === importPath)).toBe(false);
});

it("retains authored text after a failed lookup and rejects foreign repository selectors without traffic", async () => {
  let lookups = 0;
  mockRequests((path) => { if (path === lookupPath) { lookups++; return Promise.resolve(Response.json({ message: "Issue inaccessible or missing. Check repository access." }, { status: 404 })); } return undefined; });
  await open(); await field(input("Title"), "Retained draft"); await field(input("GitHub ticket"), "https://example.com/fixture/repo/issues/42");
  await act(async () => button("Look up ticket").click());
  expect(composer().textContent).toContain("valid GitHub Issue"); expect(lookups).toBe(0);
  await field(input("GitHub ticket"), "42"); await act(async () => button("Look up ticket").click());
  await vi.waitFor(() => expect(composer().textContent).toContain("Issue inaccessible or missing"));
  expect(input("Title").value).toBe("Retained draft"); expect(lookups).toBe(1);
});

it("keeps the draft and placement through a shared connection dialog Cancel while GitHub is off", async () => {
  mockRequests((path) => path === `/api/settings/safety?projectId=${projectId}` ? Promise.resolve(Response.json({ settings: { projectId, github: false, agentMode: "apply", updatedAt: "2026-10-19T00:00:00.000Z" } })) : undefined);
  await open(); await field(input("Title"), "Draft before connecting"); await field(input("Position"), "4");
  expect(button("Look up ticket").disabled).toBe(true);
  await act(async () => button("Connect GitHub").click());
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
  await act(async () => button("Cancel").click());
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(input("Title").value).toBe("Draft before connecting"); expect(input("Position").value).toBe("4");
  expect(vi.mocked(fetch).mock.calls.some(([path]) => path === lookupPath)).toBe(false);
});

it.each([false, true])("keeps a protected proposal visible and closes only after an applied selection actually creates its Card (excluded=%s)", async (excluded) => {
  const command = incoming("proposed");
  command.changeSet.operations.push({ operationId: "sync-run", entityId: randomUUID(), op: "create", entity: "syncRun", after: { projectId, storyMapId, connectionId: state.connections[0]!.id, provider: "github", mode: "import", status: "applied", summary: "Incoming ticket import" } });
  const preview: ChangeSetPreviewResponse = { changeSet: command.changeSet, presentationStatus: "proposed", closed: false, selectedOperationIds: ["ticket", "sync-run"], conflicts: [], boards: [], operations: command.changeSet.operations.map((operation, index) => ({ operationId: operation.operationId, index, kind: `create:${operation.entity}`, label: operation.entity, status: "changed", dependencies: [], owners: [], changes: [], operation })), canApprove: true, canApply: false };
  const posts: string[] = [];
  mockRequests(async (path, init) => {
    if (path === lookupPath) return Response.json(ticket);
    if (path === importPath) return Response.json(command);
    if (!path.startsWith(`/api/changesets/${command.changeSetId}`)) return undefined;
    if (init?.method === "POST") {
      posts.push(path);
      if (path.endsWith("/approve")) { preview.canApply = true; preview.changeSet.status = "approved"; preview.presentationStatus = "approved"; }
      if (path.endsWith("/apply")) { preview.changeSet.status = "applied"; preview.presentationStatus = "applied"; preview.closed = true; preview.changeSet.execution = { actor: { actorId: "human", actorType: "human" }, appliedAt: "2026-10-19T00:00:00.000Z", selectedOperationIds: preview.selectedOperationIds, operationResults: preview.selectedOperationIds.map((operationId, index) => ({ operationId, index, entityIds: [randomUUID()] })), retainedPreparedEffects: [] }; }
      return Response.json({ changeSet: preview.changeSet });
    }
    const selection = new URL(path, "http://localhost").searchParams.get("selectedOperationIds");
    if (selection) preview.selectedOperationIds = JSON.parse(selection) as string[];
    return Response.json(preview);
  });
  await open(); await lookup();
  await act(async () => button("Use ticket title and description").click());
  await act(async () => button("Create linked Card").click());
  await vi.waitFor(() => expect(composer().textContent).toContain("Linked Card proposed"));
  expect(input("Title").value).toBe("Remote Issue"); expect(posts).toEqual([]);
  await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>('input[aria-label="Select operation 1: card"]')).not.toBeNull());
  if (excluded) {
    await act(async () => document.querySelector<HTMLInputElement>('input[aria-label="Select operation 1: card"]')!.click());
    await vi.waitFor(() => expect(preview.selectedOperationIds).toEqual(["sync-run"]));
  }
  await act(async () => button("Approve selection").click());
  await vi.waitFor(() => expect(button("Apply selection").getAttribute("aria-disabled")).toBe("false"));
  await act(async () => button("Apply selection").click());
  if (excluded) {
    await vi.waitFor(() => expect(composer().textContent).toContain("selection was applied without creating a Card"));
    expect(input("Title").value).toBe("Remote Issue"); expect(state.snapshot.cards).toHaveLength(3);
  } else await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(posts).toEqual([`/api/changesets/${command.changeSetId}/approve`, `/api/changesets/${command.changeSetId}/apply`]);
});

it.each(["ticket-first", "manual-first"])("admits only one creation when manual and linked creation are clicked in the same event (%s)", async (order) => {
  let finish!: (response: Response) => void;
  const writes: string[] = [];
  mockRequests((path, init) => {
    if (path === lookupPath) return Promise.resolve(Response.json(ticket));
    if ((path === importPath || path === "/api/cards") && init?.method === "POST") {
      writes.push(path); return new Promise((resolve) => { finish = resolve; });
    }
    return undefined;
  });
  await open(); await lookup(); await act(async () => button("Use ticket title and description").click());
  await act(async () => {
    const manual = button("Create Card"), linked = button("Create linked Card");
    if (order === "ticket-first") { linked.click(); manual.click(); }
    else { manual.click(); linked.click(); }
  });
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  expect(writes).toEqual([order === "ticket-first" ? importPath : "/api/cards"]);
  await act(async () => finish(order === "ticket-first" ? Response.json(incoming("applied")) : Response.json(state.snapshot.cards[2])));
});

it("ignores a late successful ticket creation after Restore and preserves the authored draft", async () => {
  let finish!: (response: Response) => void;
  mockRequests((path) => path === lookupPath ? Promise.resolve(Response.json(ticket)) : path === importPath ? new Promise((resolve) => { finish = resolve; }) : undefined);
  await open(); await lookup(); await act(async () => button("Use ticket title and description").click());
  await act(async () => button("Create linked Card").click());
  await act(async () => useLiveInteractionStore.getState().recordEpoch("restored"));
  await act(async () => finish(Response.json(incoming("applied"))));
  expect(input("Title").value).toBe("Remote Issue");
  expect(composer().textContent).toContain("Look up the ticket again");
});

it("handles a duplicate discovered at confirmation by offering the existing Card without closing the draft", async () => {
  mockRequests((path) => path === lookupPath ? Promise.resolve(Response.json(ticket)) : path === importPath ? Promise.resolve(Response.json({ outcome: "already_linked", cardId, url: ticket.ticket.locator })) : undefined);
  await open(); await lookup(); await act(async () => button("Use ticket title and description").click());
  await act(async () => button("Create linked Card").click());
  await vi.waitFor(() => expect(composer().textContent).toContain("already linked"));
  expect(input("Title").value).toBe("Remote Issue"); expect(button("Open existing Card")).toBeDefined();
  expect(composer().querySelector('[role="status"]')?.textContent).toContain("already linked");
});

it("retains the draft and exact placement after an import refusal without claiming creation", async () => {
  mockRequests((path) => path === lookupPath ? Promise.resolve(Response.json(ticket)) : path === importPath ? Promise.resolve(Response.json({ message: "Remote Issue changed. Look up the ticket again." }, { status: 409 })) : undefined);
  await open(); await field(input("Position"), "3"); await lookup();
  await act(async () => button("Use ticket title and description").click());
  await act(async () => button("Create linked Card").click());
  await vi.waitFor(() => expect(composer().textContent).toContain("Remote Issue changed"));
  expect(input("Title").value).toBe("Remote Issue"); expect(input("Position").value).toBe("3"); expect(state.snapshot.cards).toHaveLength(3);
});

it.each(["selector", "connection"])("refuses same-event linked creation and text population after %s invalidation", async (changed) => {
  state.connections.push({ ...state.connections[0]!, id: randomUUID(), name: "Other connection" });
  state.snapshot.storyMap.defaultConnectionId = state.connections[0]!.id;
  let imports = 0;
  mockRequests((path) => {
    if (path === lookupPath) return Promise.resolve(Response.json(ticket));
    if (path === importPath) { imports++; return Promise.resolve(Response.json(incoming("applied"))); }
    return undefined;
  });
  await open(); await field(input("Title"), "Retained authored title"); await lookup();
  await act(async () => button("Keep my draft text").click());
  await act(async () => {
    const linked = button("Create linked Card"), populate = button("Use ticket title and description");
    const control = input(changed === "selector" ? "GitHub ticket" : "Ticket connection");
    const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(control, changed === "selector" ? "43" : state.connections[1]!.id);
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    linked.click(); populate.click();
  });
  expect(imports).toBe(0); expect(input("Title").value).toBe("Retained authored title");
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
});


it("announces a successful lookup and preserves the Issue description Markdown whitespace in its preview", async () => {
  const description = "## Scope\n\n- First item\n  Continuation\n- Second item";
  mockRequests((path) => path === lookupPath ? Promise.resolve(Response.json({ ...ticket, ticket: { ...ticket.ticket, description } })) : undefined);
  await open(); await lookup();
  expect(composer().querySelector('[role="status"]')?.textContent).toBe("Issue #42 found. Review its content before creating a linked Card.");
  const preview = [...composer().querySelectorAll("p")].find((paragraph) => paragraph.textContent === description);
  expect(preview).toBeDefined(); expect(preview!.style.whiteSpace).toBe("pre-wrap");
});
