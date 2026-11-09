import { parseWorkItemLocator } from "@storymapper/contracts";
import type { Card, ConnectorConnection, DeletedLocalSyncLink, GitHubSyncHealthData, GitHubSyncHealthReport, RemoteWorkItemLink, TextHasher, WorkItemSyncHealthData, WorkItemSyncHealthReport } from "@storymapper/contracts";
import { stripGitHubIssueFooter, visibleCards, syncStatusLabels, managedAnnotationDefinitions, syncReleaseMetadata } from "@storymapper/core";

function stateCounts(links: Array<{ syncState: RemoteWorkItemLink["syncState"] }>): GitHubSyncHealthReport["stateCounts"] {
  const counts = { synced: 0, unsynced: 0, conflict: 0, stale: 0, remote_deleted: 0, local_deleted: 0 };
  for (const link of links) counts[link.syncState] += 1;
  return counts;
}

export function sameSyncStatusLabels(connection: ConnectorConnection, current: string[], next: string[]): boolean {
  return JSON.stringify(syncStatusLabels(connection, current)) === JSON.stringify(syncStatusLabels(connection, next));
}

export function buildGitHubSyncHealthReport(data: GitHubSyncHealthData): GitHubSyncHealthReport {
  const visibleIds = new Set(visibleCards(data.cards).map((card) => card.id));
  const links = data.links.filter((link) => !link.cardId || visibleIds.has(link.cardId));
  return { storyMapId: data.storyMapId, totalLinks: links.length, stateCounts: stateCounts(links), links };
}

function changedLocally(data: WorkItemSyncHealthData, card: Card, link: RemoteWorkItemLink, hashText: TextHasher): boolean {
  const acknowledged = link.baseline?.acknowledgedLocal;
  if ((acknowledged?.titleHash ?? link.titleHash) && (acknowledged?.titleHash ?? link.titleHash) !== hashText(card.title)) return true;
  if ((acknowledged?.bodyHash ?? link.bodyHash) && (acknowledged?.bodyHash ?? link.bodyHash) !== hashText(stripGitHubIssueFooter(card.description))) return true;
  const connection = data.connections.find((candidate) => candidate.id === link.connectionId);
  if (!connection) return false;
  if (acknowledged) {
    const managed = managedAnnotationDefinitions(connection, data.annotations);
    const annotationLabels = managed.filter((annotation) => data.cardAnnotations.some((row) => row.cardId === card.id && row.annotationId === annotation.id)).map((row) => row.name).sort();
    if (JSON.stringify(acknowledged.annotationLabels.filter((label) => managed.some((row) => row.name === label)).sort()) !== JSON.stringify(annotationLabels)) return true;
    const releaseBaseline = connection.releaseSource === "milestone" ? data.links.find((row) => row.releaseId === card.releaseId)?.baseline : undefined;
    return connection.releaseSource !== "none" && (acknowledged.releaseId !== card.releaseId || JSON.stringify(releaseBaseline?.acknowledgedLocal.releaseMetadata ?? acknowledged.releaseMetadata) !== JSON.stringify(syncReleaseMetadata(connection, data.releases.find((release) => release.id === card.releaseId))));
  }
  return false;
}

export function buildWorkItemSyncHealthReport(data: WorkItemSyncHealthData, hashText: TextHasher): WorkItemSyncHealthReport {
  const cardsById = new Map(visibleCards(data.cards).map((card) => [card.id, card]));
  const openConflicts = data.openConflicts.filter((conflict) => conflict.status === "open" && conflict.cardId && cardsById.has(conflict.cardId));
  const links = data.links.filter((link) => !link.cardId || cardsById.has(link.cardId)).map((link) => {
    const card = link.cardId ? cardsById.get(link.cardId) : undefined;
    if (openConflicts.some((conflict) => conflict.externalRefId === link.externalRefId)) return { ...link, syncState: "conflict" as const };
    if (link.syncState === "remote_deleted" || link.syncState === "stale") return link;
    const release = link.releaseId ? data.releases.find((row) => row.id === link.releaseId) : undefined;
    const connection = data.connections.find((row) => row.id === link.connectionId);
    const changed = card ? changedLocally(data, card, link, hashText) : release && connection && link.baseline && JSON.stringify(link.baseline.acknowledgedLocal.releaseMetadata) !== JSON.stringify(syncReleaseMetadata(connection, release));
    const unacknowledged = !link.baseline && link.syncState === "unsynced";
    return { ...link, syncState: changed || unacknowledged ? "unsynced" as const : "synced" as const };
  });
  const deletedLocalLinks = historicalLinks(data);
  const inventory = [...links, ...deletedLocalLinks];
  const lastRun = data.runs.at(-1);
  return { storyMapId: data.storyMap.id, totalLinks: inventory.length, stateCounts: stateCounts(inventory), links, openConflicts, staleLinks: links.filter((link) => link.syncState === "stale"), deletedLocalLinks, deletedLinks: [...links.filter((link) => link.syncState === "remote_deleted"), ...deletedLocalLinks], ...(lastRun ? { lastRun } : {}) };
}

function historicalLinks(data: WorkItemSyncHealthData): DeletedLocalSyncLink[] {
  const links = new Map<string, DeletedLocalSyncLink>();
  for (const evidence of data.deletedRefs) {
    if (evidence.storyMapId !== data.storyMap.id || data.links.some((link) => link.provider === evidence.before.system && link.url === parseWorkItemLocator(evidence.before.system, evidence.before.externalId)?.url)) continue;
    links.set(evidence.before.externalId, { id: evidence.before.id, externalRefId: evidence.before.id, storyMapId: evidence.storyMapId, entityType: evidence.entityType, entityId: evidence.entityId, url: parseWorkItemLocator(evidence.before.system, evidence.before.externalId)!.url, syncState: "local_deleted" });
  }
  return [...links.values()];
}
