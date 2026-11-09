import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { type GitHubStatusSource, type IncomingGitHubCommandResponse } from "@storymapper/contracts";
import { isCardCompleted, visibleCards } from "@storymapper/core";
import { actor, remotePushFixture } from "@storymapper/server/fixtures/remote-push-execution";
import { bindGitHubCard } from "@storymapper/server/application/github-link/github-card-binding";
import { approveChangeSet, applyChangeSet, rejectChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";
import { importWorkItems, syncWorkItems } from "@storymapper/server/services/work-item-sync";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { changedFieldsForRemote } from "@storymapper/server/services/sync-merge";
import { resolveGitHubConflictCommand } from "@storymapper/server/application/sync/github-conflict-command";
import { listGitHubStatusProjects } from "@storymapper/server/application/connector/connector.use-cases";
import { openStoryMapperDb } from "@storymapper/db";
import { statusFilterOptions } from "@storymapper/web/features/story-map/status-filters";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));

const source: GitHubStatusSource = { kind: "project", projectId: "project", projectName: "Delivery", fieldId: "status-field" };

function fixture() {
  vi.mocked(resolveProviderAuth).mockImplementation(async (connection) => ({ connection, auth: {} }));
  const f = remotePushFixture(2);
  f.unitOfWork.run(actor, ({ repository }) => repository.updateConnectorConnection(f.connection.id, { statusSource: source }));
  for (const [index, card] of f.cards.entries()) f.issues.push({ remoteId: String(index + 1), remoteNumber: index + 1, url: `https://github.com/reviewed/fixture/issues/${index + 1}`, title: card.title, body: card.description, state: "open", labels: ["status:review"], issueType: "Task", statusCatalog: { source, options: [{ id: "review", name: "In Review", position: 0, color: "BLUE" }] }, statusEvidence: { source, issueState: "open", membership: "present", optionId: "review", name: "In Review" } });
  const bind = (index: number, apply = true) => bindGitHubCard(f, actor, { cardId: f.cards[index]!.id, connectionId: f.connection.id, repo: "reviewed/fixture", url: f.issues[index]!.url, issueNumber: index + 1, apply });
  const sync = (apply = true) => syncWorkItems(f.repository, f.unitOfWork, actor, { storyMapId: f.map.id, connectionId: f.connection.id, cardIds: [f.cards[0]!.id], apply });
  return { ...f, bind, sync };
}

function proposal(result: unknown): IncomingGitHubCommandResponse { return result as IncomingGitHubCommandResponse; }

async function batchFixture() {
  const f = fixture();
  for (const index of [2, 3]) {
    const card = f.unitOfWork.run(actor, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "activity", title: `Issue ${index + 1}` }));
    f.cards.push(card);
    f.issues.push({ ...structuredClone(f.issues[0]!), remoteId: String(index + 1), remoteNumber: index + 1, url: `https://github.com/reviewed/fixture/issues/${index + 1}`, title: card.title, body: card.description });
  }
  for (const index of f.cards.keys()) await f.bind(index);
  return f;
}

it("resolves a legacy open status conflict through reviewed remote preview and apply", async () => {
  const f = fixture();
  await f.bind(0);
  f.issues[0]!.state = "closed";
  f.issues[0]!.statusEvidence!.issueState = "closed";
  const link = f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]!;
  const delta = changedFieldsForRemote(f.repository, f.repository.getConnectorConnection(f.connection.id)!, f.repository.getCard(f.cards[0]!.id)!, link, f.issues[0]!).status;
  const conflict = f.unitOfWork.run(actor, ({ repository }) => {
    const run = repository.createSyncRun({ storyMapId: f.map.id, connectionId: f.connection.id, mode: "sync", status: "applied" });
    return repository.createSyncConflict({ externalRefId: link.externalRefId, syncRunId: run.id, connectionId: f.connection.id, cardId: f.cards[0]!.id, remoteId: link.remoteId, field: "status", localValue: delta.localValue, remoteValue: delta.remoteValue });
  });
  const authCalls = vi.mocked(resolveProviderAuth).mock.calls.length;
  await expect(resolveGitHubConflictCommand(f, actor, conflict.id, { storyMapId: f.map.id, resolution: "local", apply: false, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } })).rejects.toThrow("GitHub owns this Card status");
  expect(resolveProviderAuth).toHaveBeenCalledTimes(authCalls);
  expect(f.provider.writeRemoteIssue).not.toHaveBeenCalled();
  const preview = await resolveGitHubConflictCommand(f, actor, conflict.id, { storyMapId: f.map.id, resolution: "remote", apply: false, reviewed: { localValue: conflict.localValue, remoteValue: conflict.remoteValue } });
  expect(f.repository.getSyncConflict(conflict.id)?.status).toBe("open");
  approveChangeSet(f, actor, preview.changeSetId);
  applyChangeSet(f, actor, preview.changeSetId);
  expect(f.repository.getSyncConflict(conflict.id)?.status).toBe("resolved-remote");
  expect(f.repository.getCard(f.cards[0]!.id)?.status).toBe("In Review");
  expect(f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]).toMatchObject({ syncState: "synced", statusEvidence: { issueState: "closed" } });
});

it("keeps unchanged status evidence bounded and refuses a stale cross-map rename target", async () => {
  const f = await batchFixture();
  const input = { storyMapId: f.map.id, connectionId: f.connection.id, cardIds: f.cards.map((card) => card.id), apply: false };
  for (let repeat = 0; repeat < 2; repeat++) {
    for (const issue of f.issues) issue.body += " incoming";
    const command = proposal(await syncWorkItems(f.repository, f.unitOfWork, actor, input));
    const links = command.changeSet.operations.filter((operation) => operation.entity === "remoteWorkItemLink");
    expect(links).toHaveLength(f.cards.length);
    expect(links.flatMap((operation) => operation.statusCardsBefore ?? [])).toEqual([]);
    approveChangeSet(f, actor, command.changeSetId); applyChangeSet(f, actor, command.changeSetId);
  }
  for (const issue of f.issues) { issue.statusCatalog!.options[0]!.name = "Renamed"; issue.statusEvidence!.name = "Renamed"; }
  const rename = proposal(await syncWorkItems(f.repository, f.unitOfWork, actor, input));
  const evidence = rename.changeSet.operations.flatMap((operation) => operation.entity === "remoteWorkItemLink" ? operation.statusCardsBefore ?? [] : []);
  expect(evidence.length).toBeLessThanOrEqual(2 * f.cards.length);
  expect(f.cards.map((card) => f.repository.getCard(card.id)!.status)).toEqual(f.cards.map(() => "In Review"));
  approveChangeSet(f, actor, rename.changeSetId); applyChangeSet(f, actor, rename.changeSetId);
  expect(f.cards.map((card) => f.repository.getCard(card.id)!.status)).toEqual(f.cards.map(() => "Renamed"));
  const other = f.unitOfWork.run(actor, ({ repository }) => {
    const map = repository.createStoryMap({ projectId: f.project.id, name: "Other map" });
    repository.deleteGitHubLink(repository.listRemoteWorkItemLinksForStoryMap(f.map.id).find((link) => link.cardId === f.cards[1]!.id)!.externalRefId);
    return repository.createCard({ storyMapId: map.id, level: "activity", title: "Other Issue" }).id;
  });
  await bindGitHubCard(f, actor, { cardId: other, connectionId: f.connection.id, repo: "reviewed/fixture", url: f.issues[1]!.url, apply: true });
  f.issues[0]!.statusCatalog!.options[0]!.name = "Renamed again"; f.issues[0]!.statusEvidence!.name = "Renamed again";
  const stale = proposal(await f.sync(false));
  f.unitOfWork.run(actor, ({ repository }) => repository.updateCard(other, { title: "Edited after rename review" }));
  approveChangeSet(f, actor, stale.changeSetId);
  expect(() => applyChangeSet(f, actor, stale.changeSetId)).toThrow(/changed|conflict/i);
  expect(f.repository.getCard(other)?.status).toBe("Renamed");
});

it.each([false, true])("compacts shared rename evidence during imports and refuses inconsistent catalogs=%s", async (inconsistent) => {
  const f = await batchFixture();
  const incoming = f.issues.map((issue, index) => {
    const item = structuredClone(issue);
    item.remoteId = String(index + 101); item.remoteNumber = index + 101; item.url = `https://github.com/reviewed/fixture/issues/${index + 101}`;
    const name = inconsistent ? `Name ${index}` : "Renamed by import";
    item.statusCatalog!.options[0]!.name = name; item.statusEvidence!.name = name;
    return item;
  });
  f.provider.listRemoteItems.mockResolvedValue(incoming);
  const before = f.repository.listCards(f.map.id), changes = f.repository.listChangeSets(f.project.id);
  const command = importWorkItems(f.repository, f.unitOfWork, actor, { storyMapId: f.map.id, connectionId: f.connection.id, apply: false });
  if (inconsistent) {
    await expect(command).rejects.toThrow(/catalog changed/);
    expect(f.repository.listCards(f.map.id)).toEqual(before);
    expect(f.repository.listChangeSets(f.project.id)).toEqual(changes);
    return;
  }
  const result = proposal(await command);
  expect(result.changeSet.operations.flatMap((operation) => operation.entity === "remoteWorkItemLink" ? operation.statusCardsBefore ?? [] : []).length).toBeLessThanOrEqual(2 * incoming.length);
  approveChangeSet(f, actor, result.changeSetId); applyChangeSet(f, actor, result.changeSetId);
  expect(f.cards.map((card) => f.repository.getCard(card.id)!.status)).toEqual(f.cards.map(() => "Renamed by import"));
});

it("retires non-selected source choices while retaining assigned historical identity without changing Cards", async () => {
  const f = fixture();
  f.issues[0]!.statusCatalog!.options.push({ id: "unused", name: "Unused", position: 1 });
  await f.bind(0);
  const before = f.repository.listCards(f.map.id);
  f.unitOfWork.run(actor, ({ repository }) => repository.updateConnectorConnection(f.connection.id, { statusSource: { kind: "repository" } }));
  const snapshot = f.repository.getStoryMapSnapshot(f.map.id)!;
  expect(snapshot.cards).toEqual(before);
  expect(snapshot.githubStatusCatalogs![0]!.catalog.options.every((option) => option.retired)).toBe(true);
  expect(statusFilterOptions(snapshot).map((option) => option.name)).toContain("In Review · Reviewed · Delivery");
  expect(statusFilterOptions(snapshot).map((option) => option.name)).not.toContain("Unused · Reviewed · Delivery");
  expect(statusFilterOptions(snapshot).some((option) => option.name.includes("No status"))).toBe(false);
});

it.each(["safety", "database"] as const)("refuses Project discovery after %s changes while resolving credentials", async (change) => {
  const f = fixture();
  f.provider.listStatusProjects = vi.fn(async () => []);
  const original = f.handle.current;
  const replacement = openStoryMapperDb(":memory:");
  vi.mocked(resolveProviderAuth).mockImplementationOnce(async (connection) => {
    if (change === "safety") f.unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(f.project.id, { github: false }));
    else f.handle.current = replacement;
    return { connection, auth: {} };
  });
  try {
    await expect(listGitHubStatusProjects(f, actor, f.connection)).rejects.toMatchObject({ code: "conflict" });
    expect(f.provider.listStatusProjects).not.toHaveBeenCalled();
  } finally { f.handle.current = original; replacement.$client.close(); }
});

  it("adopts catalog and Card status together and refuses local and forged ChangeSet writes", async () => {
    const f = fixture();
    const preview = await f.bind(0, false);
    expect(f.repository.getCard(f.cards[0]!.id)!.status).toBe("todo");
    expect(f.repository.getConnectorConnection(f.connection.id)!.statusCatalogs).toEqual([]);
    approveChangeSet(f, actor, preview.changeSetId);
    applyChangeSet(f, actor, preview.changeSetId);
    expect(f.repository.getCard(f.cards[0]!.id)!.status).toBe("In Review");
    expect(f.repository.getConnectorConnection(f.connection.id)!.statusCatalogs).toMatchObject([{ options: [{ id: "review", name: "In Review", color: "BLUE" }] }]);
    expect(() => f.unitOfWork.run(actor, ({ repository }) => repository.updateCard(f.cards[0]!.id, { status: "done" }))).toThrow(/GitHub owns/);
    expect(() => f.unitOfWork.run(actor, ({ repository }) => repository.bulkUpdateCards({ storyMapId: f.map.id, cardIds: f.cards.map((card) => card.id), patch: { status: "done" } }))).toThrow(/GitHub owns/);
    const forged = preview.changeSet.operations.find((operation) => operation.entity === "remoteWorkItemLink")!;
    expect(() => f.unitOfWork.run(actor, ({ repository }) => repository.createChangeSet({ id: randomUUID(), projectId: f.project.id, title: "Forged GitHub status", source: "github", operations: [forged], createdAt: new Date().toISOString() }))).toThrow(/trusted remote preparation/);
  });

  it("rejects and stales previews without partial catalog or Card updates", async () => {
    const f = fixture();
    await f.bind(0);
    f.issues[0]!.statusCatalog!.options[0]!.name = "Released";
    f.issues[0]!.statusEvidence!.name = "Released";
    const rejected = proposal(await f.sync(false));
    rejectChangeSet(f, actor, rejected.changeSetId);
    expect(f.repository.getCard(f.cards[0]!.id)!.status).toBe("In Review");
    const stale = proposal(await f.sync(false));
    f.unitOfWork.run(actor, ({ repository }) => repository.updateCard(f.cards[0]!.id, { title: "Changed after preview" }));
    approveChangeSet(f, actor, stale.changeSetId);
    expect(() => applyChangeSet(f, actor, stale.changeSetId)).toThrow(/conflict|changed/i);
    expect(f.repository.getConnectorConnection(f.connection.id)!.statusCatalogs![0]!.options[0]!.name).toBe("In Review");
  });

  it("updates renamed identities across maps while preserving local and other-source names", async () => {
    const f = fixture();
    const other = f.unitOfWork.run(actor, ({ repository }) => {
      const map = repository.createStoryMap({ projectId: f.project.id, name: "Second map" });
      const card = repository.createCard({ storyMapId: map.id, level: "activity", title: "Second Issue" });
      const local = repository.createCard({ storyMapId: f.map.id, level: "activity", title: "Local", status: "In Review" });
      return { card, local };
    });
    await f.bind(0);
    await bindGitHubCard(f, actor, { cardId: other.card.id, connectionId: f.connection.id, repo: "reviewed/fixture", url: f.issues[1]!.url, apply: true });
    f.issues[0]!.statusCatalog!.options[0]!.name = "Archived";
    f.issues[0]!.statusEvidence!.name = "Archived";
    await f.sync();
    expect(f.repository.getCard(other.card.id)!.status).toBe("Archived");
    expect(f.repository.getCard(other.local.id)!.status).toBe("In Review");
    expect(visibleCards(f.repository.listCards(f.map.id)).some((card) => card.id === f.cards[0]!.id)).toBe(true);
    const before = f.repository.getCard(f.cards[0]!.id)!;
    await f.sync();
    expect(f.repository.getCard(before.id)).toEqual(before);
  });

  it("keeps Issue closure, absent membership and explicit archiving independent", async () => {
    const f = fixture();
    await f.bind(0);
    f.unitOfWork.run(actor, ({ repository }) => repository.archiveCard(f.cards[0]!.id));
    f.issues[0]!.state = "closed";
    f.issues[0]!.statusEvidence!.issueState = "closed";
    await f.sync();
    const card = f.repository.getCard(f.cards[0]!.id)!;
    expect(card).toMatchObject({ archived: true, status: "In Review" });
    expect(isCardCompleted(card, f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id))).toBe(true);
    f.issues[0]!.state = "open";
    f.issues[0]!.statusEvidence = { source, issueState: "open", membership: "missing", optionId: null, name: null };
    await f.sync();
    expect(f.repository.getCard(card.id)).toMatchObject({ archived: true, status: "No status" });
    const link = f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]!;
    f.unitOfWork.run(actor, ({ repository }) => repository.deleteGitHubLink(link.externalRefId));
    expect(f.repository.getCard(card.id)!.status).toBe("No status");
    expect(f.unitOfWork.run(actor, ({ repository }) => repository.updateCard(card.id, { archived: false, status: "active" }))!.status).toBe("active");
  });

  it("preserves existing data on permission and incomplete Project evidence failures", async () => {
    const f = fixture();
    await f.bind(0);
    const before = { cards: f.repository.listCards(f.map.id), links: f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id), connection: f.repository.getConnectorConnection(f.connection.id) };
    f.provider.getRemoteItem.mockRejectedValueOnce(new Error("Permission denied"));
    await expect(f.sync()).rejects.toThrow();
    expect({ cards: f.repository.listCards(f.map.id), links: f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id), connection: f.repository.getConnectorConnection(f.connection.id) }).toEqual(before);
    delete f.issues[0]!.statusCatalog;
    await expect(f.sync()).rejects.toThrow(/incomplete/i);
    expect({ cards: f.repository.listCards(f.map.id), links: f.repository.listRemoteWorkItemLinksForStoryMap(f.map.id), connection: f.repository.getConnectorConnection(f.connection.id) }).toEqual(before);
  });
