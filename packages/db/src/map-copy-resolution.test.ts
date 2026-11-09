import { expect, it, vi } from "vitest";
import type { ChangeOperation, OperationSnapshot } from "@storymapper/contracts";
import { resolveOperation, resolveOperations } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { storyMapCopyRows } from "@storymapper/db/repositories/map-copy-repository";

const ACTOR = { actorType: "human", actorId: "copy-golden" } as const;
const TIME = "2026-10-12T00:00:00.000Z";

function snapshot(repository: StoryMapperRepository, projectId: string, mapId: string): OperationSnapshot {
  const map = repository.getStoryMapSnapshot(mapId)!;
  const roadmaps = repository.listRoadmaps(projectId, mapId).filter((row) => row.storyMapId === mapId);
  return { projectId, projects: repository.listProjects(), storyMaps: [map.storyMap], cards: repository.listCardsInInsertionOrder(mapId), releases: map.releases, personas: map.personas,
    productContexts: map.productContext ? [map.productContext] : [], roadmaps, roadmapColumns: roadmaps.flatMap((row) => repository.listRoadmapColumns(row.id)), roadmapSwimlanes: roadmaps.flatMap((row) => repository.listRoadmapSwimlanes(row.id)), roadmapCards: roadmaps.flatMap((row) => repository.listRoadmapCards(row.id)), roadmapReferences: roadmaps.flatMap((row) => repository.listRoadmapReferences(row.id)),
    annotations: map.annotations, workflowStatuses: map.workflowStatuses, storyTemplates: map.storyTemplates, attachments: map.cardAttachments, cardPersonas: map.cardPersonas, cardAnnotations: map.cardAnnotations, cardDependencies: map.cardDependencies,
    remoteWorkItemLinks: map.remoteWorkItemLinks, externalRefs: map.externalRefs, sourceDocuments: [], sourceChunks: map.sourceChunks, sourceLinks: map.sourceLinks, githubLinks: map.githubLinks, connections: repository.listConnectorConnections(projectId) };
}

function seed(uow: UnitOfWork) {
  return uow.run(ACTOR, ({ repository }) => {
    const project = repository.createProject({ name: "Copy golden" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Source" });
    const release = repository.createRelease({ storyMapId: map.id, name: "MVP" });
    const activity = repository.createCard({ storyMapId: map.id, level: "activity", title: "Activity" });
    const step = repository.createCard({ storyMapId: map.id, level: "step", parentId: activity.id, title: "Step" });
    const story = repository.createCard({ storyMapId: map.id, level: "story", parentId: step.id, releaseId: release.id, title: "Story" });
    const persona = repository.createPersona({ projectId: project.id, storyMapId: map.id, name: "Reader" });
    const annotation = repository.createAnnotation({ projectId: project.id, storyMapId: map.id, name: "Risk" });
    repository.createWorkflowStatus({ projectId: project.id, storyMapId: map.id, name: "Review", group: "active" });
    repository.createStoryTemplate({ projectId: project.id, storyMapId: map.id, name: "Owned template", descriptionTemplate: "Reviewed template" });
    repository.upsertProductContext({ projectId: project.id, storyMapId: map.id, purpose: "Owned vision" });
    repository.setCardPersona(story.id, persona.id);
    repository.setCardAnnotation(story.id, annotation.id);
    repository.createCardAttachment(story.id, { label: "Evidence", filePath: "attachments/evidence.txt" });
    repository.createCardSourceLink(story.id, { kind: "note", note: "Reviewed origin" });
    const github = repository.createGitHubLink({ cardId: story.id, repo: "Example/Repo", issueNumber: 1, url: "https://github.com/Example/Repo/issues/1" });
    repository.createCardSourceLink(story.id, { kind: "github", externalRefId: github.id });
    const roadmap = repository.createRoadmap({ projectId: project.id, storyMapId: map.id, name: "Owned roadmap" });
    const roadmapCard = repository.createRoadmapCard({ roadmapId: roadmap.id, columnId: repository.listRoadmapColumns(roadmap.id)[0]!.id, swimlaneId: repository.listRoadmapSwimlanes(roadmap.id)[0]!.id, title: "Delivery" });
    repository.createRoadmapReference({ roadmapCardId: roadmapCard.id, targetType: "card", targetId: story.id });
    repository.createRoadmapReference({ roadmapCardId: roadmapCard.id, targetType: "release", targetId: release.id });
    return { project, map };
  });
}


it("matches the real complete SQLite copy graph and preserves prepared identity/input bytes", () => {
  vi.useFakeTimers(); vi.setSystemTime(TIME);
  const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
  try {
    const uow = new UnitOfWork(handle);
    const repository = new StoryMapperRepository(handle);
    const { project, map } = seed(uow);
    const proposal = uow.run(ACTOR, ({ repository }) => repository.proposeStoryMapCopy({ sourceStoryMapId: map.id, targetName: "Target" }));
    const operation = structuredClone(proposal.operations[0]!) as Extract<ChangeOperation, { entity: "storyMapCopy" }>;
    const before = { ...snapshot(repository, project.id, map.id), mapFingerprints: operation.after.expected };
    const sourceRows = storyMapCopyRows.call(repository, map.id);
    const prepared = repository.prepareOperationSupply(proposal.operations, repository.getOperationSnapshot(project.id));
    uow.run(ACTOR, ({ repository }) => { repository.updateChangeSetStatus(proposal.id, "approved"); repository.applyChangeSet(proposal.id, { supply: prepared }); });
    const identities = { ...prepared.copyIds![operation.operationId]!, [map.id]: operation.entityId! };
    const supply = { createdAt: TIME, creationOrigin: "manual" as const, ids: { [operation.operationId]: operation.entityId! }, externalRefIds: {}, copyIds: { [operation.operationId]: identities } };
    const original = structuredClone({ before, operation, supply });
    const result = resolveOperation(before, operation, supply);
    expect(resolveOperation(before, operation, supply)).toEqual(result);
    const copiedCardId = identities[before.cards[0]!.id]!;
    const edits: ChangeOperation[] = [operation, { operationId: "edit-copied", op: "update", entity: "card", entityId: copiedCardId, after: { title: "Edited copy" } }, { operationId: "add-copied", op: "create", entity: "card", after: { storyMapId: operation.entityId!, level: "activity", title: "Additional" } }];
    expect(resolveOperations(before, edits, supply, ["edit-copied", "add-copied"]).selectedOperationIds).toEqual([]);

    expect({ before, operation, supply }).toEqual(original);
    const actual = snapshot(repository, project.id, operation.entityId!);
    const copied = new Set(Object.values(identities));
    for (const [name, value] of Object.entries(actual)) if (Array.isArray(value)) {
      const expectedRows = value.filter((row: { id: string }) => copied.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
      const resolvedRows = (result.state[name as keyof OperationSnapshot] as Array<{ id: string }>).filter((row) => copied.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
      expect(resolvedRows, name).toEqual(expectedRows);
    }
    expect(result.state.cards.filter((row) => copied.has(row.id)).every((row) => row.creationOrigin === "inference")).toBe(true);
    expect(result.state.cards.find((row) => copied.has(row.id) && row.title === "Story")?.provenance).toBe("linked");
    expect(() => resolveOperation({ ...before, mapFingerprints: { [map.id]: "0".repeat(64) } }, operation, supply)).toThrow("Story Map changed");
    const missing = { ...identities }; delete missing[sourceRows.roadmapReferences![0]!.id];
    expect(() => resolveOperation(before, operation, { ...supply, copyIds: { [operation.operationId]: missing } })).toThrow("Copied identity");
  } finally { handle.current.$client.close(); vi.useRealTimers(); }
});
