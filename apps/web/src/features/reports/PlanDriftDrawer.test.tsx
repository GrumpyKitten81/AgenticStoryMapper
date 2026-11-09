// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { PlanDriftReport, SourcePlanEntry } from "@storymapper/contracts";
import { PlanDriftDrawer } from "@storymapper/web/features/reports/PlanDriftDrawer";
import { cardId, state, storyMapId } from "@storymapper/web/test-fixtures/card-detail";
import { liveUpdatesHeld, useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";

function report(): PlanDriftReport {
  const card = state.snapshot.cards.find((item) => item.id === cardId)!;
  const before: SourcePlanEntry = { cardId, identity: { id: cardId, key: card.key, title: "Source title" }, releaseName: "Source Slice", card: { ...card, title: "Source title", description: "Source description", releaseId: storyMapId }, active: true, binding: null };
  return { storyMapId, baselineId: storyMapId, system: "alpha", baselineVersion: 1, changes: [{ cardId, kinds: ["changed", "moved"], reason: "active", before,
    after: { ...before, identity: { id: cardId, key: card.key, title: card.title }, releaseName: "Local Slice", card: { ...card, description: "Local description", status: "active", releaseId: cardId } }, beforeReleaseName: "Source Slice", afterReleaseName: "Local Slice" }] };
}

async function mount(readOnly = false) {
  state.client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.root = createRoot(state.host);
  await act(async () => state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(PlanDriftDrawer, { storyMapId, readOnly }))));
}

async function click(label: string) {
  const target = [...state.host.querySelectorAll("button")].find((item) => item.textContent === label)!;
  await act(async () => target.click());
}

async function settle(text: string) {
  await vi.waitFor(async () => { await act(async () => {}); expect(state.host.textContent).toContain(text); });
}

function transport(systems = ["alpha", "beta"]) {
  let failure = false;
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    requests.push(path);
    const value = path.endsWith("/systems") ? { systems } : failure ? { message: "Source baseline unavailable" } : path.endsWith("=beta") ? { ...report(), system: "beta", changes: [] } : report();
    return new Response(JSON.stringify(value), { status: failure && !path.endsWith("/systems") ? 409 : 200 });
  }));
  return { requests, fail: () => { failure = true; }, succeed: () => { failure = false; } };
}

describe("Plan drift drawer", () => {
  it("shows exact old/new fields, simultaneous kinds and independent source selection", testShowsExactOldNewFieldsSimultaneousKindsAndIndependentSourceSelection);

  registerHidesCachedSuccessAfterARefreshFailureAndExposes();

  it("keeps cached report nodes and drawer scroll mounted during a background read, then hides them on failure", testKeepsCachedReportNodesAndDrawerScrollMountedDuringABackground);

  it.each([false, true])("returns successful retry focus only when its removed action still owns focus; moved=%s", async (moveFocus) => {
    const api = transport(); api.fail(); await mount(); await click("Plan drift"); await settle("Source baseline unavailable");
    const retry = [...state.host.querySelectorAll("button")].find((item) => item.textContent === "Retry plan drift")!;
    const select = state.host.querySelector("select")!;
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    retry.focus();
    await act(async () => retry.click());
    if (moveFocus) select.focus();
    await act(async () => finish(Response.json(report())));
    await settle("Source description");
    expect(document.activeElement).toBe(moveFocus ? select : [...state.host.querySelectorAll("button")].find((item) => item.textContent === "Close plan drift"));
  });

  it("retains removed identities and explains archived and physically deleted Cards", testRetainsRemovedIdentitiesAndExplainsArchivedAndPhysicallyDeletedCards);

  it("keeps a vanished selected system visible as unavailable", async () => {
    transport(); await mount(); await click("Plan drift"); await settle("Source description");
    await act(async () => state.client.setQueryData(["plan-drift-systems", storyMapId], ["beta"]));
    await settle("alpha");
    expect(state.host.querySelector("select")?.value).toBe("alpha");
    expect(state.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(state.host.querySelector("article")).toBeNull();
  });

  it("includes the selector in keyboard wrapping and lets canonical updates refresh the drawer", testIncludesTheSelectorInKeyboardWrappingAndLetsCanonicalUpdatesRefresh);

  it("disables preview reads", async () => {
    const api = transport([]); await mount(true);
    expect(state.host.querySelector("button")?.disabled).toBe(true);
    expect(api.requests).toEqual([]);
  });

  it("bounds dense DOM creation and makes all 1,000 differences reachable through keyboard-accessible pages", testBoundsDenseDOMCreationAndMakesAll1000DifferencesReachable);

  it("moves focus after two-page boundary controls become enabled and resets a new baseline revision", testMovesFocusAfterTwoPageBoundaryControlsBecomeEnabledAndResets);

  it("distinguishes no synchronized systems from no drift", async () => {
    transport([]); await mount(); await click("Plan drift");
    await settle("No synchronized source systems");
    expect(state.host.textContent).not.toContain("No drift from");
  });
});

function registerHidesCachedSuccessAfterARefreshFailureAndExposes() {
  it("hides cached success after a refresh failure and exposes retry", async () => {
    const api = transport();
    await mount(); await click("Plan drift"); await settle("Source description");
    api.fail();
    await act(async () => { await state.client.invalidateQueries({ queryKey: ["plan-drift", storyMapId] }); });
    await settle("Source baseline unavailable");
    expect(state.host.querySelector("article")).toBeNull();
    expect(state.host.querySelector('[role="alert"]')?.textContent).toContain("Retry plan drift");
  });
}

async function testShowsExactOldNewFieldsSimultaneousKindsAndIndependentSourceSelection() {
  const api = transport();
  await mount();
  expect(api.requests).toEqual([]);
  await click("Plan drift");
  await settle("Source description");
  for (const value of ["Local description", "Source title", "Create traceable story cards", "Changed", "Moved", "Source Slice", "Local Slice"]) expect(state.host.textContent).toContain(value);
  const select = state.host.querySelector("select")!;
  await act(async () => { select.value = "beta"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle("No drift from the synchronized source plan.");
  expect(state.host.textContent).not.toContain("Source description");
  expect(api.requests.at(-1)).toContain("system=beta");
}

async function testKeepsCachedReportNodesAndDrawerScrollMountedDuringABackground() {
  transport(); await mount(); await click("Plan drift"); await settle("Source description");
  const article = state.host.querySelector("article")!, drawer = state.host.querySelector<HTMLElement>('[role="dialog"]')!;
  drawer.scrollTop = 120;
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
  await act(async () => { void state.client.invalidateQueries({ queryKey: ["plan-drift", storyMapId] }); });
  await vi.waitFor(() => expect(drawer.getAttribute("aria-busy")).toBe("true"));
  expect(state.host.querySelector("article")).toBe(article);
  expect(drawer.scrollTop).toBe(120);
  await act(async () => finish(Response.json({ message: "Refetch failed" }, { status: 409 })));
  await settle("Refetch failed");
  expect(state.host.querySelector("article")).toBeNull();
}

async function testRetainsRemovedIdentitiesAndExplainsArchivedAndPhysicallyDeletedCards() {
  transport(); await mount(); await click("Plan drift"); await settle("Source description");
  const original = report();
  const removed = original.changes[0]!;
  await act(async () => state.client.setQueryData(["plan-drift", storyMapId, "alpha"], { ...original, changes: [
    { ...removed, kinds: ["removed"], reason: "deleted", after: null, afterReleaseName: null },
    { ...removed, cardId: state.snapshot.cards[0]!.id, kinds: ["removed"], reason: "archived", after: { ...removed.after!, active: false } }
  ] }));
  expect(state.host.textContent).toContain("Physically deleted");
  expect(state.host.textContent).toContain("Archived");
  expect(state.host.textContent).toContain("Not present");
  expect(state.host.querySelectorAll("article")).toHaveLength(2);
}

async function testIncludesTheSelectorInKeyboardWrappingAndLetsCanonicalUpdatesRefresh() {
  transport(); await mount(); await click("Plan drift"); await settle("Source description");
  const select = state.host.querySelector("select")!;
  select.focus();
  expect(liveUpdatesHeld(document)).toBe(false);
  await act(async () => select.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
  expect(document.activeElement?.textContent).toBe("Close plan drift");
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(select);
  useLiveInteractionStore.getState().setManualHold(true);
  expect(liveUpdatesHeld(document)).toBe(true);
  useLiveInteractionStore.getState().setManualHold(false);
  await act(async () => select.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(state.host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement?.textContent).toBe("Plan drift");
}

async function testBoundsDenseDOMCreationAndMakesAll1000DifferencesReachable() {
  transport();
  const original = fetch, source = report(), change = source.changes[0]!;
  const dense: PlanDriftReport = { ...source, changes: Array.from({ length: 1_000 }, (_, index) => {
    const id = randomUUID(), key = `LSM-${index + 1}`;
    return { ...change, cardId: id,
      before: { ...change.before!, cardId: id, identity: { ...change.before!.identity, id, key }, card: { ...change.before!.card!, id, key } },
      after: { ...change.after!, cardId: id, identity: { ...change.after!.identity, id, key }, card: { ...change.after!.card!, id, key } } };
  }) };
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => path.endsWith("system=alpha") ? Response.json(dense) : original(path, init)));
  await mount(); await click("Plan drift"); await settle("1000 Cards differ");
  const seen = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    const articles = [...state.host.querySelectorAll("article")];
    expect(articles).toHaveLength(50);
    expect(state.host.textContent).toContain(`Showing ${page * 50 + 1}–${(page + 1) * 50} of 1000 differences.`);
    for (const article of articles) seen.add(article.querySelector("h3")!.textContent!);
    if (page < 19) { const next = [...state.host.querySelectorAll("button")].find((item) => item.textContent === "Next differences")!; next.focus(); await click("Next differences"); }
  }
  expect(seen.size).toBe(1_000);
  const previous = [...state.host.querySelectorAll("button")].find((item) => item.textContent === "Previous differences")!;
  expect(document.activeElement).toBe(previous);
  expect([...state.host.querySelectorAll("button")].find((item) => item.textContent === "Next differences")!.disabled).toBe(true);
  await click("Previous differences");
  expect(state.host.textContent).toContain("Showing 901–950");
  await act(async () => state.client.setQueryData(["plan-drift", storyMapId, "alpha"], { ...dense, changes: dense.changes.slice(0, 20) }));
  expect(state.host.querySelectorAll("article")).toHaveLength(20);
  expect(document.activeElement).toBe(state.host.querySelector("select"));
  await act(async () => state.client.setQueryData(["plan-drift", storyMapId, "alpha"], dense));
  expect(state.host.textContent).toContain("Showing 1–50");
  const select = state.host.querySelector("select")!;
  await act(async () => { select.value = "beta"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle("No drift from the synchronized source plan.");
  await act(async () => { select.value = "alpha"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle("Showing 1–50");
  const first = state.host.querySelector("article")!;
  await act(async () => state.client.setQueryData(["plan-drift", storyMapId, "alpha"], { ...dense, changes: dense.changes.slice(0, 20) }));
  expect(state.host.querySelector("article")).toBe(first);
  expect(state.host.querySelectorAll("article")).toHaveLength(20);
  expect(state.host.querySelector('nav[aria-label="Plan drift pages"]')).toBeNull();
}

async function testMovesFocusAfterTwoPageBoundaryControlsBecomeEnabledAndResets() {
  transport(); await mount(); await click("Plan drift"); await settle("Source description");
  const source = report(), change = source.changes[0]!;
  const twoPages = { ...source, changes: Array.from({ length: 51 }, () => ({ ...change, cardId: randomUUID() })) };
  await act(async () => state.client.setQueryData(["plan-drift", storyMapId, "alpha"], twoPages));
  const next = [...state.host.querySelectorAll("button")].find((item) => item.textContent === "Next differences")!;
  const previous = [...state.host.querySelectorAll("button")].find((item) => item.textContent === "Previous differences")!;
  next.focus(); await click("Next differences");
  expect(state.host.textContent).toContain("Showing 51–51 of 51 differences.");
  expect(previous.disabled).toBe(false); expect(next.disabled).toBe(true); expect(document.activeElement).toBe(previous);
  await click("Previous differences");
  expect(previous.disabled).toBe(true); expect(next.disabled).toBe(false); expect(document.activeElement).toBe(next);
  await click("Next differences");
  await act(async () => state.client.setQueryData(["plan-drift", storyMapId, "alpha"], { ...twoPages, baselineVersion: 2 }));
  expect(state.host.textContent).toContain("Showing 1–50 of 51 differences.");
  expect(document.activeElement).toBe(state.host.querySelector("select"));
  next.focus();
  await act(async () => state.client.setQueryData(["plan-drift", storyMapId, "alpha"], { ...twoPages, baselineVersion: 3 }));
  expect([...state.host.querySelectorAll("button")].find((item) => item.textContent === "Next differences")).toBe(next);
  expect(document.activeElement).toBe(next);
  expect(next.disabled).toBe(false);
}
