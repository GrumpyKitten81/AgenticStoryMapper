import { stripGitHubIssueFooter } from "@storymapper/core";
import type { Card, ConnectorConnection, RemoteWorkItemLink, WorkItemSyncHealthData } from "@storymapper/contracts";
import { buildGitHubIssueBody, buildGitHubSyncHealthReport, buildWorkItemSyncHealthReport, sameSyncStatusLabels } from "@storymapper/core";
import { describe, expect, it } from "vitest";

const timestamp = "2026-10-07T12:00:00.000Z";
const hash = (text: string): string => `hash:${text}`;
function fixture(): WorkItemSyncHealthData {
  const card: Card = { id: "card", key: "MAP-1", storyMapId: "map", parentId: null, releaseId: "release", version: 1, creationOrigin: "manual", provenance: "manual", level: "story", title: "Story", description: "Raw body", position: 0, status: "todo", parked: false, createdAt: timestamp, updatedAt: timestamp };
  const connection: ConnectorConnection = { id: "connection", projectId: "project", provider: "github", name: "GitHub", owner: "owner", repository: "repo", authMode: "token", defaultLabel: "local-story-map", readOnly: true, statusMapping: [{ localStatus: "todo", remoteState: "open", labels: ["ready"] }, { localStatus: "doing", remoteState: "open", labels: ["in-progress"] }], typeMapping: [], issueTypeMapping: [], releaseSource: "milestone", iterationFieldName: "Iteration", labelsAsAnnotations: false, createdAt: timestamp, updatedAt: timestamp };
  const link: RemoteWorkItemLink = { id: "link", externalRefId: "ref", remoteNumber: 1, connectionId: connection.id, provider: "github", cardId: card.id, remoteId: "1", url: "https://github.com/owner/repo/issues/1", titleHash: hash(card.title), bodyHash: hash(stripGitHubIssueFooter(buildGitHubIssueBody(card, "Map", { origin: "http://127.0.0.1:4317", projectId: "project" }))), remoteState: "open", labels: ["ready", "external-label"], milestone: "MVP", parentOverrideLocal: false, syncState: "synced", lastSyncedAt: timestamp };
  link.baseline = { pendingReleaseAssignment: false, acknowledgedLocal: { releaseMetadata: { name: "MVP", goal: "", released: false, startDate: null, releaseDate: null }, titleHash: hash(card.title), bodyHash: hash(card.description), remoteState: "open", statusLabels: ["ready"], annotationLabels: [], releaseId: card.releaseId, milestone: "https://github.com/owner/repo/milestone/1" }, observedRemote: { releaseMetadata: { name: "MVP", goal: "", released: false, startDate: null, releaseDate: null }, titleHash: hash(card.title), bodyHash: hash(card.description), remoteState: "open", statusLabels: ["ready"], annotationLabels: [], milestone: "https://github.com/owner/repo/milestone/1" } };
  return { annotations: [], cardAnnotations: [], storyMap: { id: "map", projectId: "project", name: "Map", estimationUnit: "points", cardKeyPrefix: "MAP", version: 1, createdAt: timestamp, updatedAt: timestamp }, cards: [card], releases: [{ id: "release", storyMapId: "map", version: 1, name: "MVP", goal: "", position: 0, startDate: null, releaseDate: null, released: false }], connections: [connection], links: [link], runs: [], openConflicts: [], deletedRefs: [] };
}

describe("pure sync health calculations", () => {
  registerPreservesExplicitlySyncedCurrentSchemaReleaseBindingsWithoutA();

  registerRetainsUnacknowledgedLinksAsUnsyncedWhenNoCanonicalComparison();

  registerRetainsProvenRemoteDeletionInTheSameCountedInventory();

  registerLetsDurableCanonicalConflictsOutrankSynchronizedStateAndLocal();

  registerCountsTypedDeletedOwnersOnceAndRetainsHistoricalNavigation();
  registerComparesCanonicalRawAndAlreadyFormattedDescriptionsWithoutMutating();

  it("keeps GitHub-owned status independent of obsolete local status mappings", () => {
    const data = fixture();
    data.cards[0]!.status = "doing";
    expect(buildWorkItemSyncHealthReport(data, hash)).toMatchObject({ stateCounts: { synced: 1, unsynced: 0 }, staleLinks: [] });
    expect(sameSyncStatusLabels(data.connections[0]!, ["ready", "external-label"], ["ready"])).toBe(true);
    expect(sameSyncStatusLabels(data.connections[0]!, ["ready"], ["in-progress"])).toBe(false);
  });

  it.each(["rename", "remove"] as const)("tracks Release assignment by stable identity after a milestone %s", (change) => {
    const data = fixture();
    if (change === "rename") data.releases[0]!.name = "Renamed milestone";
    else data.cards[0]!.releaseId = null;
    expect(buildWorkItemSyncHealthReport(data, hash).links[0]?.syncState).toBe("unsynced");
  });

  it.each(["add", "remove"] as const)("marks only the linked Card stale after a managed Annotation assignment %s", (change) => {
    const data = fixture();
    data.connections[0]!.labelsAsAnnotations = true;
    data.annotations.push({ id: "managed", projectId: "project", storyMapId: "map", name: "risk", icon: "tag", color: "#eef2ff", position: 0 });
    if (change === "remove") data.links[0]!.baseline!.acknowledgedLocal.annotationLabels = ["risk"];
    else data.cardAnnotations.push({ id: "assignment", cardId: "card", annotationId: "managed", createdAt: timestamp });
    const report = buildWorkItemSyncHealthReport(data, hash);
    expect(report.links).toMatchObject([{ id: "link", syncState: "unsynced" }]);
    expect(report.stateCounts).toMatchObject({ synced: 0, unsynced: 1 });
    expect(report.staleLinks).toEqual([]);
  });

  it("uses the canonical Release acknowledgment across connections without manufacturing local metadata divergence", testUsesTheCanonicalReleaseAcknowledgmentAcrossConnectionsWithoutManufacturingLocalMetadata);

  it.each(["parked", "archived"] as const)("excludes links beneath a %s ancestor from both reports", (visibility) => {
    const data = fixture();
    data.cards[0]!.parentId = "ancestor";
    data.cards.push({ ...data.cards[0]!, id: "ancestor", parentId: null, level: "activity", parked: visibility === "parked", status: visibility === "archived" ? "archived" : "todo" });
    expect(buildWorkItemSyncHealthReport(data, hash)).toMatchObject({ totalLinks: 0, links: [], staleLinks: [] });
    expect(buildGitHubSyncHealthReport({ storyMapId: "map", cards: data.cards, links: data.links.map((link) => ({ ...link, releaseId: link.releaseId ?? undefined, milestone: link.milestone ?? undefined, repo: "owner/repo" })) })).toMatchObject({ totalLinks: 0, links: [] });
  });
});

function registerComparesCanonicalRawAndAlreadyFormattedDescriptionsWithoutMutating() {
  it("compares canonical raw and already formatted descriptions without mutating input", () => {
    const data = fixture();
    const before = structuredClone(data);
    expect(buildWorkItemSyncHealthReport(data, hash).stateCounts).toMatchObject({ synced: 1, stale: 0 });
    expect(data).toEqual(before);
    data.cards[0]!.description = buildGitHubIssueBody(data.cards[0]!, data.storyMap.name, { origin: "http://127.0.0.1:4317", projectId: "project" });
    expect(buildWorkItemSyncHealthReport(data, hash).links[0]?.syncState).toBe("synced");
  });
}

function registerCountsTypedDeletedOwnersOnceAndRetainsHistoricalNavigation() {
  it("counts typed deleted owners once and retains historical navigation without inventing a live binding", () => {
    const data = fixture();
    data.cards = [];
    data.links = [];
    const evidence = { reason: "entity-deleted" as const, projectId: "project", storyMapId: "map", entityType: "card" as const, entityId: "deleted-card", before: { id: "deleted-ref", entityType: "card" as const, entityId: "deleted-card", scopeId: "map", system: "github", externalId: "https://github.com/owner/repo/issues/9", syncedVersion: 1, createdAt: timestamp } };
    data.deletedRefs = [evidence, evidence];
    const report = buildWorkItemSyncHealthReport(data, hash);
    expect(report).toMatchObject({ totalLinks: 1, links: [], stateCounts: { local_deleted: 1 }, deletedLocalLinks: [{ entityId: "deleted-card", storyMapId: "map", url: evidence.before.externalId }] });
    expect(report.deletedLinks).toEqual(report.deletedLocalLinks);
    expect(report.deletedLocalLinks[0]).not.toHaveProperty("cardId");
    expect(report.deletedLocalLinks[0]).not.toHaveProperty("connectionId");
  });
}

function registerLetsDurableCanonicalConflictsOutrankSynchronizedStateAndLocal() {
  it("lets durable canonical conflicts outrank synchronized state and local divergence", () => {
    const data = fixture();
    data.cards[0]!.title = "Unacknowledged local title";
    data.openConflicts = [{ id: "conflict", externalRefId: "ref", syncRunId: "run", connectionId: "connection", cardId: "card", remoteId: "1", field: "title", localValue: "Original", remoteValue: "Reviewed", status: "open", createdAt: timestamp }];
    const report = buildWorkItemSyncHealthReport(data, hash);
    expect(report).toMatchObject({ totalLinks: 1, links: [{ syncState: "conflict" }], stateCounts: { synced: 0, unsynced: 0, conflict: 1 }, openConflicts: data.openConflicts });
    data.openConflicts = [];
    expect(buildWorkItemSyncHealthReport(data, hash).links[0]?.syncState).toBe("unsynced");
    data.links[0]!.syncState = "stale";
    expect(buildWorkItemSyncHealthReport(data, hash)).toMatchObject({ links: [{ syncState: "stale", lastSyncedAt: timestamp }], stateCounts: { stale: 1, remote_deleted: 0 } });
  });
}

function registerRetainsProvenRemoteDeletionInTheSameCountedInventory() {
  it("retains proven remote deletion in the same counted inventory as typed local deletion", () => {
    const data = fixture();
    const link = data.links[0]!;
    link.syncState = "remote_deleted";
    data.cards[0]!.description = "Independent local divergence";
    data.deletedRefs = [{ reason: "entity-deleted", projectId: "project", storyMapId: "map", entityType: "card", entityId: "deleted-card", before: { id: "deleted-ref", entityType: "card", entityId: "deleted-card", scopeId: "map", system: "github", externalId: "https://github.com/owner/repo/issues/9", syncedVersion: 1, createdAt: timestamp } }];
    const report = buildWorkItemSyncHealthReport(data, hash);
    expect(report).toMatchObject({ totalLinks: 2, stateCounts: { remote_deleted: 1, local_deleted: 1, synced: 0, unsynced: 0 }, links: [{ id: link.id, externalRefId: link.externalRefId, syncState: "remote_deleted", url: link.url }], deletedLocalLinks: [{ entityId: "deleted-card" }] });
    expect(report.deletedLinks).toEqual([...report.links, ...report.deletedLocalLinks]);
    expect(Object.values(report.stateCounts).reduce((sum, count) => sum + count, 0)).toBe(report.totalLinks);
  });
}

function registerRetainsUnacknowledgedLinksAsUnsyncedWhenNoCanonicalComparison() {
  it("retains unacknowledged links as unsynced when no canonical comparison can establish synchronization", () => {
    const data = fixture();
    const link = data.links[0]!;
    delete link.baseline;
    delete link.titleHash;
    delete link.bodyHash;
    link.syncState = "unsynced";
    expect(buildWorkItemSyncHealthReport(data, hash)).toMatchObject({ totalLinks: 1, stateCounts: { unsynced: 1, synced: 0 }, links: [{ id: link.id, externalRefId: link.externalRefId, syncState: "unsynced" }] });
    link.titleHash = hash(data.cards[0]!.title);
    link.bodyHash = hash(data.cards[0]!.description);
    expect(buildWorkItemSyncHealthReport(data, hash).links[0]?.syncState).toBe("unsynced");
  });
}

function registerPreservesExplicitlySyncedCurrentSchemaReleaseBindingsWithoutA() {
  it("preserves explicitly synced current-schema Release bindings without a comparison baseline", () => {
    const data = fixture();
    const { cardId: _cardId, baseline: _baseline, titleHash: _titleHash, bodyHash: _bodyHash, ...link } = data.links[0]!;
    data.links = [{ ...link, releaseId: "release", url: "https://github.com/owner/repo/milestone/1", syncState: "synced" }];
    expect(buildWorkItemSyncHealthReport(data, hash)).toMatchObject({ totalLinks: 1, stateCounts: { synced: 1, unsynced: 0 }, links: [{ id: link.id, releaseId: "release", syncState: "synced" }] });
  });
}

function testUsesTheCanonicalReleaseAcknowledgmentAcrossConnectionsWithoutManufacturingLocalMetadata() {
  const data = fixture();
  const cardLink = data.links[0]!;
  const owner = { ...data.connections[0]!, id: "release-owner" };
  data.connections.push(owner);
  data.releases[0]!.name = "Accepted remote rename";
  const baseline = structuredClone(cardLink.baseline!);
  baseline.acknowledgedLocal.releaseMetadata!.name = "Accepted remote rename";
  baseline.observedRemote.releaseMetadata!.name = "Accepted remote rename";
  const { cardId: _cardId, ...releaseLink } = cardLink;
  data.links.push({ ...releaseLink, id: "release-link", externalRefId: "release-ref", connectionId: owner.id, releaseId: "release", remoteId: "1", url: "https://github.com/owner/repo/milestone/1", baseline });
  expect(buildWorkItemSyncHealthReport(data, hash).links.find((row) => row.id === cardLink.id)!.syncState).toBe("synced");
  data.releases[0]!.name = "New local rename";
  expect(buildWorkItemSyncHealthReport(data, hash).links.find((row) => row.id === cardLink.id)!.syncState).toBe("unsynced");
}
