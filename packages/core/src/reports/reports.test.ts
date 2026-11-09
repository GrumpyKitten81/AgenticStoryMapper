import { describe, expect, it } from "vitest";
import type { Card, Release, SourceDocument } from "@storymapper/contracts";
import { buildGitHubIssueBody, buildBacklogHealthReport, buildReleaseSummaryReport, buildReleaseTimelineReport, buildSourceCoverageReport, buildSourceDocumentSummary } from "@storymapper/core";

const timestamp = "2026-10-07T12:00:00.000Z";
function card(id: string, patch: Partial<Card> = {}): Card {
  return { id, key: id, storyMapId: "map", parentId: null, releaseId: null, version: 1, creationOrigin: "manual", provenance: "manual", level: "story", title: id, description: "Ready", position: 0, status: "todo", parked: false, estimate: 3, createdAt: timestamp, updatedAt: timestamp, ...patch };
}
function release(id: string, patch: Partial<Release> = {}): Release {
  return { id, storyMapId: "map", version: 1, name: id, goal: "", position: 0, startDate: null, releaseDate: null, released: false, ...patch };
}
function reportInput(cards: Card[] = [], releases: Release[] = []) {
  return { storyMapId: "map", cards, releases, sourceLinkedCardIds: cards.map((item) => item.id), githubLinkedCardIds: cards.map((item) => item.id) };
}

describe("pure report calculations", () => {
  registerFormatsLFAndCRLFImportedIssueBodiesIdempotentlyWithout();
  registerHandlesEmptyDataWithoutNaNMissingScopeOrFabricated();

  it("excludes parked and archived descendants from health, summary and timeline", () => {
    const cards = [card("archived-child", { parentId: "archived", releaseId: "release" }), card("parked-child", { parentId: "parked", releaseId: "release" }), card("archived", { status: "archived", level: "activity" }), card("parked", { parked: true, level: "activity" }), card("visible", { releaseId: "release", status: "done" })];
    const before = structuredClone(cards);
    const releases = [release("release")];
    expect(buildBacklogHealthReport(reportInput(cards, releases))).toMatchObject({ totalStories: 1, healthyStories: 1, issues: [] });
    expect(buildReleaseSummaryReport(reportInput(cards, releases))).toMatchObject({ totalCards: 1, totalStories: 1, estimateTotal: 3, statusCounts: { done: 1 } });
    expect(buildReleaseTimelineReport("map", releases, cards, 0).items[0]).toMatchObject({ totalStories: 1, doneStories: 1, estimateTotal: 3, progressRatio: 1 });
    expect(cards).toEqual(before);
  });

  it("distinguishes all, release and unscheduled scopes and reports missing releases", () => {
    const unscheduled = card("unscheduled", { description: "" });
    delete unscheduled.estimate;
    const input = reportInput([card("assigned", { releaseId: "release", estimate: 5 }), unscheduled], [release("release")]);
    expect(buildReleaseSummaryReport(input)).toMatchObject({ scope: "all", totalStories: 2, estimateTotal: 5, unestimatedCards: 1 });
    expect(buildReleaseSummaryReport({ ...input, releaseId: "release" })).toMatchObject({ scope: "release", releaseName: "release", totalStories: 1, unestimatedCards: 0 });
    expect(buildReleaseSummaryReport({ ...input, releaseId: null })).toMatchObject({ scope: "unscheduled", releaseName: "Unscheduled", totalStories: 1, estimateTotal: 0, riskCounts: { missingDescription: 1 } });
    expect(() => buildReleaseSummaryReport({ ...input, releaseId: "missing" })).toThrow(expect.objectContaining({ code: "not_found" }));
  });

  it("counts delivery only from visible Stories across every scope without changing inputs", testCountsDeliveryOnlyFromVisibleStoriesAcrossEveryScopeWithoutChanging);

  it("selects open aggregate delivery after ancestry eligibility while explicit scopes remain exact", testSelectsOpenAggregateDeliveryAfterAncestryEligibilityWhileExplicitScopesRemain);

  it("calculates inclusive UTC durations, undated releases and progress from supplied data", () => {
    const releases = [release("first", { startDate: "2026-10-07", releaseDate: "2026-10-09" }), release("second", { releaseDate: "2026-10-10" }), release("undated")];
    const report = buildReleaseTimelineReport("map", releases, [card("done", { releaseId: "first", status: "done" }), card("pending", { releaseId: "first" })], Date.parse(timestamp));
    expect(report).toMatchObject({ startDate: "2026-10-07", endDate: "2026-10-10" });
    expect(report.items[0]).toMatchObject({ startOffsetDays: 0, durationDays: 3, totalStories: 2, doneStories: 1, progressRatio: 0.5, estimateTotal: 6 });
    expect(report.items[1]).toMatchObject({ durationDays: 4, progressRatio: 0 });
    expect(report.items[2]).toMatchObject({ durationDays: 1, startOffsetDays: 0 });
    expect(buildReleaseTimelineReport("map", [release("undated")], [], 0)).toEqual(buildReleaseTimelineReport("map", [release("undated")], [], Date.parse(timestamp)));
  });

  it("counts only existing unique chunks and combines document coverage by chunk count", () => {
    const document: SourceDocument = { id: "document", projectId: "project", title: "Source", type: "txt", filePath: "source.txt", fileHash: "hash", importedAt: timestamp };
    const first = buildSourceDocumentSummary(document, ["one", "two"], ["one", "one", "foreign"]);
    const second = buildSourceDocumentSummary({ ...document, id: "second" }, ["three"], ["three"]);
    expect(first).toMatchObject({ chunkCount: 2, linkedChunkCount: 1, coverageRatio: 0.5 });
    expect(buildSourceCoverageReport("project", [first, second])).toMatchObject({ totalChunks: 3, linkedChunks: 2, coverageRatio: 2 / 3 });
  });
});

function registerHandlesEmptyDataWithoutNaNMissingScopeOrFabricated() {
  it("handles empty data without NaN, missing scope or fabricated dates", () => {
    expect(buildBacklogHealthReport(reportInput())).toMatchObject({ totalStories: 0, healthyStories: 0, readinessRatio: 0, issues: [] });
    expect(buildReleaseSummaryReport(reportInput())).toMatchObject({ scope: "all", totalCards: 0, estimateTotal: 0, statusCounts: {} });
    expect(buildReleaseTimelineReport("map", [], [], 0)).toEqual({ storyMapId: "map", startDate: null, endDate: null, items: [] });
    expect(buildSourceCoverageReport("project", [])).toEqual({ projectId: "project", documents: [], totalChunks: 0, linkedChunks: 0, coverageRatio: 0 });
  });
}

function registerFormatsLFAndCRLFImportedIssueBodiesIdempotentlyWithout() {
  it("formats LF and CRLF imported issue bodies idempotently without duplicating metadata", () => {
    const input = card("story", { description: "Original requirement", estimate: 5, priority: "high" });
    const expected = buildGitHubIssueBody(input, "Map", { origin: "http://127.0.0.1:4317", projectId: "project" });
    for (const description of [expected, expected.replaceAll("\n", "\r\n")]) {
      const actual = buildGitHubIssueBody({ ...input, description }, "Map", { origin: "http://127.0.0.1:4317", projectId: "project" });
      expect(actual).toBe(expected);
      expect(actual.match(/<!-- storymapper:footer:start -->/gu)).toHaveLength(1);
    }
  });
}

function testCountsDeliveryOnlyFromVisibleStoriesAcrossEveryScopeWithoutChanging() {
  const missing = card("missing", { releaseId: "release", estimate: undefined, description: "" });
  const omitted = card("omitted", { description: "" });
  delete omitted.estimate;
  const cards = [
    card("activity", { level: "activity", estimate: 100, status: "ancestor" }),
    card("step", { level: "step", parentId: "activity", estimate: 100, status: "ancestor" }),
    card("root-note", { level: "note", estimate: 100, status: "note" }),
    card("activity-note", { level: "note", parentId: "activity", releaseId: "release", estimate: 100, status: "note" }),
    card("step-note", { level: "note", parentId: "step", releaseId: "release", estimate: 100, status: "note" }),
    card("zero", { parentId: "step", releaseId: "release", estimate: 0, status: "done" }), missing, omitted,
    card("estimated", { estimate: 5 }),
    card("parked", { level: "activity", parked: true }),
    card("parked-story", { parentId: "parked", releaseId: "release", estimate: 999 }),
    card("archived", { level: "step", status: "archived" }),
    card("archived-story", { parentId: "archived", estimate: 999 })
  ];
  const input = { ...reportInput(cards, [release("release")]), sourceLinkedCardIds: ["zero"], githubLinkedCardIds: ["zero"] };
  const before = structuredClone(input);
  expect(buildReleaseSummaryReport(input)).toMatchObject({ totalCards: 4, totalStories: 4, estimateTotal: 5, unestimatedCards: 2, statusCounts: { done: 1, todo: 3 }, riskCounts: { missingDescription: 2, missingSource: 3, missingGitHubLink: 3 } });
  expect(buildReleaseSummaryReport({ ...input, releaseId: "release" })).toMatchObject({ totalCards: 2, totalStories: 2, estimateTotal: 0, unestimatedCards: 1, statusCounts: { done: 1, todo: 1 }, riskCounts: { missingDescription: 1, missingSource: 1, missingGitHubLink: 1 } });
  expect(buildReleaseSummaryReport({ ...input, releaseId: null })).toMatchObject({ totalCards: 2, totalStories: 2, estimateTotal: 5, unestimatedCards: 1, statusCounts: { todo: 2 } });
  expect(buildReleaseSummaryReport(input).unestimatedStories).toEqual([missing, omitted].map((story) => ({ cardId: story.id, cardKey: story.key, cardTitle: story.title })));
  expect(input).toEqual(before);
}

function testSelectsOpenAggregateDeliveryAfterAncestryEligibilityWhileExplicitScopesRemain() {
  const input = reportInput([
    card("open", { releaseId: "open", estimate: 0, status: "constructor" }),
    card("released", { releaseId: "released", estimate: undefined, status: "__proto__" }),
    card("unscheduled", { estimate: undefined, status: "toString" }),
    card("archived-parent", { level: "activity", status: "archived", releaseId: "released" }),
    card("hidden-child", { parentId: "archived-parent", releaseId: "open", estimate: 100 })
  ], [release("open"), release("released", { released: true })]);
  const before = structuredClone(input);
  expect(buildReleaseSummaryReport(input).statusCounts).toEqual(Object.fromEntries([["constructor", 1], ["__proto__", 1], ["toString", 1]]));
  expect(buildReleaseSummaryReport({ ...input, includeReleased: false })).toMatchObject({ totalStories: 2, estimateTotal: 0, unestimatedCards: 1, statusCounts: { constructor: 1, toString: 1 }, unestimatedStories: [{ cardId: "unscheduled", cardKey: "unscheduled", cardTitle: "unscheduled" }] });
  expect(buildReleaseSummaryReport({ ...input, includeReleased: false, releaseId: "released" })).toMatchObject({ totalStories: 1, unestimatedStories: [{ cardId: "released" }] });
  expect(buildReleaseSummaryReport({ ...input, includeReleased: false, releaseId: null })).toMatchObject({ totalStories: 1, unestimatedStories: [{ cardId: "unscheduled" }] });
  expect(input).toEqual(before);
}
