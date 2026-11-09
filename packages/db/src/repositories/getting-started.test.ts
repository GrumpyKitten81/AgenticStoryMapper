import { initializeSampleFixture } from "@storymapper/db/fixtures/sample-story-map";
import type { Card, StoryMap, StoryMapSnapshot, Project, Persona, WorkflowStatus, Roadmap } from "@storymapper/contracts";
import { splitMarkdownIntoChunks } from "@storymapper/importers";
import { persistImportedCardFixture } from "@storymapper/db/fixtures/imported-card";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRoadmapDetails, buildSourceDocumentSummaries } from "@storymapper/core";
import { buildSourceCoverageReport } from "@storymapper/core";
import { sampleStoryMapTemplate } from "@storymapper/core";
import { hashText } from "@storymapper/db/repositories/repository-values";
import { DatabaseHandle, UnitOfWork } from "@storymapper/db";
import { openStoryMapperDb, type SqliteDatabase } from "@storymapper/db/connection";
import { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { exportStoryMap, exportAudit } from "@storymapper/server/application/export/export.use-cases";

const TEST_ACTOR = { actorType: "human", actorId: "local-user" } as const;

const pending = { createStoryMap: false, addCards: false, connectGitHub: false, export: false };
interface RepositoryFixture {
  repository: StoryMapperRepository;
  sqlite: Database.Database;
  open: () => { repository: StoryMapperRepository; sqlite: Database.Database };
  clients: Database.Database[];
  directory: string;
}
const fixtures: RepositoryFixture[] = [];

function fixture(): RepositoryFixture {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-getting-started-"));
  const path = join(directory, "storymapper.sqlite");
  const clients: Database.Database[] = [];
  const open = () => {
    const database = openStoryMapperDb(path) as SqliteDatabase & { $client: Database.Database };
    clients.push(database.$client);
    return { repository: new StoryMapperRepository(new DatabaseHandle(database)), sqlite: database.$client };
  };
  const result = { ...open(), open, clients, directory };
  fixtures.push(result);
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const item of fixtures.splice(0)) {
    for (const client of item.clients) if (client.open) client.close();
    rmSync(item.directory, { recursive: true, force: true });
  }
});

function rows(sqlite: Database.Database, table: string) {
  return sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();
}

function persistedState(sqlite: Database.Database) {
  return Object.fromEntries([
    "projects", "project_settings", "story_maps", "cards", "releases", "card_versions",
    "connector_connections", "activity_events", "personas", "workflow_statuses", "external_refs"
  ].map((table) => [table, rows(sqlite, table)]));
}

function connection(repository: StoryMapperRepository, projectId: string) {
  return new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createConnectorConnection({
    projectId, provider: "github", authMode: "token", name: "Repository", owner: "owner", repository: "repo"
  }));
}

function failCompletion(sqlite: Database.Database, column: string, projectId?: string) {
  const predicate = projectId ? ` AND NEW.project_id = '${projectId}'` : "";
  sqlite.exec(`CREATE TRIGGER fail_completion BEFORE UPDATE OF ${column} ON project_settings
    WHEN NEW.${column} = 1${predicate} BEGIN SELECT RAISE(ABORT, 'completion rejected'); END`);
}

describe("persisted getting-started checklist", () => {
  it("retains an explicitly created legacy sample hierarchy and identity across startup", testInitializesOneTemplateHierarchyWithoutCompletingItemsOrAddingCustomizations);

  it("initializes an empty Project repeatedly and preserves human content across reopen", testEmptyInitializationPreservesContent);

  it("reuses the template as an explicitly human map creation", () => {
    const { repository } = fixture();
    const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Reusable template" }));
    new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.initializeGettingStarted(project.id));
    const map = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMapFromTemplate(project.id, sampleStoryMapTemplate));
    const cards = repository.getStoryMapSnapshot(map.id)!.cards;
    expect(cards.length).toBe(sampleStoryMapTemplate.cards.length);
    cards.forEach((card) => expect(card).toMatchObject({ creationOrigin: "manual", provenance: "manual" }));
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed).toEqual({ ...pending, createStoryMap: true, addCards: true });
  });

  it("does not add a sample to an existing map or a dismissed empty Project", testDoesNotAddASampleToAnExistingMapOrA);

  it("tracks controlled human provenance and sticky completion independently for each Project", testTracksControlledHumanProvenanceAndStickyCompletionIndependentlyForEachProject);

  it("recognizes legacy evidence during initialization and retains it when deleted before the first checklist read", testRecognizesLegacyEvidenceDuringInitializationAndRetainsItWhenDeletedBefore);

  it("does not count legacy Cards, another provider or pre-generation export labels", testDoesNotCountLegacyCardsAnotherProviderOrPreGenerationExport);

  it("keeps imported and applied proposal Cards pending even with a human proposal label", testKeepsImportedAndAppliedProposalCardsPendingEvenWithAHuman);

  it("refuses a pre-column schema before changing records or privacy", testRefusesAPreColumnSchemaBeforeChangingRecordsOrPrivacy);

  it("rejects unknown Project scopes without changing data", () => {
    const { repository, sqlite } = fixture();
    new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Known" }));
    const before = persistedState(sqlite);
    const missing = randomUUID();
    expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(missing); return txRepository.getGettingStartedChecklist(missing); })).toThrow();
    expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.initializeGettingStarted(missing))).toThrow();
    expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.dismissGettingStartedChecklist(missing))).toThrow();
    expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.markExportCompleted([missing]))).toThrow();
    expect(persistedState(sqlite)).toEqual(before);
  });
});

describe("getting-started atomicity", () => {
  it("rolls back checklist initialization and retries exactly once", testRollsBackSampleInitializationAndRetriesExactlyOnce);

  registerRollsBackProjectCreationWithFailedInitializationAndPreserves();

  registerRollsBackSCreationCompletionHistoryAndAuditTogether();

  it("rolls back failed checklist initialization without changing entity data", () => {
    const { repository, sqlite } = fixture();
    const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Audit failure" }));
    const before = persistedState(sqlite);
    sqlite.exec("CREATE TRIGGER reject_audit BEFORE UPDATE OF getting_started_initialized ON project_settings BEGIN SELECT RAISE(ABORT, 'audit rejected'); END");
    expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.initializeGettingStarted(project.id))).toThrow("audit rejected");
    expect(persistedState(sqlite)).toEqual(before);
    sqlite.exec("DROP TRIGGER reject_audit");
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed).toEqual(pending);
  });

  it("commits represented-Project export completion atomically and rejects mixed invalid scopes", testCommitsRepresentedProjectExportCompletionAtomicallyAndRejectsMixedInvalidScopes);

  it("only completes generated exports after success and rolls back their own audit on persistence failure", testOnlyCompletesGeneratedExportsAfterSuccessAndRollsBackTheirOwn);

  it("rolls back audit serialization failure after inserting its own export event", testRollsBackAuditSerializationFailureAfterInsertingItsOwnExportEvent);

  it("completes a successful audit export and includes its own event in the artifact", () => {
    const { repository } = fixture();
    const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Audit export" }));
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.export).toBe(false);
    const artifact = exportAudit({ repository: repository, unitOfWork: new UnitOfWork(repository.handle) }, TEST_ACTOR, project.id, "json");
    const { events } = JSON.parse(artifact.content) as { events: { action: string }[] };
    expect(events.some((event) => event.action === "exports.auditCreated")).toBe(true);
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.export).toBe(true);
  });
});

describe("logical sample removal", () => {
  it("removes a sample without recreating an intentionally empty status table", testRemovesASampleWithoutRecreatingAnIntentionallyEmptyStatusTable);

  it("preserves customizations, settings, cross-map links and roadmap references across reopen", testPreservesCustomizationsSettingsCrossMapLinksAndRoadmapReferencesAcrossReopen);

  it("excludes hidden source links from details, counts and ratio while preserving surviving links", testExcludesHiddenSourceLinksFromDetailsCountsAndRatioWhilePreserving);

  it("ignores removed Cards in status usage while retaining visible usage rejection", testIgnoresRemovedCardsInStatusUsageWhileRetainingVisibleUsageRejection);

  it("rejects removed-map Card, Release and import writes without mutation", testRejectsRemovedMapCardReleaseAndImportWritesWithoutMutation);

  it("rejects removed-map Story Map, Annotation, Template, Roadmap and Product Context writes and hides Card details", testRejectsRemovedMapStoryMapAnnotationTemplateRoadmapAndProductContext);

  it("rejects visible foreign Releases for individual Card creation and update without mutation", testRejectsVisibleForeignReleasesForIndividualCardCreationAndUpdateWithout);

  registerRejectsSReleasesThroughCardMovementWithoutMutation();

  it.each(["hidden Card", "hidden Release"])("retains the physical Project scope of canonical Issue evidence owned by a %s", (orientation) => {
    const { repository, sqlite } = fixture();
    const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Retained link scope" }));
    const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
    const hiddenCard = repository.listCards(sample)[0]!;
    const hiddenRelease = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: sample, name: "Hidden Release" }));
    const visibleMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Visible map" }));
    const visibleCard = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: visibleMap.id, level: "activity", title: "Visible Card" }));
    const visibleRelease = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: visibleMap.id, name: "Visible Release" }));
    const otherProject = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Other Project" }));
    const otherMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: otherProject.id, name: "Other Project map" }));
    const otherCard = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: otherMap.id, level: "activity", title: "Other Project Card" }));
    const otherRelease = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: otherMap.id, name: "Other Project Release" }));
    const link = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubLink({ ...(orientation === "hidden Card" ? { cardId: hiddenCard.id } : { releaseId: hiddenRelease.id }), repo: "owner/repo", url: "https://github.com/owner/repo/issues/1" }));
    new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCardSourceLink(visibleCard.id, { kind: "github", externalRefId: link.id }));
    new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(sample));
    const before = persistedState(sqlite);
    expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateGitHubLink(link.id, orientation === "hidden Card" ? { cardId: otherCard.id } : { releaseId: otherRelease.id })))
      .toThrow(/Project/);
    expect(persistedState(sqlite)).toEqual(before);
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateGitHubLink(link.id, { url: "https://github.com/owner/repo/issues/4", issueNumber: 4 }))).toMatchObject({ id: link.id, url: "https://github.com/owner/repo/issues/4", syncState: "unsynced" });
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteGitHubLink(link.id))).toBe(true);
  });

  it("keeps canonical hidden-owner evidence operable and validates every newly supplied target before writes", testKeepsCanonicalHiddenOwnerEvidenceOperableAndValidatesEveryNewlySupplied);
});

function registerRollsBackSCreationCompletionHistoryAndAuditTogether() {
  it.each(["map", "card", "connection"] as const)("rolls back %s creation, completion, history and audit together", (kind) => {
    const { repository, sqlite } = fixture();
    const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Atomic creation" }));
    const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
    const columns = { map: "completed_story_map", card: "completed_cards", connection: "completed_github" };
    const before = persistedState(sqlite);
    failCompletion(sqlite, columns[kind]);
    const create = () => {
      if (kind === "map") return new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Atomic map" }));
      if (kind === "card") return new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: sample, level: "activity", title: "Atomic Card" }, "human"));
      return connection(repository, project.id);
    };
    expect(create).toThrow("completion rejected");
    expect(persistedState(sqlite)).toEqual(before);
    sqlite.exec("DROP TRIGGER fail_completion");
    expect(create()).toBeDefined();
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed).toEqual({
      ...pending, [kind === "map" ? "createStoryMap" : kind === "card" ? "addCards" : "connectGitHub"]: true
    });
  });
}

function registerRollsBackProjectCreationWithFailedInitializationAndPreserves() {
  it("rolls back Project creation with failed initialization and preserves a successful retry", () => {
    const { repository, sqlite } = fixture();
    const before = persistedState(sqlite);
    sqlite.exec("CREATE TRIGGER reject_project_sample BEFORE UPDATE OF getting_started_initialized ON project_settings BEGIN SELECT RAISE(ABORT, 'sample rejected'); END");
    expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Atomic Project" }))).toThrow("sample rejected");
    expect(persistedState(sqlite)).toEqual(before);
    sqlite.exec("DROP TRIGGER reject_project_sample");
    const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Atomic Project" }));
    expect(repository.listProjects()).toEqual([project]);
    expect(repository.listStoryMaps(project.id)).toHaveLength(0);
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed).toEqual(pending);
  });
}

function registerRejectsSReleasesThroughCardMovementWithoutMutation() {
  it.each(["hidden", "visible foreign"])("rejects %s Releases through Card movement without mutation", (visibility) => {
    const { repository, sqlite } = fixture();
    const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Move Release validation" }));
    const map = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Target map" }));
    const foreignMapId = visibility === "hidden" ? new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!
      : new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Foreign map" })).id;
    const release = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: foreignMapId, name: "Rejected Release" }));
    const card = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: map.id, level: "activity", title: "Target Card" }));
    if (visibility === "hidden") new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(foreignMapId));
    const before = persistedState(sqlite);
    expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.moveCard(card.id, { parentId: null, position: 0, releaseId: release.id }))).toThrow();
    expect(persistedState(sqlite)).toEqual(before);
  });
}

function testEmptyInitializationPreservesContent() {
    const { repository, open } = fixture();
    const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository }) => repository.createProjectWithGettingStarted({ name: "Empty first map" }));
    expect(repository.listStoryMaps(project.id)).toEqual([]);
    expect(repository.getGettingStartedChecklist(project.id)).toMatchObject({ initialized: true, sampleStoryMapId: null, completed: pending });
    const map = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository }) => repository.createStoryMap({ projectId: project.id, name: "My map" }));
    const card = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository }) => repository.createCard({ storyMapId: map.id, level: "activity", title: "My Activity" }));
    const reopened = open().repository;
    new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository }) => { repository.ensureSeedData(); repository.initializeGettingStarted(project.id); });
    expect(reopened.listStoryMaps(project.id)).toEqual([map]);
    expect(reopened.getStoryMapSnapshot(map.id)!.cards).toEqual([card]);
    expect(reopened.getGettingStartedChecklist(project.id).sampleStoryMapId).toBeNull();
}

function testInitializesOneTemplateHierarchyWithoutCompletingItemsOrAddingCustomizations() {
  const { repository, sqlite, open } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Fresh project" }));
  const personas = rows(sqlite, "personas");
  const statuses = rows(sqlite, "workflow_statuses");
  const checklist = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id));
  expect(checklist).toMatchObject({ projectId: project.id, initialized: true, dismissed: false, completed: pending });
  expect(checklist.sampleStoryMapId).toEqual(expect.any(String));
  const snapshot = repository.getStoryMapSnapshot(checklist.sampleStoryMapId!);
  const activity = snapshot!.cards.find((card) => card.level === "activity")!;
  const step = snapshot!.cards.find((card) => card.level === "step")!;
  const story = snapshot!.cards.find((card) => card.level === "story")!;
  expect(step.parentId).toBe(activity.id);
  expect(story.parentId).toBe(step.id);
  snapshot!.cards.forEach((card) => expect(card).toMatchObject({ creationOrigin: "inference", provenance: "inference" }));
  expect(snapshot!.cards.map((card) => card.title).sort()).toEqual(sampleStoryMapTemplate.cards.map((card) => card.title).sort());
  expect(rows(sqlite, "personas")).toEqual(personas);
  expect(rows(sqlite, "workflow_statuses")).toEqual(statuses);
  expect(sqlite.prepare("SELECT DISTINCT creation_source FROM cards").all()).toEqual([{ creation_source: "template" }]);
  sqlite.close();
  const reopened = open().repository;
  new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.ensureSeedData());
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); })).toEqual(checklist);
  expect(reopened.listStoryMaps(project.id)).toHaveLength(1);
}

function testDoesNotAddASampleToAnExistingMapOrA() {
  const { repository, sqlite, open } = fixture();
  const existing = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Existing project" }));
  const map = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: existing.id, name: "Existing map" }));
  const before = rows(sqlite, "story_maps");
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(existing.id); return txRepository.getGettingStartedChecklist(existing.id); })).toMatchObject({
    sampleStoryMapId: null, completed: { ...pending, createStoryMap: true }
  });
  expect(rows(sqlite, "story_maps")).toEqual(before);
  const dismissed = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Dismissed project" }));
  sqlite.prepare("UPDATE project_settings SET getting_started_dismissed = 1 WHERE project_id = ?").run(dismissed.id);
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(dismissed.id); return txRepository.getGettingStartedChecklist(dismissed.id); })).toMatchObject({ dismissed: true, sampleStoryMapId: null });
  expect(repository.listStoryMaps(dismissed.id)).toEqual([]);
  sqlite.close();
  const reopened = open().repository;
  new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.ensureSeedData());
  expect(reopened.listStoryMaps(existing.id)).toEqual([map]);
  expect(reopened.listStoryMaps(dismissed.id)).toEqual([]);
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(dismissed.id); return txRepository.getGettingStartedChecklist(dismissed.id); }).dismissed).toBe(true);
}

function testTracksControlledHumanProvenanceAndStickyCompletionIndependentlyForEachProject() {
  const { repository, sqlite, open } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Progress" }));
  const other = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Other project" }));
  const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(other.id); return txRepository.getGettingStartedChecklist(other.id); });
  for (const source of ["unknown", "template", "import", "ai", "mcp"] as const) {
    new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: sample, level: "activity", title: source }, source));
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.addCards).toBe(false);
  }
  const human = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: sample, level: "activity", title: "Human addition" }, "human"));
  const map = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Human map" }));
  const github = connection(repository, project.id);
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.markExportCompleted([project.id]));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.dismissGettingStartedChecklist(project.id));
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); })).toMatchObject({ dismissed: true, completed: {
    createStoryMap: true, addCards: true, connectGitHub: true, export: true
  } });
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteCard(human.id, { strategy: "unassign" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteConnectorConnection(github.id));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(map.id));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(sample));
  sqlite.close();
  const reopened = open().repository;
  new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.ensureSeedData());
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); })).toMatchObject({ sampleStoryMapId: sample, dismissed: true,
    completed: { createStoryMap: true, addCards: true, connectGitHub: true, export: true } });
  expect(reopened.listStoryMaps(project.id)).toEqual([]);
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(other.id); return txRepository.getGettingStartedChecklist(other.id); }).completed).toEqual(pending);
}

function testRecognizesLegacyEvidenceDuringInitializationAndRetainsItWhenDeletedBefore() {
  const { repository, sqlite, open } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Recognition" }));
  const mapId = randomUUID();
  const cardId = randomUUID();
  const connectionId = randomUUID();
  const timestamp = new Date().toISOString();
  sqlite.prepare("INSERT INTO story_maps (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(mapId, project.id, "Raw map", timestamp, timestamp);
  sqlite.prepare("INSERT INTO cards (id, story_map_id, key, level, title, position, creation_source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(cardId, mapId, "LSM-1", "activity", "Raw known human", 0, "human", timestamp, timestamp);
  sqlite.prepare("INSERT INTO connector_connections (id, project_id, provider, name, auth_mode, owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(connectionId, project.id, "github", "Raw connection", "token", "owner", timestamp, timestamp);
  expect(sqlite.prepare("SELECT completed_story_map, completed_cards, completed_github FROM project_settings WHERE project_id = ?")
    .get(project.id)).toEqual({ completed_story_map: 0, completed_cards: 0, completed_github: 0 });
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.initializeGettingStarted(project.id));
  expect(sqlite.prepare("SELECT completed_story_map, completed_cards, completed_github, completed_export FROM project_settings WHERE project_id = ?")
    .get(project.id)).toEqual({ completed_story_map: 1, completed_cards: 1, completed_github: 1, completed_export: 0 });
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteCard(cardId, { strategy: "unassign" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteConnectorConnection(connectionId));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(mapId));
  const checklist = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); });
  expect(checklist).toMatchObject({ sampleStoryMapId: null, completed: {
    createStoryMap: true, addCards: true, connectGitHub: true, export: false
  } });
  sqlite.close();
  expect(new UnitOfWork(open().repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); })).toEqual(checklist);
}

function testDoesNotCountLegacyCardsAnotherProviderOrPreGenerationExport() {
  const { repository, sqlite, open } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Unknown history" }));
  const map = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Legacy map" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: map.id, level: "activity", title: "Unknown Card" }));
  const github = connection(repository, project.id);
  sqlite.prepare("UPDATE connector_connections SET provider = 'test-unsupported' WHERE id = ?").run(github.id);
  sqlite.prepare("UPDATE project_settings SET completed_github = 0 WHERE project_id = ?").run(project.id);
  const timestamp = new Date().toISOString();
  for (const action of ["exports.storyMapCreated", "exports.auditCreated", "exports.failed", "exports.unknown"]) {
    sqlite.prepare("INSERT INTO activity_events (id, project_id, actor, actor_type, action, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), project.id, "human", "human", action, timestamp);
  }
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed).toEqual({ ...pending, createStoryMap: true });
  sqlite.close();
  const reopened = open().repository;
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.export).toBe(false);
  connection(reopened, project.id);
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.connectGitHub).toBe(true);
}

function testKeepsImportedAndAppliedProposalCardsPendingEvenWithAHuman() {
  const { repository } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Generated provenance" }));
  const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
  const github = connection(repository, project.id);
  const imported = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => persistImportedCardFixture(txRepository, { storyMapId: sample, level: "story", title: "Imported requirement", description: "Source requirement", status: "todo" }, github.id, "https://github.com/owner/repo/issues/1"));
  expect(imported).toMatchObject({ creationOrigin: "inference", provenance: "linked" });
  expect(repository.listCards(sample).find((card) => card.title === "Imported requirement")).toMatchObject({ creationOrigin: "inference" });
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.addCards).toBe(false);
  for (const source of ["ai", "mcp", "import", "human"] as const) {
    const proposal = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createChangeSet({ id: randomUUID(), projectId: project.id,
      title: `Proposal ${source}`, source, status: "proposed", createdAt: new Date().toISOString(),
      operations: [{ operationId: "fixture-operation-1", op: "create", entity: "card", entityId: "proposed-card", after: {
        storyMapId: sample, level: "activity", title: `Generated ${source}`
      } }]
    }));
    new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateChangeSetStatus(proposal.id, "approved"));
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.applyChangeSet(proposal.id))?.status).toBe("applied");
    expect(repository.listCards(sample).find((card) => card.title === `Generated ${source}`)).toMatchObject({ creationOrigin: "inference", provenance: "inference" });
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.addCards).toBe(false);
  }
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: sample, level: "activity", title: "Explicit human" }, "human"));
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.addCards).toBe(true);
}

function testRefusesAPreColumnSchemaBeforeChangingRecordsOrPrivacy() {
  const { repository, sqlite, open } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Legacy upgrade" }));
  const map = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Legacy map" }));
  const card = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: map.id, level: "activity", title: "Legacy Card" }, "human"));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateSafetySettings(project.id, { github: true }));
  for (const column of ["getting_started_initialized", "getting_started_dismissed", "sample_story_map_id", "completed_story_map", "completed_cards", "completed_github", "completed_export"]) {
    sqlite.exec(`ALTER TABLE project_settings DROP COLUMN ${column}`);
  }
  sqlite.exec("ALTER TABLE story_maps DROP COLUMN deleted");
  sqlite.exec("ALTER TABLE cards DROP COLUMN creation_source");
  expect(sqlite.prepare("PRAGMA table_info(project_settings)").all()).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "getting_started_initialized" })
  ]));
  sqlite.close();
  expect(() => open()).toThrow("inconsistent schema");
}

function testRollsBackSampleInitializationAndRetriesExactlyOnce() {
  const { repository, sqlite } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProject({ name: "Atomic sample" }));
  const before = persistedState(sqlite);
  sqlite.exec("CREATE TRIGGER reject_sample_card BEFORE UPDATE OF getting_started_initialized ON project_settings BEGIN SELECT RAISE(ABORT, 'sample rejected'); END");
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.initializeGettingStarted(project.id))).toThrow("sample rejected");
  expect(persistedState(sqlite)).toEqual(before);
  sqlite.exec("DROP TRIGGER reject_sample_card");
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.initializeGettingStarted(project.id));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.initializeGettingStarted(project.id));
  expect(repository.listStoryMaps(project.id)).toHaveLength(0);
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed).toEqual(pending);
}

function testCommitsRepresentedProjectExportCompletionAtomicallyAndRejectsMixedInvalidScopes() {
  const { repository, sqlite, open } = fixture();
  const first = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "First archive Project" }));
  const second = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Second archive Project" }));
  const before = persistedState(sqlite);
  failCompletion(sqlite, "completed_export", second.id);
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.markExportCompleted([first.id, second.id]))).toThrow("completion rejected");
  expect(persistedState(sqlite)).toEqual(before);
  sqlite.exec("DROP TRIGGER fail_completion");
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.markExportCompleted([first.id, randomUUID()]))).toThrow();
  expect(persistedState(sqlite)).toEqual(before);
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.markExportCompleted([first.id, second.id]));
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(first.id); return txRepository.getGettingStartedChecklist(first.id); }).completed.export).toBe(true);
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(second.id); return txRepository.getGettingStartedChecklist(second.id); }).completed.export).toBe(true);
  sqlite.close();
  const reopened = open().repository;
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(first.id); return txRepository.getGettingStartedChecklist(first.id); }).completed.export).toBe(true);
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(second.id); return txRepository.getGettingStartedChecklist(second.id); }).completed.export).toBe(true);
}

function testOnlyCompletesGeneratedExportsAfterSuccessAndRollsBackTheirOwn() {
  const { repository, sqlite } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Export completion" }));
  const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
  expect(() => exportStoryMap({ repository, unitOfWork: new UnitOfWork(repository.handle) }, TEST_ACTOR, randomUUID(), "json")).toThrow(expect.objectContaining({ code: "not_found" }));
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.export).toBe(false);
  const before = persistedState(sqlite);
  failCompletion(sqlite, "completed_export");
  expect(() => exportStoryMap({ repository: repository, unitOfWork: new UnitOfWork(repository.handle) }, TEST_ACTOR, sample, "json")).toThrow("completion rejected");
  expect(persistedState(sqlite)).toEqual(before);
  expect(() => exportAudit({ repository: repository, unitOfWork: new UnitOfWork(repository.handle) }, TEST_ACTOR, project.id, "json")).toThrow("completion rejected");
  expect(persistedState(sqlite)).toEqual(before);
  sqlite.exec("DROP TRIGGER fail_completion");
  const artifact = exportStoryMap({ repository: repository, unitOfWork: new UnitOfWork(repository.handle) }, TEST_ACTOR, sample, "json")!;
  expect(JSON.parse(artifact.content).snapshot.cards.map((card: { title: string }) => card.title).sort())
    .toEqual(sampleStoryMapTemplate.cards.map((card) => card.title).sort());
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.export).toBe(true);
}

function testRollsBackAuditSerializationFailureAfterInsertingItsOwnExportEvent() {
  const { repository, sqlite } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Audit serialization failure" }));
  const before = persistedState(sqlite);
  const serialize = JSON.stringify;
  let eventInsertedBeforeFailure = false;
  vi.spyOn(JSON, "stringify").mockImplementation((value: unknown) => {
    if (typeof value === "object" && value !== null && "events" in value && "exportedAt" in value) {
      eventInsertedBeforeFailure = repository.listActivity(project.id).some((event) => event.action === "exports.auditCreated");
      throw new Error("Audit serialization failed.");
    }
    return serialize(value);
  });
  expect(() => exportAudit({ repository: repository, unitOfWork: new UnitOfWork(repository.handle) }, TEST_ACTOR, project.id, "json")).toThrow("Audit serialization failed.");
  expect(eventInsertedBeforeFailure).toBe(true);
  expect(persistedState(sqlite)).toEqual(before);
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => { txRepository.initializeGettingStarted(project.id); return txRepository.getGettingStartedChecklist(project.id); }).completed.export).toBe(false);
  expect(repository.listActivity(project.id).some((event) => event.action === "exports.auditCreated")).toBe(false);
}

function testRemovesASampleWithoutRecreatingAnIntentionallyEmptyStatusTable() {
  const { repository, sqlite, open } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Empty statuses" }));
  const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
  sqlite.exec("DELETE FROM workflow_statuses");
  const settings = rows(sqlite, "project_settings");
  const personas = rows(sqlite, "personas");
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(sample))).toBe(true);
  expect(rows(sqlite, "workflow_statuses")).toEqual([]);
  expect(rows(sqlite, "project_settings")).toEqual(settings);
  expect(rows(sqlite, "personas")).toEqual(personas);
  sqlite.close();
  const reopened = open();
  new UnitOfWork(reopened.repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.ensureSeedData());
  expect(rows(reopened.sqlite, "workflow_statuses")).toEqual([]);
  expect(reopened.repository.listStoryMaps(project.id)).toEqual([]);
}

function testPreservesCustomizationsSettingsCrossMapLinksAndRoadmapReferencesAcrossReopen() {
  const { repository, sqlite, open } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Deletion preservation" }));
  const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
  const other = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Surviving map" }));
  const sampleCard = repository.listCards(sample)[0]!;
  const otherCard = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: other.id, level: "activity", title: "Surviving Card" }));
  const sampleRelease = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: sample, name: "Sample release" }));
  const otherRelease = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: other.id, name: "Surviving release" }));
  const personas = [null, sample, other.id].map((storyMapId, index) => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createPersona({
    projectId: project.id, ...(storyMapId ? { storyMapId } : {}), name: `Persona ${index}`, role: "User"
  })));
  const sampleStatus = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createWorkflowStatus({ projectId: project.id, storyMapId: sample, name: "Sample status", group: "todo" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createWorkflowStatus({ projectId: project.id, storyMapId: other.id, name: "Surviving status", group: "todo" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateSafetySettings(project.id, { agentMode: "propose" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubLink({ cardId: otherCard.id, repo: "owner/repo", url: "https://github.com/owner/repo/issues/1" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubLink({ cardId: sampleCard.id, repo: "owner/repo", url: "https://github.com/owner/repo/issues/2" }));
  const roadmap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRoadmap({ projectId: project.id, storyMapId: other.id, name: "Surviving roadmap" }));
  const roadmapCard = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRoadmapCard({ roadmapId: roadmap.id, columnId: buildRoadmapDetails(repository.getRoadmapDetailsData(roadmap.id))!.columns[0]!.id, title: "References" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRoadmapReference({ roadmapCardId: roadmapCard.id, targetType: "card", targetId: sampleCard.id }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRoadmapReference({ roadmapCardId: roadmapCard.id, targetType: "release", targetId: sampleRelease.id }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.upsertProductContext({ projectId: project.id, storyMapId: other.id, purpose: "Retained context" }));
  const retainedTables = ["project_settings", "personas", "workflow_statuses", "cards", "releases", "external_refs", "roadmaps", "roadmap_cards", "roadmap_references"];
  const before = Object.fromEntries(retainedTables.map((table) => [table, rows(sqlite, table)]));
  const otherSnapshot = repository.getStoryMapSnapshot(other.id);
  const projectPersonas = repository.listPersonasForProject(project.id);
  const scopedPersonas = repository.listPersonas(project.id, sample);
  const scopedStatuses = repository.listWorkflowStatuses(project.id, sample);
  exerciseTestPreservesCustomizationsSettingsCrossMapLinksAndRoadmapReferencesAcrossReopen(repository, sample, retainedTables, sqlite, before, sampleCard, other, otherSnapshot, project, open, projectPersonas, scopedPersonas, scopedStatuses, roadmap, personas, sampleStatus);
}

function exerciseTestPreservesCustomizationsSettingsCrossMapLinksAndRoadmapReferencesAcrossReopen(repository: StoryMapperRepository<"root">, sample: string, retainedTables: string[], sqlite: Database.Database, before: { [k: string]: unknown[]; }, sampleCard: Card, other: StoryMap, otherSnapshot: StoryMapSnapshot | undefined, project: Project, open: () => { repository: StoryMapperRepository; sqlite: Database.Database; }, projectPersonas: Persona[], scopedPersonas: Persona[], scopedStatuses: WorkflowStatus[], roadmap: Roadmap, personas: Persona[], sampleStatus: WorkflowStatus) {
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(sample))).toBe(true);
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(sample))).toBe(false);
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(randomUUID()))).toBe(false);
  expect(Object.fromEntries(retainedTables.map((table) => [table, rows(sqlite, table)]))).toEqual(before);
  expect(repository.getStoryMapSnapshot(sample)).toBeUndefined();
  expect(repository.listCards(sample)).toEqual([]);
  expect(repository.listReleases(sample)).toEqual([]);
  expect(repository.getCardDetails(sampleCard.id)).toBeUndefined();
  expect(repository.getStoryMapSnapshot(other.id)).toEqual(otherSnapshot);
  expect(repository.listStoryMaps(project.id)).toEqual([otherSnapshot!.storyMap]);
  sqlite.close();
  const reopened = open().repository;
  new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.ensureSeedData());
  expect(reopened.listStoryMaps(project.id)).toEqual([otherSnapshot!.storyMap]);
  expect(reopened.listPersonasForProject(project.id)).toEqual(projectPersonas);
  expect(reopened.listPersonas(project.id, sample)).toEqual(scopedPersonas);
  expect(reopened.listWorkflowStatuses(project.id, sample)).toEqual(scopedStatuses);
  expect(buildRoadmapDetails(reopened.getRoadmapDetailsData(roadmap.id))!.references).toHaveLength(2);
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updatePersona(personas[1]!.id, { role: "Editor" }))?.storyMapId).toBe(sample);
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateWorkflowStatus(sampleStatus.id, { color: "#123456" }))?.storyMapId).toBe(sample);
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deletePersona(personas[1]!.id, { definitionBefore: txRepository.getPersona(personas[1]!.id)!, affectedCards: [] }))).toBe(true);
  expect(new UnitOfWork(reopened.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteWorkflowStatus(sampleStatus.id, { definitionBefore: txRepository.getWorkflowStatus(sampleStatus.id)!, affectedCards: [] }))).toBe(true);
}

function testExcludesHiddenSourceLinksFromDetailsCountsAndRatioWhilePreserving() {
  const { repository, sqlite, open } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Source preservation" }));
  const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
  const other = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Surviving source map" }));
  const sampleCard = repository.listCards(sample)[0]!;
  const otherCard = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: other.id, level: "activity", title: "Surviving source Card" }));
  const content = "# First\n\nFirst requirement.\n\n# Second\n\nSecond requirement.";
  const imported = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.importSourceDocument({ parsedChunks: splitMarkdownIntoChunks(content), projectId: project.id, title: "Source", type: "markdown", content, fileHash: hashText(content) }));
  const first = imported.chunks[0]!.id;
  const second = imported.chunks[1]!.id;
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCardSourceLink(sampleCard.id, { kind: "chunk", chunkId: first }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCardSourceLink(sampleCard.id, { kind: "chunk", chunkId: second }));
  const surviving = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCardSourceLink(otherCard.id, { kind: "chunk", chunkId: second }))!;
  const links = rows(sqlite, "card_source_links");
  expect(buildSourceCoverageReport(project.id, buildSourceDocumentSummaries(repository.listSourceDocumentSummaryData(project.id)))).toMatchObject({ totalChunks: 2, linkedChunks: 2, coverageRatio: 1 });
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(sample));
  expect(rows(sqlite, "card_source_links")).toEqual(links);
  const verifyCoverage = (current: StoryMapperRepository) => {
    const details = current.getSourceDocumentDetails(imported.document.id)!;
    expect(details.links).toEqual([surviving]);
    expect(details.linkedCardsByChunkId[first]).toBeUndefined();
    expect(details.linkedCardsByChunkId[second]).toEqual([{ id: otherCard.id, key: otherCard.key, title: otherCard.title }]);
    expect(buildSourceCoverageReport(project.id, buildSourceDocumentSummaries(current.listSourceDocumentSummaryData(project.id)))).toMatchObject({ totalChunks: 2, linkedChunks: 1, coverageRatio: 0.5,
      documents: [expect.objectContaining({ chunkCount: 2, linkedChunkCount: 1, coverageRatio: 0.5 })] });
    expect(current.getStoryMapSnapshot(other.id)!.sourceLinks).toEqual([surviving]);
  };
  verifyCoverage(repository);
  sqlite.close();
  verifyCoverage(open().repository);
}

function testIgnoresRemovedCardsInStatusUsageWhileRetainingVisibleUsageRejection() {
  const { repository } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Status use" }));
  const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
  const other = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Visible map" }));
  const hiddenStatus = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createWorkflowStatus({ projectId: project.id, storyMapId: sample, name: "Hidden only", group: "todo" }));
  const visibleStatus = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createWorkflowStatus({ projectId: project.id, name: "Visible use", group: "todo" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(repository.listCards(sample)[0]!.id, { status: hiddenStatus.name }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: other.id, level: "activity", title: "Visible Card", status: visibleStatus.name }));
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteWorkflowStatus(hiddenStatus.id, { definitionBefore: hiddenStatus, affectedCards: [] }))).toThrow("still used");
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(sample));
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteWorkflowStatus(hiddenStatus.id, { definitionBefore: hiddenStatus, affectedCards: [] }))).toBe(true);
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteWorkflowStatus(visibleStatus.id))).toThrow("still used");
}

function testRejectsRemovedMapCardReleaseAndImportWritesWithoutMutation() {
  const { repository, sqlite } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Removed boundaries" }));
  const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
  const sampleCard = repository.listCards(sample)[0]!;
  const sampleRelease = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: sample, name: "Hidden release" }));
  const other = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Visible map" }));
  const otherCard = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: other.id, level: "activity", title: "Visible Card" }));
  const github = connection(repository, project.id);
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(sample));
  const before = persistedState(sqlite);
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: sample, level: "activity", title: "Rejected" }, "human"))).toThrow();
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(sampleCard.id, { title: "Rejected" }))).toBeUndefined();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: sample, name: "Rejected" }))).toThrow();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: other.id, releaseId: sampleRelease.id, level: "activity", title: "Rejected release" }))).toThrow();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(otherCard.id, { releaseId: sampleRelease.id }))).toThrow();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createWorkItemImportPlan({ storyMapId: sample, connectionId: github.id, items: [] }))).toThrow();
  expect(persistedState(sqlite)).toEqual(before);
}

function testRejectsRemovedMapStoryMapAnnotationTemplateRoadmapAndProductContext() {
  const { repository, sqlite } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Removed scoped records" }));
  const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
  const sampleCard = repository.listCards(sample)[0]!;
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(sample));
  const scoped = () => ["annotations", "story_templates", "roadmaps", "product_contexts", "story_maps"].map((table) => rows(sqlite, table));
  const before = scoped();
  expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateStoryMap(sample, { name: "Rejected" }))).toBeUndefined();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createAnnotation({ projectId: project.id, storyMapId: sample, name: "Rejected" }))).toThrow();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryTemplate({ projectId: project.id, storyMapId: sample, name: "Rejected" }))).toThrow();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRoadmap({ projectId: project.id, storyMapId: sample, name: "Rejected", type: "simple" }))).toThrow();
  expect(() => repository.getProductContext(project.id, sample)).toThrow();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.upsertProductContext({ projectId: project.id, storyMapId: sample, purpose: "Rejected" }))).toThrow();
  expect(repository.listCardHistory(sampleCard.id)).toEqual([]);
  expect(repository.listCardAttachments(sampleCard.id)).toEqual([]);
  expect(repository.listOpenSyncConflicts(sample)).toEqual([]);
  expect(scoped()).toEqual(before);
}

function testRejectsVisibleForeignReleasesForIndividualCardCreationAndUpdateWithout() {
  const { repository, sqlite } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "Visible foreign Release" }));
  const map = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Target map" }));
  const foreignMap = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Foreign map" }));
  const foreignRelease = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: foreignMap.id, name: "Foreign Release" }));
  const card = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: map.id, level: "activity", title: "Target Card" }));
  const before = persistedState(sqlite);
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: map.id, level: "activity", title: "Rejected", releaseId: foreignRelease.id }, "human"))).toThrow("another story map");
  expect(persistedState(sqlite)).toEqual(before);
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateCard(card.id, { releaseId: foreignRelease.id }))).toThrow("another story map");
  expect(persistedState(sqlite)).toEqual(before);
}

function testKeepsCanonicalHiddenOwnerEvidenceOperableAndValidatesEveryNewlySupplied() {
  const { repository, sqlite } = fixture();
  const project = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createProjectWithGettingStarted({ name: "GitHub cross-map targets" }));
  const sample = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => initializeSampleFixture(txRepository, project.id)).sampleStoryMapId!;
  const sampleCard = repository.listCards(sample)[0]!;
  const sampleRelease = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: sample, name: "Hidden release" }));
  const other = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createStoryMap({ projectId: project.id, name: "Visible map" }));
  const otherCard = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createCard({ storyMapId: other.id, level: "activity", title: "Visible Card" }));
  const otherRelease = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createRelease({ storyMapId: other.id, name: "Visible release" }));
  const links = [
    new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubLink({ cardId: otherCard.id, repo: "owner/repo", url: "https://github.com/owner/repo/issues/1" })),
    new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubLink({ cardId: sampleCard.id, repo: "owner/repo", url: "https://github.com/owner/repo/issues/2" }))
  ];
  const normal = new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubLink({ releaseId: otherRelease.id, repo: "owner/repo", url: "https://github.com/owner/repo/milestone/3" }));
  new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteStoryMap(sample));
  expect(repository.listGitHubLinksForStoryMap(other.id)).toEqual(expect.arrayContaining([links[0], normal]));
  expect(repository.listGitHubLinksForStoryMap(other.id)).not.toContainEqual(links[1]);
  const before = persistedState(sqlite);
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubLink({ cardId: otherCard.id, releaseId: sampleRelease.id, repo: "owner/repo", url: "https://example.test/rejected" }))).toThrow();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.createGitHubLink({ cardId: sampleCard.id, releaseId: otherRelease.id, repo: "owner/repo", url: "https://example.test/rejected" }))).toThrow();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateGitHubLink(normal.id, { releaseId: sampleRelease.id }))).toThrow();
  expect(() => new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateGitHubLink(normal.id, { cardId: sampleCard.id }))).toThrow();
  expect(persistedState(sqlite)).toEqual(before);
  for (const link of links) {
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.updateGitHubLink(link.id, { url: "https://github.com/owner/repo/issues/4", issueNumber: 4 }))).toMatchObject({ id: link.id, url: "https://github.com/owner/repo/issues/4", syncState: "unsynced" });
    expect(new UnitOfWork(repository.handle).run(TEST_ACTOR, ({ repository: txRepository }) => txRepository.deleteGitHubLink(link.id))).toBe(true);
  }
  expect(repository.listGitHubLinksForStoryMap(other.id)).toEqual([normal]);
}
