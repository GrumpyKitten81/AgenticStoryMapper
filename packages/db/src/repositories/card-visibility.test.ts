import { splitMarkdownIntoChunks } from "@storymapper/importers";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRoadmapDetails, buildSourceDocumentSummaries } from "@storymapper/core";
import { buildGitHubSyncHealthReport, buildWorkItemSyncHealthReport } from "@storymapper/core";
import { hashText } from "@storymapper/db/repositories/repository-values";
import { buildReleaseSummaryReport, buildReleaseTimelineReport, buildBacklogHealthReport, buildSourceCoverageReport } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

const ACTOR = { actorType: "human", actorId: "lifecycle-test" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-visibility-"));
  const database = openStoryMapperDb(join(directory, "storymapper.sqlite"));
  cleanup.push(() => { database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const handle = new DatabaseHandle(database);
  const unitOfWork = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const data = unitOfWork.run(ACTOR, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Lifecycle reporting" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Visibility" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Release" });
    const visible = tx.createCard({ storyMapId: map.id, level: "story", title: "Visible", releaseId: release.id, description: "Visible requirement", status: "done" });
    tx.updateCard(visible.id, { estimate: 3 });
    const archived = tx.createCard({ storyMapId: map.id, level: "activity", title: "Archived Activity" });
    const step = tx.createCard({ storyMapId: map.id, level: "step", title: "Retained Step", parentId: archived.id });
    const hidden = tx.createCard({ storyMapId: map.id, level: "story", title: "Retained Story", parentId: step.id, releaseId: release.id });
    tx.updateCard(hidden.id, { estimate: 99 });
    tx.archiveCard(archived.id);
    const parked = tx.createCard({ storyMapId: map.id, level: "activity", title: "Parked Activity" });
    tx.parkCard(parked.id, { childStrategy: "unassign" });
    const parkedStep = tx.createCard({ storyMapId: map.id, level: "step", title: "Parked Step", parentId: parked.id });
    tx.createCard({ storyMapId: map.id, level: "story", title: "Parked Story", parentId: parkedStep.id, releaseId: release.id });
    tx.createCard({ storyMapId: map.id, level: "story", title: "Explicitly Archived Story", status: "archived", releaseId: release.id });
    const archivedStory = tx.listCards(map.id).find((card) => card.title === "Explicitly Archived Story")!;
    tx.archiveCard(archivedStory.id);
    const archivedStep = tx.createCard({ storyMapId: map.id, level: "step", title: "Archived Step", status: "archived" });
    tx.archiveCard(archivedStep.id);
    tx.createCard({ storyMapId: map.id, level: "story", title: "Hidden by Step", parentId: archivedStep.id, releaseId: release.id });
    const note = tx.createCard({ storyMapId: map.id, level: "note", title: "Archived Note", status: "archived" });
    tx.archiveCard(note.id); const content = "# Visible\n\nVisible requirement.\n\n# Hidden\n\nRetained requirement.";
    const source = tx.importSourceDocument({ parsedChunks: splitMarkdownIntoChunks(content), projectId: project.id, title: "Requirements", type: "markdown", content, fileHash: hashText(content) });
    tx.createCardSourceLink(visible.id, { kind: "chunk", chunkId: source.chunks[0]!.id });
    tx.createCardSourceLink(hidden.id, { kind: "chunk", chunkId: source.chunks[1]!.id });
    const roadmap = tx.createRoadmap({ projectId: project.id, storyMapId: map.id, name: "Roadmap" });
    const roadmapCard = tx.createRoadmapCard({ roadmapId: roadmap.id, columnId: buildRoadmapDetails(tx.getRoadmapDetailsData(roadmap.id))!.columns[0]!.id, title: "Release plan" });
    tx.createRoadmapReference({ roadmapCardId: roadmapCard.id, targetType: "release", targetId: release.id });
    tx.createRoadmapReference({ roadmapCardId: roadmapCard.id, targetType: "card", targetId: archived.id });
    const connection = tx.createConnectorConnection({ projectId: project.id, provider: "github", authMode: "token", name: "GitHub", owner: "fixture", repository: "repo" });
    const run = tx.createSyncRun({ storyMapId: map.id, connectionId: connection.id, mode: "push", status: "planned" });
    for (const [index, card] of [visible, hidden].entries()) {
      tx.createGitHubLink({ cardId: card.id, repo: "fixture/repo", issueNumber: index + 1, url: `https://github.com/fixture/repo/issues/${index + 1}` });
      tx.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", cardId: card.id, remoteId: String(index + 1), url: `https://github.com/fixture/repo/issues/${index + 1}`, labels: [], syncState: "conflict" });
      tx.createSyncConflict({ externalRefId: tx.listRemoteWorkItemLinksForStoryMap(tx.getCard(card.id)!.storyMapId).find((row) => row.cardId === card.id)!.externalRefId, syncRunId: run.id, connectionId: connection.id, cardId: card.id, remoteId: String(index + 1), field: "title", localValue: card.title, remoteValue: "Remote title" });
    }
    tx.createGitHubLink({ releaseId: release.id, repo: "fixture/repo", url: "https://github.com/fixture/repo/milestone/1" });
    tx.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", releaseId: release.id, remoteId: "1", url: "https://github.com/fixture/repo/milestone/1", labels: [] });
    return { project, map, release, visible, archived, hidden, note, source, roadmap, connection };
  });
  return { ...data, database, repository, unitOfWork };
}

describe("visible Card report boundaries", () => {
  it("excludes hidden trees from every report while retaining complete snapshots and owned links", testExcludesHiddenTreesFromEveryReportWhileRetainingCompleteSnapshotsAnd);

  it("retains visible Notes but excludes them from both public push planning methods and delivery", () => {
    const data = fixture();
    const notes = data.unitOfWork.run(ACTOR, ({ repository }) => {
      const activity = repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Visible Activity" });
      const step = repository.createCard({ storyMapId: data.map.id, level: "step", parentId: activity.id, title: "Visible Step" });
      return [null, activity.id, step.id].map((parentId) => {
        const note = repository.createCard({ storyMapId: data.map.id, level: "note", parentId, releaseId: data.release.id, title: "Planning Note", status: "done" });
        return repository.updateCard(note.id, { estimate: 99 })!;
      });
    });
    const before = data.repository.getStoryMapSnapshot(data.map.id)!;
    const selected = [data.visible.id, ...notes.map((note) => note.id)];
    const plans = data.unitOfWork.run(ACTOR, ({ repository }) => ({
      work: repository.createWorkItemPushPlan({ localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id, mode: "push", cardIds: selected }),
      legacy: repository.createGitHubIssueDryRun({ localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, repo: "fixture/repo", exportLabel: "planning", cardIds: selected })
    }));
    expect(plans.work.items.map((item) => item.cardId)).toEqual([data.visible.id]);
    expect(plans.legacy.map((item) => item.cardId)).toEqual([data.visible.id]);
    expect(buildReleaseSummaryReport(data.repository.getStoryMapReportData(data.map.id)!)).toMatchObject({ totalCards: 1, totalStories: 1, estimateTotal: 3, statusCounts: { done: 1 } });
    expect(before.cards.filter((card) => notes.some((note) => note.id === card.id))).toEqual(expect.arrayContaining(notes));
    expect(data.repository.getStoryMapSnapshot(data.map.id)!.cards).toEqual(before.cards);
  });

  it("keeps zero-visible reports valid and reveals a restored subtree only after an explicit status choice", () => {
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.archiveCard(data.visible.id));
    expect(buildReleaseSummaryReport({ ...data.repository.getStoryMapReportData(data.map.id)! })).toMatchObject({ totalCards: 0, totalStories: 0, estimateTotal: 0, statusCounts: {} });
    expect(buildReleaseTimelineReport(data.map.id, data.repository.listReleases(data.map.id), data.repository.listCards(data.map.id), 0)?.items[0]).toMatchObject({ totalStories: 0, progressRatio: 0 });
    expect(buildRoadmapDetails(data.repository.getRoadmapDetailsData(data.roadmap.id))?.reports[0]).toMatchObject({ totalStories: 0, estimateTotal: 0, progressRatio: 0 });
    expect(buildBacklogHealthReport(data.repository.getStoryMapReportData(data.map.id)!)).toMatchObject({ totalStories: 0, issues: [], readinessRatio: 0 });
    expect(buildSourceCoverageReport(data.project.id, buildSourceDocumentSummaries(data.repository.listSourceDocumentSummaryData(data.project.id)))).toMatchObject({ linkedChunks: 0, coverageRatio: 0 });
    const hiddenBefore = data.repository.getCardDetails(data.hidden.id)!;
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.archived.id, { archived: false, status: "active" }));
    expect(data.repository.getCardDetails(data.hidden.id)).toEqual(hiddenBefore);
    expect(buildReleaseSummaryReport({ ...data.repository.getStoryMapReportData(data.map.id)! })).toMatchObject({ totalCards: 1, totalStories: 1, estimateTotal: 99, statusCounts: { todo: 1 } });
    expect(buildSourceCoverageReport(data.project.id, buildSourceDocumentSummaries(data.repository.listSourceDocumentSummaryData(data.project.id)))).toMatchObject({ linkedChunks: 1, coverageRatio: 0.5 });
    expect(data.repository.listCards(data.map.id)).toHaveLength(11);
  });
});

function testExcludesHiddenTreesFromEveryReportWhileRetainingCompleteSnapshotsAnd() {
  const data = fixture();
  const { repository: read, map, project, release, source, roadmap } = data;
  const snapshot = read.getStoryMapSnapshot(map.id)!;
  expect(snapshot.cards).toHaveLength(11);
  expect(snapshot.sourceLinks).toHaveLength(4);
  expect(snapshot.githubLinks).toHaveLength(3);
  expect(buildReleaseSummaryReport({ ...read.getStoryMapReportData(map.id)! })).toMatchObject({ totalCards: 1, totalStories: 1, estimateTotal: 3, statusCounts: { done: 1 } });
  expect(buildReleaseSummaryReport({ ...read.getStoryMapReportData(map.id)!, releaseId: release.id })).toMatchObject({ totalCards: 1, totalStories: 1, estimateTotal: 3 });
  expect(buildReleaseTimelineReport(map.id, read.listReleases(map.id), read.listCards(map.id), 0)?.items[0]).toMatchObject({ totalStories: 1, doneStories: 1, estimateTotal: 3, progressRatio: 1 });
  expect(buildRoadmapDetails(read.getRoadmapDetailsData(roadmap.id))?.reports[0]).toMatchObject({ totalCards: 1, totalStories: 1, doneStories: 1, estimateTotal: 3, statusCounts: { done: 1 } });
  expect(buildBacklogHealthReport(read.getStoryMapReportData(map.id)!)).toMatchObject({ totalStories: 1, healthyStories: 1, issues: [] });
  expect(buildGitHubSyncHealthReport(read.getGitHubSyncHealthData(map.id)!)).toMatchObject({ totalLinks: 2, stateCounts: { conflict: 1, synced: 1 } });
  expect(buildWorkItemSyncHealthReport(read.getWorkItemSyncHealthData(map.id), hashText)).toMatchObject({ totalLinks: 2, stateCounts: { conflict: 1, synced: 1 } });
  expect(buildWorkItemSyncHealthReport(read.getWorkItemSyncHealthData(map.id), hashText).openConflicts.map((conflict) => conflict.cardId)).toEqual([data.visible.id]);
  expect(buildSourceCoverageReport(project.id, buildSourceDocumentSummaries(read.listSourceDocumentSummaryData(project.id)))).toMatchObject({ totalChunks: 2, linkedChunks: 1, coverageRatio: 0.5 });
  expect(buildSourceDocumentSummaries(read.listSourceDocumentSummaryData(project.id))[0]).toMatchObject({ id: source.document.id, linkedChunkCount: 1 });
  expect(read.getSourceDocumentDetails(source.document.id)?.links.map((link) => link.cardId)).toEqual([data.visible.id]);
  expect(data.unitOfWork.run(ACTOR, ({ repository }) => repository.createGitHubIssueDryRun({ localOrigin: "http://127.0.0.1:4317", storyMapId: map.id, repo: "fixture/repo", exportLabel: "planning" })).map((item) => item.cardId)).toEqual([data.visible.id]);
  expect(data.unitOfWork.run(ACTOR, ({ repository }) => repository.createWorkItemPushPlan({ localOrigin: "http://127.0.0.1:4317", storyMapId: map.id, connectionId: data.connection.id, mode: "push" })).items.map((item) => item.cardId)).toEqual([data.visible.id]);
  expect(read.getStoryMapSnapshot(map.id)!.cards).toEqual(snapshot.cards);
}
