import type { Project, StoryMap, Card, ConnectorConnection, RemoteWorkItemLink, ChangeSetCommandResponse, Release } from "@storymapper/contracts";
import { reviewedPushProviderFixture } from "@storymapper/server/fixtures/reviewed-push-provider";
import { stripGitHubIssueFooter } from "@storymapper/core";
import { remoteReadFixture } from "@storymapper/server/fixtures/remote-read";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DomainError, changeSetCommandResponseSchema } from "@storymapper/contracts";
import { buildGitHubIssueBody } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createWorkItemProvider, type RemoteWorkItem } from "@storymapper/github";
import { applyChangeSet, approveChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";
import { beginGitHubPreparation, githubIncomingCommand } from "@storymapper/server/application/sync/github-command";
import { resolveGitHubConflictCommand } from "@storymapper/server/application/sync/github-conflict-command";
import { changedFieldsForRemote, syncBaseline } from "@storymapper/server/services/sync-merge";
import { hashText, importWorkItems, issueLabelsForCard, pullStoryMapWorkItems, syncWorkItems } from "@storymapper/server/services/work-item-sync";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })), resolveGitHubAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));
const human = { actorType: "human", actorId: "local-user" } as const;
const agent = { actorType: "agent", actorId: "regression-host", mcpSessionId: "regression-session" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { vi.clearAllMocks(); for (const close of cleanup.splice(0)) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "github-command-regressions-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const entities = unitOfWork.run(human, ({ repository }) => {
    const project = repository.createProject({ name: "GitHub regressions" });
    repository.updateSafetySettings(project.id, { agentMode: "apply", github: true });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const card = repository.createCard({ storyMapId: map.id, level: "activity", title: "Original title", description: "Original body" }, "human");
    const connection = repository.createConnectorConnection({ projectId: project.id, provider: "github", name: "GitHub", owner: "org", repository: "repo", authMode: "token", readOnly: false, statusMapping: [{ localStatus: "todo", remoteState: "open", labels: ["todo"] }, { localStatus: "active", remoteState: "open", labels: ["active"] }] });
    const remote: RemoteWorkItem = { remoteId: "1", remoteNumber: 1, title: card.title, body: buildGitHubIssueBody(card, map.name, { origin: "http://127.0.0.1:4317", projectId: project.id }), labels: issueLabelsForCard(connection, card), state: "open", url: "https://github.com/org/repo/issues/1" };
    const link = repository.bindRemoteWorkItemLink({ connectionId: connection.id, cardId: card.id, provider: "github", remoteId: remote.remoteId, url: remote.url, labels: remote.labels, remoteState: remote.state, titleHash: hashText(remote.title), bodyHash: hashText(stripGitHubIssueFooter(remote.body)), syncState: "synced" });
    return { project, map, card, connection, remote, link };
  });
  const provider = { getRemoteItem: vi.fn(async (_connection: unknown, _auth: unknown, _remoteId: string): Promise<import("@storymapper/github").RemoteItemRead> => remoteReadFixture(entities.remote)), createOrUpdateRemoteItem: vi.fn(), listRemoteItems: vi.fn(), ...reviewedPushProviderFixture(), validateConnection: vi.fn() };
  vi.mocked(createWorkItemProvider).mockReturnValue(provider);
  return { repository, unitOfWork, ...entities, provider };
}

it("requires reviewed field effects before a stored conflict resolution can close its row", async () => {
  const data = fixture();
  const conflict = data.unitOfWork.run(human, ({ repository }) => {
    const run = repository.createSyncRun({ storyMapId: data.map.id, connectionId: data.connection.id, mode: "sync", status: "applied" });
    return repository.createSyncConflict({ externalRefId: repository.listRemoteWorkItemLinksForStoryMap(repository.getCard(data.card.id)!.storyMapId).find((row) => row.cardId === data.card.id)!.externalRefId, syncRunId: run.id, connectionId: data.connection.id, cardId: data.card.id, remoteId: data.remote.remoteId, field: "title", localValue: data.card.title, remoteValue: "Reviewed title" });
  });
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Reviewed title" }));
  const propose = () => resolveGitHubConflictCommand(data, agent, conflict.id, { storyMapId: data.map.id, resolution: "remote", apply: false, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } });
  const beforeCard = data.repository.getCardDetails(data.card.id);
  const partial = await propose();
  const resolution = partial.changeSet.operations.find((operation) => operation.entity === "syncConflict" && operation.op === "resolve")!;
  const approved = approveChangeSet(data, human, partial.changeSetId, [resolution.operationId]);
  expect(approved.changeSet.approval!.selectedOperationIds).toEqual([]);
  applyChangeSet(data, human, partial.changeSetId);
  expect(data.repository.getSyncConflict(conflict.id)).toEqual(conflict);
  expect(data.repository.getCardDetails(data.card.id)).toEqual(beforeCard);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)).toEqual([data.link]);
  const complete = await propose();
  approveChangeSet(data, human, complete.changeSetId);
  applyChangeSet(data, human, complete.changeSetId);
  expect(data.repository.getSyncConflict(conflict.id)).toMatchObject({ status: "resolved-remote" });
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Reviewed title" });
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ titleHash: hashText("Reviewed title"), syncState: "synced" });
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it("advances converged Agent fields and baselines without a remote write", async () => {
  const data = fixture();
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
  data.unitOfWork.run(human, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Converged milestone" });
    repository.bindRemoteWorkItemLink({ connectionId: data.connection.id, releaseId: release.id, provider: "github", remoteId: "7", url: "https://github.com/org/repo/milestone/7", labels: [], syncState: "synced" });
    repository.updateCard(data.card.id, { title: "Converged title", description: "Converged body", releaseId: release.id });
  });
  const reviewed = data.repository.getCardDetails(data.card.id)!;
  const remote = { ...data.remote, title: reviewed.title, body: buildGitHubIssueBody(reviewed, data.map.name, { origin: "http://127.0.0.1:4317", projectId: data.project.id }), labels: issueLabelsForCard(data.connection, reviewed), milestoneDescription: "", milestoneState: "open", milestone: "Converged milestone", milestoneNumber: 7 };
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote));
  const result = changeSetCommandResponseSchema.parse(await syncWorkItems(data.repository, data.unitOfWork, agent, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id }));
  expect(result.outcome).toBe("applied");
  expect(data.repository.getCardDetails(data.card.id)).toEqual(reviewed);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ titleHash: hashText(remote.title), bodyHash: hashText(stripGitHubIssueFooter(remote.body)), remoteState: remote.state, labels: remote.labels, milestone: remote.milestone, syncState: "synced" });
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it.each(["local", "remote"] as const)("persists %s-cleared milestone conflicts as JSON null without partial rollback", async (cleared) => {
  const data = fixture();
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
  data.link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]!;
  const runsBefore = data.repository.getWorkItemSyncHealthData(data.map.id).runs.length;
  data.unitOfWork.run(human, ({ repository }) => {
    const baseRelease = repository.createRelease({ storyMapId: data.map.id, name: "Baseline milestone" });
    repository.bindRemoteWorkItemLink({ connectionId: data.connection.id, releaseId: baseRelease.id, provider: "github", remoteId: "6", url: "https://github.com/org/repo/milestone/6", labels: [], syncState: "synced" });
    repository.updateCard(data.card.id, { releaseId: baseRelease.id });
    const baseline = syncBaseline(repository, data.connection, repository.getCardDetails(data.card.id)!, { ...data.remote, milestoneDescription: "", milestoneState: "open", milestone: "Baseline milestone", milestoneNumber: 6 });
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Local milestone" });
    repository.updateCard(data.card.id, { releaseId: cleared === "local" ? null : release.id });
    repository.upsertRemoteWorkItemLink({ ...data.link, milestone: "Baseline milestone", baseline });
  });
  const before = data.repository.getCardDetails(data.card.id)!;
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, milestoneDescription: "", milestoneState: "open", milestone: cleared === "remote" ? undefined : "Remote milestone", milestoneNumber: cleared === "remote" ? undefined : 8 }));
  const result = changeSetCommandResponseSchema.parse(await syncWorkItems(data.repository, data.unitOfWork, agent, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id }));
  expect(result.outcome).toBe("applied");
  expect(data.repository.getCardDetails(data.card.id)).toEqual(before);
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toMatchObject([{ field: "milestone", localValue: cleared === "local" ? null : { assignment: `local:${before.releaseId}`, metadata: { name: "Local milestone", startDate: null, releaseDate: null } }, remoteValue: cleared === "remote" ? null : { assignment: "https://github.com/org/repo/milestone/8", metadata: { name: "Remote milestone", startDate: null, releaseDate: null } }, status: "open" }]);
  expect(data.repository.getWorkItemSyncHealthData(data.map.id).runs).toHaveLength(runsBefore + 1);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ syncState: "conflict", milestone: "Baseline milestone" });
  expect(data.repository.getChangeSet(result.changeSetId)).toMatchObject({ status: "applied" });
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it.each(["card", "connection", "map"] as const)("refuses an Agent pull when its %s changes while the provider is pending", async (changed) => {
  const data = fixture();
  data.provider.getRemoteItem.mockImplementation(async () => {
    data.unitOfWork.run(human, ({ repository }) => {
      if (changed === "card") repository.updateCard(data.card.id, { title: "Edited during await" });
      else if (changed === "connection") repository.updateConnectorConnection(data.connection.id, { name: "Renamed" });
      else repository.updateStoryMap(data.map.id, { name: "Renamed map" });
    });
    return remoteReadFixture(data.remote);
  });
  await expect(syncWorkItems(data.repository, data.unitOfWork, agent, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id })).rejects.toMatchObject({ code: "conflict" });
  expect(data.repository.listChangeSets(data.project.id)).toEqual([]);
  expect(data.repository.getWorkItemSyncHealthData(data.map.id).runs).toEqual([]);
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it("preserves local divergence and records conflicts with a read-only connection", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => {
    repository.updateConnectorConnection(data.connection.id, { readOnly: true });
    repository.updateCard(data.card.id, { title: "Local edit" });
  });
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Remote title" }));
  const result = changeSetCommandResponseSchema.parse(await syncWorkItems(data.repository, data.unitOfWork, agent, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id }));
  expect(result.outcome).toBe("applied");
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Local edit" });
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toMatchObject([{ field: "title", localValue: "Local edit", remoteValue: "Remote title" }]);
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it("retains stale identity when the Agent pull finds the Issue unavailable", async () => {
  const data = fixture();
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(undefined));
  const result = changeSetCommandResponseSchema.parse(await syncWorkItems(data.repository, data.unitOfWork, agent, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id }));
  expect(result.outcome).toBe("applied");
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ syncState: "stale" });
  expect(data.repository.getCardDetails(data.card.id)).toMatchObject({ title: "Original title" });
});

it("clears the local milestone when only the remote milestone was removed", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => {
    const release = repository.createRelease({ storyMapId: data.map.id, name: "Shared milestone" });
    repository.bindRemoteWorkItemLink({ connectionId: data.connection.id, releaseId: release.id, provider: "github", remoteId: "9", url: "https://github.com/org/repo/milestone/9", labels: [], syncState: "synced" });
    repository.updateCard(data.card.id, { releaseId: release.id });
    repository.upsertRemoteWorkItemLink({ ...data.link, milestone: release.name, baseline: syncBaseline(repository, data.connection, repository.getCardDetails(data.card.id)!, { ...data.remote, milestoneDescription: "", milestoneState: "open", milestone: release.name, milestoneNumber: 9 }) });
  });
  const reviewed = data.repository.getCardDetails(data.card.id)!;
  const remote = { ...data.remote, body: buildGitHubIssueBody(reviewed, data.map.name, { origin: "http://127.0.0.1:4317", projectId: data.project.id }), labels: issueLabelsForCard(data.connection, reviewed) };
  data.unitOfWork.run(human, ({ repository }) => repository.upsertRemoteWorkItemLink({ ...repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((link) => link.cardId === data.card.id)!, titleHash: hashText(remote.title), bodyHash: hashText(stripGitHubIssueFooter(remote.body)), labels: remote.labels, milestone: "Shared milestone" }));
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote));
  const result = changeSetCommandResponseSchema.parse(await syncWorkItems(data.repository, data.unitOfWork, agent, { localOrigin: "http://127.0.0.1:4317", storyMapId: data.map.id, connectionId: data.connection.id }));
  expect(result.outcome).toBe("applied");
  expect(data.repository.getCardDetails(data.card.id)!.releaseId ?? null).toBeNull();
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id)[0]).toMatchObject({ syncState: "synced" });
});

it("applies an empty Agent Story Map pull when no Card is linked to the selected connections", async () => {
  const data = fixture();
  const unlinked = data.unitOfWork.run(human, ({ repository }) => repository.createStoryMap({ projectId: data.project.id, name: "Unlinked" }));
  const result = changeSetCommandResponseSchema.parse(await pullStoryMapWorkItems(data.repository, data.unitOfWork, agent, { storyMapId: unlinked.id }));
  expect(result).toMatchObject({ outcome: "applied", changeSet: { operations: [] } });
  expect(data.provider.getRemoteItem).not.toHaveBeenCalled();
});

it("imports Agent stories Unscheduled under an Activity parent with assignee and General step", async () => {
  const data = fixture();
  const remote = (number: number, title: string, labels: string[], extra: Partial<RemoteWorkItem> = {}): RemoteWorkItem => ({ remoteId: String(number), remoteNumber: number, title, labels, body: "Reviewed body", state: "open", url: `https://github.com/org/repo/issues/${number}`, ...extra });
  data.provider.listRemoteItems.mockResolvedValue([remote(10, "Epic", ["epic"]), remote(11, "First story", [], { parentNumber: 10, milestoneDescription: "", milestoneState: "open", milestone: "Shared milestone", milestoneNumber: 9, assignee: "octocat" }), remote(12, "Second story", [], { parentNumber: 10, milestoneDescription: "", milestoneState: "open", milestone: "Shared milestone", milestoneNumber: 9 })]);
  const result = changeSetCommandResponseSchema.parse(await importWorkItems(data.repository, data.unitOfWork, agent, { storyMapId: data.map.id, connectionId: data.connection.id }));
  expect(result.outcome).toBe("applied");
  const links = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id);
  const card = (number: number) => data.repository.getCardDetails(links.find((link) => link.remoteId === String(number))!.cardId!)!;
  const releases = data.repository.listReleases(data.map.id).filter((release) => release.name === "Shared milestone");
  expect(releases).toHaveLength(0);
  expect(card(11)).toMatchObject({ releaseId: null, assignee: "octocat" });
  expect(card(12)).toMatchObject({ releaseId: null });
  const general = data.repository.getCardDetails(card(11).parentId!)!;
  expect(general).toMatchObject({ level: "step", title: "General", parentId: card(10).id });
  expect(card(12).parentId).toBe(general.id);
});

it("does not parent Agent imports under a same-numbered Issue of another repository", async () => {
  const data = fixture();
  const other = data.unitOfWork.run(human, ({ repository }) => repository.createConnectorConnection({ projectId: data.project.id, provider: "github", name: "Other", owner: "org", repository: "other", authMode: "token", readOnly: false, statusMapping: [{ localStatus: "todo", remoteState: "open", labels: ["todo"] }] }));
  data.provider.listRemoteItems.mockResolvedValue([{ remoteId: "50", remoteNumber: 50, title: "Foreign story", labels: [], body: "Reviewed body", state: "open", url: "https://github.com/org/other/issues/50", parentNumber: 1 }]);
  const result = changeSetCommandResponseSchema.parse(await importWorkItems(data.repository, data.unitOfWork, agent, { storyMapId: data.map.id, connectionId: other.id }));
  expect(result.outcome).toBe("applied");
  const imported = data.repository.listCards(data.map.id).find((card) => card.title === "Foreign story")!;
  const parent = data.repository.getCardDetails(imported.parentId!)!;
  expect(parent.parentId).not.toBe(data.card.id);
  expect(parent.id).not.toBe(data.card.id);
});

it.each([human, agent])("prepares one executable Unscheduled import for $actorType with explicit duplicate outcomes", async (actor) => {
  const data = fixture();
  const remote = { ...data.remote, remoteId: "20", remoteNumber: 20, url: "https://github.com/org/repo/issues/20", milestoneDescription: "Authored Release goal", milestoneState: "closed", milestone: "Later release", milestoneNumber: 2, labels: ["unknown"] };
  data.provider.listRemoteItems.mockResolvedValue([remote, remote, data.remote]);
  const before = data.repository.listCards(data.map.id);
  const result = await importWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, apply: false });
  expect(result).toMatchObject({ outcome: "proposed", items: [{ status: "proposed" }, { status: "already_linked" }, { status: "already_linked", cardId: data.card.id }] });
  expect(data.repository.listCards(data.map.id)).toEqual(before);
  expect(result.changeSet.execution).toBeUndefined();
  expect(result.changeSet.operations.some((operation) => operation.entity === "release" || operation.entity === "annotation")).toBe(false);
  approveChangeSet(data, human, result.changeSetId);
  applyChangeSet(data, human, result.changeSetId);
  const card = data.repository.getCardDetails(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((link) => link.remoteId === "20")!.cardId!)!;
  expect(card.releaseId).toBeNull();
  expect(data.repository.listReleases(data.map.id)).toEqual([]);
  expect(data.repository.listAnnotations(data.project.id, data.map.id)).toEqual([]);
  expect(data.repository.getChangeSet(result.changeSetId)!.execution).toMatchObject({ actor: { ...human, actorType: "github" }, restorePoint: expect.any(String) });
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote));
  const pull = await syncWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [card.id], apply: false });
  expect(pull.items).toMatchObject([{ status: "proposed" }]);
  expect(pull.changeSet.operations.filter((operation) => operation.entity === "release")).toMatchObject([{ op: "create", after: { name: "Later release", goal: "Authored Release goal", released: true } }]);
  approveChangeSet(data, human, pull.changeSetId);
  applyChangeSet(data, human, pull.changeSetId);
  const assigned = data.repository.getCardDetails(card.id)!;
  expect(assigned.releaseId).toBeTruthy();
  expect(data.repository.getRelease(assigned.releaseId!)).toMatchObject({ goal: "Authored Release goal", released: true });
  expect(data.repository.listExternalRefsForStoryMap(data.map.id)).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "release", entityId: assigned.releaseId, externalId: "https://github.com/org/repo/milestone/2" })]));
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it("adds and removes only existing unambiguous Annotation assignments with a healthy repeated pull", async () => {
  const data = fixture();
  const annotation = data.unitOfWork.run(human, ({ repository }) => {
    repository.updateConnectorConnection(data.connection.id, { labelsAsAnnotations: true, readOnly: true });
    return repository.createAnnotation({ projectId: data.project.id, storyMapId: data.map.id, name: "risk" });
  });
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, labels: [...data.remote.labels, "risk", "unknown"] }));
  const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.card.id] };
  const added = await syncWorkItems(data.repository, data.unitOfWork, human, input);
  expect(added.items).toMatchObject([{ status: "succeeded" }]);
  expect(data.repository.listCardAnnotationsForStoryMap(data.map.id)).toMatchObject([{ cardId: data.card.id, annotationId: annotation.id }]);
  const history = data.repository.listCardHistory(data.card.id);
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "unchanged" }]);
  expect(data.repository.listCardHistory(data.card.id)).toEqual(history);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, labels: [...data.remote.labels, "unknown"] }));
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "succeeded" }]);
  expect(data.repository.listCardAnnotationsForStoryMap(data.map.id)).toEqual([]);
  expect(data.repository.listAnnotations(data.project.id, data.map.id)).toEqual([annotation]);
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "unchanged" }]);
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it("keeps explicit empty selection empty and retains open conflict evidence on repeat", async () => {
  const data = fixture();
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [] });
  expect(data.provider.getRemoteItem).not.toHaveBeenCalled();
  data.unitOfWork.run(human, ({ repository }) => repository.updateCard(data.card.id, { title: "Local edit" }));
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "Remote edit" }));
  const input = { storyMapId: data.map.id, connectionId: data.connection.id };
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "conflict" }]);
  const conflicts = data.repository.listOpenSyncConflicts(data.map.id);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, title: "New remote edit" }));
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "conflict" }]);
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual(conflicts);
});

it("imports iteration sources Unscheduled and reviews their inbound-only Release assignment", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { releaseSource: "iteration" }));
  const remote = { ...data.remote, remoteId: "21", remoteNumber: 21, url: "https://github.com/org/repo/issues/21", iteration: { title: "Iteration 1", startDate: "2026-10-19", duration: 7 } };
  data.provider.listRemoteItems.mockResolvedValue([remote]);
  await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
  const cardId = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((link) => link.remoteId === "21")!.cardId!;
  expect(data.repository.getCardDetails(cardId)!.releaseId).toBeNull();
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote));
  const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [cardId] };
  await syncWorkItems(data.repository, data.unitOfWork, human, input);
  const releaseId = data.repository.getCardDetails(cardId)!.releaseId!;
  expect(data.repository.getRelease(releaseId)).toMatchObject({ name: "Iteration 1", startDate: "2026-10-19", releaseDate: "2026-10-26" });
  expect(data.repository.listExternalRefsForStoryMap(data.map.id).filter((ref) => ref.entityType === "release")).toEqual([]);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...remote, iteration: { ...remote.iteration, title: "Renamed iteration" } }));
  await syncWorkItems(data.repository, data.unitOfWork, human, input);
  expect(data.repository.getCardDetails(cardId)!.releaseId).not.toBe(releaseId);
  expect(data.repository.getRelease(releaseId)!.name).toBe("Iteration 1");
  expect(data.repository.getRelease(data.repository.getCardDetails(cardId)!.releaseId!)!.name).toBe("Renamed iteration");
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
});

it.each(["iteration", "milestone"] as const)("treats a deleted acknowledged %s Release as a local unassign without dead references or remote writes", async (releaseSource) => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { releaseSource }));
  const remote = { ...data.remote, remoteId: "22", remoteNumber: 22, url: "https://github.com/org/repo/issues/22", milestoneDescription: "", milestoneState: "open", milestone: "Milestone 1", milestoneNumber: 3, iteration: { title: "Iteration 1", startDate: "2026-10-19", duration: 7 } };
  data.provider.listRemoteItems.mockResolvedValue([remote]);
  await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
  const cardId = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((link) => link.remoteId === "22")!.cardId!;
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote));
  const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [cardId] };
  await syncWorkItems(data.repository, data.unitOfWork, human, input);
  const releaseId = data.repository.getCardDetails(cardId)!.releaseId!;
  data.unitOfWork.run(human, ({ repository }) => repository.deleteRelease(releaseId));
  const proposed = await syncWorkItems(data.repository, data.unitOfWork, human, { ...input, apply: false });
  expect(proposed.items).toMatchObject([{ cardId, status: "unchanged" }]);
  expect(JSON.stringify(proposed.changeSet.operations.map((operation) => "after" in operation ? operation.after : null))).not.toContain(releaseId);
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
  await syncWorkItems(data.repository, data.unitOfWork, human, input);
  const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.cardId === cardId)!;
  expect(link.baseline!.acknowledgedLocal.releaseId).toBeNull();
  expect(link.syncState).toBe("unsynced");
  expect(data.repository.getCardDetails(cardId)!.releaseId).toBeNull();
  expect(data.repository.listReleases(data.map.id)).toEqual([]);
  expect(data.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  const later = await syncWorkItems(data.repository, data.unitOfWork, human, input);
  expect(later.items).toMatchObject([{ cardId, status: "unchanged" }]);
  expect(data.repository.getCardDetails(cardId)!.releaseId).toBeNull();
});

it("marks a link stale without a dead Release reference when the acknowledged Release was deleted and the Issue is unavailable", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { releaseSource: "milestone" }));
  const remote = { ...data.remote, remoteId: "26", remoteNumber: 26, url: "https://github.com/org/repo/issues/26", milestoneDescription: "", milestoneState: "open", milestone: "Milestone 1", milestoneNumber: 3 };
  data.provider.listRemoteItems.mockResolvedValue([remote]);
  await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
  const cardId = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((link) => link.remoteId === "26")!.cardId!;
  const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [cardId] };
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote));
  await syncWorkItems(data.repository, data.unitOfWork, human, input);
  const releaseId = data.repository.getCardDetails(cardId)!.releaseId!;
  data.unitOfWork.run(human, ({ repository }) => repository.deleteRelease(releaseId));
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(undefined));
  const proposed = await syncWorkItems(data.repository, data.unitOfWork, human, { ...input, apply: false });
  expect(JSON.stringify(proposed.changeSet.operations.map((operation) => "after" in operation ? operation.after : null))).not.toContain(releaseId);
  await syncWorkItems(data.repository, data.unitOfWork, human, input);
  const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.cardId === cardId)!;
  expect(link).toMatchObject({ syncState: "stale", baseline: { acknowledgedLocal: { releaseId: null } } });
  expect(data.repository.getCardDetails(cardId)!.releaseId).toBeNull();
});

it("reports every item as failed in the finalize phase when GitHub is disabled after preparation", () => {
  const data = fixture();
  const context = beginGitHubPreparation(data, human, data.map.id, data.connection.id);
  data.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(data.project.id, { github: false }));
  const items = [{ status: "proposed" as const, cardId: data.card.id, remoteId: "1" }, { status: "unchanged" as const, cardId: randomUUID(), remoteId: "2" }];
  let thrown: unknown;
  try { githubIncomingCommand(context, [], "Finalize failure", undefined, () => items); } catch (error) { thrown = error; }
  expect(thrown).toBeInstanceOf(DomainError);
  expect(thrown).toMatchObject({ code: "disabled", details: { items: [{ status: "failed", details: { phase: "finalize" } }, { status: "failed", details: { phase: "finalize" } }] } });
  expect(data.repository.listChangeSets(data.project.id)).toEqual([]);
});

it("recreates an iteration tuple Release in a later batch after its Release was deleted", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { releaseSource: "iteration" }));
  const iteration = { title: "Iteration 1", startDate: "2026-10-19", duration: 7 };
  const remotes = [23, 24].map((number) => ({ ...data.remote, remoteId: String(number), remoteNumber: number, url: `https://github.com/org/repo/issues/${number}`, iteration }));
  data.provider.listRemoteItems.mockResolvedValue(remotes);
  await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
  const cardId = (number: string) => data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((link) => link.remoteId === number)!.cardId!;
  data.provider.getRemoteItem.mockImplementation(async (_connection, _auth, id) => remoteReadFixture(remotes.find((row) => row.remoteId === id)!));
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [cardId("23")] });
  data.unitOfWork.run(human, ({ repository }) => repository.deleteRelease(data.repository.getCardDetails(cardId("23"))!.releaseId!));
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [cardId("24")] });
  expect(data.repository.getRelease(data.repository.getCardDetails(cardId("24"))!.releaseId!)).toMatchObject({ name: "Iteration 1" });
  expect(data.repository.listReleases(data.map.id)).toHaveLength(1);
});

it("refuses a provider read that returns a different Issue identity without changing the Card", async () => {
  const data = fixture();
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, remoteId: "99", remoteNumber: 99, url: "https://github.com/org/repo/issues/99", title: "Other Issue" }));
  const before = data.repository.getCardDetails(data.card.id);
  await expect(syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id })).rejects.toMatchObject({ code: "conflict", details: { items: [{ status: "failed", remoteId: "1" }] } });
  expect(data.repository.getCardDetails(data.card.id)).toEqual(before);
  expect(data.repository.listChangeSets(data.project.id)).toEqual([]);
});

it("refuses an imported Issue from another repository and creates no Card", async () => {
  const data = fixture();
  const foreign = { ...data.remote, remoteId: "98", remoteNumber: 98, url: "https://github.com/other/repo/issues/98" };
  data.provider.listRemoteItems.mockResolvedValue([foreign]);
  const cards = data.repository.getStoryMapSnapshot(data.map.id)!.cards.length;
  await expect(importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id })).rejects.toMatchObject({ code: "validation", details: { items: [{ status: "failed", remoteId: "98" }] } });
  expect(data.repository.getStoryMapSnapshot(data.map.id)!.cards).toHaveLength(cards);
  expect(data.repository.listChangeSets(data.project.id)).toEqual([]);
});

it("reports prepared, failed and not-attempted source rows without applying a partial incoming batch", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => {
    for (const number of [2, 3]) {
      const card = repository.createCard({ storyMapId: data.map.id, level: "activity", title: `Item ${number}` }, "human");
      repository.bindRemoteWorkItemLink({ connectionId: data.connection.id, cardId: card.id, provider: "github", remoteId: String(number), url: `https://github.com/org/repo/issues/${number}`, labels: [], syncState: "synced" });
    }
  });
  data.provider.getRemoteItem.mockImplementation(async (_connection, _auth, id) => {
    if (id === "2") throw new DomainError("validation", "Provider read failed.");
    return remoteReadFixture({ ...data.remote, body: "Incoming body" });
  });
  const { productContext: _contextBefore, ...before } = data.repository.getStoryMapSnapshot(data.map.id)!;
  await expect(syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id })).rejects.toMatchObject({ code: "validation", details: { items: [{ status: "not_attempted", remoteId: "1" }, { status: "failed", remoteId: "2" }, { status: "not_attempted", remoteId: "3" }] } });
  const { productContext: _contextAfter, ...after } = data.repository.getStoryMapSnapshot(data.map.id)!;
  expect(after).toEqual(before);
  expect(data.repository.listChangeSets(data.project.id)).toEqual([]);
  expect(data.provider.getRemoteItem).toHaveBeenCalledTimes(2);
});

it("compares imported unmapped status evidence on repeat and after refusing a local status edit", async () => {
  const data = fixture();
  const remote = { ...data.remote, remoteId: "40", remoteNumber: 40, url: "https://github.com/org/repo/issues/40", labels: [] };
  data.provider.listRemoteItems.mockResolvedValue([remote]);
  await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
  const cardId = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.remoteId === "40")!.cardId!;
  const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [cardId] };
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote));
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "unchanged" }]);
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "unchanged" }]);
  expect(() => data.unitOfWork.run(human, ({ repository }) => repository.updateCard(cardId, { status: "active" }))).toThrow("GitHub owns this Card status");
  data.unitOfWork.run(human, ({ repository }) => repository.updateCard(cardId, { title: "Independent local title" }));
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "unchanged" }]);
  const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.cardId === cardId)!;
  const fields = changedFieldsForRemote(data.repository, data.connection, data.repository.getCardDetails(cardId)!, link, remote);
  expect(fields.status).toMatchObject({ local: false, remote: false });
  expect(fields.title).toMatchObject({ local: true, remote: false });
  expect(link.syncState).toBe("unsynced");
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
});

it("retains divergent managed-label assignments and durable evidence through repeat and reviewed remote resolution", async () => {
  const data = fixture();
  const [risk, customer] = data.unitOfWork.run(human, ({ repository }) => {
    repository.updateConnectorConnection(data.connection.id, { labelsAsAnnotations: true, readOnly: true });
    return ["risk", "customer"].map((name) => repository.createAnnotation({ projectId: data.project.id, storyMapId: data.map.id, name }));
  });
  const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.card.id] };
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, labels: [...data.remote.labels, "risk", "unmanaged"] }));
  await syncWorkItems(data.repository, data.unitOfWork, human, input);
  data.unitOfWork.run(human, ({ repository }) => repository.setCardAnnotation(data.card.id, customer!.id));
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...data.remote, labels: [...data.remote.labels, "unmanaged"] }));
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "conflict" }]);
  const assignments = data.repository.listCardAnnotationsForStoryMap(data.map.id);
  expect(assignments.map((row) => row.annotationId).sort()).toEqual([risk!.id, customer!.id].sort());
  const conflicts = data.repository.listOpenSyncConflicts(data.map.id);
  expect(conflicts).toMatchObject([{ field: "labels", localValue: ["customer", "risk"], remoteValue: [], status: "open" }]);
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "conflict" }]);
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual(conflicts);
  expect(data.repository.listCardAnnotationsForStoryMap(data.map.id)).toEqual(assignments);
  const result = await resolveGitHubConflictCommand(data, human, conflicts[0]!.id, { storyMapId: data.map.id, resolution: "remote", apply: false, reviewed: { localValue: conflicts[0]!.localValue, remoteValue: conflicts[0]!.remoteValue } });
  expect(data.repository.listCardAnnotationsForStoryMap(data.map.id)).toEqual(assignments);
  approveChangeSet(data, human, result.changeSetId);
  applyChangeSet(data, human, result.changeSetId);
  expect(data.repository.listCardAnnotationsForStoryMap(data.map.id)).toEqual([]);
  expect(data.repository.getSyncConflict(conflicts[0]!.id)).toMatchObject({ status: "resolved-remote", localValue: ["customer", "risk"], remoteValue: [] });
  expect(data.repository.listAnnotations(data.project.id, data.map.id)).toHaveLength(2);
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "unchanged" }]);
  expect(data.provider.writeRemoteIssue).not.toHaveBeenCalled();
});

it("reuses persisted iteration tuples across batches and keeps a shared old Release unchanged when one Card moves", async () => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { releaseSource: "iteration" }));
  const a = { title: "Iteration A", startDate: "2026-10-19", duration: 7 };
  const b = { title: "Iteration B", startDate: "2026-10-26", duration: 14 };
  const remote = (number: number, iteration = a): RemoteWorkItem => ({ ...data.remote, remoteId: String(number), remoteNumber: number, url: `https://github.com/org/repo/issues/${number}`, iteration });
  const imported = async (numbers: number[]) => {
    data.provider.listRemoteItems.mockResolvedValue(numbers.map((number) => remote(number)));
    await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
    return numbers.map((number) => data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.remoteId === String(number))!.cardId!);
  };
  const ids = await imported([51, 52]);
  data.provider.getRemoteItem.mockImplementation(async (_connection, _auth, id) => remoteReadFixture(remote(Number(id))));
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: ids });
  const releaseA = data.repository.getRelease(data.repository.getCardDetails(ids[0]!)!.releaseId!)!;
  expect(data.repository.getCardDetails(ids[1]!)!.releaseId).toBe(releaseA.id);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote(51, b)));
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [ids[0]!] });
  expect(data.repository.getCardDetails(ids[0]!)!.releaseId).not.toBe(releaseA.id);
  expect(data.repository.getCardDetails(ids[1]!)!.releaseId).toBe(releaseA.id);
  expect(data.repository.getRelease(releaseA.id)).toEqual(releaseA);
  const [later] = await imported([53]);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote(53)));
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [later!] });
  expect(data.repository.getCardDetails(later!)!.releaseId).toBe(releaseA.id);
  expect(data.repository.listReleases(data.map.id)).toHaveLength(2);
  expect(data.provider.writeMilestone).not.toHaveBeenCalled();
});

it.each(["iteration", "milestone"] as const)("preserves locally edited %s Release metadata and records concurrent remote changes", async (releaseSource) => {
  const data = fixture();
  data.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { releaseSource }));
  const remote = { ...data.remote, remoteId: "61", remoteNumber: 61, url: "https://github.com/org/repo/issues/61", milestoneDescription: "", milestoneState: "open", milestone: "Before", milestoneNumber: 8, milestoneDueOn: "2026-11-01T00:00:00Z", iteration: { title: "Before", startDate: "2026-10-19", duration: 7 } };
  data.provider.listRemoteItems.mockResolvedValue([remote]);
  await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
  const cardId = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.remoteId === "61")!.cardId!;
  const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [cardId] };
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote));
  await syncWorkItems(data.repository, data.unitOfWork, human, input);
  const releaseId = data.repository.getCardDetails(cardId)!.releaseId!;
  data.unitOfWork.run(human, ({ repository }) => repository.updateRelease(releaseId, { name: "Local", startDate: "2026-10-20", releaseDate: "2026-12-01" }));
  const local = data.repository.getRelease(releaseId)!;
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "unchanged" }]);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...remote, milestone: "Remote", milestoneDueOn: "2026-11-15T00:00:00Z", iteration: { ...remote.iteration, title: "Remote" } }));
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "conflict" }]);
  expect(data.repository.getRelease(releaseId)).toEqual(local);
  expect(data.repository.getCardDetails(cardId)!.releaseId).toBe(releaseId);
  expect(data.repository.listReleases(data.map.id)).toHaveLength(1);
  const conflict = data.repository.listOpenSyncConflicts(data.map.id)[0]!;
  expect(conflict).toMatchObject({ field: "milestone", localValue: { metadata: { name: "Local", releaseDate: "2026-12-01" } }, remoteValue: { metadata: { name: "Remote" } } });
  const result = await resolveGitHubConflictCommand(data, human, conflict.id, { storyMapId: data.map.id, resolution: "remote", apply: false, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } });
  expect(data.repository.getRelease(releaseId)).toEqual(local);
  approveChangeSet(data, human, result.changeSetId);
  applyChangeSet(data, human, result.changeSetId);
  expect(data.repository.getSyncConflict(conflict.id)!.status).toBe("resolved-remote");
  if (releaseSource === "milestone") expect(data.repository.getRelease(releaseId)).toMatchObject({ name: "Remote", releaseDate: "2026-11-15", startDate: "2026-10-20" });
  else {
    expect(data.repository.getRelease(releaseId)).toEqual(local);
    expect(data.repository.getCardDetails(cardId)!.releaseId).not.toBe(releaseId);
  }
});

it("updates canonical Milestone metadata without changing the Release identity or a local start date", async () => {
  const data = fixture();
  const remote = { ...data.remote, remoteId: "71", remoteNumber: 71, url: "https://github.com/org/repo/issues/71", milestoneDescription: "", milestoneState: "open", milestone: "Before", milestoneNumber: 8, milestoneDueOn: "2026-11-01T00:00:00Z" };
  data.provider.listRemoteItems.mockResolvedValue([remote]);
  await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
  const cardId = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.remoteId === "71")!.cardId!;
  const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [cardId] };
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote));
  await syncWorkItems(data.repository, data.unitOfWork, human, input);
  const releaseId = data.repository.getCardDetails(cardId)!.releaseId!;
  data.unitOfWork.run(human, ({ repository }) => repository.updateRelease(releaseId, { startDate: "2026-10-19" }));
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture({ ...remote, milestone: "After", milestoneDueOn: "2026-11-15T00:00:00Z" }));
  const result = await syncWorkItems(data.repository, data.unitOfWork, human, { ...input, apply: false });
  expect(result.items).toMatchObject([{ status: "proposed" }]);
  expect(result.changeSet.operations).toEqual(expect.arrayContaining([expect.objectContaining({ entity: "release", op: "update", entityId: releaseId, after: { name: "After", goal: "", released: false, releaseDate: "2026-11-15" } })]));
  expect(data.repository.getRelease(releaseId)!.name).toBe("Before");
  approveChangeSet(data, human, result.changeSetId);
  applyChangeSet(data, human, result.changeSetId);
  expect(data.repository.getCardDetails(cardId)!.releaseId).toBe(releaseId);
  expect(data.repository.getRelease(releaseId)).toMatchObject({ name: "After", startDate: "2026-10-19", releaseDate: "2026-11-15" });
  expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "unchanged" }]);
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
});

it.each(["unchanged", "remote-edited"] as const)("preserves a locally edited shared Milestone target when a new Card assigns it with %s metadata", async (scenario) => {
  const data = fixture();
  const remote = (number: number): RemoteWorkItem => ({ ...data.remote, remoteId: String(number), remoteNumber: number, url: `https://github.com/org/repo/issues/${number}`, milestoneDescription: "", milestoneState: "open", milestone: "Original Release", milestoneNumber: 9, milestoneDueOn: "2026-11-01T00:00:00Z" });
  const importCard = async (number: number) => {
    data.provider.listRemoteItems.mockResolvedValue([remote(number)]);
    await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
    return data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.remoteId === String(number))!.cardId!;
  };
  const first = await importCard(81);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote(81)));
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [first] });
  const releaseId = data.repository.getCardDetails(first)!.releaseId!;
  data.unitOfWork.run(human, ({ repository }) => repository.updateRelease(releaseId, { name: "Local Release", releaseDate: "2026-12-01" }));
  const local = data.repository.getRelease(releaseId)!;
  const second = await importCard(82);
  const incoming = { ...remote(82), ...(scenario === "remote-edited" ? { milestone: "Remote Release", milestoneDueOn: "2026-11-15T00:00:00Z" } : {}) };
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(incoming));
  const input = { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [second] };
  const result = await syncWorkItems(data.repository, data.unitOfWork, human, input);
  expect(data.repository.getRelease(releaseId)).toEqual(local);
  expect(data.repository.getCardDetails(first)!.releaseId).toBe(releaseId);
  expect(data.repository.listReleases(data.map.id)).toHaveLength(1);
  if (scenario === "remote-edited") {
    expect(result.items).toMatchObject([{ status: "conflict" }]);
    expect(data.repository.getCardDetails(second)!.releaseId).toBeNull();
    expect(data.repository.listOpenSyncConflicts(data.map.id)).toMatchObject([{ cardId: second, field: "milestone", localValue: { assignment: null, metadata: { name: "Local Release", releaseDate: "2026-12-01" } }, remoteValue: { metadata: { name: "Remote Release", releaseDate: "2026-11-15" } } }]);
  } else {
    expect(result.items).toMatchObject([{ status: "succeeded" }]);
    expect(data.repository.getCardDetails(second)!.releaseId).toBe(releaseId);
    const link = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.cardId === second)!;
    expect(link.baseline!.acknowledgedLocal.releaseMetadata).toEqual({ name: "Local Release", goal: "", released: false, startDate: null, releaseDate: "2026-12-01" });
    expect(link.baseline!.observedRemote.releaseMetadata).toEqual({ name: "Original Release", goal: "", released: false, startDate: null, releaseDate: "2026-11-01" });
    expect((await syncWorkItems(data.repository, data.unitOfWork, human, input)).items).toMatchObject([{ status: "unchanged" }]);
  }
});

it("uses the shared Release acknowledgment when staggered Milestone pulls skip an intermediate remote metadata version", async () => {
  const data = fixture();
  const remote = (number: number, version: number): RemoteWorkItem => ({ ...data.remote, remoteId: String(number), remoteNumber: number, url: `https://github.com/org/repo/issues/${number}`, milestoneDescription: "", milestoneState: "open", milestone: `Release ${version}`, milestoneNumber: 9, milestoneDueOn: `2026-11-0${version}T00:00:00Z` });
  data.provider.listRemoteItems.mockResolvedValue([remote(91, 1), remote(92, 1)]);
  await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id });
  const ids = [91, 92].map((number) => data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.remoteId === String(number))!.cardId!);
  data.provider.getRemoteItem.mockImplementation(async (_connection, _auth, id) => remoteReadFixture(remote(Number(id), 1)));
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: ids });
  const releaseId = data.repository.getCardDetails(ids[0]!)!.releaseId!;
  for (const [index, version] of [[0, 2], [1, 3]] as const) {
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote(index === 0 ? 91 : 92, version)));
    const result = await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [ids[index]!] });
    expect(result.items).toMatchObject([{ status: "succeeded" }]);
    expect(data.repository.getRelease(releaseId)).toMatchObject({ name: `Release ${version}`, releaseDate: `2026-11-0${version}` });
    expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
    expect(data.repository.getCardDetails(ids[index]!)!.releaseId).toBe(releaseId);
  }
});

it.each(["local-edit", "staggered-remote", "overlap", "owner-change"] as const)("shares canonical Milestone metadata evidence across connections during %s assignment", async (scenario) => {
  const data = fixture();
  const other = data.unitOfWork.run(human, ({ repository }) => repository.createConnectorConnection({ projectId: data.project.id, provider: "github", name: "Second connection", owner: "org", repository: "repo", authMode: "token", readOnly: false, statusMapping: data.connection.statusMapping }));
  const remote = (number: number, version: number): RemoteWorkItem => ({ ...data.remote, remoteId: String(number), remoteNumber: number, url: `https://github.com/org/repo/issues/${number}`, milestoneDescription: "", milestoneState: "open", milestone: `Release ${version}`, milestoneNumber: 10, milestoneDueOn: `2026-11-0${version}T00:00:00Z` });
  const importCard = async (connectionId: string, number: number) => {
    data.provider.listRemoteItems.mockResolvedValue([remote(number, 1)]);
    await importWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId });
    return data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.cardId && row.remoteId === String(number))!.cardId!;
  };
  const first = await importCard(data.connection.id, 101);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote(101, 1)));
  await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [first] });
  const releaseId = data.repository.getCardDetails(first)!.releaseId!;
  const second = await importCard(other.id, 102);
  if (scenario === "local-edit" || scenario === "overlap") data.unitOfWork.run(human, ({ repository }) => repository.updateRelease(releaseId, { name: "Local metadata", releaseDate: "2026-12-01" }));
  else {
    data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote(101, 2)));
    await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [first] });
  }
  const before = data.repository.getRelease(releaseId)!;
  const incoming = remote(102, scenario === "local-edit" ? 1 : 3);
  data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(incoming));
  const result = await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId: other.id, cardIds: [second], apply: false });
  if (scenario === "overlap") {
    expect(result.items).toMatchObject([{ status: "conflict" }]);
    approveChangeSet(data, human, result.changeSetId);
    applyChangeSet(data, human, result.changeSetId);
    expect(data.repository.getRelease(releaseId)).toEqual(before);
    expect(data.repository.getCardDetails(second)!.releaseId).toBeNull();
    expect(data.repository.listOpenSyncConflicts(data.map.id)).toMatchObject([{ cardId: second, field: "milestone", localValue: { metadata: { name: "Local metadata" } }, remoteValue: { metadata: { name: "Release 3" } } }]);
    return;
  }
  expect(result.items).toMatchObject([{ status: "proposed" }]);
  if (scenario !== "local-edit") {
    const baselineOperation = result.changeSet.operations.find((operation) => operation.entity === "remoteWorkItemLink" && operation.before?.releaseId === releaseId)!;
    expect(baselineOperation).toMatchObject({ before: { connectionId: data.connection.id, releaseId }, connectionBefore: data.repository.getConnectorConnection(data.connection.id), after: { connectionId: data.connection.id } });
  }
  approveChangeSet(data, human, result.changeSetId);
  if (scenario === "owner-change") {
    data.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(data.connection.id, { name: "Owner changed after review" }));
    expect(() => applyChangeSet(data, human, result.changeSetId)).toThrowError(expect.objectContaining({ code: "conflict" }));
    expect(data.repository.getRelease(releaseId)).toEqual(before);
    expect(data.repository.getCardDetails(second)!.releaseId).toBeNull();
    return;
  }
  await exerciseSharesCanonicalMilestoneMetadataEvidenceAcrossConnectionsDuringS(data, result, second, releaseId, first, scenario, before, other, remote);
});

async function exerciseSharesCanonicalMilestoneMetadataEvidenceAcrossConnectionsDuringS(data: ReturnType<typeof fixture>, result: ChangeSetCommandResponse, second: string, releaseId: string, first: string, scenario: string, before: Release, other: ConnectorConnection, remote: (number: number, version: number) => RemoteWorkItem) {
  applyChangeSet(data, human, result.changeSetId);
  expect(data.repository.getCardDetails(second)!.releaseId).toBe(releaseId);
  expect(data.repository.getCardDetails(first)!.releaseId).toBe(releaseId);
  expect(data.repository.listReleases(data.map.id)).toHaveLength(1);
  expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
  const release = data.repository.getRelease(releaseId)!;
  if (scenario === "local-edit") expect(release).toEqual(before);
  else expect(release).toMatchObject({ name: "Release 3", releaseDate: "2026-11-03" });
  const binding = data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).find((row) => row.releaseId === releaseId)!;
  expect(binding.connectionId).toBe(data.connection.id);
  if (scenario === "staggered-remote") {
    expect(binding.baseline!.acknowledgedLocal.releaseMetadata).toEqual({ name: "Release 3", goal: "", released: false, startDate: null, releaseDate: "2026-11-03" });
    for (const [connectionId, cardId, number, version] of [[data.connection.id, first, 101, 4], [other.id, second, 102, 5]] as const) {
      data.provider.getRemoteItem.mockResolvedValue(remoteReadFixture(remote(number, version)));
      expect((await syncWorkItems(data.repository, data.unitOfWork, human, { storyMapId: data.map.id, connectionId, cardIds: [cardId] })).items).toMatchObject([{ status: "succeeded" }]);
      expect(data.repository.getRelease(releaseId)).toMatchObject({ name: `Release ${version}`, releaseDate: `2026-11-0${version}` });
      expect(data.repository.listOpenSyncConflicts(data.map.id)).toEqual([]);
    }
  }
}
