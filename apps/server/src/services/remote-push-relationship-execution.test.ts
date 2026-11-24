import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { DatabaseHandle, StoryMapperRepository, openStoryMapperDb } from "@storymapper/db";
import { remotePushPlanSchema } from "@storymapper/contracts";
import { actor, remotePushFixture } from "@storymapper/server/fixtures/remote-push-execution";
import type { WorkItemProvider } from "@storymapper/github";
import { syncBaseline } from "@storymapper/server/services/sync-merge";
import { localPushFingerprint } from "@storymapper/server/services/remote-push-context";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));

it("journals an add before the write and reconciles a lost response without repeating it", async () => {
  const data = remotePushFixture(1);
  const reviewed = await data.prepare();
  const card = data.cards[0]!;
  const child = { remoteId: "7", remoteNumber: 7, url: "https://github.com/reviewed/fixture/issues/7", title: card.title, body: "body", state: "open", labels: [], parentEvidence: null };
  data.issues.push(child);
  data.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: data.connection.id, provider: "github", remoteId: "7", remoteNumber: 7, url: child.url, labels: [], baseline: { ...syncBaseline(repository, data.connection, card, child), parentKnown: false }, remoteParentNumber: null }));
  const parent = { kind: "existing", remoteNumber: 8, url: "https://github.com/reviewed/fixture/issues/8" };
  const effect = { id: randomUUID(), entityId: card.id, cardKey: card.key, cardTitle: card.title, kind: "relationship", action: "add", marker: "relationship", dependencies: [], labelAdditions: [], labelRemovals: [], managedLabels: [], child: { kind: "existing", remoteNumber: 7, url: child.url }, expectedParent: null, resultingParent: parent };
  const plan = remotePushPlanSchema.parse({ ...reviewed.plan, id: randomUUID(), localFingerprint: localPushFingerprint(data.repository, data.map.id, reviewed.plan.selection), items: [effect], blockers: [] });
  data.unitOfWork.run(actor, ({ repository }) => repository.saveRemotePushPlan(plan));
  data.provider.resolveIssueDatabaseId = vi.fn(async (_connection, _auth, number) => number * 100);
  data.provider.writeSubIssue = vi.fn(async (_connection, _auth, operation, parentNumber, databaseId) => {
    expect(data.repository.getRemotePushPlan(plan.id)!.execution.items[0]).toMatchObject({ state: "intent", intentPayload: { operation, parentNumber, childNumber: 7, childDatabaseId: databaseId, expectedParent: null, resultingParent: 8 } });
    Object.assign(child, { parentEvidence: { number: 8, url: parent.url, repository: "reviewed/fixture" } });
    throw new Error("Response lost");
  });
  expect((await data.execute(plan.id)).execution.items[0]).toMatchObject({ state: "uncertain" });
  const completed = await data.execute(plan.id, true);
  expect(completed.execution.status).toBe("completed");
  expect(data.provider.writeSubIssue).toHaveBeenCalledTimes(1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ remoteParentNumber: 8, parentOverrideLocal: false, baseline: { parentKnown: true } });
});

it("resumes a partially completed parent change without repeating removal and refuses later drift", async () => {
  const data = remotePushFixture(1);
  const reviewed = await data.prepare();
  const card = data.cards[0]!;
  const old = { kind: "existing", remoteNumber: 8, url: "https://github.com/reviewed/fixture/issues/8" };
  const next = { kind: "existing", remoteNumber: 9, url: "https://github.com/reviewed/fixture/issues/9" };
  const child = { remoteId: "7", remoteNumber: 7, url: "https://github.com/reviewed/fixture/issues/7", title: card.title, body: "body", state: "open", labels: [], parentEvidence: { number: 8, url: old.url, repository: "reviewed/fixture" } as { number: number; url: string; repository: string } | null };
  data.issues.push(child);
  data.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: data.connection.id, provider: "github", remoteId: "7", remoteNumber: 7, url: child.url, labels: [], baseline: { ...syncBaseline(repository, data.connection, card, child), parentKnown: false }, remoteParentNumber: 8, parentOverrideLocal: true }));
  const base = { entityId: card.id, cardKey: card.key, cardTitle: card.title, kind: "relationship", marker: "relationship", labelAdditions: [], labelRemovals: [], managedLabels: [], child: { kind: "existing", remoteNumber: 7, url: child.url } };
  const remove = { ...base, id: randomUUID(), action: "remove", dependencies: [], expectedParent: old, resultingParent: null };
  const add = { ...base, id: randomUUID(), action: "add", dependencies: [remove.id], expectedParent: null, resultingParent: next };
  const plan = remotePushPlanSchema.parse({ ...reviewed.plan, id: randomUUID(), localFingerprint: localPushFingerprint(data.repository, data.map.id, reviewed.plan.selection), items: [remove, add], blockers: [] });
  data.unitOfWork.run(actor, ({ repository }) => repository.saveRemotePushPlan(plan));
  data.provider.resolveIssueDatabaseId = vi.fn(async (_connection, _auth, number) => number * 100);
  const writeSubIssue = vi.fn<NonNullable<WorkItemProvider["writeSubIssue"]>>(async (_connection, _auth, operation) => {
    if (operation === "remove") { child.parentEvidence = null; return {}; }
    throw new Error("Add unavailable");
  });
  data.provider.writeSubIssue = writeSubIssue;
  const interrupted = await data.execute(plan.id);
  expect(interrupted.execution.items.map((item) => item.state)).toEqual(["succeeded", "uncertain"]);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ remoteParentNumber: 8, parentOverrideLocal: true });
  child.parentEvidence = { number: 10, url: "https://github.com/reviewed/fixture/issues/10", repository: "reviewed/fixture" };
  expect((await data.execute(plan.id, true)).execution.items[1]).toMatchObject({ state: "uncertain", error: expect.stringContaining("changed") });
  expect(data.provider.writeSubIssue).toHaveBeenCalledTimes(2);
  child.parentEvidence = null;
  writeSubIssue.mockImplementation(async () => { child.parentEvidence = { number: 9, url: next.url, repository: "reviewed/fixture" }; return {}; });
  expect((await data.execute(plan.id, true)).execution.status).toBe("completed");
  expect(writeSubIssue.mock.calls.map((call) => call[2])).toEqual(["remove", "add", "add"]);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ remoteParentNumber: 9, parentOverrideLocal: false, baseline: { parentKnown: true } });
});

it("retries only local acknowledgement after a verified remote write", async () => {
  const data = remotePushFixture(1);
  const reviewed = await data.prepare();
  const card = data.cards[0]!;
  const child = { remoteId: "7", remoteNumber: 7, url: "https://github.com/reviewed/fixture/issues/7", title: card.title, body: "body", state: "open", labels: [], parentEvidence: null as { number: number; url: string; repository: string } | null };
  data.issues.push(child);
  data.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: data.connection.id, provider: "github", remoteId: "7", remoteNumber: 7, url: child.url, labels: [], baseline: { ...syncBaseline(repository, data.connection, card, child), parentKnown: false }, remoteParentNumber: null }));
  const parent = { kind: "existing", remoteNumber: 8, url: "https://github.com/reviewed/fixture/issues/8" };
  const effect = { id: randomUUID(), entityId: card.id, cardKey: card.key, cardTitle: card.title, kind: "relationship", action: "add", marker: "relationship", dependencies: [], labelAdditions: [], labelRemovals: [], managedLabels: [], child: { kind: "existing", remoteNumber: 7, url: child.url }, expectedParent: null, resultingParent: parent };
  const plan = remotePushPlanSchema.parse({ ...reviewed.plan, id: randomUUID(), localFingerprint: localPushFingerprint(data.repository, data.map.id, reviewed.plan.selection), items: [effect], blockers: [] });
  data.unitOfWork.run(actor, ({ repository }) => repository.saveRemotePushPlan(plan));
  data.provider.resolveIssueDatabaseId = vi.fn(async (_connection, _auth, number) => number * 100);
  data.provider.writeSubIssue = vi.fn(async () => {
    child.parentEvidence = { number: 8, url: parent.url, repository: "reviewed/fixture" };
    data.handle.current.$client.exec("CREATE TRIGGER refuse_relationship_ack BEFORE UPDATE ON remote_push_executions WHEN json_extract(NEW.execution_json, '$.items[0].state') = 'succeeded' BEGIN SELECT RAISE(ABORT, 'ack refused'); END");
    return {};
  });
  expect((await data.execute(plan.id)).execution.items[0]).toMatchObject({ state: "local_failed", remoteResult: { response: {} } });
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.remoteParentNumber).toBeNull();
  data.handle.current.$client.exec("DROP TRIGGER refuse_relationship_ack");
  expect((await data.execute(plan.id, true)).execution.status).toBe("completed");
  expect(data.provider.writeSubIssue).toHaveBeenCalledTimes(1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.remoteParentNumber).toBe(8);
});

it("acknowledges a reviewed converged parent without writing a relationship", async () => {
  const data = remotePushFixture(1);
  const reviewed = await data.prepare();
  const card = data.cards[0]!;
  const parent = { kind: "existing", remoteNumber: 8, url: "https://github.com/reviewed/fixture/issues/8" };
  const child = { remoteId: "7", remoteNumber: 7, url: "https://github.com/reviewed/fixture/issues/7", title: card.title, body: "body", state: "open", labels: [], parentEvidence: { number: 8, url: parent.url, repository: "reviewed/fixture" } };
  data.issues.push(child);
  data.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: data.connection.id, provider: "github", remoteId: "7", remoteNumber: 7, url: child.url, labels: [], baseline: { ...syncBaseline(repository, data.connection, card, child), parentKnown: false }, remoteParentNumber: null, parentOverrideLocal: true }));
  const effect = { id: randomUUID(), entityId: card.id, cardKey: card.key, cardTitle: card.title, kind: "relationship", action: "acknowledge", marker: "relationship", dependencies: [], labelAdditions: [], labelRemovals: [], managedLabels: [], child: { kind: "existing", remoteNumber: 7, url: child.url }, expectedParent: parent, resultingParent: parent };
  const plan = remotePushPlanSchema.parse({ ...reviewed.plan, id: randomUUID(), localFingerprint: localPushFingerprint(data.repository, data.map.id, reviewed.plan.selection), items: [effect], blockers: [] });
  data.unitOfWork.run(actor, ({ repository }) => repository.saveRemotePushPlan(plan));
  data.provider.resolveIssueDatabaseId = vi.fn(async (_connection, _auth, number) => number * 100);
  data.provider.writeSubIssue = vi.fn();
  const completed = await data.execute(plan.id);
  expect(completed.execution.items[0]).toMatchObject({ state: "succeeded", intentPayload: { operation: "acknowledge", childNumber: 7, expectedParent: 8, resultingParent: 8 } });
  expect(data.provider.writeSubIssue).not.toHaveBeenCalled();
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ remoteParentNumber: 8, parentOverrideLocal: false, baseline: { parentKnown: true } });
});

it("requires Card readiness for an agent-origin relationship-only plan", async () => {
  const data = remotePushFixture(1);
  const reviewed = await data.prepare();
  const card = data.cards[0]!;
  const parent = { kind: "existing", remoteNumber: 8, url: "https://github.com/reviewed/fixture/issues/8" };
  const effect = { id: randomUUID(), entityId: card.id, cardKey: card.key, cardTitle: card.title, kind: "relationship", action: "add", marker: "relationship", dependencies: [], labelAdditions: [], labelRemovals: [], managedLabels: [], child: { kind: "existing", remoteNumber: 7, url: "https://github.com/reviewed/fixture/issues/7" }, expectedParent: null, resultingParent: parent };
  const plan = remotePushPlanSchema.parse({ ...reviewed.plan, id: randomUUID(), actor: { actorType: "agent", actorId: "planner" }, items: [effect], blockers: [] });
  data.unitOfWork.run(actor, ({ repository }) => {
    repository.appendReviewRecord(data.project.id, null, { kind: "settings", value: { reviewBeforeAgentPush: true, reviewAfterAgentCreate: false, reviewAfterAgentContentChange: false, allowHumanPushOverride: false } });
    repository.saveRemotePushPlan(plan);
  });
  expect(data.repository.getCardPushReadiness(plan)).toMatchObject({ required: true, ready: false, cards: [{ cardId: card.id, ready: false }] });
  expect(() => data.repository.assertCardReviewsForPush(plan)).toThrow("require a current successful DoR review");
});

it("acknowledges an explicit removal after verifying the child has no parent", async () => {
  const data = remotePushFixture(1);
  const reviewed = await data.prepare();
  const card = data.cards[0]!;
  const parent = { kind: "existing", remoteNumber: 8, url: "https://github.com/reviewed/fixture/issues/8" };
  const child = { remoteId: "7", remoteNumber: 7, url: "https://github.com/reviewed/fixture/issues/7", title: card.title, body: "body", state: "open", labels: [], parentEvidence: { number: 8, url: parent.url, repository: "reviewed/fixture" } as { number: number; url: string; repository: string } | null };
  data.issues.push(child);
  data.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: data.connection.id, provider: "github", remoteId: "7", remoteNumber: 7, url: child.url, labels: [], baseline: { ...syncBaseline(repository, data.connection, card, child), parentKnown: false }, remoteParentNumber: 8, parentOverrideLocal: true }));
  const effect = { id: randomUUID(), entityId: card.id, cardKey: card.key, cardTitle: card.title, kind: "relationship", action: "remove", marker: "relationship", dependencies: [], labelAdditions: [], labelRemovals: [], managedLabels: [], child: { kind: "existing", remoteNumber: 7, url: child.url }, expectedParent: parent, resultingParent: null };
  const plan = remotePushPlanSchema.parse({ ...reviewed.plan, id: randomUUID(), localFingerprint: localPushFingerprint(data.repository, data.map.id, reviewed.plan.selection), items: [effect], blockers: [] });
  data.unitOfWork.run(actor, ({ repository }) => repository.saveRemotePushPlan(plan));
  data.provider.resolveIssueDatabaseId = vi.fn(async (_connection, _auth, number) => number * 100);
  data.provider.writeSubIssue = vi.fn(async (_connection, _auth, operation, number, id) => { expect([operation, number, id]).toEqual(["remove", 8, 700]); child.parentEvidence = null; return {}; });
  expect((await data.execute(plan.id)).execution.status).toBe("completed");
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ remoteParentNumber: null, parentOverrideLocal: false, baseline: { parentKnown: true } });
  expect(data.issues).toHaveLength(1);
});

it("refuses a relationship write when the child has no content baseline", async () => {
  const data = remotePushFixture(1);
  const reviewed = await data.prepare();
  const card = data.cards[0]!;
  const child = { remoteId: "7", remoteNumber: 7, url: "https://github.com/reviewed/fixture/issues/7", title: card.title, body: "body", state: "open", labels: [], parentEvidence: null };
  data.issues.push(child);
  data.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: data.connection.id, provider: "github", remoteId: "7", remoteNumber: 7, url: child.url, labels: [], remoteParentNumber: null }));
  const effect = { id: randomUUID(), entityId: card.id, cardKey: card.key, cardTitle: card.title, kind: "relationship", action: "add", marker: "relationship", dependencies: [], labelAdditions: [], labelRemovals: [], managedLabels: [], child: { kind: "existing", remoteNumber: 7, url: child.url }, expectedParent: null, resultingParent: { kind: "existing", remoteNumber: 8, url: "https://github.com/reviewed/fixture/issues/8" } };
  const plan = remotePushPlanSchema.parse({ ...reviewed.plan, id: randomUUID(), localFingerprint: localPushFingerprint(data.repository, data.map.id, reviewed.plan.selection), items: [effect], blockers: [] });
  data.unitOfWork.run(actor, ({ repository }) => repository.saveRemotePushPlan(plan));
  data.provider.resolveIssueDatabaseId = vi.fn();
  data.provider.writeSubIssue = vi.fn();
  expect((await data.execute(plan.id)).execution.items[0]).toMatchObject({ state: "failed", error: expect.stringContaining("no sync baseline") });
  expect(data.provider.writeSubIssue).not.toHaveBeenCalled();
});

it("reconciles a lost removal response after reopening the database", async () => {
  const data = remotePushFixture(1);
  const reviewed = await data.prepare();
  const card = data.cards[0]!;
  const parent = { kind: "existing", remoteNumber: 8, url: "https://github.com/reviewed/fixture/issues/8" };
  const child = { remoteId: "7", remoteNumber: 7, url: "https://github.com/reviewed/fixture/issues/7", title: card.title, body: "body", state: "open", labels: [], parentEvidence: { number: 8, url: parent.url, repository: "reviewed/fixture" } as { number: number; url: string; repository: string } | null };
  data.issues.push(child);
  data.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: data.connection.id, provider: "github", remoteId: "7", remoteNumber: 7, url: child.url, labels: [], baseline: { ...syncBaseline(repository, data.connection, card, child), parentKnown: true }, remoteParentNumber: 8, parentOverrideLocal: true }));
  const effect = { id: randomUUID(), entityId: card.id, cardKey: card.key, cardTitle: card.title, kind: "relationship", action: "remove", marker: "relationship", dependencies: [], labelAdditions: [], labelRemovals: [], managedLabels: [], child: { kind: "existing", remoteNumber: 7, url: child.url }, expectedParent: parent, resultingParent: null };
  const plan = remotePushPlanSchema.parse({ ...reviewed.plan, id: randomUUID(), localFingerprint: localPushFingerprint(data.repository, data.map.id, reviewed.plan.selection), items: [effect], blockers: [] });
  data.unitOfWork.run(actor, ({ repository }) => repository.saveRemotePushPlan(plan));
  data.provider.resolveIssueDatabaseId = vi.fn(async (_connection, _auth, number) => number * 100);
  data.provider.writeSubIssue = vi.fn(async () => { child.parentEvidence = null; throw new Error("Removal response lost"); });
  expect((await data.execute(plan.id)).execution.items[0]).toMatchObject({ state: "uncertain", intentPayload: { operation: "remove", childDatabaseId: 700, expectedParent: 8, resultingParent: null } });
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect((await data.execute(plan.id, true)).execution.status).toBe("completed");
  expect(data.provider.writeSubIssue).toHaveBeenCalledTimes(1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ remoteParentNumber: null, parentOverrideLocal: false, baseline: { parentKnown: true } });
});

it("retains remote success in the original database when replacement occurs during a relationship write", async () => {
  const data = remotePushFixture(1);
  const reviewed = await data.prepare();
  const card = data.cards[0]!;
  const child = { remoteId: "7", remoteNumber: 7, url: "https://github.com/reviewed/fixture/issues/7", title: card.title, body: "body", state: "open", labels: [], parentEvidence: null as { number: number; url: string; repository: string } | null };
  data.issues.push(child);
  data.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ cardId: card.id, connectionId: data.connection.id, provider: "github", remoteId: "7", remoteNumber: 7, url: child.url, labels: [], baseline: { ...syncBaseline(repository, data.connection, card, child), parentKnown: true }, remoteParentNumber: null }));
  const parent = { kind: "existing", remoteNumber: 8, url: "https://github.com/reviewed/fixture/issues/8" };
  const effect = { id: randomUUID(), entityId: card.id, cardKey: card.key, cardTitle: card.title, kind: "relationship", action: "add", marker: "relationship", dependencies: [], labelAdditions: [], labelRemovals: [], managedLabels: [], child: { kind: "existing", remoteNumber: 7, url: child.url }, expectedParent: null, resultingParent: parent };
  const plan = remotePushPlanSchema.parse({ ...reviewed.plan, id: randomUUID(), localFingerprint: localPushFingerprint(data.repository, data.map.id, reviewed.plan.selection), items: [effect], blockers: [] });
  data.unitOfWork.run(actor, ({ repository }) => repository.saveRemotePushPlan(plan));
  data.provider.resolveIssueDatabaseId = vi.fn(async (_connection, _auth, number) => number * 100);
  const original = data.handle.current;
  const replacement = openStoryMapperDb(join(data.directory, "replacement.sqlite"));
  data.provider.writeSubIssue = vi.fn(async () => { child.parentEvidence = { number: 8, url: parent.url, repository: "reviewed/fixture" }; data.handle.current = replacement; return { id: 700 }; });
  try {
    await expect(data.execute(plan.id)).rejects.toThrow("Database changed");
    const retained = new StoryMapperRepository(new DatabaseHandle(original)).getRemotePushPlan(plan.id)!;
    expect(retained.execution).toMatchObject({ status: "interrupted", items: [{ state: "remote_succeeded", remoteResult: { response: { id: 700 } } }] });
  } finally {
    data.handle.current = original;
    replacement.$client.close();
  }
  expect((await data.execute(plan.id, true)).execution.status).toBe("completed");
  expect(data.provider.writeSubIssue).toHaveBeenCalledTimes(1);
});
