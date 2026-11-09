import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { ChangeOperation } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

it.each([true, false])("warns when the %s earlier pending operation deletes an existing external binding", (deletionFirst) => {
  const directory = mkdtempSync(join(tmpdir(), "binding-warning-"));
  const database = openStoryMapperDb(join(directory, "storymapper.sqlite"));
  try {
    const handle = new DatabaseHandle(database);
    const uow = new UnitOfWork(handle);
    const actor = { actorType: "human", actorId: "warning-test" } as const;
    const repository = new StoryMapperRepository(handle);
    const { project, map, binding } = uow.run(actor, ({ repository }) => {
      const project = repository.createProject({ name: "Warning Project" });
      const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
      const card = repository.createCard({ storyMapId: map.id, title: "Published", level: "activity" });
      const binding = repository.setExternalRef({ entityType: "card", entityId: card.id, system: "bmad", externalId: "story" }).ref;
      return { project, map, binding };
    });
    const deletion: ChangeOperation = { operationId: "remove-binding", entity: "externalRef", op: "delete", entityId: binding.id, after: {} };
    const publication: ChangeOperation = { operationId: "publish", entity: "card", op: "upsert", selector: { kind: "externalRef", scopeId: map.id, system: "bmad", externalId: "story" }, after: { storyMapId: map.id, title: "Updated", level: "activity" } };
    const create = (operation: ChangeOperation, title: string) => uow.run(actor, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: project.id, title, source: "human", operations: [operation], createdAt: new Date().toISOString() }));
    const first = create(deletionFirst ? deletion : publication, "Earlier proposal");
    const second = create(deletionFirst ? publication : deletion, "Later proposal");
    expect(second.warnings).toEqual([{ code: "pending_external_reference_overlap", priorChangeSetId: first.id, priorChangeSetTitle: first.title, operationIds: second.operations.map((operation) => operation.operationId), priorOperationIds: first.operations.map((operation) => operation.operationId) }]);
    expect(repository.getChangeSet(first.id)?.operations).toEqual(first.operations);
    expect(repository.getChangeSet(second.id)?.operations).toEqual(second.operations);
  } finally {
    database.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
