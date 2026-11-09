import { randomUUID } from "node:crypto";
import { mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { remotePushPlanSchema, type RemotePushPlan } from "@storymapper/contracts";
import { DatabaseHandle, StoryMapperRepository, UnitOfWork, createRedactedSnapshot, createRestorePoint, restoreProject, openStoryMapperDb } from "@storymapper/db";

const actor = { actorType: "human", actorId: "remote-plan-reviewer" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-remote-plan-"));
  const databasePath = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(databasePath));
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const work = new UnitOfWork(handle);
  const entities = work.run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Reviewed effects" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const card = repository.createCard({ storyMapId: map.id, level: "activity", cardType: "task", title: "Reviewed Issue" });
    const connection = repository.createConnectorConnection({ projectId: project.id, provider: "github", owner: "plan", repository: "fixture", name: "Plan connection", authMode: "token", readOnly: false, issueTypeMapping: [{ cardType: "task", issueType: "Task" }] });
    return { project, map, card, connection, epoch: repository.getSafetySettings(project.id).epoch! };
  });
  const plan: RemotePushPlan = { id: randomUUID(), actor, projectId: entities.project.id, storyMapId: entities.map.id, connectionId: entities.connection.id,
    epoch: entities.epoch, createdAt: new Date().toISOString(), selection: { cardIds: [entities.card.id] },
    localFingerprint: "reviewed-local", connectionFingerprint: "reviewed-connection", safetyFingerprint: "reviewed-safety", remoteFingerprint: "reviewed-remote",
    remoteEvidence: { issueTypes: ["Task"], labels: ["managed"], writable: true, milestones: [] }, exclusions: [], blockers: [],
    items: [{ id: randomUUID(), entityId: entities.card.id, kind: "issue", action: "create", marker: "stable-entity-marker", dependencies: [], labelAdditions: ["managed"], labelRemovals: [], managedLabels: ["managed"],
      payload: { title: entities.card.title, body: "Exact reviewed body", labels: ["managed"], issueType: "Task", remoteState: "open", milestoneNumber: null } }] };
  work.run(actor, ({ repository }) => repository.saveRemotePushPlan(plan));
  return { ...entities, handle, work, plan, databasePath, repository: new StoryMapperRepository(handle) };
}

it("retains exact immutable payload and pre-call intent across reopening, with guarded one-time human admission", () => {
  const data = fixture();
  const execution = data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(data.plan.id, actor));
  expect(() => data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(data.plan.id, actor))).toThrow("already consumed");
  const itemId = data.plan.items[0]!.id;
  data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(data.plan.id, itemId, execution.runToken!));
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.databasePath);
  expect(data.repository.getRemotePushPlan(data.plan.id)).toMatchObject({ plan: data.plan, execution: { status: "running", items: [{ state: "intent", attempt: 1 }] } });
  const resumed = data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(data.plan.id, actor, true));
  expect(resumed.runToken).not.toBe(execution.runToken);
  expect(() => data.work.run(actor, ({ repository }) => repository.recordRemotePushOutcome(data.plan.id, itemId, { state: "succeeded" }, execution.runToken!))).toThrow("ownership changed");
  expect(() => data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(data.plan.id, itemId, resumed.runToken!))).toThrow("reconciled");
  data.work.run(actor, ({ repository }) => repository.recordRemotePushOutcome(data.plan.id, itemId, { state: "remote_succeeded", remoteId: "6", url: "https://github.com/plan/fixture/issues/6" }, resumed.runToken!));
  data.work.run(actor, ({ repository }) => repository.recordRemotePushOutcome(data.plan.id, itemId, { state: "local_failed", remoteId: "6", url: "https://github.com/plan/fixture/issues/6", remoteResult: { remoteId: "6" }, error: "Local binding failed" }, resumed.runToken!));
  expect(data.repository.getRemotePushPlan(data.plan.id)?.execution.items[0]).toMatchObject({ state: "local_failed", remoteId: "6", attempt: 1 });
  data.work.run(actor, ({ repository }) => {
    repository.recordRemotePushOutcome(data.plan.id, itemId, { state: "succeeded", error: undefined }, resumed.runToken!);
    repository.updateRemotePushFingerprint(data.plan.id, "after-own-binding", resumed.runToken!);
    repository.finishRemotePushPlan(data.plan.id, "completed", resumed.runToken!);
  });
  expect(data.repository.getRemotePushPlan(data.plan.id)).toMatchObject({ plan: data.plan, execution: { status: "completed", expectedLocalFingerprint: "after-own-binding", items: [{ remoteId: "6", state: "succeeded" }] } });
  data.work.run(actor, ({ repository }) => {
    const next = { ...data.plan, id: randomUUID(), items: [{ ...data.plan.items[0]!, id: randomUUID() }] };
    repository.saveRemotePushPlan(next);
    const claimed = repository.claimRemotePushPlan(next.id, actor);
    expect(repository.recordRemotePushIntent(next.id, next.items[0]!.id, claimed.runToken!, next.items[0]!.payload).state).toBe("intent");
  });
  expect(data.repository.getConnectorConnection(data.connection.id)?.issueTypeMapping).toEqual([{ cardType: "task", issueType: "Task" }]);
});

it("refuses stale epochs, Agent confirmation, missing dependencies and overwriting an immutable plan", () => {
  const data = fixture();
  expect(() => data.work.run(actor, ({ repository }) => repository.saveRemotePushPlan({ ...data.plan, items: [] }))).toThrow();
  expect(() => data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(data.plan.id, { actorType: "agent", actorId: "agent" }))).toThrow("human-only");
  expect(() => data.work.run(actor, ({ repository }) => repository.saveRemotePushPlan({ ...data.plan, id: randomUUID(), items: [{ ...data.plan.items[0]!, dependencies: [randomUUID()] }] }))).toThrow("ordered");
  data.handle.current.$client.prepare("UPDATE project_settings SET epoch = ?").run(randomUUID());
  expect(() => data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(data.plan.id, actor))).toThrow("previous database epoch");
});

it("redacts plans, execution evidence and Activity payloads from portable snapshots", () => {
  const data = fixture();
  const snapshot = createRedactedSnapshot(data.databasePath, data.project.id);
  const database = new Database(snapshot.snapshotPath, { readonly: true });
  try {
    expect(database.prepare("SELECT * FROM remote_push_plans").all()).toEqual([]);
    expect(database.prepare("SELECT * FROM remote_push_executions").all()).toEqual([]);
    expect(database.prepare("SELECT before_json,after_json FROM activity_events WHERE affected_entity_type = 'remotePushPlan'").all()).toEqual([{ before_json: null, after_json: null }]);
    expect(database.pragma("foreign_key_check")).toEqual([]);
  } finally { database.close(); rmSync(snapshot.snapshotPath); }
});

it("retains operational plan and intent through actual Restore while refusing its old epoch consent", async () => {
  const data = fixture();
  const execution = data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(data.plan.id, actor));
  const itemId = data.plan.items[0]!.id;
  data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(data.plan.id, itemId, execution.runToken!, data.plan.items[0]!.payload));
  const point = createRestorePoint(data.handle, "manual");
  data.work.run(actor, ({ repository }) => repository.recordRemotePushOutcome(data.plan.id, itemId, { state: "remote_succeeded", remoteId: "6" }, execution.runToken!));
  await restoreProject(data.handle, data.project.id, point.fileName, actor);
  expect(data.repository.getRemotePushPlan(data.plan.id)).toMatchObject({ plan: data.plan, execution: { status: "running", items: [{ state: "remote_succeeded", remoteId: "6", intentPayload: data.plan.items[0]!.payload }] } });
  expect(() => data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(data.plan.id, actor, true))).toThrow("previous database epoch");
  const next = remotePushPlanSchema.parse({ ...data.plan, id: randomUUID(), epoch: data.repository.getSafetySettings(data.project.id).epoch!, items: [{ ...data.plan.items[0]!, id: randomUUID(), action: "update", payload: { ...data.plan.items[0]!.payload, remoteId: "6" } }] });
  data.work.run(actor, ({ repository }) => {
    repository.saveRemotePushPlan(next);
    const fresh = repository.claimRemotePushPlan(next.id, actor);
    expect(() => repository.recordRemotePushIntent(next.id, next.items[0]!.id, fresh.runToken!, { ...next.items[0]!.payload, remoteId: "7" }, { complete: true, remoteId: "7", executionState: repository.captureRemotePushReconciliation(next.id, next.items[0]!.id) })).toThrow(data.plan.id);
    repository.recordRemotePushIntent(next.id, next.items[0]!.id, fresh.runToken!, next.items[0]!.payload, { complete: true, remoteId: "6", executionState: repository.captureRemotePushReconciliation(next.id, next.items[0]!.id) });
  });
  expect(data.repository.getRemotePushPlan(data.plan.id)?.execution.items[0]).toMatchObject({ state: "remote_succeeded", remoteId: "6", intentPayload: data.plan.items[0]!.payload });
  expect(data.handle.current.$client.pragma("foreign_key_check")).toEqual([]);
});

it("keeps empty and Unscheduled selections exact and refuses foreign Card or Release identities", () => {
  const data = fixture();
  data.work.run(actor, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Assigned" });
    repository.updateCard(data.card.id, { releaseId: release.id });
    const unscheduled = repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Unscheduled" });
    const otherMap = repository.createStoryMap({ projectId: data.project.id, name: "Other" });
    const other = repository.createCard({ storyMapId: otherMap.id, level: "activity", cardType: "task", title: "Foreign" });
    const foreignRelease = repository.createRelease({ storyMapId: otherMap.id, name: "Foreign Release" });
    const input = { storyMapId: data.map.id, connectionId: data.connection.id, mode: "push" as const, localOrigin: "http://127.0.0.1:4317" };
    expect(repository.createWorkItemPushPlan({ ...input, cardIds: [] }).items).toEqual([]);
    expect(repository.createWorkItemPushPlan({ ...input, releaseId: null }).items.map((item) => item.cardId)).toEqual([unscheduled.id]);
    expect(() => repository.createWorkItemPushPlan({ ...input, cardIds: [other.id] })).toThrow("does not belong");
    expect(() => repository.createWorkItemPushPlan({ ...input, releaseId: foreignRelease.id })).toThrow("does not belong");
  });
});

it("retains a repeated failed preparation and interrupts each resumed execution", () => {
  const data = fixture();
  for (const [index, message] of ["Remote target changed", "Remote target still changed"].entries()) {
    data.work.run(actor, ({ repository }) => {
      const execution = repository.claimRemotePushPlan(data.plan.id, actor, index > 0);
      repository.recordRemotePushOutcome(data.plan.id, data.plan.items[0]!.id, { state: "failed", error: message }, execution.runToken!);
      repository.finishRemotePushPlan(data.plan.id, "interrupted", execution.runToken!);
    });
    expect(data.repository.getRemotePushPlan(data.plan.id)?.execution).toMatchObject({ status: "interrupted", items: [{ state: "failed", attempt: 0, error: message }] });
  }
});

it.each(["intent", "uncertain", "remote_succeeded", "local_failed"] as const)("guards an overlapping durable %s across plan IDs and reopening", (state) => {
  const data = fixture();
  const next = { ...data.plan, id: randomUUID(), items: [{ ...data.plan.items[0]!, id: randomUUID() }] };
  const first = data.work.run(actor, ({ repository }) => {
    repository.saveRemotePushPlan(next);
    const execution = repository.claimRemotePushPlan(data.plan.id, actor);
    repository.recordRemotePushIntent(data.plan.id, data.plan.items[0]!.id, execution.runToken!, data.plan.items[0]!.payload);
    if (state === "uncertain") repository.recordRemotePushOutcome(data.plan.id, data.plan.items[0]!.id, { state }, execution.runToken!);
    if (state === "remote_succeeded" || state === "local_failed") repository.recordRemotePushOutcome(data.plan.id, data.plan.items[0]!.id, { state: "remote_succeeded", remoteId: "6" }, execution.runToken!);
    if (state === "local_failed") repository.recordRemotePushOutcome(data.plan.id, data.plan.items[0]!.id, { state, remoteId: "6", error: "Binding failed" }, execution.runToken!);
    return execution;
  });
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.databasePath);
  const second = data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(next.id, actor));
  expect(() => data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(next.id, next.items[0]!.id, second.runToken!, next.items[0]!.payload, { complete: true, executionState: repository.captureRemotePushReconciliation(next.id, next.items[0]!.id) }))).toThrow(data.plan.id);
  expect(data.repository.getRemotePushPlan(next.id)?.execution.items[0]).toMatchObject({ state: "not_attempted", attempt: 0 });
  data.work.run(actor, ({ repository }) => repository.finishRemotePushPlan(data.plan.id, "interrupted", first.runToken!));
  if (state === "intent" || state === "uncertain") {
    data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(next.id, next.items[0]!.id, second.runToken!, next.items[0]!.payload, { complete: true, executionState: repository.captureRemotePushReconciliation(next.id, next.items[0]!.id) }));
    expect(data.repository.getRemotePushPlan(data.plan.id)?.execution.items[0]).toMatchObject({ state: "failed", attempt: 1, intentPayload: data.plan.items[0]!.payload });
  } else {
    expect(() => data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(next.id, next.items[0]!.id, second.runToken!, next.items[0]!.payload, { complete: true, executionState: repository.captureRemotePushReconciliation(next.id, next.items[0]!.id) }))).toThrow(data.plan.id);
    const payload = { ...next.items[0]!.payload, remoteId: "6" };
    data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(next.id, next.items[0]!.id, second.runToken!, payload, { complete: true, remoteId: "6", executionState: repository.captureRemotePushReconciliation(next.id, next.items[0]!.id) }));
    expect(data.repository.getRemotePushPlan(data.plan.id)?.execution.items[0]?.state).toBe(state);
  }
});

it("reconciles old-epoch uncertain evidence after Restore only with complete absence and fresh consent", async () => {
  const data = fixture();
  const execution = data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(data.plan.id, actor));
  data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(data.plan.id, data.plan.items[0]!.id, execution.runToken!, data.plan.items[0]!.payload));
  const point = createRestorePoint(data.handle, "manual");
  await restoreProject(data.handle, data.project.id, point.fileName, actor);
  const next = { ...data.plan, id: randomUUID(), epoch: data.repository.getSafetySettings(data.project.id).epoch!, items: [{ ...data.plan.items[0]!, id: randomUUID() }] };
  const fresh = data.work.run(actor, ({ repository }) => {
    repository.saveRemotePushPlan(next);
    return repository.claimRemotePushPlan(next.id, actor);
  });
  expect(() => data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(data.plan.id, actor, true))).toThrow("previous database epoch");
  expect(() => data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(next.id, next.items[0]!.id, fresh.runToken!, next.items[0]!.payload))).toThrow(data.plan.id);
  data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(next.id, next.items[0]!.id, fresh.runToken!, next.items[0]!.payload, { complete: true, executionState: repository.captureRemotePushReconciliation(next.id, next.items[0]!.id) }));
  expect(data.repository.getRemotePushPlan(data.plan.id)?.execution.items[0]).toMatchObject({ state: "failed", attempt: 1, intentPayload: data.plan.items[0]!.payload });
});

it("rejects stale absence evidence when the overlapping execution changes during lookup", () => {
  const data = fixture();
  const next = { ...data.plan, id: randomUUID(), items: [{ ...data.plan.items[0]!, id: randomUUID() }] };
  const first = data.work.run(actor, ({ repository }) => {
    repository.saveRemotePushPlan(next);
    const execution = repository.claimRemotePushPlan(data.plan.id, actor);
    repository.recordRemotePushIntent(data.plan.id, data.plan.items[0]!.id, execution.runToken!, data.plan.items[0]!.payload);
    return execution;
  });
  const second = data.work.run(actor, ({ repository }) => repository.claimRemotePushPlan(next.id, actor));
  const executionState = data.work.run(actor, ({ repository }) => repository.captureRemotePushReconciliation(next.id, next.items[0]!.id));
  data.work.run(actor, ({ repository }) => {
    repository.recordRemotePushOutcome(data.plan.id, data.plan.items[0]!.id, { state: "uncertain", error: "Response lost" }, first.runToken!);
    repository.finishRemotePushPlan(data.plan.id, "interrupted", first.runToken!);
  });
  expect(() => data.work.run(actor, ({ repository }) => repository.recordRemotePushIntent(next.id, next.items[0]!.id, second.runToken!, next.items[0]!.payload, { complete: true, executionState }))).toThrow(data.plan.id);
  expect(data.repository.getRemotePushPlan(data.plan.id)?.execution.items[0]).toMatchObject({ state: "uncertain", attempt: 1, error: "Response lost" });
  expect(data.repository.getRemotePushPlan(next.id)?.execution.items[0]).toMatchObject({ state: "not_attempted", attempt: 0 });
});

it.each(["malformed-json", "item-id", "ownership", "status"] as const)("refuses %s remote evidence through actual Restore without changing the live database", async (corruption) => {
  const data = fixture();
  const point = createRestorePoint(data.handle, "manual");
  const path = join(dirname(data.databasePath), "snapshots", point.fileName);
  const snapshot = new Database(path);
  try {
    if (corruption === "malformed-json") snapshot.prepare("UPDATE remote_push_executions SET execution_json = ?").run("{");
    if (corruption === "item-id") snapshot.prepare("UPDATE remote_push_executions SET execution_json = json_set(execution_json, '$.items[0].itemId', ?)").run(randomUUID());
    if (corruption === "ownership") snapshot.prepare("UPDATE remote_push_plans SET plan_json = json_set(plan_json, '$.projectId', ?)").run(randomUUID());
    if (corruption === "status") snapshot.prepare("UPDATE remote_push_executions SET execution_json = json_set(execution_json, '$.status', 'completed')").run();
  } finally { snapshot.close(); }
  const fileName = point.fileName.replace(`__${point.sizeBytes}__`, `__${statSync(path).size}__`);
  if (fileName !== point.fileName) renameSync(path, join(dirname(path), fileName));
  data.work.run(actor, ({ repository }) => repository.updateCard(data.card.id, { title: "Live edit after snapshot" }));
  const database = data.handle.current;
  const before = database.$client.serialize();
  await expect(restoreProject(data.handle, data.project.id, fileName, actor)).rejects.toThrow(corruption === "malformed-json" ? "Invalid stored JSON" : "inconsistent");
  expect(data.handle.current).toBe(database);
  expect(database.$client.serialize()).toEqual(before);
  expect(data.repository.getCard(data.card.id)?.title).toBe("Live edit after snapshot");
});
