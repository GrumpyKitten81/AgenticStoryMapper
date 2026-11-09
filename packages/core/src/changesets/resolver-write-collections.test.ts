import { afterEach, expect, it, vi } from "vitest";
import { remoteWorkItemSyncStateSchema, connectorConnectionSchema, type ChangeOperation, type OperationSnapshot, type OperationSupply } from "@storymapper/contracts";
import { operationRegistry, resolveOperation, resolveOperations, sourcePlanProjection } from "@storymapper/core";
import { CHANGE_COLLECTIONS } from "@storymapper/core/changesets/remaining-owners";
import * as writes from "@storymapper/core/changesets/resolver-write-collections";
import { copyRows } from "@storymapper/core/changesets/copy-resolution";
import * as core from "@storymapper/core/changesets/fixtures/operation-resolution-fixture";
import * as remaining from "@storymapper/core/changesets/fixtures/remaining-operation-resolution-fixture";

const ALL = new Set(Object.values(CHANGE_COLLECTIONS));
const { id, op, chunkId } = remaining;
type Case = { operation: ChangeOperation; state: OperationSnapshot; supply: OperationSupply };
afterEach(() => vi.restoreAllMocks());

function cases(): Case[] {
  const additional = extraCases();
  return [
    ...core.coreMembers.map((member) => {
      const operation = core.operation({ operationId: "test", ...member });
      const state = core.snapshot();
      if (operation.op === "unlink") state.sourceLinks.push({ kind: "note", id: id(9), cardId: id(5), note: "Evidence", createdAt: core.createdAt });
      return { operation, state, supply: core.supply([operation]) };
    }),
    ...remaining.members.map(([command, entity, number, after]) => {
      const operation = op({ op: command, entity, ...(number ? { entityId: id(number) } : {}), after });
      const state = remaining.snapshot();
      if (command === "unpark") state.cards[0]!.parked = true;
      if (command === "unarchive") state.cards[0]!.status = "archived";
      return { operation, state, supply: remaining.supply() };
    }),
    ...(["card", "release", "persona"] as const).map((entity) => {
      const operation = core.upsert(entity);
      return { operation, state: core.snapshot(), supply: core.supply([operation]) };
    }),
    ...additional
  ];
}

function extraCases(): Case[] {
  const state = remaining.snapshot();
  const supply = remaining.supply();
  const document = { ...state.sourceDocuments[0]!, id: id(100), title: "New", fileHash: "b".repeat(64) };
  const copyState = remaining.snapshot();
  copyState.mapFingerprints = { [id(2)]: chunkId };
  const copyIds = Object.fromEntries(Object.values(copyRows(copyState, id(2))).flat().map((row, index) => [row.id, id(400 + index)]));
  return [
    { state, operation: op({ op: "import", entity: "sourceDocument", after: { projectId: id(1), title: "New", type: "txt", fileHash: document.fileHash } }), supply: { ...supply, preparedSourceImports: { test: { document, chunks: [{ id: "c".repeat(64), documentId: document.id, locator: "L1", text: "New requirement" }] } } } },
    { state: copyState, operation: op({ op: "create", entity: "storyMapCopy", entityId: id(100), after: { input: { sourceStoryMapId: id(2), targetName: "Copy" }, expected: { [id(2)]: chunkId }, preview: { source: { id: id(2), name: "Map" }, target: { id: id(100), name: "Copy" }, inventory: {} } } }), supply: { ...supply, copyIds: { test: copyIds } } },
    { state, operation: op({ op: "create", entity: "githubBoardImport", entityId: "board", after: { input: { projectId: id(1), storyMapName: "Imported", boardUrl: "https://github.com/orgs/org/projects/1", issues: [] }, expected: {}, preview: { connectors: [], sync: { removals: [], overwrites: [] }, cleanup: [] } } }), supply },
    ...(["set", "unset"] as const).map((command) => ({ state: { ...state, cardDependencies: command === "unset" ? [{ id: id(90), cardId: id(3), prerequisiteCardId: id(30), createdAt: remaining.createdAt }] : [] }, operation: op({ op: command, entity: "cardDependency", after: { cardId: { kind: "id", id: id(3) }, prerequisiteCardId: { kind: "id", id: id(30) } } }), supply })),
    ...syncCases(), acknowledgmentCase()
  ];
}

function syncCases(): Case[] {
  const state = remaining.snapshot();
  state.connections = [connectorConnectionSchema.parse({ id: id(50), projectId: id(1), provider: "github", name: "GitHub", authMode: "github-cli", owner: "org", repository: "repo", createdAt: remaining.createdAt, updatedAt: remaining.createdAt })];
  const link = { connectionId: id(50), externalRefId: id(19), syncState: "conflict" as const, parentOverrideLocal: false, labels: [] };
  const run = { projectId: id(1), storyMapId: id(2), connectionId: id(50), provider: "github" as const, mode: "sync" as const, status: "applied" as const, summary: "Reviewed" };
  const conflict = { externalRefId: id(19), syncRunId: id(61), connectionId: id(50), cardId: id(3), remoteId: "1", field: "title" as const, localValue: "Activity", remoteValue: "Remote", status: "open" as const };
  state.remoteWorkItemLinks = [{ ...link, id: id(60), provider: "github", cardId: id(3), remoteId: "1", remoteNumber: 1, url: "https://github.com/org/repo/issues/1" }];
  state.syncRuns = [{ ...run, id: id(61), createdAt: remaining.createdAt }];
  state.syncConflicts = [{ ...conflict, id: id(62), createdAt: remaining.createdAt }];
  return [op({ op: "set", entity: "remoteWorkItemLink", after: link }), op({ op: "create", entity: "syncRun", entityId: "run-local", after: run }),
    op({ op: "create", entity: "syncConflict", entityId: "conflict-local", after: conflict }), op({ op: "resolve", entity: "syncConflict", entityId: id(62), before: state.syncConflicts![0], after: { resolution: "remote", reviewed: { localValue: "Activity", remoteValue: "Remote" } } })]
    .map((operation) => ({ state, operation, supply: remaining.supply() }));
}

function acknowledgmentCase(): Case {
  const initial = core.snapshot();
  initial.cards.find((card) => card.id === id(5))!.releaseId = id(6);
  const bind = op({ operationId: "bind", entityId: "binding", op: "set", entity: "externalRef", after: { entityType: "card", entityId: id(5), system: "source", externalId: "story", scopeId: id(2) } });
  const supply = core.supply([bind]);
  const state = resolveOperations(initial, [bind], supply).state;
  const baseline = state.sourcePlanBaselines![0]!;
  state.cards.find((card) => card.id === id(5))!.version = 2;
  const current = state.cards.find((card) => card.id === id(5))!;
  const operation = op({ op: "acknowledge", entity: "sourcePlan", after: { storyMapId: id(2), system: "source", baselineId: baseline.id, baselineVersion: baseline.version,
    entries: [{ cardId: id(5), before: baseline.entries[0], current, binding: state.externalRefs[0], source: sourcePlanProjection(current, true) }] } });
  return { state, operation, supply };
}

const catalogCases = cases();
it("covers every supported resolver key with an executed full-reference case", () => {
  expect(catalogCases.map(({ operation }) => `${operation.op}:${operation.entity}`).sort()).toEqual(Object.keys(operationRegistry).sort());
});

it.each(catalogCases)("matches full reference effects, order and state for $operation.op:$operation.entity", (entry) => { assertFullReference(entry); });

function assertFullReference({ state, operation, supply }: Case) {
  const input = structuredClone({ state, operation, supply });
  const copy = writes.copyWritableCollections;
  const guard = vi.spyOn(writes, "copyWritableCollections").mockImplementation((current, writable) => {
    const before = copy(current, writable);
    for (const collection of ALL) if (!writable.has(collection)) freeze(before[collection]);
    return before;
  });
  const evidence = { titleHash: "remote-title", bodyHash: "body", statusLabels: [], annotationLabels: [], milestone: null, releaseMetadata: null };
  const execute = () => operation.entity === "syncConflict" && operation.op === "resolve"
    ? resolveOperations(state, [op({ operationId: "field", op: "update", entity: "card", entityId: state.cards[0]!.id, after: { title: "Remote" } }), op({ operationId: "baseline", op: "set", entity: "remoteWorkItemLink", before: state.remoteWorkItemLinks[0], after: { ...remoteWorkItemSyncStateSchema.omit({ id: true }).parse(state.remoteWorkItemLinks[0]), baseline: { pendingReleaseAssignment: false, acknowledgedLocal: { ...evidence, releaseId: state.cards[0]!.releaseId }, observedRemote: evidence } } }), operation], { ...supply, syncTextHashes: { Remote: "remote-title" } }).operations.at(-1)!
    : resolveOperation(state, operation, supply);
  const optimized = execute();
  guard.mockRestore();
  const reference = fullReference(execute);
  expect(optimized).toEqual(reference);
  expect({ state, operation, supply }).toEqual(input);
  return optimized;
}

function fullReference<T>(read: () => T): T {
  const selection = vi.spyOn(writes, "resolverWriteCollections").mockReturnValue(ALL);
  const copy = vi.spyOn(writes, "copyWritableCollections").mockImplementation((state) => structuredClone(state));
  try { return read(); }
  finally { selection.mockRestore(); copy.mockRestore(); }
}

function freeze(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}

it("copies only writable collections and shares untouched before-collections without mutating them", () => {
  const state = core.snapshot();
  const writable = writes.resolverWriteCollections("update:card");
  const before = writes.copyWritableCollections(state, writable);
  expect(before.cards).not.toBe(state.cards);
  expect(before.cards[0]).not.toBe(state.cards[0]);
  expect(before.sourceDocuments).toBe(state.sourceDocuments);
  expect(before.sourceChunks).toBe(state.sourceChunks);
  expect(before.releases).toBe(state.releases);
});

it("retains independent public histories and full-reference publication effects with large untouched source text", () => {
  const state = core.snapshot();
  const text = state.sourceChunks[0]!.text.repeat(1000);
  state.sourceChunks = Array.from({ length: 1000 }, (_, index) => ({ ...state.sourceChunks[0]!, id: index.toString(16).padStart(64, "0"), locator: `L${index + 1}`, text }));
  const publication = core.upsert("card", "publish");
  if (publication.op !== "upsert" || publication.entity !== "card") throw new Error("Expected Card publication");
  publication.after.releaseId = id(6);
  const operations = [publication, core.operation({ operationId: "later", op: "update", entity: "release", entityId: id(6), after: { name: "Renamed" } })];
  const supply = core.supply(operations);
  const input = structuredClone(state);
  const result = resolveOperations(state, operations, supply);
  const compact = resolveOperations(state, operations, supply, undefined, { retainOperationStates: false });
  const reference = fullReference(() => resolveOperations(state, operations, supply));
  expect(result).toEqual(reference);
  expect(compact.state).toEqual(result.state);
  expect(compact.operations.map(({ state: _state, ...description }) => description)).toEqual(result.operations.map(({ state: _state, ...description }) => description));
  expect(result.operations[1]!.changes.some((change) => change.entity === "sourcePlanBaseline")).toBe(true);
  expect(state).toEqual(input);
  result.state.sourceChunks[0]!.text = "Final only";
  result.operations[0]!.state.sourceChunks[0]!.text = "First only";
  result.operations[0]!.changes.find((change) => change.entity === "card")!.after!.title = "First effect only";
  expect(result.operations[0]!.state.sourceChunks[0]!.text).toBe("First only");
  expect(result.operations[1]!.state.sourceChunks[0]!.text).toBe("Final only");
  expect(result.operations[1]!.state.cards.at(-1)!.title).toBe("Published");
  expect(state).toEqual(input);
  state.sourceChunks[0]!.text = "Input only";
  expect(result.state.sourceChunks[0]!.text).toBe("Final only");
});

it("includes acknowledged source recapture in a later unrelated Release resolver", () => {
  const { state, operation, supply } = acknowledgmentCase();
  const operations = [operation, core.operation({ operationId: "rename", op: "update", entity: "release", entityId: id(6), after: { name: "Renamed after acknowledgment" } })];
  const original = structuredClone({ state, operations, supply });
  const result = resolveOperations(state, operations, supply);
  expect(result).toEqual(fullReference(() => resolveOperations(state, operations, supply)));
  expect(result.operations[1]!.changes.map(({ entity }) => entity)).toEqual(["sourcePlanBaseline", "release"]);
  expect(result.operations[0]!.state.sourcePlanBaselines![0]!.entries[0]!.releaseName).toBe("MVP");
  expect(result.state.sourcePlanBaselines![0]!.entries[0]!.releaseName).toBe("Renamed after acknowledgment");
  expect({ state, operations, supply }).toEqual(original);
});

function populatedBoardCase(mode: "new" | "existing" | "cleanup"): Case {
  const state = remaining.snapshot();
  state.mapFingerprints = { [id(2)]: chunkId };
  if (mode === "existing") {
    state.connections = [connectorConnectionSchema.parse({ id: id(50), projectId: id(1), provider: "github", name: "GitHub", authMode: "github-cli", owner: "org", repository: "repo", readOnly: false, createdAt: remaining.createdAt, updatedAt: remaining.createdAt })];
    state.externalRefs.find((ref) => ref.id === id(19))!.entityId = id(30);
    state.githubLinks[0]!.cardId = id(30);
    state.sourceLinks[0]!.cardId = id(3);
    state.externalRefs.push({ id: id(90), entityType: "card", entityId: id(3), scopeId: id(2), system: "github", externalId: "https://github.com/org/repo/issues/9", syncedVersion: 1, createdAt: remaining.createdAt });
    state.githubLinks.push({ ...state.githubLinks[0]!, id: id(90), cardId: id(3), issueNumber: 9, url: "https://github.com/org/repo/issues/9" });
    state.sourceLinks.push({ kind: "github", id: id(91), cardId: id(30), externalRefId: id(90), repoFullName: "org/repo", issueNumber: 9, url: "https://github.com/org/repo/issues/9" });
    state.cardDependencies.push({ id: id(92), cardId: id(30), prerequisiteCardId: id(3), createdAt: remaining.createdAt });
    state.remoteWorkItemLinks.push({ id: id(93), externalRefId: id(90), remoteNumber: 9, connectionId: id(50), provider: "github", cardId: id(3), remoteId: "9", url: "https://github.com/org/repo/issues/9", syncState: "synced", labels: [], parentOverrideLocal: false });
  }
  const issues = [1, 2, 3].map((number) => ({ repository: "org/repo", number, title: `Imported ${number}`, body: "Reviewed issue body", state: "open", url: `https://github.com/org/repo/issues/${number}`,
    labels: [], assignee: null, milestone: null, issueType: number === 1 ? "epic" : number === 2 ? "feature" : "story", parentRepository: number === 1 ? null : "org/repo", parentNumber: number === 1 ? null : number - 1 }));
  const connection = state.connections[0];
  const operation = op({ op: "create", entity: "githubBoardImport", entityId: "board", after: {
    input: { projectId: id(1), ...(mode === "existing" ? { storyMapId: id(2), removeCardIds: [id(3)] } : {}), cleanup: mode === "cleanup", storyMapName: "Imported", boardUrl: "https://github.com/orgs/org/projects/1", issues },
    expected: mode === "new" ? {} : { [id(2)]: chunkId },
    preview: { connectors: [{ repository: "org/repo", existingId: connection?.id ?? null,
      before: connection ? { projectId: connection.projectId, provider: connection.provider, owner: connection.owner, repository: connection.repository, readOnly: connection.readOnly } : null, after: { readOnly: true } }], sync: { removals: [], overwrites: [] }, cleanup: [] }
  } });
  const boardIds: Record<string, string> = { "parking:activity": id(101), "parking:step": id(102), "connection:org/repo": id(103) };
  for (const issue of issues) for (const [index, kind] of ["card", "github", "remote"].entries()) boardIds[`${kind}:org/repo#${issue.number}`] = id(110 + issue.number * 3 + index);
  const boardHashes = Object.fromEntries(issues.map((issue) => [`org/repo#${issue.number}`, { titleHash: "b".repeat(64), bodyHash: "c".repeat(64) }]));
  return { state, operation, supply: { ...remaining.supply(), boardIds: { test: boardIds }, boardHashes: { test: boardHashes } } };
}

it.each(["new", "existing", "cleanup"] as const)("matches full-reference populated board import with %s identities and cleanup", (mode) => {
  const result = assertFullReference(populatedBoardCase(mode));
  const targetMap = mode === "existing" ? id(2) : id(100);
  expect(result.state.githubLinks.filter((link) => result.state.cards.some((card) => card.id === link.cardId && card.storyMapId === targetMap))).toHaveLength(3);
  expect(result.state.remoteWorkItemLinks).toHaveLength(3);
  expect(result.state.connections[0]!.readOnly).toBe(true);
  if (mode === "existing") {
    expect(result.state.cards.some((card) => card.id === id(3))).toBe(false);
    for (const entity of ["cardDependency", "cardPersona", "cardAnnotation", "attachment", "externalRef", "sourceLink", "remoteWorkItemLink"]) {
      expect(result.changes.some((change) => change.entity === entity && change.before && !change.after), entity).toBe(true);
    }
  }
  if (mode === "cleanup") expect(result.changes.some((change) => change.entity === "storyMap" && change.entityId === id(2) && !change.after)).toBe(true);
});

it.each(["reassign", "delete"] as const)("matches full-reference GitHub %s with shared and canonically hidden physical evidence", (action) => {
  const state = remaining.snapshot();
  state.cards[1]!.status = "archived";
  state.cards.push({ ...state.cards[1]!, id: id(40), key: "LSM-40", status: "todo", provenance: "manual" });
  state.sourceLinks.push({ kind: "github", id: id(71), cardId: id(3), externalRefId: id(19), repoFullName: "org/repo", issueNumber: 1, url: "https://github.com/org/repo/issues/1" });
  const operation = action === "reassign" ? op({ op: "update", entity: "githubExternalRef", entityId: id(19), after: { entityType: "card", entityId: id(40), scopeId: id(2), externalId: "https://github.com/org/repo/issues/2" } })
    : op({ op: "delete", entity: "githubExternalRef", entityId: id(19), after: {} });
  const result = assertFullReference({ state, operation, supply: remaining.supply() });
  expect(result.changes.filter(({ entity }) => entity === "sourceLink")).toHaveLength(2);
  const affected = action === "reassign" ? [id(3), id(30), id(40)] : [id(3), id(30)];
  expect(result.changes.filter(({ entity }) => entity === "card").map(({ entityId }) => entityId)).toEqual(affected);
  if (action === "reassign") {
    expect(result.state.githubLinks[0]!.cardId).toBe(id(40));
    expect(result.state.sourceLinks.every((link) => link.kind === "github" && link.url === "https://github.com/org/repo/issues/2")).toBe(true);
    expect(result.state.cards.filter((card) => affected.includes(card.id)).every((card) => card.provenance === "linked")).toBe(true);
  } else {
    expect(result.state.githubLinks).toEqual([]);
    expect(result.state.sourceLinks).toEqual([]);
    expect(result.state.cards.filter((card) => affected.includes(card.id)).every((card) => card.provenance === "manual")).toBe(true);
  }
});
