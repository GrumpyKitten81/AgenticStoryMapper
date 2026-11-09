import { persistImportedCardFixture } from "@storymapper/db/fixtures/imported-card";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@storymapper/contracts";
import { sampleStoryMapTemplate } from "@storymapper/core";
import { openStoryMapperDb, type SqliteDatabase } from "@storymapper/db/connection";
import { DatabaseHandle, RepositoryContext, type TransactionContext } from "@storymapper/db/database-handle";
import { ProjectRepository } from "@storymapper/db/repositories/project-repository";
import { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { UnitOfWork, type TransactionRepositories } from "@storymapper/db/unit-of-work";
import { exportAudit } from "@storymapper/server/application/export/export.use-cases";

const ACTOR: ActorContext = { actorType: "agent", actorId: "test-host", mcpSessionId: "test-session" };
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-uow-"));
  const database = openStoryMapperDb(join(directory, "storymapper.sqlite"));
  cleanup.push(() => { database.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const handle = new DatabaseHandle(database);
  const hook = vi.fn(() => { expect(database.$client.inTransaction).toBe(false); });
  const unitOfWork = new UnitOfWork(handle, hook);
  const repository = new StoryMapperRepository(handle);
  const state = unitOfWork.run({ actorType: "system", actorId: "fixture" }, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Atomic fixture" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Release" });
    const activity = tx.createCard({ storyMapId: map.id, level: "activity", title: "Activity" });
    const neighbor = tx.createCard({ storyMapId: map.id, level: "activity", title: "Neighbor" });
    const step = tx.createCard({ storyMapId: map.id, parentId: activity.id, level: "step", title: "Step" });
    const story = tx.createCard({ storyMapId: map.id, parentId: step.id, releaseId: release.id, level: "story", title: "Story" });
    const second = tx.createCard({ storyMapId: map.id, parentId: step.id, releaseId: release.id, level: "story", title: "Second" });
    const persona = tx.createPersona({ projectId: project.id, name: "Reader" });
    const connection = tx.createConnectorConnection({ projectId: project.id, provider: "github", authMode: "token", name: "GitHub", owner: "owner", repository: "repo" });
    tx.bindRemoteWorkItemLink({ connectionId: connection.id, provider: "github", cardId: story.id, remoteId: "1", url: "https://github.com/owner/repo/issues/1", labels: [] });
    return { project, map, release, activity, neighbor, step, story, second, persona, connection };
  });
  hook.mockClear();
  return { ...state, database, handle, hook, unitOfWork, repository };
}

type Fixture = ReturnType<typeof fixture>;
type TxRepository = TransactionRepositories["repository"];

function state(database: SqliteDatabase): unknown {
  const tables = database.$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
  return tables.map(({ name }) => [name, database.$client.prepare(`SELECT * FROM "${name}" ORDER BY 1`).all()]);
}

const actions: Array<[string, (tx: TxRepository, data: Fixture) => unknown]> = [
  ["create", (tx, data) => tx.createCard({ storyMapId: data.map.id, level: "activity", title: "Created" }, "mcp")],
  ["update", (tx, data) => tx.updateCard(data.story.id, { title: "Updated" })],
  ["move", (tx, data) => tx.moveCard(data.story.id, { parentId: null, position: 0 })],
  ["archive", (tx, data) => tx.archiveCard(data.story.id)],
  ["delete", (tx, data) => tx.deleteCard(data.activity.id, { strategy: "unassign" })],
  ["park", (tx, data) => tx.parkCard(data.activity.id, { childStrategy: "unassign" })],
  ["unpark", (tx, data) => tx.unparkCard(data.activity.id)],
  ["bulk", (tx, data) => tx.bulkUpdateCards({ storyMapId: data.map.id, cardIds: [data.story.id, data.second.id], patch: { estimate: 8, addPersonaId: data.persona.id } })]
];

describe("actor-aware atomic Card mutations", () => {
  it("retains separate archive and explicit Restore history within the same actor's rapid-save window", testRetainsSeparateArchiveAndExplicitRestoreHistoryWithinTheSameActor);

  it("appends an unparked Activity after sparse visible Activities, ignoring hidden and mixed roots", testAppendsAnUnparkedActivityAfterSparseVisibleActivitiesIgnoringHiddenAnd);

  registerSkipsArchivedAndParkedNeighborsDuringSRetainingNested();

  registerRejectsUnavailableActiveNeighborChildHandlingWithoutSilentlyUnassigning();

  it("retains the exact edited Card snapshot immediately preceding deletion", testRetainsTheExactEditedCardSnapshotImmediatelyPrecedingDeletion);

  it("exports distinct agent identities and an optional MCP session in Markdown audit output", testExportsDistinctAgentIdentitiesAndAnOptionalMCPSessionInMarkdown);

  registerPreservesTheCurrentHierarchyOverrideWhenOmittedWhileAllowing();

  for (const [name, act] of actions) {
    for (const table of ["card_versions", "activity_events"]) {
      it(`rolls back every table and notification when ${name} fails writing ${table}`, () => {
        const data = fixture();
        const before = state(data.database);
        data.database.$client.exec(`CREATE TRIGGER reject_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'audit rejected'); END`);
        expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => act(repository, data))).toThrow("audit rejected");
        expect(state(data.database)).toEqual(before);
        expect(data.hook).not.toHaveBeenCalled();
      });
    }
    it(`commits ${name} with actor/session on Card versions and events`, () => testScenario(name, act));
  }

  it("rolls back an earlier bulk Card and related links when a later version fails", () => {
    const data = fixture();
    const before = state(data.database);
    data.database.$client.exec(`CREATE TRIGGER reject_later BEFORE INSERT ON card_versions WHEN NEW.card_id = '${data.second.id}' BEGIN SELECT RAISE(ABORT, 'later version rejected'); END`);
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => actions[7]![1](repository, data))).toThrow("later version rejected");
    expect(state(data.database)).toEqual(before);
    expect(data.hook).not.toHaveBeenCalled();
  });

  it("rolls back a move when its remote hierarchy link write fails", () => {
    const data = fixture();
    const before = state(data.database);
    data.database.$client.exec("CREATE TRIGGER reject_link BEFORE UPDATE ON remote_work_item_links BEGIN SELECT RAISE(ABORT, 'link rejected'); END");
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => actions[2]![1](repository, data))).toThrow("link rejected");
    expect(state(data.database)).toEqual(before);
  });
});

describe("indirect Card writers", () => {
  registerRecordsReassignedChildrenAndRollsBackSOnLeft();

  it("records parked in both parking and unparking version changes", () => {
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.parkCard(data.activity.id, { childStrategy: "unassign" }));
    expect(data.repository.listCardHistory(data.activity.id).at(-1)).toMatchObject({ changedFields: expect.arrayContaining(["parked"]), snapshot: { parked: true } });
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.unparkCard(data.activity.id));
    expect(data.repository.listCardHistory(data.activity.id).at(-1)).toMatchObject({ changedFields: expect.arrayContaining(["parked"]), snapshot: { parked: false } });
  });

  it("applies repeated Card operations sharing a matching original baseline", testAppliesRepeatedCardOperationsSharingAMatchingOriginalBaseline);

  it("rolls back an entire template and preserves template source with an explicit system actor", () => {
    const data = fixture();
    const before = state(data.database);
    data.database.$client.exec("CREATE TRIGGER reject_template BEFORE INSERT ON card_versions WHEN NEW.version = 1 BEGIN SELECT RAISE(ABORT, 'template rejected'); END");
    const actor: ActorContext = { actorType: "system", actorId: "sample-initialization" };
    expect(() => data.unitOfWork.run(actor, ({ repository }) => repository.createStoryMapFromTemplate(data.project.id, sampleStoryMapTemplate, true))).toThrow("template rejected");
    expect(state(data.database)).toEqual(before);
    data.database.$client.exec("DROP TRIGGER reject_template");
    const map = data.unitOfWork.run(actor, ({ repository }) => repository.createStoryMapFromTemplate(data.project.id, sampleStoryMapTemplate, true));
    for (const card of data.repository.listCards(map.id)) expect(data.repository.listCardHistory(card.id)[0]).toMatchObject({ actor: actor.actorId, actorType: "system" });
    expect(data.database.$client.prepare("SELECT DISTINCT creation_source FROM cards WHERE story_map_id = ?").all(map.id)).toEqual([{ creation_source: "template" }]);
  });

  it("rolls back remote import links and Cards together while preserving github attribution and executor source", testRollsBackRemoteImportLinksAndCardsTogetherWhilePreservingGithub);

  it("rolls back release deletion and all assigned Card histories on a later version failure", () => {
    const data = fixture();
    const before = state(data.database);
    data.database.$client.exec(`CREATE TRIGGER reject_release BEFORE INSERT ON card_versions WHEN NEW.card_id = '${data.second.id}' BEGIN SELECT RAISE(ABORT, 'release rejected'); END`);
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.deleteRelease(data.release.id))).toThrow("release rejected");
    expect(state(data.database)).toEqual(before);
    data.database.$client.exec("DROP TRIGGER reject_release");
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.deleteRelease(data.release.id));
    for (const card of [data.story, data.second]) expect(data.repository.listCardHistory(card.id)[1]).toMatchObject({ actor: ACTOR.actorId, snapshot: { releaseId: null } });
  });

  it("rolls back an earlier ChangeSet operation when a later Card history fails", () => {
    const data = fixture();
    const changeSet = data.unitOfWork.run(ACTOR, ({ repository }) => repository.createChangeSet({ id: "30000000-0000-4000-8000-000000000000", projectId: data.project.id, title: "Two updates", source: "mcp", status: "proposed", createdAt: new Date().toISOString(), operations: [data.story, data.second].map((card) => ({ operationId: `fixture-update-${card.id}`, op: "update" as const, entity: "card" as const, entityId: card.id, after: { title: "Changed" } })) }));
    data.unitOfWork.run({ actorType: "human", actorId: "fixture-reviewer" }, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"));
    const before = state(data.database);
    data.database.$client.exec(`CREATE TRIGGER reject_changeset BEFORE INSERT ON card_versions WHEN NEW.card_id = '${data.second.id}' BEGIN SELECT RAISE(ABORT, 'changeset rejected'); END`);
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.applyChangeSet(changeSet.id))).toThrow("changeset rejected");
    expect(state(data.database)).toEqual(before);
    expect(data.repository.getChangeSet(changeSet.id)?.status).toBe("approved");
  });
});

describe("unit of work lifetime and database replacement", () => {
  it("joins synchronous nested writes to the outer transaction and rolls them back together", testJoinsSynchronousNestedWritesToTheOuterTransactionAndRollsThem);

  it("keeps validated transaction attribution readonly and frozen", testKeepsValidatedTransactionAttributionReadonlyAndFrozen);

  it("rejects and observes async callback and hook rejections without unhandled continuations", testRejectsAndObservesAsyncCallbackAndHookRejectionsWithoutUnhandledContinuations);

  registerRejectsInvalidActorJBeforeWrites();

  it("rejects root writes, forged transaction contexts and expired reads/writes", testRejectsRootWritesForgedTransactionContextsAndExpiredReadsWrites);

  it("rolls back writes when the callback returns a Promise and expires its repositories", testRollsBackWritesWhenTheCallbackReturnsAPromiseAndExpires);

  it("rejects use after an awaited callback resumes following rollback", testRejectsUseAfterAnAwaitedCallbackResumesFollowingRollback);

  it("uses the replacement database through existing repositories and unit of work", testUsesTheReplacementDatabaseThroughExistingRepositoriesAndUnitOfWork);

  registerPropagatesAfterCommitHookFailuresWithTheDataDurably();

  it("records terminal audit atomically, rejects failed inserts and refreshes replacement statements", testRecordsTerminalAuditAtomicallyRejectsFailedInsertsAndRefreshesReplacementStatements);

  registerSeedsMissingStatusesOnlyDuringExplicitFirstTimeInitialization();

  it("requires source content to be prepared before a transaction-bound import", () => {
    const data = fixture();
    const before = state(data.database);
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => {
      // @ts-expect-error REQ the Tx import requires already prepared content.
      return repository.importSourceDocument({ projectId: data.project.id, title: "Unprepared", type: "txt", filePath: "/unprepared.txt" });
    })).toThrow();
    expect(state(data.database)).toEqual(before);
    expect(data.hook).not.toHaveBeenCalled();
  });

  it("keeps public reads free of writes", () => {
    const data = fixture();
    const before = state(data.database);
    expect(data.repository.listActivity(data.project.id)[0]).not.toHaveProperty("mcpSessionId");
    expect(data.repository.listCardHistory(data.story.id)[0]).not.toHaveProperty("mcpSessionId");
    data.repository.getGettingStartedChecklist(data.project.id);
    data.repository.getSafetySettings(data.project.id);
    data.repository.listWorkflowStatuses(data.project.id);
    data.repository.getStoryMapSnapshot(data.map.id);
    expect(state(data.database)).toEqual(before);
    expect(data.hook).not.toHaveBeenCalled();
  });
});

function registerPreservesTheCurrentHierarchyOverrideWhenOmittedWhileAllowing() {
  it("preserves the current hierarchy override when omitted while allowing an explicit reset", () => {
    const data = fixture();
    const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
    const { parentOverrideLocal, ...values } = link;
    data.unitOfWork.run(ACTOR, ({ repository }) => {
      repository.bindRemoteWorkItemLink({ ...values, parentOverrideLocal: true });
      expect(repository.bindRemoteWorkItemLink(values).parentOverrideLocal).toBe(true);
      expect(repository.bindRemoteWorkItemLink({ ...values, parentOverrideLocal: false }).parentOverrideLocal).toBe(false);
    });
  });
}

function registerRejectsUnavailableActiveNeighborChildHandlingWithoutSilentlyUnassigning() {
  it("rejects unavailable active-neighbor child handling without silently unassigning", () => {
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.archiveCard(data.neighbor.id));
    const before = state(data.database);
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.parkCard(data.activity.id, { childStrategy: "reassign-right" })))
      .toThrow("No visible right neighbor is available.");
    expect(state(data.database)).toEqual(before);
    expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.parkCard(data.story.id, { childStrategy: "unassign" })))
      .toThrow("Only Activities can be parked.");
    expect(state(data.database)).toEqual(before);
  });
}

function registerSkipsArchivedAndParkedNeighborsDuringSRetainingNested() {
  it.each(["park", "delete"] as const)("skips archived and parked neighbors during %s, retaining nested descendants", (action) => {
    const data = fixture();
    data.unitOfWork.run(ACTOR, ({ repository }) => {
      repository.archiveCard(repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Archived neighbor", position: 1 }).id);
      const parked = repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Parked neighbor", position: 2 });
      repository.parkCard(parked.id, { childStrategy: "unassign" });
      repository.createCard({ storyMapId: data.map.id, level: "step", title: "Sparse target child", parentId: data.neighbor.id, position: 30 });
      if (action === "delete") repository.archiveCard(data.activity.id);
    });
    data.database.$client.prepare("UPDATE cards SET position = 3 WHERE id = ?").run(data.neighbor.id);
    data.unitOfWork.run(ACTOR, ({ repository }) => action === "park"
      ? repository.parkCard(data.activity.id, { childStrategy: "reassign-right" })
      : repository.deleteCard(data.activity.id, { strategy: "reassign-right" }));
    expect(data.repository.getCardDetails(data.step.id)).toMatchObject({ parentId: data.neighbor.id, position: 31, version: 2 });
    expect(data.repository.getCardDetails(data.story.id)).toMatchObject({ parentId: data.step.id, version: 1 });
    expect(data.repository.listCardHistory(data.step.id).at(-1)).toMatchObject({ actor: ACTOR.actorId, actorType: "agent", snapshot: { parentId: data.neighbor.id } });
  });
}

function registerRecordsReassignedChildrenAndRollsBackSOnLeft() {
  it.each(["delete", "park"] as const)("records reassigned children and rolls back %s on left/right child-history failure", (action) => {
    for (const strategy of ["reassign-left", "reassign-right"] as const) {
      const data = fixture();
      const left = data.unitOfWork.run(ACTOR, ({ repository }) => {
        const left = repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Left" });
        repository.moveCard(left.id, { parentId: null, position: 0 });
        return left;
      });
      const before = state(data.database);
      const act = (repository: TxRepository) => action === "delete"
        ? repository.deleteCard(data.activity.id, { strategy })
        : repository.parkCard(data.activity.id, { childStrategy: strategy });
      data.database.$client.exec(`CREATE TRIGGER reject_reassignment BEFORE INSERT ON card_versions WHEN NEW.card_id = '${data.step.id}' BEGIN SELECT RAISE(ABORT, 'child history rejected'); END`);
      data.hook.mockClear();
      expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => act(repository))).toThrow("child history rejected");
      expect(state(data.database)).toEqual(before);
      expect(data.hook).not.toHaveBeenCalled();
      data.database.$client.exec("DROP TRIGGER reject_reassignment");
      data.unitOfWork.run(ACTOR, ({ repository }) => act(repository));
      const targetId = strategy === "reassign-left" ? left.id : data.neighbor.id;
      expect(data.repository.listCardHistory(data.step.id).at(-1)).toMatchObject({ actor: ACTOR.actorId, actorType: "agent", mcpSessionId: ACTOR.mcpSessionId, snapshot: { parentId: targetId }, changedFields: expect.arrayContaining(["parentId"]) });
      expect(data.repository.listCardHistory(data.story.id)).toHaveLength(1);
      expect(data.repository.getCardDetails(data.story.id)?.parentId).toBe(data.step.id);
      expect(data.repository.listActivity(data.project.id).find((event) => event.action === "card.rehomed")).toMatchObject({ actor: ACTOR.actorId, actorType: "agent", mcpSessionId: ACTOR.mcpSessionId, affectedEntityId: data.step.id, before: { parentId: data.activity.id }, after: { parentId: targetId } });
    }
  });
}

function registerSeedsMissingStatusesOnlyDuringExplicitFirstTimeInitialization() {
  it("seeds missing statuses only during explicit first-time initialization", () => {
    const data = fixture();
    data.database.$client.prepare("DELETE FROM workflow_statuses WHERE project_id = ?").run(data.project.id);
    expect(data.repository.listWorkflowStatuses(data.project.id)).toEqual([]);
    expect(data.repository.getStoryMapSnapshot(data.map.id)?.workflowStatuses).toEqual([]);
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.initializeGettingStarted(data.project.id));
    expect(data.repository.listWorkflowStatuses(data.project.id).map((status) => status.name)).toEqual(["todo", "active", "done", "archived"]);
    data.database.$client.prepare("DELETE FROM workflow_statuses WHERE project_id = ?").run(data.project.id);
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.initializeGettingStarted(data.project.id));
    expect(data.repository.listWorkflowStatuses(data.project.id)).toEqual([]);
  });
}

function registerPropagatesAfterCommitHookFailuresWithTheDataDurably() {
  it("propagates after-commit hook failures with the data durably committed", () => {
    const data = fixture();
    const unitOfWork = new UnitOfWork(data.handle, () => { expect(data.database.$client.inTransaction).toBe(false); throw new Error("notification rejected"); });
    expect(() => unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.story.id, { title: "Committed" }))).toThrow("notification rejected");
    expect(data.repository.getCardDetails(data.story.id)?.title).toBe("Committed");
    expect(data.repository.listCardHistory(data.story.id)).toHaveLength(2);
  });
}

function registerRejectsInvalidActorJBeforeWrites() {
  it.each([undefined, { actorType: "human", actorId: "" }, { actorType: "human", actorId: "  " }, { actorType: "mcp", actorId: "host" }, { actorType: "agent", actorId: "host", mcpSessionId: "" }])("rejects invalid actor %j before writes", (actor) => {
    const data = fixture();
    const before = state(data.database);
    expect(() => data.unitOfWork.run(actor as ActorContext, ({ repository }) => repository.updateCard(data.story.id, { title: "Changed" }))).toThrow();
    expect(state(data.database)).toEqual(before);
    expect(data.hook).not.toHaveBeenCalled();
  });
}

function testRetainsSeparateArchiveAndExplicitRestoreHistoryWithinTheSameActor() {
  const data = fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.archiveCard(data.activity.id));
  const archived = data.repository.getCardDetails(data.activity.id)!;
  expect(archived).toMatchObject({ archived: true, status: "todo", version: 2 });
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.activity.id, { archived: false, status: "active" }));
  expect(data.repository.getCardDetails(data.activity.id)).toMatchObject({ status: "active", version: 3 });
  expect(data.repository.listCardHistory(data.activity.id).map((entry) => ({ version: entry.version, archived: entry.snapshot.archived, status: entry.snapshot.status })))
    .toEqual([{ version: 1, archived: false, status: "todo" }, { version: 2, archived: true, status: "todo" }, { version: 3, archived: false, status: "active" }]);
  expect(data.repository.listCardHistory(data.activity.id).at(-1)).toMatchObject({ actor: ACTOR.actorId, actorType: "agent", mcpSessionId: ACTOR.mcpSessionId });
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.archiveCard(data.activity.id));
  expect(data.repository.getCardDetails(data.activity.id)).toMatchObject({ archived: true, status: "active", version: 4 });
  expect(data.repository.listCardHistory(data.activity.id).map((entry) => entry.version)).toEqual([1, 2, 3, 4]);
  const before = state(data.database);
  data.database.$client.exec("CREATE TRIGGER reject_restore_audit BEFORE INSERT ON activity_events WHEN NEW.action = 'card.updated' BEGIN SELECT RAISE(ABORT, 'Restore audit rejected'); END");
  expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.activity.id, { archived: false, status: "done" })))
    .toThrow("Restore audit rejected");
  expect(state(data.database)).toEqual(before);
}

function testAppendsAnUnparkedActivityAfterSparseVisibleActivitiesIgnoringHiddenAnd() {
  const data = fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => {
    repository.parkCard(data.activity.id, { childStrategy: "unassign" });
    repository.archiveCard(repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Archived root", position: 900 }).id);
    repository.createCard({ storyMapId: data.map.id, level: "note", title: "Mixed root", position: 1000 });
    const hidden = repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Other parked root", position: 1200 });
    repository.parkCard(hidden.id, { childStrategy: "unassign" });
  });
  data.database.$client.prepare("UPDATE cards SET position = 40 WHERE id = ?").run(data.neighbor.id);
  const updated = data.unitOfWork.run(ACTOR, ({ repository }) => repository.unparkCard(data.activity.id))!;
  expect(updated).toMatchObject({ position: 41, parked: false, parentId: null, version: 3 });
  expect(data.repository.listCardHistory(updated.id).at(-1)).toMatchObject({ actor: ACTOR.actorId, snapshot: { position: 41, parked: false } });
  expect(data.repository.listCards(data.map.id)).toHaveLength(8);
}

function testRetainsTheExactEditedCardSnapshotImmediatelyPrecedingDeletion() {
  const data = fixture();
  data.unitOfWork.run(ACTOR, ({ repository }) => {
    repository.updateCard(data.story.id, { title: "Final title", description: "Final description", estimate: 8, priority: "high", assignee: "Reviewer" });
    repository.moveCard(data.story.id, { parentId: null, releaseId: null, position: 0 });
  });
  const before = data.repository.getCardDetails(data.story.id)!;
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.deleteCard(data.story.id, { strategy: "unassign" }));
  const final = data.database.$client.prepare("SELECT snapshot_json, actor, actor_type, mcp_session_id FROM card_versions WHERE card_id = ? ORDER BY version DESC LIMIT 1").get(data.story.id) as { snapshot_json: string; actor: string; actor_type: string; mcp_session_id: string };
  expect(JSON.parse(final.snapshot_json)).toEqual({ ...before, version: before.version + 1 });
  expect(final).toMatchObject({ actor: ACTOR.actorId, actor_type: ACTOR.actorType, mcp_session_id: ACTOR.mcpSessionId });
  expect(data.repository.getCardDetails(data.story.id)).toBeUndefined();
}

function testExportsDistinctAgentIdentitiesAndAnOptionalMCPSessionInMarkdown() {
  const data = fixture();
  const first = { actorType: "agent", actorId: "first-agent", mcpSessionId: "first-session" } as const;
  const second = { actorType: "agent", actorId: "second-agent" } as const;
  data.unitOfWork.run(first, ({ repository }) => repository.updateCard(data.story.id, { title: "First agent edit" }));
  data.unitOfWork.run(second, ({ repository }) => repository.updateCard(data.story.id, { title: "Second agent edit" }));
  const output = exportAudit({ repository: data.repository, unitOfWork: data.unitOfWork }, ACTOR, data.project.id, "markdown");
  const lines = output.content.split("\n").filter((line) => line.includes("card.updated"));
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain("agent:first-agent | MCP session: first-session");
  expect(lines[1]).toContain("agent:second-agent | card.updated");
  expect(lines[1]).not.toContain("MCP session:");
}

function testScenario(name: string, act: (typeof actions)[number][1]) {
  const data = fixture();
  const versions = data.database.$client.prepare("SELECT count(*) AS count FROM card_versions").get() as { count: number };
  const events = data.repository.listActivity(data.project.id).length;
  data.unitOfWork.run(ACTOR, ({ repository }) => act(repository, data));
  expect(data.hook).toHaveBeenCalledOnce();
  const written = data.database.$client.prepare("SELECT actor, actor_type, mcp_session_id FROM card_versions ORDER BY rowid").all().slice(versions.count);
  expect(written.length).toBeGreaterThan(0);
  expect(written.every((row) => JSON.stringify(row) === JSON.stringify({ actor: ACTOR.actorId, actor_type: ACTOR.actorType, mcp_session_id: ACTOR.mcpSessionId }))).toBe(true);
  expect(data.repository.listActivity(data.project.id).slice(events).every((event) => event.actor === ACTOR.actorId && event.actorType === ACTOR.actorType && event.mcpSessionId === ACTOR.mcpSessionId)).toBe(true);
  if (name === "bulk") {
    const bulkEvents = data.repository.listActivity(data.project.id).filter((event) => event.action === "card.bulkUpdated");
    expect(bulkEvents.map((event) => event.affectedEntityId).sort()).toEqual([data.story.id, data.second.id].sort());
    for (const event of bulkEvents) expect(event).toMatchObject({ affectedEntityType: "card", before: { status: "todo" }, after: { estimate: 8, status: "todo" } });
  }
  if (name === "archive") expect(data.repository.listActivity(data.project.id).filter((event) => event.affectedEntityId === data.story.id && event.action === "card.archived")).toHaveLength(1);
  if (name === "delete") {
    expect(data.repository.getCardDetails(data.activity.id)).toBeUndefined();
    expect(data.database.$client.prepare("SELECT count(*) AS count FROM card_versions WHERE card_id = ?").get(data.activity.id)).toEqual({ count: 2 });
    expect(data.repository.listCardHistory(data.activity.id)).toHaveLength(2);
    expect(data.repository.listCardHistory(data.step.id)).toHaveLength(2);
    expect(data.repository.listCardHistory(data.story.id)).toHaveLength(2);
  }
  if (name === "move") expect(data.repository.listCardHistory(data.second.id)).toHaveLength(1);
}

function testAppliesRepeatedCardOperationsSharingAMatchingOriginalBaseline() {
  const data = fixture();
  const changeSet = data.unitOfWork.run(ACTOR, ({ repository }) => repository.createChangeSet({
    id: "30000000-0000-4000-8000-000000000001", projectId: data.project.id, title: "Repeated Card edits", source: "mcp", status: "proposed", createdAt: new Date().toISOString(),
    operations: [
      { operationId: "fixture-operation-1", op: "update", entity: "card", entityId: data.story.id, baseVersion: data.story.version, after: { title: "First edit" } },
      { operationId: "fixture-operation-2", op: "update", entity: "card", entityId: data.story.id, baseVersion: data.story.version, after: { description: "Second edit" } }
    ]
  }));
  data.unitOfWork.run({ actorType: "human", actorId: "fixture-reviewer" }, ({ repository }) => repository.updateChangeSetStatus(changeSet.id, "approved"));
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(data.story.updatedAt) + 1000);
  try {
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.applyChangeSet(changeSet.id));
  } finally {
    vi.useRealTimers();
  }
  expect(data.repository.getChangeSet(changeSet.id)?.status).toBe("applied");
  expect(data.repository.getCardDetails(data.story.id)).toMatchObject({ title: "First edit", description: "Second edit" });
  expect(data.repository.listCardHistory(data.story.id).slice(1)).toMatchObject([
    { actor: ACTOR.actorId, snapshot: { title: "First edit", description: "Second edit" } }
  ]);
}

function testRollsBackRemoteImportLinksAndCardsTogetherWhilePreservingGithub() {
  const data = fixture();
  const importCard = (repository: StoryMapperRepository<"transaction">) => persistImportedCardFixture(repository, { storyMapId: data.map.id, level: "story", title: "Imported", description: "Body", status: "todo" }, data.connection.id, "https://github.com/owner/repo/issues/2");
  const before = state(data.database);
  data.database.$client.exec("CREATE TRIGGER reject_import BEFORE INSERT ON remote_work_item_links BEGIN SELECT RAISE(ABORT, 'import rejected'); END");
  const actor: ActorContext = { actorType: "github", actorId: data.connection.id };
  expect(() => data.unitOfWork.run(actor, ({ repository }) => importCard(repository))).toThrow("import rejected");
  expect(state(data.database)).toEqual(before);
  data.database.$client.exec("DROP TRIGGER reject_import");
  data.unitOfWork.run(actor, ({ repository }) => importCard(repository));
  const card = data.repository.listCards(data.map.id).find((card) => card.title === "Imported")!;
  expect(data.repository.listCardHistory(card.id)[0]).toMatchObject({ actor: data.connection.id, actorType: "github" });
  expect(data.database.$client.prepare("SELECT creation_source FROM cards WHERE id = ?").get(card.id)).toEqual({ creation_source: "changeset" });
}

function testJoinsSynchronousNestedWritesToTheOuterTransactionAndRollsThem() {
  const data = fixture();
  const before = state(data.database);
  expect(() => data.unitOfWork.run(ACTOR, () => {
    data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.story.id, { title: "Nested must roll back" }));
    throw new Error("Abort outer transaction");
  })).toThrow("Abort outer transaction");
  expect(state(data.database)).toEqual(before);
  expect(data.hook).not.toHaveBeenCalled();

  data.unitOfWork.run(ACTOR, () => data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.story.id, { title: "Nested commits" })));
  expect(data.repository.getCardDetails(data.story.id)?.title).toBe("Nested commits");
  expect(data.hook).toHaveBeenCalledTimes(1);
}

function testKeepsValidatedTransactionAttributionReadonlyAndFrozen() {
  const data = fixture();
  const input = { actorType: "agent", actorId: "original-host", mcpSessionId: "original-session" } as const;
  data.unitOfWork.run(input, ({ repository }) => {
    if (false) {
      // @ts-expect-error REQ actor attribution cannot be reassigned.
      repository.actor.actorId = "";
    }
    expect(Object.isFrozen(repository.actor)).toBe(true);
    expect(() => { (repository.actor as { actorId: string }).actorId = ""; }).toThrow(TypeError);
    repository.updateCard(data.story.id, { title: "Attributed" });
  });
  expect(data.repository.listCardHistory(data.story.id).at(-1)).toMatchObject({ actor: input.actorId, mcpSessionId: input.mcpSessionId });
}

async function testRejectsAndObservesAsyncCallbackAndHookRejectionsWithoutUnhandledContinuations() {
  const data = fixture();
  const before = state(data.database);
  const callback = async ({ repository }: TransactionRepositories) => {
    repository.updateCard(data.story.id, { title: "Rolled back" });
    await Promise.resolve();
    repository.updateCard(data.story.id, { title: "Expired" });
  };
  expect(() => data.unitOfWork.run(ACTOR, callback as unknown as (tx: TransactionRepositories) => void)).toThrow("callbacks must be synchronous");
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(state(data.database)).toEqual(before);
  expect(data.hook).not.toHaveBeenCalled();
  const unitOfWork = new UnitOfWork(data.handle, async () => {
    expect(data.database.$client.inTransaction).toBe(false);
    await Promise.resolve();
    throw new Error("Rejected async hook");
  });
  expect(() => unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(data.story.id, { title: "Committed" }))).toThrow("already committed");
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(data.repository.getCardDetails(data.story.id)?.title).toBe("Committed");
  expect(data.repository.listCardHistory(data.story.id)).toHaveLength(2);
}

function testRejectsRootWritesForgedTransactionContextsAndExpiredReadsWrites() {
  const data = fixture();
  const before = state(data.database);
  if (false) {
    // @ts-expect-error REQ root writers are unavailable at compile time.
    data.repository.createCard({ storyMapId: data.map.id, level: "activity", title: "Rejected" });
    // @ts-expect-error REQ asynchronous unit of work callbacks are forbidden.
    data.unitOfWork.run(ACTOR, async () => undefined);
    // @ts-expect-error REQ every mutation requires an explicit actor.
    data.unitOfWork.run(undefined, () => undefined);
  }
  const root = data.repository as unknown as TxRepository;
  const facade = readFileSync(join(process.cwd(), "src/repositories/storymapper-repository.ts"), "utf8");
  const writers = [...facade.matchAll(/  (\w+) = [^\n]+ as Mode extends/g)].map((match) => match[1]!);
  const dynamicRoot = data.repository as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const writer of writers) expect(() => dynamicRoot[writer]!(undefined), writer).toThrow("active unit of work");
  expect(() => root.createCard({ storyMapId: data.map.id, level: "activity", title: "Rejected" })).toThrow("active unit of work");
  expect(() => (new ProjectRepository(data.handle) as unknown as ProjectRepository<"transaction">).create(data.project)).toThrow("active unit of work");
  const fake = new RepositoryContext(data.handle, { active: true, database: data.database, actor: ACTOR } as unknown as TransactionContext);
  expect(() => fake.assertWritable()).toThrow("Invalid transaction context");
  const escaped = data.unitOfWork.run(ACTOR, (tx) => tx);
  expect(() => escaped.repository.listProjects()).toThrow("expired");
  expect(() => escaped.repository.updateCard(data.story.id, { title: "Changed" })).toThrow("expired");
  expect(() => escaped.projects.list()).toThrow("expired");
  expect(() => escaped.repository.publicConnectorConnection(data.connection)).toThrow("expired");
  expect(state(data.database)).toEqual(before);
}

function testRollsBackWritesWhenTheCallbackReturnsAPromiseAndExpires() {
  const data = fixture();
  const before = state(data.database);
  let escaped: TxRepository | undefined;
  const asyncCallback = async ({ repository }: TransactionRepositories) => {
    escaped = repository;
    repository.updateCard(data.story.id, { title: "Changed" });
  };
  expect(() => data.unitOfWork.run(ACTOR, asyncCallback as unknown as (tx: TransactionRepositories) => void)).toThrow("synchronous");
  expect(state(data.database)).toEqual(before);
  expect(() => escaped!.listProjects()).toThrow("expired");
  expect(data.hook).not.toHaveBeenCalled();
}

async function testRejectsUseAfterAnAwaitedCallbackResumesFollowingRollback() {
  const data = fixture();
  const before = state(data.database);
  let continuation: Promise<void> | undefined;
  const callback = ({ repository }: TransactionRepositories) => {
    repository.updateCard(data.story.id, { title: "Rejected async" });
    continuation = Promise.resolve().then(() => {
      expect(() => repository.updateCard(data.story.id, { title: "Late write" })).toThrow("expired");
    });
    return continuation;
  };
  expect(() => data.unitOfWork.run(ACTOR, callback as unknown as (tx: TransactionRepositories) => void)).toThrow("synchronous");
  await continuation;
  expect(state(data.database)).toEqual(before);
  expect(data.hook).not.toHaveBeenCalled();
}

function testUsesTheReplacementDatabaseThroughExistingRepositoriesAndUnitOfWork() {
  const data = fixture();
  const replacement = fixture();
  const projects = new ProjectRepository(data.handle);
  const oldState = state(data.database);
  data.handle.current = replacement.database;
  expect(data.repository.listProjects()).toEqual(replacement.repository.listProjects());
  expect(projects.getById(data.project.id)).toBeUndefined();
  expect(projects.getById(replacement.project.id)?.id).toBe(replacement.project.id);
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.updateCard(replacement.story.id, { title: "Replacement" }));
  expect(replacement.repository.getCardDetails(replacement.story.id)?.title).toBe("Replacement");
  expect(state(data.database)).toEqual(oldState);
}

function testRecordsTerminalAuditAtomicallyRejectsFailedInsertsAndRefreshesReplacementStatements() {
  const data = fixture();
  const input = { projectId: null, metadata: { toolName: "ListProjects", inputHash: "a".repeat(64), outputHash: "b".repeat(64), outcome: "ok" as const, affectedEntityIds: [] } };
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.logMcpToolCall(input));
  expect(data.repository.listActivity().filter((event) => event.action === "tool_call")).toHaveLength(1);
  expect(data.hook).toHaveBeenCalledOnce();
  data.database.$client.exec("CREATE TRIGGER reject_tool_audit BEFORE INSERT ON activity_events WHEN NEW.action = 'tool_call' BEGIN SELECT RAISE(ABORT, 'Tool audit rejected'); END");
  expect(() => data.unitOfWork.run(ACTOR, ({ repository }) => repository.logMcpToolCall(input))).toThrow("Tool audit rejected");
  expect(data.hook).toHaveBeenCalledOnce();
  expect(data.repository.listActivity().filter((event) => event.action === "tool_call")).toHaveLength(1);
  const replacement = fixture();
  data.handle.current = replacement.database;
  data.unitOfWork.run(ACTOR, ({ repository }) => repository.logMcpToolCall(input));
  expect(replacement.repository.listActivity().filter((event) => event.action === "tool_call")).toHaveLength(1);
  expect(data.database.$client.prepare("SELECT count(*) AS count FROM activity_events WHERE action = 'tool_call'").get()).toEqual({ count: 1 });
  expect(() => new UnitOfWork(data.handle, () => { throw new Error("Audit notification rejected"); }).run(ACTOR, ({ repository }) => repository.logMcpToolCall(input))).toThrow("Audit notification rejected");
  expect(replacement.repository.listActivity().filter((event) => event.action === "tool_call")).toHaveLength(2);
  data.unitOfWork.run(ACTOR, () => data.unitOfWork.run(ACTOR, ({ repository }) => repository.logMcpToolCall(input)));
  expect(replacement.repository.listActivity().filter((event) => event.action === "tool_call")).toHaveLength(3);
}
