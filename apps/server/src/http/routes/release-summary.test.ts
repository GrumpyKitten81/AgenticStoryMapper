import { afterEach, expect, it } from "vitest";
import { changeSetCommandResponseSchema, releaseSchema, releaseSummaryReportSchema } from "@storymapper/contracts";
import { previewFixture, previewHuman } from "@storymapper/server/fixtures/changeset-preview";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const f = await previewFixture(0);
  cleanup.push(f.close);
  const registry = createMcpRegistry(f.repository, f.unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "release-summary-test", mcpSessionId: "release-summary-session" });
  return { ...f, registry };
}

it("creates and edits complete Releases over HTTP and refuses stale and invalid edits atomically", async () => {
  const f = await fixture();
  const input = { storyMapId: f.map.id, name: "Released", goal: "Delivery", startDate: "2026-10-01", releaseDate: "2026-10-17", released: true };
  const created = await f.server.inject({ method: "POST", url: "/api/releases", payload: input });
  expect(created.statusCode).toBe(201);
  const release = releaseSchema.parse(created.json());
  expect(release).toMatchObject({ ...input, version: 1 });
  const patch = { name: "Reopened", goal: "Next delivery", startDate: null, releaseDate: "2026-10-18", released: false };
  const edited = await f.server.inject({ method: "PATCH", url: `/api/releases/${release.id}`, payload: { ...patch, baseVersion: release.version } });
  expect(edited.statusCode).toBe(200);
  expect(edited.json()).toMatchObject({ ...patch, version: 2 });
  const stale = await f.server.inject({ method: "PATCH", url: `/api/releases/${release.id}`, payload: { goal: "Lost update", baseVersion: release.version } });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ conflicts: [{ entity: "release", baseVersion: 1, currentVersion: 2, current: patch }] });
  for (const invalid of [{ released: "false" }, { startDate: "2026-02-30" }, { name: "" }]) {
    expect((await f.server.inject({ method: "PATCH", url: `/api/releases/${release.id}`, payload: { ...invalid, baseVersion: 2 } })).statusCode).toBe(400);
  }
  expect(f.repository.getRelease(release.id)).toEqual(edited.json());
});

it("retains released creation fields through MCP proposal, preview, separate approval and Apply", async () => {
  const f = await fixture();
  const input = { storyMapId: f.map.id, name: "Agent delivery", goal: "Review first", startDate: "2026-10-01", releaseDate: "2026-10-17", released: true };
  const proposed = changeSetCommandResponseSchema.parse(await f.registry.call("CreateStoryMapRelease", { ...input, apply: false }));
  expect(proposed.outcome).toBe("proposed");
  expect(f.repository.listReleases(f.map.id)).toHaveLength(1);
  expect(proposed.changeSet.operations[0]!.after).toMatchObject(input);
  const preview = await f.readPreview(proposed.changeSet.id);
  expect(preview.boards[0]!.snapshot.releases).toContainEqual(expect.objectContaining(input));
  for (const action of ["approve", "apply"]) {
    expect((await f.server.inject({ method: "POST", url: `/api/changesets/${proposed.changeSet.id}/${action}`, payload: {} })).statusCode).toBe(200);
  }
  expect(f.repository.listReleases(f.map.id)).toContainEqual(expect.objectContaining({ ...input, version: 1 }));
});

it("shares open/all/explicit/Unscheduled report scope and prototype-safe statuses across HTTP and MCP", async () => {
  const f = await fixture();
  const rows = f.unitOfWork.run(previewHuman, ({ repository }) => {
    const shipped = repository.createRelease({ storyMapId: f.map.id, name: "Shipped", released: true });
    const zero = repository.createCard({ storyMapId: f.map.id, level: "story", title: "Zero", releaseId: f.release.id, estimate: 0, status: "constructor" });
    const missing = repository.createCard({ storyMapId: f.map.id, level: "story", title: "Missing", releaseId: shipped.id, status: "__proto__" });
    repository.createCard({ storyMapId: f.map.id, level: "story", title: "Unscheduled", status: "toString" });
    repository.createCard({ storyMapId: f.map.id, level: "note", title: "Note", releaseId: f.release.id, estimate: 100 });
    return { shipped, zero, missing };
  });
  for (const [query, selection, total] of [
    ["", {}, 3], ["&includeReleased=true", { includeReleased: true }, 3], ["&includeReleased=false", { includeReleased: false }, 2],
    [`&includeReleased=false&releaseId=${rows.shipped.id}`, { includeReleased: false, releaseId: rows.shipped.id }, 1],
    ["&includeReleased=false&releaseId=unscheduled", { includeReleased: false, releaseId: null }, 1]
  ] as const) {
    const response = await f.server.inject(`/api/reports/release-summary?storyMapId=${f.map.id}${query}`);
    expect(response.statusCode).toBe(200);
    const report = releaseSummaryReportSchema.parse(response.json());
    expect(report.statusCounts).toEqual(response.json().statusCounts);
    expect(report.totalStories).toBe(total);
    expect(report.estimateTotal).toBe(0);
    expect((await f.registry.call("GetReleaseSummaryReport", { storyMapId: f.map.id, ...selection })).data).toEqual(response.json());
  }
  const all = (await f.server.inject(`/api/reports/release-summary?storyMapId=${f.map.id}`)).json();
  expect(Object.entries(all.statusCounts)).toEqual([["constructor", 1], ["__proto__", 1], ["toString", 1]]);
  expect(all.unestimatedStories).toContainEqual({ cardId: rows.missing.id, cardKey: rows.missing.key, cardTitle: rows.missing.title });
  for (const invalid of ["0", "FALSE", "", "true&includeReleased=false"]) {
    expect((await f.server.inject(`/api/reports/release-summary?storyMapId=${f.map.id}&includeReleased=${invalid}`)).statusCode).toBe(400);
  }
  await expect(f.registry.call("GetReleaseSummaryReport", { storyMapId: f.map.id, includeReleased: "false" })).rejects.toMatchObject({ code: "validation" });
  expect(f.repository.getCard(rows.missing.id)!.releaseId).toBe(rows.shipped.id);
});

it("refreshes canonical summaries after versioned form, move and atomic bulk assignments", async () => {
  const f = await fixture();
  const rows = f.unitOfWork.run(previewHuman, ({ repository }) => [
    repository.createCard({ storyMapId: f.map.id, level: "story", title: "Estimated", estimate: 0 }),
    repository.createCard({ storyMapId: f.map.id, level: "story", title: "Unestimated" })
  ]);
  const read = async () => (await f.server.inject(`/api/reports/release-summary?storyMapId=${f.map.id}&releaseId=${f.release.id}`)).json();
  expect(await read()).toMatchObject({ totalStories: 0, unestimatedStories: [] });
  const form = await f.server.inject({ method: "PATCH", url: `/api/cards/${rows[0]!.id}`, payload: { releaseId: f.release.id, baseVersion: rows[0]!.version } });
  expect(form.statusCode).toBe(200);
  expect(form.json()).toMatchObject({ releaseId: f.release.id, version: 2 });
  expect(await read()).toMatchObject({ totalStories: 1, estimateTotal: 0, unestimatedCards: 0 });
  const move = await f.server.inject({ method: "POST", url: `/api/cards/${rows[1]!.id}/move`, payload: { releaseId: f.release.id, parentId: null, position: 1, baseVersion: rows[1]!.version } });
  expect(move.statusCode).toBe(200);
  expect(move.json()).toMatchObject({ releaseId: f.release.id, version: 2 });
  const both = await read();
  expect(both).toMatchObject({ totalStories: 2, estimateTotal: 0, unestimatedCards: 1, unestimatedStories: [{ cardId: rows[1]!.id, cardKey: rows[1]!.key, cardTitle: rows[1]!.title }] });
  const selection = rows.map((card) => ({ id: card.id, baseVersion: 2 }));
  const bulk = (cards: typeof selection) => f.server.inject({ method: "PATCH", url: "/api/cards/bulk", payload: { storyMapId: f.map.id, cards, patch: { releaseId: null } } });
  expect((await bulk([{ ...selection[0]!, baseVersion: 1 }, selection[1]!])).statusCode).toBe(409);
  expect(await read()).toEqual(both);
  expect((await bulk(selection)).statusCode).toBe(200);
  expect(await read()).toMatchObject({ totalStories: 0, unestimatedStories: [] });
  expect(rows.map((card) => f.repository.getCard(card.id))).toEqual(expect.arrayContaining(rows.map((card) => expect.objectContaining({ id: card.id, releaseId: null, version: 3 }))));
});
