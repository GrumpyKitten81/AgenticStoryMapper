import { expect, it, vi } from "vitest";
import { DomainError } from "@storymapper/contracts";
import { actor, remotePushFixture } from "@storymapper/server/fixtures/remote-push-execution";
import { createGitHubLink } from "@storymapper/server/application/github-link/github-link.use-cases";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { importSyncBaseline } from "@storymapper/server/services/sync-merge";
import { pullStoryMapWorkItems, syncWorkItems } from "@storymapper/server/services/work-item-sync";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));

function fixture() {
  vi.mocked(resolveProviderAuth).mockImplementation(async (connection) => ({ connection, auth: {} }));
  const data = remotePushFixture(3);
  const connections = data.unitOfWork.run(actor, ({ repository }) => [data.connection, ...["Second", "Third"].map((name) => repository.createConnectorConnection({ projectId: data.project.id, provider: "github", owner: "reviewed", repository: "fixture", name, authMode: "token", readOnly: false }))]);
  for (const [index, card] of data.cards.entries()) {
    const remote = { remoteId: String(index + 1), remoteNumber: index + 1, url: `https://github.com/reviewed/fixture/issues/${index + 1}`, title: card.title, body: card.description, state: "open", labels: [], issueType: "Task", milestoneDescription: "", milestoneState: "open", milestone: "Release 1", milestoneNumber: 10, milestoneDueOn: "2026-11-01T00:00:00Z" };
    data.issues.push(remote);
    data.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ connectionId: connections[index]!.id, provider: "github", cardId: card.id, remoteId: remote.remoteId, url: remote.url, labels: [], baseline: importSyncBaseline(connections[index]!, remote, card.status), syncState: "synced" }));
  }
  return { ...data, connections };
}

it.each(["auth", "revalidate", "operations"] as const)("retains every source result when combined incoming %s preparation fails", async (phase) => {
  const data = fixture();
  if (phase === "operations") data.issues[1]!.milestone = "Disagreeing Release";
  else vi.mocked(resolveProviderAuth).mockImplementation(async (connection) => {
    if (connection.id === data.connections[1]!.id) {
      if (phase === "auth") throw new DomainError("validation", "Credentials unavailable.");
      data.unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(data.project.id, { github: false }));
    }
    return { connection, auth: {} };
  });
  const before = data.repository.listCards(data.map.id);
  await expect(pullStoryMapWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id })).rejects.toMatchObject({ details: { items: [{ status: "not_attempted", cardId: data.cards[0]!.id }, { status: "failed", cardId: data.cards[1]!.id }, { status: "not_attempted", cardId: data.cards[2]!.id }] } });
  expect(data.repository.listCards(data.map.id)).toEqual(before);
  expect(data.repository.listReleases(data.map.id)).toEqual([]);
  expect(data.repository.listChangeSets(data.project.id)).toEqual([]);
});

it.each([false, true])("marks an incoming run failed with all-ineligible selection=%s", async (allIneligible) => {
  const data = fixture();
  const result = await syncWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [...(allIneligible ? [] : [data.cards[0]!.id]), data.cards[1]!.id] });
  expect(result.items).toEqual(expect.arrayContaining([expect.objectContaining({ status: "failed", cardId: data.cards[1]!.id })]));
  expect(data.repository.getWorkItemSyncHealthData(data.map.id).runs).toMatchObject([{ status: "failed" }]);
});

it("coalesces identical shared Milestone updates and exact binding baselines across the combined batch", async () => {
  const data = fixture();
  await syncWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.cards[0]!.id] });
  const releaseId = data.repository.getCard(data.cards[0]!.id)!.releaseId!;
  for (const item of data.issues) { item.milestone = "Release 2"; item.milestoneDueOn = "2026-11-02T00:00:00Z"; }
  const result = await pullStoryMapWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, apply: false });
  expect(result.changeSet.operations.filter((operation) => operation.entity === "release" && operation.op === "update")).toHaveLength(1);
  expect(result.changeSet.operations.filter((operation) => operation.entity === "remoteWorkItemLink" && operation.before?.releaseId === releaseId)).toHaveLength(1);
  const applied = await pullStoryMapWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id });
  expect(applied.outcome).toBe("applied");
  expect(data.repository.getRelease(releaseId)).toMatchObject({ name: "Release 2", releaseDate: "2026-11-02" });
  expect(data.repository.listCards(data.map.id).map((card) => card.releaseId)).toEqual([releaseId, releaseId, releaseId]);
});

it("refuses different metadata for a public source-only canonical Release without last-winning updates", async () => {
  const data = fixture();
  const release = data.unitOfWork.run(actor, ({ repository }) => repository.createRelease({ storyMapId: data.map.id, name: "Local Release" }));
  createGitHubLink(data, actor, { releaseId: release.id, repo: "reviewed/fixture", url: "https://github.com/reviewed/fixture/milestone/10" });
  const before = data.repository.getRelease(release.id);
  expect(data.repository.listRemoteWorkItemLinksForStoryMap(data.map.id).some((row) => row.releaseId === release.id)).toBe(false);
  data.issues[1]!.milestone = "Disagreeing Release";
  await expect(pullStoryMapWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id })).rejects.toMatchObject({ code: "conflict", details: { items: [{ status: "not_attempted" }, { status: "failed" }, { status: "not_attempted" }] } });
  expect(data.repository.getRelease(release.id)).toEqual(before);
  expect(data.repository.listCards(data.map.id).every((card) => card.releaseId === null)).toBe(true);
});

it("retains ineligible selected failures alongside an authentication preparation failure", async () => {
  const data = fixture();
  vi.mocked(resolveProviderAuth).mockRejectedValue(new DomainError("validation", "Credentials unavailable."));
  await expect(syncWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, cardIds: [data.cards[0]!.id, data.cards[1]!.id] })).rejects.toMatchObject({ details: { items: [{ status: "failed", cardId: data.cards[0]!.id, message: "Credentials unavailable." }, { status: "failed", cardId: data.cards[1]!.id, code: "not_found" }] } });
  expect(data.repository.listChangeSets(data.project.id)).toEqual([]);
});

it.each(["agentAccess", "github"] as const)("refuses %s admission before exposing linked source identities", async (setting) => {
  const data = fixture();
  data.unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(data.project.id, setting === "agentAccess" ? { agentMode: "off" } : { github: false }));
  const requester = setting === "agentAccess" ? { actorType: "agent" as const, actorId: "disabled-agent" } : actor;
  const pending = pullStoryMapWorkItems(data.repository, data.unitOfWork, requester, { storyMapId: data.map.id });
  await expect(pending).rejects.toMatchObject({ code: "disabled" });
  await expect(pending).rejects.not.toHaveProperty("details.items");
  expect(resolveProviderAuth).not.toHaveBeenCalled();
  expect(data.provider.getRemoteItem).not.toHaveBeenCalled();
});

it("limits incoming Sync to Cards in the requested Release and reports other selected Cards as not eligible", async () => {
  const data = remotePushFixture(2);
  const release = data.unitOfWork.run(actor, ({ repository }) => {
    const created = repository.createRelease({ storyMapId: data.map.id, name: "Scoped" });
    repository.updateCard(data.cards[0]!.id, { releaseId: created.id });
    return created;
  });
  for (const [index, card] of data.cards.entries()) {
    const remote = { remoteId: String(index + 1), remoteNumber: index + 1, url: `https://github.com/reviewed/fixture/issues/${index + 1}`, title: card.title, body: card.description, state: "open", labels: [], issueType: "Task" };
    data.issues.push(remote);
    data.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ connectionId: data.connection.id, provider: "github", cardId: card.id, remoteId: remote.remoteId, url: remote.url, labels: [], baseline: importSyncBaseline(data.connection, remote, card.status), syncState: "synced" }));
  }
  const scoped = await syncWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, releaseId: release.id, apply: false });
  expect(scoped.items.map((item) => item.cardId)).toEqual([data.cards[0]!.id]);
  expect(data.provider.getRemoteItem.mock.calls.map((call) => call[2])).toEqual(["1"]);
  const outside = await syncWorkItems(data.repository, data.unitOfWork, actor, { storyMapId: data.map.id, connectionId: data.connection.id, releaseId: release.id, cardIds: [data.cards[1]!.id], apply: false });
  expect(outside.items).toMatchObject([{ status: "failed", code: "not_found", cardId: data.cards[1]!.id }]);
});
