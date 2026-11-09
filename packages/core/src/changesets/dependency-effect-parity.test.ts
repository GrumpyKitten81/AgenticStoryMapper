import { expect, it } from "vitest";
import { cardSchema, connectorConnectionSchema, githubLinkSchema, projectSchema, releaseSchema, storyMapSchema, type ChangeOperation, type OperationSnapshot, type OperationSupply } from "@storymapper/contracts";
import { collectOperationConflicts, operationDependencies, resolveOperations } from "@storymapper/core";

const id = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const createdAt = "2026-10-11T12:00:00.000Z";

function placementSnapshot(level: "story" | "activity" = "story"): OperationSnapshot {
  return { roadmaps: [], roadmapColumns: [], roadmapSwimlanes: [], roadmapCards: [], roadmapReferences: [], annotations: [], workflowStatuses: [], storyTemplates: [], attachments: [], cardPersonas: [], cardDependencies: [], cardAnnotations: [], remoteWorkItemLinks: [], projectId: id(1), projects: [projectSchema.parse({ id: id(1), name: "Project", localPath: "fixture.lsm", createdAt })], storyMaps: [storyMapSchema.parse({ id: id(2), projectId: id(1), name: "Map", version: 1, createdAt, updatedAt: createdAt })],
    cards: [3, 4, 5, 6].map((number, position) => cardSchema.parse({ id: id(number), storyMapId: id(2), parentId: null, releaseId: null, key: `LSM-${number}`, level, title: "Card", position, version: 1, creationOrigin: "manual", provenance: "manual", createdAt, updatedAt: createdAt })),
    releases: [13, 14, 15, 16].map((number, position) => releaseSchema.parse({ id: id(number), storyMapId: id(2), name: "Release", position, version: 1, startDate: null, releaseDate: null })),
    personas: [], connections: [], externalRefs: [], productContexts: [], sourceDocuments: [], sourceChunks: [], sourceLinks: [], githubLinks: [] };
}

function githubSnapshot(releaseOwner = false): OperationSnapshot {
  const state = placementSnapshot("activity");
  state.githubLinks.push(githubLinkSchema.parse({ id: id(70), ...(releaseOwner ? { releaseId: id(13) } : { cardId: id(3) }), repo: "org/repo", issueNumber: 7, url: "https://github.com/org/repo/issues/7", syncState: "unsynced" }));
  state.externalRefs.push({ id: id(70), entityType: releaseOwner ? "release" : "card", entityId: releaseOwner ? id(13) : id(3), scopeId: id(2), system: "github", externalId: "https://github.com/org/repo/issues/7", syncedVersion: 1, createdAt });
  state.cards[0]!.provenance = "linked";
  state.cards[1]!.provenance = "linked";
  state.sourceLinks.push({ kind: "github", id: id(71), cardId: id(4), externalRefId: id(70), repoFullName: "org/repo", issueNumber: 7, url: "https://github.com/org/repo/issues/7" });
  return state;
}

function assertDependencyParity(state: OperationSnapshot, operations: ChangeOperation[], supply: OperationSupply): void {
  const graph = operationDependencies(state, operations, supply);
  for (const [operationId, dependencies] of graph) expect(dependencies).not.toContain(operationId);
  const result = resolveOperations(state, operations, supply);
  for (const operation of result.operations) for (const dependency of operation.dependencies) {
    expect(prerequisites(graph, operation.operationId), `${operation.operationId} must retain resolver read ${dependency}`).toContain(dependency);
  }
}

function prerequisites(graph: Map<string, string[]>, operationId: string, visited = new Set<string>()): Set<string> {
  for (const dependency of graph.get(operationId) ?? []) if (!visited.has(dependency)) {
    visited.add(dependency);
    prerequisites(graph, dependency, visited);
  }
  return visited;
}

const supply: OperationSupply = { createdAt, creationOrigin: "manual", ids: {}, externalRefIds: {} };
const edit = (operationId: string, cardId: string, title: string): ChangeOperation => ({ operationId, op: "update", entity: "card", entityId: cardId, after: { title } });

it.each(["identity", "canonical", "card", "release"] as const)("closes shared evidence dependencies after deleting %s", (kind) => {
  const state = githubSnapshot(kind === "release");
  const remove: ChangeOperation = kind === "identity" ? { operationId: "remove", op: "delete", entity: "githubExternalRef", entityId: id(70), after: {} }
    : kind === "canonical" ? { operationId: "remove", op: "unlink", entity: "sourceLink", entityId: "source", after: { kind: "github", cardId: id(3), id: id(70) } }
    : kind === "card" ? { operationId: "remove", op: "delete", entity: "card", entityId: id(3), after: { strategy: "unassign" } }
    : { operationId: "remove", op: "delete", entity: "release", entityId: id(13), after: {} };
  const operations = [remove, edit("shared", id(4), "Shared edit"), edit("chain", id(4), "Chain edit"), edit("independent", id(6), "Independent")];
  assertDependencyParity(state, operations, supply);
  const closed = resolveOperations(state, operations, supply, ["shared", "chain", "independent"]);
  expect(closed.selectedOperationIds).toEqual(kind === "card" ? [] : ["independent"]);
  expect(closed.state).toEqual(resolveOperations(state, operations.filter((operation) => closed.selectedOperationIds.includes(operation.operationId)), supply).state);
  expect(resolveOperations(state, operations, supply).state.githubLinks).toEqual([]);
});

it("retains both old and new GitHub owners and shared evidence after reassignment", () => {
  const state = githubSnapshot();
  const operations: ChangeOperation[] = [{ operationId: "reassign", op: "update", entity: "githubExternalRef", entityId: id(70), after: { entityType: "card", entityId: id(5), scopeId: id(2), externalId: "https://github.com/org/repo/issues/7" } }, edit("old-owner", id(3), "Old owner"), edit("new-owner", id(5), "New owner"), edit("shared", id(4), "Shared"), edit("independent", id(6), "Independent")];
  assertDependencyParity(state, operations, supply);
  const requested = operations.slice(1).map((operation) => operation.operationId);
  expect(resolveOperations(state, operations, supply, requested).selectedOperationIds).toEqual(["independent"]);
});

it("matches effects through local aliases, placement, nullable Release assignment and shared deletion", () => {
  const state = githubSnapshot();
  const operations: ChangeOperation[] = [
    { operationId: "create", op: "create", entity: "card", entityId: "new-activity", after: { storyMapId: id(2), title: "New", level: "activity", releaseId: id(13), position: 0 } },
    { operationId: "reassign", op: "update", entity: "githubExternalRef", entityId: id(70), after: { entityType: "card", entityId: "new-activity", scopeId: id(2), externalId: "https://github.com/org/repo/issues/7" } },
    { operationId: "detach", op: "update", entity: "card", entityId: "new-activity", after: { releaseId: null } },
    { operationId: "remove", op: "delete", entity: "githubExternalRef", entityId: id(70), after: {} },
    edit("shared", id(4), "Shared"), edit("independent", id(6), "Independent")
  ];
  const allocations = { ...supply, ids: { create: id(90) } };
  assertDependencyParity(state, operations, allocations);
  const closed = resolveOperations(state, operations, allocations, ["reassign", "detach", "remove", "shared", "independent"]);
  expect(closed.selectedOperationIds).toEqual(["independent"]);
  expect(closed.state).toEqual(resolveOperations(state, operations.slice(-1), allocations).state);
  expect(resolveOperations(state, operations, allocations).state.cards.find((card) => card.id === id(90))).toMatchObject({ releaseId: null, provenance: "manual" });
});

it("retains evidence linked earlier in the cut through owner reassignment and deletion", () => {
  const state = githubSnapshot();
  const operations: ChangeOperation[] = [
    { operationId: "link", op: "link", entity: "sourceLink", entityId: "new-evidence", after: { kind: "github", cardId: id(6), externalRefId: id(70) } },
    { operationId: "reassign", op: "update", entity: "githubExternalRef", entityId: id(70), after: { entityType: "card", entityId: id(5), scopeId: id(2), externalId: "https://github.com/org/repo/issues/7" } },
    { operationId: "remove", op: "delete", entity: "githubExternalRef", entityId: id(70), after: {} },
    edit("new-shared", id(6), "Shared after remove")
  ];
  const allocations = { ...supply, ids: { link: id(90) } };
  assertDependencyParity(state, operations, allocations);
  expect(resolveOperations(state, operations, allocations, ["new-shared"]).selectedOperationIds).toEqual([]);
  expect(resolveOperations(state, operations, allocations).state.sourceLinks).toEqual([]);
});

it("preserves canonical GitHub ownership through local Card aliases without duplicating Release identity", () => {
  const state = placementSnapshot("activity");
  state.connections.push(connectorConnectionSchema.parse({ id: id(70), projectId: id(1), provider: "github", name: "Repo", authMode: "token", owner: "org", repository: "repo", readOnly: false, createdAt, updatedAt: createdAt }));
  const operations: ChangeOperation[] = [
    { operationId: "create", op: "create", entity: "card", entityId: "local-card", after: { storyMapId: id(2), level: "activity", title: "New" } },
    { operationId: "reference", op: "create", entity: "githubExternalRef", entityId: "local-ref", after: { entityType: "card", entityId: "local-card", scopeId: id(2), externalId: "https://github.com/org/repo/issues/7" } },
    { operationId: "remote", op: "set", entity: "remoteWorkItemLink", after: { connectionId: id(70), externalRefId: "local-ref", labels: [], parentOverrideLocal: false, syncState: "synced" } },
    edit("edit", "local-card", "New title"), edit("independent", id(6), "Independent")
  ];
  const allocations = { ...supply, ids: { create: id(90), reference: id(92), remote: id(91) } };
  assertDependencyParity(state, operations, allocations);
  expect(resolveOperations(state, operations, allocations).state.remoteWorkItemLinks[0]).toMatchObject({ cardId: id(90), externalRefId: id(92) });
  const selected = resolveOperations(state, operations, allocations, ["remote", "edit", "independent"]);
  expect(selected.selectedOperationIds).toEqual(["independent"]);
  expect(selected.state).toEqual(resolveOperations(state, operations.slice(-1), allocations).state);
});

it.each(["delete", "reassign"] as const)("retains the canonical owner after a hidden physical unlink followed by %s", (kind) => {
  const state = githubSnapshot();
  state.sourceLinks.push({ kind: "github", id: id(72), cardId: id(3), externalRefId: id(70), repoFullName: "org/repo", issueNumber: 7, url: "https://github.com/org/repo/issues/7" });
  const mutate: ChangeOperation = kind === "delete" ? { operationId: "mutate", op: "delete", entity: "githubExternalRef", entityId: id(70), after: {} }
    : { operationId: "mutate", op: "update", entity: "githubExternalRef", entityId: id(70), after: { entityType: "card", entityId: id(5), scopeId: id(2), externalId: "https://github.com/org/repo/issues/7" } };
  const operations: ChangeOperation[] = [
    { operationId: "unlink-hidden", op: "unlink", entity: "sourceLink", entityId: "hidden-evidence", after: { kind: "github", cardId: id(3), id: id(72) } },
    mutate, edit("owner-edit", id(3), "Canonical owner edit"), edit("independent", id(6), "Independent")
  ];
  const graph = operationDependencies(state, operations, supply);
  const resolved = resolveOperations(state, operations, supply);
  expect(graph.get("mutate")).toContain("unlink-hidden");
  expect(resolved.operations[2]!.dependencies).toContain("mutate");
  expect(prerequisites(graph, "owner-edit")).toContain("mutate");
  expect(resolveOperations(state, operations, supply, ["unlink-hidden", "owner-edit", "independent"]).selectedOperationIds).toEqual(["unlink-hidden", "independent"]);
  expect(resolveOperations(state, operations, supply, ["mutate", "owner-edit", "independent"]).selectedOperationIds).toEqual(["independent"]);
});

it("retains selected-set dependency effects for every selected, structural and shared-evidence root", () => {
  const state = githubSnapshot();
  const operations: ChangeOperation[] = [
    edit("before", id(5), "Before selected deletion"),
    { operationId: "selection", op: "delete", entity: "card", entityId: id(3), baseVersion: 1, after: { strategy: "unassign", selection: { storyMapId: id(2), cards: [{ id: id(3), baseVersion: 1 }, { id: id(5), baseVersion: 1 }], affectedCards: state.cards.map((card) => ({ id: card.id, baseVersion: card.version })) } } },
    edit("evidence-owner", id(4), "After identity removal")
  ];
  assertDependencyParity(state, operations, supply);
  const graph = operationDependencies(state, operations, supply);
  expect(graph.get("selection")).toContain("before");
  expect(graph.get("evidence-owner")).toContain("selection");
  expect(resolveOperations(state, operations, supply, ["selection", "evidence-owner"]).selectedOperationIds).toEqual([]);
  const result = resolveOperations(state, operations, supply);
  expect(result.state.cards.map((card) => card.id)).toEqual([id(4), id(6)]);
  expect(result.state.githubLinks).toEqual([]);
  expect(result.state.sourceLinks).toEqual([]);
});

it("does not make selected-set Delete depend on edits to unused captured roots", () => {
  const state = placementSnapshot();
  const operations: ChangeOperation[] = [
    edit("unrelated", id(3), "Unrelated changed"),
    { operationId: "selection", op: "delete", entity: "card", entityId: id(5), baseVersion: 1, after: { strategy: "unassign", selection: { storyMapId: id(2), cards: [{ id: id(5), baseVersion: 1 }], affectedCards: state.cards.map((card) => ({ id: card.id, baseVersion: card.version })) } } }
  ];
  const graph = operationDependencies(state, operations, supply);
  expect(graph.get("selection")).not.toContain("unrelated");
  expect(resolveOperations(state, operations, supply, ["selection"]).selectedOperationIds).toEqual(["selection"]);
});

it("resolves selected and affected local aliases and retains their creation dependencies", () => {
  const state = placementSnapshot("activity");
  const operations: ChangeOperation[] = [
    { operationId: "activity", op: "create", entity: "card", entityId: "activity-alias", after: { storyMapId: id(2), level: "activity", title: "Selected Activity", position: 4 } },
    { operationId: "step", op: "create", entity: "card", entityId: "step-alias", after: { storyMapId: id(2), parentId: "activity-alias", level: "step", title: "Selected Step" } },
    { operationId: "survivor", op: "create", entity: "card", entityId: "survivor-alias", after: { storyMapId: id(2), level: "activity", title: "Survivor", position: 5 } },
    { operationId: "selection", op: "delete", entity: "card", entityId: "activity-alias", baseVersion: 1, after: { strategy: "unassign", selection: { storyMapId: id(2), cards: ["activity-alias", "step-alias"].map((id) => ({ id, baseVersion: 1 })), affectedCards: [{ id: "survivor-alias", baseVersion: 1 }] } } }
  ];
  const allocations = { ...supply, ids: { activity: id(90), step: id(91), survivor: id(92) } };
  assertDependencyParity(state, operations, allocations);
  expect(collectOperationConflicts(state, operations, allocations)).toEqual([]);
  expect(operationDependencies(state, operations, allocations).get("selection")).toEqual(expect.arrayContaining(["activity", "step", "survivor"]));
  const result = resolveOperations(state, operations, allocations);
  expect(result.state.cards.find((card) => card.id === id(90))).toBeUndefined();
  expect(result.state.cards.find((card) => card.id === id(91))).toBeUndefined();
  expect(result.state.cards.find((card) => card.id === id(92))).toMatchObject({ position: 4 });
  expect(resolveOperations(state, operations, allocations, ["activity", "step", "selection"]).selectedOperationIds).toEqual(["activity", "step"]);
});

it("resolves the selected deletion Story Map through its earlier local alias", () => {
  const state = placementSnapshot();
  const operations: ChangeOperation[] = [
    { operationId: "map", op: "create", entity: "storyMap", entityId: "map-alias", after: { projectId: id(1), name: "New map" } },
    { operationId: "card", op: "create", entity: "card", entityId: "card-alias", after: { storyMapId: id(90), level: "activity", title: "Selected" } },
    { operationId: "selection", op: "delete", entity: "card", entityId: "card-alias", baseVersion: 1, after: { strategy: "unassign", selection: { storyMapId: "map-alias", cards: [{ id: "card-alias", baseVersion: 1 }], affectedCards: [] } } }
  ];
  const allocations = { ...supply, ids: { map: id(90), card: id(91) } };
  assertDependencyParity(state, operations, allocations);
  expect(collectOperationConflicts(state, operations, allocations)).toEqual([]);
  expect(resolveOperations(state, operations, allocations).state.cards.some((card) => card.id === id(91))).toBe(false);
});
