import { splitMarkdownIntoChunks, splitTextIntoChunks } from "@storymapper/importers";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cardHistorySnapshotSchema, cardSourceLinkSchema, type ActorContext } from "@storymapper/contracts";
import { openStoryMapperDb } from "@storymapper/db/connection";
import { DatabaseHandle } from "@storymapper/db/database-handle";
import { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { copyStoryMap } from "@storymapper/db/repositories/map-copy-repository";
import { hashText } from "@storymapper/db/repositories/repository-values";
import { UnitOfWork } from "@storymapper/db/unit-of-work";
import { ChangeSetConflictError } from "@storymapper/db/repositories/repository-errors";

const HUMAN: ActorContext = { actorType: "human", actorId: "creator" };
const AGENT: ActorContext = { actorType: "agent", actorId: "remover", mcpSessionId: "provenance-session" };
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach((close) => close()));

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-provenance-"));
  const path = join(directory, "storymapper.sqlite");
  const database = openStoryMapperDb(path);
  cleanup.push(() => { if (database.$client.open) database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const handle = new DatabaseHandle(database);
  const uow = new UnitOfWork(handle);
  const read = new StoryMapperRepository(handle);
  const data = uow.run(HUMAN, ({ repository }) => {
    const project = repository.createProject({ name: "Provenance" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Human Card" }, "human");
    const release = repository.createRelease({ storyMapId: map.id, name: "Release" });
    const content = "# Evidence\n\nSource text";
    const imported = repository.importSourceDocument({ parsedChunks: splitMarkdownIntoChunks(content), projectId: project.id, title: "Origin document", type: "markdown", content, fileHash: hashText(content) });
    return { project, map, card, release, imported };
  });
  return { ...data, path, database, uow, read };
}

function state(data: ReturnType<typeof fixture>) {
  return data.database.$client.prepare("SELECT total_changes() AS changes").get();
}

describe("immutable creation origin and typed evidence", () => {
  it("classifies actual creation paths independently of the approving or latest actor", testClassifiesActualCreationPathsIndependentlyOfTheApprovingOrLatestActor);

  it.each(["manual", "inference"] as const)("keeps %s origin through mixed evidence and final removal by another actor", (origin) => {
    const data = fixture();
    const card = origin === "manual" ? data.card : data.uow.run(AGENT, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "story", title: "Inferred" }));
    const issue = data.uow.run(HUMAN, ({ repository }) => repository.createGitHubLink({ releaseId: data.release.id, repo: "owner/repo", issueNumber: 17, url: "https://github.com/owner/repo/issues/17" }));
    const links = data.uow.run(HUMAN, ({ repository }) => [
      repository.createCardSourceLink(card.id, { kind: "chunk", chunkId: data.imported.chunks[0]!.id })!,
      repository.createCardSourceLink(card.id, { kind: "github", externalRefId: issue.id })!,
      repository.createCardSourceLink(card.id, { kind: "note", note: "  /private/source.txt was discussed  " })!
    ]);
    links.forEach((link) => expect(cardSourceLinkSchema.safeParse(link).success).toBe(true));
    expect(links[2]).toMatchObject({ kind: "note", note: "/private/source.txt was discussed" });
    expect(data.read.getCard(card.id)).toMatchObject({ creationOrigin: origin, provenance: "linked", version: 2 });
    expect(data.read.getGitHubLink(issue.id)).toMatchObject({ releaseId: data.release.id });
    const beforeDuplicate = state(data);
    data.uow.run(HUMAN, ({ repository }) => repository.createCardSourceLink(card.id, { kind: "github", externalRefId: issue.id }));
    expect(state(data)).toEqual(beforeDuplicate);
    links.forEach((link, index) => {
      data.uow.run(AGENT, ({ repository }) => expect(repository.deleteCardSourceLink(card.id, { kind: link.kind, id: link.id })).toBe(true));
      expect(data.read.getCard(card.id)).toMatchObject({ creationOrigin: origin, provenance: index === 2 ? origin : "linked", version: index + 3 });
    });
    expect(data.read.listCardHistoryPage(card.id, { limit: 50 }).versions[0]).toMatchObject({ actor: AGENT.actorId, snapshot: { creationOrigin: origin, provenance: origin } });
    expect(data.read.listActivity(data.project.id).filter((event) => event.action === "cardSourceLink.deleted")).toHaveLength(3);
  });

  it("rejects missing/foreign evidence and blank notes without changing the Card or evidence", testRejectsMissingForeignEvidenceAndBlankNotesWithoutChangingTheCard);

  it("versions every canonical GitHub evidence owner on attach, edit, reassignment and deletion", testVersionsEveryCanonicalGitHubEvidenceOwnerOnAttachEditReassignmentAnd);

  it("rejects milestone-only identities and cross-Project reassignment, then versions evidence removal on Release deletion", testRejectsMilestoneOnlyIdentitiesAndCrossProjectReassignmentThenVersionsEvidence);

  it("retains evidence through reopen and copy without changing historical origin", testRetainsEvidenceThroughReopenAndCopyWithoutChangingHistoricalOrigin);

  it("refuses drifted databases missing provenance columns", testRefusesDriftedDatabasesMissingProvenanceColumns);
});

describe("provenance review regressions", () => {
  it("copies Release-owned Issue identity before its evidence attachment", testCopiesReleaseOwnedIssueIdentityBeforeItsEvidenceAttachment);

  it("leaves Card versions/history unchanged for GitHub bookkeeping and versions displayed evidence", testLeavesCardVersionsHistoryUnchangedForGitHubBookkeepingAndVersionsDisplayed);

  it("unlinks an attachment after the same-Project owning Map is logically deleted", testUnlinksAnAttachmentAfterTheSameProjectOwningMapIsLogically);

  it("refuses a stale approved copy when an attached other-map identity changes and preserves copied origin/history", testRefusesAStaleApprovedCopyWhenAnAttachedOtherMapIdentity);

  it("updates and deletes canonical evidence atomically for Cards in logically deleted Maps", testUpdatesAndDeletesCanonicalEvidenceAtomicallyForCardsInLogicallyDeleted);

  it("reopens consistent provenance without any domain writes", () => {
    const data = fixture();
    data.uow.run(HUMAN, ({ repository }) => repository.createCardSourceLink(data.card.id, { kind: "note", note: "Recorded evidence" }));
    const before = data.read.getCard(data.card.id);
    const evidence = data.read.listSourceLinksForStoryMap(data.map.id);
    const history = data.read.listCardHistory(data.card.id);
    data.database.$client.close();
    const reopened = openStoryMapperDb(data.path);
    cleanup.push(() => reopened.$client.close());
    expect(reopened.$client.prepare("SELECT total_changes() AS changes").get()).toEqual({ changes: 0 });
    const read = new StoryMapperRepository(new DatabaseHandle(reopened));
    expect(read.getCard(data.card.id)).toEqual(before);
    expect(read.listSourceLinksForStoryMap(data.map.id)).toEqual(evidence);
    expect(read.listCardHistory(data.card.id)).toEqual(history);
  });

  it("finalizes surviving evidence owners when the canonical identity-owning Card is deleted", () => {
    const data = fixture();
    const survivor = data.uow.run(AGENT, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "story", title: "Survivor" }));
    const identity = data.uow.run(HUMAN, ({ repository }) => repository.createGitHubLink({ cardId: data.card.id, repo: "owner/repo", issueNumber: 1, url: "https://github.com/owner/repo/issues/1" }));
    data.uow.run(HUMAN, ({ repository }) => repository.createCardSourceLink(survivor.id, { kind: "github", externalRefId: identity.id }));
    data.uow.run(AGENT, ({ repository }) => repository.deleteCard(data.card.id, { strategy: "unassign" }));
    expect(data.read.getCard(survivor.id)).toMatchObject({ creationOrigin: "inference", provenance: "inference", version: 3 });
    expect(data.read.listSourceLinksForStoryMap(data.map.id)).toEqual([]);
    expect(data.read.listCardHistory(survivor.id).at(-1)).toMatchObject({ actor: AGENT.actorId, actorType: "agent", snapshot: { provenance: "inference", version: 3 } });
    const activity = data.read.listActivity(data.project.id).find((event) => event.action === "card.deleted" && event.affectedEntityId === data.card.id)!;
    expect(activity).toMatchObject({ actor: AGENT.actorId, actorType: "agent" });
    const row = data.database.$client.prepare("SELECT live_entities_json FROM activity_events WHERE id = ?").get(activity.id) as { live_entities_json: string };
    expect(JSON.parse(row.live_entities_json)).toContainEqual(expect.objectContaining({ entityType: "card", entityId: survivor.id, version: 3 }));
  });
});

function testClassifiesActualCreationPathsIndependentlyOfTheApprovingOrLatestActor() {
  const data = fixture();
  expect(data.card).toMatchObject({ creationOrigin: "manual", provenance: "manual" });
  const direct = data.uow.run(AGENT, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "story", title: "Agent" }, "human"));
  expect(direct).toMatchObject({ creationOrigin: "inference", provenance: "inference" });
  for (const source of ["ai", "mcp", "import", "template"] as const) {
    const created = data.uow.run(HUMAN, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "story", title: source }, source));
    expect(created).toMatchObject({ creationOrigin: "inference", provenance: "inference" });
  }
  const proposal = data.uow.run(AGENT, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: data.project.id,
    title: "Proposed", source: "ai", status: "proposed", createdAt: new Date().toISOString(),
    operations: [{ operationId: "fixture-operation-1", op: "create", entity: "card", entityId: "created", after: { storyMapId: data.map.id, title: "Approved AI", level: "story" } }] }));
  data.uow.run(HUMAN, ({ repository }) => { repository.updateChangeSetStatus(proposal.id, "approved"); repository.applyChangeSet(proposal.id); });
  expect(data.read.listCards(data.map.id).find((card) => card.title === "Approved AI")).toMatchObject({ creationOrigin: "inference", provenance: "inference" });
  const edited = data.uow.run(AGENT, ({ repository }) => repository.updateCard(data.card.id, { title: "Agent edited human" }));
  expect(edited).toMatchObject({ creationOrigin: "manual", provenance: "manual" });
}

function testRejectsMissingForeignEvidenceAndBlankNotesWithoutChangingTheCard() {
  const data = fixture();
  const foreign = data.uow.run(HUMAN, ({ repository }) => {
    const project = repository.createProject({ name: "Foreign" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Foreign map" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Foreign" });
    const doc = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks("Foreign"), projectId: project.id, title: "Foreign", type: "txt", content: "Foreign", fileHash: hashText("Foreign") });
    const issue = repository.createGitHubLink({ cardId: card.id, repo: "foreign/repo", issueNumber: 1, url: "https://github.com/foreign/repo/issues/1" });
    return { chunk: doc.chunks[0]!, issue };
  });
  const before = data.read.getCard(data.card.id);
  for (const input of [{ kind: "note", note: "   " }, { kind: "chunk", chunkId: foreign.chunk.id },
    { kind: "chunk", chunkId: "a".repeat(64) }, { kind: "github", externalRefId: foreign.issue.id }, { kind: "github", externalRefId: randomUUID() }] as const) {
    expect(() => data.uow.run(HUMAN, ({ repository }) => repository.createCardSourceLink(data.card.id, input))).toThrow();
    expect(data.read.getCard(data.card.id)).toEqual(before);
    expect(data.read.listSourceLinksForStoryMap(data.map.id)).toEqual([]);
  }
}

function testVersionsEveryCanonicalGitHubEvidenceOwnerOnAttachEditReassignmentAnd() {
  const data = fixture();
  const second = data.uow.run(HUMAN, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "story", title: "Second" }));
  const third = data.uow.run(HUMAN, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "story", title: "Third" }));
  const issue = data.uow.run(HUMAN, ({ repository }) => repository.createGitHubLink({ cardId: data.card.id, repo: "owner/repo", issueNumber: 1, url: "https://github.com/owner/repo/issues/1" }));
  data.uow.run(HUMAN, ({ repository }) => repository.createCardSourceLink(second.id, { kind: "github", externalRefId: issue.id }));
  expect(data.read.getCard(data.card.id)).toMatchObject({ version: 2, provenance: "linked" });
  data.uow.run(AGENT, ({ repository }) => repository.updateGitHubLink(issue.id, { cardId: third.id, url: "https://github.com/owner/repo/issues/2", issueNumber: 2 }));
  expect(data.read.getCard(data.card.id)).toMatchObject({ version: 3, provenance: "manual" });
  expect(data.read.getCard(second.id)).toMatchObject({ version: 3, provenance: "linked" });
  expect(data.read.getCard(third.id)).toMatchObject({ version: 2, provenance: "linked" });
  expect(data.read.listSourceLinksForStoryMap(data.map.id).filter((link) => link.kind === "github")).toEqual(expect.arrayContaining([expect.objectContaining({ issueNumber: 2, cardId: second.id }), expect.objectContaining({ issueNumber: 2, cardId: third.id })]));
  data.uow.run(AGENT, ({ repository }) => repository.deleteGitHubLink(issue.id));
  expect(data.read.getCard(second.id)).toMatchObject({ version: 4, provenance: "manual" });
  expect(data.read.getCard(third.id)).toMatchObject({ version: 3, provenance: "manual" });
}

function testRejectsMilestoneOnlyIdentitiesAndCrossProjectReassignmentThenVersionsEvidence() {
  const data = fixture();
  const milestone = data.uow.run(HUMAN, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Milestone owner" });
    return repository.createGitHubLink({ releaseId: release.id, repo: "owner/repo", url: "https://github.com/owner/repo/milestone/1" });
  });
  expect(() => data.uow.run(HUMAN, ({ repository }) => repository.createCardSourceLink(data.card.id, { kind: "github", externalRefId: milestone.id }))).toThrow("GitHub Issue not found");
  expect(data.read.getCard(data.card.id)).toMatchObject({ version: 1, provenance: "manual" });
  const issue = data.uow.run(HUMAN, ({ repository }) => repository.createGitHubLink({ releaseId: data.release.id, repo: "owner/repo", issueNumber: 1, url: "https://github.com/owner/repo/issues/1" }));
  data.uow.run(HUMAN, ({ repository }) => repository.createCardSourceLink(data.card.id, { kind: "github", externalRefId: issue.id }));
  const foreign = data.uow.run(HUMAN, ({ repository }) => {
    const project = repository.createProject({ name: "Other" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Other" });
    return repository.createRelease({ storyMapId: map.id, name: "Other" });
  });
  expect(() => data.uow.run(HUMAN, ({ repository }) => repository.updateGitHubLink(issue.id, { releaseId: foreign.id }))).toThrow("another Project");
  expect(data.read.getGitHubLink(issue.id)).toMatchObject({ releaseId: data.release.id });
  data.uow.run(AGENT, ({ repository }) => repository.deleteRelease(data.release.id));
  expect(data.read.getCard(data.card.id)).toMatchObject({ version: 3, creationOrigin: "manual", provenance: "manual" });
  expect(data.read.listSourceLinksForStoryMap(data.map.id)).toEqual([]);
  expect(data.read.listCardHistoryPage(data.card.id, { limit: 50 }).versions[0]).toMatchObject({ actorType: "agent", snapshot: { provenance: "manual" } });
}

function testRetainsEvidenceThroughReopenAndCopyWithoutChangingHistoricalOrigin() {
  const data = fixture();
  const issue = data.uow.run(HUMAN, ({ repository }) => repository.createGitHubLink({ cardId: data.card.id, repo: "owner/repo", issueNumber: 2, url: "https://github.com/owner/repo/issues/2" }));
  data.uow.run(HUMAN, ({ repository }) => {
    repository.createCardSourceLink(data.card.id, { kind: "chunk", chunkId: data.imported.chunks[0]!.id });
    repository.createCardSourceLink(data.card.id, { kind: "note", note: "Retain note" });
  });
  const targetId = randomUUID();
  data.uow.run(HUMAN, ({ repository }) => copyStoryMap.call(repository, data.map.id, "Copy", targetId));
  const copy = data.read.getStoryMapSnapshot(targetId)!;
  expect(copy.cards[0]).toMatchObject({ creationOrigin: "inference", provenance: "linked" });
  expect(copy.sourceLinks.map((link) => link.kind).sort()).toEqual(["chunk", "github", "note"]);
  expect(copy.githubLinks[0]!.id).not.toBe(issue.id);
  data.database.$client.prepare("UPDATE cards SET creation_origin = 'unknown' WHERE id = ?").run(data.card.id);
  data.database.$client.close();
  const reopened = openStoryMapperDb(data.path);
  cleanup.push(() => reopened.$client.close());
  const read = new StoryMapperRepository(new DatabaseHandle(reopened));
  expect(read.getCard(data.card.id)).toMatchObject({ creationOrigin: "unknown", provenance: "linked" });
  expect(cardHistorySnapshotSchema.safeParse(read.getCard(data.card.id)).success).toBe(true);
  expect(read.listCardHistoryPage(data.card.id, { limit: 50 }).versions).toEqual(expect.arrayContaining([expect.objectContaining({ snapshot: expect.objectContaining({ creationOrigin: "manual", provenance: "linked" }) })]));
  new UnitOfWork(read.handle).run(AGENT, ({ repository }) => {
    for (const link of repository.listSourceLinksForStoryMap(data.map.id)) repository.deleteCardSourceLink(data.card.id, { kind: link.kind, id: link.id });
  });
  expect(read.getCard(data.card.id)).toMatchObject({ creationOrigin: "unknown", provenance: "unknown" });
}

function testRefusesDriftedDatabasesMissingProvenanceColumns() {
  const data = fixture();
  const [owner, attached, bare] = data.uow.run(HUMAN, ({ repository }) => {
    const cards = ["Owner", "Attached", "Bare"].map((title) => repository.createCard({ storyMapId: data.map.id, level: "story", title }, "human"));
    const issue = repository.createGitHubLink({ cardId: cards[0]!.id, repo: "owner/repo", issueNumber: 3, url: "https://github.com/owner/repo/issues/3" });
    repository.createCardSourceLink(cards[1]!.id, { kind: "github", externalRefId: issue.id });
    repository.createCardSourceLink(data.card.id, { kind: "chunk", chunkId: data.imported.chunks[0]!.id });
    return cards;
  });
  const sqlite = data.database.$client;
  sqlite.exec("ALTER TABLE cards DROP COLUMN creation_origin; ALTER TABLE cards DROP COLUMN provenance");
  sqlite.close();
  expect(() => openStoryMapperDb(data.path)).toThrow("inconsistent schema");
}

function testCopiesReleaseOwnedIssueIdentityBeforeItsEvidenceAttachment() {
  const data = fixture();
  const identity = data.uow.run(HUMAN, ({ repository }) => repository.createGitHubLink({ releaseId: data.release.id, repo: "owner/repo", issueNumber: 9, url: "https://github.com/owner/repo/issues/9" }));
  data.uow.run(HUMAN, ({ repository }) => repository.createCardSourceLink(data.card.id, { kind: "github", externalRefId: identity.id }));
  const target = randomUUID();
  data.uow.run(HUMAN, ({ repository }) => copyStoryMap.call(repository, data.map.id, "Copy release evidence", target));
  const copy = data.read.getStoryMapSnapshot(target)!;
  expect(copy.githubLinks).toHaveLength(1);
  expect(copy.githubLinks[0]).toMatchObject({ releaseId: copy.releases[0]!.id, issueNumber: 9 });
  expect(copy.githubLinks[0]!.id).not.toBe(identity.id);
  expect(copy.sourceLinks).toEqual([expect.objectContaining({ kind: "github", cardId: copy.cards[0]!.id, externalRefId: copy.githubLinks[0]!.id })]);
  data.uow.run(HUMAN, ({ repository }) => repository.deleteRelease(data.release.id));
  expect(data.read.getCard(copy.cards[0]!.id)).toMatchObject({ provenance: "linked", version: 1 });
}

function testLeavesCardVersionsHistoryUnchangedForGitHubBookkeepingAndVersionsDisplayed() {
  const data = fixture();
  const identity = data.uow.run(HUMAN, ({ repository }) => repository.createGitHubLink({ cardId: data.card.id, repo: "owner/repo", issueNumber: 1, url: "https://github.com/owner/repo/issues/1" }));
  const connection = data.uow.run(HUMAN, ({ repository }) => repository.createConnectorConnection({ projectId: data.project.id, provider: "github", name: "Bookkeeping", authMode: "token", owner: "owner", repository: "repo" }));
  const nextOwner = data.uow.run(HUMAN, ({ repository }) => repository.createCard({ storyMapId: data.map.id, title: "Next owner", level: "story" }));
  const before = data.read.getCard(data.card.id);
  const history = data.read.listCardHistory(data.card.id);
  for (const patch of [{ syncState: "synced" as const }, { milestone: "Milestone" }]) {
    data.uow.run(AGENT, ({ repository }) => repository.upsertRemoteWorkItemLink({ externalRefId: identity.id, connectionId: connection.id, labels: [], ...patch }));
    expect(data.read.getCard(data.card.id)).toEqual(before);
    expect(data.read.listCardHistory(data.card.id)).toEqual(history);
  }
  for (const [index, patch] of [{ repo: "owner/other", url: "https://github.com/owner/other/issues/1" }, { issueNumber: 2, url: "https://github.com/owner/other/issues/2" }, { issueNumber: 3, url: "https://github.com/owner/other/issues/3" }, { cardId: nextOwner.id }].entries()) {
    data.uow.run(AGENT, ({ repository }) => repository.updateGitHubLink(identity.id, patch));
    expect(data.read.getCard(data.card.id)!.version).toBe(before!.version + index + 1);
    expect(data.read.listCardHistory(data.card.id).at(-1)).toMatchObject({ actor: AGENT.actorId, version: before!.version + index + 1 });
  }
}

function testUnlinksAnAttachmentAfterTheSameProjectOwningMapIsLogically() {
  const data = fixture();
  const owner = data.uow.run(HUMAN, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: data.project.id, name: "Owner map" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Owner" });
    const identity = repository.createGitHubLink({ cardId: card.id, repo: "owner/repo", issueNumber: 1, url: "https://github.com/owner/repo/issues/1" });
    return { map, identity };
  });
  const attached = data.uow.run(HUMAN, ({ repository }) => repository.createCardSourceLink(data.card.id, { kind: "github", externalRefId: owner.identity.id }))!;
  data.uow.run(HUMAN, ({ repository }) => repository.deleteStoryMap(owner.map.id));
  expect(data.read.getGitHubLink(owner.identity.id)).toMatchObject({ url: "https://github.com/owner/repo/issues/1" });
  expect(data.read.listSourceLinksForStoryMap(data.map.id)).toContainEqual(attached);
  data.uow.run(AGENT, ({ repository }) => expect(repository.deleteCardSourceLink(data.card.id, { kind: "github", id: attached.id })).toBe(true));
  expect(data.read.getCard(data.card.id)).toMatchObject({ provenance: "manual", version: 3 });
}

function testRefusesAStaleApprovedCopyWhenAnAttachedOtherMapIdentity() {
  const data = fixture();
  const identity = data.uow.run(HUMAN, ({ repository }) => {
    const ownerMap = repository.createStoryMap({ projectId: data.project.id, name: "Identity owner" });
    const ownerCard = repository.createCard({ storyMapId: ownerMap.id, level: "story", title: "Owner" });
    const identity = repository.createGitHubLink({ cardId: ownerCard.id, repo: "owner/repo", issueNumber: 4, url: "https://github.com/owner/repo/issues/4" });
    repository.createCardSourceLink(data.card.id, { kind: "github", externalRefId: identity.id });
    return identity;
  });
  const proposal = data.uow.run(HUMAN, ({ repository }) => repository.proposeStoryMapCopy({ sourceStoryMapId: data.map.id, targetName: "Stale copy" }));
  data.uow.run(HUMAN, ({ repository }) => repository.updateChangeSetStatus(proposal.id, "approved"));
  const originalVersion = data.read.getCard(data.card.id)!.version;
  data.uow.run(AGENT, ({ repository }) => repository.updateGitHubLink(identity.id, { issueNumber: 5, url: "https://github.com/owner/repo/issues/5" }));
  expect(data.read.getCard(data.card.id)!.version).toBe(originalVersion + 1);
  const before = state(data);
  expect(() => data.uow.run(HUMAN, ({ repository }) => repository.applyChangeSet(proposal.id))).toThrowError(ChangeSetConflictError);
  expect(state(data)).toEqual(before);
  expect(data.read.listStoryMaps(data.project.id).some((map) => map.name === "Stale copy")).toBe(false);
  const fresh = data.uow.run(HUMAN, ({ repository }) => repository.proposeStoryMapCopy({ sourceStoryMapId: data.map.id, targetName: "Fresh copy" }));
  data.uow.run(HUMAN, ({ repository }) => { repository.updateChangeSetStatus(fresh.id, "approved"); repository.applyChangeSet(fresh.id); });
  const copyMap = data.read.listStoryMaps(data.project.id).find((map) => map.name === "Fresh copy")!;
  const copied = data.read.listCards(copyMap.id)[0]!;
  expect(copied).toMatchObject({ creationOrigin: "inference", provenance: "linked", version: 1 });
  expect(data.read.listSourceLinksForStoryMap(copyMap.id)[0]).toMatchObject({ kind: "github", externalRefId: identity.id });
  data.uow.run(AGENT, ({ repository }) => repository.updateGitHubLink(identity.id, { issueNumber: 6, url: "https://github.com/owner/repo/issues/6" }));
  expect(data.read.getCard(copied.id)).toMatchObject({ creationOrigin: "inference", provenance: "linked", version: 2 });
  expect(data.read.listCardHistoryPage(copied.id, { limit: 50 }).versions[0]).toMatchObject({ actor: AGENT.actorId, snapshot: { creationOrigin: "inference", provenance: "linked" } });
  data.uow.run(AGENT, ({ repository }) => repository.deleteGitHubLink(identity.id));
  expect(data.read.getCard(copied.id)).toMatchObject({ creationOrigin: "inference", provenance: "inference", version: 3 });
  expect(data.read.getCard(data.card.id)).toMatchObject({ creationOrigin: "manual", provenance: "manual" });
  expect(data.read.listSourceLinksForStoryMap(copyMap.id)).toEqual([]);
  expect(data.read.listCardHistoryPage(copied.id, { limit: 50 }).versions[0]).toMatchObject({ actor: AGENT.actorId, snapshot: { creationOrigin: "inference", provenance: "inference", version: 3 } });
}

function testUpdatesAndDeletesCanonicalEvidenceAtomicallyForCardsInLogicallyDeleted() {
  const data = fixture();
  const hidden = data.uow.run(HUMAN, ({ repository }) => {
    const identity = repository.createGitHubLink({ cardId: data.card.id, repo: "owner/repo", issueNumber: 8, url: "https://github.com/owner/repo/issues/8" });
    const map = repository.createStoryMap({ projectId: data.project.id, name: "Hidden evidence" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Hidden Card" }, "human");
    repository.createCardSourceLink(card.id, { kind: "github", externalRefId: identity.id });
    return { identity, map, card };
  });
  data.uow.run(HUMAN, ({ repository }) => repository.deleteStoryMap(hidden.map.id));
  expect(data.read.getCard(hidden.card.id)).toBeUndefined();
  const stored = () => data.database.$client.prepare("SELECT version, creation_origin, provenance FROM cards WHERE id = ?").get(hidden.card.id) as { version: number; creation_origin: string; provenance: string };
  const history = () => data.database.$client.prepare("SELECT actor, snapshot_json FROM card_versions WHERE card_id = ? ORDER BY version DESC LIMIT 1").get(hidden.card.id) as { actor: string; snapshot_json: string };
  const initialVersion = stored().version;
  data.uow.run(AGENT, ({ repository }) => repository.updateGitHubLink(hidden.identity.id, { repo: "owner/updated", url: "https://github.com/owner/updated/issues/8" }));
  expect(stored()).toEqual({ version: initialVersion + 1, creation_origin: "manual", provenance: "linked" });
  expect(history().actor).toBe(AGENT.actorId);
  expect(JSON.parse(history().snapshot_json)).toMatchObject({ version: initialVersion + 1, provenance: "linked" });
  data.database.$client.exec(`CREATE TRIGGER reject_hidden_history BEFORE INSERT ON card_versions
    WHEN NEW.card_id = '${hidden.card.id}' BEGIN SELECT RAISE(ABORT, 'hidden history rejected'); END`);
  expect(() => data.uow.run(AGENT, ({ repository }) => repository.deleteGitHubLink(hidden.identity.id))).toThrow("hidden history rejected");
  expect(stored()).toEqual({ version: initialVersion + 1, creation_origin: "manual", provenance: "linked" });
  expect(data.read.getGitHubLink(hidden.identity.id)).toBeDefined();
  expect(data.database.$client.prepare("SELECT id FROM card_github_evidence WHERE card_id = ?").all(hidden.card.id)).toHaveLength(1);
  data.database.$client.exec("DROP TRIGGER reject_hidden_history");
  data.uow.run(AGENT, ({ repository }) => repository.deleteGitHubLink(hidden.identity.id));
  expect(stored()).toEqual({ version: initialVersion + 2, creation_origin: "manual", provenance: "manual" });
  expect(history().actor).toBe(AGENT.actorId);
  expect(JSON.parse(history().snapshot_json)).toMatchObject({ version: initialVersion + 2, creationOrigin: "manual", provenance: "manual" });
  expect(data.database.$client.prepare("SELECT * FROM card_github_evidence WHERE card_id = ?").all(hidden.card.id)).toEqual([]);
  expect(data.read.getCard(hidden.card.id)).toBeUndefined();
}
