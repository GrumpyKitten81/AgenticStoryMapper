import { expect, it } from "vitest";
import { connectorConnectionSchema, type ChangeOperation } from "@storymapper/contracts";
import { operationDependencies, resolveOperations } from "@storymapper/core";
import { id, createdAt, operation, snapshot, supply } from "@storymapper/core/changesets/fixtures/operation-resolution-fixture";

it("closes one imported Issue group independently while retaining another group and its generated parents", () => {
  const state = snapshot();
  const connection = connectorConnectionSchema.parse({ id: id(30), projectId: id(1), name: "GitHub", provider: "github", owner: "owner", repository: "repo", authMode: "token", createdAt, updatedAt: createdAt });
  state.connections.push(connection);
  const parents: ChangeOperation[] = [
    operation({ operationId: "activity", entityId: "activity-local", op: "create", entity: "card", after: { storyMapId: id(2), level: "activity", title: "Imported backlog" } }),
    operation({ operationId: "step", entityId: "step-local", op: "create", entity: "card", after: { storyMapId: id(2), level: "step", parentId: "activity-local", title: "Imported work items" } })
  ];
  const issue = (number: number): ChangeOperation[] => [
    operation({ operationId: `card${number}`, entityId: `card${number}-local`, op: "create", entity: "card", after: { storyMapId: id(2), level: "story", parentId: "step-local", title: `Issue ${number}` } }),
    operation({ operationId: `ref${number}`, entityId: `ref${number}-local`, op: "create", entity: "githubExternalRef", after: { entityType: "card", entityId: `card${number}-local`, scopeId: id(2), externalId: `https://github.com/owner/repo/issues/${number}` } }),
    operation({ operationId: `baseline${number}`, op: "set", entity: "remoteWorkItemLink", before: null, connectionBefore: connection, after: { externalRefId: `ref${number}-local`, connectionId: connection.id, labels: [], syncState: "synced", parentOverrideLocal: false } })
  ];
  const first = issue(17), second = issue(18);
  const operations = [...parents, ...first, ...second];
  const allocations = supply(operations);
  const graph = operationDependencies(state, operations, allocations);
  expect(graph.get("card18")).toEqual(expect.arrayContaining(["step", "ref18", "baseline18"]));
  const selected = operations.filter((candidate) => candidate.operationId !== "ref17").map((candidate) => candidate.operationId);
  const resolved = resolveOperations(state, operations, allocations, selected);
  expect(resolved.selectedOperationIds).toEqual([...parents, ...second].map((candidate) => candidate.operationId));
  expect(resolved.state.cards.filter((card) => card.title.startsWith("Issue"))).toMatchObject([{ title: "Issue 18" }]);
  expect(resolved.state.externalRefs.filter((ref) => ref.system === "github")).toMatchObject([{ externalId: "https://github.com/owner/repo/issues/18" }]);
  expect(resolved.state.remoteWorkItemLinks).toHaveLength(1);
  const withoutParent = resolveOperations(state, operations, allocations, selected.filter((name) => name !== "activity"));
  expect(withoutParent.selectedOperationIds).toEqual([]);
});
