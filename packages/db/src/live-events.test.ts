import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActorContext, LiveTransaction } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork, createRestorePoint, restoreProject, readLiveCursor, replayLiveTransactions } from "@storymapper/db";

const ACTOR: ActorContext = { actorType: "agent", actorId: "Claude Code", mcpSessionId: "live-session" };
const cleanup: Array<() => void> = [];

afterEach(() => { vi.useRealTimers(); for (const close of cleanup.splice(0).reverse()) close(); });

function fixture(empty = false) {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-live-events-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const uow = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  const events: LiveTransaction[] = [];
  if (empty) return { directory, path, handle, uow, repository, events, roots: undefined };
  const roots = uow.run({ actorType: "system", actorId: "fixture" }, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Live Project" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Live map" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Release" });
    const otherRelease = tx.createRelease({ storyMapId: map.id, name: "Other release" });
    const card = tx.createCard({ storyMapId: map.id, level: "activity", title: "Live Card", releaseId: release.id });
    const second = tx.createCard({ storyMapId: map.id, level: "activity", title: "Second Card" });
    const persona = tx.createPersona({ projectId: project.id, name: "Reader" });
    const roadmap = tx.createRoadmap({ projectId: project.id, storyMapId: map.id, name: "Roadmap" });
    return { project, map, release, otherRelease, card, second, persona, roadmap };
  });
  uow.subscribe((event) => { expect(handle.current.$client.inTransaction).toBe(false); events.push(event); });
  return { directory, path, handle, uow, repository, events, roots };
}

describe("durable committed live metadata", () => {
  it("groups thirty operations, retains final canonical versions and replays the exact content-free origin envelope after reopen", testGroupsThirtyOperationsRetainsFinalCanonicalVersionsAndReplaysTheExact);

  it("emits bumped versions for coalesced saves, owned children, shifted release siblings and terminal deleted-root versions", testEmitsBumpedVersionsForCoalescedSavesOwnedChildrenShiftedReleaseSiblings);

  it("retains normalized sibling changes without fabricating version bumps and emits unversioned settings-only transactions", testRetainsNormalizedSiblingChangesWithoutFabricatingVersionBumpsAndEmitsUnversioned);

  it("rolls back grouped metadata and sequence allocation when a later history write fails", testRollsBackGroupedMetadataAndSequenceAllocationWhenALaterHistory);

  it("publishes already committed metadata even when the existing after-commit hook rejects", () => {
    const data = fixture();
    const uow = new UnitOfWork(data.handle, () => { throw new Error("post-commit rejected"); });
    const listener = vi.fn();
    uow.subscribe(listener);
    const cursor = readLiveCursor(data.handle);
    expect(() => uow.run(ACTOR, ({ repository }) => repository.updateCard(data.roots!.card.id, { title: "Durably committed" }))).toThrow("post-commit rejected");
    expect(listener).toHaveBeenCalledOnce();
    expect(replayLiveTransactions(data.handle, cursor.seq)).toEqual([listener.mock.calls[0]![0]]);
  });

  it("assigns durable Activity sequences to isolated remote-link and conflict writes without duplicating caller audit", testAssignsDurableActivitySequencesToIsolatedRemoteLinkAndConflictWrites);

  it("creates an epoch before Projects and keeps audit batches to exactly one insert per call with no other writes", testCreatesAnEpochBeforeProjectsAndKeepsAuditBatchesToExactly);

  it("resets only after successful actual restore, retains UUID history and allows durable replay/new writes in the new epoch", async () => {
    const data = fixture();
    const { project, card } = data.roots!;
    const point = createRestorePoint(data.handle, "manual");
    const before = readLiveCursor(data.handle);
    data.uow.run(ACTOR, ({ repository }) => repository.updateCard(card.id, { title: "Later change" }));
    const later = data.repository.listActivity(project.id).filter((event) => event.action === "card.updated").at(-1)!;
    const replacement = vi.fn(() => { expect(data.handle.restoring).toBe(false); });
    data.handle.subscribeReplacement(replacement);
    await expect(restoreProject(data.handle, project.id, "unknown.sqlite", { actorType: "human", actorId: "local-user" })).rejects.toThrow();
    expect(replacement).not.toHaveBeenCalled();
    const restored = await restoreProject(data.handle, project.id, point.fileName, { actorType: "human", actorId: "local-user", originClientId: randomUUID() });
    expect(replacement).toHaveBeenCalledOnce();
    expect(readLiveCursor(data.handle).epoch).toBe(restored.epoch);
    expect(restored.epoch).not.toBe(before.epoch);
    expect(data.repository.listActivity(project.id)).toContainEqual(expect.objectContaining({ id: later.id, undoneByRestore: true }));
    const allReplay = replayLiveTransactions(data.handle, 0);
    expect(allReplay.every((event) => event.epoch === restored.epoch)).toBe(true);
    expect(allReplay.map((event) => event.seq)).toEqual([...allReplay.map((event) => event.seq)].sort((left, right) => left - right));
    const cursor = readLiveCursor(data.handle);
    data.uow.run(ACTOR, ({ repository }) => repository.updateCard(card.id, { title: "New epoch change" }));
    expect(replayLiveTransactions(data.handle, cursor.seq)).toEqual([data.events.at(-1)]);
  });
});

function testGroupsThirtyOperationsRetainsFinalCanonicalVersionsAndReplaysTheExact() {
  const data = fixture();
  const { project, card, map } = data.roots!;
  const cursor = readLiveCursor(data.handle);
  const originClientId = randomUUID();
  data.uow.run({ ...ACTOR, originClientId }, ({ repository }) => {
    for (let index = 0; index < 30; index++) repository.updateCard(card.id, { description: `Private edited text ${index}` });
    repository.updateStoryMap(map.id, { name: "Private map name" });
  });
  expect(data.events).toHaveLength(1);
  const event = data.events[0]!;
  expect(event).toMatchObject({ originClientId, actor: { ...ACTOR, originClientId } });
  expect(event.entities).toEqual(expect.arrayContaining([
    { entityType: "card", entityId: card.id, projectId: project.id, version: data.repository.getCard(card.id)!.version },
    { entityType: "storyMap", entityId: map.id, projectId: project.id, version: 2 }
  ]));
  expect(JSON.stringify(event)).not.toContain("Private");
  expect(event.seq).toBe(cursor.seq + 31);
  expect(replayLiveTransactions(data.handle, cursor.seq)).toEqual([event]);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect(readLiveCursor(data.handle)).toEqual({ epoch: event.epoch, seq: event.seq, id: event.id });
  expect(replayLiveTransactions(data.handle, cursor.seq)).toEqual([event]);
}

function testEmitsBumpedVersionsForCoalescedSavesOwnedChildrenShiftedReleaseSiblings() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
  const data = fixture();
  const { project, card, persona, release, otherRelease, roadmap } = data.roots!;
  data.uow.run(ACTOR, ({ repository }) => repository.updateCard(card.id, { title: "First save" }));
  const previousVersion = data.repository.getCard(card.id)!.version;
  data.events.length = 0;
  data.uow.run(ACTOR, ({ repository }) => repository.updateCard(card.id, { title: "Coalesced save" }));
  expect(data.events[0]!.entities).toContainEqual({ entityType: "card", entityId: card.id, projectId: project.id, version: previousVersion + 1 });
  data.uow.run(ACTOR, ({ repository }) => {
    repository.setCardPersona(card.id, persona.id);
    repository.createRoadmapColumn({ roadmapId: roadmap.id, name: "Future" });
    repository.updateRelease(otherRelease.id, { position: 0 });
  });
  const ownerEvent = data.events.at(-1)!;
  for (const [entityType, entityId] of [["card", card.id], ["roadmap", roadmap.id], ["release", release.id], ["release", otherRelease.id]]) {
    expect(ownerEvent.entities).toContainEqual(expect.objectContaining({ entityType, entityId, projectId: project.id, version: expect.any(Number) }));
  }
  const cardBeforeDelete = data.repository.getCard(card.id)!.version;
  data.uow.run(ACTOR, ({ repository }) => { repository.deleteCard(card.id, { strategy: "unassign" }); repository.deletePersona(persona.id, { definitionBefore: repository.getPersona(persona.id)!, affectedCards: [] }); });
  expect(data.events.at(-1)!.entities).toEqual(expect.arrayContaining([
    { entityType: "card", entityId: card.id, projectId: project.id, version: cardBeforeDelete + 1 },
    { entityType: "persona", entityId: persona.id, projectId: project.id, version: 2 }
  ]));
}

function testRetainsNormalizedSiblingChangesWithoutFabricatingVersionBumpsAndEmitsUnversioned() {
  const data = fixture();
  const { project, card, second } = data.roots!;
  data.uow.run(ACTOR, ({ repository }) => repository.deleteCard(card.id, { strategy: "unassign" }));
  expect(data.events.at(-1)!.entities).toContainEqual({ entityType: "card", entityId: second.id, projectId: project.id, version: 1 });
  const cursor = readLiveCursor(data.handle);
  data.uow.run(ACTOR, ({ repository }) => repository.gettingStarted.dismiss(project.id));
  expect(replayLiveTransactions(data.handle, cursor.seq)).toEqual([data.events.at(-1)]);
  expect(data.events.at(-1)!.entities).toEqual([{ entityType: "projectSettings", entityId: project.id, projectId: project.id, version: null }]);
  const mixedCursor = readLiveCursor(data.handle);
  data.uow.run(ACTOR, ({ repository }) => {
    repository.gettingStarted.complete(project.id, "export");
    repository.logMcpToolCall({ projectId: project.id, metadata: { toolName: "ExportAudit", inputHash: "a".repeat(64), outputHash: "b".repeat(64), outcome: "ok", affectedEntityIds: [] } });
  });
  expect(replayLiveTransactions(data.handle, mixedCursor.seq)).toEqual([data.events.at(-1)]);
}

function testRollsBackGroupedMetadataAndSequenceAllocationWhenALaterHistory() {
  const data = fixture();
  const { card, second } = data.roots!;
  const before = readLiveCursor(data.handle);
  data.handle.current.$client.exec(`CREATE TRIGGER reject_live_history BEFORE INSERT ON card_versions WHEN NEW.card_id = '${second.id}' BEGIN SELECT RAISE(ABORT, 'live history rejected'); END`);
  expect(() => data.uow.run(ACTOR, ({ repository }) => {
    repository.updateCard(card.id, { title: "Rollback first" });
    repository.updateCard(second.id, { title: "Rollback later" });
  })).toThrow("live history rejected");
  expect(data.events).toEqual([]);
  expect(readLiveCursor(data.handle)).toEqual(before);
  expect(replayLiveTransactions(data.handle, before.seq)).toEqual([]);
}

function testAssignsDurableActivitySequencesToIsolatedRemoteLinkAndConflictWrites() {
  const data = fixture();
  const { project, map, card } = data.roots!;
  const connection = data.uow.run(ACTOR, ({ repository }) => repository.createConnectorConnection({ projectId: project.id, provider: "github", name: "Fixture", authMode: "token", owner: "fixture", repository: "repo" }));
  const run = data.uow.run(ACTOR, ({ repository }) => repository.createSyncRun({ storyMapId: map.id, connectionId: connection.id, mode: "sync", status: "applied" }));
  const linkInput = { connectionId: connection.id, provider: "github" as const, cardId: card.id, remoteId: "123", url: "https://github.com/fixture/repo/issues/123", labels: [] };
  data.uow.run(ACTOR, ({ repository }) => repository.createGitHubLink({ cardId: card.id, repo: "fixture/repo", issueNumber: 123, url: linkInput.url }));
  let cursor = readLiveCursor(data.handle);
  const link = data.uow.run(ACTOR, ({ repository }) => repository.bindRemoteWorkItemLink(linkInput));
  expect(readLiveCursor(data.handle).seq).toBe(cursor.seq + 1);
  expect(replayLiveTransactions(data.handle, cursor.seq)).toEqual([data.events.at(-1)]);
  expect(data.events.at(-1)!.entities).toContainEqual({ entityType: "card", entityId: card.id, projectId: project.id, version: card.version + 1 });
  cursor = readLiveCursor(data.handle);
  data.uow.run(ACTOR, ({ repository }) => {
    repository.bindRemoteWorkItemLink({ ...linkInput, syncState: "unsynced" });
    repository.logActivity(project.id, "remoteWorkItemLink.updated", "remoteWorkItemLink", link.id);
  });
  expect(readLiveCursor(data.handle).seq).toBe(cursor.seq + 1);
  cursor = readLiveCursor(data.handle);
  const conflict = data.uow.run(ACTOR, ({ repository }) => repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(card.id)!.storyMapId).find((row) => row.cardId === card.id)!.externalRefId, syncRunId: run.id, connectionId: connection.id, cardId: card.id, remoteId: "123", field: "title", localValue: "Private local", remoteValue: "Private remote" }));
  expect(readLiveCursor(data.handle).seq).toBe(cursor.seq + 1);
  cursor = readLiveCursor(data.handle);
  data.uow.run(ACTOR, ({ repository }) => repository.resolveSyncConflict(conflict.id, "local"));
  expect(readLiveCursor(data.handle).seq).toBe(cursor.seq + 1);
  expect(data.events.at(-1)!.entities).toEqual([{ entityType: "syncConflict", entityId: conflict.id, projectId: project.id, version: null }]);
  expect(JSON.stringify(replayLiveTransactions(data.handle, cursor.seq))).not.toContain("Private");
}

function testCreatesAnEpochBeforeProjectsAndKeepsAuditBatchesToExactly() {
  const data = fixture(true);
  const cursor = readLiveCursor(data.handle);
  const totalChanges = () => (data.handle.current.$client.prepare("SELECT total_changes() AS count").get() as { count: number }).count;
  const before = totalChanges();
  data.uow.run(ACTOR, ({ repository }) => {
    for (let index = 0; index < 100; index++) repository.logMcpToolCall({ projectId: null, metadata: { toolName: "ListProjects", inputHash: "a".repeat(64), outputHash: "b".repeat(64), outcome: "ok", affectedEntityIds: [] } });
  });
  expect(totalChanges() - before).toBe(100);
  expect(data.repository.listProjects()).toEqual([]);
  expect(readLiveCursor(data.handle)).toMatchObject({ epoch: cursor.epoch, seq: 100 });
  const replayed = replayLiveTransactions(data.handle, 0);
  expect(replayed).toHaveLength(1);
  expect(replayed[0]!.entities).toHaveLength(100);
  expect(replayed[0]!.entities.every((entity) => entity.projectId === null && entity.version === null)).toBe(true);
}
