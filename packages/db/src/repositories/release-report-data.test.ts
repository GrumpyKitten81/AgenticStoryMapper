import type { Project, Card } from "@storymapper/contracts";
import { splitMarkdownIntoChunks } from "@storymapper/importers";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReleaseSummaryReport, buildReleaseTimelineReport, buildRoadmapDetails } from "@storymapper/core";
import { DatabaseHandle, UnitOfWork } from "@storymapper/db";
import { openStoryMapperDb } from "@storymapper/db/connection";
import { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { hashText } from "@storymapper/db/repositories/repository-values";

const TEST_ACTOR = { actorType: "human", actorId: "local-user" } as const;

describe("Repository data for release and roadmap reports", () => {
  it("calculates release summaries for release and unscheduled scopes", testCalculatesReleaseSummariesForReleaseAndUnscheduledScopes);

  it("builds release timeline and roadmap progress from release references", testBuildsReleaseTimelineAndRoadmapProgressFromReleaseReferences);

});

function testCalculatesReleaseSummariesForReleaseAndUnscheduledScopes() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Release Summary Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const release = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: storyMap.id, name: "MVP" }));
  const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const readyStory = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({
    storyMapId: storyMap.id,
    parentId: step.id,
    releaseId: release.id,
    level: "story",
    title: "Ready Story",
    description: "Ready to track."
  }));
  const unscheduledStory = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({
    storyMapId: storyMap.id,
    parentId: step.id,
    level: "story",
    title: "Unscheduled Story"
  }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(readyStory.id, { status: "active", estimate: 3 }));
  const content = "# Requirement\n\nReady story has source coverage.";
  exerciseTestCalculatesReleaseSummariesForReleaseAndUnscheduledScopes(repository, project, content, readyStory);

  const releaseSummary = buildReleaseSummaryReport({ ...repository.getStoryMapReportData(storyMap.id)!, releaseId: release.id });
  const unscheduledSummary = buildReleaseSummaryReport({ ...repository.getStoryMapReportData(storyMap.id)!, releaseId: null });
  const allSummary = buildReleaseSummaryReport({ ...repository.getStoryMapReportData(storyMap.id)! });

  expect(releaseSummary?.releaseName).toBe("MVP");
  expect(releaseSummary?.totalStories).toBe(1);
  expect(releaseSummary?.estimateTotal).toBe(3);
  expect(releaseSummary?.statusCounts.active).toBe(1);
  expect(releaseSummary?.riskCounts.missingSource).toBe(0);
  expect(releaseSummary?.riskCounts.missingGitHubLink).toBe(0);
  expect(unscheduledSummary?.scope).toBe("unscheduled");
  expect(unscheduledSummary?.totalStories).toBe(1);
  expect(unscheduledSummary?.riskCounts.missingDescription).toBe(1);
  expect(allSummary?.totalStories).toBe(2);
  expect(repository.getCardDetails(unscheduledStory.id)?.releaseId).toBeNull();
}

function exerciseTestCalculatesReleaseSummariesForReleaseAndUnscheduledScopes(repository: StoryMapperRepository<"root">, project: Project, content: string, readyStory: Card) {
  const imported = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.importSourceDocument({ parsedChunks: splitMarkdownIntoChunks(content),
    projectId: project.id,
    title: "Release PRD",
    type: "markdown",
    content,
    fileHash: hashText(content)
  }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCardSourceLink(readyStory.id, { kind: "chunk", chunkId: imported.chunks[0]!.id }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubLink({
    cardId: readyStory.id,
    repo: "owner/repo",
    issueNumber: 12,
    url: "https://github.com/owner/repo/issues/12"
  }));
}

function testBuildsReleaseTimelineAndRoadmapProgressFromReleaseReferences() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Roadmap Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const release = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({
    storyMapId: storyMap.id,
    name: "MVP",
    startDate: "2026-07-01",
    releaseDate: "2026-07-15"
  }));
  const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const firstStory = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: step.id, releaseId: release.id, level: "story", title: "First" }));
  const secondStory = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: step.id, releaseId: release.id, level: "story", title: "Second" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(firstStory.id, { status: "done", estimate: 3 }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(secondStory.id, { estimate: 5 }));

  const roadmap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRoadmap({ projectId: project.id, storyMapId: storyMap.id, name: "Release Roadmap", type: "release" }));
  const details = buildRoadmapDetails(repository.getRoadmapDetailsData(roadmap.id));
  const column = details?.columns[0];
  expect(column).toBeDefined();
  const roadmapCard = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRoadmapCard({ roadmapId: roadmap.id, columnId: column!.id, title: "Ship MVP" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRoadmapReference({ roadmapCardId: roadmapCard.id, targetType: "release", targetId: release.id }));

  const timeline = buildReleaseTimelineReport(storyMap.id, repository.listReleases(storyMap.id), repository.listCards(storyMap.id), 0);
  const roadmapDetails = buildRoadmapDetails(repository.getRoadmapDetailsData(roadmap.id));
  const snapshot = repository.getStoryMapSnapshot(storyMap.id);

  expect(timeline?.startDate).toBe("2026-07-01");
  expect(timeline?.endDate).toBe("2026-07-15");
  expect(timeline?.items[0]?.totalStories).toBe(2);
  expect(timeline?.items[0]?.doneStories).toBe(1);
  expect(roadmapDetails?.reports[0]).toMatchObject({
    roadmapCardId: roadmapCard.id,
    totalStories: 2,
    doneStories: 1,
    estimateTotal: 8,
    progressRatio: 0.5
  });
  expect(snapshot?.roadmaps[0]?.id).toBe(roadmap.id);
  expect(repository.listActivity(project.id).some((event) => event.action === "roadmapReference.created")).toBe(true);
}
