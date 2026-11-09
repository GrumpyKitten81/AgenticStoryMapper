import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { DomainError, type RemoteIssuePayload, type RemoteMilestonePayload } from "@storymapper/contracts";
import { DatabaseHandle, StoryMapperRepository, UnitOfWork, createRestorePoint, openStoryMapperDb, restoreProject } from "@storymapper/db";
import { createWorkItemProvider, type RemoteWorkItem, type WorkItemProvider } from "@storymapper/github";
import { actor, remotePushFixture as fixture, remotePushCleanup as close } from "@storymapper/server/fixtures/remote-push-execution";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { prepareRemotePush } from "@storymapper/server/services/remote-push-plan";
import { planWorkItems } from "@storymapper/server/services/work-item-sync";
import { executeRemotePush } from "@storymapper/server/services/remote-push-execution";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));

type Fixture = ReturnType<typeof fixture>;

function persistedIntent(data: Fixture, planId: string, payload: RemoteIssuePayload | RemoteMilestonePayload): void {
  expect(data.handle.current.$client.inTransaction).toBe(false);
  const items = data.repository.getRemotePushPlan(planId)!.execution.items;
  const intent = items.find((row) => row.state === "intent");
  expect(intent?.intentPayload).toEqual(payload);
  expect(intent?.attempt).toBeGreaterThan(0);
}

function reopen(data: Fixture): void {
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
}

it("reopens twelve reviewed Issues after the sixth remote effect loses its local outcome and resumes without duplication", async () => {
  const data = fixture(12);
  const reviewed = await data.prepare();
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementation(async (connection, auth, payload) => {
    persistedIntent(data, reviewed.plan.id, payload);
    const remote = await write(connection, auth, payload);
    if (data.issues.length === 6) data.handle.current.$client.exec("CREATE TRIGGER refuse_sixth_outcome BEFORE UPDATE ON remote_push_executions WHEN json_extract(NEW.execution_json, '$.items[5].state') = 'remote_succeeded' BEGIN SELECT RAISE(ABORT, 'sixth outcome interrupted'); END");
    return remote;
  });
  const interrupted = await data.execute(reviewed.plan.id);
  expect(interrupted.execution).toMatchObject({ status: "interrupted", items: [
    ...Array.from({ length: 5 }, () => ({ state: "succeeded" })), { state: "uncertain", attempt: 1 }, ...Array.from({ length: 6 }, () => ({ state: "not_attempted" }))
  ] });
  expect(data.issues).toHaveLength(6);
  data.handle.current.$client.exec("DROP TRIGGER refuse_sixth_outcome");
  reopen(data);
  const completed = await data.execute(reviewed.plan.id, true);
  expect(completed.execution.status).toBe("completed");
  expect(completed.execution.items.every((row) => row.state === "succeeded")).toBe(true);
  expect(completed.plan).toEqual(reviewed.plan);
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(12);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toHaveLength(12);
  for (const effect of reviewed.plan.items) {
    expect(data.issues.filter((row) => row.body.includes(effect.marker))).toHaveLength(1);
    expect(data.provider.writeRemoteIssue.mock.calls.find((call) => call[2].title === effect.payload.title)?.[2]).toEqual(effect.payload);
  }
});

it("reconciles an unknown create response after reopening instead of issuing another create", async () => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => {
    persistedIntent(data, reviewed.plan.id, payload);
    await write(connection, auth, payload);
    throw new DomainError("internal", "Provider response was lost after creation.");
  });
  const interrupted = await data.execute(reviewed.plan.id);
  expect(interrupted.execution.items[0]).toMatchObject({ state: "uncertain", attempt: 1 });
  reopen(data);
  expect((await data.execute(reviewed.plan.id, true)).execution.items[0]).toMatchObject({ state: "succeeded", remoteId: "1", url: "https://github.com/reviewed/fixture/issues/1", attempt: 1 });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.issues).toHaveLength(1);
});

it("retains remote success after canonical binding audit failure and retries only local persistence", async () => {
  const data = fixture(2);
  const reviewed = await data.prepare();
  data.handle.current.$client.exec("CREATE TRIGGER refuse_binding_audit BEFORE INSERT ON activity_events WHEN NEW.action = 'externalRef.created' BEGIN SELECT RAISE(ABORT, 'binding audit failed'); END");
  const interrupted = await data.execute(reviewed.plan.id);
  expect(interrupted.execution).toMatchObject({ status: "interrupted", items: [{ state: "local_failed", remoteId: "1", url: "https://github.com/reviewed/fixture/issues/1" }, { state: "not_attempted" }] });
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([]);
  data.handle.current.$client.exec("DROP TRIGGER refuse_binding_audit");
  reopen(data);
  const completed = await data.execute(reviewed.plan.id, true);
  expect(completed.execution.status).toBe("completed");
  expect(completed.execution.items[0]?.error).toBeUndefined();
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(2);
  expect(data.issues).toHaveLength(2);
});

it("admits one confirmation while its provider call is pending and refuses an Agent confirmation before credentials", async () => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const pending = new Promise<void>((resolve) => { release = resolve; });
  data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => { entered(); await pending; return write(connection, auth, payload); });
  const first = data.execute(reviewed.plan.id);
  await started;
  await expect(data.execute(reviewed.plan.id)).rejects.toMatchObject({ code: "conflict" });
  await expect(data.execute(reviewed.plan.id, true)).rejects.toMatchObject({ code: "conflict" });
  const authCalls = vi.mocked(resolveProviderAuth).mock.calls.length;
  await expect(executeRemotePush(data.repository, data.unitOfWork, { actorType: "agent", actorId: "agent" }, reviewed.plan.id)).rejects.toMatchObject({ code: "protected" });
  expect(resolveProviderAuth).toHaveBeenCalledTimes(authCalls);
  release();
  expect((await first).execution.status).toBe("completed");
  await expect(data.execute(reviewed.plan.id)).rejects.toMatchObject({ code: "conflict" });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
});

it.each(["content", "mapping", "safety", "remote-labels"] as const)("refuses changed %s inputs before modifying GitHub", async (changed) => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  data.unitOfWork.run(actor, ({ repository }) => {
    if (changed === "content") repository.updateCard(data.cards[0]!.id, { title: "Changed after review" });
    if (changed === "mapping") repository.updateConnectorConnection(data.connection.id, { issueTypeMapping: [{ cardType: "task", issueType: "Bug" }] });
    if (changed === "safety") repository.updateSafetySettings(data.project.id, { github: false });
  });
  if (changed === "remote-labels") data.inputs.labels.push("new-remote-label");
  await expect(data.execute(reviewed.plan.id)).rejects.toMatchObject({ code: changed === "safety" ? "disabled" : "conflict" });
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
});

it.each(["ambiguous", "partial", "transport"] as const)("does not turn a %s marker lookup into permission to recreate an uncertain Issue", async (failure) => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  data.provider.writeRemoteIssue.mockRejectedValueOnce(new DomainError("internal", "Unknown create result"));
  expect((await data.execute(reviewed.plan.id)).execution.items[0]?.state).toBe("uncertain");
  if (failure === "transport") data.provider.findRemoteItemsByMarker.mockRejectedValueOnce(new DomainError("internal", "Lookup failed"));
  else if (failure === "partial") data.provider.findRemoteItemsByMarker.mockResolvedValueOnce({ complete: false, matches: [] } as unknown as Awaited<ReturnType<WorkItemProvider["findRemoteItemsByMarker"]>>);
  else data.provider.findRemoteItemsByMarker.mockResolvedValueOnce({ complete: true, matches: [
    { remoteId: "1", url: "https://github.com/reviewed/fixture/issues/1", title: "Ambiguous", body: "", labels: [], state: "open" },
    { remoteId: "2", url: "https://github.com/reviewed/fixture/issues/2", title: "Ambiguous", body: "", labels: [], state: "open" }
  ] });
  expect((await data.execute(reviewed.plan.id, true)).execution.items[0]?.state).toBe("uncertain");
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
});

it("reviews one shared Milestone and materializes its identity in each durable Issue intent", async () => {
  const data = fixture(2);
  const release = data.unitOfWork.run(actor, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Release", goal: "Reviewed goal", releaseDate: "2026-11-20" });
    for (const card of data.cards) repository.updateCard(card.id, { releaseId: release.id });
    return release;
  });
  const reviewed = await data.prepare(data.cards.map(({ id }) => id), release.id);
  expect(reviewed.plan.items.map(({ kind }) => kind)).toEqual(["milestone", "issue", "issue"]);
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  const milestoneWrite = data.provider.writeMilestone.getMockImplementation()!;
  data.provider.writeMilestone.mockImplementation(async (connection, auth, payload) => { persistedIntent(data, reviewed.plan.id, payload); return milestoneWrite(connection, auth, payload); });
  data.provider.writeRemoteIssue.mockImplementation(async (connection, auth, payload) => { persistedIntent(data, reviewed.plan.id, payload); expect(payload.milestoneNumber).toBe(1); return write(connection, auth, payload); });
  const completed = await data.execute(reviewed.plan.id);
  expect(completed.execution.status).toBe("completed");
  expect(data.provider.writeMilestone).toHaveBeenCalledTimes(1);
  expect(data.provider.writeMilestone.mock.calls[0]?.[2]).toEqual(reviewed.plan.items[0]!.payload);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).filter((row) => row.releaseId === release.id)).toHaveLength(1);
});

it("stops dependent Issues after Milestone failure and can review an empty Release without expanding Card selection", async () => {
  const data = fixture(2);
  const release = data.unitOfWork.run(actor, ({ repository }) => repository.createRelease({ storyMapId: data.map.id, name: "Empty release" }));
  const reviewed = await data.prepare([], release.id);
  expect(reviewed.plan.items.map(({ kind }) => kind)).toEqual(["milestone"]);
  data.provider.writeMilestone.mockRejectedValueOnce(new DomainError("internal", "Milestone response unknown"));
  expect((await data.execute(reviewed.plan.id)).execution.items[0]?.state).toBe("uncertain");
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  const empty = await data.prepare([]);
  expect(empty.plan.items).toEqual([]);
  expect(data.issues).toEqual([]);
});

it("requires a new review after actual Restore and reuses the stable marker when the rewound local binding is absent", async () => {
  const data = fixture(1);
  const point = createRestorePoint(data.handle, "manual");
  const reviewed = await data.prepare();
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
  await restoreProject(data.handle, data.project.id, point.fileName, actor);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([]);
  expect(data.repository.getRemotePushPlan(reviewed.plan.id)).toMatchObject({ plan: reviewed.plan, execution: { status: "completed", items: [{ state: "succeeded", remoteId: "1" }] } });
  await expect(data.execute(reviewed.plan.id, true)).rejects.toMatchObject({ code: "conflict" });
  const rerun = await data.prepare();
  expect(rerun.plan.items[0]).toMatchObject({ action: "update", marker: reviewed.plan.items[0]!.marker, payload: { remoteId: "1" } });
  expect((await data.execute(rerun.plan.id)).execution.status).toBe("completed");
  expect(data.issues).toHaveLength(1);
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(2);
});

it.each(["card", "map", "connection", "safety"] as const)("retains the actual remote success and stops the batch when %s changes in flight", async (changed) => {
  const data = fixture(2);
  const reviewed = await data.prepare();
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => {
    const result = await write(connection, auth, payload);
    data.unitOfWork.run(actor, ({ repository }) => {
      if (changed === "card") repository.updateCard(data.cards[0]!.id, { title: "Concurrent local title" });
      if (changed === "map") repository.deleteStoryMap(data.map.id);
      if (changed === "connection") repository.deleteConnectorConnection(data.connection.id);
      if (changed === "safety") repository.updateSafetySettings(data.project.id, { github: false });
    });
    return result;
  });
  const interrupted = await data.execute(reviewed.plan.id);
  expect(interrupted.execution).toMatchObject({ status: "interrupted", items: [{ state: "local_failed", remoteId: "1", url: "https://github.com/reviewed/fixture/issues/1" }, { state: "not_attempted" }] });
  expect(data.issues).toHaveLength(1);
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([]);
});

it.each(["intent", "confirmation-audit"] as const)("sends no modifying provider call when durable %s persistence fails", async (failure) => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  if (failure === "intent") data.handle.current.$client.exec("CREATE TRIGGER refuse_intent BEFORE UPDATE ON remote_push_executions WHEN json_extract(NEW.execution_json, '$.items[0].state') = 'intent' BEGIN SELECT RAISE(ABORT, 'intent commit refused'); END");
  else data.handle.current.$client.exec("CREATE TRIGGER refuse_confirmation_audit BEFORE INSERT ON activity_events WHEN NEW.action = 'remotePushPlan.confirmed' BEGIN SELECT RAISE(ABORT, 'confirmation audit refused'); END");
  if (failure === "intent") expect((await data.execute(reviewed.plan.id)).execution.items[0]?.state).toBe("failed");
  else {
    await expect(data.execute(reviewed.plan.id)).rejects.toThrow("confirmation audit refused");
    expect(data.repository.getRemotePushPlan(reviewed.plan.id)?.execution.status).toBe("reviewed");
  }
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.issues).toEqual([]);
});

it("stops all dependent Issue effects when their reviewed Milestone write fails", async () => {
  const data = fixture(2);
  const release = data.unitOfWork.run(actor, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Milestone prerequisite" });
    for (const card of data.cards) repository.updateCard(card.id, { releaseId: release.id });
    return release;
  });
  const reviewed = await data.prepare(data.cards.map(({ id }) => id), release.id);
  data.provider.writeMilestone.mockRejectedValueOnce(new DomainError("internal", "Milestone unavailable"));
  const interrupted = await data.execute(reviewed.plan.id);
  expect(interrupted.execution.items).toMatchObject([{ state: "uncertain" }, { state: "not_attempted" }, { state: "not_attempted" }]);
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
});

it("refuses a changed reviewed remote target and preserves an unrelated remote label in the next review", async () => {
  const data = fixture(1);
  const first = await data.prepare();
  await data.execute(first.plan.id);
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(data.cards[0]!.id, { title: "Reviewed local change" }));
  data.issues[0]!.labels.push("status:todo", "unrelated-label");
  data.inputs.labels.push("unrelated-label");
  const reviewed = await data.prepare();
  expect(reviewed.plan.items[0]!.payload).toMatchObject({ labels: expect.arrayContaining(["unrelated-label"]) });
  expect(reviewed.plan.items[0]!.labelRemovals).not.toContain("unrelated-label");
  data.issues[0]!.title = "Changed remotely after review";
  const interrupted = await data.execute(reviewed.plan.id);
  expect(interrupted.execution.items[0]).toMatchObject({ state: "failed", attempt: 0, error: expect.stringContaining("Remote target changed") });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
});

it.each(["mapping", "label", "permissions"] as const)("persists an actionable blocked plan for missing %s without sending hidden writes", async (missing) => {
  const data = fixture(1);
  if (missing === "mapping") data.unitOfWork.run(actor, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { issueTypeMapping: [] }));
  if (missing === "label") data.inputs.labels = [];
  if (missing === "permissions") data.inputs.writable = false;
  const reviewed = await data.prepare();
  expect(reviewed.plan.blockers.length).toBeGreaterThan(0);
  await expect(data.execute(reviewed.plan.id)).rejects.toMatchObject({ code: "validation" });
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it("allows a human under Agent protection but refuses protected Agent planning before credentials", async () => {
  const data = fixture(1);
  data.unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(data.project.id, { agentMode: "propose" }));
  const calls = vi.mocked(resolveProviderAuth).mock.calls.length;
  await expect(prepareRemotePush(data.repository, data.unitOfWork, { actorType: "agent", actorId: "agent" }, { storyMapId: data.map.id, connectionId: data.connection.id, mode: "push", localOrigin: "http://127.0.0.1:4317" })).rejects.toMatchObject({ code: "protected" });
  expect(resolveProviderAuth).toHaveBeenCalledTimes(calls);
  const reviewed = await data.prepare();
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
});

it("retains known success only in the original database when a provider response crosses database replacement", async () => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  const original = data.handle.current;
  const originalRepository = new StoryMapperRepository(new DatabaseHandle(original));
  const replacementPath = join(data.directory, "replacement.sqlite");
  let replacementEvidence = "";
  data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => {
    const remote = await write(connection, auth, payload);
    await original.$client.backup(replacementPath);
    data.handle.current = openStoryMapperDb(replacementPath);
    replacementEvidence = JSON.stringify(data.repository.getRemotePushPlan(reviewed.plan.id));
    close.push(() => { if (original.$client.open) original.$client.close(); });
    return remote;
  });
  await expect(data.execute(reviewed.plan.id)).rejects.toMatchObject({ code: "conflict" });
  expect(JSON.stringify(data.repository.getRemotePushPlan(reviewed.plan.id))).toBe(replacementEvidence);
  expect(originalRepository.getRemotePushPlan(reviewed.plan.id)?.execution.items[0]).toMatchObject({ remoteId: "1", url: "https://github.com/reviewed/fixture/issues/1" });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
});

it("honors committed intent and outcome writes when post-commit publication fails", async () => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  const publishingWork = new UnitOfWork(data.handle, () => { throw new Error("Publication failed after commit"); }, undefined, () => undefined);
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => {
    persistedIntent(data, reviewed.plan.id, payload);
    return write(connection, auth, payload);
  });
  const completed = await executeRemotePush(data.repository, publishingWork, actor, reviewed.plan.id, false, () => "http://127.0.0.1:4317");
  expect(completed.execution.status).toBe("completed");
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toHaveLength(1);
});

it("retries an uncertain create only after complete reconciliation proves its marker absent", async () => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  data.provider.writeRemoteIssue.mockRejectedValueOnce(new DomainError("internal", "No response received"));
  expect((await data.execute(reviewed.plan.id)).execution.items[0]?.state).toBe("uncertain");
  expect(data.issues).toEqual([]);
  const completed = await data.execute(reviewed.plan.id, true);
  expect(completed.execution.items[0]).toMatchObject({ state: "succeeded", attempt: 2 });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(2);
  expect(data.provider.writeRemoteIssue.mock.calls[0]?.[2]).toEqual(data.provider.writeRemoteIssue.mock.calls[1]?.[2]);
  expect(data.issues).toHaveLength(1);
});

it("retains earlier success when repository capability drifts before the next exact effect", async () => {
  const data = fixture(2);
  const reviewed = await data.prepare();
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => {
    const remote = await write(connection, auth, payload);
    data.inputs.writable = false;
    return remote;
  });
  const interrupted = await data.execute(reviewed.plan.id);
  expect(interrupted.execution).toMatchObject({ status: "interrupted", items: [{ state: "succeeded", remoteId: "1" }, { state: "failed", attempt: 0 }] });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toHaveLength(1);
});

it("maps the explicit Card type when imported native type evidence differs", async () => {
  const data = fixture(1);
  const first = await data.prepare();
  await data.execute(first.plan.id);
  data.inputs.issueTypes.push("Bug");
  data.issues[0]!.issueType = "Bug";
  data.unitOfWork.run(actor, ({ repository }) => {
    const link = repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
    repository.bindRemoteWorkItemLink({ ...link, issueType: "Bug" });
  });
  const reviewed = await data.prepare();
  expect(reviewed.plan.blockers).toEqual([]);
  expect(reviewed.plan.items[0]!.payload).toMatchObject({ issueType: "Task" });
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
  expect(data.provider.writeRemoteIssue.mock.calls.at(-1)?.[2].issueType).toBe("Task");
});

it("reviews a closed new Issue as separate exact open-create and dependent close effects", async () => {
  const data = fixture(1);
  data.unitOfWork.run(actor, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { statusMapping: [{ localStatus: "todo", remoteState: "closed", labels: ["closed"] }] }));
  data.inputs.labels.push("closed");
  const reviewed = await data.prepare();
  expect(reviewed.plan.items).toMatchObject([
    { action: "create", payload: { remoteState: "open" } },
    { action: "update", issueItemId: reviewed.plan.items[0]!.id, dependencies: [reviewed.plan.items[0]!.id], payload: { remoteState: "closed" } }
  ]);
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
  expect(data.provider.writeRemoteIssue.mock.calls.map((call) => call[2])).toEqual([
    reviewed.plan.items[0]!.payload,
    { ...reviewed.plan.items[1]!.payload, remoteId: "1" }
  ]);
  expect(data.issues).toHaveLength(1);
  expect(data.issues[0]?.state).toBe("closed");
});

it("refuses a dependent close when a remote editor changed the newly created Issue", async () => {
  const data = fixture(1);
  data.unitOfWork.run(actor, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { statusMapping: [{ localStatus: "todo", remoteState: "closed", labels: ["closed"] }] }));
  data.inputs.labels.push("closed");
  const reviewed = await data.prepare();
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => {
    const remote = await write(connection, auth, payload);
    data.issues[0]!.title = "Concurrent remote editor title";
    return remote;
  });
  const interrupted = await data.execute(reviewed.plan.id);
  expect(interrupted.execution.items).toMatchObject([{ state: "succeeded" }, { state: "failed", attempt: 0 }]);
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.issues[0]?.title).toBe("Concurrent remote editor title");
});

it("reviews Milestone rename, clearing, due date and closed state as an explicit update", async () => {
  const data = fixture(0);
  const release = data.unitOfWork.run(actor, ({ repository }) => repository.createRelease({ storyMapId: data.map.id, name: "First name", goal: "Previous goal", releaseDate: "2026-11-20" }));
  const first = await data.prepare([], release.id);
  await data.execute(first.plan.id);
  data.unitOfWork.run(actor, ({ repository }) => repository.updateRelease(release.id, { name: "Renamed", goal: "", releaseDate: null, released: true }));
  const reviewed = await data.prepare([], release.id);
  expect(reviewed.plan.items).toMatchObject([{ kind: "milestone", action: "update", payload: { title: "Renamed", remoteId: "1", dueOn: null, state: "closed" } }]);
  expect(reviewed.plan.items[0]!.payload).toHaveProperty("description", `<!-- ${reviewed.plan.items[0]!.marker} -->`);
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
  expect(data.provider.writeMilestone).toHaveBeenCalledTimes(2);
  expect(data.provider.writeMilestone.mock.calls[1]?.[2]).toEqual(reviewed.plan.items[0]!.payload);
  expect(data.milestones).toHaveLength(1);
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
});

it("preserves labels outside the current mappings after configuration changes", async () => {
  const data = fixture(1);
  const first = await data.prepare();
  await data.execute(first.plan.id);
  data.issues[0]!.labels.push("status:todo", "unrelated-label");
  data.inputs.labels.push("unrelated-label", "new-export-label", "new-status-label");
  data.unitOfWork.run(actor, ({ repository }) => repository.updateConnectorConnection(data.connection.id, {
    defaultLabel: "new-export-label", statusMapping: [{ localStatus: "todo", remoteState: "open", labels: ["new-status-label"] }]
  }));
  const reviewed = await data.prepare();
  expect(reviewed.plan.items[0]).toMatchObject({ labelAdditions: ["new-export-label"], labelRemovals: [] });
  expect(reviewed.plan.items[0]!.payload).toMatchObject({ labels: expect.arrayContaining(["unrelated-label", "status:todo"]) });
  expect(reviewed.plan.items[0]!.payload).not.toMatchObject({ labels: expect.arrayContaining(["new-status-label"]) });
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
  expect(data.issues[0]!.labels).toContain("local-story-map");
  expect(data.issues[0]!.labels).toContain("status:todo");
  expect(data.issues[0]!.labels).toContain("unrelated-label");
});

it("refuses foreign selections before credential resolution and reports selected Notes as exclusions", async () => {
  const data = fixture(1);
  const calls = vi.mocked(resolveProviderAuth).mock.calls.length;
  await expect(data.prepare([randomUUID()])).rejects.toMatchObject({ code: "validation" });
  await expect(data.prepare([], randomUUID())).rejects.toMatchObject({ code: "validation" });
  expect(resolveProviderAuth).toHaveBeenCalledTimes(calls);
  const note = data.unitOfWork.run(actor, ({ repository }) => repository.createCard({ storyMapId: data.map.id, parentId: data.cards[0]!.id, level: "note", title: "Excluded Note" }));
  const reviewed = await data.prepare([note.id]);
  expect(reviewed.plan.items).toEqual([]);
  expect(reviewed.plan.exclusions).toEqual([{ entityId: note.id, reason: "Notes are not exported as Issues." }]);
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
});

it("permits linked Issues after only its own Milestone rename/date effect and closes dated creations", async () => {
  const data = fixture(1);
  const release = data.unitOfWork.run(actor, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Before", releaseDate: "2026-11-20" });
    repository.updateCard(data.cards[0]!.id, { releaseId: release.id });
    repository.updateConnectorConnection(data.connection.id, { statusMapping: [{ localStatus: "todo", remoteState: "closed", labels: ["status:todo"] }] });
    return release;
  });
  const detailed = data.provider.getRemoteItem.getMockImplementation()!;
  data.provider.getRemoteItem.mockImplementation(async (...args) => {
    const result = await detailed(...args);
    return result.status === "found" ? { ...result, item: { ...result.item, milestoneDueOn: result.item.milestoneDueOn?.replace(".000Z", "Z") } } : result;
  });
  const write = data.provider.writeMilestone.getMockImplementation()!;
  data.provider.writeMilestone.mockImplementation(async (connection, auth, payload) => {
    const result = await write(connection, auth, payload);
    for (const issue of data.issues) if (issue.milestoneNumber === result.remoteNumber) { issue.milestone = result.title; issue.milestoneDueOn = result.dueOn ?? undefined; }
    return result;
  });
  const first = await data.prepare();
  expect((await data.execute(first.plan.id)).execution.status).toBe("completed");
  expect(data.issues[0]?.state).toBe("closed");
  data.unitOfWork.run(actor, ({ repository }) => repository.updateRelease(release.id, { name: "After", releaseDate: "2026-12-21" }));
  const renamed = await data.prepare();
  expect((await data.execute(renamed.plan.id)).execution.status).toBe("completed");
  expect(data.issues[0]).toMatchObject({ milestone: "After", milestoneDueOn: "2026-12-21T00:00:00.000Z" });
});

it("uses detailed recovered Issue evidence when REST markers omit assignees, parents and dates", async () => {
  const data = fixture(1);
  const first = await data.prepare();
  await data.execute(first.plan.id);
  data.issues[0]!.assignee = "assigned-user";
  data.issues[0]!.parentNumber = 99;
  const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
  data.unitOfWork.run(actor, ({ repository }) => repository.deleteGitHubLink(link.externalRefId));
  const find = data.provider.findRemoteItemsByMarker.getMockImplementation()!;
  data.provider.findRemoteItemsByMarker.mockImplementation(async (...args) => {
    const result = await find(...args);
    return { ...result, matches: result.matches.map((item) => { if (!("body" in item)) return item; const { assignee, parentNumber, milestoneDueOn, ...rest } = item; return rest; }) };
  });
  const recovered = await data.prepare();
  expect((await data.execute(recovered.plan.id)).execution.status).toBe("completed");
  expect(data.issues).toHaveLength(1);
});

it.each(["title", "body", "issueType", "labels", "state", "milestoneNumber"] as const)("retains a known mismatched %s response without binding or replaying it on resume", async (field) => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (connection, auth, payload) => {
    const remote = await write(connection, auth, payload);
    const changed = { ...remote, [field]: field === "labels" ? ["different"] : field === "milestoneNumber" ? 55 : field === "state" ? "closed" : "different" };
    data.issues[0] = changed;
    return changed;
  });
  const result = await data.execute(reviewed.plan.id);
  expect(result.execution).toMatchObject({ status: "interrupted", items: [{ state: "local_failed", remoteId: "1", url: data.issues[0]!.url }] });
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([]);
  expect((await data.execute(reviewed.plan.id, true)).execution.status).toBe("interrupted");
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
});

it.each(["before", "await"] as const)("refuses metadata-only sync membership drift %s confirmation", async (timing) => {
  const data = fixture(1);
  await data.execute((await data.prepare()).plan.id);
  const reviewed = await data.prepare();
  const version = data.repository.getCard(data.cards[0]!.id)!.version;
  const change = () => data.handle.current.$client.prepare("UPDATE remote_work_item_links SET managed_labels_json = ?").run(JSON.stringify(["changed-ownership"]));
  if (timing === "before") change();
  else {
    const read = data.provider.readPushInputs.getMockImplementation()!;
    data.provider.readPushInputs.mockImplementationOnce(async (...args) => { change(); return read(...args); });
  }
  await expect(data.execute(reviewed.plan.id)).rejects.toMatchObject({ code: "conflict" });
  expect(data.repository.getCard(data.cards[0]!.id)!.version).toBe(version);
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
});

it("preserves unmapped status-prefixed labels without claiming unrelated remote labels", async () => {
  const data = fixture(1);
  await data.execute((await data.prepare()).plan.id);
  data.unitOfWork.run(actor, ({ repository }) => {
    const { parentOverrideLocal, ...link } = repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
    repository.bindRemoteWorkItemLink({ ...link, managedLabels: [] });
    expect(() => repository.updateCard(data.cards[0]!.id, { status: "active" })).toThrow("GitHub owns this Card status");
    repository.updateCard(data.cards[0]!.id, { title: "Independent local title" });
  });
  data.issues[0]!.labels.push("status:todo", "customer-owned");
  data.inputs.labels.push("status:active", "customer-owned");
  const reviewed = await data.prepare();
  expect(reviewed.plan.items[0]).toMatchObject({ labelRemovals: [], labelAdditions: [] });
  expect(reviewed.plan.items[0]!.payload).toMatchObject({ title: "Independent local title", labels: expect.arrayContaining(["status:todo", "customer-owned"]) });
});

it.each([true, false])("updates only the chosen conflict baseline with another open conflict=%s", async (anotherConflict) => {
  const data = fixture(1);
  await data.execute((await data.prepare()).plan.id);
  const before = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
  data.issues[0]!.title = "Remote title";
  if (anotherConflict) data.issues[0]!.body = "Remote description";
  const conflict = data.unitOfWork.run(actor, ({ repository }) => {
    repository.updateCard(data.cards[0]!.id, { title: "Local title", description: "Local description" });
    const run = repository.createSyncRun({ storyMapId: data.map.id, connectionId: data.connection.id, mode: "sync", status: "applied" });
    const conflict = repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(data.cards[0]!.id)!.storyMapId).find((row) => row.cardId === data.cards[0]!.id)!.externalRefId, syncRunId: run.id, connectionId: data.connection.id, cardId: data.cards[0]!.id, remoteId: "1", field: "title", localValue: "Local title", remoteValue: "Remote title" });
    if (anotherConflict) repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(data.cards[0]!.id)!.storyMapId).find((row) => row.cardId === data.cards[0]!.id)!.externalRefId, syncRunId: run.id, connectionId: data.connection.id, cardId: data.cards[0]!.id, remoteId: "1", field: "description", localValue: "Local description", remoteValue: "Remote description" });
    return conflict;
  });
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.cards[0]!.id], conflictId: conflict.id, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue }, mode: "push", localOrigin: "http://127.0.0.1:4317" });
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ bodyHash: before.bodyHash, syncState: anotherConflict ? "conflict" : "unsynced" });
  expect(data.repository.getSyncConflict(conflict.id)?.status).toBe("resolved-local");
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toHaveLength(anotherConflict ? 1 : 0);
});

it.each(["remote-only", "safe-local", "divergent"] as const)("requires separate incoming review before preparing %s outgoing Sync", async (scenario) => {
  const data = fixture(1);
  await data.execute((await data.prepare()).plan.id);
  data.issues[0]!.title = "Incoming title";
  if (scenario !== "remote-only") data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(data.cards[0]!.id, scenario === "safe-local" ? { description: "Outgoing description" } : { title: "Divergent local title" }));
  const plan = await planWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.cards[0]!.id], mode: "sync", localOrigin: "http://127.0.0.1:4317" });
  if (!("id" in plan)) throw new Error("Expected persisted sync Dry Run.");
  expect(plan.items).toHaveLength(0);
  expect(data.repository.getCard(data.cards[0]!.id)?.title).toBe(scenario === "divergent" ? "Divergent local title" : "Issue 1");
  if (scenario !== "divergent") expect(plan.blockers).toEqual([expect.stringContaining("Review and apply incoming changes")]);
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
});

it("requires re-review if the served origin changes before or during confirmation", async () => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  await expect(executeRemotePush(data.repository, data.unitOfWork, actor, reviewed.plan.id, false, () => "http://127.0.0.1:4999")).rejects.toMatchObject({ code: "conflict" });
  let origin = "http://127.0.0.1:4317";
  const read = data.provider.readPushInputs.getMockImplementation()!;
  data.provider.readPushInputs.mockImplementationOnce(async (...args) => { origin = "http://127.0.0.1:4999"; return read(...args); });
  await expect(executeRemotePush(data.repository, data.unitOfWork, actor, reviewed.plan.id, false, () => origin)).rejects.toMatchObject({ code: "conflict" });
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
});

it("blocks two distinct reviewed plans racing to create the same unbound entity", async () => {
  const data = fixture(1);
  const first = await data.prepare();
  const second = await data.prepare();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (...args) => { entered(); await hold; return write(...args); });
  const pending = data.execute(first.plan.id);
  await started;
  const refused = await data.execute(second.plan.id);
  expect(refused.execution).toMatchObject({ status: "interrupted", items: [{ state: "failed", attempt: 0, error: expect.stringContaining(first.plan.id) }] });
  release();
  expect((await pending).execution.status).toBe("completed");
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.issues).toHaveLength(1);
});

it("refuses delayed absence captured while another plan's create was in flight", async () => {
  const data = fixture(1);
  const first = await data.prepare();
  const second = await data.prepare();
  let entered!: () => void;
  let releaseCreate!: () => void;
  let captured!: () => void;
  let releaseLookup!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const createHold = new Promise<void>((resolve) => { releaseCreate = resolve; });
  const lookupStarted = new Promise<void>((resolve) => { captured = resolve; });
  const lookupHold = new Promise<void>((resolve) => { releaseLookup = resolve; });
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (...args) => {
    entered(); await createHold; await write(...args);
    throw new DomainError("conflict", "Create response lost");
  });
  const pendingFirst = data.execute(first.plan.id);
  await started;
  data.provider.findRemoteItemsByMarker.mockImplementationOnce(async () => {
    captured(); await lookupHold; return { complete: true, matches: [] };
  });
  const pendingSecond = data.execute(second.plan.id);
  await lookupStarted;
  releaseCreate();
  expect((await pendingFirst).execution.items[0]?.state).toBe("uncertain");
  releaseLookup();
  expect((await pendingSecond).execution).toMatchObject({ status: "interrupted", items: [{ state: "failed", attempt: 0, error: expect.stringContaining(first.plan.id) }] });
  expect(data.repository.getRemotePushPlan(first.plan.id)?.execution.items[0]?.state).toBe("uncertain");
  expect((await data.execute(first.plan.id, true)).execution.status).toBe("completed");
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.issues).toHaveLength(1);
});

it("refuses canonical-identity-only drift without a Card version change", async () => {
  const data = fixture(1);
  await data.execute((await data.prepare()).plan.id);
  const reviewed = await data.prepare();
  const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
  const version = data.repository.getCard(data.cards[0]!.id)!.version;
  data.handle.current.$client.prepare("UPDATE external_refs SET external_id = ? WHERE id = ?").run("https://github.com/reviewed/fixture/issues/99", link.externalRefId);
  await expect(data.execute(reviewed.plan.id)).rejects.toMatchObject({ code: "conflict" });
  expect(data.repository.getCard(data.cards[0]!.id)!.version).toBe(version);
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
});

it("retains repeated preparation failures as interrupted instead of leaving resume running", async () => {
  const data = fixture(1);
  const reviewed = await data.prepare();
  data.provider.findRemoteItemsByMarker.mockRejectedValue(new DomainError("conflict", "Incomplete marker lookup"));
  for (const resume of [false, true]) expect((await data.execute(reviewed.plan.id, resume)).execution).toMatchObject({ status: "interrupted", items: [{ state: "failed", error: "Incomplete marker lookup", attempt: 0 }] });
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
});

it.each(["title", "description", "dueOn", "state"] as const)("retains mismatched Milestone %s without binding or sending dependent Issues", async (field) => {
  const data = fixture(1);
  data.unitOfWork.run(actor, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Milestone" });
    repository.updateCard(data.cards[0]!.id, { releaseId: release.id });
  });
  const reviewed = await data.prepare();
  const write = data.provider.writeMilestone.getMockImplementation()!;
  data.provider.writeMilestone.mockImplementationOnce(async (...args) => {
    const result = await write(...args);
    return { ...result, [field]: field === "state" ? "closed" : field === "dueOn" ? "2026-12-21" : "different" };
  });
  const interrupted = await data.execute(reviewed.plan.id);
  expect(interrupted.execution).toMatchObject({ status: "interrupted", items: [{ state: "local_failed", remoteId: "1" }, { state: "not_attempted" }] });
  expect((await data.execute(reviewed.plan.id, true)).execution.status).toBe("interrupted");
  expect(data.provider.writeMilestone).toHaveBeenCalledTimes(1);
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
});
