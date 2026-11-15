import { invalidateCardReports } from "@storymapper/web/features/story-map";
// @vitest-environment jsdom // REQ accessible batch reviews and preview mutation protection
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { CARD_REVIEW_CRITERIA, cardReviewReportSchema, cardReviewRequestSchema, cardReviewSettingsSchema, remotePushPlanSchema, remotePushExecutionSchema, type CardReviewsResponse } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { CardReviewProvider, CardReviewBadge } from "@storymapper/web/features/card-review/review-context";
import { PushReviewControls } from "@storymapper/web/features/card-review/PushReviewControls";
import { CardReviewMenu } from "@storymapper/web/features/card-review/CardReviewMenu";
const projectId = "11111111-1111-4111-8111-111111111111", mapId = "22222222-2222-4222-8222-222222222222", cardId = "33333333-3333-4333-8333-333333333333";
const time = "2026-11-04T00:00:00.000Z";
const request = cardReviewRequestSchema.parse({ id: "44444444-4444-4444-8444-444444444444", projectId, cardId, purpose: "manual", inputFingerprint: "a".repeat(64), epoch: projectId, criteriaVersion: "1", skillVersion: "1", actor: { actorType: "human", actorId: "human" }, createdAt: time, input: { card: { id: cardId, storyMapId: mapId, parentId: null, releaseId: null, key: "TEST-1", level: "story", cardType: "story", title: "Requested story", description: "Outcome", version: 1, creationOrigin: "manual", provenance: "manual", position: 0, createdAt: time, updatedAt: time }, parents: [], prerequisites: [], sourceChunks: [], sourceLinks: [], productContext: { id: projectId, projectId, storyMapId: mapId, updatedAt: time } } });
const response: CardReviewsResponse = { settings: cardReviewSettingsSchema.parse({}), summaries: [{ cardId, state: "pending", unresolvedCount: 0, highestSeverity: null, ignoredFindingIds: [], requestId: request.id }], requests: [request], reports: [], decisions: [], fixes: [], runningRequestIds: [] };
let root: Root | undefined, host: HTMLDivElement | undefined, client: QueryClient | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); host?.remove(); client?.clear(); vi.restoreAllMocks(); });
async function render(preview = false, data = response) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(api, "getCardReviews").mockResolvedValue(data);
  vi.spyOn(api, "commandCardReview").mockResolvedValue(response);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<QueryClientProvider client={client!}><CardReviewProvider projectId={projectId} storyMapId={mapId} preview={preview}><CardReviewBadge cardId={cardId} /><CardReviewBadge cardId={cardId} /><CardReviewMenu cards={[request.input.card]} selectedIds={new Set([cardId])} /></CardReviewProvider></QueryClientProvider>));
  await vi.waitFor(() => expect(host?.querySelector('button[aria-label^="Definition of Ready"]')).not.toBeNull());
}
it("bulk-fetches once for multiple badges and opens a keyboard-accessible review with an actionable waiting handoff", async () => {
  await render();
  expect(api.getCardReviews).toHaveBeenCalledTimes(1);
  const badge = host!.querySelector<HTMLButtonElement>('button[aria-label^="Definition of Ready"]')!;
  await act(async () => badge.click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Waiting for an invoking agent"));
  expect(api.getCardReviews).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api.getCardReviews).mock.calls[0]?.[3]).toEqual({ summaryOnly: true });
  expect(vi.mocked(api.getCardReviews).mock.calls[1]?.[3]).toEqual({ cardId });
  expect(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Copy skill instruction"]')?.value).toContain(request.id);
  const review = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Request review")!;
  await act(async () => review.click());
  expect(api.commandCardReview).toHaveBeenCalledWith(projectId, { action: "request", cardIds: [cardId] });
});
it("keeps review requests and settings read-only in preview", async () => {
  await render(true);
  await act(async () => [...host!.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Card reviews")!.click());
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Request selected reviews")?.disabled).toBe(true);
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Save review settings")?.disabled).toBe(true);
  expect(api.commandCardReview).not.toHaveBeenCalled();
});

it("describes the compact menu, keeps selected Cards and restores focus after closing", async () => {
  await render();
  const menu = [...host!.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Card reviews")!;
  expect(menu.title).toContain("Definition of Ready");
  expect(menu.getAttribute("aria-description")).toContain("selected Cards");
  await act(async () => { menu.focus(); menu.click(); });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.contains(document.activeElement)).toBe(true);
  const requestSelected = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Request selected reviews")!;
  expect(requestSelected.disabled).toBe(false);
  await act(async () => requestSelected.click());
  expect(api.commandCardReview).toHaveBeenCalledWith(projectId, { action: "request", cardIds: [cardId] });
  await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(menu);
});

it("refetches a cached empty review list after a local Card mutation", async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  let current: CardReviewsResponse = { ...response, requests: [], summaries: [] };
  const queryFn = vi.fn(async () => current);
  const key = ["card-reviews", projectId, mapId];
  await cache.fetchQuery({ queryKey: key, queryFn });
  const observer = new QueryObserver(cache, { queryKey: key, queryFn });
  const unsubscribe = observer.subscribe(() => {});
  current = response;
  await invalidateCardReports(cache);
  expect(cache.getQueryData<CardReviewsResponse>(key)?.summaries).toEqual(response.summaries);
  expect(queryFn).toHaveBeenCalledTimes(2);
  unsubscribe(); cache.clear();
});

it("drops ignored selections and sends only effective findings in correction requests", async () => {
  const report = cardReviewReportSchema.parse({ id: "55555555-5555-4555-8555-555555555555", requestId: request.id, projectId, cardId, inputFingerprint: request.inputFingerprint, criteriaVersion: "1", skillVersion: "1", actor: { actorType: "agent", actorId: "reviewer" }, createdAt: time, status: "success", results: CARD_REVIEW_CRITERIA.map((rule, index) => ({ id: `66666666-6666-4666-8666-${String(index).padStart(12, "0")}`, ruleId: rule.id, severity: rule.severity, outcome: ["DOR-03", "DOR-04"].includes(rule.id) ? "finding" : "pass", evidence: ["Captured evidence"], advice: "Actionable advice" })) });
  const reviewed: CardReviewsResponse = { ...response, reports: [report], summaries: [{ ...response.summaries[0]!, state: "reviewed", unresolvedCount: 2, highestSeverity: "blocker", reportId: report.id }] };
  await render(false, reviewed);
  await act(async () => host!.querySelector<HTMLButtonElement>('button[aria-label^="Definition of Ready"]')!.click());
  await vi.waitFor(() => expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(2));
  const findings = report.results.filter((result) => result.outcome === "finding");
  const ignored: CardReviewsResponse = { ...reviewed, summaries: [{ ...reviewed.summaries[0]!, unresolvedCount: 1, ignoredFindingIds: [findings[0]!.id] }] };
  const checks = () => [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  await act(async () => checks()[0]!.click());
  vi.mocked(api.getCardReviews).mockResolvedValue(ignored);
  await act(async () => { client!.setQueriesData({ queryKey: ["card-reviews", projectId, mapId] }, ignored); await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(checks()[0]!.disabled).toBe(true); expect(checks()[0]!.checked).toBe(false);
  const fix = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Request KI corrections")!;
  expect(fix().disabled).toBe(true);
  await act(async () => checks()[1]!.click());
  await act(async () => fix().click());
  expect(api.commandCardReview).toHaveBeenLastCalledWith(projectId, { action: "fix", reportId: report.id, findingIds: [findings[1]!.id] });
});

const plan = remotePushPlanSchema.parse({ id: "77777777-7777-4777-8777-777777777777", actor: { actorType: "agent", actorId: "origin-agent" }, projectId, storyMapId: mapId, connectionId: projectId, epoch: projectId, createdAt: time, selection: { cardIds: [cardId] }, localFingerprint: "local", connectionFingerprint: "connection", safetyFingerprint: "safety", remoteFingerprint: "remote", remoteEvidence: { issueTypes: ["Story"], labels: [], milestones: [], writable: true }, items: [{ id: cardId, kind: "issue", entityId: cardId, action: "create", marker: "marker", dependencies: [], labelAdditions: [], labelRemovals: [], payload: { title: "Story", body: "Outgoing content", issueType: "Story", labels: [], remoteState: "open", milestoneNumber: null } }], blockers: [], exclusions: [] });
async function renderPush(data: CardReviewsResponse) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(api, "getCardReviews").mockResolvedValue(data);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<QueryClientProvider client={client!}><PushReviewControls plan={plan} onExecuted={() => {}} /></QueryClientProvider>));
  await vi.waitFor(() => expect(host!.querySelector("ul")).not.toBeNull());
}
it("shows exact outgoing-plan readiness instead of a successful map-wide manual summary", async () => {
  const data: CardReviewsResponse = { ...response, summaries: [{ ...response.summaries[0]!, state: "reviewed" }], pushReadiness: { planId: plan.id, required: true, ready: false, overridden: false, cards: [{ cardId, key: "TEST-1", ready: false, summary: { ...response.summaries[0]!, state: "missing", requestId: undefined } }] } };
  await renderPush(data);
  expect(host!.querySelector("ul")!.textContent).toContain("TEST-1: No review");
  expect(host!.querySelector("ul")!.textContent).not.toContain("Reviewed");
  expect(vi.mocked(api.getCardReviews).mock.calls[0]?.[3]).toEqual({ planId: plan.id, summaryOnly: true });
});
it("retains agent origin when review is disabled and refreshes map and health queries after override execution", async () => {
  const data: CardReviewsResponse = { ...response, settings: { ...response.settings, reviewBeforeAgentPush: false, allowHumanPushOverride: true }, pushReadiness: { planId: plan.id, required: false, ready: true, overridden: false, cards: [] } };
  await renderPush(data);
  expect(host!.textContent).toContain("Review before agent push is disabled");
  expect(host!.textContent).not.toContain("Human-origin pushes");
  const completed = remotePushExecutionSchema.parse({ planId: plan.id, status: "completed", items: [] });
  vi.spyOn(api, "confirmRemotePushPlan").mockResolvedValue({ plan, execution: completed });
  const keys = [["story-map", mapId], ["work-item-sync-health", mapId], ["github-sync-health", mapId], ["backlog-health", mapId], ["activity"]];
  const reads = keys.map(() => vi.fn(async () => ({ binding: "created" })));
  const observers = keys.map((queryKey, index) => new QueryObserver(client!, { queryKey, queryFn: reads[index]! }));
  const unsubscribe = observers.map((observer) => observer.subscribe(() => {}));
  await vi.waitFor(() => reads.forEach((read) => expect(read).toHaveBeenCalledTimes(1)));
  const textarea = host!.querySelector<HTMLTextAreaElement>("details textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Accepted exact outgoing content");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    host!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  });
  const override = host!.querySelector<HTMLButtonElement>("details button")!;
  expect(override.disabled).toBe(false);
  await act(async () => override.click());
  await vi.waitFor(() => reads.forEach((read) => expect(read).toHaveBeenCalledTimes(2)));
  expect(api.confirmRemotePushPlan).toHaveBeenCalledWith(plan.id, { confirmed: true, reason: "Accepted exact outgoing content" });
  unsubscribe.forEach((stop) => stop());
});
