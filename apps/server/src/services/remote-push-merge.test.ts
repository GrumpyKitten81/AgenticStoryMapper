import { expect, it, vi } from "vitest";
import { openStoryMapperDb } from "@storymapper/db";
import { actor, remotePushFixture as fixture } from "@storymapper/server/fixtures/remote-push-execution";
import { importWorkItems, syncWorkItems } from "@storymapper/server/services/work-item-sync";
import { resolveGitHubConflictCommand } from "@storymapper/server/application/sync/github-conflict-command";
import { prepareRemotePush } from "@storymapper/server/services/remote-push-plan";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })), resolveGitHubAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));

it("includes local-only linked Release metadata edits in confirmed outgoing Sync effects", async () => {
  const data = fixture(1);
  const release = data.unitOfWork.run(actor, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Before", releaseDate: "2026-11-01" });
    repository.updateCard(data.cards[0]!.id, { releaseId: release.id });
    return release;
  });
  await data.execute((await data.prepare()).plan.id);
  const write = data.provider.writeMilestone.getMockImplementation()!;
  data.provider.writeMilestone.mockImplementation(async (...args) => {
    const result = await write(...args);
    for (const issue of data.issues) if (issue.milestoneNumber === result.remoteNumber) { issue.milestone = result.title; issue.milestoneDueOn = result.dueOn ?? undefined; }
    return result;
  });
  data.unitOfWork.run(actor, ({ repository }) => repository.updateRelease(release.id, { name: "After", releaseDate: "2026-11-15" }));
  const prepare = () => prepareRemotePush(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.cards[0]!.id], mode: "sync", localOrigin: "http://127.0.0.1:4317" });
  const reviewed = await prepare();
  expect(reviewed.plan.blockers).toEqual([]);
  expect(reviewed.plan.items).toMatchObject([{ kind: "milestone", entityId: release.id, action: "update", payload: { title: "After", dueOn: "2026-11-15T00:00:00.000Z", remoteId: "1" } }, { kind: "issue", payload: { milestoneNumber: null } }]);
  expect(data.milestones[0]).toMatchObject({ title: "Before", dueOn: "2026-11-01T00:00:00.000Z" });
  const executed = await data.execute(reviewed.plan.id);
  expect(executed.execution.items.map((row) => row.error)).toEqual([undefined, undefined]);
  expect(executed.execution).toMatchObject({ status: "completed", items: reviewed.plan.items.map(() => ({ state: "succeeded" })) });
  expect(data.milestones).toMatchObject([{ title: "After", dueOn: "2026-11-15T00:00:00.000Z" }]);
  expect(data.issues[0]).toMatchObject({ milestoneNumber: 1, milestone: "After", milestoneDueOn: "2026-11-15T00:00:00.000Z" });
  expect((await prepare()).plan.items).toEqual([]);
});

it.each(["iteration", "none"] as const)("excludes %s Releases from outgoing Milestone effects and preserves an existing remote assignment through confirmation", async (releaseSource) => {
  const data = fixture(1);
  await data.execute((await data.prepare()).plan.id);
  data.milestones.push({ remoteId: "9", remoteNumber: 9, url: "https://github.com/reviewed/fixture/milestone/9", title: "Unmanaged remote milestone", description: "External", dueOn: null, state: "open" });
  Object.assign(data.issues[0]!, { milestone: "Unmanaged remote milestone", milestoneNumber: 9 });
  data.unitOfWork.run(actor, ({ repository }) => {
    repository.updateConnectorConnection(data.connection.id, { releaseSource });
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Local iteration", startDate: "2026-10-19", releaseDate: "2026-10-26" });
    repository.updateCard(data.cards[0]!.id, { releaseId: release.id, title: "Outgoing edit" });
  });
  for (const mode of ["sync", "push"] as const) {
    const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.cards[0]!.id], mode, localOrigin: "http://127.0.0.1:4317" });
    expect(reviewed.plan.blockers).toEqual([]);
    expect(reviewed.plan.items).toMatchObject([{ kind: "issue", payload: { milestoneNumber: 9 } }]);
    expect(reviewed.plan.items.some((item) => item.kind === "milestone")).toBe(false);
    expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
    expect(data.issues[0]).toMatchObject({ milestone: "Unmanaged remote milestone", milestoneNumber: 9 });
    expect(data.milestones).toHaveLength(1);
  }
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
});

it("prepares independent local edits after unmapped-status import while refusing local status changes", async () => {
  const data = fixture(0);
  data.unitOfWork.run(actor, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { statusMapping: [{ localStatus: "todo", remoteState: "open", labels: ["todo"] }, { localStatus: "active", remoteState: "open", labels: ["active"] }] }));
  data.inputs.labels.push("todo", "active", "level:story");
  data.issues.push({ remoteId: "42", remoteNumber: 42, url: "https://github.com/reviewed/fixture/issues/42", title: "Imported", body: "Authored", state: "open", labels: [], issueType: "Task" });
  await importWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id });
  const cardId = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.cardId!;
  const scope = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [cardId] };
  for (let repeat = 0; repeat < 2; repeat++) expect((await syncWorkItems(data.repository, data.unitOfWork, actor, scope)).items).toMatchObject([{ status: "unchanged" }]);
  expect(() => data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(cardId, { status: "active" }))).toThrow("GitHub owns this Card status");
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(cardId, { title: "Independent local title" }));
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope);
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, actor, { ...scope, mode: "sync", localOrigin: "http://127.0.0.1:4317" });
  expect(reviewed.plan.blockers).toEqual([]);
  expect(reviewed.plan.items).toMatchObject([{ kind: "issue", payload: { title: "Independent local title", remoteState: "open" } }]);
  expect(reviewed.plan.items[0]!.payload).not.toMatchObject({ labels: expect.arrayContaining(["active"]) });
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
  expect(data.issues[0]!.title).toBe("Independent local title");
  expect(data.issues[0]!.labels).not.toContain("active");
  expect(data.repository.getCard(cardId)?.status).toBe("Open");
});

it("retains inbound iteration evidence and local metadata divergence when an unrelated Issue push returns no iteration", async () => {
  const data = fixture(0);
  data.unitOfWork.run(actor, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { releaseSource: "iteration" }));
  data.inputs.labels.push("level:story");
  const iteration = { title: "Iteration A", startDate: "2026-10-19", duration: 7 };
  data.issues.push({ remoteId: "43", remoteNumber: 43, url: "https://github.com/reviewed/fixture/issues/43", title: "Imported", body: "Authored", state: "open", labels: [], issueType: "Task", iteration });
  await importWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id });
  const cardId = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.cardId!;
  const scope = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [cardId] };
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope);
  const releaseId = data.repository.getCard(cardId)!.releaseId!;
  const before = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.baseline!;
  data.unitOfWork.run(actor, ({ repository }) => {
    repository.updateRelease(releaseId, { name: "Local name", releaseDate: "2026-12-01" });
    repository.updateCard(cardId, { title: "Outgoing title" });
  });
  const localRelease = data.repository.getRelease(releaseId);
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, actor, { ...scope, mode: "sync", localOrigin: "http://127.0.0.1:4317" });
  expect(reviewed.plan.blockers).toEqual([]);
  expect(reviewed.plan.items).toMatchObject([{ kind: "issue", payload: { title: "Outgoing title" } }]);
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
  expect(data.issues[0]!.iteration).toBeUndefined();
  const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
  expect(link).toMatchObject({ syncState: "unsynced", baseline: { acknowledgedLocal: { releaseId, releaseMetadata: before.acknowledgedLocal.releaseMetadata, iteration }, observedRemote: { releaseMetadata: before.observedRemote.releaseMetadata, iteration } } });
  data.issues[0]!.iteration = iteration;
  expect((await syncWorkItems(data.repository, data.unitOfWork, actor, scope)).items).toMatchObject([{ status: "unchanged" }]);
  expect(data.repository.getCard(cardId)!.releaseId).toBe(releaseId);
  expect(data.repository.getRelease(releaseId)).toEqual(localRelease);
  expect(data.repository.listReleases(data.map.id)).toHaveLength(1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.syncState).toBe("unsynced");
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
});

it.each(["local", "remote"] as const)("retains unreviewed remote observations after a single-field %s resolution", async (resolution) => {
  const data = fixture(1);
  await data.execute((await data.prepare()).plan.id);
  const card = data.cards[0]!;
  const before = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.baseline!;
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(card.id, { title: "Local title" }));
  data.issues[0]!.title = "Conflicting remote title";
  const scope = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [card.id] };
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope);
  const conflict = data.repository.listOpenSyncConflicts(data.map.id)[0]!;
  data.issues[0]!.body = "Unseen remote description";
  if (resolution === "remote") await resolveGitHubConflictCommand(data, actor, conflict.id, { storyMapId: data.map.id, resolution, apply: true, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } });
  else {
    const plan = await prepareRemotePush(data.repository, data.unitOfWork, actor, { ...scope, conflictId: conflict.id, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue }, mode: "push", localOrigin: "http://127.0.0.1:4317" });
    expect((await data.execute(plan.plan.id)).execution.status).toBe("completed");
  }
  expect(data.repository.getCard(card.id)!.description).toBe(card.description);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.baseline!.observedRemote.bodyHash).toBe(before.observedRemote.bodyHash);
  const pull = await syncWorkItems(data.repository, data.unitOfWork, actor, { ...scope, apply: false });
  expect(pull.items).toMatchObject([{ status: "proposed" }]);
  expect(pull.changeSet.operations).toEqual(expect.arrayContaining([expect.objectContaining({ entity: "card", op: "update", after: { description: "Unseen remote description" } })]));
});

it("pushes a locally resolved managed-label conflict through the confirmed plan and preserves unrelated labels", async () => {
  const data = fixture(1);
  const [risk, customer] = data.unitOfWork.run(actor, ({ repository }) => {
    repository.updateConnectorConnection(data.connection.id, { labelsAsAnnotations: true });
    return ["risk", "customer"].map((name) => repository.createAnnotation({ projectId: data.project.id, storyMapId: data.map.id, name }));
  });
  data.inputs.labels.push("risk", "customer", "unmanaged");
  await data.execute((await data.prepare()).plan.id);
  const card = data.cards[0]!;
  data.unitOfWork.run(actor, ({ repository }) => repository.setCardAnnotation(card.id, customer!.id));
  data.issues[0]!.labels.push("risk", "unmanaged");
  const scope = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [card.id] };
  expect((await syncWorkItems(data.repository, data.unitOfWork, actor, scope)).items).toMatchObject([{ status: "conflict" }]);
  const [conflict] = data.repository.listOpenSyncConflicts(data.map.id);
  expect(conflict).toMatchObject({ field: "labels", localValue: ["customer"], remoteValue: ["risk"] });
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, actor, { ...scope, conflictId: conflict!.id, reviewed: { localValue: conflict!.localValue, remoteValue: conflict!.remoteValue }, mode: "push", localOrigin: "http://127.0.0.1:4317" });
  expect(reviewed.plan.items).toMatchObject([{ kind: "issue", labelAdditions: ["customer"], labelRemovals: ["risk"] }]);
  expect(data.issues[0]!.labels).toContain("risk");
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
  expect(data.issues[0]!.labels).toEqual(expect.arrayContaining(["customer", "unmanaged"]));
  expect(data.issues[0]!.labels).not.toContain("risk");
  expect(data.repository.getSyncConflict(conflict!.id)).toMatchObject({ status: "resolved-local" });
  expect(data.repository.listCardAnnotationsForStoryMap(data.map.id).map((row) => row.annotationId)).toEqual([customer!.id]);
  expect(data.repository.listAnnotations(data.project.id, data.map.id).map((row) => row.id).sort()).toEqual([risk!.id, customer!.id].sort());
  expect((await syncWorkItems(data.repository, data.unitOfWork, actor, scope)).items).toMatchObject([{ status: "unchanged" }]);
});

it("retains parent evidence through a partial Issue write, reopen and a later full-read removal", async () => {
  const data = fixture(1);
  await data.execute((await data.prepare()).plan.id);
  data.issues[0]!.parentNumber = 42;
  const card = data.cards[0]!;
  const scope = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [card.id] };
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.remoteParentNumber).toBe(42);
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(card.id, { title: "Title edit" }));
  const plan = await data.prepare();
  expect((await data.execute(plan.plan.id)).execution.status).toBe("completed");
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.remoteParentNumber).toBe(42);
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.remoteParentNumber).toBe(42);
  data.issues[0]!.parentNumber = 42;
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.remoteParentNumber).toBe(42);
  delete data.issues[0]!.parentNumber;
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.remoteParentNumber).toBeNull();
});
