import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { connectorConnectionSchema, type ChangeOperation, type GitHubBoardIssue, type OperationSnapshot, type OperationSupply } from "@storymapper/contracts";
import { resolveOperation, resolveOperations } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

const ACTOR = { actorType: "human", actorId: "board-registry-golden" } as const;
const createdAt = "2026-10-12T00:00:00Z";
const key = (issue: GitHubBoardIssue) => `${issue.repository.toLowerCase()}#${issue.number}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
  const uow = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const project = uow.run(ACTOR, ({ repository }) => repository.createProject({ name: "Board registry" }));
  const issues: GitHubBoardIssue[] = [
    { repository: "Example/Repo", number: 3, title: "SM-3: Story", body: "Story body", state: "closed", url: "https://github.com/Example/Repo/issues/3", labels: [], assignee: "owner", milestone: "MVP", issueType: "story", parentRepository: "Example/Repo", parentNumber: 2 },
    { repository: "Example/Repo", number: 2, title: "SM-2: Feature", body: "Feature body", state: "open", url: "https://github.com/Example/Repo/issues/2", labels: ["status:active"], assignee: null, milestone: null, issueType: "feature", parentRepository: "Example/Repo", parentNumber: 1 },
    { repository: "Example/Repo", number: 1, title: "SM-1: Epic", body: "Epic body", state: "open", url: "https://github.com/Example/Repo/issues/1", labels: [], assignee: null, milestone: null, issueType: "epic", parentRepository: null, parentNumber: null }
  ];
  const proposal = uow.run(ACTOR, ({ repository }) => repository.proposeGitHubBoard({ projectId: project.id, storyMapName: "Imported", boardUrl: "https://github.com/orgs/Example/projects/1", issues, cleanup: false, removeCardIds: [] }));
  const operation = proposal.operations[0]!;
  const snapshot: OperationSnapshot = { projectId: project.id, projects: [project], storyMaps: [], cards: [], releases: [], personas: [], productContexts: [], roadmaps: [], roadmapColumns: [], roadmapSwimlanes: [], roadmapCards: [], roadmapReferences: [], annotations: [], workflowStatuses: [], storyTemplates: [], attachments: [], cardPersonas: [], cardAnnotations: [], cardDependencies: [], remoteWorkItemLinks: [], externalRefs: [], sourceDocuments: [], sourceChunks: [], sourceLinks: [], githubLinks: [], connections: [] };
  const identities = Object.fromEntries(["parking:activity", "parking:step", "connection:example/repo", ...issues.flatMap((issue) => [`card:${key(issue)}`, `github:${key(issue)}`, `remote:${key(issue)}`])].map((name) => [name, randomUUID()]));
  const supply: OperationSupply = { createdAt, creationOrigin: "manual", ids: { [operation.operationId]: randomUUID() }, externalRefIds: {}, boardIds: { [operation.operationId]: identities }, boardHashes: { [operation.operationId]: Object.fromEntries(issues.map((issue) => [key(issue), { titleHash: hash(issue.title), bodyHash: hash(issue.body) }])) } };
  return { handle, repository, uow, project, issues, proposal, operation, snapshot, supply };
}

function cardValues(state: Pick<OperationSnapshot, "cards">) {
  return state.cards.map((card) => ({ title: card.title, description: card.description, level: card.level, parent: state.cards.find((row) => row.id === card.parentId)?.title ?? null,
    status: card.status, assignee: card.assignee ?? null, parked: card.parked, position: card.position, version: card.version, creationOrigin: card.creationOrigin, provenance: card.provenance })).sort((a, b) => a.title.localeCompare(b.title) || a.level.localeCompare(b.level));
}

it("matches actual board import hierarchy, evidence, connector and remote-baseline effects without mutating reviewed input", () => {
  const data = fixture();
  try {
    const original = structuredClone({ snapshot: data.snapshot, operation: data.operation, supply: data.supply });
    const result = resolveOperation(data.snapshot, data.operation, data.supply);
    expect(resolveOperation(data.snapshot, data.operation, data.supply)).toEqual(result);
    const cardId = data.supply.boardIds![data.operation.operationId]!["card:example/repo#3"]!;
    const followups: ChangeOperation[] = [data.operation, { operationId: "edit-imported", op: "update", entity: "card", entityId: cardId, after: { title: "Edited import" } }, { operationId: "add-imported", op: "create", entity: "card", after: { storyMapId: data.supply.ids[data.operation.operationId]!, level: "activity", title: "Additional" } }];
    expect(resolveOperations(data.snapshot, followups, data.supply, ["edit-imported", "add-imported"]).selectedOperationIds).toEqual([]);

    expect({ snapshot: data.snapshot, operation: data.operation, supply: data.supply }).toEqual(original);
    data.uow.run(ACTOR, ({ repository }) => { repository.updateChangeSetStatus(data.proposal.id, "approved"); repository.applyChangeSet(data.proposal.id); });
    const map = data.repository.listStoryMaps(data.project.id)[0]!;
    const cards = data.repository.listCardsInInsertionOrder(map.id);
    expect(cardValues(result.state)).toEqual(cardValues({ cards }));
    const values = (state: Pick<OperationSnapshot, "cards" | "githubLinks">) => state.githubLinks.map((link) => ({ repo: link.repo, url: link.url, issueNumber: link.issueNumber, syncState: link.syncState, milestone: link.milestone ?? null, releaseId: link.releaseId ?? null, card: state.cards.find((card) => card.id === link.cardId)?.title })).sort((a, b) => a.issueNumber! - b.issueNumber!);
    expect(values(result.state)).toEqual(values({ cards, githubLinks: data.repository.listGitHubLinksForStoryMap(map.id) }));
    const remoteValues = (links: OperationSnapshot["remoteWorkItemLinks"]) => links.map(({ id: _id, cardId: _cardId, externalRefId: _refId, connectionId: _connectionId, lastSyncedAt: _time, ...row }) => row).sort((a, b) => a.remoteNumber! - b.remoteNumber!);
    expect(remoteValues(result.state.remoteWorkItemLinks)).toEqual(remoteValues(data.repository.listRemoteWorkItemLinksForStoryMap(map.id)));
    const connectionValues = (connections: OperationSnapshot["connections"]) => connections.map(({ id: _id, createdAt: _created, updatedAt: _updated, ...row }) => row);
    expect(connectionValues(result.state.connections)).toEqual(connectionValues(data.repository.listConnectorConnections(data.project.id)));
    expect(new Set(result.changes.map((change) => change.entity))).toEqual(new Set(["storyMap", "card", "externalRef", "connection", "remoteWorkItemLink"]));
  } finally { data.handle.current.$client.close(); }
});

it("rejects foreign scopes, missing preparation, connector drift and duplicate identities", () => {
  const data = fixture();
  try {
    const foreign = structuredClone(data.operation) as Extract<ChangeOperation, { entity: "githubBoardImport" }>;
    foreign.after.input.projectId = randomUUID();
    expect(() => resolveOperation(data.snapshot, foreign, data.supply)).toThrow("foreign");
    expect(() => resolveOperation(data.snapshot, data.operation, { ...data.supply, boardHashes: {} })).toThrow("hashes");
    expect(() => resolveOperation(data.snapshot, data.operation, { ...data.supply, boardIds: {} })).toThrow("identity");
    const drift = structuredClone(data.snapshot);
    drift.connections.push(connectorConnectionSchema.parse({ id: randomUUID(), projectId: data.project.id, name: "Example/Repo", provider: "github", owner: "Example", repository: "Repo", authMode: "token", createdAt, updatedAt: createdAt }));
    expect(() => resolveOperation(drift, data.operation, data.supply)).toThrow("connectors changed");
    const identities = { ...data.supply.boardIds![data.operation.operationId] };
    identities["parking:step"] = identities["parking:activity"]!;
    expect(() => resolveOperation(data.snapshot, data.operation, { ...data.supply, boardIds: { [data.operation.operationId]: identities } })).toThrow("identity");
  } finally { data.handle.current.$client.close(); }
});

it("matches scoped sync updates, clearing assignees and milestones while retaining hierarchy and origin", () => {
  const data = fixture();
  try {
    data.uow.run(ACTOR, ({ repository }) => { repository.updateChangeSetStatus(data.proposal.id, "approved"); repository.applyChangeSet(data.proposal.id); });
    const map = data.repository.listStoryMaps(data.project.id)[0]!;
    const issues = data.issues.map((issue) => ({ ...issue, title: `${issue.title} updated`, assignee: null, milestone: null }));
    const proposal = data.uow.run(ACTOR, ({ repository }) => repository.proposeGitHubBoard({ projectId: data.project.id, storyMapId: map.id, storyMapName: map.name, boardUrl: "https://github.com/orgs/Example/projects/1", issues, cleanup: false, removeCardIds: [] }));
    const operation = proposal.operations[0]! as Extract<ChangeOperation, { entity: "githubBoardImport" }>;
    const snapshot = { ...data.snapshot, storyMaps: [map], cards: data.repository.listCardsInInsertionOrder(map.id), githubLinks: data.repository.listGitHubLinksForStoryMap(map.id), externalRefs: data.repository.listExternalRefsForStoryMap(map.id), connections: data.repository.listConnectorConnections(data.project.id), remoteWorkItemLinks: data.repository.listRemoteWorkItemLinksForStoryMap(map.id), mapFingerprints: operation.after.expected };
    const supply = { ...data.supply, boardHashes: { [operation.operationId]: Object.fromEntries(issues.map((issue) => [key(issue), { titleHash: hash(issue.title), bodyHash: hash(issue.body) }])) } };
    const result = resolveOperation(snapshot, operation, supply);
    data.uow.run(ACTOR, ({ repository }) => { repository.updateChangeSetStatus(proposal.id, "approved"); repository.applyChangeSet(proposal.id); });
    expect(cardValues(result.state)).toEqual(cardValues({ cards: data.repository.listCardsInInsertionOrder(map.id) }));
    expect(result.state.githubLinks.every((link) => !link.milestone)).toBe(true);
    expect(result.state.remoteWorkItemLinks.every((link) => link.milestone === null)).toBe(true);
    const drift = { ...snapshot, mapFingerprints: { [map.id]: "0".repeat(64) } };
    expect(() => resolveOperation(drift, operation, supply)).toThrow("Story Map changed");
    const foreign = structuredClone(snapshot);
    foreign.storyMaps[0]!.projectId = randomUUID();
    expect(() => resolveOperation(foreign, operation, supply)).toThrow("another Project");
  } finally { data.handle.current.$client.close(); }
});

it("matches Card removal and cleanup effects and refuses removing an imported issue", () => {
  const data = fixture();
  try {
    data.uow.run(ACTOR, ({ repository }) => { repository.updateChangeSetStatus(data.proposal.id, "approved"); repository.applyChangeSet(data.proposal.id); });
    const map = data.repository.listStoryMaps(data.project.id)[0]!;
    const cards = data.repository.listCardsInInsertionOrder(map.id);
    const removed = cards.find((card) => card.title === "Story")!;
    const remaining = data.issues.filter((issue) => issue.number !== 3);
    const resolveProposal = (input: { storyMapId?: string; cleanup: boolean; removeCardIds: string[]; issues: GitHubBoardIssue[] }, supply: OperationSupply) => {
      const proposal = data.uow.run(ACTOR, ({ repository }) => repository.proposeGitHubBoard({ projectId: data.project.id, storyMapName: map.name, boardUrl: "https://github.com/orgs/Example/projects/1", ...input }));
      const operation = proposal.operations[0]! as Extract<ChangeOperation, { entity: "githubBoardImport" }>;
      const snapshot: OperationSnapshot = { ...data.snapshot, storyMaps: data.repository.listStoryMaps(data.project.id), cards: data.repository.listCardsInInsertionOrder(map.id), githubLinks: data.repository.listGitHubLinksForStoryMap(map.id), externalRefs: data.repository.listExternalRefsForStoryMap(map.id), connections: data.repository.listConnectorConnections(data.project.id), remoteWorkItemLinks: data.repository.listRemoteWorkItemLinksForStoryMap(map.id), mapFingerprints: operation.after.expected };
      return { proposal, operation, snapshot, supply: { ...supply, ids: { [operation.operationId]: randomUUID() }, boardIds: { [operation.operationId]: data.supply.boardIds![data.operation.operationId]! }, boardHashes: { [operation.operationId]: Object.fromEntries(input.issues.map((issue) => [key(issue), { titleHash: hash(issue.title), bodyHash: hash(issue.body) }])) } } };
    };
    const removal = resolveProposal({ storyMapId: map.id, cleanup: false, removeCardIds: [removed.id], issues: remaining }, data.supply);
    const removalResult = resolveOperation(removal.snapshot, removal.operation, removal.supply);
    expect(removalResult.state.cards.some((card) => card.id === removed.id)).toBe(false);
    expect(removalResult.changes.some((change) => change.entity === "card" && change.entityId === removed.id && change.before !== undefined && change.after === undefined)).toBe(true);
    expect(() => resolveOperation(removal.snapshot, { ...removal.operation, after: { ...removal.operation.after, input: { ...removal.operation.after.input, issues: data.issues } } }, removal.supply)).toThrow("cannot also be removed");
    data.uow.run(ACTOR, ({ repository }) => { repository.updateChangeSetStatus(removal.proposal.id, "approved"); repository.applyChangeSet(removal.proposal.id); });
    expect(cardValues(removalResult.state)).toEqual(cardValues({ cards: data.repository.listCardsInInsertionOrder(map.id) }));

    const cleanup = resolveProposal({ cleanup: true, removeCardIds: [], issues: remaining }, data.supply);
    const cleanupResult = resolveOperation(cleanup.snapshot, cleanup.operation, cleanup.supply);
    expect(cleanupResult.state.storyMaps.some((row) => row.id === map.id)).toBe(false);
    data.uow.run(ACTOR, ({ repository }) => { repository.updateChangeSetStatus(cleanup.proposal.id, "approved"); repository.applyChangeSet(cleanup.proposal.id); });
    expect(cleanupResult.state.storyMaps.map((row) => row.name)).toEqual(data.repository.listStoryMaps(data.project.id).map((row) => row.name));
    const survivingMap = data.repository.listStoryMaps(data.project.id)[0]!;
    expect(cardValues({ cards: cleanupResult.state.cards.filter((card) => cleanupResult.state.storyMaps.some((row) => row.id === card.storyMapId)) })).toEqual(cardValues({ cards: data.repository.listCardsInInsertionOrder(survivingMap.id) }));
  } finally { data.handle.current.$client.close(); }
});

it("retains imported structural prerequisites when a prepared Card is moved before its Activity deletion", () => {
  const data = fixture();
  try {
    const ids = data.supply.boardIds![data.operation.operationId]!;
    const operations: ChangeOperation[] = [data.operation,
      { operationId: "move-child", op: "move", entity: "card", entityId: ids["card:example/repo#2"]!, after: { parentId: null, position: 0 } },
      { operationId: "delete-activity", op: "delete", entity: "card", entityId: ids["card:example/repo#1"]!, after: { strategy: "unassign" } }
    ];
    const full = resolveOperations(data.snapshot, operations, data.supply);
    expect(full.operations[2]!.dependencies).toContain("move-child");
    expect(resolveOperations(data.snapshot, operations, data.supply, [data.operation.operationId, "delete-activity"]).selectedOperationIds).toEqual([data.operation.operationId]);
  } finally { data.handle.current.$client.close(); }
});
