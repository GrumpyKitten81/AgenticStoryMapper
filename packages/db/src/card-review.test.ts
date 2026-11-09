import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { CARD_REVIEW_CRITERIA, cardReviewReportSubmissionSchema, type CardReviewRequest, type LiveTransaction } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

const human = { actorType: "human", actorId: "review-human" } as const;
const agent = { actorType: "agent", actorId: "review-agent", mcpSessionId: "review-session" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0)) close(); });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-dor-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  const unitOfWork = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const roots = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "DoR review" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const card = repository.createCard({ storyMapId: map.id, level: "activity", cardType: "task", title: "Task outcome", description: "Complete the requested outcome." });
    return { project, map, card };
  });
  const request = () => unitOfWork.run(human, ({ repository }) => repository.requestCardReview(roots.project.id, roots.card.id));
  return { ...roots, handle, unitOfWork, repository, request };
}
function submission(request: CardReviewRequest, finding = false) {
  return cardReviewReportSubmissionSchema.parse({ requestId: request.id, inputFingerprint: request.inputFingerprint, criteriaVersion: "1", skillVersion: "1", status: "success", results: CARD_REVIEW_CRITERIA.map((rule) => ({ ruleId: rule.id, severity: rule.severity, outcome: !(rule.types as readonly string[]).includes(request.input.card.cardType!) ? "not_applicable" : finding && rule.id === "DOR-04" ? "finding" : "pass", evidence: finding && rule.id === "DOR-04" ? ["Completion criteria are missing."] : [], advice: finding && rule.id === "DOR-04" ? "State an observable completion criterion." : "" })) });
}
it("persists immutable idempotent reports without changing Card versions and distinguishes cosmetic/content drift", () => {
  const f = fixture(), request = f.request(), output = submission(request);
  const submit = () => f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output));
  const report = submit();
  expect(submit().id).toBe(report.id);
  expect(f.repository.getCardDetails(f.card.id)?.version).toBe(f.card.version);
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.state).toBe("reviewed");
  f.unitOfWork.run(human, ({ repository }) => repository.updateCard(f.card.id, { color: "blue" }));
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.state).toBe("reviewed");
  expect(f.request().id).toBe(request.id);
  f.unitOfWork.run(human, ({ repository }) => repository.updateCard(f.card.id, { title: "Changed outcome" }));
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.state).toBe("stale");
  expect(() => f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, { ...output, status: "error", error: "Interrupted" }))).toThrow("different output");
});
it("rejects incomplete output and foreign ownership; retains Card-only reversible exceptions", () => {
  const f = fixture(), request = f.request(), output = submission(request, true);
  expect(() => f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, { ...output, results: output.results.slice(1) }))).toThrow("every rule");
  const report = f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output));
  const finding = report.results.find((result) => result.outcome === "finding")!;
  const ignore = { action: "ignore", reportId: report.id, findingId: finding.id, scope: "rule", reason: "Human accepted the documented completion criteria." } as const;
  expect(() => f.unitOfWork.run(agent, ({ repository }) => repository.decideCardReview(f.project.id, ignore))).toThrow("human-only");
  const decision = f.unitOfWork.run(human, ({ repository }) => repository.decideCardReview(f.project.id, ignore));
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.unresolvedCount).toBe(0);
  expect(() => f.unitOfWork.run(human, ({ repository }) => repository.decideCardReview(f.project.id, ignore))).toThrow("already ignored");
  expect(() => f.unitOfWork.run(human, ({ repository }) => repository.requestCardReviewFix(f.project.id, report.id, [finding.id]))).toThrow("Select findings");
  f.unitOfWork.run(human, ({ repository }) => repository.decideCardReview(f.project.id, { action: "revoke", decisionId: decision.id, reason: "Review again" }));
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.unresolvedCount).toBe(1);
  const foreign = f.unitOfWork.run(human, ({ repository }) => repository.createProject({ name: "Foreign" }));
  expect(() => f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(foreign.id, output))).toThrow("not found");
});
it("binds correction requests to current input and invalidates all reviews after an epoch change", () => {
  const f = fixture(), request = f.request();
  const report = f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, submission(request, true)));
  const ids = report.results.filter((result) => result.outcome === "finding").map((result) => result.id);
  const fix = f.unitOfWork.run(human, ({ repository }) => repository.requestCardReviewFix(f.project.id, report.id, ids));
  expect(fix.baseVersion).toBe(f.card.version);
  f.unitOfWork.run(human, ({ repository }) => repository.upsertProductContext({ projectId: f.project.id, storyMapId: f.map.id, purpose: "Changed context" }));
  expect(() => f.unitOfWork.run(human, ({ repository }) => repository.requestCardReviewFix(f.project.id, report.id, ids))).toThrow("current reviewed input");
  f.handle.current.$client.prepare("UPDATE project_settings SET epoch = ? WHERE project_id = ?").run("next-epoch", f.project.id);
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.state).toBe("stale");
});

it("publishes review metadata as its own unversioned live entity without touching Card content versions", () => {
  const f = fixture();
  const events: LiveTransaction[] = [];
  f.unitOfWork.subscribe((event) => events.push(event));
  const request = f.request();
  f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, submission(request, true)));
  expect(f.repository.getCardDetails(f.card.id)?.version).toBe(f.card.version);
  expect(events).toHaveLength(2);
  for (const event of events) expect(event.entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "cardReview", projectId: f.project.id, version: null })]));
  expect(events.flatMap((event) => event.entities).some((entity) => entity.entityType === "card")).toBe(false);
});

it("captures a 500-Card batch once and serves summaries without historical input snapshots", () => {
  const f = fixture();
  const ids = f.unitOfWork.run(human, ({ repository }) => Array.from({ length: 499 }, (_, index) => repository.createCard({ storyMapId: f.map.id, level: "activity", cardType: "task", title: `Outcome ${index}` }).id));
  f.unitOfWork.run(human, ({ repository }) => {
    const snapshots = vi.spyOn(repository, "getStoryMapSnapshot"), historicalReads = vi.spyOn(repository, "getCardReviews");
    expect(repository.requestCardReviews(f.project.id, [f.card.id, ...ids])).toHaveLength(500);
    expect(snapshots).toHaveBeenCalledTimes(1);
    expect(historicalReads).not.toHaveBeenCalled();
  });
  const sql = vi.spyOn(f.handle.current.$client, "prepare");
  const summaries = f.repository.getCardReviews(f.project.id, f.map.id, { summaryOnly: true });
  expect(summaries.summaries).toHaveLength(500);
  expect(summaries.requests).toEqual([]); expect(summaries.reports).toEqual([]);
  expect(JSON.stringify(summaries)).not.toContain("Complete the requested outcome.");
  expect(sql.mock.calls.filter(([statement]) => statement.includes("card_review_records"))).toHaveLength(1);
  expect(sql.mock.calls.some(([statement]) => statement.includes("json_remove"))).toBe(true);
  sql.mockRestore();
  const detail = f.repository.getCardReviews(f.project.id, f.map.id, { cardId: f.card.id });
  expect(detail.requests).toHaveLength(1); expect(detail.summaries).toHaveLength(1);
  expect(detail.requests[0]?.input.card.id).toBe(f.card.id);
});

it("retains GitHub evidence fingerprints through schema normalization and database reopening", () => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => {
    const connection = repository.createConnectorConnection({ projectId: f.project.id, provider: "github", name: "Review source", owner: "review", repository: "source", authMode: "token" });
    const ref = repository.createGitHubLink({ cardId: f.card.id, repo: "review/source", issueNumber: 1, url: "https://github.com/review/source/issues/1" });
    repository.upsertRemoteWorkItemLink({ connectionId: connection.id, externalRefId: ref.id, titleHash: "stored-title", bodyHash: "stored-body", labels: [], managedLabels: [] });
  });
  const request = f.request();
  expect(request.input.githubSources).toHaveLength(1);
  f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, submission(request)));
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.state).toBe("reviewed");
  const databasePath = f.handle.current.$client.name;
  f.handle.current.$client.close();
  f.handle.current = openStoryMapperDb(databasePath);
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.state).toBe("reviewed");
});
