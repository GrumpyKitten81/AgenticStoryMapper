import { changeOperationSchema, type Card, type CreateCardRequest } from "@storymapper/contracts";
import { resolveOperations } from "@storymapper/core";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

export function persistImportedCardFixture(repository: StoryMapperRepository<"transaction">, card: CreateCardRequest, connectionId: string, url: string, labels: string[] = []): Card {
  const map = repository.getStoryMapOrThrow(card.storyMapId);
  const operations = [
    { operationId: "create-card", op: "create", entity: "card", entityId: "imported-card", after: card },
    { operationId: "create-ref", op: "create", entity: "githubExternalRef", entityId: "imported-ref", after: { entityType: "card", entityId: "imported-card", scopeId: card.storyMapId, externalId: url } },
    { operationId: "create-sync", op: "set", entity: "remoteWorkItemLink", after: { externalRefId: "imported-ref", connectionId, labels, syncState: "synced", parentOverrideLocal: false } }
  ].map((operation) => changeOperationSchema.parse(operation));
  const snapshot = repository.getOperationSnapshot(map.projectId);
  const resolution = resolveOperations(snapshot, operations, repository.prepareOperationSupply(operations, snapshot));
  repository.persistOperationResolution(resolution, map.projectId);
  const created = resolution.operations[0]!.changes.find((change) => change.entity === "card" && change.after)!;
  return repository.getCard(created.entityId)!;
}
