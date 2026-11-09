import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { type GitHubTicketPlacement, type ImportGitHubTicketRequest, type LookupGitHubTicketRequest } from "@storymapper/contracts";
import { rejectSqliteWrite } from "@storymapper/db/test-fixtures/sqlite-write-failure";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createWorkItemProvider, type RemoteItemRead, type RemoteWorkItem } from "@storymapper/github";
import { approveChangeSet, applyChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";
import { createRestorePoint, restoreProject } from "@storymapper/server/application/restore/restore.use-cases";
import { lookupGitHubTicket, importGitHubTicket, importWorkItems, pullStoryMapWorkItems, getWorkItemSyncHealth } from "@storymapper/server/application/sync/sync.use-cases";
import { buildGitHubIssueBody, normalizeRemoteWorkItemTitle, stripGitHubIssueFooter } from "@storymapper/core";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { reviewedPushProviderFixture } from "@storymapper/server/fixtures/reviewed-push-provider";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));
const human = { actorType: "human", actorId: "ticket-human" } as const;
const agent = { actorType: "agent", actorId: "ticket-agent", mcpSessionId: "ticket-session" } as const;
const remote: RemoteWorkItem = { remoteId: "17", remoteNumber: 17, url: "https://github.com/owner/repo/issues/17", title: "Remote issue", body: "Remote Markdown", state: "open", labels: [], issueType: "Bug" };
const cleanup: Array<() => void> = [];
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "github-ticket-command-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const entities = unitOfWork.run(human, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Ticket creation" });
    tx.updateSafetySettings(project.id, { github: true, agentMode: "apply" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Composer map" });
    tx.upsertProductContext({ projectId: project.id, storyMapId: map.id });
    const activity = tx.createCard({ storyMapId: map.id, title: "Parent Activity", level: "activity" });
    const step = tx.createCard({ storyMapId: map.id, title: "Parent Step", level: "step", parentId: activity.id });
    const release = tx.createRelease({ storyMapId: map.id, name: "Selected Release", startDate: "2026-10-01", releaseDate: "2026-11-01" });
    const connection = tx.createConnectorConnection({ projectId: project.id, name: "Read-only GitHub", provider: "github", owner: "owner", repository: "repo", authMode: "token" });
    return { project, map, activity, step, release, connection };
  });
  const provider = { ...reviewedPushProviderFixture(), validateConnection: vi.fn(), listRemoteItems: vi.fn(), createOrUpdateRemoteItem: vi.fn(), getRemoteItem: vi.fn(async (): Promise<RemoteItemRead> => ({ status: "found", item: remote })) };
  vi.mocked(createWorkItemProvider).mockReturnValue(provider);
  const placement: GitHubTicketPlacement = { level: "story", parentId: entities.step.id, releaseId: entities.release.id, position: 0 };
  const input: LookupGitHubTicketRequest = { storyMapId: entities.map.id, connectionId: entities.connection.id, selector: "#17", placement };
  const deps = { repository, unitOfWork };
  const reviewed = async (patch: Partial<ImportGitHubTicketRequest> = {}): Promise<ImportGitHubTicketRequest> => ({ ...input, reviewEvidence: (await lookupGitHubTicket(deps, human, input)).reviewEvidence, title: "Authored final title", description: "Authored final Markdown", status: "todo", estimate: 8, ...patch });
  return { ...deps, deps, directory, path, handle, ...entities, provider, input, reviewed };
}

it.each(["activity", "step", "story"] as const)("atomically persists a %s at exact reviewed placement, with distinct final-local and remote baselines", async (level) => {
  const f = fixture();
  f.input.placement = { ...f.input.placement, level, parentId: level === "activity" ? null : level === "step" ? f.activity.id : f.step.id };
  const before = f.repository.getStoryMapSnapshot(f.map.id)!;
  const result = await importGitHubTicket(f.deps, human, await f.reviewed());
  expect(result.outcome).toBe("applied");
  if (result.outcome === "already_linked") throw new Error("Expected new import");
  expect(result.changeSet).toMatchObject({ source: "github", proposedBy: human, execution: { actor: { ...human, actorType: "github" }, initiatedBy: human, restorePoint: expect.any(String) } });
  const reopen = new DatabaseHandle(openStoryMapperDb(f.path));
  try {
    const repository = new StoryMapperRepository(reopen);
    const snapshot = repository.getStoryMapSnapshot(f.map.id)!;
    const imported = snapshot.cards.find((card) => !before.cards.some((prior) => prior.id === card.id))!;
    expect(imported).toMatchObject({ ...f.input.placement, title: "Authored final title", description: "Authored final Markdown", estimate: 8, provenance: "linked" });
    expect(snapshot.githubLinks).toMatchObject([{ cardId: imported.id, issueNumber: 17, url: remote.url }]);
    expect(snapshot.sourceLinks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "github", cardId: imported.id, url: remote.url })]));
    expect(snapshot.remoteWorkItemLinks).toMatchObject([{ cardId: imported.id, issueType: "Bug", baseline: { pendingReleaseAssignment: false, acknowledgedLocal: { titleHash: createHash("sha256").update(imported.title).digest("hex"), releaseId: f.release.id, releaseMetadata: { name: f.release.name, startDate: null, releaseDate: f.release.releaseDate } }, observedRemote: { titleHash: createHash("sha256").update(remote.title).digest("hex") } } }]);
    expect(getWorkItemSyncHealth({ repository, unitOfWork: new UnitOfWork(reopen) }, human, f.map.id)).toMatchObject({ stateCounts: { synced: 1, unsynced: 0 }, links: [{ cardId: imported.id, syncState: "synced" }] });
    expect(repository.listCardHistory(imported.id)).toEqual(expect.arrayContaining([expect.objectContaining({ actorType: "github", actor: human.actorId })]));
    expect(repository.getChangeSet(result.changeSetId)?.status).toBe("applied");
  } finally { reopen.current.$client.close(); }
  expect(f.provider.createOrUpdateRemoteItem).not.toHaveBeenCalled();
  expect(f.provider.writeRemoteIssue).not.toHaveBeenCalled();
  expect(f.provider.listRemoteItems).not.toHaveBeenCalled();
});

it("lookup leaves all domain data unchanged and requires explicit import", async () => {
  const f = fixture();
  const before = f.repository.getStoryMapSnapshot(f.map.id);
  const result = await lookupGitHubTicket(f.deps, human, f.input);
  expect(result).toMatchObject({ ticket: { locator: remote.url, number: 17, title: remote.title, description: remote.body, issueType: "Bug" }, reviewEvidence: { epoch: f.repository.getSafetySettings(f.project.id).epoch, scopeHash: expect.any(String), remoteHash: expect.any(String) } });
  expect(f.repository.getStoryMapSnapshot(f.map.id)).toEqual(before);
  expect(f.repository.listChangeSets(f.project.id)).toEqual([]);
});

it.each(["https://example.com/owner/repo/issues/17", "owner/foreign#17", "https://github.com/owner/repo/pull/17", "9007199254740992"])("rejects %s before credentials/provider access", async (selector) => {
  const f = fixture();
  await expect(lookupGitHubTicket(f.deps, human, { ...f.input, selector })).rejects.toMatchObject({ code: "validation" });
  expect(resolveProviderAuth).not.toHaveBeenCalled();
  expect(createWorkItemProvider).not.toHaveBeenCalled();
});

it.each(["parent", "release", "connection"] as const)("rejects foreign %s ownership before credentials/provider access", async (foreign) => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository: tx }) => {
    const otherProject = tx.createProject({ name: "Foreign Project" });
    const otherMap = tx.createStoryMap({ projectId: otherProject.id, name: "Foreign Map" });
    if (foreign === "parent") f.input.placement.parentId = tx.createCard({ storyMapId: otherMap.id, title: "Foreign Step", level: "step" }).id;
    if (foreign === "release") f.input.placement.releaseId = tx.createRelease({ storyMapId: otherMap.id, name: "Foreign Release" }).id;
    if (foreign === "connection") f.input.connectionId = tx.createConnectorConnection({ projectId: otherProject.id, name: "Foreign connection", provider: "github", owner: "owner", repository: "repo", authMode: "token" }).id;
  });
  await expect(lookupGitHubTicket(f.deps, human, f.input)).rejects.toMatchObject({ code: foreign === "connection" ? "validation" : "conflict" });
  expect(resolveProviderAuth).not.toHaveBeenCalled();
  expect(createWorkItemProvider).not.toHaveBeenCalled();
});

it.each(["unavailable", "mismatch", "network"] as const)("keeps lookup failure %s read-only and truthful", async (failure) => {
  const f = fixture();
  const before = f.repository.getStoryMapSnapshot(f.map.id);
  if (failure === "unavailable") f.provider.getRemoteItem.mockResolvedValue({ status: "unavailable" });
  else if (failure === "mismatch") f.provider.getRemoteItem.mockResolvedValue({ status: "found", item: { ...remote, remoteId: "18", remoteNumber: 18, url: "https://github.com/owner/repo/issues/18" } });
  else f.provider.getRemoteItem.mockRejectedValue(new Error("network unavailable"));
  await expect(lookupGitHubTicket(f.deps, human, f.input)).rejects.toThrow();
  expect(f.repository.getStoryMapSnapshot(f.map.id)).toEqual(before);
  expect(f.repository.listChangeSets(f.project.id)).toEqual([]);
});

it.each([human, agent])("retains protected $actorType imports until separate human approval and atomic selection", async (actor) => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateSafetySettings(f.project.id, { agentMode: "propose" }));
  const input = await f.reviewed();
  const result = await importGitHubTicket(f.deps, actor, input);
  expect(result.outcome).toBe("proposed");
  if (result.outcome === "already_linked") throw new Error("Expected proposal");
  expect(f.repository.listCards(f.map.id)).toHaveLength(2);
  const card = result.changeSet.operations.find((operation) => operation.entity === "card" && operation.op === "create")!;
  const partial = approveChangeSet(f.deps, human, result.changeSetId, [card.operationId]);
  expect(partial.changeSet.approval!.selectedOperationIds).not.toEqual([card.operationId]);
  if (partial.changeSet.approval!.selectedOperationIds.length) {
    const selected = result.changeSet.operations.filter((operation) => partial.changeSet.approval!.selectedOperationIds.includes(operation.operationId));
    expect(selected.map((operation) => operation.entity)).toEqual(expect.arrayContaining(["card", "githubExternalRef", "remoteWorkItemLink"]));
  }
  approveChangeSet(f.deps, human, result.changeSetId);
  applyChangeSet(f.deps, human, result.changeSetId);
  expect(f.repository.listCards(f.map.id)).toHaveLength(3);
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toHaveLength(1);
});

it("deduplicates active ownership across connections without reassigning its canonical binding", async () => {
  const f = fixture();
  const first = await importGitHubTicket(f.deps, human, await f.reviewed());
  expect(first.outcome).toBe("applied");
  const link = f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]!;
  const second = f.unitOfWork.run(human, ({ repository }) => repository.createConnectorConnection({ projectId: f.project.id, name: "Same Issue", provider: "github", owner: "owner", repository: "repo", authMode: "token" }));
  const input = { ...f.input, connectionId: second.id };
  const lookup = await lookupGitHubTicket(f.deps, human, input);
  expect(lookup.existingCardId).toBe(link.cardId);
  const result = await importGitHubTicket(f.deps, human, { ...await f.reviewed(), ...input, reviewEvidence: lookup.reviewEvidence });
  expect(result).toEqual({ outcome: "already_linked", cardId: link.cardId, url: remote.url });
  expect(f.repository.listCards(f.map.id)).toHaveLength(3);
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toEqual([link]);
});

it.each(["remote", "map", "connection", "release", "parent"] as const)("refuses changed %s evidence before importing a reviewed ticket", async (changed) => {
  const f = fixture();
  const input = await f.reviewed();
  if (changed === "remote") f.provider.getRemoteItem.mockResolvedValue({ status: "found", item: { ...remote, body: "Remote drift" } });
  else f.unitOfWork.run(human, ({ repository }) => {
    if (changed === "map") repository.updateStoryMap(f.map.id, { name: "Changed Map" });
    if (changed === "connection") repository.updateConnectorConnection(f.connection.id, { name: "Changed connection" });
    if (changed === "release") repository.updateRelease(f.release.id, { name: "Changed Release" });
    if (changed === "parent") repository.deleteCard(f.step.id, { strategy: "unassign" });
  });
  await expect(importGitHubTicket(f.deps, human, input)).rejects.toMatchObject({ code: "conflict" });
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toEqual([]);
  expect(f.repository.listChangeSets(f.project.id)).toEqual([]);
});

it("refuses reviewed evidence after actual Restore even when placement ids and versions recur", async () => {
  const f = fixture();
  const point = createRestorePoint(f.deps, human, f.project.id, "manual").restorePoint;
  const input = await f.reviewed();
  await restoreProject(f.deps, human, f.project.id, point.fileName);
  expect(f.repository.getSafetySettings(f.project.id).epoch).not.toBe(input.reviewEvidence.epoch);
  await expect(importGitHubTicket(f.deps, human, input)).rejects.toMatchObject({ code: "conflict" });
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toEqual([]);
});

it("rolls back Card, canonical ref, typed evidence and baseline when the transaction audit refuses insertion", async () => {
  const f = fixture();
  const input = await f.reviewed();
  const before = f.repository.getStoryMapSnapshot(f.map.id)!;
  const restoreFailure = rejectSqliteWrite(f.handle.current.$client, (sql, bindings) => /^insert into "activity_events"/i.test(sql) && bindings.includes("changeSet.operation.applied"), "Ticket audit insert refused");
  await expect(importGitHubTicket(f.deps, human, input)).rejects.toMatchObject({ code: "internal" });
  restoreFailure();
  const snapshot = f.repository.getStoryMapSnapshot(f.map.id)!;
  for (const key of ["cards", "externalRefs", "sourceLinks", "remoteWorkItemLinks"] as const) expect(snapshot[key]).toEqual(before[key]);
  expect(f.repository.listChangeSets(f.project.id)).toMatchObject([{ status: "proposed", source: "github" }]);
  expect(f.repository.listChangeSets(f.project.id)[0]!.execution).toBeUndefined();
});

it("ignores a cross-map source citation when looking for active ticket ownership", async () => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: f.project.id, name: "Original owner map" });
    const card = repository.createCard({ storyMapId: map.id, level: "activity", title: "Original Card" });
    const ref = repository.createGitHubLink({ cardId: card.id, repo: "owner/repo", issueNumber: 17, url: remote.url });
    repository.createCardSourceLink(f.step.id, { kind: "github", externalRefId: ref.id });
  });
  const lookup = await lookupGitHubTicket(f.deps, human, f.input);
  expect(lookup.existingCardId).toBeUndefined();
  const result = await importGitHubTicket(f.deps, human, { ...f.input, reviewEvidence: lookup.reviewEvidence, title: "Own target Card", description: remote.body });
  expect(result.outcome).toBe("applied");
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toHaveLength(1);
  expect(f.repository.listCards(f.map.id)).toHaveLength(3);
});

it("admits only one atomic owner when two reviewed imports race after provider lookup", async () => {
  const f = fixture();
  const input = await f.reviewed();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let arrivals = 0;
  f.provider.getRemoteItem.mockImplementation(async () => { if (++arrivals === 2) release(); await blocked; return { status: "found", item: remote }; });
  const results = await Promise.allSettled([importGitHubTicket(f.deps, human, input), importGitHubTicket(f.deps, human, input)]);
  expect(results.filter((result) => result.status === "fulfilled" && result.value.outcome === "applied")).toHaveLength(1);
  expect(f.repository.listCards(f.map.id)).toHaveLength(3);
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toHaveLength(1);
});

for (const stage of ["credentials", "provider"] as const) for (const changed of ["github", "agentAccess", "parent", "release", "restore"] as const) {
  it(`refuses pending import after ${changed} changes during ${stage}`, async () => {
    const f = fixture();
    const input = await f.reviewed();
    const point = changed === "restore" ? createRestorePoint(f.deps, human, f.project.id, "manual").restorePoint : undefined;
    const mutate = async () => {
      if (point) await restoreProject(f.deps, human, f.project.id, point.fileName);
      else f.unitOfWork.run(human, ({ repository }) => {
        if (changed === "github" || changed === "agentAccess") repository.updateSafetySettings(f.project.id, changed === "agentAccess" ? { agentMode: "off" } : { github: false });
        if (changed === "parent") repository.deleteCard(f.step.id, { strategy: "unassign" });
        if (changed === "release") repository.deleteRelease(f.release.id);
      });
    };
    if (stage === "credentials") vi.mocked(resolveProviderAuth).mockImplementationOnce(async (connection) => { await mutate(); return { connection, auth: {} }; });
    else f.provider.getRemoteItem.mockImplementationOnce(async () => { await mutate(); return { status: "found", item: remote }; });
    f.provider.getRemoteItem.mockClear();
    await expect(importGitHubTicket(f.deps, agent, input)).rejects.toMatchObject({ code: changed === "github" || changed === "agentAccess" ? "disabled" : "conflict" });
    expect(f.provider.getRemoteItem).toHaveBeenCalledTimes(stage === "credentials" ? 0 : 1);
    expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toEqual([]);
    expect(f.repository.listChangeSets(f.project.id)).toEqual([]);
  });
}

it.each([human, agent])("retains unprotected $actorType apply:false ticket imports as proposals", async (actor) => {
  const f = fixture();
  const result = await importGitHubTicket(f.deps, actor, await f.reviewed({ apply: false }));
  expect(result.outcome).toBe("proposed");
  expect(f.repository.listCards(f.map.id)).toHaveLength(2);
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toEqual([]);
});

it.each(["parent", "release", "map"] as const)("refuses separate human Apply when proposed ticket %s placement changed", async (changed) => {
  const f = fixture();
  const proposed = await importGitHubTicket(f.deps, human, await f.reviewed({ apply: false }));
  if (proposed.outcome === "already_linked") throw new Error("Expected proposal");
  f.unitOfWork.run(human, ({ repository }) => {
    if (changed === "parent") repository.updateCard(f.step.id, { title: "Changed parent after proposal" });
    if (changed === "release") repository.updateRelease(f.release.id, { name: "Changed Release after proposal" });
    if (changed === "map") repository.updateStoryMap(f.map.id, { name: "Changed Map after proposal" });
  });
  expect(() => { approveChangeSet(f.deps, human, proposed.changeSetId); applyChangeSet(f.deps, human, proposed.changeSetId); }).toThrow();
  expect(f.repository.listCards(f.map.id)).toHaveLength(2);
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toEqual([]);
  expect(f.repository.listExternalRefsForStoryMap(f.map.id)).toEqual([]);
});

it("keeps managed Annotation assignments in the same indivisible ticket import selection", async () => {
  const f = fixture();
  const annotation = f.unitOfWork.run(human, ({ repository }) => {
    repository.updateConnectorConnection(f.connection.id, { labelsAsAnnotations: true });
    return repository.createAnnotation({ projectId: f.project.id, storyMapId: f.map.id, name: "security" });
  });
  f.provider.getRemoteItem.mockResolvedValue({ status: "found", item: { ...remote, labels: ["security", "unmapped"] } });
  const proposed = await importGitHubTicket(f.deps, human, await f.reviewed({ apply: false }));
  if (proposed.outcome === "already_linked") throw new Error("Expected proposal");
  const card = proposed.changeSet.operations.find((operation) => operation.entity === "card" && operation.op === "create")!;
  const approved = approveChangeSet(f.deps, human, proposed.changeSetId, [card.operationId]);
  expect(approved.changeSet.approval!.selectedOperationIds).toEqual([]);
  approveChangeSet(f.deps, human, proposed.changeSetId);
  applyChangeSet(f.deps, human, proposed.changeSetId);
  expect(f.repository.listCardAnnotationsForStoryMap(f.map.id)).toMatchObject([{ annotationId: annotation.id }]);
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]?.baseline?.acknowledgedLocal.annotationLabels).toEqual(["security"]);
});

for (const releaseSource of ["milestone", "iteration"] as const) for (const selected of [true, false]) {
  it(`retains explicit ${selected ? "selected Release" : "Unscheduled"} through an unchanged ${releaseSource} Pull`, async () => {
    const f = fixture();
    f.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(f.connection.id, { releaseSource }));
    f.input.placement.releaseId = selected ? f.release.id : null;
    const item = { ...remote, milestoneDescription: "", milestoneState: "open", milestone: "Remote Release", milestoneNumber: 91, milestoneDueOn: "2026-12-14", iteration: { title: "Remote iteration", startDate: "2026-12-01", duration: 14 } };
    f.provider.getRemoteItem.mockResolvedValue({ status: "found", item });
    await importGitHubTicket(f.deps, human, await f.reviewed({ title: item.title, description: item.body }));
    const link = f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]!;
    const card = f.repository.getCardDetails(link.cardId!)!;
    const releases = f.repository.getStoryMapSnapshot(f.map.id)!.releases;
    expect(link.baseline?.pendingReleaseAssignment).toBe(false);
    const result = await pullStoryMapWorkItems(f.deps, human, { storyMapId: f.map.id, connectionIds: [f.connection.id] });
    expect(result.items).toMatchObject([{ status: "unchanged", cardId: card.id }]);
    expect(result.changeSet.operations.filter((operation) => operation.entity === "card" || operation.entity === "release")).toEqual([]);
    expect(f.repository.getCardDetails(card.id)).toEqual(card);
    expect(f.repository.getStoryMapSnapshot(f.map.id)!.releases).toEqual(releases);
    expect(getWorkItemSyncHealth(f.deps, human, f.map.id).links).toMatchObject([{ cardId: card.id, syncState: "synced" }]);
  });
}

it.each(["milestone", "iteration"] as const)("retains ordinary bulk %s first-assignment behavior", async (releaseSource) => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => repository.updateConnectorConnection(f.connection.id, { releaseSource }));
  const item = { ...remote, milestoneDescription: "", milestoneState: "open", milestone: "Remote Release", milestoneNumber: 91, milestoneDueOn: "2026-12-14", iteration: { title: "Remote iteration", startDate: "2026-12-01", duration: 14 } };
  f.provider.listRemoteItems.mockResolvedValue([item]);
  f.provider.getRemoteItem.mockResolvedValue({ status: "found", item });
  await importWorkItems(f.deps, human, { storyMapId: f.map.id, connectionId: f.connection.id });
  const link = f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]!;
  expect(link.baseline?.pendingReleaseAssignment).toBe(true);
  expect(f.repository.getCardDetails(link.cardId!)!.releaseId).toBeNull();
  await pullStoryMapWorkItems(f.deps, human, { storyMapId: f.map.id, connectionIds: [f.connection.id] });
  const card = f.repository.getCardDetails(link.cardId!)!;
  expect(f.repository.getRelease(card.releaseId!)?.name).toBe(releaseSource === "milestone" ? item.milestone : item.iteration.title);
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id).find((row) => row.cardId === card.id)?.baseline?.pendingReleaseAssignment).toBe(false);
});

it.each(["archive", "park"] as const)("refuses actual ticket Apply under a persisted %s ancestor without changing the immediate parent", async (hidden) => {
  const f = fixture();
  const proposed = await importGitHubTicket(f.deps, human, await f.reviewed({ apply: false }));
  if (proposed.outcome === "already_linked") throw new Error("Expected proposal");
  const parent = f.repository.getCardDetails(f.step.id);
  if (hidden === "archive") f.unitOfWork.run(human, ({ repository }) => repository.archiveCard(f.activity.id));
  else f.handle.current.$client.prepare("UPDATE cards SET parked = 1 WHERE id = ?").run(f.activity.id);
  expect(f.repository.getCardDetails(f.step.id)).toEqual(parent);
  const before = f.repository.getStoryMapSnapshot(f.map.id)!;
  expect(() => { approveChangeSet(f.deps, human, proposed.changeSetId); applyChangeSet(f.deps, human, proposed.changeSetId); }).toThrow();
  const after = f.repository.getStoryMapSnapshot(f.map.id)!;
  for (const key of ["cards", "releases", "externalRefs", "sourceLinks", "remoteWorkItemLinks"] as const) expect(after[key]).toEqual(before[key]);
  expect(f.repository.getChangeSet(proposed.changeSetId)?.execution).toBeUndefined();
  expect(f.repository.getWorkItemSyncHealthData(f.map.id).runs).toEqual([]);
});

it.each(["footer", "raw-prefixed-title"] as const)("retains authored %s bytes with synced normalized baselines and no unchanged-Pull Card effect", async (retained) => {
  const f = fixture();
  const title = retained === "raw-prefixed-title" ? "EXT-17: Authored issue" : remote.title;
  const item = { ...remote, title };
  f.provider.getRemoteItem.mockResolvedValue({ status: "found", item });
  const description = retained === "footer" ? buildGitHubIssueBody({ ...f.step, title, description: item.body }, f.map.name, { origin: "http://127.0.0.1:4317", projectId: f.project.id }) : item.body;
  await importGitHubTicket(f.deps, human, await f.reviewed({ title, description }));
  const link = f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]!;
  const card = f.repository.getCardDetails(link.cardId!)!;
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  expect(card).toMatchObject({ title, description });
  expect(link).toMatchObject({ bodyHash: hash(stripGitHubIssueFooter(description)), baseline: { acknowledgedLocal: { bodyHash: hash(stripGitHubIssueFooter(description)) }, observedRemote: { titleHash: hash(normalizeRemoteWorkItemTitle(item.title, title)) } } });
  expect(getWorkItemSyncHealth(f.deps, human, f.map.id).links).toMatchObject([{ cardId: card.id, syncState: "synced" }]);
  const result = await pullStoryMapWorkItems(f.deps, human, { storyMapId: f.map.id, connectionIds: [f.connection.id] });
  expect(result.items).toMatchObject([{ status: "unchanged" }]);
  expect(result.changeSet.operations.filter((operation) => operation.entity === "card")).toEqual([]);
  expect(f.repository.getCardDetails(card.id)).toEqual(card);
});

it("reads managed Annotation definitions once for an entire bulk operation batch", async () => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository }) => {
    repository.updateConnectorConnection(f.connection.id, { labelsAsAnnotations: true });
    repository.createAnnotation({ projectId: f.project.id, storyMapId: f.map.id, name: "security" });
  });
  const items = [17, 18, 19].map((number) => ({ ...remote, remoteId: String(number), remoteNumber: number, url: `https://github.com/owner/repo/issues/${number}`, labels: ["security"] }));
  const { beginGitHubPreparation } = await import("@storymapper/server/application/sync/github-command");
  const { importOperations } = await import("@storymapper/server/application/sync/github-import-command");
  const context = beginGitHubPreparation(f.deps, human, f.map.id, f.connection.id);
  const definitions = vi.spyOn(f.repository, "listAnnotations");
  const operations = importOperations(context, items);
  expect(definitions).toHaveBeenCalledTimes(1);
  expect(operations.filter((operation) => operation.entity === "cardAnnotation")).toHaveLength(3);
});

it("adopts Repository Closed status when no status is supplied, and stays healthy", async () => {
  const f = fixture();
  f.provider.getRemoteItem.mockResolvedValue({ status: "found", item: { ...remote, state: "closed" } });
  const { status: _status, ...request } = await f.reviewed();
  const result = await importGitHubTicket(f.deps, human, request);
  expect(result.outcome).toBe("applied");
  const snapshot = f.repository.getStoryMapSnapshot(f.map.id)!;
  const imported = snapshot.cards.find((card) => card.title === "Authored final title")!;
  expect(imported.status).toBe("Closed");
  expect(getWorkItemSyncHealth(f.deps, human, f.map.id)).toMatchObject({ stateCounts: { synced: 1, unsynced: 0 }, links: [{ cardId: imported.id, syncState: "synced" }] });
});

it("persists a nonzero reviewed position among existing siblings", async () => {
  const f = fixture();
  f.unitOfWork.run(human, ({ repository: tx }) => { tx.createCard({ storyMapId: f.map.id, title: "Sibling", level: "story", parentId: f.step.id, releaseId: f.release.id, position: 0 }); });
  f.input.placement = { ...f.input.placement, position: 1 };
  expect((await importGitHubTicket(f.deps, human, await f.reviewed())).outcome).toBe("applied");
  const cards = f.repository.getStoryMapSnapshot(f.map.id)!.cards.filter((card) => card.level === "story");
  expect(cards.find((card) => card.title === "Authored final title")!.position).toBe(1);
  expect(cards.find((card) => card.title === "Sibling")!.position).toBe(0);
});

it("binds the selected Release's GitHub milestone in the imported baseline", async () => {
  const f = fixture();
  const milestoneItem = { ...remote, remoteId: "18", remoteNumber: 18, url: "https://github.com/owner/repo/issues/18", milestoneDescription: "", milestoneState: "open", milestone: "Remote Release", milestoneNumber: 91, milestoneDueOn: "2026-12-14" };
  f.provider.listRemoteItems.mockResolvedValue([milestoneItem]);
  f.provider.getRemoteItem.mockResolvedValue({ status: "found", item: milestoneItem });
  await importWorkItems(f.deps, human, { storyMapId: f.map.id, connectionId: f.connection.id });
  await pullStoryMapWorkItems(f.deps, human, { storyMapId: f.map.id, connectionIds: [f.connection.id] });
  const linked = f.repository.getStoryMapSnapshot(f.map.id)!;
  const milestone = "https://github.com/owner/repo/milestone/91";
  const releaseId = f.repository.listExternalRefsForStoryMap(f.map.id).find((ref) => ref.entityType === "release" && ref.externalId === milestone)!.entityId;
  f.provider.getRemoteItem.mockResolvedValue({ status: "found", item: remote });
  f.input.placement = { ...f.input.placement, releaseId };
  expect((await importGitHubTicket(f.deps, human, await f.reviewed())).outcome).toBe("applied");
  const link = f.repository.getStoryMapSnapshot(f.map.id)!.remoteWorkItemLinks.find((row) => !linked.remoteWorkItemLinks.some((prior) => prior.id === row.id))!;
  expect(link.baseline?.acknowledgedLocal).toMatchObject({ releaseId, milestone });
});

it("reports a bare pull request number as a pull request", async () => {
  const f = fixture();
  f.provider.getRemoteItem.mockResolvedValue({ status: "found", item: { ...remote, url: "https://github.com/owner/repo/pull/17" } });
  await expect(lookupGitHubTicket(f.deps, human, f.input)).rejects.toMatchObject({ code: "validation", message: "#17 is a pull request, not an Issue." });
});

it("explains a connection without repository before provider access", async () => {
  const f = fixture();
  f.input.connectionId = f.unitOfWork.run(human, ({ repository: tx }) => tx.createConnectorConnection({ projectId: f.project.id, name: "Owner only", provider: "github", owner: "owner", authMode: "token" }).id);
  await expect(lookupGitHubTicket(f.deps, human, f.input)).rejects.toMatchObject({ code: "validation", message: expect.stringContaining("no repository") });
  expect(resolveProviderAuth).not.toHaveBeenCalled();
});

it.each(["description", "state"] as const)("refuses independent Milestone %s drift after ticket lookup without any proposal or binding", async (field) => {
  const f = fixture();
  const item = { ...remote, milestone: "Remote Release", milestoneNumber: 91, milestoneDescription: "Reviewed goal", milestoneState: "open" };
  f.provider.getRemoteItem.mockResolvedValue({ status: "found", item });
  const input = await f.reviewed();
  const before = f.repository.getStoryMapSnapshot(f.map.id);
  f.provider.getRemoteItem.mockResolvedValue({ status: "found", item: { ...item, ...(field === "description" ? { milestoneDescription: "Changed goal" } : { milestoneState: "closed" }) } });
  await expect(importGitHubTicket(f.deps, human, input)).rejects.toMatchObject({ code: "conflict" });
  expect(f.repository.getStoryMapSnapshot(f.map.id)).toEqual(before);
  expect(f.repository.listChangeSets(f.project.id)).toEqual([]);
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)).toEqual([]);
});
