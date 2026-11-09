import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { GitHubProvider, createWorkItemProvider } from "@storymapper/github";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import type { RemoteMilestone } from "@storymapper/contracts";
import { buildWorkItemSyncHealthReport, stripGitHubMilestoneMarker } from "@storymapper/core";
import { openStoryMapperDb } from "@storymapper/db";
import { actor, remotePushFixture as fixture } from "@storymapper/server/fixtures/remote-push-execution";
import { resolveGitHubConflictCommand } from "@storymapper/server/application/sync/github-conflict-command";
import { prepareRemotePush } from "@storymapper/server/services/remote-push-plan";
import { hashText, importWorkItems, syncWorkItems } from "@storymapper/server/services/work-item-sync";
import { applyChangeSet, approveChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));

type Fixture = ReturnType<typeof fixture>;
const origin = "http://127.0.0.1:4317";
const health = (data: Fixture) => data.unitOfWork.run(actor, ({ repository }) => buildWorkItemSyncHealthReport(repository.getWorkItemSyncHealthData(data.map.id), hashText));
const stableSnapshot = (data: Fixture) => { const { productContext: _context, ...snapshot } = data.repository.getStoryMapSnapshot(data.map.id)!; return snapshot; };
const scope = (data: Fixture) => ({ storyMapId: data.map.id, connectionId: data.connection.id, cardIds: data.cards.map((row) => row.id) });

async function linkedRelease() {
  const data = fixture(1);
  const release = data.unitOfWork.run(actor, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Release", goal: "Initial goal", releaseDate: "2026-11-01" });
    repository.updateCard(data.cards[0]!.id, { releaseId: release.id });
    return release;
  });
  expect((await data.execute((await data.prepare()).plan.id)).execution.status).toBe("completed");
  expect(health(data).stateCounts.synced).toBe(2);
  return { data, release };
}

function remoteReleaseEdit(data: Fixture, values: Partial<RemoteMilestone>): void {
  Object.assign(data.milestones[0]!, values);
  const milestone = data.milestones[0]!;
  for (const issue of data.issues) Object.assign(issue, { milestone: milestone.title, milestoneDueOn: milestone.dueOn ?? undefined, milestoneDescription: milestone.description, milestoneState: milestone.state });
}

it.each(["goal", "released", "clearing"] as const)("reviews and acknowledges a %s-only Release edit through card and explicit empty-card Sync", async (field) => {
  for (const releaseOnly of [false, true]) {
    const { data, release } = await linkedRelease();
    const patch = field === "released" ? { released: true } : { goal: field === "clearing" ? "" : "Changed goal" };
    data.unitOfWork.run(actor, ({ repository }) => repository.updateRelease(release.id, patch));
    expect(health(data).stateCounts.unsynced).toBe(2);
    const input = { ...scope(data), ...(releaseOnly ? { cardIds: [], releaseId: release.id } : {}), mode: "sync" as const, localOrigin: origin };
    const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, actor, input);
    expect(reviewed.plan.blockers).toEqual([]);
    expect(reviewed.plan.items.map((row) => row.kind)).toEqual(releaseOnly ? ["milestone"] : ["milestone", "issue"]);
    const payload = reviewed.plan.items[0]!.payload;
    expect("description" in payload && stripGitHubMilestoneMarker(payload.description)).toBe(field === "released" ? "Initial goal" : patch.goal);
    expect("state" in payload && payload.state).toBe(field === "released" ? "closed" : "open");
    expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
    expect(health(data).stateCounts.synced).toBe(2);
    expect((await prepareRemotePush(data.repository, data.unitOfWork, actor, input)).plan.items).toEqual([]);
    data.handle.current.$client.close();
    data.handle.current = openStoryMapperDb(data.path);
    expect(health(data).stateCounts.synced).toBe(2);
  }
});

it.each([false, true])("reviews remote goal/state updates and explicit clearing under readOnly=%s", async (readOnly) => {
  const { data, release } = await linkedRelease();
  data.unitOfWork.run(actor, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { readOnly }));
  for (const [description, state] of [["Remote authored goal", "closed"], ["", "open"]] as const) {
    const marker = data.milestones[0]!.description.match(/<!-- storymapper:[^>]+ -->/u)![0];
    remoteReleaseEdit(data, { description: [description, marker].filter(Boolean).join("\n\n"), state });
    const reviewed = await syncWorkItems(data.repository, data.unitOfWork, actor, { ...scope(data), apply: false });
    expect(reviewed.items).toMatchObject([{ status: "proposed" }]);
    expect(data.repository.getRelease(release.id)!.goal).not.toBe(description);
    expect(reviewed.changeSet.operations).toEqual(expect.arrayContaining([expect.objectContaining({ entity: "release", op: "update", after: { name: release.name, goal: description, released: state === "closed", releaseDate: release.releaseDate } })]));
    approveChangeSet(data, actor, reviewed.changeSetId);
    applyChangeSet(data, actor, reviewed.changeSetId);
    expect(data.repository.getRelease(release.id)).toMatchObject({ goal: description, released: state === "closed" });
    expect(health(data).stateCounts.synced).toBe(2);
    expect((await syncWorkItems(data.repository, data.unitOfWork, actor, scope(data))).items).toMatchObject([{ status: "unchanged" }]);
  }
});

it.each([false, true])("refuses concurrent local/remote Release goal changes under readOnly=%s", async (readOnly) => {
  const { data, release } = await linkedRelease();
  data.unitOfWork.run(actor, ({ repository }) => {
    repository.updateRelease(release.id, { goal: "Local goal" });
    repository.updateConnectorConnection(data.connection.id, { readOnly });
  });
  remoteReleaseEdit(data, { description: "Remote goal" });
  expect((await syncWorkItems(data.repository, data.unitOfWork, actor, scope(data))).items).toMatchObject([{ status: "conflict" }]);
  expect(data.repository.getRelease(release.id)!.goal).toBe("Local goal");
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toMatchObject([{ field: "milestone", localValue: { metadata: { goal: "Local goal" } }, remoteValue: { metadata: { goal: "Remote goal" } } }]);
  expect(data.provider.writeMilestone).toHaveBeenCalledTimes(1);
});

it("blocks explicit Release-only Sync on changed remote metadata", async () => {
  const { data, release } = await linkedRelease();
  data.unitOfWork.run(actor, ({ repository }) => repository.updateRelease(release.id, { goal: "Local goal" }));
  remoteReleaseEdit(data, { state: "closed" });
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, actor, { ...scope(data), cardIds: [], releaseId: release.id, mode: "sync", localOrigin: origin });
  expect(reviewed.plan.items).toEqual([]);
  expect(reviewed.plan.blockers).toEqual([expect.stringContaining("Review and apply incoming Milestone changes")]);
  await expect(data.execute(reviewed.plan.id)).rejects.toThrow("Review and apply incoming Milestone changes");
  expect(data.provider.writeMilestone).toHaveBeenCalledTimes(1);
});

it("preserves parent evidence when a partial successful write needs durable result adoption", async () => {
  const data = fixture(1);
  await data.execute((await data.prepare()).plan.id);
  data.issues[0]!.parentNumber = 42;
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope(data));
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(data.cards[0]!.id, { title: "Changed" }));
  const reviewed = await data.prepare();
  const write = data.provider.writeRemoteIssue.getMockImplementation()!;
  data.provider.writeRemoteIssue.mockImplementationOnce(async (...args) => {
    const partial = await write(...args);
    data.issues[0]!.parentNumber = 42;
    return partial;
  });
  data.handle.current.$client.exec("CREATE TRIGGER refuse_parent_binding BEFORE UPDATE ON remote_work_item_links BEGIN SELECT RAISE(ABORT, 'binding interrupted'); END");
  const interrupted = await data.execute(reviewed.plan.id);
  expect(interrupted.execution.items[0]).toMatchObject({ state: "local_failed", remoteResult: { parentNumber: 42 } });
  data.handle.current.$client.exec("DROP TRIGGER refuse_parent_binding");
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect((await data.execute(reviewed.plan.id, true)).execution.status).toBe("completed");
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.remoteParentNumber).toBe(42);
});

it("persists managed status and Annotation labels beyond the original bulk projection", async () => {
  const data = fixture(0);
  const annotation = data.unitOfWork.run(actor, ({ repository }) => {
    repository.updateConnectorConnection(data.connection.id, { labelsAsAnnotations: true, statusMapping: [{ localStatus: "done", remoteState: "closed", labels: ["finished"] }] });
    return repository.createAnnotation({ projectId: data.project.id, storyMapId: data.map.id, name: "managed-annotation" });
  });
  const labels = [...Array.from({ length: 100 }, (_, index) => `unmanaged-${index}`), "finished", "managed-annotation"];
  data.issues.push({ remoteId: "42", remoteNumber: 42, title: "Imported", body: "Authored", state: "open", url: "https://github.com/reviewed/fixture/issues/42", labels });
  await importWorkItems(data.repository, data.unitOfWork, actor, scope(data));
  const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
  expect(data.repository.getCard(link.cardId!)!.status).toBe("Open");
  expect(data.repository.listCardAnnotationsForStoryMap(data.map.id)).toMatchObject([{ cardId: link.cardId, annotationId: annotation.id }]);
  expect(link).toMatchObject({ labels, baseline: { acknowledgedLocal: { statusLabels: ["finished"], annotationLabels: ["managed-annotation"] }, observedRemote: { statusLabels: ["finished"], annotationLabels: ["managed-annotation"] } } });
});

it.each(["local", "remote"] as const)("retains excluded Release goal/state evidence during a title-only %s resolution", async (resolution) => {
  const { data, release } = await linkedRelease();
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(data.cards[0]!.id, { title: "Local title" }));
  data.issues[0]!.title = "Remote title";
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope(data));
  const conflict = data.repository.listOpenSyncConflicts(data.map.id)[0]!;
  const before = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.cardId)!.baseline!;
  data.unitOfWork.run(actor, ({ repository }) => repository.updateRelease(release.id, { goal: "Excluded local goal" }));
  remoteReleaseEdit(data, { state: "closed" });
  const reviewed = { localValue: conflict.localValue, remoteValue: conflict.remoteValue };
  if (resolution === "local") {
    const planned = await prepareRemotePush(data.repository, data.unitOfWork, actor, { ...scope(data), mode: "push", conflictId: conflict.id, reviewed, localOrigin: origin });
    expect(planned.plan.items.map((row) => row.kind)).toEqual(["issue"]);
    expect((await data.execute(planned.plan.id)).execution.status).toBe("completed");
  } else await resolveGitHubConflictCommand(data, actor, conflict.id, { storyMapId: data.map.id, resolution, apply: true, reviewed });
  const after = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.cardId)!.baseline!;
  expect(after.acknowledgedLocal.releaseMetadata).toEqual(before.acknowledgedLocal.releaseMetadata);
  expect(after.observedRemote.releaseMetadata).toEqual(before.observedRemote.releaseMetadata);
  expect(data.repository.getRelease(release.id)).toMatchObject({ goal: "Excluded local goal", released: false });
  expect((await syncWorkItems(data.repository, data.unitOfWork, actor, scope(data))).items).toMatchObject([{ status: "conflict" }]);
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toMatchObject([{ field: "milestone" }]);
});

it("rejects external Milestone description drift between its completed effect and dependent Issue", async () => {
  const { data, release } = await linkedRelease();
  data.unitOfWork.run(actor, ({ repository }) => repository.updateRelease(release.id, { goal: "Reviewed goal", released: true }));
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, actor, { ...scope(data), mode: "sync", localOrigin: origin });
  const read = data.provider.readPushInputs.getMockImplementation()!;
  data.provider.readPushInputs.mockImplementation(async (...args) => {
    const plan = data.repository.getRemotePushPlan(reviewed.plan.id)!;
    if (plan.execution.items[0]?.state === "succeeded") remoteReleaseEdit(data, { description: "External edit after our write" });
    return read(...args);
  });
  const result = await data.execute(reviewed.plan.id);
  expect(result.execution).toMatchObject({ status: "interrupted", items: [{ state: "succeeded" }, { state: "failed", error: expect.stringContaining("Remote target changed after review") }] });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
});

it("moves a Card to a verified unchanged bound Release without a redundant Milestone effect", async () => {
  const { data, release } = await linkedRelease();
  const moved = data.unitOfWork.run(actor, ({ repository }) => repository.createCard({ storyMapId: data.map.id, level: "activity", cardType: "task", title: "Moving Card" }));
  await data.execute((await data.prepare([moved.id])).plan.id);
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(moved.id, { releaseId: release.id }));
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, actor, { ...scope(data), cardIds: [moved.id], mode: "sync", localOrigin: origin });
  expect(reviewed.plan.blockers).toEqual([]);
  expect(reviewed.plan.items).toMatchObject([{ kind: "issue", dependencies: [], payload: { milestoneNumber: 1 } }]);
  expect((await data.execute(reviewed.plan.id)).execution.status).toBe("completed");
  expect(data.issues.find((row) => row.remoteId === "2")).toMatchObject({ milestoneNumber: 1, milestoneDescription: expect.stringContaining("Initial goal") });
  expect(data.provider.writeMilestone).toHaveBeenCalledTimes(1);
  expect((await prepareRemotePush(data.repository, data.unitOfWork, actor, { ...scope(data), cardIds: [moved.id], mode: "sync", localOrigin: origin })).plan.items).toEqual([]);
});

it.each(["local_failed", "remote_succeeded"] as const)("adopts a reopened title choice from %s without acknowledging excluded Release goal/state", async (state) => {
  const { data, release } = await linkedRelease();
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(data.cards[0]!.id, { title: "Local title" }));
  data.issues[0]!.title = "Remote title";
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope(data));
  const conflict = data.repository.listOpenSyncConflicts(data.map.id)[0]!;
  const before = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.cardId)!.baseline!;
  data.unitOfWork.run(actor, ({ repository }) => repository.updateRelease(release.id, { goal: "Excluded local goal" }));
  remoteReleaseEdit(data, { state: "closed" });
  const reviewed = await prepareRemotePush(data.repository, data.unitOfWork, actor, { ...scope(data), mode: "push", conflictId: conflict.id, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue }, localOrigin: origin });
  data.handle.current.$client.exec("CREATE TRIGGER interrupt_title_binding BEFORE UPDATE ON remote_work_item_links BEGIN SELECT RAISE(ABORT, 'title binding interrupted'); END");
  if (state === "remote_succeeded") {
    data.handle.current.$client.exec("CREATE TRIGGER interrupt_title_failure BEFORE UPDATE ON remote_push_executions WHEN json_extract(NEW.execution_json, '$.items[0].state') = 'local_failed' BEGIN SELECT RAISE(ABORT, 'failure outcome interrupted'); END");
    await expect(data.execute(reviewed.plan.id)).rejects.toThrow("failure outcome interrupted");
    data.handle.current.$client.exec("DROP TRIGGER interrupt_title_failure");
  } else expect((await data.execute(reviewed.plan.id)).execution.status).toBe("interrupted");
  expect(data.repository.getRemotePushPlan(reviewed.plan.id)!.execution.items[0]!.state).toBe(state);
  data.handle.current.$client.exec("DROP TRIGGER interrupt_title_binding");
  data.handle.current.$client.close();
  data.handle.current = openStoryMapperDb(data.path);
  expect((await data.execute(reviewed.plan.id, true)).execution.status).toBe("completed");
  const after = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.cardId)!.baseline!;
  expect(after.acknowledgedLocal.releaseMetadata).toEqual(before.acknowledgedLocal.releaseMetadata);
  expect(after.observedRemote.releaseMetadata).toEqual(before.observedRemote.releaseMetadata);
  expect(data.repository.getSyncConflict(conflict.id)!.status).toBe("resolved-local");
  expect(data.repository.getRelease(release.id)).toMatchObject({ goal: "Excluded local goal", released: false });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(2);
  expect((await syncWorkItems(data.repository, data.unitOfWork, actor, scope(data))).items).toMatchObject([{ status: "conflict" }]);
});

it("refuses parent-only remote drift after review before the Issue write", async () => {
  const data = fixture(1);
  await data.execute((await data.prepare()).plan.id);
  data.issues[0]!.parentNumber = 42;
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope(data));
  data.unitOfWork.run(actor, ({ repository }) => repository.updateCard(data.cards[0]!.id, { title: "Reviewed title" }));
  const reviewed = await data.prepare();
  data.issues[0]!.parentNumber = 43;
  expect((await data.execute(reviewed.plan.id)).execution).toMatchObject({ status: "interrupted", items: [{ state: "failed", error: expect.stringContaining("Remote target changed after review") }] });
  expect(data.provider.writeRemoteIssue).toHaveBeenCalledTimes(1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!.remoteParentNumber).toBe(42);
});

it.each(["description", "state"] as const)("refuses consumed Milestone evidence missing %s and accepts explicit empty/open metadata", async (field) => {
  const { data, release } = await linkedRelease();
  const before = stableSnapshot(data);
  const proposals = data.repository.listChangeSets(data.project.id);
  if (field === "description") delete data.issues[0]!.milestoneDescription;
  else delete data.issues[0]!.milestoneState;
  await expect(syncWorkItems(data.repository, data.unitOfWork, actor, scope(data))).rejects.toMatchObject({ code: "validation", message: expect.stringContaining("evidence is incomplete") });
  expect(stableSnapshot(data)).toEqual(before);
  expect(data.repository.listChangeSets(data.project.id)).toEqual(proposals);
  remoteReleaseEdit(data, { description: "", state: "open" });
  await syncWorkItems(data.repository, data.unitOfWork, actor, scope(data));
  expect(data.repository.getRelease(release.id)).toMatchObject({ goal: "", released: false });
});

it("imports actual adapter label output atomically and refuses a later ambiguous Issue before all local effects", async () => {
  const data = fixture(0);
  const annotation = data.unitOfWork.run(actor, ({ repository }) => {
    repository.updateConnectorConnection(data.connection.id, { labelsAsAnnotations: true, releaseSource: "iteration", statusMapping: [{ localStatus: "done", remoteState: "closed", labels: ["finished"] }] });
    return repository.createAnnotation({ projectId: data.project.id, storyMapId: data.map.id, name: "managed-annotation" });
  });
  const labels = [...Array.from({ length: 100 }, (_, index) => `unmanaged-${index}`), "finished", "managed-annotation"];
  const remote = { number: 42, title: "Imported", body: "Authored", state: "OPEN", url: "https://github.com/reviewed/fixture/issues/42", labels: { pageInfo: { hasNextPage: true }, nodes: labels.slice(0, 50).map((name) => ({ name })) }, projectItems: { pageInfo: { hasNextPage: false }, nodes: [] } };
  let nodes: object[] = [remote];
  const fetch = vi.fn(async (url: string) => {
    if (url === "https://api.github.com/graphql") return Response.json({ data: { search: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } });
    if (url.includes("/issues/42/labels?")) return Response.json((url.includes("page=2") ? labels.slice(100) : labels.slice(0, 100)).map((name) => ({ name })));
    throw new Error("Unexpected external transport in composed import fixture");
  });
  vi.stubGlobal("fetch", fetch);
  vi.mocked(resolveProviderAuth).mockImplementation(async (connection) => ({ connection, auth: { token: randomUUID().replaceAll("-", "") } }));
  vi.mocked(createWorkItemProvider).mockReturnValue(new GitHubProvider());
  try {
    await importWorkItems(data.repository, data.unitOfWork, actor, scope(data));
    const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
    expect(data.repository.getCard(link.cardId!)!.status).toBe("Open");
    expect(data.repository.listCardAnnotationsForStoryMap(data.map.id)).toMatchObject([{ cardId: link.cardId, annotationId: annotation.id }]);
    expect(link).toMatchObject({ labels, baseline: { acknowledgedLocal: { statusLabels: ["finished"], annotationLabels: ["managed-annotation"] }, observedRemote: { statusLabels: ["finished"], annotationLabels: ["managed-annotation"] } } });
    const before = stableSnapshot(data);
    const proposals = data.repository.listChangeSets(data.project.id);
    const valid = { ...remote, number: 43, url: "https://github.com/reviewed/fixture/issues/43", labels: { pageInfo: { hasNextPage: false }, nodes: [] } };
    const ambiguous = { ...valid, number: 44, url: "https://github.com/reviewed/fixture/issues/44", projectItems: { pageInfo: { hasNextPage: false }, nodes: [{ fieldValueByName: { title: "Sprint A", startDate: "2026-10-19", duration: 14 } }, { fieldValueByName: { title: "Sprint A", startDate: "2026-10-19", duration: 7 } }] } };
    nodes = [valid, ambiguous];
    await expect(importWorkItems(data.repository, data.unitOfWork, actor, scope(data))).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("ambiguous Issue iteration evidence") });
    expect(stableSnapshot(data)).toEqual(before);
    expect(data.repository.listChangeSets(data.project.id)).toEqual(proposals);
    expect(data.repository.listReleases(data.map.id)).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
    vi.mocked(resolveProviderAuth).mockImplementation(async (connection) => ({ connection, auth: {} }));
  }
});
