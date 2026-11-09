import { randomUUID } from "node:crypto";
import { hashText } from "@storymapper/db/repositories/repository-values";
import type { SqliteDatabase } from "@storymapper/db/connection";
import type { UnitOfWork } from "@storymapper/db/unit-of-work";

export const archiveDemoSecrets = ["fixture-secret-connection", "fixture-secret-remote-link", "fixture-secret-github-link", "fixture-secret-sync-run", "fixture-secret-sync-conflict"];
export const archiveBusinessTables = ["releases", "roadmaps", "roadmap_columns", "roadmap_swimlanes", "roadmap_cards", "roadmap_references", "annotations", "workflow_statuses", "story_templates", "change_sets", "card_versions", "card_personas", "card_annotations", "card_source_links"];
export const archiveDemoActor = { actorType: "agent", actorId: "archive-demo-agent", mcpSessionId: "archive-demo-session" } as const;

export function populateArchiveDemo(work: UnitOfWork, projectId: string, storyMapId: string, cardId: string): void {
  work.run(archiveDemoActor, ({ repository }) => {
    const release = repository.createRelease({ storyMapId, name: "Portable release", goal: "Retain business data" });
    repository.updateCard(cardId, { releaseId: release.id, description: "Attributed business edit" });
    const annotation = repository.createAnnotation({ projectId, storyMapId, name: "Portable annotation" });
    repository.setCardAnnotation(cardId, annotation.id);
    repository.createWorkflowStatus({ projectId, storyMapId, name: "Portable status", group: "active" });
    repository.createStoryTemplate({ projectId, storyMapId, name: "Portable template", descriptionTemplate: "Retained template" });
    const content = "Portable inline content";
    const inline = repository.importSourceDocument({ projectId, title: "Inline demo document", type: "txt", content, parsedChunks: [{ locator: "paragraph#1", text: content }], fileHash: hashText(content), filePath: "inline://portable-demo" });
    repository.createCardSourceLink(cardId, { kind: "chunk", chunkId: inline.chunks[0]!.id });
    const roadmap = repository.createRoadmap({ projectId, storyMapId, name: "Portable roadmap" });
    const roadmapCard = repository.createRoadmapCard({ roadmapId: roadmap.id, columnId: repository.listRoadmapColumns(roadmap.id)[0]!.id, swimlaneId: repository.listRoadmapSwimlanes(roadmap.id)[0]!.id, title: "Portable roadmap card", details: "Retained details", labels: ["demo"] });
    repository.createRoadmapReference({ roadmapCardId: roadmapCard.id, targetType: "release", targetId: release.id });
    repository.createChangeSet({ id: randomUUID(), projectId, title: "Portable proposal", source: "mcp", status: "proposed", operations: [{ operationId: "fixture-operation-1", op: "update", entity: "card", entityId: cardId, baseVersion: repository.getCard(cardId)!.version, after: { title: "Proposed demo title" } }], createdAt: new Date().toISOString() });
    const connection = repository.createConnectorConnection({ projectId, provider: "github", authMode: "token", name: archiveDemoSecrets[0]!.repeat(500), owner: "demo", repository: "fixture" });
    repository.saveRemotePushPlan({ id: randomUUID(), actor: archiveDemoActor, projectId, storyMapId, connectionId: connection.id,
      epoch: repository.getSafetySettings(projectId).epoch!, createdAt: new Date().toISOString(), selection: { cardIds: [cardId] },
      localFingerprint: "archive-plan", connectionFingerprint: "archive-plan", safetyFingerprint: "archive-plan", remoteFingerprint: "archive-plan",
      remoteEvidence: { issueTypes: [], labels: [], writable: false, milestones: [] }, items: [], exclusions: [], blockers: ["Archive evidence only"] });
    const owned = repository.createGitHubLink({ cardId, repo: "demo/fixture", issueNumber: 2, url: "https://github.com/demo/fixture/issues/2" });
    repository.upsertRemoteWorkItemLink({ connectionId: connection.id, externalRefId: owned.id, labels: [], titleHash: archiveDemoSecrets[1]! });
    const issue = repository.createGitHubLink({ releaseId: release.id, repo: `demo/${archiveDemoSecrets[2]!}`, issueNumber: 1, url: `https://github.com/demo/${archiveDemoSecrets[2]!}/issues/1` });
    repository.createCardSourceLink(cardId, { kind: "github", externalRefId: issue.id });
    const run = repository.createSyncRun({ storyMapId, connectionId: connection.id, mode: "sync", status: "failed", summary: archiveDemoSecrets[3]! });
    repository.createSyncConflict({ externalRefId: owned.id, syncRunId: run.id, connectionId: connection.id, cardId, remoteId: "2", field: "title", localValue: archiveDemoSecrets[4]!, remoteValue: "demo-remote" });
  });
  work.run({ actorType: "human", actorId: "archive-review-fixture" }, ({ repository }) => repository.requestCardReview(projectId, cardId));
}

export function archiveBusinessRows(database: SqliteDatabase): Record<string, unknown[]> {
  return Object.fromEntries(archiveBusinessTables.map((table) => [table, database.$client.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
}
