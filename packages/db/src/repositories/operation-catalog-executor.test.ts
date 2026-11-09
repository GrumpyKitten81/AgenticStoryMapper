import type { Project, GitHubLink, Persona, Annotation, StoryTemplate, WorkflowStatus } from "@storymapper/contracts";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { ChangeOperation, OperationSnapshot } from "@storymapper/contracts";
import { resolveOperations } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork, publishRestorePoint } from "@storymapper/db";

const actor = { actorType: "human", actorId: "catalog-reviewer" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach((close) => close()));

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "executor-catalog-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  const unitOfWork = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const project = unitOfWork.run(actor, ({ repository }) => repository.createProject({ name: "Catalog" }));
  const execute = (operations: ChangeOperation[]) => {
    const snapshot = repository.getOperationSnapshot(project.id);
    const supply = repository.prepareOperationSupply(operations, snapshot);
    const expected = resolveOperations(snapshot, operations, supply);
    const proposal = unitOfWork.run(actor, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: project.id, title: "Catalog cut", source: "human", createdAt: supply.createdAt, operations }));
    unitOfWork.run(actor, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
    const result = unitOfWork.runPrepared(actor, (database) => ({ supply, restorePoint: publishRestorePoint(database, "pre-apply").fileName }), ({ repository }, prepared) => repository.applyChangeSet(proposal.id, prepared))!;
    expect(result.status).toBe("applied");
    expect(result.operations).toEqual(proposal.operations);
    expect(result.execution?.operationResults.map((entry) => entry.operationId)).toEqual(operations.map((operation) => operation.operationId));
    const actual = repository.getOperationSnapshot(project.id);
    for (const [key, rows] of Object.entries(expected.state)) {
      if (!Array.isArray(rows) || key === "sourceLinks") continue;
      const stored = actual[key as keyof OperationSnapshot] as Array<{ id: string }>;
      expect(stored.map((row) => row.id).sort()).toEqual(rows.map((row: { id: string }) => row.id).sort());
      for (const row of rows) {
        const normalized = JSON.parse(JSON.stringify(row)) as { id: string; key?: string };
        if (normalized.key?.startsWith("NEW-")) delete normalized.key;
        expect(stored.find((entry) => entry.id === row.id)).toMatchObject(normalized);
      }
    }
    const appliedEvents = repository.listActivity(project.id).filter((event) => event.action === "changeSet.operation.applied" && operations.some((operation) => (event.after as { operationId?: string } | undefined)?.operationId === operation.operationId));
    expect(appliedEvents).toHaveLength(operations.length);
    return actual;
  };
  return { project, repository, execute };
}

it("executes previously uncovered update, unset and delete catalog pairs with physical-state and immutable-input parity", () => {
  const f = fixture();
  const localMap = f.execute([{ operationId: "map-create", entity: "storyMap", op: "create", after: { projectId: f.project.id, name: "Map" } }]).storyMaps[0]!.id;
  const created = f.execute([
    { operationId: "release-create", entity: "release", op: "create", entityId: "release", after: { storyMapId: localMap, name: "Release" } },
    { operationId: "persona-create", entity: "persona", op: "create", entityId: "persona", after: { projectId: f.project.id, storyMapId: localMap, name: "Reader", goals: ["Read"], pains: ["Delay"] } },
    { operationId: "card-create", entity: "card", op: "create", entityId: "card", after: { storyMapId: localMap, title: "Activity", level: "activity" } },
    { operationId: "annotation-create", entity: "annotation", op: "create", entityId: "annotation", after: { projectId: f.project.id, name: "Tag" } },
    { operationId: "template-create", entity: "storyTemplate", op: "create", after: { projectId: f.project.id, name: "Template" } },
    { operationId: "workflow-create", entity: "workflowStatus", op: "create", after: { projectId: f.project.id, name: "review", group: "active" } },
    { operationId: "roadmap-create", entity: "roadmap", op: "create", after: { projectId: f.project.id, name: "Roadmap" } },
    { operationId: "attachment-create", entity: "attachment", op: "create", after: { cardId: "card", label: "Evidence", filePath: "reviewed.txt" } },
    { operationId: "github-create", entity: "githubExternalRef", op: "create", after: { entityType: "card", entityId: "card", scopeId: localMap, externalId: "https://github.com/example/repo/issues/1" } },
    { operationId: "persona-set", entity: "cardPersona", op: "set", entityId: "persona-link", after: { cardId: "card", personaId: "persona" } },
    { operationId: "annotation-set", entity: "cardAnnotation", op: "set", entityId: "annotation-link", after: { cardId: "card", annotationId: "annotation" } },
    { operationId: "external-set", entity: "externalRef", op: "set", entityId: "binding", after: { entityType: "persona", entityId: "persona", scopeId: localMap, system: "bmad", externalId: "reader" } }
  ]);
  const map = created.storyMaps[0]!;
  const card = created.cards[0]!;
  const persona = created.personas[0]!;
  const annotation = created.annotations[0]!;
  const release = created.releases[0]!;
  const workflow = created.workflowStatuses.find((row) => row.name === "review")!;
  const template = created.storyTemplates[0]!;
  const roadmap = created.roadmaps[0]!;
  const github = created.githubLinks[0]!;
  const updated = f.execute([
    { operationId: "map-update", entity: "storyMap", op: "update", entityId: map.id, after: { name: "Changed Map" } },
    { operationId: "release-update", entity: "release", op: "update", entityId: release.id, after: { name: "Changed Release" } },
    { operationId: "persona-update", entity: "persona", op: "update", entityId: persona.id, after: { name: "Changed Reader", goals: ["Review"] } },
    { operationId: "annotation-update", entity: "annotation", op: "update", entityId: annotation.id, after: { name: "Changed Tag", color: "red" } },
    { operationId: "template-update", entity: "storyTemplate", op: "update", entityId: template.id, after: { name: "Changed Template", descriptionTemplate: "Reviewed format" } },
    { operationId: "workflow-update", entity: "workflowStatus", op: "update", entityId: workflow.id, after: { name: "approved", group: "done", definitionBefore: workflow, affectedCards: [] } },
    { operationId: "roadmap-update", entity: "roadmap", op: "update", entityId: roadmap.id, after: { name: "Changed Roadmap" } },
    { operationId: "github-update", entity: "githubExternalRef", op: "update", entityId: github.id, after: { entityType: "card", entityId: card.id, scopeId: localMap, externalId: "https://github.com/example/repo/issues/2" } },
    { operationId: "persona-unset", entity: "cardPersona", op: "unset", entityId: "unset-persona", after: { cardId: card.id, personaId: persona.id } },
    { operationId: "annotation-unset", entity: "cardAnnotation", op: "unset", entityId: "unset-annotation", after: { cardId: card.id, annotationId: annotation.id } }
  ]);
  exerciseExecutesPreviouslyUncoveredUpdateUnsetAndDeleteCatalogPairs(updated, f, created, github, persona, annotation, template, workflow);
});


it("persists create-then-bulk relationship aliases and Release upsert families with exact resolution parity", () => {
  const f = fixture();
  const mapId = f.execute([{ operationId: "seed-map", entity: "storyMap", op: "create", after: { projectId: f.project.id, name: "Bulk Map" } }]).storyMaps[0]!.id;
  const state = f.execute([
    { operationId: "new-persona", op: "create", entity: "persona", entityId: "bulk-persona", after: { projectId: f.project.id, storyMapId: mapId, name: "Reader" } },
    { operationId: "new-annotation", op: "create", entity: "annotation", entityId: "bulk-tag", after: { projectId: f.project.id, name: "Reviewed tag" } },
    { operationId: "new-card", op: "create", entity: "card", entityId: "bulk-card", after: { storyMapId: mapId, level: "activity", title: "Bulk target" } },
    { operationId: "bulk-links", op: "bulk", entity: "card", entityId: "bulk-targets", after: { storyMapId: mapId, cards: [{ id: "bulk-card", baseVersion: 0 }], patch: { addPersonaId: "bulk-persona", addAnnotationId: "bulk-tag" } } },
    { operationId: "release-upsert-create", op: "upsert", entity: "release", selector: { kind: "externalRef", scopeId: mapId, system: "bmad", externalId: "release-1" }, after: { storyMapId: mapId, name: "Initial release" } }
  ]);
  expect(state.cardPersonas).toMatchObject([{ cardId: state.cards[0]!.id, personaId: state.personas[0]!.id }]);
  expect(state.cardAnnotations).toMatchObject([{ cardId: state.cards[0]!.id, annotationId: state.annotations[0]!.id }]);
  const release = state.releases[0]!;
  const updated = f.execute([{ operationId: "release-upsert-update", op: "upsert", entity: "release", baseVersion: release.version, selector: { kind: "externalRef", scopeId: mapId, system: "bmad", externalId: "release-1" }, after: { storyMapId: mapId, name: "Published release" } }]);
  expect(updated.releases).toMatchObject([{ id: release.id, name: "Published release", version: release.version + 1 }]);
  expect(updated.externalRefs.find((ref) => ref.entityId === release.id)?.syncedVersion).toBe(release.version + 1);
});

function exerciseExecutesPreviouslyUncoveredUpdateUnsetAndDeleteCatalogPairs(updated: OperationSnapshot, f: Awaited<ReturnType<typeof fixture>>, created: OperationSnapshot, github: GitHubLink, persona: Persona, annotation: Annotation, template: StoryTemplate, workflow: WorkflowStatus) {
  expect(updated.cardPersonas).toEqual([]);
  expect(updated.cardAnnotations).toEqual([]);
  f.execute([
    { operationId: "persona-upsert", entity: "persona", op: "upsert", selector: { kind: "externalRef", scopeId: f.project.id, system: "bmad", externalId: "new-reader" }, after: { projectId: f.project.id, name: "Published Reader", goals: ["Publish"], pains: [] } }
  ]);
  const deleted = f.execute([
    { operationId: "attachment-delete", entity: "attachment", op: "delete", entityId: created.attachments[0]!.id, after: {} },
    { operationId: "external-delete", entity: "externalRef", op: "delete", entityId: created.externalRefs.find((ref) => ref.system === "bmad")!.id, after: {} },
    { operationId: "github-delete", entity: "githubExternalRef", op: "delete", entityId: github.id, after: {} },
    { operationId: "persona-delete", entity: "persona", op: "delete", entityId: persona.id, after: { definitionBefore: updated.personas.find((row) => row.id === persona.id)!, affectedCards: updated.cards.filter((card) => updated.cardPersonas.some((link) => link.personaId === persona.id && link.cardId === card.id)).map((card) => ({ id: card.id, baseVersion: card.version })), confirmUnlink: true } },
    { operationId: "annotation-delete", entity: "annotation", op: "delete", entityId: annotation.id, after: { definitionBefore: updated.annotations.find((row) => row.id === annotation.id)!, affectedCards: updated.cards.filter((card) => updated.cardAnnotations.some((link) => link.annotationId === annotation.id && link.cardId === card.id)).map((card) => ({ id: card.id, baseVersion: card.version })), confirmUnlink: true } },
    { operationId: "template-delete", entity: "storyTemplate", op: "delete", entityId: template.id, after: {} },
    { operationId: "workflow-delete", entity: "workflowStatus", op: "delete", entityId: workflow.id, after: { definitionBefore: updated.workflowStatuses.find((row) => row.id === workflow.id)!, affectedCards: [] } }
  ]);
  expect(deleted.attachments).toEqual([]);
  expect(deleted.githubLinks).toEqual([]);
  expect(deleted.sourceLinks).toEqual([]);
  expect(deleted.personas.map((row) => row.name)).toEqual(["Published Reader"]);
}
