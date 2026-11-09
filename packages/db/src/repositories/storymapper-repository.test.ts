import { sourceLinkOperations } from "@storymapper/db/test-fixtures/source-link-operations";
import type { ChangeOperation } from "@storymapper/contracts";
import type { Project } from "@storymapper/contracts";
import { splitMarkdownIntoChunks } from "@storymapper/importers";
import { persistImportedCardFixture } from "@storymapper/db/fixtures/imported-card";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSourceDocumentSummaries } from "@storymapper/core";
import { buildGitHubSyncHealthReport, buildWorkItemSyncHealthReport } from "@storymapper/core";
import { hashText } from "@storymapper/db/repositories/repository-values";
import { buildSourceCoverageReport, buildBacklogHealthReport } from "@storymapper/core";
import { DatabaseHandle, UnitOfWork } from "@storymapper/db";
import { openStoryMapperDb } from "@storymapper/db/connection";
import { StoryMapperRepository, ChangeSetConflictError } from "@storymapper/db/repositories/storymapper-repository";
import { exportStoryMap, exportAudit } from "@storymapper/server/application/export/export.use-cases";

const TEST_ACTOR = { actorType: "human", actorId: "local-user" } as const;

describe("StoryMapperRepository", () => {
  it("persists project, story map, cards, release and activity in SQLite", testPersistsProjectStoryMapCardsReleaseAndActivityInSQLite);

  it("reorders release lanes without changing story assignments", testReordersReleaseLanesWithoutChangingStoryAssignments);

  it("prevents invalid card nesting", () => {
    const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
    const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

    const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Hierarchy Test" }));
    const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
    const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));

    expect(() =>
      new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "story", title: "Invalid Story" }))
    ).toThrow("story cannot be nested below activity");
  });

  it("imports source documents, links chunks to cards and updates coverage", testImportsSourceDocumentsLinksChunksToCardsAndUpdatesCoverage);

  it("calculates backlog health from card quality and source links", testCalculatesBacklogHealthFromCardQualityAndSourceLinks);

  it("bulk updates cards within one story map and writes activity", testBulkUpdatesCardsWithinOneStoryMapAndWritesActivity);

  it("manages customization data and bulk persona and annotation assignments", testManagesCustomizationDataAndBulkPersonaAndAnnotationAssignments);

  it("rejects bulk updates with cards or releases from another story map", testRejectsBulkUpdatesWithCardsOrReleasesFromAnotherStoryMap);

  it("keeps default safety switches, updates GitHub and exports map and audit data", testKeepsDefaultSafetySwitchesUpdatesGitHubAndExportsMapAndAudit);

  it("manages GitHub links, sync health and issue dry-runs", testManagesGitHubLinksSyncHealthAndIssueDryRuns);

  it("persists and updates ChangeSets", testPersistsAndUpdatesChangeSets);

  it("applies approved ChangeSets with proposed id mapping and source links", testAppliesApprovedChangeSetsWithProposedIdMappingAndSourceLinks);

  it("manages provider connections, remote links and imported work items", testManagesProviderConnectionsRemoteLinksAndImportedWorkItems);

  it("prepares import hierarchy and status metadata without creating Cards, Releases or Annotations", testPreparesImportHierarchyAndStatusMetadataWithoutCreatingCardsReleasesOr);

  it("stores product context and exposes it in story map snapshots", testStoresProductContextAndExposesItInStoryMapSnapshots);

  it("stores card attachments and derives card history summaries", testStoresCardAttachmentsAndDerivesCardHistorySummaries);

  it("marks approved changesets as conflict when card base version changed", testMarksApprovedChangesetsAsConflictWhenCardBaseVersionChanged);

  it("lists every stale Card of a ChangeSet in one conflict and applies none of its operations", testListsEveryStaleCardOfAChangeSetInOneConflictAnd);
});

function testPersistsProjectStoryMapCardsReleaseAndActivityInSQLite() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const firstRepository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(databasePath)));

  const project = new UnitOfWork(firstRepository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Persistence Test" }));
  const storyMap = new UnitOfWork(firstRepository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const release = new UnitOfWork(firstRepository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: storyMap.id, name: "MVP" }));
  const activity = new UnitOfWork(firstRepository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(firstRepository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = new UnitOfWork(firstRepository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({
    storyMapId: storyMap.id,
    parentId: step.id,
    releaseId: release.id,
    level: "story", cardType: "story",
    title: "Story"
  }));

  new UnitOfWork(firstRepository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(story.id, { status: "active", estimate: 3 }));

  const secondRepository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(databasePath)));
  const snapshot = secondRepository.getStoryMapSnapshot(storyMap.id);

  expect(snapshot?.cards).toHaveLength(3);
  expect(snapshot?.releases).toHaveLength(1);
  expect(snapshot?.cards.find((card) => card.id === story.id)?.status).toBe("active");
  expect(secondRepository.listActivity(project.id).length).toBeGreaterThanOrEqual(6);
}

function testReordersReleaseLanesWithoutChangingStoryAssignments() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Release Reorder Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const first = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: storyMap.id, name: "First" }));
  const middle = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: storyMap.id, name: "Middle" }));
  const last = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: storyMap.id, name: "Last" }));
  const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: step.id, releaseId: middle.id, level: "story", title: "Story" }));

  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateRelease(middle.id, { position: 0 }));
  expect(repository.listReleases(storyMap.id).map((release) => release.name)).toEqual(["Middle", "First", "Last"]);
  expect(repository.getStoryMapSnapshot(storyMap.id)?.cards.find((card) => card.id === story.id)?.releaseId).toBe(middle.id);

  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateRelease(middle.id, { position: 2 }));
  expect(repository.listReleases(storyMap.id).map((release) => release.name)).toEqual(["First", "Last", "Middle"]);
  expect(repository.listReleases(storyMap.id).map((release) => release.position)).toEqual([0, 1, 2]);
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateRelease(first.id, { position: 3 }))).toThrow("Release position is outside the release lanes.");
}

function testImportsSourceDocumentsLinksChunksToCardsAndUpdatesCoverage() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Source Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", title: "Story" }));
  const content = "# Mini PRD\n\nUser can map stories.\n\n# Risk\n\nTraceability can be lost.";
  const imported = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.importSourceDocument({ parsedChunks: splitMarkdownIntoChunks(content),
    projectId: project.id,
    title: "Mini PRD",
    type: "markdown",
    content,
    fileHash: hashText(content)
  }));

  expect(imported.chunks).toHaveLength(2);
  expect(buildSourceCoverageReport(project.id, buildSourceDocumentSummaries(repository.listSourceDocumentSummaryData(project.id))).coverageRatio).toBe(0);

  const link = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCardSourceLink(story.id, { kind: "chunk", chunkId: imported.chunks[0]!.id }));
  const coverage = buildSourceCoverageReport(project.id, buildSourceDocumentSummaries(repository.listSourceDocumentSummaryData(project.id)));
  const details = repository.getSourceDocumentDetails(imported.document.id);
  const snapshot = repository.getStoryMapSnapshot(storyMap.id);

  expect(link?.cardId).toBe(story.id);
  expect(coverage.linkedChunks).toBe(1);
  expect(coverage.coverageRatio).toBe(0.5);
  expect(details?.linkedCardsByChunkId[imported.chunks[0]!.id]?.[0]?.key).toBe(story.key);
  expect(snapshot?.sourceLinks).toHaveLength(1);

  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteCardSourceLink(story.id, { kind: "chunk", id: link!.id }))).toBe(true);
  expect(buildSourceCoverageReport(project.id, buildSourceDocumentSummaries(repository.listSourceDocumentSummaryData(project.id))).coverageRatio).toBe(0);
}

function testCalculatesBacklogHealthFromCardQualityAndSourceLinks() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Backlog Health Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const readyStory = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({
    storyMapId: storyMap.id,
    parentId: step.id,
    level: "story", cardType: "story",
    title: "Ready Story",
    description: "A sourced story."
  }));
  const thinStory = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", title: "Thin Story" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(readyStory.id, { estimate: 3 }));
  const content = "# Requirement\n\nReady story has a source.";
  const imported = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.importSourceDocument({ parsedChunks: splitMarkdownIntoChunks(content),
    projectId: project.id,
    title: "Health PRD",
    type: "markdown",
    content,
    fileHash: hashText(content)
  }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCardSourceLink(readyStory.id, { kind: "chunk", chunkId: imported.chunks[0]!.id }));

  const report = buildBacklogHealthReport(repository.getStoryMapReportData(storyMap.id)!);

  expect(report?.totalStories).toBe(2);
  expect(report?.healthyStories).toBe(0);
  expect(report?.issueCounts["missing-description"]).toBe(1);
  expect(report?.issueCounts["missing-estimate"]).toBe(1);
  expect(report?.issueCounts["missing-source"]).toBe(1);
  expect(report?.issueCounts["missing-github-link"]).toBe(2);
  expect(report?.issues.find((issue) => issue.cardId === thinStory.id)?.cardTitle).toBe("Thin Story");
}

function testBulkUpdatesCardsWithinOneStoryMapAndWritesActivity() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Bulk Update Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const release = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: storyMap.id, name: "MVP" }));
  const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const firstStory = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", title: "First Story" }));
  const secondStory = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", title: "Second Story" }));

  const updated = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.bulkUpdateCards({
    storyMapId: storyMap.id,
    cardIds: [firstStory.id, secondStory.id],
    patch: {
      status: "active",
      releaseId: release.id,
      estimate: 5,
      color: "#edf6ef"
    }
  }));
  const snapshot = repository.getStoryMapSnapshot(storyMap.id);
  const activityEvents = repository.listActivity(project.id);

  expect(updated).toHaveLength(2);
  expect(snapshot?.cards.find((card) => card.id === firstStory.id)?.status).toBe("active");
  expect(snapshot?.cards.find((card) => card.id === secondStory.id)?.releaseId).toBe(release.id);
  expect(snapshot?.cards.find((card) => card.id === firstStory.id)?.estimate).toBe(5);
  expect(activityEvents.some((event) => event.action === "card.bulkUpdated")).toBe(true);
}

function testManagesCustomizationDataAndBulkPersonaAndAnnotationAssignments() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Customization Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", title: "Story" }));

  const status = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createWorkflowStatus({
    projectId: project.id,
    storyMapId: storyMap.id,
    name: "blocked",
    group: "active",
    color: "#fff1f2"
  }));
  const persona = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createPersona({ projectId: project.id, storyMapId: storyMap.id, name: "Buyer", role: "Decision maker" }));
  const annotation = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createAnnotation({ projectId: project.id, storyMapId: storyMap.id, name: "Risk", color: "#fff7ed" }));
  const template = exerciseTestManagesCustomizationDataAndBulkPersonaAndAnnotationAssignments(repository, project, storyMap, story, persona, annotation);
  const snapshot = repository.getStoryMapSnapshot(storyMap.id);
  const activityEvents = repository.listActivity(project.id);

  expect(repository.listWorkflowStatuses(project.id, storyMap.id).map((item) => item.name)).toContain("todo");
  expect(status.group).toBe("active");
  expect(snapshot?.cards.find((card) => card.id === story.id)?.status).toBe("blocked");
  expect(snapshot?.personas[0]?.name).toBe("Buyer");
  expect(snapshot?.annotations[0]?.name).toBe("Risk");
  expect(snapshot?.cardPersonas[0]).toMatchObject({ cardId: story.id, personaId: persona.id });
  expect(snapshot?.cardAnnotations[0]).toMatchObject({ cardId: story.id, annotationId: annotation.id });
  expect(snapshot?.storyTemplates[0]?.id).toBe(template.id);
  expect(activityEvents.some((event) => event.action === "workflowStatus.created")).toBe(true);
  expect(activityEvents.some((event) => event.action === "cardPersona.created")).toBe(true);
  expect(activityEvents.some((event) => event.action === "cardAnnotation.created")).toBe(true);
}

function exerciseTestManagesCustomizationDataAndBulkPersonaAndAnnotationAssignments(repository: StoryMapperRepository<"root">, project: { id: string; name: string; localPath: string; defaultLanguage: string; defaultEstimationUnit: string; createdAt: string; historicalStub?: boolean | undefined; description?: string | undefined; }, storyMap: { version: number; id: string; projectId: string; name: string; estimationUnit: string; cardKeyPrefix: string; createdAt: string; updatedAt: string; description?: string | undefined; defaultConnectionId?: string | null | undefined; }, story: { creationOrigin: "manual" | "inference" | "unknown"; provenance: "manual" | "inference" | "unknown" | "linked"; version: number; id: string; storyMapId: string; parentId: string | null; releaseId: string | null; key: string; level: "activity" | "step" | "story" | "note"; title: string; description: string; position: number; status: string; parked: boolean; createdAt: string; updatedAt: string; priority?: string | undefined; businessValue?: number | undefined; effort?: number | undefined; estimate?: number | undefined; color?: string | undefined; assignee?: string | undefined; }, persona: { version: number; id: string; projectId: string; storyMapId: string | null; name: string; role: string; personaType: string; avatar: string; represents: string; age: string; country: string; fachexpertise: string; workLife: string; productExperience: string; expectations: string; description: string; centralNeed: string; successIndicators: string; scopeNote: string; goals: string[]; pains: string[]; }, annotation: { id: string; projectId: string; storyMapId: string | null; name: string; icon: string; color: string; position: number; }) {
  const template = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryTemplate({
    projectId: project.id,
    storyMapId: storyMap.id,
    name: "Default Story",
    descriptionTemplate: "As a user...",
    defaultStatus: "blocked",
    defaultEstimate: 3
  }));

  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.bulkUpdateCards({
    storyMapId: storyMap.id,
    cardIds: [story.id],
    patch: {
      status: "blocked",
      addPersonaId: persona.id,
      addAnnotationId: annotation.id
    }
  }));
  return template;
}

function testRejectsBulkUpdatesWithCardsOrReleasesFromAnotherStoryMap() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Bulk Boundary Test" }));
  const firstMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "First Map" }));
  const secondMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Second Map" }));
  const firstActivity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: firstMap.id, level: "activity", title: "First Activity" }));
  const secondActivity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: secondMap.id, level: "activity", title: "Second Activity" }));
  const foreignRelease = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: secondMap.id, name: "Foreign Release" }));

  expect(() =>
    new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.bulkUpdateCards({
      storyMapId: firstMap.id,
      cardIds: [secondActivity.id],
      patch: { status: "done" }
    }))
  ).toThrow("belongs to another story map");

  expect(() =>
    new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.bulkUpdateCards({
      storyMapId: firstMap.id,
      cardIds: [firstActivity.id],
      patch: { releaseId: foreignRelease.id }
    }))
  ).toThrow("belongs to another story map");
}

function testKeepsDefaultSafetySwitchesUpdatesGitHubAndExportsMapAndAudit() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Privacy Export Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Export Map" }));
  const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({
    storyMapId: storyMap.id,
    parentId: step.id,
    level: "story", cardType: "story",
    title: "Exported Story",
    description: "Export this story."
  }));

  expect(repository.getSafetySettings(project.id)).toMatchObject({
    agentMode: "apply",
    github: false
  });

  const updatedSettings = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateSafetySettings(project.id, {
    github: true
  }));
  const jsonExport = exportStoryMap({ repository: repository, unitOfWork: new UnitOfWork(repository.handle) }, TEST_ACTOR, storyMap.id, "json");
  const markdownExport = exportStoryMap({ repository: repository, unitOfWork: new UnitOfWork(repository.handle) }, TEST_ACTOR, storyMap.id, "markdown");
  const csvExport = exportStoryMap({ repository: repository, unitOfWork: new UnitOfWork(repository.handle) }, TEST_ACTOR, storyMap.id, "csv");
  const auditExport = exportAudit({ repository: repository, unitOfWork: new UnitOfWork(repository.handle) }, TEST_ACTOR, project.id, "markdown");
  const activityEvents = repository.listActivity(project.id);

  expect(updatedSettings.github).toBe(true);
  expect(updatedSettings.agentMode).toBe("apply");
  expect(jsonExport?.content).toContain("Exported Story");
  expect(markdownExport?.content).toContain(`#### ${story.key} Exported Story`);
  expect(csvExport?.content).toContain("\"key\",\"level\",\"cardType\",\"title\"");
  expect(auditExport.content).toContain("Agent mode: apply");
  expect(activityEvents.some((event) => event.action === "settings.safetyUpdated")).toBe(true);
  expect(activityEvents.some((event) => event.action === "exports.storyMapCreated")).toBe(true);
  expect(activityEvents.some((event) => event.action === "exports.auditCreated")).toBe(true);
}

function testManagesGitHubLinksSyncHealthAndIssueDryRuns() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "GitHub Link Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const release = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: storyMap.id, name: "MVP" }));
  const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({
    storyMapId: storyMap.id,
    parentId: step.id,
    releaseId: release.id,
    level: "story", cardType: "story",
    title: "Linked Story",
    description: "As a developer, I want a local dry-run before GitHub writes."
  }));

  const link = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubLink({
    cardId: story.id,
    repo: "owner/repo",
    issueNumber: 42,
    url: "https://github.com/owner/repo/issues/42"
  }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => {
    const connection = txRepository.createConnectorConnection({ projectId: project.id, provider: "github", name: "Joined sync state", authMode: "token", owner: "owner", repository: "repo" });
    txRepository.upsertRemoteWorkItemLink({ externalRefId: link.id, connectionId: connection.id, labels: [], milestone: "MVP", syncState: "synced" });
  });
  const health = buildGitHubSyncHealthReport(repository.getGitHubSyncHealthData(storyMap.id)!);
  const dryRuns = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubIssueDryRun({ localOrigin: "http://127.0.0.1:4317",
    storyMapId: storyMap.id,
    repo: "owner/repo",
    releaseId: release.id,
    exportLabel: "local-story-map"
  }));
  const backlogHealth = buildBacklogHealthReport(repository.getStoryMapReportData(storyMap.id)!);
  exerciseTestManagesGitHubLinksSyncHealthAndIssueDryRuns(repository, storyMap, health, dryRuns, backlogHealth, link);
}

function exerciseTestManagesGitHubLinksSyncHealthAndIssueDryRuns(repository: StoryMapperRepository<"root">, storyMap: { version: number; id: string; projectId: string; name: string; estimationUnit: string; cardKeyPrefix: string; createdAt: string; updatedAt: string; description?: string | undefined; defaultConnectionId?: string | null | undefined; }, health: { storyMapId: string; totalLinks: number; stateCounts: Partial<Record<"unsynced" | "synced" | "conflict" | "stale" | "remote_deleted" | "local_deleted", number>>; links: { id: string; repo: string; url: string; syncState: "unsynced" | "synced" | "conflict" | "stale" | "remote_deleted" | "local_deleted"; provider?: "github" | undefined; cardId?: string | undefined; releaseId?: string | undefined; issueNumber?: number | undefined; milestone?: string | undefined; }[]; }, dryRuns: { cardId: string; title: string; body: string; labels: string[]; repo: string; milestone?: string | undefined; }[], backlogHealth: { storyMapId: string; totalStories: number; healthyStories: number; readinessRatio: number; issueCounts: Partial<Record<"missing-description" | "missing-estimate" | "missing-source" | "missing-github-link", number>>; issues: { cardId: string; cardKey: string; cardTitle: string; type: "missing-description" | "missing-estimate" | "missing-source" | "missing-github-link"; severity: "error" | "info" | "warning"; }[]; }, link: { id: string; repo: string; url: string; syncState: "unsynced" | "synced" | "conflict" | "stale" | "remote_deleted" | "local_deleted"; provider?: "github" | undefined; cardId?: string | undefined; releaseId?: string | undefined; issueNumber?: number | undefined; milestone?: string | undefined; }) {
  const snapshot = repository.getStoryMapSnapshot(storyMap.id);

  expect(snapshot?.githubLinks).toHaveLength(1);
  expect(repository.listGitHubLinksForStoryMap(storyMap.id)[0]?.issueNumber).toBe(42);
  expect(health?.totalLinks).toBe(1);
  expect(health?.stateCounts.synced).toBe(1);
  expect(dryRuns).toHaveLength(1);
  expect(dryRuns[0]?.title).toBe("Linked Story");
  expect(dryRuns[0]?.labels).toContain("status:todo");
  expect(dryRuns[0]?.milestone).toBe("MVP");
  expect(backlogHealth?.issueCounts["missing-github-link"]).toBe(0);

  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteGitHubLink(link.id))).toBe(true);
  expect(buildGitHubSyncHealthReport(repository.getGitHubSyncHealthData(storyMap.id)!)?.totalLinks).toBe(0);
}

function testPersistsAndUpdatesChangeSets() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "ChangeSet Test" }));
  const changeSet = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createChangeSet({
    id: "00000000-0000-4000-8000-000000000101",
    projectId: project.id,
    title: "Proposal",
    source: "mcp",
    status: "proposed",
    operations: [{
      operationId: "fixture-operation-1", op: "update",
      entity: "card",
      entityId: "card-1",
      after: { estimate: 1 },
      reason: "Initial estimate."
    }],
    createdAt: new Date().toISOString()
  }));

  expect(repository.listChangeSets(project.id)).toHaveLength(1);
  expect(repository.getChangeSet(changeSet.id)?.operations[0]).toMatchObject({ reason: "Initial estimate." });
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateChangeSetStatus(changeSet.id, "approved"))?.status).toBe("approved");
}

function testAppliesApprovedChangeSetsWithProposedIdMappingAndSourceLinks() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));

  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Apply Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const content = "# Requirement\n\nApplied story should link to this chunk.";
  const imported = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.importSourceDocument({ parsedChunks: splitMarkdownIntoChunks(content),
    projectId: project.id,
    title: "Apply PRD",
    type: "markdown",
    content,
    fileHash: hashText(content)
  }));
  const changeSet = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createChangeSet({
    id: "00000000-0000-4000-8000-000000000201",
    projectId: project.id,
    title: "Apply proposal",
    source: "mcp",
    status: "proposed",
    operations: sourceLinkOperations(storyMap.id, imported.chunks[0]!.id),
    createdAt: new Date().toISOString()
  }));

  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.applyChangeSet(changeSet.id))).toThrow("requires recorded approval");
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateChangeSetStatus(changeSet.id, "approved"));
  const applied = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.applyChangeSet(changeSet.id));
  const snapshot = repository.getStoryMapSnapshot(storyMap.id);

  expect(applied?.status).toBe("applied");
  expect(snapshot?.cards).toHaveLength(3);
  expect(snapshot?.sourceLinks).toHaveLength(1);
  expect(snapshot?.cards.find((card) => card.level === "story")?.description).toBe("Applied story");
}

function testManagesProviderConnectionsRemoteLinksAndImportedWorkItems() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Work Item Sync Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const activity = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const step = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: activity.id, level: "step", title: "Step" }));
  const story = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", cardType: "story", title: "[Story] Push me", description: "Body" }));
  const spike = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, parentId: step.id, level: "story", cardType: "spike", title: "[Spike] Investigate", description: "Spike body" }));
  const connection = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createConnectorConnection({
    projectId: project.id,
    provider: "github",
    authMode: "token",
    name: "Repo",
    owner: "owner",
    repository: "repo",
    issueTypeMapping: [{ cardType: "story", issueType: "Task" }, { cardType: "spike", issueType: "Task" }],
    statusMapping: [
      { localStatus: "todo", remoteState: "open", labels: ["status:todo"] },
      { localStatus: "active", remoteState: "open", labels: ["status:active"] },
      { localStatus: "done", remoteState: "closed", labels: ["status:done"] }
    ]
  }));
  const publicConnection = repository.publicConnectorConnection(connection);

  const plan = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createWorkItemPushPlan({ localOrigin: "http://127.0.0.1:4317", storyMapId: storyMap.id, connectionId: connection.id, parentIssueNumber: 8, mode: "push" }));
  const plannedItem = plan.items.find((item) => item.cardId === story.id)!;
  const plannedSpike = plan.items.find((item) => item.cardId === spike.id)!;
  const link = exerciseTestManagesProviderConnectionsRemoteLinksAndImportedWorkItems(repository, connection, story, plannedItem);
  const imported = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => persistImportedCardFixture(txRepository, { storyMapId: storyMap.id, level: "story", title: "Imported issue", description: "Imported body", status: "active" }, connection.id, "https://github.com/owner/repo/issues/43", ["bug", "status:active"]));

  const importedCard = repository.listCards(storyMap.id).find((card) => card.title === "Imported issue");

  expect(plan.items).toHaveLength(4);
  expect(plan.items.find((item) => item.cardId === story.id)).toMatchObject({ cardId: story.id, action: "create", githubIssueType: "Task", parentIssueNumber: 8, remoteState: "open", labels: ["local-story-map", "status:todo", "story-map:LSM", "level:story"] });
  expect(plannedSpike).toMatchObject({ githubIssueType: "Task", parentIssueNumber: 8 });
  expect(connection).toMatchObject({ readOnly: true });
  expect(publicConnection).toMatchObject({ readOnly: true });
  expect(link.remoteNumber).toBe(42);
  expect(imported).toMatchObject({ title: "Imported issue", provenance: "linked", creationOrigin: "inference" });
  expect(importedCard?.status).toBe("active");
  const health = buildWorkItemSyncHealthReport(repository.getWorkItemSyncHealthData(storyMap.id), hashText);
  expect(health.totalLinks).toBe(2);
  expect(health.stateCounts.unsynced).toBe(1);
  expect(health.links.filter((row) => row.syncState === "unsynced")).toMatchObject([{ id: link.id, externalRefId: link.externalRefId, cardId: story.id, remoteId: "42", url: link.url }]);
  expect(repository.getStoryMapSnapshot(storyMap.id)?.remoteWorkItemLinks).toHaveLength(2);
}

function exerciseTestManagesProviderConnectionsRemoteLinksAndImportedWorkItems(repository: StoryMapperRepository<"root">, connection: { id: string; projectId: string; provider: "github"; name: string; authMode: "github-cli" | "token"; owner: string; defaultLabel: string; readOnly: boolean; statusMapping: { localStatus: string; remoteState: string; labels: string[]; }[]; issueTypeMapping: { cardType: "story" | "task" | "bug" | "spike" | "feature" | "epic" | "theme"; issueType: string; }[]; typeMapping: { match: string; level: "activity" | "step" | "story" | "note"; }[]; releaseSource: "milestone" | "iteration" | "none"; iterationFieldName: string; labelsAsAnnotations: boolean; createdAt: string; updatedAt: string; repository?: string | undefined; }, story: { creationOrigin: "manual" | "inference" | "unknown"; provenance: "manual" | "inference" | "unknown" | "linked"; version: number; id: string; storyMapId: string; parentId: string | null; releaseId: string | null; key: string; level: "activity" | "step" | "story" | "note"; title: string; description: string; position: number; status: string; parked: boolean; createdAt: string; updatedAt: string; priority?: string | undefined; businessValue?: number | undefined; effort?: number | undefined; estimate?: number | undefined; color?: string | undefined; assignee?: string | undefined; }, plannedItem: { action: "conflict" | "create" | "update" | "skip"; title: string; body: string; labels: string[]; cardId?: string | undefined; milestone?: string | undefined; githubIssueType?: string | undefined; parentIssueNumber?: number | undefined; remoteState?: string | undefined; remoteId?: string | undefined; reason?: string | undefined; level?: "activity" | "step" | "story" | "note" | undefined; assignee?: string | undefined; releaseName?: string | undefined; localStatus?: string | undefined; }) {
  const link = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.bindRemoteWorkItemLink({
    connectionId: connection.id,
    provider: "github",
    cardId: story.id,
    remoteId: "42",
    remoteNumber: 42,
    url: "https://github.com/owner/repo/issues/42",
    titleHash: hashText(plannedItem.title),
    bodyHash: hashText(plannedItem.body),
    labels: ["local-story-map"],
    syncState: "synced",
    lastSyncedAt: "2000-01-01T00:00:00.000Z"
  }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(story.id, { description: "Locally changed body" }));
  return link;
}

function testPreparesImportHierarchyAndStatusMetadataWithoutCreatingCardsReleasesOr() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Hierarchical Import Test" }));
  const { storyMap, connection } = exerciseTestPreparesImportHierarchyAndStatusMetadataWithoutCreatingCardsReleasesOr(repository, project);

  const plan = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createWorkItemImportPlan({
    storyMapId: storyMap.id,
    connectionId: connection.id,
    items: importHierarchyItems()
  }));

  expect(plan.items.map((item) => ({ title: item.title, level: item.level, releaseName: item.releaseName, assignee: item.assignee }))).toEqual([
    { title: "Checkout epic", level: "activity", releaseName: undefined, assignee: undefined },
    { title: "Payment feature", level: "step", releaseName: undefined, assignee: undefined },
    { title: "Pay by card", level: "story", releaseName: undefined, assignee: "alex" }
  ]);
  const snapshot = repository.getStoryMapSnapshot(storyMap.id)!;
  expect(snapshot.cards).toEqual([]);
  expect(snapshot.releases).toEqual([]);
  expect(snapshot.annotations).toEqual([]);
  expect(snapshot.remoteWorkItemLinks).toEqual([]);
}

function exerciseTestPreparesImportHierarchyAndStatusMetadataWithoutCreatingCardsReleasesOr(repository: StoryMapperRepository<"root">, project: Project) {
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const connection = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createConnectorConnection({
    projectId: project.id,
    provider: "github",
    authMode: "token",
    name: "Repo",
    owner: "owner",
    repository: "repo",
    labelsAsAnnotations: true,
    statusMapping: [
      { localStatus: "todo", remoteState: "open", labels: ["status:todo"] },
      { localStatus: "active", remoteState: "open", labels: ["status:active"] },
      { localStatus: "done", remoteState: "closed", labels: ["status:done"] }
    ]
  }));
  return { storyMap, connection };
}

function testStoresProductContextAndExposesItInStoryMapSnapshots() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Product Context Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));

  const context = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.upsertProductContext({
    projectId: project.id,
    storyMapId: storyMap.id,
    productType: "Developer tool",
    purpose: "Plan local delivery",
    keyFeatures: ["Story mapping", "GitHub sync"]
  }));

  expect(context.keyFeatures).toEqual(["Story mapping", "GitHub sync"]);
  expect(repository.getProductContext(project.id, storyMap.id).purpose).toBe("Plan local delivery");
  expect(repository.getStoryMapSnapshot(storyMap.id)?.productContext?.productType).toBe("Developer tool");
}

function testStoresCardAttachmentsAndDerivesCardHistorySummaries() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Card Detail Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const card = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));

  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(card.id, { title: "Updated activity" }));
  const attachment = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCardAttachment(card.id, {
    label: "Spec",
    filePath: "/tmp/spec.md",
    mimeType: "text/markdown"
  }));

  const history = repository.listCardHistory(card.id);
  expect(attachment?.label).toBe("Spec");
  expect(repository.listCardAttachments(card.id)).toHaveLength(1);
  expect(repository.getStoryMapSnapshot(storyMap.id)?.cardAttachments).toHaveLength(1);
  expect(history).toHaveLength(2);
  expect(history[0]?.snapshot.title).toBe("Updated activity");
  expect(history[1]?.snapshot.version).toBe(3);
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteCardAttachment(card.id, attachment!.id))).toBe(true);
  expect(repository.listCardAttachments(card.id)).toHaveLength(0);
}

function testMarksApprovedChangesetsAsConflictWhenCardBaseVersionChanged() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "ChangeSet Conflict Test" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Map" }));
  const card = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: storyMap.id, level: "activity", title: "Activity" }));
  const changeSet = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createChangeSet({
    id: randomUUID(),
    projectId: project.id,
    title: "Conflicting update",
    source: "ai",
    status: "proposed",
    operations: [{
      operationId: "fixture-operation-6", op: "update",
      entity: "card",
      entityId: card.id,
      after: { description: "AI proposal" },
      baseVersion: 999
    }],
    createdAt: new Date().toISOString()
  }));

  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(card.id, { description: "Human edit" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateChangeSetStatus(changeSet.id, "approved"));

  expect(() => {
    try {
      new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.applyChangeSet(changeSet.id));
    } catch (error) {
      if (error instanceof ChangeSetConflictError) new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateChangeSetStatus(error.changeSetId, "conflict"));
      throw error;
    }
  }).toThrow("conflicts with newer changes");
  expect(repository.getChangeSet(changeSet.id)?.status).toBe("conflict");
}

function testListsEveryStaleCardOfAChangeSetInOneConflictAnd() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-db-"));
  const repository = new StoryMapperRepository(new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite"))));
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: tx }) => tx.createProject({ name: "ChangeSet All Conflicts" }));
  const storyMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: tx }) => tx.createStoryMap({ projectId: project.id, name: "Map" }));
  const [first, second, fresh] = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: tx }) => ["A", "B", "C"].map((title) => tx.createCard({ storyMapId: storyMap.id, level: "story", title })));
  const changeSet = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: tx }) => tx.createChangeSet({
    id: randomUUID(), projectId: project.id, title: "Three updates", source: "ai", status: "proposed", createdAt: new Date().toISOString(),
    operations: [first!, second!, fresh!].map((card) => ({ operationId: `fixture-update-${card.id}`, op: "update" as const, entity: "card" as const, entityId: card.id, after: { description: "AI" }, baseVersion: card.version }))
  }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: tx }) => { tx.updateCard(first!.id, { description: "Human A" }); tx.updateCard(second!.id, { description: "Human B" }); });
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: tx }) => tx.updateChangeSetStatus(changeSet.id, "approved"));
  let conflict: ChangeSetConflictError | undefined;
  try { new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: tx }) => tx.applyChangeSet(changeSet.id)); } catch (error) { conflict = error as ChangeSetConflictError; }
  expect(conflict?.conflicts?.map(({ id }) => id)).toEqual([first!.id, second!.id]);
  expect(repository.getCardDetails(fresh!.id)?.description).toBe("");
}

function importHierarchyItems(): Parameters<StoryMapperRepository<"transaction">["createWorkItemImportPlan"]>[0]["items"] {
  return [{
  remoteId: "1",
  remoteNumber: 1,
  title: "Checkout epic",
  body: "Epic body",
  url: "https://github.com/owner/repo/issues/1",
  state: "open",
  labels: [],
  issueType: "Epic"
}, {
  remoteId: "2",
  remoteNumber: 2,
  title: "Payment feature",
  body: "Feature body",
  url: "https://github.com/owner/repo/issues/2",
  state: "open",
  labels: ["Feature"],
  parentNumber: 1
}, {
  remoteId: "3",
  remoteNumber: 3,
  title: "Pay by card",
  body: "Story body",
  url: "https://github.com/owner/repo/issues/3",
  state: "open",
  labels: ["customer", "status:active", "local-story-map"],
  parentNumber: 2,
  milestone: "MVP",
  milestoneDueOn: "2026-08-15T00:00:00Z",
  assignee: "alex"
}];
}
