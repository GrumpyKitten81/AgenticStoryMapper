import { randomUUID } from "node:crypto";
import { DatabaseHandle, UnitOfWork, type SqliteDatabase } from "@storymapper/db";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

export const MIGRATION_ACTOR = { actorType: "human", actorId: "migration-fixture" } as const;
type Repository = StoryMapperRepository<"transaction">;

function populateDefinitions(repository: Repository, projectId: string, storyMapId: string, cardId: string): void {
  const persona = repository.createPersona({ projectId, storyMapId, name: "Planner", role: "Planning", goals: ["Retain exact values"], pains: ["Lost history"] });
  repository.setCardPersona(cardId, persona.id);
  const annotation = repository.createAnnotation({ projectId, storyMapId, name: "Preserved" });
  repository.setCardAnnotation(cardId, annotation.id);
  repository.createStoryTemplate({ projectId, storyMapId, name: "Template" });
  repository.upsertProductContext({ projectId, storyMapId, purpose: "Migration verification", keyFeatures: ["Versioned JSON"] });
  const roadmap = repository.createRoadmap({ projectId, storyMapId, name: "Roadmap" });
  const column = repository.listRoadmapColumns(roadmap.id)[0]!;
  const lane = repository.listRoadmapSwimlanes(roadmap.id)[0]!;
  const roadmapCard = repository.createRoadmapCard({ roadmapId: roadmap.id, columnId: column.id, swimlaneId: lane.id, title: "Preserved", labels: ["planned"] });
  repository.createRoadmapReference({ roadmapCardId: roadmapCard.id, targetType: "card", targetId: cardId });
}

function populateSync(repository: Repository, projectId: string, storyMapId: string, cardId: string): void {
  const connection = repository.createConnectorConnection({ projectId, provider: "github", name: "Fixture", owner: "migration", repository: "fixture", authMode: "token" });
  const ref = repository.createGitHubLink({ cardId, repo: "migration/fixture", issueNumber: 1, url: "https://github.com/migration/fixture/issues/1" });
  repository.upsertRemoteWorkItemLink({ connectionId: connection.id, externalRefId: ref.id, labels: ["preserved"], managedLabels: ["preserved"] });
  const run = repository.createSyncRun({ storyMapId, connectionId: connection.id, mode: "sync", status: "applied" });
  repository.createSyncConflict({ externalRefId: ref.id, syncRunId: run.id, connectionId: connection.id, cardId, remoteId: "1", field: "title", localValue: null, remoteValue: { title: "Remote" } });
  repository.db.$client.prepare("INSERT INTO card_github_evidence (id, card_id, external_ref_id) VALUES (?, ?, ?)").run(randomUUID(), cardId, ref.id);
  repository.saveRemotePushPlan({ id: randomUUID(), actor: MIGRATION_ACTOR, projectId, storyMapId, connectionId: connection.id,
    epoch: repository.getSafetySettings(projectId).epoch!, createdAt: new Date().toISOString(), selection: { cardIds: [cardId] },
    localFingerprint: "local", connectionFingerprint: "connection", safetyFingerprint: "safety", remoteFingerprint: "remote",
    remoteEvidence: { issueTypes: [], labels: [], writable: true, milestones: [] }, items: [], exclusions: [], blockers: [] });
}

export function populateMigrationDatabase(database: SqliteDatabase): { projectId: string; storyMapId: string; cardId: string } {
  const handle = new DatabaseHandle(database);
  const ids = new UnitOfWork(handle).run(MIGRATION_ACTOR, ({ repository }) => {
    const project = repository.createProject({ name: "Persisted migration fixture" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const release = repository.createRelease({ storyMapId: map.id, name: "Release" });
    const first = repository.createCard({ storyMapId: map.id, level: "story", title: "Preserved Card", releaseId: release.id });
    const second = repository.createCard({ storyMapId: map.id, level: "story", title: "Prerequisite" });
    repository.mutateCardDependency(first.id, second.id, true);
    repository.createCardAttachment(first.id, { label: "Fixture attachment", filePath: "attachments/fixture.txt" });
    const document = repository.importSourceDocument({ projectId: project.id, title: "Fixture source", type: "txt", content: "Preserved source", parsedChunks: [{ locator: "paragraph#1", text: "Preserved source" }], fileHash: "a".repeat(64) });
    repository.createCardSourceLink(first.id, { kind: "chunk", chunkId: document.chunks[0]!.id });
    repository.createCardSourceLink(first.id, { kind: "note", note: "Exact retained note" });
    populateDefinitions(repository, project.id, map.id, first.id);
    populateSync(repository, project.id, map.id, first.id);
    repository.requestCardReview(project.id, first.id);
    repository.setExternalRef({ entityType: "card", entityId: first.id, system: "fixture", externalId: "planning-card-1" });
    repository.capturePlanState(map.id);
    repository.createChangeSet({ id: randomUUID(), projectId: project.id, title: "Historical byte evidence", source: "mcp", status: "applied", operations: [], createdAt: new Date().toISOString() });
    return { projectId: project.id, storyMapId: map.id, cardId: first.id };
  });
  database.$client.prepare("UPDATE change_sets SET status = 'applied', operations_schema_version = 1, operations_json = ?").run("[ ]");
  return ids;
}
