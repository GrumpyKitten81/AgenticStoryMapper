// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { buildReleaseSummaryReport } from "@storymapper/core";
import { router } from "@storymapper/web/app/router";
import { state, storyMapId, viewUrl, mount, button } from "@storymapper/web/test-fixtures/card-detail";

function snapshots() {
  const release = { id: randomUUID(), storyMapId, version: 3, name: "Canonical delivery", goal: "Canonical goal", released: false, position: 0, startDate: null, releaseDate: null };
  state.snapshot = { ...state.snapshot, releases: [release] };
  const story = state.snapshot.cards.find((card) => card.level === "story")!;
  const removed = { ...story, id: randomUUID(), key: "LSM-4", title: "Removed unestimated Story" };
  const parked = { ...state.snapshot.cards[0]!, id: randomUUID(), parked: true };
  const hidden = { ...story, id: randomUUID(), key: "LSM-5", parentId: parked.id, title: "Hidden projected Story" };
  const projected = { ...state.snapshot, releases: [{ ...release, version: 9, name: "Projected delivery", goal: "Projected goal" }], cards: [...state.snapshot.cards.map((card) => card.id === story.id ? { ...card, title: "Projected eligible Story" } : card), removed, parked, hidden] };
  return { release, projected, removed, parked };
}
function previewResponse(previewId: string, data: ReturnType<typeof snapshots>) {
  return Response.json({ changeSet: { id: previewId, title: "Release preview", status: "proposed" }, selectedOperationIds: [], conflicts: [], operations: [], boards: [{ snapshot: data.projected, markers: [data.removed, data.parked].map((card) => ({ entity: "card", entityId: card.id, kind: "removed", operationIds: [] })) }], presentationStatus: "proposed", closed: false, canApply: false, canApprove: false });
}
const navigatePreview = (id?: string) => act(async () => { await (router.navigate as (input: unknown) => Promise<void>)({ search: id ? { preview: id } : {} }); });
const setGoal = (value: string) => act(async () => {
  const input = document.querySelector<HTMLTextAreaElement>('[aria-label="Release goal"]')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

it("routes Releases through pending then projected readonly data, excluding removed Stories and hidden ancestry without canonical report reads", async () => {
  const data = snapshots(); const previewId = randomUUID(); const original = fetch;
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn((path: string, init?: RequestInit) => path === `/api/changesets/${previewId}/preview` ? new Promise<Response>((done) => { resolve = done; }) : original(path, init));
  vi.stubGlobal("fetch", fetchMock);
  await mount(`${viewUrl.replace(/tree$/, "releases")}?preview=${previewId}`, "Release Tracking");
  const panel = () => state.host.querySelector('.release-tracking-panel')!;
  expect(panel().textContent).toContain("Loading release summary...");
  expect([...panel().querySelectorAll('button')].every((item) => item.disabled)).toBe(true);
  expect(panel().querySelector('.release-summary-grid')).toBeNull();
  await act(async () => resolve(previewResponse(previewId, data)));
  await vi.waitFor(() => expect(panel().textContent).toContain("Projected delivery"));
  expect([...panel().querySelectorAll('.release-summary-grid strong')].map((item) => item.textContent)).toEqual(["1", "1", "0 points", "1"]);
  expect(panel().querySelector('.release-unestimated-stories')?.textContent).toContain("Projected eligible Story");
  expect(panel().querySelector('.release-unestimated-stories')?.textContent).not.toContain("Removed unestimated Story");
  expect(panel().querySelector('.release-unestimated-stories')?.textContent).not.toContain("Hidden projected Story");
  expect([...panel().querySelectorAll('button')].every((item) => item.disabled)).toBe(true);
  expect(fetchMock.mock.calls.some(([path]) => path.startsWith('/api/reports/release-summary'))).toBe(false);
});

it.each([false, true])("retains canonical root and exact clean/dirty draft through routed preview (dirty=%s)", async (dirty) => {
  const data = snapshots(); const previewId = randomUUID(); const original = fetch;
  const writes: Array<{ body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/changesets/${previewId}/preview`) return Promise.resolve(previewResponse(previewId, data));
    if (path.startsWith('/api/reports/release-summary')) return Promise.resolve(Response.json(buildReleaseSummaryReport({ storyMapId, cards: state.snapshot.cards, releases: state.snapshot.releases, sourceLinkedCardIds: [], githubLinkedCardIds: [] })));
    if (path === `/api/releases/${data.release.id}` && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>; writes.push({ body });
      return Promise.resolve(Response.json({ ...data.release, ...body, version: 4 }));
    }
    return original(path, init);
  }));
  await mount(viewUrl.replace(/tree$/, "releases"), "Release Tracking");
  await act(async () => button("Edit release Canonical delivery").click());
  if (dirty) await setGoal("Exact retained draft");
  await navigatePreview(previewId);
  await vi.waitFor(() => expect(state.host.textContent).toContain("Projected delivery"));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await navigatePreview();
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  expect(document.querySelector<HTMLInputElement>('[aria-label="Release name"]')!.value).toBe("Canonical delivery");
  expect(document.querySelector<HTMLTextAreaElement>('[aria-label="Release goal"]')!.value).toBe(dirty ? "Exact retained draft" : "Canonical goal");
  if (!dirty) await setGoal("New canonical goal");
  await act(async () => button("Save").click());
  expect(writes[0]!.body).toMatchObject({ baseVersion: 3, name: "Canonical delivery", goal: dirty ? "Exact retained draft" : "New canonical goal" });
});
